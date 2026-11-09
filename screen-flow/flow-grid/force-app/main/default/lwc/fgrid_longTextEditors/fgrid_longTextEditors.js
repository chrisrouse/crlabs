/**
 * Finds the rendered Long Text cell for a record and column, so the datatable
 * can switch it into editing in place.
 *
 * The datatable cannot reach the cell directly: a custom type's template is
 * drawn inside the cell factory's shadow root, which querySelector does not
 * cross. Each cell registers itself here instead, keyed by the row's key and
 * its column's columnKey.
 *
 * Two grids on one screen showing the same record and column would share a
 * key, and both cells would open. Accepted for now.
 */
const editors = new Map();

/**
 * Sent by a cell when an edit is committed: `{ rowKey, columnKey, value }`.
 * Bubbles and is composed, so it leaves the cell factory's shadow root and
 * reaches the datatable, which turns it into a `cellchange`.
 */
export const LONG_TEXT_COMMIT_EVENT = "fgridlongtextcommit";

function keyFor(rowKey, columnKey) {
    return `${rowKey}\u0000${columnKey}`;
}

/** Adds a cell; called from its connectedCallback. */
export function registerLongTextEditor(rowKey, columnKey, editor) {
    const key = keyFor(rowKey, columnKey);
    if (!editors.has(key)) {
        editors.set(key, new Set());
    }
    editors.get(key).add(editor);
}

/** Removes a cell; called from its disconnectedCallback. */
export function unregisterLongTextEditor(rowKey, columnKey, editor) {
    const key = keyFor(rowKey, columnKey);
    const set = editors.get(key);
    if (!set) {
        return;
    }
    set.delete(editor);
    if (!set.size) {
        editors.delete(key);
    }
}

/**
 * Switches the matching cell into editing.
 *
 * @returns {boolean} false when no cell is registered, so the caller can let
 *          the datatable's own edit panel open instead
 */
export function openLongTextEditor(rowKey, columnKey) {
    const set = editors.get(keyFor(rowKey, columnKey));
    if (!set?.size) {
        return false;
    }
    set.forEach((editor) => editor.startEdit());
    return true;
}
