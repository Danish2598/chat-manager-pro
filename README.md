# Chat Manager Pro

*Store listing name: **Chat Manager Pro – Bulk Delete & Privacy for AI Chats**.
The longer name carries the search keywords; the toolbar tooltip and this repo
stay on the short one.*

A Chrome extension (Manifest V3) that adds search, sorting, date filtering,
multi-select, safe bulk deletion, a privacy blur and a screen lock to your
**Claude, ChatGPT and Gemini** chat lists.

It injects a slide-out panel into the page rather than cramming a chat manager
into a 280px toolbar popup, so managing two hundred conversations is actually
practical.

---

## Features

| | |
|---|---|
| **Search** | Real-time, case-insensitive, matches titles and summaries |
| **Sort** | Newest, oldest, A–Z, Z–A |
| **Filter** | All, today, this week, this month, older |
| **Select** | Click a row, or shift-click for a range |
| **Bulk delete** | Confirmation listing every title, optional JSON backup, 10-second undo, then rate-limited sequential deletion with live progress and a stop button |
| **Privacy blur** | Hides chat titles, messages, media, account details and the message input until you hover them |
| **Screen lock** | Password-locks the page when you step away, across every Claude tab |

Sort and filter preferences persist. **Selections deliberately do not** — restoring
a stale selection into a tool whose main action is irreversible is a footgun.

---

## Privacy blur

For working in cafés, on trains, or on a shared screen. Content is blurred until
your cursor passes over it.

**Toggle it three ways:** the eye button in the panel header, the master switch
in the toolbar popup, or <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> from
anywhere on the page. Rebind the shortcut at `chrome://extensions/shortcuts`.

**Choose what gets blurred** in the popup — chat titles, messages, images and
files, account details, and the message input — each independently, at light /
medium / heavy strength. "Reveal on hover" can be turned off for a hard blackout
that never uncovers.

Blurring the **message input** hides what you are typing from anyone beside you.
It reveals on hover but deliberately *not* on focus, since revealing while you
type would defeat the purpose.

Two implementation notes that matter:

- **The blur is pure CSS.** The content script only toggles classes on `<html>`;
  it never reads or rewrites message content. New messages and lazily loaded
  history are covered automatically, with no MutationObserver and no render cost.
- **It applies before the page paints.** The content script runs at
  `document_start` so blur lands ahead of content. A privacy tool that flashes
  the thing it is meant to hide is worse than no privacy tool.

The delete-confirmation list is deliberately **never** blurred. Its whole purpose
is letting you verify what you are about to permanently destroy.

Every blur selector lives in one clearly marked block at the bottom of
`content.css` — that block is the single place to edit if the site's markup
changes.

---

## Screen lock

Locks the page behind a password so nobody can read or use your chats while you
are away from the desk. Lock with the 🔒 button in the panel header,
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>, or **Lock now** in the popup. Set
the password in the popup first.

The lock state lives in storage, which means locking one tab **locks every Claude
tab**, and a page reload does not clear it.

**What it is, honestly.** This stops someone who walks up to your unattended
machine from reading or using your chats. It is *not* protection against someone
with real access to the computer — they can disable the extension from
`chrome://extensions` like any other. Treat it as a deterrent, not a vault, and
don't rely on it to protect anything that would genuinely hurt to lose.

**Your password is never stored.** Only a PBKDF2-SHA256 derivation (150,000
iterations) and a random 16-byte salt are kept, in local storage. Verification
compares derivations, using a comparison that does not leak the hash through
timing.

**If you forget it,** remove the password from the toolbar popup, or clear the
extension's storage from `chrome://extensions`. That escape hatch exists by
design — which is also precisely why the lock is a deterrent rather than
security.

Two safeguards worth knowing about: a locked screen with no password on file
unlocks itself rather than trapping you, and failed attempts pause for half a
second to slow guessing.

---

## Links

- **Source:** https://github.com/Danish2598/chat-manager-pro
- **Privacy policy:** https://danish2598.github.io/chat-manager-pro/privacy-policy.html
- **Licence:** MIT

---

## Install (unpacked)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and choose this folder
4. Open <https://claude.ai> and click the round ☑ button at the bottom-right,
   or use the toolbar icon → **Open manager panel**

Press <kbd>Esc</kbd> to close the panel.

---

## Supported sites

| Site | Hosts | Manage | Bulk delete | Blur + lock |
|---|---|:--:|:--:|:--:|
| Claude | `claude.ai` | ✓ | ✓ | ✓ |
| ChatGPT | `chatgpt.com`, `chat.openai.com` | ✓ | ✓ | ✓ |
| Gemini | `gemini.google.com` | ✓ | — | ✓ |

**Gemini is deliberately limited.** It exposes no REST surface comparable to the
other two — its conversation list and delete flow go through Google's internal
`batchexecute` RPC, which is unversioned and hostile to automation. The
alternative, synthesising clicks through Gemini's own menus, means driving a
frequently-changing UI to perform an irreversible action. That trade isn't worth
making, so the adapter sets `canDelete: false` and the panel says so plainly
instead of offering a button that fails. Search, sort, blur and lock all work.

Adding another site means adding **one object to `sites.js`** — an id, a host
pattern, a link selector, and `list()` / `remove()`. Nothing in `content.js`
changes; it is site-agnostic and never names a site directly.

Adapters declare what they can do, and the UI follows:

