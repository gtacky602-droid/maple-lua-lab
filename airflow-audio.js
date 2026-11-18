export function initAirflowAudio(){
 const button=document.getElementById('airflowSound');
 let context=null,volume,enabled=false,lastCue;
 button.onclick=async()=>{
  if(enabled){
   enabled=false;
   volume.gain.value=0;
  }else{
   try{
    if(!context){
     context=new AudioContext();
     volume=context.createGain();
     volume.connect(context.destination);
    }
    await context.resume();
    enabled=context.state==='running';
    volume.gain.value=enabled?1:0;
   }catch{enabled=false;}
  }
  button.setAttribute('aria-pressed',String(enabled));
  button.textContent=enabled?'装置音を消す':'装置音を聞く';
  button.blur();
 };
 return {update(frame){
  const cue=frame.storyResonanceCue??frame.storyAirflowCue;
  if(!cue)return;
  const key=`${frame.session}:${cue.id}:${cue.untilTime}`;
  if(key===lastCue)return;
  lastCue=key;
  if(!enabled||context?.state!=='running'||frame.paused)return;
  const start=context.currentTime+.02;
  cue.notes.forEach((pitch,index)=>{
   const at=start+index*.17,osc=context.createOscillator(),envelope=context.createGain();
   osc.type='triangle';osc.frequency.value=pitch;
   envelope.gain.setValueAtTime(.001,at);
   envelope.gain.exponentialRampToValueAtTime(.085,at+.026);
   envelope.gain.exponentialRampToValueAtTime(.001,at+.14);
   osc.connect(envelope).connect(volume);
   osc.start(at);osc.stop(at+.15);
  });
 }};
}
