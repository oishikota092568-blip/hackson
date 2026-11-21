const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const W=cv.width,H=cv.height,GROUND=H-50,PPM=60,K=.45,BS=200,R=BS*K/2,RM=R/PPM,G=9.8;
const $=id=>document.getElementById(id);
let img=null,bunny=false,spr=null,face={x:.5,y:.45,w:.45},best=0,run=null,raf=0,zoom=1,camX=0;
let P=null,parts=[],trail=[],bm=1,earLen=.6,curBg=null,earAng=.157,earSets=[],earMode='std',curRand=null,setN=0,ox=60,curEvt=null;
const SCALE=Math.sqrt(300); // 飛距離は初速の2乗に比例 → 300倍
const fmtS=m=>{const a=Math.abs(m),g=m<0?'-':'';return g+(a>=1000?(a/1000).toFixed(2)+' km':a.toFixed(1)+' m')};
const fmt=m=>{const a=Math.abs(m),g=m<0?'-':'';return g+(a>=1000?(a/1000).toFixed(2)+' km ('+Math.round(a).toLocaleString()+' m)':a.toFixed(1)+' m')};
const nice=v=>{const p=Math.pow(10,Math.floor(Math.log10(v))),f=v/p;return (f<=1?1:f<=2?2:f<=5?5:10)*p};

