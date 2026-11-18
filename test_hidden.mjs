import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
async function walk(predicate){await page.locator('canvas').first().click();await page.keyboard.down('KeyD');await page.waitForFunction(predicate);await page.keyboard.up('KeyD')}
try{
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.active);
 if(await page.getByRole('button',{name:'門：金リンゴ群島・入口広場 Lv1',exact:true}).count())throw Error('secret exposed');
 await walk(()=>window.lab.frame.actors[0].x>1305);await page.getByRole('button',{name:'門：モンド・南の街道 Lv1',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='mond-road');
 await page.getByRole('button',{name:'調べる：古い船着き場の跡',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('近く'));
 await walk(()=>window.lab.frame.actors[0].x>995);await page.getByRole('button',{name:'調べる：古い船着き場の跡',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.discovered.golden);
 await walk(()=>window.lab.frame.actors[0].x>=1110);await page.getByRole('button',{name:'門：潮だまりの船着き場 Lv1',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='golden-mainland-coast');
 await page.locator('#saveProgress').click();await page.waitForFunction(()=>document.getElementById('saveStatus').textContent.includes('保存しました'));await page.reload();await page.waitForFunction(()=>window.lab?.frame);await page.locator('#loadProgress').click();await page.waitForFunction(()=>window.lab.frame.story.node==='golden-mainland-coast'&&window.lab.frame.story.discovered.golden);
 await page.waitForFunction(()=>document.querySelectorAll('#storyPanel > p')[1]?.textContent.startsWith('潮だまりの船着き場'));
 await page.locator('#storyPanel').screenshot({path:'evidence/hidden-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/hidden-browser.json',JSON.stringify({errors,initiallyHidden:true,remoteDiscoveryRejected:true,walkedToClue:true,enteredSecret:true,savedDiscovery:true},null,2));console.log('Hidden discovery, entry and persistence verified');
}finally{await browser.close()}
