export async function driveAndrius(page,upperSide=0){
 await page.evaluate(upperSide=>{
  const held=new Set(),moves=new Set(),strikes=new Map(),start=window.lab.frame.t;
  let aiUpper=false,manualUpper=false,immuneCast=false,immuneEvent=false,maxFalls=0;
  function hold(code,on){if(on===held.has(code))return;on?held.add(code):held.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}))}
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1],ai=f.actors[2-f.active];
   const events=Array.isArray(f.events)?f.events:[];
   for(const e of events){
    if(e.t>=start&&e.kind==='hit'&&e.actor===f.active&&e.target===29020101)strikes.set(e.seq,e.value);
   }
   immuneEvent||=events.some(e=>e.kind==='immune:anemo'&&e.actor===1);
   if(b?.move)moves.add(b.move);maxFalls=Math.max(maxFalls,b?.falls||0);
   if(b?.stage==='INTERLUDE'){
    aiUpper||=ai.ground&&Math.abs(ai.y-356.8)<1;manualUpper||=a.ground&&Math.abs(a.y-356.8)<1;
   }
   window.andriusUpper=manualUpper;
   if(b?.phase==='respawn'||f.returns>0||f.t-start>300){
    for(const code of [...held])hold(code,false);
    window.andriusResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),hp:a.hp,returns:f.returns,moves:[...moves],
     transitions:b?.transitions,falls:maxFalls,aiUpper,manualUpper,immuneEvent,manualDamage:[...strikes.values()].reduce((sum,v)=>sum+v,0)};return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   const c=b?.attack,m=b?.move,t=b?.tick;
   let dest=(b?.x??480)-70,jump=!a.ground,attack=b?.stage!=='INTERLUDE'||t>=504;
   if(m==='WA01'&&t<84&&c)dest=c.origin-c.dir*75;
   else if(m==='WA02'&&t<96&&c)dest=c.origin+c.dir*75;
   else if(m==='WA03'&&c?.center&&t<138)dest=c.center+(a.x>=c.center?125:-125);
   else if(m==='WA04'&&c?.left&&t<120)dest=Math.abs(a.x-c.left)<Math.abs(a.x-c.right)?c.left-30:c.right+30;
   else if(m==='WA05'&&t<120&&c)dest=c.origin-c.dir*150;
   else if(m==='WA06'&&t<504){
    const p=(upperSide||Math.sign(a.x-480))<0?{x:40,w:176}:{x:744,w:176};dest=p.x+p.w/2;
    if(a.ground&&a.y>360&&Math.abs(a.x-dest)<110){window.lab.action('jump');jump=true}
    attack=false;
   }else if((m==='WA07'||m==='WA08')&&c)dest=c.origin-c.dir*75;
   else if(m==='WA09'&&c?.points&&t<240){
    const choices=[];for(let x=100;x<=860;x+=10)if(Math.min(...c.points.map(p=>Math.abs(x-p)))>=45)choices.push(x);
    choices.sort((x,y)=>Math.abs(x-b.x)-Math.abs(y-b.x));dest=choices[0];
   }else if(m==='WA10'&&t<180&&c){
    const left=c.origin-275,right=c.origin+275;dest=Math.abs(a.x-left)<Math.abs(a.x-right)?left:right;
   }else if(m==='WA11'&&c?.entry){
    const arrival=72+Math.abs(a.x-c.entry)/640*48;
    if(t>=arrival-20&&t<arrival+4&&a.ground){window.lab.action('jump');jump=true}
   }
   dest=Math.max(90,Math.min(870,dest));const dx=dest-a.x,aim=(b?.x??480)-a.x;
   let direction=dx>8?1:dx<-8?-1:0;
   if(!direction&&Math.abs(aim)>5&&aim*a.dir<0)direction=aim>0?1:-1;
   if(window.andriusFight&&!immuneCast&&Math.abs(aim)<110&&aim*a.dir>=0&&a.ground){window.lab.action('slot1');immuneCast=true}
   hold('KeyA',direction<0);hold('KeyD',direction>0);hold('Space',jump);hold('KeyJ',!!window.andriusFight&&attack&&Math.abs(aim)<114);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },upperSide);
}
