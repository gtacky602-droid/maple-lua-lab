-- Read pre-order background splits from three packed bit streams.
local function treeBitReader(bytes)
local flag=32
local axis=flag+8*(bytes[1]+256*bytes[2])
local cut=axis+8*(bytes[3]+256*bytes[4])
local widths={}
for n=2,512 do
local v=n-2
local bits=0
while v>0 do bits=bits+1;v=v>>1 end
widths[n]=bits
end
local function read(pos,bits)
local i=1+(pos>>3)
local pair=bytes[i]|(bytes[i+1]<<8)
return(pair>>(pos&7))&((1<<bits)-1)
end
return function(w,h)
if w==1 and h==1 then return 0 end
local branch=read(flag,1);flag=flag+1
if branch==0 then return 0 end
local direction
if w==1 then direction=1
elseif h==1 then direction=0
else direction=read(axis,1);axis=axis+1 end
local bits=widths[direction==1 and h or w]
local value=read(cut,bits)+1;cut=cut+bits
return 2*value+direction
end
end

-- Decode stored, fixed and dynamic DEFLATE blocks from the local atlas.
local profiles,art={},{}
local alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
local digits={}
for i=1,#alphabet do digits[alphabet:byte(i)]=i-1 end
local function join(parts)
while #parts>32 do
local nextParts={}
for i=1,#parts,32 do
local group={}
for j=i,math.min(i+31,#parts)do group[#group+1]=parts[j] end
nextParts[#nextParts+1]=table.concat(group)
end
parts=nextParts
end
return table.concat(parts)
end
local alphabet85='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz!#$%&()*+-;<=>?@^_`{|}~'
local digit85={}
for i=1,#alphabet85 do digit85[alphabet85:byte(i)]=i-1 end
local function reader85(s)
local pos,left,word=2,0,0
return function()
if left==0 then
word=0
for i=pos,pos+4 do word=word*85+digit85[s:byte(i)] end
pos=pos+5;left=4
end
left=left-1
return(word >>(left*8))& 255
end
end
local digit91={}
local alphabet91=' !#$%&()*+,-/0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[]^_`abcdefghijklmnopqrstuvwxyz{|}~'
for i=1,#alphabet91 do digit91[alphabet91:byte(i)]=i-1 end
local function reader13(s)
local pos,bits,word=2,0,0
return function()
if bits<8 then
local a,b=s:byte(pos,pos+1)
word=word|(((digit91[a] or 0)+91*(digit91[b] or 0))<<bits)
bits=bits+13;pos=pos+2
end
local value=word&255
bits=bits-8;word=word>>8
return value
end
end
local function readerVariable(s)
local pos,bits,word=2,0,0
return function()
if bits<8 then
local a,b=s:byte(pos,pos+1)
local value=((digit91[a] or 0)+91*(digit91[b] or 0))
word=word|(value<<bits)
bits=bits+(((value&8191)<89) and 14 or 13);pos=pos+2
end
local value=word&255
bits=bits-8;word=word>>8
return value
end
end
local function byteReader(s)
if s:byte(1)==33 then return reader13(s)end
if s:byte(1)==63 then return readerVariable(s)end
if s:byte(1)==126 then return reader85(s)end
local pos,slot,chunk=1,3,0
return function()
if slot==3 then
local a,b,c,d=s:byte(pos,pos+3)
chunk=digits[a]*262144+digits[b]*4096+(digits[c] or 0)*64+(digits[d] or 0)
pos=pos+4;slot=0
end
slot=slot+1
if slot==1 then return math.floor(chunk/65536)end
if slot==2 then return math.floor(chunk/256)%256 end
return chunk%256
end
end
local huff={}
local function fill(symbol,bits,code)
huff[2^bits+code]=symbol
end
for s=0,287 do
if s<144 then fill(s,8,48+s)elseif s<256 then fill(s,9,400+s-144)
elseif s<280 then fill(s,7,s-256)else fill(s,8,192+s-280)end
end
local lens={3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258}
local dist={1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577}
local function codes(lengths)
local count,nextCode,result={},{},{}
for _,w in ipairs(lengths)do if w>0 then count[w]=(count[w] or 0)+1 end end
local code=0
for w=1,15 do code=(code+(count[w-1] or 0))*2;nextCode[w]=code end
for i,w in ipairs(lengths)do
if w>0 then result[2^w+nextCode[w]]=i-1;nextCode[w]=nextCode[w]+1 end
end
return result
end
-- Populate the eight-bit lookup only when this Huffman alphabet is used.
local function lookup(tree)
local fast={}
for width=1,8 do
for code=0,(1<<width)-1 do
local sym=tree[(1<<width)+code]
if sym then
local reversed=0
for i=0,width-1 do reversed=(reversed<<1)|((code>>i)&1)end
local value=(sym<<4)|width
for prefix=reversed,255,1<<width do fast[prefix]=value end
end
end
end
tree.fast=fast;return fast
end
local order={16,17,18,0,8,7,9,6,10,5,11,4,12,3,13,2,14,1,15}
local function inflate(encoded)
local nextByte,acc,n=byteReader(encoded),0,0
local function bits(w)
while n<w do acc=acc|(nextByte()<<n);n=n+8 end
local value=acc&((1<<w)-1);acc=acc>>w;n=n-w;return value
end
local function symbol(tree)
local fast=tree.fast or lookup(tree)
local value=fast[acc&255]
if n<8 and(not value or(value&15)>n)then
acc=acc|(nextByte()<<n);n=n+8;value=fast[acc&255]
end
if value then
local width=value&15;acc=acc>>width;n=n-width;return value>>4
end
local code=0
for width=1,15 do
code=(code<<1)|bits(1)
if width>8 then
local sym=tree[(1<<width)+code]
if sym then return sym end
end
end
error('invalid Huffman code')
end
local function dynamic()
local nl=bits(5)+257;local nd=bits(5)+1;local nc=bits(4)+4
local lengths={}
for i=1,19 do lengths[i]=0 end
for i=1,nc do lengths[order[i]+1]=bits(3)end
local tree=codes(lengths);local items={}
while #items<nl+nd do
local v=symbol(tree)
if v<16 then items[#items+1]=v
else
local value=0;local count
if v==16 then value=items[#items];count=3+bits(2)
elseif v==17 then count=3+bits(3)
else count=11+bits(7)end
for i=1,count do items[#items+1]=value end
end
end
local lit,distances={},{}
for i=1,nl do lit[i]=items[i] end
for i=1,nd do distances[i]=items[nl+i] end
return codes(lit),codes(distances)
end
local out={}
local last
repeat
last=bits(1);local typ=bits(2)
if typ==0 then
bits(n%8);local count=bits(16);assert(bits(16)==65535-count)
for i=1,count do out[#out+1]=bits(8)end
else
local tree,distTree=huff,nil
if typ==2 then tree,distTree=dynamic()else assert(typ==1)end
while true do
local sym=symbol(tree)
if sym==256 then break elseif sym<256 then out[#out+1]=sym
else
local idx=sym-256
local len=lens[idx]+bits(idx==29 and 0 or math.max(0,math.floor((idx-5)/4)))
local id=0
if distTree then id=symbol(distTree)else for i=1,5 do id=id*2+bits(1)end end
local offset=dist[id+1]+bits(math.max(0,math.floor(id/2)-1))
for i=1,len do out[#out+1]=out[#out-offset+1] end
end
end
end
until last==1
return out
end
local cache=setmetatable({},{__mode='v'})
local function unpackPose(p)
local group=p[4]
if type(group)=='number'then group=profiles[group][4] end
local b=inflate(group)
local mode,count=b[1],b[2]
local cur=3
local function number()
local value,weight=0,1
while true do
local byte=b[cur];cur=cur+1;value=value+(byte%128)*weight
if byte<128 then return value end
weight=weight*128
end
end
local frames={}
for i=1,count do
local w=number();local h=number();local colors=number()
local f={w=w,h=h,palette=cur,colors=colors,cols=math.ceil(w/8),rows=math.ceil(h/8)}
cur=cur+colors*3
if mode==3 then f.bits=b[cur];cur=cur+1 end
frames[i]=f
end
local patterns=number();local tableStart=cur
local stride=mode==1 and 64 or 8
cur=cur+stride*patterns
if mode==1 or mode==2 then
for _,f in ipairs(frames)do
f.ids={}
for tile=1,f.rows*f.cols do f.ids[tile]=tableStart+number()*stride end
end
end
local out={}
for i,f in ipairs(frames)do
local wanted=i==p[5];local offset=f.colors*3
if wanted then for j=1,offset do out[j]=b[f.palette+j-1] end end
if mode==0 then
if wanted then for j=1,f.w*f.h do out[offset+j]=b[cur+j-1] end end
cur=cur+f.w*f.h
elseif wanted or mode==2 then
local planeSize=f.rows*f.cols*8
for tile=0,f.rows*f.cols-1 do
local originX=(tile%f.cols)*8;local originY=math.floor(tile/f.cols)*8
for y=0,7 do
for x=0,7 do
local v=0
if mode==1 then v=b[f.ids[tile+1]+y*8+x]
elseif mode==2 then
if((b[f.ids[tile+1]+y]>>(7-x))&1)==1 then v=b[cur];cur=cur+1 end
else
for bit=0,f.bits-1 do v=v+(((b[cur+bit*planeSize+tile*8+y]>>(7-x))&1)<<bit)end
end
if wanted and originX+x<f.w and originY+y<f.h then out[offset+(originY+y)*f.w+originX+x+1]=v end
end
end
end
end
if mode==3 then cur=cur+f.bits*f.rows*f.cols*8 end
if wanted then return out end
end
error('missing animation pose')
end

local shifts={{0,0},{-4,0},{4,0},{0,-4},{0,4},{-2,-2},{2,-2},{-2,2},{2,2}}
-- Keep one recently used reference image. Larger images are decoded on demand.
local donorProfile,donorPixels
local function independentPixels(p)
local bytes=inflate(p[4])
if p[5]~=-2 then return bytes end
local count=p[1]*p[2]
local start=p[3]*3
local mode=p[6]
if mode==3 then
local nextColor=start+math.ceil(count/8)+1
local pixels={}
for j=1,start do pixels[j]=bytes[j] end
for i=0,count-1 do
local mask=bytes[start+1+(i>>3)]
if(mask &(128>>(i%8)))~=0 then
pixels[start+1+i]=bytes[nextColor];nextColor=nextColor+1
else pixels[start+1+i]=0 end
end
return pixels
end
local vertical=mode==1 or mode==4
local stride=vertical and p[1] or 1
for i=stride,count-1 do
if vertical or i%p[1]~=0 then
local j=start+i+1
if mode<3 then bytes[j]=bytes[j]~bytes[j-stride]
else bytes[j]=(bytes[j]+bytes[j-stride])&255 end
end
end
return bytes
end
local function referenceBytes(base)
if donorProfile==base then return donorPixels end
local pixels=independentPixels(base)
if #pixels<=32768 then donorProfile,donorPixels=base,pixels end
return pixels
end
local function motionBytes(p)
local b=inflate(p[4]);local base=profiles[p[6]];local raw=referenceBytes(base)
local w,h,colors=p[1],p[2],p[3];local bw,bh,bc=base[1],base[2],base[3]
local cols=math.ceil(w/16);local offset=colors*3
local map=offset+bc+1;local patch=map+cols*math.ceil(h/16)
local result={}
for i=1,offset do result[i]=b[i] end
for y=0,h-1 do
for x=0,w-1 do
local move=shifts[b[map+math.floor(y/16)*cols+math.floor(x/16)+1]+1]
local xx,yy=x+move[1],y+move[2];local pred=0
if xx>=0 and xx<w and yy>=0 and yy<h then
local source=raw[bc*3+math.floor(yy*bh/h)*bw+math.floor(xx*bw/w)+1]
pred=b[offset+source+1]
end
result[offset+y*w+x+1]=b[patch+y*w+x+1]~pred
end
end
return result
end
local function variantBytes(p)
local base=profiles[p[6]]
local donor=referenceBytes(base);local patch=inflate(p[4])
local w,h=p[1],p[2];local bw,bh=base[1],base[2]
local palette=p[3]*3;local offset=palette+base[3]+1
local source=base[3]*3;local align=p[7]
local out={}
for i=1,palette do out[i]=patch[i] end
local columns={}
local crop=p[9]~=nil
for x=0,w-1 do
if crop then columns[x]=math.floor((2*p[9]*w+(2*x+1)*p[11])*bw/(2*w*p[13]))
else columns[x]=math.floor((2*x+align)*bw/(2*w))end
end
for y=0,h-1 do
local row=source+math.floor((2*y+align)*bh/(2*h))*bw
if crop then row=source+math.floor((2*p[10]*h+(2*y+1)*p[12])*bh/(2*h*p[14]))*bw end
for x=0,w-1 do
local j=1+y*w+x
local expected=patch[palette+1+donor[row+columns[x]+1]]
local change=patch[offset+j]
if p[8]==1 then out[palette+j]=(expected+change)%256
else out[palette+j]=expected~change end
end
end
return out
end
local function spriteBytes(p)
if p[5]==-2 then return independentPixels(p)end
if p[7]~=nil then return variantBytes(p)end
if p[5]==0 then return motionBytes(p)end
if p[5] then return unpackPose(p)end
return inflate(p[4])
end

local riceZeros={[0]=8}
for i=1,255 do riceZeros[i]=(i&1)==1 and 0 or(riceZeros[i>>1]+1)end
local function restoreTreeColors(packed)
local prefix=packed[1]+256*packed[2]
local width=packed[3]
local out={}
for i=1,prefix do out[i]=packed[i+3] end
local at,word,bits=prefix+4,0,0
local function take(n)
while bits<n do
word=word|(packed[at]<<bits);bits=bits+8;at=at+1
end
local v=word&((1<<n)-1);word=word>>n;bits=bits-n
return v
end
for block=1,12288/width do
local k=take(3)
for j=1,width do
while bits<16 do word=word|((packed[at] or 0)<<bits);bits=bits+8;at=at+1 end
local q=riceZeros[word&255]
local v
if q==8 then v=(word>>8)&255;word=word>>16;bits=bits-16
else
v=(q<<k)|((word>>(q+1))&((1<<k)-1))
local used=q+1+k;word=word>>used;bits=bits-used
end
out[#out+1]=((v>>1)~(-(v&1)))&255
end
end
return out
end

-- Shared 12-bit rANS model. Only a context's first use allocates its lookup.
local function backgroundAnsReader(model)
 local groups={}
 local tables={}
 local states={}
 for symbol=0,255 do
  local n=math.min(symbol,256-symbol)
  states[symbol]=n<2 and 0 or n<8 and 1 or n<32 and 2 or 3
 end
 local function context(index)
  local group=index//4+1
  local packed=groups[group]
  if not packed then packed=inflate(model[group]);groups[group]=packed end
  local offset=(index%4)*512
  local f,s,parts={},{},{}
  local total=0
  for v=0,255 do
   local width=packed[offset+v*2+1]+256*packed[offset+v*2+2]
   f[v]=width;s[v]=total;total=total+width
   parts[v+1]=string.rep(string.char(v),width)
  end
  assert(total==4096)
  local t={f,s,table.concat(parts)}
  tables[index]=t
  return t
 end
 return function(bytes)
  local geometry=bytes[1]+256*bytes[2]
  local out={}
  for i=1,geometry do out[i]=bytes[i+2] end
  local pos=geometry+3
  local state=bytes[pos]|(bytes[pos+1]<<8)|(bytes[pos+2]<<16)|(bytes[pos+3]<<24)
  pos=pos+4
  for channel=0,2 do
   local last=0
   for column=1,4096 do
    local at=geometry+channel*4096+column
    local above=channel==0 and 0 or out[at-4096]
    local index=channel*16+states[last]*4+states[above]
    local t=tables[index] or context(index)
    local slot=state&4095
    local value=t[3]:byte(slot+1)
    out[at]=value;last=value
    state=t[1][value]*(state>>12)+slot-t[2][value]
    while state<8388608 do
     state=(state<<8)|bytes[pos];pos=pos+1
    end
   end
  end
  assert(pos==#bytes+1 and state==8388608)
  return out
 end,context
end

local ansDecoder
local ansContext
local function prepareAns()
 if not ansDecoder then ansDecoder,ansContext=backgroundAnsReader({"!JUqVg *Qpsy}w7bh9j{R SE(5S[2=bYWm/w!odjdw6 I3GTov1&R%P8grMdLSud>P3dkXCKS~op5d4;@3E:R4<+K?^cp_4W5ah-=KR-Td5:Sy1^t 2f:|rmxD;0t`D*b[N&M}=?C;^Iy6&)@XIfAf;mIY)3#K=@FouZ2lS+pR/RK*ew-tR=;1]`]J ","!JUqVhP<;XhYrQ;ncR@-?YQ /s=&ic29A9b#B;%x*`v-Bm=>$<NsV2/J]x1ZyLD/jOuSZ er(|a$CCEmWWlz=eXzuF3Mm+>p^#/f[1=]-)1B])h@1[t@KqxZii;5WSuwN<}f<9-PhUNCNtZkIOtpzMT1;}&hv~1RmhG$|6j8TV2T7v$Rr:^({^j]CGwABe2Eo4n$ ","!JUXoZ!J!WhXDIoKY1WtUA&W)` TSd(a?,1HGvP ~:[>JUepxPsf!38:R3oksad^HHFF^Ch@TH?ekE{}NZ]bB):r@sQXJ!8|V(JJk!b65N=j/nP&(n)6Wd&SmX;x(i>_Z=UnrqOZ|H{:y`Iq}]$%lM8gD6sjJ;mSkm@I3L(kSc[y>(}dm*bb8ft;)W?mjSF?ngH46Z[x8]douk*62_`!Y$u2uDbQ}=E04PqDI! ","!JUfWLQ(!e &<6$i[YnQ(M(c!EQ|})FUb9@5h(P{^yp+@2w-9x7fhydZ>9(!5[]d5-:c%`8(tO,F`Uvcss1bm5JY+{2>bKWO%;mI57)3(Z@A[A={yhZY=F1*HZ7eiRT,|o@@^rV$_?1`s<JwY^{o{Mg!a`}e^wnZa{/od#qEq4xuZUhsG/un[9|(4#?Jr,>lZXl!J?z60PnknXAc!CG#CKc*TU0psm^KYWvNBgm1dDswNjCzLRSWS=;Q}dZ  ","!1adb`0J! gzlu>t70,SYiLC(^*PsuaTzH  $b]9b?:oVqTf69!BKDCtdj0b yi2 *-qL_-}sw8ZN6MZvVT/DgPm&T_oqvw&>uvkfvldn9_V?RSFh(s!K)p}TF=| TRT[y{040WX!a?+iM5tu@Odq,)Sp4j [}2B^TW=g;@G=G]wm:qy}>A!~(zj*>r c9OVd11[ZF<GXC#e#d,J4nv!/<=kw,IHcIm*jtjxl$C:6D)yQ8j(FXvsx;{aNs8%xSd/%T4KUEgpK,&|#vRY]`BQXjq:$e9Oc$wWc;_}hC%?NTs;U<Gu0<b{S9w?dfc,ZJ4pC@X)A{Xl}zdF&{9zO_5i}ni){wBbPb_#FW7|07Vz9sExpYDWy#}mXqKqq})2WAG7KT(`F(38nLD~D#k5u)A&{+B&9@AlaqL1<55@0N+2hUs(KEch]c u||smJqdBa%#)2>+0Q=mot DbBvAL:7!A-E;?_|_*9LZtsFFwWwJK,(Z<A7T{V s4<&^JJU0c/sb<lufROEeiH5PPNBXq7{hN]<!N/Z^0`{MvnEE&_MxVzqvoL`Zl_AmJ@KvLzpFrng}NBh6O[3pWV&=|k j#S|S4FO0iZ-cs(&?VCp;_m%7%!]A*CqX$%|sIjg7JZL>wk#%}==6JzkU;J|;UH)K%Az6hi`iBelv W$f_tUT}xqg{ug;EFd=9xwj0A%<^F^YjcPm@H&apOK5D;(Uxo65SsPGVe%v}xGjCpRT$V>V]@e(1)1ij(7Yf?v(9wler[63j!H^NGfdjRh_lJVej}(X|[%^e=#}y1 tm{E>5`JeV^1c>P6q@Eg+ :93zq5Aecfl2KBdijkWgY<*CplJeldv<a[El;EafC0iKQ~>ZWzS-`lWZWo+^b8KJRyA<tRW)}fQun{F_0tH_2v<ao-eR=brKVdDCO! ","!Iatba^x:g,gWdlSLu6eGPD#@Xcc,*W2;W$V@&]P2p`n3O`%#f-8Ch9dhc@R+6<]84gn8@<3%lS4p#tHUWLu6 d2UZ8@UqC%u4Zqv{;3R~s_xC{1f(D}i@!L+oTvDidE5X7[/$kq!ASk!s#44 %446>E^bjg2euc%d)pX:S)[}2[XHzmA-ZWBLAfVJF-I9@Cqo8-P5s_,(/2`Vq*:O BhJ4[;YIT4U%yQAssxS{]|N>D@Q,?(&Qli6?d6[ZQRA#eR)Euy@LSW1hy3DvQ^gk [<CRy~kKikG;b/(Z#>E6l)xvWY7 Gl%3elqIE?fG85sIn}m>)e5?EkM7Lu>SoDI}pSEV;p>a)U?*be$i?8;a4864|ZmRfJ2K3[#B[:O/f,r(x{YUap{]?2p|@w^bv$/71[ 9P0te{ueB>*`p7mr<_}:D3{^,4F*x)@?=#l(t?q1y:a=I,lFL@?^&v1SM>|MQ]q:`vPlxK[5a6m/Akhrn+g}yfk2X5|nfFGdNl1,zoq@YFl,~?j]e?CG3omcDAgF/c/0*&GCx<):6mvd^I~pDpF#$ri[(N)FI#^8,9ruQs!Sn=Q$#y&K=!qoPj+M?wAxZ7=PkFOI,I^*bmFt#[TI5w81oO&lG>)8dJUmQo;o(=IcoKWOx)nT2wrGcmIWG?iRUS YcR `@o;Gf3~S`TdOAW^AvBLb<W/<>x:,kv(p(lU:Wj|mj[W|<RTNQKr@O@7K[rJVLS+w$c;]t,:?v)G@Hv~16fv>Dl]lxbI97AbUdPm({qn|$,Ev$#%{%Ev+|t=FFr]J40kTQy$DT3J/sp9G&K%[4&@x5ft=#7D}  ","!IaHyW0=;ps qWcLbbB)PR=?c!O |oR:=T_SQwZeX^5x,?2CkR5xJLdkH[AK9VO>GFu|)%%hmckSZlLBeEe9gGuKO4g)-rA#[MURN/3FTzg0E-p5aW:QUA:9B<AcFBRyJgn0sOy((S]l?uJGJ?75k+K6w`hPR/d``)&=k7Y*kIvXcKr~}jQS6-;OlEWa=CALVq(OKcX0#T[UYvH<2RbvFO3BU1NnQSjp81;]_HTE;ZGfC6q[*!qd*}rTJ3KK21xL&bvli#scx#e(wQck*=R3i(svYtP&jG{pwh,a!,:,snd#NP&HsOIUf/p%BxxUS^3}D-Xx@,`OOcNBM@>)lL=z]i$>lI,3wc y>)d^Ael#MI`nM7?NbUF37b2km6o+G+@A2}*BS9}CjRFQyk<=hR,5QupO0yC~uJUVNTMAARU<*%Cpsti?y0U^#y0p^mg{<d8n(<b8gGq{ZN3r>3Ch*-[ztL,L|^+js(o1Np2f+COaTEJ8x=Sk+xM=;/&vPiw:TEs~dvg`CCpCFMeGAPrcj4k^<85+f:L:@]s6U84glEOM$0*}KLR=Q%UMwPWskdLl$P=hN(l:*]Wj$hFW(ry9/}#O&|k$/oCX(^I2}]BJ98u3mf&_q+x%Tqq|Z~S`LMeGH:BAyoVT:Wq)npm*N>,Fu =R,Og4<6QLIi:GEN>YY7H-z>v-$O,?n}0QWpc<L&O8Cjy-$d,;w(}87F9,Y2p2vYK~YmNWt3z-R/Z<W6K4NXsmMb`YBm^$HZUTpjb_hx<josibxDh1I*JQeOQ 4*sF@HjVScefaxCLo6OfOd4/31uT_,WLvJ+jnlQSe0XYumy#9G?m,Mvr7ktrt(yxj5ygoAf5Ler  ","!T`tb>dyhqmjt9FU&cb69gj*itVu<|]1Q<Bf99D`=~2p,{}hD2c-K32n `*CthA`fotL<adYUqa$_kRnY:cZBn?~/mUbk<KBp+1_AHZ0X?FHpDo|l32MPtog):eP0,0QsU(qEUBBT&V$Bs1vgo/(k`xud+$k%:9YQQOry_)_jeC5,| }+`?eC[+]l[mh{o]upLLO;u4yvyb}pyB98,}aC*QB4llmgYl#7<r**/x#9k#~7 i2,|bokm;GO}-DYoRpc li^A(9nfXBG 3g)u45ZoCZN>$]!Jp_H82/Rf%wL*,EM*eh6^]~(?xgt>t~gHgjkJ*hz7b4EY&quqg%yVrT>>JFh]fAcQ(B0BRb^*) lgI^fEsBqLH_RP)khusE4FINqpw{@F2(!0Zs&~*;gX%Zktlr3l!ii7HBwJ}q*Bq3}z>e_BZ#sPzfg,V}ptoOwUAbr~Ms%eiEV/<GC$FO$kzYj[(jAB,fH1k|Cdf!c13kg@FzT<xiWQM_PtGd@~zKKTE!)n>t <R9&=zAtLaB}HxAF%61Ljqz$u>/q9K|JlZ]gUcNZE&MJN`?b~Zj^Cb0lPW%s+ASQ[0pEK01HUSM^E%{#E8Ym1oK5,wDKb=T`06Mt+JY+^JkLTz+$Fi3AzIt+NG=Z]ch5g[]=0yU4q|t_P{S`o]nI]:*5]MDkZmK+ 7#hwN&bX/;w$E6U?D{bN ti*zMqZpNv<yYt|_OF0|x?=>@TE4sXaL!e5xgMB0cyiO9efDzx`CF,]H_yy)`y-SD%hfJtL,ru#svfLEj;Iw+^%(x0?:@(w@^J|lecuE7`M_TKncL2~?p}dkZ&~cZHp=pThm,o4OBd3085[OxV8L-SVhtkWKxts([(ekbQeiuAFG}=7lSG8`)3o,>]:uDoxD]7/ejl=Q^|jdAz9|*YRO>uC=}Cfc|UD8]^QE6lCNM}! ","!ba3xC1KQps%u?wWK]=:X>3,7*T$7vA<4{$F(sR4g-B8m*==SA1r?*CE0dO~vY7?[QiwPWwOg026|5r&lYps,Oh@Rnk3G~7if*gl8XrEXTD69!3r,)&Bh2mF^Z1^!wU$30U*WeGj4^@zN zlat[]Ty/2AUX/kh2|Hcfj<t*]<X>,kKV@EYRWNg2q>!74|~x`j{fhikabvS#dKa0RP5cuyaW(:Hv7{Si_ vpQ=ca^ D$%y2zO]Y_6YH/X_q!3<32`kxL,+Riyyu<3O-$=hVE3B],$J6Jz($3<dGRm395-T3iQsLJidzYL>}il[H28^?^0:)`pfD@U22|Sm:bB?[-j@LjS@^:&V_YHHJ]K9!j{cajUyN3$:8h/V;8<;uwDt@-K&WsO0dZPlRpc=HL8&j*7i%bk|,#WY|,^82}jsLxxdSq9anHsiyC<AH4RtX{<<DeP]]6ag~JzK1#=9w`lu#aK}*TgXTc,{2fbsRLm^qM>LD]DvtYsuNFpNJIjG!XJGqd4l(:o1$0]t<+TY>amZeb<?7WobaK;>4c)Z|QPI_6v`0zH0?BLrDe9a*C|4uUPYoiD,0lt5ew4V=xvo]]HA0-5li9^*UKa=(^ c2SBr[_X^<R6gMC[M+2xqSi`yXQwraxOMbNm83g! ","!Qahla^kQXhZl!tkJb3;Ws2FIlI%^o&W<{Ba-e]l14LT@Xtt9l)%?V:|aD0#/C$@%mP|R?-yh@}D{urRU^s}Tg qUwy*jLS;ujzOuB9~c?F:lj#3uy6+UQBBXcbH5?Z/WH<6=$=+08+=Va?qqAz]5XNR*$l]LdOd>*w[HAwswkL}T&EuWtZ5GxozioY?_KxU(~>43XSnSW1j4D?3Br;IcP%#F4ZYAC>EWGuh=UL upkRTl{-DK|d7Ci-v&L+!]V*_j}MBq^;G8:kK*?P-%8el8n*8l4G|)5lT;L8MOmL(Z&tZ Xx;$V&A*pP<KUhO$LZ(&j$i(mD*#WVY85gh%ytN{,F2VT@Ajg&B*,8/g/t4L^X|`Bb7~e3BJA]sE(r)d5$hDq/x}6LR}}1-J9_*2d,8ypWC!1R:*9}]f3?0$@X=sZb0|D&Y<_T/yZN#(,0|(?*Tu4_t)i<q@0Uk3y6fW+>6I-<b^T$bpI>2Q/52xa}T!&~95XRnWveH(3P5Dps6Cm3oa+Td3k%;_Llx6SL11{2z}<~;<Myj1[EjXdqXu|=x9pwnXpBqiHy|%aYU`x`)#j06zq<%7N6t?9;{4%=Kn66)(8P=UWjO/KGFNH!2~`h8gIsoS4~i?:dV?U~=SAu2!JZ`_DOyac57!&*}4T|/G]|qp<y|?@xjIyhpy-Cu: ","!9aQn{/KQps`Lw}}H41K1@>-^C?$H*_^TDS/BmpT}t_Umpy`5+sri?8MMz05g,fCQ1_ATd=&?xZ$f[L0bB%<4gM%MieIZel>}sMSyci +xxBM;83RP4w!)SBh_mCvOWs!9@a[;t50m)*k?Bl6VkrIA@(;A;(/T(w]}W Vzl:gCbw*avj$U)&;A=;U0p1=2xmT9=7[#lTY}cOkZsS_=AMM3ElWh{4[[{52@Ti:Hf60,}UrLWyG]PU21Il?#]-so4;#O0`ZAoA+!R/FDqP>;*;C&8o+?4!)dPVh#s{x-fqAdK=(WQ6;xu6,]+ngD_m6xy1n&M=yD{7[Ttl[3&2h~t~F_)n$|5Td^oL4hr_J%zirs1}%7y3_IM>HTkDTU]Lmtr}A>8d@VKL!X)bx;31T1;|1xk}gJ<NLXPpjM|HL%*zsBStiIskx?{LVw%W#*xrseJ68Y,n>d*Y7hw]>[ jXzsxQ u*p}|T0ODyK=A[Z;Su:Zb~gI{?B<*Cx~a{tTX7@9O|K^:+/w|,suM_V`k<VvQ9,/coj!}2emj-cUC#:hvcU,TFwtj02~I{5%MZG+*VsJEBtE`QfGJAA7-rza%}dEVx-tNk_?AvvI5i?A@Z]7j6 ;c&[Ha!O[8bCEUCLyY?q7d-{vj9DPrH+#J|2Z7(sO;m[5Vg`<7j4rLqdGZcJ^ND/C0NaT5FANGh,dbdim]1v-6nPjul$Z;?QCQ2p`kqP>aA60b&wcb;Z`);A3}8cS5aA[K@a<= 2+D~upVMbJ(!T9n8$@l}r[Ic|P3lL<dL(+<maZMr%RqMx) ","!<`dbh0)!JASba= r-nb4b4G0e4&5@Ep&TQA(A-3$I!O#73JR|;*,]PW!E)l#^jKPl&@zYvu)5=(qobN3Bx;kN9[r,[9x8J&{=*x^3jz7$Zf;7^*`&&Maw>}g9;E[(>,Wo]Mc3s>SX7#MdG}U5b<Vmu8=U`vBnDJ^%>mm|<e<26b|%b8=tufgbl+jXKvpgyR7drTcXTW%dE^`FlQ]Oxhy*<I,Za@,OdJ_i(vOr)|TmRSNuAPkvi!Z+p+3anD@@H+>cSou#TnCFG+(j;Sqnc4UB;389!H$h/}+HM/xH;@$NzMYw:)hu,J2[|o 1{q7N%`?Cc8=#sO)]qiujVuj3F(e-e/eXq>8AfAfCfN*[&m3AzVW=R_]uT0aDe,YaP-gPa?d`CFT_gix{5&b1w;([,~XB$7UQ<=-mR^nX-?-ThYl~_ZGWZ#+E$kjf:E/zq<$UkJoafZT0L!mwd_-gymkM+bC78%Z@EzBWIVIV]U`qq`n_F*G^]b|,G)U}LX|w7eN(Jjy<qwvMI/g6rjZHSEfhqw&3_sKU[MT(aS`NW)kY`r:+9++}He#U?X7-eh!9q0h7ut(VkYk3ku9g!m}hgK9vfu8wM175teuF%g1yw<_fr:NCRA* `zo;NX`TO-5Du~-<^xJ2FZz;_2/abDjokiug5+H;8V=q>zxTkaau?jlNMX^0Xsj-F)OZ6_J9B@JyufkzY8dDrWhO6$ed{a14dC9QgBZdaj{@Koff8D6*AO9*JT)5+{j_K]$5>5<JAIRG%CCELg1x4r$*|F_&-*K]uJjJWl2bL4K80Wp]G07/|LT}UeAg{)ZA^d4Kh1AjIfHb)[D9Tt=~7PE:*#a*Oof57Myr1di/%mAa3t|6kD?$mVC]1|DA>/{Le+j_w8FEAPqaw,xBD=WNgn13ctX*REH{]F^9+(,)`qxs4hcHdL%6|vA%TnY-FFN8,_0X6V1+UydnIOoi2k093=zE;jtdUIi[I[tE%Mb>[qBE/mZp`kem?-!Zq;4sBS+E%^e4SP#]}rm}xcTNaU}Bu;=bD  "}) end
end
local function warmBackground(index)
 if index>=48 or (index<16 and index%4~=0) then return end
 prepareAns();ansContext(index)
end
local function profile(id)
if cache[id] then return cache[id] end
local p=profiles[id]
local bytes=p[3]=='treeRice' and inflate(p[4]) or spriteBytes(p)
if p[3]=='paintD'then
local mode=bytes[1]
local restored={}
local prefix=#bytes-1-144*7-1152*3
for i=1,prefix do restored[i]=bytes[i+1] end
local offset=prefix
local function unfilter(stride,count)
for c=1,stride do
local last=0
for row=0,count-1 do
local value=bytes[offset+2+(c-1)*count+row]
if mode>=2 then value=(value+last)%256;last=value end
restored[offset+row*stride+c]=value
end
end
if mode%2==1 then
for row=1,count do
local blue=offset+row*stride
local green=restored[blue-1]
restored[blue]=(restored[blue]+green)%256
restored[blue-2]=(restored[blue-2]+green)%256
end
end
offset=offset+stride*count
end
unfilter(3,1152);unfilter(7,144)
bytes=restored
end
if p[3]=='paint'or p[3]=='paintD'then
local count=1152
local nibble,extra,color=0,count+1,#bytes-144*7-count*3+1
local runs={}
local function visit(x,y,w,h)
local byte=bytes[math.floor(nibble/2)+1]
local tag=nibble%2==0 and math.floor(byte/16)or byte%16
nibble=nibble+1
if tag==0 then
runs[#runs+1]={x,y,w,h,string.format('#%02x%02x%02x',bytes[color],bytes[color+1],bytes[color+2])}
color=color+3;return
end
local horizontal=tag<=3 or tag==7
local size=horizontal and w or h
local cut
if tag>=7 then cut=bytes[extra];extra=extra+1
else cut=math.floor(size*((tag-1)%3+1)/4)end
if horizontal then visit(x,y,cut,h);visit(x+cut,y,w-cut,h)
else visit(x,y,w,cut);visit(x,y+cut,w,h-cut)end
end
visit(0,0,p[1],p[2]);assert(#runs==count and color==#bytes-144*7+1)
for i=color,#bytes,7 do
runs[#runs+1]={bytes[i],bytes[i+1],bytes[i+2]+1,bytes[i+3]+1,string.format('#%02x%02x%02x',bytes[i+4],bytes[i+5],bytes[i+6])}
end
local obj={width=p[1],height=p[2],runs=runs};cache[id]=obj;return obj
end
if p[3]=='treeRice' or p[3]=='treeBits' or p[3]=='treeAns' then
 if p[3]=='treeAns' then prepareAns();bytes=ansDecoder(bytes) end
if p[3]=='treeRice'then bytes=restoreTreeColors(bytes)end
local runs={}
local mode=p[5]
local previous=mode and {} or nil
local function position(x,y,w,h)
 if mode=='row' then return y end
 if mode=='column' then return x end
 if mode=='shape' then return w*1024+h end
 local shift=mode=='tile32' and 5 or 6
 return ((x>>shift)<<6)+(y>>shift)
end
local readSplit=treeBitReader(bytes)
local colorStart=#bytes-3*4096+1
local red,green,blue=0,0,0
local function visit(x,y,w,h)
local code=readSplit(w,h)
if code==0 then
local i=colorStart+#runs
local k
if previous then
 k=position(x,y,w,h)
 local packed=previous[k]
 if packed then red=packed>>16;green=(packed>>8)&255;blue=packed&255 end
end
red=(red+bytes[i])%256
green=(green+bytes[i+4096])%256
blue=(blue+bytes[i+8192])%256
if previous then previous[k]=(red<<16)|(green<<8)|blue end
runs[#runs+1]={x,y,w,h,string.format('#%02x%02x%02x',(red+green)%256,green,(blue+green)%256)}
return
end
local cut=math.floor(code/2)
if code%2==0 then
visit(x,y,cut,h);visit(x+cut,y,w-cut,h)
else
visit(x,y,w,cut);visit(x,y+cut,w,h-cut)
end
end
visit(0,0,p[1],p[2])
assert(#runs==4096)
local obj={width=p[1],height=p[2],runs=runs};cache[id]=obj;return obj
end
if p[3]=='rect16'then
local runs={}
for i=1,#bytes,11 do
runs[#runs+1]={bytes[i]+256*bytes[i+1],bytes[i+2]+256*bytes[i+3],
bytes[i+4]+256*bytes[i+5],bytes[i+6]+256*bytes[i+7],
string.format('#%02x%02x%02x',bytes[i+8],bytes[i+9],bytes[i+10])}
end
local obj={width=p[1],height=p[2],runs=runs};cache[id]=obj;return obj
end
if p[3]=='rect'then
local runs={}
for i=1,#bytes,7 do
runs[#runs+1]={bytes[i],bytes[i+1],bytes[i+2]+1,bytes[i+3]+1,string.format('#%02x%02x%02x',bytes[i+4],bytes[i+5],bytes[i+6])}
end
local obj={width=p[1],height=p[2],runs=runs};cache[id]=obj;return obj
end
if type(p[3])=='number'then
local count=p[3];local palette={}
for i=1,count do
local j=(i-1)*3+1
palette[i]=string.format('#%02x%02x%02x',bytes[j],bytes[j+1],bytes[j+2])
end
p={p[1],p[2],palette}
local offset=count*3
local pixels={}
for i=offset+1,#bytes do pixels[i-offset]=bytes[i] end
bytes=pixels
end
assert(#bytes==p[1]*p[2],'atlas pixel count')
local runs={}
local previous={}
for y=0,p[2]-1 do
local x=0;local current={}
while x<p[1] do
local c=bytes[y*p[1]+x+1];local start=x;x=x+1
while x<p[1] and bytes[y*p[1]+x+1]==c do x=x+1 end
if c>0 then
local mark=start+65536*(x-start)+4294967296*c
local box=previous[mark]
if box then box[4]=box[4]+1 else box={start,y,x-start,1,p[3][c]};runs[#runs+1]=box end
current[mark]=box
end
end
previous=current
end
local obj={width=p[1],height=p[2],runs=runs};cache[id]=obj;return obj
end
local function makeArt(meta,ids)
meta.profiles=setmetatable({},{__index=function(t,k)
if ids[k] then return profile(ids[k])end
end})
return meta
end

local function readTable(encoded)
local b=inflate(encoded);local i=1;local strings={}
local function number()
local v,w=0,1
while true do local n=b[i];i=i+1;v=v+(n%128)*w;if n<128 then return v end;w=w*128 end
end
local function readString(n)
local parts={}
for j=i,i+n-1,128 do parts[#parts+1]=string.char(table.unpack(b,j,math.min(j+127,i+n-1)))end
i=i+n;return join(parts)
end
local layouts={}
local function parse()
local tag=b[i];i=i+1
if tag==0 then return nil elseif tag==1 then return false elseif tag==2 then return true end
local n=number()
if tag==14 or tag==15 then
local parent=strings;strings={}
local previous=''
for j=1,n do
if tag==14 then
local prefix=number();local suffix=number()
previous=previous:sub(1,prefix)..readString(suffix);strings[j]=previous
else strings[j]=readString(number())end
end
local value=parse();strings=parent;return value
end
if tag==16 then
local parts={}
for j=1,n do parts[j]=strings[number()+1] end
return join(parts)
end
if tag==18 then
for j=1,n do
local keys={}
for k=1,number()do keys[k]=parse()end
layouts[j]=keys
end
return parse()
end
if tag==19 then
local obj={}
for _,key in ipairs(layouts[n])do obj[key]=parse()end
return obj
end
if tag==17 then
local fields={}
for j=1,n do
local key=parse();local parent=strings;strings={}
fields[key]=parse();strings=parent
end
return fields
end
if tag==8 then return strings[n] end
if tag==9 then local str=readString(n);strings[#strings+1]=str;return str end
if tag==12 or tag==13 then
local keys,rows={},{}
for j=1,n do keys[j]=tag==12 and j or parse();rows[keys[j]]={}end
local fields=number()
for col=1,fields do
local key=parse()
for j=1,n do rows[keys[j]][key]=parse()end
end
return rows
end
if tag==3 then
local magnitude=math.floor(n/2)
return n%2==0 and magnitude or -magnitude-1
end
if tag==8 then return strings[n] end
if tag==4 or tag==5 or tag==9 then
local parts={}
for j=i,i+n-1,160 do parts[#parts+1]=string.char(table.unpack(b,j,math.min(j+159,i+n-1)))end
i=i+n;local s=join(parts);if tag==9 then strings[#strings+1]=s;return s end;return tag==4 and s or tonumber(s)
end
local t={}
if tag==6 then for j=1,n do t[j]=parse()end
else assert(tag==7);for j=1,n do local k=parse();t[k]=parse()end end
return t
end
return parse()
end

local function unweave(v)
 v=v&0x55555
 v=(v|(v>>1))&0x33333333
 v=(v|(v>>2))&0x0f0f0f0f
 v=(v|(v>>4))&0x00ff00ff
 return (v|(v>>8))&511
end
local function expandScenery(base,bytes)
 local header=#bytes%7
 assert(header<=1)
 local mode=header==1 and bytes[1] or 0
 local n=#bytes//7
 assert(n<=2048)
 local sizes={1,2,3,4,6,8,12,16,24,32}
 local runs={}
 for i,r in ipairs(base.runs) do runs[i]=r end
 local pos,pr,pg,pb=0,0,0,0
 for i=1,n do
  local j=i+header
  if (i-1)%256==0 then pos=0 end
  pos=pos+bytes[j]+256*bytes[j+n]+65536*bytes[j+2*n]
  local x,y=pos%512,pos//512
  if mode%4==1 then x,y=y,x elseif mode%4==2 then
   x,y=unweave(pos),unweave(pos>>1)
  end
  local shape=bytes[j+3*n]
  local r,g,b=bytes[j+4*n],bytes[j+5*n],bytes[j+6*n]
  if mode>=8 then r,g,b=(r+pr)%256,(g+pg)%256,(b+pb)%256;pr,pg,pb=r,g,b end
  if (mode&4)~=0 then r,b=(r+g)%256,(b+g)%256 end
  runs[#runs+1]={x,y,sizes[1+shape%16],sizes[1+shape//16],string.format('#%02x%02x%02x',r,g,b)}
 end
 return {runs=runs,width=base.width,height=base.height}
end
local sceneryCounts={["aeonblight-field-background-v1.png"]=512,["andrius-weekly-background-v1.png"]=512,["array-field-background-v1.png"]=512,["asimon-field-background-v1.png"]=512,["aurora-glass-background-v1.png"]=1024,["baptist-field-background-v1.png"]=512,["bathysmal-field-background-v1.png"]=512,["battleship-field-background-v1.png"]=512,["beidou-stygian-deck-background-v1.png"]=512,["buried-weaving-background-v1.png"]=512,["bygone-background-v1.png"]=512,["bygone-resonance-background-v1.png"]=512,["capitano-court-background-v1.png"]=512,["chasm-background-v1.png"]=512,["chenyu-background-v1.png"]=1024,["cloth-service-walk-background-v1.png"]=512,["coastal-lookout-background-v1.png"]=1024,["config-device-field-background-v1.png"]=512,["cryo-hypostasis-field-background-v1.png"]=512,["cryo-regisvine-field-background-v1.png"]=512,["dawn-glass-background-v1.png"]=1024,["dendro-hypostasis-field-background-v1.png"]=512,["dornman-background-v1.png"]=1024,["dragonspine-background-v1.png"]=1024,["drifting-snow-field-background-v1.png"]=512,["dvalin-weekly-background-v1.png"]=512,["electro-hypostasis-field-background-v1.png"]=512,["electro-regisvine-field-background-v1.png"]=512,["emperor-field-background-v1.png"]=512,["enkan-lamp-chamber-background-v1.png"]=512,["enkan-lamp-chamber-dark-v1.png"]=512,["enkanomiya-background-v1.png"]=512,["fallen-vigil-field-background-v1.png"]=512,["false-moon-court-background-v1.png"]=512,["false-moon-rift-background-v1.png"]=512,["farka-dual-court-background-v1.png"]=512,["field-generator-field-background-v1.png"]=512,["flugel-field-background-v1.png"]=512,["fon-freminet-dive-shallows-background-v1.png"]=512,["fon-lyney-magic-seats-background-v1.png"]=512,["fon-lyney-magic-wings-background-v1.png"]=1024,["fontaine-backstage-background-v1.png"]=1024,["fontaine-grand-stage-background-v1.png"]=1024,["fontaine-rehearsal-background-v1.png"]=1024,["frostnight-herra-field-background-v1.png"]=512,["gate-court-background-v1.png"]=512,["geo-hypostasis-field-background-v1.png"]=1024,["golden-background-v1.png"]=512,["golden-dock-background-v1.png"]=1024,["golden-grotto-background-v1.png"]=512,["heretic-lattice-background-v1.png"]=512,["hydro-hypostasis-field-background-v1.png"]=512,["icewind-field-background-v1.png"]=1024,["immortal-construct-field-background-v1.png"]=512,["ina-fireworks-beach-background-v1.png"]=512,["ina-fireworks-lookouts-background-v1.png"]=512,["ina-sayu-route-background-v1.png"]=1024,["ina-tea-case-landing-background-v1.png"]=512,["inazuma-background-v1.png"]=1024,["inazuma-sea-cave-background-v1.png"]=512,["inazuma-shiomi-cape-background-v1.png"]=512,["inazuma-torii-forest-background-v1.png"]=512,["knuckle-duckle-field-background-v1.png"]=1024,["lava-dragon-field-background-v1.png"]=512,["legatus-field-background-v1.png"]=512,["maguu-field-background-v1.png"]=512,["mond-night-banner-background-v1.png"]=512,["mond-windsplit-cave-background-v1.png"]=512,["moonfly-field-background-v1.png"]=512,["moongecko-field-background-v1.png"]=512,["narwhal-inner-background-v1.png"]=512,["nat-iansan-training-course-background-v1.png"]=1024,["nat-kinich-ambush-trail-background-v1.png"]=1024,["nat-xilonen-course-course-background-v1.png"]=512,["nod-appraisal-workshop-background-v1.png"]=1024,["nod-far-sea-background-v1.png"]=512,["nod-lantern-patrol-cabin-background-v1.png"]=512,["nod-lantern-patrol-coast-background-v1.png"]=512,["nod-moon-bloom-background-v1.png"]=512,["nod-moon-cave-background-v1.png"]=512,["nod-moon-shallows-background-v1.png"]=512,["nod-moon-vault-background-v1.png"]=512,["nod-night-stalls-background-v1.png"]=512,["nodkrai-background-v1.png"]=512,["nodspecial-background-v1.png"]=512,["novokichev-background-v1.png"]=512,["oceanid-field-background-v1.png"]=512,["ochka-cliff-background-v1.png"]=1024,["ochka-kiln-background-v1.png"]=1024,["ochkanatlan-background-v1.png"]=512,["overseer-field-background-v1.png"]=512,["paper-valley-background-v1.png"]=512,["papilla-field-background-v1.png"]=512,["primo-geovishap-field-background-v1.png"]=512,["pyro-hypostasis-field-background-v1.png"]=512,["pyro-regisvine-field-background-v1.png"]=512,["qucusaur-field-background-v1.png"]=512,["ruin-serpent-field-background-v1.png"]=512,["seahorse-field-background-v1.png"]=512,["simulanka-background-v1.png"]=512,["sne-snow-match-background-v1.png"]=1024,["sne-survey-ridge-background-v1.png"]=512,["sne-survey-shed-background-v1.png"]=512,["snezhnaya-background-v1.png"]=512,["snow-rail-transfer-background-v1.png"]=512,["spine-ridge-background-v1.png"]=1024,["spiritspeaker-field-background-v1.png"]=512,["steam-stabling-depot-background-v1.png"]=1024,["suanni-field-background-v1.png"]=512,["sum-wanderer-sign-hollow-background-v1.png"]=1024,["sumeru-desert-tomb-approach-background-v1.png"]=512,["threadline-relay-background-v1.png"]=512,["thunder-field-background-v1.png"]=512,["tide-calibration-background-v1.png"]=512,["tulpa-field-background-v1.png"]=512,["tunigi-background-v1.png"]=512,["tunigi-excavation-background-v1.png"]=512,["veluriyam-background-v1.png"]=512,["voyage-background-v1.png"]=512,["wanderer-windcourt-background-v1.png"]=512,["wavebinder-field-background-v1.png"]=512,["wenut-field-background-v1.png"]=512,["whisperer-nightmares-field-background-v1.png"]=512,["white-pass-coach-background-v1.png"]=1024,["white-pass-wood-background-v1.png"]=1024,["white-rainbow-background-v1.png"]=512,["windward-works-background-v1.png"]=1024,["wingspan-background-v1.png"]=512,["wolflord-field-background-v1.png"]=512,["xbalanque-court-background-v1.png"]=512,["yumka-field-background-v1.png"]=512}
local scenerySplits={}
local latestScenery,latestExpanded
local function refinedScenery(file,base)
 if file~=latestScenery then
  latestExpanded=expandScenery(base,inflate(scenerySplits[file]))
  latestScenery=file
 end
 return latestExpanded
end
return function(ctx)ctx.sceneryCounts=sceneryCounts;ctx.scenerySplits=scenerySplits;ctx.refinedScenery=refinedScenery;ctx.warmBackground=warmBackground;ctx.profiles=profiles;ctx.art=art;ctx.profile=profile;ctx.makeArt=makeArt;ctx.readTable=readTable end