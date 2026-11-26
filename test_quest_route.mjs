import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {questRoute,questRouteText} from './quest-route.js';
import {trackedQuest,atlasQuestObjectives} from './quest-journal.js';
const graph=JSON.parse(await fs.readFile('content/story-graph.json','utf8'));
const q=graph.quests.find(q=>q.id==='mond-patrol'),frame={story:{active:true,node:'mond-town'},storyGraph:graph,progression:{level:1}};
assert.match(questRouteText(frame,q,'unaccepted'),/拠点にいます/);
assert.match(questRouteText(frame,q,'active'),/次は モンド・南の街道.*残り1区間/);
frame.story.node='mond-road';assert.match(questRouteText(frame,q,'active'),/目的地に到着/);assert.match(questRouteText(frame,q,'ready'),/モンド・城門広場/);assert.equal(questRouteText(frame,q,'complete'),'');
assert.match(questRouteText(frame,{...q,repeatable:true},'complete'),/モンド・城門広場/);
assert.match(questRouteText(frame,{...q,target:'missing'},'active'),/未公開または未登録/);
const secret={id:'secret',name:'SECRET NAME',exits:[],level:1};assert.doesNotMatch(questRouteText(frame,{...q,target:secret.id},'active'),/SECRET NAME/);
frame.story.node='mond-town';assert.match(questRouteText(frame,{...q,kind:'visit',target:'liyue-harbor'},'active'),/Lv20/);
const boss=graph.quests.find(q=>q.kind==='boss');assert.match(questRouteText(frame,boss,'active'),/目的地/);
frame.story.node='natlan-voyage';frame.voyage={elapsed:20,seconds:70};const visit={kind:'visit',target:'ochkanatlan-dock',hub:'natlan-port'};
assert.match(questRouteText(frame,visit,'active'),/寄港まで約10秒/);
frame.voyage.elapsed=30;assert.match(questRouteText(frame,visit,'active'),/寄港中.*20秒/);
frame.voyage.elapsed=50;assert.match(questRouteText(frame,visit,'active'),/寄港時間を過ぎ/);
assert.match(questRouteText(frame,{...visit,target:'nod-port'},'active'),/船に乗ったまま.*自動で降ります/);
frame.voyage.seconds=0;assert.match(questRouteText(frame,{...visit,target:'nod-port'},'active'),/到着すると自動で降ります/);
assert.doesNotMatch(questRouteText(frame,{...visit,target:'nod-port'},'active'),/到着を待ちます/);
frame.voyage.seconds=.01;assert.match(questRouteText(frame,{...visit,target:'nod-port'},'active'),/約1秒/);
frame.paused=true;assert.match(questRouteText(frame,visit,'active'),/一時停止中/);
const disconnected={...frame,storyGraph:{nodes:[{id:'a',name:'A',exits:[]},{id:'b',name:'B',exits:[]}],quests:[]},story:{active:true,node:'a'}};assert.match(questRouteText(disconnected,{kind:'visit',target:'b'},'active'),/経路がありません/);
// Prefer an unlocked detour over a shorter locked branch. Threshold fallback
// must minimize required level rather than simply choosing the fewest gates.
const routeGraph={nodes:[
 {id:'start',name:'Start',level:99,exits:[{to:'locked'},{to:'detour'}]},
 {id:'locked',name:'Locked shortcut',level:30,exits:[{to:'goal'}]},
 {id:'detour',name:'Available detour',level:5,exits:[{to:'start'},{to:'bridge'}]},
 {id:'bridge',name:'Bridge',level:5,exits:[{to:'goal'}]},
 {id:'goal',name:'Goal',level:5,exits:[]}
]};
const routed={story:{active:true,node:'start'},storyGraph:routeGraph,progression:{level:5}},targetQuest={kind:'visit',target:'goal'};
assert.match(questRouteText(routed,targetQuest,'active'),/次は Available detour.*残り3区間/);
assert.doesNotMatch(questRouteText(routed,targetQuest,'active'),/Lv30|現在のレベルでは/);
routed.progression.level=30;assert.match(questRouteText(routed,targetQuest,'active'),/次は Locked shortcut.*残り2区間/);
routed.progression.level=1;assert.match(questRouteText(routed,targetQuest,'active'),/次は Available detour.*現在のレベルでは通れません.*Lv5/);
// A high-level starting node does not prevent leaving it; only destinations gate entry.
assert.doesNotMatch(questRouteText(routed,targetQuest,'active'),/Lv99/);
const routeSnapshot=JSON.stringify(routed);questRouteText(routed,targetQuest,'active');assert.equal(JSON.stringify(routed),routeSnapshot);
const gateFrame={story:{active:true,node:'mond-town'},storyGraph:graph,progression:{level:1},active:2,actors:[{id:1,x:1380,y:480},{id:2,x:160,y:480}]};
assert.match(questRouteText(gateFrame,q,'active'),/次の門は右/);
gateFrame.actors[1].x=1380;gateFrame.actors[1].y=350;assert.match(questRouteText(gateFrame,q,'active'),/地上へ降りて/);
gateFrame.actors[1].y=480;assert.match(questRouteText(gateFrame,q,'active'),/次の門の近く/);
gateFrame.story.node='mond-road';gateFrame.actors[1].x=500;assert.match(questRouteText(gateFrame,q,'ready'),/次の門は左/);
delete gateFrame.actors;assert.doesNotMatch(questRouteText(gateFrame,q,'ready'),/次の門は左|次の門の近く/);
const contest=graph.quests.find(q=>q.contest);
const contestFrame={story:{active:true,node:contest.target,quests:{[contest.id]:{status:'active',count:3}}},
 storyGraph:graph,progression:{level:40}};
