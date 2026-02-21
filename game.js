/* game.js - Ultimate Zombie Shooter (final, corrected)
   Features:
   - Weapons: pistol, smg, machinegun, shotgun, sniper, rocket
   - Auto-reload + manual reload (R)
   - Weapon shop, coins, purchases
   - Enemy types: normal, fast, tank, spitter, bomber, boss
   - Particles: blood, muzzle, explosion
   - Map walls & simple collision
   - Pickups: coins, ammo
   - Mobile controls: basic fire/reload; joystick placeholder
   - Level/wave progression with boss every 5 levels
   - No duplicate variable declarations; cleaned & consistent
*/

/* ------------------------ Setup ------------------------ */
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height;

// DOM elements assumed from index.html
const scoreEl = document.getElementById('score');
const coinsEl = document.getElementById('coins');
const levelEl = document.getElementById('level');
const hpEl = document.getElementById('hp');
const weaponEl = document.getElementById('weapon');
const ammoEl = document.getElementById('ammo');
const startBtn = document.getElementById('startBtn');
const shopBtn = document.getElementById('shopBtn');
const shopDiv = document.getElementById('shop');
const closeShopBtn = document.getElementById('closeShop');
const shopItemsDiv = document.getElementById('shopItems');
const centerOverlay = document.getElementById('centerOverlay');

/* ------------------------ Audio (optional) ------------------------ */
function safeAudio(path){
  try { return new Audio(path); } catch(e){ return null; }
}
const sounds = {
  shoot: safeAudio('shoot.mp3'),
  zombieDeath: safeAudio('zombieDeath.mp3'),
  bg: safeAudio('bgMusic.mp3'),
  explosion: safeAudio('explosion.mp3'),
  reload: safeAudio('reload.mp3'),
};
if(sounds.bg){ sounds.bg.loop = true; sounds.bg.volume = 0.25; }

/* ------------------------ Utilities ------------------------ */
const rand = (a,b) => Math.random()*(b-a)+a;
const clamp = (v,a,b) => Math.max(a, Math.min(b,v));
const nowMs = () => Date.now();
const dist = (a,b) => Math.hypot(a.x - b.x, a.y - b.y);

/* ------------------------ Game State ------------------------ */
let gameStarted = false;
let gameOver = false;
let score = 0;
let coins = 0;
let level = 1;
let wave = 1;
let enemiesToSpawn = 6; // single declaration, no duplicates

// Entities / containers
let player = null;
let bullets = [];
let enemies = [];
let particles = [];
let pickups = []; // coins, ammo

/* ------------------------ Map / Walls ------------------------ */
const walls = [
  {x: 200, y: 140, w: 160, h: 14},
  {x: 520, y: 300, w: 16, h: 180},
  {x: 360, y: 420, w: 220, h: 14},
];

/* ------------------------ Player ------------------------ */
function createPlayer(){
  player = {
    x: W/2, y: H/2, r: 16, speed: 200, maxHp: 100, hp: 100
  };
}
createPlayer();

/* ------------------------ Weapons ------------------------ */
/* Weapons structure:
   key: {name, ammo, maxAmmo, damage, fireRate(ms), reload(ms), type, owned}
   type: 'bullet' | 'shot' | 'rocket'
*/
const weapons = {
  pistol:   { name:'Pistol',   ammo:12, maxAmmo:12, damage:1, fireRate:220, reload:800,  type:'bullet', owned:true, price:0 },
  smg:      { name:'SMG',      ammo:30, maxAmmo:30, damage:1, fireRate:80,  reload:1000, type:'bullet', owned:true, price:50 },
  machine:  { name:'Machine',  ammo:60, maxAmmo:60, damage:1, fireRate:45,  reload:1400, type:'bullet', owned:true, price:120 },
  shotgun:  { name:'Shotgun',  ammo:8,  maxAmmo:8,  damage:1, fireRate:600, reload:1600, type:'shot',   pellets:7, spread:0.6, owned:true, price:100 },
  sniper:   { name:'Sniper',   ammo:5,  maxAmmo:5,  damage:8, fireRate:900, reload:1800, type:'bullet', owned:true, price:150 },
  rocket:   { name:'Rocket',   ammo:2,  maxAmmo:2,  damage:6, fireRate:1000,reload:2200, type:'rocket', owned:true, price:250 },
};
let currentWeaponKey = 'pistol';
let lastShotAt = 0;
let reloading = false;

