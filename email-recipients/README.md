# Email Recipients

A Flow screen component that collects a list of email addresses. Each address is
checked as it is entered, and the list is published as a collection and as one
comma-delimited string, ready for the Send Email action's To, CC and BCC fields.

Status: **built and tested locally; not yet deployed or packaged.**

## Components

| Component                   | Folder                                             | Purpose                                                                           |
| --------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------- |
| `c-email-recipients`        | `force-app/main/default/lwc/emailRecipients`       | The screen component.                                                             |
| `c-email-recipients-editor` | `force-app/main/default/lwc/emailRecipientsEditor` | The Flow Builder panel. Built on the Flow Config Editor Kit (CRLabs Foundations). |
| `c/emailRecipientsRules`    | `force-app/main/default/lwc/emailRecipientsRules`  | Pure rules: parsing, domain checks, duplicates and limits. No DOM.                |

## How entries are checked

Typed text, pasted text and the initial list all go through one set of rules, in
one order: format, blocked domain, allowed domain, duplicate, then limit. Each
rejected entry is counted once, under its first reason.

- **Typed:** Enter, Space or Tab commits the text, and so does leaving the field.
  Tab moves focus as usual.
- **Pasted:** addresses are found in the text, including `Name <address>` and
  addresses separated by commas, semicolons, pipes, spaces or line breaks. Text with
  no addresses pastes as ordinary text.
- **Initial emails:** a text collection from the flow, checked the same way.
- **Domains:** comma-separated lists with wildcards in any position, such as `*.edu`
  or `*google*`. Blocked is checked before allowed.
- **Maximum:** 0 to 150. Blank means 150. Entries over the limit are refused and
  counted.

## Outputs

- `emailCollection` (String[]): the addresses, in order.
- `emailList` (String): the same addresses, comma-delimited, with no spaces.

## Changes from Multi Email Input

This is a new build, not a fork. These behaviors differ from the earlier component:

- **One email list format.** Typed, pasted and initial entries all produce the same
  `emailList`. The earlier component used `, ` for pasted addresses and `,` for
  everything else.
- **Consistent duplicate and limit rules.** Duplicates are caught against the list
  for every input method. The earlier component checked them only on paste.
- **No timers.** Initial values are applied when the component connects. The
  earlier component waited 250 ms when the maximum was not yet set.
- **Disabled fields show their values.** The earlier component hid them.
- **Plain-text messages.** Custom messages are plain text, shown through the field's
  own validation, so they are linked to the field for screen readers. The earlier
  component rendered rich text in its messages.
- **Standard components.** The label, help text and pills use `lightning-input`,
  `lightning-helptext` and `lightning-pill-container`, in place of custom markup.
- **Address check.** The format check has no nested patterns, so a long input
  cannot cause slow matching. Quoted local parts and IP-address domains are not
  accepted.

## Tests

Jest tests cover the rules module, the component and the editor:

```bash
npx jest email-recipients
```

## Next steps

- Deploy to Preview Org and check the panel and the Flow screen by hand.
- Add a package entry and a beta version under CRLabs, depending on CRLabs Foundations.
