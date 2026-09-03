/**
 * Chat Manager Pro — read-only diagnostic.
 *
 * Paste into the DevTools console on an open, signed-in claude.ai tab.
 * It reports whether the endpoints and selectors the extension relies on
 * actually match this build of the site.
 *
 * SAFE: this only reads. It never deletes, modifies or sends anything.
 * The selector lists below mirror CFG in content.js and the PRIVACY BLUR
 * block in content.css — if you edit those, edit these to match.
 */
(async () => {
  const pass = (m, d) => console.log('%c PASS ', 'background:#2f7d55;color:#fff', m, d ?? '');
  const warn = (m, d) => console.log('%c WARN ', 'background:#8a6d1f;color:#fff', m, d ?? '');
  const fail = (m, d) => console.log('%c FAIL ', 'background:#a93831;color:#fff', m, d ?? '');
  const head = (m) => console.log(`\n%c${m}`, 'font-weight:bold;font-size:13px');

  const cookie = (name) => {
    const m = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    return m ? decodeURIComponent(m[1]) : null;
  };

  head('1. Extension loaded');
  if (window.__cmpLoaded) pass('content script is running');
  else fail('content script NOT running — reload the tab after installing');
  if (document.getElementById('cmp-root')) pass('panel container injected');
  else warn('panel container missing (expected if the script failed to load)');

  head('2. Organization id');
  let org = cookie('lastActiveOrg');
  if (org) pass('found via lastActiveOrg cookie', org);
  else warn('lastActiveOrg cookie absent — falling back to /api/organizations');

  if (!org) {
    try {
      const r = await fetch('/api/organizations', {
        credentials: 'same-origin', headers: { accept: 'application/json' },
      });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const body = await r.json();
      const list = Array.isArray(body) ? body : body?.data;
      org = list?.find((o) => o?.uuid)?.uuid;
      if (org) pass('found via /api/organizations', org);
      else fail('/api/organizations returned no uuid', body);
    } catch (e) {
      fail('/api/organizations failed', e.message);
    }
  }

  head('3. Conversation list endpoint');
  if (!org) {
    fail('skipped — no organization id');
  } else {
    const url = `/api/organizations/${org}/chat_conversations?limit=100&offset=0`;
    try {
      const r = await fetch(url, {
        credentials: 'same-origin', headers: { accept: 'application/json' },
      });
      console.log('   request:', url, '->', r.status);
      if (!r.ok) {
        fail(`list returned HTTP ${r.status} — extension will fall back to DOM mode`);
      } else {
        const body = await r.json();
        const list = Array.isArray(body) ? body : body?.data;
        if (!Array.isArray(list)) {
          fail('unexpected response shape — extension falls back to DOM mode', body);
        } else {
          pass(`returned ${list.length} conversations`);
          const s = list[0];
          if (!s) { warn('list is empty — create a chat and re-run'); }
          else {
            console.log('   first record keys:', Object.keys(s).join(', '));
            const need = { uuid: s.uuid ?? s.id, name: s.name ?? s.title,
                           updated: s.updated_at ?? s.updatedAt };
            Object.entries(need).forEach(([k, v]) =>
              v !== undefined ? pass(`field "${k}" present`, v)
                              : fail(`field "${k}" MISSING — update normalise() in content.js`));
            if (need.updated === undefined) {
              warn('no timestamp field means sorting by date and the date filter will not work');
            }
          }
        }
      }
    } catch (e) {
      fail('list request threw', e.message);
    }
  }

  head('4. Delete endpoint (shape only — nothing is deleted)');
  if (org) {
    console.log(`   the extension will DELETE /api/organizations/${org}/chat_conversations/<uuid>`);
    warn('cannot be verified read-only. Test it on ONE throwaway chat first.');
  }

  head('5. Blur selectors — how many elements each one matches here');
  const targets = {
    'chat titles':   ['nav a[href^="/chat/"]', 'aside a[href^="/chat/"]', 'li a[href^="/chat/"]'],
    'messages':      ['[data-testid="user-message"]', '[data-testid="assistant-message"]',
                      '[data-testid="chat-message"]', '.font-claude-message', 'main .prose'],
    'media':         ['main img', 'main video', 'main canvas', '[data-testid="file-thumbnail"]'],
    'account':       ['[data-testid="user-menu-button"]', '[data-testid="account-menu"]',
                      'nav footer', 'aside footer'],
    'message input': ['main [contenteditable="true"]', 'main .ProseMirror', 'main textarea',
                      '[data-testid="chat-input"]', 'fieldset [contenteditable="true"]'],
  };

  for (const [label, sels] of Object.entries(targets)) {
    let total = 0;
    const hits = sels.map((s) => {
      let n = 0;
      try { n = document.querySelectorAll(s).length; } catch { n = -1; }
      total += Math.max(n, 0);
      return `${s} → ${n < 0 ? 'invalid' : n}`;
    });
    (total > 0 ? pass : fail)(`${label}: ${total} element(s) matched`);
    hits.forEach((h) => console.log('     ', h));
    if (total === 0) {
      console.log(`      %cNo match. Open the relevant view, re-run, and if still zero,`
        + ` add a working selector to the "${label}" list in content.css.`,
        'color:#a93831');
    }
  }

  head('Done');
  console.log('Open a conversation and re-run to test the message and input selectors.');
})();