/* ------------------------ Shop Items ------------------------ */
const shopItems = [
  { key: 'smg', label:'SMG', price:50 },
  { key: 'machine', label:'Machine Gun', price:120 },
  { key: 'shotgun', label:'Shotgun', price:100 },
  { key: 'sniper', label:'Sniper', price:150 },
  { key: 'rocket', label:'Rocket Launcher', price:250 },
];

/* ------------------------ Input ------------------------ */
const keys = {};
let mouse = { x: W/2, y: H/2 };
let mouseDown = false;

// keyboard
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  keys[k] = true;

  // weapon switching 1..6
  if(e.key === '1') currentWeaponKey = 'pistol';
  if(e.key === '2') currentWeaponKey = 'smg';
  if(e.key === '3') currentWeaponKey = 'machine';
  if(e.key === '4') currentWeaponKey = 'shotgun';
  if(e.key === '5') currentWeaponKey = 'sniper';
  if(e.key === '6') currentWeaponKey = 'rocket';

  // reload
  if(e.key === 'r') startReload();

  // start / restart
  if(e.key === 'Enter'){
    if(!gameStarted) startGame();
    else if(gameOver) restartGame();
  }
});
window.addEventListener('keyup', (e) => { keys[e.key.toLowerCase()] = false; });

// mouse
canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
  mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
});
canvas.addEventListener('mousedown', (e) => {
  mouseDown = true;
  shootAtMouse();
});
canvas.addEventListener('mouseup', () => mouseDown = false);

/* ------------------------ Mobile Controls (basic) ------------------------ */
let mobileFire = false;
const fireBtn = document.getElementById('fireBtn');
const reloadBtn = document.getElementById('reloadBtn');
if(fireBtn){
  fireBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); mobileFire = true; shootAtMouse(); });
  fireBtn.addEventListener('touchend', (e)=>{ e.preventDefault(); mobileFire = false; });
}
if(reloadBtn){
  reloadBtn.addEventListener('touchstart', (e)=>{ e.preventDefault(); startReload(); });
}

/* ------------------------ Shooting & Reload ------------------------ */
function playSfx(name){
  const s = sounds[name];
  if(!s) return;
  try{ s.currentTime = 0; s.play(); }catch(e){}
}

function shootAtMouse(){
  if(!gameStarted || gameOver) return;
  const w = weapons[currentWeaponKey];
  if(!w || !w.owned) return;
  if(reloading) return;
  if(w.ammo <= 0){ autoReload(); return; }
  const now = nowMs();
  if(now - lastShotAt < w.fireRate) return;
  lastShotAt = now;
  w.ammo--;

  const angle = Math.atan2(mouse.y - player.y, mouse.x - player.x);

  if(w.type === 'bullet'){
    bullets.push({ x: player.x + Math.cos(angle)*18, y: player.y + Math.sin(angle)*18, vx: Math.cos(angle)*700, vy: Math.sin(angle)*700, r:4, dmg: w.damage, from:'player' });
  } else if(w.type === 'shot'){
    const pellets = w.pellets || 6;
    const spread = w.spread || 0.6;
    for(let i=0;i<pellets;i++){
      const a = angle + rand(-spread, spread);
      bullets.push({ x: player.x + Math.cos(a)*18, y: player.y + Math.sin(a)*18, vx: Math.cos(a)*650, vy: Math.sin(a)*650, r:3, dmg: w.damage, from:'player' });
    }
  } else if(w.type === 'rocket'){
    bullets.push({ x: player.x + Math.cos(angle)*18, y: player.y + Math.sin(angle)*18, vx: Math.cos(angle)*320, vy: Math.sin(angle)*320, r:6, dmg: w.damage*2, from:'player', rocket:true });
  }

  spawnMuzzle(player.x + Math.cos(angle)*18, player.y + Math.sin(angle)*18, angle);
  playSfx('shoot');

  if(w.ammo <= 0) autoReload();
}

