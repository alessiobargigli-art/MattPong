const menu=document.getElementById('menu'),game=document.getElementById('game'),statusEl=document.getElementById('status'),roomLabel=document.getElementById('roomLabel'),canvas=document.getElementById('canvas'),ctx=canvas.getContext('2d');
let connection=null,side='left',roomCode='',state=null,lastState=null,lastStateAt=0;

async function ensureConnection(){
  if(connection) return connection;
  connection=new signalR.HubConnectionBuilder().withUrl('/gamehub').withAutomaticReconnect().build();
  connection.on('State',s=>{lastState=state;state=s;lastStateAt=performance.now();});
  connection.on('RoomReady',()=>{setStatus('Avversario connesso. Si gioca!');});
  connection.on('OpponentLeft',()=>setStatus('L’avversario si è disconnesso.'));
  connection.onreconnecting(()=>setStatus('Riconnessione…'));
  connection.onreconnected(()=>setStatus('Riconnesso.'));
  await connection.start();
  return connection;
}

function setStatus(text){statusEl.textContent=text;document.getElementById('hint').textContent=text||'Trascina verticalmente per muovere la racchetta';}
function showGame(result){side=result.side;roomCode=result.code;roomLabel.textContent=result.mode==='online'?`STANZA ${roomCode}`:'1 VS CPU';menu.classList.add('hidden');game.classList.remove('hidden');setStatus(result.mode==='online'&&side==='left'?`Condividi il codice ${roomCode}`:'Trascina verticalmente per muovere la racchetta');tryLandscape();}

async function invoke(name,...args){try{await ensureConnection();return await connection.invoke(name,...args);}catch(e){statusEl.textContent=e?.message||'Errore di connessione';throw e;}}

document.getElementById('cpuBtn').onclick=async()=>showGame(await invoke('CreateCpu'));
document.getElementById('createBtn').onclick=async()=>showGame(await invoke('CreateOnline'));
document.getElementById('joinBtn').onclick=async()=>{const code=document.getElementById('roomInput').value.trim().toUpperCase();if(code.length!==6){statusEl.textContent='Inserisci un codice stanza di 6 caratteri.';return;}showGame(await invoke('JoinRoom',code));};
document.getElementById('backBtn').onclick=()=>location.reload();
document.getElementById('fullscreenBtn').onclick=async()=>{try{if(!document.fullscreenElement)await document.documentElement.requestFullscreen();else await document.exitFullscreen();tryLandscape();}catch{}};

async function tryLandscape(){
  try{if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch{}
}

function sendPointer(clientY){
  const r=canvas.getBoundingClientRect();
  const y=Math.max(0,Math.min(1,(clientY-r.top)/r.height));
  if(connection?.state===signalR.HubConnectionState.Connected) connection.send('Move',y).catch(()=>{});
}
canvas.addEventListener('pointerdown',e=>{canvas.setPointerCapture(e.pointerId);sendPointer(e.clientY);});
canvas.addEventListener('pointermove',e=>{if(e.buttons||e.pointerType==='touch')sendPointer(e.clientY);});

const keys=new Set();
addEventListener('keydown',e=>keys.add(e.key.toLowerCase()));addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));
setInterval(()=>{if(!state)return;let y=side==='left'?state.leftY:state.rightY;const step=28;if(keys.has('arrowup')||keys.has('w'))y-=step;if(keys.has('arrowdown')||keys.has('s'))y+=step;const n=Math.max(0,Math.min(1,y/900));if(connection?.state===signalR.HubConnectionState.Connected&&(keys.size>0))connection.send('Move',n).catch(()=>{});},16);

function draw(){
  requestAnimationFrame(draw);
  ctx.clearRect(0,0,1600,900);ctx.fillStyle='#0b1020';ctx.fillRect(0,0,1600,900);
  ctx.strokeStyle='rgba(255,255,255,.18)';ctx.lineWidth=8;ctx.setLineDash([26,24]);ctx.beginPath();ctx.moveTo(800,0);ctx.lineTo(800,900);ctx.stroke();ctx.setLineDash([]);
  if(!state){drawText('MattPong',800,450,64);return;}
  const a=Math.min(1,(performance.now()-lastStateAt)/50);
  const lerp=(prev,next)=>prev==null?next:prev+(next-prev)*a;
  const ly=lerp(lastState?.leftY,state.leftY),ry=lerp(lastState?.rightY,state.rightY),bx=lerp(lastState?.ballX,state.ballX),by=lerp(lastState?.ballY,state.ballY);
  ctx.fillStyle='#fff';ctx.fillRect(66,ly-90,28,180);ctx.fillRect(1506,ry-90,28,180);
  ctx.beginPath();ctx.arc(bx,by,18,0,Math.PI*2);ctx.fill();
  drawText(String(state.leftScore),660,105,72);drawText(String(state.rightScore),940,105,72);
  if(state.waiting){ctx.fillStyle='rgba(11,16,32,.78)';ctx.fillRect(0,0,1600,900);drawText(`STANZA ${state.code}`,800,390,72);drawText('In attesa del secondo giocatore…',800,490,38);}
}
function drawText(t,x,y,size){ctx.fillStyle='#fff';ctx.font=`800 ${size}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(t,x,y);}
draw();

if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
