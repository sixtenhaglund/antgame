const BITE_TIME = 22;       // how many frames one bite lasts (wind-up + charge + recover)
const BITE_COOLDOWN = 45;   // extra frames you must wait after a bite before biting again

// ---- Acid spray (Spitter ability) ----
const ACID_SPEED = 7;        // how fast blobs fly
const ACID_LIFE = 38;        // frames a blob lives before fading
const ABILITY_COOLDOWN = 30; // frames between acid sprays
const ABILITY_TIME = 26;     // length of the rear-up-and-shoot animation
const SHOOT_FRAME = 9;       // the frame within it where the acid fires (later = smaller)
const acidBlobs = [];       // all acid blobs currently in the air

// Spray a fan of acid blobs out of the player's mouth, toward where it aims.
function spawnAcid() {
  const scale = player.size / 17;                 // 1.0 for a Major; smaller for Minor
  const mouthX = player.x + Math.cos(player.angle) * player.size * 0.7;
  const mouthY = player.y + Math.sin(player.angle) * player.size * 0.7;
  for (let i = -1; i <= 1; i++) {                 // three blobs in a small fan
    const a = player.angle + i * 0.18;            // spread them by angle
    acidBlobs.push({
      x: mouthX, y: mouthY,
      vx: Math.cos(a) * ACID_SPEED,
      vy: Math.sin(a) * ACID_SPEED,
      life: ACID_LIFE,
      r: (2.5 + Math.random() * 1.5) * scale,     // blob size scales with the ant
      dmg: player.acidDmg,                        // damage this blob deals (from rank)
    });
  }
}

// ---- The Weaver's net trap: SLOWS the first enemy that walks through ----
const SLOW_TIME = 240;   // 4 seconds at 60fps
const nets = [];

// Where the net would land and how big — used by both the placement and the
// red preview, so they always match exactly.
function netTarget() {
  const dist = player.size * 3;
  return {
    x: player.x + Math.cos(player.angle) * dist,
    y: player.y + Math.sin(player.angle) * dist,
    r: player.size * 1.6,   // bigger on higher ranks
  };
}

function doWeave() {
  player.food -= player.netCost;   // spend food (already checked we have enough)
  const t = netTarget();
  nets.push({ x: t.x, y: t.y, r: t.r, trapped: null, timer: 0 });
  spawnSplash(t.x, t.y, "230,235,250");   // a little puff of silk
}

// Red "hologram" showing where the net will go, while playing a Weaver.
function drawNetPreview() {
  if (!(player.type && player.type.weaver)) return;
  const t = netTarget();
  ctx.fillStyle = "rgba(255,60,60,0.12)";
  ctx.strokeStyle = "rgba(255,60,60,0.7)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
}

function updateNets() {
  for (let i = nets.length - 1; i >= 0; i--) {
    const net = nets[i];
    if (!net.trapped) {
      // armed: catch the first enemy that steps into the web.
      // (No enemies yet — this loop will check the enemy list once it exists.)
      for (const e of enemies) {
        if (e.hp <= 0) continue;
        if (Math.hypot(net.x - e.x, net.y - e.y) < net.r + e.radius) {
          net.trapped = e;
          net.timer = SLOW_TIME;
          break;
        }
      }
    } else {
      // holding an enemy: keep it slowed until the timer runs out (it escapes)
      // or it dies — then the net breaks (single use).
      net.trapped.slowed = true;
      net.timer--;
      if (net.timer <= 0 || net.trapped.hp <= 0) {
        net.trapped.slowed = false;   // it escapes
        nets.splice(i, 1);            // net breaks
      }
    }
  }
}