| Flag | Effect |
|---|---|
| `canDelete: false` | Delete button is removed; `deleteNote` shown instead |
| `domOnly: true` | Skips the API attempt entirely, scrapes the sidebar |
| `allowSyntheticIds` | Lists sidebar entries that aren't links (no delete, no open link) |

## How it reads your chats

Two tiers, chosen automatically:

**API mode (normal).** Reads the conversation list from Claude's own endpoints
using your existing session — same origin, same cookies, nothing leaves the
browser. This is what makes real timestamps, the complete list, and fast
deletion possible.

**Limited mode (fallback).** If those endpoints change shape, the panel falls
back to scraping the chat links rendered in the sidebar. You keep search, sort
and delete; you lose timestamps, so date filtering is disabled and the panel
shows a "limited mode" badge.

The tradeoff worth knowing: those endpoints are internal and undocumented, so
they can change without notice. The fallback exists so that a change degrades
the extension instead of breaking it. Every endpoint and selector lives in the
`CFG` object at the top of `content.js`, so repairs are a one-line edit.

---

## Permissions

`storage` — and nothing else.

There are no `host_permissions`, no `activeTab`, no `scripting`. The content
script is injected declaratively by the `matches` pattern, and the popup talks
to it through `chrome.storage.onChanged` rather than tab messaging. That single
permission is the entire ask.

---

## Files

```
manifest.json     Extension config (MV3)
content.js        Site-agnostic panel, selection, delete pipeline, blur, lock
sites.js          Per-site adapters (Claude, ChatGPT) — all site knowledge
lock-crypto.js    PBKDF2 password hashing, shared by popup and content script
content.css       Panel styling + privacy blur + lock overlay (light + dark)
popup.html/js/css Thin launcher and default preferences
background.js     Service worker; seeds defaults, forwards the shortcut
icons/            16 / 48 / 128 px PNGs
tools_make_icons.py   Regenerates the icons (stdlib only, no PIL)
tools_verify.js   Read-only console diagnostic for endpoints and selectors
TESTING.md        Step-by-step test plan and checklist
STORE_LISTING.md  Chrome Web Store submission copy and checklist
privacy-policy.html  Privacy policy page, served by GitHub Pages
PRIVACY.md        Plain-text mirror of the privacy policy
LICENSE           MIT
```

---

## Testing

See [`TESTING.md`](TESTING.md). Start with the console diagnostic in
[`tools_verify.js`](tools_verify.js) — it reports whether the API endpoints and
blur selectors this extension depends on actually match the current site, which
is the one thing that cannot be verified from the source alone.

---

## Troubleshooting

**Panel doesn't appear.** Reload the claude.ai tab — content scripts only inject
on page load, so a tab open from before you installed the extension won't have it.

**"Could not read your chat list."** You're probably signed out, or the tab isn't
on claude.ai. Sign in, then press **Refresh** in the panel.

**"Limited mode" badge.** The API shape changed. Only chats already rendered in
the sidebar are listed and date filtering is off. Scroll the sidebar to load more,
or update the endpoints in `CFG`.

**Some deletions failed.** The panel reports the count; open DevTools console for
the per-chat reasons. Rate-limited requests are retried once after honouring
`Retry-After`.

**Titles stay sharp on some surfaces.** Claude.ai renders several sidebars —
`/chat/`, `/cowork/`, `/code/` — and each uses its own route prefix. The blur
matches route prefixes that carry an id (`/code/<id>`), which is what keeps bare
navigation links like `/projects` readable. If a surface you use is still
unblurred, run `tools_verify.js` there: section 6 lists every route on the page,
and any uncovered one goes into the titles list in `content.css`.

**Blur misses something, or blurs too much.** The selectors are best-effort
against markup that changes. Edit the `PRIVACY BLUR` block at the bottom of
`content.css` — each target lists several candidate selectors, so *add* a
candidate rather than replacing the list.

**A shortcut does nothing.** Another extension may have claimed
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> or
<kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd>. Reassign them at
`chrome://extensions/shortcuts`.

**Locked out.** Open the toolbar popup and click **Remove password**. If that
fails, remove the extension's data from `chrome://extensions`.

---

## Publishing notes

Full submission copy — item name, short and detailed descriptions, single-purpose
statement, permission justification, data-use answers and screenshot plan — lives
in [`STORE_LISTING.md`](STORE_LISTING.md). The store reads the name and short
description from `manifest.json`, so keep the two files in sync.

Three things that decide whether this listing survives:

- **The brand never leads the name.** `… for Claude` is descriptive use;
  `Claude Chat Manager` reads as a first-party product and is the shape that gets
  pulled. No Anthropic logo, wordmark or brand colours anywhere.
- **The short description limit is hard.** 132 characters; the upload fails at
  133. Currently 123, so there is margin — don't spend all of it.
- **Never list a platform before it works.** Claiming ChatGPT or Gemini support
  the code doesn't have is both a misleading-listing violation and the fastest
  route to one-star reviews.

---

## Development

The `commands` manifest key provides both keyboard shortcuts. It is a manifest
key, not a permission, so they cost nothing at the install prompt.

Regenerate icons after editing the design in `tools_make_icons.py`:

```bash
python3 tools_make_icons.py
```

Syntax-check the scripts:

```bash
node --check content.js && node --check popup.js \
  && node --check background.js && node --check lock-crypto.js
```

There is no build step. The source you load is the source that ships, which is
also what keeps Web Store review straightforward — no minification, no bundler,
no remote code.
