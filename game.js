const BITE_TIME = 22;       // how many frames one bite lasts (wind-up + charge + recover)
const BITE_COOLDOWN = 45;   // extra frames you must wait after a bite before biting again

// ---- Acid spray (Spitter ability) ----
const ACID_SPEED = 7;        // how fast blobs fly
const ACID_LIFE = 38;        // frames a blob lives before fading
const ABILITY_COOLDOWN = 30; // frames between acid sprays
const acidBlobs = [];       // all acid blobs currently in the air

// Spray a fan of acid blobs out of the player's mouth, toward where it aims.
function spawnAcid() {
  const mouthX = player.x + Math.cos(player.angle) * player.size * 1.3;
  const mouthY = player.y + Math.sin(player.angle) * player.size * 1.3;
  for (let i = -1; i <= 1; i++) {                 // three blobs in a small fan
    const a = player.angle + i * 0.18;            // spread them by angle
    acidBlobs.push({
      x: mouthX, y: mouthY,
      vx: Math.cos(a) * ACID_SPEED,
      vy: Math.sin(a) * ACID_SPEED,
      life: ACID_LIFE,
      r: 2.5 + Math.random() * 1.5,               // slight size variety
    });
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
    if (b.life <= 0) acidBlobs.splice(i, 1);   // remove dead blob
  }
}

function drawAcid() {
  for (const b of acidBlobs) {
    // fade out as life drops toward 0
    ctx.fillStyle = "rgba(174,242,90," + (b.life / ACID_LIFE) + ")";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
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
  player.speed = rank.speed;
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
  if (player.biteAnim > 0) player.biteAnim--;
  if (player.biteCooldown > 0) player.biteCooldown--;

  // Ability (E key): the Spitter sprays acid. Gated by its own cooldown.
  if (keys["e"] && player.abilityCooldown <= 0 && player.type && player.type.spitter) {
    spawnAcid();
    player.abilityCooldown = ABILITY_COOLDOWN;
  }
  if (player.abilityCooldown > 0) player.abilityCooldown--;

  // Move the acid blobs that are in the air.
  updateAcid();
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
  const rowSpacing = 95;
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

    // row label: the type name, off to the left
    ctx.textAlign = "right";
    ctx.fillText(ANT_TYPES[r].name, startX - colSpacing * 0.7, y);

    // one ant per rank across the row, drawn with this row's type markings
    for (let c = 0; c < rankNames.length; c++) {
      const rank = RANKS[rankNames[c]];
      drawAnt({ x: startX + c * colSpacing, y, size: rank.size, color: ANT_COLOR, angle: 0, type: ANT_TYPES[r] });
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
  drawAnt(player);
  drawAcid();

  ctx.restore();   // undo the camera so next frame starts clean
}

// ---- The game loop: runs ~60 times per second ----
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);   // ask the browser to run loop() again next frame
}
loop();
