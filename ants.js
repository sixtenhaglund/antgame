// Both ants share this color.
const ANT_COLOR = "#5a3a1e";

// The queen sits in the middle of the world.
const queen = {
  x: 0,
  y: 0,
  size: 26,
  radius: 20,        // circle used for collision (roughly her body size)
  color: ANT_COLOR,
  angle: 0
};

// "You" — the player ant you control.
const player = {
  x: 0,
  y: 0,
  size: 12,
  radius: 5,         // circle used for collision
  color: ANT_COLOR,
  speed: 3,          // how many pixels you move per frame
  angle: 0,          // direction the ant faces, in radians
  walkPhase: 0,      // counts up while walking; drives the leg swing
  moving: false,     // did it move this frame?
  biteAnim: 0,       // counts down during a bite (0 = not biting)
  biteCooldown: 0,   // counts down after a bite before you can bite again
  abilityCooldown: 0,// counts down between ability uses (E key)
  abilityAnim: 0,    // counts down during the rear-up-and-shoot animation
  type: null         // which ant type you chose (set from the menu)
};

// ---- Player ranks: pick one at the start. Bigger = slower but tougher. ----
const RANKS = {
  Minor:      { size: 9,  radius: 4, speed: 3.6, desc: "small & fast" },
  Major:      { size: 13, radius: 6, speed: 2.8, desc: "balanced" },
  Supermajor: { size: 26, radius: 13, speed: 2.0, desc: "big & strong" },
};

// ---- The ant types (we'll add more here) ----
// Every type comes in all three RANKS (Minor/Major/Supermajor), so a type is
// just a name for now. Later types can differ by color, jaws, abilities, etc.
const ANT_TYPES = [
  { name: "Basic" },
  { name: "Spitter", spitter: true },   // acid spitter: green gland on its back
];

// ---- Curved mandibles (jaws), shared by the worker and the queen ----
// frontX = where they attach at the front of the head; k = size scale.
// bite = 0 (open) .. 1 (snapped shut): the tips swing toward the center and
// jab a little further forward, so a bite looks like a real chomp.
function drawMandibles(frontX, k, bite = 0) {
  ctx.strokeStyle = "#d8cba8";
  ctx.lineWidth = 1.4 * k;
  ctx.lineCap = "round";
  const rootY = 1.5 * k;                 // how far apart the jaw hinges sit
  const rot = -0.35 + bite * 0.55;       // hinge angle: splayed open → swung shut

  // One curved jaw blade, hinged at (0,0) and curving toward the center line.
  const jaw = () => {
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(2.8 * k, -0.2 * k, 4.2 * k, 1.0 * k);
    ctx.stroke();
  };

  // upper jaw: hinge above the mouth, rotate it.
  ctx.save();
  ctx.translate(frontX, -rootY);
  ctx.rotate(rot);
  jaw();
  ctx.restore();

  // lower jaw = the same blade mirrored below (scale(1,-1) flips it vertically).
  ctx.save();
  ctx.translate(frontX, rootY);
  ctx.scale(1, -1);
  ctx.rotate(rot);
  jaw();
  ctx.restore();
}

