(function(global){
  'use strict';
  const rad=d=>d*Math.PI/180;
  function world(l,x,y){const a=rad(l.rotation),c=Math.cos(a),s=Math.sin(a);return {x:l.x+x*c-y*s,y:l.y+x*s+y*c};}
  function local(l,x,y){const a=-rad(l.rotation),dx=x-l.x,dy=y-l.y;return {x:dx*Math.cos(a)-dy*Math.sin(a),y:dx*Math.sin(a)+dy*Math.cos(a)};}
  function handles(l,metrics,pixelScale=1){
    const {width:w,height:h}=metrics;
    return [{kind:'scale',corner:'nw',...world(l,0,0)},{kind:'scale',corner:'ne',...world(l,w,0)},{kind:'scale',corner:'se',...world(l,w,h)},{kind:'scale',corner:'sw',...world(l,0,h)},{kind:'rotate',...world(l,w/2,-30*pixelScale)}];
  }
  function pick(l,m,p,pixelScale){return handles(l,m,pixelScale).find(h=>Math.hypot(h.x-p.x,h.y-p.y)<=9*pixelScale);}
  function begin(l,m,h,p){
    const original=JSON.parse(JSON.stringify(l)),center=world(l,m.width/2,m.height/2);
    if(h.kind==='rotate')return {kind:'rotate',original,metrics:m,center,startAngle:Math.atan2(p.y-center.y,p.x-center.x)};
    const cx=h.corner.includes('e')?m.width:0,cy=h.corner.includes('s')?m.height:0;
    const ox=m.width-cx,oy=m.height-cy;
    return {kind:'scale',original,metrics:m,corner:h.corner,opposite:world(l,ox,oy),vector:{x:cx-ox,y:cy-oy}};
  }
  function update(t,p,measure,snap=false){
    const l={...t.original};
    if(t.kind==='rotate'){
      let degrees=t.original.rotation+(Math.atan2(p.y-t.center.y,p.x-t.center.x)-t.startAngle)*180/Math.PI;
      if(snap)degrees=Math.round(degrees/15)*15;
      l.rotation=Math.round((((degrees+180)%360+360)%360-180)*10)/10;
      const offset=world({...l,x:0,y:0},t.metrics.width/2,t.metrics.height/2);l.x=t.center.x-offset.x;l.y=t.center.y-offset.y;
    }else{
      const a=-rad(l.rotation),dx=p.x-t.opposite.x,dy=p.y-t.opposite.y;
      const v={x:dx*Math.cos(a)-dy*Math.sin(a),y:dx*Math.sin(a)+dy*Math.cos(a)};
      const scale=Math.max(8/l.size,Math.min(400/l.size,(v.x*t.vector.x+v.y*t.vector.y)/(t.vector.x*t.vector.x+t.vector.y*t.vector.y)));
      l.size=Math.round(l.size*scale*10)/10;l.tracking=Math.max(-2,Math.min(30,Math.round(l.tracking*scale*10)/10));
      const m=measure(l),ox=t.corner.includes('w')?m.width:0,oy=t.corner.includes('n')?m.height:0;
      const offset=world({...l,x:0,y:0},ox,oy);l.x=t.opposite.x-offset.x;l.y=t.opposite.y-offset.y;
    }
    return l;
  }
  global.PaperTransforms={world,local,handles,pick,begin,update};
})(window);
