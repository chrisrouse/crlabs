# Flow Grid — status and what's left

Branch `feature/flow-grid`, last commit `5dbf23f6`. Everything below is deployed
to the **Preview Org** (`chrisrousepw-dev-ed`) and pushed to `origin`.

Local checks: **280 Jest tests**, ESLint and Prettier clean, `deploy --dry-run`
succeeds.

---

## 1. Start here: nothing has been tested in a browser

This is the single biggest gap. Every Apex path has been exercised with
`sf apex run`, and the LWC logic has Jest coverage, but **no part of the UI has
been confirmed working in Flow Builder or at runtime**. The Jest suite cannot
prove Flow Builder accepts the metadata, that `lightning-flow` renders inside a
running screen, or that the modal stacks correctly.

Test in this order — later items depend on earlier ones working.

### 1.1 Design time — the property editor

Open the smoke flow, click the Flow Grid element:
`/builder_platform_interaction/flowBuilder.app?flowDefId=300Ws00001Ef2jeIAB`

- [ ] The custom editor loads (ten accordion sections, not a flat list of inputs)
- [ ] **Kit picker popovers position correctly** — open **Records** and check the
      popover is not clipped or misplaced. Never verified; it was the original
      risk when the Studio was designed.
- [ ] Checkbox persistence: tick **Show row numbers**, click Done, reopen the
      element, confirm it stuck. This is the one real concern from the old
      `cb_*` properties.
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
- [ ] **Known broken:** Flow Builder's screen canvas bleeds through the modal.
      Parked — see §3.2.

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

- [ ] Click the row action: the modal opens and `FlowGrid_Edit_Account` renders.
      **This is the load-bearing assumption I could not verify** — `lightning-flow`
      nested inside a running Flow screen. If the modal is empty, that's why.
- [ ] Change the name, Finish: the grid shows the new value immediately
- [ ] `outputEditedRecords` / `editedCount` reflect it
- [ ] Cancel the modal instead: confirm nothing changes and no edit is recorded
- [ ] Finish without changing anything: confirm it does **not** appear in
      `outputEditedRecords` (the value-comparison path)
- [ ] Turn on **Record every actioned row**, action a row, confirm
      `outputActionedRecords` and `actionedCount` populate
- [ ] Map a Boolean output as the status variable, return `false`, confirm the row
      is neither recorded nor rewritten, and `outputLastActionStatus` is `false`
- [ ] Point the row action at an **autolaunched** flow: confirm no modal, a brief
      "Running flow…" indicator, and outputs still fold back in
- [ ] **Deleted record:** have the launched flow delete the record, then confirm
      the row leaves the grid and lands in `outputRemovedRecords`

### 1.5 Runtime — Remove row action

- [ ] Switch `rowActionType` to **Remove**, confirm removal, the 3-row cap
      message, and `outputRemovedRecords` / `outputRemainingRecords`

---

## 2. Not built yet

### 2.1 Inline editing — the last feature

Deliberately saved for last. Needs:

- `fgrid_customDatatable` — a `lightning-datatable` subclass
- a combobox cell for picklist editing. `buildColumns` already carries
  `fgridPicklistOptions` from the describe service, waiting for it
- the Cancel/Save bar, and edited-row tracking merged with the existing
  `_editsByKey` overlay
- `suppressBottomBar` and `navigateNextOnSave` are accepted and inert until then

### 2.2 Apex test coverage — blocks packaging

| Class | Coverage |
| --- | --- |
| `FlowGridColumnService` | 94% |
| `FlowGridController` | **23%** |
| `FlowGridFlowService` | **0%** |
| `FlowGridPreviewService` | **0%** |
| `FlowGridRecordService` | **0%** |

The controller regressed from 85% when `getFlows`, `runFlow`, `getFlowVariables`
and `getExistingRecordIds` were added without tests. Fine for dev-org deploys,
which do not enforce per-class coverage, but **this blocks packaging and any
production deploy**, and the org's floor is 80%.

`FlowGridFlowService` is the awkward one: its tests need an active flow to exist,
so they should either query for a suitable flow and skip when none is found (the
pattern `FlowGridColumnServiceTest` already uses for its FLS test) or depend on
`FlowGrid_Edit_Account` being deployed.

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

### 2.4 Resource-capable Boolean properties

`markActionedRows` renders as a checkbox, so it cannot be bound to
`$GlobalConstant.True` or a Flow formula the way the platform's own Boolean
properties can. This is the deferred "booleans can't take a Flow reference" item;
`markActionedRows` is now a concrete reason to do it. Roughly a day: a new control
type using the kit's literal-or-resource input, plus runtime handling for a
property that may arrive as either.

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

