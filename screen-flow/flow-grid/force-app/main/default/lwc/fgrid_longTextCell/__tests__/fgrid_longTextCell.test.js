import { createElement } from "lwc";
import FgridLongTextCell from "c/fgrid_longTextCell";
import { LONG_TEXT_COMMIT_EVENT, openLongTextEditor } from "c/fgrid_longTextEditors";

const ROW = "001A";
const COLUMN = "Description__0";

function mount(props = {}) {
    const element = createElement("c-fgrid-long-text-cell", { is: FgridLongTextCell });
    Object.assign(element, { rowKey: ROW, columnKey: COLUMN, label: "Description", value: "First\nSecond", ...props });
    document.body.appendChild(element);
    return element;
}

/** Opens the editor the way the datatable does, through the registry. */
async function openEditor() {
    const opened = openLongTextEditor(ROW, COLUMN);
    await Promise.resolve();
    return {
        opened,
        textarea: document.body.querySelector("c-fgrid-long-text-cell").shadowRoot.querySelector("textarea")
    };
}

function type(textarea, value) {
    textarea.value = value;
    textarea.dispatchEvent(new CustomEvent("input"));
}

function press(textarea, key, extra = {}) {
    const event = new KeyboardEvent("keydown", { key, bubbles: true, composed: true, cancelable: true, ...extra });
    textarea.dispatchEvent(event);
    return event;
}

describe("c-fgrid-long-text-cell", () => {
    let commits;
    const recordCommit = (event) => commits.push(event.detail);

    beforeEach(() => {
        commits = [];
        document.addEventListener(LONG_TEXT_COMMIT_EVENT, recordCommit);
    });

    afterEach(() => {
        document.removeEventListener(LONG_TEXT_COMMIT_EVENT, recordCommit);
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it("shows the value as formatted text until edited", () => {
        const element = mount();
        const text = element.shadowRoot.querySelector("lightning-formatted-text");
        expect(text.value).toBe("First\nSecond");
        expect(element.shadowRoot.querySelector("textarea")).toBeNull();
    });

    it("opens a text box holding the value when the datatable asks", async () => {
        mount();
        const { opened, textarea } = await openEditor();
        expect(opened).toBe(true);
        expect(textarea.value).toBe("First\nSecond");
        expect(textarea.getAttribute("aria-label")).toBe("Description");
    });

    it("reports nothing to open once the cell is gone", () => {
        const element = mount();
        document.body.removeChild(element);
        expect(openLongTextEditor(ROW, COLUMN)).toBe(false);
    });

    it("commits a changed value on blur, keyed by row and column", async () => {
        mount();
        const { textarea } = await openEditor();
        type(textarea, "Changed");
        textarea.dispatchEvent(new CustomEvent("blur"));
        expect(commits).toEqual([{ rowKey: ROW, columnKey: COLUMN, value: "Changed" }]);
    });

    it("commits nothing when the value is unchanged", async () => {
        mount();
        const { textarea } = await openEditor();
        textarea.dispatchEvent(new CustomEvent("blur"));
        expect(commits).toEqual([]);
    });

    it("cancels on Escape without committing", async () => {
        const element = mount();
        const { textarea } = await openEditor();
        type(textarea, "Changed");
        press(textarea, "Escape");
        await Promise.resolve();
        expect(commits).toEqual([]);
        expect(element.shadowRoot.querySelector("textarea")).toBeNull();
    });

    it("commits on Ctrl+Enter and Cmd+Enter, but Enter alone is a new line", async () => {
        mount();
        let { textarea } = await openEditor();
        type(textarea, "One");
        expect(press(textarea, "Enter").defaultPrevented).toBe(false);
        expect(commits).toEqual([]);
        press(textarea, "Enter", { ctrlKey: true });
        expect(commits.map((commit) => commit.value)).toEqual(["One"]);

        ({ textarea } = await openEditor());
        type(textarea, "Two");
        press(textarea, "Enter", { metaKey: true });
        expect(commits.map((commit) => commit.value)).toEqual(["One", "Two"]);
    });

    it("keeps keys from reaching the datatable", async () => {
        const element = mount();
        const reached = jest.fn();
        element.addEventListener("keydown", reached);
        const { textarea } = await openEditor();
        press(textarea, "ArrowDown");
        expect(reached).not.toHaveBeenCalled();
    });

    it("undo reverts and closes without committing", async () => {
        const element = mount();
        const { textarea } = await openEditor();
        type(textarea, "Changed");
        element.shadowRoot.querySelector("lightning-button-icon").click();
        await Promise.resolve();
        // The blur that follows the editor closing must not commit either.
        textarea.dispatchEvent(new CustomEvent("blur"));
        expect(commits).toEqual([]);
        expect(element.shadowRoot.querySelector("textarea")).toBeNull();
    });
});

describe("c-fgrid-long-text-cell, single line", () => {
    let commits;
    const recordCommit = (event) => commits.push(event.detail);

    beforeEach(() => {
        commits = [];
        document.addEventListener(LONG_TEXT_COMMIT_EVENT, recordCommit);
    });

    afterEach(() => {
        document.removeEventListener(LONG_TEXT_COMMIT_EVENT, recordCommit);
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    it("edits in a one-line input holding the value", async () => {
        const element = mount({ singleLine: true, value: "Acme" });
        openLongTextEditor(ROW, COLUMN);
        await Promise.resolve();
        const input = element.shadowRoot.querySelector("input");
        expect(element.shadowRoot.querySelector("textarea")).toBeNull();
        expect(input.value).toBe("Acme");
    });

    it("commits on plain Enter", async () => {
        const element = mount({ singleLine: true, value: "Acme" });
        openLongTextEditor(ROW, COLUMN);
        await Promise.resolve();
        const input = element.shadowRoot.querySelector("input");
        type(input, "Acme Corp");
        expect(press(input, "Enter").defaultPrevented).toBe(true);
        expect(commits).toEqual([{ rowKey: ROW, columnKey: COLUMN, value: "Acme Corp" }]);
    });
});
