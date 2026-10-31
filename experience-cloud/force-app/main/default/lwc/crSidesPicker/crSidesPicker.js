import { LightningElement, api } from "lwc";
import { ALL_SIDES } from "c/crAccordionAppearance";

/** Where each side's edge is drawn in the 20 by 20 icon. */
const EDGES = {
    top: { x1: 3, y1: 3, x2: 17, y2: 3 },
    right: { x1: 17, y1: 3, x2: 17, y2: 17 },
    bottom: { x1: 3, y1: 17, x2: 17, y2: 17 },
    left: { x1: 3, y1: 3, x2: 3, y2: 17 }
};

/**
 * Four toggle tiles, Top, Right, Bottom, and Left, in CSS order. Each turns its side on or off, in
 * any combination. The value is the list of sides that are on, always in CSS order.
 * @fires sideschange with detail.value, the sides that are on
 */
export default class CrSidesPicker extends LightningElement {
    /** Label above the tiles. */
    @api label;

    _value = [...ALL_SIDES];

    /**
     * The sides that are on. Anything that isn't a list means all sides.
     * @returns {string[]}
     */
    @api
    get value() {
        return this._value;
    }
    set value(sides) {
        this._value = Array.isArray(sides) ? ALL_SIDES.filter((side) => sides.includes(side)) : [...ALL_SIDES];
    }

    /**
     * One tile per side. Each icon draws a box with its own side solid and the rest faint.
     * @returns {object[]}
     */
    get tiles() {
        return ALL_SIDES.map((side) => ({
            side,
            label: side.charAt(0).toUpperCase() + side.slice(1),
            pressed: String(this._value.includes(side)),
            edges: ALL_SIDES.map((edge) => ({ edge, ...EDGES[edge], className: edge === side ? "on" : "off" }))
        }));
    }

    /**
     * Turns a side on or off and reports the new list.
     * @param {Event} event The click on a tile.
     */
    handleTileClick(event) {
        const side = event.currentTarget.dataset.side;
        const on = this._value.includes(side);
        this._value = ALL_SIDES.filter((each) => (each === side ? !on : this._value.includes(each)));
        this.dispatchEvent(new CustomEvent("sideschange", { detail: { value: this._value } }));
    }
}
