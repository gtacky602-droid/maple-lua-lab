import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
async function walk(key,predicate){await page.locator('canvas').first().click();await page.keyboard.down(key);await page.waitForFunction(predicate);await page.keyboard.up(key)}
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),await fs.readFile('work/stopover-fixture.json','utf8'));await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-port');
 await walk('KeyD',()=>window.lab.frame.actors[0].x>650);await page.getByRole('button',{name:'門：北行き航海・甲板 Lv120',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='natlan-voyage');
 await walk('KeyD',()=>window.lab.frame.actors[0].x>650);const stop=page.getByRole('button',{name:'門：オシカ・ナタ・寄港地 Lv120',exact:true});
 if(!await stop.isDisabled())throw Error('stop enabled before arrival');await page.waitForFunction(()=>window.lab.frame.voyage?.stopover,null,{timeout:40000});await stop.click();await page.waitForFunction(()=>window.lab.frame.story.node==='ochkanatlan-dock');
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel > p')[1]?.textContent.startsWith('オシカ・ナタ'));
 await page.locator('#storyPanel').screenshot({path:'evidence/stopover-browser.png'});
 await walk('KeyA',()=>window.lab.frame.actors[0].x<135);await page.getByRole('button',{name:'門：北行き航海・甲板 Lv120',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.voyage?.seconds>0&&window.lab.frame.voyage.seconds<=40);
 await page.waitForFunction(()=>window.lab.frame.story.node==='nod-port',null,{timeout:50000});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/stopover-browser.json',JSON.stringify({errors,fixture:'Lv120 Natlan harbor',walked:true,earlyDisabled:true,disembarked:true,reboarded:true,arrived:true},null,2));console.log('Optional stop, reboard and arrival verified');
}finally{await browser.close()}
