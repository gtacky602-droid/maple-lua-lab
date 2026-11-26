import {readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {waypointDriver} from './tools/browser_waypoint_test.mjs';

const graph=JSON.parse(await readFile('content/story-graph.json','utf8'));
const browser=await chromium.launch({channel:'chrome'});
const page=await browser.newPage();
page.setDefaultTimeout(12000);
try{
 const drive=waypointDriver(page,Object.fromEntries(graph.nodes.map(n=>[n.id,n])));
 const id='chenyu-tea-delivery';
 await page.goto(process.env.LAB_URL||'http://127.0.0.1:9125/');
 await page.waitForFunction(()=>window.lab?.frame);
 await page.locator('#importSave').setInputFiles('work/chenyu-tea-fixture.json');
 await drive.waitNode('chenyu-camp');
 const row=page.locator('[data-quest="'+id+'"]');
 await row.getByRole('button',{name:'受注',exact:true}).click();
 await row.getByRole('button',{name:'この依頼を追跡',exact:true}).click();
 await drive.cross('chenyu-tea-terraces');
 const hint=page.locator('#trackedHuntHint');
 await hint.filter({hasText:/茶畑の荷札.*右手/}).waitFor();
 await drive.walk(318);
 await hint.filter({hasText:/茶畑の荷札.*すぐ近く/}).waitFor();
 await page.keyboard.press('KeyG');
 await hint.filter({hasText:/畝を見下ろす道標.*右手・上段/}).waitFor();
 await drive.walk(929);
 await hint.filter({hasText:/道標.*今いる足場の上/}).waitFor();
 await page.locator('#trackedQuest').screenshot({path:'evidence/tracked-tea-sign-above.png'});
 await drive.changeHeight(390);
 await hint.filter({hasText:/道標.*すぐ近く/}).waitFor();
 await page.keyboard.press('KeyG');
 await hint.filter({hasText:/二手に分かれる案内.*右手・下段/}).waitFor();
 console.log('Tracked tea signs advanced across both platform heights.');
}catch(error){
 console.error(await page.evaluate(()=>({node:window.lab?.frame.story?.node,hint:document.querySelector('#trackedHuntHint')?.textContent,save:document.querySelector('#saveStatus')?.textContent})));
 throw error;
}finally{await browser.close()}
