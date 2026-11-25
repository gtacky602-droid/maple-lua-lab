export function displayedTierHash(page,n){
 return page.evaluate(async n=>{
    const image=new Image();image.src='assets/'+window.mapArt.decodedBackgroundFile;await image.decode();
    const c=document.createElement('canvas');c.width=512;c.height=288;
    const ctx=c.getContext('2d'),i=n===6144?0:(n-4096)/512;
    ctx.drawImage(image,i%2*512,Math.floor(i/2)*288,512,288,0,0,512,288);
    const bytes=ctx.getImageData(0,0,512,288).data.filter((_,i)=>i%4!==3);
    return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(v=>v.toString(16).padStart(2,'0')).join('');
   },n);
}
