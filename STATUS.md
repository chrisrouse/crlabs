# Flow Grid — status and what's left

Branch `feature/flow-grid`. Everything below is deployed to the **Preview Org**
(`chris-b4pw@force.com`). The branch is committed but **not pushed** — around twenty
commits are local only.

Local checks: **411 Jest tests**, ESLint and Prettier clean, zero SLDS linter
violations, full-package deploy succeeds.

---

## 1. Browser testing — most of it is done

This section opened as "nothing has been tested in a browser". That is long out of
date: every feature has now been exercised at least once in the org, and several were
fixed as a direct result. What remains is listed in §1.6, which is the honest short list
— the unticked boxes below it are a mix of genuinely open items and ones verified in
passing without being recorded.

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
- [x] **Pagination verified 2026-08-27**, including changing rows per page in both
      directions and switching pages. Selection survives all of it, and scroll mode
      too.
- [x] **Sorting verified 2026-08-27**, including the linked Name column: it orders by
      name rather than by the generated URL, inverts on a second click, and reports
      `Name` to the flow rather than `Name__fgridUrl`. Inverting needed the columnKey
      fix in §1.4a — before it, a grid could only sort ascending.
- [x] **Show Blanks First** verified the same day. A header-menu action on any sortable
      column; blanks group at one end rather than sorting, so reversing does not
      scatter them.
- [x] **Selection verified 2026-08-27**, and it survives paging, changing rows per
      page in either direction, and scrolling. Two bugs were fixed to get there, and
      the second only appeared once the first was gone:

      1. `handleRowSelection` replaced the whole selection with what the datatable
         reported, and the datatable only knows the rows it renders — so paging away
         discarded everything picked elsewhere. Only the visible rows are reconciled
         now.
      2. The count was then right while the CHECKBOX was not. `selected-rows` returned
         the full key set, whose array identity does not change when the page does, so
         the datatable — having rebuilt its selection for the new data — was never
         handed the prop again. It is now filtered to the visible rows and memoized on
         `rows`, so the identity changes with the page.

      **Maximum selection across pages — confirmed broken, then fixed 2026-08-27.** It
      did allow three more on page two. The cap is now enforced in
      `handleRowSelection` rather than delegated to the datatable, which is handed
      only the keys for rows it can see and therefore counts one page at a time.

      Already-selected rows keep their place and only newly ticked ones are refused,
      so hitting the limit does not reshuffle what the user already had.

      **Then closed the door properly.** Refusing a click after the fact meant the
      checkbox ticked and un-ticked, and on the current page the datatable greyed the
      remaining boxes while leaving them live on every other page — the same ceiling
      behaving two different ways. At the maximum, every unselected row now goes into
      `disabled-rows`, which is the platform's own mechanism for "cannot change this
      row's selection" and works on any page. Deselecting frees a slot and they
      re-enable, because `disabledRows` is derived rather than stored.

      The message is derived too, so it appears the moment the maximum is reached
      rather than only when a click is refused: the rows stop responding at that point,
      and the reason may be a selection on a page the user cannot see.

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

  **The same trap caught SORTING on 2026-08-27.** Once a column carries a `columnKey`,
  the datatable identifies it by that everywhere, and `sorted-by` has to be echoed back
  as the columnKey. Feeding it the fieldName meant the table never recognised the
  column as sorted, so it refused to flip — the second click emitted NO event at all
  and a grid could only ever sort ascending. Found by console probe after three wrong
  guesses from static reading; the event detail carries both `fieldName` and
  `columnKey`, which is what gave it away.

  **The rule: any per-column state the datatable round-trips belongs to `columnKey`,
  not `fieldName`, once `columnKey` exists.** That is drafts, sort, and column widths
  so far. Check `handleHeaderAction` if a fourth turns up — it still matches on
  fieldName, which happens to work today.

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
- [x] **A cell edited back to its original value does not register.** Fixed and
      verified 2026-08-27. The comparison ran against `allKnownRecords`, which already
      has pending edits applied, so it asked "is this different from what I last typed"
      rather than "different from what we started with" — putting the original value
      back counted as another change and the record stayed flagged for good. Now
      measured against a baseline of the source record plus the saved overlay, and a
      record with nothing left differing drops out of `_editsByKey` entirely.

      Surfaced by auto-save, where every cell exit commits, but the Save path had it
      too.
