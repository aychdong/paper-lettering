(async function(){
'use strict';
const L=window.Lettering,T=window.PaperTransforms,F=window.PaperFonts,C=window.PaperColors,$=id=>document.getElementById(id);
let project,db,activeLayerId=null,activeRepairId=null,mode='select',drag=null,showOriginal=false,frame=0,saveTimer=0,saveSequence=0,toastTimer=0,ready=false,preview=false,colorTimer=0,colorCache=null,fontSequence=0;
const images=new Map(),histories=new Map();
const starter=JSON.parse($('starterData').textContent),draftKey='draft:'+(starter.id||'blank');
const doc=()=>project?.documents.find(d=>d.id===project.selectedDocumentId)||project?.documents[0];
const layer=()=>doc()?.layers.find(l=>l.id===activeLayerId);
const repair=()=>doc()?.repairs.find(r=>r.id===activeRepairId)||doc()?.repairs[0];
const state=()=>({layers:L.copy(doc().layers),repairs:L.copy(doc().repairs),activeLayerId,activeRepairId,designDecision:L.copy(doc().designDecision||null)});
function toast(message){$('toast').textContent=message;$('toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('visible'),3600);}
function safeError(err){console.error(err);toast(err?.message||'操作没有完成，请重试。');}
function history(){if(!histories.has(doc().id))histories.set(doc().id,{past:[],future:[],lastKey:null,lastTime:0});return histories.get(doc().id);}
function checkpoint(key='change',force=false){if(!doc())return;const h=history(),now=Date.now();if(force||h.lastKey!==key||now-h.lastTime>900){h.past.push(state());if(h.past.length>60)h.past.shift();}h.future=[];h.lastKey=key;h.lastTime=now;}
function applyState(s){doc().layers=s.layers;doc().repairs=s.repairs;doc().designDecision=s.designDecision;activeLayerId=s.activeLayerId;activeRepairId=s.activeRepairId;changed();sync();}
function undo(){if(!doc())return;const h=history();if(!h.past.length)return;h.future.push(state());const s=h.past.pop();h.lastKey=null;applyState(s);}
function redo(){if(!doc())return;const h=history();if(!h.future.length)return;h.past.push(state());const s=h.future.pop();h.lastKey=null;applyState(s);}
function schedule(){if(frame)return;frame=requestAnimationFrame(()=>{frame=0;try{render();}catch(e){safeError(e);}});}
function changed(){refreshAssistance();project.updatedAt=new Date().toISOString();saveSequence++;schedule();$('saveStatus').textContent='有新修改';clearTimeout(saveTimer);saveTimer=setTimeout(saveDraft,550);}
async function openDB(){return new Promise((resolve,reject)=>{const r=indexedDB.open('photo-studio-lettering',1);r.onupgradeneeded=()=>r.result.createObjectStore('drafts');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
async function getDraft(key=draftKey){return new Promise((resolve,reject)=>{const q=db.transaction('drafts').objectStore('drafts').get(key);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error);});}
async function saveDraft(){if(!db){$('saveStatus').textContent='请用「保存工程」留存';return;}const seq=++saveSequence;try{$('saveStatus').textContent='正在保存到浏览器…';await new Promise((resolve,reject)=>{const t=db.transaction('drafts','readwrite');t.objectStore('drafts').put(portableProject(),draftKey);t.oncomplete=resolve;t.onerror=()=>reject(t.error);t.onabort=()=>reject(t.error);});if(seq===saveSequence)$('saveStatus').textContent='已在本机自动保存';}catch(e){$('saveStatus').textContent='自动保存不可用，请保存工程';console.warn(e);}}
async function loadProject(data){F.importRecords(data.fonts||[]);refreshFontOptions();const next=L.normalizeProject(data),nextImages=new Map();for(const d of next.documents){const preset=starter.documents.find(x=>x.image?.sha256&&x.image.sha256===d.image.sha256);if(!d.aiPalette&&preset?.aiPalette)d.aiPalette=L.copy(preset.aiPalette);if(!d.designSuggestions?.length&&preset?.designSuggestions)d.designSuggestions=L.copy(preset.designSuggestions);const im=await L.loadImage(d.image.dataURL);if(im.naturalWidth!==d.image.width||im.naturalHeight!==d.image.height)throw new Error('底图尺寸与工程记录不一致。');nextImages.set(d.id,im);}await Promise.all([...new Set(next.documents.flatMap(d=>d.layers.map(l=>l.font)))].map(id=>F.ensure(id)));project=next;images.clear();for(const [id,im] of nextImages)images.set(id,im);histories.clear();selectDoc(next.selectedDocumentId);}
function selectDoc(id){project.selectedDocumentId=project.documents.find(x=>x.id===id)?.id||project.documents[0]?.id||null;activeLayerId=doc()?.layers[0]?.id||null;activeRepairId=doc()?.repairs[0]?.id||null;setMode('select');sync(true);schedule();refreshAssistance();renderDesigns();}
function setMode(next){if(next!=='select'&&preview)setPreview(false);mode=next;$('overlay').dataset.mode=mode;$('pickColor').classList.toggle('active',mode==='pickColor');$('drawRepair').classList.toggle('active',mode==='repair');$('pickPaper').classList.toggle('active',mode==='paper');const tips={select:'拖文字移动 · 拖四角缩放 · 拖圆柄旋转 · Shift 吸附 15° · P 预览',pickColor:'点击画面取文字颜色 · Esc 取消',repair:'拖出覆盖旧字的矩形 · 随后点击「选取纸纹」',paper:'点击附近的空白纸面，作为覆盖区的纸纹来源'};$('hint').textContent=preview?'正在预览成图 · 按 P 或点「返回编辑」继续':tips[mode];schedule();}
function element(tag,text,cls){const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;}
function sync(force=false){const d=doc(),l=layer();$('documents').replaceChildren();for(const item of project.documents){const b=element('button',undefined,'doc-card'+(item.id===d?.id?' active':''));b.dataset.doc=item.id;b.setAttribute('aria-label','选择 '+item.title);const img=element('img');img.src=item.image.dataURL;img.alt=item.title;b.append(img,element('span',item.title));b.onclick=()=>{selectDoc(item.id);changed();};$('documents').append(b);}$('docCount').textContent=project.documents.length+' 张';$('empty').style.display=d?'none':'block';$('canvasWrap').style.display=d?'block':'none';$('artTitle').textContent=d?.title||'纸上文字';$('dimensions').textContent=d?`${d.image.width} × ${d.image.height}`:'';
 renderLayers();
 for(const el of document.querySelectorAll('[data-layer-controls]'))el.hidden=!l;for(const el of document.querySelectorAll('[data-layer-empty]'))el.hidden=!!l;const values=l?{text:l.text,font:l.font,size:Math.round(l.size*10)/10,direction:l.direction,align:l.align,tracking:l.tracking,lineHeight:l.lineHeight,posX:Math.round(l.x),posY:Math.round(l.y),rotation:l.rotation,color:l.color,colorHex:l.color,weight:l.weight,thickness:l.thickness,slant:l.slant,outlineWidth:l.outlineWidth,outlineColor:l.outlineColor,effectStrength:l.effectStrength,secondaryColor:l.secondaryColor,opacity:l.opacity,grain:l.grain,pressure:l.pressure,edgeWear:l.edgeWear}:{};for(const [id,value] of Object.entries(values))if(force||document.activeElement!==$(id))$(id).value=value;if(l){$('multiply').checked=l.multiply;$('stampBorder').checked=l.stampBorder;for(const b of document.querySelectorAll('[data-preset]'))b.classList.toggle('selected',(b.dataset.preset==='soft'?'faded':b.dataset.preset)===l.effect);for(const [id,value] of [['trackingValue',l.tracking+' px'],['lineHeightValue',l.lineHeight.toFixed(2)],['opacityValue',Math.round(l.opacity*100)+'%'],['weightValue',l.weight],['thicknessValue',Math.round(l.thickness*1000)/10+'%'],['slantValue',l.slant+'°'],['effectStrengthValue',Math.round(l.effectStrength*100)+'%'],['grainValue',Math.round(l.grain*100)+'%'],['pressureValue',Math.round(l.pressure*100)+'%'],['edgeWearValue',Math.round(l.edgeWear*100)+'%']])$(id).textContent=value;}
 syncTypography();
 $('swatches').replaceChildren();if(d)for(const color of d.palette){const b=element('button');b.style.background=color;b.title=color;b.setAttribute('aria-label','使用颜色 '+color);b.onclick=()=>{if(!layer()||layer().locked)return;checkpoint('color',true);layer().color=color;changed();sync();};$('swatches').append(b);}
 $('repairEnabled').checked=d?.repairs.some(r=>r.enabled)||false;$('repairList').replaceChildren();if(d)d.repairs.forEach((r,i)=>{const b=element('button',`覆盖区 ${i+1} · ${Math.round(r.w)} × ${Math.round(r.h)}`,'repair-zone'+(r.id===repair()?.id?' active':''));b.onclick=()=>{activeRepairId=r.id;sync();schedule();};$('repairList').append(b);});$('pickPaper').disabled=!repair();$('deleteRepair').disabled=!repair();$('addText').disabled=!d;for(const id of ['exportPNG','exportBase','exportText','original','drawRepair'])$(id).disabled=!d;$('saveProject').disabled=!d;$('undo').disabled=!d||!history().past.length;$('redo').disabled=!d||!history().future.length;
}
function fit(){if(!doc())return;const well=$('canvasWell'),r=well.getBoundingClientRect(),w=doc().image.width,h=doc().image.height;const scale=Math.min((r.width-50)/w,(r.height-30)/h);$('canvasWrap').style.width=Math.max(10,w*scale)+'px';$('canvasWrap').style.height=Math.max(10,h*scale)+'px';}
function render(){const d=doc();if(!d)return;const c=$('canvas');if(c.width!==d.image.width||c.height!==d.image.height){c.width=d.image.width;c.height=d.image.height;$('overlay').width=c.width;$('overlay').height=c.height;}const result=L.render(d,images.get(d.id),showOriginal?'original':'all');c.getContext('2d').drawImage(result,0,0);fit();drawOverlay();}
function drawOverlay(){const c=$('overlay'),ctx=c.getContext('2d');ctx.clearRect(0,0,c.width,c.height);if(showOriginal||preview)return;const scale=c.width/Math.max(1,c.getBoundingClientRect().width);ctx.lineWidth=1*scale;ctx.strokeStyle='#6a8060';ctx.setLineDash([4*scale,3*scale]);const l=layer();if(l&&!l.hidden&&!l.locked&&mode==='select'){const m=L.metrics(l);ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.rotation*Math.PI/180);ctx.strokeRect(0,0,m.width,m.height);ctx.restore();const hs=T.handles(l,m,scale),top=T.world(l,m.width/2,0);ctx.setLineDash([]);ctx.beginPath();ctx.moveTo(top.x,top.y);ctx.lineTo(hs[4].x,hs[4].y);ctx.stroke();for(const h of hs){ctx.fillStyle='#fffdf5';ctx.beginPath();if(h.kind==='rotate')ctx.arc(h.x,h.y,5*scale,0,Math.PI*2);else ctx.rect(h.x-4*scale,h.y-4*scale,8*scale,8*scale);ctx.fill();ctx.stroke();}}
 if(mode==='repair'&&drag?.start){const {x,y}=drag.start,ex=drag.current?.x??x,ey=drag.current?.y??y;ctx.fillStyle='#88a87522';ctx.fillRect(x,y,ex-x,ey-y);ctx.strokeRect(x,y,ex-x,ey-y);}else if(mode==='paper'&&repair()){const r=repair();ctx.strokeStyle='#b88857';ctx.strokeRect(r.x,r.y,r.w,r.h);}
}
const numeric={size:[8,400],tracking:[-2,30],lineHeight:[1,2.5],posX:[-16000,32000],posY:[-16000,32000],rotation:[-180,180],opacity:[.1,1],grain:[0,1],pressure:[0,1],edgeWear:[0,1],weight:[100,900],thickness:[0,.12],slant:[-25,25],outlineWidth:[0,10],effectStrength:[0,1]};
for(const id of ['text','size','direction','align','tracking','lineHeight','posX','posY','rotation','color','opacity','grain','pressure','edgeWear','weight','thickness','slant','outlineWidth','outlineColor','effectStrength','secondaryColor'])$(id).addEventListener('input',()=>{const l=layer();if(!l)return;const value=$(id).value;if(numeric[id]&&(value===''||!Number.isFinite(Number(value))))return;checkpoint(id);const key=id==='posX'?'x':id==='posY'?'y':id;if(['pressure','edgeWear'].includes(id)&&l.effect==='legacy')l.effect='ink';l[key]=numeric[id]?L.clamp(Number(value),...numeric[id]):value;changed();sync();});
$('colorHex').onchange=()=>{if(!layer())return;const v=$('colorHex').value.trim();if(!/^#[0-9a-f]{6}$/i.test(v)){toast('请输入六位颜色，例如 #514e42');$('colorHex').value=layer().color;return;}checkpoint('color');layer().color=v;changed();sync();};
$('multiply').onchange=()=>{if(!layer())return;checkpoint('multiply',true);layer().multiply=$('multiply').checked;changed();};
for(const b of document.querySelectorAll('[data-preset]'))b.onclick=()=>{const l=layer();if(!l)return;checkpoint('preset',true);const presets=window.PaperDesign.presets;Object.assign(l,presets[b.dataset.preset]);changed();sync();};
$('addText').onclick=()=>{if(!doc()||doc().layers.length>=30){toast('每张画面最多 30 个文字层。');return;}checkpoint('add',true);const l=L.layer({text:'写下一句话',x:doc().image.width*.1,y:doc().image.height*.87,size:Math.round(doc().image.width*.028),color:doc().palette[0]||'#514e42'});doc().layers.push(l);activeLayerId=l.id;changed();sync();setInspectorTab('text');$('text').focus();$('text').select();};
$('duplicateText').onclick=()=>{if(!layer()||doc().layers.length>=30)return;checkpoint('duplicate',true);const l={...L.copy(layer()),id:L.uid(),x:layer().x+20,y:layer().y+45};doc().layers.push(l);activeLayerId=l.id;changed();sync();};
function deleteLayer(id){const d=doc(),l=d?.layers.find(x=>x.id===id);if(!l||l.locked)return;checkpoint('delete',true);d.layers=d.layers.filter(x=>x.id!==id);if(activeLayerId===id)activeLayerId=d.layers.at(-1)?.id||null;changed();sync();toast('文字层已删除 · 可用 ⌘/Ctrl Z 撤销');}
let layerDrag=null;
function clearLayerDrop(){for(const el of $('layers').children)el.classList.remove('drop-before','drop-after','dragging');}
function moveLayer(id,targetId,after=false){const d=doc(),moving=d?.layers.find(x=>x.id===id);if(!moving||moving.locked||id===targetId)return false;const rows=[...d.layers].reverse(),target=rows.find(x=>x.id===targetId);if(!target)return false;const next=rows.filter(x=>x!==moving);next.splice(next.indexOf(target)+(after?1:0),0,moving);if(next.every((x,i)=>x===rows[i]))return false;checkpoint('order',true);d.layers=next.reverse();changed();sync();$('layerAnnouncement').textContent='图层顺序已更新，可撤销。';return true;}
function markDrop(row,y){clearLayerDrop();const after=y>row.getBoundingClientRect().top+row.getBoundingClientRect().height/2;row.classList.add(after?'drop-after':'drop-before');return after;}
function renderLayers(){
 const box=$('layers');box.replaceChildren();const d=doc();if(!d)return;
 for(const item of [...d.layers].reverse()){
  const row=element('div',undefined,'layer-item'+(item.id===activeLayerId?' active':'')+(item.locked?' locked':'')+(item.hidden?' layer-hidden':''));row.dataset.layer=item.id;row.setAttribute('role','listitem');row.draggable=!item.locked;
  const grip=element('span','⠿','layer-grip');grip.setAttribute('aria-hidden','true');grip.title='拖动调整叠放顺序';
  const choose=element('button',undefined,'layer-select');choose.setAttribute('aria-label','选择文字层 '+(item.text.trim()||'空白文字层'));choose.setAttribute('aria-pressed',String(item.id===activeLayerId));choose.title='选择图层；按住 Alt + 上/下方向键调整顺序';choose.append(element('span',(item.locked?'🔒 ':'')+(item.text.trim()||'空白文字层'),'layer-title'));choose.onclick=()=>{activeLayerId=item.id;sync(true);schedule();refreshAssistance();renderDesigns();};
  const remove=element('button',undefined,'layer-delete');remove.setAttribute('aria-label','删除文字层 '+(item.text.trim()||'空白文字层'));remove.title=item.locked?'先解锁才能删除':'删除这层 · 可撤销';remove.disabled=!!item.locked;remove.innerHTML='<svg viewBox="0 0 24 24" class="ui-icon" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V4h6v3M6 7l1 14h10l1-14M10 11v6m4-6v6"/></svg>';remove.onclick=e=>{e.stopPropagation();deleteLayer(item.id);};remove.onpointerdown=e=>e.stopPropagation();
  row.append(grip,choose,remove);box.append(row);
  row.ondragstart=e=>{if(item.locked||e.target.closest('.layer-delete')){e.preventDefault();return;}layerDrag={id:item.id,documentId:d.id};e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('text/plain',item.id);row.classList.add('dragging');};
  row.ondragover=e=>{if(layerDrag?.documentId!==doc()?.id)return;e.preventDefault();e.dataTransfer.dropEffect='move';markDrop(row,e.clientY);};
  row.ondrop=e=>{if(layerDrag?.documentId!==doc()?.id)return;e.preventDefault();e.stopPropagation();const after=markDrop(row,e.clientY),id=layerDrag.id;clearLayerDrop();layerDrag=null;moveLayer(id,item.id,after);};row.ondragend=()=>{layerDrag=null;clearLayerDrop();};
  choose.onkeydown=e=>{if(!e.altKey||!['ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();e.stopPropagation();const rows=[...d.layers].reverse(),i=rows.indexOf(item),target=rows[i+(e.key==='ArrowUp'?-1:1)];if(target&&moveLayer(item.id,target.id,e.key==='ArrowDown'))[...box.children].find(x=>x.dataset.layer===item.id)?.querySelector('.layer-select').focus();};
  // The grip supports pointer/touch dragging; dragging the row also supports native desktop DnD.
  let touch=null;
  grip.onpointerdown=e=>{if(item.locked||e.button!==0)return;e.preventDefault();touch={pointerId:e.pointerId,startY:e.clientY,target:null};grip.setPointerCapture(e.pointerId);};
  grip.onpointermove=e=>{if(!touch||Math.abs(e.clientY-touch.startY)<4)return;const rect=box.getBoundingClientRect();if(e.clientY<rect.top+18)box.scrollTop-=12;if(e.clientY>rect.bottom-18)box.scrollTop+=12;const target=document.elementFromPoint(e.clientX,e.clientY)?.closest('.layer-item');if(target&&box.contains(target)){touch.target=target.dataset.layer;touch.after=markDrop(target,e.clientY);}};
  grip.onpointerup=()=>{const t=touch;touch=null;clearLayerDrop();if(t?.target)moveLayer(item.id,t.target,t.after);};grip.onpointercancel=()=>{touch=null;clearLayerDrop();};
 }
}

$('pickColor').onclick=()=>{if(layer())setMode(mode==='pickColor'?'select':'pickColor');};$('drawRepair').onclick=()=>setMode(mode==='repair'?'select':'repair');$('pickPaper').onclick=()=>setMode(mode==='paper'?'select':'paper');
$('repairEnabled').onchange=()=>{if(!doc())return;if(!doc().repairs.length){$('repairEnabled').checked=false;setMode('repair');toast('先在画面上框选需要覆盖的旧字。');return;}checkpoint('repair-toggle',true);for(const r of doc().repairs)r.enabled=$('repairEnabled').checked;changed();};
$('deleteRepair').onclick=()=>{if(!repair())return;checkpoint('repair-delete',true);const id=repair().id;doc().repairs=doc().repairs.filter(r=>r.id!==id);activeRepairId=doc().repairs[0]?.id||null;setMode('select');changed();sync();};
function pointer(e){const rect=$('overlay').getBoundingClientRect();return {x:(e.clientX-rect.left)*$('overlay').width/rect.width,y:(e.clientY-rect.top)*$('overlay').height/rect.height};}
$('overlay').onpointerdown=e=>{if(!doc()||showOriginal||preview)return;const p=pointer(e);$('overlay').focus();
 if(mode==='pickColor'){if(layer()){checkpoint('eyedropper',true);layer().color=L.sampledColor(images.get(doc().id),p.x,p.y);changed();sync();}setMode('select');return;}
 if(mode==='paper'){const r=repair();if(r){checkpoint('paper-sample',true);r.sx=L.clamp(p.x-r.w/2,0,doc().image.width-r.w);r.sy=L.clamp(p.y-r.h/2,0,doc().image.height-r.h);r.enabled=true;changed();sync();}setMode('select');return;}
 if(mode==='repair'){if(doc().repairs.length>=15){toast('最多 15 个覆盖区域。');return;}drag={start:p,current:p,kind:'repair'};$('overlay').setPointerCapture(e.pointerId);return;}
 const selected=layer(),scale=$('overlay').width/$('overlay').getBoundingClientRect().width,h=selected?T.pick(selected,L.metrics(selected),p,scale):null;if(h&&!selected.locked&&!selected.hidden){checkpoint('transform',true);drag=T.begin(selected,L.metrics(selected),h,p);$('overlay').setPointerCapture(e.pointerId);return;}
 const hit=[...doc().layers].reverse().find(l=>!l.locked&&!l.hidden&&L.hit(l,p.x,p.y));if(hit){activeLayerId=hit.id;checkpoint('drag',true);drag={kind:'text',start:p,x:hit.x,y:hit.y};$('overlay').setPointerCapture(e.pointerId);sync();schedule();}
};
$('overlay').onpointermove=e=>{if(!doc()||preview)return;const p=pointer(e);if(drag){if(drag.kind==='repair'){drag.current=p;schedule();}else if(['rotate','scale'].includes(drag.kind)&&layer()){Object.assign(layer(),T.update(drag,p,L.metrics,e.shiftKey));for(const [id,key]of [['size','size'],['rotation','rotation'],['posX','x'],['posY','y']])$(id).value=Math.round(layer()[key]*10)/10;changed();}else if(layer()){layer().x=Math.round(L.clamp(drag.x+p.x-drag.start.x,0,doc().image.width-10));layer().y=Math.round(L.clamp(drag.y+p.y-drag.start.y,0,doc().image.height-10));$('posX').value=layer().x;$('posY').value=layer().y;changed();}}else if(mode==='select'){const l=layer(),h=l?T.pick(l,L.metrics(l),p,$('overlay').width/$('overlay').getBoundingClientRect().width):null;$('overlay').style.cursor=h?(h.kind==='rotate'?'grab':h.corner==='nw'||h.corner==='se'?'nwse-resize':'nesw-resize'):[...doc().layers].some(l=>!l.locked&&!l.hidden&&L.hit(l,p.x,p.y))?'move':'default';}};
function finishDrag(e){if(!drag)return;if(drag.kind==='repair'){const p=drag.current||pointer(e),x=Math.max(0,Math.min(p.x,drag.start.x)),y=Math.max(0,Math.min(p.y,drag.start.y)),w=Math.min(doc().image.width-x,Math.abs(p.x-drag.start.x)),h=Math.min(doc().image.height-y,Math.abs(p.y-drag.start.y));if(w>12&&h>10){checkpoint('repair-add',true);const r={id:L.uid(),x:Math.round(x),y:Math.round(y),w:Math.round(w),h:Math.round(h),sx:Math.round(x),sy:Math.max(0,Math.round(y-h-20)),feather:8,enabled:true};doc().repairs.push(r);activeRepairId=r.id;setMode('paper');toast('再点击附近的空白纸面，选取纸纹。');changed();}}drag=null;sync();schedule();}
$('overlay').onpointerup=finishDrag;$('overlay').onpointercancel=()=>{drag=null;schedule();};
$('undo').onclick=undo;$('redo').onclick=redo;
document.addEventListener('keydown',e=>{if(e.defaultPrevented)return;const editing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(e.key==='Escape'){if(preview)setPreview(false);setMode('select');drag=null;return;}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='s'){e.preventDefault();saveProject();return;}if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='z'&&!editing){e.preventDefault();e.shiftKey?redo():undo();return;}if(!editing&&!e.metaKey&&!e.ctrlKey&&e.key.toLowerCase()==='p'){e.preventDefault();setPreview(!preview);return;}if(editing||preview||!layer()||layer().locked||layer().hidden)return;if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)){e.preventDefault();checkpoint('nudge');const step=e.shiftKey?10:1;layer().x=L.clamp(layer().x+(e.key==='ArrowRight'?step:e.key==='ArrowLeft'?-step:0),0,doc().image.width-10);layer().y=L.clamp(layer().y+(e.key==='ArrowDown'?step:e.key==='ArrowUp'?-step:0),0,doc().image.height-10);changed();sync();}if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();deleteLayer(activeLayerId);}});
$('original').onpointerdown=e=>{showOriginal=true;$('original').setPointerCapture(e.pointerId);schedule();};function endOriginal(){if(showOriginal){showOriginal=false;schedule();}}$('original').onpointerup=endOriginal;$('original').onpointercancel=endOriginal;window.addEventListener('blur',endOriginal);
const filename=s=>s.replace(/[\\/:*?"<>|\x00-\x1f]/g,'-').slice(0,80)||'纸上文字';
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);}
function saveProject(){if(!project?.documents.length)return;project.updatedAt=new Date().toISOString();const payload={...portableProject(),exportNotes:{imageDimensions:'Original dimensions retained',fonts:'Used bundled and imported fonts embedded; system font names referenced only',textTexture:'Deterministic seeded grain and background luminance modulation',repairs:'Reversible nearby paper patches; not recovery of underlying image pixels'}};download(new Blob([JSON.stringify(payload)],{type:'application/json'}),filename(project.title)+'.paper.json');saveDraft();toast('工程已交给浏览器保存，包含底图和可编辑文字层。');}
async function exportImage(kind){if(!doc())return;try{await Promise.all(doc().layers.map(l=>F.ensure(l.font)));await document.fonts.ready;const out=L.render(doc(),images.get(doc().id),kind);const blob=await new Promise(resolve=>out.toBlob(resolve,'image/png'));if(!blob)throw new Error('图片导出失败。');download(blob,filename(doc().title)+(kind==='base'?'_无字底图':kind==='text'?'_透明文字':'_文字编辑')+'.png');toast(`已导出 ${out.width} × ${out.height} PNG`+(kind==='text'?'；叠加时可选择正片叠底。':'，保留底图尺寸。'));}catch(e){safeError(e);}}
$('saveProject').onclick=saveProject;$('exportPNG').onclick=()=>exportImage('all');$('exportBase').onclick=()=>exportImage('base');$('exportText').onclick=()=>exportImage('text');
$('openProject').onclick=()=>$('projectFile').click();$('projectFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{if(file.size>260000000)throw new Error('工程文件超过 260 MB。');const next=JSON.parse(await file.text());if(project.documents.length&&!confirm('打开工程会替换当前工作区。需要保留当前工程时，请先点「保存工程」。继续打开？'))return;await loadProject(next);changed();toast('工程已打开，文字仍可编辑。');}catch(err){safeError(err);}};
function fileDataURL(file){return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(new Error('文件读取失败。'));r.readAsDataURL(file);});}
async function sha256(file){if(!crypto.subtle)return null;const h=await crypto.subtle.digest('SHA-256',await file.arrayBuffer());return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,'0')).join('');}
async function importFiles(files){for(const file of files){try{if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('请选择 PNG、JPEG 或 WebP 图片。');if(file.size>80000000)throw new Error('单张文件最多 80 MB。');if(project.documents.length>=40)throw new Error('每个工程最多 40 张图片。');const originalURL=await fileDataURL(file),im=await L.loadImage(originalURL),w=im.naturalWidth,h=im.naturalHeight;if(w*h>24000000)throw new Error('请导入 2400 万像素以内的图片。');if(project.documents.reduce((n,d)=>n+d.image.width*d.image.height,0)+w*h>100000000)throw new Error('工程合计最多 1 亿像素，请另存工程后再开始一组。');const clean=L.canvas(w,h);clean.getContext('2d').drawImage(im,0,0);const dataURL=clean.toDataURL('image/png');if(project.documents.reduce((n,d)=>n+d.image.dataURL.length,0)+dataURL.length>140000000)throw new Error('工程图片数据超过 140 MB，请另开工程。');const id=L.uid(),d={id,title:file.name.replace(/\.[^.]+$/,''),image:{dataURL,width:w,height:h,originalFilename:file.name,sourceFileSHA256:await sha256(file),metadata:'Decoded and re-encoded locally; EXIF/GPS not carried into the working PNG'},layers:[L.layer({x:Math.round(w*.1),y:Math.round(h*.88),size:Math.max(16,Math.round(w*.028))})],repairs:[],palette:['#514e42','#837761','#476251','#a45d46','#efe6d4'],provenance:{importedAt:new Date().toISOString(),source:'user-selected local image',network:'none'}};project.documents.push(d);images.set(id,await L.loadImage(dataURL));selectDoc(id);changed();}catch(e){safeError(e);}}}
$('openImage').onclick=$('importImage').onclick=()=>$('imageFile').click();$('imageFile').onchange=async e=>{await importFiles([...e.target.files]);e.target.value='';};
window.addEventListener('dragover',e=>{if(e.dataTransfer?.types.includes('Files'))e.preventDefault();});window.addEventListener('drop',async e=>{if(!e.dataTransfer?.files.length)return;e.preventDefault();await importFiles([...e.dataTransfer.files]);});
function portableProject(){return {...L.copy(project),fonts:F.used(project)};}
function setPreview(value){preview=value;drag=null;document.body.classList.toggle('previewing',preview);$('preview').textContent=preview?'返回编辑 · P':'预览成图 · P';$('preview').setAttribute('aria-pressed',String(preview));$('preview').classList.toggle('active',preview);setMode('select');schedule();}
$('preview').onclick=()=>setPreview(!preview);
function refreshFontOptions(){const current=$('font').value;$('font').replaceChildren();const groups=new Map();for(const f of F.list()){const category=f.category||'工程字体';if(!groups.has(category)){const group=element('optgroup');group.label=category;groups.set(category,group);$('font').append(group);}const option=element('option',f.label);option.value=f.id;groups.get(category).append(option);}$('font').value=current;}
$('font').oninput=async()=>{const target=layer(),id=$('font').value,seq=++fontSequence;if(!target)return;try{$('fontStatus').textContent='正在载入字体…';await F.ensure(id);if(seq!==fontSequence||target!==layer())return;checkpoint('font',true);target.font=id;const range=F.info(id)?.weight_range;target.weight=range?L.clamp(target.weight,...range):400;changed();sync();$('fontStatus').textContent=F.list().find(f=>f.id===id)?.localFamily?'系统字体仅在这台电脑引用；便携工程建议用内置字体。':'字体已载入；保存工程会携带所用的内置/导入字体。';}catch(e){safeError(e);sync(true);}};
$('systemFonts').onclick=async()=>{try{const count=await F.systemFonts();refreshFontOptions();sync(true);$('fontStatus').textContent=`已读取 ${count} 个系统字体家族。只在本机引用，不复制 Apple 字体。`;}catch(e){$('fontStatus').textContent='未读取系统字体；可继续使用内置字库或导入字体文件。';toast(e.name==='NotAllowedError'?'未获得系统字体权限，内置字库仍可使用。':e.message);}};
$('importFont').onclick=()=>$('fontFile').click();$('fontFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file)return;try{const id=await F.importFile(file);refreshFontOptions();if(layer()){checkpoint('font',true);layer().font=id;changed();}sync(true);$('fontStatus').textContent='字体已导入。工程会包含字体文件；分享前请确认该字体许可。';}catch(e){safeError(e);}};
$('stampBorder').onchange=()=>{if(!layer())return;checkpoint('stamp-border',true);layer().stampBorder=$('stampBorder').checked;if(layer().stampBorder)layer().effect='stamp';changed();sync();};
function refreshAssistance(){clearTimeout(colorTimer);colorTimer=setTimeout(()=>{if(!doc()||!layer()){colorCache=null;$('colorSuggestions').replaceChildren();$('aiSuggestions').replaceChildren();return;}try{renderEffectPreview();colorCache=C.analyze(doc(),images.get(doc().id),layer());showColors($('colorSuggestions'),colorCache.suggestions);const ai=doc().aiPalette;$('aiBadge').textContent=ai?'已有建议':'等待建议';showColors($('aiSuggestions'),ai?.colors||[]);$('aiNote').textContent=ai?'AI 根据画面提出的候选颜色；悬停可看选择理由。':'连接后点击「让 AI 推荐配色」，建议会直接出现在这里。';}catch(e){safeError(e);}},220);}
function showColors(container,colors){container.replaceChildren();for(const item of colors){const b=element('button',undefined,'color-card'),swatch=element('i');swatch.style.background=item.hex;const ratio=item.contrast??colorCache?.score(item.hex);b.title=`${item.hex} · ${item.reason||''} · 参考对比 ${ratio?.toFixed(1)||'—'}:1`;b.setAttribute('aria-label',item.name+' '+item.hex);b.append(swatch,element('span',item.name),element('small',ratio?`${ratio.toFixed(1)}:1`:'—'));b.onclick=()=>{if(!layer()||layer().locked)return;checkpoint('suggested-color',true);layer().color=item.hex;changed();sync();};container.append(b);}}
function renderEffectPreview(){const c=$('effectPreview'),ctx=c.getContext('2d'),background=L.canvas(c.width,c.height),bc=background.getContext('2d');bc.fillStyle='#e9e2d0';bc.fillRect(0,0,c.width,c.height);const image=new Image();image.src=background.toDataURL();image.onload=()=>{if(!layer())return;const l={...L.copy(layer()),hidden:false,text:'纸上墨色 Ink',size:52,x:28,y:43,rotation:0,direction:'horizontal',align:'left',tracking:2,lineHeight:1};const result=L.render({repairs:[],layers:[l]},image);ctx.clearRect(0,0,c.width,c.height);ctx.drawImage(result,0,0);};}
$('requestAI').onclick=async()=>{if(!doc()||!layer())return;try{const d=doc(),source=L.render(d,images.get(d.id),'base'),scale=Math.min(1,1200/Math.max(source.width,source.height)),small=L.canvas(source.width*scale,source.height*scale);small.getContext('2d').drawImage(source,0,0,small.width,small.height);const imageSHA256=d.image.sha256||d.image.sourceFileSHA256||null;const payload={type:'paper-lettering-color-request',version:1,documentId:d.id,imageSHA256,title:d.title,createdAt:new Date().toISOString(),preview:{dataURL:small.toDataURL('image/png'),width:small.width,height:small.height,metadata:'Canvas derivative; no EXIF/GPS'},layer:L.copy(layer()),localSuggestions:colorCache?.suggestions||[],instructions:'请使用 paper-lettering Skill 查看预览，为这张画面的文字推荐 4-6 个协调的颜色。可选互补/邻近等关系，兼顾实际文字区域的可读性，解释中文理由。不修改底图。返回 paper-lettering-palette JSON，原样保留 imageSHA256。',responseSchema:{type:'paper-lettering-palette',version:1,imageSHA256,colors:[{hex:'#31465b',name:'颜色名',reason:'根据实际画面说明理由'}]}};download(new Blob([JSON.stringify(payload)],{type:'application/json'}),filename(d.title)+'.paper-color-request.json');toast('请求文件已交给浏览器保存；它包含去除元数据的预览。由你决定是否发给 ChatGPT。');}catch(e){safeError(e);}};
$('importPalette').onclick=()=>$('paletteFile').click();$('paletteFile').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file||!doc())return;try{if(file.size>1000000)throw new Error('配色文件过大。');doc().aiPalette=C.validatePalette(JSON.parse(await file.text()),doc());changed();toast('AI 配色已导入，点击色卡即可试用。');}catch(e){safeError(e);}};
const D=window.PaperDesign;
let bridge=null,aiBusy=false,aiConnected=false,connectionPromise=null,connectionChecking=false,designSequence=0,applySequence=0,activityTimer=0,activityStarted=0;
let inspectorTab='text';const panelScroll={};
function setInspectorTab(key,{focus=false}={}){
 if(!['text','color','material','ai'].includes(key))return;
 const scroll=$('inspectorScroll');panelScroll[inspectorTab]=scroll.scrollTop;inspectorTab=key;
 for(const button of document.querySelectorAll('[data-inspector-tab]')){const selected=button.dataset.inspectorTab===key;button.setAttribute('aria-selected',String(selected));button.tabIndex=selected?0:-1;$('panel-'+button.dataset.inspectorTab).hidden=!selected;}
 scroll.scrollTop=panelScroll[key]||0;if(focus)$('tab-'+key).focus();try{localStorage.setItem('paper-lettering:inspector-tab',key);}catch(e){}
}
for(const b of document.querySelectorAll('[data-inspector-tab]')){b.onclick=()=>setInspectorTab(b.dataset.inspectorTab);b.onkeydown=e=>{const keys=['text','color','material','ai'],i=keys.indexOf(b.dataset.inspectorTab);let next;if(e.key==='ArrowRight')next=(i+1)%4;if(e.key==='ArrowLeft')next=(i+3)%4;if(e.key==='Home')next=0;if(e.key==='End')next=3;if(next!==undefined){e.preventDefault();e.stopPropagation();setInspectorTab(keys[next],{focus:true});}};}
try{setInspectorTab(localStorage.getItem('paper-lettering:inspector-tab')||'text');}catch(e){}
$('showDesigns').onclick=()=>{setInspectorTab('ai');$('tab-ai').focus();};
function progress(message){$('aiProgress').textContent=message;$('quickLayoutStatus').textContent=message;$('aiActivity').setAttribute('aria-valuetext',message);}
function startActivity(){activityStarted=Date.now();$('aiActivity').hidden=false;const tick=()=>{const seconds=Math.floor((Date.now()-activityStarted)/1000);$('aiElapsed').textContent=seconds<60?'已等待 '+seconds+' 秒':'已等待 '+Math.floor(seconds/60)+' 分 '+seconds%60+' 秒';};tick();clearInterval(activityTimer);activityTimer=setInterval(tick,1000);}
function endActivity(){clearInterval(activityTimer);$('aiActivity').hidden=true;$('aiElapsed').textContent='';}
function connectionState(state,label,detail){$('connectionStatus').dataset.state=state;$('connectionLabel').textContent=label;$('aiConnection').textContent=detail;}

const layoutFingerprint=d=>JSON.stringify({layers:d.layers,repairs:d.repairs});
function readBridge(){bridge=null;try{const key='paper-lettering:connection:'+location.pathname,h=new URLSearchParams(location.hash.slice(1));let url=h.get('bridge'),token=h.get('token');if(!url){const stored=JSON.parse(sessionStorage.getItem(key)||'null');url=stored?.url;token=stored?.token;}if(/^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(url||'')&&/^[\w-]{30,100}$/.test(token||'')){bridge={url,token};try{sessionStorage.setItem(key,JSON.stringify(bridge));}catch(e){}}}catch(e){}}
readBridge();
window.addEventListener('hashchange',()=>{readBridge();connectAI();});
function syncTypography(){
 const l=layer(),r=l?F.info(l.font):null,range=r?.weight_range;
 for(const e of document.querySelectorAll('[data-layer-controls] input,[data-layer-controls] select,[data-layer-controls] textarea,[data-layer-controls] button'))e.disabled=!!l?.locked;
 $('weight').disabled=!l||l.locked||!range;$('weight').min=range?.[0]||100;$('weight').max=range?.[1]||900;
 $('weightNote').textContent=range?`可变字体原生字重 ${range[0]}–${range[1]}；下方笔画增粗可进一步调整。`:'这款字体没有已知可变字重；请使用「笔画增粗」。';
 $('lockLayer').disabled=!l;$('lockLayer').textContent=l?.locked?'解锁这层':'锁定这层';$('lockLayer').setAttribute('aria-pressed',String(!!l?.locked));
 $('hideLayer').disabled=!l||l.locked;$('hideLayer').textContent=l?.hidden?'显示这层':'隐藏这层';
 $('secondaryColor').disabled=!l||l.locked||l.effect!=='risograph';
 $('secondaryColor').closest('label').hidden=!l||l.effect!=='risograph';
 $('effectStrength').closest('label').hidden=!l||!['letterpress','screen','pencil','bleed','risograph'].includes(l.effect);
 $('stampBorder').closest('label').hidden=!l||l.effect!=='stamp';
 $('grain').closest('label').hidden=!l||['clean','pencil'].includes(l.effect);
 $('pressure').closest('label').hidden=!l||['clean','screen'].includes(l.effect);
 $('edgeWear').closest('label').hidden=!l||['clean','screen','pencil'].includes(l.effect);
}
$('lockLayer').onclick=()=>{if(!layer())return;checkpoint('lock',true);layer().locked=!layer().locked;changed();sync();};
$('hideLayer').onclick=()=>{if(!layer()||layer().locked)return;checkpoint('hide',true);layer().hidden=!layer().hidden;changed();sync();};

for(const b of document.querySelectorAll('[data-canvas-align]'))b.onclick=()=>{const l=layer(),d=doc();if(!l||l.locked)return;checkpoint('canvas-align',true);const m=L.metrics(l),points=[[0,0],[m.width,0],[m.width,m.height],[0,m.height]].map(([x,y])=>T.world(l,x,y)),xs=points.map(p=>p.x),ys=points.map(p=>p.y),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys),kind=b.dataset.canvasAlign,w=d.image.width,h=d.image.height;if(kind==='left')l.x+=w*.03-minX;if(kind==='center')l.x+=w/2-(minX+maxX)/2;if(kind==='right')l.x+=w*.97-maxX;if(kind==='top')l.y+=h*.03-minY;if(kind==='middle')l.y+=h/2-(minY+maxY)/2;if(kind==='bottom')l.y+=h*.97-maxY;changed();sync(true);};
function aiButtons(){
 for(const id of ['livePalette','liveDesign'])$(id).disabled=!aiConnected||aiBusy||!doc();$('connectAI').disabled=aiBusy||connectionChecking;$('connectionStatus').disabled=aiBusy||connectionChecking;$('connectAI').textContent=connectionChecking?'正在连接…':'重新连接';
 $('quickLayout').disabled=aiBusy||connectionChecking||!ready;$('quickLayout').setAttribute('aria-busy',String(aiBusy));$('quickLayoutLabel').textContent=aiBusy?'AI 正在工作…':connectionChecking?'正在连接…':!doc()?'导入图片开始':'一键 AI 排版';
 $('showDesigns').disabled=!doc();
}
async function api(path,body){if(!bridge)throw new Error('请从「纸上文字.app」或 AI 启动器打开编辑器。');const response=await fetch(bridge.url+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+bridge.token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const data=await response.json();if(!response.ok)throw new Error(data.error||'本机 AI 连接失败');return data;}
async function connectAI(){
 if(connectionPromise)return connectionPromise;
 connectionPromise=(async()=>{
  aiConnected=false;connectionChecking=true;aiButtons();
  connectionState('checking','正在连接 AI…','正在检查本机服务与现有 ChatGPT 登录，请稍候…');
  try{
   if(!bridge){connectionState('offline','AI 未启动 · 点击查看','这是离线编辑页，尚未收到启动器的连接信息。双击「纸上文字.app」或分享包的「启用AI助手」，使用新打开的页面。若已启动仍有此提示，请使用启动器新打开的标签页。');return;}
   const current=bridge,s=await api('/status');if(current!==bridge)return;
   aiConnected=!!s.loggedIn;connectionState(aiConnected?'connected':'error',aiConnected?'AI 已连接 · ChatGPT':'AI 需要登录 · 点击查看',s.message+(aiConnected?'。可直接点击「一键 AI 排版」。':'。完成后点「重新连接」。'));
  }catch(e){connectionState('error','AI 连接失败 · 点击重试','本机 AI 服务暂时不可达。点击「重新连接」重试；如果启动器已关闭，请再双击「纸上文字.app」。浏览器询问本地网络权限时，请允许本机连接。');}
  finally{connectionChecking=false;aiButtons();}
 })();try{await connectionPromise;}finally{connectionPromise=null;}
}
$('connectAI').onclick=async()=>{await connectAI();progress($('aiConnection').textContent);};
$('connectionStatus').onclick=async()=>{setInspectorTab('ai');await connectAI();};
// Keep an open editor connected; closing all its tabs allows the bridge to expire.
setInterval(async()=>{if(!bridge||connectionChecking||aiBusy)return;try{await api('/ping');if(!aiConnected)await connectAI();}catch(e){aiConnected=false;connectionState('error','AI 已断开 · 点击重试','本机服务已断开。请重新打开「纸上文字.app」，使用新打开的页面。');aiButtons();}},60000);

function adviceRequest(d,kind){const base=L.render(d,images.get(d.id),'base'),scale=Math.min(1,1200/Math.max(base.width,base.height)),small=L.canvas(Math.floor(base.width*scale),Math.floor(base.height*scale));small.getContext('2d').drawImage(base,0,0,small.width,small.height);return {mode:kind,documentId:d.id,imageSHA256:d.image.sha256||d.image.sourceFileSHA256||null,title:d.title,width:d.image.width,height:d.image.height,preview:{dataURL:small.toDataURL('image/png'),width:small.width,height:small.height},layers:d.layers.map(l=>({text:l.text,font:l.font,size:l.size,x:l.x,y:l.y,color:l.color})),localSuggestions:colorCache?.suggestions||[],preference:$('aiPreference').value};}
async function applyDesign(proposal,target,expected=layoutFingerprint(target)){
 const seq=++applySequence;
 await Promise.all(proposal.layers.map(l=>F.ensure(l.font)));
 if(seq!==applySequence||target!==doc()||!project.documents.includes(target))return false;
 if(layoutFingerprint(target)!==expected||target.layers.some(l=>l.locked))return false;
 const layers=D.layers(proposal,target);checkpoint('ai-design',true);target.layers=layers;
 target.designDecision={name:proposal.name,reason:proposal.reason,provenance:proposal.provenance||null,appliedAt:new Date().toISOString()};activeLayerId=layers[0].id;changed();sync(true);return true;
}
async function askAI(kind,{applyFirst=false}={}){
 if(!doc()||aiBusy)return;
 const target=doc(),payload=adviceRequest(target,kind),original=layoutFingerprint(target);
 aiBusy=true;aiButtons();startActivity();progress(applyFirst?'AI 正在选择字体、配色和位置…':'正在分析画面与文字，请稍候…');
 try{
  const {job}=await api('/advice',payload);let response;const until=Date.now()+300000;
  while(Date.now()<until){await new Promise(r=>setTimeout(r,1800));const s=await api('/jobs/'+encodeURIComponent(job));if(s.phase)progress(s.phase+'…');if(s.state==='failed')throw new Error(s.error);if(s.state==='complete'){response=s.result;break;}}
  if(!response)throw new Error('AI 请求超时，请稍后重新连接。');
  if(response.imageSHA256!==payload.imageSHA256||!project.documents.includes(target))throw new Error('画面已经更换，请为当前画面重新请求。');
  const palette=C.validatePalette({...response,type:'paper-lettering-palette'},target);
  if(kind==='design'){
   if(!Array.isArray(response.designs)||!response.designs.length)throw new Error('AI 未返回可用排版，当前文字保持不变。');
   for(const design of response.designs)D.layers(design,target);
   target.designSuggestions=response.designs.map(design=>({...design,provenance:{model:response.model,createdAt:response.createdAt,previewSHA256:response.previewSHA256,imageSHA256:response.imageSHA256}}));
  }
  target.aiPalette=palette;changed();renderDesigns();
  if(applyFirst){
   if(await applyDesign(target.designSuggestions[0],target,original)){setInspectorTab('text');progress('初排完成，直接微调即可；可撤销，或查看另一套方案。');toast('AI 初排已应用 · 可用 ⌘/Ctrl Z 撤销');}
   else{if(target===doc())setInspectorTab('ai');progress('方案已保存。画面或文字已变动，请到对应画面的 AI 页选择应用。');}
  }else{progress(kind==='design'?'方案已准备好。先看预览，再点击「应用此方案」。':'配色已准备好，点击色卡即可试用。');}
 }catch(e){progress(e.message);toast(e.message);}finally{aiBusy=false;endActivity();aiButtons();}
}
$('livePalette').onclick=()=>askAI('palette');$('liveDesign').onclick=()=>askAI('design');
$('quickLayout').onclick=async()=>{
 if(!doc()){$('imageFile').click();return;}
 if(doc().layers.some(l=>l.locked)){setInspectorTab('text');progress('请先解锁文字层，再进行一键排版。');toast('请先解锁文字层');return;}
 if(!aiConnected){setInspectorTab('ai');await connectAI();if(!aiConnected){progress('AI 尚未连接。'+$('aiConnection').textContent);return;}}
 setInspectorTab('ai');await askAI('design',{applyFirst:true});
};
async function renderDesigns(){
 const seq=++designSequence,d=doc(),box=$('designSuggestions');box.replaceChildren();aiButtons();if(!d)return;
 for(const proposal of d.designSuggestions||[]){try{const layers=D.layers(proposal,d);await Promise.all(layers.map(l=>F.ensure(l.font)));if(seq!==designSequence||d!==doc())return;const fitted=D.layers(proposal,d),card=element('div',undefined,'design-card');card.append(element('strong',proposal.name||'排版方案'),element('p',proposal.reason||''));const thumb=L.canvas(240,240*d.image.height/d.image.width),art=L.render({...d,layers:fitted},images.get(d.id));thumb.getContext('2d').drawImage(art,0,0,thumb.width,thumb.height);card.append(thumb);const button=element('button','应用此方案');button.onclick=async()=>{try{if(await applyDesign(proposal,d)){toast('方案已应用，文字层可继续编辑；可用撤销恢复。');progress('方案已应用。切换文字、颜色或质感页继续微调。');}else toast('画面或文字已变动，或文字层已锁定，请检查后再应用。');}catch(e){safeError(e);}};card.append(button);box.append(card);}catch(e){const note=element('p','此方案无法载入：'+e.message,'micro-note');box.append(note);}}
}

$('loadExamples').onclick=async()=>{
 try{const examples=starter.documents.filter(d=>d.provenance?.example).slice(0,2);if(!examples.length){toast('这个工程没有内置示例，请打开图片开始。');return;}
 let first=null;for(const sample of examples){const existing=project.documents.find(d=>d.image.sha256===sample.image.sha256);if(existing){first=first||existing.id;continue;}const d=L.normalizeProject({version:3,documents:[L.copy(sample)]}).documents[0];d.id=L.uid();for(const l of d.layers)l.id=L.uid();L.normalizeProject({...project,documents:[...project.documents,d]});images.set(d.id,await L.loadImage(d.image.dataURL));await Promise.all(d.layers.map(l=>F.ensure(l.font)));project.documents.push(d);first=first||d.id;}
 selectDoc(first);changed();toast('示例已就绪，可改字、试配色或一键排版。');
 }catch(e){safeError(e);}
};
refreshFontOptions();
new ResizeObserver(()=>{fit();drawOverlay();}).observe($('canvasWell'));
try{try{db=await openDB();}catch(e){console.warn('Browser draft store unavailable',e);}let stored=null;try{stored=db?await getDraft():null;if(!stored&&db)for(const alias of starter.draftAliases||[]){stored=await getDraft('draft:'+alias);if(stored){stored.id=starter.id;toast('已接续上一版草稿，旧版草稿仍保留。');break;}}}catch(e){console.warn(e);}if(stored?.documents?.length===0&&starter.documents.length)stored=null;try{await loadProject(stored||starter);}catch(e){if(!stored)throw e;await loadProject(starter);toast('旧草稿无法读取，已载入初始工程。');}await document.fonts.ready;ready=true;schedule();$('saveStatus').textContent=stored?'已恢复本机草稿':db?'可以开始编辑':'请用「保存工程」留存';}catch(e){safeError(e);$('saveStatus').textContent='加载失败';}
// Small read-only hooks support reproducible local rendering and browser checks.
connectAI();
window.paperStudio={get ready(){return ready;},getProject:()=>L.copy(project),getSelected:()=>L.copy(doc()),getMode:()=>mode,getPreview:()=>preview,getInspectorTab:()=>inspectorTab};
})();