// 画像の縁の色を背景とみなし、縁からつながる近い色を透明にする(外部AI不使用)
function cutout(src,sx,sy,sw,sh,ow,oh,tol){
  const c=document.createElement('canvas');c.width=ow;c.height=oh;
  const x=c.getContext('2d',{willReadFrequently:true});
  x.drawImage(src,sx,sy,sw,sh,0,0,ow,oh);
  const d=x.getImageData(0,0,ow,oh),p=d.data,cnt={},bi=[];
  for(let i=0;i<ow;i++)bi.push(i,(oh-1)*ow+i);
  for(let j=0;j<oh;j++)bi.push(j*ow,j*ow+ow-1);
  bi.forEach(i=>{const o=i*4;if(p[o+3]<16)return;const k=(p[o]>>5)<<6|(p[o+1]>>5)<<3|(p[o+2]>>5);(cnt[k]=cnt[k]||[]).push(i)});
  let top=null;for(const k in cnt)if(!top||cnt[k].length>top.length)top=cnt[k];
  let br=0,bg=0,bb=0;
  if(top){top.forEach(i=>{br+=p[i*4];bg+=p[i*4+1];bb+=p[i*4+2]});br/=top.length;bg/=top.length;bb/=top.length}
  const t2=tol*tol,mask=new Uint8Array(ow*oh);
  const ok=i=>{const o=i*4;if(p[o+3]<16)return true;if(!top)return false;
    const a=p[o]-br,b=p[o+1]-bg,e=p[o+2]-bb;return a*a+b*b+e*e<=t2};
  const st=[];
  bi.forEach(i=>{if(!mask[i]&&ok(i)){mask[i]=1;st.push(i)}});
  while(st.length){const i=st.pop(),x0=i%ow,y0=(i/ow)|0;
    [[x0-1,y0],[x0+1,y0],[x0,y0-1],[x0,y0+1]].forEach(([a,b])=>{
      if(a<0||b<0||a>=ow||b>=oh)return;const j=b*ow+a;if(!mask[j]&&ok(j)){mask[j]=1;st.push(j)}})}
  for(let i=0;i<ow*oh;i++){
    if(mask[i]){p[i*4+3]=0;continue}
    const x0=i%ow,y0=(i/ow)|0;
    if((x0>0&&mask[i-1])||(x0<ow-1&&mask[i+1])||(y0>0&&mask[i-ow])||(y0<oh-1&&mask[i+ow]))p[i*4+3]*=.55;
  }
  x.putImageData(d,0,0);return c;
}
function procEar(src){
  if(!src)return null;
  const oh=Math.min(200,src.height),ow=Math.max(1,Math.round(src.width*oh/src.height));
  if($('ecut').checked)return cutout(src,0,0,src.width,src.height,ow,oh,+$('tol').value);
  const c=document.createElement('canvas');c.width=ow;c.height=oh;c.getContext('2d').drawImage(src,0,0,ow,oh);return c;
}
function buildSet(st){st.L=procEar(st.sL);st.R=procEar(st.sR)}
function effSet(){return earMode==='std'?null:earMode==='rand'?curRand:(earSets[earMode]||null)}
function rollRand(){curRand=earSets.length?earSets[Math.floor(Math.random()*earSets.length)]:null}
function buildSprite(){
  const s=document.createElement('canvas');s.width=s.height=300;
  const g=s.getContext('2d'),bx=50,by=50,m=Math.min(img.width,img.height);
  const sx=(img.width-m)/2,sy=(img.height-m)/2;
  if(bunny){ // しっぽ
    g.fillStyle='#fff';g.strokeStyle='#ead0da';g.lineWidth=3;
    g.beginPath();g.arc(bx+4,by+BS-30,30,0,7);g.fill();g.stroke();
  }
  if($('cut').checked){
    g.drawImage(cutout(img,sx,sy,m,m,BS,BS,+$('tol').value),bx,by);
  }else{
    g.save();g.beginPath();g.roundRect(bx,by,BS,BS,28);g.clip();
    g.drawImage(img,sx,sy,m,m,bx,by,BS,BS);
    if(bunny){g.fillStyle='rgba(255,240,248,.18)';g.fillRect(bx,by,BS,BS)}
    g.restore();
    g.lineWidth=5;g.strokeStyle='#fff';g.beginPath();g.roundRect(bx,by,BS,BS,28);g.stroke();
  }
  if(bunny){
    const cx=bx+face.x*BS,cy=by+face.y*BS,u=face.w*BS;
    // ほっぺのふわ毛
    g.fillStyle='rgba(255,255,255,.9)';
    [-1,1].forEach(d=>{[0,.1].forEach((o,i)=>{g.beginPath();g.arc(cx+d*(.5-o)*u,cy+(.2+i*.12)*u,.13*u,0,7);g.fill()})});
    // ほっぺ(チーク)
    g.fillStyle='rgba(255,120,160,.45)';
    [-1,1].forEach(d=>{g.beginPath();g.ellipse(cx+d*.36*u,cy+.12*u,.11*u,.07*u,0,0,7);g.fill()});
    // ひげ
    g.strokeStyle='rgba(60,40,50,.85)';g.lineWidth=2;g.lineCap='round';
    [-1,1].forEach(d=>{[-.07,.02,.11].forEach((dy,i)=>{
      g.beginPath();g.moveTo(cx+d*.14*u,cy+.13*u+dy*u*.4);
      g.lineTo(cx+d*.62*u,cy+.1*u+dy*u+ (i-1)*.04*u);g.stroke()})});
    // 口・前歯
    g.strokeStyle='#8a4b63';g.lineWidth=2.5;
    g.beginPath();g.moveTo(cx,cy+.14*u);g.lineTo(cx,cy+.2*u);
    g.moveTo(cx,cy+.2*u);g.quadraticCurveTo(cx-.1*u,cy+.27*u,cx-.17*u,cy+.2*u);
    g.moveTo(cx,cy+.2*u);g.quadraticCurveTo(cx+.1*u,cy+.27*u,cx+.17*u,cy+.2*u);g.stroke();
    g.fillStyle='#fff';g.strokeStyle='#cfa9b8';g.lineWidth=1.5;
    g.beginPath();g.roundRect(cx-.07*u,cy+.22*u,.065*u,.1*u,3);g.fill();g.stroke();
    g.beginPath();g.roundRect(cx+.005*u,cy+.22*u,.065*u,.1*u,3);g.fill();g.stroke();
    // 鼻
    g.fillStyle='#ff7fa8';g.beginPath();
    g.moveTo(cx-.07*u,cy+.09*u);g.quadraticCurveTo(cx,cy+.06*u,cx+.07*u,cy+.09*u);
    g.quadraticCurveTo(cx+.04*u,cy+.16*u,cx,cy+.16*u);g.quadraticCurveTo(cx-.04*u,cy+.16*u,cx-.07*u,cy+.09*u);g.fill();
  }
  spr=s;
}
// 原点=箱の中心。耳は毎フレーム動かす
function drawEars(c,vx,vy){
  if(!bunny)return;
  const set=effSet(),u=face.w*BS,L=BS*earLen;
  const back=-Math.min(.75,Math.max(0,vx*.045)),spread=Math.max(-.2,Math.min(.35,-vy*.025));
  [-1,1].forEach(d=>{
    const ex=(face.x-.5)*BS+d*.2*u,ey=(face.y-.5)*BS-.55*u;
    c.save();c.translate(ex,ey);
    c.rotate(d*(earAng+spread)+back+(d>0?.08:0)*back);
    let im=set?(d<0?set.L:set.R):null,fl=false;
    if(set&&!im){im=d<0?set.R:set.L;fl=true} // 片耳のみ登録時は反転して使う
    if(im){
      const w=Math.min(BS*.6,L*im.width/im.height);
      if(fl)c.scale(-1,1);
      c.drawImage(im,-w/2,-L,w,L);
    }else{
      c.fillStyle='#fff';c.strokeStyle='#e3a3bd';c.lineWidth=4;
      c.beginPath();c.ellipse(0,-L/2,.1*BS*.8,L/2,0,0,7);c.fill();c.stroke();
      c.fillStyle='#ffb8d1';c.beginPath();c.ellipse(0,-L/2+4,.055*BS*.8,L/2-12,0,0,7);c.fill();
    }
    c.restore();
  });
}
function drawBody(cxp,cyp,rot,sx,sy,vx,vy,dir){
  if(!spr)return;
  ctx.save();ctx.translate(cxp,cyp);ctx.scale(sx,sy);ctx.rotate(rot);ctx.scale((dir||1)*K*bm,K*bm);
  ctx.drawImage(spr,-150,-150);drawEars(ctx,Math.abs(vx),vy);ctx.restore();
}
const STOPS=[
 {d:0,t:[191,232,251],b:[234,248,255],g:[127,207,122],s:0,n:'草原'},
 {d:100,t:[255,160,110],b:[255,214,160],g:[110,170,90],s:0,n:'夕焼け'},
 {d:500,t:[20,24,60],b:[60,50,110],g:[45,70,60],s:.8,n:'夜'},
 {d:2000,t:[5,5,25],b:[40,20,70],g:[90,90,110],s:1,n:'宇宙'},
 {d:6000,t:[0,0,10],b:[20,10,40],g:[170,170,180],s:1,n:'月面'},
 {d:12000,t:[40,10,80],b:[255,100,170],g:[200,160,220],s:.6,n:'ファンタジー'}];
