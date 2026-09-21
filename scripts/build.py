#!/usr/bin/env python3
"""Build Paper Lettering from this repository without network access."""
import base64,json,shutil,sys,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'tools/lettering'))
from bundler import bundle

def main():
    project=json.loads((ROOT/'examples/project.json').read_text(encoding='utf-8'))
    for d in project['documents']:
        relative=Path(d['image'].pop('path'))
        if relative.is_absolute() or '..' in relative.parts:raise ValueError('Invalid example path')
        image=(ROOT/'examples'/relative).resolve();image.relative_to((ROOT/'examples').resolve())
        d['image']['dataURL']='data:image/png;base64,'+base64.b64encode(image.read_bytes()).decode('ascii')
    dest=ROOT/'dist/Paper-Lettering-0.6';dest.mkdir(parents=True,exist_ok=True)
    html,fonts,_=bundle(project,ROOT);(dest/'纸上文字.html').write_text(html,encoding='utf-8')
    shutil.copytree(ROOT/'tools/lettering/ai',dest/'ai',dirs_exist_ok=True,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
    shutil.copytree(ROOT/'resources/fonts/licenses',dest/'font-licenses',dirs_exist_ok=True)
    shutil.copytree(ROOT/'licenses',dest/'licenses',dirs_exist_ok=True)
    license_name='LICENSE' if (ROOT/'LICENSE').is_file() else 'LICENSE-MIT.proposed'
    for name in ['README.md','AI-CONNECTION.md','AI-API.md','PRIVACY.md','THIRD_PARTY_NOTICES.md','LICENSE-SCOPE.md','CONTRIBUTING.md','CHANGELOG.md','使用指南.md',license_name]:
        shutil.copyfile(ROOT/name,dest/name)
    if license_name=='LICENSE':
        (dest/'LICENSE-MIT.proposed').unlink(missing_ok=True)
    shutil.copytree(ROOT/'docs',dest/'docs',dirs_exist_ok=True)
    shutil.copyfile(ROOT/'resources/fonts/manifest.json',dest/'font-manifest.json')
    for name in ['启用AI助手.command','连接自己的ChatGPT.command','启用AI助手.cmd','连接自己的ChatGPT.cmd']:
        shutil.copyfile(ROOT/'launchers'/name,dest/name)
        if name.endswith('.command'):(dest/name).chmod(0o755)
    archive=dest.parent/(dest.name+'.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for p in sorted(dest.rglob('*')):
            if p.is_file():z.write(p,str(p.relative_to(dest.parent)))
    print(json.dumps({'directory':str(dest),'archive':str(archive),'examples':len(project['documents']),'fonts':len(fonts)},ensure_ascii=False))
if __name__=='__main__':main()
