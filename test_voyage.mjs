import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);
 const fixture=await fs.readFile('work/voyage-fixture.json','utf8');await page.evaluate(raw=>localStorage.setItem('maple-lua-lab.checkpoint.v1',raw),fixture);
 await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='liyue-harbor');
 await page.locator('canvas').first().scrollIntoViewIfNeeded();await page.locator('canvas').first().click();await page.keyboard.down('KeyD');await page.waitForFunction(()=>window.lab.frame.actors[0].x>650);await page.keyboard.up('KeyD');
 await page.getByRole('button',{name:'門：稲妻行き・船の甲板 Lv40',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.voyage?.seconds>0);
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('到着まで'));
 await page.locator('#storyPanel').screenshot({path:'evidence/voyage-browser.png'});
 await page.waitForFunction(()=>window.lab.frame.story.node==='inazuma-port',null,{timeout:45000});
 await page.waitForFunction(()=>document.getElementById('storyPanel').textContent.includes('綾華と海辺'));
 if(errors.length)throw Error(errors.join('/'));
 await fs.writeFile('evidence/voyage-browser.json',JSON.stringify({errors,fixture:'level40 harbor',walkedToDock:true,timerShown:true,automaticArrival:true,inazumaQuestsShown:true},null,2));console.log('Ferry boarding, timer and automatic arrival verified');
}finally{await browser.close()}
