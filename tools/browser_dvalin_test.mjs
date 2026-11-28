export async function dvalinGate(page,x,node){
 const canvas=page.locator('#game');
 const f=await page.evaluate(()=>window.lab.frame),east=f.actors[f.active-1].x<x,key=east?'KeyD':'KeyA';
 await canvas.click();await page.keyboard.down(key);
 await page.keyboard.down('Space');
 await page.evaluate(east=>{window.dvalinGateTimer=setInterval(()=>{
  const f=window.lab.frame,a=f.actors[f.active-1];if(!f.weeklyBoss||!a.ground)return;
  for(const p of [{x:0,w:264},{x:303.6,w:264},{x:607.2,w:264}]){
   const edge=east?p.x+p.w:p.x;
   if(a.x>=p.x&&a.x<=p.x+p.w&&Math.abs(a.x-edge)<50&&edge>0&&edge<850)window.lab.action('jump');
  }
 },30)},east);
 try{await page.waitForFunction(({x,east})=>{const f=window.lab.frame,a=f.actors[f.active-1];return east?a.x>=x-8:a.x<=x+8},{x,east},{timeout:90000})}
 finally{await page.keyboard.up(key);await page.keyboard.up('Space');await page.evaluate(()=>clearInterval(window.dvalinGateTimer))}
 await page.waitForFunction(node=>window.lab.frame.storyNearbyPortal?.to===node,node);
 await page.keyboard.press('KeyF');await page.waitForFunction(node=>window.lab.frame.story.node===node,node);
}

export async function driveDvalin(page,{maxSeconds=260,crystalOffset=-30,firstCrystalLimit=null}={}){
 await page.evaluate(({maxSeconds,crystalOffset,firstCrystalLimit})=>{
  const held=new Set(),moves=new Set(),strikes=new Map(),start=window.lab.frame.t,platforms=[{x:0,w:264},{x:303.6,w:264},{x:607.2,w:264}];
  let aiLanded=false,manualLanded=false,maxFalls=0;
  function hold(code,on){if(on===held.has(code))return;on?held.add(code):held.delete(code);window.dispatchEvent(new KeyboardEvent(on?'keydown':'keyup',{code,bubbles:true,cancelable:true}))}
  function control(){
   const f=window.lab.frame,b=f.weeklyBoss,a=f.actors[f.active-1],ai=f.actors[2-f.active];
   for(const e of Array.isArray(f.events)?f.events:[]){
    if(e.t>=start&&e.kind==='hit'&&e.actor===f.active&&e.target===-290101014)strikes.set(e.seq,e.value);
   }
   window.dvalinPadReached=manualLanded;
   if(b?.phase==='respawn'||f.returns>0||f.t-start>maxSeconds){
    for(const c of [...held])hold(c,false);
    window.dvalinResult={won:b?.phase==='respawn',seconds:+(f.t-start).toFixed(2),hp:a.hp,returns:f.returns,moves:[...moves],breaks:b?.breaks,falls:maxFalls,aiLanded,manualLanded,manualCrystalDamage:[...strikes.values()].reduce((total,n)=>total+n,0)};return;
   }
   if(f.paused){requestAnimationFrame(control);return}
   if(b?.move)moves.add(b.move);maxFalls=Math.max(maxFalls,b?.falls||0);
   if(b?.exposed){aiLanded||=ai.ground&&Math.abs(ai.y-420)<1;manualLanded||=a.ground&&Math.abs(a.y-420)<1}
   const m=b?.move,t=b?.tick,c=b?.attack;
   let dest=a.x,jump=!a.ground,attack=false,aim=null;
   const dodge=m==='WD01'&&t>=52&&t<103||m==='WD06'&&t>=150&&t<193;
   if(dodge){jump=true;if(a.ground)window.lab.action('jump')}
   if(m==='WD08'){
    const firstCap=firstCrystalLimit!==null&&b.breaks===1&&b.crystal.damage>=firstCrystalLimit;
    dest=b.crystal.x+crystalOffset;jump=true;attack=t>=42&&t<462&&!firstCap;aim=b.crystal.x;
    if(a.ground&&a.y>423&&Math.abs(dest-a.x)<100)window.lab.action('jump');
   }else if((m==='WD02'||m==='WD03')&&c){
    dest=c.center+(m==='WD02'?65:c.dir*75);aim=c.center+65;attack=true;
    if(m==='WD02'&&t>=70&&t<103){jump=true;if(a.ground)window.lab.action('jump')}
    if(m==='WD03'&&t>=90&&t<234){
     const q=(t-90)/144,beam=c.dir<0?c.right-(c.right-c.left)*q:c.left+(c.right-c.left)*q;
     if(Math.abs(beam-a.x)<65&&a.ground){window.lab.action('jump');jump=true}
    }
   }else if(c){
    dest=platforms[c.zone===1?1:0].x+132;
    if(m==='WD07'&&c.points){
     const p=platforms[c.zone-1],score=x=>Math.min(...c.points.map(v=>Math.abs(x-v)));
     dest=score(p.x+20)>score(p.x+p.w-20)?p.x+20:p.x+p.w-20;
    }
   }
   if(b?.hazard&&m!=='WD08'){
    const p=platforms[b.hazard.zone-1];if(dest>=p.x&&dest<=p.x+p.w)dest=platforms[b.hazard.zone===1?1:0].x+132;
   }
   const dx=dest-a.x;let direction=dx>10?1:dx<-10?-1:0;
   if(!direction&&aim!==null&&(aim-a.x)*a.dir<0)direction=aim>a.x?1:-1;
   if(direction)for(const p of platforms){const edge=direction>0?p.x+p.w:p.x;
    if(a.ground&&a.x>=p.x&&a.x<=p.x+p.w&&Math.abs(a.x-edge)<55&&(dest-edge)*direction>25){window.lab.action('jump');jump=true}
   }
   hold('KeyA',direction<0);hold('KeyD',direction>0);hold('Space',jump);hold('KeyJ',attack&&!!window.dvalinFight);
   requestAnimationFrame(control);
  }
  requestAnimationFrame(control);
 },{maxSeconds,crystalOffset,firstCrystalLimit});
}