assert.match(questRouteText(contestFrame,contest,'active'),/目的地に到着/);
contestFrame.story.quests[contest.id].count=4;
assert.match(questRouteText(contestFrame,contest,'active'),/次は 稲妻・潮見の岬/);
contestFrame.story.quests[contest.id]={status:'complete',count:5};
contestFrame.storyContest={stage:2,replay:true};
const rematch=trackedQuest(contestFrame,contest.id);
assert.match(rematch.text,/再戦中.*水面/);
assert.match(rematch.pointUrl,/contest=2&replay=1/);
const sights=graph.quests.find(q=>q.sights);
const sightState={status:'active',count:2,sights:{seen:{sakura:true,slope:true}}};
const sightFrame={story:{active:true,node:sights.hub,quests:{[sights.id]:sightState}},
 storyGraph:graph,progression:{level:40}};
assert.match(questRouteText(sightFrame,sights,'active'),/目的地：稲妻・城下の広場/);
delete sightState.sights;
assert.match(questRouteText(sightFrame,sights,'active'),/目的地：稲妻・海辺の街道/);
const rubbings=graph.quests.find(q=>q.id==='bygone-stone-rubbings');
const waterway={story:{active:true,node:'bygone-waterway-pier',quests:{[rubbings.id]:{count:0}}},
 storyGraph:graph,progression:{level:148},active:1,actors:[{id:1,x:821,y:480}]};
assert.match(questRouteText(waterway,rubbings,'active'),/次は 共鳴石の足場室.*F：水路を渡る/);
const boatQuest=graph.quests.find(q=>q.id==='golden-little-boat');
const sailing={story:{active:true,node:boatQuest.hub,quests:{[boatQuest.id]:{count:3}}},
 storyGraph:graph,progression:{level:1},active:1,actors:[{id:1,x:1530,y:480}]};
assert.match(questRouteText(sailing,boatQuest,'active'),/次は 金リンゴ群島・入口広場.*F：小舟に乗る/);
const lookout=graph.quests.find(q=>q.id==='veluriyam-trolley-lookout');
const trolley={story:{active:true,node:'veluriyam-trolley-out',quests:{[lookout.id]:{count:0}}},
 storyGraph:graph,progression:{level:60},active:1,actors:[{id:1,x:160,y:480}],
 voyage:{kind:'trolley',elapsed:2,seconds:6.4}};
assert.match(questRouteText(trolley,lookout,'active'),/花棚の停留所.*F：途中下車する.*停車中/);
trolley.story.node='veluriyam-trolley-back';trolley.story.quests[lookout.id].count=2;
assert.match(questRouteText(trolley,lookout,'active'),/入口広場.*トロッコに乗ったまま.*自動で降ります/);
const ridge=graph.quests.find(q=>q.id==='natlan-ridge-flag');
const race={story:{active:true,node:'natlan-flag-ledges',quests:{[ridge.id]:{count:1}}},
 storyGraph:graph,progression:{level:100}};
assert.match(questRouteText(race,ridge,'active'),/目的地に到着/);
race.story.quests[ridge.id].count=2;
assert.match(questRouteText(race,ridge,'active'),/目的地に到着/);
race.story.quests[ridge.id].count=3;
assert.match(questRouteText(race,ridge,'active'),/次は カチーナの切れ目足場/);
const trials=graph.quests.find(q=>q.id==='natlan-two-trials');
const oneDone={count:1,pathProgress:{high:{count:4},water:{count:1}}};
const trialFrame={story:{active:true,node:'natlan-flag-summit',quests:{[trials.id]:oneDone}},
 storyGraph:graph,progression:{level:100}};
