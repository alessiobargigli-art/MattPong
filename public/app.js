const menu=document.getElementById('menu');
const game=document.getElementById('game');
const statusEl=document.getElementById('status');
const roomLabel=document.getElementById('roomLabel');
const canvas=document.getElementById('canvas');
const ctx=canvas.getContext('2d');
const rotate=document.getElementById('rotate');
const startLevelEl=document.getElementById('startLevel');
const cpuDifficultyEl=document.getElementById('cpuDifficulty');
const copyLinkBtn=document.getElementById('copyLinkBtn');

const W=1600,H=900,PADDLE_HALF=90,BALL_R=18;
const LEVELS={
  1:{speed:450,max:950,label:'1'},
  2:{speed:560,max:1200,label:'2'},
  3:{speed:700,max:1450,label:'3'}
};
const CPU_PROFILES={
  easy:{speed:300,reaction:.18,error:95,label:'FACILE'},
  normal:{speed:430,reaction:.10,error:38,label:'NORMALE'},
  hard:{speed:620,reaction:.045,error:10,label:'DIFFICILE'}
};

let mode=null,side='left',roomCode='',socket=null,state=null,lastState=null,lastStateAt=0;
let local={leftY:H/2,rightY:H/2,ballX:W/2,ballY:H/2,leftScore:0,rightScore:0,vx:560,vy:220};
let cpuTarget=H/2,cpuReactionClock=0,lastFrame=performance.now(),audioCtx=null;

function currentLevel(){return Math.max(1,Math.min(3,Number(startLevelEl.value)||2));}
function currentCpuDifficulty(){return CPU_PROFILES[cpuDifficultyEl.value]?cpuDifficultyEl.value:'normal';}
function setStatus(t){statusEl.textContent=t||'';document.getElementById('hint').textContent=t||'Trascina verticalmente per muovere la racchetta';}
function showGame(label){roomLabel.textContent=label;menu.classList.add('hidden');game.classList.remove('hidden');syncOrientation();tryLandscape();}
function wsUrl(code,level){const p=location.protocol==='https:'?'wss':'ws';const u=new URL(`${p}://${location.host}/ws/${code}`);if(level)u.searchParams.set('level',String(level));return u.toString();}
function roomShareUrl(code){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('room',code);return u.toString();}
function setRoomUrl(code){history.replaceState(null,'',roomShareUrl(code));}
async function createRoom(){const r=await fetch('/api/room/create',{method:'POST'});if(!r.ok)throw new Error('Creazione stanza fallita');return (await r.json()).code;}

function ensureAudio(){
  const AudioContextClass=window.AudioContext||window.webkitAudioContext;
  if(!AudioContextClass)return;
  if(!audioCtx)audioCtx=new AudioContextClass();
  if(audioCtx.state==='suspended')audioCtx.resume().catch(()=>{});
}
function playSfx(name){
  if(!audioCtx||audioCtx.state!=='running')return;
  const now=audioCtx.currentTime;
  const osc=audioCtx.createOscillator();
  const gain=audioCtx.createGain();
  osc.type=name==='paddle'?'square':'sine';
  osc.frequency.setValueAtTime(name==='paddle'?220:520,now);
  if(name==='paddle')osc.frequency.exponentialRampToValueAtTime(170,now+.065);
  gain.gain.setValueAtTime(.0001,now);
  gain.gain.exponentialRampToValueAtTime(name==='paddle'?.08:.045,now+.004);
  gain.gain.exponentialRampToValueAtTime(.0001,now+(name==='paddle'?.075:.05));
  osc.connect(gain);gain.connect(audioCtx.destination);osc.start(now);osc.stop(now+.09);
}

async function copyRoomLink(){
  if(!roomCode)return;
  const url=roomShareUrl(roomCode);
  let copied=false;
  try{
    if(navigator.clipboard&&window.isSecureContext){await navigator.clipboard.writeText(url);copied=true;}
  }catch{}
  if(!copied){
    const text=document.createElement('textarea');
    text.value=url;text.setAttribute('readonly','');text.style.position='fixed';text.style.opacity='0';
    document.body.appendChild(text);text.select();
    try{copied=document.execCommand('copy');}catch{}
    text.remove();
  }
  const original=copyLinkBtn.textContent;
  copyLinkBtn.textContent=copied?'COPIATO!':'COPIA FALLITA';
  setTimeout(()=>{copyLinkBtn.textContent=original;},1400);
}