function startReload(){
  if(reloading) return;
  const w = weapons[currentWeaponKey];
  if(!w) return;
  if(w.ammo >= w.maxAmmo) return;
  reloading = true;
  playSfx('reload');
  setTimeout(()=>{ w.ammo = w.maxAmmo; reloading = false; }, w.reload);
}

function autoReload(){
  if(reloading) return;
  reloading = true;
  const w = weapons[currentWeaponKey];
  if(!w) { reloading = false; return; }
  setTimeout(()=>{ w.ammo = w.maxAmmo; reloading = false; }, w.reload);
}

/* ------------------------ Enemies ------------------------ */
function spawnEnemy(type='normal'){
  const side = Math.floor(rand(0,4));
  let x=0,y=0;
  if(side===0){ x=-30; y=rand(0,H); }
  if(side===1){ x=W+30; y=rand(0,H); }
  if(side===2){ x=rand(0,W); y=-30; }
  if(side===3){ x=rand(0,W); y=H+30; }

  let e = { x, y, r:18, speed:50, hp:1, type:'normal', color:'#16a34a', lastSpit:0 };

  if(type === 'fast'){ e.speed = 120; e.hp = 1; e.r = 14; e.color = '#f97316'; e.type='fast'; }
  else if(type === 'tank'){ e.speed = 36; e.hp = 4 + Math.floor(level/2); e.r = 26; e.color = '#14532d'; e.type='tank'; }
  else if(type === 'spitter'){ e.speed = 45; e.hp = 2; e.r = 18; e.color = '#7c3aed'; e.lastSpit = 0; e.type='spitter'; }
  else if(type === 'bomber'){ e.speed = 40; e.hp = 1; e.r = 16; e.color = '#dc2626'; e.type='bomber'; }
  else if(type === 'boss'){ e.speed = 25; e.hp = 20 + level*4; e.r = 48; e.color = '#7f1d1d'; e.type='boss'; }
  // default normal: speed & hp adjust by level
  else { e.speed = 50 + (level-1)*3; e.hp = 1 + Math.floor(level/4); }

  enemies.push(e);
}

function spawnWave(){
  enemies = [];
  const count = enemiesToSpawn + Math.floor(level * 1.2);
  for(let i=0;i<count;i++){
    if(level%5===0 && i===0) spawnEnemy('boss');
    else {
      const r = Math.random();
      if(r < 0.55) spawnEnemy('normal');
      else if(r < 0.75) spawnEnemy('fast');
      else if(r < 0.88) spawnEnemy('spitter');
      else spawnEnemy('tank');
    }
  }
}

/* ------------------------ Particles / Effects ------------------------ */
function spawnParticle(x,y,dx,dy,life,color,r){
  particles.push({ x, y, dx, dy, life, age:0, color, r });
}
function spawnBlood(x,y,n=6){
  for(let i=0;i<n;i++) spawnParticle(x, y, rand(-120,120), rand(-120,120), rand(500,900), '#b91c1c', rand(1.5,3.5));
}
function spawnMuzzle(x,y,angle){
  for(let i=0;i<4;i++){
    const s = rand(120,260);
    spawnParticle(x, y, Math.cos(angle + rand(-0.6,0.6)) * s, Math.sin(angle + rand(-0.6,0.6)) * s, rand(120,260), '#f59e0b', rand(2,4));
  }
}

/* ------------------------ Pickups ------------------------ */
function spawnPickup(x,y,type='coin',val=1){
  pickups.push({ x, y, type, val, age:0 });
}

/* ------------------------ Utils: collisions ------------------------ */
function circleRectCollision(cx,cy,cr,rx,ry,rw,rh){
  const closestX = clamp(cx, rx, rx+rw);
  const closestY = clamp(cy, ry, ry+rh);
  const dx = cx - closestX; const dy = cy - closestY;
  return (dx*dx + dy*dy) < (cr*cr);
}

/* ------------------------ Update Loop ------------------------ */
let lastT = 0;
let pickupSpawnTimer = 0;

