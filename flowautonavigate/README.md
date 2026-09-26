# Flow Auto Navigate

A Flow screen component that advances the screen on its own after a configured
duration. Use it for idle timeouts, timed confirmation screens, and any screen
that should not wait on a click forever.

## Upgrading — breaking change

The old `maxTime` property (an `H:M:S:MS` string) **has been removed**. Duration
is now entered as four separate whole-number properties, summed:
`timeoutDays`, `timeoutHours`, `timeoutMinutes`, `timeoutSeconds` (all Integer).

**A flow configured with the old property will not auto-advance after upgrade.**
It does not fail or navigate unexpectedly — the component simply stays inert and
the user navigates by hand. Open each screen that uses it and re-enter the
duration.

## Configuration

Properties are edited through a custom property editor
(`c-flow-auto-navigate-editor`) rather than Flow Builder's default panel: the
duration is four boxes on one row with a live plain-English summary
("Advances after 1 minute 5 seconds."), and the panel refuses to save a duration
of zero.

### Timing

| Property                  | Type    | Notes                                                             |
| ------------------------- | ------- | ----------------------------------------------------------------- |
| Days                      | Integer | Summed with the three below. Leave blank for none.                |
| Hours                     | Integer |                                                                   |
| Minutes                   | Integer |                                                                   |
| Seconds                   | Integer |                                                                   |
| On Timeout                | String  | `Next` (default), `Back`, `Stay`. See below.                      |
| Advance When This Is True | Boolean | Optional **resource**. Completes on a trigger instead of a timer. |
| Pause Timer               | Boolean | Optional **resource**; the timer holds while true.                |

`Next` falls back to finishing the flow on a last screen, which is the original
behavior of this component — so **`Next` covers the finish case** and there is
no separate Finish option. An explicitly chosen `Back` does **not** fall back;
if the flow does not offer it, nothing happens. Quietly doing something other
than what you asked for is worse than doing nothing.

Finish and Pause were offered briefly and removed: Finish was redundant with
`Next`, and Pause was not wanted. A flow still saved with either does nothing
on timeout rather than guessing — `triggered` still reports that the timeout
happened.

### Completing without a timer

**Advance When This Is True** runs the On Timeout action — including the
refresh — as soon as the bound Boolean becomes true, with no timer involved.
Bind another component's output: a file upload's content document link
arriving, a callout finishing, a checkbox being ticked.

With it bound, the duration becomes optional:

| Configuration | Behavior                                                        |
| ------------- | --------------------------------------------------------------- |
| Duration only | Completes on the clock, as before.                              |
| Trigger only  | Completes when the trigger fires. No timer runs.                |
| Both          | Whichever happens first wins — the duration acts as a backstop. |

The trigger takes the same path as expiry, so `triggered`, `timerExpired`, the
refresh and the On Timeout action all behave identically. It fires once.

`Pause Timer` is resource-only on purpose: a literal `true` would hold the timer
forever. Bind a checkbox or formula on the same screen and the timer stops and
starts as it changes, keeping the time already served rather than restarting.

### Display

| Property                | Type    | Notes                                                                       |
| ----------------------- | ------- | --------------------------------------------------------------------------- |
| Show Timer              | Boolean | Off by default; the component advances silently.                            |
| Timer Direction         | String  | `Down` (default) or `Up`. Needs Show Timer.                                 |
| Time Format             | String  | `Standard` (`0:40`), `Fixed` (`00:00:40`), `Compact` (`40`).                |
| Message Position        | String  | `Below` (default) or `Above` the timer. Applies to the warning message too. |
| Show Timer Reset        | Boolean | Offers a Reset button. Needs Show Timer. See Accessibility.                 |
| Message to Users        | String  | Rich text below the timer. Accepts a Flow resource.                         |
| Show Progress Bar       | Boolean | Depletes counting down, fills counting up.                                  |
| Show Loader             | Boolean | A spinner. Suggests loading; prefer the progress bar.                       |
| Hide When Time Runs Out | Boolean | Hides the component on expiry but keeps its space. See below.               |
| Refresh the Page        | Boolean | Refreshes the surrounding page on expiry. See below.                        |

### Time running out

The threshold uses the same four-box Days / Hours / Minutes / Seconds control as
Advance After, summed the same way, so a long screen can warn minutes ahead
rather than seconds. Everything else here is inert until it sums above zero,
and it must be shorter than the total duration.

