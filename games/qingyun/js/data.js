/* ===== 数据配置层：境界 / 技能 / 敌人 / 节点 / 物品 / 丹方 / 任务 =====
   浏览器：挂载 window.DATA；Node：module.exports（供规则测试） */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) { module.exports = factory(); }
  else { root.DATA = factory(); }
})(typeof self !== 'undefined' ? self : globalThis, function () {
  'use strict';

  var VERSION = 1; // 存档版本号
  var TITLE = '青云问道';

  var CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九'];

  /* 品质：1 凡品 / 2 精品 / 3 极品 */
  var TIERS = {
    1: { name: '凡品', color: '#9fb4ad' },
    2: { name: '精品', color: '#6fc7b8' },
    3: { name: '极品', color: '#e8c56d' }
  };

  /* 境界：index 0 = 凡人，1..9 = 炼气一层..九层，10 = 筑基初期 */
  var REALMS = [];
  REALMS.push({
    id: 'mortal', name: '凡人', need: 50,
    base: { hp: 100, mp: 60, atk: 12, def: 3, crit: 0.05 },
    desc: '凡人之躯，尚未引气入体。初次修炼即可踏入仙途。'
  });
  var LQ_NEED = [100, 145, 210, 305, 442, 641, 930, 1348, 1955];
  for (var i = 1; i <= 9; i++) {
    REALMS.push({
      id: 'lq' + i, name: '炼气' + CN[i - 1] + '层', need: LQ_NEED[i - 1],
      base: null, growth: { hp: 30, mp: 20, atk: 3, def: 1 },
      desc: '引气入体，周天运转，神魂渐固。'
    });
  }
  REALMS.push({
    id: 'zj', name: '筑基初期', need: null,
    base: null, growth: { hp: 120, mp: 80, atk: 10, def: 5, crit: 0.03 },
    desc: '道基初成，御剑腾空，洞府随气象更新。'
  });
  var REALM_IDX = {};
  REALMS.forEach(function (r, idx) { REALM_IDX[r.id] = idx; });
  var ZJ_IDX = REALM_IDX.zj; // 10

  /* 功法与技能 */
  var SKILLS = {
    feijian: {
      id: 'feijian', name: '飞剑术', type: 'attack', mp: 10, cd: 4, mult: 1.8,
      unlockRealm: 'lq1', learnCost: 0,
      desc: '御剑伤敌，造成 1.8 倍攻击的伤害。'
    },
    shield: {
      id: 'shield', name: '护体灵盾', type: 'shield', mp: 12, cd: 10, shield: 30, dur: 6,
      unlockRealm: 'lq2', learnCost: 30,
      desc: '获得 30 点护盾，持续 6 秒，可吸收伤害。'
    },
    thunder: {
      id: 'thunder', name: '御雷诀', type: 'attack', mp: 20, cd: 8, mult: 3.0,
      unlockRealm: 'lq4', learnCost: 80,
      desc: '引天雷一击，造成 3 倍攻击的高额伤害。'
    }
  };
  /* 基础功法：吐纳诀（提升修炼效率） */
  var MERIDIAN = {
    tuina: {
      id: 'tuina', name: '吐纳诀', maxLevel: 10,
      desc: '基础吐纳之术，每级提升 8% 修炼效率。',
      cost: function (lv) { return Math.round(20 * Math.pow(lv, 1.4)); }
    }
  };

  /* 敌人 */
  var ENEMIES = {
    rat: {
      id: 'rat', name: '灵鼠', title: '一阶妖兽',
      hp: 42, atk: 8, def: 1, atkInterval: 2.2,
      stones: [4, 9], exp: 0,
      drops: [
        { item: 'shuwei', chance: 0.45, min: 1, max: 2 },
        { item: 'lingcao', chance: 0.45, min: 1, max: 2 }
      ],
      strong: null,
      desc: '后山最常见的小兽，齿尖爪利，初战之选。'
    },
    wolf: {
      id: 'wolf', name: '山狼', title: '一阶妖兽',
      hp: 75, atk: 13, def: 2, atkInterval: 2.0,
      stones: [8, 15],
      drops: [
        { item: 'langya', chance: 0.5, min: 1, max: 2 },
        { item: 'lingcao', chance: 0.35, min: 1, max: 2 },
        { item: 'tiekuang', chance: 0.25, min: 1, max: 1 },
        { item: 'langyaxl', chance: 0.08, min: 1, max: 1 }
      ],
      strong: { name: '狼影突袭', telegraph: 1.5, mult: 1.8, every: 3 },
      desc: '成群出没，扑击迅猛，强招前会压低身形。'
    },
    stone: {
      id: 'stone', name: '石妖', title: '一阶妖兽',
      hp: 130, atk: 16, def: 6, atkInterval: 2.6,
      stones: [12, 20],
      drops: [
        { item: 'shihe', chance: 0.5, min: 1, max: 2 },
        { item: 'tiekuang', chance: 0.4, min: 1, max: 2 },
        { item: 'shilinjia', chance: 0.1, min: 1, max: 1 }
      ],
      strong: { name: '石甲冲撞', telegraph: 1.6, mult: 1.6, every: 3 },
      desc: '山石成精，皮坚力大，冲撞前会震颤蓄力。'
    },
    boss: {
      id: 'boss', name: '青鳞妖蟒', title: '二阶妖王 · 后山之主',
      hp: 1200, atk: 34, def: 12, atkInterval: 2.4,
      stones: [200, 300],
      drops: [
        { item: 'linpian', chance: 1, min: 2, max: 3 },
        { item: 'shendun', chance: 1, min: 1, max: 1 }
      ],
      strongs: [
        { name: '毒尾横扫', telegraph: 1.5, mult: 1.5 },
        { name: '巨蟒缠绕', telegraph: 1.8, mult: 2.2 }
      ],
      phase2At: 0.5,
      desc: '盘踞蟒蛇谷的妖王，鳞如青铁。需筑基初期并完成前置任务方可挑战。'
    }
  };

  /* 历练节点：青岚后山 */
  var NODES = [
    {
      id: 'rat_cave', name: '灵鼠洞穴', type: 'battle', enemy: 'rat',
      unlock: null,
      desc: '后山入口处的洞穴，灵鼠成群，掉落鼠尾与灵草。'
    },
    {
      id: 'wolf_woods', name: '狼嚎林', type: 'battle', enemy: 'wolf',
      unlock: { realm: 'lq3' },
      desc: '林深风啸，山狼出没。狼牙与铁矿的主要来源，小概率掉落狼牙项链。'
    },
    {
      id: 'stone_shore', name: '乱石滩', type: 'battle', enemy: 'stone',
      unlock: { realm: 'lq6' },
      desc: '滩上石妖成群，防御颇高，掉落石核与石鳞甲。'
    },
    {
      id: 'herb_garden', name: '药圃', type: 'gather',
      gather: { item: 'lingcao', min: 3, max: 5, cooldown: 45 },
      unlock: null,
      desc: '后山一处废弃药圃，可反复采集灵草（冷却 45 秒），是炼丹材料的稳定来源。'
    },
    {
      id: 'spirit_spring', name: '灵石奇遇', type: 'event', once: true,
      reward: { stones: 80 },
      unlock: { realm: 'lq2' },
      desc: '山涧灵泉畔散落的灵石，仅可获取一次。'
    },
    {
      id: 'boss_den', name: '蟒蛇谷', type: 'boss', enemy: 'boss',
      unlock: { realm: 'zj', quest: 'q_break' },
      desc: '妖蟒盘踞的深谷。需筑基初期并完成「筑基大成」后方可进入。'
    }
  ];

  /* 物品 */
  var ITEMS = {
    // 材料
    lingcao: { id: 'lingcao', name: '灵草', type: 'material', tier: 1, ico: '草', desc: '最常见的灵药，炼丹主材，药圃与妖兽均有产出。' },
    shuwei: { id: 'shuwei', name: '鼠尾', type: 'material', tier: 1, ico: '尾', desc: '灵鼠之尾，可入药。' },
    langya: { id: 'langya', name: '狼牙', type: 'material', tier: 1, ico: '牙', desc: '山狼利齿，炼制回灵丹的材料之一。' },
    shihe: { id: 'shihe', name: '石核', type: 'material', tier: 1, ico: '核', desc: '石妖核心，聚气丹的材料之一。' },
    tiekuang: { id: 'tiekuang', name: '铁矿', type: 'material', tier: 1, ico: '矿', desc: '寻常铁矿，炼器与炼丹辅材。' },
    linpian: { id: 'linpian', name: '妖蟒鳞片', type: 'material', tier: 3, ico: '鳞', desc: '青鳞妖蟒之鳞，坚逾精铁，炼器良材。' },
    // 丹药
    hxue: { id: 'hxue', name: '回血丹', type: 'pill', tier: 2, ico: '丹', heal: 0.4, cd: 8, desc: '战斗中服用，恢复生命上限 40%（与回灵丹共用 8 秒冷却）。' },
    hling: { id: 'hling', name: '回灵丹', type: 'pill', tier: 2, ico: '丹', mana: 0.4, cd: 8, desc: '战斗中服用，恢复灵力上限 40%（与回血丹共用 8 秒冷却）。' },
    juqi: { id: 'juqi', name: '聚气丹', type: 'pill', tier: 2, ico: '丹', cult: 1.5, dur: 60, desc: '修炼速度 +50%，持续 60 秒；重复服用只延长时间。' },
    jiedan: { id: 'jiedan', name: '筑基丹', type: 'pill', tier: 3, ico: '丹', desc: '突破筑基的必需丹药，由仙途历程保底赐予，无法通过随机掉落替代。' },
    // 装备
    qingfeng: { id: 'qingfeng', name: '青锋剑', type: 'equip', slot: 'weapon', tier: 2, ico: '剑', atk: 5, desc: '青钢长剑，剑锋隐有寒光。' },
    lieyan: { id: 'lieyan', name: '烈阳刀', type: 'equip', slot: 'weapon', tier: 3, ico: '刀', atk: 9, crit: 0.02, desc: '刀身赤红如烙，挥舞带烈焰之声。' },
    cubo: { id: 'cubo', name: '粗布衣', type: 'equip', slot: 'armor', tier: 1, ico: '衣', def: 2, desc: '凡俗衣衫，略挡风寒。' },
    shilinjia: { id: 'shilinjia', name: '石鳞甲', type: 'equip', slot: 'armor', tier: 2, ico: '甲', def: 5, hp: 20, desc: '以石妖鳞片编缀的护甲，坚实耐打。' },
    juling: { id: 'juling', name: '聚灵坠', type: 'equip', slot: 'accessory', tier: 2, ico: '坠', mp: 15, desc: '温养灵气的玉坠，可增灵力上限。' },
    langyaxl: { id: 'langyaxl', name: '狼牙项链', type: 'equip', slot: 'accessory', tier: 2, ico: '链', atk: 2, crit: 0.05, desc: '以狼牙串成的项链，隐隐激发凶性。' },
    shendun: { id: 'shendun', name: '蟒鳞玉佩', type: 'equip', slot: 'accessory', tier: 3, ico: '佩', mp: 30, def: 3, crit: 0.03, desc: '妖蟒鳞片雕成的玉佩，灵力与防御并增。' }
  };

  var SLOTS = [
    { id: 'weapon', name: '武器' },
    { id: 'armor', name: '护甲' },
    { id: 'accessory', name: '饰品' }
  ];

  /* 丹方 */
  var RECIPES = {
    hxue: { id: 'hxue', out: 'hxue', name: '回血丹', time: 10, zone: [55, 85], cost: { lingcao: 2 }, desc: '温养气血，战时疗伤。' },
    hling: { id: 'hling', out: 'hling', name: '回灵丹', time: 11, zone: [55, 85], cost: { lingcao: 1, shuwei: 1 }, desc: '凝气归元，补益灵力。' },
    juqi: { id: 'juqi', out: 'juqi', name: '聚气丹', time: 13, zone: [58, 82], cost: { lingcao: 3, shihe: 1 }, desc: '聚气于丹，修炼速度大增。' }
  };

  /* 任务链 */
  var QUESTS = [
    { id: 'q_start', name: '初入仙途', desc: '为自己取一个道号，拜入青云门下。', cond: { flag: 'named' }, reward: { stones: 10 } },
    { id: 'q_meditate', name: '初次打坐', desc: '在洞府中开始一次打坐修炼。', cond: { flag: 'firstMeditate' }, reward: { stones: 20 } },
    { id: 'q_lq1', name: '踏足仙途', desc: '突破至炼气一层，正式踏上仙途。', cond: { realm: 'lq1' }, reward: { stones: 30 } },
    { id: 'q_feijian', name: '习得飞剑', desc: '在功法殿学习飞剑术。', cond: { skill: 'feijian' }, reward: { item: 'qingfeng', qty: 1 } },
    { id: 'q_firstkill', name: '首战告捷', desc: '击败第一只妖兽。', cond: { flag: 'firstKill' }, reward: { stones: 50, items: { lingcao: 3 } } },
    { id: 'q_firstpill', name: '初尝丹道', desc: '炼制第一枚丹药。', cond: { flag: 'firstPill' }, reward: { items: { hxue: 2 } } },
    { id: 'q_lq9', name: '炼气九层', desc: '修炼至炼气九层，修为圆满。', cond: { realm: 'lq9' }, reward: { items: { jiedan: 1 }, stones: 100 } },
    { id: 'q_break', name: '筑基大成', desc: '消耗筑基丹与 100 灵石，突破筑基初期。', cond: { realm: 'zj' }, reward: { stones: 150 } },
    { id: 'q_boss', name: '降伏妖蟒', desc: '击败后山之主青鳞妖蟒。', cond: { flag: 'bossDead' }, reward: { stones: 300, items: { linpian: 2 } } }
  ];

  /* 随机道号 */
  var NAME_A = ['青', '玄', '云', '临', '素', '白', '孤', '明', '松', '问', '清', '无', '长', '寒', '宿', '扶', '枕', '听'];
  var NAME_B = ['阳', '霄', '舟', '渊', '问', '辞', '鸿', '砚', '间', '渠', '川', '崖', '松', '柏', '溪', '岚', '烟', '柳'];

  /* 突破演出时长（毫秒） */
  var BT = { charge: 2200, impact: 2000 };

  return {
    VERSION: VERSION,
    TITLE: TITLE,
    TIERS: TIERS,
    REALMS: REALMS,
    REALM_IDX: REALM_IDX,
    ZJ_IDX: ZJ_IDX,
    SKILLS: SKILLS,
    MERIDIAN: MERIDIAN,
    ENEMIES: ENEMIES,
    NODES: NODES,
    ITEMS: ITEMS,
    SLOTS: SLOTS,
    RECIPES: RECIPES,
    QUESTS: QUESTS,
    NAME_A: NAME_A,
    NAME_B: NAME_B,
    BT: BT
  };
});
