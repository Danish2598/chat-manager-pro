# Privacy Policy — Chat Manager Pro

_Last updated: 1 September 2026_

> The canonical, publishable version of this policy is
> [`privacy-policy.html`](privacy-policy.html) — host that at a public URL and
> link it from the Chrome Web Store listing. This file is the plain-text mirror;
> keep the two in sync.

## Single purpose

Chat Manager Pro has one purpose: helping you manage your own conversation list
on Claude.ai. Searching, sorting, filtering, selecting, bulk deleting, and
visually shielding that list from onlookers all serve that single purpose. The
extension does nothing outside it.

## Summary

Chat Manager Pro collects nothing, transmits nothing, and has no servers.

## What the extension stores

Your settings, in `chrome.storage.local`, on your own device:

- your chosen sort order
- your chosen date filter
- your privacy blur settings (on/off, which elements, strength)
- whether the screen is currently locked

If you set a screen-lock password, a PBKDF2-SHA256 derivation of it and a random
salt are stored alongside those settings. **The password itself is never stored**
and cannot be recovered from what is kept — not by this extension, and not by us.

That is the complete list. Chat titles, chat contents, account details and
identifiers are never written to storage. Uninstalling the extension removes
these values.

## What the extension reads

While you are on claude.ai and the panel is open, it reads your conversation
list — titles and timestamps — so it can display, search, sort and filter them.
This happens in your browser, using the session you are already signed in to.
The data is held in memory only, and is discarded when you close the tab.

If you tick "Download a JSON backup" before deleting, that file is written by
your browser to your own downloads folder. It is never uploaded anywhere.

The privacy blur reads nothing at all. It is implemented entirely in CSS: the
extension switches styling on, and your browser does the blurring. Message
contents are never accessed, copied or inspected by this extension.

## What the extension sends

Nothing, to anyone. The extension makes no requests to any third-party server.
The only requests it makes are to claude.ai itself, on your behalf, to list and
delete your own conversations — the same actions you can perform by hand in the
interface.

There is no analytics, no telemetry, no crash reporting, no advertising, and no
remote code execution.

## Permissions

The extension requests one permission, `storage`, used solely for the settings
described above.

It requests **no host permissions**, no `activeTab`, and no `scripting`
permission. The content script is injected declaratively by the manifest's
`matches` pattern, and the popup communicates with it through
`chrome.storage.onChanged` rather than tab messaging — which is what removes the
need for any further permission. There is no remote code: no `eval`, no injected
script tags, no external libraries.

## Deletion

Deletions you confirm in the panel are performed against your own account and
are permanent. The optional JSON backup records only titles, identifiers and
timestamps — it does not contain message contents and cannot restore a deleted
conversation.

## About the screen lock

The screen lock deters casual access to an unattended machine. It is not a
security boundary: anyone able to disable extensions in the browser can bypass
it. It is described this way in the extension's documentation too, so that no
one relies on it for more than it offers.

## Open source and transparency

MIT licensed. The complete source is public at
<https://github.com/Danish2598/chat-manager-pro>, published unminified and
unbundled — the code you can read there is exactly the code that runs.

## Contact

Raise an issue at <https://github.com/Danish2598/chat-manager-pro/issues>, or
use the extension's Chrome Web Store support tab.
