# Chrome Web Store listing

Copy-paste source for the submission form. Keep this file in sync with
`manifest.json` — the store reads `name` and `description` from the manifest,
and a mismatch here is how listings drift.

---

## Item name

```
Chat Manager Pro – Bulk Delete & Privacy for ChatGPT, Claude, Gemini
```

68 / 75 characters.

The brand names are the qualifier, never the lead — `Claude Chat Manager` would
read as a first-party product and is the shape that gets pulled, while
`… for ChatGPT, Claude, Gemini` is descriptive use.

Naming all three explicitly is deliberate. The Chrome Web Store has no keyword
field; it indexes the title, the short description and the detailed
description, and the title carries the most weight. People search the product
they use — "delete all chatgpt chats", "claude bulk delete" — not "AI chats".
An earlier draft said "for AI Chats", which was tidier and found by nobody.

`Bulk Delete` is in the title for the same reason: it is the phrase with real
search intent behind it. Nobody types "chat manager".

## Short description

```
Bulk delete chats on ChatGPT, Claude and Gemini. Search your chat history, blur chats for privacy, and lock your screen.
```

120 / 132 characters. The limit is hard and the upload fails at 133, so leave
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

WHAT PEOPLE USE IT FOR

Deleting all your ChatGPT chats at once. Clearing old Claude conversations.
Cleaning up Gemini chat history. Finding an old conversation by searching your
whole history instead of scrolling. Hiding chat titles and messages from people
around you. Locking the screen when you step away from your desk.

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
behind a password — across every supported tab at once, and a page reload does
not clear it. Your password is never stored; only a salted PBKDF2 hash is kept.

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

Five are generated at exactly 1280x800 into `store-assets/`:

```bash
python3 tools_screenshots.py --render
```

| File | Shows |
|---|---|
| `1-bulk-delete.png` | Panel with four chats selected and the Delete button live |
| `2-confirm.png` | Confirmation listing every title, with the backup option |
| `3-privacy-blur.png` | Sidebar and panel blurred, one row revealed on hover |
| `4-screen-lock.png` | The locked screen |
| `5-settings.png` | The popup, showing the single-permission story |

They render the **real** `content.css` and `popup.html` over a neutral chat-app
mock. Neutral deliberately: a store screenshot must not reproduce another
company's interface or branding, and a mock cannot leak real conversation
titles the way a screenshot of your own account would.

Edit the copy in `tools_screenshots.py` and re-render — the captions are the
listing's headlines and are worth iterating on.

Note on `4-screen-lock.png`: the background is blank because the lock really is
opaque. That is the feature working, not a rendering fault. If you would rather
the slot showed something busier, swap it for the vision simulator or the
appearance screen.

## Pre-submission checklist

- [x] `manifest.json` name and description match this file
- [x] Version bumped
- [x] Icons present at 16 / 48 / 128
- [x] Privacy policy published: https://danish2598.github.io/chat-manager-pro/privacy-policy.html
- [x] Trademark disclaimer present at the end of the description
- [x] No Anthropic logo, wordmark, or brand colours in icon or screenshots
- [x] Screenshots generated (`python3 tools_screenshots.py --render`) — no real chat titles in them
- [ ] Publisher contact email added **and verified** — publishing is blocked
      without it (Settings → Profile → Add email)
- [x] Trader status: **non-trader** — free extension, no monetization, and it
      keeps the publisher's address off the public listing. Revisit if a paid
      tier is ever added.

- [ ] Tested on a clean Chrome profile, installed unpacked, from a cold load
- [x] Bulk delete executed successfully on **Claude**
- [ ] Bulk delete executed successfully on **ChatGPT** — a separate mechanism, see below
- [ ] `tools_verify.js` run on each site with no FAIL lines

### Claude passing does not cover ChatGPT

The two adapters share no code on the operation that matters:

| | Claude | ChatGPT |
|---|---|---|
| Auth | session cookie | bearer token from `/api/auth/session` |
| Verb | `DELETE` | `PATCH` |
| Semantics | removes the conversation | clears `is_visible` |

Claude working confirms the panel, the selection model, the undo window, the
rate limiting and the progress reporting — all shared. It confirms nothing
about whether ChatGPT's token fetch succeeds or its request body is the shape
that site expects.

The listing names ChatGPT, so if that call is wrong the listing promises a
feature that does not work, which is a removal reason. One throwaway chat
settles it.

### Why bulk delete blocks the submission

It is the headline feature, it is irreversible, and it is the one thing that has
never been executed. The listing promises it on two sites whose endpoints were
written defensively against shapes that were never confirmed.

If the delete call is wrong, the failure is not cosmetic. Either nothing is
deleted — and the store listing is then a false claim, which is a removal
reason — or the wrong request succeeds against real accounts. Neither is
recoverable after publication, and an extension cannot be un-shipped from the
people who already installed it.

One throwaway chat on each site settles it in two minutes.

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
