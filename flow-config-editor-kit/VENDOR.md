# Vendored: Flow Config Editor Kit

**This is third-party code, not ours.** It lives under `crlabs/` because a
`crlabs`-namespaced package is built from it, not because we own it. Treat it as a
vendored dependency: fixes go upstream, and the tree stays diffable.

Upstream: https://github.com/RebbePod/flow-config-editor-kit
License: Apache-2.0 (see `LICENSE`, `NOTICE`)
Copyright: Fast Track Digital

## Pinned commit

```
1377405378f2fddb8534666fd9c6adb0cbbebcf1
2026-08-26  feat: offer Collection Filter and Collection Sort outputs as resources (#23)
```

The skill's `reference/UPSTREAM_SHA` and `flowgrid/STATUS.md` record `6443e41`
instead. That commit is an **ancestor** of this one and their `force-app` trees are
identical — the commits between touched only docs and CI — so the records disagree on
id but describe the same shippable source.

Upstream has no tagged releases. Version in its `package.json` is `0.1.0` (unreleased).

## What is vendored

Only `force-app/` — 73 files: 19 LWC bundles, `FlowConfigApexTypeController` (+ test),
the `FlowConfigApexTypeBridge` Visualforce page, and the
`Flow_Config_Editor_Access` permission set. All at `apiVersion` 67.0.

`examples/` is deliberately excluded; upstream states it is never part of the package.

## Do not edit these files

This copy is unmodified so it can be diffed against upstream. Fixes belong upstream
or in a clearly separate overlay — not here. To check for drift:

```bash
~/.claude/skills/flow-config-editor-kit/check-upstream.sh
```

To refresh: re-clone at the new SHA, replace `force-app/`, update the SHA above.

## Deploy

```bash
sf project deploy start -d crlabs/flow-config-editor-kit/force-app -o "Preview Org"
sf org assign permset --name Flow_Config_Editor_Access -o "Preview Org"
```

`Flow_Config_Editor_Access` grants the Apex controller and Visualforce bridge used for
Apex-defined-type and hierarchy-setting discovery. Flow Grid does not currently use
either, but the permission set is part of the kit's supported install.

## Fork patches

**One, awaiting merge upstream.** A clean tree is diffable against upstream and costs
nothing to re-pin, so this should return to none.

### Popover anchoring while an ancestor scrolls — contributed as PR #25, OPEN

A picker popover detached from its field when an ancestor scrolled. Patched locally
across `flowConfigPopoverUtils`, `flowConfigFieldPicker`, `flowConfigObjectPicker` and
`flowConfigResourcePicker` (6 files, +174/-9, tests included) and contributed as
<https://github.com/RebbePod/flow-config-editor-kit/pull/25>.

**WHEN IT MERGES**: re-pin to the merged commit and delete this section. #23 went the
same way and the merged version came back better than what was contributed — see the
history below.

This matters beyond tidiness now that the kit is packaged: Apache-2.0 §4(b) requires
modified files to carry notices stating they were changed, so shipping a package built
from this tree means shipping a declared fork. Waiting for the merge avoids that.

### History: the Collection Filter gap, contributed and merged

`collectFlowResources` enumerated `recordLookups` and the four `ELEMENT_OUTPUT_GROUPS`
but not `collectionProcessors`, so **Collection Filter** and **Collection Sort** output
collections were invisible to every kit picker while Flow's own picker listed them.
The symptom: a Get Records collection could be selected but a filtered version of it
could not, making "get everything, filter it, show the result" impossible to wire
without an extra Assignment.

Patched locally 2026-08-26, contributed, and **merged upstream as #23** — which is now
the pinned commit, so the fork patches are gone and the tree is clean again.

**The merged version is better than the one contributed, and the difference is worth
knowing.** The local patch resolved a processor's object by looking up the collection
it consumed among the resources already collected. During review that became a
complete name map with cycle protection:

- **ours** — searched already-collected resources, so it depended on Flow emitting
  processors in dependency order, and a Collection Filter fed by another Collection
  Filter would not resolve.
- **upstream** — resolves through `processorsByName` regardless of array order, follows
  chains, and carries a `resolving` set so a cycle cannot recurse.

Anything relying on chained processors gets that for free by re-pinning; carrying the
local version would have kept the weaker resolution indefinitely.

**One bug the upstream test run found, now fixed in both copies:** a `null` entry in
`collectionProcessors` threw, because `processor.name` dereferenced it. `asArray`
guards a non-array, not null members. Now `processor?.name`.
