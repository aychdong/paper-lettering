#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a version-bound local blind A/B review; never fabricate missing results."""
import argparse,hashlib,json,random,shutil
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def build(results,out):
    manifest=json.loads((ROOT/'evaluations/cases.json').read_text());out.mkdir(parents=True,exist_ok=True);items=[];key={};pending=[];hashes={}
    for c in manifest['cases']:
        if c['split']!='holdout':continue
        folder=results/c['id']
        if not all((folder/(name+suffix)).exists() for name in ['baseline','creative'] for suffix in ['.json','.png']):pending.append(c['id']);continue
        order=['baseline','creative'];random.Random(hashlib.sha256(c['id'].encode()).hexdigest()).shuffle(order);key[c['id']]={'A':order[0],'B':order[1]};item={'id':c['id'],'brief':c['preference'],'preserve':c['copyMode']=='preserve','choices':{}}
        for label,name in zip(['A','B'],order):
            response=json.loads((folder/(name+'.json')).read_text());filename=c['id']+'-'+label+'.png';shutil.copyfile(folder/(name+'.png'),out/filename);item['choices'][label]={'image':filename,'text':'\n'.join(l['text'] for l in response['designs'][0]['layers'])};hashes[filename]=hashlib.sha256((out/filename).read_bytes()).hexdigest()
        items.append(item)
    evaluation_id=hashlib.sha256(json.dumps({'items':items,'images':hashes},ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    data=json.dumps({'evaluationId':evaluation_id,'items':items,'pending':pending},ensure_ascii=False).replace('<','\\u003c')
    html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>纸上文字 · 盲评</title>
<style>body{margin:30px auto;max-width:1000px;background:#f3f0e6;color:#292d27;font:17px system-ui;padding:0 18px}article{background:#fffdf7;padding:20px;margin:20px 0;border-radius:16px}.choices{display:grid;grid-template-columns:1fr 1fr;gap:20px}img{width:100%;max-height:640px;object-fit:contain}pre{white-space:pre-wrap;font:inherit}label{display:inline-block;margin:7px 18px 7px 0}button{padding:12px 20px}fieldset{margin:16px 0}small{color:#65705c}textarea{box-sizing:border-box;width:100%;min-height:65px;font:inherit}@media(max-width:600px){.choices{grid-template-columns:1fr}}</style>
<h1>文案与版式，分开选</h1><p>每对使用同一画面与要求。A/B 顺序已随机化；分别选更喜欢的文案和版式，也可以平手或都不满意。不要猜版本。</p><p id="status"></p><main id="cases"></main><button id="export">导出我的评价</button><p><small>评价保存在此浏览器，不会自动写入个人偏好。导出后交给 Codex 汇总；未完成案例不会计为通过。</small></p>
<script>
const data=DATA,storage='paper-blind-v2:'+data.evaluationId;let votes={};try{votes=JSON.parse(localStorage.getItem(storage)||'{}')}catch(e){}
const save=()=>localStorage.setItem(storage,JSON.stringify(votes)),root=document.getElementById('cases');
document.getElementById('status').textContent=`已准备 ${data.items.length}/12 对；${data.pending.length} 对尚无完整配对结果。`;
for(const item of data.items){
 const card=document.createElement('article'),title=document.createElement('h2'),brief=document.createElement('p');title.textContent=`第 ${data.items.indexOf(item)+1} 组`;brief.textContent=item.brief;card.append(title,brief);
 if(item.preserve){const note=document.createElement('p');note.textContent='这是保留原文的排版案例。文字内容相同时，文案请选择平手；版式仍单独比较。';card.append(note);}
 const grid=document.createElement('div');grid.className='choices';for(const name of ['A','B']){const col=document.createElement('div'),h=document.createElement('h3'),im=document.createElement('img'),text=document.createElement('pre');h.textContent=name;im.src=item.choices[name].image;im.alt=name+'方案';text.textContent=item.choices[name].text;col.append(h,im,text);grid.append(col)}card.append(grid);
 const fields=[['copy','更喜欢哪句文案',[['A','A'],['B','B'],['tie','平手'],['neither','都不满意']]],['layout','更喜欢哪个版式',[['A','A'],['B','B'],['tie','平手'],['neither','都不满意']]],['critical','缺字、遮挡、出界等关键问题出现在',[['none','都没有'],['A','A'],['B','B'],['both','都有']]]];
 for(const [field,label,options] of fields){const group=document.createElement('fieldset'),legend=document.createElement('legend');legend.textContent=label;group.append(legend);for(const [value,text] of options){const lab=document.createElement('label'),input=document.createElement('input');input.type='radio';input.name=item.id+field;input.value=value;input.checked=votes[item.id]?.[field]===value;input.onchange=()=>{votes[item.id]={...votes[item.id],[field]:value};save()};lab.append(input,document.createTextNode(text));group.append(lab)}card.append(group)}
 const note=document.createElement('textarea');note.placeholder='可选：你选择的具体原因，或问题所在';note.maxLength=600;note.value=votes[item.id]?.reason||'';note.oninput=()=>{votes[item.id]={...votes[item.id],reason:note.value};save()};card.append(note);root.append(card);
}
document.getElementById('export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({version:2,evaluationId:data.evaluationId,votes},null,2)],{type:'application/json'}));a.download='纸上文字-盲评.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
</script></html>'''.replace('DATA',data)
    (out/'盲评.html').write_text(html,encoding='utf-8');(out/'answer-key.json').write_text(json.dumps({'version':2,'evaluationId':evaluation_id,'cases':key,'imageHashes':hashes},indent=2));(out/'status.json').write_text(json.dumps({'ready':len(items),'pending':pending,'human_review':'pending','evaluationId':evaluation_id},indent=2));return len(items)

def score(votes,key):
    if votes.get('version')!=2 or key.get('version')!=2 or votes.get('evaluationId')!=key.get('evaluationId'):raise ValueError('评价与本轮成图不匹配，请使用对应的盲评文件')
    records=votes.get('votes',{});cases=key['cases'];wins={k:sum(cases.get(i,{}).get(v.get(k))=='creative' for i,v in records.items()) for k in ['copy','layout']}
    complete=sum(all(v.get(k) in ['A','B','tie','neither'] for k in ['copy','layout']) and v.get('critical') in ['none','A','B','both'] for i,v in records.items() if i in cases)
    critical=sum(v.get('critical')=='both' or cases.get(i,{}).get(v.get('critical'))=='creative' for i,v in records.items() if i in cases)
    return {'reviewed':complete,'copyWins':wins['copy'],'layoutWins':wins['layout'],'criticalCreativeCases':critical,'gate':'passed' if len(cases)==12 and complete==12 and wins['copy']>=8 and wins['layout']>=8 and critical==0 else 'pending_or_not_met'}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--results',type=Path);p.add_argument('--out',type=Path);p.add_argument('--votes',type=Path);p.add_argument('--key',type=Path);a=p.parse_args()
    if a.votes:print(json.dumps(score(json.loads(a.votes.read_text()),json.loads(a.key.read_text())),ensure_ascii=False,indent=2))
    else:print(json.dumps({'ready':build(a.results,a.out),'review':str(a.out/'盲评.html')},ensure_ascii=False))