const STARS=Array.from({length:70},()=>({x:Math.random()*W,y:Math.random()*GROUND*.9,r:.6+Math.random()*1.4}));
const mix=(a,b,f)=>a.map((v,i)=>v+(b[i]-v)*f),rgb=c=>'rgb('+c.map(Math.round).join()+')';
function bgAt(d){
  let i=0;while(i<STOPS.length-1&&d>=STOPS[i+1].d)i++;
  const a=STOPS[i],b=STOPS[Math.min(i+1,STOPS.length-1)];
  let f=b===a?0:(d-a.d)/(b.d-a.d);f=f*f*(3-2*f);
  return{t:mix(a.t,b.t,f),b:mix(a.b,b.b,f),g:mix(a.g,b.g,f),s:a.s+(b.s-a.s)*f,n:f>.5?b.n:a.n};
}
function sky(d){
  const c=curBg=bgAt(d);
  const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,rgb(c.t));g.addColorStop(1,rgb(c.b));
  ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  if(c.s>0){ctx.fillStyle='rgba(255,255,255,'+c.s+')';STARS.forEach(t=>{ctx.beginPath();ctx.arc(t.x,t.y,t.r,0,7);ctx.fill()})}
  if(c.s<1){ // 雲(ゆっくり流れる)
    ctx.fillStyle='rgba(255,255,255,'+(.8*(1-c.s))+')';
    for(let i=0;i<5;i++){
      const cx=(((i*190-(P?P.x*PPM*zoom:0)*.08)%(W+120))+W+120)%(W+120)-60,cy=40+(i*47)%120;
      [[0,0,26],[24,6,20],[-24,8,18]].forEach(([dx,dy,r])=>{ctx.beginPath();ctx.arc(cx+dx,cy+dy,r,0,7);ctx.fill()});
    }
  }
  ctx.fillStyle=rgb(c.g);ctx.fillRect(0,GROUND,W,H-GROUND);
}
function scene(){
  ctx.save();ctx.translate(ox,GROUND);ctx.scale(zoom,zoom);ctx.translate(-camX,0);
  const stepM=Math.max(5,nice(110/(PPM*zoom))),xL=(camX-ox/zoom)/PPM-stepM,xEnd=(camX+(W-ox)/zoom)/PPM+stepM;
  ctx.fillStyle=curBg.s>.5?'rgba(255,255,255,.9)':'#2f6b2c';ctx.font=(13/zoom)+'px system-ui';ctx.textAlign='center';
  const back=P&&P.dir<0;
  for(let m=Math.floor(xL/stepM)*stepM;m<=xEnd;m+=stepM){
    if((m<0&&!back)||(m>0&&back))continue;
    const ab=Math.abs(m),lb=(m<0?'-':'')+(ab>=1000?(ab/1000)+'km':ab+'m');
    ctx.fillRect(m*PPM-1/zoom,0,2/zoom,12/zoom);ctx.fillText(lb,m*PPM,28/zoom);
  }
  ctx.fillStyle='rgba(255,111,165,.5)';
  trail.forEach(t=>{ctx.beginPath();ctx.arc(t.x*PPM,-t.y*PPM,3/zoom+1,0,7);ctx.fill()});
  const q=P||{x:0,y:RM,rot:0,sq:0,vx:0,vy:0,st:0,dir:1};
  const h=Math.max(0,q.y-RM);
  ctx.fillStyle='rgba(0,0,0,'+(.28/(1+h*.5))+')';
  ctx.beginPath();ctx.ellipse(q.x*PPM,3*bm,R*bm*.9/(1+Math.min(h,50)*.02),6*bm,0,0,7);ctx.fill();
  parts.forEach(p=>{ctx.fillStyle='rgba(255,255,255,'+Math.max(0,p.l)+')';ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,7);ctx.fill()});
  if(curEvt&&curEvt.def.draw)curEvt.def.draw(ctx,curEvt.es);
  const sx=Math.max(.7,Math.min(1.3,1+q.sq*.5-q.st*.5)),sy=Math.max(.7,Math.min(1.3,1-q.sq*.5+q.st));
  drawBody(q.x*PPM,-q.y*PPM+R*(1-sy)-R*(bm-1),q.rot,sx,sy,q.vx,q.vy,q.dir);
  ctx.restore();
}
// ===== イベント機構 =====
// 新しいイベントは EVENTS に追加するだけ。
//  id/icon/name/weight : 識別・表示・出現の重み
//  onStart(run) : ジャンプ開始時に呼ばれる。run.dir(-1で後ろ向き)など発射条件を変更でき、状態オブジェクトを返す
//  tick(es,dt,P) : 毎フレーム呼ばれる(任意)
//  draw(ctx,es)  : ワールド座標で装飾を描く(任意)
//  result(d,es)  : 結果表示の文言
const EVENT_RATE=.4;
function popScale(t){const p=Math.min(1,t/.4);return p<1?1+2.7*Math.pow(p-1,3)+1.7*Math.pow(p-1,2):1}
function drawCarrot(c,x,sc){
  c.save();c.translate(x*PPM,0);c.scale(sc*bm,sc*bm);
  c.fillStyle='#4caf50';
  [-.5,0,.5].forEach(a=>{c.save();c.translate(0,-62);c.rotate(a);c.beginPath();c.ellipse(0,-16,6,18,0,0,7);c.fill();c.restore()});
  c.fillStyle='#ff8a1f';c.beginPath();c.moveTo(-16,-62);c.lineTo(16,-62);c.quadraticCurveTo(14,-22,0,0);c.quadraticCurveTo(-14,-22,-16,-62);c.fill();
  c.strokeStyle='#d96a0b';c.lineWidth=2.5;
  [-48,-36,-24].forEach(y=>{c.beginPath();c.moveTo(-9,y);c.lineTo(-3,y);c.stroke()});
  c.restore();
}
const EVENTS=[
 {id:'carrot',icon:'🥕',name:'にんじん出現！',weight:1,
  onStart(run){run.dir=-1;return{x:predict(run.v0,run.ang,-1),t:0,eaten:false}}, // 後ろ向きに跳び、距離が−値になる
  tick(es,dt,P){es.t+=dt;if(!es.eaten&&Math.abs(P.x-es.x)<1.2)es.eaten=true},
  draw(c,es){if(!es.eaten)drawCarrot(c,es.x,.55*popScale(es.t))},
  result(d){return '🥕 にんじんに釣られて '+fmt(d)+' 後ろへ跳んだ！'}}
];
function pickEvent(){
  let r=Math.random()*EVENTS.reduce((a,e)=>a+e.weight,0);
  for(const e of EVENTS){r-=e.weight;if(r<=0)return e}return EVENTS[0];
}
// 着地点を事前計算(物理を同じ式で先に回す)
function predict(v0,ang,dir){
  const sP=P,sr=run,sp=parts;
  P={x:0,y:RM,vx:v0*Math.cos(ang)*dir,vy:v0*Math.sin(ang),rot:0,om:0,sq:0,sqv:0,st:0,rolling:false,dir};
  run={phase:'fly',t:1,v0,ang,dir};parts=[];
  for(let i=0;i<60000&&run.phase!=='done';i++)physics(1/120);
  const x=P.x;P=sP;run=sr;parts=sp;return x;
}
function frame(){
  sky(P?Math.abs(P.x):0);scene();
  if(P){ctx.fillStyle=curBg.s>.5?'#fff':'#2f6b2c';ctx.font='bold 18px system-ui';
    ctx.textAlign='left';ctx.fillText(fmtS(P.x),12,26);ctx.textAlign='right';ctx.fillText('ステージ：'+curBg.n,W-12,26)}
  if(run&&run.event&&run.rt<2.6){
    ctx.save();ctx.globalAlpha=Math.min(1,(2.6-run.rt)/.5);ctx.font='bold 26px system-ui';ctx.textAlign='center';
    const t=run.event.icon+' '+run.event.name,w=ctx.measureText(t).width+36;
    ctx.fillStyle='rgba(255,138,31,.95)';ctx.beginPath();ctx.roundRect(W/2-w/2,52,w,44,22);ctx.fill();
    ctx.fillStyle='#fff';ctx.fillText(t,W/2,83);ctx.restore();
  }
}
function idle(){bm=1;ox=60;curEvt=null;P=null;parts=[];trail=[];zoom=1;camX=0;frame()}
function dust(x,n,power){
  for(let i=0;i<n;i++)parts.push({x:x*PPM+(Math.random()-.5)*R*bm,y:-4*bm,vx:(Math.random()-.5)*power*30*bm,vy:-Math.random()*power*14*bm,r:(3+Math.random()*5)*bm,l:.9});
}
function newFace(){face={x:.5,y:.45,w:.45}}
const pv=$('pv'),pc=pv.getContext('2d'),clamp=(v,a,b)=>Math.min(b,Math.max(a,v));
let faceModelsLoaded=false;