function update(ts){
  if(!lastT) lastT = ts;
  const dt = Math.min(0.05, (ts - lastT) / 1000);
  lastT = ts;

  if(!gameStarted){
    requestAnimationFrame(update);
    return;
  }

  // auto-play bg music if exists
  if(sounds.bg && sounds.bg.paused && !gameOver){ try{ sounds.bg.play(); } catch(e){} }

  // movement input
  let vx = 0, vy = 0;
  if(keys['w'] || keys['arrowup']) vy -= 1;
  if(keys['s'] || keys['arrowdown']) vy += 1;
  if(keys['a'] || keys['arrowleft']) vx -= 1;
  if(keys['d'] || keys['arrowright']) vx += 1;
  const mag = Math.hypot(vx, vy) || 1;
  player.x += (vx/mag) * player.speed * dt;
  player.y += (vy/mag) * player.speed * dt;

  // clamp inside canvas
  player.x = clamp(player.x, player.r, W - player.r);
  player.y = clamp(player.y, player.r, H - player.r);

  // avoid walls (simple push-back)
  for(const w of walls){
    if(circleRectCollision(player.x, player.y, player.r, w.x, w.y, w.w, w.h)){
      if(player.x < w.x) player.x = w.x - player.r - 1;
      else if(player.x > w.x + w.w) player.x = w.x + w.w + player.r + 1;
      if(player.y < w.y) player.y = w.y - player.r - 1;
      else if(player.y > w.y + w.h) player.y = w.y + w.h + player.r + 1;
    }
  }

  // auto-fire while holding (desktop)
  if(mouseDown) shootAtMouse();

  // update bullets
  for(let i=bullets.length-1;i>=0;i--){
    const b = bullets[i];
    b.x += b.vx * dt; b.y += b.vy * dt;
    // wall collisions
    let hitWall = false;
    for(const w of walls){
      if(circleRectCollision(b.x, b.y, b.r, w.x, w.y, w.w, w.h)){ hitWall = true; break; }
    }
    if(hitWall){ if(b.rocket) explode(b.x,b.y,1.2); bullets.splice(i,1); continue; }
    if(b.x < -40 || b.x > W+40 || b.y < -40 || b.y > H+40) { bullets.splice(i,1); continue; }
  }

  // update enemies
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    // spitter attack
    if(e.type === 'spitter' && nowMs() - e.lastSpit > 1400){
      const a = Math.atan2(player.y - e.y, player.x - e.x);
      bullets.push({ x: e.x, y: e.y, vx: Math.cos(a)*220, vy: Math.sin(a)*220, r:5, dmg:1, from:'enemy' });
      e.lastSpit = nowMs();
    }

    // movement toward player
    let dx = player.x - e.x, dy = player.y - e.y;
    const len = Math.hypot(dx, dy) || 1;
    e.x += (dx/len) * e.speed * dt;
    e.y += (dy/len) * e.speed * dt;

    // collision with player
    if(Math.hypot(e.x - player.x, e.y - player.y) < e.r + player.r){
      player.hp -= (e.type === 'tank' ? 12 : 6);
      spawnBlood(player.x + rand(-6,6), player.y + rand(-6,6), 8);
      if(e.type === 'bomber'){ explode(e.x, e.y, 1.0); enemies.splice(i,1); }
      else { enemies.splice(i,1); }
      playSfx('zombieDeath');
      if(Math.random() < 0.5) spawnPickup(player.x, player.y, 'coin', 1 + Math.floor(Math.random()*3));
    }
  }

  // bullets hitting enemies
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    for(let j=bullets.length-1;j>=0;j--){
      const b = bullets[j];
      if(b.from !== 'player') continue;
      if(Math.hypot(e.x - b.x, e.y - b.y) < e.r + b.r){
        e.hp -= b.dmg;
        spawnBlood(b.x, b.y, 4);
        bullets.splice(j,1);
        if(e.hp <= 0){
          // enemy died
          const coinGain = (e.type === 'boss') ? 50 : (e.type === 'tank' ? 8 : 3 + Math.floor(Math.random()*3));
          coins += coinGain;
          score += (e.type === 'boss' ? 200 : 10);
          spawnPickup(e.x, e.y, 'coin', coinGain);
          if(e.type === 'bomber'){ explode(e.x, e.y, 1.0); }
          enemies.splice(i,1);
          playSfx('zombieDeath');
        }
        break;
      }
    }
  }

  // bullets hitting player (enemy projectiles)
  for(let i=bullets.length-1;i>=0;i--){
    const b = bullets[i];
    if(b.from === 'enemy' && Math.hypot(b.x - player.x, b.y - player.y) < b.r + player.r){
      player.hp -= 8;
      spawnBlood(player.x, player.y, 6);
      bullets.splice(i,1);
    }
  }

  // update particles
  for(let i=particles.length-1;i>=0;i--){
    const p = particles[i];
    p.age += dt*1000;
    p.x += p.dx * dt; p.y += p.dy * dt;
    if(p.age > p.life) particles.splice(i,1);
  }

  // pickups
  for(let i=pickups.length-1;i>=0;i--){
    const pk = pickups[i];
    pk.age = (pk.age || 0) + dt*1000;
    if(Math.hypot(pk.x - player.x, pk.y - player.y) < 20){
      if(pk.type === 'coin') coins += pk.val;
      if(pk.type === 'ammo'){
        const w = weapons[currentWeaponKey];
        if(w) w.ammo = Math.min(w.maxAmmo, w.ammo + 8);
      }
      pickups.splice(i,1);
    }
  }

  // spawn periodic pickups
  pickupSpawnTimer += dt;
  if(pickupSpawnTimer > 6){
    if(Math.random() < 0.6) spawnPickup(rand(60, W-60), rand(60, H-60), 'coin', 1 + Math.floor(Math.random()*3));
    pickupSpawnTimer = 0;
  }

  // level progression: if all enemies dead -> next level
  if(enemies.length === 0 && gameStarted && !gameOver){
    level++;
    enemiesToSpawn += 2;
    spawnWave();
    coins += 5;
    // refill some ammo for current weapon
    const cw = weapons[currentWeaponKey];
    if(cw) cw.ammo = Math.min(cw.maxAmmo, cw.ammo + Math.floor(cw.maxAmmo * 0.2));
  }

  // game over check
  if(player.hp <= 0 && !gameOver){
    gameOver = true;
    playSfx('zombieDeath');
  }

  // update UI
  scoreEl && (scoreEl.textContent = `Score: ${score}`);
  coinsEl && (coinsEl.textContent = `Coins: ${coins}`);
  levelEl && (levelEl.textContent = `Level: ${level}`);
  hpEl && (hpEl.textContent = `HP: ${Math.max(0, Math.floor(player.hp))}`);
  weaponEl && (weaponEl.textContent = `Weapon: ${weapons[currentWeaponKey].name}`);
  ammoEl && (ammoEl.textContent = `Ammo: ${weapons[currentWeaponKey].ammo}/${weapons[currentWeaponKey].maxAmmo}`);

  requestAnimationFrame(update);
}

