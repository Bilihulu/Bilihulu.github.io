/* ===== UI 层：布局渲染 / 弹窗 / 抽屉 / 事件委托（浏览器专用） ===== */
(function (root) {
  'use strict';

  var UI = {
    S: null,
    mode: 'cave',
    battle: null,
    actions: {},
    settings: null,
    _modalStack: [],
    _drawer: null,
    _lastPanelTick: 0,
    _alchemyRefs: null,
    _logCount: 0
  };

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function now() { return performance.now(); }

  /* ================= 初始化 ================= */
  UI.init = function (actions) {
    UI.actions = actions || {};
    // 全局点击委托
    document.addEventListener('click', function (e) {
      var t = e.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (UI.actions[act]) {
        if (root.SND && !t.hasAttribute('data-nosound')) SND.play('click');
        UI.actions[act](t.getAttribute('data-arg'), t, e);
      }
    });
    // 长按按钮（添火/降温）
    document.addEventListener('pointerdown', function (e) {
      var t = e.target.closest('[data-hold]');
      if (!t) return;
      try { t.setPointerCapture(e.pointerId); } catch (err) { /* 忽略 */ }
      if (UI.actions.holdStart) UI.actions.holdStart(t.getAttribute('data-hold'));
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (ev) {
      document.addEventListener(ev, function (e) {
        var t = e.target.closest ? e.target.closest('[data-hold]') : null;
        if (t && UI.actions.holdStop) UI.actions.holdStop(t.getAttribute('data-hold'));
      });
    });
    // Escape 关闭
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') UI.closeTop();
    });
    // 滑块
    document.addEventListener('input', function (e) {
      var t = e.target.closest('[data-set]');
      if (!t) return;
      if (UI.actions.setSetting) UI.actions.setSetting(t.getAttribute('data-set'), parseFloat(t.value), t);
    });
    // 侧导航
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) {
      b.addEventListener('click', function () { UI.setMode(b.getAttribute('data-mode')); });
    });
  };

  /* ================= 日志 / 提示 ================= */
  UI.log = function (text, cls) {
    var list = $('log-list');
    if (!list) return;
    var d = new Date();
    var ts = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2);
    var line = el('div', 'log-line ' + (cls || ''), '<span class="lt">' + ts + '</span><b>·</b> ' + text);
    list.appendChild(line);
    UI._logCount++;
    while (list.children.length > 60) list.removeChild(list.firstChild);
    list.scrollTop = list.scrollHeight;
  };
  UI.toast = function (text, cls, ms) {
    var box = $('scene-toast');
    if (!box) return;
    var t = el('div', 'toast ' + (cls || ''), esc(text));
    box.appendChild(t);
    setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, ms || 2600);
    while (box.children.length > 3) box.removeChild(box.firstChild);
  };

  /* ================= 顶栏 / 状态 / 任务 ================= */
  UI.renderTop = function () {
    var S = UI.S;
    if (!S) return;
    var st = GAME.calcStats(S);
    var realm = DATA.REALMS[S.realm];
    $('tb-name').textContent = S.name;
    $('tb-realm').textContent = realm.name;
    var expPct, expTxt;
    if (realm.need == null) { expPct = 100; expTxt = '修为圆满'; }
    else { expPct = Math.floor(S.exp / realm.need * 100); expTxt = '修为 ' + Math.floor(S.exp) + '/' + realm.need; }
    $('tb-exp-fill').style.width = expPct + '%';
    $('tb-exp-text').textContent = expTxt;
    $('tb-hp-fill').style.width = Math.floor(S.hp / st.hp * 100) + '%';
    $('tb-hp-text').textContent = Math.ceil(S.hp) + '/' + st.hp;
    $('tb-mp-fill').style.width = Math.floor(S.mp / st.mp * 100) + '%';
    $('tb-mp-text').textContent = Math.floor(S.mp) + '/' + st.mp;
    $('tb-stones').textContent = '灵石 ' + S.stones;
  };

  UI.statusHtml = function () {
    var S = UI.S;
    if (!S) return '';
    var st = GAME.calcStats(S);
    var realm = DATA.REALMS[S.realm];
    var buffs = S.buffs.map(function (b) {
      var left = Math.ceil((b.until - Date.now()) / 1000);
      var nm = b.id === 'juqi' ? '聚气丹' : b.id;
      return '<span class="tag teal">' + nm + ' ' + left + 's</span>';
    }).join('');
    return '<table class="attr-table">'
      + srow('生命', Math.ceil(S.hp) + ' / ' + st.hp)
      + srow('灵力', Math.floor(S.mp) + ' / ' + st.mp)
      + srow('攻击', st.atk)
      + srow('防御', st.def)
      + srow('暴击率', Math.round(st.crit * 100) + '%')
      + srow('修炼效率', st.cultRate.toFixed(1) + ' 修为/秒')
      + srow('灵石', S.stones)
      + '</table>'
      + '<div style="margin-top:8px" class="scene-hint">境界：<b>' + realm.name + '</b> · ' + realm.desc + '</div>'
      + '<div style="margin-top:6px" class="scene-hint">吐纳诀 <b>' + S.meridian.tuina + ' 级</b>（修炼效率 +' + (S.meridian.tuina - 1) * 8 + '%）</div>'
      + (buffs ? '<div style="margin-top:6px">' + buffs + '</div>' : '');
    function srow(k, v) { return '<tr><td>' + k + '</td><td>' + v + '</td></tr>'; }
  };

  UI.renderStatus = function () {
    var box = $('status-body');
    if (box) box.innerHTML = UI.statusHtml();
  };

  UI.questsHtml = function () {
    var S = UI.S;
    if (!S) return '';
    var done = 0, total = DATA.QUESTS.length;
    var html = '';
    DATA.QUESTS.forEach(function (q) {
      var st = S.quests[q.id] || { done: false, claimed: false };
      if (st.done) done++;
      var stateCls = st.done ? 'done' : '';
      var stateTxt = st.claimed ? '<span class="tag green">已领奖</span>' : (st.done ? '<span class="tag gold">待领奖</span>' : '<span class="tag">进行中</span>');
      var rw = [];
      if (q.reward.stones) rw.push('灵石×' + q.reward.stones);
      if (q.reward.item) rw.push(DATA.ITEMS[q.reward.item].name + '×' + (q.reward.qty || 1));
      if (q.reward.items) for (var k in q.reward.items) rw.push(DATA.ITEMS[k].name + '×' + q.reward.items[k]);
      html += '<div class="list-row ' + stateCls + '">'
        + '<div class="lr-head"><span class="lr-name' + (st.done ? ' done' : '') + '">' + esc(q.name) + '</span>' + stateTxt + '</div>'
        + '<div class="lr-desc">' + esc(q.desc) + '</div>'
        + '<div class="lr-foot"><span class="lr-reward">奖励：' + rw.join('，') + '</span>'
        + (st.done && !st.claimed ? '<button class="btn btn-sm btn-gold" data-act="claim-quest" data-arg="' + q.id + '">领取</button>' : '')
        + '</div></div>';
    });
    return html;
  };

  UI.renderQuests = function () {
    var S = UI.S;
    if (!S) return;
    $('quest-body').innerHTML = UI.questsHtml();
    var done = DATA.QUESTS.filter(function (q) { return (S.quests[q.id] || {}).done; }).length;
    $('quest-progress').textContent = done + ' / ' + DATA.QUESTS.length;
  };

  /* ================= 模式切换 ================= */
  var MODE_SCENE = { cave: 'cave', cultivate: 'cultivate', skills: 'skills', adventure: 'adventure', alchemy: 'alchemy', battle: 'battle' };
  UI.setMode = function (mode) {
    if (UI.battle && mode !== 'battle' && UI.battle.running) {
      // 战斗中不允许切换场景面板（打开普通面板不停止战斗，但场景留在战斗）
      mode = 'battle';
    }
    UI.mode = mode;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-btn'), function (b) {
      b.classList.toggle('active', b.getAttribute('data-mode') === mode || (mode === 'battle' && b.getAttribute('data-mode') === 'adventure'));
    });
    SCENE.setScene(MODE_SCENE[mode] || 'cave');
    if (root.SND) SND.scene(MODE_SCENE[mode] || 'cave');
    UI.renderSceneUI();
  };

  /* ================= 场景面板 ================= */
  UI.renderSceneUI = function () {
    var S = UI.S;
    var box = $('scene-ui');
    if (!S) { box.innerHTML = ''; return; }
    if (UI.mode === 'cave') box.innerHTML = panelCave();
    else if (UI.mode === 'cultivate') box.innerHTML = panelCultivate();
    else if (UI.mode === 'skills') box.innerHTML = panelSkills();
    else if (UI.mode === 'adventure') box.innerHTML = panelAdventure();
    else if (UI.mode === 'alchemy') { box.innerHTML = panelAlchemy(); cacheAlchemyRefs(); }
    else if (UI.mode === 'battle') box.innerHTML = panelBattle();
    UI._alchemyRefs = UI.mode === 'alchemy' ? UI._alchemyRefs : null;
  };

  /* ---- 洞府 ---- */
  function panelCave() {
    var S = UI.S, st = GAME.calcStats(S);
    var cultTxt = S.cultivating
      ? '打坐中 · <b>' + st.cultRate.toFixed(1) + '</b> 修为/秒'
      : (DATA.REALMS[S.realm].need != null && S.exp >= DATA.REALMS[S.realm].need ? '修为圆满，可尝试突破' : '未在修炼');
    var hurt = S.hp < st.hp || S.mp < st.mp;
    var restHtml = '';
    if (UI._restUntil) {
      var left = Math.max(0, UI._restUntil - performance.now());
      var pct = Math.floor((1 - left / 3000) * 100);
      restHtml = '<div class="pbar" style="margin-top:6px"><i style="width:' + pct + '%"></i><span>调息中 ' + pct + '%</span></div>';
    }
    return panel('洞府 · 青云后山', S.cultivating ? '修炼中' : '闲适度日',
      '<div class="scene-kv"><span>状态</span><span>' + cultTxt + '</span></div>'
      + '<div class="scene-kv"><span>生命 / 灵力</span><span>' + Math.ceil(S.hp) + ' / ' + st.hp + ' · ' + Math.floor(S.mp) + ' / ' + st.mp + '</span></div>'
      + restHtml
      + (S.realm >= DATA.ZJ_IDX ? '<div class="scene-hint" style="margin-top:4px">筑基之后，洞府外多了两盏宫灯与一眼灵泉，气象已大不同。</div>' : '')
      + '<div class="scene-row">'
      + (S.cultivating
        ? '<button class="btn" data-act="cult-stop">停止打坐</button>'
        : '<button class="btn btn-gold" data-act="cult-start">开始打坐</button>')
      + '<button class="btn" data-act="rest"' + (hurt && !UI._restUntil ? '' : ' disabled') + '>调息恢复</button>'
      + '<button class="btn" data-act="open-bag">背包</button>'
      + '</div>'
      + '<div class="scene-hint" style="margin-top:6px">在洞府可免费恢复生命与灵力；离开页面时若正在打坐，将按 50% 效率结算离线修为（上限 8 小时）。</div>'
    );
  }

  /* ---- 修炼 ---- */
  function panelCultivate() {
    var S = UI.S, st = GAME.calcStats(S);
    var realm = DATA.REALMS[S.realm];
    if (S.bt) {
      var phaseTxt = S.bt.phase === 'charge' ? '聚气……天地灵气向此人汇聚' : '冲击瓶颈！道基重塑之中';
      return panel('修炼 · ' + realm.name, '突破中',
        '<div class="scene-kv"><span>当前阶段</span><span style="color:var(--gold-2)">' + phaseTxt + '</span></div>'
        + '<div class="pbar"><i style="width:100%"></i><span>突破演出中，请稍候……</span></div>'
        + '<div class="scene-hint" style="margin-top:6px">突破期间无法进行其他操作，防止重复扣除资源。</div>'
      );
    }
    var pct = realm.need == null ? 100 : Math.floor(S.exp / realm.need * 100);
    var buffTxt = S.buffs.length
      ? S.buffs.map(function (b) { return (b.id === 'juqi' ? '聚气丹' : b.id) + '（剩余 ' + Math.ceil((b.until - Date.now()) / 1000) + ' 秒）'; }).join('，')
      : '无';
    var juqiQty = GAME.countItem(S, 'juqi');
    var canBreak = realm.need != null && S.exp >= realm.need;
    var next = realm.need != null ? DATA.REALMS[S.realm + 1] : null;
    var costTxt = '';
    if (canBreak && next && next.id === 'zj') costTxt = '需消耗：筑基丹×1、灵石×100';
    else if (canBreak && next) costTxt = '晋升后将获得属性成长';
    return panel('修炼 · ' + realm.name, S.cultivating ? '打坐中' : '未修炼',
      '<div class="scene-kv"><span>境界</span><span>' + realm.name + '</span></div>'
      + '<div class="scene-kv"><span>修为</span><span>' + Math.floor(S.exp) + ' / ' + (realm.need == null ? '圆满' : realm.need) + '</span></div>'
      + '<div class="pbar"><i style="width:' + pct + '%"></i><span>' + pct + '%</span></div>'
      + '<div class="scene-kv" style="margin-top:6px"><span>修炼速度</span><span>' + st.cultRate.toFixed(1) + ' 修为/秒</span></div>'
      + '<div class="scene-kv"><span>增益</span><span>' + buffTxt + '</span></div>'
      + '<div class="scene-row">'
      + (S.cultivating
        ? '<button class="btn" data-act="cult-stop">停止打坐</button>'
        : '<button class="btn btn-gold" data-act="cult-start">开始打坐</button>')
      + '<button class="btn" data-act="use-juqi" data-arg="juqi"' + (juqiQty > 0 ? '' : ' disabled') + '>服用聚气丹（' + juqiQty + '）</button>'
      + '<button class="btn ' + (canBreak ? 'btn-gold' : '') + '" data-act="breakthrough" ' + (canBreak ? '' : ' disabled') + ' title="' + (canBreak ? costTxt : '修为圆满后方可突破') + '">突破境界' + (canBreak ? ' · ' + next.name : '') + '</button>'
      + '</div>'
      + (canBreak ? '<div class="scene-hint" style="margin-top:6px">' + costTxt + '。突破成功率 100%，以资源控制成长节奏。</div>' : '')
      + (realm.need == null ? '<div class="scene-hint" style="margin-top:6px">已达当前版本最高境界，后续金丹、元婴将在扩展版本开放。</div>' : '')
    );
  }

  /* ---- 功法 ---- */
  function panelSkills() {
    var S = UI.S;
    var m = DATA.MERIDIAN.tuina;
    var lv = S.meridian.tuina;
    var upCost = lv >= m.maxLevel ? null : m.cost(lv);
    var html = '<div class="scene-panel-title">吐纳诀 <span class="rp-title-sub">' + lv + ' / ' + m.maxLevel + ' 级</span></div>'
      + '<div class="scene-hint">' + m.desc + ' 当前修炼效率 +' + (lv - 1) * 8 + '%。</div>'
      + '<div class="scene-row"><button class="btn" data-act="upgrade-meridian" ' + (upCost != null && S.stones >= upCost ? '' : 'disabled') + '>'
      + (upCost != null ? '消耗 ' + upCost + ' 灵石升级' : '已至巅峰') + '</button>'
      + '<span class="scene-hint">当前灵石：' + S.stones + '</span></div>';
    html += '<div class="scene-panel-title" style="margin-top:12px">术法</div>';
    Object.keys(DATA.SKILLS).forEach(function (id) {
      var sk = DATA.SKILLS[id];
      var learned = S.learned.indexOf(id) >= 0;
      var realmOk = S.realm >= DATA.REALM_IDX[sk.unlockRealm];
      var needRealm = DATA.REALMS[DATA.REALM_IDX[sk.unlockRealm]].name;
      html += '<div class="list-row' + (learned ? ' done' : '') + '">'
        + '<div class="lr-head"><span class="lr-name">' + sk.name + '</span>'
        + (learned ? '<span class="tag green">已掌握</span>' : (realmOk ? '<span class="tag gold">可学</span>' : '<span class="tag">需 ' + needRealm + '</span>')) + '</div>'
        + '<div class="lr-desc">' + sk.desc + '</div>'
        + '<div class="lr-foot"><span class="lr-reward">消耗灵力 ' + sk.mp + ' · 冷却 ' + sk.cd + ' 秒</span>'
        + (learned ? '' : '<button class="btn btn-sm btn-gold" data-act="learn-skill" data-arg="' + id + '" ' + (realmOk && S.stones >= sk.learnCost ? '' : 'disabled') + '>'
        + (sk.learnCost > 0 ? sk.learnCost + ' 灵石' : '免费') + '学习</button>') + '</div></div>';
    });
    return panel('功法殿', '吐纳诀与术法',
      html + '<div class="scene-hint" style="margin-top:6px">更多功法流派将在后续版本开放。</div>');
  }

  /* ---- 历练 ---- */
  function panelAdventure() {
    var S = UI.S;
    var html = '<div class="scene-hint" style="margin-bottom:8px">青岚后山 · 妖兽出没之地。普通节点可重复挑战，奇遇仅一次。</div>';
    DATA.NODES.forEach(function (n) {
      var un = SYS.nodeUnlocked(S, n);
      var tags = '';
      if (n.type === 'gather') tags = '<span class="tag teal">采集</span>';
      else if (n.type === 'event') tags = '<span class="tag gold">奇遇</span>';
      else if (n.type === 'boss') tags = '<span class="tag red">首领</span>';
      else tags = '<span class="tag">战斗</span>';
      var info = '';
      if (n.enemy) {
        var e = DATA.ENEMIES[n.enemy];
        info = '<div class="lr-desc">' + e.name + '（' + e.title + '）· 生命 ' + e.hp + ' · 攻击 ' + e.atk + ' · 防御 ' + e.def
          + ' · 可能掉落：' + e.drops.map(function (d) { return DATA.ITEMS[d.item].name; }).join('、') + '，灵石 ' + e.stones[0] + '-' + e.stones[1] + '</div>';
      } else if (n.gather) {
        info = '<div class="lr-desc">每次采集 ' + DATA.ITEMS[n.gather.item].name + ' ' + n.gather.min + '-' + n.gather.max + ' 个，冷却 ' + n.gather.cooldown + ' 秒。</div>';
      } else if (n.reward) {
        info = '<div class="lr-desc">可获得灵石 ' + n.reward.stones + '，仅一次。</div>';
      }
      var btn = '';
      if (un.ok) {
        if (n.type === 'gather') {
          var gr = SYS.gatherReady(S, n, Date.now());
          btn = '<button class="btn btn-sm btn-gold" data-act="gather" data-arg="' + n.id + '" ' + (gr.ok ? '' : 'disabled') + '>'
            + (gr.ok ? '前往采集' : '冷却 ' + Math.ceil(gr.remain / 1000) + 's') + '</button>';
        } else if (n.type === 'event') {
          var done = !!S.flags['evt_' + n.id];
          btn = done ? '<span class="tag green">已获取</span>' : '<button class="btn btn-sm btn-gold" data-act="do-event" data-arg="' + n.id + '">探寻</button>';
        } else {
          btn = '<button class="btn btn-sm btn-gold" data-act="enter-node" data-arg="' + n.id + '">' + (n.type === 'boss' ? '挑战首领' : '进入') + '</button>';
        }
      } else {
        btn = '<span class="tag red">' + un.reason + '</span>';
      }
      html += '<div class="list-row' + (un.ok ? '' : ' locked') + '">'
        + '<div class="lr-head"><span class="lr-name">' + n.name + '</span>' + tags + '</div>'
        + '<div class="lr-desc">' + n.desc + '</div>' + info
        + '<div class="lr-foot"><span></span>' + btn + '</div></div>';
    });
    return panel('历练 · 青岚后山', '战斗与采集', html);
  }

  /* ---- 炼丹 ---- */
  function panelAlchemy() {
    var S = UI.S;
    var f = S.furnace;
    var html = '<div class="scene-panel-title">丹方</div><div class="scene-row">';
    Object.keys(DATA.RECIPES).forEach(function (id) {
      var r = DATA.RECIPES[id];
      var sel = UI._recipeSel === id;
      var lack = [];
      for (var k in r.cost) if (GAME.countItem(S, k) < r.cost[k]) lack.push(DATA.ITEMS[k].name);
      html += '<button class="btn btn-sm' + (sel ? ' btn-gold' : '') + '" data-act="select-recipe" data-arg="' + id + '">' + r.name
        + (lack.length ? '<span style="color:#e0a49e">（缺' + lack.join(',') + '）</span>' : '') + '</button>';
    });
    html += '</div>';

    var rid = UI._recipeSel || 'hxue';
    var r = DATA.RECIPES[rid];
    if (!f || (!f.running && f.finished !== 'done')) {
      var lack2 = [];
      for (var k2 in r.cost) {
        var have = GAME.countItem(S, k2), need = r.cost[k2];
        lack2.push('<span style="color:' + (have >= need ? 'var(--jade)' : '#e0a49e') + '">' + DATA.ITEMS[k2].name + ' ' + have + '/' + need + '</span>');
      }
      html += '<div class="scene-panel-title" style="margin-top:10px">' + r.name + '</div>'
        + '<div class="scene-hint">' + r.desc + ' · 炼制约 ' + r.time + ' 秒 · 目标火候 ' + r.zone[0] + '-' + r.zone[1] + '</div>'
        + '<div class="scene-row" style="margin-top:6px">材料：' + lack2.join('，') + '</div>'
        + '<div class="scene-row"><button class="btn btn-gold" data-act="alchemy-start" data-arg="' + rid + '">投入材料，生火炼制</button></div>'
        + '<div class="scene-hint" style="margin-top:6px">炉火会自然上浮，需交替<b>添火</b>与<b>降温</b>，让火候停留在目标区间。处于区间的时间占比决定成丹品质与产量。离开丹房炉火暂停；<b>主动中止将损失投入的材料</b>。</div>';
      if (f && f.finished === 'aborted') {
        html += '<div class="scene-hint" style="margin-top:6px;color:#e0a49e">上一炉已中止，投入的材料已损失。</div>';
      }
      return panel('炼丹房', '丹方与炉火', html);
    }

    if (f.running) {
      html += '<div class="scene-panel-title" style="margin-top:10px">炉火正旺 · ' + r.name + '</div>'
        + '<div class="heat-wrap"><div class="heat-bar" id="heat-bar">'
        + '<div class="zone" id="heat-zone" style="left:' + f.zone[0] + '%;width:' + (f.zone[1] - f.zone[0]) + '%"></div>'
        + '<div class="fill" id="heat-fill" style="width:' + f.heat + '%"></div>'
        + '<div class="mark" id="heat-mark" style="left:' + f.heat + '%"></div>'
        + '<div class="txt" id="heat-txt">火候 ' + Math.round(f.heat) + '</div></div></div>'
        + '<div class="scene-row" style="margin-top:8px;align-items:center">'
        + '<div class="pbar" style="flex:1"><i id="alc-prog" style="width:' + Math.floor(f.t / f.dur * 100) + '%"></i><span id="alc-prog-txt">' + Math.floor(f.t) + 's / ' + f.dur + 's</span></div>'
        + '<span class="scene-hint" id="alc-ratio">区间占比 0%</span></div>'
        + '<div class="scene-row">'
        + '<button class="btn" data-hold="heat" data-nosound="1">按住添火</button>'
        + '<button class="btn" data-hold="cool" data-nosound="1">按住降温</button>'
        + '<button class="btn btn-danger btn-sm" data-act="alchemy-abort" data-arg="' + rid + '">中止炼制</button>'
        + '</div>'
        + '<div class="scene-hint" style="margin-top:6px">炉火自然上浮，离开丹房将自动暂停。</div>';
      return panel('炼丹房', '炉火正旺', html);
    }

    // finished === 'done' 待开炉
    html += '<div class="scene-panel-title" style="margin-top:10px">丹成在即</div>'
      + '<div class="scene-hint">火候区间占比达到 <b>' + Math.floor(f.inZone / f.dur * 100) + '%</b>，可开炉取丹。</div>'
      + '<div class="scene-row"><button class="btn btn-gold" data-act="alchemy-settle">开炉取丹</button></div>';
    return panel('炼丹房', '丹成在即', html);
  }

  function cacheAlchemyRefs() {
    UI._alchemyRefs = {
      fill: $('heat-fill'), mark: $('heat-mark'), txt: $('heat-txt'),
      prog: $('alc-prog'), progTxt: $('alc-prog-txt'), ratio: $('alc-ratio')
    };
  }

  /* ---- 战斗 ---- */
  function panelBattle() {
    var S = UI.S, b = UI.battle;
    if (!b) return panel('战斗', '', '<div class="scene-hint">战斗已结束。</div>');
    var st = GAME.calcStats(S);
    var e = b.enemy;
    var html = '<div class="scene-kv"><span>' + e.name + ' · ' + e.title + '</span><span>' + Math.ceil(e.hp) + ' / ' + e.hpMax + '</span></div>';
    var shieldTxt = b.shield > 0 ? ' · 护盾 ' + b.shield : '';
    html += '<div class="scene-kv"><span>我方</span><span>' + Math.ceil(S.hp) + ' / ' + st.hp + ' · 灵力 ' + Math.floor(S.mp) + shieldTxt + '</span></div>';
    if (e.telegraph) {
      html += '<div class="scene-hint" style="color:#e8933c">敌方正在蓄力：' + e.telegraph.name + '！及时防御可大幅减伤。</div>';
    }
    html += '<div class="scene-row">';
    Object.keys(DATA.SKILLS).forEach(function (id) {
      var sk = DATA.SKILLS[id];
      var learned = S.learned.indexOf(id) >= 0;
      var cdLeft = Math.max(0, (b.cds[id] || 0) - performance.now());
      var dis = !learned || cdLeft > 0 || S.mp < sk.mp ? ' disabled' : '';
      var label = sk.name;
      if (!learned) label += '（未学）';
      else if (cdLeft > 0) label += '（' + Math.ceil(cdLeft / 1000) + 's）';
      else label += ' ' + sk.mp + '灵';
      html += '<button class="btn btn-sm" data-act="use-skill" data-arg="' + id + '"' + dis + '>' + label + '</button>';
    });
    var defCd = Math.max(0, b.defendCd - performance.now());
    html += '<button class="btn btn-sm" data-act="defend"' + (defCd > 0 ? ' disabled' : '') + '>防御' + (defCd > 0 ? '（' + Math.ceil(defCd / 1000) + 's）' : '') + '</button>';
    html += '</div><div class="scene-row">';
    var pillCd = Math.max(0, b.pillCd - performance.now());
    ['hxue', 'hling'].forEach(function (id) {
      var qty = GAME.countItem(S, id);
      var nm = id === 'hxue' ? '回血丹' : '回灵丹';
      html += '<button class="btn btn-sm" data-act="battle-pill" data-arg="' + id + '"' + (qty > 0 && pillCd <= 0 ? '' : ' disabled') + '>'
        + nm + '×' + qty + (pillCd > 0 ? '（' + Math.ceil(pillCd / 1000) + 's）' : '') + '</button>';
    });
    html += '<button class="btn btn-sm" data-act="open-bag" data-nosound="1">背包</button>';
    html += '<button class="btn btn-sm btn-danger" data-act="retreat">撤退（无掉落）</button>';
    html += '</div>';

    if (b.over === 'win') {
      html = '<div class="scene-panel-title" style="color:var(--gold-2)">战斗胜利</div>'
        + '<div class="scene-hint">击败了 ' + e.name + '！</div>';
      if (!b.claimed && b.drops) {
        var items = b.drops.items.map(function (x) { return DATA.ITEMS[x.item].name + '×' + x.qty; }).join('，');
        html += '<div class="list-row"><div class="lr-desc">战利品：灵石 ' + b.drops.stones + (items ? '，' + items : '') + '</div>'
          + '<div class="lr-foot"><button class="btn btn-sm btn-gold" data-act="claim-drops">一键拾取</button></div></div>';
      } else if (b.claimed) {
        html += '<div class="scene-hint" style="color:var(--green)">战利品已收入囊中。</div>';
      }
      html += '<div class="scene-row"><button class="btn" data-act="leave-battle">返回历练</button></div>';
    } else if (b.over === 'lose') {
      html = '<div class="scene-panel-title" style="color:#e0a49e">修为不及 · 战斗失败</div>'
        + '<div class="scene-hint">你被 ' + e.name + ' 击倒，所幸性命无忧。回洞府调息恢复后再战。</div>'
        + '<div class="scene-row"><button class="btn btn-gold" data-act="leave-battle">回洞府调息</button></div>';
    } else if (b.over === 'retreat') {
      html = '<div class="scene-panel-title">已撤退</div>'
        + '<div class="scene-hint">本次撤退不获得任何掉落。</div>'
        + '<div class="scene-row"><button class="btn" data-act="leave-battle">返回历练</button></div>';
    }
    return panel('战斗 · ' + e.name, e.isBoss ? '首领战' : '遭遇战', html);
  }

  function panel(title, sub, body) {
    return '<div class="scene-panel"><div class="scene-panel-title">' + title + '<span class="rp-title-sub">' + sub + '</span></div>' + body + '</div>';
  }

  /* ================= 弹窗 / 抽屉 ================= */
  UI.openModal = function (opts) {
    var mask = el('div', 'modal-mask');
    var modal = el('div', 'modal');
    modal.innerHTML = '<div class="modal-head"><span>' + esc(opts.title) + '</span><button class="modal-close" data-act="close-modal" data-nosound="1">✕</button></div>'
      + '<div class="modal-body">' + (opts.body || '') + '</div>'
      + (opts.foot ? '<div class="modal-foot">' + opts.foot + '</div>' : '');
    mask.appendChild(modal);
    mask.addEventListener('click', function (e) { if (e.target === mask) UI.closeModal(mask); });
    $('modal-root').appendChild(mask);
    UI._modalStack.push(mask);
    return mask;
  };
  UI.closeModal = function (mask) {
    mask = mask || UI._modalStack[UI._modalStack.length - 1];
    if (!mask) return;
    var i = UI._modalStack.indexOf(mask);
    if (i >= 0) UI._modalStack.splice(i, 1);
    if (mask.parentNode) mask.parentNode.removeChild(mask);
  };
  UI.closeTop = function () {
    if (UI._modalStack.length) { UI.closeModal(); return; }
    if (UI._drawer) UI.closeDrawer();
  };
  UI.openDrawer = function (opts) {
    UI.closeDrawer();
    var mask = el('div', 'drawer-mask');
    var dr = el('div', 'drawer');
    dr.innerHTML = '<div class="drawer-head"><span>' + esc(opts.title) + '</span><button class="modal-close" data-act="close-drawer" data-nosound="1">✕</button></div>'
      + '<div class="drawer-body">' + (opts.body || '') + '</div>';
    mask.appendChild(dr);
    mask.addEventListener('click', function (e) { if (e.target === mask) UI.closeDrawer(); });
    $('drawer-root').appendChild(mask);
    UI._drawer = mask;
  };
  UI.closeDrawer = function () {
    if (!UI._drawer) return;
    if (UI._drawer.parentNode) UI._drawer.parentNode.removeChild(UI._drawer);
    UI._drawer = null;
  };

  /* ================= 背包 ================= */
  UI.openBag = function () {
    var S = UI.S;
    var tabs = [['all', '全部'], ['equip', '装备'], ['pill', '丹药'], ['material', '材料']];
    var cur = UI._bagTab || 'all';
    var html = '<div class="scene-row" style="margin-bottom:10px">';
    tabs.forEach(function (t) {
      html += '<button class="btn btn-sm' + (cur === t[0] ? ' btn-gold' : '') + '" data-act="bag-tab" data-arg="' + t[0] + '">' + t[1] + '</button>';
    });
    html += '</div>';
    // 装备栏
    html += '<div class="scene-row" style="margin-bottom:10px">';
    DATA.SLOTS.forEach(function (slot) {
      var id = S.equip[slot.id];
      html += '<div style="flex:1;text-align:center"><div class="scene-hint">' + slot.name + '</div>'
        + (id
          ? '<button class="item-cell t' + DATA.ITEMS[id].tier + '" style="margin:4px auto" data-act="item-detail" data-arg="' + id + '" data-q="1"><span class="tier-dot" style="background:' + DATA.TIERS[DATA.ITEMS[id].tier].color + '"></span><span class="ico">' + DATA.ITEMS[id].ico + '</span><span style="font-size:11px">' + DATA.ITEMS[id].name + '</span></button>'
          : '<div class="scene-hint" style="opacity:.5">空</div>')
        + '</div>';
    });
    html += '</div>';
    // 物品
    var ids = Object.keys(S.inventory).filter(function (id) {
      var it = DATA.ITEMS[id];
      if (!it) return false;
      if (cur === 'all') return true;
      return it.type === cur;
    });
    if (!ids.length) html += '<div class="scene-hint">此处空无一物。</div>';
    html += '<div class="item-grid">';
    ids.forEach(function (id) {
      var it = DATA.ITEMS[id];
      html += '<button class="item-cell t' + it.tier + '" data-act="item-detail" data-arg="' + id + '" data-q="' + S.inventory[id] + '">'
        + '<span class="tier-dot" style="background:' + DATA.TIERS[it.tier].color + '"></span>'
        + '<span class="ico">' + it.ico + '</span><span style="font-size:11px">' + it.name + '</span>'
        + '<span class="qty">×' + S.inventory[id] + '</span></button>';
    });
    html += '</div>';
    UI.openModal({ title: '背包', body: html });
  };

  UI.itemDetail = function (id) {
    var S = UI.S;
    var it = DATA.ITEMS[id];
    if (!it) return;
    var qty = GAME.countItem(S, id) || (S.equip[it.slot] === id ? 1 : 0);
    var equipped = it.type === 'equip' && S.equip[it.slot] === id;
    var tier = DATA.TIERS[it.tier];
    var html = '<div class="scene-kv"><span>品质</span><span style="color:' + tier.color + '">' + tier.name + '</span></div>'
      + '<div class="scene-kv"><span>数量</span><span>' + qty + '</span></div>'
      + '<div class="scene-hint" style="margin:8px 0">' + it.desc + '</div>';
    // 属性
    var attrs = [];
    if (it.atk) attrs.push('攻击 +' + it.atk);
    if (it.def) attrs.push('防御 +' + it.def);
    if (it.hp) attrs.push('生命 +' + it.hp);
    if (it.mp) attrs.push('灵力 +' + it.mp);
    if (it.crit) attrs.push('暴击 +' + Math.round(it.crit * 100) + '%');
    if (attrs.length) html += '<div class="scene-kv"><span>属性</span><span>' + attrs.join('，') + '</span></div>';
    // 装备对比
    if (it.type === 'equip' && !equipped) {
      var cur = S.equip[it.slot];
      var slotName = DATA.SLOTS.filter(function (s) { return s.id === it.slot; })[0].name;
      html += '<div class="scene-kv"><span>当前' + slotName + '</span><span>' + (cur ? DATA.ITEMS[cur].name : '无') + '</span></div>';
      if (cur) {
        var diff = [];
        ['atk', 'def', 'hp', 'mp'].forEach(function (k) {
          var d = (it[k] || 0) - (DATA.ITEMS[cur][k] || 0);
          if (d) diff.push(k === 'atk' ? '攻击' : k === 'def' ? '防御' : k === 'hp' ? '生命' : '灵力' + ' ' + (d > 0 ? '+' : '') + d);
        });
        var dc = (it.crit || 0) - (DATA.ITEMS[cur].crit || 0);
        if (dc) diff.push('暴击 ' + (dc > 0 ? '+' : '') + Math.round(dc * 100) + '%');
        if (diff.length) html += '<div class="scene-kv"><span>对比</span><span style="color:' + (diff.join('，').indexOf('-') >= 0 ? 'var(--jade-dim)' : 'var(--green)') + '">' + diff.join('，') + '</span></div>';
      }
    }
    var foot = '';
    if (equipped) foot += '<button class="btn" data-act="unequip" data-arg="' + it.slot + '">卸下</button>';
    else if (it.type === 'equip') foot += '<button class="btn btn-gold" data-act="equip" data-arg="' + id + '">穿戴</button>';
    else if (it.type === 'pill' && id !== 'jiedan') foot += '<button class="btn btn-gold" data-act="use-item" data-arg="' + id + '">使用</button>';
    foot += '<button class="btn" data-act="close-modal">关闭</button>';
    UI.openModal({ title: it.name, body: html, foot: foot });
  };

  /* ================= 设置与存档 ================= */
  UI.openSettings = function () {
    var s = UI.settings;
    function sw(id, key, label) {
      return '<div class="set-row"><label>' + label + '</label><div class="switch' + (s[key] ? ' on' : '') + '" data-act="toggle" data-arg="' + key + '"></div></div>';
    }
    var html = ''
      + '<div class="scene-panel-title">音量</div>'
      + slider('music', '音乐') + slider('ambient', '环境声') + slider('sfx', '操作音效')
      + '<div class="set-row"><label>静音</label><div class="switch' + (s.muted ? ' on' : '') + '" data-act="toggle" data-arg="muted"></div></div>'
      + '<div class="scene-panel-title" style="margin-top:10px">体验</div>'
      + sw(0, 'reducedMotion', '减少动态效果（降低粒子与震动）')
      + sw(0, 'noFlash', '降低闪光强度')
      + sw(0, 'noVibrate', '关闭震动（移动端）')
      + '<div class="scene-row" style="margin-top:8px"><button class="btn" data-act="toggle-pause">' + (UI._paused ? '继续游戏' : '暂停游戏') + '</button>'
      + '<span class="scene-hint">暂停将统一停止战斗计时与动画</span></div>'
      + '<div class="scene-panel-title" style="margin-top:10px">存档</div>'
      + '<div class="scene-row"><button class="btn" data-act="manual-save">手动保存</button>'
      + '<button class="btn" data-act="export-save">导出存档</button></div>'
      + '<div class="scene-row" style="margin-top:8px;align-items:flex-start"><textarea id="import-area" class="name-input" style="height:70px;text-align:left;letter-spacing:0;font-size:12px" placeholder="将存档 JSON 粘贴到此处后点击导入"></textarea></div>'
      + '<div class="scene-row"><button class="btn" data-act="import-save">导入存档</button>'
      + '<button class="btn btn-danger" data-act="reset-save">重置存档</button></div>'
      + '<div class="scene-hint" style="margin-top:10px">规则说明：离线修为只在退出前处于打坐状态时结算，上限 8 小时、按基础效率 50% 计算，不叠加限时丹药，也不会自动突破；同时只允许一个标签页推进游戏。</div>';
    UI.openModal({ title: '设置与存档', body: html });
    function slider(key, label) {
      return '<div class="set-row"><label>' + label + '</label><input type="range" min="0" max="1" step="0.05" value="' + s[key] + '" data-set="' + key + '"><span class="val">' + Math.round(s[key] * 100) + '</span></div>';
    }
  };

  /* ================= 帧内更新 ================= */
  UI.tick = function (t) {
    var S = UI.S;
    if (!S) return;
    if (t - UI._lastPanelTick < 140) return;
    UI._lastPanelTick = t;
    // 战斗面板高频刷新
    if (UI.mode === 'battle' && UI.battle && UI.battle.running) UI.renderSceneUI();
    // 顶栏生命灵力
    UI.renderTop();
    // 炼丹炉火数值
    if (UI.mode === 'alchemy' && S.furnace && S.furnace.running && UI._alchemyRefs && UI._alchemyRefs.fill) {
      var f = S.furnace, r = UI._alchemyRefs;
      r.fill.style.width = f.heat + '%';
      r.mark.style.left = f.heat + '%';
      r.txt.textContent = '火候 ' + Math.round(f.heat);
      r.prog.style.width = Math.floor(f.t / f.dur * 100) + '%';
      r.progTxt.textContent = Math.floor(f.t) + 's / ' + f.dur + 's';
      r.ratio.textContent = '区间占比 ' + Math.floor(f.inZone / f.dur * 100) + '%';
    }
    // 修炼面板增益倒计时
    if (UI.mode === 'cultivate' && !S.bt) UI.renderSceneUI();
    if (UI.mode === 'cave' && (S.cultivating || UI._restUntil)) UI.renderSceneUI();
    if (UI.mode === 'adventure') { /* 采集冷却按钮低频刷新 */ if ((t / 1000 | 0) % 2 === 0) UI.renderSceneUI(); }
  };

  UI.refresh = function () {
    UI.renderTop();
    UI.renderStatus();
    UI.renderQuests();
    UI.renderSceneUI();
    // 若背包/设置弹窗开着，刷新内容
    var top = UI._modalStack[UI._modalStack.length - 1];
    if (top) {
      var title = top.querySelector('.modal-head span');
      if (title && title.textContent === '背包') UI.openBagReplace();
    }
  };
  UI.openBagReplace = function () {
    UI.closeModal();
    UI.openBag();
  };

  root.UI = UI;
})(typeof self !== 'undefined' ? self : globalThis);