1. **Timezone offset on Date and Time fields — not implemented.** The highest-risk
   gap, because it is silent data corruption rather than cosmetics. The baseline
   adjusts Date fields by the running user's offset to keep the correct day, moved
   the offset to noon to avoid DST edge cases, stores as `YYYY-MM-DD` because
   datetime broke collection processors, reapplies the offset to edited records,
   and applies it to Time fields. Flow Grid does none of it, so a date near
   midnight can display or save a day out.
2. **Multi-currency conversion — accepted and ignored.** `suppressCurrencyConversion`
   exists as a property but nothing implements conversion. The baseline converts
   currency values to the user's currency and supports currency rollup and formula
   fields in multi-currency orgs. Only matters if the target org is multi-currency.
3. **Lookup fields are not links.** Only the object's own Name field links to its
   record. The baseline resolves lookup columns and links them to the related
   record. Lookups in a grid are common, so this is likely to be noticed.
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

- **Apex-defined types.** The baseline treats these as a first-class mode:
  reactivity, editing, and "unable to edit Apex-Defined columns unless Type was
  specified". Flow Grid's user-defined-object mode takes serialized JSON, which
  covers the data shape but is not the same as a Flow Apex-Defined variable. Is
  genuine Apex-defined support needed, or is JSON enough? This decides how much
  work that mode still is.
- **Filters: header actions or a filter row?** The baseline puts Set Filter and
  Clear Filter in each column's header menu. Flow Grid uses a filter row above the
  table — simpler and more discoverable, but a different mental model for anyone
  migrating.
- **Reactive `preSelectedRecords`.** The baseline made this reactive. Flow Grid
  seeds the selection once and then guards against re-applying, so a later
  reactive change does not take effect. Deliberate at the time; may be wrong.

### Deliberately not carried over

- **Clipboard copy of attribute strings** — a wizard convenience for the 13
  delimited column strings. Obsolete now that column config is JSON.
- **The `YYYY-MM-DD` search format note** — the baseline had to document it. Flow
  Grid substring-matches raw values and dates arrive as ISO strings, so the same
  format works incidentally. No action, but the constraint is the same.

---

## 3. Known issues

### 3.1 Combobox option padding

The flow picker's dropdown has a left gutter that `lightning-combobox` reserves
for its selected-check icon, inside its shadow DOM. A styling hook
(`--slds-c-listbox-option-spacing-inline-start`) is set but base components do not
guarantee honouring it. If it still looks indented, the fix is a custom listbox
rather than `lightning-combobox`.

### 3.2 Grid Studio modal — canvas bleed-through

Flow Builder's screen canvas paints over the Studio modal, intermittently, and
opening devtools shifts the layout so it moves off-screen. Two attempts failed:
an explicit `z-index`, then elevating the host with the kit's
`setPopoverHostActive`. Flow Builder uses transformed ancestors, which create a
stacking context, so CSS inside the component may simply be unable to win.

Deliberately parked. If it needs solving, the fallback is sizing the Studio so it
does not overlap the canvas column.

### 3.3 Studio double-shade

A faint double dim where the Studio modal and Flow Builder's own modal do not
align. Both extremes were tried — a full `slds-backdrop` was far too dark,
removing the dim entirely lost all separation — so a light wash is the current
compromise. The CSS comment records both failures.

---

## 4. Things that will bite during testing

- **A draft flow cannot be launched.** The row-action picker only lists active
  flows for this reason. `FlowGrid_Edit_Account` is deployed Active.
- **Relationship columns need the Flow to query them.** Flow's "automatically
  store all fields" covers direct fields only, so `Owner.Alias` renders blank
  unless the Get Records element selected it explicitly. Not a grid bug.
- **Autolaunched flows run in system context** by default, ignoring the running
  user's object and field permissions. That is the flow's own configuration, and
  a row action makes it easy to hand a user a button that does more than their
  profile allows.
- **Property defaults cannot be removed once a flow references them.**
  `rowActionFlowRecordVariable` and `rowActionFlowIdVariable` default to `record`
  and `recordId`, and Salesforce refuses to drop a default that an existing flow
  version uses — an empty string counts as removal, and flow versions are
  immutable. That is why the runtime validates names against the flow instead of
  relying on the properties being empty.
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
  flows/       FlowGrid_Smoke_Test (draft), FlowGrid_Edit_Account (active)
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
