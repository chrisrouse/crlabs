import { createElement } from "lwc";
import CrBorderSettings from "c/crBorderSettings";

describe("c-cr-border-settings", () => {
    afterEach(() => {
        while (document.body.firstChild) {
            document.body.removeChild(document.body.firstChild);
        }
    });

    const render = (value) => {
        const element = createElement("c-cr-border-settings", {
            is: CrBorderSettings
        });
        element.value = value;
        document.body.appendChild(element);
        return element;
    };

    const field = (element, name) => element.shadowRoot.querySelector(`[data-field="${name}"]`);

    it("shows the border fields in order, without Rounded Corners at a radius of 0", () => {
        const element = render(undefined);

        const labels = Array.from(element.shadowRoot.querySelectorAll("[data-field]")).map((each) => each.label);
        expect(labels).toEqual(["Border Color", "Weight", "Line Style", "Sides", "Border Radius"]);
    });

    it("passes its default color label to the Border Color row", async () => {
        const element = render(undefined);
        element.defaultColorLabel = "Faint Line";
        await Promise.resolve();

        expect(field(element, "color").defaultLabel).toBe("Faint Line");
    });

    it("fills missing settings with no border", () => {
        const element = render({ color: "#ff0000" });

        expect(field(element, "color").value).toBe("#ff0000");
        expect(field(element, "size").value).toBe("0px");
        expect(field(element, "style").value).toBe("solid");
        expect(field(element, "sides").value).toEqual(["top", "right", "bottom", "left"]);
    });

    it("shows Rounded Corners once the radius is above 0", () => {
        const element = render({ radius: "8px", radiusCorners: ["top-left"] });

        const corners = field(element, "radiusCorners");
        expect(corners.kind).toBe("corners");
        expect(corners.value).toEqual(["top-left"]);
    });

    it("sends the whole object with the changed setting, keeping settings it doesn't edit", () => {
        const element = render({
            size: "1px",
            shadow: "4px",
            shadowColor: "#000000"
        });
        const handler = jest.fn();
        element.addEventListener("borderchange", handler);

        field(element, "style").dispatchEvent(new CustomEvent("stylechange", { detail: { value: "dashed" } }));
        field(element, "size").dispatchEvent(new CustomEvent("measurechange", { detail: { value: "2rem" } }));

        expect(handler).toHaveBeenCalledTimes(2);
        const sent = handler.mock.calls[1][0].detail.value;
        expect(sent.style).toBe("dashed");
        expect(sent.size).toBe("2rem");
        expect(sent.shadow).toBe("4px");
        expect(sent.shadowColor).toBe("#000000");
    });

    it("shows Rounded Corners after the radius is changed above 0", async () => {
        const element = render(undefined);

        field(element, "radius").dispatchEvent(new CustomEvent("measurechange", { detail: { value: "4px" } }));
        await Promise.resolve();

        expect(field(element, "radiusCorners")).not.toBeNull();
    });

    it("offers the radius on a 0 to 150 px slider", () => {
        const element = render({ radius: "12px" });

        const slider = field(element, "radius");
        expect(slider.max).toBe(150);
        expect(slider.value).toBe("12px");
    });
});
