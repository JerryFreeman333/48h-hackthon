"""Record licenses from the installed, pinned dependency wheels (no network)."""
import hashlib
import importlib.metadata as metadata
import json
from pathlib import Path

PACKAGES=['beautifulsoup4','pdfplumber','pypdfium2','soupsieve','typing_extensions','pdfminer.six','Pillow','charset-normalizer','cryptography','cffi','pycparser']
root=Path(__file__).resolve().parent
out=root/'v2/licenses/dependencies'
manifest=[]
for name in PACKAGES:
    dist=metadata.distribution(name)
    for file in dist.files or []:
        if not any(part in str(file).lower() for part in ('license','notice','copying','authors')): continue
        source=dist.locate_file(file)
        if not source.is_file(): continue
        relative=Path(*Path(str(file)).parts[1:])
        target=out/name/relative
        target.parent.mkdir(parents=True,exist_ok=True)
        data=source.read_bytes(); target.write_bytes(data)
        manifest.append({'package':name,'version':dist.version,'installed_path':str(file),'local_path':target.relative_to(root).as_posix(),'sha256':hashlib.sha256(data).hexdigest()})
(root/'v2/licenses/dependency-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
(root/'requirements-v2-lock.txt').write_text('# Validated Python 3.12 Windows dependency set; review wheels on other platforms.\n'+'\n'.join(name+'=='+metadata.version(name) for name in PACKAGES)+'\n',encoding='utf-8')
print('Recorded',len(manifest),'license/notice files from',len(PACKAGES),'packages.')
