# Foundations test harness

A Flow screen component and a Draft flow for trying the CRLabs Foundations property editor controls in Flow Builder's properties panel. Jest covers each control on its own, but some problems only show up inside Flow Builder. The icon picker's menu once failed to open there while it worked in Experience Builder.

This folder isn't listed in `sfdx-project.json`, so it is never packaged. It needs CRLabs Foundations in the org.

## What's in it

- **Foundations Test** (`crFoundationsTest`): a Flow screen component. On the screen it shows the chosen icon in a box drawn with the chosen border and shadow.
- **Foundations Test editor** (`crFoundationsTestEditor`): its custom property editor. It holds the icon picker and the Border and Shadow settings, built on the Flow Config Editor Kit's base class.
- **Foundations Test** flow (`Foundations_Test`): a Draft screen flow with the component on its only screen.

## Deploy and open

```bash
sf project deploy start -o <org> -d foundations/test/force-app
sf org open -o <org> --source-file foundations/test/force-app/main/default/flows/Foundations_Test.flow-meta.xml
```

On the screen, click the Foundations Test component to open its panel.

## What to check

- The icon field fills the panel's width, and its menu opens, searches, and closes on a click outside it.
- The Border Radius and Shadow Size sliders store their value when released, and the track's end doesn't move as the number changes.
- Tiles, buttons, and the icon field show the blue border and inner ring on hover and focus.
- After saving, closing, and reopening the flow, the panel shows the same settings.
- Run the flow in Debug: the box on the screen matches the panel.

To try a new Foundations control, add it to `crFoundationsTestEditor` and save its value through `setInput`.
