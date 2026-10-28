/**
 * Page navigation for the grid's footer.
 *
 * SLDS has no pagination blueprint — verified against the blueprint set — and its
 * button-group blueprint explicitly excludes navigation. So this is custom markup on
 * global styling hooks inside a `nav` landmark, which is where the SLDS component
 * hierarchy lands when no blueprint or base component fits.
 *
 * Everything visual reads from `--slds-g-*` hooks, so an org's branding carries
 * through without this component knowing anything about it.
 *
 * All the arithmetic lives in `c/fgrid_gridModel` — `paginationItems` for the
 * truncation and `rowsPerPageOptions` for the page sizes — so it is testable without
 * a DOM and shared with anything else that needs the same shape.
 *
 * Owns no state. It renders what it is given and reports intent upward, so the grid
 * remains the single owner of the current page.
 */
import { LightningElement, api } from "lwc";
import { paginationItems, rowsPerPageOptions } from "c/fgrid_gridModel";

export default class FgridPagination extends LightningElement {
    @api page = 1;
    @api totalPages = 1;
    @api totalRows = 0;
    @api firstRow = 0;
    @api lastRow = 0;

    /** Current page size, and the row cap that bounds the choices. */
    @api recordsPerPage;
    @api maxNumberOfRows;

    /** Off by default: a screen designed around a fixed page size stays that way. */
    @api showRowsPerPage = false;

    get items() {
        return paginationItems(this.page, this.totalPages).map((item) => ({
            ...item,
            // Resolved here rather than in the template: LWC cannot compute a class
            // or an aria value inline.
            itemClass: item.isCurrent ? "fgrid-pg__item fgrid-pg__item_current" : "fgrid-pg__item",
            ariaCurrent: item.isCurrent ? "page" : null,
            label: `Go to page ${item.page}`
        }));
    }

    /** `n–m of total`, which says more than a page number alone. */
    get summary() {
        if (!this.totalRows) {
            return "No rows";
        }
        return `${this.firstRow}–${this.lastRow} of ${this.totalRows}`;
    }

    get isFirstPage() {
        return Number(this.page) <= 1;
    }

    get isLastPage() {
        return Number(this.page) >= Number(this.totalPages);
    }

    get perPageOptions() {
        return rowsPerPageOptions(this.recordsPerPage, this.maxNumberOfRows);
    }

    /** A string, because that is what a combobox value is. */
    get perPageValue() {
        return String(Number(this.recordsPerPage) || this.perPageOptions[0]?.value || "10");
    }

    /** Only worth offering when there is more than one size to pick. */
    get showPerPage() {
        return Boolean(this.showRowsPerPage) && this.perPageOptions.length > 1;
    }

    /* ------------------------------------------------------------------ *
     * Handlers
     * ------------------------------------------------------------------ */

    handlePage(event) {
        const page = Number(event.currentTarget.dataset.page);
        if (Number.isFinite(page) && page !== Number(this.page)) {
            this.publishPage(page);
        }
    }

    handlePrevious() {
        if (!this.isFirstPage) {
            this.publishPage(Number(this.page) - 1);
        }
    }

    handleNext() {
        if (!this.isLastPage) {
            this.publishPage(Number(this.page) + 1);
        }
    }

    handlePerPage(event) {
        this.dispatchEvent(new CustomEvent("rowsperpagechange", { detail: { value: Number(event.detail.value) } }));
    }

    publishPage(page) {
        this.dispatchEvent(new CustomEvent("pagechange", { detail: { page } }));
    }
}
