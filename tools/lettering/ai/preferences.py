"""Explicit, local preferences. Never infer feedback from editing or applying a design."""
import json,os,sys,tempfile,threading
from pathlib import Path

def location():
    if sys.platform=='darwin':return Path.home()/'Library/Application Support/Paper Lettering/preferences.json'
    if os.name=='nt':return Path(os.environ.get('LOCALAPPDATA',str(Path.home())))/'Paper Lettering/preferences.json'
    return Path(os.environ.get('XDG_DATA_HOME',str(Path.home()/'.local/share')))/'paper-lettering/preferences.json'

def clean(data):
    if not isinstance(data,dict) or data.get('version')!=1 or not isinstance(data.get('enabled'),bool) or not isinstance(data.get('entries'),list) or len(data['entries'])>100:raise ValueError('偏好文件格式无效')
    result={'version':1,'enabled':data['enabled'],'entries':[]};ids=set()
    for e in data['entries']:
        if not isinstance(e,dict) or e.get('kind') not in ['copy','layout'] or e.get('verdict') not in ['like','dislike']:raise ValueError('偏好必须来自明确反馈')
        item={}
        for k,n in [('id',80),('text',500),('reason',300),('context',500),('createdAt',60)]:
            if not isinstance(e.get(k),str) or len(e[k])>n:raise ValueError('偏好字段无效')
            item[k]=e[k]
        if not item['id'] or item['id'] in ids:raise ValueError('偏好编号重复')
        ids.add(item['id']);item.update(kind=e['kind'],verdict=e['verdict'])
        layout=e.get('layout',[])
        if not isinstance(layout,list) or len(layout)>4:raise ValueError('偏好排版无效')
        item['layout']=[]
        for layer in layout:
            if not isinstance(layer,dict):raise ValueError('偏好排版无效')
            allowed={k:v for k,v in layer.items() if k in ['font','size','weight','direction','color','effect','x','y','rotation','lineHeight'] and isinstance(v,(str,int,float))}
            if len(json.dumps(allowed))>1500:raise ValueError('偏好排版过长')
            item['layout'].append(allowed)
        result['entries'].append(item)
    return result

class Store:
    def __init__(self,path=None):self.path=Path(path) if path else location();self.lock=threading.Lock()
    def read(self):
        if not self.path.exists():return {'version':1,'enabled':True,'entries':[]}
        return clean(json.loads(self.path.read_text(encoding='utf-8')))
    def write(self,data):
        data=clean(data)
        with self.lock:
            self.path.parent.mkdir(parents=True,exist_ok=True)
            fd,name=tempfile.mkstemp(dir=self.path.parent,prefix='.preferences-')
            try:
                with os.fdopen(fd,'w',encoding='utf-8') as f:json.dump(data,f,ensure_ascii=False,indent=2)
                os.replace(name,self.path)
            finally:
                if os.path.exists(name):os.unlink(name)
        return data
    def select(self,payload):
        data=self.read()
        if not data['enabled']:return []
        query=set(payload.get('preference',''))
        entries=sorted(data['entries'],key=lambda e:(len(query&set(e['context']+e['text'])),e['createdAt']),reverse=True)
        return [{k:e[k] for k in ['kind','verdict','text','reason','layout']} for e in entries[:6]]
