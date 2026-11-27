export async function driveWanderer(page,solve=true,route=null){
 await page.evaluate(({solve,route})=>{
  const held=new Set(),marked=new Set();
  const d=window.wdTrail={stages:[],cards:[],updrafts:0,marks:{},heightAtLastMark:0,
   floorGlide:false,firstAirHit:false,airOpening:false,safeFinal:false,finalContacts:[],directions:[]};
  let current,oldTick=-1,jumpEnd=-1,jumpUse,side=0,dropTick=-20;
  function key(code,push){
   if(held.has(code)===push)return;
   if(push)held.add(code);else held.delete(code);
   window.dispatchEvent(new KeyboardEvent(push?'keydown':'keyup',{code,bubbles:true,cancelable:true}));
  }
  function loop(){
   const f=window.lab.frame,v=f.endgameRun,b=f.boss;
   let left=false,right=false,attack=false,jump=false,down=false;
   if(v?.match==='wanderer'&&!f.paused&&v.status==='fighting'){
    if(d.stages.at(-1)!==v.stage)d.stages.push(v.stage);
    if(current!==v.card||v.tick<oldTick){
     if(v.card)d.cards.push(v.card);
     current=v.card;jumpEnd=-1;jumpUse=undefined;dropTick=-20;
    }
    oldTick=v.tick;
    d.directions=Array.from(new Set([...d.directions,...f.draws.filter(q=>q.source?.startsWith('wanderer-idle-')&&q.h===108&&!q.motionOnly).map(q=>q.source)]));
    const a=f.actors[f.active-1],dx=b.x-a.x,t=v.tick;
    let goal=a.x,p=solve?v.markers?.[0]:undefined;
    function hop(use){
     if(a.ground&&t>jumpEnd+1){jumpUse=use;jumpEnd=t+48;return true}
     return false;
    }
    function descend(){
     down=true;
     if(a.ground&&a.y<479&&t>dropTick+8){
      dropTick=t;jumpEnd=-1;
      key('KeyS',true);key('Space',false);key('Space',true);key('Space',false);
     }
    }
    function markRoute(p){
     if(p.y===372){
      goal=p.x;
      if(a.y>374&&Math.abs(a.x-goal)<20)hop('side');
      return;
     }
     if(a.ground&&(a.y===372||a.y===290))side=a.x<480?-1:1;
     if(!side)side=a.x<480?-1:1;
     if(a.y<=291&&a.ground||jumpUse==='center'&&!a.ground){
      goal=p.x;
     }else if(a.ground&&a.y===372){
      goal=side<0?307:653;
      if(Math.abs(a.x-goal)<10&&hop('center'))goal=p.x;
     }else{
      goal=side<0?210:750;
      if(a.y>473&&Math.abs(a.x-goal)<20)hop('pad-for-center');
     }
    }
    if(v.windMarks!==undefined)d.marks[v.card]=Math.max(d.marks[v.card]||0,v.windMarks);
    if(v.card==='WD03'&&v.phase==='recover'&&b.y===372)d.airOpening=true;
    if(v.card==='WD02'&&t>=83&&t<124&&a.y===480)d.floorGlide=true;
    if(v.card==='WD06'&&t<600){
     if(v.safe){
      goal=v.safe.x+(route?.offset??0);
      if(route&&a.y<479)descend();
      if(t>=560&&t<574&&v.safe.inside)d.safeFinal=true;
     }else if(route&&v.windMarks>=route.marks&&t<438){
      goal=480;
      if(a.y<479)descend();
     }else if(p&&t<438){markRoute(p);}
     else{
      if(!solve)goal=265;
      if(t>=49&&t<69&&a.y>472)hop('first-gust');
     }
     if(t>=574&&a.y<479)descend();
    }else if(p){markRoute(p);}
    else if(v.card==='WD03'&&t<399&&v.phase!=='recover'){
     // Keep the landing area clear until the marks or approach cue appears.
    }else if(v.phase!=='enter'&&v.phase!=='phase'){
     goal=b.x-Math.sign(dx||1)*76;
     if(Math.abs(goal-a.x)<10&&Math.sign(dx)!==a.dir)goal=a.x+Math.sign(dx)*19;
     attack=Math.abs(dx)<108&&Math.sign(dx)===a.dir&&Math.abs(a.y-b.y)<68;
     if(v.card==='WD02'&&t<124){attack=false;if(a.ground&&a.y<480){goal=a.x<480?49:915;}}
    }
    jump=t<jumpEnd;
    left=goal<a.x-6;right=goal>a.x+6;
    for(const e of Object.values(f.events||{})){
     if(marked.has(e.seq))continue;
     marked.add(e.seq);
     if(e.kind==='stygian:wanderer:updraft'&&e.actor===1)d.updrafts++;
     if(e.kind==='stygian:wanderer:WD06:mark'&&e.value===2)d.heightAtLastMark=a.y;
     if(e.kind==='stygian:wanderer:WD06:contact'&&e.actor===1)d.finalContacts.push(e.tick);
     if(e.kind==='hit'&&e.actor===1&&e.target===990007&&v.card==='WD03'&&b.y===372&&a.y===372)d.firstAirHit=true;
    }
   }
   key('KeyA',left);key('KeyD',right);key('KeyS',down);key('Space',jump);key('KeyJ',attack);
   requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
 },{solve,route});
}
