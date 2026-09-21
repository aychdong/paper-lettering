import base64,copy,hashlib,json,struct,sys,tempfile,threading,time,unittest,zlib
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'tools/lettering/ai'))
from creative import Job
from creative_contract import stage_schema,scene_schema,scene_check,editor_check,review_check,prompt,request
from preferences import Store,clean

def png():
    def chunk(tag,data):return struct.pack('>I',len(data))+tag+data+struct.pack('>I',zlib.crc32(tag+data)&0xffffffff)
    raw=b'\x89PNG\r\n\x1a\n'+chunk(b'IHDR',struct.pack('>IIBBBBB',1,1,8,6,0,0,0))+chunk(b'IDAT',zlib.compress(b'\0\xff\xff\xff\xff'))+chunk(b'IEND',b'')
    return {'dataURL':'data:image/png;base64,'+base64.b64encode(raw).decode(),'width':1,'height':1},raw
LAYER=dict(text='冬日与你',font='gf-notoserifsc',size=.05,weight=500,thickness=0,slant=0,x=.1,y=.1,rotation=0,direction='vertical',align='left',tracking=.05,lineHeight=1.4,color='#342f27',effect='ink')
def payload():return dict(version=1,revision='revision-a',documentId='a',preview=png()[0],copyMode='compose',placement='auto',preference='冬日短句',width=800,height=1200,layers=[dict(text='原文',locked=False)])
def scene():return dict(facts=['暖色纸面'],uncertainties=[],regions=[],candidates=[dict(id=str(i),texts=['冬日与你'],phrases=['冬日'],voice='简洁',reason='具体感受') for i in range(6)],colors=[dict(hex='#342f27',name='墨',reason='可读') for _ in range(3)])
def editor():return dict(briefs=[dict(id=str(i),sourceId=str(i),name='短句',reason='留白',layers=[copy.deepcopy(LAYER)],phrases=[],poetic='yes') for i in range(3)])
def renders(briefs):
    p,raw=png();result=[]
    for b in briefs:
        layers=[dict(l,renderer='harfbuzz-1') for l in b['layers']]
        result.append(dict(id=b['id'],name=b['name'],reason=b['reason'],layers=b['layers'],renderLayers=layers,parametersSHA256=hashlib.sha256(json.dumps(layers,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),preview=p,previewSHA256=hashlib.sha256(raw).hexdigest(),crops=[],checks={'errors':[],'warnings':[]}))
    return result

def review(repair=False):return {'ranking':['0','1','2'],'reviews':[dict(id=str(i),copyVerdict='pass',layoutVerdict='fail' if repair and i==0 else 'pass',reason='文字可读',repair=[copy.deepcopy(LAYER)] if repair and i==0 else []) for i in range(3)]}
class FakeClient:
    def __init__(self,*args):self.count=0;self.responses=[scene(),editor(),review(),review()]
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def advise(self,*args,**kwargs):
        answer=self.responses[self.count];self.count+=1;return {'data':copy.deepcopy(answer),'model':'fixture','usage':{},'toolEvents':[]}
class PipelineTests(unittest.TestCase):
    def execute(self,repair=False):
        client=FakeClient()
        if repair:client.responses[2]=review(True)
        job=Job(payload(),[],client_factory=lambda _:client,timeout=5);worker=threading.Thread(target=job.run);worker.start();rounds=0
        while worker.is_alive():
            s=job.snapshot()
            if s['state']=='awaiting_render':
                rounds+=1;job.submit(dict(ticket=s['ticket'],revision='revision-a',candidates=renders(s['briefs'])))
            time.sleep(.005)
        worker.join();return job.snapshot(),client,rounds
    def test_three_calls_and_actual_render_return(self):
        s,c,r=self.execute();self.assertEqual(s['state'],'complete',s);self.assertEqual((c.count,r),(3,1));self.assertEqual(len(s['result']['designs']),3);self.assertTrue(all(d['reviewed'] for d in s['result']['designs']))
    def test_one_revision_four_calls(self):
        s,c,r=self.execute(True);self.assertEqual(s['state'],'complete',s);self.assertEqual((c.count,r),(4,2))
    def test_cancel_while_waiting_for_browser(self):
        job=Job(payload(),[],client_factory=FakeClient,timeout=3);t=threading.Thread(target=job.run);t.start()
        while job.snapshot()['state']!='awaiting_render':time.sleep(.005)
        job.cancel();t.join(1);self.assertFalse(t.is_alive());self.assertEqual(job.snapshot()['state'],'cancelled')
    def test_missing_browser_times_out(self):
        job=Job(payload(),[],client_factory=FakeClient,timeout=.04);job.run();self.assertEqual(job.snapshot()['state'],'failed')
    def test_stale_ticket_and_revision_and_hash_rejected(self):
        for mutation in ['ticket','revision','previewSHA256','parametersSHA256']:
            job=Job(payload(),[]);job.update(state='awaiting_render',ticket='valid',briefs=editor()['briefs']);data=dict(ticket='valid',revision='revision-a',candidates=renders(editor()['briefs']))
            if mutation in ['ticket','revision']:data[mutation]='stale'
            else:data['candidates'][0][mutation]='bad'
            with self.assertRaises(ValueError):job.submit(data)
    def test_failed_local_checks_never_sent_to_model(self):
        job=Job(payload(),[]);job.update(state='awaiting_render',ticket='valid',briefs=editor()['briefs']);data=dict(ticket='valid',revision='revision-a',candidates=renders(editor()['briefs']));data['candidates'][0]['checks']['errors']=['缺字']
        with self.assertRaises(ValueError):job.submit(data)
    def test_preserve_including_spaces_and_locked_exclusion(self):
        p=payload();p.update(copyMode='preserve',layers=[dict(text='冬日 与你',locked=False),dict(text='锁定',locked=True)]);v=scene()
        with self.assertRaises(ValueError):scene_check(v,p)
        for c in v['candidates']:c['texts']=['冬日 \n与你']
        scene_check(v,p)
        self.assertEqual(scene_schema(p)['properties']['candidates']['items']['properties']['texts']['items']['enum'],['冬日 与你'])
    def test_compose_allows_semantic_layer_split(self):
        e=editor();e['briefs'][0]['layers']=[dict(LAYER,text='冬日'),dict(LAYER,text='与你')]
        editor_check(e,payload(),scene())
        with self.assertRaises(ValueError):editor_check(e,payload()|dict(copyMode='preserve',layers=[dict(text='冬日与你')]),scene())
    def test_editor_cannot_invent_copy(self):
        e=editor();e['briefs'][0]['layers'][0]['text']='改写'
        with self.assertRaises(ValueError):editor_check(e,payload(),scene())
    def test_copy_only_preserves_layer_count_through_all_stages(self):
        p=payload()|dict(action='copy');scene_check(scene(),p);editor_check(editor(),p,scene())
        s=scene();s['candidates'][0]['texts']=['冬日','与你']
        with self.assertRaises(ValueError):scene_check(s,p)
        e=editor();e['briefs'][0]['layers']=[dict(LAYER,text='冬日'),dict(LAYER,text='与你')]
        with self.assertRaises(ValueError):editor_check(e,p,scene())
        r=review(True);r['reviews'][0]['repair']=[dict(LAYER,text='冬日'),dict(LAYER,text='与你')]
        with self.assertRaises(ValueError):review_check(r,p,renders(editor()['briefs']))
    def test_final_review_cannot_repair(self):
        with self.assertRaises(ValueError):review_check(review(True),payload(),renders(editor()['briefs']),True)
    def test_copy_and_layout_must_both_pass(self):
        c=FakeClient();c.responses[2]['reviews'][0]['copyVerdict']='fail';j=Job(payload(),[],client_factory=lambda _:c,timeout=3);t=threading.Thread(target=j.run);t.start()
        while t.is_alive():
            s=j.snapshot()
            if s['state']=='awaiting_render':j.submit(dict(ticket=s['ticket'],revision='revision-a',candidates=renders(s['briefs'])))
            time.sleep(.005)
        self.assertEqual(len(j.snapshot()['result']['designs']),2)
    def test_preserve_schema_supports_multiline_source_without_control_literals(self):
        p=payload()|dict(copyMode='preserve',layers=[dict(text='你好，ChatGPT！\n2026年，与你看世界。')])
        for stage in ['scene','editor','review']:
            s=stage_schema(stage,p)
            item=s['properties']['candidates']['items']['properties']['texts']['items'] if stage=='scene' else (s['properties']['briefs']['items']['properties']['layers']['items']['properties']['text'] if stage=='editor' else s['properties']['reviews']['items']['properties']['repair']['items']['properties']['text'])
            self.assertEqual(item['enum'],['你好，ChatGPT！2026年，与你看世界。'])
        self.assertIn('\n',p['layers'][0]['text'])
    def test_region_roles_cannot_be_inferred_from_free_text(self):
        s=scene();s['regions']=[dict(role='preferred',label='建议留白区',x=.1,y=.1,w=.3,h=.2,confidence=.9)];scene_check(s,payload())
        del s['regions'][0]['role']
        with self.assertRaises(ValueError):scene_check(s,payload())
    def test_rule_cards_are_injected(self):
        text=prompt('editor',payload(),scene());self.assertIn('闭合标点',text);self.assertIn('不默认写诗',text)
    def test_png_metadata_corruption_and_trailing_bytes_rejected(self):
        from design_contract import preview
        import base64
        image,raw=png()
        for broken in [raw[:-1],raw+b'extra',raw[:35]+bytes([raw[35]^1])+raw[36:]]:
            with self.assertRaises(ValueError):preview({'preview':{'dataURL':'data:image/png;base64,'+base64.b64encode(broken).decode()}})
    def test_cancel_cannot_be_overwritten_by_late_completion(self):
        job=Job(payload(),[]);job.cancel();job.update(state='complete',result={});self.assertEqual(job.snapshot()['state'],'cancelled')
    def test_invalid_requests(self):
        for delta in [dict(version=2),dict(revision=''),dict(copyMode='preserve',layers=[]),dict(width=-1)]:
            with self.assertRaises(ValueError):request(payload()|delta)
    def test_preferences_are_explicit_atomic_and_disableable(self):
        with tempfile.TemporaryDirectory() as temp:
            store=Store(Path(temp)/'prefs.json');entry=dict(id='a',kind='copy',verdict='like',text='冬日',reason='',context='冬日',createdAt='2026-09-20',layout=[])
            data=dict(version=1,enabled=True,entries=[entry]);store.write(data);self.assertEqual(Store(store.path).read(),data);self.assertEqual(len(store.select(payload())),1);store.write(data|dict(enabled=False));self.assertEqual(store.select(payload()),[]);store.write(data|dict(entries=[]));self.assertEqual(store.read()['entries'],[])
    def test_preferences_reject_implicit_events(self):
        with self.assertRaises(ValueError):clean(dict(version=1,enabled=True,entries=[dict(kind='apply',verdict='like')]))
if __name__=='__main__':unittest.main()