function connectRoom(code,hostLevel=null){return new Promise((resolve,reject)=>{
  socket=new WebSocket(wsUrl(code,hostLevel));
  socket.onopen=()=>resolve();
  socket.onerror=()=>reject(new Error('Connessione non riuscita'));
  socket.onmessage=e=>{
    let m;try{m=JSON.parse(e.data)}catch{return}
    if(m.type==='joined'){
      side=m.side;roomCode=m.code;setRoomUrl(roomCode);copyLinkBtn.classList.remove('hidden');
      showGame(`STANZA ${roomCode}`);
      setStatus(side==='left'?`Condividi il codice ${roomCode} o usa COPIA LINK`:'Connesso. Si gioca!');
    }else if(m.type==='state'){
      lastState=state;state=m;lastStateAt=performance.now();
      roomLabel.textContent=`STANZA ${roomCode} · LIVELLO ${m.level||2}`;
      if(!m.waiting)setStatus('Trascina verticalmente per muovere la racchetta');
    }else if(m.type==='sfx'){
      playSfx(m.name);
    }
  };
  socket.onclose=()=>setStatus('Connessione chiusa.');
});}

function resetLocalGame(level){
  const cfg=LEVELS[level]||LEVELS[2];
  local={leftY:H/2,rightY:H/2,ballX:W/2,ballY:H/2,leftScore:0,rightScore:0,vx:cfg.speed,vy:cfg.speed*.35};
  cpuTarget=H/2;cpuReactionClock=0;
}

document.getElementById('cpuBtn').onclick=()=>{
  ensureAudio();mode='cpu';side='left';state=null;lastState=null;copyLinkBtn.classList.add('hidden');
  const level=currentLevel(),difficulty=currentCpuDifficulty();resetLocalGame(level);
  showGame(`1 VS CPU · LIVELLO ${level} · ${CPU_PROFILES[difficulty].label}`);
  setStatus('Trascina verticalmente per muovere la racchetta');
};
document.getElementById('createBtn').onclick=async()=>{try{
  ensureAudio();mode='online';setStatus('Creazione stanza…');const code=await createRoom();await connectRoom(code,currentLevel());
}catch(e){setStatus(e.message||'Errore');}};
document.getElementById('joinBtn').onclick=async()=>{
  const code=document.getElementById('roomInput').value.trim().toUpperCase();
  if(code.length!==6){setStatus('Inserisci un codice stanza di 6 caratteri.');return;}
  try{ensureAudio();mode='online';setStatus('Connessione…');await connectRoom(code);}catch(e){setStatus(e.message||'Errore');}
};
document.getElementById('backBtn').onclick=()=>{try{socket?.close();}catch{}location.assign(location.origin+location.pathname);};
document.getElementById('copyLinkBtn').onclick=()=>copyRoomLink();
document.getElementById('fullscreenBtn').onclick=async()=>{try{ensureAudio();if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();await tryLandscape();}catch{}};

async function tryLandscape(){try{if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{}}
function syncOrientation(){const portrait=matchMedia('(orientation: portrait)').matches&&innerWidth<900&&!game.classList.contains('hidden');rotate.classList.toggle('hidden',!portrait);}addEventListener('resize',syncOrientation);addEventListener('orientationchange',syncOrientation);

function clampY(y){return Math.max(PADDLE_HALF,Math.min(H-PADDLE_HALF,y));}
function sendPointer(clientY){const r=canvas.getBoundingClientRect();const y=Math.max(0,Math.min(1,(clientY-r.top)/r.height));if(mode==='cpu'){local.leftY=clampY(y*H);}else if(socket?.readyState===WebSocket.OPEN){if(side==='left')local.leftY=clampY(y*H);else local.rightY=clampY(y*H);socket.send(JSON.stringify({type:'move',y}));}}
canvas.addEventListener('pointerdown',e=>{ensureAudio();canvas.setPointerCapture(e.pointerId);sendPointer(e.clientY);});
canvas.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')sendPointer(e.clientY);});
const keys=new Set();addEventListener('keydown',e=>{keys.add(e.key.toLowerCase());if(mode)ensureAudio();});addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));

function tickInput(dt){let y=side==='left'?local.leftY:local.rightY;const speed=650;if(keys.has('arrowup')||keys.has('w'))y-=speed*dt;if(keys.has('arrowdown')||keys.has('s'))y+=speed*dt;y=clampY(y);if(mode==='cpu')local.leftY=y;else if(mode==='online'&&keys.size&&socket?.readyState===WebSocket.OPEN){const n=y/H;if(side==='left')local.leftY=y;else local.rightY=y;socket.send(JSON.stringify({type:'move',y:n}));}}

