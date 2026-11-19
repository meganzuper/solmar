// Keyboard and mouse: held keys, edge-triggered presses, and the mouse
// position over the canvas. The game reads this once per fixed step.
export function createInput(canvas) {
  const input = {
    keys: new Set(), // codes held down right now
    pressed: new Set(), // codes pressed since the last takePressed()
    mouse: { x: 0, y: 0, down: false, clicked: false },
    attach() {
      window.addEventListener('keydown', (event) => {
        if (event.repeat) return;
        input.keys.add(event.code);
        input.pressed.add(event.code);
        if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(event.code)) {
          event.preventDefault();
        }
      });
      window.addEventListener('keyup', (event) => {
        input.keys.delete(event.code);
      });
      window.addEventListener('blur', () => {
        input.keys.clear();
        input.mouse.down = false;
      });
      canvas.addEventListener('mousemove', (event) => {
        const rect = canvas.getBoundingClientRect();
        input.mouse.x = event.clientX - rect.left;
        input.mouse.y = event.clientY - rect.top;
      });
      canvas.addEventListener('mousedown', (event) => {
        if (event.button !== 0) return;
        const rect = canvas.getBoundingClientRect();
        input.mouse.x = event.clientX - rect.left;
        input.mouse.y = event.clientY - rect.top;
        input.mouse.down = true;
        input.mouse.clicked = true;
      });
      window.addEventListener('mouseup', () => {
        input.mouse.down = false;
      });
    },
    // Edge presses since the last call, then cleared.
    takePressed() {
      const out = input.pressed;
      input.pressed = new Set();
      return out;
    },
    takeClicked() {
      const was = input.mouse.clicked;
      input.mouse.clicked = false;
      return was;
    },
    // Held movement: WASD or arrow keys, as a unit-ish vector.
    moveVector() {
      let x = 0;
      let y = 0;
      if (input.keys.has('KeyA') || input.keys.has('ArrowLeft')) x -= 1;
      if (input.keys.has('KeyD') || input.keys.has('ArrowRight')) x += 1;
      if (input.keys.has('KeyW') || input.keys.has('ArrowUp')) y -= 1;
      if (input.keys.has('KeyS') || input.keys.has('ArrowDown')) y += 1;
      if (x !== 0 && y !== 0) {
        x *= Math.SQRT1_2;
        y *= Math.SQRT1_2;
      }
      return { x, y };
    },
    running() {
      return input.keys.has('ShiftLeft') || input.keys.has('ShiftRight');
    },
  };
  return input;
}
