# crlabs

## Structure

The repo has three families. Each component is a folder inside its family.

- `foundations/`: the CRLabs Foundations base package. It holds the vendored Flow Config Editor Kit and
  the shared `cr*` building blocks that other components import.
- `screen-flow/`: Flow screen components.
- `experience-cloud/`: Experience Cloud LWR components.

Each component lives in `<family>/<component>/`. Its package source goes in `force-app/`, which is the
path listed in `sfdx-project.json`. Test flows and harnesses go in `test/` beside it, outside the
package. Mockups go in `mockups/`, which git ignores, so they stay on this machine.

Screen Flow packages: Screen Timer, Email Recipients, and Flow Grid (not yet registered). Experience
Cloud components are separate folders but are not packaged yet.

**`experience-cloud/shared/` is temporary.** It holds `crVersionInfo` until the Foundations version
component replaces it, one component at a time. Add nothing else to it.

**Flow Grid is parked.** Keep its internals as they are, including its own `fgrid_colorPicker` and
`fgrid_iconPicker`, until work on it resumes.

## Foundations rules

A component imports Foundations pieces and uses whatever version is deployed. So a Foundations change
reaches every component as soon as it is deployed. These rules keep that safe.

1. **Foundations code reaches `main` no later than the first component that uses it.** It can land in
   the same PR as that component, or in an earlier PR on a `foundations/<name>` branch. It can never
   sit on a branch that other branches are built from.
2. **Moving something into Foundations counts as a Foundations change.** Rule 1 applies to it. Remove
   the old copy in the same commit, because one LWC name cannot exist in two package folders.
3. **Changing a Foundations piece's public surface means updating every consumer in the same PR.** The
   public surface is its `@api` properties, events, slots and CSS custom properties. Search all three
   families for imports before you change it. Deployed consumers pick up the change immediately, so a
   consumer that is not updated breaks on the next deploy.
4. **Foundations depends on nothing else in the repo.** It never imports from `screen-flow/` or
   `experience-cloud/`.
5. **Components never import other components.** If two components need the same thing, it moves to
   Foundations.
6. **The vendored kit is edited only as `VENDOR.md` declares.** Any other kit fix goes upstream. CRLabs
   code lives beside the kit, never inside its tree, so a re-pin stays a clean diff.

## Branching

- `main` always deploys cleanly. Everything on it has been deployed and checked in the org.
- Branch from `main`, never from another feature branch. Name it `<family>/<component>`, for example
  `experience-cloud/accordion`, `screen-flow/email-recipients` or `foundations/color-picker`.
- One component per branch. Foundations changes it needs follow rule 1.
- Rebase a branch onto `main` after a Foundations PR merges, before you continue work on it.
- Delete a branch once it has merged.

## Commits

Conventional commits, with the family as the scope: `feat(experience-cloud): ...`,
`fix(foundations): ...`, `feat(screen-flow): ...`. Use a narrower scope where history already does,
for example `feat(email-recipients)`.
