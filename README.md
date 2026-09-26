# crlabs

Salesforce packages published under the `crlabs` namespace.

Everything here installs as an **unlocked package**, free to use. The base
package must be installed before any component package that depends on it.

## Packages

| Package | Directory | Purpose |
| --- | --- | --- |
| Flow Config Editor Kit | `flow-config-editor-kit/` | Base package. Reusable building blocks for Flow Builder custom property editors. Install this first. |

More component packages will land here and depend on the base package.

## About the base package

**The Flow Config Editor Kit is not our code.** It is
[RebbePod/flow-config-editor-kit](https://github.com/RebbePod/flow-config-editor-kit)
by Fast Track Digital, used under the Apache License 2.0. See
`flow-config-editor-kit/LICENSE` and `flow-config-editor-kit/NOTICE`.

It is vendored here so a `crlabs`-namespaced package can be built from it.
`flow-config-editor-kit/VENDOR.md` records the pinned upstream commit and any
local changes.

### Why namespaced, when upstream is not

Upstream deliberately ships no namespace, so adopters can keep importing
`c/flowConfigEditorBase`. That is the right choice for their distribution.

This copy is namespaced for a different reason: upstream publishes no package
yet, so two people publishing an unnamespaced kit package would produce
mutually exclusive installs — both would want to own the same component names
in the `c` namespace, and an org could hold only one. Under `crlabs`, this copy
coexists with an upstream package if one is ever published, and the components
that depend on it can pin a version they have tested.

The source is unmodified apart from what `VENDOR.md` declares; the namespace is
applied at package build, not by editing files.

## Installing

Install URLs are published on each release. After installing, assign the
permission set that grants the Apex controller and Visualforce bridge:

```bash
sf org assign permset --name Flow_Config_Editor_Access --target-org my-org
```

## Developing

```bash
npm install
npm run verify      # prettier check, then the kit's Jest suites
```

Fixes to the kit belong **upstream**, not here. Open a PR against
[the upstream repo](https://github.com/RebbePod/flow-config-editor-kit); once it
merges, re-pin this copy.
