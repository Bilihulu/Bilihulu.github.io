/* ===== 存档层：localStorage 持久化 / 校验 / 迁移 / 导入导出 ===== */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(require('./data.js')); }
  else { root.SAVE = factory(root.DATA); }
})(typeof self !== 'undefined' ? self : globalThis, function (DATA) {
  'use strict';

  var KEY = 'qingyun.save.v1';
  var SETTINGS_KEY = 'qingyun.settings.v1';

  function defaultStorage() {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('__probe__', '1');
        localStorage.removeItem('__probe__');
        return localStorage;
      }
    } catch (e) { /* 忽略 */ }
    var mem = {};
    return {
      getItem: function (k) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; },
      setItem: function (k, v) { mem[k] = String(v); },
      removeItem: function (k) { delete mem[k]; }
    };
  }

  var store = defaultStorage();

  /* ---------- 校验 ---------- */
  function isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); }
  function isNum(v) { return typeof v === 'number' && isFinite(v); }

  // 返回 { ok, save, reason }；save 为规范化后的完整存档
  function validate(raw) {
    if (!isObj(raw)) return { ok: false, reason: '存档不是有效的 JSON 对象' };
    if (!isNum(raw.version)) return { ok: false, reason: '缺少存档版本号' };
    if (raw.version > DATA.VERSION) return { ok: false, reason: '存档版本（v' + raw.version + '）高于当前游戏（v' + DATA.VERSION + '），请升级游戏' };
    if (!isNum(raw.savedAt)) return { ok: false, reason: '缺少保存时间' };
    var d = raw.data;
    if (!isObj(d)) return { ok: false, reason: '缺少角色数据' };

    if (typeof d.name !== 'string' || !d.name) return { ok: false, reason: '角色缺少道号' };
    if (!isNum(d.realm) || d.realm < 0 || d.realm > DATA.REALMS.length - 1 || d.realm % 1 !== 0) {
      return { ok: false, reason: '境界数据非法' };
    }
    var realm = DATA.REALMS[d.realm];
    if (!isNum(d.exp) || d.exp < 0) return { ok: false, reason: '修为数据非法' };
    if (realm.need != null && d.exp > realm.need) d.exp = realm.need; // 宽容截断
    if (!isNum(d.stones) || d.stones < 0 || d.stones % 1 !== 0) return { ok: false, reason: '灵石数据非法' };
    if (!isNum(d.hp) || d.hp < 0) return { ok: false, reason: '生命数据非法' };
    if (!isNum(d.mp) || d.mp < 0) return { ok: false, reason: '灵力数据非法' };

    if (!isObj(d.inventory)) return { ok: false, reason: '背包数据非法' };
    for (var iid in d.inventory) {
      if (!DATA.ITEMS[iid]) return { ok: false, reason: '背包中存在未知物品：' + iid };
      var q = d.inventory[iid];
      if (!isNum(q) || q < 0 || q % 1 !== 0) return { ok: false, reason: '物品「' + DATA.ITEMS[iid].name + '」数量非法' };
    }

    if (!isObj(d.equip)) return { ok: false, reason: '装备数据非法' };
    for (var s = 0; s < DATA.SLOTS.length; s++) {
      var slot = DATA.SLOTS[s].id;
      var eq = d.equip[slot];
      if (eq != null) {
        var it = DATA.ITEMS[eq];
        if (!it || it.type !== 'equip' || it.slot !== slot) return { ok: false, reason: '装备槽位数据非法：' + slot };
      }
    }

    if (!Array.isArray(d.learned)) return { ok: false, reason: '已学功法数据非法' };
    for (var l = 0; l < d.learned.length; l++) {
      if (!DATA.SKILLS[d.learned[l]]) return { ok: false, reason: '存在未知技能：' + d.learned[l] };
    }

    if (!isObj(d.meridian) || !isNum(d.meridian.tuina) || d.meridian.tuina < 1 || d.meridian.tuina > DATA.MERIDIAN.tuina.maxLevel) {
      return { ok: false, reason: '吐纳诀等级非法' };
    }

    if (!isObj(d.quests)) return { ok: false, reason: '任务数据非法' };
    for (var qid in d.quests) {
      var qs = d.quests[qid];
      var known = DATA.QUESTS.some(function (q) { return q.id === qid; });
      if (!known) continue; // 宽容忽略过期任务
      if (!isObj(qs) || typeof qs.done !== 'boolean' || typeof qs.claimed !== 'boolean') {
        return { ok: false, reason: '任务「' + qid + '」状态非法' };
      }
    }

    if (d.cultivating !== undefined && typeof d.cultivating !== 'boolean') return { ok: false, reason: '修炼状态非法' };
    if (!isObj(d.flags)) d.flags = {};
    if (!isObj(d.gatherCd)) d.gatherCd = {};

    return { ok: true, save: { version: DATA.VERSION, savedAt: raw.savedAt, data: d } };
  }

  /* ---------- 读写 ---------- */
  function save(S) {
    var payload = { version: DATA.VERSION, savedAt: Date.now(), data: S };
    store.setItem(KEY, JSON.stringify(payload));
    return payload;
  }

  function readRaw() {
    var txt = store.getItem(KEY);
    if (!txt) return null;
    try { return JSON.parse(txt); }
    catch (e) { return { __parseError: e.message }; }
  }

  // 读取本地存档；损坏时返回 { ok:false, reason }，调用方应保留原状
  function load() {
    var raw = readRaw();
    if (raw === null) return { ok: true, save: null };
    if (raw.__parseError) return { ok: false, reason: '存档解析失败：' + raw.__parseError };
    return validate(raw);
  }

  function clear() { store.removeItem(KEY); }

  function exportJson(S) {
    return JSON.stringify({ version: DATA.VERSION, savedAt: Date.now(), data: S }, null, 2);
  }

  // 导入：校验失败返回 { ok:false, reason }，不触碰现有存档
  function importJson(text) {
    var raw;
    try { raw = JSON.parse(text); }
    catch (e) { return { ok: false, reason: '不是有效的 JSON 文本' }; }
    return validate(raw);
  }

  /* ---------- 设置（与角色存档分离，重置存档不影响偏好） ---------- */
  function defaultSettings() {
    return { music: 0.5, ambient: 0.5, sfx: 0.7, muted: false, reducedMotion: false, noFlash: false, noVibrate: false };
  }
  function loadSettings() {
    var txt = store.getItem(SETTINGS_KEY);
    var s = defaultSettings();
    if (!txt) return s;
    try {
      var obj = JSON.parse(txt);
      if (isObj(obj)) {
        for (var k in s) if (isNum(obj[k]) || typeof obj[k] === 'boolean') s[k] = obj[k];
      }
    } catch (e) { /* 使用默认 */ }
    return s;
  }
  function saveSettings(s) { store.setItem(SETTINGS_KEY, JSON.stringify(s)); }

  return {
    KEY: KEY,
    SETTINGS_KEY: SETTINGS_KEY,
    save: save,
    readRaw: readRaw,
    load: load,
    clear: clear,
    validate: validate,
    exportJson: exportJson,
    importJson: importJson,
    defaultSettings: defaultSettings,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
    _setStore: function (s) { store = s; }
  };
});
