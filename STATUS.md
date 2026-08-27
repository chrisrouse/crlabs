# Flow Grid — status and what's left

Branch `feature/flow-grid`. Everything below is deployed to the **Preview Org**
(`chris-b4pw@force.com`). The branch is committed but **not pushed** — around twenty
commits are local only.

Local checks: **411 Jest tests**, ESLint and Prettier clean, zero SLDS linter
violations, full-package deploy succeeds.

---

## 1. Start here: nothing has been tested in a browser

This is the single biggest gap. Every Apex path has been exercised with
`sf apex run`, and the LWC logic has Jest coverage, but **no part of the UI has
been confirmed working in Flow Builder or at runtime**. The Jest suite cannot
prove Flow Builder accepts the metadata, that `lightning-flow` renders inside a
running screen, or that the modal stacks correctly.

Test in this order — later items depend on earlier ones working.

### 1.1 Design time — the property editor

Open the smoke flow — it lives in the org, not the repo — and click the Flow Grid element:
`/builder_platform_interaction/flowBuilder.app?flowDefId=300Ws00001Ef2jeIAB`

- [ ] The custom editor loads (ten accordion sections, not a flat list of inputs)
- [ ] **Kit picker popovers position correctly** — open **Records** and check the
      popover is not clipped or misplaced. Never verified; it was the original
      risk when the Studio was designed.
- [x] **Checkbox persistence.** Verified 2026-08-25, after four attempts — see §4.
      A Boolean that must default ON has to be stored AND labelled negatively;
      Flow Builder silently drops a `false` input parameter.
- [ ] Row Action → **Run a flow** → the flow picker appears directly beneath it,
      and the rest of the section stays hidden until a flow is chosen
- [ ] The flow list has no `Screen —` / `Autolaunched —` prefixes, no template
      flows, and reasonable left padding (see §3.1)
- [ ] Pick a flow, then type the variable names. Blank means "do not send".
- [ ] Type a name the flow does not declare, run the action, and confirm the grid
      reports the dropped name rather than failing the interview or going quiet

### 1.2 Design time — Grid Studio

- [ ] **Open Grid Studio** renders the two-pane modal
- [ ] Preview banner is green and says "Live preview using real records"
- [ ] Column attributes table edits round-trip
- [ ] Backdrop is opaque: no canvas chip or Move/Delete buttons visible through
      it, and no double-shade. Select a component on the canvas, click in and out
      of Records, then reopen the Studio — that was the trigger. See §3.2.

### 1.3 Runtime — Debug the smoke flow

- [ ] Grid renders 314 Accounts with real labels, currency formatting on
      Annual Revenue, and the Name field as a record link
- [ ] Search, column filters (Name and Industry), Clear Filters
- [ ] Pagination: 10 per page, First/Previous/Next/Last, `n-m of total`
- [ ] Sort each column; confirm sorting the linked Name column orders by name,
      not by URL
- [ ] Selection → check `outputSelectedRecords` and `selectedCount` in the debug
      panel

### 1.4 Runtime — the Flow row action (the headline feature)

- [x] Click the row action: the modal opens and `FlowGrid_Edit_Account` renders.
      **Verified 2026-08-25.** This was the load-bearing assumption of the whole
      native row action — `lightning-flow` does work nested inside a running Flow
      screen.
- [x] Change the name, Finish: the modal closes and the grid shows the new value.
      **Verified 2026-08-25**, after fixing `event.detail.status` (the handler was
      reading `flowStatus`, so it never closed and the interview restarted,
      discarding the edits).
- [ ] `outputEditedRecords` / `editedCount` reflect it — not yet checked in the
      debug panel
- [ ] Cancel the modal instead: confirm nothing changes and no edit is recorded
- [ ] Finish without changing anything: confirm it does **not** appear in
      `outputEditedRecords` (the value-comparison path)
- [x] **Point the row action at an autolaunched flow.** Verified 2026-08-27 against
      the new `FlowGrid_Set_Rating` sample: no modal, and the table updated. Both row
      action launch modes are now confirmed working. This also exposed §2.3b — the
      change was reported as a pending edit even when the flow had saved it itself.
- [ ] **Deleted record:** have the launched flow delete the record, then confirm
      the row leaves the grid and lands in `outputRemovedRecords`

### 1.4a Runtime — inline editing

- [x] **Single-select picklist edits and commits.** Verified 2026-08-25.
- [x] **Multi-select picklist edits and commits**, array joined back to the stored
      `A;B` form. Verified 2026-08-25. Together these confirm `data-inputable="true"`
      is the commit path for a custom edit cell — see §2.1.
- [x] **Standard-type columns edit and commit.** Date, Datetime and Time verified
      2026-08-27 against a debug payload. Two defects found and fixed on the way; both
      are recorded below because both would be easy to reintroduce.

  **Drafts are keyed by `columnKey`, not `fieldName`.** This is the important one.
  Columns carry `columnKey: fieldName__index` so a dragged width survives a rebuild
  (§2.9), and the datatable then reports every inline edit under that key. Editing
  `Date_Test__c` arrived as `Date_Test__c__3` and `upsertRecord` wrote it verbatim,
  creating a phantom field. The failure is deceptive: the record genuinely differed,
  so a change was detected and Save was enabled, but the real field never received
  the value and the cell fell back to empty. Detected and discarded.

  `normalizeDraft` resolves each draft key through a columnKey-to-fieldName map. Do
  NOT remove that map when touching resize logic — the two features are coupled only
  through `columnKey`, and nothing else connects them.

  **`cellchange` reports only the cell that just changed**, not the accumulated draft
  set. Assigning `event.detail.draftValues` wholesale discarded every earlier edit as
  soon as a second cell was touched, and because `draft-values` is bound back to the
  table the first cell visibly reverted too. Drafts merge per row.
