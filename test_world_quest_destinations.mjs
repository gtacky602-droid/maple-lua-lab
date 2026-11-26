import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {questDestinations,questRoute,questTargetNode} from './quest-route.js';
import {atlasQuestObjectives,trackedQuest} from './quest-journal.js';

const read=async name=>JSON.parse((await readFile('content/'+name+'.json','utf8')).replace(/^\uFEFF/,''));
const graph=await read('story-graph'),nodes=new Map(graph.nodes.map(n=>[n.id,n]));
graph.bossNodes={};
for(const spec of [...(await read('field-boss-spawns')).fieldBosses,...(await read('weekly-boss-spawns')).weeklyBosses]){
 for(const key of [spec.id,spec.storyChallenge].filter(Boolean))graph.bossNodes[key]=spec.node;
}
for(const spec of Object.values((await read('stygian-matches')).matches))graph.bossNodes[spec.challenge]=spec.node;
const start='mond-town',reachable=new Set([start]),queue=[start];
for(const id of queue){
 const room=nodes.get(id);
 for(const next of [...room.exits.map(edge=>edge.to),room.voyage?.destination].filter(Boolean)){
  assert(nodes.has(next),id+' -> '+next);
  if(!reachable.has(next)){reachable.add(next);queue.push(next)}
 }
}
// Lowest possible entrance level along published links, ignoring quest gates.
const minimum=new Map([[start,nodes.get(start).level]]),pending=[start];
for(const id of pending){
 const room=nodes.get(id);
 for(const next of [...room.exits.map(e=>e.to),room.voyage?.destination].filter(Boolean)){
  const level=Math.max(minimum.get(id),nodes.get(next).level||1);
  if(level<(minimum.get(next)??Infinity)){minimum.set(next,level);pending.push(next)}
 }
}
assert.equal(minimum.get('sum-wp-28720'),60);
assert.equal(minimum.get('sum-wp-28721'),62);
for(const [id,level] of [[36674,65],[36684,66],[36680,67],[36677,67],[36681,68],[36685,68],[36686,68],[36676,68]]){
 const room='sum-wp-'+id;
 assert.equal(nodes.get(room).level,level);
 assert.equal(minimum.get(room),level,room);
}
const harborFrame={storyGraph:graph,story:{active:true,node:'sum-wp-28720',quests:{}},progression:{level:60}};
const nextBank=nodes.get('sum-wp-28721');
const bankRoute=questRoute(harborFrame,{kind:'visit',target:nextBank.id},'active');
assert(bankRoute.text.includes(nextBank.name+'に入るにはLv62'));
console.log('Fields above listed level on every ordinary path:',graph.nodes.filter(n=>minimum.get(n.id)>(n.level||1)).length);
const innerRooms=graph.nodes.filter(n=>n.weeklySceneOf);
for(const room of innerRooms)assert(reachable.has(room.weeklySceneOf));
for(const room of graph.nodes)assert(reachable.has(room.id)||innerRooms.includes(room),room.id);
let steps=0;
for(const q of graph.quests){
 assert(nodes.has(q.hub),q.id+' hub');
 assert(nodes.has(questTargetNode(q,graph)),q.id+' target');
 const state={status:'active',count:0,pathProgress:{}};
 const frame={storyGraph:graph,story:{active:true,node:q.hub,quests:{[q.id]:state}}};
 for(const [index,step] of (q.itinerary??[]).entries()){
  if(step.kind==='paths')continue;
  state.count=index;
  const expected=step.kind==='arrive'&&step.from?[step.from]:[step.node,...(step.alternatives??[]).map(p=>p.node)];
  assert.deepEqual(questDestinations(frame,q,'active').candidates,expected,q.id+' step '+index);
 }
 for(const path of q.paths??[]){
  state.count=q.itinerary.findIndex(step=>step.kind==='paths');
  for(const [index,step] of path.steps.entries()){
   state.pathProgress=Object.fromEntries(q.paths.map(p=>[p.id,{count:p===path?index:p.steps.length}]));
   const dest=step.kind==='arrive'&&step.from?step.from:step.node;
   assert(questDestinations(frame,q,'active').candidates.includes(dest),q.id+' '+path.id+' '+index);
  }
 }
 for(const s of [...q.itinerary??[],...q.paths?.flatMap(path=>path.steps)??[]]){
  if(s.kind==='paths')continue;
  steps++;
  for(const place of [s.node,s.from,...(s.alternatives??[]).map(a=>a.node)].filter(Boolean))assert(nodes.has(place),q.id+' '+place);
 }
}
for(const room of innerRooms){
 const q=graph.quests.find(q=>q.kind==='boss'&&graph.bossNodes[q.target]===room.weeklySceneOf);
 assert(q,room.id);
 const state={status:'active',count:0};
 const frame={storyGraph:graph,story:{active:true,node:room.id,quests:{[q.id]:state}},progression:{level:200}};
 const tracked=trackedQuest(frame,q.id);
 assert.equal(tracked.node,room.id);
 const [objective]=atlasQuestObjectives(frame,q,room.id);
 assert.equal(new URL(tracked.pointUrl,'http://localhost').searchParams.get('node'),room.id);
 assert.equal(tracked.pointUrl,objective.points[0].url);
 state.count=q.goal;
 assert.deepEqual(questDestinations(frame,q,'ready').candidates,[q.hub]);
 frame.story.node=q.hub;state.count=0;
 assert(!questDestinations(frame,q,'active').candidates.includes(room.id));
 console.log(q.name,room.name,tracked.pointUrl);
}
console.log({nodes:nodes.size,ordinaryReachable:reachable.size,innerRooms:innerRooms.length,quests:graph.quests.length,steps});