// ---- Draw a worker ant (the player), in the old Ant War style ----
// Drawn along the +x axis (head on the right); we rotate to a.angle first.
function drawAnt(a) {
  const c = a.color;
  const k = a.size / 10;   // size scale: everything below is multiplied by k

  ctx.save();
  ctx.translate(a.x, a.y);
  ctx.rotate(a.angle || 0);

  // legs first, so the body sits on top of them.
  ctx.strokeStyle = c;
  ctx.lineWidth = Math.max(1, 1.4 * k);
  ctx.lineCap = "round";
  const pairs = [-3, 0, 3];
  for (let i = 0; i < pairs.length; i++) {
    const off = pairs[i];
    // Each leg tip swings forward/back. sin() gives a smooth -1..1 wave from
    // walkPhase; we offset each pair by i so they don't all step together, and
    // the top/bottom legs swing opposite for that alternating insect gait.
    // When the ant isn't moving, swing is 0, so the legs rest.
    const swing = a.moving ? Math.sin(a.walkPhase + i * 2) * 1.3 * k : 0;
    ctx.beginPath();
    ctx.moveTo(off * k, -2 * k); ctx.lineTo((off - 2) * k + swing, -6 * k);  // upper leg
    ctx.moveTo(off * k,  2 * k); ctx.lineTo((off - 2) * k - swing,  6 * k);  // lower leg
    ctx.stroke();
  }

  // Bite in three phases. p goes 0 → 1 over the whole bite.
  // lunge = how far forward the head is (negative = pulled back).
  // bite  = how closed the jaws are (0 open, 1 shut).
  let lunge = 0, bite = 0;
  if (a.biteAnim > 0) {
    const p = 1 - a.biteAnim / BITE_TIME;
    if (p < 0.35) {                    // wind-up: pull the head back
      const t = p / 0.35;              // 0 → 1 within this phase
      lunge = -0.8 * t;
    } else if (p < 0.6) {              // charge: shoot forward + snap shut
      const t = (p - 0.35) / 0.25;
      lunge = -0.8 + t * 1.4;          // -0.8 → +0.6 (small thrust)
      bite = t;
    } else {                           // recover: ease back, jaws reopen
      const t = (p - 0.6) / 0.4;
      lunge = 0.6 - t * 0.6;           // +0.6 → 0
      bite = 1 - t;
    }
  }

  // Ability rear-up: rise goes 0 → 1 → 0 over the ability animation. The
  // abdomen swells and pulls back as if the ant is tilting its rear up.
  let rise = 0;
  if (a.abilityAnim > 0) rise = Math.sin((1 - a.abilityAnim / ABILITY_TIME) * Math.PI);

  // body: three ellipses — head (small, front), thorax, abdomen (big, rear).
  // 3rd number = how much the bite-lunge moves this segment (only the head).
  // 4th number = how much the ability-rise affects it (only the abdomen).
  ctx.fillStyle = c;
  for (const seg of [[6, 3, 1, 0], [0, 4, 0, 0], [-7, 5, 0, 1]]) {  // [x, radius, lunge, rise]
    const segRise = rise * seg[3];
    const rad = seg[1] * (1 + segRise * 0.5);                  // swell
    const cx = (seg[0] + lunge * seg[2] - segRise * 2) * k;    // pull back
    ctx.beginPath();
    ctx.ellipse(cx, 0, rad * k, rad * 0.8 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ---- type markings, so you can tell ants apart at a glance ----
  const type = a.type;
  if (type && type.spitter) {
    // green acid gland on the abdomen — swells and pulls back with the rise.
    const glandX = (-7 - rise * 2) * k;
    const glandR = 2.6 * (1 + rise * 0.6) * k;
    ctx.fillStyle = "#aef25a";
    ctx.beginPath();
    ctx.arc(glandX, 0, glandR, 0, Math.PI * 2);
    ctx.fill();
    // a little white shine so it looks wet.
    ctx.fillStyle = "rgba(255,255,255,0.45)";
    ctx.beginPath();
    ctx.arc(glandX - 1 * k, -1 * k, glandR * 0.35, 0, Math.PI * 2);
    ctx.fill();
  }

  // curved jaws poking out the front of the head — they ride along with the
  // head's lunge, so the whole "mouth" charges forward together.
  // During the ability the mouth gapes open, so feed a negative value.
  let jawBite = bite;
  if (a.abilityAnim > 0) jawBite = -rise;
  drawMandibles((8 + lunge) * k, k * 0.6, jawBite);

  ctx.restore();
}

// ---- Draw the queen: bigger body, a crown, sitting on a nest mound ----
function drawQueen(q) {
  const c = q.color;

  // dark nest mound underneath her.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.arc(q.x, q.y, q.size * 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(q.x, q.y);
  ctx.rotate(q.angle || 0);
  const k = q.size / 13;

  // legs
  ctx.strokeStyle = c;
  ctx.lineWidth = Math.max(1.2, 1.6 * k);
  ctx.lineCap = "round";
  for (const off of [-4, 0, 4]) {
    ctx.beginPath();
    ctx.moveTo(off * k, -3 * k); ctx.lineTo((off - 2) * k, -9 * k);
    ctx.moveTo(off * k,  3 * k); ctx.lineTo((off - 2) * k,  9 * k);
    ctx.stroke();
  }

  // bigger three-segment body
  ctx.fillStyle = c;
  for (const seg of [[10, 5], [0, 7], [-12, 9]]) {
    ctx.beginPath();
    ctx.ellipse(seg[0] * k, 0, seg[1] * k, seg[1] * 0.8 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // curved jaws at the front of her head.
  drawMandibles(13 * k, k);

  ctx.restore();   // done with her rotated body

  // Floating side-view crown, a bit above the queen. Drawn in world space
  // (outside the rotate block) so it always hovers upright, not spinning
  // with her body. It's the zigzag shape: flat bottom, three points on top.
  const crownX = q.x;
  const crownY = q.y - q.size * 1.5;   // how far above her it floats
  const cw = q.size * 0.7;             // crown width
  const ch = q.size * 0.45;            // crown height
  ctx.fillStyle = "#ffd21a";
  ctx.beginPath();
  ctx.moveTo(crownX - cw / 2, crownY + ch / 2);   // bottom-left
  ctx.lineTo(crownX - cw / 2, crownY - ch / 2);   // left point
  ctx.lineTo(crownX - cw / 4, crownY);            // dip
  ctx.lineTo(crownX,          crownY - ch / 2);   // middle point
  ctx.lineTo(crownX + cw / 4, crownY);            // dip
  ctx.lineTo(crownX + cw / 2, crownY - ch / 2);   // right point
  ctx.lineTo(crownX + cw / 2, crownY + ch / 2);   // bottom-right
  ctx.closePath();
  ctx.fill();
}