- [x] **`outputEditedRecords` drives a real database write.** Verified 2026-08-27,
      end to end: edited Date Test to Oct 6 2026, Save, then an Update Records element
      fed by `outputEditedRecords` ("Use the IDs and all field values from a record
      collection"). SOQL confirms `Date_Test__c = 2026-10-06` stored. The full records
      the output carries — CreatedDate, SystemModstamp, BillingAddress and the rest —
      did NOT cause a non-updateable-field error, so no sparse-record change is needed.

  **The Flow debug panel lies about Date fields.** It rendered the stored
  `2026-10-06` as "October 5, 2026 at 8:00 PM", parsing a date-only value as midnight
  UTC and formatting it in a UTC-4 user zone. Exactly the shift the
  lightning-formatted-date-time doc warns of, but in Flow's own debug UI — the value
  never had a time to shift. Trust the JSON payload or SOQL, not the formatted debug
  display, and do not "fix" a shift that only appears there.
- [ ] A cell edited back to its original value does **not** register as an edit
- [ ] `editedCount` reflects inline edits
- [x] **Cancel discards without touching the working collection.** Verified
      2026-08-27, including the layered case that actually proves it:
      null -> edit -> Save -> edit again -> Cancel restores the **saved** value, not
      the original null. Cancel reverts to whatever `_editsByKey` last committed
      rather than to the source record, which is the distinction that would have
      silently thrown away a committed edit had it been wrong.
- [ ] `navigateNextOnSave` advances the screen on Save
- [ ] A row whose stored picklist value is inactive keeps that value as a
      preselected option instead of losing it
- [ ] `suppressBottomBar` hides the Cancel/Save bar (it was hardcoded on before,
      so this path has never run)
- [ ] Recalculate the incoming collection mid-edit and confirm unsaved edits are
      discarded — the §2.6 rule

### 1.4b Runtime — disabled rows

- [x] **Disabled records greys the matching rows and blocks selection.** Verified
      2026-08-26 with a Collection Filter output (`Status`-style filter on Industry =
      Energy) wired to Disabled records: rows 6, 9 and 10 rendered with greyed radio
      buttons while row 5 stayed selectable.
      This verifies the kit patch end to end as well — the Collection Filter output is
      not merely visible in the picker, it is consumed as a real input at runtime.
- [ ] A disabled row also refuses inline editing, not just selection. The reference
      describes these as rows the user "cannot modify", so it should, but that half is
      unconfirmed.

### 1.5 Runtime — Remove row action

- [ ] Switch `rowActionType` to **Remove**, confirm removal, the 3-row cap
      message, and `outputRemovedRecords` / `outputRemainingRecords`

---

## 2. Not built yet

### 2.1 Inline editing — Stage A built, Stage B outstanding

Split once the docs made clear that `lightning-datatable` already provides inline
editing *and* the Cancel/Save bar for every standard type. The subclass is only
needed for picklists, so it is no longer a prerequisite for the feature.

**Stage A — done 2026-08-25, not yet browser-tested.** Standard types, on the
stock `lightning-datatable`:

- `draft-values` bound, with `oncellchange` / `onsave` / `oncancel`
- `onsave` routes each draft through `upsertRecord`, which already keeps only
  genuinely-differing fields and publishes `outputEditedRecords` / `editedCount`
- `navigateNextOnSave` dispatches `FlowNavigationNextEvent`
- **`suppress-bottom-bar` was hardcoded on the element**, so the bar could never
  appear regardless of the property. Now bound to `suppressBottomBar`
- a column is editable only when its column config sets `edit`. There is no
  grid-level switch, and `defaultEditable` is deliberately not passed at runtime

No DML, consistent with the rest of the component: the calling flow commits
`outputEditedRecords` if it wants the change persisted.

**Stage B — built and verified in Flow debug 2026-08-25.** `fgrid_customDatatable`
extends `LightningDatatable` and registers two custom types:

- `fgridPicklist` — `lightning-combobox` edit template
- `fgridMultiPicklist` — scroll-capped `lightning-checkbox-group`. Chosen over a
  dual listbox: one list, multi-select, no ctrl-click to discover, and two stacked
  boxes plus move buttons do not fit an inline-edit panel

Both grids use the subclass now, the runtime one and the Studio preview — a column
config enabling edit on a picklist emits a custom cell type, which a plain
`lightning-datatable` cannot render.

Design points worth keeping:

- **A custom type is used only when the column is editable.** A read-only picklist
  is indistinguishable from text, so it stays `text` and avoids our render path.
- **Options are addressed per row**, via `typeAttributes: { options: { fieldName } }`,
  not passed per column. That is what allows a row holding a value no longer in the
  active list to keep it as a selectable, preselected option instead of losing it
  on save. Rows with in-range values all share one array instance, so only
  genuinely stale rows allocate.
- **`--None--` is baked into that per-row list** when `allowNoneToBeChosen` is on,
  rather than being a separate flag the template has to interpret. Never offered
  for multi-select, where clearing every box already says "no value".
- **Multi-select converts on the way out.** The checkbox group's value is an array;
  the field stores `A;B`. `normalizeDraft` joins it and also strips the synthetic
  `__fgridOptions` / `__fgridSelected` row fields, which are not record fields and
  would otherwise be published as edits.

**The undocumented bit, now confirmed.** Salesforce documents what an edit template
*receives* (`editedValue`, `columnLabel`, `required`, `typeAttributes`) and that the
control needs `data-inputable="true"` for accessibility — but never documents how a
custom edit cell reports its value *back*, deferring vaguely to the standard
`draft-values`/`onsave` path.

`data-inputable="true"` **is** the mechanism: the inline-edit machinery reads the
committed value off the element carrying it. Verified in Flow debug 2026-08-25 —
both single-select (`lightning-combobox`) and multi-select
(`lightning-checkbox-group`) commit through it, including the array-to-`;`-string
conversion in `normalizeDraft`.

So the attribute is load-bearing, not decorative. Removing it from either edit
template breaks committing, and the failure would look like "the edit silently
does nothing" rather than an error.

Still unused: `recordTypeId` and `showAllPicklistValues`. Both are accepted
properties that nothing reads, so a picklist restricted by record type currently
offers values the user may not be allowed to pick — see §2.5.

**Stage C — editable lookups, built 2026-08-25, not yet browser-tested.** A third
custom type, `fgridLookup`, with `lightning-record-picker` as its editor: it
searches one object and yields a recordId, which is exactly what the field stores,
so the draft needs no conversion.

Display follows the standard datatable's two **Display Options**, per column, both
defaulting on:

- **Show record name** — display `Account.Name` instead of the raw Id. Read
  straight off the record, so it depends on the Flow having queried the
  relationship; falls back to the Id rather than an empty cell when it hasn't.
- **Link to record** — make the text a link. The platform's own pattern settles the
  click question: the text navigates, the datatable's edit pencil edits.

Both live in the per-row **Advanced** block of the Studio's column table, shown
only on lookup rows. They are stored inverted — `false` persists, `true` clears the
key — so the saved config carries only explicit opt-outs.

**Polymorphic lookups are refused.** `OwnerId`, `WhoId`, `WhatId` and friends return
several targets from `getReferenceTo()`, and a record picker searches one object.
Apex reports `isPolymorphic` and withholds `referenceTo`; `buildColumns` then forces
the column read-only *even if the column config asked for editing*, and the editor
explains why instead of appearing to ignore the setting.

**Discovery worth remembering:** Apex's `NON_EDITABLE_TYPES` only sets the DEFAULT.
`buildColumns` resolves editability as `attributes.edit ?? (isEditable && defaultEditable)`,
so an explicit `edit` in a column's config overrides it. That is how multi-select
picklists worked before Stage B existed — and it meant a lookup could already be
forced into a free-text box for an 18-character Id. MULTIPICKLIST and REFERENCE have
both been removed from that set now that real editors exist.

**Search, sort and filter follow the displayed name**, not the stored Id. Columns
can carry `fgridTextField` naming the row field that holds the text on screen;
`searchablePaths`, `handleSort` and `filterInputs` all prefer it. This generalises
what `fgridLinkFor` already did for a linked Name column, whose own fieldName holds
a generated URL.

One subtlety in `filterInputs`: the column config is keyed by the real field path
while matching runs against the display field, so it now tracks `configKey` and
`path` separately. Collapsing them back into one value would silently disable
filtering on every lookup column.

This did NOT need the broader label rework. A lookup's display text is already
materialised per row, so pointing at it was a three-line change. Picklists are
different — they display the stored value, so display and search already agree, and
nothing needs doing there.

### 2.2a `fgrid_flowGrid` has no Jest tests at all

Worth stating plainly, because "285 tests passing" reads like coverage and is
misleading. Five components have a `__tests__` folder; the runtime grid — the
largest and most complex component, and the only one holding mutable state — has
none. Every runtime behaviour is currently verified only by browser testing.

The riskiest uncovered path is the §2.6 signature comparison, because its failure
mode is silent destruction of a user's unsaved edits: if `recordSignature` ever
reports a change where the content is identical, edits vanish on an unrelated
re-render. One test asserting "same content, new array identity ⇒ edits survive"
would pin the behaviour that matters most.

Deferred by decision — build first, test later — but this is the gap to close
first when tests come back into scope.

### 2.2 Apex test coverage — CLEARED 2026-08-27

| Class | Was | Now |
| --- | --- | --- |
| `FlowGridColumnService` | 94% | 88% |
| `FlowGridController` | 23% | **95%** |
| `FlowGridFlowService` | 0% | **93%** |
| `FlowGridPreviewService` | 0% | **89%** |
| `FlowGridRecordService` | 0% | **100%** |

59 Apex tests, 100% pass. Every class is at or above the org's 80% floor, so this no
longer blocks packaging. Three new test classes:
`FlowGridFlowServiceTest`, `FlowGridPreviewServiceTest`, `FlowGridRecordServiceTest`.

**`FlowGridFlowService` was the awkward one, as predicted.** Its inputs are metadata,
not data — a test cannot insert a flow. Resolved by splitting the problem:
`resolveLaunchMode` carries the branching that actually matters (which flows Flow Grid
can launch), so it was made `@TestVisible` and is exercised directly and
deterministically across all four process/trigger combinations. The query methods are
called for real and asserted on their contract, then skipped when the org has no
suitable flow — the pattern `FlowGridColumnServiceTest` already used for FLS.

One trap worth recording: the first version of the variables test picked the first
active flow it found, which declared no variables, so the mapping loop never ran and
the test passed while covering nothing. It now searches for a flow that actually
declares variables. **A test that passes is not evidence that it tested anything.**

#### Unreachable code was removed rather than tolerated — 2026-08-27

The first pass left ten uncovered `catch` blocks in the controller and called them
"unreachable by design". Leaving unreachable code is not a design; it also contradicts
the standing rule against error handling for impossible scenarios. So each one was
probed with a throwaway test class to establish reachability with evidence, then either
deleted or covered.

**Probe results, all measured rather than reasoned:**

| Path | Finding | Action |
| --- | --- | --- |
| `getGridMetadata` | `FlowGridColumnService` has no `throw` and no `catch`. A trailing dot, leading dot, doubled dot, four-level path, unknown relationship and dotted object name were all probed: every one returned normally. | catch DELETED |
| `getPreviewRecords` | The service catches around its own query and returns empty. Nothing can escape. | catch DELETED |
| `getFlows` | Throws `System.QueryException` for a minimum-access user. | kept, now COVERED |
| `getFlowVariables` | Same — `System.QueryException`. | kept, now COVERED |
| `getRecordsByIds` | Reachable by design since `fetchRecords` stopped swallowing. | kept, uncovered |
| `runFlow` | Reachable — an unknown flow cannot start. | already covered |

Result: `FlowGridController` 80% -> **95%**, with only lines 180-181 uncovered, and
those are the one catch that has to exist — `fetchRecords` deliberately propagates so
the grid does not mistake a query failure for a deletion. Not deterministically
testable, and correct to keep.

**`FlowGridFlowService` 185, 189-191, 194** stay uncovered: `interview.start()` and the
output-reading loop need an active AUTOLAUNCHED flow to invoke, and the org's
row-action flow is a screen flow, which `Flow.Interview` cannot run. Shipping a
test-only flow to reach five lines is the wrong trade. **The headless row-action path
therefore has no automated coverage at all** — see §1.4, still unchecked in the browser.

**`FlowGridPreviewService` 62, 65** stay too: that swallow is the correct one. A
preview is a convenience, an empty result unambiguously means "fall back to fabricated
rows", and the consequence is cosmetic. It is also precisely why the controller's
wrapper around it was dead.

Org-wide coverage reads 19%, which is unrelated: this dev org holds the vendored kit
and other unofficialSF classes. Per-class is what packaging enforces.

### 2.3 Variable mapping is text, by choice

Variable names are typed rather than picked. Discovery-backed dropdowns were built
and then cut: they read well, but the scaffolding around the mechanism — refresh
button, version-mismatch warnings, stale-mapping flags — outgrew the task, which
is only ever "name two variables".

Discovery still runs at runtime to drop names the flow does not declare, because
the mapping properties carry platform defaults that cannot be removed. See §4.

If this ever wants to become the Screen Action-style list — enumerate the flow's
inputs, toggle each, Missing badges — that needs discovery back in the editor.
`FlowGridController.getFlowVariables` is still there and tested by hand.

### 2.3b A row action that saves its own changes — added 2026-08-27

**The problem, found in the browser.** A headless row action pointed at a flow that
performs its own DML still reported the change through `outputEditedRecords`, so the
calling flow would have saved it a second time. Whether a row-action change is pending
depends entirely on what the launched flow did, and only its author knows.

**The decision: an admin property that gates a verification, not a suppression.**
`rowActionFlowSavesChanges` ("The launched flow saves its own changes") is off by
default, so nothing changed for existing configurations. When it is on, the grid does
NOT simply discard the change — it compares each changed field against the record as
re-read from the database (a query `reconcileRow` already performs) and moves only the
fields that genuinely match. A flow that saves two fields and returns three reports
exactly the one that is still unsaved.

Boolean note: this one defaults OFF, so it needs no negative label or inversion — the
§4 trap only bites a Boolean that must default ON.

**Two overlays now, and the distinction matters.** `_editsByKey` is what the calling
flow should save; `_savedByKey` is what the user sees. A change confirmed present in
the database moves to the second, because the cell must still show it — the collection
the grid was handed is stale by then. `allKnownRecords` applies saved first and pending
second, so a later inline edit of the same field wins. Both are cleared when the source
collection is recalculated (the §2.6 rule).

**Test note worth keeping.** The first version of these tests left the
`getRecordsByIds` mock returning undefined, which the grid correctly read as "the
record was deleted". They passed while asserting nothing about the feature. What the
database returns IS the test here. Second time today that a green test proved nothing —
see also §2.2 on the flow-variables loop.

### 2.3a Actioned Record means CLICKED — decided 2026-08-27

`outputActionedRecord` is a SINGLE record ({T}), not a collection. The collection and
`markActionedRows` both went in `5b92d6a5`; if Flow Builder still offers a collection,
that is a stale component definition in the flow, not the current metadata.

It now publishes on **click**, before either row-action branch, and reports the row
the user acted on regardless of what the action then did: a cancelled flow, a flow
that changed nothing, and a removal refused by the cap all still report. Previously it
waited for an outcome, which made it a second, weaker "edited" — and left the
genuinely useful case (the user clicked, then backed out) reporting nothing at all.

The distinction that matters: **Edited Records is what changed. Actioned Record is
what the user clicked.** They answer different questions and neither substitutes for
the other.

**A collection was added alongside it, 2026-08-27.** `outputActionedRecordIds`
(`String[]`) accumulates the key of every actioned row, in click order, with repeats
collapsed — it records WHICH rows were actioned, not how many clicks. The single
`outputActionedRecord` was deliberately kept: it holds only the most recent click,
which is what makes it useful for reacting to on the same screen and useless for
reporting afterwards. Two questions, two outputs, neither replacing the other.

### 2.4 Resource-capable Boolean properties — DROPPED 2026-08-25

Every checkbox in the editor stores a literal, so none can be bound to
`$GlobalConstant.True` or a Flow formula the way the platform's own Boolean
properties can. This was logged as work because `markActionedRows` needed it —
and that property has since been deleted, so the item lost its only concrete
justification.

Dropped by decision. The limitation is real but nothing currently needs it.
Reinstate if a property turns up that has to take a Flow reference; the shape of
the fix is a control type using the kit's literal-or-resource input, plus runtime
handling for a value that may arrive as either.

---

## 2.5 Parity gaps against the original datatable

Reviewed 2026-08-25 against the baseline's `datatable.js-meta.xml` and its README
release notes. The unofficialsf.com feature page returns 403 to automated
fetching, so the repo was used as the source — it is the authoritative one anyway.

**Property parity is complete.** All 83 non-legacy baseline properties have a
counterpart among Flow Grid's 81. Every gap below is behavioural.

Nothing here is scheduled. Deferred by decision, not oversight.

### Bug

- **`flex` does nothing.** `fgrid_columnConfig` offers a Flex checkbox per column
  and `buildColumns` never reads it — 11 of the 12 offered attributes are
  consumed. The baseline treated fixed-versus-floating column width as a real
  feature. Small fix.

### Missing behaviour, roughly by risk

0. **Record-type-aware picklist values — not implemented.** `recordTypeId` and
   `showAllPicklistValues` are accepted properties that nothing reads.
   `FlowGridColumnService.picklistOptionsOf` returns every *active* value on the
   field, org-wide, so an editable picklist on an object with record types offers
   values the user is not allowed to pick — and saving one produces a validation
   failure at DML time, away from the grid. Fixing it means decoding `validFor`
   bitmaps in Apex; `getPicklistValues` from `uiObjectInfoApi` is the cleaner tool
   but needs one wire per field, which does not work for N dynamic columns.
   Dependent picklists (a controlling field filtering the options) are a separate,
   larger piece and explicitly out of scope.

1. **Timezone offset on Date and Time — REASSESSED 2026-08-27. Mostly not a gap, and
   porting the baseline's fix would have made it worse.**

   This was carried for weeks as the highest-risk gap, on the grounds that the
   baseline adjusts dates by the running user's offset, pins to noon to dodge DST,
   stores `YYYY-MM-DD`, and reapplies the offset on edit — while Flow Grid did none
   of it. The conclusion was wrong, because the two designs are not comparable.

   **The baseline's offsets compensate for its own conversion.** It turns a Date into
   a timestamp on input (`Date.parse(value + "T12:00:00.000Z")` minus the user's
   offset) and therefore has to undo that on output. It even tried `date-local` and
   backed out — the code is still there, commented, at `datatable.js:1311-1314`, with
   a later note about handling `date-local` "like regular date". Flow Grid never does
   that conversion, so there is nothing to compensate for.

   **`date-local` is the platform's own answer.** The component reference describes it
   as `lightning-formatted-date-time` with `day`/`month`/`year` and **no timezone
   conversion**, and the `lightning-formatted-date-time` docs say plainly: "When using
   the component to display a date only, without time, include `time-zone="UTC"` to
   ensure the correct date displays in all time zones." Our Apex already maps
   `DATE → date-local` and `DATETIME → date`, which is exactly that split.

   **Time needs nothing either.** `lightning-formatted-time` documents that "time is
   always displayed in Universal Time" and that offsets are ignored — `14:30+05:00` is
   treated as `14:30` — which is the correct reading of a wall-clock time of day.

   **What is genuinely still unverified:** editing a DATETIME. That column is type
   `date`, which DOES convert to the user's zone for display, so an edit has to return
   to UTC. Worth testing rather than assuming, and it is a much narrower question than
   the gap this entry used to describe. A DATE column, on `date-local`, should
   round-trip untouched.

   Do NOT port the baseline's offset arithmetic without first proving a defect. It
   would introduce the shift it was written to cancel.

   **Implemented 2026-08-27, once the docs settled what the types actually do**
   (`fgrid_gridModel.js`, buildColumns):

   - A DATETIME column now defaults to `year`/`month`/`day`/`hour`/`minute`
     typeAttributes. Without them the component uses a medium **date** format, so a
     Datetime displayed as "Apr 18, 2024" and its time was simply invisible — visible
     in the Created Date column of the org. Defaults, not overrides: an admin's own
     `typeAttribs` still win.
   - A DATE column given `typeAttribs` switches from `date-local` to `date` with
     `timeZone: "UTC"` forced (unless the admin set a timezone deliberately).
     `date-local` **ignores typeAttributes entirely**, so custom formatting has to move
     to `date` — and plain `date` converts a date-only value into the running user's
     zone, which is the one case where the wrong day really can show. Pinning to UTC is
     what the reference prescribes for a date-only value.
   - A plain DATE column stays on `date-local` with no typeAttributes at all. That is
     the no-conversion path and it is the default, so the common case is untouched.

   Five tests in `fgrid_gridModel.test.js` ("date and datetime formatting") cover both
   defaults, both admin overrides, and the UTC pin.

   **VERIFIED 2026-08-27 — the gap is closed.** All three types were edited and saved
   against a debug payload:

   - DATE — saved `"2026-09-03"`, displayed `Sep 3, 2026`. Untouched, as `date-local`
     promises.
   - DATETIME — saved `"2026-09-02T19:45:00.000Z"`, displayed `03:45 PM` in a UTC-4
     user zone. The edit went in as local wall-clock time and came back out as correct
     UTC, with no arithmetic on our side.
   - TIME — saved `"01:00:00.000"`, displayed `1:00:00 AM`.

   This settles it: the offset arithmetic this entry once demanded would have
   introduced a shift into a round-trip that is already correct. Leave it alone.
2. **Multi-currency conversion — accepted and ignored.** `suppressCurrencyConversion`
   exists as a property but nothing implements conversion. The baseline converts
   currency values to the user's currency and supports currency rollup and formula
   fields in multi-currency orgs. Only matters if the target org is multi-currency.
3. ~~**Lookup fields are not links.**~~ **CLOSED 2026-08-25.** Lookup columns now
   show the related record's name and link to it, both as per-column Display
   Options matching the standard datatable, and are editable through a record
   picker. See §2.1 Stage C. Remaining caveat: the name is read off the record, so
   a Flow that never queried the relationship still shows the Id.
4. **Rich text renders as escaped markup.** The baseline ships a dedicated rich
   text cell type; Flow Grid maps TEXTAREA to `text`.
5. **No runtime Clip/Wrap per column.** The baseline lets the user toggle
   wrap/clip from the column header menu at runtime. Flow Grid has only the
   design-time `wrap` attribute.
6. **Percent fields untested.** The baseline documents `.25 = 25%` and locale
   handling, and had repeated bugs here. Display maps PERCENT to the datatable's
   `percent` type, which expects a fraction, so it is probably correct but
   unverified. Editing is where the baseline struggled — relevant when inline
   editing is built.

### Open questions

- **Apex-defined types — DECIDED 2026-08-25: genuine support is needed.** Not an
  open question any more. The baseline treats these as a first-class mode:
  reactivity, editing, and "unable to edit Apex-Defined columns unless Type was
  specified". Flow Grid's user-defined-object mode takes serialized JSON, which
  covers the data shape but is not the same as a Flow Apex-Defined variable.
  Scoped as its own piece of work, to be planned separately — it needs a real
  design pass, not an incremental patch, and it interacts with inline editing
  (which is where the baseline's own Apex-defined support struggled). Sequenced
  after inline editing for that reason.
- **Filters: header actions or a filter row?** The baseline puts Set Filter and
  Clear Filter in each column's header menu. Flow Grid uses a filter row above the
  table — simpler and more discoverable, but a different mental model for anyone
  migrating.
- **Reactive `preSelectedRecords` — DECIDED 2026-08-25: make it reactive.**
  Resolved into the wider "incoming data is authoritative" rule. See §2.6.

### Deliberately not carried over

- **Clipboard copy of attribute strings** — a wizard convenience for the 13
  delimited column strings. Obsolete now that column config is JSON.
- **The `YYYY-MM-DD` search format note** — the baseline had to document it. Flow
  Grid substring-matches raw values and dates arrive as ISO strings, so the same
  format works incidentally. No action, but the constraint is the same.

---

## 2.12 `disableColumnResize` removed — 2026-08-27

Unlike `allowOverflow` (§2.11) this property WORKED — it is a documented pass-through
to `resize-column-disabled`. Removing it was a product decision, not dead-code
cleanup, and reverting is five lines.

The reasoning: it only ever removes capability from the end user. A dragged width is
per-session and non-destructive, nothing in the grid depends on resizing being
off, and the reference notes the table keeps adapting to container width even when the
attribute is set — so it never protected a layout, it only stopped a drag.

Resizing itself stays, along with the `_columnWidths` persistence that makes a dragged
width survive a rebuild (§2.9). If a case for locking columns turns up — a touch
layout where drag handles interfere is the most plausible — this is the property to
reinstate.

### Column widths — six browser configurations tested, 2026-08-27

The full matrix was walked in the org. Per-column **Width was blank in every case**
(the field shows a placeholder of `auto`), which is what the results turn on:

| Auto sizing | Flex | Width | Result |
| --- | --- | --- | --- |
| off | on | blank | columns split the space equally |
| off | off | blank | **identical** to the row above |
| on | on | blank | each column sized to its content |
| on | off | blank | **identical** to the row above |

**Flex is inert without a per-column Width**, confirmed by the two identical pairs. It
is a modifier that picks between `initialWidth` (resizable) and `fixedWidth` (locked),
so with no width there is nothing to pick — and it ships CHECKED on every column, which
made it look as though it were doing the work that the grid-level auto setting was
actually doing.

**Fixed:** the Flex checkbox is now disabled until the column has a width, with the
reason on hover. Same category as §2.11 `allowOverflow` — a control that silently does
nothing — except this one is conditionally meaningful rather than dead, so it is
constrained rather than removed.

**Still untested:** Width set to a number, then Flex toggled. That is the only
configuration that exercises Flex at all, and it would also confirm that removing
"Prevent column resizing" (§2.12) lost nothing, since Flex off IS the per-column lock.

**Auto sizing works in a Flow screen** — verified at runtime, not just in the Studio.
Whether it works inside a Flow SECTION is still open; that is the flex container the
reference warns about.

**Two observations worth keeping:**

- Auto mode sizes a column to its DATA, not its header. `Account Rating` and
  `Employees` both truncated their own labels, because the minimum column width
  defaults to Salesforce's 50px and our Minimum/Maximum fields ship blank. Raising the
  minimum to ~110 should clear it. Whether the component should default to ~100 rather
  than 50 is an open product question — it would change rendering for grids already
  configured with auto sizing on.
- After a manual resize the table can end up NARROWER than its container, leaving dead
  space on the right. This happens in BOTH width modes — an earlier guess that auto
  mode would recalculate and refill was wrong. It is `lightning-datatable`'s own
  behaviour inside its shadow DOM, and not reachable from here.

### Auto column widths — checked against the reference, 2026-08-27

Two things settled while auditing this:

- **The flex caveat in the help text is correct**, and is the reference's own wording:
  "Auto width mode is supported for containers with block display... doesn't fully
  support containers with `display:inline-block` or flex properties."
- **Persisted drag widths do NOT conflict with auto mode**, contrary to what was
  suspected. The reference is explicit: "Specify your own widths for particular columns
  using the `fixedWidth` or `initialWidth` properties. The widths of the columns
  without these properties are calculated based on the width of the content." So the
  §2.9 resize-persistence fix is correct in both modes and needs no special case.

**What is still unverified:** whether auto mode works at all inside a Flow screen
SECTION. Flow lays a section's columns out with flex, which is the container type the
reference says is not fully supported. The help text now says "may not work" rather
than asserting either way. Worth a browser check before anyone relies on it.

## 2.11 `allowOverflow` removed — 2026-08-27

**The property did nothing.** "Allow content to overflow the grid" added a class
setting `overflow: visible`, which is the CSS initial value, to a wrapper whose only
style is an inline `height`. There is no `.grid__wrapper` base rule and no inline
`overflow`, so the class overrode nothing.

It was live once: `wrapperStyle` used to emit `overflow: auto`, and the class beat it.
Removing that inline overflow (to fix the double scrollbar gutter, §2.10) silently
turned the property into dead configuration.

**It could not have worked in any case.** A clipped editor is clipped by
`lightning-datatable`'s OWN scroll container, inside its shadow DOM. Styling our outer
wrapper cannot affect it, so no value of this checkbox could ever have changed a
clipped dropdown.

**And the risk it claimed to mitigate has not appeared.** Every editor type has been
exercised in the browser with the setting off, and none was clipped: picklist and
multi-select (`lightning-combobox`), lookup (`lightning-record-picker`), long text
(textarea, scrolls internally), and the Date popup, which was confirmed working when
date editing was re-enabled. These are base components that own their own overflow —
a combobox repositions its dropdown rather than escaping its container.

If clipping ever does appear, this wrapper is not the lever. The options would be the
datatable's own behaviour, or not giving it a fixed-height scroll container at all —
and the latter conflicts with §2.10, where the fixed height is what makes infinite
scrolling fire and keeps the layout stable between pages.

## 2.10 Performance, row loading, and pagination — 2026-08-27

### The 300-record slowdown

Several seconds before a 300-record grid would respond. Two independent causes.

**Repeated recomputation.** LWC does not memoize getters, and the row pipeline is a
deep chain with eight template entry points — `rows`, `hasRows`, `isFilteredEmpty`,
`showPaginationBar`, `pageSummary`, `isFirstPage`, `isLastPage`, `headerCounts` —
each re-entering from the top. That meant `buildRows` running about nine times per
render over 300 records, `buildColumns` more than ten, each rebuilding
`describeByPath` from scratch. Now memoized per level, keyed on dependency identity,
which works because every mutable piece of state here is replaced rather than mutated.

The `columns` dependency list is long and explicit on purpose: a missing entry would
serve stale columns after a property-panel edit. That is the failure mode memoization
invites, so if a column setting stops taking effect, look there first.

Also hoisted a per-row allocation: `picklistCellOptions` built a `Set` of known
values for every row to answer a per-column question — 300 rows across two picklists
was 600 Sets per pass, times nine passes.

**Rendering every row.** `showPagination` defaulted to false, and with it off the grid
handed the datatable every matched row. The default configuration therefore rendered
300 rows of DOM. Replaced by `rowLoading`.

### Row loading: Scroll or Paginate

`rowLoading` — Scroll (default) or Paginate. There is deliberately no third
"render everything" mode: the standard datatable has none, and it was the old default.

Scroll renders 50 rows and grows by 50 on `loadmore`, synchronously — the records are
already in memory, so it is a rendering window, not a fetch. `enableInfiniteLoading`
switches off once the window covers everything. The window resets on search, filter,
clear, sort, and a genuinely new collection.

**Infinite loading would NOT have fixed the original slowness** and on its own is
slower: it is designed for server-side paging, and all 300 records are already in the
browser. What it fixes is the DOM cost of rendering everything.

`rowLoading` has no default in the contract — it lives in the runtime getter, per §4.
`showPagination` and `showFirstLastButtons` are deprecated and no longer read; both
remain declared only because a referenced property cannot be removed.

### Pagination controls

`c/fgrid_pagination`. SLDS ships no pagination blueprint — verified — and its
button-group blueprint explicitly excludes navigation, so this is the hierarchy's
"custom with hooks" tier: a `nav` landmark with list semantics, every value from a
verified `--slds-g-*` hook so org branding carries through. Zero SLDS linter
violations.

Truncation and page sizes are pure functions in `fgrid_gridModel`, testable without a
DOM:

- **Window of four** consecutive pages, leaning one before and two after — an even
  window cannot centre the current page. Page 1 and the last page are always shown.
- **No truncation at eight pages or fewer.** Not taste: the widest truncated form is
  eight slots (first, ellipsis, four window pages, ellipsis, last), so below nine
  pages truncating hides pages and saves nothing.
- **No ellipsis that hides nothing** — at page 2 the window already follows page 1.
- **Rows per page: 10, 25, 50, 100.** Stops short of list views' 200 because 200 rows
  is the DOM cost scroll mode exists to avoid. Options above `maxNumberOfRows` are
  dropped, since each would yield a single page. The admin's configured size is
  inserted if it is not a step, so a configured 15 stays representable rather than
  silently snapping to another value. Off by default via `showRowsPerPage`.

Numbers are centred with three grid tracks, not flexbox: with flex they drifted as
the summary text changed length between "1–10 of 314" and "311–314 of 314".

### Grid height — DECIDED 2026-08-27: stays fixed

`tableHeight` now always applies, defaulting to 30rem; it was previously only
PLACEHOLDER text, so the field looked populated while nothing was enforced.

Fixed rather than `max-height`, by decision: a stable layout on a page is worth more
than the blank space below a short page. `max-height` would remove the dead space but
move the footer as page contents differ in height. Do not revisit without a reason.

**No `overflow` is emitted.** `lightning-datatable` scrolls itself once its container
has a definite height, so adding `overflow: auto` stacked a second scroll container
outside the first, and the outer one reserved its own scrollbar gutter — visible as
dead space down the right edge beyond the scrollbar. Removing it also dissolved the
conflict with `allowOverflow` — and, unnoticed at the time, made that property a
no-op, since it set `overflow: visible` (the CSS default) on a wrapper that no longer
declares any overflow. `allowOverflow` was removed 2026-08-27; see §2.11.

---

## 2.9 Reviewed against the lightning-datatable reference — 2026-08-26

Read the component reference against what was built. Three defects found and fixed,
`flex` finally implemented, wrapping realigned, and the unused attributes wired.

### Defects fixed

- **Date editing: REVERSED 2026-08-27. Dates ARE editable.**
  On 2026-08-26 DATE/DATETIME/TIME were added to `NON_EDITABLE_TYPES` on the strength
  of a line in the component reference: *"Inline editing is not supported for date and
  location fields."* That line is wrong, or at least stale — the date picker opens, the
  edit commits, and the grid shows the new value. Removed again.

  The lesson is the mistake, not the line: a documentation statement was treated as
  authoritative over testable behaviour, and a working feature was blocked as a
  result. Where the two disagree, test.

  **Audit fields need no list of their own.** Verified by describe in the org rather
  than assumed: `CreatedDate`, `LastModifiedDate`, `SystemModstamp`, `CreatedById`,
  `LastModifiedById` and `Id` all report `isUpdateable() == false`, which `isEditable`
  already honours — and since the veto below, a config tick cannot override that.
  The same check exposed `SLAExpirationDate__c` as `updateable=true` but blocked by
  the DATE entry, which is what proved the entry wrong.

  **CAUTION — functional but not yet safe.** Flow Grid still does not apply the
  running user's timezone offset (§2.5 gap 1), which is exactly where the component
  this replaces had repeated bugs. An edited date near midnight can save a day out.
  That gap matters more now that date editing is reachable.

- **A column config could override the describe and force a broken editor.**
  Fixed 2026-08-27. Adding types to that set only
  moves the DEFAULT — `buildColumns` resolved editability as
  `attributes.edit ?? (isEditable && defaultEditable)`, so an explicit tick still
  overrode it and still produced a broken cell. Found when a record Id column
  rendered a working text box over an 18-character key.

  The config now OPTS IN and the describe can VETO: `resolveEditable` refuses any
  field Salesforce reports as non-editable, whatever the column config says. That
  covers record Ids, formulas, auto-numbers, compound Address and Location fields,
  polymorphic lookups, and the date types. Absent a describe — a user-defined object,
  or the Studio preview before Apex answers — the config is still trusted, because
  there is nothing to check it against.

  The override existed only because MULTIPICKLIST and REFERENCE were once in that set
  and needed forcing past. Both have real editors now, so nothing legitimately needs
  to overrule the describe.
- **The `errors` attribute was unused.** Every failure was a banner above the grid,
  which cannot say WHICH row failed. `tableErrors` now attributes a failed row-action
  flow to its own row, and a describe failure to the table.
- **No `aria-label` on the datatable.** A screen reader announced an unlabelled grid.
  Now named from `tableLabel`, falling back to the object's plural label.

### `flex` implemented

Offered since the beginning and never read. The reference explains the model:

| | Resizable | Notes |
| --- | --- | --- |
| `initialWidth` | yes | a starting width the user can drag |
| `fixedWidth` | no | exact, and overrides `initialWidth` |

So a width with **Flex on** is a starting point; **Flex off** locks it. Behaviour
change: a width set before this shipped was resizable and is now locked.

**What Flex means — revised 2026-08-27, and NOT yet confirmed in a browser.**

Be careful with the confidence levels here, because they differ:

- **OBSERVED.** Flex on and Flex off produce identical tables while Width is blank, in
  both width modes. Four browser configurations.
- **LITERAL CODE.** We assign `initialWidth` when Flex is on and `fixedWidth` when it
  is off. The baseline assigns `initialWidth` in both cases, zeroing the width when
  flexed (`datatable.js` `setWidth`: `flex_checked ? 0 : sizes[colNum]`); it never uses
  `fixedWidth` at all.
- **DOC-DERIVED, UNVERIFIED.** That `initialWidth` reflows when the window or container
  changes while `fixedWidth` does not. The reference says "`fixedWidth` ... makes the
  column non-resizable" and "the columns automatically resize... when the browser window
  is resized", but nobody has watched it happen here.

That last bullet is the load-bearing claim, and everything below rests on it. Treat the
table as a hypothesis until the browser test at the end of this entry is run.

**This is NOT the baseline semantic** — that part IS certain, being a direct reading of
the baseline source — and the earlier claim here that it was "exactly what the checkbox
was always describing" was wrong. The baseline zeroes the width when
flexed (`datatable.js` `setWidth`: `flex_checked ? 0 : sizes[colNum]`) and assigns
`initialWidth` in BOTH cases — it never uses `fixedWidth`, so both of its states still
reflow. Its Flex only decides whether a starting width exists. It needed that escape
hatch because its Config Mode wizard measures and stores a width for EVERY column;
our editor leaves Width blank unless an admin types a number.

| Intent | Baseline | Flow Grid |
| --- | --- | --- |
| No pinned width, share space, reflow | Flex on | Width blank |
| Starting width, still reflows | Flex off | Width + Flex on |
| Exact width, frozen | not available | Width + Flex off |

Ours is a superset: the baseline forces a choice between a starting width and flexing,
we allow both, plus a true freeze it never offered. The name is right; only the
explanation was wrong, so the label stays and the hover text now says what it does.

**THE TEST THAT SETTLES IT:** two columns at Width 300, one Flex on and one off, then
narrow the browser window. If the Flex-on column moves and the Flex-off one holds at
exactly 300, the model above is right. If both move, `fixedWidth` is not behaving as
documented and the label and hover text need rethinking again. If neither moves,
`initialWidth` is being treated as fixed and Flex does nothing even with a width — in
which case it should be removed, not relabelled.

### Wrapping is on by default

Clipping hides data behind an ellipsis; wrapping reads better. `wrapText` is now
`attributes.wrap !== false`, so the config stores only explicit opt-outs.

Two things this had to respect:

- **Not every type can wrap.** The reference excludes `action`, `boolean`, `button`,
  `button-icon`, `date-local` and row numbers. `wrapText` is not set on those at all,
  so Wrap no longer appears to do something it cannot. DATE maps to `date-local`.
- **Our own custom cells were forcing a clip.** The picklist, multi-picklist and
  lookup display templates each wrapped their value in `slds-truncate`, which
  overrode whatever the standard cell layout wanted. Removed.

It also closes parity gap §2.5.5 for free: the datatable supplies Wrap text / Clip
text in the header menu natively, so runtime per-column control was never missing —
only `hideHeaderActions` suppresses it.

### Long text — editable via a textarea cell, 2026-08-27

`Description` came back from describe as `updateable=true` but `ourIsEditable=false`:
blocked by a rule refusing every non-sortable `TEXTAREA`. Third instance of the same
mistake in two days — refusing a field the platform allows.

Half-right, though. The datatable has no `textarea` cell type, so simply unblocking
it would give a SINGLE-LINE input over a 32,000-character field, flattening every
newline and saving it back that way. Silent data loss on a field whose purpose is
multi-line content.

`fgridLongText` is a fourth custom cell type: `lightning-textarea` as the edit
template, `maxLength` from the field's own describe rather than a guess. Applied only
when the column is editable, like the picklist cells — read-only it is
indistinguishable from text.

**Time renders through `lightning-formatted-time`.** An earlier version of this cell
hand-rolled `Intl.DateTimeFormat` on the belief that no such component existed. It
does. Its documented behaviour — locale formatting, always UTC, offsets ignored — is
exactly what a Time field needs, so the helper, its row field and its tests were all
deleted rather than maintained.

**Rich text stays read-only.** `isHtmlFormatted()` separates the two: Long Text Area
and Rich Text both present as non-sortable `TEXTAREA`, but rich text stores HTML and a
plain textarea would show and re-save raw markup. Blocked until §2.5 gap 4 has a real
editor.

**On the three SLDS warnings this raised.** 22rem, 6rem and an existing 12rem have no
hook equivalent. Rather than keep literals or delete the constraints, each was nudged
to the nearest step on the SLDS sizing scale — 20rem, 5rem, 10rem. Deleting a
constraint to satisfy the linter is what previously let the rows per page control
stretch across an entire grid track; the scale exists so sizes stay consistent, and
using it is better than either extreme.

### Attributes now wired

`column-widths-mode` (with min/max), `resize-column-disabled`, `wrap-table-header`,
`wrap-text-max-lines`, `single-row-selection-mode`, `errors`, `aria-label`,
`displayReadOnlyIcon`, `columnKey`, `step`, `linkify`, plus `onresize` and
`scrollToTop()`.

Two worth calling out:

- **`onresize` now persists dragged widths.** `columns` is rebuilt on every render,
  which resets the datatable's internal width state, so a resize was previously lost
  the moment anything else changed — paging, sorting, a filter. Dragged widths are
  kept by `columnKey` and re-applied as `initialWidth`, dropping any `fixedWidth` so
  a column the user has already dragged stays draggable.
- **`scrollToTop()` fires after a page change.** Moving to page two used to leave the
  viewport mid-table.
- **`wrapTextMaxLines` is table-level, not per column.** It had been offered as a
  per-column `otherAttribs` example, where it did nothing.

### Deliberately not done

- **`disabled-rows` — BUILT 2026-08-26** as a **Disabled records** collection input,
  sitting under Pre-selected records and mirroring it (with a JSON variant for the
  user-defined-object mode). Briefly declined, then reinstated once the real use case
  was named: `Status = Pending`. The Flow decides what unavailable means and passes
  the collection; SLDS greys the rows.

  This is the case the earlier decline got wrong. Filtering ineligible records out
  upstream hides them, and a user then wonders where a record went; greying it says
  why it is not on offer. Rows are matched by the key field, so no new plumbing.

  Unlike `preSelectedRecords` this needs no accessor: it is not user-mutable, so
  there is no local state for an incoming value to fight over. Worth knowing from the
  reference: a row that is both disabled and preselected still counts toward the
  selection limit.
- **`enable-infinite-loading`** is an alternative to pagination, not an addition;
  adopting it means choosing between the two.
- **Column-level `iconName`** (a header icon, distinct from `cellAttributes.iconName`
  which decorates every cell) is left alone by decision — revisit alongside column
  properties. Note this corrects an earlier claim in §2.8 that the datatable has no
  header-icon API: it does, and a filtered-column header marker is therefore
  possible. Pills remain the chosen reporting mechanism.
- Our column config's "Column icon" maps to `cellAttributes.iconName`, so it marks
  every CELL, not the header. The label implies otherwise. Unresolved.

---

## 2.8 Filters: header menu, operators, and pills

Rebuilt twice on 2026-08-25. The first attempt was a collapsible panel holding one
control per filterable column; it was rejected as a design and is gone
(`fgrid_filterPanel` deleted from the repo and the org). What shipped follows list
views and report builder instead.

**Entry point: the column's own header menu.** `column.actions` adds a "Filter…"
item and `onheaderaction` reports which column it came from. Native, costs no
horizontal space — which is the binding constraint in an Experience Cloud column —
and it is the only per-column affordance `lightning-datatable` actually offers.
There is no header-icon API; taking over the header would mean rebuilding column
resizing and the sort affordance by hand.

**Editor: `c/fgrid_filterEditor`, a narrow modal.** Operator plus Value — no Field
picker, because the column you opened the menu on IS the field. A popover anchored
to a header cell is not something the datatable supports, and hand-positioning one
inside a scrolling table lands in the same stacking trap as §3.2.

**Reporting: pills above the table.** This is the half of the feature that was
missing before. Each active filter renders as `Industry is one of Apparel ×`; the
label reopens its editor, the × removes it, and Clear all removes everything. Pills
wrap onto further lines rather than growing sideways. Without them a filter set from
a header menu is invisible the moment the menu closes.

Operators by kind, from `operatorsFor`:

| Kind | Fields | Operators |
| --- | --- | --- |
| text | text, email, phone, url, lookup | equals, not equal to, contains, does not contain, starts with |
| picklist | picklist, multi-select | is one of, is none of |
| number | Currency, Number, Percent | equals, not equal to, <, >, ≤, ≥ |
| date | Date, Datetime | the six comparisons, plus is today / this week / last 30 days / this year |
| boolean | Checkbox | equals True or False |

Plus **is blank / is not blank on every kind except boolean** — a Salesforce
checkbox is never null, so an "is blank" there could never match, and offering it
would be a lie. That is the one deliberate departure from "blanks on every type".

Decisions worth keeping:

- **One filter per column.** The header action edits that column's single filter and
  each column contributes at most one pill.
- **Picklist values combine with OR** ("is one of"); different columns combine with
  AND. `is none of` inverts the whole match, so a row holding any excluded value is
  dropped.
- **Dates compare on the date part only**, so a Datetime at 23:45 still counts as
  that day. A raw string comparison pushes it into the next one — there is a test
  pinning exactly this.
- **Relative dates are operators**, not a separate control, and they carry the
  `{ from, to }` they resolved to when chosen. `filterRows` therefore never consults
  the clock and the range cannot shift under the user mid-session. `resolveDatePreset`
  takes `today` as an argument so it is testable without freezing time.
- **Blankness is judged before type handling**, so every kind agrees on what empty
  means, and every value-bearing operator excludes blank rows — including negated
  ones, where "not equal to X" on an empty field would otherwise match.
- **Apply is disabled** rather than saving a filter with no value.
- **A bare string is still accepted** as a `contains` text filter, so a value stored
  before filters carried operators keeps working.

**Filtering and editing on the same column was never a real limitation** here. That
was an artifact of the old table putting filters in the header menu *in place of*
other actions; they are independent column attributes in Flow Grid.

**The Studio preview filters for real** (2026-08-26). It gets `filterActions: true`,
its own `_previewFilters`, the same `fgrid_filterEditor`, and its own pill bar.

Filtering is offered in the preview even though editing is not, and the asymmetry is
deliberate: filtering needs no writable data, it is the only way an admin can confirm
from the preview which columns they actually marked filterable, and the preview holds
real sample records so the result is the real behaviour rather than dead chrome. The
search box stays inert because searching a six-row sample demonstrates nothing.

The column descriptors are built the same way as the runtime's — including the
`fieldName` / `configKey` / `path` distinction — so the operators and value controls
an admin sees in the Studio are the ones that appear at runtime.

---

## 2.7 Search: word mode vs phrase mode

New property `searchEachWord`, added 2026-08-25. Default ON, shown under Search
only when a search bar is enabled.

**Word mode (on).** The term is split on whitespace and every word must appear in
at least one searchable field, in any column and in any order.

**Phrase mode (off).** The whole term must appear within a single column — the
behaviour before this existed.

The reason word mode is the default: a Contact grid showing FirstName and LastName
as separate columns can never find "Chris Smith" in phrase mode, because that
string is in no single field. Word mode finds it, and a single Full Name column
still matches too, since both words are found within that one field.

A single-word search is identical in both modes. Word mode's tradeoff is that words
may match across different columns, so "Chris Smith" also matches a row whose
FirstName is Chris and whose Company is "Smith Ltd" — normal for a search box, and
the filter row still gives per-column precision. That is what the setting is for.

Pinned by tests in `fgrid_gridModel.test.js`: both modes, both name shapes, word
order, blank terms, and that single-word behaviour did not change.

**Note on the property name.** The stored property is `searchWholePhrase`, not
`searchEachWord`, and it defaults false. Word mode has to be the *absence* of a
stored value, because Flow Builder drops a `false` Boolean and a defaults-on setting
therefore cannot be stored positively — see §4. The editor still shows one positive
checkbox labelled "Search across columns" and inverts it.

---

## 2.6 Incoming data is authoritative — DECIDED 2026-08-25

Agreed rule, wider than the `preSelectedRecords` question that prompted it:

> The record collection feeding the table comes from somewhere upstream. If that
> collection changes, the table updates. **Unsaved changes in the table are
> discarded.** No on-screen warning — the behaviour is documented in the help text
> of the input property.

So on a genuine change to the incoming collection: rebuild the rows, reapply the
preselection over whatever the user had selected, and drop the unsaved inline-edit
overlay (`_editsByKey`). Upstream wins.

**"Genuine" means the content differs, not the array identity.** This is the one
place the implementation must not take the rule literally. Flow reassigns
collection arrays on virtually every re-render, so keying off identity would
discard a user's in-progress edits on unrelated screen activity — which is the
opposite of the intent. Compare a content signature.

Empty vs unset are different: `[]` for `preSelectedRecords` is a deliberate
instruction to deselect everything; `undefined`/`null` means "no opinion, leave
the selection alone", so a flow that ignores the property never disturbs it.

**Bug this also fixes.** `applyPreSelection` currently guards with
`if (this._selectedKeys.length) return` — that asks "is anything selected right
now", not "have I seeded already". A user who deselects everything gets the
preselection silently restored the next time the collection is reassigned. The
signature check replaces that guard.

Sequenced with inline editing, because the overlay being discarded is the thing
inline editing builds.

---

## 3. Known issues

### 3.1 Combobox option padding

The flow picker's dropdown has a left gutter that `lightning-combobox` reserves
for its selected-check icon, inside its shadow DOM. A styling hook
(`--slds-c-listbox-option-spacing-inline-start`) is set but base components do not
guarantee honouring it. If it still looks indented, the fix is a custom listbox
rather than `lightning-combobox`.

### 3.2 Grid Studio modal — canvas bleed-through — STILL OPEN, PARKED

Three attempts have failed. Stacking is not the lever, and neither was backdrop
translucency.

Measured in Flow Builder with a shadow-piercing walk over both DOM branches: the
Studio resolves to `z-index: 1000000` and the canvas's selected-component
highlight (`.highlight.selected`) to `5`, both positioned inside the *same*
stacking context — the one created by Flow Builder's transformed
`.slds-modal__container` — with no intervening stacking context on either branch.
The modal already won the paint order outright. That is why two earlier attempts,
an explicit `z-index` and then host elevation via `setPopoverHostActive`, only
moved the symptom around: neither was the lever.

Attempt three targeted the Studio's own backdrop: `.studio` carried
`background-color: rgba(8, 7, 7, 0.16)`, a 16%-opaque wash over the whole modal
box, which at 84% transparent showed the canvas behind it by design. Making it
opaque (`#e5e5e5`) **did not fix the bleed** — so translucency was not the cause
either, and something is genuinely painting above the modal in a way the
measurement above does not account for.

The opaque backdrop is kept regardless: harmless, it removes the double-shade
that used to arise from Flow Builder's own 0.8 dim compounding with this one
(previously logged separately as §3.3), and it eliminates one variable.

**Next step, when this is picked up again.** Stop theorising about stacking. The
measurement says the canvas highlight cannot paint above the modal, so the
bleeding element is probably not `.highlight.selected` at all. Identify it
directly — reproduce the bleed, then hit-test the visible pixels
(`document.elementFromPoint` at the chip's coordinates, walking shadow roots) to
name the element rather than assuming it. The documented fallback, if it resists,
is sizing the Studio so it never overlaps the canvas column.

Failed so far: explicit `z-index`; host elevation via the kit's
`setPopoverHostActive`; opaque backdrop.

---

## 4. Things that will bite during testing

- **Deploying an LWC while Flow Builder is open produces a phantom "Something went
  wrong".** The open page keeps the module graph it loaded. If a deploy adds a new
  component or changes another's exports, the next re-render that touches them
  fails and Flow Builder's error boundary fires — with the generic "check your
  component configuration for invalid values" message, which points at the wrong
  thing entirely. It survives until a hard refresh, and it is not a defect.
  Observed 2026-08-25 while selecting a multi-select picklist field, right after
  `fgrid_customDatatable` was deployed for the first time. Hard-refresh after every
  deploy before trusting an error.

- **`FlowGrid_Smoke_Test` is no longer in the repo.** Removed 2026-08-27. It was only
  ever a snapshot for version control, never a deployable artifact: it contains the
  ORIGINAL datatable element for side-by-side comparison, whose `official` parameter
  fails validation on the way back in, so it broke any whole-package deploy.

  ```
  official (Screen Component) - The value in "official" is either missing or
  contains multiple fields. Enter a single value.
  ```

  The flow still exists and is maintained IN THE ORG, which is where it is edited and
  where §1.1 and §1.3 expect to find it. Nothing was deleted from the org — only the
  stale file. `flowgrid/force-app` now deploys as a whole.
- **A draft flow cannot be launched.** The row-action picker only lists active
  flows for this reason. `FlowGrid_Edit_Account` is deployed Active.
- **Relationship columns need the Flow to query them.** Flow's "automatically
  store all fields" covers direct fields only, so `Owner.Alias` renders blank
  unless the Get Records element selected it explicitly. Not a grid bug.
- **Autolaunched flows run in system context** by default, ignoring the running
  user's object and field permissions. That is the flow's own configuration, and
  a row action makes it easy to hand a user a button that does more than their
  profile allows.
- **Contract changes are blocked by flows that use the component.** An output
  property cannot be deleted, and an input default cannot be changed, while any
  flow version references the component — including inactive drafts, and versions
  accumulate. `sf project deploy` with a destructive manifest fails on Flow and
  FlowDefinition with "insufficient access rights on cross-reference id"; deleting
  each version by id through the Tooling API works:
  `sf data delete record --use-tooling-api -s Flow -i <versionId>`. Version ids
  come from `SELECT Id, VersionNumber, Definition.DeveloperName FROM Flow`.
  Also note LWC requires every property in `targetConfigs` to have a matching
  `@api`, so the contract and the JS have to change together.
- **Flow Builder does not persist a `false` Boolean input parameter. It drops it.**
  The most expensive thing in this file: four attempts, three wrong diagnoses.
  Verified, not inferred — reading a saved flow's element with
  `SELECT Metadata FROM Flow` via the Tooling API showed only
  `showHeader/showSearchBar/showRecordCount/showSelectedCount/showPagination`, all
  `true`, and **no `false` anywhere in the flow**. Confirmed fixed 2026-08-25.

  The consequence: **a setting that must default ON cannot be stored positively.**
  The editor writes `false`, nothing is stored, and on reopen the absence reads back
  as the default — so the checkbox is uncheckable. No editor-side fix can help;
  removing `default="true"` from the contract does not help either.

  Why it looked like one broken checkbox: every other Boolean defaults **false**, so
  for them "not stored" and "false" render identically. They were equally
  unpersisted, just invisibly. `showBorder` was simply the only defaults-on Boolean
  in the Table Display section.

  **The fix is to store the negative.** `hideBorder`, `hideNameFieldLink`,
  `hideNoneOption` and `searchWholePhrase` replaced their positive counterparts on
  2026-08-25. The editor keeps the positive label and inverts on read and write via
  `invert: true` in `fgrid_propertySchema`, so nothing changed for the admin. This is
  the same reason `hideHeaderActions`, `hideClearSelectionButton`,
  `suppressBottomBar` and `suppressCurrencyConversion` were already framed
  negatively — the pattern was there, it just was not understood as load-bearing.

  **Rule for any new Boolean: if it should default ON, name it negatively, and give
  it a negative LABEL too.**

  That second half was learned the hard way. Renaming the properties was necessary
  but not sufficient: the first version kept positive labels ("Show a border around
  the grid") and inverted for display with an `invert: true` flag in the schema. It
  did not work, and it re-created the original bug — `dataset.invert` is a string,
  so when the attribute did not render, `inverted` evaluated false and unchecking
  published `false` all over again. The inversion layer was deleted.

  The shape that works is the plainest one, identical to `showRecordCount`:
  `Boolean` with `default="false"` in the contract, `@api hideX = false` at runtime,
  a plain checkbox descriptor, no `DEFAULTS` entry, and a label that states the
  negative. No display translation anywhere. `hideHeaderActions`,
  `hideClearSelectionButton`, `suppressBottomBar` and `suppressCurrencyConversion`
  had always been this shape, which is why they always worked.

  Accepted consequence: a defaults-on setting cannot show a positive label. Current
  labels are "Do not link the Name field", "Hide --None-- in editable picklists" and
  "Limit search to a single column", all confirmed 2026-08-26.
- **The grid draws no border of its own.** `showBorder`/`hideBorder` and its CSS were
  removed entirely on 2026-08-26: the standard datatable does not offer it, and SLDS
  handles the table's own edges. The property left a faint outline visible at the
  grid's corners. Removing it from `targetConfigs` deployed cleanly with the smoke
  test flow in place, because no flow had ever stored the property — no flow version
  deletion was needed.
- **Property defaults cannot be removed once a flow references them.** Salesforce
  refuses to drop a default that an existing flow version uses — an empty string
  counts as removal, and flow versions are immutable. The removals above deployed
  cleanly only because no flow referenced those properties at the time. If this
  bites, delete the blocking flow versions by id through the Tooling API (see
  below).
- **The grid re-reads the actioned row after every flow action.** One query does
  three jobs: a record that has gone means the flow deleted it, a record returned
  when the flow handed nothing back supplies the refresh, and a record returned
  when the flow *did* hand something back is ignored — the flow's version may be
  an unsaved edit, and the database would overwrite it with stale values. This is
  what lets a flow take only the record Id, do its own DML, and still have the
  table reflect it.
- **Nothing is saved unless a flow does DML.** A screen or autolaunched flow's
  SObject variable is an in-memory value: editing `record.Name` changes the
  variable, not the database. Only a record-triggered before-save flow persists
  `$Record` implicitly. Flow Grid never writes either — it updates its working
  collection and publishes it — so an edit shows in the grid and vanishes on
  reload unless something commits it. Either give the launched flow its own
  Update Records, or add one to the calling flow fed from `outputEditedRecords`
  (only what changed) or `outputRemainingRecords` (the whole working set with
  edits applied). Do not do both, or the record is updated twice.
- **`fToggleChange` is not needed.** The grid owns its collection, so there is no
  reactive round-trip to force and no custom checkbox field required on your
  objects. The one real gap is DML the flow performs without returning the
  record — the grid cannot see database writes. Either have the flow return the
  record, or ask for a refetch-after-flow option.
- **Jest worker segfaults** intermittently on Node 24. `--runInBand` is reliable;
  the kit pins Node >= 22.12 if it becomes noisy.

---

## 5. Where things live

```
flowgrid/force-app/main/default/
  classes/     FlowGridController + Column/Preview/Flow/Record services
  flows/       FlowGrid_Edit_Account (screen), FlowGrid_Set_Rating (autolaunched)
  lwc/
    fgrid_flowGrid           runtime grid
    fgrid_flowGridEditor     the CPE, only writer to Flow Builder
    fgrid_flowGridStudio     two-pane modal with live preview
    fgrid_propertySchema     every control defined once
    fgrid_propertyControls   renders a section; used by panel and Studio
    fgrid_flowActionConfig   flow + variable discovery
    fgrid_columnConfig       per-column attributes
    fgrid_iconPicker         SLDS icon picker
    fgrid_gridModel          columns, rows, sort/search/filter/paginate
  permissionsets/            FlowGrid_Apex_Execute
vendor/flow-config-editor-kit/   pinned at 6443e41, unmodified
```

`npm run verify` runs Prettier, ESLint and Jest.
