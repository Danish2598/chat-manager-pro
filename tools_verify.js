/**
 * Chat Manager Pro — read-only diagnostic.
 *
 * Paste into the DevTools console on a signed-in claude.ai, chatgpt.com or
 * gemini.google.com tab, then send the output back.
 *
 * SAFE: only reads. Never deletes, modifies or sends anything.
 *
 * NOTE ON CONTEXT: the console runs in the page's world, while the extension
 * runs in an isolated world with its own `window`. So this script deliberately
 * checks only things both worlds share — the DOM, classes on <html>, and
 * same-origin endpoints. It never reads extension internals.
 */
(async () => {
  const P = (m, d) => console.log('%c PASS ', 'background:#2f7d55;color:#fff', m, d ?? '');
  const W = (m, d) => console.log('%c WARN ', 'background:#8a6d1f;color:#fff', m, d ?? '');
  const F = (m, d) => console.log('%c FAIL ', 'background:#a93831;color:#fff', m, d ?? '');
  const H = (m) => console.log(`\n%c${m}`, 'font-weight:bold;font-size:13px');

  const HOST = location.hostname;
  const SITE =
    /(^|\.)claude\.ai$/i.test(HOST) ? 'claude' :
    /(^|\.)chatgpt\.com$|(^|\.)chat\.openai\.com$/i.test(HOST) ? 'chatgpt' :
    /(^|\.)gemini\.google\.com$/i.test(HOST) ? 'gemini' : null;

  H('1. Is the extension running here?');
  console.log('   host:', HOST, '| detected site:', SITE || 'UNSUPPORTED');
  if (!SITE) {
    F('this host is not one the extension supports');
    return;
  }

  const root = document.getElementById('cmp-root');
  if (root) {
    P('panel container is present — the content script ran');
  } else {
    F('panel container missing');
    console.log('   Most likely one of:');
    console.log('     a) the extension was reloaded but THIS TAB was not — reload the page');
    console.log('     b) this site is switched off in the popup under "Active on"');
    console.log('     c) the extension failed to load — check chrome://extensions for a red Errors button');
  }

  const fab = root && root.querySelector('.cmp-fab');
  if (root) (fab ? P : W)(fab ? 'launcher button rendered' : 'launcher button not rendered');

  H('2. Classes currently applied to <html>');
  const classes = [...document.documentElement.classList].filter((c) => c.startsWith('cmp-'));
  if (classes.length) P(classes.join('  '));
  else W('none — blur is off and appearance is on its defaults (both are opt-in)');
  console.log('   Expected when blur is ON:    cmp-privacy-on plus cmp-blur-*');
  console.log('   Expected when a theme is set: cmp-font-*, cmp-size-*, cmp-density-*, cmp-accent-*');

  H('3. Do the title selectors match anything here?');
  const TITLES = ['a[href^="/chat/"]', 'a[href^="/cowork/"]', 'a[href^="/code/"]',
    'a[href^="/project/"]', 'a[href^="/projects/"]', 'a[href^="/artifacts/"]',
    'a[href^="/recents/"]', 'a[href^="/c/"]', 'a[href^="/g/"]', 'a[href^="/app/"]',
    '[data-test-id="conversation"]', '.conversation-title', '.conversation'];
  let titleHits = 0;
  TITLES.forEach((s) => {
    let n = 0;
    try { n = document.querySelectorAll(s).length; } catch { n = -1; }
    if (n > 0) { titleHits += n; console.log(`     ${s} → ${n}`); }
  });
  (titleHits ? P : F)(`${titleHits} chat-title element(s) matched`);
  if (!titleHits) console.log('   Nothing matched — blur and appearance both need this fixed in content.css.');

  H('4. Other blur targets');
  const GROUPS = {
    messages: ['[data-testid="user-message"]', '[data-testid="assistant-message"]',
      '.font-claude-message', 'main .prose', '[data-message-author-role]',
      '[data-testid^="conversation-turn"]', 'main .markdown', 'message-content',
      '.model-response-text', 'user-query-content', '.query-text'],
    media: ['main img', 'main video', 'main canvas', '[data-testid="file-thumbnail"]'],
    account: ['[data-testid="user-menu-button"]', '[data-testid="account-menu"]',
      'nav footer', 'aside footer', '[data-testid="profile-button"]',
      '[data-testid="accounts-profile-button"]', '.user-name', '[aria-label^="Google Account"]'],
    'message input': ['main [contenteditable="true"]', 'main .ProseMirror', 'main textarea',
      '[data-testid="chat-input"]', '#prompt-textarea', 'rich-textarea', '.ql-editor'],
  };
  for (const [label, sels] of Object.entries(GROUPS)) {
    let total = 0;
    const hits = [];
    sels.forEach((s) => {
      let n = 0;
      try { n = document.querySelectorAll(s).length; } catch { n = -1; }
      if (n > 0) { total += n; hits.push(`${s} → ${n}`); }
    });
    (total ? P : F)(`${label}: ${total} matched`);
    hits.forEach((h) => console.log('     ', h));
  }
  console.log('   Open a conversation and re-run — messages and input only exist there.');

  H('5. Route census — every internal link, by path shape');
  const census = {};
  document.querySelectorAll('a[href^="/"]').forEach((a) => {
    const parts = (a.getAttribute('href') || '').split('/');
    const key = parts.length > 2 && parts[2] ? `/${parts[1]}/<id>` : `/${parts[1] || '(root)'}`;
    census[key] = (census[key] || 0) + 1;
  });
  const rows = Object.entries(census).sort((a, b) => b[1] - a[1]);
  if (rows.length) console.table(Object.fromEntries(rows));
  else W('no internal links found — is the sidebar collapsed?');
  console.log('   Any /x/<id> row not covered in section 3 is a surface we are missing.');

  H('6. Conversation API');
  try {
    if (SITE === 'claude') {
      const org = (document.cookie.match(/(?:^|; )lastActiveOrg=([^;]*)/) || [])[1];
      console.log('   lastActiveOrg cookie:', org ? decodeURIComponent(org) : 'absent');
      const o = org ? decodeURIComponent(org)
        : (await (await fetch('/api/organizations', { credentials: 'same-origin' })).json())[0]?.uuid;
      const r = await fetch(`/api/organizations/${o}/chat_conversations?limit=5&offset=0`,
        { credentials: 'same-origin', headers: { accept: 'application/json' } });
      console.log('   list ->', r.status);
      if (r.ok) {
        const b = await r.json();
        const list = Array.isArray(b) ? b : b?.data;
        P(`returned ${list?.length ?? 0} record(s)`);
        if (list?.[0]) console.log('   first record keys:', Object.keys(list[0]).join(', '));
      } else F('list request failed — the panel will fall back to DOM mode');
    } else if (SITE === 'chatgpt') {
      const s = await (await fetch('/api/auth/session', { credentials: 'same-origin' })).json();
      (s && s.accessToken ? P : F)(s && s.accessToken ? 'access token obtained' : 'no access token — signed out?');
      if (s && s.accessToken) {
        const r = await fetch('/backend-api/conversations?offset=0&limit=5&order=updated',
          { credentials: 'same-origin', headers: { authorization: `Bearer ${s.accessToken}` } });
        console.log('   list ->', r.status);
        if (r.ok) {
          const b = await r.json();
          P(`returned ${b.items?.length ?? 0} of ${b.total ?? '?'} conversations`);
          if (b.items?.[0]) console.log('   first record keys:', Object.keys(b.items[0]).join(', '));
        } else F('list request failed — the panel will fall back to DOM mode');
      }
    } else {
      W('Gemini has no usable API — the panel reads the sidebar instead, and bulk delete is unavailable there by design');
    }
  } catch (e) {
    F('API probe threw', e.message);
  }

  H('Done — copy everything above');
})();