| Property                       | Type    | Notes                                                             |
| ------------------------------ | ------- | ----------------------------------------------------------------- |
| Warning Days                   | Integer | Summed with the three below. Blank for no warning phase.          |
| Warning Hours                  | Integer |                                                                   |
| Warning Minutes                | Integer |                                                                   |
| Warning Seconds                | Integer |                                                                   |
| Warning Style                  | String  | `No Change`, `Color`, `Color and Weight`, `Pulse`, `Tinted Pill`. |
| Warning Message                | String  | Replaces Message to Users during the warning.                     |
| Show Warning Icon              | Boolean | A warning icon beside the timer.                                  |
| Tint Progress Bar When Warning | Boolean | Independent of Warning Style.                                     |

Style, message, icon and bar tint are separate so they compose freely. Color on
its own fails WCAG 1.4.1 — pair `Color` with a Warning Message or the icon.

`design/warning-threshold-preview.html` is a standalone page comparing the
treatments; open it in a browser.

## Outputs

| Output         | Meaning                                                  |
| -------------- | -------------------------------------------------------- |
| `triggered`    | This component advanced the screen itself.               |
| `timerExpired` | The timer reached zero, whether or not the screen moved. |

Both are reported as `false` when the screen loads, so a Decision reads an
explicit value rather than relying on an unset Boolean being falsy.

### Routing after the screen

`triggered` distinguishes a timeout from the user clicking Next. Timer fired →
true. User advanced first → false. Put a Decision on it after the screen.

### Reacting on the same screen

With any navigating action, both outputs flip and the screen tears down in the
same instant, so nothing keyed off them ever paints.

Set **On Timeout** to **Stay on This Screen** and the two diverge:
`timerExpired` goes true, `triggered` stays false, and the screen stands. That
is the combination that lets a Message component (or anything else on the
screen) render on expiry, with the user clicking Next themselves.

### Two ways to hide the timer when it expires

Both work. Pick on whether you want the space back.

| Approach                                    | Result                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Flow visibility condition on `timerExpired` | The component is removed. Whatever is below it moves up to close the gap.                                  |
| **Hide When Time Runs Out**                 | The component is hidden with `visibility: hidden`. It keeps its footprint, so nothing on the screen moves. |

The visibility condition is an ordinary Flow rule on this component's own
output — the component reports `timerExpired` as `false` when the screen loads
and `true` on expiry, so a condition on it resolves normally. Get the operator
and value right and it behaves like any other component visibility rule.

Either way, hiding is visual only. The timer keeps running and still advances
the screen; use `Pause Timer` if you want the clock held as well.

### Refreshing the page

**Refresh the Page** dispatches a `RefreshEvent` from `lightning/refresh`
(RefreshView API) when the timer expires, before any navigation.

