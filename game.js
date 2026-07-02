const BITE_TIME = 22;   // how many frames one bite lasts (wind-up + charge + recover)

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

// ---- Update: move things ----
function update() {
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

  // Biting animation: click to start a bite (if not already mid-bite),
  // then count the timer down to zero each frame.
  if (mouse.down && player.biteAnim <= 0) player.biteAnim = BITE_TIME;
  if (player.biteAnim > 0) player.biteAnim--;
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
  drawAnt(player);

  ctx.restore();   // undo the camera so next frame starts clean
}

// ---- The game loop: runs ~60 times per second ----
function loop() {
  update();
  draw();
  requestAnimationFrame(loop);   // ask the browser to run loop() again next frame
}
loop();
