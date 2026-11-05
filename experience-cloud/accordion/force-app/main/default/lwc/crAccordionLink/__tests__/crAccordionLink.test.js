import { publishAccordionState, subscribeToAccordion } from "c/crAccordionLink";

describe("c-cr-accordion-link", () => {
    it("passes the state to listeners on the same link name, ignoring case and spaces", () => {
        const listener = jest.fn();
        const stop = subscribeToAccordion(" FAQ ", listener);

        publishAccordionState("faq", { open: ["pricing"] });

        expect(listener).toHaveBeenLastCalledWith({ open: ["pricing"] });
        stop();
    });

    it("gives a late listener the latest state at once", () => {
        publishAccordionState("late", { open: ["a"] });
        const listener = jest.fn();

        subscribeToAccordion("late", listener);

        expect(listener).toHaveBeenCalledWith({ open: ["a"] });
    });

    it("keeps different link names apart", () => {
        const listener = jest.fn();
        subscribeToAccordion("one", listener);
        listener.mockClear();

        publishAccordionState("two", { open: ["x"] });

        expect(listener).not.toHaveBeenCalled();
    });
});