async function loadFaceModels(){
  if(faceModelsLoaded)return;
  if(!window.faceapi)throw new Error('顔認識ライブラリを読み込めません');
  await Promise.all([
    faceapi.nets.tinyFaceDetector.loadFromUri('./models'),
    faceapi.nets.faceLandmark68TinyNet.loadFromUri('./models')
  ]);
  faceModelsLoaded=true;
}

function averagePoints(points){
  return points.reduce((sum,p)=>({x:sum.x+p.x,y:sum.y+p.y}),{x:0,y:0});
}

function applyDetectedFace(box,landmarks){
  const m=Math.min(img.width,img.height);
  const sx=(img.width-m)/2,sy=(img.height-m)/2;
  face.x=clamp((box.x+box.width/2-sx)/m,.15,.85);
  face.y=clamp((box.y+box.height/2-sy)/m,.2,.8);
  face.w=clamp(box.width/m*.9,.25,.7);

  let tilt=0,headHeight=box.height;
  if(landmarks){
    const leftEye=landmarks.slice(36,42);
    const rightEye=landmarks.slice(42,48);
    const leftAvg=averagePoints(leftEye);
    const rightAvg=averagePoints(rightEye);
    leftAvg.x/=leftEye.length;leftAvg.y/=leftEye.length;
    rightAvg.x/=rightEye.length;rightAvg.y/=rightEye.length;
    const eyeDistance=Math.hypot(rightAvg.x-leftAvg.x,rightAvg.y-leftAvg.y);
    const nose=landmarks[30];
    const chin=landmarks[8];
    const eyeCenter={x:(leftAvg.x+rightAvg.x)/2,y:(leftAvg.y+rightAvg.y)/2};

    face.x=clamp((nose.x-sx)/m,.15,.85);
    face.y=clamp((eyeCenter.y+(chin.y-eyeCenter.y)*.38-sy)/m,.2,.8);
    face.w=clamp(eyeDistance/m*1.55,.25,.7);
    headHeight=Math.abs(chin.y-eyeCenter.y);
    tilt=Math.atan2(rightAvg.y-leftAvg.y,rightAvg.x-leftAvg.x)*180/Math.PI;
  }

  earLen=clamp(headHeight/m*.9,.3,1);
  earAng=clamp(9+tilt*Math.PI/180,-30*Math.PI/180,60*Math.PI/180);
  $('faceW').value=Math.round(face.w*100);
  $('earLen').value=Math.round(earLen*100);
  $('earAng').value=String(Math.round(earAng*180/Math.PI));
  $('earAngV').textContent=$('earAng').value+'°';
  JumpDB.put('settings',earLen,'earLength');
  JumpDB.put('settings',$('earAng').value,'earAngle');
  JumpDB.put('settings',face.w,'faceWidth');
}

