/* Local, deterministic lettering. No network, no generative processing. */
(function (global) {
'use strict';
const VERSION = 3;
const FONTS = {song:'"Songti SC", "STSong", "Noto Serif CJK SC", serif',kai:'"Kaiti SC", "STKaiti", "KaiTi", serif',hei:'"PingFang SC", "Heiti SC", "Microsoft YaHei", sans-serif',serif:'Georgia, "Times New Roman", "Songti SC", serif'};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const copy=x=>JSON.parse(JSON.stringify(x));
const uid=()=>global.crypto?.randomUUID?.() || 'id-'+Date.now()+'-'+Math.random().toString(36).slice(2);
const canvas=(w,h)=>{const c=document.createElement('canvas');c.width=Math.max(1,Math.ceil(w));c.height=Math.max(1,Math.ceil(h));return c;};
const num=(v,fallback,a,b)=>Number.isFinite(Number(v)) ? clamp(Number(v),a,b) : fallback;
const chars=s=>global.Intl?.Segmenter ? [...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(s)].map(x=>x.segment) : Array.from(s);
function layer(overrides={}) {return {id:uid(),text:'写下一句话',x:80,y:100,font:'song',weight:400,thickness:0,slant:0,outlineWidth:0,outlineColor:'#f3ead6',hidden:false,locked:false,size:30,tracking:3,lineHeight:1.4,align:'left',direction:'horizontal',rotation:0,color:'#514e42',opacity:.88,grain:.28,multiply:true,effect:'ink',pressure:.55,edgeWear:.2,stampBorder:false,effectStrength:.5,secondaryColor:'#ba694b',seed:71429,...overrides};}
function normalizeLayer(x,w,h) {
 return layer({id:typeof x.id==='string'?x.id:uid(),text:String(x.text??'').slice(0,500),x:num(x.x,50,-w,w*2),y:num(x.y,50,-h,h*2),font:FONTS[x.font]?x.font:'song',weight:num(x.weight,400,100,900),thickness:num(x.thickness,0,0,.12),slant:num(x.slant,0,-25,25),outlineWidth:num(x.outlineWidth,0,0,10),outlineColor:/^#[0-9a-f]{6}$/i.test(x.outlineColor)?x.outlineColor:'#f3ead6',hidden:x.hidden===true,locked:x.locked===true,size:num(x.size,30,8,400),tracking:num(x.tracking,3,-2,30),lineHeight:num(x.lineHeight,1.4,1,2.5),align:['left','center','right'].includes(x.align)?x.align:'left',direction:x.direction==='vertical'?'vertical':'horizontal',rotation:num(x.rotation,0,-180,180),color:/^#[0-9a-f]{6}$/i.test(x.color)?x.color:'#514e42',opacity:num(x.opacity,.88,.1,1),grain:num(x.grain,.28,0,1),multiply:x.multiply!==false,effect:['ink','faded','stamp','clean','legacy','letterpress','screen','pencil','bleed','risograph'].includes(x.effect)?x.effect:'legacy',pressure:num(x.pressure,.55,0,1),edgeWear:num(x.edgeWear,.2,0,1),stampBorder:x.stampBorder===true,effectStrength:num(x.effectStrength,.5,0,1),secondaryColor:/^#[0-9a-f]{6}$/i.test(x.secondaryColor)?x.secondaryColor:'#ba694b',seed:num(x.seed,71429,0,2147483647)});
}
function normalizeProject(p) {
 if(!p || ![1,2,VERSION].includes(p.version) || !Array.isArray(p.documents) || p.documents.length>40) throw new Error('不是支持的文字工程，或画面超过 40 张。');
 let pixels=0;
 const documents=p.documents.map((d,i)=>{
  if(!d.image || typeof d.image.dataURL!=='string' || !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(d.image.dataURL)) throw new Error('工程中的底图必须是内嵌 PNG、JPEG 或 WebP。');
  const w=num(d.image.width,0,0,16000),h=num(d.image.height,0,0,16000);pixels+=w*h;
  if(!w||!h||w*h>24000000||pixels>100000000)throw new Error('单张底图最多 2400 万像素，工程合计最多 1 亿像素。');
  if(!Array.isArray(d.layers)||d.layers.length>30||!Array.isArray(d.repairs)||d.repairs.length>15)throw new Error('文字层或覆盖区域数量超出范围。');
  return {id:typeof d.id==='string'?d.id:uid(),title:String(d.title||'画面 '+(i+1)).slice(0,80),image:{...d.image,width:w,height:h},layers:d.layers.map(x=>normalizeLayer(x,w,h)),repairs:d.repairs.map(r=>({id:typeof r.id==='string'?r.id:uid(),x:num(r.x,0,0,w-1),y:num(r.y,0,0,h-1),w:num(r.w,100,1,w),h:num(r.h,50,1,h),sx:num(r.sx,0,0,w-1),sy:num(r.sy,0,0,h-1),feather:num(r.feather,8,0,30),enabled:r.enabled!==false})),palette:Array.isArray(d.palette)?d.palette.filter(x=>/^#[0-9a-f]{6}$/i.test(x)).slice(0,12):['#514e42','#837761','#476251'],aiPalette:d.aiPalette||null,designSuggestions:Array.isArray(d.designSuggestions)?d.designSuggestions:[],designDecision:d.designDecision||null,aiSettings:{copyMode:d.aiSettings?.copyMode==='preserve'?'preserve':'compose',placement:['right','left','top','bottom'].includes(d.aiSettings?.placement)?d.aiSettings.placement:'auto',preference:typeof d.aiSettings?.preference==='string'?d.aiSettings.preference.slice(0,500):''},provenance:d.provenance||{}};
 });
 // Duplicate identifiers would confuse selection, saving and undo history.
 const ids=new Set();for(const d of documents){if(ids.has(d.id))d.id=uid();ids.add(d.id);const lids=new Set();for(const l of d.layers){if(lids.has(l.id))l.id=uid();lids.add(l.id);}}
 return {version:VERSION,app:'photo-studio-lettering',id:typeof p.id==='string'?p.id:uid(),title:String(p.title||'纸上文字工程').slice(0,100),createdAt:p.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString(),documents,fonts:Array.isArray(p.fonts)?p.fonts:[],selectedDocumentId:p.selectedDocumentId||documents[0]?.id||null};
}
async function loadImage(src){const img=new Image();await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('图片无法解码。'));img.src=src;});return img;}
function paperPatch(ctx,source,r){
 if(!r.enabled)return;
 const W=source.width,H=source.height,x=Math.round(r.x),y=Math.round(r.y),w=Math.min(Math.round(r.w),W-x),h=Math.min(Math.round(r.h),H-y);
 if(w<=0||h<=0)return;
 const sx=clamp(Math.round(r.sx),0,W-w),sy=clamp(Math.round(r.sy),0,H-h);
 const patch=canvas(w,h),p=patch.getContext('2d',{willReadFrequently:true});p.drawImage(source,sx,sy,w,h,0,0,w,h);
 const src=source.getContext('2d',{willReadFrequently:true}),original=src.getImageData(x,y,w,h).data,data=p.getImageData(0,0,w,h),a=data.data;
 // Match only clean perimeter statistics; preserve the sampled paper's texture.
 const offset=[0,0,0];let n=0;
 for(let py=0;py<h;py+=2)for(let px=0;px<w;px+=2){if(px>3&&px<w-4&&py>3&&py<h-4)continue;const k=(py*w+px)*4;for(let c=0;c<3;c++)offset[c]+=original[k+c]-a[k+c];n++;}
 for(let c=0;c<3;c++)offset[c]=clamp(offset[c]/Math.max(1,n),-18,18);
 const feather=Math.min(r.feather,w/3,h/3);
 for(let py=0;py<h;py++)for(let px=0;px<w;px++){const k=(py*w+px)*4;for(let c=0;c<3;c++)a[k+c]=clamp(a[k+c]+offset[c],0,255);const f=feather?clamp(Math.min(px,py,w-1-px,h-1-py)/feather,0,1):1;a[k+3]=Math.round(255*f*f*(3-2*f));}
 p.putImageData(data,0,0);ctx.drawImage(patch,x,y);
}
function fontCSS(l){return `${l.weight||400} ${l.size}px ${FONTS[l.font]}`;}
function metrics(l){
 const ctx=canvas(1,1).getContext('2d');ctx.font=fontCSS(l);
 const lines=l.text.split('\n').map(chars);const widths=lines.map(c=>Math.max(0,c.reduce((sum,ch)=>sum+ctx.measureText(ch).width,0)+Math.max(0,c.length-1)*l.tracking));
 const vertical=l.direction==='vertical';
 const rawWidth=Math.max(1,vertical?lines.length*l.size*l.lineHeight:Math.max(0,...widths)),height=Math.max(1,vertical?Math.max(0,...lines.map(c=>c.length))*(l.size+l.tracking):lines.length*l.size*l.lineHeight),shear=Math.tan((l.slant||0)*Math.PI/180);
 return {lines,widths,rawWidth,width:rawWidth+Math.abs(shear)*height,height,vertical,shear};
}
function randomAt(x,y,seed){let n=Math.imul(x+seed,374761393)+Math.imul(y+17,668265263);n=Math.imul(n^(n>>>13),1274126177);return ((n^(n>>>16))>>>0)/4294967295;}
// Coherent fields model roller pressure; pits and contour wear model imperfect transfer.
function smoothNoise(x,y,seed){const ix=Math.floor(x),iy=Math.floor(y),fx=x-ix,fy=y-iy,u=fx*fx*(3-2*fx),v=fy*fy*(3-2*fy);const a=randomAt(ix,iy,seed),b=randomAt(ix+1,iy,seed),c=randomAt(ix,iy+1,seed),d=randomAt(ix+1,iy+1,seed);return (a+(b-a)*u)*(1-v)+(c+(d-c)*u)*v;}
function applyInk(ctx,out,l){
 const data=ctx.getImageData(0,0,out.width,out.height),a=data.data,alpha=new Uint8Array(out.width*out.height);for(let i=0;i<alpha.length;i++)alpha[i]=a[i*4+3];
 const stamp=l.effect==='stamp',faded=l.effect==='faded',cell=Math.max(8,l.size*.75),wear=l.edgeWear??.2,pressure=l.pressure??.55;
 for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){
  const i=y*out.width+x,k=i*4;if(!alpha[i])continue;
  const broad=smoothNoise(x/cell,y/cell,l.seed+91),cloud=smoothNoise(x/Math.max(2,l.size*.09),y/Math.max(2,l.size*.08),l.seed+401),fine=randomAt(x,y,l.seed),fiber=randomAt(Math.floor(x/2),Math.floor(y/3),l.seed+37);
  let density=1-pressure*(1-broad)*(faded?1.25:.95);density*=1-l.grain*(.18+.3*fine+.22*fiber);
  const edge=x===0||y===0||x===out.width-1||y===out.height-1||Math.min(alpha[i-1],alpha[i+1],alpha[i-out.width],alpha[i+out.width])<150;
  if(cloud<(stamp?.22:.12)*l.grain+(edge?.24*wear:0))density*=.05;
  if(fine<l.grain*(stamp?.10:.05))density*=.08;
  if(edge)density*=1-wear*(.25+.65*cloud);
  const strength=l.effectStrength??.5;
  if(l.effect==='screen'){const spacing=Math.max(3,Math.round(l.size*.04)),mesh=(x%spacing===0||y%spacing===0);density=(.92-l.grain*.2*fiber)*(mesh?1-strength*.62:1);}
  if(l.effect==='pencil'){const hatch=(x+2*y)%5<2,streak=smoothNoise(x/18,y/1.8,l.seed+19);density=(.3+.7*streak)*(hatch?1:1-strength*.8)*(1-pressure*(1-broad)*.4);}
  if(l.effect==='letterpress')density=Math.max(.3,density);
  a[k+3]=Math.round(alpha[i]*clamp(density,.02,1));
 }
 ctx.putImageData(data,0,0);
}
function tinted(source,color){const c=canvas(source.width,source.height),x=c.getContext('2d');x.drawImage(source,0,0);x.globalCompositeOperation='source-in';x.fillStyle=color;x.fillRect(0,0,c.width,c.height);return c;}
function finishMaterial(source,l){
 const kinds=['bleed','letterpress','risograph'];if(!kinds.includes(l.effect))return source;
 const out=canvas(source.width,source.height),x=out.getContext('2d'),strength=l.effectStrength??.5;
 if(l.effect==='bleed'){x.globalAlpha=.45+.3*strength;x.filter=`blur(${Math.max(.5,l.size*(.007+.025*strength))}px)`;x.drawImage(source,0,0);x.filter='none';x.globalAlpha=1;x.drawImage(source,0,0);}
 if(l.effect==='letterpress'){const d=Math.max(.5,l.size*(.008+.025*strength));x.globalAlpha=.5;x.drawImage(tinted(source,'#fff8df'),d,d);x.globalAlpha=.5;x.drawImage(tinted(source,'#292416'),-d,-d);x.globalAlpha=1;x.drawImage(source,0,0);}
 if(l.effect==='risograph'){const d=l.size*(.02+.11*strength);x.globalAlpha=.75;x.drawImage(tinted(source,l.secondaryColor||'#ba694b'),d,-d*.45);x.globalAlpha=1;x.drawImage(source,0,0);}
 return out;
}
function textBitmap(l,base){
 const m=metrics(l),pad=Math.ceil(l.size*.35+(l.thickness||0)*l.size+(l.outlineWidth||0)),bw=Math.ceil(m.width+pad*2),bh=Math.ceil(m.height+pad*2);
 // Bound work for malformed imported data or unusually long text.
 if(bw*bh>20000000||bw>16000||bh>16000)throw new Error('这段文字太大，请减少字号或换行。');
 const out=canvas(bw,bh),ctx=out.getContext('2d',{willReadFrequently:true});
 ctx.font=fontCSS(l);ctx.textBaseline='top';ctx.fillStyle=l.color;ctx.save();ctx.translate(pad+Math.max(0,m.shear*m.height),pad);ctx.transform(1,0,-m.shear,1,0,0);
 m.lines.forEach((line,i)=>{let x=m.vertical?(m.lines.length-1-i)*l.size*l.lineHeight: l.align==='center'?(m.rawWidth-m.widths[i])/2:l.align==='right'?m.rawWidth-m.widths[i]:0;let y=m.vertical?0:i*l.size*l.lineHeight;
  for(const ch of line){ctx.lineJoin='round';if(l.outlineWidth>0){ctx.strokeStyle=l.outlineColor;ctx.lineWidth=l.outlineWidth*2+(l.thickness||0)*l.size;ctx.strokeText(ch,x,y);}if(l.thickness>0){ctx.strokeStyle=l.color;ctx.lineWidth=l.thickness*l.size;ctx.strokeText(ch,x,y);}ctx.fillText(ch,x,y);if(m.vertical)y+=l.size+l.tracking;else x+=ctx.measureText(ch).width+l.tracking;}
 });
 ctx.restore();
 if(l.effect==='stamp'&&l.stampBorder){ctx.lineWidth=Math.max(1.5,l.size*.05);ctx.strokeStyle=l.color;ctx.beginPath();ctx.roundRect(pad-l.size*.15,pad-l.size*.12,m.width+l.size*.3,m.height+l.size*.2,l.size*.08);ctx.stroke();}
 if(l.effect!=='legacy'&&l.effect!=='clean'){applyInk(ctx,out,l);}
 else if(l.effect==='legacy'&&l.grain>0){const data=ctx.getImageData(0,0,out.width,out.height),a=data.data;const bc=base.getContext('2d',{willReadFrequently:true});const paper=bc.getImageData(0,0,base.width,base.height).data;const angle=l.rotation*Math.PI/180,cos=Math.cos(angle),sin=Math.sin(angle);
  for(let y=0;y<out.height;y++)for(let x=0;x<out.width;x++){const k=(y*out.width+x)*4;if(!a[k+3])continue;const px=clamp(Math.round(l.x+(x-pad)*cos-(y-pad)*sin),0,base.width-1),py=clamp(Math.round(l.y+(x-pad)*sin+(y-pad)*cos),0,base.height-1),p=(py*base.width+px)*4;const luminance=(paper[p]*.2126+paper[p+1]*.7152+paper[p+2]*.0722)/255;const noise=randomAt(x,y,l.seed);const fiber=randomAt(Math.floor(x/2),Math.floor(y/3),l.seed+37);const rough=clamp(.48+.33*noise+.19*fiber+(luminance-.9)*.35,.2,1);a[k+3]=Math.round(a[k+3]*(1-l.grain*(1-rough))*(noise<l.grain*.07?.4:1));}
  ctx.putImageData(data,0,0);
 }
 return {canvas:finishMaterial(out,l),pad,metrics:m};
}
function render(doc,img,mode='all'){
 const w=img.naturalWidth,h=img.naturalHeight,source=canvas(w,h),sc=source.getContext('2d',{willReadFrequently:true});sc.drawImage(img,0,0);
 const base=canvas(w,h),bc=base.getContext('2d',{willReadFrequently:true});bc.drawImage(source,0,0);for(const r of doc.repairs)paperPatch(bc,source,r);
 if(mode==='base')return base;
 if(mode==='original')return source;
 const out=canvas(w,h),ctx=out.getContext('2d');if(mode!=='text')ctx.drawImage(base,0,0);
 for(const l of doc.layers){if(!l.text||l.hidden)continue;const t=textBitmap(l,base);ctx.save();ctx.translate(l.x,l.y);ctx.rotate(l.rotation*Math.PI/180);ctx.globalAlpha=l.opacity;ctx.globalCompositeOperation=mode!=='text'&&l.multiply?'multiply':'source-over';ctx.drawImage(t.canvas,-t.pad,-t.pad);ctx.restore();}
 return out;
}
function hit(l,x,y,pad=12){const a=-l.rotation*Math.PI/180,dx=x-l.x,dy=y-l.y,px=dx*Math.cos(a)-dy*Math.sin(a),py=dx*Math.sin(a)+dy*Math.cos(a),m=metrics(l);return px>=-pad&&py>=-pad&&px<=m.width+pad&&py<=m.height+pad;}
function hex(r,g,b){return '#'+[r,g,b].map(n=>Math.round(n).toString(16).padStart(2,'0')).join('');}
function sampledColor(img,x,y){const c=canvas(img.naturalWidth,img.naturalHeight),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);const sx=clamp(Math.round(x)-1,0,c.width-3),sy=clamp(Math.round(y)-1,0,c.height-3);const p=ctx.getImageData(sx,sy,Math.min(3,c.width),Math.min(3,c.height)).data;let rgb=[0,0,0],n=p.length/4;for(let i=0;i<p.length;i+=4)for(let k=0;k<3;k++)rgb[k]+=p[i+k];return hex(...rgb.map(v=>v/n));}
global.Lettering={VERSION,FONTS,clamp,copy,uid,canvas,layer,normalizeProject,loadImage,fontCSS,normalizeLayer,metrics,render,hit,sampledColor};
})(window);
