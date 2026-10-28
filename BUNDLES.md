# Bundles: plan

Status: **planned, not built.** Nothing in this document is registered in the
smartbot Dev Hub yet. Revisit before acting on it.

## Goal

Let an admin install a whole family of CRLabs components in one step, while
still offering each component as its own package.

- **CRLabs Screen Flow Components.** Every screen-flow component: Screen Timer,
  and Flow Grid when it is ready.
- **CRLabs Flow Actions.** Invocable Apex for Flow. There is none yet, so this
  bundle waits until one exists.

Individual packages stay available. Most people should use the bundle.

## Decision

Build the bundle first. Individual packages are built afterwards from the same
source, and only where someone needs one on its own.

## Constraints that shape the design

1. **An org holds each component once.** A bundle and an individual package that
   contain the same component cannot both be installed in one org. The subscriber
   has to pick one. This is the main tradeoff of the design.
2. **Unlocked packages do not auto-install dependencies.** A bundle that only
   declares its components as dependencies would still need each package
   installed by hand, so it would save no steps. That is why the bundle contains
   the component source itself.
3. **A source file can belong to only one package directory in `sfdx-project.json`.**
   So the bundle cannot point at the same folders as the individual packages. The
   shared source has to be copied into each package during the build.
4. **Every bundle depends on CRLabs Foundations.** The kit installs first, as it
   does for Screen Timer today. See `PACKAGING.md` for the install order.

## How it would be built

- Keep one source of truth per component, in its existing folder.
- A build script copies those folders into a staging area for the bundle and for
  each individual package. Nothing is edited by hand in the copies.
- Register the bundle with `sf package create`, then restore the hand-written
  entries in `sfdx-project.json` afterwards, because the command rewrites that file.
  See `PACKAGING.md`.
- Build a beta version of each package with `sf package version create`.

## Open questions

- **Flow Grid in the first bundle?** Its source is in the `flowgrid/` folder, and
  it is still in progress.
- **Which Dev Hub holds it?** Packages cannot be moved to another Dev Hub, so this
  one goes in smartbot with the others.
- **Naming.** "CRLabs Screen Flow Components" and "CRLabs Flow Actions" are the
  working names.

## Not decided yet

- When to promote a bundle to released. Promotion is irreversible, and it needs
  Apex coverage of at least 75%.
- Whether the individual packages are published alongside the bundle or kept
  internal.
- Whether a future Flow Actions bundle depends on the screen bundle, or only on
  the kit.
