import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(n=>[n.id,n]));
const opening=JSON.parse(await fs.readFile('evidence/weekly-opening-poses-lua.json','utf8'));
const browser=await chromium.launch({channel:'chrome',args:['--disable-accelerated-2d-canvas']});
const results={};
try{
 for(const [key,pose] of Object.entries(opening)){
  const page=await browser.newPage({viewport:{width:1420,height:970}});
  const drive=waypointDriver(page,nodes);
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.LAB_URL||'http://127.0.0.1:9101/');
  await page.waitForFunction(()=>window.lab?.frame);
  await page.locator('#importSave').setInputFiles('work/weekly-opening/'+key+'-save.json');
  await drive.waitNode(pose.hub);
  const [waypoint,...trail]=pose.approach;
  if(waypoint!==pose.hub)await drive.warp(waypoint);
  await page.selectOption('#renderMode','sprite');
  for(const id of trail)await drive.cross(id);
  await drive.cross(pose.node);
  await page.waitForFunction(src=>window.lab.frame.draws.some(d=>d.source===src),pose.png.source);
  const live=await page.evaluate(async src=>{
   const frame=window.lab.frame, {loadScenery,sceneryStatus}=await import('./scenery.js');
   const draw=frame.draws.find(d=>d.source===src);
   await loadScenery(frame);
   return {draw,background:sceneryStatus(frame)};
  },pose.png.source);
  assert.equal(live.background.key,nodes[pose.node].scenery);
  for(const attr of ['source','box','h','w','x','y','flip'])assert.deepEqual(live.draw[attr],pose.png[attr]);
  await page.locator('#game').click();
  await page.keyboard.press('KeyM');
  const link=page.locator('#atlasBackgroundCompare');
  await link.waitFor();
  const [view]=await Promise.all([page.waitForEvent('popup'),link.click()]);
  view.on('pageerror',e=>errors.push(e.message));
  await view.waitForFunction(()=>window.mapArt?.liveView && window.mapArt.count===1 && window.mapArt.decodedBackgroundRectangles===6144);
  assert.equal(await view.evaluate(()=>window.mapArt.node),pose.node);
  await view.uncheck('#matchSpritePng');
  await view.uncheck('#decodedBackground');
  const runs=JSON.parse(await fs.readFile('work/weekly-opening/'+key+'-runs.json','utf8'));
  const counts={};
  for(const [profile,rects] of Object.entries(runs)){
   await view.selectOption('#profile',profile);
   const error=await view.evaluate(async ({node,draw,rects})=>{
    const {scenery}=await import('./scenery.js');
    const test=document.createElement('canvas');test.width=960;test.height=540;
    const ctx=test.getContext('2d');
    const frame={camera:0,platforms:node.platforms,campaign:{zone:'story:'+node.id},story:{active:true,node:node.id},storyScenery:node.scenery};
    const diff=id=>{
     const actual=document.getElementById(id).getContext('2d').getImageData(0,0,960,540).data;
     const expected=ctx.getImageData(0,0,960,540).data;
     let unequal=0;
     for(let i=0;i<actual.length;i+=4)if(actual[i]!==expected[i]||actual[i+1]!==expected[i+1]||actual[i+2]!==expected[i+2]||actual[i+3]!==expected[i+3])unequal++;
     return unequal;
    };
    scenery(ctx,frame);ctx.imageSmoothingEnabled=false;
    const img=new Image();img.src='assets/'+draw.source;await img.decode();
    ctx.drawImage(img,...draw.box,draw.x-draw.w*(draw.anchorX??.5),draw.y-draw.h,draw.w,draw.h);
    const png=diff('png');
    ctx.clearRect(0,0,960,540);scenery(ctx,frame);
    for(const [x,y,w,h,color] of rects){ctx.fillStyle=color;ctx.fillRect(x,y,w,h)}
    return {png,rect:diff('rect')};
   },{node:nodes[pose.node],draw:pose.png,rects});
   assert.deepEqual(error,{png:0,rect:0},key+' '+profile+' '+JSON.stringify(error));
   const count=pose.profiles[profile].drawnRuns;
   assert.ok((await view.locator('#viewportCost').innerText()).includes(count.toLocaleString('ja-JP')+'個'));
   counts[profile]={...pose.profiles[profile],differentPixels:error};
  }
  if(key==='shouki')await view.locator('main').screenshot({path:'evidence/weekly-opening-shouki-light.png'});
  assert.deepEqual(errors,[]);
  results[key]={node:pose.node,background:live.background,opening:live.draw,profiles:counts};
  await view.close();await page.close();
 }
 await fs.writeFile('evidence/weekly-opening-poses-browser.json',JSON.stringify(results,null,2)+'\n');
 console.log('All three combat openings match the M-map preview: PNG and three rectangle profiles.');
}finally{await browser.close()}