function stepCpu(dt){
  const profile=CPU_PROFILES[currentCpuDifficulty()];
  cpuReactionClock-=dt;
  if(cpuReactionClock<=0){
    const base=local.vx>0?local.ballY:H/2;
    cpuTarget=clampY(base+(Math.random()*2-1)*profile.error);
    cpuReactionClock=profile.reaction;
  }
  local.rightY+=Math.sign(cpuTarget-local.rightY)*Math.min(Math.abs(cpuTarget-local.rightY),profile.speed*dt);
  local.ballX+=local.vx*dt;local.ballY+=local.vy*dt;

  if(local.ballY-BALL_R<=0&&local.vy<0){local.ballY=BALL_R;local.vy*=-1;playSfx('wall');}
  if(local.ballY+BALL_R>=H&&local.vy>0){local.ballY=H-BALL_R;local.vy*=-1;playSfx('wall');}

  if(local.vx<0&&local.ballX-BALL_R<=94&&local.ballX>40&&Math.abs(local.ballY-local.leftY)<=PADDLE_HALF+BALL_R){bounceCpu(local.leftY,1);playSfx('paddle');}
  if(local.vx>0&&local.ballX+BALL_R>=1506&&local.ballX<1560&&Math.abs(local.ballY-local.rightY)<=PADDLE_HALF+BALL_R){bounceCpu(local.rightY,-1);playSfx('paddle');}

  if(local.ballX<-80){local.rightScore++;resetCpu(1);}else if(local.ballX>W+80){local.leftScore++;resetCpu(-1);}
}
function bounceCpu(py,dir){
  const off=Math.max(-1,Math.min(1,(local.ballY-py)/PADDLE_HALF));
  const cfg=LEVELS[currentLevel()];
  const speed=Math.min(cfg.max,Math.hypot(local.vx,local.vy)*1.06),angle=off*.9;
  local.vx=Math.cos(angle)*speed*dir;local.vy=Math.sin(angle)*speed;
  local.ballX=dir===1?113:1487;
}
function resetCpu(dir){const cfg=LEVELS[currentLevel()];local.ballX=W/2;local.ballY=H/2;local.vx=cfg.speed*dir;local.vy=(Math.random()*2-1)*cfg.speed*.54;}

function draw(){
  requestAnimationFrame(draw);
  const now=performance.now(),dt=Math.min(.05,(now-lastFrame)/1000);lastFrame=now;
  tickInput(dt);if(mode==='cpu')stepCpu(dt);
  ctx.clearRect(0,0,W,H);ctx.fillStyle='#0b1020';ctx.fillRect(0,0,W,H);
  ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=8;ctx.setLineDash([26,24]);ctx.beginPath();ctx.moveTo(800,0);ctx.lineTo(800,H);ctx.stroke();ctx.setLineDash([]);
  let s;
  if(mode==='cpu')s=local;
  else if(state){
    const a=Math.min(1,(performance.now()-lastStateAt)/50),lerp=(p,n)=>p==null?n:p+(n-p)*a;
    s={leftY:side==='left'?local.leftY:lerp(lastState?.leftY,state.leftY),rightY:side==='right'?local.rightY:lerp(lastState?.rightY,state.rightY),ballX:lerp(lastState?.ballX,state.ballX),ballY:lerp(lastState?.ballY,state.ballY),leftScore:state.leftScore,rightScore:state.rightScore,waiting:state.waiting,code:state.code};
  }else{drawText('MattPong',800,450,64);return;}
  ctx.fillStyle='#fff';ctx.fillRect(66,s.leftY-90,28,180);ctx.fillRect(1506,s.rightY-90,28,180);ctx.beginPath();ctx.arc(s.ballX,s.ballY,18,0,Math.PI*2);ctx.fill();drawText(String(s.leftScore),660,105,72);drawText(String(s.rightScore),940,105,72);
  if(s.waiting){ctx.fillStyle='rgba(11,16,32,.78)';ctx.fillRect(0,0,W,H);drawText(`STANZA ${s.code}`,800,390,72);drawText('In attesa del secondo giocatore…',800,490,38);}
}
function drawText(t,x,y,size){ctx.fillStyle='#fff';ctx.font=`800 ${size}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,x,y);}

async function joinSharedRoom(){
  const code=(new URLSearchParams(location.search).get('room')||'').trim().toUpperCase();
  if(!/^[A-Z0-9]{6}$/.test(code))return;
  document.getElementById('roomInput').value=code;
  try{mode='online';setStatus('Connessione alla stanza condivisa…');await connectRoom(code);}catch(e){setStatus(e.message||'Impossibile entrare nella stanza');}
}

draw();
joinSharedRoom();
