import {chromium} from 'playwright';import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
async function walk(x){await page.locator('canvas').first().click();await page.keyboard.down('KeyD');await page.waitForFunction(x=>window.lab.frame.actors[0].x>x,x);await page.keyboard.up('KeyD')}
try{
 await page.goto('http://127.0.0.1:8769');await page.waitForFunction(()=>window.lab?.frame);await page.getByRole('button',{name:'本編ルートへ',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.active);
 await walk(1310);await page.getByRole('button',{name:'門：モンド・南の街道 Lv1',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='mond-road');
 await walk(1130);await page.getByRole('button',{name:'門：無相の風・挑戦入口 Lv1',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.node==='anemo-approach');
 await page.getByRole('button',{name:'挑戦：無相の風',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.storyNotice?.includes('挑戦碑'));
 await walk(650);await page.getByRole('button',{name:'挑戦：無相の風',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.bossJourney?.id==='anemo');
 await page.getByRole('button',{name:'挑戦入口へ戻る',exact:true}).click();await page.waitForFunction(()=>window.lab.frame.story.active&&window.lab.frame.story.node==='anemo-approach');
 await page.locator('canvas').first().screenshot({path:'evidence/world-bosses-browser.png'});
 if(errors.length)throw Error(errors.join('/'));await fs.writeFile('evidence/world-bosses-browser.json',JSON.stringify({errors,walkedFromTown:true,remoteChallengeRejected:true,enteredBoss:true,returnedToApproach:true},null,2));console.log('Walked story route to boss, challenged and returned');
}finally{await browser.close()}
