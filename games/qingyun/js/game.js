/* ===== 统一状态层：唯一权威游戏状态 / 属性计算 / 背包 / 事件 ===== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./data.js')); }
  else { root.GAME = factory(root.DATA); }
})(typeof self !== 'undefined' ? self : globalThis, function (DATA) {
  'use strict';

  var listeners = {};

  function on(evt, fn) {
    (listeners[evt] || (listeners[evt] = [])).push(fn);
  }
  function emit(evt, payload) {
    var arr = listeners[evt] || [];
    for (var i = 0; i < arr.length; i++) arr[i](payload);
  }

  /* 新角色 */
  function newGame(name) {
    var S = {
      name: name || '无名散修',
      realm: 0,            // 凡人
      exp: 0,
      hp: 100, mp: 60,     // 与 calcStats 凡人值一致，创建后由 ui 同步
      stones: 50,
      cultivating: false,
      bt: null,            // 突破状态机 { phase, until }
      buffs: [],           // [{ id, until }] now 毫秒时间戳
      inventory: { lingcao: 2 },
      equip: { weapon: null, armor: null, accessory: null },
      learned: [],
      meridian: { tuina: 1 },
      quests: {},
      flags: { named: true },
      gatherCd: {},
      furnace: null,
      savedAt: Date.now(),
      createdAt: Date.now()
    };
    S.flags.named = true;
    // 任务初始状态
    DATA.QUESTS.forEach(function (q) { S.quests[q.id] = { done: false, claimed: false }; });
    return S;
  }

  /* 属性统一计算：基础 + 境界成长 + 装备 */
  function calcStats(S) {
    var base = DATA.REALMS[0].base; // 唯一基础值来源（凡人）
    var hp = base.hp, mp = base.mp, atk = base.atk, def = base.def, crit = base.crit;
    for (var i = 1; i <= S.realm; i++) {
      var g = DATA.REALMS[i].growth;
      if (!g) continue;
      hp += g.hp || 0; mp += g.mp || 0; atk += g.atk || 0; def += g.def || 0; crit += g.crit || 0;
    }
    // 装备
    DATA.SLOTS.forEach(function (slot) {
      var id = S.equip[slot.id];
      if (!id) return;
      var it = DATA.ITEMS[id];
      if (!it) return;
      hp += it.hp || 0; mp += it.mp || 0; atk += it.atk || 0; def += it.def || 0; crit += it.crit || 0;
    });
    var st = { hp: Math.round(hp), mp: Math.round(mp), atk: Math.round(atk), def: Math.round(def), crit: crit };
    // 修炼速度：基础 5 × 吐纳诀加成 × 丹药
    var rate = 5 * (1 + 0.08 * (S.meridian.tuina - 1));
    if (hasBuff(S, 'juqi')) rate *= 1.5;
    st.cultRate = rate;
    return st;
  }

  /* 背包 */
  function countItem(S, id) { return S.inventory[id] || 0; }
  function addItem(S, id, qty) {
    if (!DATA.ITEMS[id]) return;
    S.inventory[id] = countItem(S, id) + qty;
  }
  function removeItem(S, id, qty) {
    var left = countItem(S, id) - qty;
    if (left <= 0) delete S.inventory[id];
    else S.inventory[id] = left;
  }

  /* 装备：穿上/卸下/替换，物品不复制 */
  function equipItem(S, itemId) {
    var it = DATA.ITEMS[itemId];
    if (!it || it.type !== 'equip') return { ok: false, reason: '这不是装备' };
    if (countItem(S, itemId) <= 0) return { ok: false, reason: '背包中没有此物' };
    var slot = it.slot;
    var old = S.equip[slot];
    removeItem(S, itemId, 1);
    if (old) addItem(S, old, 1);
    S.equip[slot] = itemId;
    return { ok: true, old: old };
  }
  function unequipItem(S, slot) {
    var id = S.equip[slot];
    if (!id) return { ok: false };
    S.equip[slot] = null;
    addItem(S, id, 1);
    return { ok: true };
  }

  /* 技能学习 */
  function learnSkill(S, id) {
    var sk = DATA.SKILLS[id];
    if (!sk) return { ok: false, reason: '未知功法' };
    if (S.learned.indexOf(id) >= 0) return { ok: false, reason: '已经学过' };
    if (S.realm < DATA.REALM_IDX[sk.unlockRealm]) return { ok: false, reason: '境界不足' };
    if (S.stones < sk.learnCost) return { ok: false, reason: '灵石不足' };
    S.stones -= sk.learnCost;
    S.learned.push(id);
    return { ok: true };
  }

  /* 增益 */
  function addBuff(S, id, durSec, now) {
    var until = now + durSec * 1000;
    var b = S.buffs.filter(function (x) { return x.id === id; })[0];
    if (b) { b.until = Math.max(b.until, until); return; } // 同类只延长时间
    S.buffs.push({ id: id, until: until });
  }
  function hasBuff(S, id) { return S.buffs.some(function (x) { return x.id === id; }); }
  function cleanBuffs(S, now) {
    S.buffs = S.buffs.filter(function (x) { return x.until > now; });
  }
  function buffRemaining(S, id, now) {
    var b = S.buffs.filter(function (x) { return x.id === id; })[0];
    return b ? Math.max(0, b.until - now) : 0;
  }

  /* 恢复生命灵力（洞府） */
  function fullRestore(S) {
    var st = calcStats(S);
    S.hp = st.hp; S.mp = st.mp;
  }

  return {
    on: on, emit: emit,
    newGame: newGame,
    calcStats: calcStats,
    countItem: countItem, addItem: addItem, removeItem: removeItem,
    equipItem: equipItem, unequipItem: unequipItem,
    learnSkill: learnSkill,
    addBuff: addBuff, hasBuff: hasBuff, cleanBuffs: cleanBuffs, buffRemaining: buffRemaining,
    fullRestore: fullRestore
  };
});
