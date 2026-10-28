# crlabs

Salesforce packages published under the `crlabs` namespace.

Everything here installs as an **unlocked package**, free to use. The base
package must be installed before any component package that depends on it.

## Packages

| Package                | Directory                 | Purpose                                                                                                                                            |
| ---------------------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| CRLabs Foundations | `flow-config-editor-kit/` | **Base package, install first.** Reusable building blocks for Flow Builder custom property editors. Forked from the Flow Config Editor Kit (see below). |
| Screen Timer       | `screentimer/`           | Configure timers for Screen Flows. Depends on CRLabs Foundations. |

More component packages will land here and depend on the base package.

## About the base package

**CRLabs Foundations is a fork.** It is built from
[RebbePod/flow-config-editor-kit](https://github.com/RebbePod/flow-config-editor-kit)
by Fast Track Digital, pinned at commit 1377405, and used under the Apache License
2.0. CRLabs maintains the fork and its modifications. Every modified file carries a
notice at its top, as section 4(b) of the license requires.

See `flow-config-editor-kit/LICENSE` and `flow-config-editor-kit/NOTICE`, which carry
the attribution. `flow-config-editor-kit/VENDOR.md` records the upstream pin and the
history of the changes.

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

Install URLs are published on each release. **Install the base package first**
— component packages declare it as a dependency and will not install without
it. After installing the base package, assign the permission set that grants
its Apex controller and Visualforce bridge:

```bash
sf org assign permset --name Flow_Config_Editor_Access --target-org my-org
```

Its full API name is `crlabs__Flow_Config_Editor_Access`, which is how it
appears in Setup. The CLI matches the unprefixed name above.

Component packages need no permission set of their own; a Flow screen
component is available to anyone who can run the flow.

## Developing

```bash
npm install
npm run verify      # prettier check, lint, then the Jest suites
```

**Two Prettier configs, deliberately.** The root `.prettierrc` is this
project's style. `flow-config-editor-kit/.prettierrc` is upstream's, verbatim,
because that is what the vendored tree is formatted to — applying our style
would rewrite every file and destroy the diff against upstream. Prettier uses
the nearest config to each file, so both are checked correctly in one pass.

ESLint covers `screentimer/` only; the kit is linted upstream.

Fixes to the kit belong **upstream**, not here. Open a PR against
[the upstream repo](https://github.com/RebbePod/flow-config-editor-kit); once it
merges, re-pin this copy.