function drawNets() {
  for (const net of nets) {
    ctx.strokeStyle = net.trapped ? "rgba(225,235,255,0.95)" : "rgba(205,220,240,0.6)";
    ctx.lineWidth = 1.4;
    // outer ring
    ctx.beginPath();
    ctx.arc(net.x, net.y, net.r, 0, Math.PI * 2);
    ctx.stroke();
    // spokes + inner rings, so it reads as a web
    for (let a = 0; a < 8; a++) {
      const ang = (a / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(net.x, net.y);
      ctx.lineTo(net.x + Math.cos(ang) * net.r, net.y + Math.sin(ang) * net.r);
      ctx.stroke();
    }
    for (const rr of [0.35, 0.7]) {
      ctx.beginPath();
      ctx.arc(net.x, net.y, net.r * rr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}

// ---- The Stinger's sting: damage lands right on the stinger tip ----
// We replay the same transforms drawAnt uses (body twist, then tail curl about
// its pivot) to find where the tip actually is in the world.
function stingerTipPos() {
  const k = player.size / 10;
  const rise = Math.sin((1 - player.abilityAnim / ABILITY_TIME) * Math.PI);
  const theta = rise * STING_CURL;               // tail rotation
  const phi = player.angle + rise * STING_TWIST; // body twist + facing

  // tip in the body frame: rotate the tip around the tail's pivot
  const armX = (STING_TIPX - STING_PIVOT) * k;    // tip distance from the pivot
  const bx = STING_PIVOT * k + armX * Math.cos(theta);
  const by = armX * Math.sin(theta);

  // then rotate that by the body twist and shift to the player's position
  return {
    x: player.x + bx * Math.cos(phi) - by * Math.sin(phi),
    y: player.y + bx * Math.sin(phi) + by * Math.cos(phi),
  };
}

function doSting() {
  const tip = stingerTipPos();
  const hitR = player.size * 0.9;   // small hitbox around the stinger tip
  hitFoodBlocks(tip.x, tip.y, hitR, player.stingDmg);   // can break food blocks
  hitRocks(tip.x, tip.y, hitR, player.stingDmg);        // and rocks
}

// ---- Splash: tiny droplets that burst out where an attack lands ----
// color is an "r,g,b" string so acid (green) and venom (yellow) can share this.
const splashes = [];
function spawnSplash(x, y, color = "174,242,90") {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;      // fly out in a random direction
    const spd = 1 + Math.random() * 2;
    splashes.push({
      x, y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      life: 10 + Math.random() * 6,
      r: 1 + Math.random() * 1.5,
      color,
    });
  }
}
function updateSplash() {
  for (let i = splashes.length - 1; i >= 0; i--) {
    const s = splashes[i];
    s.x += s.vx;
    s.y += s.vy;
    s.vx *= 0.88;
    s.vy *= 0.88;
    s.life--;
    if (s.life <= 0) splashes.splice(i, 1);
  }
}
function drawSplash() {
  for (const s of splashes) {
    ctx.fillStyle = "rgba(" + s.color + "," + Math.min(1, s.life / 8) + ")";
    ctx.beginPath();
    ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Move every blob, slow it down, and drop it once its life runs out.
function updateAcid() {
  // Loop backwards so removing an item doesn't skip the next one.
  for (let i = acidBlobs.length - 1; i >= 0; i--) {
    const b = acidBlobs[i];
    b.x += b.vx;
    b.y += b.vy;
    b.vx *= 0.95;            // drag, so the spray slows as it travels
    b.vy *= 0.95;
    b.life--;

    // did this blob hit a food block or a rock? (circle vs circle)
    let hit = false;
    for (const fb of foodBlocks) {
      if (fb.broken) continue;
      if (Math.hypot(b.x - fb.x, b.y - fb.y) < fb.size + b.r) {
        hitFoodBlocks(b.x, b.y, b.r, b.dmg);
        hit = true;
        break;
      }
    }
    if (!hit) {
      for (const r of rocks) {
        if (r.broken) continue;
        if (Math.hypot(b.x - r.x, b.y - r.y) < r.size + b.r) {
          hitRocks(b.x, b.y, b.r, b.dmg);
          hit = true;
          break;
        }
      }
    }

    if (hit || b.life <= 0) acidBlobs.splice(i, 1);   // remove used-up blob
  }
}

function drawAcid() {
  ctx.lineCap = "round";
  for (const b of acidBlobs) {
    // fade out as life drops toward 0
    ctx.strokeStyle = "rgba(174,242,90," + (b.life / ACID_LIFE) + ")";
    ctx.lineWidth = b.r * 0.7;   // slim streak
    // draw a short line from the blob back along its direction of travel.
    // As drag slows it, vx/vy shrink, so the streak naturally gets shorter.
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - b.vx * 1.5, b.y - b.vy * 1.5);
    ctx.stroke();
  }
}

// ---- Canvas: our drawing surface ----
const canvas = document.getElementById("game");
// `let` (not const) so we can briefly point it at a small off-screen canvas to
// render the menu icons, then point it back at the screen.
let ctx = canvas.getContext("2d");   // "2d" = the toolbox for drawing shapes

// Render one ant (with its type markings) onto a small canvas for a menu icon.
function makeAntIcon(type, size) {
  const c = document.createElement("canvas");
  c.width = 76;
  c.height = 76;
  c.className = "icon";
  const prev = ctx;
  ctx = c.getContext("2d");
  ctx.translate(38, 38);         // draw around the icon's center
  drawAnt({ x: 0, y: 0, size: size, color: (type && type.color) || ANT_COLOR, angle: -Math.PI / 2, type: type || null });
  ctx = prev;                    // point ctx back at the screen
  return c;
}

// Fill the whole window, and keep filling when the window resizes.
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// ---- The map: a big square world with four colony nests in the corners ----
const WORLD = 2600;
const NEST_INSET = 280;
const nests = [
  { name: "Red",    color: "#d0453f", x: NEST_INSET,         y: NEST_INSET },
  { name: "Blue",   color: "#4f8fe0", x: WORLD - NEST_INSET, y: NEST_INSET },
  { name: "Yellow", color: "#e0c840", x: NEST_INSET,         y: WORLD - NEST_INSET },
  { name: "Green",  color: "#4faf4f", x: WORLD - NEST_INSET, y: WORLD - NEST_INSET },
];
// each nest has a queen sitting in it
for (const n of nests) {
  n.queen = { x: n.x, y: n.y, size: 26, radius: 22, color: n.color, angle: 0 };
}

// Enemy ants will live here later; empty for now so attacks/nets have a list.
const enemies = [];

// Put the player at one nest — that becomes their colony.
function spawnAtNest(i) {
  const n = nests[i];
  player.colony = n;
  player.x = n.queen.x;
  player.y = n.queen.y + 70;
}

// ---- Food blocks: break one (attack it) to drop a morsel you can pick up ----
const foodBlocks = [];
const foodPickups = [];

// Place things once at the start.
function placeAnts() {
  spawnAtNest(0);   // default; the real (random) spawn happens in startGame
  // a few food blocks scattered near the middle of the map
  foodBlocks.length = 0;
  const cx = WORLD / 2, cy = WORLD / 2;
  for (const [dx, dy] of [[-140, -40], [160, 20], [0, 170], [-40, -200]]) {
    foodBlocks.push({ x: cx + dx, y: cy + dy, size: 14, hp: 10, maxHp: 10, broken: false, respawn: 0 });
  }
}
placeAnts();

// Damage any food block near a hit point; break it → drop one food morsel.
function hitFoodBlocks(hx, hy, reach, amount) {
  for (const b of foodBlocks) {
    if (b.broken) continue;
    if (Math.hypot(hx - b.x, hy - b.y) < reach + b.size) {
      b.hp -= amount;
      spawnSplash(hx, hy, "170,130,70");         // woody chips
      if (b.hp <= 0) {
        b.broken = true;
        b.respawn = 300;                         // comes back after ~5s
        foodPickups.push({ x: b.x, y: b.y });    // drops one food
        spawnSplash(b.x, b.y, "150,210,80");
      }
    }
  }
}

function updateFood() {
  // broken blocks respawn after a while
  for (const b of foodBlocks) {
    if (b.broken && b.respawn > 0) {
      b.respawn--;
      if (b.respawn === 0) { b.broken = false; b.hp = b.maxHp; }
    }
  }
  // walk over a morsel to collect it (+1 food)
  for (let i = foodPickups.length - 1; i >= 0; i--) {
    const p = foodPickups[i];
    if (Math.hypot(player.x - p.x, player.y - p.y) < player.radius + 10) {
      player.food = Math.min(player.maxFood, player.food + 1);
      foodPickups.splice(i, 1);
    }
  }
}

function drawFood() {
  for (const b of foodBlocks) {
    if (b.broken) continue;
    const s = b.size;
    ctx.fillStyle = "#6ab04a";
    ctx.fillRect(b.x - s, b.y - s, s * 2, s * 2);
    ctx.strokeStyle = "#3a6a2a";
    ctx.lineWidth = 2;
    ctx.strokeRect(b.x - s, b.y - s, s * 2, s * 2);
    ctx.fillStyle = "#12200a";
    ctx.font = "8px monospace";
    ctx.textAlign = "center";
    ctx.fillText("FOOD", b.x, b.y + 3);
    // damage bar once it's been hit
    if (b.hp < b.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(b.x - s, b.y - s - 6, s * 2, 3);
      ctx.fillStyle = "#5ad25a";
      ctx.fillRect(b.x - s, b.y - s - 6, s * 2 * (b.hp / b.maxHp), 3);
    }
  }
  // dropped morsels
  for (const p of foodPickups) {
    ctx.fillStyle = "#b6e05a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#3a6a2a";
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
}

// ---- Breakable rocks: obstacles you smash through (like the first game) ----
const rocks = [];
function placeRocks() {
  rocks.length = 0;
  const s = 26, step = 52;   // tile half-size and grid spacing (tiles = 52px)
  for (let x = step / 2; x < WORLD; x += step) {
    for (let y = step / 2; y < WORLD; y += step) {
      // leave a clear plaza around each nest
      let clear = false;
      for (const n of nests) {
        if (Math.hypot(x - n.x, y - n.y) < 240) clear = true;
      }
      // and don't bury the food blocks
      for (const fb of foodBlocks) {
        if (Math.hypot(x - fb.x, y - fb.y) < 50) clear = true;
      }
      if (clear) continue;
      rocks.push({ x, y, size: s, radius: s, hp: 12, maxHp: 12, broken: false });
    }
  }
}

// Damage any rock near a hit point; smash it once its HP hits 0.
function hitRocks(hx, hy, reach, amount) {
  for (const r of rocks) {
    if (r.broken) continue;
    if (Math.hypot(hx - r.x, hy - r.y) < reach + r.size) {
      r.hp -= amount;
      spawnSplash(hx, hy, "150,150,155");   // grey chips
      if (r.hp <= 0) {
        r.broken = true;
        spawnSplash(r.x, r.y, "120,120,125");
      }
    }
  }
}

function drawRocks() {
  // only draw the tiles inside the camera view (there are thousands total)
  const halfW = canvas.width / 2 / zoom, halfH = canvas.height / 2 / zoom;
  const left = player.x - halfW - 30, right = player.x + halfW + 30;
  const top = player.y - halfH - 30, bottom = player.y + halfH + 30;
  for (const r of rocks) {
    if (r.broken) continue;
    if (r.x < left || r.x > right || r.y < top || r.y > bottom) continue;
    const s = r.size;
    ctx.fillStyle = "#6b6b70";
    ctx.fillRect(r.x - s, r.y - s, s * 2, s * 2);
    ctx.strokeStyle = "#3f3f45";
    ctx.lineWidth = 2;
    ctx.strokeRect(r.x - s, r.y - s, s * 2, s * 2);
    // damage bar once it's been hit
    if (r.hp < r.maxHp) {
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(r.x - s, r.y - s - 6, s * 2, 3);
      ctx.fillStyle = "#d0d0d0";
      ctx.fillRect(r.x - s, r.y - s - 6, s * 2 * (r.hp / r.maxHp), 3);
    }
  }
}

// ---- Game state: "menu" until a rank AND type are chosen, then "playing" ----
let gameState = "menu";
let chosenRank = null;   // remembered between step 1 and step 2

const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");

// Build a card button: an ant icon on top, a name, then a description.
function makeCard(icon, name, descText, onClick) {
  const btn = document.createElement("button");
  btn.appendChild(icon);
  const nm = document.createElement("div");
  nm.className = "name";
  nm.textContent = name;
  btn.appendChild(nm);
  if (descText) {
    const ds = document.createElement("small");
    ds.textContent = descText;
    btn.appendChild(ds);
  }
  btn.addEventListener("click", onClick);
  return btn;
}

// Step 1: one card per rank (icon sized to show the rank's size).
const ranksDiv = document.getElementById("ranks");
for (const name in RANKS) {
  const rank = RANKS[name];
  const icon = makeAntIcon(null, rank.size * 0.62);   // a plain ant, sized by rank
  ranksDiv.appendChild(makeCard(icon, name, rank.desc, () => chooseRank(name)));
}

// Step 2: one card per type (icon shows the type's markings).
const typesDiv = document.getElementById("types");
for (const type of ANT_TYPES) {
  const icon = makeAntIcon(type, 16);
  typesDiv.appendChild(makeCard(icon, type.name, type.ability, () => startGame(type)));
}

// Back button returns from the type step to the rank step.
document.getElementById("backBtn").addEventListener("click", () => {
  step2.style.display = "none";
  step1.style.display = "flex";
});

function chooseRank(rankName) {
  chosenRank = rankName;
  step1.style.display = "none";    // hide rank step
  step2.style.display = "flex";    // show type step
}

function startGame(type) {
  const rank = RANKS[chosenRank];
  player.size = rank.size;         // apply the chosen rank...
  player.radius = rank.radius;
  // a type can override speed/HP per rank (Armored); else use the rank's value.
  player.speed = (type.speed && type.speed[chosenRank]) || rank.speed;
  player.maxHp = (type.hp && type.hp[chosenRank]) || rank.hp;
  player.hp = player.maxHp;
  player.dmg = (type.dmg && type.dmg[chosenRank]) || rank.dmg;   // type may weaken bite
  player.acidDmg = rank.acidDmg;
  player.stingDmg = rank.stingDmg;
  player.color = type.color || ANT_COLOR;   // some types recolor the body
  player.food = player.maxFood;             // start with a full food bar
  player.netCost = (type.netCost && type.netCost[chosenRank]) || 0;
  player.type = type;              // ...and the chosen type (for its markings)
  spawnAtNest(Math.floor(Math.random() * nests.length));   // random corner colony
  document.getElementById("menu").style.display = "none";  // hide the menu
  gameState = "playing";
}

// ---- Update: move things ----
function update() {
  if (gameState !== "playing") return;   // ignore controls while in the menu

  // The camera is centered on the player and zoomed. Convert the mouse from
  // screen space to world space so aiming still lines up: undo the same
  // transform draw() applies below (player sits at the screen center).
  const cx = canvas.width / 2, cy = canvas.height / 2;
  const worldMouseX = (mouse.x - cx) / zoom + player.x;
  const worldMouseY = (mouse.y - cy) / zoom + player.y;

  // Face the cursor. atan2 gives the angle from the ant to the mouse.
  // When the cursor is on top of the ant, dx/dy flip around and make it spin,
  // so only re-aim once the cursor is past a "no-spin" range around the ant.
  // Tying it to the ant's size means it covers the whole body — raise the
  // multiplier for a bigger calm zone, lower it to make aiming twitchier.
  const noSpinRange = player.size * 0.3;
  const dx = worldMouseX - player.x;
  const dy = worldMouseY - player.y;
  const distance = Math.hypot(dx, dy);
  if (distance > noSpinRange) {
    player.angle = Math.atan2(dy, dx);
  }

  // Move in fixed screen directions, no matter which way the ant faces.
  // The mouse only aims; WASD slide the ant around. Aiming one way while
  // moving another is what "strafing" feels like.
  const startX = player.x, startY = player.y;
  if (keys["w"] || keys["arrowup"])    player.y -= player.speed;
  if (keys["s"] || keys["arrowdown"])  player.y += player.speed;
  if (keys["a"] || keys["arrowleft"])  player.x -= player.speed;
  if (keys["d"] || keys["arrowright"]) player.x += player.speed;

  // Collide with every queen and unbroken rock (their hitboxes).
  for (const n of nests) keepApart(player, n.queen);
  // use a body-sized radius against rocks so the ant doesn't visually overlap
  const bodyR = player.size * 0.85;
  for (const r of rocks) {
    if (r.broken) continue;
    // cheap skip of far rocks before the real collision test
    if (Math.abs(r.x - player.x) > 90 || Math.abs(r.y - player.y) > 90) continue;
    keepOutOfRock(player, r, bodyR);   // rocks block your path until smashed
  }

  // Stay inside the world bounds.
  const m = player.radius;
  player.x = Math.max(m, Math.min(WORLD - m, player.x));
  player.y = Math.max(m, Math.min(WORLD - m, player.y));

  // update food blocks (respawn) and pick up any morsels we're standing on
  updateFood();

  // Walking animation: did we actually move? If so, advance the leg swing.
  player.moving = (player.x !== startX || player.y !== startY);
  if (player.moving) player.walkPhase += 0.35;

  // Biting: click to start a bite, but only if we're not mid-bite AND the
  // cooldown has run out. Starting a bite refills the cooldown timer.
  if (mouse.down && player.biteAnim <= 0 && player.biteCooldown <= 0) {
    player.biteAnim = BITE_TIME;
    player.biteCooldown = BITE_TIME + BITE_COOLDOWN;
  }
  // The bite lands partway through the animation (during the charge). At that
  // frame, damage anything right in front of the mouth.
  if (player.biteAnim === 12) {
    const mx = player.x + Math.cos(player.angle) * player.size * 1.2;
    const my = player.y + Math.sin(player.angle) * player.size * 1.2;
    hitFoodBlocks(mx, my, player.size * 0.9, player.dmg);   // can break food blocks
    hitRocks(mx, my, player.size * 0.9, player.dmg);        // and rocks
  }
  if (player.biteAnim > 0) player.biteAnim--;
  if (player.biteCooldown > 0) player.biteCooldown--;

  // Ability (E key): any type that has one can start its ability animation.
  const hasAbility = player.type && (player.type.spitter || player.type.stinger || player.type.weaver);
  if (keys["e"] && player.abilityCooldown <= 0 && player.abilityAnim <= 0 && hasAbility) {
    // A Weaver can only weave if it has enough food for a net.
    const weaverBlocked = player.type.weaver && player.food < player.netCost;
    if (!weaverBlocked) {
      player.abilityAnim = ABILITY_TIME;
      player.abilityCooldown = ABILITY_TIME + ABILITY_COOLDOWN;
      // The net drops the instant you press E (no wind-up).
      if (player.type.weaver) doWeave();
    }
  }
  // Spitter/Stinger effects fire partway through the animation, at the peak.
  if (player.abilityAnim === SHOOT_FRAME) {
    if (player.type.spitter) spawnAcid();
    else if (player.type.stinger) doSting();
  }
  if (player.abilityAnim > 0) player.abilityAnim--;
  if (player.abilityCooldown > 0) player.abilityCooldown--;

  // Move the acid blobs that are in the air, and any splash droplets.
  updateAcid();
  updateSplash();
  updateNets();
}

// ---- Circle collision: if `a` overlaps `b`, push `a` out to b's edge ----
function keepApart(a, b) {
  const minDist = a.radius + b.radius;   // how far apart their centers must be
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const dist = Math.hypot(dx, dy);
  if (dist < minDist && dist > 0) {
    // (dx/dist, dy/dist) is a unit arrow pointing from b to a. Placing `a`
    // exactly minDist along it puts it right on b's edge, no longer overlapping.
    a.x = b.x + (dx / dist) * minDist;
    a.y = b.y + (dy / dist) * minDist;
  }
}

// ---- Circle vs square: push circle `a` out of the square rock `r` ----
// (Rocks are squares, so a circle test would let you clip the corners.)
// `rad` is the collision radius to use — for rocks we pass a bigger one than
// a.radius, so the ant's drawn body doesn't visually overlap the stone.
function keepOutOfRock(a, r, rad) {
  const s = r.size;
  // closest point on the rock's box to the circle's center
  const nx = Math.max(r.x - s, Math.min(a.x, r.x + s));
  const ny = Math.max(r.y - s, Math.min(a.y, r.y + s));
  const dx = a.x - nx, dy = a.y - ny;
  const dist = Math.hypot(dx, dy);
  if (dist === 0) {
    // center is inside the rock — shove out the nearest wall
    const pen = [a.x - (r.x - s), (r.x + s) - a.x, a.y - (r.y - s), (r.y + s) - a.y];
    const min = Math.min(...pen);
    if (min === pen[0]) a.x = r.x - s - rad;
    else if (min === pen[1]) a.x = r.x + s + rad;
    else if (min === pen[2]) a.y = r.y - s - rad;
    else a.y = r.y + s + rad;
  } else if (dist < rad) {
    const push = rad - dist;           // move out along the closest-point direction
    a.x += (dx / dist) * push;
    a.y += (dy / dist) * push;
  }
}

// ---- Ground: a faint grid of dots so movement is visible ----
function drawGround() {
  const spacing = 60;   // pixels between dots in world space
  // Only draw the dots that fall inside the visible area, so we don't waste
  // time drawing the whole (infinite) world. Figure out the world edges of
  // the screen, then round to the nearest grid line.
  const halfW = canvas.width / 2 / zoom;
  const halfH = canvas.height / 2 / zoom;
  const left   = player.x - halfW, right  = player.x + halfW;
  const top    = player.y - halfH, bottom = player.y + halfH;

  ctx.fillStyle = "#2a2011";
  const startX = Math.floor(left / spacing) * spacing;
  const startY = Math.floor(top / spacing) * spacing;
  for (let x = startX; x < right; x += spacing) {
    for (let y = startY; y < bottom; y += spacing) {
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ---- Draw the four colony nests (mound + queen + label) ----
function drawColonyNests() {
  for (const n of nests) {
    // translucent colored ground marking the colony
    ctx.save();
    ctx.globalAlpha = 0.14;
    ctx.fillStyle = n.color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, 130, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    drawQueen(n.queen);

    // name label (marks yours)
    ctx.fillStyle = n.color;
    ctx.font = "14px monospace";
    ctx.textAlign = "center";
    ctx.fillText(n.name + (n === player.colony ? " (you)" : ""), n.x, n.y - 46);
  }
}

// ---- The world border, so you can see the edges of the map ----
function drawWorldBorder() {
  ctx.strokeStyle = "#4a3820";
  ctx.lineWidth = 6;
  ctx.strokeRect(0, 0, WORLD, WORLD);
}

// ---- Colored ring around the player, showing their colony ----
function drawColonyRing() {
  if (!player.colony) return;
  ctx.strokeStyle = player.colony.color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.size + 5, 0, Math.PI * 2);
  ctx.stroke();
}

// ---- HP bar above the player (drawn in world space, above the ant) ----
function drawPlayerHp() {
  const w = player.size * 2.6;
  const bx = player.x - w / 2;
  const by = player.y - player.size - 16;
  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(bx, by, w, 4);
  ctx.fillStyle = "#5ad25a";
  ctx.fillRect(bx, by, w * (player.hp / player.maxHp), 4);
}

// ---- Cooldown bars for bite + ability (drawn in screen space, bottom) ----
function drawCooldownBars() {
  const bars = [];
  // Weavers show a food bar (raw = shown as a level, not a cooldown).
  if (player.type && player.type.weaver) {
    bars.push({ label: "FOOD", frac: player.food / player.maxFood, color: "#9ad84a", raw: true });
  }
  // frac goes 0 (just used) → 1 (ready) as the cooldown counts down.
  bars.push({ label: "BITE", frac: 1 - player.biteCooldown / (BITE_TIME + BITE_COOLDOWN), color: "#e8b84a" });
  const hasAbility = player.type && (player.type.spitter || player.type.stinger || player.type.weaver);
  if (hasAbility) {
    bars.push({ label: "E", frac: 1 - player.abilityCooldown / (ABILITY_TIME + ABILITY_COOLDOWN), color: "#6ad0e0" });
  }

  const barW = 150, barH = 8;
  const x = canvas.width / 2 - barW / 2;
  let y = canvas.height - 24 - bars.length * 14;
  ctx.font = "10px monospace";
  ctx.textAlign = "right";
  for (const b of bars) {
    const f = Math.max(0, Math.min(1, b.frac));
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x, y, barW, barH);
    // food shows its level directly; cooldowns are dim while charging, bright when ready
    ctx.fillStyle = b.raw ? b.color : (f >= 1 ? b.color : "rgba(255,255,255,0.35)");
    ctx.fillRect(x, y, barW * f, barH);
    ctx.fillStyle = "#e8dcc0";
    ctx.fillText(b.label, x - 6, y + barH);
    y += 14;
  }
}

// ---- Draw: paint the frame ----
function draw() {
  // Clear the screen by repainting the soil background (before zoom, so it
  // always covers the whole window no matter the zoom level).
  ctx.fillStyle = "#1a1207";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Camera: put the player at the center of the screen, zoomed. Reading the
  // transform bottom-up: move the world so the player is at 0,0, scale it,
  // then shift it to the middle of the screen.
  ctx.save();
  const cx = canvas.width / 2, cy = canvas.height / 2;
  ctx.translate(cx, cy);
  ctx.scale(zoom, zoom);
  ctx.translate(-player.x, -player.y);

  drawGround();
  drawWorldBorder();
  drawFood();
  drawColonyNests();  // the four corner nests + queens
  drawRocks();     // breakable obstacle blocks
  drawNetPreview();// red hologram of where a Weaver's net will land
  drawNets();      // net traps (drawn over the trapped enemy)
  drawAcid();      // under the ant, so the head hides where it spawns
  drawAnt(player);
  drawColonyRing();// colored ring showing your colony
  drawPlayerHp();  // hp bar above your ant
  drawSplash();    // splashes on top, since they happen out at the target

  ctx.restore();   // undo the camera so next frame starts clean

  // screen-fixed UI (drawn after the camera reset, so it doesn't move/zoom)
  if (gameState === "playing") drawCooldownBars();
}

// ---- The game loop: runs ~60 times per second ----
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);   // ask the browser to run loop() again next frame
}
placeRocks();     // scatter the breakable rocks across the map
loop();
