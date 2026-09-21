/* Shared material presets and normalized, editable AI layout proposals. */
(function(global){
'use strict';const L=global.Lettering;
const presets={
 ink:{effect:'ink',opacity:.98,grain:.38,pressure:.62,edgeWear:.18,stampBorder:false,multiply:true},
 soft:{effect:'faded',opacity:.82,grain:.58,pressure:.85,edgeWear:.46,stampBorder:false,multiply:true},
 stamp:{effect:'stamp',opacity:1,grain:.68,pressure:.54,edgeWear:.78,stampBorder:true,multiply:true},
 clean:{effect:'clean',opacity:1,grain:0,pressure:0,edgeWear:0,stampBorder:false,multiply:false},
 letterpress:{effect:'letterpress',opacity:.95,grain:.18,pressure:.28,edgeWear:.1,effectStrength:.55,stampBorder:false,multiply:false},
 screen:{effect:'screen',opacity:1,grain:.3,pressure:.15,edgeWear:.1,effectStrength:.65,stampBorder:false,multiply:true},
 pencil:{effect:'pencil',opacity:.95,grain:.6,pressure:.35,edgeWear:.25,effectStrength:.75,stampBorder:false,multiply:true},
 bleed:{effect:'bleed',opacity:.98,grain:.12,pressure:.22,edgeWear:.1,effectStrength:.7,stampBorder:false,multiply:true},
 risograph:{effect:'risograph',opacity:.94,grain:.25,pressure:.25,edgeWear:.2,effectStrength:.45,stampBorder:false,multiply:true}
};
function fit(l,w,h){
 for(let i=0;i<50;i++){const m=L.metrics(l);const a=l.rotation*Math.PI/180,rw=Math.abs(m.width*Math.cos(a))+Math.abs(m.height*Math.sin(a)),rh=Math.abs(m.width*Math.sin(a))+Math.abs(m.height*Math.cos(a));if(rw<=w*.9&&rh<=h*.9)break;l.size=Math.max(8,l.size*.94);l.tracking*=.94;}
 const m=L.metrics(l),points=[[0,0],[m.width,0],[m.width,m.height],[0,m.height]].map(([x,y])=>global.PaperTransforms.world(l,x,y)),xs=points.map(p=>p.x),ys=points.map(p=>p.y),margin=Math.max(10,l.size*.35);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 l.x+=Math.max(0,margin-minX)-Math.max(0,maxX-(w-margin));l.y+=Math.max(0,margin-minY)-Math.max(0,maxY-(h-margin));return l;
}
function layers(option,doc){
 if(option?.renderLayers){if(!Array.isArray(option.renderLayers)||!option.renderLayers.length||option.renderLayers.length>4)throw new Error('渲染方案无效');return option.renderLayers.map(l=>L.normalizeLayer({...l,id:L.uid()},doc.image.width,doc.image.height));}
 if(!option||!Array.isArray(option.layers)||!option.layers.length||option.layers.length>4)throw new Error('AI 排版方案格式无效。');
 return option.layers.map(p=>{
  if(!L.FONTS[p.font]||typeof p.text!=='string'||!p.text.trim()||p.text.length>120||!/^#[\da-f]{6}$/i.test(p.color))throw new Error('AI 方案含无效字体、文字或颜色。');
  for(const k of ['size','x','y','weight','thickness','slant','rotation','tracking'])if(!Number.isFinite(p[k]))throw new Error('AI 排版参数无效。');
  if(p.lineHeight!==undefined&&(!Number.isFinite(p.lineHeight)||p.lineHeight<1||p.lineHeight>2.5))throw new Error('AI 行距无效。');
  const size=L.clamp(p.size,.012,.18)*doc.image.width,base=presets[p.effect==='faded'?'soft':p.effect];if(!base)throw new Error('未知印刷质感');
  return fit(L.normalizeLayer({...base,text:p.text,font:p.font,size,weight:global.PaperFonts.info(p.font)?.weight_range?L.clamp(p.weight,...global.PaperFonts.info(p.font).weight_range):400,thickness:p.thickness,slant:p.slant,x:p.x*doc.image.width,y:p.y*doc.image.height,rotation:p.rotation,tracking:p.tracking*size,lineHeight:p.lineHeight??1.4,direction:p.direction,align:p.align,color:p.color,seed:71429},doc.image.width,doc.image.height),doc.image.width,doc.image.height);
 });
}
global.PaperDesign={presets,layers,fit};
})(window);
