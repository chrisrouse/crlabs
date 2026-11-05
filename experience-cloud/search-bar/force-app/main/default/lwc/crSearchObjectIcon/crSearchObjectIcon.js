import { LightningElement, api, wire } from "lwc";
import { getObjectInfo } from "lightning/uiObjectInfoApi";

/** Background shown until the object's theme color loads, or when it has none. */
const FALLBACK_COLOR = "#dddbda";

/**
 * An object's icon on its theme color, as Salesforce shows it in lists. Used by the search bar's
 * result rows and group headers. The size comes from --cr-search-bar-icon-size on any ancestor.
 */
export default class CrSearchObjectIcon extends LightningElement {
    /** API name of the object whose icon to show, such as "Account". */
    @api objectApiName;

    @wire(getObjectInfo, { objectApiName: "$objectApiName" })
    objectInfo;

    /**
     * @returns {string} The icon image URL, once the object's info loads.
     */
    get iconUrl() {
        return this.objectInfo?.data?.themeInfo?.iconUrl;
    }

    /**
     * @returns {string} The icon's background, the object's theme color.
     */
    get backgroundStyle() {
        const color = this.objectInfo?.data?.themeInfo?.color;
        return `background-color: ${color ? `#${color}` : FALLBACK_COLOR}`;
    }
}