- [x] **`editedCount` reflects inline edits.** Verified 2026-08-27 alongside the
      revert fix, which turns on that count being right.
- [x] **Cancel discards without touching the working collection.** Verified
      2026-08-27, including the layered case that actually proves it:
      null -> edit -> Save -> edit again -> Cancel restores the **saved** value, not
      the original null. Cancel reverts to whatever `_editsByKey` last committed
      rather than to the source record, which is the distinction that would have
      silently thrown away a committed edit had it been wrong.
- [x] **`navigateNextOnSave` advances the screen on Save.** Verified 2026-08-27.
- [x] **`autoSaveEdits` commits without buttons and does NOT advance.** Verified the
      same day. The two are mutually exclusive by design — auto-save leaves nothing
      pending, so there is no Save event for Navigate Next to react to, and the editor
      greys it out while auto-save is on.
- [x] **Inverted by decision 2026-08-27, not tested.** A stored value that is no longer
      active is NOT offered — matching a record page, where changing away from it is
      one-way unless the user cancels. See the picklist section.
- [x] **`suppressBottomBar` REMOVED 2026-08-27** rather than tested. Two reasons, and
      the second is decisive. It was probably broken: `onsave` is the only path that
      calls `upsertRecord`, so hiding the Save button would have left every edit as a
      draft that never reached `outputEditedRecords`, and the help text promised the
      opposite ("edits apply as soon as the user leaves the cell"). And the reference
      forbids it outright — "The table-level errors require the table bottom bar to be
      present. Don't include the attribute `suppress-bottom-bar`" — so the setting
      silently disabled the error reporting `tableErrors` exists to provide.
      `navigateNextOnSave` also fired from the same handler, so hiding the bar broke
      that too: one checkbox quietly disabling three things.

      **Replaced by `autoSaveEdits` the same day**, which keeps the useful half. Each
      edit commits as the user leaves the cell, so nothing is ever pending and the
      Cancel and Save buttons never appear — not hidden, simply unnecessary. The bar
      itself remains, so table-level errors keep somewhere to go. Labelled "Hide the
      Cancel/Save Buttons" because that is what an admin sees happen; the help text
      carries the part the label cannot, that there is no undo.

      `navigateNextOnSave` is greyed while it is on, for the same reason as before:
      no Save event to react to. Auto-save takes its own path through
      `handleCellChange`, so it needs the same columnKey translation the Save path
      does — covered by a test, because that bug was expensive the first time.
- [ ] Recalculate the incoming collection mid-edit and confirm unsaved edits are
      discarded — the §2.6 rule

### 1.4b Runtime — disabled rows

- [x] **Disabled records greys the matching rows and blocks selection.** Verified
      2026-08-26 with a Collection Filter output (`Status`-style filter on Industry =
      Energy) wired to Disabled records: rows 6, 9 and 10 rendered with greyed radio
      buttons while row 5 stayed selectable.
      This verifies the kit patch end to end as well — the Collection Filter output is
      not merely visible in the picker, it is consumed as a real input at runtime.
- [x] **Answered by the reference, 2026-08-27: it does NOT.** "Use the `disabled-rows`
      attribute to prevent users from changing the **selection status** of specified
      rows." Selection only — a disabled row can still be inline-edited and its row
      action still fires. An earlier note here guessed otherwise from the phrase
      "cannot modify"; that was wrong. See the decision below.

#### Disabled rows stay editable and actionable — DECIDED 2026-08-27

Two options were proposed and both declined: "Prevent editing disabled records" and
"Prevent row actions on disabled records".

The row-action half was clean — `button` and `button-icon` both accept `disabled` as a
typeAttribute, which resolves per row via `{ fieldName }`, so the control would render
greyed and genuinely refuse the click.

The editing half was not. `editable` is per COLUMN with no per-row override, so the
pencil would still appear on a disabled row and the only enforcement point is the
commit: drop the draft and flag the row through `errors`. That is "you may start the
edit and it will be refused", not "you cannot start it". Declined on that basis rather
than shipping half a guarantee, and the row-action option went with it rather than
leaving a partial story.

Reinstating either means accepting that ceiling; the platform is unlikely to move.

### 1.5 Runtime — Remove row action