async function detectAndApplyFace(){
  if(!img)return false;
  $('msg').textContent='顔を認識しています…';
  try{
    await loadFaceModels();
    const result=await faceapi
      .detectSingleFace(img,new faceapi.TinyFaceDetectorOptions({inputSize:416,scoreThreshold:.5}))
      .withFaceLandmarks(true);
    if(result){
      const box=result.detection.box;
      const landmarks=result.landmarks.positions.map(p=>({x:p.x,y:p.y}));
      applyDetectedFace({x:box.x,y:box.y,width:box.width,height:box.height},landmarks);
      bunny=true;
      refresh();
      $('msg').textContent='顔認識が完了しました。目・鼻・顎の位置から耳の位置・長さ・角度を調整しています。必要ならドラッグで微調整できます。';
      return true;
    }
  }catch(error){
    console.warn('face-api detection failed:',error);
  }

  try{
    if('FaceDetector' in window){
      const detections=await new FaceDetector({maxDetectedFaces:1}).detect(img);
      if(detections.length){
        const box=detections[0].boundingBox;
        applyDetectedFace(box,null);
        bunny=true;
        refresh();
        $('msg').textContent='顔の位置を検出しました。耳の位置・サイズを調整しています。';
        return true;
      }
    }
  }catch(error){
    console.warn('native face detection failed:',error);
  }

  bunny=true;
  refresh();
  $('msg').textContent='顔を検出できませんでした。顔の中心を画像上でタップ/ドラッグして調整してください。';
  return false;
}

