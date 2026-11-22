'use strict';
// ------------------------------------------------------------
//  Procedural audio (WebAudio, no samples)
// ------------------------------------------------------------
(function () {
  const A = I.audio = { ready: false, muted: false };
  let ctx, master, amb, sfx, mus, verb, verbSend;
  const L = {}; // ambient layers

  function noiseBuf(type, sec = 3) {
    const n = Math.floor(ctx.sampleRate * sec), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0, b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (type === 'white') d[i] = w;
      else if (type === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; }
      else {
        b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11; b6 = w * 0.115926;
      }
    }
    return b;
  }
  function loop(buf, ...chain) {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    s.loopStart = Math.random(); s.start(0, Math.random() * 2);
    let n = s; for (const c of chain) { n.connect(c); n = c; }
    return s;
  }
  const filt = (type, f, q = 0.7) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
  const gain = (v = 0) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const set = (p, v, tc = 0.25) => p.setTargetAtTime(v, ctx.currentTime, tc);

  A.init = function () {
    if (A.ready) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    A.ctx = ctx;
    master = gain(0.9); master.connect(ctx.destination);
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -16; comp.ratio.value = 3;
    comp.connect(master);
    amb = gain(1); amb.connect(comp);
    sfx = gain(0.9); sfx.connect(comp);
    mus = gain(0.35); mus.connect(comp);
    // reverb
    verb = ctx.createConvolver();
    const len = ctx.sampleRate * 2.6, ir = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3.2); }
    verb.buffer = ir;
    verbSend = gain(0); verbSend.connect(verb); verb.connect(comp);
    A.white = noiseBuf('white'); A.pink = noiseBuf('pink'); A.brown = noiseBuf('brown', 5);

    L.surf = gain(0); loop(A.brown, filt('lowpass', 380), L.surf); L.surf.connect(amb);
    L.wash = gain(0); const wf = filt('bandpass', 1100, 0.5); L.washF = wf; loop(A.pink, wf, L.wash); L.wash.connect(amb); L.wash.connect(verbSend);
    L.wind = gain(0); L.windF = filt('bandpass', 500, 0.8); loop(A.pink, L.windF, L.wind); L.wind.connect(amb);
    L.leaves = gain(0); loop(A.white, filt('highpass', 2600), filt('lowpass', 7000), L.leaves); L.leaves.connect(amb);
    L.stream = gain(0); L.streamF = filt('bandpass', 2300, 1.4); loop(A.white, L.streamF, L.stream); L.stream.connect(amb);
    L.fire = gain(0); loop(A.brown, filt('lowpass', 260), L.fire); L.fire.connect(amb);
    L.rain = gain(0); loop(A.white, filt('highpass', 1200), filt('lowpass', 6000), L.rain); L.rain.connect(amb);
    L.cave = gain(0); loop(A.brown, filt('lowpass', 120), L.cave); L.cave.connect(amb);
    // radio
    L.radioStatic = gain(0); L.radioF = filt('bandpass', 1900, 0.4); loop(A.white, L.radioF, L.radioStatic); L.radioStatic.connect(sfx);
    L.voiceBus = gain(0);
    const vb1 = filt('highpass', 380), vb2 = filt('lowpass', 2900);
    const sh = ctx.createWaveShaper(); const curve = new Float32Array(1024);
    for (let i = 0; i < 1024; i++) { const x = i / 512 - 1; curve[i] = Math.tanh(x * 2.6); }
    sh.curve = curve;
    L.voiceIn = gain(1); L.voiceIn.connect(vb1); vb1.connect(vb2); vb2.connect(sh); sh.connect(L.voiceBus); L.voiceBus.connect(sfx);
    L.station = gain(0); L.station.connect(sfx);
    L.morse = gain(0); L.morse.connect(sfx);
    const mo = ctx.createOscillator(); mo.frequency.value = 720; L.morseKey = gain(0); mo.connect(L.morseKey); L.morseKey.connect(L.morse); mo.start();
    A.ready = true;
    if (A.muted) master.gain.value = 0;
  };
  A.setMuted = function (m) { A.muted = m; if (master) set(master.gain, m ? 0 : 0.9, 0.1); };

  let tAcc = 0, nextCrackle = 0, nextCricket = 0, nextGull = 4, nextNote = 6, nextDrip = 0, nextMorse = 0, nextFrog = 0;
  // env: {coast, stream, fire, trees, night, cave, wind, swash, rain, elev, dusk}
  A.update = function (dt, e) {
    if (!A.ready) return;
    tAcc += dt;
    const now = ctx.currentTime;
    const near = I.clamp(1 - (e.coast) / 520, 0, 1);
    const inC = e.cave ? 1 : 0;
    set(L.surf.gain, (0.05 + 0.42 * near * near) * (1 - inC * 0.4) + inC * 0.08);
    set(L.wash.gain, (0.02 + 0.4 * near * near * (0.25 + 0.75 * e.swash)) * (1 - inC * 0.6) + inC * 0.05 * e.swash, 0.12);
    set(L.washF.frequency, 700 + 900 * e.swash, 0.2);
    const wind = e.wind;
    set(L.wind.gain, (0.025 + 0.07 * wind + e.elev * 0.06) * (1 - inC));
    set(L.windF.frequency, 300 + wind * 500 + Math.sin(tAcc * 0.3) * 80, 0.6);
    set(L.leaves.gain, e.trees * (0.02 + 0.06 * wind) * (1 - inC));
    set(L.stream.gain, I.clamp(1 - e.stream / 130, 0, 1) * 0.09 * (1 - inC));
    set(L.streamF.frequency, 2000 + Math.random() * 900, 0.05);
    set(L.fire.gain, I.clamp(1 - e.fire / 200, 0, 1) * 0.22);
    set(L.rain.gain, e.rain * 0.16 * (1 - inC));
    set(L.cave.gain, inC * 0.18);
    set(verbSend.gain, inC ? 0.6 : 0, 0.5);
    // fire crackle
    if (e.fire < 200 && tAcc > nextCrackle) {
      nextCrackle = tAcc + 0.04 + Math.random() * 0.25;
      blip(2000 + Math.random() * 3000, 0.012 + Math.random() * 0.02, I.clamp(1 - e.fire / 200, 0, 1) * (0.06 + Math.random() * 0.12), 'white');
    }
    // crickets at night
    if (e.night > 0.5 && !e.cave && tAcc > nextCricket) {
      nextCricket = tAcc + 0.5 + Math.random() * 1.6;
      const f = 4200 + Math.random() * 700;
      for (let k = 0; k < 3 + Math.floor(Math.random() * 3); k++) tone(f, 0.03, 0.012 * e.night, now + k * 0.07, 'sine');
    }
    if (e.night > 0.5 && e.stream < 160 && tAcc > nextFrog) {
      nextFrog = tAcc + 2 + Math.random() * 5;
      for (let k = 0; k < 2; k++) sweep(180, 120, 0.12, 0.03, now + k * 0.18, 'square', 600);
    }
    // gulls by day near the sea
    if (e.night < 0.3 && !e.cave && near > 0.3 && tAcc > nextGull) {
      nextGull = tAcc + 8 + Math.random() * 16;
      A.gull(0.05 * near);
    }
    // cave drips
    if (e.cave && tAcc > nextDrip) {
      nextDrip = tAcc + 0.6 + Math.random() * 2.2;
      const f = 900 + Math.random() * 1400;
      sweep(f, f * 1.8, 0.06, 0.08, now, 'sine', 0, true);
    }
    // gentle generative music
    if (tAcc > nextNote && !A.radioOn) {
      nextNote = tAcc + 3.5 + Math.random() * 7;
      const scale = e.night > 0.5 ? [220, 246.9, 293.7, 329.6, 392, 440] : [261.6, 293.7, 329.6, 392, 440, 523.3, 587.3];
      const n = 1 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) pluck(scale[Math.floor(Math.random() * scale.length)] * (e.cave ? 0.5 : 1), now + k * (0.28 + Math.random() * 0.2), 0.05 + (e.dusk || 0) * 0.03);
    }
  };

  function blip(f, dur, vol, kind) {
    const s = ctx.createBufferSource(); s.buffer = kind === 'pink' ? A.pink : A.white;
    const b = filt('bandpass', f, 1.2), g = gain(0);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(b); b.connect(g); g.connect(sfx); g.connect(verbSend);
    s.start(t, Math.random() * 2, dur + 0.05);
  }
  function tone(f, dur, vol, t, type = 'sine', dest) {
    const o = ctx.createOscillator(), g = gain(0);
    o.type = type; o.frequency.value = f;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    o.connect(g); g.connect(dest || sfx); o.start(t); o.stop(t + dur + 0.05);
  }
  function sweep(f0, f1, dur, vol, t, type = 'sine', lp = 0, wet = false) {
    const o = ctx.createOscillator(), g = gain(0);
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + dur);
    let n = o;
    if (lp) { const f = filt('lowpass', lp); o.connect(f); n = f; }
    n.connect(g); g.connect(sfx); if (wet) g.connect(verbSend);
    o.start(t); o.stop(t + dur + 0.05);
  }
  function pluck(f, t, vol) {
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = gain(0), lp = filt('lowpass', 1800);
    o.type = 'triangle'; o.frequency.value = f; o2.type = 'sine'; o2.frequency.value = f * 2.005;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0005, t + 3.2);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(mus); g.connect(verbSend);
    o.start(t); o2.start(t); o.stop(t + 3.3); o2.stop(t + 3.3);
  }
  A.gull = function (v = 0.05) {
    if (!A.ready) return;
    const t = ctx.currentTime;
    for (let k = 0; k < 2 + Math.floor(Math.random() * 3); k++) {
      const s = t + k * 0.32;
      sweep(1500 + Math.random() * 300, 900, 0.24, v, s, 'sawtooth', 2400);
      sweep(1400, 1700, 0.08, v * 0.6, s, 'sawtooth', 2400);
    }
  };
  A.step = function (surface, v = 1) {
    if (!A.ready) return;
    if (surface === 'water') { blip(900 + Math.random() * 500, 0.14, 0.09 * v, 'white'); blip(400, 0.1, 0.05 * v, 'pink'); }
    else if (surface === 'sand') blip(1800 + Math.random() * 600, 0.07, 0.035 * v, 'pink');
    else if (surface === 'rock') blip(3200 + Math.random() * 800, 0.03, 0.05 * v, 'white');
    else blip(2400 + Math.random() * 1200, 0.05, 0.03 * v, 'pink');
  };
  A.pickup = function () { if (!A.ready) return; const t = ctx.currentTime; tone(660, 0.2, 0.08, t, 'triangle'); tone(990, 0.3, 0.06, t + 0.07, 'triangle'); };
  A.craft = function () {
    if (!A.ready) return; const t = ctx.currentTime;
    for (let k = 0; k < 3; k++) blip(500 + k * 300, 0.08, 0.15, 'pink');
    tone(523, 0.5, 0.06, t + 0.15, 'triangle'); tone(659, 0.5, 0.06, t + 0.25, 'triangle'); tone(784, 0.7, 0.06, t + 0.35, 'triangle');
  };
  A.splash = function () { if (!A.ready) return; blip(700, 0.5, 0.25, 'white'); blip(300, 0.4, 0.2, 'pink'); };
  A.thud = function () { if (!A.ready) return; sweep(160, 50, 0.3, 0.3, ctx.currentTime, 'sine'); blip(300, 0.15, 0.12, 'pink'); };
  A.click = function () { if (!A.ready) return; blip(3000, 0.02, 0.12, 'white'); };
  A.fail = function () { if (!A.ready) return; const t = ctx.currentTime; tone(220, 0.25, 0.06, t, 'triangle'); tone(185, 0.3, 0.06, t + 0.1, 'triangle'); };
  A.ignite = function () { if (!A.ready) return; blip(2500, 0.05, 0.2, 'white'); sweep(80, 200, 0.8, 0.2, ctx.currentTime + 0.05, 'sine', 300); };
  A.horn = function () {
    if (!A.ready) return; const t = ctx.currentTime;
    [110, 138.6, 165].forEach(f => { const o = ctx.createOscillator(), g = gain(0), lp = filt('lowpass', 900); o.type = 'sawtooth'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.06, t + 0.3); g.gain.setValueAtTime(0.06, t + 2.2); g.gain.linearRampToValueAtTime(0, t + 3);
      o.connect(lp); lp.connect(g); g.connect(sfx); g.connect(verbSend); o.start(t); o.stop(t + 3.1); });
  };
  A.chord = function (major = true) {
    if (!A.ready) return; const t = ctx.currentTime;
    const fs = major ? [261.6, 329.6, 392, 523.3, 659.3] : [220, 261.6, 329.6, 440];
    fs.forEach((f, k) => {
      const o = ctx.createOscillator(), g = gain(0), lp = filt('lowpass', 1400); o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0, t + k * 0.12); g.gain.linearRampToValueAtTime(0.05, t + k * 0.12 + 1.2); g.gain.exponentialRampToValueAtTime(0.0005, t + 7);
      o.connect(lp); lp.connect(g); g.connect(mus); g.connect(verbSend); o.start(t + k * 0.12); o.stop(t + 7.2);
    });
  };

  // ---------------- radio ----------------
  const VOW = { a: [800, 1250, 2600], e: [500, 1800, 2550], i: [320, 2250, 3000], o: [520, 900, 2450], u: [360, 760, 2400] };
  A.say = function (text, pitch = 125, when = 0) {
    if (!A.ready) return 0;
    const t0 = ctx.currentTime + when;
    const syl = Math.max(4, Math.round(text.replace(/\s+/g, '').length / 2.2));
    const sd = 0.115;
    const src = ctx.createOscillator(); src.type = 'sawtooth';
    const f = [0, 1, 2].map(k => { const b = filt('bandpass', 600, 7 - k * 1.5); return b; });
    const env = gain(0), mix = gain(1);
    f.forEach((b, k) => { src.connect(b); const g = gain([1, 0.55, 0.25][k]); b.connect(g); g.connect(env); });
    env.connect(mix); mix.connect(L.voiceIn);
    const keys = Object.keys(VOW);
    let t = t0, word = 0;
    for (let s = 0; s < syl; s++) {
      const v = VOW[keys[Math.floor(Math.random() * 5)]];
      f.forEach((b, k) => b.frequency.setTargetAtTime(v[k], t, 0.02));
      const p = pitch * (1 + 0.12 * Math.sin(s * 0.7) - s / syl * 0.15 + (Math.random() - 0.5) * 0.06);
      src.frequency.setTargetAtTime(p, t, 0.03);
      env.gain.setTargetAtTime(0.5, t, 0.015);
      if (Math.random() < 0.35) blipTo(3500 + Math.random() * 2000, 0.05, 0.12, t, L.voiceIn);
      t += sd * (0.8 + Math.random() * 0.5);
      word++;
      if (word > 2 + Math.random() * 3) { env.gain.setTargetAtTime(0, t - 0.03, 0.02); t += 0.09; word = 0; }
    }
    env.gain.setTargetAtTime(0, t, 0.04);
    src.start(t0); src.stop(t + 0.3);
    return t + 0.3 - ctx.currentTime;
  };
  function blipTo(f, dur, vol, t, dest) {
    const s = ctx.createBufferSource(); s.buffer = A.white;
    const b = filt('highpass', f), g = gain(0);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(b); b.connect(g); g.connect(dest); s.start(t, Math.random(), dur + 0.05);
  }
  A.radioOn = false;
  let stationNext = 0, morseIdx = 0;
  const MORSE = '.... . .-.. .--.   '.split('');
  A.radio = function (on, mix) {
    if (!A.ready) return;
    A.radioOn = on;
    if (!on) { set(L.radioStatic.gain, 0, 0.1); set(L.voiceBus.gain, 0, 0.1); set(L.station.gain, 0, 0.1); set(L.morse.gain, 0, 0.1); return; }
    set(L.radioStatic.gain, 0.03 + 0.16 * mix.static, 0.05);
    set(L.radioF.frequency, 1400 + Math.random() * 1200, 0.03);
    set(L.voiceBus.gain, mix.voice * 0.9, 0.08);
    set(L.station.gain, mix.music * 0.5, 0.08);
    set(L.morse.gain, mix.morse * 0.12, 0.08);
    const now = ctx.currentTime;
    if (now > stationNext) {
      stationNext = now + 0.32;
      const sc = [392, 440, 523.3, 587.3, 659.3, 523.3, 440, 392];
      tone(sc[Math.floor(now * 3) % sc.length], 0.3, 0.12, now, 'triangle', L.station);
    }
    if (now > nextMorse) {
      const ch = MORSE[morseIdx++ % MORSE.length];
      const dur = ch === '-' ? 0.27 : 0.09;
      if (ch !== ' ') { L.morseKey.gain.setValueAtTime(1, now); L.morseKey.gain.setValueAtTime(0, now + dur); }
      nextMorse = now + dur + 0.09 + (ch === ' ' ? 0.2 : 0);
    }
  };
})();
