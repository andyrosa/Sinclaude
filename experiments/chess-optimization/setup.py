"""Download pinned tools into the ignored tools directory; no system install."""
from pathlib import Path
from urllib.request import urlretrieve
import hashlib
import zipfile
import json

root = Path(__file__).resolve().parent
tools = root / 'tools'
tools.mkdir(exist_ok=True)
downloads = {
    'mdl.jar': 'https://github.com/santiontanon/mdlz80optimizer/releases/download/v2.6.3/mdl.jar',
    'CEdev-Windows.zip': 'https://github.com/CE-Programming/toolchain/releases/download/v15.0/CEdev-Windows.zip',
}
manifest = {}
for name, url in downloads.items():
    path = tools / name
    if not path.exists():
        urlretrieve(url, path)
    manifest[name] = {'url': url, 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
if not (tools / 'CEdev/bin/ez80-clang.exe').exists():
    with zipfile.ZipFile(tools / 'CEdev-Windows.zip') as archive:
        for name in archive.namelist():
            if not (tools / name).resolve().is_relative_to(tools.resolve()):
                raise ValueError('Archive member escapes tools directory')
        archive.extractall(tools)
(root / 'tools-manifest.json').write_text(json.dumps(manifest, indent=2)+'\n')
print('Tools ready; hashes recorded in tools-manifest.json.')
