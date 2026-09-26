import FgridFlowActionModal from "c/fgrid_flowActionModal";

/**
 * These use the LOCAL `lightning/modal` stub in flowgrid/test/jest-mocks, because
 * sfdx-lwc-jest ships no stub for `modal` itself. That stub reproduces one platform
 * behaviour these tests depend on: `disableClose` blocks `close()` as well as the
 * close button and Escape. It is documented behaviour, confirmed against the
 * lightning-modal docs rather than inferred from the stub -- which matters, because
 * a stub that merely agreed with our code would make the trap test meaningless.
 */

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

function open(props = {}) {
    const promise = FgridFlowActionModal.open({
        label: "Edit Account",
        headerLabel: "Edit Account",
        flowApiName: "Some_Flow",
        ...props
    });
    // `open()` mounts synchronously in the stub; the template needs a tick.
    return { promise, element: document.body.lastChild };
}

function finish(element, detail) {
    element.shadowRoot.querySelector("lightning-flow").dispatchEvent(new CustomEvent("statuschange", { detail }));
}

afterEach(() => {
    while (document.body.firstChild) {
        document.body.removeChild(document.body.firstChild);
    }
});

describe("the close lock", () => {
    it("leaves the modal dismissible by default", async () => {
        const { element } = open();
        await flush();

        expect(element.disableClose).toBe(false);
    });

    it("locks when the caller passes disableClose", async () => {
        // The lock is the base class's property, set through `open()`. This
        // component has none of its own: an earlier `preventClose` that assigned
        // `disableClose` from `connectedCallback` was removed once measurement
        // showed the flag never hides the button, only disables it, so the extra
        // name bought nothing.
        const { element } = open({ disableClose: true });
        await flush();

        expect(element.disableClose).toBe(true);
    });

    it("hides the platform's close button while locked", async () => {
        // `disableClose` disables the X but leaves it drawn at full opacity, so it
        // reads as clickable and does nothing -- the state users found confusing.
        // Nothing declarative can reach it: it lives in `lightning-modal-base`'s
        // native shadow root, invisible to any document selector, with no styling
        // hook for visibility. So the component hides it directly.
        //
        // Under the stub the modal mounts into the document, so the button stands in
        // for the sibling it is in the real container.
        const button = document.createElement("button");
        button.setAttribute("data-close-button", "");
        document.body.appendChild(button);

        open({ disableClose: true });
        await flush();

        expect(button.style.display).toBe("none");
    });

    it("leaves the close button alone when the modal is not locked", async () => {
        // The ordinary case must keep its close button, and this asserts the
        // component does not reach into platform DOM unless it has to.
        const button = document.createElement("button");
        button.setAttribute("data-close-button", "");
        document.body.appendChild(button);

        open();
        await flush();

        expect(button.style.display).toBe("");
    });

    it("still resolves when the flow finishes, having released the lock first", async () => {
        // THE TRAP TEST. `disableClose` blocks `close()` too, so setting it and then
        // calling `close()` directly would leave the user with no way out at all --
        // not the close button, not Escape, and not the flow completing. If the
        // release is removed, this promise never settles and the test times out.
        const { promise, element } = open({ disableClose: true });
        await flush();

        finish(element, { status: "FINISHED", outputVariables: [{ name: "rec", value: { Id: "001" } }] });

        await expect(promise).resolves.toEqual({
            status: "FINISHED",
            outputVariables: [{ name: "rec", value: { Id: "001" } }]
        });
    });

    it("still resolves on a flow error, so a fault is not a dead end", async () => {
        // The other half of not trapping anyone: a flow that faults must let go.
        const { promise, element } = open({ disableClose: true });
        await flush();

        finish(element, { status: "ERROR" });

        await expect(promise).resolves.toEqual({ status: "ERROR" });
    });

    it("resolves on finish when not locked, the ordinary path", async () => {
        const { promise, element } = open();
        await flush();

        finish(element, { status: "FINISHED_SCREEN", outputVariables: [] });

        await expect(promise).resolves.toEqual({ status: "FINISHED_SCREEN", outputVariables: [] });
    });
});
