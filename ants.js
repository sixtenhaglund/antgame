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
  hp: 45, maxHp: 45, // health (set from the chosen rank)
  dmg: 8,            // bite damage (set from the chosen rank)
  acidDmg: 4,        // acid damage per blob (set from the chosen rank)
  stingDmg: 15,      // venom sting damage (set from the chosen rank)
  type: null         // which ant type you chose (set from the menu)
};

// ---- Player ranks: pick one at the start. Bigger = slower but tougher. ----
const RANKS = {
  Minor:      { size: 9,  radius: 4,  speed: 3.6, hp: 20, dmg: 4,  acidDmg: 3, stingDmg: 8,  desc: "small & fast" },
  Major:      { size: 17, radius: 8,  speed: 2.8, hp: 50, dmg: 8,  acidDmg: 4, stingDmg: 15, desc: "balanced" },
  Supermajor: { size: 26, radius: 13, speed: 2.0, hp: 100, dmg: 15, acidDmg: 5, stingDmg: 25, desc: "big & strong" },
};

// ---- The ant types (we'll add more here) ----
// Every type comes in all three RANKS (Minor/Major/Supermajor), so a type is
// just a name for now. Later types can differ by color, jaws, abilities, etc.
const ANT_TYPES = [
  { name: "Basic" },
  { name: "Spitter", spitter: true, ability: "E: spray 3 acid blobs (ranged)", abilityStat: "acidDmg", abilityLabel: "ACID",
    dmg: { Minor: 2, Major: 4, Supermajor: 8 } },   // weak bite (its power is the acid)
  { name: "Stinger", stinger: true, ability: "E: venom sting (melee)", abilityStat: "stingDmg", abilityLabel: "STING",
    dmg: { Minor: 2, Major: 5, Supermajor: 10 } },   // weak bite (its power is the sting)
  { name: "Armored", armored: true, color: "#3a2410", ability: "tanky: +HP, no ability",
    hp:    { Minor: 35,  Major: 80, Supermajor: 200 },   // explicit HP per rank
    speed: { Minor: 2.5, Major: 2,  Supermajor: 1 } },   // explicit speed per rank
  { name: "Weaver", weaver: true, ability: "E: set a net trap (slows 4s)",
    hp:    { Minor: 15,  Major: 35,  Supermajor: 70 },    // fragile
    speed: { Minor: 4.2, Major: 3.4, Supermajor: 2.6 } }, // fast
];

// ---- Stinger jab numbers, shared by drawAnt (the look) and doSting (the hit)
// so the hitbox lands exactly on the drawn stinger tip. ----
const STING_TWIST = 1.3;   // whole-body twist at the peak (radians)
const STING_CURL  = 2.2;   // how far the tail rotates over (radians)
const STING_PIVOT = -2;    // x of the tail's pivot (in body units, ×k)
const STING_TIPX  = -18;   // x of the stinger tip (in body units, ×k)

