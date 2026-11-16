import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const b=await chromium.launch({headless:true,channel:'chrome'}),p=await b.newPage({viewport:{width:1440,height:1000}}),errors=[];
p.on('pageerror',e=>errors.push(e.message));
try{
 await p.goto((process.env.LAB_URL||'http://127.0.0.1:8771')+'/map-art.html');await p.waitForFunction(()=>window.mapArt?.ready);
 await p.selectOption('#node','sumeru-entry');const before=await p.evaluate(()=>window.mapArt.count);
 for(const [name,x] of [['rimebiter',300],['bolteater',700]]){
  await p.selectOption('#species','boss-'+name);const box=await p.locator('#png').boundingBox();await p.locator('#png').click({position:{x:x/960*box.width,y:478/540*box.height}});
 }
 assert.equal(await p.evaluate(()=>window.mapArt.count),before+2);
 for(const profile of ['legacy','h48c32','h32c16']){
  await p.selectOption('#profile',profile);
  const s=await p.evaluate(()=>window.mapArt);assert.deepEqual(s.placements.slice(-2).map(e=>e.species),['boss-rimebiter','boss-bolteater']);assert.deepEqual(s.visuals.slice(-2).map(e=>e.hover),[0,0]);
 }
 await p.locator('main').screenshot({path:'evidence/bathysmal-pair-map.png'});
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/bathysmal-pair-test.json',JSON.stringify({bothPlaced:true,profiles:3,independentHover:[0,0],errors},null,2));console.log('Bathysmal pair placed together across three profiles');
}finally{await b.close()}
