import {chromium} from 'playwright';import fs from 'node:fs/promises';import assert from 'node:assert/strict';
import {frameResponse} from './session-lifecycle.js';
await assert.rejects(frameResponse(new Response(JSON.stringify({error:'Too many sessions'}),{status:400})),/60秒/);
await assert.rejects(frameResponse(new Response('offline',{status:503})),/HTTP 503/);
assert.deepEqual(await frameResponse(new Response('{"ok":true}')),{ok:true});
const base=process.env.LAB_URL||'http://127.0.0.1:8771',b=await chromium.launch({headless:true,channel:'chrome'});
const errors=[],checks=[];
try{
 const p=await b.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto(base);await p.waitForFunction(()=>window.lab?.frame);
 await p.evaluate(()=>window.lab.action('story_start'));await p.waitForFunction(()=>window.lab.frame.story.active);
 await p.evaluate(()=>window.lab.action('story_accept:mond-patrol'));await p.waitForFunction(()=>window.lab.frame.story.quests['mond-patrol']);
 const sid=await p.evaluate(()=>window.lab.frame.session);
 for(let i=0;i<13;i++){
  await p.reload();await p.waitForFunction(()=>window.lab?.frame,null,{timeout:60000});
  const state=await p.evaluate(()=>({sid:window.lab.frame.session,quest:window.lab.frame.story.quests['mond-patrol']}));
  assert.equal(state.sid,sid);assert.equal(state.quest.status,'active');
 }
 checks.push('13 reloads retain one session and accepted quest');
 const c=await b.newPage();c.on('pageerror',e=>errors.push(e.message));await c.goto(base+'/compare.html');await c.waitForFunction(()=>window.compareLab?.frame);
 const compareSid=await c.evaluate(()=>window.compareLab.frame.session);assert.notEqual(compareSid,sid);
 await c.reload();await c.waitForFunction(()=>window.compareLab?.frame);assert.equal(await c.evaluate(()=>window.compareLab.frame.session),compareSid);
 checks.push('comparison reload retained its separate session');
 // Real navigation fires pagehide/beacon; then an HTTP resume proves retirement was received.
 await c.goto('about:blank');
 const resumed=await c.request.post(base+'/api/frame',{data:{session:compareSid,owner:'browser-test-probe',resume:true,steps:0}});assert.ok(resumed.ok());assert.equal((await resumed.json()).session,compareSid);
 await c.request.post(base+'/api/release',{data:{session:compareSid,owner:'browser-test-probe'}});
 await p.bringToFront();assert.equal(await p.evaluate(()=>window.lab.frame.session),sid);
 await p.goto('about:blank');checks.push('pagehide release received; other page kept its state');
 assert.deepEqual(errors,[]);await fs.writeFile('evidence/session-browser-test.json',JSON.stringify({base,checks,errors,scope:'real browser reload and navigation; crash/forced process termination beacons not guaranteed'},null,2));console.log(checks.join('; '));
}finally{await b.close()}
