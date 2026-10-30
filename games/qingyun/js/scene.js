/* ===== 场景渲染层：Canvas 水墨场景 + 粒子特效（浏览器专用） ===== */
(function (root) {
  'use strict';

  var canvas = null, ctx = null;
  var W = 0, H = 0, DPR = 1;
  var sceneName = 'cave';
  var battle = null, furnace = null;
  var breakPhase = null;
  var upgraded = false;       // 筑基后洞府变化
  var meditating = false;
  var hurtAt = 0;
  var particles = [];
  var floaters = [];
  var rings = [];
  var flashA = 0, flashColor = '255,255,255';
  var shakeMag = 0, shakeUntil = 0;
  var reduced = false;
  var MAX_P = 420;
  var t0 = 0;

  var C = {
    ink: '#0b1618', m1: '#1a3438', m2: '#12262a', m3: '#0d1c1f',
    jade: '#cfe3d8', gold: '#d8b56a', teal: '#6fc7b8', red: '#c0574f'
  };

  function init(cv) {
    canvas = cv;
    ctx = canvas.getContext('2d');
    resize();
    if (root.addEventListener) {
      root.addEventListener('resize', resize);
    }
  }

  function resize() {
    if (!canvas) return;
    var r = canvas.getBoundingClientRect();
    DPR = Math.min(2, root.devicePixelRatio || 1);
    W = Math.max(320, r.width); H = Math.max(240, r.height);
    canvas.width = W * DPR; canvas.height = H * DPR;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function setScene(name) {
    if (sceneName === name) return;
    sceneName = name;
    if (name !== 'battle') battle = null;
    if (name !== 'alchemy') furnace = null;
    if (name !== 'break') breakPhase = null;
  }
  function setBattle(b) { battle = b; }
  function setFurnace(f) { furnace = f; }
  function setBreak(p) { breakPhase = p; }
  function setUpgraded(v) { upgraded = !!v; }
  function setMeditating(v) { meditating = !!v; }
  function setReduced(v) { reduced = !!v; MAX_P = reduced ? 140 : 420; }
  function playerHurt() { hurtAt = performance.now(); }

  /* ---------- 粒子 ---------- */
  function spawn(type, x, y, opts) {
    if (particles.length > MAX_P) particles.shift();
    var p = {
      type: type, x: x, y: y, vx: 0, vy: 0, life: 1, ttl: 1,
      size: 4, color: C.teal, grav: 0, spin: 0, rot: 0, txt: ''
    };
    if (opts) for (var k in opts) p[k] = opts[k];
    particles.push(p);
    return p;
  }

  function floater(text, x, y, opts) {
    if (floaters.length > 40) floaters.shift();
    var f = { text: text, x: x, y: y, vy: -46, life: 1.2, ttl: 1.2, color: C.jade, size: 17, bold: false };
    if (opts) for (var k in opts) f[k] = opts[k];
    floaters.push(f);
  }

  function ring(x, y, color, rmax, life) {
    rings.push({ x: x, y: y, r: 6, rmax: rmax || 120, life: life || 0.7, ttl: life || 0.7, color: color || C.gold });
  }

  function flash(a, color) { flashA = Math.min(0.85, a); flashColor = color || '255,255,255'; }
  function shake(mag, ms) { if (reduced) return; shakeMag = mag; shakeUntil = performance.now() + (ms || 250); }

  /* ---------- 特效组合 ---------- */
  function fxHit(x, y, crit) {
    for (var i = 0; i < (crit ? 14 : 8); i++) {
      var a = Math.random() * Math.PI * 2, sp = 60 + Math.random() * (crit ? 200 : 130);
      spawn('spark', x, y, { vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, ttl: 0.4, life: 0.4, size: crit ? 3.4 : 2.6, color: crit ? C.gold : '#e8f3ee' });
    }
    ring(x, y, crit ? '216,181,106' : '207,227,216', crit ? 60 : 40, 0.3);
  }
  function fxSword(x, y) {
    spawn('slash', x, y, { ttl: 0.3, life: 0.3, size: 90 });
    for (var i = 0; i < 10; i++) {
      spawn('spark', x + (Math.random() - 0.5) * 40, y + (Math.random() - 0.5) * 40, {
        vx: (Math.random() - 0.5) * 260, vy: -Math.random() * 160, ttl: 0.5, life: 0.5, size: 2.4, color: '#dff3ff'
      });
    }
  }
  function fxThunder(x, y) {
    for (var i = 0; i < 3; i++) {
      spawn('lightning', x, y - 220 - i * 26, { ttl: 0.4, life: 0.4, size: 60 + Math.random() * 40 });
    }
    ring(x, y, '255,240,180', 150, 0.5);
    flash(0.45, '255,245,200');
    shake(7, 300);
  }
  function fxShield(x, y) {
    ring(x, y, '111,199,184', 90, 0.6);
    for (var i = 0; i < 12; i++) {
      var a = (i / 12) * Math.PI * 2;
      spawn('spark', x + Math.cos(a) * 40, y + Math.sin(a) * 40, { vx: Math.cos(a) * 40, vy: Math.sin(a) * 40, ttl: 0.6, life: 0.6, size: 3, color: C.teal });
    }
  }
  function fxSpirit(x, y) { // 灵气汇聚
    var a = Math.random() * Math.PI * 2, d = 90 + Math.random() * 120;
    spawn('spirit', x + Math.cos(a) * d, y + Math.sin(a) * d * 0.6, {
      vx: -Math.cos(a) * d / 1.4, vy: -Math.sin(a) * d * 0.6 / 1.4,
      ttl: 1.4, life: 1.4, size: 2 + Math.random() * 2.4, color: Math.random() < 0.5 ? C.teal : C.gold
    });
  }
  function fxSmoke(x, y) {
    spawn('smoke', x + (Math.random() - 0.5) * 26, y - 30, {
      vy: -26 - Math.random() * 18, ttl: 1.6, life: 1.6, size: 10 + Math.random() * 10, color: '150,150,150'
    });
  }
  function fxFire(x, y, heat) {
    var h = Math.max(0.3, heat / 100);
    spawn('fire', x + (Math.random() - 0.5) * 30, y - 6, {
      vy: -50 - Math.random() * 70 * h, vx: (Math.random() - 0.5) * 20,
      ttl: 0.7, life: 0.7, size: 5 + Math.random() * 7 * h
    });
  }
  function fxBreakColumn(x, y) {
    for (var i = 0; i < 6; i++) {
      spawn('spirit', x + (Math.random() - 0.5) * 200, y + Math.random() * 60, {
        vy: -90 - Math.random() * 90, ttl: 1.6, life: 1.6, size: 2.5 + Math.random() * 3, color: Math.random() < 0.6 ? C.gold : C.teal
      });
    }
  }

  /* ---------- 绘制基元 ---------- */
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawSky(t) {
    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#0e2226');
    g.addColorStop(0.55, '#102a2e');
    g.addColorStop(1, '#0b1618');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // 月
    var mx = W * 0.78, my = H * 0.18;
    var mg = ctx.createRadialGradient(mx, my, 2, mx, my, 60);
    mg.addColorStop(0, 'rgba(240,224,180,0.9)');
    mg.addColorStop(0.25, 'rgba(240,224,180,0.35)');
    mg.addColorStop(1, 'rgba(240,224,180,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, 60, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#f0e6c8';
    ctx.beginPath(); ctx.arc(mx, my, 15, 0, Math.PI * 2); ctx.fill();
    // 星
    ctx.fillStyle = 'rgba(207,227,216,0.5)';
    for (var i = 0; i < 26; i++) {
      var sx = (i * 97.13) % W, sy = (i * 53.7) % (H * 0.5);
      var tw = 0.4 + 0.6 * Math.abs(Math.sin(t * 0.0008 + i));
      ctx.globalAlpha = tw * 0.7;
      ctx.fillRect(sx, sy, 1.6, 1.6);
    }
    ctx.globalAlpha = 1;
  }

  function drawCloud(x, y, s, alpha) {
    ctx.fillStyle = 'rgba(174,196,200,' + alpha + ')';
    ctx.beginPath();
    ctx.ellipse(x, y, 70 * s, 16 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 40 * s, y + 5 * s, 40 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 46 * s, y + 4 * s, 46 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMountains(t) {
    var layers = [
      { color: C.m1, base: H * 0.62, amp: H * 0.16, sp: 0.000012, off: 0 },
      { color: C.m2, base: H * 0.70, amp: H * 0.12, sp: 0.00002, off: 40 },
      { color: C.m3, base: H * 0.78, amp: H * 0.08, sp: 0.00003, off: 90 }
    ];
    layers.forEach(function (L, li) {
      ctx.fillStyle = L.color;
      ctx.beginPath();
      ctx.moveTo(0, H);
      for (var x = 0; x <= W; x += 14) {
        var n = Math.sin((x + t * L.sp) * 0.008 + li * 2.1) + 0.5 * Math.sin((x + t * L.sp) * 0.021 + li);
        var y = L.base - n * L.amp;
        ctx.lineTo(x, y);
      }
      ctx.lineTo(W, H);
      ctx.closePath();
      ctx.fill();
      // 雾带
      ctx.fillStyle = 'rgba(174,196,200,0.07)';
      ctx.fillRect(0, L.base - 6, W, 16);
    });
  }

  function drawPines(t) {
    var ground = H * 0.80;
    [[0.08, 1.0], [0.16, 0.7], [0.9, 0.9], [0.83, 0.6]].forEach(function (p) {
      var x = W * p[0], s = p[1];
      ctx.strokeStyle = '#0a1416';
      ctx.fillStyle = '#0a1416';
      ctx.beginPath();
      ctx.moveTo(x, ground);
      ctx.lineTo(x + 3 * s, ground - 34 * s);
      ctx.lineTo(x + 7 * s, ground);
      ctx.closePath(); ctx.fill();
      for (var i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(x - 16 * s + i * 4 * s, ground - (14 + i * 12) * s);
        ctx.lineTo(x + 3 * s, ground - (24 + i * 13) * s);
        ctx.lineTo(x + 22 * s - i * 4 * s, ground - (14 + i * 12) * s);
        ctx.closePath(); ctx.fill();
      }
    });
  }

  function drawCave(t) {
    var gx = W * 0.5, gy = H * 0.80;
    // 平台
    ctx.fillStyle = '#163031';
    ctx.beginPath();
    ctx.ellipse(gx, gy + 8, 130, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    // 洞府
    ctx.fillStyle = '#08110f';
    ctx.beginPath();
    ctx.moveTo(gx - 86, gy + 6);
    ctx.quadraticCurveTo(gx - 70, gy - 96, gx, gy - 100);
    ctx.quadraticCurveTo(gx + 70, gy - 96, gx + 86, gy + 6);
    ctx.closePath(); ctx.fill();
    // 洞口光
    var cg = ctx.createRadialGradient(gx, gy - 40, 4, gx, gy - 40, 90);
    cg.addColorStop(0, 'rgba(216,181,106,0.30)');
    cg.addColorStop(1, 'rgba(216,181,106,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(gx, gy - 40, 90, 0, Math.PI * 2); ctx.fill();
    // 筑基后：宫灯 + 灵泉
    if (upgraded) {
      [gx - 100, gx + 100].forEach(function (lx) {
        ctx.strokeStyle = '#3a2f1c'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(lx, gy - 120); ctx.lineTo(lx, gy - 96); ctx.stroke();
        var lg = ctx.createRadialGradient(lx, gy - 84, 2, lx, gy - 84, 26);
        lg.addColorStop(0, 'rgba(240,217,160,0.85)');
        lg.addColorStop(1, 'rgba(240,217,160,0)');
        ctx.fillStyle = lg;
        ctx.beginPath(); ctx.arc(lx, gy - 84, 26, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#e8c56d';
        ctx.beginPath(); ctx.ellipse(lx, gy - 84, 9, 12, 0, 0, Math.PI * 2); ctx.fill();
      });
      // 灵泉
      var sg = ctx.createRadialGradient(gx, gy + 60, 2, gx, gy + 60, 50);
      sg.addColorStop(0, 'rgba(79,168,189,0.5)');
      sg.addColorStop(1, 'rgba(79,168,189,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.ellipse(gx, gy + 62, 54, 12, 0, 0, Math.PI * 2); ctx.fill();
    }
  }

  /* 修炼阵法 */
  function drawArray(x, y, t) {
    ctx.save();
    ctx.translate(x, y);
    var rot = t * 0.0009;
    for (var k = 0; k < 2; k++) {
      ctx.save();
      ctx.rotate(rot * (k % 2 === 0 ? 1 : -1) + k);
      ctx.strokeStyle = k === 0 ? 'rgba(111,199,184,0.55)' : 'rgba(216,181,106,0.5)';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (var i = 0; i <= 6; i++) {
        var a = (i / 6) * Math.PI * 2;
        var r = 62 - k * 16 + Math.sin(t * 0.002 + i) * 3;
        var px = Math.cos(a) * r, py = Math.sin(a) * r * 0.42;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath(); ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  /* ---------- 人物（水墨剪影） ---------- */
  function drawPlayer(x, y, t, opts) {
    opts = opts || {};
    var bob = opts.meditating ? Math.sin(t * 0.0016) * 1.2 : Math.sin(t * 0.0022) * 2.2;
    var lunge = opts.lunge || 0;
    x += lunge;
    var scale = opts.scale || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    var flash = opts.hurt && (t - hurtAt < 220);
    ctx.strokeStyle = flash ? '#ffd9d4' : '#0a1416';
    ctx.fillStyle = flash ? '#3a2622' : '#101d20';
    ctx.lineWidth = 2.4;

    if (opts.meditating) {
      // 打坐：裙摆铺开
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.quadraticCurveTo(-20, -34, 0, -36);
      ctx.quadraticCurveTo(20, -34, 26, 0);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(0, -36, 10 + Math.sin(t * 0.0016) * 0.8, 11, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      // 发髻
      ctx.beginPath(); ctx.arc(0, -50, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // 拂尘置膝上
      ctx.strokeStyle = '#d8b56a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(-12, -22); ctx.quadraticCurveTo(0, -30, 12, -22); ctx.stroke();
    } else {
      var stand = bob;
      // 袍身
      ctx.beginPath();
      ctx.moveTo(-15, -58 + stand);
      ctx.quadraticCurveTo(-22, -20, -20, 0);
      ctx.quadraticCurveTo(0, 6, 20, 0);
      ctx.quadraticCurveTo(22, -20, 15, -58 + stand);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      // 腰带
      ctx.strokeStyle = '#d8b56a'; ctx.lineWidth = 2.6;
      ctx.beginPath(); ctx.moveTo(-15, -30 + stand); ctx.quadraticCurveTo(0, -26 + stand, 15, -30 + stand); ctx.stroke();
      // 头
      ctx.fillStyle = flash ? '#3a2622' : '#101d20';
      ctx.beginPath(); ctx.arc(0, -68 + stand, 10, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // 发髻
      ctx.beginPath(); ctx.arc(0, -80 + stand, 4.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // 防御姿态：双臂交叉胸前的光罩
      if (opts.defend) {
        ctx.strokeStyle = 'rgba(111,199,184,0.85)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(0, -38 + stand, 34, -Math.PI * 0.9, -Math.PI * 0.1); ctx.stroke();
      }
      // 施法：手前光芒
      if (opts.cast) {
        ctx.fillStyle = 'rgba(216,181,106,0.9)';
        ctx.beginPath(); ctx.arc(20, -44 + stand, 4, 0, Math.PI * 2); ctx.fill();
      }
    }
    ctx.restore();

    // 护盾罩
    if (opts.shield > 0) {
      ctx.save();
      ctx.globalAlpha = 0.5 + Math.sin(t * 0.006) * 0.15;
      var sg = ctx.createRadialGradient(x, y - 40, 8, x, y - 40, 52);
      sg.addColorStop(0, 'rgba(111,199,184,0.05)');
      sg.addColorStop(1, 'rgba(111,199,184,0.32)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(x, y - 40, 52, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(111,199,184,0.8)'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(x, y - 40, 52, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }
  }

  /* ---------- 敌人 ---------- */
  function drawEnemy(e, x, y, t) {
    var lunge = (e.lunge && t - e.lunge < 260) ? -26 : 0;
    var flash = (e.hitFlash && t - e.hitFlash < 130);
    ctx.save();
    ctx.translate(x + lunge, y);
    var bob = Math.sin(t * 0.003 + x) * 3;
    ctx.translate(0, bob);
    if (flash) { ctx.shadowColor = '#ffb0a8'; ctx.shadowBlur = 18; }

    if (e.id === 'rat') {
      ctx.fillStyle = flash ? '#c9b8b4' : '#8a9490';
      ctx.strokeStyle = '#141d1f'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -16, 26, 16, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(20, -26, 11, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(14, -36, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(26, -36, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#8a9490'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(-24, -20); ctx.quadraticCurveTo(-40, -34, -34, -48); ctx.stroke();
      ctx.fillStyle = '#e0534a';
      ctx.beginPath(); ctx.arc(24, -28, 2.2, 0, Math.PI * 2); ctx.fill();
    } else if (e.id === 'wolf') {
      ctx.fillStyle = flash ? '#8d9296' : '#565c61';
      ctx.strokeStyle = '#101619'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, -26, 34, 18, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.arc(28, -40, 13, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(28, -40); ctx.lineTo(44, -34); ctx.lineTo(30, -30); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(20, -52); ctx.lineTo(24, -64); ctx.lineTo(30, -50); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#565c61'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.moveTo(-30, -30); ctx.quadraticCurveTo(-48, -42, -42, -58); ctx.stroke();
      ctx.strokeStyle = '#101619'; ctx.lineWidth = 3;
      for (var i = -1; i <= 1; i++) {
        ctx.beginPath(); ctx.moveTo(i * 18, -12); ctx.lineTo(i * 18 - 2, 0); ctx.stroke();
      }
      ctx.fillStyle = '#f2c94e';
      ctx.beginPath(); ctx.arc(31, -43, 2.4, 0, Math.PI * 2); ctx.fill();
    } else if (e.id === 'stone') {
      ctx.fillStyle = flash ? '#9a9e94' : '#6b6f66';
      ctx.strokeStyle = '#171c17'; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(-30, 0); ctx.lineTo(-24, -30); ctx.lineTo(-8, -44); ctx.lineTo(12, -40);
      ctx.lineTo(28, -24); ctx.lineTo(32, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = '#3f443c'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.moveTo(-14, -38); ctx.lineTo(-6, -18); ctx.lineTo(-16, -6); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(14, -34); ctx.lineTo(20, -14); ctx.lineTo(8, -8); ctx.stroke();
      ctx.fillStyle = 'rgba(232,147,60,0.9)';
      ctx.beginPath(); ctx.arc(-6, -24, 3, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.arc(14, -22, 3, 0, Math.PI * 2); ctx.fill();
    } else if (e.id === 'boss') {
      // 青鳞妖蟒：三层盘身 + 昂起的头
      var coils = [[-44, 8, 46], [-8, 4, 52], [30, 0, 56]];
      coils.forEach(function (c, ci) {
        ctx.fillStyle = flash ? '#7fa08e' : (ci === 2 ? '#3d5a4a' : '#33503f');
        ctx.strokeStyle = '#0d1512'; ctx.lineWidth = 2.4;
        ctx.beginPath(); ctx.ellipse(c[0], -c[1], c[2], c[2] * 0.42, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = 'rgba(20,30,24,0.6)'; ctx.lineWidth = 1.4;
        for (var s = -2; s <= 2; s++) {
          ctx.beginPath(); ctx.arc(c[0] + s * 16, -c[1] - 6, 7, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
        }
      });
      // 颈与头
      ctx.fillStyle = flash ? '#7fa08e' : '#3d5a4a';
      ctx.strokeStyle = '#0d1512'; ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(26, -10);
      ctx.quadraticCurveTo(44, -60, 58, -96);
      ctx.lineTo(76, -88);
      ctx.quadraticCurveTo(58, -52, 46, -6);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.ellipse(68, -96, 20, 13, -0.3, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      // 独角
      ctx.beginPath(); ctx.moveTo(58, -106); ctx.lineTo(52, -126); ctx.lineTo(64, -110); ctx.closePath(); ctx.fill(); ctx.stroke();
      // 背鳍
      ctx.fillStyle = '#5f8a6e';
      ctx.beginPath(); ctx.moveTo(40, -70); ctx.lineTo(34, -86); ctx.lineTo(50, -76); ctx.closePath(); ctx.fill();
      // 眼与信子
      ctx.fillStyle = '#f2c94e';
      ctx.beginPath(); ctx.arc(72, -100, 3.4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#e0534a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(84, -94);
      ctx.quadraticCurveTo(92, -84 + Math.sin(t * 0.008) * 6, 86, -74);
      ctx.stroke();
    }
    ctx.restore();
  }

  /* ---------- HUD（战斗内） ---------- */
  function hpBar(x, y, w, ratio, color, label) {
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(x - w / 2, y, w, 9, 4.5); ctx.fill();
    ctx.fillStyle = color;
    roundRect(x - w / 2 + 1, y + 1, Math.max(0, (w - 2) * ratio), 7, 3.5); ctx.fill();
    if (label) {
      ctx.fillStyle = C.jade;
      ctx.font = '12px STKaiti, KaiTi, serif';
      ctx.textAlign = 'center';
      ctx.fillText(label, x, y - 5);
    }
  }

  /* ---------- 场景 ---------- */
  function renderCave(t, dt) {
    drawSky(t); drawMountains(t); drawPines(t); drawCave(t);
    var gx = W * 0.5, gy = H * 0.80;
    if (meditating) {
      drawArray(gx, gy + 4, t);
      if (Math.random() < dt * 22) fxSpirit(gx, gy - 40);
    }
    drawPlayer(gx, gy, t, { meditating: meditating, scale: 1 });
    // 落叶
    if (Math.random() < dt * 2.2) {
      spawn('leaf', Math.random() * W, -10, { vx: -14 - Math.random() * 14, vy: 16 + Math.random() * 12, ttl: 9, life: 9, size: 3 + Math.random() * 2, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 3 });
    }
    if (Math.random() < dt * 0.4) {
      spawn('glow', Math.random() * W, H * (0.5 + Math.random() * 0.4), { vx: (Math.random() - 0.5) * 8, vy: -6, ttl: 4, life: 4, size: 1.6, color: C.gold });
    }
  }

  function renderBattle(t, dt) {
    drawSky(t); drawMountains(t); drawPines(t);
    var gy = H * 0.80;
    var px = W * 0.27, ex = W * 0.73;
    var e = battle.enemy;
    var st = battle._stats || {};
    // 地面
    ctx.fillStyle = 'rgba(22,48,49,0.7)';
    ctx.beginPath(); ctx.ellipse(W * 0.5, gy + 10, W * 0.42, 26, 0, 0, Math.PI * 2); ctx.fill();

    var defendOn = t < battle.defendUntil;
    drawPlayer(px, gy, t, { defend: defendOn, shield: battle.shield, scale: 1 });
    drawEnemy(e, ex, gy, t);

    // 敌人预警
    if (e.telegraph) {
      var left = e.telegraph.at - t;
      var ratio = Math.max(0, Math.min(1, left / e.telegraph.dur));
      ctx.save();
      ctx.globalAlpha = 0.55 + 0.45 * Math.abs(Math.sin(t * 0.012));
      ctx.fillStyle = '#e8933c';
      ctx.font = '15px STKaiti, KaiTi, serif';
      ctx.textAlign = 'center';
      ctx.fillText('⚠ ' + e.telegraph.name, ex, gy - (e.id === 'boss' ? 150 : 78));
      ctx.restore();
      // 蓄力光圈
      ctx.strokeStyle = 'rgba(232,147,60,' + (0.3 + ratio * 0.5) + ')';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(ex, gy - 30, 60 + ratio * 18, 0, Math.PI * 2); ctx.stroke();
    }

    hpBar(ex, gy - (e.id === 'boss' ? 140 : 70), 96, e.hp / e.hpMax, e.phase === 2 ? '#e8933c' : '#c0574f', e.name + (e.phase === 2 ? '（暴怒）' : ''));
    hpBar(px, gy - 104, 84, (battle._hp || 1) / (battle._hpmax || 1), '#4fa8bd', '');

    // 首领二阶段氛围
    if (e.phase === 2 && Math.random() < dt * 6) {
      spawn('ember', Math.random() * W, gy, { vy: -40 - Math.random() * 40, ttl: 1.2, life: 1.2, size: 2.4, color: '#e8933c' });
    }
  }

  function renderAlchemy(t, dt) {
    drawSky(t); drawMountains(t);
    var f = furnace;
    var gx = W * 0.5, gy = H * 0.78;
    // 丹房内景
    ctx.fillStyle = 'rgba(10,18,18,0.55)';
    ctx.fillRect(0, 0, W, H);
    // 丹炉
    ctx.fillStyle = '#1c2426';
    ctx.strokeStyle = '#0a1012'; ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(gx - 52, gy); ctx.lineTo(gx - 38, gy - 66);
    ctx.quadraticCurveTo(gx, gy - 78, gx + 38, gy - 66);
    ctx.lineTo(gx + 52, gy); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a3438';
    ctx.beginPath(); ctx.ellipse(gx, gy - 66, 40, 10, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // 炉脚
    ctx.strokeStyle = '#1c2426'; ctx.lineWidth = 6;
    [-1, 1].forEach(function (s) {
      ctx.beginPath(); ctx.moveTo(gx + s * 30, gy); ctx.lineTo(gx + s * 38, gy + 22); ctx.stroke();
    });
    // 炉火
    if (f && f.running) {
      var heat = f.heat;
      var glowR = 60 + heat * 0.9;
      var fg = ctx.createRadialGradient(gx, gy + 6, 4, gx, gy + 6, glowR);
      fg.addColorStop(0, 'rgba(242,201,107,' + (0.35 + heat / 260) + ')');
      fg.addColorStop(1, 'rgba(232,147,60,0)');
      ctx.fillStyle = fg;
      ctx.beginPath(); ctx.arc(gx, gy + 6, glowR, 0, Math.PI * 2); ctx.fill();
      if (Math.random() < 0.9) fxFire(gx, gy, heat);
      if (Math.random() < 0.35) fxSmoke(gx, gy - 70);
    }
    drawPlayer(W * 0.2, H * 0.86, t, { scale: 0.9 });
  }

  function renderBreak(t, dt) {
    renderCave(t, dt);
    var gx = W * 0.5, gy = H * 0.80;
    var phase = breakPhase || 'charge';
    if (Math.random() < dt * 30) fxBreakColumn(gx, gy);
    if (phase === 'impact') {
      if (Math.random() < dt * 8) ring(gx, gy - 50, '216,181,106', 220, 0.9);
      flash(0.18, '240,217,160');
    }
    ctx.save();
    ctx.globalAlpha = 0.4 + Math.sin(t * 0.01) * 0.2;
    var cg = ctx.createRadialGradient(gx, gy - 44, 6, gx, gy - 44, 120);
    cg.addColorStop(0, 'rgba(240,217,160,0.5)');
    cg.addColorStop(1, 'rgba(240,217,160,0)');
    ctx.fillStyle = cg;
    ctx.beginPath(); ctx.arc(gx, gy - 44, 120, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* ---------- 粒子更新与绘制 ---------- */
  function stepParticles(t, dt) {
    var i, p;
    for (i = particles.length - 1; i >= 0; i--) {
      p = particles[i];
      p.life -= dt;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += (p.spin || 0) * dt;
      if (p.grav) p.vy += p.grav * dt;
    }
    for (i = floaters.length - 1; i >= 0; i--) {
      var f = floaters[i];
      f.life -= dt; f.y += f.vy * dt; f.vy *= 0.94;
      if (f.life <= 0) floaters.splice(i, 1);
    }
    for (i = rings.length - 1; i >= 0; i--) {
      var r = rings[i];
      r.life -= dt;
      r.r += (r.rmax - r.r) * Math.min(1, dt * 8);
      if (r.life <= 0) rings.splice(i, 1);
    }
  }

  function drawParticles(t) {
    var i, p, a;
    for (i = 0; i < particles.length; i++) {
      p = particles[i];
      a = Math.max(0, p.life / p.ttl);
      if (p.type === 'spark') {
        ctx.globalAlpha = a;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else if (p.type === 'spirit') {
        ctx.globalAlpha = a * 0.9;
        var g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        g.addColorStop(0, p.color); g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'leaf') {
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = '#7a8a5e';
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.6, p.size * 0.7, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      } else if (p.type === 'smoke') {
        ctx.globalAlpha = a * 0.28;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size * (2 - a), 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'fire') {
        ctx.globalAlpha = a;
        var fg2 = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size);
        fg2.addColorStop(0, 'rgba(242,201,107,0.95)');
        fg2.addColorStop(0.5, 'rgba(232,147,60,0.7)');
        fg2.addColorStop(1, 'rgba(181,80,42,0)');
        ctx.fillStyle = fg2;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'ember') {
        ctx.globalAlpha = a * 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'glow') {
        ctx.globalAlpha = a * 0.7;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
      } else if (p.type === 'slash') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#dff3ff'; ctx.lineWidth = 3;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(-0.6 + (1 - a) * 1.2);
        ctx.beginPath(); ctx.arc(0, 0, p.size * 0.6, -0.7, 0.7); ctx.stroke();
        ctx.restore();
      } else if (p.type === 'lightning') {
        ctx.globalAlpha = a;
        ctx.strokeStyle = '#fff0c8'; ctx.lineWidth = 2.4;
        ctx.beginPath();
        var lx = p.x;
        ctx.moveTo(lx, p.y);
        while (p.y < H * 0.78) {
          p.y += 22;
          lx += (Math.random() - 0.5) * 26;
          ctx.lineTo(lx, p.y);
        }
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
    // 环
    for (i = 0; i < rings.length; i++) {
      var r = rings[i];
      ctx.globalAlpha = Math.max(0, r.life / r.ttl) * 0.8;
      ctx.strokeStyle = 'rgba(' + r.color + ',1)';
      ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 浮字
    ctx.textAlign = 'center';
    for (i = 0; i < floaters.length; i++) {
      var f = floaters[i];
      ctx.globalAlpha = Math.max(0, Math.min(1, f.life / f.ttl * 1.6));
      ctx.font = (f.bold ? 'bold ' : '') + f.size + 'px STKaiti, KaiTi, serif';
      ctx.fillStyle = f.color;
      ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
  }

  function render(now, dt) {
    if (!ctx) return;
    var t = now;
    ctx.save();
    if (shakeMag && now < shakeUntil) {
      ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
    }
    stepParticles(t, dt);
    if (sceneName === 'battle' && battle && battle.running !== undefined) renderBattle(t, dt);
    else if (sceneName === 'alchemy') renderAlchemy(t, dt);
    else if (sceneName === 'break') renderBreak(t, dt);
    else renderCave(t, dt);
    drawParticles(t);
    ctx.restore();
    if (flashA > 0.005) {
      ctx.fillStyle = 'rgba(' + flashColor + ',' + flashA + ')';
      ctx.fillRect(0, 0, W, H);
      flashA *= Math.pow(0.001, dt); // 快速衰减
    } else flashA = 0;
  }

  root.SCENE = {
    init: init, resize: resize, render: render,
    setScene: setScene, setBattle: setBattle, setFurnace: setFurnace, setBreak: setBreak,
    setUpgraded: setUpgraded, setMeditating: setMeditating, setReduced: setReduced,
    spawn: spawn, floater: floater, ring: ring, flash: flash, shake: shake, playerHurt: playerHurt,
    fxHit: fxHit, fxSword: fxSword, fxThunder: fxThunder, fxShield: fxShield,
    fxSpirit: fxSpirit, fxSmoke: fxSmoke, fxFire: fxFire, fxBreakColumn: fxBreakColumn,
    W: function () { return W; }, H: function () { return H; },
    groundY: function () { return H * 0.80; },
    playerX: function () { return W * 0.27; },
    enemyX: function () { return W * 0.73; }
  };
})(typeof self !== 'undefined' ? self : globalThis);
