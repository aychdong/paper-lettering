/* Deterministic candidate search, constraints and final-ink visibility checks. */
(function(g){
'use strict';const L=g.Lettering,T=g.PaperTypography,F=g.PaperFonts,D=g.PaperDesign;
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(value)))),b=>b.toString(16).padStart(2,'0')).join('');
const imageDigest=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',Uint8Array.from(atob(data.split(',')[1]),c=>c.charCodeAt(0)))),b=>b.toString(16).padStart(2,'0')).join('');
function bounds(l){const m=L.metrics(l),pad=l.size*(l.thickness||0)/2+(l.outlineWidth||0),corners=[[-pad,-pad],[m.width+pad,-pad],[m.width+pad,m.height+pad],[-pad,m.height+pad]].map(([x,y])=>g.PaperTransforms.world(l,x,y));return {x:Math.min(...corners.map(p=>p.x)),y:Math.min(...corners.map(p=>p.y)),w:Math.max(...corners.map(p=>p.x))-Math.min(...corners.map(p=>p.x)),h:Math.max(...corners.map(p=>p.y))-Math.min(...corners.map(p=>p.y))};}
const overlaps=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
const protectedRegions=scene=>(scene.regions||[]).filter(r=>r.role!=='preferred');
function normalized(l,d){return {text:l.text,font:l.font,size:l.size/d.image.width,weight:l.weight,thickness:l.thickness,slant:l.slant,x:l.x/d.image.width,y:l.y/d.image.height,rotation:l.rotation,direction:l.direction,align:l.align,tracking:l.tracking/l.size,lineHeight:l.lineHeight,color:l.color,effect:l.effect};}
function materialLayer(p,d){const base=D.presets[p.effect==='faded'?'soft':p.effect]||D.presets.ink,size=p.size*d.image.width;return L.normalizeLayer({...base,...p,size,x:p.x*d.image.width,y:p.y*d.image.height,tracking:p.tracking*size,renderer:'harfbuzz-1',seed:71429},d.image.width,d.image.height);}
function preview(art,limit=1200){const scale=Math.min(1,limit/Math.max(art.width,art.height)),c=L.canvas(Math.round(art.width*scale),Math.round(art.height*scale));c.getContext('2d').drawImage(art,0,0,c.width,c.height);return {dataURL:c.toDataURL('image/png'),width:c.width,height:c.height};}
function luminance(r,g,b){return [r,g,b].map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((n,v,i)=>n+v*[.2126,.7152,.0722][i],0);}
function visibility(d,img,layers,art){const base=L.render({...d,layers:d.layers.filter(l=>l.locked&&!l.hidden)},img),b=base.getContext('2d').getImageData(0,0,base.width,base.height).data,a=art.getContext('2d').getImageData(0,0,art.width,art.height).data;const scores=[];for(const l of layers){const mask=L.render({...d,repairs:[],layers:[{...l,color:'#ffffff',effect:'clean',opacity:1,multiply:false,grain:0}]},img,'text'),m=mask.getContext('2d').getImageData(0,0,mask.width,mask.height).data,ratios=[],contrasts=[];for(let i=0;i<m.length;i+=4){if(m[i+3]<220)continue;const before=luminance(b[i],b[i+1],b[i+2]),after=luminance(a[i],a[i+1],a[i+2]);ratios.push((Math.max(before,after)+.05)/(Math.min(before,after)+.05));contrasts.push(Math.abs(before-after));}ratios.sort((x,y)=>x-y);scores.push({median:ratios[Math.floor(ratios.length*.5)]||1,p10:ratios[Math.floor(ratios.length*.1)]||1,visibleFraction:ratios.filter(v=>v>=1.5).length/Math.max(1,ratios.length),corePixels:ratios.length});}return scores;}
function check(d,img,layers,scene){const errors=[],warnings=[],rects=layers.map(bounds),w=d.image.width,h=d.image.height;
 layers.forEach((l,i)=>{const b=rects[i],m=L.metrics(l),textLint=T.lint(T.lines(l),{poetic:l.typesetting?.poetic});errors.push(...textLint.errors);warnings.push(...textLint.warnings);if(m.missing?.length)errors.push('缺字：'+m.missing.join(''));if(m.fallbacks?.length)warnings.push('部分字使用内置宋体回退');if(b.x<0||b.y<0||b.x+b.w>w||b.y+b.h>h)errors.push('文字出界');for(const other of rects.slice(0,i))if(overlaps(b,other))errors.push('文字层相互遮挡');for(const locked of d.layers.filter(x=>x.locked&&!x.hidden))if(overlaps(b,bounds(locked)))errors.push('文字与锁定层遮挡');for(const r of protectedRegions(scene)){const margin=r.confidence<.7?.02:.008,zone={x:(r.x-margin)*w,y:(r.y-margin)*h,w:(r.w+margin*2)*w,h:(r.h+margin*2)*h};if(overlaps(b,zone))errors.push('进入主体保护区域：'+r.label);if(r.confidence<.7)warnings.push('主体位置不确定，使用扩大保护区域');}});
 if(errors.length)return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],rects};
 const art=L.render({...d,layers:[...layers,...d.layers.filter(l=>l.locked&&!l.hidden)]},img),ink=visibility(d,img,layers,art);
 for(const s of ink){if(s.corePixels<6||s.median<1.8||s.visibleFraction<.55)errors.push('最终笔画可读性不足');else if(s.median<3||s.p10<1.5)warnings.push('部分笔画对比较弱，请查看文字细节');}
 return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],rects,ink,art};
}
function density(base,box){const c=L.canvas(48,48),ctx=c.getContext('2d');ctx.drawImage(base,Math.max(0,box.x),Math.max(0,box.y),Math.max(1,box.w),Math.max(1,box.h),0,0,48,48);const p=ctx.getImageData(0,0,48,48).data;let n=0;for(let y=1;y<48;y++)for(let x=1;x<48;x++){const i=(y*48+x)*4;for(let k=0;k<3;k++)n+=Math.abs(p[i+k]-p[i-4+k])+Math.abs(p[i+k]-p[i-48*4+k]);}return n/(47*47*6*255);}
async function search(briefs,scene,d,img,{placement='auto',action='all',copyMode=d.aiSettings?.copyMode||'compose',isCancelled=()=>false}={}){
 await T.ready;const allFonts=new Set(['gf-notoserifsc',...briefs.flatMap(b=>b.layers.map(l=>l.font))]);await Promise.all([...allFonts].map(id=>F.ensure(id)));const base=L.render(d,img,'base'),results=[];const diagnostics=[];
 for(const brief of briefs){if(brief.retain){results.push(brief.retain);continue;}let best=null;
 for(let variant=0;variant<(action==='copy'?1:4);variant++){
  await new Promise(r=>setTimeout(r,0));if(isCancelled())throw new Error('任务已取消');
  const originals=d.layers.filter(l=>!l.hidden&&!l.locked&&l.text.trim()).map(l=>l.text);
  const layers=brief.layers.map((p,i)=>{let l=materialLayer(p,d);if(action==='copy'){const old=d.layers.filter(l=>!l.hidden&&!l.locked&&l.text.trim())[i];if(!old)return null;l={...L.copy(old),id:L.uid(),text:p.text,renderer:old.renderer||'legacy'};}if(copyMode==='preserve'){const at=originals.findIndex(text=>text.replace(/\n/g,'')===p.text.replace(/\n/g,''));if(at<0)return null;l.text=originals.splice(at,1)[0];}
   const vertical=l.direction==='vertical',limit=vertical?Math.floor(d.image.height*.36/(l.size+l.tracking)):Math.floor(d.image.width*(variant===2?.42:.65)/(l.size+l.tracking));
   const visualText=copyMode==='preserve'&&l.text.includes('\n')&&!p.text.includes('\n')?l.text:p.text;
   const parts=variant===0?visualText.split('\n'):T.breaks(visualText,limit,brief.phrases||[]);l.typesetting={source:l.text,lines:parts,poetic:brief.poetic==='yes'};
   return l;});if(layers.some(x=>!x))continue;
  if(action!=='copy'&&variant){const boxes=layers.map(bounds),x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y)),width=Math.max(...boxes.map(b=>b.x+b.w))-x,height=Math.max(...boxes.map(b=>b.y+b.h))-y,w=d.image.width,h=d.image.height,edge=Math.max(20,w*.035);let tx,ty;
   const position=placement==='auto'?['','top','left','bottom'][variant]:placement;
   if(position==='right'){tx=w-width-edge;ty=variant===1?edge:variant===2?(h-height)/2:h-height-edge;}
   else if(position==='left'){tx=edge;ty=variant===1?edge:variant===2?(h-height)/2:h-height-edge;}
   else if(position==='bottom'){ty=h-height-edge;tx=variant===1?edge:variant===2?(w-width)/2:w-width-edge;}
   else{ty=edge;tx=variant===1?edge:variant===2?(w-width)/2:w-width-edge;}
   layers.forEach(l=>{l.x+=tx-x;l.y+=ty-y;});
  }
  const c=check(d,img,layers,scene);diagnostics.push({id:brief.id,variant,errors:c.errors,warnings:c.warnings});if(c.errors.length)continue;
  const rank=c.rects.reduce((sum,b)=>sum+density(base,b),0)+(variant===0?-.03:0);if(!best||rank<best.rank)best={rank,layers,checks:c,variant};
 }
 if(!best)continue;const {art,...checks}=best.checks,p=preview(art),cropRect=checks.rects[0],crop=L.canvas(Math.min(1200,Math.ceil(cropRect.w+30)),Math.min(1200,Math.ceil(cropRect.h+30)));crop.getContext('2d').drawImage(art,Math.max(0,cropRect.x-15),Math.max(0,cropRect.y-15),crop.width,crop.height,0,0,crop.width,crop.height);
 const renderLayers=best.layers.map(({id,...l})=>l),layers=best.layers.map(l=>normalized(l,d));results.push({id:brief.id,name:brief.name,reason:brief.reason,layers,renderLayers,checks:{...checks,variant:best.variant,renderer:T.version,fontVersions:best.layers.map(l=>({id:l.font,sha256:F.info(l.font)?.sha256||null})),visibilityPolicy:'core-ink-v1; heuristic, not WCAG certification'},preview:p,previewSHA256:await imageDigest(p.dataURL),parametersSHA256:await digest(renderLayers),parametersJSON:JSON.stringify(renderLayers),crops:[preview(crop)]});
 }
 return {candidates:results,diagnostics};
}
g.PaperQuality={search,check,bounds,digest,imageDigest,preview,normalized,materialLayer,visibility};
})(window);