function drawPreview(){
  for(let y=0;y<pv.height;y+=20)for(let x=0;x<pv.width;x+=20){pc.fillStyle=((x+y)/20)%2?'#e9e9ee':'#fafafc';pc.fillRect(x,y,20,20)}
  if(!spr)return;
  pc.save();pc.translate(180,250);pc.drawImage(spr,-150,-150);drawEars(pc,0,0);pc.restore();
}
function refresh(){buildSprite();drawPreview()}
$('f').addEventListener('change',e=>{
  const file=e.target.files[0];if(!file)return;
  const im=new Image();
  im.onload=()=>{img=im;bunny=false;newFace();earLen=.6;$('earLen').value=60;$('faceW').value=45;refresh();
    $('ear').disabled=false;$('toJump').disabled=false;
    detectAndApplyFace();};
  im.src=URL.createObjectURL(file);
});
$('ear').onclick=async()=>{
  if(!img)return;
  await detectAndApplyFace();
};
let drag=false;
function setFace(ev){
  if(!bunny)return;
  const r=pv.getBoundingClientRect(),k=pv.width/r.width;
  face.x=clamp(((ev.clientX-r.left)*k-180)/BS+.5,.15,.85);
  face.y=clamp(((ev.clientY-r.top)*k-250)/BS+.5,.2,.8);
  refresh();
}
pv.addEventListener('pointerdown',e=>{drag=true;setFace(e)});
pv.addEventListener('pointermove',e=>{if(drag)setFace(e)});
addEventListener('pointerup',()=>drag=false);
$('earLen').addEventListener('input',e=>{
  earLen=e.target.value/100;
  drawPreview();
  JumpDB.put('settings',earLen,'earLength');
});
$('faceW').addEventListener('input',e=>{
  face.w=e.target.value/100;
  refresh();
  JumpDB.put('settings',face.w,'faceWidth');
});
$('toJump').onclick=()=>{
  if(!img)return;
  if(earMode==='rand')rollRand();
  $('viewE').style.display='none';$('viewJ').style.display='block';
  $('dist').textContent='';$('info').textContent='';$('jump').disabled=false;idle();
};
$('back').onclick=()=>{
  if(run)return;
  $('viewJ').style.display='none';$('viewE').style.display='block';drawPreview();
};

