(function(global){
  'use strict';
  const records=new Map(),loaded=new Map();
  const defaults=[['song','宋体 · 系统'],['kai','楷体 · 系统'],['hei','黑体 · 系统'],['serif','衬线 · 系统']];
  function register(r){
    if(!/^[a-zA-Z0-9_-]{1,100}$/.test(r.id))throw new Error('字体编号无效。');
    if(r.dataURL&&!/^data:(font\/(ttf|otf|woff2?)|application\/octet-stream);base64,[A-Za-z0-9+/=]+$/.test(r.dataURL))throw new Error('字体必须是工程内的本地字体数据。');
    if(r.dataURL&&r.dataURL.length>65000000)throw new Error('单个字体过大。');
    if(r.localFamily&&(typeof r.localFamily!=='string'||r.localFamily.length>150))throw new Error('系统字体名称无效。');
    if(records.has(r.id)){
      const old=records.get(r.id);if(old.dataURL!==r.dataURL||old.localFamily!==r.localFamily)throw new Error('同名字体内容不同，请用不同字体名称导入。');
      return;
    }
    records.set(r.id,{...r});
    const family=r.localFamily||r.css_family||('Paper_'+r.id);
    global.Lettering.FONTS[r.id]=`${JSON.stringify(family)}, "Songti SC", serif`;
  }
  async function ensure(id){
    const r=records.get(id);if(!r||r.localFamily)return;
    if(!loaded.has(id))loaded.set(id,(async()=>{const face=new FontFace(r.css_family||'Paper_'+r.id,`url(${r.dataURL})`,{weight:r.weight_range?r.weight_range.join(' '):r.variable?'100 900':'400'});await face.load();document.fonts.add(face);return face;})());
    return loaded.get(id);
  }
  function list(){return [...defaults.map(([id,label])=>({id,label,category:'系统默认'})),...records.values()];}
  function used(project){const ids=new Set(project.documents.flatMap(d=>d.layers.map(l=>l.font)));return [...ids].map(id=>records.get(id)).filter(Boolean).map(r=>({...r}));}
  function importRecords(list){if(!Array.isArray(list)||list.length>80)throw new Error('字体清单无效。');for(const r of list)register(r);}
  async function systemFonts(){
    if(!global.queryLocalFonts)throw new Error('当前浏览器不能枚举系统字体。请在桌面 Chrome 中使用，或导入字体文件。');
    const data=await global.queryLocalFonts(),seen=new Set();
    for(const f of data){if(seen.has(f.family))continue;seen.add(f.family);let hash=2166136261;for(const c of f.family)hash=Math.imul(hash^c.charCodeAt(0),16777619);register({id:'sys-'+(hash>>>0).toString(16),label:f.family,category:'Mac 系统字体',localFamily:f.family,license:'System font; referenced locally only, not copied into project.'});}
    return seen.size;
  }
  async function importFile(file){
    if(!/\.(ttf|otf|woff2?)$/i.test(file.name)||file.size>48000000)throw new Error('请选择 48 MB 内的 TTF、OTF、WOFF 或 WOFF2。');
    const data=await file.arrayBuffer(),hash=await crypto.subtle.digest('SHA-256',data),hex=[...new Uint8Array(hash)].map(b=>b.toString(16).padStart(2,'0')).join('');
    const id='custom-'+hex.slice(0,16),family='Paper_'+id;
    const face=new FontFace(family,data);await face.load();document.fonts.add(face);
    const bytes=new Uint8Array(data);let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));
    register({id,label:file.name.replace(/\.[^.]+$/,''),category:'自己导入',css_family:family,dataURL:'data:font/ttf;base64,'+btoa(binary),sha256:hex,license:'User-supplied local font; license not independently verified.'});loaded.set(id,Promise.resolve(face));return id;
  }
  global.PaperFonts={register,ensure,list,used,importRecords,systemFonts,importFile,info:id=>records.get(id)||null};
  const el=document.getElementById('fontData');if(el)importRecords(JSON.parse(el.textContent));
})(window);
