/**
 * Chat Manager Pro — service worker.
 *
 * Minimal by design. The panel and the blur both live in the content script,
 * and the popup communicates through chrome.storage, so there is no message
 * relay to run here. Two jobs only: seed defaults, and forward the keyboard
 * shortcut.
 */
'use strict';

const PREFS_KEY = 'cmp.prefs';
const PRIVACY_KEY = 'cmp.privacy';
const PRIVACY_SIGNAL = 'cmp.privacySignal';
const LOCK_KEY = 'cmp.lock';
const LOCK_SIGNAL = 'cmp.lockSignal';
const SITES_KEY = 'cmp.sites';

const DEFAULTS = { sort: 'newest', filter: 'all' };
const PRIVACY_DEFAULTS = {
  on: false, titles: true, messages: true, media: true,
  account: true, input: true, hover: true, strength: 'medium',
};
const LOCK_DEFAULTS = { record: null, locked: false };
const SITES_DEFAULTS = { claude: true, chatgpt: true, gemini: true };

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason !== 'install') return;
  chrome.storage.local.get([PREFS_KEY, PRIVACY_KEY, LOCK_KEY, SITES_KEY], (res) => {
    const seed = {};
    if (!res || !res[PREFS_KEY]) seed[PREFS_KEY] = DEFAULTS;
    if (!res || !res[PRIVACY_KEY]) seed[PRIVACY_KEY] = PRIVACY_DEFAULTS;
    if (!res || !res[LOCK_KEY]) seed[LOCK_KEY] = LOCK_DEFAULTS;
    if (!res || !res[SITES_KEY]) seed[SITES_KEY] = SITES_DEFAULTS;
    if (Object.keys(seed).length) chrome.storage.local.set(seed);
  });
});

// Alt+Shift+B. Writing a changing value fires storage.onChanged in the content
// script, which flips the blur. Going through storage rather than
// chrome.tabs.sendMessage is what keeps "storage" our only permission.
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-privacy') {
    chrome.storage.local.set({ [PRIVACY_SIGNAL]: Date.now() });
  } else if (command === 'toggle-lock') {
    chrome.storage.local.set({ [LOCK_SIGNAL]: Date.now() });
  }
});
