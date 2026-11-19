import assert from 'node:assert/strict';

export function waypointDriver(page,nodes,{walkTimeout=12000}={}){
 const journeys=[];
 const node=()=>page.evaluate(()=>window.lab.frame.story.node);
 const actor=()=>page.evaluate(()=>{
  const f=window.lab.frame;
  return f.actors.find(a=>a.id===f.active);
 });
 const waitNode=id=>page.waitForFunction(id=>window.lab?.frame.story?.node===id,id);
 const count=(id,n)=>page.waitForFunction(([id,n])=>window.lab.frame.story.quests[id]?.count===n,[id,n]);
 const focusGame=()=>page.evaluate(()=>document.activeElement.blur());
 const choices=page.locator('#storyWaypointDestination');
 const waypointCount=page.locator('#storyWaypoints label');

 async function walk(x){
  await focusGame();
  const start=(await actor()).x;
  if(Math.abs(start-x)<20)return;
  const key=start>x?'KeyA':'KeyD';
  await page.keyboard.down(key);
  try{
   await page.waitForFunction(([x,start])=>{
    const f=window.lab.frame;
    const a=f.actors.find(a=>a.id===f.active);
    return start>x?a.x<=x+15:a.x>=x-15;
   },[x,start],{timeout:walkTimeout});
  }finally{await page.keyboard.up(key)}
 }

 const waitY=y=>page.waitForFunction(y=>{
  const f=window.lab.frame;
  return f.actors.find(a=>a.id===f.active).y===y;
 },y,{timeout:5000});

 async function changeHeight(y){
  const start=(await actor()).y;
  if(start===y)return;
  if(await page.evaluate(()=>Boolean(window.lab.frame.storySwim))){
   if(Math.abs(start-y)<12)return;
   const key=start>y?'KeyW':'KeyS';
   await page.keyboard.down(key);
   try{
    await page.waitForFunction(([start,y])=>{
     const f=window.lab.frame;
     const a=f.actors.find(a=>a.id===f.active);
     return start>y?a.y<=y+7:a.y>=y-7;
    },[start,y],{timeout:6000});
   }finally{await page.keyboard.up(key)}
   return;
  }
  if(y===480){
   await page.keyboard.down('KeyS');
   await page.keyboard.press('Space');
   try{await waitY(y)}
   finally{await page.keyboard.up('KeyS')}
   return;
  }
  for(let attempt=0;attempt<3;attempt++){
   const previous=(await actor()).y;
   if(previous===y)return;
   await page.keyboard.down('Space');
   try{
    await page.waitForFunction(previous=>{
     const f=window.lab.frame;
     const a=f.actors.find(a=>a.id===f.active);
     return a.ground&&a.y<previous;
    },previous,{timeout:4000});
   }finally{await page.keyboard.up('Space')}
  }
  await waitY(y);
 }

 async function cross(id){
  const from=await node();
  const edge=nodes[from].exits.find(e=>e.to===id);
  assert.ok(edge,`No gate ${from} → ${id}`);
  await walk(edge.x);
  await changeHeight(edge.y??480);
  const gateTimeout=edge.windowStart!==undefined?(edge.windowStart+8)*1000:edge.wind?Math.ceil(edge.wind.period*2000):5000;
  await page.waitForFunction(id=>{
   const gate=window.lab.frame.storyNearbyPortal;
   return gate?.to===id&&gate.available;
  },id,{timeout:gateTimeout});
  const mode=edge.boatSeconds?'boat':edge.waterwaySeconds?'waterway':edge.liftSeconds?'lift':nodes[from].swim?'swim':edge.y?'raised':'walk';
  const launchY=edge.animatedLift?(await actor()).y:null;
  await page.keyboard.press('KeyF');
  if(['boat','waterway','lift'].includes(mode)){
   await page.waitForFunction(label=>window.lab.frame.storyLift?.destination===label,edge.rideLabel||nodes[id].name);
   const ride=await page.evaluate(()=>window.lab.frame.storyLift);
   assert.equal(Boolean(ride.boat),mode==='boat');
   assert.equal(Boolean(ride.waterway),mode==='waterway');
   assert.equal(await node(),from);
   if(edge.animatedLift)await page.waitForFunction(y=>{
    const f=window.lab.frame;
    return f.storyLift&&f.actors.find(a=>a.id===f.active).y!==y;
   },launchY);
  }
  await waitNode(id);
  if(edge.arrivalY)await waitY(edge.arrivalY);
  journeys.push([from,id,mode]);
 }

 async function warp(id){
  await choices.selectOption(id);
  await page.getByRole('button',{name:'ワープする',exact:true}).click();
  await waitNode(id);
 }

 const row=id=>page.locator(`[data-quest="${id}"]`);
 async function accept(id){
  await row(id).getByRole('button',{name:'受注',exact:true}).click();
  await count(id,0);
 }
 async function report(id){
  await row(id).getByRole('button',{name:'報告',exact:true}).click();
  await page.waitForFunction(id=>window.lab.frame.story.quests[id]?.status==='complete',id);
 }

 return {node,actor,journeys,walk,changeHeight,cross,warp,count,waitNode,accept,report,choices,waypointCount};
}
