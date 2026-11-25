// The Lua codec stores two printable characters per 13- or 14-bit word.
const alphabet=Array.from({length:95},(_,i)=>String.fromCharCode(32+i))
  .filter(c=>!['"', "'", '.', '\\'].includes(c)).join('');
const bundles=new Map();

function unpack(text) {
  const variable=text[0]==='?';
  if ((!variable && text[0]!=='!') || text.length%2!==1) throw Error('未対応の背景形式です');
  const bytes=[];
  let word=0,bits=0;
  for (let i=1;i<text.length;i+=2) {
    const low=alphabet.indexOf(text[i]),high=alphabet.indexOf(text[i+1]);
    if (low<0 || high<0) throw Error('圧縮データを読めません');
    const value=low+91*high;
    word|=value<<bits;
    bits+=variable && (value&8191)<89 ? 14 : 13;
    while (bits>=8) { bytes.push(word&255);word>>>=8;bits-=8; }
  }
  return new Uint8Array(bytes);
}

function pack(bytes,variable) {
  let text=variable?'?':'!',word=0,bits=0;
  const pair=value=>alphabet[value%91]+alphabet[Math.floor(value/91)];
  for (const byte of bytes) {
    word|=byte<<bits;bits+=8;
    if (bits<(variable?14:13)) continue;
    const width=variable && (word&8191)<89 ? 14 : 13;
    text+=pair(word&((1<<width)-1));word>>>=width;bits-=width;
  }
  return bits?text+pair(word):text;
}

async function transform(bytes,stream) {
  const result=new Blob([bytes]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(result).arrayBuffer());
}

async function inflateDetails(text) {
  const bytes=unpack(text);
  try { return await transform(bytes,new DecompressionStream('deflate-raw')); }
  catch (error) {
    // The final printable pair can pad the DEFLATE stream with one zero byte.
    if (bytes.at(-1)!==0) throw error;
    return transform(bytes.subarray(0,-1),new DecompressionStream('deflate-raw'));
  }
}

async function readBundle(file) {
  if (!bundles.has(file)) {
    bundles.set(file,fetch('assets/'+file).then(async response=>{
      if (!response.ok) throw Error('背景データを読み込めません');
      const scenes=new Map();
      const rows=(await response.text()).matchAll(/^\["([^"]+)"\]=\{base=\{512,288,"treeBits","([^"]+)"\},details="([^"]+)",count=(\d+)\},\r?$/gm);
      for (const [,name,base,details,count] of rows) scenes.set(name,{base,details,count:Number(count)});
      return scenes;
    }).catch(error=>{bundles.delete(file);throw error;}));
  }
  return bundles.get(file);
}

export async function buildSceneryExport(file,source,tier) {
  const scene=(await readBundle(file)).get(source);
  const count=tier-4096;
  if (!scene || !Number.isInteger(count) || count<0 || count>scene.count || count%512!==0) throw Error('この背景の段階を読み取れません');
  let details=scene.details;
  if (count<scene.count) {
    // Seven byte planes have the same rectangle order. Keep their matching prefixes,
    // including the original color predictor and coordinate-order header if present.
    const original=await inflateDetails(details);
    const header=original.length-7*scene.count;
    if (header!==0 && header!==1) throw Error('背景の細部データが一致しません');
    const prefix=new Uint8Array(count ? header+7*count : 0);
    if (count) {
      prefix.set(original.subarray(0,header));
      for (let plane=0;plane<7;plane++) {
        const start=header+plane*scene.count;
        prefix.set(original.subarray(start,start+count),header+plane*count);
      }
    }
    const compressed=await transform(prefix,new CompressionStream('deflate-raw'));
    const fixed=pack(compressed,false),variable=pack(compressed,true);
    details=variable.length<fixed.length?variable:fixed;
  }
  const header=new Blob(['return {\n["'+source+'"]={base={512,288,"treeBits","'+scene.base+'"},details="']);
  const moduleBlob=(data,n)=>new Blob([header,data,'",count='+n+'},\n}\n'],{type:'text/plain'});
  const blob=moduleBlob(details,count);
  const fullBytes=count===scene.count?blob.size:moduleBlob(scene.details,scene.count).size;
  const stem=source.replace(/-background(?:-v1)?\.png$/,'');
  return {blob,name:stem+'-'+tier+'.lua',fullBytes,maxTier:4096+scene.count};
}

export function setupSceneryDownload(link,status) {
  let activeKey='',url='',serial=0;
  const cache=new Map();
  return async function update(file,source,tier) {
    const key=file?[file,source,tier].join('/ '):'';
    if (activeKey===key) return;
    const ticket=++serial;
    activeKey=key;
    if (url) URL.revokeObjectURL(url);
    url='';
    link.hidden=true;link.removeAttribute('href');
    status.textContent='';
    if (!file) return;
    status.textContent='書き出し容量を計測中';
    try {
      if (!cache.has(key)) cache.set(key,buildSceneryExport(file,source,tier));
      const {blob,name,fullBytes,maxTier}=await cache.get(key);
      if (ticket!==serial) return;
      url=URL.createObjectURL(blob);link.href=url;link.download=name;link.hidden=false;
      const label='選択段階のLuaファイル '+blob.size.toLocaleString('ja-JP')+' B';
      const delta=fullBytes-blob.size;
      const difference=Math.abs(delta).toLocaleString('ja-JP')+' B（'+(100*Math.abs(delta)/fullBytes).toFixed(1)+'%）';
      const baseline=maxTier.toLocaleString('ja-JP')+'矩形';
      status.textContent=tier===maxTier?label+' ｜ 比較基準 '+baseline:
        label+' ｜ '+baseline+'比 '+difference+(delta<0?'増':'減');
    } catch (error) {
      cache.delete(key);
      if (ticket===serial) status.textContent='書き出し準備に失敗しました：'+error.message;
    }
  };
}