/* ------------------------ Explosion ------------------------ */
function explode(x,y,scale=1){
  for(let i=0;i<40;i++){
    spawnParticle(x, y, rand(-300,300), rand(-300,300), rand(400,900), '#fb923c', rand(2,5));
  }
  // damage enemies near explosion
  const radius = 60 * scale;
  for(let i=enemies.length-1;i>=0;i--){
    const e = enemies[i];
    if(Math.hypot(e.x - x, e.y - y) < radius + e.r){
      e.hp -= 3 + level;
      if(e.hp <= 0){ spawnPickup(e.x, e.y, 'coin', 3 + Math.floor(Math.random()*5)); enemies.splice(i,1); }
    }
  }
  playSfx('explosion');
}

/* ------------------------ Drawing ------------------------ */
function draw(){
  // background
  ctx.fillStyle = '#050406';
  ctx.fillRect(0,0,W,H);

  // walls
  ctx.fillStyle = '#1f2937';
  for(const w of walls) ctx.fillRect(w.x, w.y, w.w, w.h);

  // pickups
  for(const pk of pickups){
    if(pk.type === 'coin'){ ctx.fillStyle = '#f59e0b'; ctx.beginPath(); ctx.arc(pk.x, pk.y, 8,0,Math.PI*2); ctx.fill(); }
    if(pk.type === 'ammo'){ ctx.fillStyle = '#60a5fa'; ctx.fillRect(pk.x-6, pk.y-6, 12,12); }
  }

  // enemies
  for(const e of enemies){
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI*2);
    ctx.fillStyle = e.color; ctx.fill();
    // hp bar small
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(e.x - e.r, e.y - e.r - 8, e.r*2, 6);
    ctx.fillStyle = '#ef4444'; 
    const hpMax = (e.type==='boss') ? (20 + level*4) : (e.type==='tank' ? (4+Math.floor(level/2)) : 1 + Math.floor(level/4));
    const hpW = Math.max(0, (e.hp / hpMax) * e.r*2);
    ctx.fillRect(e.x - e.r, e.y - e.r - 8, hpW, 6);
  }

  // bullets
  for(const b of bullets){
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
    ctx.fillStyle = (b.from === 'player' ? '#fbbf24' : '#ef4444'); ctx.fill();
  }

  // player
  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.beginPath(); ctx.arc(0,0,player.r,0,Math.PI*2); ctx.fillStyle = '#0ea5a4'; ctx.fill();
  ctx.restore();

  // particles
  for(const p of particles){
    ctx.globalAlpha = 1 - (p.age / p.life);
    ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // Game over overlay
  if(gameOver){
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle = 'red'; ctx.font = '48px Arial'; ctx.textAlign = 'center';
    ctx.fillText('GAME OVER', W/2, H/2 - 20);
    ctx.fillStyle = '#fff'; ctx.font = '20px Arial';
    ctx.fillText(`Score: ${score}  Coins: ${coins}`, W/2, H/2 + 12);
    ctx.fillText('Press ENTER to Restart', W/2, H/2 + 48);
  }

  requestAnimationFrame(draw);
}

