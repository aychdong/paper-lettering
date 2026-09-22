#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Build a private, non-blind correction review from real exported candidates."""
import argparse,hashlib,json,shutil
from pathlib import Path

def build(manifest,out):
    info=json.loads(manifest.read_text());out.mkdir(parents=True,exist_ok=True);items=[];hashes={}
    for i,case in enumerate(info['cases']):
        item={k:case[k] for k in ['id','title','brief','note']};item['choices']=[]
        for j,candidate in enumerate(case['choices']):
            row={k:candidate[k] for k in ['id','label','text','reason','direction']}
            for kind in ['image','project']:
                src=Path(candidate[kind]);name='case-%02d-option-%02d'%(i+1,j+1)+('.png' if kind=='image' else '.paper.json');shutil.copyfile(src,out/name);row[kind]=name
                hashes[name]=hashlib.sha256((out/name).read_bytes()).hexdigest()
            item['choices'].append(row)
        items.append(item)
    review_id=hashlib.sha256(json.dumps({'items':items,'hashes':hashes},ensure_ascii=False,sort_keys=True).encode()).hexdigest()
    data=json.dumps({'reviewId':review_id,'items':items},ensure_ascii=False).replace('<','\\u003c')
    html='''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>纸上文字 · 修订回看</title><style>
body{max-width:1400px;margin:28px auto;padding:0 24px;background:#f2efe6;color:#30362d;font:17px/1.65 system-ui}header{max-width:900px}h1{font-size:30px}h2{font-size:23px}.case{background:#fffdf6;padding:24px;margin:26px 0;border-radius:16px}.choices{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:22px}.choice{min-width:0}img{display:block;width:100%;height:530px;object-fit:contain;background:#f5f2e9}pre{font:inherit;white-space:pre-wrap}.reason{font-size:15px;color:#626a5a}label{display:block;margin:12px 0}textarea{width:100%;box-sizing:border-box;min-height:80px;font:inherit}a{color:#355d44}button{padding:13px 22px;border:1px solid #8a9c80;background:#dfe8d6;border-radius:9px;font:inherit;cursor:pointer}.note{color:#746042}footer{position:sticky;bottom:0;padding:15px;background:#f2efe6ee;backdrop-filter:blur(8px)}@media(max-width:600px){body{padding:0 12px}.case{padding:16px}img{height:auto}.choices{grid-template-columns:1fr}}
</style><header><h1>根据你的评价，逐项修订</h1><p>这里保留你选中的文字，重点检查标点、字迹、横竖排和图文对应。点击图片可放大；每个方案都可以下载可编辑工程，在纸上文字中继续调整。</p><p class="note">这是反馈后的修订回看，不是新的盲测，也不用于宣称已通过稳定版质量门槛。选择只保存在本页，不会自动加入个人偏好。</p></header><main></main><footer><button id="export">导出本轮反馈</button><span id="progress"></span></footer><script>
const data=DATA,key='paper-revision:'+data.reviewId;let votes={};try{votes=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}const refresh=()=>{document.getElementById('progress').textContent=`　已选择 ${Object.values(votes).filter(x=>x.choice).length}/${data.items.length} 组`},save=()=>{try{localStorage.setItem(key,JSON.stringify(votes))}catch(e){}refresh()};
for(const item of data.items){const section=document.createElement('section');section.className='case';const title=document.createElement('h2'),brief=document.createElement('p'),note=document.createElement('p');title.textContent=item.title;brief.textContent=item.brief;note.className='note';note.textContent=item.note;section.append(title,brief,note);const grid=document.createElement('div');grid.className='choices';
 for(const c of item.choices){const col=document.createElement('div');col.className='choice';const h=document.createElement('h3'),im=document.createElement('img'),t=document.createElement('pre'),r=document.createElement('p'),a=document.createElement('a'),lab=document.createElement('label'),radio=document.createElement('input');h.textContent=c.label+' · '+c.direction;im.src=c.image;im.alt=c.label;im.loading='lazy';const zoom=document.createElement('a');zoom.href=c.image;zoom.target='_blank';zoom.rel='noopener';zoom.title='查看完整图片';zoom.append(im);t.textContent=c.text;r.textContent=c.reason;r.className='reason';a.href=c.project;a.download=c.project;a.textContent='下载可编辑工程';radio.type='radio';radio.name=item.id;radio.value=c.id;radio.checked=votes[item.id]?.choice===c.id;radio.onchange=()=>{votes[item.id]={...votes[item.id],choice:c.id};save()};lab.append(radio,document.createTextNode(' 更喜欢这个版式'));col.append(h,zoom,t,r,a,lab);grid.append(col)}section.append(grid);
 const lab=document.createElement('label'),none=document.createElement('input');none.type='radio';none.name=item.id;none.value='neither';none.checked=votes[item.id]?.choice==='neither';none.onchange=()=>{votes[item.id]={...votes[item.id],choice:'neither'};save()};lab.append(none,document.createTextNode(' 这些方案都还不满意'));const reason=document.createElement('textarea');reason.maxLength=1000;reason.placeholder='可选：仍然不合适的地方，或想保留的具体部分';reason.value=votes[item.id]?.reason||'';reason.oninput=()=>{votes[item.id]={...votes[item.id],reason:reason.value};save()};section.append(lab,reason);document.querySelector('main').append(section)}refresh();
document.getElementById('export').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([JSON.stringify({type:'paper-lettering-revision-feedback',version:1,reviewId:data.reviewId,purpose:'feedback-regression',votes},null,2)],{type:'application/json'}));a.download='纸上文字-修订反馈.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),2000)};
</script></html>'''.replace('DATA',data)
    (out/'修订回看.html').write_text(html,encoding='utf-8');(out/'manifest.json').write_text(json.dumps({'reviewId':review_id,'cases':items,'hashes':hashes,'purpose':'feedback-regression','humanReview':'pending'},ensure_ascii=False,indent=2)+'\n');return {'cases':len(items),'options':sum(len(x['choices']) for x in items),'reviewId':review_id}
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--manifest',type=Path,required=True);p.add_argument('--out',type=Path,required=True);a=p.parse_args();print(json.dumps(build(a.manifest,a.out),ensure_ascii=False))
