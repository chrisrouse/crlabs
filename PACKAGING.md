# Packaging

Notes for whoever builds and releases these packages. Several of these were
learned the hard way; the reasoning is kept so they are not re-litigated.

## The orgs

| Role           | Org                              | Why it matters                                                                     |
| -------------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| Dev Hub        | `smartbot` — org name **crLabs** | Owns every package. Packages cannot be moved to another Dev Hub, ever.             |
| Namespace org  | `PackageOrg` — holds `crlabs`    | Its only job. Do not develop in it.                                                |
| Install target | a **no-namespace** scratch org   | A namespaced package cannot install into an org that already holds that namespace. |

Create the test org with `--no-namespace`, or installs fail:

```bash
sf org create scratch -f config/project-scratch-def.json -a crlabsInstallTest \
  --no-namespace --target-dev-hub smartbot
```

## Registering a package

```bash
sf package create --name "Flow Grid" --package-type Unlocked \
  --path flowgrid/force-app --target-dev-hub smartbot
```

**`sf package create` rewrites `sfdx-project.json` rather than merging into
it.** It replaces the whole package-directory entry with its own defaults and
**silently discards** anything you hand-authored there — `dependencies`,
`versionNumber`, `default`.

This is not cosmetic. When it dropped Flow Auto Navigate's dependency, the
next version build failed with:

```
No MODULE named markup://crlabs:flowConfigEditorBase found
```

which is accurate: with no dependency declared, the build org never installed
the kit. **Re-read the file after running the command and restore the entry.**

## Building a version

```bash
sf package version create --package "Flow Auto Navigate" \
  --installation-key-bypass --code-coverage --wait 60 --target-dev-hub smartbot
```

`--code-coverage` is needed for any version you intend to promote. Without it
the version builds fine and installs into scratch orgs and sandboxes, but can
never be released. It makes the build slower, so skip it while iterating.

Dependency resolution uses `0.1.0.LATEST`, so the kit must already have a
version before a dependent package can build.

## Beta and released

Every new version is **beta**. Beta installs into scratch orgs and sandboxes
only. Promoting makes it installable in production:

```bash
sf package version promote --package "Flow Auto Navigate@1.0.0-2" \
  --target-dev-hub smartbot
```

Promotion requires 75% Apex coverage, the "Promote a package version to
released" permission in the Dev Hub, and it is **irreversible** — a package
with a promoted version cannot be deleted and the version is immutable.

## Publisher name

The publisher shown on the install screen and in Setup → Installed Packages is
the **Dev Hub org's Organization Name** (Setup → Company Information).

**It is not baked into the package version, and no rebuild is needed.** It
does not update instantly either — after renaming the Dev Hub from `byChris`
to `crLabs`, versions kept showing the old name for a while, including a
version built _after_ the rename, and `SubscriberPackageVersion.PublisherName`
is null on every version. It then updated on its own for all versions,
including ones built before the rename. So: propagation delay, not a
per-version value. Rename and wait rather than rebuilding.

It is Dev-Hub-wide. Every package that Dev Hub owns shows the same publisher.

## Install order

The base package first, always. Unlocked packages do **not** auto-install
their dependencies, so a subscriber follows two links:

```
https://login.salesforce.com/packaging/installPackage.apexp?p0=<kit 04t>
https://login.salesforce.com/packaging/installPackage.apexp?p0=<component 04t>
```

Use `test.salesforce.com` for sandboxes. After the kit, assign
`crlabs__Flow_Config_Editor_Access`.

## Namespace behaviour, verified

`c/` and `c:` are aliases for _the current namespace_, not the default one.
The platform rewrites them at deploy and build time:

- LWC `import … from "c/flowConfigEditorBase"` → `crlabs/flowConfigEditorBase`
- Flow `<extensionName>c:fgrid_flowGrid</extensionName>` → `crlabs:fgrid_flowGrid`

Two consequences. No source needs editing to namespace a package. And a
namespaced package **cannot** consume an unnamespaced one through `c/` — the
alias resolves to its own namespace and the module is simply not found.
