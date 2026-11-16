import {chromium} from 'playwright';
import fs from 'node:fs/promises';
const browser=await chromium.launch({headless:true,channel:'chrome'}),page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));
try {
 await page.goto('http://127.0.0.1:8769/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.evaluate(()=>window.lab.action('story_start'));
 await page.waitForFunction(()=>window.lab.frame.story?.node==='mond-town');
 await page.keyboard.down('KeyD');
 await page.waitForFunction(()=>window.lab.frame.actors[0].x>1310,null,{timeout:30000});
 await page.keyboard.up('KeyD');
 await page.evaluate(()=>window.lab.action('story_portal:mond-road'));
 await page.waitForFunction(()=>window.lab.frame.story?.node==='mond-road');
 await page.selectOption('#renderMode','sprite');
 await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.source==='hilichurl-idle-source-v1.png'));
 const result=await page.evaluate(()=>({node:window.lab.frame.story.node,total:window.lab.frame.total,hilichurl:window.lab.frame.draws.find(d=>d.source==='hilichurl-idle-source-v1.png')}));
 if(result.total!==6||errors.length)throw Error(JSON.stringify({result,errors}));
 await page.locator('#game').screenshot({path:'evidence/story-enemy-browser.png'});
 await page.selectOption('#renderMode','rect');
 await page.waitForFunction(()=>window.lab.frame.draws.some(d=>d.kind==='rect')&&!window.lab.frame.draws.some(d=>d.source==='hilichurl-idle-source-v1.png'));
 await fs.writeFile('evidence/story-enemy-browser.json',JSON.stringify({result,errors,method:'walked from story start to adjacent portal using keyboard; PNG and rect runtime frames checked'},null,2));
 console.log('Browser walked to Mondstadt road; live Hilichurl PNG/rect and six enemies passed');
} finally {await browser.close()}