That module is [documented](https://developer.salesforce.com/docs/platform/lightning-component-reference/guide/lightning-refresh.html)
as the replacement for Aura's `force:refreshView`, and as supported in
Lightning Experience, Experience Builder Sites, the Salesforce mobile app,
Lightning Out and standalone apps. One dispatch therefore covers console tabs,
ordinary record pages and Experience Cloud.

This is deliberately **not** the `lightning/platformWorkspaceApi` `refreshTab()`
approach used by `ers_AutoNavigate_Refresh`. That one is console-only — it
returns early when `IsConsoleNavigation` is false, so it does nothing on a
standard record page or in a site — and it reloads the whole tab, which
restarts any flow running on the refreshed page. `RefreshEvent` refreshes
registered components in place, so a flow survives it.

Pair it with **On Timeout = Stay on This Screen** to refresh without leaving
the screen. Note this fires **once**: the timer stops at zero, and only Reset
or unpausing restarts it. There is no repeat, so this is not interval polling.

No container setup is needed. The guide is explicit: "If you're adding a
component to an active page, you don't need to create a container to receive
`RefreshEvent`. Add a container only if you want to determine the scope of your
refresh." `RefreshEvent` bubbles to the nearest registered ancestor, which on a
standard page is the platform's own container.

What actually refreshes is narrower than "the page", and worth knowing before
you rely on it:

- **Only components that registered a refresh handler participate.** A custom
  LWC that never called `registerRefreshHandler()` will not refresh, and
  "components aren't responsible for refreshing their descendants".
- **Aura base components don't support RefreshView API** at all, per the
  guide's own limitations.
- Lightning Data Service participates, but a component still has to initiate
  its own refresh — `refreshApex()`, `refreshGraphQL()` or
  `notifyRecordUpdateAvailable()`.

So this refreshes a well-behaved modern page well, and an older Aura-heavy one
only partially. That is a property of what is on the page, not of this
component.

#### Experience Cloud needs Record to Refresh

`RefreshEvent` alone is **not** enough on an LWR site. Tested with a standard
Account page and a standard Record Detail, the component kept showing the
previous value: the event fires, but nothing on that page registered a refresh
handler, so nothing acts on it.

Add an input variable named `recordId` to the flow, bind **Record to Refresh**
to it, and the component also calls
`notifyRecordUpdateAvailable()`, which does not use the refresh tree at all.
Per its reference it "considers the record data wired by all instantiated
components" and re-emits to every wire using that id, which reaches an
LDS-backed Record Detail directly.

Leave it blank for Lightning pages, where `RefreshEvent` already does the job.
Setting it there is harmless, and does guarantee the record itself is fresh
rather than just the view, but it is not needed.

Verified: **console tab** and **non-console record page** in Lightning
Experience, with `Refresh the Page` alone.

## Behavior notes

- **Timing is measured against a wall clock**, not by counting interval
  callbacks. This matters most in a background tab, where browsers clamp timers
  to one second or slower; the previous version's 65-second timer could take
  many minutes there. A throttled tab now fires late and advances on its next
  tick.
- **An unconfigured duration leaves the component inert.** It will not guess an
  interval and advance on it.
- **The screen advances once**, and the timer display updates once a second even
  though the deadline is checked four times a second.
- **The display shows days as `2d 05:00:00`** once a duration reaches a day, in
  every format. The `d` suffix rather than a fourth colon segment, because
  `3:00:00:00` and `3:00:00` differ only by segment count and are easy to
  misread at a glance.
- **Time Format** controls how much of the clock below a day is shown:
  `Standard` drops empty hours but keeps minutes (`0:40`), `Fixed` always shows
  every unit at two digits so the line never changes width (`00:00:40`), and
  `Compact` drops every empty leading unit including minutes (`40`).
- **A multi-day timer only completes where the session outlives it.** A
  logged-in Lightning session will not, so days are really for an always-on
  public Experience Cloud page — a kiosk or lobby display. There is no upper
  bound enforced, so a slipped digit in Days produces a screen that never
  advances.

## Accessibility

- WCAG 2.2 SC 2.2.1 (Timing Adjustable) applies to any screen that advances on a
  timer. **Turn on Show Timer Reset** unless the time limit is essential.
- The countdown is a `role="timer"` region with `aria-live="off"`. A value
  announced every second would talk over everything else a screen reader is
  saying.
- Instead, the component announces **at 60, 30 and 10 seconds remaining**, plus
  once at the start ("This screen advances in 1 minute 5 seconds."). Milestones
  longer than the configured duration are skipped. These announcements are
  **not** conditional on Show Timer — a screen that advances silently still
  moves under a screen reader user.
- The `Pulse` warning style honors `prefers-reduced-motion`.

## Verified in an org

Unit tests cover the logic; this table is about what has actually been run in
Salesforce, because several of these depend on platform behavior that tests
cannot prove.

| Behavior                                                  | Status                                      |
| --------------------------------------------------------- | ------------------------------------------- |
| Refresh in a console tab                                  | Verified                                    |
| Refresh on a non-console record page                      | Verified                                    |
| Refresh in Experience Cloud (LWR), with Record to Refresh | Verified                                    |
| Refresh in Experience Cloud without Record to Refresh     | Confirmed **not** to work                   |
| Pause Timer, bound to a reactive Boolean                  | Verified                                    |
| On Timeout: Next                                          | Verified                                    |
| On Timeout: Back                                          | Verified                                    |
| On Timeout: Next falling back to finish on a last screen  | Verified                                    |
| On Timeout: Stay, driving a Message from Timer Expired    | Verified                                    |
| Countdown display and progress bar                        | Verified                                    |
| Warning style: Tinted Pill                                | Verified                                    |
| Advance When This Is True                                 | Not tested                                  |
| Hide When Time Runs Out                                   | Not tested                                  |
| Warning style: Pulse, and `prefers-reduced-motion`        | Not tested                                  |
| Milestone screen reader announcements                     | Not tested — never heard by a screen reader |
| Durations of a day or more (`2d 05:00:00`)                | Not tested                                  |
| Salesforce mobile app                                     | Not tested                                  |

## Development

```bash
npm run verify   # prettier, eslint, jest
```

The editor is built on the [Flow Config Editor Kit](../crlabs/flow-config-editor-kit),
which must be deployed to the org before this component's property panel will
render.
