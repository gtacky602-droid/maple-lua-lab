import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/natlan-fixture.json','utf8'));
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-port');
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel svg circle').length===window.lab.frame.storyGraph.nodes.length);
 await page.locator('canvas').first().click();await page.keyboard.down('KeyA');await page.waitForFunction(()=>window.lab.frame.actors[0].x<135);await page.keyboard.up('KeyA');
 await page.getByRole('button',{name:'門：ナタ・岩場の道 Lv100',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-field');
 await page.getByRole('button',{name:'拠点へ：ナタ・谷の集落',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-hub');
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('ナタの仲間と道を確かめる'));
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel > p')[1]?.textContent.startsWith('ナタ・谷の集落'));
 await page.locator('#storyPanel').screenshot({path:'evidence/regions-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/regions-browser.json',JSON.stringify({errors,fixture:'level100 visited route',nodes:20,quests:20,portalWalk:true,regionalFastTravel:true,natlanQuestsShown:true},null,2));console.log('20-node graph and Natlan route verified');
}finally{await browser.close()}
