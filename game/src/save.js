// Save and load: position, cash, health, ammo, job progress and the wanted
// level, kept in localStorage (this browser only).
import { SAVE_KEY } from './config.js';

export function hasSave() {
  try {
    return window.localStorage.getItem(SAVE_KEY) !== null;
  } catch {
    return false;
  }
}

export function saveGame(game) {
  try {
    const data = {
      x: game.player.x,
      y: game.player.y,
      hp: game.player.hp,
      cash: game.player.cash,
      ammo: game.player.ammo,
      missionIndex: game.mission.index,
      missionsDone: game.stats.missionsDone,
      wanted: game.wanted.stars,
      time: game.time,
    };
    window.localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (typeof data.x !== 'number' || typeof data.cash !== 'number') return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Storage can be off: nothing to clear.
  }
}
