# Chrome Web Store listing

Copy-paste source for the submission form. Keep this file in sync with
`manifest.json` — the store reads `name` and `description` from the manifest,
and a mismatch here is how listings drift.

---

## Item name

```
Chat Manager Pro – Bulk Delete & Privacy for AI Chats
```

53 / 75 characters.

The brand sits in the qualifier position, never leading. `Claude Chat Manager`
would read as a first-party product and is the shape that gets pulled;
`… for Claude` is descriptive use and is the pattern the large extensions in
this category use. `Bulk Delete` is in the name deliberately — it is what people
actually type into store search. Nobody searches "chat manager".

## Short description

```
Bulk delete, search, sort and filter your Claude and ChatGPT chats. Blur and lock Claude, ChatGPT and Gemini.
```

109 / 132 characters. The limit is hard and the upload fails at 133, so leave
the margin alone when editing.

## Category

**Productivity.** Not Social Networking — the primary job is managing a list,
not communicating.

## Language

English (add locales later; each one is an extra listing to maintain).

---

## Detailed description

```
Manage your AI chat history the way you actually want to.

Claude, ChatGPT and Gemini all leave you deleting chats one at a time, with no
search across your history and no way to sort or filter it. Chat Manager Pro
adds that — plus a privacy mode for when you are working somewhere public.

SUPPORTED SITES
• Claude — manage, bulk delete, blur, lock
• ChatGPT — manage, bulk delete, blur, lock
• Gemini — manage, blur, lock (Gemini provides no API for deleting chats, so
  bulk delete is not available there)


BULK DELETE, SAFELY

• Select any number of chats — click a row, or shift-click to select a range
• Select All / None respects whatever search and filter you have applied
• The confirmation dialog lists every title, so you see exactly what is going
• Optionally download a JSON backup before anything is deleted
• A 10-second undo window before deletion actually begins
• Deletions run one at a time, with live progress and a Stop button


FIND ANY CHAT

• Real-time search as you type
• Sort by newest, oldest, A–Z or Z–A
• Filter to today, this week, this month, or older
• Search, sort and filter all work together


PRIVACY BLUR

Working in a café, on a train, or on a shared screen? Blur your chats until you
hover over them.

• Choose exactly what gets blurred: chat titles, messages, images and files,
  account details, and the message box you are typing into
• Three blur strengths
• Turn hover-reveal off for a hard blackout that never uncovers
• Toggle instantly with Alt+Shift+B


SCREEN LOCK

Step away from your desk without closing anything. Alt+Shift+L locks the page
behind a password — across every Claude tab at once, and a page reload does not
clear it. Your password is never stored; only a salted PBKDF2 hash is kept.

Please read this honestly: the screen lock deters someone walking up to your
unattended machine. It is not protection against someone who can disable browser
extensions. Do not rely on it for more than that.


PRIVATE BY DESIGN

• One permission: storage. That is the entire ask.
• No accounts, no sign-up, no tracking, no analytics, no ads
• No data ever leaves your browser — the extension has no server
• No remote code. The source you install is the source that ships.


Claude is a trademark of Anthropic PBC. ChatGPT is a trademark of OpenAI.
Gemini is a trademark of Google LLC. This extension is an independent project
with no relationship to any of them.
```

---

## Single purpose statement

> Chat Manager Pro has one purpose: helping the user manage their own
> conversation lists on claude.ai, chatgpt.com and gemini.google.com. Everything it does — search, sort, filter,
> multi-select, bulk delete, and visually shielding that list from onlookers —
> serves managing that one list.

## Permission justification

**`storage`** — the only permission requested.

> Used solely to persist the user's own settings: sort order, date filter,
> privacy blur options, and, if the user chooses to set one, a salted PBKDF2
> hash of their screen-lock password. No conversation content, no titles, and no
> account information are ever written to storage.

**No host permissions are requested.** The content script is injected
declaratively by the `matches` pattern in the manifest, and the popup
communicates with it through `chrome.storage.onChanged` rather than tab
messaging — which is what removes the need for `activeTab` or `scripting`.

**Remote code:** none. No `eval`, no injected `<script>` tags, no CDN, no
bundler, no minification.

## Data usage disclosures

Answer the form as follows. Every one of these is literally true of the code —
verify against `PRIVACY.md` before submitting.

| Question | Answer |
|---|---|
| Personally identifiable information | Not collected |
| Health information | Not collected |
| Financial and payment information | Not collected |
| Authentication information | Not collected |
| Personal communications | Not collected |
| Location | Not collected |
| Web history | Not collected |
| User activity | Not collected |
| Website content | Not collected |

Then tick all three certifications:

- Not being sold to third parties, outside of approved use cases
- Not being used or transferred for purposes unrelated to the item's core functionality
- Not being used or transferred to determine creditworthiness or for lending purposes

**Privacy policy URL:** required by the store.

**Live and ready to paste into the submission form:**

```
https://danish2598.github.io/chat-manager-pro/privacy-policy.html
```

Served by GitHub Pages from `main`. Editing `privacy-policy.html` and pushing
republishes it automatically — no separate deploy step.

Contact in the policy points at the repo's issue tracker rather than a personal
inbox, deliberately: the address on a privacy policy is public and permanently
scraped. To use an email instead, edit section 12 of `privacy-policy.html` and
push.

---

## Screenshots

1280×800 (or 640×400), up to five, first one is the thumbnail. Shoot them on a
throwaway account with harmless chat titles — real titles in a store screenshot
are a permanent, public data leak.

1. **The panel, open, with several chats selected** — the thumbnail. Show the
   search box, sort/filter, and the selected count in one frame.
2. **The delete confirmation** — titles listed, backup checkbox visible. This is
   the trust shot; it is what separates this from a reckless bulk deleter.
3. **The undo toast counting down.**
4. **Privacy blur active** — half the sidebar blurred, one row hovered and sharp.
   Reads instantly in a thumbnail grid.
5. **The lock screen.**

---

## Pre-submission checklist

- [ ] `manifest.json` name and description match this file
- [ ] Version bumped
- [ ] Icons present at 16 / 48 / 128
- [x] Privacy policy published: https://danish2598.github.io/chat-manager-pro/privacy-policy.html
- [ ] Trademark disclaimer present at the end of the description
- [ ] No Anthropic logo, wordmark, or brand colours in icon or screenshots
- [ ] Screenshots taken on a throwaway account
- [ ] Trader / non-trader status answered (required for EU distribution)
- [ ] Tested on a clean Chrome profile, installed unpacked, from a cold load

## After publishing

Ranking is driven by installs and rating far more than by wording, and this
extension depends on markup it does not control. The single thing that protects
the rating is how fast a breakage gets fixed — every selector and endpoint is
isolated in the `CFG` object in `content.js` and the `PRIVACY BLUR` block in
`content.css` precisely so that a fix is a one-line edit and a same-week publish.

Adding ChatGPT or Gemini later is a name edit (`for Claude` → `for Claude &
ChatGPT`) and costs nothing structural: the item ID, URL, install count and
reviews all survive a rename. Do not list a platform before it actually works —
a listing that claims unsupported support is both a policy violation and the
fastest route to one-star reviews.
