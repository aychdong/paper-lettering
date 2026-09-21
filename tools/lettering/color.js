/* OKLab/OKLCH conversion: CSS Color 4. Contrast: WCAG sRGB relative luminance.
   Hue harmonies are design heuristics, not a guarantee of aesthetic preference. */
(function(global){
  'use strict';
  const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
  const linear=c=>c<=.04045?c/12.92:Math.pow((c+.055)/1.055,2.4);
  const gamma=c=>c<=.0031308?12.92*c:1.055*Math.pow(c,1/2.4)-.055;
  const rgb=hex=>[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
  const hex=c=>'#'+c.map(x=>Math.round(clamp(x)*255).toString(16).padStart(2,'0')).join('');
  function oklch(c){const [r,g,b]=c.map(linear),l=Math.cbrt(.4122214708*r+.5363325363*g+.0514459929*b),m=Math.cbrt(.2119034982*r+.6806995451*g+.1073969566*b),s=Math.cbrt(.0883024619*r+.2817188376*g+.6299787005*b);const L=.2104542553*l+.793617785*m-.0040720468*s,a=1.9779984951*l-2.428592205*m+.4505937099*s,bb=.0259040371*l+.7827717662*m-.808675766*s;return [L,Math.hypot(a,bb),(Math.atan2(bb,a)*180/Math.PI+360)%360];}
  function toRGB(L,C,H){const a=C*Math.cos(H*Math.PI/180),b=C*Math.sin(H*Math.PI/180),l=(L+.3963377774*a+.2158037573*b)**3,m=(L-.1055613458*a-.0638541728*b)**3,s=(L-.0894841775*a-1.291485548*b)**3;return [4.0767416621*l-3.3077115913*m+.2309699292*s,-1.2684380046*l+2.6097574011*m-.3413193965*s,-.0041960863*l-.7034186147*m+1.707614701*s].map(gamma);}
  function gamut(L,C,H){let lo=0,hi=C,result=toRGB(L,0,H);for(let i=0;i<18;i++){const mid=(lo+hi)/2,c=toRGB(L,mid,H);if(c.every(v=>v>=0&&v<=1)){lo=mid;result=c;}else hi=mid;}return hex(result);}
  const luminance=c=>{const a=c.map(linear);return .2126*a[0]+.7152*a[1]+.0722*a[2];};
  const contrast=(a,b)=>{const x=luminance(a),y=luminance(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);};
  function backgroundSamples(base,l){const ctx=base.getContext('2d',{willReadFrequently:true}),m=global.Lettering.metrics(l),samples=[];for(let y=0;y<5;y++)for(let x=0;x<7;x++){const p=global.PaperTransforms.world(l,(x+.5)*m.width/7,(y+.5)*m.height/5);const px=Math.round(clamp(p.x,0,base.width-1)),py=Math.round(clamp(p.y,0,base.height-1));const c=ctx.getImageData(px,py,1,1).data;samples.push([c[0]/255,c[1]/255,c[2]/255]);}return samples;}
  function analyze(doc,img,l){
    const base=global.Lettering.render(doc,img,'base'),tiny=global.Lettering.canvas(64,64),ctx=tiny.getContext('2d',{willReadFrequently:true});ctx.drawImage(base,0,0,64,64);const data=ctx.getImageData(0,0,64,64).data,bins=Array.from({length:24},()=>({weight:0,C:0}));
    for(let i=0;i<data.length;i+=4){const [L,C,H]=oklch([data[i]/255,data[i+1]/255,data[i+2]/255]);if(C<.035||L<.15||L>.96)continue;const bin=bins[Math.floor(H/15)%24],weight=Math.sqrt(C);bin.weight+=weight;bin.C+=C*weight;}
    let best=0;for(let i=1;i<24;i++)if(bins[i].weight>bins[best].weight)best=i;const H=bins[best].weight?best*15+7.5:70,C=bins[best].weight?clamp(bins[best].C/bins[best].weight,.04,.14):.055;
    const backgrounds=backgroundSamples(base,l),score=color=>Math.min(...backgrounds.map(bg=>contrast(rgb(color),bg)));
    const candidates=[['同色系',0,C*.7],['邻近色',30,C*.75],['互补色',180,C*.7],['分裂补色',150,C*.65],['三角色',120,C*.6],['暖中性',null,.025]];
    const suggestions=candidates.map(([label,offset,chroma])=>{const hue=offset===null?65:(H+offset)%360;let winner={hex:'#292929',ratio:0};for(let i=0;i<=16;i++){const light=.18+i*.045,color=gamut(light,chroma,hue),ratio=score(color);const quality=(ratio>=4.5?100:0)+Math.min(ratio,9)-Math.abs(light-.40)*.7;if(quality>(winner.quality??-1))winner={hex:color,ratio,quality};}return {name:label,hex:winner.hex,contrast:winner.ratio,source:'local-color-science',reason:offset===null?'偏暖的低彩度中性色，让文字保持克制。':`由画面主色相 ${Math.round(H)}° 出发，色相偏移 ${offset}°，在 sRGB 范围内调整明度与彩度。`};});
    return {suggestions,dominantHue:H,backgrounds,score,method:'OKLCH hue relations + sRGB gamut mapping + worst sampled local background contrast; opacity and texture excluded.'};
  }
  function validatePalette(p,doc){
    if(!p||p.type!=='paper-lettering-palette'||p.version!==1||!Array.isArray(p.colors)||p.colors.length<1||p.colors.length>12)throw new Error('配色文件格式不正确。');
    const digest=doc.image.sha256||doc.image.sourceFileSHA256;
    if(p.imageSHA256&&digest&&p.imageSHA256!==digest)throw new Error('这份 AI 配色对应另一张底图，请先切换到相应画面。');
    return {source:'ai-assisted',createdAt:p.createdAt||null,imageSHA256:p.imageSHA256||null,model:p.model||null,colors:p.colors.map(c=>{if(!/^#[0-9a-f]{6}$/i.test(c.hex))throw new Error('配色中含无效颜色。');return {hex:c.hex,name:String(c.name||'AI 建议').slice(0,40),reason:String(c.reason||'').slice(0,280)};})};
  }
  global.PaperColors={rgb,hex,oklch,toRGB,gamut,luminance,contrast,analyze,validatePalette};
})(window);