/* ------------------------ Shop UI ------------------------ */
function renderShop(){
  shopItemsDiv.innerHTML = '';
  shopItems.forEach(it=>{
    const wrapper = document.createElement('div');
    wrapper.className = 'shop-item';
    wrapper.innerHTML = `<strong>${weapons[it.key].name}</strong><div>Price: ${it.price}</div>`;
    const btn = document.createElement('button');
    btn.textContent = weapons[it.key].owned ? 'Owned' : 'Buy';
    btn.disabled = weapons[it.key].owned;
    btn.addEventListener('click', ()=>{
      if(coins >= it.price){
        coins -= it.price;
        weapons[it.key].owned = true;
        renderShop();
        updateUI();
        alert(`${weapons[it.key].name} purchased! Press its hotkey to equip.`);
      } else alert('Not enough coins');
    });
    wrapper.appendChild(btn);
    shopItemsDiv.appendChild(wrapper);
  });
}
shopBtn && shopBtn.addEventListener('click', ()=>{ shopDiv.classList.remove('hidden'); centerOverlay.classList.add('hidden'); renderShop(); });
closeShopBtn && closeShopBtn.addEventListener('click', ()=>{ shopDiv.classList.add('hidden'); centerOverlay.classList.remove('hidden'); });

/* ------------------------ UI / Start / Restart ------------------------ */
startBtn && startBtn.addEventListener('click', ()=>{
  centerOverlay.classList.add('hidden');
  startGame();
});

function startGame(){
  gameStarted = true; gameOver = false; score = 0; coins = 0; level = 1; enemiesToSpawn = 6;
  createPlayer();
  // give basic weapon
  weapons.pistol.owned = true;
  // optionally start bg music
  if(sounds.bg) try{ sounds.bg.play(); } catch(e){}
  spawnWave();
  requestAnimationFrame(update);
  requestAnimationFrame(draw);
}

function restartGame(){
  gameOver = false; player.hp = player.maxHp; score = 0; coins = 0; level = 1; enemiesToSpawn = 6;
  bullets = []; enemies = []; particles = []; pickups = [];
  spawnWave();
  requestAnimationFrame(update);
}

/* ------------------------ Init & helpers ------------------------ */
pickupSpawnTimer = 0;
renderShop(); // pre-render
spawnWave();
requestAnimationFrame(draw);

/* ------------------------ Notes ------------------------
- The code is intentionally balanced for demo; tweak numbers near top for difficulty.
- Fixes: single declaration of enemiesToSpawn, consistent function names, no duplicate lets.
- Mobile joystick is minimal here; you can swap in a full joystick library or expand the touch handlers.
- If you want full-file zip (with sample audio), tell me and I will generate it.
--------------------------------------------------------- */