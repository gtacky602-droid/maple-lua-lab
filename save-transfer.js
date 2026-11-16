export const MAX_SAVE_FILE_BYTES=48*1024;
export function initSaveTransfer({readSaved,restore}){
 const output=document.getElementById('saveStatus'),input=document.getElementById('importSave');
 document.getElementById('exportSave').onclick=()=>{
  try{const raw=readSaved();if(!raw)throw Error('先に「冒険を保存」を押してください。');JSON.parse(raw);
   const url=URL.createObjectURL(new Blob([raw],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='maple-lab-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
   output.textContent='最後に保存した冒険をJSONへ書き出しました。';
  }catch(e){output.textContent='書き出せません：'+e.message}
 };
 input.onchange=async()=>{
  const file=input.files[0];if(!file)return;
  const controls=['saveProgress','loadProgress','exportSave','importSave'].map(id=>document.getElementById(id));controls.forEach(el=>el.disabled=true);
  try{
   if(file.size>MAX_SAVE_FILE_BYTES)throw Error('保存ファイルは48KB以下にしてください。');
   let data;try{data=JSON.parse(await file.text())}catch{throw Error('JSONを読み取れません。')}
   if(!data||typeof data!=='object'||Array.isArray(data))throw Error('保存データの形式が不正です。');
   output.textContent='ファイルを検証して再開しています…';
   output.textContent=await restore(data);
  }catch(e){output.textContent='読み込みに失敗しました。元のブラウザ保存は保持しています。 '+e.message}
  finally{controls.forEach(el=>el.disabled=false);input.value=''}
 };
}