- [x] **Remove verified end to end, 2026-08-27.** `rowActionType` set to Remove, the
      row taken out of the grid, and `outputRemovedRecords` fed to a Delete Records
      element — the record was deleted. Several rows removed and deleted in one pass
      works too. That is the second output collection proven to drive real DML, after
      `outputEditedRecords` and Update Records.
  **A failed delete leaves the grid out of step.** The Remove action takes the row out
  of the collection immediately; the DML happens later, in the calling flow. If the
  delete fails — a closed-won opportunity blocking an Account cascade, a delete-time
  validation rule, a trigger — the row is gone from the grid while the record still
  exists. Observed 2026-08-27 with DELETE_FAILED.

  Nothing to fix in the component: there is no API that answers "can I delete this",
  and reimplementing Salesforce's cascade rules would be wrong and permanently stale.
  Worth knowing the alternatives, in increasing effort:

  1. A fault path on Delete Records, showing `{!$Flow.FaultMessage}`. Minimum viable.
  2. Loop and delete one at a time, each with a fault path — Flow DML is all-or-nothing
     per element, so one bad record currently blocks the whole batch ("We couldn't
     delete any records").
  3. **Use a Flow row action rather than Remove.** Point it at an autolaunched flow that
     deletes with a fault path. The grid re-reads the row afterwards: gone means the row
     leaves, still there means it stays. Per-row outcome, and no window where the grid
     and the database disagree — removal FOLLOWS the re-read instead of preceding it.

- [x] **The removal cap is verified, 2026-08-27**, including across pages. Exceeding
      Maximum Rows Removable refuses the extra removal and shows "You can only remove N
      rows at once."

      It counts across pages for a reason worth contrasting with selection: removals
      live in `_removedKeys`, our own state, and were never delegated to the datatable.
      The selection cap WAS delegated, and the datatable only sees the rows it renders
      — which is exactly why it counted one page at a time until it was moved into
      `handleRowSelection`. Same feature, two paths, and only the delegated one broke.
- [x] **`outputRemainingRecords` verified, 2026-08-27** — it updates as rows are marked
      for removal, not only at Save, so a downstream element always sees the complement
      of what was removed.

---

### 1.6 What is actually left to test

Everything else in §1 has either been verified or closed by decision. These have not:

**Design time**

- [ ] **Kit picker popover positioning.** Open **Records** and check the popover is not
      clipped or misplaced. Never confirmed, and it was the original risk when the
      Studio was designed.
- [ ] **Flow variable mapping.** Blank means "do not send"; a name the flow does not
      declare should be reported rather than failing the interview or going quiet.
- [ ] **Preview banner** reads "Live preview using real records" and is green.
- [ ] **Grid Studio backdrop** — the canvas bleed-through, §3.2. Known open.

**Runtime — the row action**

- [ ] **Cancel the modal**: nothing changes and no edit is recorded.
- [ ] **Finish without changing anything**: the record does NOT appear in
      `outputEditedRecords`. This is the value-comparison path, shared with inline
      editing where it is now verified.
- [ ] **A launched flow that DELETES its record**: the row leaves the grid and lands in
      `outputRemovedRecords`. The reconcile path, never exercised.

**Runtime — data**

- [ ] **Recalculate the incoming collection mid-edit** and confirm unsaved edits are
      discarded — the §2.6 rule. Now narrowed to the columns in use, so a change to an
      unshown field should NOT discard them.
- [ ] **Percent fields**, display and edit. §2.5 gap 6.

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
- **The Cancel/Save bar is always present.** It was once hardcoded off, then briefly
  bound to a `suppressBottomBar` property, which was removed on 2026-08-27: the bar
  carries table-level errors, and the reference says not to suppress it
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

### 2.2a `fgrid_flowGrid` test coverage — CLOSED 2026-08-27

This section used to say the runtime grid had no Jest tests at all, and that every
runtime behaviour rested on browser testing. That is no longer true: it now carries the
largest suite in the project, covering draft handling and the columnKey translation,
selection across pages and its cap, sorting and blanks-first, auto-save and reverting an
edit, the change signature, wrapped lines, the picklist fan-out, and validation.

The §2.6 signature path called out here as the riskiest uncovered code is covered, and
was narrowed to the columns in use while it was.

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

## 2.13 Record-type and dependent picklists — 2026-08-27

Two properties had been declared, offered in the editor, and documented in the code as
"accepted and inert" since the beginning. Both are now real, and they were built
together because **dependent picklists force the same machinery anyway**: narrowing by a
controlling field is inherently per row, and the data for both arrives in one payload.

### What an admin sees

```
Filter Picklists by Record Type   ( ) Do Not Filter  ( ) Globally  ( ) Per Row
Record Type Id                    <- Globally only
Dependent Picklist Icon           <- default utility:hierarchy
```

`showAllPicklistValues` is gone from the editor: "Do Not Filter" says the same thing
explicitly. It survives as a deprecated shim for the same reason `wrapTextMaxLines`
does — a saved flow version pins the declaration.

### How it works

- **Apex names the pairing.** `DescribeFieldResult.getController()` reports each
  picklist's controlling field. Only Apex knows this; the UI API payload carries the
  dependency DATA but never says which field is the controller.
- **One wire per distinct record type**, through `c/fgrid_picklistValues` — a component
  that renders nothing and exists only because a wire adapter takes one id and a
  component cannot loop wires.
- **Record types come off the RECORDS, not the rows.** `RecordTypeId` is rarely a
  displayed column, and a Get Records set to store all fields already carries it. If
  the Get did not retrieve it, filtering is skipped rather than firing a 2000-id query
  to go and get it.
- **Dependent picklists work with filtering OFF.** `validFor` lives in the same payload,
  so one fetch against the master record type happens whenever any column is dependent.
  The mode governs record-type filtering only, which is what its label promises.
- **A locked cell.** A dependent picklist whose controlling value is blank offers
  nothing, and an empty list disables the combobox with "Set Type first". Salesforce
  shows an empty dropdown and leaves the user guessing.
- **An UNSAVED controlling value counts.** A record page narrows the dependent picklist
  the moment the controlling one is chosen, not when it is saved. Committed edits
  already reach `buildRows` through `allKnownRecords`, but a draft sitting in the
  Cancel/Save bar does not, so the context reads it from `draftFieldValues` and it wins
  over the stored value. Clearing the controller in a draft locks the cell again.

  Drafts arrive keyed by `columnKey`, so this path needs the same translation the save
  path does — both now share one `fieldByColumnKey` getter rather than building the map
  twice.

  The rows memo only depends on drafts when a dependent column exists, so a grid
  without one does not rebuild every row on every cell edit.

### Why 2000 records is affordable

The costs scale with **record types**, not rows:

| Dimension | Scales with | At 2000 records |
| --- | --- | --- |
| Wire calls | distinct record types | 1-5 |
| Option lists built | record types x fields x controlling values | a few dozen |
| Per row | one Map lookup | trivial |

Option lists are cached by `recordTypeId|field|controllingValue`, and rows resolving the
same way share ONE array instance — which matters twice, because identical identity is
also what stops the datatable treating every row as changed on re-render.

Prerequisite, left to the admin by decision: the controlling field must be in the
collection. We cannot check every scenario, and a dependent picklist with no
controlling value simply locks.

### Verified in a browser — 2026-08-27

Working against a real object. That covers the structurally novel part: the fan-out
children do resolve their wires inside a running Flow screen, and `validFor` arrives in
the shape assumed from the reference.

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

### Selection reworked to match the native panel — 2026-08-27

| Control | Property | Shown when |
| --- | --- | --- |
| Row selection mode | `selectionMode` | always — Multiple / Single / **View only** |
| Minimum selection | `minSelection` *(new)* | Multiple |
| Maximum selection | `maxSelection` *(new)* | Multiple |
| Require user to make a selection | `isRequired` | **Single only** |
| Selection control | `singleSelectControl` *(new)* | Single — Radio button / Checkbox |
| Unique identifier | `keyField` | moved here from the data source |

**A stored value outlives the mode that set it.** Flow keeps any property it was given,
and the editor only stops SHOWING a control when the mode changes — it does not clear
the value. So a grid switched from Multiple to View only was still demanding
`minSelection` rows the user had no way to pick, and the screen could not be advanced
at all. `requiredSelectionCount` now returns 0 whenever the grid is not selectable.

Worth generalising: any control gated by `when:` can leave a value behind. The RUNTIME
has to gate on the same condition, not just the editor.

**Verified in the org 2026-08-27 — all three modes.** Multiple: selecting one record
at a time across several pages stops at the maximum with every remaining row disabled;
a maximum below the minimum is refused by the input's floor; a minimum forces a
selection before the screen will advance. Single: radio and checkbox both work, and
the checkbox can be unticked. View only: no selection column at all.

`maxRowSelection` was a derived getter (1 for Single, unlimited otherwise); it now
honours `maxSelection` for Multiple. `validate()` and the inline message understand a
minimum, so Multiple can demand N rows rather than just one.

**`isRequired` is Single-only now.** For Multiple, a Minimum of 1 says exactly the same
thing, and two controls meaning one thing is how a panel gets confusing.

**The Clear Selection button is gone entirely**, and with it
`hideClearSelectionButton`. The reasoning, arrived at by working backwards from where
it was needed:

- **Multiple** — the datatable's own header checkbox selects and clears all. The button
  was redundant.
- **Single** — a radio CANNOT be cleared once chosen, in the datatable or in plain HTML,
  and it lives in the shadow DOM so no handler can intercept the click. The button was
  the only escape. But `single-row-selection-mode="checkbox"` is the platform's own
  answer to that, which is what the Selection control now exposes.

So every mode is clearable by native means and no bespoke selection UI remains. An
admin who picks Radio and wants clearing has no way — the same position the native
datatable takes.

**Presentation, after seeing it in the panel.** Row selection mode renders as a RADIO
group rather than a combobox — few options, and the choice steers the rest of the
section, so all three stay readable instead of hiding behind a closed picker. Minimum
and Maximum sit side by side, because they are one setting expressed as two numbers.

Minimum and Maximum are `CONTROL.INTEGER`, a third editor addition: a plain number
input that does NOT go through the kit's value input, so it cannot take a Flow
resource. Deliberate — a bound formula could not be checked against the minimum, and
"how many rows may I pick" is not a question a formula answers. Whole numbers only, no
negatives, blank clears rather than storing 0 (a minimum of 0 is a deliberate "no
minimum"; blank is an unanswered question). `minFrom` reads the floor off another
property, so **Maximum can never be set below Minimum** — a maximum under the minimum
could never be satisfied.

Both needed additions to the editor: a `CONTROL.RADIO` type, and an `inline` flag on a
descriptor that halves its width. The controls are now laid out in a flex row rather
than as stacked divs, so `inline` is a schema decision rather than a CSS special case
— reusable for the next natural pair.

**The default stayed Multiple.** It was briefly changed to Single, then changed back:
the native table starts on Multiple, and matching it is worth more than a preference.

**A reversal worth naming.** `singleSelectAsCheckbox` was removed earlier the same day
as redundant with Clear Selection. That was wrong: the two were alternative answers to
one problem, not a workaround and a fix. It returns as `singleSelectControl`, a
Radio/Checkbox choice rather than a Boolean.

**And a test that asserted a bug.** "Offers Clear Selection only for single-row
selection" pinned the editor hiding a switch for a button the runtime showed in every
mode. Third time today a green test proved nothing — see also the flow-variables loop
and the `getRecordsByIds` mock.

### Width has no helper actions — decided 2026-08-27

Two were built and both removed the same hour. Recorded so neither is proposed again
without a reason that survives the objections below.

**Capture-on-drag** offered to write the widths dragged in the Studio preview into
Width. It wrote a width for EVERY column rather than the one dragged — my diff compared
each resize against a previous-widths snapshot that started empty, so on the first drag
everything differed from `undefined`. That bug was trivial to fix and is not why it
went: dragging a divider gives no signal about whether the LEFT or the RIGHT column is
being resized, so capture would be guessing at intent however the diff behaved.

**Reset to auto** cleared every Width in one click. It worked and was tested, but a
button in the header earns its place only if clearing eight fields by hand is a real
chore, and it is not — the fields are right there and "Reset all attributes" already
exists above the table.

Width is a plain number field: type a value, clear it for auto. Nothing else.

### Wrapped Lines is a switch — SLDS 2 hardcodes the clamp

**The mechanism, from the Styles panel** (`slds-plus.css:28408`):

```css
.slds-line-clamp {
  overflow: hidden;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;      /* a literal. no var(), no styling hook */
  text-overflow: ellipsis;
  white-space: pre-line;
}
```

The datatable takes `wrap-text-max-lines` and writes it on the cell wrapper as
`--lwc-lineClamp`, alongside that class:

```html
<div class="slds-hyphenate slds-line-clamp" style="--lwc-lineClamp: 6">
```

**Nothing reads `--lwc-lineClamp`.** SLDS 2 clamps at a hardcoded three, so the count
cannot be honoured by any means available to a consumer — and the class exists only
because the attribute is set at all. The two achievable states are therefore three
lines, or unlimited. Hence a checkbox, **Limit Wrapped Text to Three Lines**, and the
runtime sends the literal `"3"` or nothing.

Worth knowing this is a platform-wide break: `wrap-text-max-lines` does not work in any
SLDS 2 org, for any component.

#### Four wrong turns, and the ordering that would have avoided them

1. Passed a NUMBER where the reference asks for "a string value representing a number".
   A real defect, fixed — but fixing it changed nothing visible, which was the moment to
   measure rather than theorise again.
2. Concluded three was a platform floor and converted the control to a switch. Right
   answer, no evidence.
3. Reverted it when the reference was re-read: "to show a number of lines", three only
   as its example. Correct reasoning, wrong conclusion.
4. Overrode `--slds-g-font-line-clamp`, the SLDS 2 styling hook, on the assumption that
   the clamp read a variable. It does not. Dead code, now removed.

**The ordering that works, and it is three steps:** confirm the value is stored (Tooling
API), confirm it reaches the element (inspector), then **read the RULE, not the computed
value**. Step three names the mechanism. A filter on "clamp" in the Computed panel
showed only the custom properties and no `-webkit-line-clamp`, which was itself the
clue that the property was not where it was assumed to be.

#### TODO — remove the `wrapTextMaxLines` shim

Deprecated, unread, absent from the property editor, still declared in `js-meta.xml`
and as an `@api`. Salesforce refuses to deploy a targetConfig that drops a property a
saved flow version references, then refuses one with no matching `@api` — so a single
stored value pins it. To finish: clear it from every flow version that holds it, verify
with a Tooling API `SELECT Metadata FROM Flow` grep, then drop both together.

### Text wrapping — one per-column checkbox, 2026-08-27

`Wrap` in Column attributes now controls that column's cells AND its header. The
grid-level "Wrap column headers" combobox is gone; `wrap-table-header` is hardcoded to
`by-column`.

**Why it collapses to one control.** The reference: "`by-column` wraps the header for
columns that have the Wrap text setting enabled and clips the header for columns that
have the Clip text setting enabled." There is exactly ONE per-column wrap flag
(`wrapText`), so separate "Wrap Header" and "Wrap Column" checkboxes would both write
to the same property. Header wrapping IS per-column — it just cannot be set
independently of the cells.

`wrap-text-max-lines` is table-level, so **Wrapped lines stays a grid setting**, not a
column one. It is clamped to 1-10 in the component rather than with `min`/`max` on the
input, because the editor routes a number through the kit's value input, which also
accepts a Flow resource — the value can arrive from a formula that no markup
constrains. Blank or unusable leaves the attribute unset, which wraps without
truncating. Headers always wrap in full; the limit is cells only.

**Also tidied:** a custom Label is capped at 255 characters and the Field and Label
columns were narrowed — the label input alone had been taking about a third of the row.
The cap was briefly 40, on the assumption that field labels are limited to 40; some
objects allow up to 255, so the component does not second-guess it. Whether a header
that long looks right is the admin's call.

Column attributes now read: Field, Label, Width, Align, Edit, Filter, Wrap.

### Column widths — simplified to one control, 2026-08-27

**A column's Width is now the only width setting.** `auto` (blank, the default) or a
number. Removed on the way here: the per-column `flex` checkbox, the grid-level "Size
columns to their content", and its Minimum/Maximum column width fields.

**What each state does**

- **`auto`** — the column shares the available space with the other auto columns, and
  reflows as they are pinned or the window resizes. This is what `flex` was asking for.
- **a number** — `initialWidth`, the admin's chosen width. Honoured exactly once there
  is nothing left to compress.

Verified in the org: adding widths one column at a time narrowed the remaining auto
columns, the last one stopped at the platform's 50px floor and began to overflow, and
once every column had a value the widths were exact and the table overflowed as
expected. Acceptable at every step, and all of it with content sizing OFF — the
configuration that turned out to be the good one.

**Why the global setting went.** It decided what `auto` MEANT — equal share versus
fit-to-content — which is a third dimension on top of a control that already reads
`auto` or a number. It was off by default, the default behaviour is the desirable one,
and content sizing shipped looking broken: it sizes a column to its DATA, so
`Account Rating` and `Employees` truncated their own headers at the 50px minimum.

**What was lost, knowingly.** Fit-to-content sizing. A per-column Width cannot
reproduce it — an admin now types a number instead of having the table measure. Judged
worth it: typing `100` is more predictable than hoping the measurement agrees with you,
and content sizing was never verified inside a Flow screen SECTION, which is the flex
container the reference says is unsupported.

**Min/max had a visibility bug worth recording.** `min-column-width` applies in fixed
mode too, but the editor only showed the fields when content sizing was on. They were
hidden in the mode where the attribute was still in effect. No behaviour impact, because
nothing was sent when hidden and the platform default of 50px applied — which is exactly
the floor observed in testing.

**Still true and unchanged:** after a manual resize the table can end up narrower than
its container, leaving dead space on the right. That is `lightning-datatable`'s own
behaviour inside its shadow DOM and is not reachable from here.

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

### `flex` REMOVED — 2026-08-27

Implemented earlier in the session on a misreading, then removed the same day once the
original component's release notes surfaced. Worth keeping the whole arc, because the
mistake was subtle and cost several rounds of browser testing.

**What Flex means, from the original author's v4.1.0 notes:**

> "When selected, all flexed columns' widths will evenly expand or contract to fill the
> available space... more control over columns that you specifically want to be narrow
> or wide while allowing the other columns to find the best fit."

So **Flex on = this column has no width of its own, share the space. Flex off = keep my
specific width.** The baseline implements exactly that — `setWidth` does
`flex_checked ? 0 : sizes[colNum]` and assigns `initialWidth` in both cases, never
`fixedWidth`. Flex and Width are two expressions of one idea.

**Why it is redundant here.** The baseline's Config Mode wizard MEASURES and stores a
width for every column, so it needed a per-column way to say "not this one". Our editor
never populates Width — it is blank, showing a placeholder of `auto`, unless an admin
types a number. An empty Width field already says everything Flex said.

**What the misreading cost.** Flex was implemented as `initialWidth` when on and
`fixedWidth` when off — resizable versus locked. Two things were wrong:

1. It invented a locked, non-reflowing column the original never had. `fixedWidth` is
   exact and refuses to reflow, so narrowing the window past the sum of the pinned
   columns forces horizontal overflow. Observed in the org.
2. It was a silent regression, recorded here at the time without the consequence being
   noticed: "a width set before this shipped was resizable and is now locked."

**Now:** a Width is ALWAYS `initialWidth` — a starting width that still expands and
contracts with the window or parent container. `fixedWidth` is not used anywhere. A
stored `flex` value is ignored, so old column configs need no migration.

**Lesson.** Three separate accounts of this attribute were given before the right one:
that it matched the reference's resizable/locked model, then that it was about container
reflow, then the correct one. All three were derived from OUR code and the platform
reference. The answer was in the original component's release notes the whole time —
read the source component's own documentation before reinterpreting one of its
attributes.

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

  **The same cache also hides changes that DID deploy.** Twice on 2026-08-27 a change
  looked unapplied — a relabelled button, then the whole Title Case sweep — and both
  times the org already had it. Before debugging a change that "did not work", confirm
  what is actually deployed:

  ```
  sf data query --use-tooling-api --query "SELECT FilePath, LastModifiedDate FROM \
    LightningComponentResource WHERE LightningComponentBundle.DeveloperName = '<bundle>'"
  ```

  Add `Source` to the SELECT and grep it for the new string. Note that
  `sf project retrieve start --output-dir` silently retrieved NOTHING in this project
  on both attempts, so the Tooling API query is the reliable check.

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
  the same reason `hideHeaderActions` and `suppressCurrencyConversion` were already
  framed negatively — the pattern was there, it just was not understood as load-bearing.

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
  negative. No display translation anywhere. `hideHeaderActions` and
  `suppressCurrencyConversion` had always been this shape, which is why they always
  worked.

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
