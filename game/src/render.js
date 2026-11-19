// Drawing only: the city, cars, people, effects and warm sun, from the
// camera's point of view. The HUD and menus live in hud.js.
import { BLOCK, COLORS, ROAD_CENTERS, ROAD_W, WORLD_SIZE } from './config.js';
import { isBeachAt, isWaterAt } from './world.js';

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const view = { w: 1280, h: 720, dpr: 1 };

  function resize() {
    view.dpr = Math.min(2, window.devicePixelRatio || 1);
    view.w = window.innerWidth;
    view.h = window.innerHeight;
    canvas.width = Math.round(view.w * view.dpr);
    canvas.height = Math.round(view.h * view.dpr);
    canvas.style.width = `${view.w}px`;
    canvas.style.height = `${view.h}px`;
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function inView(game, x, y, margin) {
    const cam = game.camera;
    const vw = view.w / game.camera.zoom;
    const vh = view.h / game.camera.zoom;
    return x > cam.x - vw / 2 - margin && x < cam.x + vw / 2 + margin
      && y > cam.y - vh / 2 - margin && y < cam.y + vh / 2 + margin;
  }

  function drawGround(game) {
    const city = game.city;
    // Grass base.
    ctx.fillStyle = COLORS.grass;
    ctx.fillRect(0, 0, WORLD_SIZE, WORLD_SIZE);
    // Mown stripes for a little texture.
    ctx.fillStyle = COLORS.grassDark;
    for (let y = 0; y < WORLD_SIZE; y += 224) {
      ctx.fillRect(0, y, WORLD_SIZE, 112);
    }
    // River along the west edge and the sea along the south.
    ctx.fillStyle = COLORS.sea;
    ctx.fillRect(0, 0, 150, WORLD_SIZE);
    ctx.fillRect(0, 3460, WORLD_SIZE, WORLD_SIZE - 3460);
    ctx.fillStyle = COLORS.seaDeep;
    ctx.fillRect(0, 3510, WORLD_SIZE, WORLD_SIZE - 3510);
    // Animated wave lines.
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 2;
    const t = game.time;
    for (let i = 0; i < 6; i += 1) {
      const y = 3480 + i * 16 + Math.sin(t * 0.7 + i) * 4;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= WORLD_SIZE; x += 224) {
        ctx.lineTo(x, y + Math.sin(x * 0.01 + t + i) * 3);
      }
      ctx.stroke();
    }
    // Beach sand.
    ctx.fillStyle = COLORS.sand;
    ctx.fillRect(0, 3224, WORLD_SIZE, 3460 - 3224);
    // Umbrellas on the sand.
    for (const u of city.umbrellas) {
      if (!inView(game, u.x, u.y, 60)) continue;
      ctx.fillStyle = '#e25b4a';
      ctx.beginPath();
      ctx.arc(u.x, u.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f5efe0';
      ctx.beginPath();
      ctx.arc(u.x, u.y, 16, Math.PI * 0.5, Math.PI * 1.5);
      ctx.fill();
      ctx.fillStyle = '#8a6a48';
      ctx.fillRect(u.x - 1, u.y, 2, 14);
    }
    // Park and plaza blocks.
    ctx.fillStyle = COLORS.park;
    ctx.fillRect(city.park.x, city.park.y, city.park.w, city.park.h);
    ctx.fillStyle = COLORS.parkPath;
    ctx.fillRect(city.park.x + city.park.w / 2 - 14, city.park.y, 28, city.park.h);
    ctx.fillRect(city.park.x, city.park.y + city.park.h / 2 - 14, city.park.w, 28);
    ctx.fillStyle = COLORS.plaza;
    ctx.fillRect(city.plaza.x, city.plaza.y, city.plaza.w, city.plaza.h);
    ctx.fillStyle = '#7fb3d9';
    ctx.beginPath();
    ctx.arc(city.plaza.x + city.plaza.w / 2, city.plaza.y + city.plaza.h / 2, 42, 0, Math.PI * 2);
    ctx.fill();
    // Pier into the sea.
    ctx.fillStyle = COLORS.pier;
    ctx.fillRect(1836 - 26, 3300, 52, 220);
    ctx.fillStyle = '#6e5238';
    for (let y = 3310; y < 3510; y += 24) ctx.fillRect(1836 - 26, y, 52, 3);
  }

  function drawRoads(game) {
    const city = game.city;
    ctx.fillStyle = COLORS.road;
    for (const c of city.roadsV) ctx.fillRect(c - ROAD_W / 2, 0, ROAD_W, WORLD_SIZE);
    for (const c of city.roadsH) ctx.fillRect(0, c - ROAD_W / 2, WORLD_SIZE, ROAD_W);
    // Sidewalks: lighter strips along every road.
    ctx.fillStyle = COLORS.sidewalk;
    for (const c of city.roadsV) {
      ctx.fillRect(c - ROAD_W / 2 - 14, 0, 14, WORLD_SIZE);
      ctx.fillRect(c + ROAD_W / 2, 0, 14, WORLD_SIZE);
    }
    for (const c of city.roadsH) {
      ctx.fillRect(0, c - ROAD_W / 2 - 14, WORLD_SIZE, 14);
      ctx.fillRect(0, c + ROAD_W / 2, WORLD_SIZE, 14);
    }
    // Lane dashes.
    ctx.fillStyle = COLORS.laneMark;
    for (const c of city.roadsV) {
      for (let y = 0; y < WORLD_SIZE; y += 64) {
        if (Math.abs(y - 1388) < 90 && c === 492) continue; // bridge gap handled below
        ctx.fillRect(c - 2, y, 4, 30);
      }
    }
    for (const c of city.roadsH) {
      for (let x = 0; x < WORLD_SIZE; x += 64) {
        ctx.fillRect(x, c - 2, 30, 4);
      }
    }
    // The bridge over the river: wooden deck across the west water.
    ctx.fillStyle = '#a8845c';
    ctx.fillRect(0, 1388 - ROAD_W / 2, 170, ROAD_W);
    ctx.fillStyle = '#6e5238';
    for (let x = 8; x < 170; x += 20) ctx.fillRect(x, 1388 - ROAD_W / 2, 3, ROAD_W);
    ctx.fillStyle = COLORS.laneMark;
    for (let x = 0; x < 170; x += 64) ctx.fillRect(x, 1388 - 2, 30, 4);
  }

  function drawBuildings(game) {
    for (const b of game.city.buildings) {
      if (!inView(game, b.x + b.w / 2, b.y + b.h / 2, 120)) continue;
      // Soft shadow thrown to the north-east by the afternoon sun.
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.fillRect(b.x + 10 + b.height * 0.3, b.y + 12 + b.height * 0.3, b.w, b.h);
      ctx.fillStyle = b.wall;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.fillStyle = b.roof;
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 6, b.y + 6, b.w - 12, b.h - 12);
      // Rooftop detail: a vent box and a skylight.
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(b.x + b.w * 0.2, b.y + b.h * 0.25, 18, 14);
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(b.x + b.w * 0.6, b.y + b.h * 0.55, 22, 16);
    }
    // Trees in the park.
    for (const t of game.city.trees) {
      if (!inView(game, t.x, t.y, 40)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.beginPath();
      ctx.arc(t.x + 6, t.y + 8, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#3e7a34';
      ctx.beginPath();
      ctx.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#5da24a';
      ctx.beginPath();
      ctx.arc(t.x - 4, t.y - 4, t.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // Shops: small kiosks with a coloured awning and a sign.
    for (const s of game.city.shops) {
      if (!inView(game, s.x, s.y, 80)) continue;
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(s.x - 26, s.y - 18, 56, 44);
      ctx.fillStyle = '#f0e6d2';
      ctx.fillRect(s.x - 30, s.y - 22, 60, 44);
      ctx.fillStyle = s.kind === 'ammo' ? '#c94f43' : s.kind === 'clinic' ? '#3f8a5d' : '#2b4a8f';
      ctx.fillRect(s.x - 30, s.y - 22, 60, 14);
      ctx.fillStyle = '#1d1a18';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.name, s.x, s.y + 16);
    }
    // The park kiosk (mission 5's stand).
    const k = game.city.locations.parkKiosk;
    if (inView(game, k.x, k.y, 80)) {
      ctx.fillStyle = 'rgba(0,0,0,0.2)';
      ctx.fillRect(k.x - 18, k.y - 12, 40, 30);
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(k.x - 22, k.y - 16, 44, 32);
      ctx.fillStyle = '#b5543c';
      ctx.fillRect(k.x - 22, k.y - 16, 44, 10);
    }
  }

  function drawSkids(game) {
    ctx.strokeStyle = 'rgba(20,18,16,0.4)';
    ctx.lineWidth = 5;
    for (const s of game.skids) {
      if (!inView(game, s.x, s.y, 40)) continue;
      ctx.globalAlpha = Math.min(1, s.life / 2);
      ctx.beginPath();
      ctx.moveTo(s.x - Math.cos(s.angle) * 18, s.y - Math.sin(s.angle) * 18);
      ctx.lineTo(s.x + Math.cos(s.angle) * 18, s.y + Math.sin(s.angle) * 18);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawCar(game, car) {
    if (!inView(game, car.x, car.y, 80)) return;
    const def = car.def;
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    // Shadow.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundRect(-def.l / 2 + 4, -def.w / 2 + 5, def.l, def.w, 12);
    ctx.fill();
    // Body.
    ctx.fillStyle = car.color;
    roundRect(-def.l / 2, -def.w / 2, def.l, def.w, 12);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#1d1a18';
    const wl = def.l / 2 - 14;
    const ww = def.w / 2 - 2;
    ctx.fillRect(-wl, -ww - 3, 16, 6);
    ctx.fillRect(wl - 4, -ww - 3, 16, 6);
    ctx.fillRect(-wl, ww - 3, 16, 6);
    ctx.fillRect(wl - 4, ww - 3, 16, 6);
    // Roof and windshield.
    ctx.fillStyle = car.roof;
    roundRect(-def.l / 2 + 16, -def.w / 2 + 8, def.l - 34, def.w - 16, 8);
    ctx.fill();
    ctx.fillStyle = '#20262e';
    ctx.fillRect(def.l / 2 - 22, -def.w / 2 + 8, 8, def.w - 16);
    // Headlights.
    ctx.fillStyle = '#ffe9a8';
    ctx.fillRect(def.l / 2 - 3, -def.w / 2 + 5, 4, 7);
    ctx.fillRect(def.l / 2 - 3, def.w / 2 - 12, 4, 7);
    if (car.type === 'taxi') {
      ctx.fillStyle = '#1d1a18';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(-def.l / 2 + 18 + i * 10, -4, 6, 8);
    }
    if (car.type === 'sports') {
      ctx.fillStyle = '#1d1a18';
      ctx.fillRect(-def.l / 2 - 4, -def.w / 2 + 2, 6, def.w - 4);
    }
    if (car.type === 'police') {
      // White doors.
      ctx.fillStyle = '#f2f2f2';
      ctx.fillRect(-6, -def.w / 2 + 3, 16, def.w - 6);
      // Flashing light bar.
      const on = Math.floor(game.time * 6) % 2 === 0;
      ctx.fillStyle = on ? '#ff2e2e' : '#2e6bff';
      ctx.fillRect(-8, -def.w / 2 + 4, 14, 8);
      ctx.fillStyle = on ? '#2e6bff' : '#ff2e2e';
      ctx.fillRect(-8, def.w / 2 - 12, 14, 8);
    }
    if (car.missionCar) {
      // A gold outline marks a mission car.
      ctx.strokeStyle = '#ffd34d';
      ctx.lineWidth = 3;
      roundRect(-def.l / 2 - 3, -def.w / 2 - 3, def.l + 6, def.w + 6, 14);
      ctx.stroke();
    }
    if (car.disabled) {
      ctx.fillStyle = 'rgba(0,0,0,0.45)';
      roundRect(-def.l / 2, -def.w / 2, def.l, def.w, 12);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawPed(game, ped) {
    if (!inView(game, ped.x, ped.y, 40)) return;
    const bob = Math.sin(ped.walkPhase) * 2;
    ctx.save();
    ctx.translate(ped.x, ped.y);
    if (ped.down > 0) {
      // Lying flat.
      ctx.rotate(ped.angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.ellipse(2, 3, 16, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.shirt;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 7, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(16, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      return;
    }
    // Shadow and body.
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(2, 4, 11, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.kind === 'cop' ? '#22355e' : ped.kind === 'thug' ? '#33302e' : ped.shirt;
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = ped.skin;
    ctx.beginPath();
    ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 + bob * 0.3, 6.5, 0, Math.PI * 2);
    ctx.fill();
    if (ped.hat) {
      ctx.fillStyle = '#1a2440';
      ctx.beginPath();
      ctx.arc(Math.cos(ped.angle) * 3, Math.sin(ped.angle) * 3 + bob * 0.3 - 2, 6.5, Math.PI, Math.PI * 2);
      ctx.fill();
    }
    if (ped.kind === 'thug') {
      ctx.strokeStyle = '#1d1a18';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(ped.angle) * 20, Math.sin(ped.angle) * 20);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPlayer(game) {
    const p = game.player;
    if (p.inCar) return;
    if (!inView(game, p.x, p.y, 40)) return;
    const bob = p.speed > 0 ? Math.sin(game.time * 12) * 2 : 0;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.ellipse(2, 5, 12, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    // A gold ring so the player is easy to find in a crowd.
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, 16, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2b7a6e';
    ctx.beginPath();
    ctx.arc(0, bob * 0.3, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#f0c8a0';
    ctx.beginPath();
    ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3 + bob * 0.3, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d21f3c';
    ctx.beginPath();
    ctx.arc(Math.cos(p.angle) * 3, Math.sin(p.angle) * 3 + bob * 0.3 - 2, 7, Math.PI, Math.PI * 2);
    ctx.fill();
    // Aim line and muzzle flash.
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(p.angle) * 14, Math.sin(p.angle) * 14);
    ctx.lineTo(Math.cos(p.angle) * 26, Math.sin(p.angle) * 26);
    ctx.stroke();
    if (p.muzzle > 0) {
      ctx.fillStyle = '#ffe066';
      ctx.beginPath();
      ctx.arc(Math.cos(p.angle) * 30, Math.sin(p.angle) * 30, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(Math.cos(p.angle) * 30, Math.sin(p.angle) * 30, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBullets(game) {
    ctx.strokeStyle = '#ffe066';
    ctx.lineWidth = 3;
    for (const b of game.bullets) {
      ctx.beginPath();
      ctx.moveTo(b.x - b.vx * 0.02, b.y - b.vy * 0.02);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  function drawParticles(game) {
    for (const pt of game.particles) {
      if (!inView(game, pt.x, pt.y, 30)) continue;
      const a = Math.max(0, pt.life / pt.max);
      if (pt.kind === 'spark') {
        ctx.fillStyle = `rgba(255,180,60,${a})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * a + 1, 0, Math.PI * 2);
        ctx.fill();
      } else if (pt.kind === 'dust') {
        ctx.fillStyle = `rgba(210,190,150,${a * 0.5})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (1.6 - a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = `rgba(90,90,90,${a * 0.55})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size * (1.8 - a * 0.8), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawMarker(game) {
    const m = game.mission;
    if (!m.active || !m.target) return;
    const pulse = 1 + Math.sin(game.time * 4) * 0.12;
    ctx.save();
    ctx.translate(m.target.x, m.target.y);
    // A beam of light and a pulsing ring on the ground.
    ctx.fillStyle = 'rgba(255,211,77,0.10)';
    ctx.fillRect(-8, -260, 16, 260);
    ctx.strokeStyle = '#ffd34d';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 34 * pulse, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#ffd34d';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    // The label above the marker.
    ctx.font = 'bold 15px system-ui, sans-serif';
    ctx.textAlign = 'center';
    const label = m.target.label || '';
    const w = ctx.measureText(label).width + 18;
    ctx.fillStyle = 'rgba(20,16,12,0.8)';
    roundRect(-w / 2, -78, w, 26, 6);
    ctx.fill();
    ctx.fillStyle = '#ffd34d';
    ctx.fillText(label, 0, -60);
    ctx.restore();
  }

  function drawSun(game) {
    // Warm afternoon light: a soft glow from the top-left, and a vignette.
    const g = ctx.createRadialGradient(
      view.w * 0.2, -view.h * 0.1, 80,
      view.w * 0.2, -view.h * 0.1, view.w * 0.9,
    );
    g.addColorStop(0, 'rgba(255,214,130,0.14)');
    g.addColorStop(1, 'rgba(255,214,130,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, view.w, view.h);
    const v = ctx.createRadialGradient(
      view.w / 2, view.h / 2, Math.min(view.w, view.h) * 0.42,
      view.w / 2, view.h / 2, Math.max(view.w, view.h) * 0.75,
    );
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(10,10,20,0.28)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, view.w, view.h);
  }

  // Paint one frame of the world (no HUD, no menus).
  function drawWorld(game) {
    const cam = game.camera;
    const zoom = cam.zoom;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    ctx.fillStyle = '#1a2027';
    ctx.fillRect(0, 0, view.w, view.h);
    const shakeX = cam.shake > 0 ? (game.rng.next() - 0.5) * cam.shake : 0;
    const shakeY = cam.shake > 0 ? (game.rng.next() - 0.5) * cam.shake : 0;
    ctx.setTransform(
      view.dpr * zoom, 0, 0, view.dpr * zoom,
      view.dpr * (view.w / 2 - (cam.x + shakeX) * zoom),
      view.dpr * (view.h / 2 - (cam.y + shakeY) * zoom),
    );
    drawGround(game);
    drawRoads(game);
    drawBuildings(game);
    drawSkids(game);
    drawMarker(game);
    for (const car of game.cars) drawCar(game, car);
    for (const ped of game.peds) drawPed(game, ped);
    drawPlayer(game);
    drawBullets(game);
    drawParticles(game);
    // Back to screen space for the light.
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    drawSun(game);
  }

  resize();
  window.addEventListener('resize', resize);
  return { drawWorld, ctx, view };
}
