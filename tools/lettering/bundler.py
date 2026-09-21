"""Build a standalone editor from local assets with verified font hashes."""
import base64,hashlib,json
from pathlib import Path
def read(p):return json.loads(p.read_text(encoding="utf-8"))
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()

def bundle(project, root):
    ROOT = Path(root)
    SOURCE = ROOT / "tools" / "lettering"
    font_root = ROOT / 'resources' / 'fonts'
    font_manifest = read(font_root / 'manifest.json')
    fonts = []
    for item in font_manifest['fonts']:
        font_file = font_root / item['font']['path']
        license_file = font_root / item['license']['path']
        if sha(font_file) != item['font']['sha256'] or sha(license_file) != item['license']['sha256']:
            raise ValueError('字体或许可证校验失败: ' + item['id'])
        fonts.append({k:item[k] for k in ['id','label','category','css_family','license_id','commit'] + ([ 'weight_range','default_weight'] if 'weight_range' in item else [])})
        fonts[-1].update(dataURL='data:font/ttf;base64,'+base64.b64encode(font_file.read_bytes()).decode('ascii'), sha256=sha(font_file), license=license_file.read_text(encoding="utf-8"), variable='%5B' in item['font']['url'], sourceURL=item['font']['url'])
    css = (SOURCE / 'style.css').read_text(encoding="utf-8")
    html = (SOURCE / 'index.html').read_text(encoding="utf-8").replace('<link rel="stylesheet" href="style.css">', '<style>' + css + '</style>')
    encoded = json.dumps(project, ensure_ascii=False).replace('<', '\\u003c').replace('\u2028', '\\u2028').replace('\u2029', '\\u2029')
    html = html.replace('{"version":1,"documents":[]}', encoded)
    html = html.replace('<script id="fontData" type="application/json">[]</script>', '<script id="fontData" type="application/json">' + json.dumps(fonts,ensure_ascii=False).replace('<','\\u003c') + '</script>')
    for name in ['engine.js', 'transforms.js', 'fonts.js', 'color.js', 'design.js', 'app.js']:
        text = (SOURCE / name).read_text(encoding="utf-8").replace('</script', '<\\/script')
        html = html.replace('<script src="'+name+'"></script>', '<script>\n' + text + '\n</script>')
    return html, fonts, font_manifest
