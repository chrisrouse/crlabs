import { LightningElement, api, track } from "lwc";
import { NavigationMixin } from "lightning/navigation";
import getSuggestions from "@salesforce/apex/SearchBarController.getSuggestions";
import { parseAppearance, appearanceStyles, hasOwnBorder } from "c/crSearchBarAppearance";

export default class CrSearchBar extends NavigationMixin(LightningElement) {
    // Settings
    @api placeholderText = "Search...";
    @api showSearchButton = false;
    @api searchObjects = "[]";

    /** Whether typing shows matching records below the bar. The panel turns it on by default. */
    @api showTypeAhead = false;

    /** Shows the build label in the properties panel. The component ignores it. */
    @api versionInfo;

    /** Prints the fonts the bar actually uses below it, for troubleshooting in the org. */
    @api showDiagnostics = false;

    _appearanceJson = "";
    _appearanceStyle = "";
    _appearance = parseAppearance("");

    /**
     * Style settings as one JSON string, edited by crSearchBarAppearanceEditor. Each setting
     * becomes a CSS custom property on the container.
     * @type {string}
     */
    @api
    get appearance() {
        return this._appearanceJson;
    }
    set appearance(value) {
        this._appearanceJson = value || "";
        this._appearance = parseAppearance(this._appearanceJson);
        const styles = appearanceStyles(this._appearance);
        this._appearanceStyle = Object.entries(styles)
            .map(([name, setting]) => `${name}: ${setting}`)
            .join("; ");
    }

    @track searchTerm = "";
    @track showClearButton = false;
    @track suggestions = [];
    @track showSuggestions = false;
    @track isLoadingSuggestions = false;

    _debounceTimer = null;
    _activeTab = "all";
    _diagnostics = [];
    _diagnosticsTimer = null;

    connectedCallback() {
        const path = window.location.pathname;
        const match = path.match(/\/global-search\/(.+)/);
        if (match) {
            this.searchTerm = decodeURIComponent(match[1]);
            this.showClearButton = true;
        }
    }

    /**
     * Starts or stops the diagnostics refresh. Theme changes in the Builder reach the bar without a
     * remount, so the readings refresh every second while diagnostics are on.
     */
    renderedCallback() {
        if (this.showDiagnostics && !this._diagnosticsTimer) {
            this._readDiagnostics();
            // eslint-disable-next-line @lwc/lwc/no-async-operation
            this._diagnosticsTimer = setInterval(() => this._readDiagnostics(), 1000);
        } else if (!this.showDiagnostics && this._diagnosticsTimer) {
            clearInterval(this._diagnosticsTimer);
            this._diagnosticsTimer = null;
        }
    }

    disconnectedCallback() {
        clearInterval(this._diagnosticsTimer);
        this._diagnosticsTimer = null;
    }

    get diagnostics() {
        return this._diagnostics;
    }

    /**
     * Reads the fonts the bar computes, and the theme hooks they could come from. Updates only when a
     * reading changes, so the panel doesn't re-render every second.
     */
    _readDiagnostics() {
        const button = this.template.querySelector(".input-search-button");
        const input = this.template.querySelector(".search-input");
        const font = (element) => (element ? getComputedStyle(element).fontFamily : "(not shown)");
        const hook = (name) => getComputedStyle(this.template.host).getPropertyValue(name).trim() || "(not set)";
        const readings = [
            ["Build", "2026-11-05-SB21"],
            ["Button classes", button ? button.className : "(not shown)"],
            ["Button font", font(button)],
            ["Field font", font(input)],
            ["Search Bar font", font(this.template.host)],
            ["Page body font", font(document.body)],
            ["Theme button font", hook("--dxp-s-button-font-family")],
            ["Theme body font", hook("--dxp-s-body-font-family")],
            ["Theme base font", hook("--dxp-s-html-font-family")]
        ].map(([label, value]) => ({ label, value }));
        if (JSON.stringify(readings) !== JSON.stringify(this._diagnostics)) {
            this._diagnostics = readings;
        }
    }

    // ── Getters ──────────────────────────────────────────────────────────────

    get containerStyle() {
        return this._appearanceStyle;
    }

