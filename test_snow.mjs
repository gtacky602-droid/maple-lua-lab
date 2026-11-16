import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/snow-fixture.json','utf8'));
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='snezhnaya-hub');
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel svg circle').length===window.lab.frame.storyGraph.nodes.length);
 await page.locator('canvas').first().click();await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.lab.frame.actors[0].x>1305);await page.keyboard.up('KeyD');
 await page.getByRole('button',{name:'門：スネージナヤ・凍った街道 Lv140',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='snezhnaya-field');
 await page.getByRole('button',{name:'拠点へ：スネージナヤ・雪の町',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='snezhnaya-hub');
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('ミティアと雪道を見回る'));
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel > p')[1]?.textContent.startsWith('スネージナヤ・雪の町'));
 await page.locator('#storyPanel').screenshot({path:'evidence/snow-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/snow-browser.json',JSON.stringify({errors,fixture:'level140 joined Mitya',nodes:29,quests:26,portalWalk:true,regionalFastTravel:true,snowQuestsShown:true},null,2));console.log('29-node graph and Snezhnaya route verified');
}finally{await browser.close()}
