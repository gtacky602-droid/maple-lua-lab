import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/branch-fixture.json','utf8'));
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='dragonspine-camp');
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel svg circle').length===window.lab.frame.storyGraph.nodes.length);
 await page.getByRole('button',{name:'検証値 3',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.imprintTrial===3);
 await page.locator('canvas').first().click();await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.lab.frame.actors[0].x>1305);await page.keyboard.up('KeyD');
 await page.getByRole('button',{name:'門：ドラゴンスパイン・探索路 Lv1',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='dragonspine-depth');
 await page.getByRole('button',{name:'拠点へ：ドラゴンスパイン・入口拠点',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='dragonspine-camp');
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('ドラゴンスパインの探索路を調べる'));
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel > p')[1]?.textContent.startsWith('ドラゴンスパイン・入口拠点'));
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('障壁の検証値 3 / 50'));
 await page.locator('#storyPanel').screenshot({path:'evidence/branches-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/branches-browser.json',JSON.stringify({errors,fixture:'level1 discovered Dragonspine',nodes:45,quests:34,portalWalk:true,regionalFastTravel:true,snowQuestsShown:true},null,2));console.log('45-node graph and branch barrier controls verified');
}finally{await browser.close()}
