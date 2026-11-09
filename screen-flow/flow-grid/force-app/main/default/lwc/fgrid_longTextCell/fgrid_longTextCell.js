import { LightningElement, api } from "lwc";
import { LONG_TEXT_COMMIT_EVENT, registerLongTextEditor, unregisterLongTextEditor } from "c/fgrid_longTextEditors";

/**
 * A text cell that edits in place: the text is replaced by a text box of the
 * same width, starting on the same line. Long Text uses a growing multi-line
 * box; plain Text (`singleLine`, the fgridText type) a one-line input.
 *
 * Replaces the datatable's edit panel for long text. The panel is positioned
 * by a library that flips it to the cell's bottom edge whenever the cell ends
 * near the bottom of the grid, which for a tall cell puts it off screen
 * (STATUS.md, 2.3m). Editing in place has nothing to position.
 *
 * The datatable still draws the pencil and still owns Enter; fgrid_customDatatable
 * intercepts its edit request and calls startEdit() through fgrid_longTextEditors.
 * A committed value is sent as LONG_TEXT_COMMIT_EVENT and becomes an ordinary
 * draft, so Save, Cancel and auto-save behave as for every other column.
 *
 * Keys: Escape cancels, Ctrl/Cmd+Enter commits; Enter is a new line in Long
 * Text and commits in single-line Text. Clicking away or tabbing out commits.
 */
export default class FgridLongTextCell extends LightningElement {
    @api columnKey;
    @api label;
    @api linkify = false;
    @api maxLength;
    @api rowKey;
    @api singleLine = false;
    @api value;

    draft = "";
    editing = false;

    _focusPending = false;
    _registered = null;

    get maxLengthAttribute() {
        return this.maxLength || null;
    }

    renderedCallback() {
        this.syncRegistration();
        if (this._focusPending) {
            this._focusPending = false;
            const box = this.template.querySelector("[data-editor]");
            if (box) {
                // Set here, not bound: a template `value` on a textarea becomes an
                // attribute, which a textarea ignores, so it opened empty.
                box.value = this.draft;
                this.fitToContent(box);
                box.focus();
                const end = box.value.length;
                box.setSelectionRange(end, end);
            }
        }
    }

    disconnectedCallback() {
        this.unregister();
    }

    /** Called through fgrid_longTextEditors when the datatable's pencil is used. */
    startEdit() {
        if (this.editing) {
            return;
        }
        this.draft = this.value ?? "";
        this.editing = true;
        this._focusPending = true;
    }

    handleInput(event) {
        this.draft = event.target.value;
        this.fitToContent(event.target);
    }

    /**
     * Every key stays in the text box: the datatable moves between cells on
     * arrow keys and Enter, which must not happen while typing.
     */
    handleKeyDown(event) {
        event.stopPropagation();
        if (event.key === "Escape") {
            event.preventDefault();
            this.cancel();
        } else if (event.key === "Enter" && (this.singleLine || event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            this.commit();
        }
    }

    /** Keeps the datatable from treating a click in the editor as a cell click. */
    handleEditorPointer(event) {
        event.stopPropagation();
    }

    handleBlur() {
        this.commit();
    }

    /** Stops the undo button taking focus, which would commit before it reverts. */
    handleUndoMouseDown(event) {
        event.preventDefault();
        event.stopPropagation();
    }

    handleUndo() {
        this.cancel();
    }

    commit() {
        if (!this.editing) {
            return;
        }
        this.editing = false;
        const original = this.value ?? "";
        if (this.draft === original) {
            return;
        }
        this.dispatchEvent(
            new CustomEvent(LONG_TEXT_COMMIT_EVENT, {
                bubbles: true,
                composed: true,
                detail: { rowKey: this.rowKey, columnKey: this.columnKey, value: this.draft }
            })
        );
    }

    cancel() {
        this.editing = false;
    }

    fitToContent(textarea) {
        if (this.singleLine) {
            return;
        }
        textarea.style.height = "auto";
        textarea.style.height = `${textarea.scrollHeight}px`;
    }

    /** Re-registers if the datatable hands this cell a different row or column. */
    syncRegistration() {
        const { rowKey, columnKey } = this;
        const current = this._registered;
        if (current && current.rowKey === rowKey && current.columnKey === columnKey) {
            return;
        }
        this.unregister();
        if (rowKey === undefined || rowKey === null || !columnKey) {
            return;
        }
        registerLongTextEditor(rowKey, columnKey, this);
        this._registered = { rowKey, columnKey };
    }

    unregister() {
        if (this._registered) {
            unregisterLongTextEditor(this._registered.rowKey, this._registered.columnKey, this);
            this._registered = null;
        }
    }
}
