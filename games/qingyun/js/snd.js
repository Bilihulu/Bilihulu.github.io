/* ===== 音频引擎：Web Audio 程序化音效与音乐（零外部素材） ===== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(root); }
  else { root.SND = factory(root); }
})(typeof self !== 'undefined' ? self : globalThis, function (root) {
  'use strict';

  var ctx = null, master = null, buses = {};
  var ambient = null;          // 当前环境声节点组
  var ambientName = null;
  var musicTimer = null;
  var musicMode = null;        // 'calm' | 'tense'
  var nextNoteAt = 0;
  var settings = { music: 0.5, ambient: 0.5, sfx: 0.7, muted: false, noVibrate: false };
  var voiceCount = 0;
  var MAX_VOICES = 8;
  var noiseBuf = null;
  var ambTimers = [];
  var started = false;

  function supported() {
    return typeof root.AudioContext !== 'undefined' || typeof root.webkitAudioContext !== 'undefined';
  }

  function init() {
    if (ctx || !supported()) return !!ctx;
    var AC = root.AudioContext || root.webkitAudioContext;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = settings.muted ? 0 : 1;
    master.connect(ctx.destination);
    buses.music = ctx.createGain(); buses.music.gain.value = settings.music;
    buses.ambient = ctx.createGain(); buses.ambient.gain.value = settings.ambient;
    buses.sfx = ctx.createGain(); buses.sfx.gain.value = settings.sfx;
    buses.music.connect(master); buses.ambient.connect(master); buses.sfx.connect(master);
    // 噪声缓冲
    var len = ctx.sampleRate * 2;
    noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    started = true;
    if (ctx.state === 'suspended') ctx.resume();
    return true;
  }

  function applySettings(s) {
    settings = s || settings;
    if (!ctx) return;
    master.gain.value = settings.muted ? 0 : 1;
    buses.music.gain.value = settings.music;
    buses.ambient.gain.value = settings.ambient;
    buses.sfx.gain.value = settings.sfx;
  }

  /* ---------- 基础发声 ---------- */
  function env(node, t0, a, d, peak) {
    node.gain.setValueAtTime(0.0001, t0);
    node.gain.exponentialRampToValueAtTime(Math.max(0.0001, peak), t0 + a);
    node.gain.exponentialRampToValueAtTime(0.0001, t0 + a + d);
  }
  function tone(freq, t0, dur, type, vol, bus) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, t0);
    env(g, t0, 0.008, dur, vol);
    o.connect(g); g.connect(bus || buses.sfx);
    o.start(t0); o.stop(t0 + dur + 0.1);
    countVoice(o);
  }
  function noise(t0, dur, filterType, freq, q, vol, bus) {
    var src = ctx.createBufferSource();
    src.buffer = noiseBuf; src.loop = true;
    var f = ctx.createBiquadFilter();
    f.type = filterType || 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1;
    var g = ctx.createGain();
    env(g, t0, 0.01, dur, vol);
    src.connect(f); f.connect(g); g.connect(bus || buses.sfx);
    src.start(t0); src.stop(t0 + dur + 0.1);
    countVoice(src);
  }
  function countVoice(node) {
    voiceCount++;
    node.onended = function () { voiceCount = Math.max(0, voiceCount - 1); };
  }
  function canPlay() { return ctx && voiceCount < MAX_VOICES; }

  /* ---------- 音效 ---------- */
  var SFX = {
    click: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(1180, t, 0.05, 'square', 0.12); },
    hover: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(880, t, 0.04, 'sine', 0.05); },
    hit: function () { if (!canPlay()) return; var t = ctx.currentTime; noise(t, 0.12, 'bandpass', 320, 1.2, 0.5); tone(180, t, 0.1, 'sine', 0.25); },
    crit: function () { if (!canPlay()) return; var t = ctx.currentTime; noise(t, 0.16, 'bandpass', 500, 1, 0.6); tone(240, t, 0.12, 'square', 0.3); tone(960, t + 0.02, 0.14, 'sine', 0.25); },
    sword: function () { if (!canPlay()) return; var t = ctx.currentTime; noise(t, 0.22, 'bandpass', 2600, 2, 0.4); var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle'; o.frequency.setValueAtTime(1400, t); o.frequency.exponentialRampToValueAtTime(500, t + 0.2); env(g, t, 0.005, 0.2, 0.3); o.connect(g); g.connect(buses.sfx); o.start(t); o.stop(t + 0.3); countVoice(o); },
    thunder: function () { if (!canPlay()) return; var t = ctx.currentTime; noise(t, 0.6, 'lowpass', 500, 0.8, 0.9); var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.5); env(g, t, 0.01, 0.5, 0.7); o.connect(g); g.connect(buses.sfx); o.start(t); o.stop(t + 0.7); countVoice(o); },
    shield: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(294, t, 0.4, 'sine', 0.3); tone(392, t + 0.03, 0.4, 'sine', 0.25); tone(588, t + 0.06, 0.35, 'sine', 0.18); },
    defend: function () { if (!canPlay()) return; var t = ctx.currentTime; noise(t, 0.14, 'lowpass', 900, 0.7, 0.4); },
    pill: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(880, t, 0.18, 'sine', 0.25); tone(1318, t + 0.08, 0.22, 'sine', 0.2); },
    pickup: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(660, t, 0.08, 'sine', 0.25); tone(990, t + 0.07, 0.12, 'sine', 0.22); },
    quest: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(523, t, 0.16, 'triangle', 0.22); tone(659, t + 0.12, 0.16, 'triangle', 0.22); tone(784, t + 0.24, 0.3, 'triangle', 0.24); },
    bell: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(523, t, 1.1, 'sine', 0.35); tone(784, t + 0.01, 0.9, 'sine', 0.2); tone(1046, t + 0.02, 0.7, 'sine', 0.12); },
    breakthrough: function () { if (!canPlay()) return; var t = ctx.currentTime; var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sawtooth'; o.frequency.setValueAtTime(160, t); o.frequency.exponentialRampToValueAtTime(760, t + 1.1); env(g, t, 0.4, 0.9, 0.22); o.connect(g); g.connect(buses.sfx); o.start(t); o.stop(t + 2); countVoice(o); SFX.bell(); },
    defeat: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(320, t, 0.5, 'sine', 0.25); tone(200, t + 0.18, 0.6, 'sine', 0.22); },
    error: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(160, t, 0.14, 'square', 0.16); },
    gather: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(520, t, 0.14, 'triangle', 0.2); },
    alchemy: function () { if (!canPlay()) return; var t = ctx.currentTime; tone(740, t, 0.3, 'sine', 0.22); tone(1108, t + 0.1, 0.35, 'sine', 0.18); }
  };

  function play(name) {
    if (!ctx || settings.muted) return;
    var fn = SFX[name];
    if (fn) { try { fn(); } catch (e) { /* 忽略单帧音频错误 */ } }
  }

  function vibrate(ms) {
    if (settings.noVibrate) return;
    try { if (root.navigator && root.navigator.vibrate) root.navigator.vibrate(ms); } catch (e) { /* 忽略 */ }
  }

  /* ---------- 环境声 ---------- */
  function stopAmbient() {
    ambTimers.forEach(function (t) { clearTimeout(t); clearInterval(t); });
    ambTimers = [];
    if (ambient) {
      try { ambient.stop ? ambient.stop() : null; } catch (e) { /* 忽略 */ }
      if (ambient._nodes) ambient._nodes.forEach(function (n) { try { n.disconnect(); } catch (e) { } });
      ambient = null;
    }
    ambientName = null;
  }

  function startAmbient(name) {
    if (!ctx || ambientName === name) return;
    stopAmbient();
    ambientName = name;
    if (!name) return;
    var t = ctx.currentTime;
    if (name === 'wind') {
      var src = ctx.createBufferSource(); src.buffer = noiseBuf; src.loop = true;
      var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 420;
      var g = ctx.createGain(); g.gain.value = 0.0001;
      env(g, t, 1.2, 0.1, 0.5);
      // 风声起伏
      var lfo = ctx.createOscillator(); lfo.frequency.value = 0.07;
      var lfoG = ctx.createGain(); lfoG.gain.value = 0.28;
      lfo.connect(lfoG); lfoG.connect(g.gain);
      src.connect(f); f.connect(g); g.connect(buses.ambient);
      src.start(t); lfo.start(t);
      ambient = { stop: function () { try { src.stop(); lfo.stop(); } catch (e) { } }, _nodes: [src, f, g, lfo, lfoG] };
      scheduleBirds();
    } else if (name === 'fire') {
      var src2 = ctx.createBufferSource(); src2.buffer = noiseBuf; src2.loop = true;
      var f2 = ctx.createBiquadFilter(); f2.type = 'lowpass'; f2.frequency.value = 1100;
      var g2 = ctx.createGain(); g2.gain.value = 0.0001;
      env(g2, t, 0.8, 0.1, 0.4);
      var lfo2 = ctx.createOscillator(); lfo2.frequency.value = 7;
      var lfo2G = ctx.createGain(); lfo2G.gain.value = 0.18;
      lfo2.connect(lfo2G); lfo2G.connect(g2.gain);
      src2.connect(f2); f2.connect(g2); g2.connect(buses.ambient);
      src2.start(t); lfo2.start(t);
      ambient = { stop: function () { try { src2.stop(); lfo2.stop(); } catch (e) { } }, _nodes: [src2, f2, g2, lfo2, lfo2G] };
      scheduleCrackle();
    } else if (name === 'hum') {
      var g3 = ctx.createGain(); g3.gain.value = 0.0001;
      env(g3, t, 1.5, 0.1, 0.3);
      var nodes = [g3];
      [110, 165, 220.5].forEach(function (fr) {
        var o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = fr;
        var og = ctx.createGain(); og.gain.value = 0.33;
        o.connect(og); og.connect(g3); o.start(t); nodes.push(o, og);
      });
      var lfo3 = ctx.createOscillator(); lfo3.frequency.value = 0.3;
      var lfo3G = ctx.createGain(); lfo3G.gain.value = 0.1;
      lfo3.connect(lfo3G); lfo3G.connect(g3.gain); lfo3.start(t); nodes.push(lfo3, lfo3G);
      g3.connect(buses.ambient);
      ambient = { stop: function () { nodes.forEach(function (n) { try { n.stop && n.stop(); } catch (e) { } }); }, _nodes: nodes };
    }
  }

  function scheduleBirds() {
    function once() {
      if (ambientName !== 'wind' || !ctx) return;
      if (Math.random() < 0.6) {
        var t = ctx.currentTime + Math.random() * 0.2;
        var base = 1800 + Math.random() * 900;
        for (var i = 0; i < 2 + Math.floor(Math.random() * 3); i++) {
          tone(base + i * 120, t + i * 0.09, 0.07, 'sine', 0.06, buses.ambient);
        }
      }
      ambTimers.push(setTimeout(once, 2500 + Math.random() * 5000));
    }
    ambTimers.push(setTimeout(once, 1500));
  }
  function scheduleCrackle() {
    function once() {
      if (ambientName !== 'fire' || !ctx) return;
      if (Math.random() < 0.7) {
        var t = ctx.currentTime;
        noise(t, 0.05 + Math.random() * 0.06, 'bandpass', 1400 + Math.random() * 1800, 3, 0.16, buses.ambient);
      }
      ambTimers.push(setTimeout(once, 250 + Math.random() * 700));
    }
    ambTimers.push(setTimeout(once, 400));
  }

  /* ---------- 音乐（生成式五声音阶） ---------- */
  var PENTA = [261.6, 293.7, 329.6, 392.0, 440.0, 523.3, 587.3, 659.3, 784.0, 880.0];
  function pluck(freq, t, vol) {
    var o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.1);
    var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 2400;
    o.connect(f); f.connect(g); g.connect(buses.music);
    o.start(t); o.stop(t + 1.3);
    countVoice(o);
  }
  function kick(t) {
    var o = ctx.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(45, t + 0.14);
    var g = ctx.createGain();
    g.gain.setValueAtTime(0.5, t); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.connect(g); g.connect(buses.music);
    o.start(t); o.stop(t + 0.2);
  }
  function scheduleMusic() {
    if (!ctx) return;
    var ahead = 0.6;
    while (nextNoteAt < ctx.currentTime + ahead) {
      if (nextNoteAt < ctx.currentTime) nextNoteAt = ctx.currentTime + 0.05;
      if (musicMode === 'tense') {
        kick(nextNoteAt);
        if (Math.random() < 0.4) kick(nextNoteAt + 0.3);
        if (Math.random() < 0.5) pluck(PENTA[4 + Math.floor(Math.random() * 6)], nextNoteAt + 0.15, 0.1);
        nextNoteAt += 0.6;
      } else {
        if (Math.random() < 0.85) pluck(PENTA[Math.floor(Math.random() * PENTA.length)], nextNoteAt, 0.16);
        nextNoteAt += 0.45 + Math.random() * 0.5;
      }
    }
  }
  function setMusic(mode) {
    if (!ctx) return;
    if (musicMode === mode) return;
    musicMode = mode;
    if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
    if (mode) {
      nextNoteAt = ctx.currentTime + 0.1;
      musicTimer = setInterval(scheduleMusic, 250);
    }
  }

  /* ---------- 场景组合 ---------- */
  function scene(name) {
    if (!ctx) return;
    if (name === 'cave') { startAmbient('wind'); setMusic('calm'); }
    else if (name === 'cultivate') { startAmbient('hum'); setMusic('calm'); }
    else if (name === 'battle') { startAmbient(null); setMusic('tense'); }
    else if (name === 'alchemy') { startAmbient('fire'); setMusic('calm'); }
    else if (name === 'adventure') { startAmbient('wind'); setMusic('calm'); }
    else if (name === 'skills') { startAmbient('wind'); setMusic('calm'); }
    else { startAmbient(null); setMusic(null); }
  }

  function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }
  function resume() { if (ctx && ctx.state === 'suspended') ctx.resume(); }

  return {
    init: init,
    play: play,
    vibrate: vibrate,
    applySettings: applySettings,
    scene: scene,
    setMusic: setMusic,
    startAmbient: startAmbient,
    suspend: suspend,
    resume: resume,
    isStarted: function () { return started; }
  };
});
