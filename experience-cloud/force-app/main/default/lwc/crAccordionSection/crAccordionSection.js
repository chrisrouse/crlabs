import { LightningElement, api } from "lwc";
import { borderDeclarations } from "c/crAccordionAppearance";

let sectionCount = 0;

/** Open and close animations the stylesheet knows. Anything else means no animation. */
const ANIMATION_TYPES = ["slide"];

/** How long an open or close animation takes, by speed. */
const ANIMATION_DURATIONS = { slow: "600ms", normal: "400ms", fast: "250ms" };

/**
 * Whether the component is running in the Experience Builder canvas. The canvas runs in a frame
 * on the live-preview host. This checks the frame's address, which is not a documented API, so
 * it falls back to closed if the address changes.
 * @returns {boolean}
 */
function isInExperienceBuilder() {
    return window.location.hostname.includes("live-preview.salesforce-experience.com");
}

/**
 * Whether Builder has this component selected. The Builder marks the selected component with a
 * selection overlay inside its component wrapper. That markup is not a documented API.
 * @param {HTMLElement} wrapper The component wrapper that holds the Builder's selection overlay.
 * @returns {boolean}
 */
function isSelectedInBuilder(wrapper) {
    return Boolean(wrapper.querySelector(".interactions-proxy-select"));
}

/**
 * One section of a crAccordion, or a section on its own. The header is the title slot,
 * the actions slot sits at the right, and the content slot is the expandable body.
 * In the Builder canvas, a section opens when it's selected, so the section being edited is open.
 * @slot title
 * @slot actions
 * @slot content
 */
export default class CrAccordionSection extends LightningElement {
    /** Build label from the properties panel. Not used by the component. */
    @api versionInfo;

    _expanded = false;
    _settled = false;
    _animation = { type: "none", speed: "normal" };
    _showActions = true;
    _sectionBorder = { color: "", size: "0px", style: "solid", radius: "0px" };
    _openIconName = "utility:chevrondown";
    _closeIconName = "utility:chevronright";
    _hideIcon = false;
    _iconBackgroundColor = "";
    _iconForegroundColor = "";
    _iconSize = "xx-small";
    _headerBackgroundColor = "";
    _headerOpenBackgroundColor = "";
    _contentBackgroundColor = "";
    _separator = { color: "", size: "0px", style: "solid" };
    _builderWrapper;
    _builderObserver;
    contentId = `cr-accordion-content-${++sectionCount}`;

    /**
     * Whether the section is open. A parent accordion sets this to close the section.
     * @returns {boolean}
     */
    @api
    get expanded() {
        return this._expanded;
    }
    set expanded(value) {
        this.applyOpenState(Boolean(value));
    }

    /**
     * Stores the open state. A change clears cr-is-settled, so the content is clipped while it moves.
     * @param {boolean} open Whether the section is open.
     */
    applyOpenState(open) {
        if (open !== this._expanded) {
            this._settled = false;
        }
        this._expanded = open;
    }

    /**
     * How the content opens and closes: type (none or slide) and speed (slow, normal, or
     * fast). A parent accordion sets this from its Animation settings.
     * @returns {object}
     */
    @api
    get animation() {
        return this._animation;
    }
    set animation(value) {
        this._animation = { ...this._animation, ...(value || {}) };
    }

    /**
     * @returns {boolean} Whether the content animates when it opens and closes.
     */
    get isAnimated() {
        return ANIMATION_TYPES.includes(this._animation.type);
    }

    /**
     * The border around the section: color, size, line style, and radius. A parent accordion sets
     * this from its Section Border settings.
     * @returns {object}
     */
    @api
    get sectionBorder() {
        return this._sectionBorder;
    }
    set sectionBorder(value) {
        this._sectionBorder = { ...this._sectionBorder, ...(value || {}) };
    }

    /**
     * Inline style for the section's border. A size of 0 draws no border. With no color chosen, the
     * site's standard border color is used. A radius also clips the header and content colors to the
     * rounded corners.
     * @returns {string}
     */
    get sectionStyle() {
        const declarations = borderDeclarations(this._sectionBorder);
        if (this.isAnimated) {
            const duration = ANIMATION_DURATIONS[this._animation.speed] || ANIMATION_DURATIONS.normal;
            declarations.push(`--cr-accordion-duration: ${duration}`);
        }
        return declarations.join("; ");
    }

