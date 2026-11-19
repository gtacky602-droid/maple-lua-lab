// Keep a short reload grace period; gameplay saves remain explicit and separate.
export async function frameResponse(response){
 if(response.ok)return response.json();
 const detail=await response.json().catch(()=>null);
 const message=detail?.error==='Too many sessions'?'同時接続数の上限です。不要なラボ画面を閉じ、60秒後に再読み込みしてください。':detail?.error;
 throw Error(message||`HTTP ${response.status}`);
}
export function sessionLifecycle(key){
 const owner=crypto.randomUUID();let sid=null,first=true,leaving=false;
 let graph=null,graphRevision=null;
 try{sid=sessionStorage.getItem(key)}catch{}
 const release=()=>{if(sid)navigator.sendBeacon('/api/release',new Blob([JSON.stringify({session:sid,owner})],{type:'application/json'}))};
 addEventListener('pagehide',event=>{if(!event.persisted){leaving=true;release()}});
 return {
  get savedSession(){return sid},
  get leaving(){return leaving},
  request(){return {owner,resume:first,storyGraphRevision:graphRevision}},
  restoreStoryGraph(frame){
   if(frame.storyGraph){
    graph=frame.storyGraph;
    graphRevision=frame.storyGraphRevision??null;
   }else if(graph&&graphRevision&&frame.storyGraphRevision===graphRevision){
    frame.storyGraph=graph;
   }else{
    graph=null;
    graphRevision=null;
    throw Error('地図データを再取得します。');
   }
   return frame;
  },
  accept(id){sid=id;first=false;try{sessionStorage.setItem(key,id)}catch{}if(leaving)release()},
 };
}