    get containerClass() {
        const classes = ["search-bar-container"];
        if (this._appearance.field.showFocusRing !== false) {
            classes.push("has-focus-ring");
        }
        if (this.showSearchButton) {
            const { style, theme, themeSize } = this._appearance.button;
            classes.push(style === "inset" ? "is-inset" : "has-button");
            if (theme !== "custom") {
                classes.push("btn-theme-site", `btn-theme-${theme}`, `btn-size-${themeSize}`);
            } else if (hasOwnBorder(this._appearance.button)) {
                classes.push("btn-own-border");
            }
        }
        if (this._appearance.menu.position === "floating") {
            classes.push("menu-floating");
        }
        if (this.showSuggestions) {
            classes.push("menu-open");
        }
        return classes.join(" ");
    }

    get buttonLabel() {
        return this._appearance.button.label;
    }

    /** The button always shows its icon when it has no label, so it is never empty. */
    get showButtonIcon() {
        return this._appearance.button.showIcon !== false || !this.buttonLabel;
    }

    get showLeftIcon() {
        return !this.showSearchButton;
    }

    get ariaExpanded() {
        return this.showSuggestions ? "true" : "false";
    }

    get isGroupedLayout() {
        return this._appearance.menu.layout === "grouped";
    }

    get isTabsLayout() {
        return this._appearance.menu.layout === "tabs";
    }

    get hideIcons() {
        return this._appearance.menu.showIcons === false;
    }

    get showGroupIcons() {
        return !this.hideIcons;
    }

    /** With icons, grouped rows indent to line up with the header text beside its icon. */
    get groupClass() {
        return this.hideIcons ? "menu-group" : "menu-group has-icon";
    }

    /** A per-type tab already names the type, so its rows leave the label out. */
    get hideTypeLabels() {
        return this.isTabsLayout && this._activeTab !== "all";
    }

    /**
     * The suggestions grouped by object, in the order Apex returned them (the configured order).
     * @returns {Array<{key: string, label: string, items: Array<object>}>}
     */
    get groups() {
        const groups = new Map();
        this.suggestions.forEach((suggestion) => {
            const key = suggestion.objectApiName;
            if (!groups.has(key)) {
                groups.set(key, { key, label: suggestion.typeLabel, items: [] });
            }
            groups.get(key).items.push(this._toItem(suggestion));
        });
        return [...groups.values()];
    }

    /**
     * An All tab, then one tab per object type that has results. Only the selected tab is in the
     * Tab order; the arrow keys move between tabs.
     * @returns {Array<object>}
     */
    get tabs() {
        const tabs = [{ key: "all", label: "All" }, ...this.groups.map(({ key, label }) => ({ key, label }))];
        return tabs.map((tab) => ({
            ...tab,
            selected: String(tab.key === this._activeTab),
            tabIndex: tab.key === this._activeTab ? "0" : "-1"
        }));
    }

    /** The rows to show: every suggestion, or only the selected tab's type. */
    get visibleItems() {
        if (this.isTabsLayout && this._activeTab !== "all") {
            const group = this.groups.find(({ key }) => key === this._activeTab);
            return group ? group.items : [];
        }
        return this.suggestions.map((suggestion) => this._toItem(suggestion));
    }

    get noSuggestions() {
        return !this.isLoadingSuggestions && this.suggestions.length === 0;
    }

    // ── Input handlers ───────────────────────────────────────────────────────

    handleInput(event) {
        this.searchTerm = event.target.value;
        this.showClearButton = this.searchTerm.length > 0;
        this._debouncedSearch();
    }

    handleClear() {
        this.searchTerm = "";
        this.showClearButton = false;
        this.suggestions = [];
        this.showSuggestions = false;
        this.template.querySelector("input").focus();
    }

    handleKeyDown(event) {
        if (event.key === "Enter") {
            this.showSuggestions = false;
            this.navigateToSearch();
        } else if (event.key === "Escape") {
            this.showSuggestions = false;
        }
    }