    /**
     * Whether the section renders its Actions slot. A parent accordion sets this. On by default.
     * @returns {boolean}
     */
    @api
    get showActions() {
        return this._showActions;
    }
    set showActions(value) {
        this._showActions = value !== false;
    }

    /**
     * Icon shown on the toggle while the section is open. A parent accordion sets this.
     * @returns {string}
     */
    @api
    get openIconName() {
        return this._openIconName;
    }
    set openIconName(value) {
        this._openIconName = value;
    }

    /**
     * Icon shown on the toggle while the section is closed. A parent accordion sets this.
     * @returns {string}
     */
    @api
    get closeIconName() {
        return this._closeIconName;
    }
    set closeIconName(value) {
        this._closeIconName = value;
    }

    /**
     * Hides the toggle icon. A parent accordion sets this.
     * @returns {boolean}
     */
    @api
    get hideIcon() {
        return this._hideIcon;
    }
    set hideIcon(value) {
        this._hideIcon = Boolean(value);
    }

    /**
     * Background color behind the toggle icon. A parent accordion sets this.
     * @returns {string}
     */
    @api
    get iconBackgroundColor() {
        return this._iconBackgroundColor;
    }
    set iconBackgroundColor(value) {
        this._iconBackgroundColor = value || "";
    }

    /**
     * Color of the toggle icon. A parent accordion sets this.
     * @returns {string}
     */
    @api
    get iconForegroundColor() {
        return this._iconForegroundColor;
    }
    set iconForegroundColor(value) {
        this._iconForegroundColor = value || "";
    }

    /**
     * Class for the toggle icon. Adds has-icon-color when a foreground color is set, which lets
     * the stylesheet color the SVG's fill, including action icons.
     * @returns {string}
     */
    get iconClass() {
        const classes = ["slds-accordion__summary-action-icon", "slds-m-right_x-small"];
        if (this._iconForegroundColor) {
            classes.push("has-icon-color");
        }
        return classes.join(" ");
    }

    /**
     * Inline style for the toggle icon. Sets only the colors that have a value, so the icon's
     * defaults apply otherwise.
     * @returns {string}
     */
    get iconStyle() {
        const declarations = [];
        if (this._iconBackgroundColor) {
            declarations.push(`--sds-c-icon-color-background: ${this._iconBackgroundColor}`);
        }
        if (this._iconForegroundColor) {
            declarations.push(`--sds-c-icon-color-foreground: ${this._iconForegroundColor}`);
            declarations.push(`--sds-c-icon-color-foreground-default: ${this._iconForegroundColor}`);
            declarations.push(`--cr-icon-foreground: ${this._iconForegroundColor}`);
        }
        return declarations.join("; ");
    }

    /**
     * Background color of the header. A parent accordion sets this.
     * @returns {string}
     */
    @api
    get headerBackgroundColor() {
        return this._headerBackgroundColor;
    }
    set headerBackgroundColor(value) {
        this._headerBackgroundColor = value || "";
    }

    /**
     * Background color of the content area. A parent accordion sets this.
     * @returns {string}
     */
    @api
    get contentBackgroundColor() {
        return this._contentBackgroundColor;
    }
    set contentBackgroundColor(value) {
        this._contentBackgroundColor = value || "";
    }

    /**
     * The line between the header and the content: color, size, and line style. A parent accordion
     * sets this from its Separator settings.
     * @returns {object}
     */
    @api
    get separator() {
        return this._separator;
    }
    set separator(value) {
        this._separator = { ...this._separator, ...(value || {}) };
    }

    /**
     * Inline style for the content body. The separator is the body's top border, so it's hidden with
     * the content while closed, and slides in with it when animated.
     * @returns {string}
     */
    get bodyStyle() {
        return borderDeclarations({ ...this._separator, sides: ["top"], radius: "0px" }).join("; ");
    }

    /**
     * Inline style for the content area. Sets the background only when a color is chosen.
     * @returns {string}
     */
    get contentStyle() {
        return this._contentBackgroundColor ? `background-color: ${this._contentBackgroundColor}` : "";
    }

    /**
     * Background color of the header while the section is open. A parent accordion sets this.
     * @returns {string}
     */
    @api
    get headerOpenBackgroundColor() {
        return this._headerOpenBackgroundColor;
    }
    set headerOpenBackgroundColor(value) {
        this._headerOpenBackgroundColor = value || "";
    }