assert.match(questRouteText(trialFrame,trials,'active'),/次は 浮き台と最初の岸/);
oneDone.pathProgress.water.count=2;
assert.match(questRouteText(trialFrame,trials,'active'),/目的地：折り返しの瀬と岩渡り/);
oneDone.count=2;oneDone.pathProgress.water.count=4;
assert.match(questRouteText(trialFrame,trials,'active'),/次は 夕映え会場の控え広場/);
const crossroads=graph.quests.find(q=>q.id==='nod-moon-crossroads');
const routeState={status:'complete',count:6,pathProgress:{wood:{count:2},coast:{count:0}}};
const confluence={story:{active:true,node:'nod-box-inlet',quests:{[crossroads.id]:routeState}},
 storyGraph:graph,progression:{level:120}};
const coastVisit={kind:'visit',target:'nod-lantern-shore'};
assert.match(questRouteText(confluence,coastVisit,'active'),/次は ナド・クライ・月渡りの岩窟口/);
routeState.pathProgress.coast.count=3;
assert.match(questRouteText(confluence,coastVisit,'active'),/次は ナド・クライ・灯りの海岸旧道.*残り1区間/);
const beam=graph.quests.find(q=>q.id==='ina-mapped-enkan-beacons');
const viaWest={story:{active:true,node:'enkan-wp-21581',quests:{[beam.id]:{status:'active',count:0}}},
 storyGraph:graph,progression:{level:61}};
assert.match(questRouteText(viaWest,beam,'active'),/^次は 淵下宮・.*残り3区間/);
viaWest.story.node='enkan-wp-21580';
assert.match(questRouteText(viaWest,beam,'active'),/^次は 淵下宮・大塔西の回廊.*残り2区間/);
assert.equal(questRoute(viaWest,beam,'active').node,beam.itinerary[0].from);
viaWest.story.node='enkan-wp-21579';
assert.match(questRouteText(viaWest,beam,'active'),/^次は 淵下宮・中央の石灯広場.*残り1区間/);
assert.equal(questRoute(viaWest,beam,'active').node,beam.itinerary[0].node);
assert.equal(questRoute(frame,{...q,target:'missing'},'active').node,undefined);
const original=JSON.stringify(frame);let checked=0;for(const quest of graph.quests)for(const status of ['unaccepted','active','ready','complete']){assert.equal(typeof questRouteText(frame,quest,status),'string');checked++}assert.equal(JSON.stringify(frame),original);
await fs.writeFile('evidence/quest-route-test.json',JSON.stringify({checked,checks:['accept/report hub destination','active visit/kill destination','boss challenge entrance','one-time complete hidden','repeatable complete points to hub','missing/hidden target no leak','level gate indication','level-eligible detour preferred','shortest route at eligible level','blocked fallback minimizes required level','high-level origin permits exit','cycles terminate','voyage pre/during/post stopover and arrival','arrival zero switches to disembark; positive fraction waits','active companion position drives gate direction','ground proximity and elevated descent guidance','missing actors omit directional guidance','pause indication','disconnected graph','chapter finale tracks the cape after the contest','town walk and legacy hunt use their respective targets','ordered arrival directions reach the specified departure gate','no frame mutation']},null,2));

const sluice=graph.quests.find(q=>q.id==='fon-morte-sluice-survey');
const bubbleRoom='chassanion-legend-bubble-room',outside='fon-wp-55765',tower='morte-tower-sluice';
const waterFrame={story:{active:true,node:outside,quests:{}},storyGraph:graph,progression:{level:120}};
const visitRoom={kind:'visit',target:bubbleRoom};
for(const state of [undefined,{status:'active',count:0},{status:'active',count:sluice.goal}]){
 waterFrame.story.quests[sluice.id]=state;
 assert.match(questRouteText(waterFrame,visitRoom,'active'),/残り1区間/);
}
waterFrame.story.quests[sluice.id]={status:'complete',count:sluice.goal};
assert.match(questRouteText(waterFrame,visitRoom,'active'),/残り2区間/);
const follow=trackedQuest(waterFrame,sluice.id);
assert.equal(follow.node,bubbleRoom);
assert.equal(new URL(follow.pointUrl,'http://localhost').searchParams.get('phase'),'after');
assert(follow.text.includes(graph.nodes.find(n=>n.id===tower).name));
waterFrame.story.node=bubbleRoom;
assert.match(questRouteText(waterFrame,{kind:'visit',target:outside},'active'),/残り2区間/);
console.log('Quest routing fixtures passed');

