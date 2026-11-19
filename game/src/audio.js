// All sound is synthesized with WebAudio: no audio files, no network.
// Engine hum, a two-tone siren, gunshots, pickups, crashes and a light
// procedural music loop. Nothing here runs until the player first interacts.
export function createAudio() {
  const audio = {
    ctx: null,
    enabled: false,
    engineOsc: null,
    engineGain: null,
    sirenOsc: null,
    sirenGain: null,
    sirenOn: false,
    musicTimer: 0,
    musicStep: 0,
    musicOn: false,

    unlock() {
      if (audio.ctx) {
        if (audio.ctx.state === 'suspended') audio.ctx.resume();
        audio.enabled = true;
        return;
      }
      try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return;
        audio.ctx = new Ctx();
        audio.enabled = true;
        // Engine: a low sawtooth whose pitch follows speed.
        audio.engineOsc = audio.ctx.createOscillator();
        audio.engineOsc.type = 'sawtooth';
        audio.engineOsc.frequency.value = 60;
        audio.engineGain = audio.ctx.createGain();
        audio.engineGain.gain.value = 0;
        const engineFilter = audio.ctx.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 500;
        audio.engineOsc.connect(engineFilter);
        engineFilter.connect(audio.engineGain);
        audio.engineGain.connect(audio.ctx.destination);
        audio.engineOsc.start();
        // Siren: a triangle wave that swings between two notes.
        audio.sirenOsc = audio.ctx.createOscillator();
        audio.sirenOsc.type = 'triangle';
        audio.sirenOsc.frequency.value = 700;
        audio.sirenGain = audio.ctx.createGain();
        audio.sirenGain.gain.value = 0;
        audio.sirenOsc.connect(audio.sirenGain);
        audio.sirenGain.connect(audio.ctx.destination);
        audio.sirenOsc.start();
      } catch {
        audio.ctx = null;
        audio.enabled = false;
      }
    },

    setEngine(level, on) {
      if (!audio.enabled || !audio.engineOsc) return;
      const t = audio.ctx.currentTime;
      audio.engineGain.gain.setTargetAtTime(on ? 0.05 + level * 0.06 : 0, t, 0.1);
      audio.engineOsc.frequency.setTargetAtTime(55 + level * 130, t, 0.1);
    },

    siren(on) {
      if (!audio.enabled || !audio.sirenOsc) return;
      audio.sirenOn = on;
      const t = audio.ctx.currentTime;
      audio.sirenGain.gain.setTargetAtTime(on ? 0.035 : 0, t, 0.2);
    },

    // A short noise burst through a low-pass filter: a gunshot.
    shot() {
      if (!audio.enabled) return;
      const t = audio.ctx.currentTime;
      const dur = 0.12;
      const buffer = audio.ctx.createBuffer(1, audio.ctx.sampleRate * dur, audio.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
      const src = audio.ctx.createBufferSource();
      src.buffer = buffer;
      const filter = audio.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 1800;
      const gain = audio.ctx.createGain();
      gain.gain.value = 0.25;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(audio.ctx.destination);
      src.start(t);
    },

    punch() {
      audio.blip(120, 0.09, 'sine', 0.2);
    },

    pickup() {
      audio.blip(660, 0.07, 'sine', 0.15);
      setTimeout(() => audio.blip(880, 0.09, 'sine', 0.15), 70);
    },

    crash() {
      audio.blip(70, 0.18, 'sawtooth', 0.22);
    },

    click() {
      audio.blip(440, 0.04, 'square', 0.08);
    },

    missionDone() {
      audio.blip(523, 0.12, 'sine', 0.18);
      setTimeout(() => audio.blip(659, 0.12, 'sine', 0.18), 110);
      setTimeout(() => audio.blip(784, 0.2, 'sine', 0.2), 220);
    },

    blip(freq, dur, type, vol) {
      if (!audio.enabled) return;
      const t = audio.ctx.currentTime;
      const osc = audio.ctx.createOscillator();
      osc.type = type;
      osc.frequency.value = freq;
      const gain = audio.ctx.createGain();
      gain.gain.setValueAtTime(vol, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(gain);
      gain.connect(audio.ctx.destination);
      osc.start(t);
      osc.stop(t + dur);
    },

    // A slow bassline loop: A minor, eight steps, one note per step.
    startMusic() {
      audio.musicOn = true;
    },

    update(dt) {
      if (!audio.enabled) return;
      if (audio.sirenOn && audio.sirenOsc) {
        const t = audio.ctx.currentTime;
        audio.sirenOsc.frequency.setTargetAtTime(650 + Math.sin(t * 5) * 180, t, 0.05);
      }
      if (!audio.musicOn) return;
      audio.musicTimer -= dt;
      if (audio.musicTimer > 0) return;
      audio.musicTimer = 0.42;
      const notes = [110, 0, 130.8, 0, 98, 0, 146.8, 164.8];
      const freq = notes[audio.musicStep % notes.length];
      audio.musicStep += 1;
      if (freq > 0) audio.blip(freq, 0.38, 'triangle', 0.05);
      if (audio.musicStep % 2 === 0) audio.blip(220, 0.05, 'square', 0.02);
    },
  };
  return audio;
}
