import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const base=process.env.LAB_URL||'http://127.0.0.1:19745/';
const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const nodes=Object.fromEntries(graph.nodes.map(node=>[node.id,node]));
const browser=await chromium.launch({channel:'chrome'});
try{
 const page=await browser.newPage({viewport:{width:1240,height:920}});
 const errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.goto(base);
 await page.waitForFunction(()=>window.lab?.frame);
 const link=page.locator('#currentStageComparison');
 assert(await link.isHidden());
 await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();
 await page.waitForFunction(()=>window.lab.frame.story.node==='mond-town'&&window.lab.frame.story.active);
 await page.evaluate(()=>window.lab.action('story_accept:mond-patrol'));
 await page.waitForFunction(()=>window.lab.frame.story.quests['mond-patrol']);
 const travel=waypointDriver(page,nodes);
 await travel.cross('mond-road');
 await travel.walk(660);
 const state=()=>page.evaluate(()=>{
  const f=window.lab.frame;
  const actor=f.actors.find(a=>a.id===f.active);
  return {session:f.session,node:f.story.node,camera:Math.round(f.camera),x:actor.x,
   quest:f.story.quests['mond-patrol']?.status};
 });
 await page.selectOption('#playBackgroundTier','4096');
 await page.selectOption('#renderMode','h32c16');
 const before=await state();
 assert(before.camera>0);
 assert.equal(before.quest,'active');
 const [compare]=await Promise.all([page.waitForEvent('popup'),link.click()]);
 compare.on('pageerror',error=>errors.push(error.message));
 await compare.waitForFunction(()=>window.mapArt?.ready&&window.mapArt?.decodedBackgroundRectangles===4096);
 const view=await compare.evaluate(()=>({node:window.mapArt.node,camera:window.mapArt.camera,profile:window.mapArt.profile}));
 assert.deepEqual(view,{node:before.node,camera:before.camera,profile:'h32c16'});
 assert.equal(new URL(compare.url()).searchParams.get('placements'),'live');
 await compare.close();
 await page.bringToFront();
 assert.deepEqual(await state(),before);
 assert.equal(await page.locator('#playBackgroundTier').inputValue(),'4096');
 assert.equal(await page.locator('#renderMode').inputValue(),'h32c16');

 await page.selectOption('#playBackgroundTier','0');
 await page.selectOption('#renderMode','sprite');
 const [original]=await Promise.all([page.waitForEvent('popup'),link.click()]);
 await original.waitForFunction(()=>window.mapArt?.ready);
 assert.equal(await original.locator('#decodedBackground').isChecked(),false);
 assert(await original.locator('#matchSpritePng').isChecked());
 await original.close();
 await page.bringToFront();
 assert.deepEqual(await state(),before);
 assert.deepEqual(errors,[]);
 console.log('Live stage preview kept story node, camera and settings; the original tab retained its session, player position and active quest.');
}finally{await browser.close()}
