/* ===== 规则层：修炼 / 突破 / 战斗 / 炼丹 / 任务 / 掉落 / 离线 =====
   全部为围绕权威状态 S 的纯函数式规则，不直接操作 DOM（便于 Node 测试） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./data.js'), require('./game.js')); }
  else { root.SYS = factory(root.DATA, root.GAME); }
})(typeof self !== 'undefined' ? self : globalThis, function (DATA, GAME) {
  'use strict';

  var OFFLINE_CAP_MS = 8 * 3600 * 1000;
  var AUTO_ATK_MS = 1500;
  var DEFEND_DUR = 2000, DEFEND_CD = 6000, DEFEND_CUT = 0.4; // 防御减伤 60%
  var PILL_CD = 8000;
  var BASE_CULT = 5;

  /* ---------- 伤害 ---------- */
  function calcDamage(atk, mult, def, crit) {
    var base = Math.max(1, Math.round(atk * mult) - def);
    var isCrit = crit > 0 && Math.random() < crit;
    var dmg = isCrit ? Math.round(base * 1.5) : base;
    return { dmg: dmg, crit: isCrit, base: base };
  }

  /* ---------- 修炼 ---------- */
  function cultTick(S, dt) {
    if (!S.cultivating) return null;
    var realm = DATA.REALMS[S.realm];
    if (realm.need == null) { S.cultivating = false; return { t: 'full' }; }
    var st = GAME.calcStats(S);
    var before = S.exp;
    S.exp = Math.min(realm.need, S.exp + st.cultRate * dt);
    if (S.exp >= realm.need) {
      S.cultivating = false;
      return { t: 'full', gain: S.exp - before };
    }
    return { t: 'tick', gain: S.exp - before };
  }

  /* ---------- 突破状态机：准备 → 聚气 → 冲击 → 成功 ---------- */
  function startBreakthrough(S, now) {
    if (S.bt) return { ok: false, reason: '突破正在进行中' };
    var realm = DATA.REALMS[S.realm];
    if (realm.need == null) return { ok: false, reason: '已达当前版本最高境界' };
    if (S.exp < realm.need) return { ok: false, reason: '修为尚未圆满' };
    var next = DATA.REALMS[S.realm + 1];
    if (next && next.id === 'zj') {
      if (S.stones < 100) return { ok: false, reason: '灵石不足（需要 100）' };
      if (GAME.countItem(S, 'jiedan') < 1) return { ok: false, reason: '需要一枚筑基丹' };
    }
    S.cultivating = false;
    S.bt = { phase: 'charge', until: now + DATA.BT.charge };
    return { ok: true };
  }

  function btTick(S, now) {
    if (!S.bt) return null;
    if (now < S.bt.until) return null;
    if (S.bt.phase === 'charge') {
      S.bt.phase = 'impact';
      S.bt.until = now + DATA.BT.impact;
      return { t: 'phase', phase: 'impact' };
    }
    // 冲击结束：晋升。资源只在此时扣除一次，配合 S.bt 置空防重复
    var next = DATA.REALMS[S.realm + 1];
    if (next && next.id === 'zj') {
      S.stones -= 100;
      GAME.removeItem(S, 'jiedan', 1);
    }
    S.realm += 1;
    S.exp = 0;
    S.bt = null;
    var st = GAME.calcStats(S);
    S.hp = Math.min(S.hp, st.hp);
    S.mp = Math.min(S.mp, st.mp);
    return { t: 'success', realm: next.name };
  }

  /* ---------- 离线收益 ---------- */
  function computeOffline(S, nowMs) {
    if (!S.cultivating) return null;
    var realm = DATA.REALMS[S.realm];
    if (realm.need == null) return null;
    var ms = nowMs - (S.savedAt || nowMs);
    if (ms < 0) ms = 0; // 时间回拨按零处理
    var capped = Math.min(ms, OFFLINE_CAP_MS);
    var base = BASE_CULT * (1 + 0.08 * (S.meridian.tuina - 1)); // 不叠加限时丹药
    var gain = base * 0.5 * capped / 1000;
    var before = S.exp;
    S.exp = Math.min(realm.need, S.exp + gain);
    var filled = S.exp >= realm.need;
    if (filled) S.cultivating = false; // 离线不自动突破
    return { ms: capped, gain: S.exp - before, filled: filled };
  }

  /* ---------- 战斗 ---------- */
  function createBattle(enemyId, S, now, nodeId) {
    var e = DATA.ENEMIES[enemyId];
    if (!e) return null;
    var inst = {
      id: e.id, name: e.name, title: e.title, desc: e.desc,
      hp: e.hp, hpMax: e.hp, atk: e.atk, def: e.def,
      atkInterval: e.atkInterval, stones: e.stones, drops: e.drops,
      strong: e.strong, strongs: e.strongs, phase2At: e.phase2At,
      isBoss: enemyId === 'boss',
      basicCount: 0, strongIdx: 0, nextAct: now + 1400, telegraph: null,
      phase: 1, hitFlash: 0, lunge: 0
    };
    return {
      nodeId: nodeId || null,
      enemy: inst,
      autoAt: now + 800,
      cds: {}, shield: 0, shieldUntil: 0,
      defendUntil: 0, defendCd: 0, pillCd: 0,
      running: true, over: null, drops: null, claimed: false
    };
  }

  // 敌人对玩家造成伤害（含防御判定与护盾吸收）
  function enemyDealDamage(b, S, rawDmg, now) {
    var dmg = rawDmg, defended = false, absorbed = 0;
    if (now < b.defendUntil) { dmg = Math.max(1, Math.round(dmg * DEFEND_CUT)); defended = true; }
    if (b.shield > 0 && now < b.shieldUntil) {
      absorbed = Math.min(b.shield, dmg);
      b.shield -= absorbed;
      dmg -= absorbed;
      if (b.shield <= 0) { b.shield = 0; b.shieldUntil = 0; }
    }
    S.hp = Math.max(0, S.hp - dmg);
    return { dmg: dmg, defended: defended, absorbed: absorbed };
  }

  function endBattle(b, over) {
    if (!b.running) return;
    b.running = false;
    b.over = over;
    if (over === 'win' && !b.drops) b.drops = rollDrops(b.enemy);
  }

  function battleTick(b, S, dt, now) {
    if (!b.running) return [];
    var evs = [];
    var stats = GAME.calcStats(S);
    var e = b.enemy;

    // 玩家普攻（自动）
    if (now >= b.autoAt) {
      b.autoAt = now + AUTO_ATK_MS;
      var r = calcDamage(stats.atk, 1, e.def, stats.crit);
      e.hp -= r.dmg;
      e.hitFlash = now;
      evs.push({ t: 'hit', src: 'player', dmg: r.dmg, crit: r.crit });
      if (e.hp <= 0) { e.hp = 0; endBattle(b, 'win'); return evs; }
    }

    // 敌人行动
    if (e.telegraph) {
      if (now >= e.telegraph.at) {
        var sk = e.telegraph;
        e.telegraph = null;
        e.lunge = now;
        var rd = calcDamage(e.atk, sk.mult, stats.def, 0);
        var res = enemyDealDamage(b, S, rd.dmg, now);
        evs.push({ t: 'strong', name: sk.name, dmg: res.dmg, defended: res.defended, absorbed: res.absorbed });
        e.nextAct = now + e.atkInterval * 1000;
        if (S.hp <= 0) { endBattle(b, 'lose'); return evs; }
      }
    } else if (now >= e.nextAct) {
      var wantStrong = e.strongs ? true : (e.strong && e.basicCount >= e.strong.every);
      if (wantStrong) {
        var skd;
        if (e.strongs) {
          skd = e.strongs[e.strongIdx % e.strongs.length];
          e.strongIdx++;
        } else {
          skd = e.strong;
          e.basicCount = 0;
        }
        e.telegraph = { name: skd.name, mult: skd.mult, at: now + skd.telegraph * 1000, dur: skd.telegraph * 1000 };
        evs.push({ t: 'telegraph', name: skd.name });
      } else {
        e.basicCount++;
        var rd2 = calcDamage(e.atk, 1, stats.def, 0);
        var res2 = enemyDealDamage(b, S, rd2.dmg, now);
        evs.push({ t: 'hit', src: 'enemy', dmg: res2.dmg, defended: res2.defended, absorbed: res2.absorbed });
        e.nextAct = now + e.atkInterval * 1000;
        if (S.hp <= 0) { endBattle(b, 'lose'); return evs; }
      }
    }

    // 首领二阶段
    if (e.phase2At && e.phase === 1 && e.hp <= e.hpMax * e.phase2At) {
      e.phase = 2;
      e.atkInterval = e.atkInterval * 0.75;
      e.atk = Math.round(e.atk * 1.2);
      evs.push({ t: 'phase', name: e.name + '暴怒！' });
    }
    return evs;
  }

  function useSkill(b, S, id, now) {
    if (!b.running) return { ok: false, reason: '战斗已结束' };
    var sk = DATA.SKILLS[id];
    if (!sk) return { ok: false, reason: '未知功法' };
    if (S.learned.indexOf(id) < 0) return { ok: false, reason: '尚未学会此功法' };
    if (now < (b.cds[id] || 0)) return { ok: false, reason: '冷却中' };
    var stats = GAME.calcStats(S);
    if (S.mp < sk.mp) return { ok: false, reason: '灵力不足' };
    S.mp -= sk.mp;
    b.cds[id] = now + sk.cd * 1000;
    if (sk.type === 'shield') {
      b.shield = Math.max(b.shield, sk.shield); // 不叠加，取较大值
      b.shieldUntil = now + sk.dur * 1000;
      return { ok: true, ev: { t: 'shield', value: sk.shield } };
    }
    var r = calcDamage(stats.atk, sk.mult, b.enemy.def, stats.crit);
    b.enemy.hp -= r.dmg;
    b.enemy.hitFlash = now;
    b.enemy.lunge = now;
    var ev = { t: 'skill', id: id, dmg: r.dmg, crit: r.crit };
    if (b.enemy.hp <= 0) { b.enemy.hp = 0; endBattle(b, 'win'); }
    return { ok: true, ev: ev };
  }

  function defend(b, now) {
    if (!b.running) return { ok: false, reason: '战斗已结束' };
    if (now < b.defendCd) return { ok: false, reason: '防御冷却中' };
    b.defendUntil = now + DEFEND_DUR;
    b.defendCd = now + DEFEND_CD;
    return { ok: true, ev: { t: 'defend' } };
  }

  function retreat(b) {
    if (!b.running) return { ok: false };
    b.running = false;
    b.over = 'retreat';
    return { ok: true };
  }

  function usePillInBattle(b, S, itemId, now) {
    if (!b.running) return { ok: false, reason: '战斗已结束' };
    if (now < b.pillCd) return { ok: false, reason: '丹药冷却中' };
    var it = DATA.ITEMS[itemId];
    if (!it || it.type !== 'pill') return { ok: false, reason: '这不是丹药' };
    if (GAME.countItem(S, itemId) <= 0) return { ok: false, reason: '数量不足' };
    GAME.removeItem(S, itemId, 1);
    b.pillCd = now + PILL_CD;
    var stats = GAME.calcStats(S);
    var healed = 0, manaed = 0;
    if (it.heal) { healed = Math.round(stats.hp * it.heal); S.hp = Math.min(stats.hp, S.hp + healed); }
    if (it.mana) { manaed = Math.round(stats.mp * it.mana); S.mp = Math.min(stats.mp, S.mp + manaed); }
    if (it.cult) GAME.addBuff(S, 'juqi', it.dur, Date.now());
    return { ok: true, ev: { t: 'pill', id: itemId, healed: healed, manaed: manaed }, item: it };
  }

  /* ---------- 掉落 ---------- */
  function rollDrops(enemy) {
    var items = [];
    (enemy.drops || []).forEach(function (d) {
      if (Math.random() < d.chance) {
        var qty = d.min + Math.floor(Math.random() * (d.max - d.min + 1));
        var exist = items.filter(function (x) { return x.item === d.item; })[0];
        if (exist) exist.qty += qty;
        else items.push({ item: d.item, qty: qty });
      }
    });
    var stones = enemy.stones[0] + Math.floor(Math.random() * (enemy.stones[1] - enemy.stones[0] + 1));
    return { items: items, stones: stones };
  }

  function claimDrops(b, S) {
    if (b.over !== 'win' || b.claimed || !b.drops) return { ok: false, reason: '没有可领取的掉落' };
    b.claimed = true;
    S.stones += b.drops.stones;
    b.drops.items.forEach(function (x) { GAME.addItem(S, x.item, x.qty); });
    return { ok: true, stones: b.drops.stones, items: b.drops.items };
  }

  /* ---------- 炼丹 ---------- */
  function startAlchemy(S, recipeId) {
    var r = DATA.RECIPES[recipeId];
    if (!r) return { ok: false, reason: '丹方不存在' };
    if (S.furnace && S.furnace.running) return { ok: false, reason: '炉火正旺，请先了结当前一炉' };
    for (var iid in r.cost) {
      if (GAME.countItem(S, iid) < r.cost[iid]) {
        return { ok: false, reason: '材料不足：' + DATA.ITEMS[iid].name + '（需 ' + r.cost[iid] + '）' };
      }
    }
    for (var iid2 in r.cost) GAME.removeItem(S, iid2, r.cost[iid2]);
    S.furnace = {
      recipe: recipeId, t: 0, dur: r.time, zone: r.zone.slice(),
      heat: 40, inZone: 0, heatOn: false, coolOn: false,
      running: true, finished: null, settled: false
    };
    return { ok: true };
  }

  function furnaceTick(f, dt) {
    if (!f || !f.running) return;
    f.t += dt;
    var rate = 4 + (f.heatOn ? 24 : 0) - (f.coolOn ? 28 : 0); // 自然上浮，添火/降温调速
    f.heat = Math.max(0, Math.min(100, f.heat + rate * dt));
    if (f.heat >= f.zone[0] && f.heat <= f.zone[1]) f.inZone += dt;
    if (f.t >= f.dur) { f.running = false; f.finished = 'done'; }
  }

  function settleAlchemy(S, f) {
    if (!f || f.settled) return null;
    f.settled = true;
    if (f.finished !== 'done') return null; // 中止不得丹
    var ratio = f.dur > 0 ? f.inZone / f.dur : 0;
    var qty = 1, tier = 1;
    if (ratio >= 0.8) { qty = 2; tier = 3; }
    else if (ratio >= 0.5) { qty = Math.random() < 0.5 ? 2 : 1; tier = 2; }
    GAME.addItem(S, f.recipe, qty);
    S.flags.firstPill = true;
    return { item: f.recipe, qty: qty, tier: tier, ratio: ratio };
  }

  function cancelAlchemy(f) {
    if (!f || f.settled) return;
    f.running = false;
    f.settled = true;
    f.finished = 'aborted';
  }

  /* ---------- 任务 ---------- */
  function questMet(S, q) {
    var c = q.cond;
    if (c.flag) return !!S.flags[c.flag];
    if (c.realm) return S.realm >= DATA.REALM_IDX[c.realm];
    if (c.skill) return S.learned.indexOf(c.skill) >= 0;
    return false;
  }

  function checkQuests(S) {
    var done = [];
    DATA.QUESTS.forEach(function (q) {
      var st = S.quests[q.id] || (S.quests[q.id] = { done: false, claimed: false });
      if (!st.done && questMet(S, q)) {
        st.done = true;
        done.push(q);
      }
    });
    return done;
  }

  function claimQuest(S, id) {
    var q = null;
    DATA.QUESTS.forEach(function (x) { if (x.id === id) q = x; });
    var st = S.quests[id];
    if (!q || !st || !st.done || st.claimed) return { ok: false, reason: '奖励不可领取' };
    st.claimed = true;
    if (q.reward.stones) S.stones += q.reward.stones;
    if (q.reward.item) GAME.addItem(S, q.reward.item, q.reward.qty || 1);
    if (q.reward.items) for (var k in q.reward.items) GAME.addItem(S, k, q.reward.items[k]);
    return { ok: true, quest: q, reward: q.reward };
  }

  /* ---------- 历练节点 ---------- */
  function nodeUnlocked(S, node) {
    if (!node.unlock) return { ok: true };
    if (node.unlock.realm) {
      var need = DATA.REALM_IDX[node.unlock.realm];
      if (S.realm < need) {
        return { ok: false, reason: '需要达到 ' + DATA.REALMS[need].name };
      }
    }
    if (node.unlock.quest) {
      var st = S.quests[node.unlock.quest];
      var qname = node.unlock.quest;
      DATA.QUESTS.forEach(function (q) { if (q.id === node.unlock.quest) qname = q.name; });
      if (!st || !st.done) return { ok: false, reason: '需要完成任务「' + qname + '」' };
    }
    return { ok: true };
  }

  function gatherReady(S, node, now) {
    var until = S.gatherCd[node.id] || 0;
    return { ok: now >= until, remain: Math.max(0, until - now) };
  }

  function doGather(S, node, now) {
    var g = node.gather;
    var qty = g.min + Math.floor(Math.random() * (g.max - g.min + 1));
    GAME.addItem(S, g.item, qty);
    S.gatherCd[node.id] = now + g.cooldown * 1000;
    return { ok: true, item: g.item, qty: qty };
  }

  return {
    calcDamage: calcDamage,
    cultTick: cultTick,
    startBreakthrough: startBreakthrough, btTick: btTick,
    computeOffline: computeOffline,
    createBattle: createBattle, battleTick: battleTick,
    useSkill: useSkill, defend: defend, retreat: retreat, usePillInBattle: usePillInBattle,
    rollDrops: rollDrops, claimDrops: claimDrops,
    startAlchemy: startAlchemy, furnaceTick: furnaceTick, settleAlchemy: settleAlchemy, cancelAlchemy: cancelAlchemy,
    questMet: questMet, checkQuests: checkQuests, claimQuest: claimQuest,
    nodeUnlocked: nodeUnlocked, gatherReady: gatherReady, doGather: doGather,
    AUTO_ATK_MS: AUTO_ATK_MS, DEFEND_DUR: DEFEND_DUR, DEFEND_CD: DEFEND_CD, PILL_CD: PILL_CD,
    OFFLINE_CAP_MS: OFFLINE_CAP_MS, BASE_CULT: BASE_CULT
  };
});
