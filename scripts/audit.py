#!/usr/bin/env python3
"""Audit source assets and accidental private data before a public release."""
import hashlib,json,re,struct
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def main():
    errors=[];count=0
    for p in ROOT.rglob('*'):
        if not p.is_file() or any(x in p.relative_to(ROOT).parts for x in ['.git','dist','__pycache__']):continue
        count+=1;rel=str(p.relative_to(ROOT))
        if p.name in ['auth.json','.env','config.toml'] or p.suffix in ['.pem','.key']:errors.append('Forbidden private file: '+rel)
        if p.suffix in ['.md','.json','.py','.js','.html','.css','.swift','.command','.cmd','.proposed']:
            text=p.read_text(encoding='utf-8')
            if re.search(r'/'+r'Users'+r'/[^/\s]+/|/'+r'home'+r'/[^/\s]+/|[A-Z]:\\Users\\[^\\\s]+',text):errors.append('Personal absolute path: '+rel)
            if re.search(r'sk-[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}',text):errors.append('Possible credential: '+rel)
            if re.search(r'(?:[?&]|%26)token(?:=|%3D)[A-Za-z0-9_-]{30,}',text):errors.append('Runtime capability: '+rel)
    project=json.loads((ROOT/'examples/project.json').read_text(encoding='utf-8'))
    if [d['id'] for d in project['documents']]!=['p0002','p0003']:errors.append('Unexpected example set')
    for d in project['documents']:
        p=ROOT/'examples'/d['image']['path'];raw=p.read_bytes()
        if sha(p)!=d['image']['sha256']:errors.append('Example hash: '+d['id'])
        at=8
        while at+12<=len(raw):
            length=struct.unpack_from('>I',raw,at)[0];tag=raw[at+4:at+8]
            if tag in [b'eXIf',b'tEXt',b'zTXt',b'iTXt']:errors.append('Example metadata: '+d['id'])
            at+=12+length
        if len(d.get('designSuggestions',[]))!=2 or not d.get('designDecision'):errors.append('Missing editable AI layouts: '+d['id'])
    fonts=json.loads((ROOT/'resources/fonts/manifest.json').read_text(encoding='utf-8'))
    for font in fonts['fonts']:
        for key in ['font','license']:
            record=font[key];p=ROOT/'resources/fonts'/record['path']
            if sha(p)!=record['sha256']:errors.append('Font or license hash: '+font['id'])
    result={'status':'passed' if not errors else 'failed','source_files':count,'examples':len(project['documents']),'fonts':len(fonts['fonts']),'errors':errors,'scope':'Local source and asset checks only; this audit does not publish or grant rights'}
    print(json.dumps(result,ensure_ascii=False,indent=2))
    if errors:raise SystemExit(1)
if __name__=='__main__':main()