$('jump').onclick=()=>{
  if(run||!spr)return;
  const v0=(5+Math.pow(Math.random(),1.3)*15)*SCALE,ang=(35+Math.random()*20)*Math.PI/180;
  P={x:0,y:RM,vx:0,vy:0,rot:0,om:0,sq:0,sqv:0,st:0,rolling:false,dir:1};
  parts=[];trail=[];zoom=1;camX=0;
  run={phase:'crouch',t:0,v0,ang,last:performance.now(),tt:0,dir:1,rt:0};
  if(earMode==='rand')rollRand();
  curEvt=null;ox=60;
  const evd=($('forceEvt').checked||Math.random()<EVENT_RATE)?pickEvent():null;
  if(evd){const es=evd.onStart(run);curEvt={def:evd,es};run.event=evd}
  P.dir=run.dir;ox=run.dir>0?60:W-60;
  $('jump').disabled=true;$('back').disabled=true;$('dist').textContent='ジャンプ中…';
  $('info').textContent='初速 '+v0.toFixed(1)+' m/s / 角度 '+(ang*180/Math.PI).toFixed(0)+'°　'+(effSet()?'耳：'+effSet().name+'　':'')+(run.event?run.event.icon+run.event.name+'　':'');
  raf=requestAnimationFrame(loop);
};
function physics(dt){
  const p=P;
  // ばね(つぶれ/のび)
  if(run.phase==='crouch'){
    run.t+=dt;p.sq=Math.min(.35,run.t/.45*.35);p.sqv=0;
    if(run.t>=.45){
      run.phase='fly';p.vx=run.v0*Math.cos(run.ang)*run.dir;p.vy=run.v0*Math.sin(run.ang);
      p.om=p.vx*.35;p.sq=-.2;p.sqv=0;dust(0,10,2);
    }
    return;
  }
  if(run.phase==='fly'){
    p.vy-=G*dt;p.x+=p.vx*dt;p.y+=p.vy*dt;p.rot+=p.om*dt;
    p.st=p.y>RM+.15?Math.min(.12,Math.hypot(p.vx,p.vy)*.006):0;
    if(p.y<=RM){
      p.y=RM;
      if(p.vy<-1.3){
        const imp=-p.vy;p.vy=imp*.45;p.vx*=.8;p.sq=Math.min(.45,imp*.04);p.sqv=0;
        p.om=p.om*.4+p.vx/RM*.4;dust(p.x,Math.min(14,4+imp),Math.min(3,imp*.3));
      }else{p.vy=0;p.rolling=true}
    }
    if(p.rolling){
      p.vx*=Math.exp(-1.6*dt);p.om=p.vx/RM;
      if(Math.abs(p.vx)<.08){p.vx=0;p.om=0;run.phase='done'}
    }
  }
}
function loop(now){
  let dt=Math.min(1/30,(now-run.last)/1000);run.last=now;run.rt+=dt;
  if(curEvt&&curEvt.def.tick)curEvt.def.tick(curEvt.es,dt,P);
  const TS=run.phase==='fly'?5:1,sd=dt*TS,n=Math.ceil(sd*120),h=sd/n;
  for(let i=0;i<n&&run.phase!=='done';i++)physics(h);
  if(run.phase!=='crouch'){P.sqv+=(-160*P.sq-12*P.sqv)*dt;P.sq+=P.sqv*dt}
  // ほこり・軌跡
  parts.forEach(p=>{p.x+=p.vx*dt;p.y+=p.vy*dt;p.vy+=60*bm*dt;p.l-=dt*1.6});parts=parts.filter(p=>p.l>0);
  run.tt+=dt;if(run.phase==='fly'&&run.tt>.06){run.tt=0;trail.push({x:P.x,y:P.y});if(trail.length>80)trail.shift()}
  // カメラ
  const tz=Math.min(1,(W-100)/(Math.abs(P.x)*PPM+R+40),(GROUND-50)/(P.y*PPM+R+80));
  const sm=Math.exp(Math.log(zoom)+(Math.log(tz)-Math.log(zoom))*(1-Math.exp(-5*dt)));
  zoom=Math.min(tz,sm);bm=Math.max(1,.3/zoom);camX=0; // ズームアウトは即時(画面外に出ない)、ズームインは滑らか
  frame();
  if(run.phase==='done'){
    const d=P.x;run=null;
    $('dist').textContent=curEvt?curEvt.def.result(d,curEvt.es):'🐰 '+fmt(d)+' 跳んだ！';
    if(d>best){best=d;$('best').textContent='ベスト：'+fmtS(best);JumpDB.put('settings',best,'best')}
    $('jump').disabled=false;$('back').disabled=false;
    $('info').textContent+='もう一度跳ばせます。';
    return;
  }
  raf=requestAnimationFrame(loop);
}
['cut','tol'].forEach(id=>$(id).addEventListener('input',()=>{earSets.forEach(buildSet);if(img)refresh()}));
let pendL=null,pendR=null,pendLBlob=null,pendRBlob=null;
const loadImg=(file,cb)=>{const im=new Image();im.onload=()=>cb(im);im.src=URL.createObjectURL(file)};
$('earL').addEventListener('change',e=>{const f=e.target.files[0];if(f){pendLBlob=f;loadImg(f,im=>{pendL=im;$('earLn').textContent=f.name})}});
$('earR').addEventListener('change',e=>{const f=e.target.files[0];if(f){pendRBlob=f;loadImg(f,im=>{pendR=im;$('earRn').textContent=f.name})}});
function rebuildSel(){
  const o=['<option value="std">標準の耳</option>','<option value="rand">🎲 ランダム</option>'];
  earSets.forEach((t,i)=>o.push('<option value="'+i+'">'+t.name+'</option>'));
  $('earSel').innerHTML=o.join('');$('earSel').value=String(earMode);
  $('earDel').disabled=typeof earMode!=='number';
}
$('earAdd').onclick=()=>{
  if(!pendL&&!pendR){$('msg').textContent='左耳・右耳の画像を選んでから「セットに追加」を押してください（片方だけの場合は反転して使います）。';return}
  const id=Date.now();
  const st={id,name:'セット'+(++setN),sL:pendL,sR:pendR};buildSet(st);earSets.push(st);
  JumpDB.put('earSets',{id,name:st.name,left:pendLBlob,right:pendRBlob});
  earMode=earSets.length-1;bunny=true;pendL=pendR=pendLBlob=pendRBlob=null;
  $('earLn').textContent=$('earRn').textContent='未選択';$('earL').value=$('earR').value='';
  rebuildSel();if(img)refresh();else drawPreview();
  JumpDB.put('settings',earMode,'earMode');
  $('msg').textContent=st.name+'を登録しました。「使う耳」で任意選択、またはランダムを選べます。';
};
$('earSel').onchange=()=>{
  const v=$('earSel').value;earMode=(v==='std'||v==='rand')?v:+v;
  if(earMode==='rand')rollRand();
  $('earDel').disabled=typeof earMode!=='number';drawPreview();
  JumpDB.put('settings',earMode,'earMode');
};
$('earDel').onclick=()=>{
  if(typeof earMode!=='number')return;
  const removed=earSets.splice(earMode,1)[0];
  if(removed&&removed.id)JumpDB.remove('earSets',removed.id);
  earMode='std';curRand=null;rebuildSel();drawPreview();
  JumpDB.put('settings','std','earMode');
};
$('earAng').addEventListener('input',e=>{earAng=e.target.value*Math.PI/180;$('earAngV').textContent=e.target.value+'°';drawPreview();JumpDB.put('settings',e.target.value,'earAngle')});
$('ecut').addEventListener('input',()=>{earSets.forEach(buildSet);drawPreview()});