// ---- Curved mandibles (jaws), shared by the worker and the queen ----
// frontX = where they attach at the front of the head; k = size scale.
// bite = 0 (open) .. 1 (snapped shut): the tips swing toward the center and
// jab a little further forward, so a bite looks like a real chomp.
function drawMandibles(frontX, k, bite = 0) {
  ctx.fillStyle = "#d8cba8";
  const rootY = 1.5 * k;                 // how far apart the jaw hinges sit
  const rot = -0.35 + bite * 0.55;       // hinge angle: splayed open → swung shut

  // One curved jaw blade, hinged at (0,0): wide at the base, curving toward
  // the center line and tapering to a sharp point (spiky) at the tip.
  const jaw = () => {
    const hw = 0.9 * k;                  // half-width at the base
    ctx.beginPath();
    ctx.moveTo(0, -hw);                                            // base, outer corner
    ctx.quadraticCurveTo(2.8 * k, -0.2 * k - hw, 4.2 * k, 1.0 * k);  // outer edge → point
    ctx.quadraticCurveTo(2.8 * k, -0.2 * k + hw, 0, hw);          // inner edge → base
    ctx.closePath();
    ctx.fill();
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

  // Ability animation: rise goes 0 → 1 → 0 over the ability. (Computed up
  // here because the Stinger's spin below needs it.)
  let rise = 0;
  if (a.abilityAnim > 0) rise = Math.sin((1 - a.abilityAnim / ABILITY_TIME) * Math.PI);

  ctx.save();
  ctx.translate(a.x, a.y);
  // Stinger also gives the whole body a twist as it jabs.
  const spin = (a.type && a.type.stinger) ? rise * STING_TWIST : 0;
  ctx.rotate((a.angle || 0) + spin);

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

  const isStinger = a.type && a.type.stinger;
  // Spitter's abdomen swells and pulls back to shoot.
  const rearUp = (a.type && a.type.spitter) ? rise : 0;

  ctx.fillStyle = c;

  // head and thorax — always drawn straight along the body.
  for (const seg of [[6, 3, 1], [0, 4, 0]]) {   // [center-x, radius, lunge]
    const cx = (seg[0] + lunge * seg[2]) * k;
    ctx.beginPath();
    ctx.ellipse(cx, 0, seg[1] * k, seg[1] * 0.8 * k, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // abdomen (the big rear segment)
  if (isStinger) {
    // Curl the whole tail around a pivot near the body, so it swings up and
    // OVER toward the front — bringing the straight stinger to face forward.
    ctx.save();
    const pivotX = STING_PIVOT * k;
    const tailCurl = rise * STING_CURL;          // curls over at the peak of the jab
    ctx.translate(pivotX, 0);
    ctx.rotate(tailCurl);
    ctx.translate(-pivotX, 0);

    ctx.fillStyle = c;
    ctx.beginPath();
    ctx.ellipse(-7 * k, 0, 5 * k, 5 * 0.8 * k, 0, 0, Math.PI * 2);
    ctx.fill();

    // straight, fixed stinger out the back — the curl is what turns it forward.
    const baseX = -11 * k, tipX = STING_TIPX * k;
    ctx.fillStyle = "#f5f0e0";
    ctx.beginPath();
    ctx.moveTo(baseX, -1.6 * k);
    ctx.lineTo(tipX, 0);
    ctx.lineTo(baseX, 1.6 * k);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  } else {
    // normal abdomen, with the Spitter's optional swell + pull-back.
    const rad = 5 * (1 + rearUp * 0.5);
    const cx = (-7 - rearUp * 2) * k;
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
  if (type && type.weaver) {
    // pale silk sac at the rear (its spinnerets).
    ctx.fillStyle = "#e6e6f0";
    ctx.beginPath();
    ctx.arc(-8 * k, 0, 2.4 * k, 0, Math.PI * 2);
    ctx.fill();
  }
  if (type && type.armored) {
    // two smaller armor plates: one on the thorax (middle), one on the abdomen.
    ctx.lineWidth = 1 * k;
    for (const plate of [[0, 4.6, 3.8], [-7, 5.6, 4.6]]) {   // [center-x, rx, ry]
      ctx.fillStyle = "rgba(0,0,0,0.45)";
      ctx.beginPath();
      ctx.ellipse(plate[0] * k, 0, plate[1] * k, plate[2] * k, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#2a2a2a";
      ctx.stroke();
      // a light highlight arc on each shell
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
      ctx.beginPath();
      ctx.arc(plate[0] * k, 0, plate[1] * 0.6 * k, -0.9, 0.9);
      ctx.stroke();
    }
  }

  // curved jaws poking out the front of the head — they ride along with the
  // head's lunge, so the whole "mouth" charges forward together.
  // During the ability the mouth gapes open, so feed a negative value.
  let jawBite = bite;
  if (a.abilityAnim > 0 && a.type && a.type.spitter) jawBite = -rise;
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