    /**
     * Inline style for the header. An open section uses the open background when one is set, and
     * the regular header background otherwise. Sets nothing when no color is chosen.
     * @returns {string}
     */
    get headerStyle() {
        const color =
            this._expanded && this._headerOpenBackgroundColor
                ? this._headerOpenBackgroundColor
                : this._headerBackgroundColor;
        return color ? `background-color: ${color}` : "";
    }

    /**
     * Size of the toggle icon. A parent accordion sets this.
     * @returns {string}
     */
    @api
    get iconSize() {
        return this._iconSize;
    }
    set iconSize(value) {
        this._iconSize = value || "xx-small";
    }

    /**
     * Tells a parent accordion that this section has joined, so it can manage the open sections.
     */
    connectedCallback() {
        this.dispatchEvent(new CustomEvent("sectionregister", { bubbles: true }));
    }

    /**
     * Watches the Builder's selection once the section is rendered in the canvas.
     */
    renderedCallback() {
        // The template's class binding doesn't keep the circle on a utility icon, so it is set here.
        const icon = this.template.querySelector("lightning-icon");
        if (icon) {
            const circle = Boolean(this._iconBackgroundColor) && this.toggleIconName.startsWith("utility:");
            icon.classList.toggle("slds-icon_container_circle", circle);
        }
        if (this._builderWrapper || !isInExperienceBuilder()) {
            return;
        }
        this._builderWrapper = this.template.host.closest("webruntimedesign-component-wrapper");
        if (this._builderWrapper) {
            this._builderObserver = new MutationObserver(this.handleBuilderChange);
            this._builderObserver.observe(this._builderWrapper, { childList: true, subtree: true });
            this.handleBuilderChange();
        }
    }

    /**
     * Stops watching the Builder's selection, and tells a parent accordion that this section has left.
     */
    disconnectedCallback() {
        if (this._builderObserver) {
            this._builderObserver.disconnect();
        }
        this.dispatchEvent(new CustomEvent("sectionunregister", { bubbles: true }));
    }

    /**
     * Opens the section when Builder selects it. Deselecting leaves it as it is.
     */
    handleBuilderChange = () => {
        if (!this._expanded && isSelectedInBuilder(this._builderWrapper)) {
            this.setExpanded(true);
        }
    };

    /**
     * The SLDS section classes, with slds-is-open when expanded. An animated section also gets its
     * animation's class, and cr-is-settled once it has finished opening, which lets its content
     * overflow again.
     * @returns {string}
     */
    get sectionClass() {
        const classes = ["slds-accordion__section"];
        if (this._expanded) {
            classes.push("slds-is-open");
        }
        if (this.isAnimated) {
            classes.push("cr-animated", `cr-animate-${this._animation.type}`);
            if (this._expanded && this._settled) {
                classes.push("cr-is-settled");
            }
        }
        return classes.join(" ");
    }

    /**
     * Marks the section as settled once its content has finished opening. Content is clipped while
     * it moves, so it doesn't spill over the sections below.
     * @param {TransitionEvent} event A transition ending on the content or inside it.
     */
    handleContentTransitionEnd(event) {
        if (event.target === event.currentTarget && this._expanded) {
            this._settled = true;
        }
    }

    /**
     * @returns {boolean} Whether to show the toggle icon.
     */
    get showToggleIcon() {
        return !this._hideIcon && Boolean(this.toggleIconName);
    }

    /**
     * @returns {string} The icon for the toggle in the current state.
     */
    get toggleIconName() {
        return this._expanded ? this._openIconName : this._closeIconName;
    }

    /**
     * @returns {string} The open state for assistive technology.
     */
    get ariaExpanded() {
        return String(this._expanded);
    }

    /**
     * Opens or closes the section from its header. Stops the click here, so it doesn't reach
     * the accordion as a separate event.
     * @param {Event} event The click on the header button.
     */
    handleHeaderClick(event) {
        event.stopPropagation();
        this.setExpanded(!this._expanded);
    }

    /**
     * Sets the open state and tells a parent accordion, so it can close the other sections.
     * @param {boolean} open Whether the section should be open.
     */
    setExpanded(open) {
        this.applyOpenState(open);
        this.dispatchEvent(new CustomEvent("sectiontoggle", { bubbles: true, detail: { open } }));
    }
}
