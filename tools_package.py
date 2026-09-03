"""
Builds the upload ZIP for the Chrome Web Store.

Ships only what the extension runs on. Development files — the icon and
package generators, the console diagnostic, the test plan, listing copy and
the hosted privacy policy — stay in the repo and out of the package: they add
nothing at runtime and only widen what a reviewer has to read.
"""
import json, pathlib, zipfile

SHIP = [
    'manifest.json',
    'background.js', 'content.js', 'content.css',
    'sites.js', 'lock-crypto.js',
    'popup.html', 'popup.js', 'popup.css',
    'icons/icon-16.png', 'icons/icon-48.png', 'icons/icon-128.png',
    'LICENSE',
]

version = json.load(open('manifest.json'))['version']
out = pathlib.Path(f'dist/chat-manager-pro-{version}.zip')
out.parent.mkdir(exist_ok=True)

missing = [f for f in SHIP if not pathlib.Path(f).exists()]
if missing:
    raise SystemExit(f'missing files: {missing}')

with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in SHIP:
        z.write(f)

size = out.stat().st_size
print(f'{out}  —  {len(SHIP)} files, {size / 1024:.1f} KiB')
for f in SHIP:
    print(f'   {f}')