async function loadImageBlob(blob){
  if(!blob)return null;
  return new Promise((resolve,reject)=>{
    const url=URL.createObjectURL(blob),im=new Image();
    im.onload=()=>{URL.revokeObjectURL(url);resolve(im)};
    im.onerror=()=>{URL.revokeObjectURL(url);reject(new Error('画像を読み込めません'))};
    im.src=url;
  });
}

async function initDatabase(){
  const savedBest=await JumpDB.get('settings','best');
  if(typeof savedBest==='number'){best=savedBest;$('best').textContent='ベスト：'+fmtS(best)}
  const savedEarLength=await JumpDB.get('settings','earLength');
  if(typeof savedEarLength==='number'){
    earLen=clamp(savedEarLength,.3,1);
    $('earLen').value=Math.round(earLen*100);
  }
  const savedFaceWidth=await JumpDB.get('settings','faceWidth');
  if(typeof savedFaceWidth==='number'){
    face.w=clamp(savedFaceWidth,.25,.7);
    $('faceW').value=Math.round(face.w*100);
  }
  const savedAngle=await JumpDB.get('settings','earAngle');
  if(savedAngle!==undefined){
    const angle=Number(savedAngle);earAng=angle*Math.PI/180;$('earAng').value=String(angle);$('earAngV').textContent=angle+'°';
  }
  const savedSets=await JumpDB.getAll('earSets');
  for(const record of savedSets.sort((a,b)=>a.id-b.id)){
    try{
      const sL=await loadImageBlob(record.left),sR=await loadImageBlob(record.right);
      const st={id:record.id,name:record.name,sL,sR};buildSet(st);earSets.push(st);
      setN=Math.max(setN,Number(String(record.name).replace(/\D/g,''))||0);
    }catch(_){}
  }
  rebuildSel();
  const savedMode=await JumpDB.get('settings','earMode');
  if(savedMode!==undefined){
    earMode=savedMode;
    if(earMode==='rand')rollRand();
    rebuildSel();
  }
}

initDatabase().catch(()=>{$('msg').textContent='IndexedDBが利用できないため、保存機能を使用できません。'});
drawPreview();
idle();
