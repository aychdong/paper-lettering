"""Bounded scene -> editor -> browser render -> visual review -> one repair workflow."""
import datetime,hashlib,json,secrets,tempfile,threading,time
from pathlib import Path
from creative_contract import request,prompt,stage_schema,scene_check,editor_check,review_check,VERSION,PROMPT_VERSION,RULES
from design_contract import preview,validate,DESIGN
from codex_client import Client

class Job:
    def __init__(self,payload,preferences,client_factory=Client,timeout=720):
        self.payload=request(payload);self.preferences=preferences;self.factory=client_factory;self.deadline=time.monotonic()+timeout;self.started=time.monotonic();self.cancelled=threading.Event();self.condition=threading.Condition();self.state={'state':'running','phase':'准备创作','revision':payload['revision']};self.received=None;self.trace=[];self.uploads=[];self.round=0
    def update(self,**values):
        with self.condition:
            if self.cancelled.is_set():values.update(state='cancelled',phase='已取消')
            self.state.update(values);self.condition.notify_all()
    def snapshot(self):
        with self.condition:return dict(self.state,elapsed=round(time.monotonic()-self.started),calls=len(self.trace),limit=4)
    def check(self):
        if self.cancelled.is_set():raise RuntimeError('任务已取消，当前画布保持不变。')
        if time.monotonic()>=self.deadline:raise TimeoutError('创作达到十二分钟上限；草案未自动应用。')
    def cancel(self):
        with self.condition:
            if self.state['state'] in ['complete','failed','cancelled']:return
            self.cancelled.set();self.state.update(state='cancelled',phase='已取消');self.condition.notify_all()
    def submit(self,data):
        with self.condition:
            self.check()
            if self.state['state']!='awaiting_render' or data.get('revision')!=self.payload['revision'] or data.get('ticket')!=self.state.get('ticket'):raise ValueError('渲染结果已过期，请重新生成')
            candidates=data.get('candidates');allowed={b['id'] for b in self.state['briefs']}
            if not isinstance(candidates,list) or len(candidates)>3:raise ValueError('成图数量无效')
            ids=set()
            for c in candidates:
                if c.get('id') not in allowed or c['id'] in ids:raise ValueError('成图编号无效')
                ids.add(c['id']);validate({k:c[k] for k in ['name','reason','layers']},DESIGN)
                from creative_contract import check_texts
                expected=next(b for b in self.state['briefs'] if b['id']==c['id'])
                check_texts([l['text'] for l in c['layers']],self.payload,[l['text'] for l in expected['layers']])
                if c.get('checks',{}).get('errors')!=[]:raise ValueError('不能审阅本地检查失败的方案')
                if len(json.dumps(c.get('checks',{})))>15000:raise ValueError('检查记录过大')
                raw=preview(c)
                if hashlib.sha256(raw).hexdigest()!=c.get('previewSHA256'):raise ValueError('成图摘要不匹配')
                for crop in c.get('crops',[]):preview({'preview':crop})
                if len(c.get('crops',[]))>1:raise ValueError('细节预览过多')
                if len(json.dumps(c.get('renderLayers',[])))>20000:raise ValueError('渲染参数过长')
                serialized=c.get('parametersJSON',json.dumps(c.get('renderLayers',[]),ensure_ascii=False,separators=(',',':')))
                if not isinstance(serialized,str) or len(serialized)>20000 or json.loads(serialized)!=c.get('renderLayers',[]):raise ValueError('排字参数序列不一致')
                digest=hashlib.sha256(serialized.encode()).hexdigest()
                if digest!=c.get('parametersSHA256'):raise ValueError('排字参数摘要不匹配')
            self.received=candidates;self.state.update(state='running',phase='成图已收到，准备审稿');self.condition.notify_all()
    def render(self,briefs,scene,revision):
        self.round+=1;self.received=None
        self.update(state='awaiting_render',phase='本地排字与成图检查' if not revision else '本地重排与复核',ticket=secrets.token_urlsafe(18),briefs=briefs,scene={k:scene[k] for k in ['regions','facts','uncertainties']},round=self.round)
        with self.condition:
            while self.received is None:self.check();self.condition.wait(timeout=min(1,max(.01,self.deadline-time.monotonic())))
            result=self.received;self.received=None;return result
    def call(self,client,stage,schema,context,images,temp):
        self.check()
        if len(self.trace)>=4:raise RuntimeError('已达到四次模型请求上限')
        message={'scene':'看图与构思 · 六条文案','editor':'文案编辑 · 比较与选择','review':'成图审稿 · 检查文字与版式','verify':'最终复核 · 检查修订成图'}[stage];self.update(state='running',phase=message)
        text=prompt(stage,self.payload,context,self.preferences);start=time.monotonic()
        result=client.advise(text,images,schema,temp,progress=lambda _:None,timeout=max(.01,self.deadline-time.monotonic()),cancel=self.cancelled)
        self.trace.append({'stage':stage,'model':result.get('model'),'usage':result.get('usage'),'seconds':round(time.monotonic()-start,2),'promptSHA256':hashlib.sha256(text.encode()).hexdigest(),'response':result['data'],'toolEvents':result.get('toolEvents',[])})
        if result.get('toolEvents'):raise ValueError('创作任务出现不允许的工具调用')
        self.check();return result['data']
    def images(self,candidates,temp):
        paths=[]
        for c in candidates:
            for i,p in enumerate([c['preview']]+c.get('crops',[])):
                raw=preview({'preview':p});path=temp/('render-'+str(len(self.uploads))+'.png');path.write_bytes(raw);paths.append(path);self.uploads.append({'candidate':c['id'],'kind':'full' if i==0 else 'detail','sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw)})
        return paths
    def review_context(self,candidates):return [{'id':c['id'],'text':[l['text'] for l in c['layers']],'layers':c['layers'],'checks':c['checks'],'previewSHA256':c['previewSHA256'],'parametersSHA256':c['parametersSHA256'],'imageOrder':'full then detail' if c.get('crops') else 'full'} for c in candidates]
    def run(self):
        try:
            with tempfile.TemporaryDirectory(prefix='paper-creative-') as folder:
                temp=Path(folder);raw=preview(self.payload);image=temp/'base.png';image.write_bytes(raw);self.uploads.append({'kind':'base','bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()})
                with self.factory(folder) as client:
                    scene=scene_check(self.call(client,'scene',stage_schema('scene',self.payload),{},[image],temp),self.payload)
                    editor=editor_check(self.call(client,'editor',stage_schema('editor',self.payload),scene,[],temp),self.payload,scene)
                    rendered=self.render(editor['briefs'],scene,False)
                    if not rendered:raise ValueError('本地检查未找到合格版面。请减少文字、调整位置或放宽创作要求。')
                    review=review_check(self.call(client,'review',stage_schema('review',self.payload),self.review_context(rendered),self.images(rendered,temp),temp),self.payload,rendered)
                    repairs={r['id']:r for r in review['reviews'] if r['repair']}
                    if repairs:
                        briefs=[dict(id=c['id'],sourceId=c['id'],name=c['name'],reason=repairs[c['id']]['reason'] if c['id'] in repairs else c['reason'],layers=repairs[c['id']]['repair'] if c['id'] in repairs else c['layers'],phrases=[],poetic='yes',retain=c if c['id'] not in repairs else None) for c in rendered]
                        rendered=self.render(briefs,scene,True)
                        if not rendered:raise ValueError('修订后没有合格版面；当前作品保持不变。')
                        review=review_check(self.call(client,'verify',stage_schema('verify',self.payload),self.review_context(rendered),self.images(rendered,temp),temp),self.payload,rendered,True)
                    passed={r['id']:r for r in review['reviews'] if r['copyVerdict']=='pass' and r['layoutVerdict']=='pass' and not r['repair']}
                    by_id={c['id']:c for c in rendered};designs=[]
                    for ident in review['ranking']:
                        if ident in passed:
                            c=by_id[ident];designs.append({k:c[k] for k in ['id','name','layers','renderLayers','checks','previewSHA256','parametersSHA256']}|{'reason':passed[ident]['reason'],'reviewed':True})
                    if not designs:raise ValueError('审稿未通过：'+ '；'.join(r['reason'] for r in review['reviews']))
                    self.check();self.update(state='complete',phase='审稿完成',result={'type':'paper-lettering-creative','version':1,'copyMode':self.payload['copyMode'],'revision':self.payload['revision'],'imageSHA256':self.payload.get('imageSHA256'),'previewSHA256':hashlib.sha256(raw).hexdigest(),'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'model':self.trace[-1]['model'],'colors':scene['colors'],'designs':designs,'provenance':{'pipeline':VERSION,'promptVersion':PROMPT_VERSION,'ruleVersion':RULES['version'],'trace':self.trace,'uploads':self.uploads,'qualityStatus':'preview-human-evaluation-pending'}})
        except Exception as e:
            self.update(state='cancelled' if self.cancelled.is_set() else 'failed',error=str(e)[:1500],phase='已停止',trace=self.trace,uploads=self.uploads)
