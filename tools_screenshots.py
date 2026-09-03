"""
Builds Chrome Web Store screenshots at exactly 1280x800.

Renders the real panel and popup stylesheets over a neutral chat-app mock —
neutral on purpose: a store screenshot must not reproduce another company's
interface or branding, and a mock cannot leak real conversation titles.

Writes store-assets/*.html, then render them with:
    python3 tools_screenshots.py --render
"""
import pathlib, re, subprocess, sys

OUT = pathlib.Path('store-assets')
OUT.mkdir(exist_ok=True)
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'

CONTENT_CSS = pathlib.Path('content.css').read_text()
POPUP_CSS = pathlib.Path('popup.css').read_text()

TITLES = ['Quarterly planning notes', 'Refactor the billing module', 'Trip itinerary for March',
          'Recipe ideas for the weekend', 'Draft reply to the landlord', 'SQL join explanation',
          'Book recommendations', 'Interview prep questions', 'Budget spreadsheet formulas',
          'Fix the printer driver', 'Summarise this contract', 'Learning Spanish basics']

SHELL = """<!doctype html><html><head><meta charset="utf-8"><style>
*{{box-sizing:border-box}}
html,body{{margin:0;width:1280px;height:800px;overflow:hidden;
  font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  background:#e8ebf2}}
.caption{{height:150px;padding:34px 56px;background:linear-gradient(135deg,#524AE8,#863CD8);color:#fff}}
.caption h2{{margin:0 0 7px;font-size:32px;font-weight:700;letter-spacing:-.02em}}
.caption p{{margin:0;font-size:17px;opacity:.9;font-weight:400}}
.shot{{position:relative;height:650px;overflow:hidden;background:#fff}}
/* neutral chat-app mock */
.mock{{position:absolute;inset:0;display:flex;background:#fbfbfa}}
.side{{width:290px;flex:none;border-right:1px solid #eceae5;padding:18px 0;background:#f7f6f4}}
.side h3{{margin:0 0 12px;padding:0 18px;font-size:12px;letter-spacing:.06em;
  text-transform:uppercase;color:#9a978f}}
.side .item{{padding:9px 18px;font-size:13.5px;color:#2b2926;white-space:nowrap;
  overflow:hidden;text-overflow:ellipsis}}
.side .item.sel{{background:#eceaf6}}
.blurred{{filter:blur(7px)}}
.main{{flex:1;padding:44px 56px}}
.bubble{{max-width:520px;padding:15px 18px;border-radius:14px;background:#f2f1ee;
  font-size:14.5px;line-height:1.6;color:#3a3835;margin-bottom:14px}}
.bubble.me{{background:#524AE8;color:#fff;margin-left:auto}}
</style></head><body>
<div class="caption"><h2>{h}</h2><p>{s}</p></div>
<div class="shot">{body}</div>
</body></html>"""


def sidebar(sel=(), blur=False, sharp=None):
    rows = []
    for i, t in enumerate(TITLES):
        cls = 'item'
        if i in sel:
            cls += ' sel'
        if blur and i != sharp:
            cls += ' blurred'
        rows.append(f'<div class="{cls}">{t}</div>')
    return f'<div class="mock"><div class="side"><h3>Chats</h3>{"".join(rows)}</div>' \
           f'<div class="main"><div class="bubble me">Can you summarise this?</div>' \
           f'<div class="bubble">Of course — here is a short summary of the key points…</div>' \
           f'</div></div>'


def panel(items_html, count_text, footer_html, extra=''):
    # The override must come after content.css, which sets position:fixed and
    # would otherwise win on source order.
    return f"""<style>{CONTENT_CSS}
#cmp-root{{position:absolute !important;inset:0 !important}}</style>
<div id="cmp-root" class="cmp-root cmp-open">
 <aside class="cmp-panel">
  <div class="cmp-header"><div class="cmp-title-wrap"><span class="cmp-title">Chat Manager Pro</span>
   </div><div class="cmp-header-actions">
   <button class="cmp-icon-btn cmp-eye">&#128065;</button>
   <button class="cmp-icon-btn">&#128274;</button><button class="cmp-icon-btn">&#10005;</button></div></div>
  <div class="cmp-row cmp-search-row"><div class="cmp-search"><span class="cmp-search-icon">&#128269;</span>
   <input class="cmp-search-input" placeholder="Search chats&hellip;"><button class="cmp-clear">&#10005;</button></div></div>
  <div class="cmp-row cmp-controls">
   <label class="cmp-field"><span class="cmp-field-label">Sort</span><select class="cmp-select"><option>Newest first</option></select></label>
   <label class="cmp-field"><span class="cmp-field-label">Filter</span><select class="cmp-select"><option>All</option></select></label></div>
  <div class="cmp-row cmp-bulk"><button class="cmp-btn cmp-btn-ghost">Select all</button>
   <button class="cmp-btn cmp-btn-ghost">None</button><span class="cmp-count">{count_text}</span></div>
  <div class="cmp-list">{items_html}</div>
  <div class="cmp-footer">{footer_html}</div>
 </aside>{extra}</div>"""


