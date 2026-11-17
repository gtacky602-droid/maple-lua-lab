import assert from 'node:assert/strict';
import {checkCompanionIdleArt} from './check_companion_idle_art.mjs';

await checkCompanionIdleArt('wanderer',['traveler','ayaka'],async (page,source)=>{
 await page.evaluate(()=>window.lab.action('skill1'));
 await page.waitForFunction(()=>window.lab.frame.companion.floatSeconds>0&&window.lab.frame.actors[1].y===380);
 const airborne=[];
 for(const [side,key] of [['right','KeyD'],['left','KeyA']]){
  await page.keyboard.down(key);
  const pose=await page.waitForFunction(file=>{
   const frame=window.lab.frame,actor=frame.actors[1],draw=frame.draws.find(d=>d.source===file);
   return !actor.ground&&actor.walk!==0&&draw&&{x:actor.x-frame.camera,y:actor.y,draw};
  },source(side));
  await page.keyboard.up(key);
  const {x,y,draw}=await pose.jsonValue();
  assert.deepEqual([draw.x,draw.y,draw.flip],[x,y,false]);
  airborne.push({side,source:draw.source,y});
 }
 return {airborne};
});
