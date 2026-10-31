import { LightningElement, api } from "lwc";
import { ALL_CORNERS, ALL_SIDES } from "c/crAccordionAppearance";

/** Where each side's edge is drawn in the 20 by 20 icon. */
const EDGES = {
    top: { x1: 3, y1: 3, x2: 17, y2: 3 },
    right: { x1: 17, y1: 3, x2: 17, y2: 17 },
    bottom: { x1: 3, y1: 17, x2: 17, y2: 17 },
    left: { x1: 3, y1: 3, x2: 3, y2: 17 }
};

/** Each corner's rounded edge in the 20 by 20 icon, drawn over a faint box. */
const CORNER_PATHS = {
    "top-left": "M3 10 L3 8 A5 5 0 0 1 8 3 L10 3",
    "top-right": "M10 3 L12 3 A5 5 0 0 1 17 8 L17 10",
    "bottom-right": "M17 10 L17 12 A5 5 0 0 1 12 17 L10 17",
    "bottom-left": "M10 17 L8 17 A5 5 0 0 1 3 12 L3 10"
};

/**
 * Four toggle tiles for the sides of a box (Top, Right, Bottom, Left) or its corners (Top Left,
 * Top Right, Bottom Right, Bottom Left), in CSS order. Each turns its side or corner on or off, in
 * any combination. The value is the list that is on, always in CSS order.
 * @fires sideschange with detail.value, the sides or corners that are on
 */
export default class CrSidesPicker extends LightningElement {
    /** Label above the tiles. */
    @api label;

    /** "sides" or "corners". */
    @api kind = "sides";

    _value;

    /**
     * The sides or corners that are on. Anything that isn't a list means all of them.
     * @returns {string[]}
     */
    @api
    get value() {
        return this._value ?? [...this.all];
    }
    set value(items) {
        this._value = Array.isArray(items) ? items : undefined;
    }

    /**
     * @returns {boolean} Whether the tiles are corners rather than sides.
     */
    get isCorners() {
        return this.kind === "corners";
    }

    /**
     * @returns {readonly string[]} Every side or corner, in CSS order.
     */
    get all() {
        return this.isCorners ? ALL_CORNERS : ALL_SIDES;
    }

    /**
     * One tile per side or corner. A side's icon draws a box with that side solid and the rest faint;
     * a corner's icon draws a faint box with that corner rounded.
     * @returns {object[]}
     */
    get tiles() {
        const on = this.value;
        return this.all.map((item) => ({
            item,
            label: item
                .split("-")
                .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
                .join(" "),
            pressed: String(on.includes(item)),
            path: CORNER_PATHS[item],
            edges: this.isCorners
                ? []
                : ALL_SIDES.map((edge) => ({ edge, ...EDGES[edge], className: edge === item ? "on" : "off" }))
        }));
    }

    /**
     * Turns a side or corner on or off and reports the new list.
     * @param {Event} event The click on a tile.
     */
    handleTileClick(event) {
        const item = event.currentTarget.dataset.item;
        const current = this.value;
        const on = current.includes(item);
        this._value = this.all.filter((each) => (each === item ? !on : current.includes(each)));
        this.dispatchEvent(new CustomEvent("sideschange", { detail: { value: this._value } }));
    }
}