def rows(sel, blur=False, sharp=None):
    out = []
    for i, t in enumerate(TITLES[:9]):
        blur_cls = ' blurred' if blur and i != sharp else ''
        checked = ' checked' if i in sel else ''
        cls = ' cmp-selected' if i in sel else ''
        meta = ['Today', 'Today', 'Yesterday', '3 days ago', '5 days ago',
                '6 days ago', 'Last week', 'Last week', '12 Aug 2026'][i]
        out.append(f'<div class="cmp-item{cls}"><input type="checkbox" class="cmp-checkbox"{checked}>'
                   f'<div class="cmp-item-body"><div class="cmp-item-title{blur_cls}">{t}</div>'
                   f'<div class="cmp-item-meta">{meta}</div></div></div>')
    return ''.join(out)


SEL = {0, 2, 4, 7}
FOOT = ('<button class="cmp-btn cmp-btn-ghost">Refresh</button>'
        '<button class="cmp-btn cmp-btn-danger">Delete 4</button>')

SHOTS = {}

SHOTS['1-bulk-delete'] = SHELL.format(
    h='Delete dozens of chats at once',
    s='Click a row, or shift-click a range. Select All respects your search and filter.',
    body=sidebar(sel=SEL) + panel(rows(SEL), '4 selected &middot; 12 shown', FOOT))

confirm = """<div class="cmp-modal-overlay"><div class="cmp-modal">
 <div class="cmp-modal-title">Delete 4 chats?</div>
 <div class="cmp-modal-sub">This permanently removes them from your account.</div>
 <div class="cmp-modal-list">""" + ''.join(
    f'<div class="cmp-modal-item">{TITLES[i]}</div>' for i in sorted(SEL)) + """</div>
 <label class="cmp-modal-check"><input type="checkbox" checked><span>Download a JSON backup of the list first</span></label>
 <div class="cmp-modal-actions"><button class="cmp-btn cmp-btn-ghost">Cancel</button>
 <button class="cmp-btn cmp-btn-danger">Delete</button></div></div></div>"""

SHOTS['2-confirm'] = SHELL.format(
    h='It shows you exactly what goes',
    s='Every title listed, an optional backup, and ten seconds to undo before anything is deleted.',
    body=sidebar(sel=SEL) + panel(rows(SEL), '4 selected &middot; 12 shown', FOOT, extra=confirm))

SHOTS['3-privacy-blur'] = SHELL.format(
    h='Blur your chats in public',
    s='Titles, messages, images and the message box stay hidden until you hover them.',
    body=sidebar(blur=True, sharp=3) + panel(rows(set(), blur=True, sharp=3), '0 selected &middot; 12 shown',
        '<button class="cmp-btn cmp-btn-ghost">Refresh</button>'))

lock = """<div class="cmp-lock"><div class="cmp-lock-card">
 <div class="cmp-lock-icon">&#128274;</div>
 <div class="cmp-lock-title">Screen locked</div>
 <div class="cmp-lock-sub">Enter your password to continue.</div>
 <input class="cmp-lock-input" type="password" value="&bull;&bull;&bull;&bull;&bull;&bull;&bull;&bull;">
 <button class="cmp-lock-btn">Unlock</button><div class="cmp-lock-error"></div></div></div>"""

SHOTS['4-screen-lock'] = SHELL.format(
    h='Lock the screen when you step away',
    s='One shortcut locks every tab. Your password is never stored, only a salted hash.',
    body=sidebar(blur=True, sharp=-1) + panel(rows(set(), blur=True, sharp=-1), '0 selected', '', extra=lock))

popup_src = pathlib.Path('popup.html').read_text()
popup_src = popup_src.replace('<link rel="stylesheet" href="popup.css" />',
                              f'<style>{POPUP_CSS}</style>')
popup_src = re.sub(r'<script src="[^"]+"></script>', '', popup_src)
# Show a configured install rather than a blank one.
for _id in ('s-claude', 's-chatgpt', 's-gemini', 'p-on', 'p-titles', 'p-messages',
            'p-media', 'p-account', 'p-input', 'p-hover'):
    popup_src = popup_src.replace(f'id="{_id}" />', f'id="{_id}" checked />')
for _id, _txt in [('st-sites', '3 of 3 active'), ('st-privacy', 'On &middot; 5 of 5 targets &middot; medium'),
                  ('st-lock', 'Password set'), ('st-appearance', 'Default'), ('st-vision', 'Off')]:
    popup_src = re.sub(rf'(id="{_id}"[^>]*>)[^<]*', rf'\g<1>{_txt}', popup_src)
(OUT / '_popup.html').write_text(popup_src)

SHOTS['5-settings'] = SHELL.format(
    h='One permission. Nothing leaves your browser.',
    s='No account, no tracking, no analytics. Turn it on only for the sites you want.',
    body=sidebar() + '<iframe src="_popup.html" scrolling="no" style="position:absolute;'
         'top:22px;right:56px;width:360px;height:600px;border:0;border-radius:16px;'
         'box-shadow:0 26px 64px rgba(0,0,0,.26)"></iframe>')

for name, html in SHOTS.items():
    (OUT / f'{name}.html').write_text(html)
    print(f'store-assets/{name}.html')

if '--render' in sys.argv:
    print()
    for name in SHOTS:
        src = (OUT / f'{name}.html').resolve()
        png = (OUT / f'{name}.png').resolve()
        subprocess.run([CHROME, '--headless', '--disable-gpu', '--hide-scrollbars',
                        f'--screenshot={png}', '--window-size=1280,800',
                        f'file://{src}'], capture_output=True)
        print(f'{png.name}  {png.stat().st_size // 1024} KiB' if png.exists() else f'{name}: FAILED')
