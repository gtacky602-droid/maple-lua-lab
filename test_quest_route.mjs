import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {questRouteText} from './quest-route.js';
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
assert.match(questRouteText(frame,{...visit,target:'nod-port'},'active'),/船の到着を待ちます/);
frame.voyage.seconds=0;assert.match(questRouteText(frame,{...visit,target:'nod-port'},'active'),/船は到着しています/);
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
assert.match(questRouteText(trolley,lookout,'active'),/入口広場.*乗ったまま次の地点へ着きます/);
const original=JSON.stringify(frame);let checked=0;for(const quest of graph.quests)for(const status of ['unaccepted','active','ready','complete']){assert.equal(typeof questRouteText(frame,quest,status),'string');checked++}assert.equal(JSON.stringify(frame),original);
await fs.writeFile('evidence/quest-route-test.json',JSON.stringify({checked,checks:['accept/report hub destination','active visit/kill destination','boss challenge entrance','one-time complete hidden','repeatable complete points to hub','missing/hidden target no leak','level gate indication','level-eligible detour preferred','shortest route at eligible level','blocked fallback minimizes required level','high-level origin permits exit','cycles terminate','voyage pre/during/post stopover and arrival','arrival zero switches to disembark; positive fraction waits','active companion position drives gate direction','ground proximity and elevated descent guidance','missing actors omit directional guidance','pause indication','disconnected graph','chapter finale tracks the cape after the contest','town walk and legacy hunt use their respective targets','no frame mutation']},null,2));console.log('Quest routing fixtures passed');