// Two physical exits can lead to the same field. Match the Lua atlas choice
// as story progress unlocks the nearby return gate on Sayu's patrol route.
const sayuFrame={story:{active:true,node:'ina-sayu-watchpath',quests:{'ina-sayu-quiet-route':{status:'active',count:4}}},
 storyGraph:graph,progression:{level:200},active:1,actors:[{id:1,x:2160,y:480}]};
const returnToTown={kind:'visit',target:'inazuma-town'};
function nextGate(){
 const route=questRoute(sayuFrame,returnToTown,'active');
 const url=new URL(route.gateUrl,'http://localhost');
 assert.equal(url.searchParams.get('to'),'inazuma-town');
 return [Number(url.searchParams.get('gateX')),route.text];
}
assert.equal(nextGate()[0],64);
sayuFrame.story.quests['ina-sayu-quiet-route'].count=5;
assert.equal(nextGate()[0],2188);
assert.match(nextGate()[1],/門の近く/);
sayuFrame.actors[0].x=100;
assert.equal(nextGate()[0],64);

// The live departure is closed, but boarding the same vehicle again resets its clock.
for(const [vehicle,landing,elapsed,kind,legs] of [
 ['natlan-voyage','ochkanatlan-dock',50,'ferry',3],
 ['natlan-voyage-return','ochkanatlan-dock',50,'ferry',3],
 ['veluriyam-trolley-out','veluriyam-petal-stop',6.3,'trolley',5],
 ['veluriyam-trolley-back','veluriyam-petal-stop',6.3,'trolley',5]
]){
 const f={story:{active:true,node:vehicle,quests:{'veluriyam-bottle-ticket':{status:'complete'}}},storyGraph:graph,progression:{level:200},voyage:{elapsed,kind}};
 const trip={kind:'itinerary',itinerary:[{kind:'arrive',from:vehicle,node:landing}]};
 const recover=questRoute(f,trip,'active');
 assert.ok(recover.text.includes('残り'+legs+'区間'),recover.text);
 if(kind==='ferry')assert.equal(new URL(recover.gateUrl,'http://localhost').searchParams.get('to'),graph.nodes.find(n=>n.id===vehicle).voyage.source);
 else assert.equal(new URL(recover.gateUrl,'http://localhost').searchParams.get('voyage'),vehicle);
 f.voyage.elapsed-=.02;
 assert.equal(new URL(questRoute(f,trip,'active').gateUrl,'http://localhost').searchParams.get('to'),landing);
}

const cave=graph.quests.find(q=>q.id==='mond-bennett-cave');
const miner={storyGraph:graph,progression:{level:16},story:{active:true,node:cave.target,quests:{[cave.id]:{status:'active',count:3}}},storyCave:{falling:true}};
const descent=trackedQuest(miner,cave.id);
assert.match(descent.text,/落下中/);
assert.equal(descent.gateUrl,undefined);
assert.equal(new URL(descent.pointUrl,'http://localhost').searchParams.get('node'),cave.cave.depth);
miner.storyCave.falling=false;
miner.story.node=cave.hub;
miner.story.quests['amber-join']={status:'complete',count:4};
miner.story.quests[cave.requires]={status:'complete',count:2};
assert.equal(trackedQuest(miner,cave.id).node,cave.cave.depth);

const delivery=graph.quests.find(q=>q.id==='liyue-market-delivery');
const parcels={guardCleared:false,recovered:false,delivered:{}};
const courier={storyGraph:graph,progression:{level:20},story:{active:true,node:delivery.hub,
 quests:{[delivery.id]:{status:'active',count:0,delivery:parcels}}}};
const stalls=()=>atlasQuestObjectives(courier,delivery,delivery.hub).flatMap(o=>o.points).map(p=>p.id);
assert.deepEqual(stalls(),['pot','vessel']);
courier.story.node=delivery.target;
assert.equal(new URL(trackedQuest(courier,delivery.id).pointUrl,'http://localhost').searchParams.get('subject'),delivery.delivery.cache.guard);
parcels.guardCleared=true;
assert.equal(new URL(trackedQuest(courier,delivery.id).pointUrl,'http://localhost').searchParams.get('node'),delivery.target);
parcels.recovered=true;
assert.deepEqual(stalls(),['pot','vessel','wheel']);
parcels.delivered.vessel=true;
courier.story.quests[delivery.id].count=1;
const alternate=new URL(trackedQuest(courier,delivery.id,{point:'wheel'}).pointUrl,'http://localhost');
assert.equal(alternate.searchParams.get('worksite'),'wheel');
assert.deepEqual(alternate.searchParams.getAll('stocked'),['vessel']);
assert.deepEqual(stalls(),['pot','wheel']);
