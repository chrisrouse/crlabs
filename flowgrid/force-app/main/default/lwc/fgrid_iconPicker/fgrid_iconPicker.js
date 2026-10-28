/**
 * SLDS icon picker.
 *
 * Replaces the BasePack's fsc_pickIcon, which Flow Grid cannot use because the
 * rewrite drops the BasePack dependency, and which the Flow Config Editor Kit
 * has no equivalent for — its five pickers cover resources, fields, and objects.
 *
 * The catalog is a hand-picked subset of the SLDS icon set. That is a static
 * design-system list, not org metadata, so hardcoding it is correct; the free-text
 * input means any valid icon name still works, including ones absent here.
 *
 * Browsing expands inline rather than in a popover. Inside the Grid Studio modal
 * a popover has to solve positioning against a fixed, separately scrolling
 * container; an inline panel does not.
 */
import { LightningElement, api } from "lwc";

const UTILITY = [
    "add",
    "adduser",
    "apex",
    "approval",
    "arrowdown",
    "arrowup",
    "attach",
    "ban",
    "bell",
    "block_visitor",
    "bookmark",
    "breadcrumbs",
    "brush",
    "bucket",
    "calendar",
    "call",
    "cart",
    "chat",
    "check",
    "clock",
    "close",
    "copy",
    "dash",
    "delete",
    "description",
    "download",
    "edit",
    "email",
    "error",
    "event",
    "expand_alt",
    "favorite",
    "filter",
    "flow",
    "forward",
    "help",
    "hierarchy",
    "home",
    "info",
    "insert_tag_field",
    "key",
    "knowledge_base",
    "lock",
    "moneybag",
    "notification",
    "open_folder",
    "people",
    "preview",
    "priority",
    "refresh",
    "reply",
    "search",
    "settings",
    "share",
    "success",
    "summary",
    "table",
    "task",
    "trending",
    "unlock",
    "user",
    "warning",
    "world"
];

const STANDARD = [
    "account",
    "apps",
    "asset_object",
    "campaign",
    "case",
    "contact",
    "contract",
    "custom",
    "dashboard",
    "default",
    "document",
    "email",
    "entity",
    "event",
    "feed",
    "file",
    "flow",
    "goals",
    "groups",
    "lead",
    "location",
    "note",
    "opportunity",
    "order",
    "partner_fund_request",
    "people",
    "pricebook",
    "product",
    "question_feed",
    "quotes",
    "record",
    "report",
    "solution",
    "task",
    "team_member",
    "topic",
    "user",
    "work_order"
];

const CATALOG = [
    ...UTILITY.map((name) => ({ name: `utility:${name}`, group: "Utility" })),
    ...STANDARD.map((name) => ({ name: `standard:${name}`, group: "Standard" }))
];

export default class FgridIconPicker extends LightningElement {
    @api label;
    @api fieldLevelHelp;
    /** Overridable hint. Null-safe, because a caller that has no specific hint
     *  passes null rather than omitting the attribute. */
    @api placeholder;
    @api disabled = false;

    _value;
    isBrowsing = false;
    filter = "";

    @api
    get value() {
        return this._value;
    }
    set value(next) {
        this._value = next || null;
    }

    get effectivePlaceholder() {
        return this.placeholder || "utility:table";
    }

    get hasValue() {
        return Boolean(this._value);
    }

    get browseLabel() {
        return this.isBrowsing ? "Hide icons" : "Browse icons";
    }

    /** Catalog narrowed by the filter box, capped so the grid stays usable. */
    get visibleIcons() {
        const needle = this.filter.trim().toLowerCase();
        const matches = needle ? CATALOG.filter((icon) => icon.name.toLowerCase().includes(needle)) : CATALOG;
        return matches.slice(0, 120).map((icon) => ({
            ...icon,
            variant: icon.name === this._value ? "brand" : "border-filled"
        }));
    }

    get hasMatches() {
        return this.visibleIcons.length > 0;
    }

    handleTextChange(event) {
        this.commit(event.target.value);
    }

    handleToggleBrowse() {
        this.isBrowsing = !this.isBrowsing;
        if (!this.isBrowsing) {
            this.filter = "";
        }
    }

    handleFilter(event) {
        this.filter = event.target.value || "";
    }

    handleIconClick(event) {
        this.commit(event.currentTarget.dataset.icon);
        this.isBrowsing = false;
        this.filter = "";
    }

    handleClear() {
        this.commit(null);
    }

    commit(next) {
        const value = next ? String(next).trim() : null;
        this._value = value;
        this.dispatchEvent(new CustomEvent("iconchange", { detail: { value } }));
    }

    /* Validity surface, so the editor's inherited validate() can drive it the
       same way it drives the kit's pickers. */

    @api
    setCustomValidity(message) {
        this._validity = message || "";
        const input = this.refs?.text;
        if (input) {
            input.setCustomValidity(this._validity);
        }
    }

    @api
    reportValidity() {
        return this.refs?.text ? this.refs.text.reportValidity() : true;
    }

    @api
    get validationMessage() {
        return this._validity || "";
    }
}
