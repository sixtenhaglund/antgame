// ---- Keyboard input ----
// We remember which keys are held down, then read that every frame.
const keys = {};
window.addEventListener("keydown", (e) => { keys[e.key.toLowerCase()] = true; });
window.addEventListener("keyup",   (e) => { keys[e.key.toLowerCase()] = false; });

// ---- Mouse position + button on screen ----
const mouse = { x: 0, y: 0, down: false };
window.addEventListener("mousemove", (e) => {
  mouse.x = e.clientX;
  mouse.y = e.clientY;
});
window.addEventListener("mousedown", (e) => { if (e.button === 0) mouse.down = true; });
window.addEventListener("mouseup",   (e) => { if (e.button === 0) mouse.down = false; });

// ---- Zoom with the scroll wheel ----
let zoom = 1;                       // 1 = normal, 2 = twice as big, etc.
window.addEventListener("wheel", (e) => {
  e.preventDefault();               // stop the page itself from scrolling
  // Scroll up (deltaY < 0) zooms in; scroll down zooms out.
  const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
  zoom = Math.max(0.4, Math.min(4, zoom * factor));   // clamp between 0.4x and 4x
}, { passive: false });             // passive:false lets us call preventDefault
