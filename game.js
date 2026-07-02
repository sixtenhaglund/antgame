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
  for (const d of dummies) {
    if (d.hp <= 0) continue;
    if (Math.hypot(tip.x - d.x, tip.y - d.y) < d.radius + hitR) {
      hurtDummy(d, player.stingDmg);
      spawnSplash(tip.x, tip.y, "220,60,50");   // red particles at the stinger tip
    }
  }
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

    // did this blob hit a dummy? (circle vs circle)
    let hit = false;
    for (const d of dummies) {
      if (d.hp <= 0) continue;
      if (Math.hypot(b.x - d.x, b.y - d.y) < d.radius + b.r) {
        hurtDummy(d, b.dmg);
        spawnSplash(b.x, b.y);   // tiny splash where it lands
        hit = true;
        break;
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
const ctx = canvas.getContext("2d");   // "2d" = the toolbox for drawing shapes

// Fill the whole window, and keep filling when the window resizes.
function resize() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

// Place the ants once at the start.
function placeAnts() {
  queen.x = canvas.width / 2;
  queen.y = canvas.height / 2;
  player.x = canvas.width / 2 - 120;
  player.y = canvas.height / 2 + 80;
}
placeAnts();

// ---- Test dummies: one per rank, to practice attacks on ----
const dummies = [];
function placeDummies() {
  const names = Object.keys(RANKS);
  const spacing = 95;
  const startX = queen.x - ((names.length - 1) * spacing) / 2;
  for (let i = 0; i < names.length; i++) {
    const rank = RANKS[names[i]];
    dummies.push({
      x: startX + i * spacing,
      y: queen.y - 190,          // up above the queen
      size: rank.size,
      radius: rank.radius,
      hp: rank.hp,
      maxHp: rank.hp,
      name: names[i],
      angle: Math.PI / 2,        // facing down, toward where you approach from
      respawn: 0,                // frames until it comes back after dying
    });
  }
}

// Hurt a dummy; if it dies, start its respawn countdown.
function hurtDummy(d, amount) {
  d.hp -= amount;
  if (d.hp <= 0) {
    d.hp = 0;
    d.respawn = 90;   // ~1.5 seconds, then back to full
  }
}

function updateDummies() {
  for (const d of dummies) {
    if (d.hp <= 0 && d.respawn > 0) {
      d.respawn--;
      if (d.respawn === 0) d.hp = d.maxHp;   // revive
    }
  }
}

function drawDummies() {
  for (const d of dummies) {
    if (d.hp <= 0) {
      // faint circle where it's respawning
      ctx.fillStyle = "rgba(140,140,140,0.25)";
      ctx.beginPath();
      ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    // draw the dummy in a reddish tint so it reads as a target
    drawAnt({ x: d.x, y: d.y, size: d.size, color: "#8a4a3a", angle: d.angle });

    // health bar above it
    const w = d.size * 2.4;
    const bx = d.x - w / 2;
    const by = d.y - d.size - 14;
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(bx, by, w, 4);
    ctx.fillStyle = "#5ad25a";
    ctx.fillRect(bx, by, w * (d.hp / d.maxHp), 4);
    // label with numbers
    ctx.fillStyle = "#e8dcc0";
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.fillText(d.name + "  " + Math.ceil(d.hp) + "/" + d.maxHp, d.x, by - 3);
  }
}

// ---- Game state: "menu" until a rank AND type are chosen, then "playing" ----
let gameState = "menu";
let chosenRank = null;   // remembered between step 1 and step 2

const step1 = document.getElementById("step1");
const step2 = document.getElementById("step2");

// Step 1: one button per rank. Clicking one moves us to the type step.
const ranksDiv = document.getElementById("ranks");
for (const name in RANKS) {
  const rank = RANKS[name];
  const btn = document.createElement("button");
  btn.innerHTML = name + "<small>" + rank.desc + "</small>";
  btn.addEventListener("click", () => chooseRank(name));
  ranksDiv.appendChild(btn);
}

// Step 2: one button per type. Clicking one starts the game.
const typesDiv = document.getElementById("types");
for (const type of ANT_TYPES) {
  const btn = document.createElement("button");
  btn.textContent = type.name;
  btn.addEventListener("click", () => startGame(type));
  typesDiv.appendChild(btn);
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
  // some types modify base stats (Armoured: tougher but slower)
  player.speed = rank.speed * (type.speedMult || 1);
  player.maxHp = Math.round(rank.hp * (type.hpMult || 1));
  player.hp = player.maxHp;
  player.dmg = rank.dmg;
  player.acidDmg = rank.acidDmg;
  player.stingDmg = rank.stingDmg;
  player.type = type;              // ...and the chosen type (for its markings)
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

  // Stop the player from walking through the queen.
  keepApart(player, queen);

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
  // frame, damage any dummy right in front of the mouth.
  if (player.biteAnim === 12) {
    const mx = player.x + Math.cos(player.angle) * player.size * 1.2;
    const my = player.y + Math.sin(player.angle) * player.size * 1.2;
    for (const d of dummies) {
      if (d.hp <= 0) continue;
      if (Math.hypot(mx - d.x, my - d.y) < d.radius + player.size * 0.9) {
        hurtDummy(d, player.dmg);
        spawnSplash(mx, my, "220,60,50");   // red particles at the mouth
      }
    }
  }
  if (player.biteAnim > 0) player.biteAnim--;
  if (player.biteCooldown > 0) player.biteCooldown--;

  updateDummies();

  // Ability (E key): any type that has one can start its ability animation.
  const hasAbility = player.type && (player.type.spitter || player.type.stinger);
  if (keys["e"] && player.abilityCooldown <= 0 && player.abilityAnim <= 0 && hasAbility) {
    player.abilityAnim = ABILITY_TIME;
    player.abilityCooldown = ABILITY_TIME + ABILITY_COOLDOWN;
  }
  // The ability's effect fires partway through the animation. Each type does
  // its own thing at that moment.
  if (player.abilityAnim === SHOOT_FRAME) {
    if (player.type.spitter) spawnAcid();
    else if (player.type.stinger) doSting();
  }
  if (player.abilityAnim > 0) player.abilityAnim--;
  if (player.abilityCooldown > 0) player.abilityCooldown--;

  // Move the acid blobs that are in the air, and any splash droplets.
  updateAcid();
  updateSplash();
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

// ---- TEMP: a grid of every type × rank, so we can see them all.
// Each TYPE is a row; the three RANKS (Minor/Major/Supermajor) are the columns.
// Adding to RANKS or ANT_TYPES grows the grid automatically. ----
function drawTypeGrid() {
  const rankNames = Object.keys(RANKS);   // the columns
  const colSpacing = 80;
  const rowSpacing = 110;
  const startX = queen.x - ((rankNames.length - 1) * colSpacing) / 2;
  const startY = queen.y + 130;

  ctx.fillStyle = "#e8dcc0";
  ctx.font = "11px monospace";

  // column headers: the rank names across the top
  ctx.textAlign = "center";
  for (let c = 0; c < rankNames.length; c++) {
    ctx.fillText(rankNames[c], startX + c * colSpacing, startY - 32);
  }

  // one row per type
  for (let r = 0; r < ANT_TYPES.length; r++) {
    const y = startY + r * rowSpacing;

    // row label: the type name, off to the left, with its ability under it
    const type = ANT_TYPES[r];
    ctx.textAlign = "right";
    ctx.fillStyle = "#e8dcc0";
    ctx.font = "11px monospace";
    ctx.fillText(type.name, startX - colSpacing * 0.7, y);
    if (type.ability) {
      ctx.fillStyle = "#b8a888";
      ctx.font = "9px monospace";
      ctx.fillText(type.ability, startX - colSpacing * 0.7, y + 13);
    }

    // one ant per rank across the row, drawn with this row's type markings
    for (let c = 0; c < rankNames.length; c++) {
      const rank = RANKS[rankNames[c]];
      const x = startX + c * colSpacing;
      drawAnt({ x, y, size: rank.size, color: ANT_COLOR, angle: 0, type: ANT_TYPES[r] });

      // stats under each ant: hit points (with any type bonus) and bite damage
      const hp = Math.round(rank.hp * (type.hpMult || 1));
      ctx.fillStyle = "#b8a888";
      ctx.font = "9px monospace";
      ctx.textAlign = "center";
      ctx.fillText("HP " + hp + "  DMG " + rank.dmg, x, y + rank.size + 16);
      // ability damage for this rank, if the type has an ability
      if (type.abilityStat) {
        ctx.fillStyle = "#aef25a";
        ctx.fillText(type.abilityLabel + " " + rank[type.abilityStat], x, y + rank.size + 27);
      }
    }
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
  drawQueen(queen);
  drawTypeGrid();  // TEMP: the type × rank grid
  drawDummies();   // practice targets
  drawAcid();      // under the ant, so the head hides where it spawns
  drawAnt(player);
  drawSplash();    // splashes on top, since they happen out at the target

  ctx.restore();   // undo the camera so next frame starts clean
}

// ---- The game loop: runs ~60 times per second ----
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);   // ask the browser to run loop() again next frame
}
placeDummies();   // after the dummies array + queen position both exist
loop();
