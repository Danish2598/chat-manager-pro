# Testing Chat Manager Pro

Work through this in order. Steps 1–3 take about five minutes and tell you
whether the risky parts actually work on your build of the site.

---

## 1. Install it

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top-right toggle)
3. Click **Load unpacked** and select this folder
4. Confirm the install prompt says **"Read and change your data on claude.ai"**
   and nothing more. If it asks for anything else, stop — something is wrong
   with the manifest.
5. Open <https://claude.ai> in a **new tab**

> Content scripts only inject on page load. A claude.ai tab that was already
> open before you installed will not have the extension until you reload it.

**Expect:** a round ☑ button at the bottom-right of the page.

---

## 2. Run the diagnostic — do this before anything else

This is the step that closes the biggest unknown. The API endpoints and blur
selectors were written defensively against markup that could not be verified
during development; this tells you which ones are real.

1. On claude.ai, open DevTools (<kbd>F12</kbd> or <kbd>⌥⌘I</kbd>) → **Console**
2. Chrome blocks pasting into the console the first time. If prompted, type
   `allow pasting` and press Enter.
3. Paste the whole contents of [`tools_verify.js`](tools_verify.js) and run it

It is **read-only** — it never deletes, modifies or sends anything.

**Reading the output**

| Result | Meaning |
|---|---|
| Sections 1–3 all PASS | API mode works. Real timestamps, full list, fast deletes. |
| Section 3 FAILs | The extension will fall back to DOM mode. Expect a "limited mode" badge and no date filtering. |
| A section 5 target shows **0 matched** | That blur toggle will do nothing. Fix the selector list in the `PRIVACY BLUR` block of `content.css`. |

Run it **twice**: once on the home screen, then again with a conversation open.
Message, media and input selectors can only match when a conversation is on
screen.

---

## 3. Test deletion on one throwaway chat first

Deletion is permanent. Do not point this at real chats until you have seen it
work once.

1. Start a new chat, send one message ("test"), so it appears in the sidebar
2. Open the panel, search for it, tick **only** that chat
3. Click **Delete 1**
4. In the confirmation, check the title shown is the throwaway one
5. Leave **Download a JSON backup** ticked — confirm the file lands in Downloads
6. Confirm, then let the 10-second countdown run out
7. Check the chat is gone from Claude's own sidebar after a refresh

Then repeat once and press **Undo** during the countdown — confirm the chat
survives.

---

## 4. Feature checklist

### List management
- [ ] Panel opens from the ☑ button, and from the toolbar popup
- [ ] Chats load; the count in the footer matches what you see
- [ ] Search filters as you type; the ✕ clears it
- [ ] Sort: newest, oldest, A–Z, Z–A each reorder correctly
- [ ] Filter: today / this week / this month / older
- [ ] Search + sort + filter all applied together give a sensible result
- [ ] Clicking a row toggles it; the row highlights
- [ ] **Shift-click** selects a range
- [ ] **Select all** only selects what is currently visible after filtering
- [ ] **None** clears the selection
- [ ] The ↗ on a row opens that chat without toggling the checkbox
- [ ] Sort and filter choices survive closing and reopening the panel

### Deletion
- [ ] Delete button is hidden at 0 selected
- [ ] Confirmation lists every selected title
- [ ] Cancel leaves everything intact
- [ ] Undo during the countdown cancels it
- [ ] Progress shows "Deleting n of N"
- [ ] **Stop** mid-run halts it, and already-deleted chats stay deleted
- [ ] Deleting the chat you are currently viewing redirects you to a new chat

### Privacy blur
- [ ] Eye button in the panel header toggles it
- [ ] <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>B</kbd> toggles it
- [ ] Each of the five targets blurs only its own content
- [ ] Hovering reveals; moving away re-blurs
- [ ] Turning off **Reveal on hover** means hovering does nothing
- [ ] Light / medium / heavy visibly differ
- [ ] **Reload the page with blur on — content must not flash before blurring**
- [ ] The panel's own buttons and search box are never blurred
- [ ] The delete confirmation list is never blurred

### Screen lock
- [ ] Set a password in the popup; mismatched entries are rejected
- [ ] 🔒 in the panel header locks
- [ ] <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>L</kbd> locks
- [ ] Wrong password shows an error and shakes
- [ ] Correct password unlocks
- [ ] <kbd>Esc</kbd> does **not** dismiss the lock
- [ ] <kbd>Tab</kbd> cannot move focus into the page behind the lock
- [ ] **Reload while locked — it stays locked, and nothing flashes**
- [ ] With two claude.ai tabs open, locking one locks both
- [ ] **Remove password** in the popup unlocks and clears it

---

## 5. Edge cases

- [ ] Search with no matches shows "No chats match …"
- [ ] Signed out: panel shows the error state, not a blank list
- [ ] A very long chat title truncates instead of breaking the layout
- [ ] Several hundred chats: the list still scrolls smoothly
- [ ] Both light and dark system themes look correct
- [ ] Narrow window: the panel does not create a horizontal scrollbar

---

## 6. Before publishing

- [ ] DevTools console shows **no errors or warnings** from the extension
- [ ] `chrome://extensions` shows no "Errors" button on the card
- [ ] Service worker (the "service worker" link on the card) logs nothing unexpected
- [ ] Test on a **clean Chrome profile** with no other extensions — this catches
      shortcut conflicts and CSS collisions your daily profile hides
- [ ] Reinstall from scratch and confirm defaults seed correctly on first run

---

## Reporting a problem

Note which of these you saw, it narrows the cause immediately:

- **Diagnostic section 3 failed** → API shape changed. Fix `CFG` in `content.js`.
- **A blur target matched 0 elements** → selector list in `content.css`.
- **"Limited mode" badge** → running on the DOM fallback; same as the first case.
- **Nothing at all appears** → content script did not load. Check
  `chrome://extensions` for a red Errors button.
