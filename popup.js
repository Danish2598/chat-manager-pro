/**
 * Chat Manager Pro — toolbar popup.
 *
 * Deliberately thin: the real UI is the in-page panel. This is a launcher and
 * a settings surface. It talks to the content script through chrome.storage
 * rather than tab messaging, which is what lets the extension ship with
 * "storage" as its only permission.
 */
'use strict';

const PREFS_KEY = 'cmp.prefs';
const PRIVACY_KEY = 'cmp.privacy';
const LOCK_KEY = 'cmp.lock';
const SITES_KEY = 'cmp.sites';
const THEME_KEY = 'cmp.theme';
const SIGNAL_KEY = 'cmp.toggleSignal';
const LOCK_SIGNAL = 'cmp.lockSignal';

const DEFAULTS = { sort: 'newest', filter: 'all' };
const SITES_DEFAULTS = { claude: true, chatgpt: true, gemini: true };
const THEME_DEFAULTS = { font: 'system', size: 'medium', density: 'comfortable', accent: 'default' };
const PRIVACY_DEFAULTS = {
  on: false, titles: true, messages: true, media: true,
  account: true, input: true, hover: true, strength: 'medium',
};

const $ = (id) => document.getElementById(id);

const openBtn = $('open');
const sortSel = $('sort');
const filterSel = $('filter');

// Privacy controls, keyed by the privacy setting each one drives.
const P = {
  on: $('p-on'),
  titles: $('p-titles'),
  messages: $('p-messages'),
  media: $('p-media'),
  account: $('p-account'),
  input: $('p-input'),
  hover: $('p-hover'),
  strength: $('p-strength'),
};
const optsBox = $('p-opts');

// Per-site switches. The content script reads this and goes fully inert on a
// site that is turned off.
const S = {
  claude: $('s-claude'),
  chatgpt: $('s-chatgpt'),
  gemini: $('s-gemini'),
};

function saveSites() {
  const sites = {};
  Object.entries(S).forEach(([id, node]) => { sites[id] = node.checked; });
  chrome.storage.local.set({ [SITES_KEY]: sites });
}

Object.values(S).forEach((node) => node.addEventListener('change', saveSites));

/* ---------- chat list appearance ---------- */
const T = {
  font: $('t-font'),
  size: $('t-size'),
  density: $('t-density'),
  accent: $('t-accent'),
};
const themeMsg = $('t-msg');

/** The popup wears the accent you chose, so the setting shows its own effect. */
function applyAccent(accent) {
  if (accent && accent !== 'default') document.body.dataset.accent = accent;
  else delete document.body.dataset.accent;
}

function saveTheme() {
  const value = {};
  Object.entries(T).forEach(([key, node]) => { value[key] = node.value; });
  chrome.storage.local.set({ [THEME_KEY]: value });
  applyAccent(value.accent);
  themeMsg.textContent = '';
}

Object.values(T).forEach((node) => node.addEventListener('change', saveTheme));

// Reset touches appearance only. A colour you dislike should never cost you
// your sort order, blur settings or screen-lock password.
$('t-reset').addEventListener('click', () => {
  Object.entries(T).forEach(([key, node]) => { node.value = THEME_DEFAULTS[key]; });
  applyAccent(THEME_DEFAULTS.accent);
  chrome.storage.local.set({ [THEME_KEY]: { ...THEME_DEFAULTS } }, () => {
    themeMsg.textContent = 'Appearance reset. Other settings untouched.';
  });
});

/* ---------- screen lock ---------- */
const lockUnset = $('lock-unset');
const lockReady = $('lock-ready');
const lockMsg = $('lock-msg');
const lockPw = $('lock-pw');
const lockPw2 = $('lock-pw2');

function showLockState(hasPassword) {
  lockUnset.hidden = hasPassword;
  lockReady.hidden = !hasPassword;
}

function say(text, isError) {
  lockMsg.textContent = text;
  lockMsg.classList.toggle('msg-error', Boolean(isError));
}

$('lock-save').addEventListener('click', async () => {
  const a = lockPw.value;
  const b = lockPw2.value;
  if (a.length < 4) return say('Use at least 4 characters.', true);
  if (a !== b) return say('Passwords do not match.', true);

  // window.cmpCrypto stores a PBKDF2 derivation — never the password itself.
  const record = await window.cmpCrypto.create(a);
  chrome.storage.local.set({ [LOCK_KEY]: { record, locked: false } }, () => {
    lockPw.value = '';
    lockPw2.value = '';
    showLockState(true);
    say('Password set.');
  });
});

$('lock-remove').addEventListener('click', () => {
  chrome.storage.local.set({ [LOCK_KEY]: { record: null, locked: false } }, () => {
    showLockState(false);
    say('Password removed.');
  });
});

$('lock-now').addEventListener('click', () => {
  chrome.storage.local.set({ [LOCK_SIGNAL]: Date.now() }, () => window.close());
});

/* ---------- load ---------- */
chrome.storage.local.get([PREFS_KEY, PRIVACY_KEY, LOCK_KEY, SITES_KEY, THEME_KEY], (res) => {
  showLockState(Boolean(res && res[LOCK_KEY] && res[LOCK_KEY].record));

  const sites = { ...SITES_DEFAULTS, ...(res && res[SITES_KEY]) };
  Object.entries(S).forEach(([id, node]) => { node.checked = sites[id] !== false; });

  const t = { ...THEME_DEFAULTS, ...(res && res[THEME_KEY]) };
  Object.entries(T).forEach(([key, node]) => { node.value = t[key]; });
  applyAccent(t.accent);
  const prefs = { ...DEFAULTS, ...(res && res[PREFS_KEY]) };
  sortSel.value = prefs.sort;
  filterSel.value = prefs.filter;

  const privacy = { ...PRIVACY_DEFAULTS, ...(res && res[PRIVACY_KEY]) };
  Object.entries(P).forEach(([key, node]) => {
    if (node.type === 'checkbox') node.checked = Boolean(privacy[key]);
    else node.value = privacy[key];
  });
  reflectEnabled();
});

/* ---------- save ---------- */
function savePrefs() {
  chrome.storage.local.set({
    [PREFS_KEY]: { sort: sortSel.value, filter: filterSel.value },
  });
}

function savePrivacy() {
  const privacy = {};
  Object.entries(P).forEach(([key, node]) => {
    privacy[key] = node.type === 'checkbox' ? node.checked : node.value;
  });
  chrome.storage.local.set({ [PRIVACY_KEY]: privacy });
  reflectEnabled();
}

/** Dim the sub-options when the master switch is off. */
function reflectEnabled() {
  optsBox.classList.toggle('disabled', !P.on.checked);
}

sortSel.addEventListener('change', savePrefs);
filterSel.addEventListener('change', savePrefs);
Object.values(P).forEach((node) => node.addEventListener('change', savePrivacy));

/* ---------- launch ---------- */
// Writing a changing value fires storage.onChanged in the content script,
// which toggles the panel. The timestamp guarantees the value always differs.
openBtn.addEventListener('click', () => {
  chrome.storage.local.set({ [SIGNAL_KEY]: Date.now() }, () => window.close());
});