    /**
     * Closes the menu once focus leaves the whole bar. Moving between the field, its buttons, and
     * the menu's tabs keeps it open.
     * @param {FocusEvent} event The focusout event.
     */
    handleFocusOut(event) {
        if (event.relatedTarget && event.currentTarget.contains(event.relatedTarget)) {
            return;
        }
        // Delay so onmousedown on a suggestion fires before the dropdown closes
        setTimeout(() => {
            this.showSuggestions = false;
        }, 150);
    }

    // ── Tab handlers ─────────────────────────────────────────────────────────

    /**
     * Keeps focus in the field when a tab is clicked, so the menu stays open.
     * @param {MouseEvent} event The mousedown on a tab.
     */
    handleTabMouseDown(event) {
        event.preventDefault();
    }

    handleTabSelect(event) {
        this._activeTab = event.currentTarget.dataset.key;
    }

    /**
     * Moves between tabs with the left and right arrow keys, wrapping at either end.
     * @param {KeyboardEvent} event The keydown on a tab.
     */
    handleTabKeyDown(event) {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
        if (!step) {
            return;
        }
        event.preventDefault();
        const keys = this.tabs.map((tab) => tab.key);
        const next = keys[(keys.indexOf(this._activeTab) + step + keys.length) % keys.length];
        this._activeTab = next;
        // eslint-disable-next-line @lwc/lwc/no-async-operation
        Promise.resolve().then(() => this.template.querySelector(`.menu-tab[data-key="${next}"]`)?.focus());
    }

    handleSearchClick() {
        this.showSuggestions = false;
        this.navigateToSearch();
    }

    // ── Suggestion handlers ──────────────────────────────────────────────────

    handleSuggestionClick(event) {
        this.showSuggestions = false;
        const { id, objectApiName, urlName, customUrl, name } = event.detail.suggestion;
        if (customUrl) {
            // Admin-configured URL with token replacement
            const url = customUrl
                .replace("{Id}", id)
                .replace("{Name}", encodeURIComponent(name || ""))
                .replace("{UrlName}", urlName || "");
            this[NavigationMixin.Navigate]({
                type: "standard__webPage",
                attributes: { url }
            });
        } else if (urlName) {
            // Knowledge articles use LWR's /article/:urlName route
            this[NavigationMixin.Navigate]({
                type: "standard__webPage",
                attributes: { url: `/article/${urlName}` }
            });
        } else {
            this[NavigationMixin.Navigate]({
                type: "standard__recordPage",
                attributes: { recordId: id, objectApiName, actionName: "view" }
            });
        }
    }

    // ── Search logic ─────────────────────────────────────────────────────────

    _debouncedSearch() {
        clearTimeout(this._debounceTimer);
        if (!this.showTypeAhead || this.searchTerm.length < 2 || !this.searchObjects || this.searchObjects === "[]") {
            this.showSuggestions = false;
            this.suggestions = [];
            return;
        }
        this._debounceTimer = setTimeout(() => this._fetchSuggestions(), 300);
    }

    _fetchSuggestions() {
        this.isLoadingSuggestions = true;
        this.showSuggestions = true;
        getSuggestions({
            searchTerm: this.searchTerm,
            searchObjectsJson: this.searchObjects
        })
            .then((results) => {
                this.suggestions = results || [];
                // Keep the selected tab while its type still has results.
                if (!this.suggestions.some((suggestion) => suggestion.objectApiName === this._activeTab)) {
                    this._activeTab = "all";
                }
            })
            .catch(() => {
                this.suggestions = [];
            })
            .finally(() => {
                this.isLoadingSuggestions = false;
            });
    }

    /**
     * Wraps a suggestion for the template. Icons load per object, so they are only requested when
     * shown.
     * @param {object} suggestion A suggestion from Apex.
     * @returns {{key: string, suggestion: object, iconObject: string}}
     */
    _toItem(suggestion) {
        return {
            key: suggestion.id,
            suggestion,
            iconObject: this.hideIcons ? undefined : suggestion.objectApiName
        };
    }

    navigateToSearch() {
        const term = this.searchTerm.trim();
        if (!term) {
            return;
        }
        this[NavigationMixin.Navigate]({
            type: "standard__webPage",
            attributes: {
                url: "/global-search/" + encodeURIComponent(term)
            }
        });
    }
}
