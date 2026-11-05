import { createElement } from "lwc";
import CrShadowSettings from "c/crShadowSettings";

describe("c-cr-shadow-settings", () => {
  afterEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
  });

  const render = (value) => {
    const element = createElement("c-cr-shadow-settings", {
      is: CrShadowSettings
    });
    element.value = value;
    document.body.appendChild(element);
    return element;
  };

  const field = (element, name) =>
    element.shadowRoot.querySelector(`[data-field="${name}"]`);

  const labels = (element) =>
    Array.from(element.shadowRoot.querySelectorAll("[data-field]")).map(
      (each) => each.label
    );

  it("shows only Shadow Size when there is no shadow", () => {
    const element = render(undefined);

    expect(labels(element)).toEqual(["Shadow Size"]);
    expect(field(element, "shadow").value).toBe("0px");
    expect(field(element, "shadow").max).toBe(30);
  });

  it("shows Shadow Color and Shadow Sides once there is a shadow", () => {
    const element = render({ shadow: "5px", shadowSides: ["bottom"] });

    expect(labels(element)).toEqual([
      "Shadow Size",
      "Shadow Color",
      "Shadow Sides"
    ]);
    expect(field(element, "shadowSides").value).toEqual(["bottom"]);
  });

  it("sends the whole object with the changed setting, keeping settings it doesn't edit", () => {
    const element = render({ shadow: "5px", size: "1px", color: "#ff0000" });
    const handler = jest.fn();
    element.addEventListener("shadowchange", handler);

    field(element, "shadowColor").dispatchEvent(
      new CustomEvent("colorchange", { detail: { value: "#00000080" } })
    );

    const sent = handler.mock.calls[0][0].detail.value;
    expect(sent.shadowColor).toBe("#00000080");
    expect(sent.shadow).toBe("5px");
    expect(sent.size).toBe("1px");
    expect(sent.color).toBe("#ff0000");
  });
});
