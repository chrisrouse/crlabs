import { LightningElement, api } from "lwc";

export default class CrSearchSuggestionItem extends LightningElement {
    @api suggestion;
    @api objectApiName;

    /** Leaves out the object icon. */
    @api hideIcon = false;

    /** Leaves out the type label, when a group header or tab already names the type. */
    @api hideType = false;

    get showIcon() {
        return !this.hideIcon;
    }

    get showType() {
        return !this.hideType;
    }

    get isPromoted() {
        return this.suggestion?.promoted === "true";
    }

    handleClick() {
        this.dispatchEvent(
            new CustomEvent("suggest", {
                bubbles: true,
                detail: { suggestion: this.suggestion }
            })
        );
    }
}
