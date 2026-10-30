/* ===== 主入口：启动 / 游戏循环 / 动作接线 / 多标签页 / 离线 ===== */
(function (root) {
  'use strict';

  var S = null;
  var lastFrame = 0, lastSaveAt = 0, lastQuestCheck = 0;
  var leader = true, TAB_ID = Math.random().toString(36).slice(2);
  var HB_PREFIX = 'qingyun.hb.';
  var battle = null;
  var restUntil = 0; // 洞府恢复进度
  var resetArmed = false;

  function setS(v) { S = v; UI.S = v; }

  function $(id) { return document.getElementById(id); }
  function nowMs() { return performance.now(); }

  /* ================= 启动 ================= */
  function boot() {
    UI.settings = SAVE.loadSettings();
    SCENE.setReduced(UI.settings.reducedMotion);
    SCENE.init($('scene-canvas'));
    UI.init(buildActions());

    var loaded = SAVE.load();
    if (loaded.ok && loaded.save) {
      $('btn-continue').classList.remove('hidden');
    } else if (!loaded.ok) {
      // 存档损坏：保留原文件，提示原因
      console.warn('存档读取失败：', loaded.reason);
    }

    $('btn-enter').addEventListener('click', function () { onEnter(false); });
    $('btn-continue').addEventListener('click', function () { onEnter(true); });

    // 多标签页心跳
    setInterval(heartbeat, 1500);
    heartbeat();
    setTimeout(checkLeader, 400);
    root.addEventListener('beforeunload', function () {
      try { root.localStorage.removeItem(HB_PREFIX + TAB_ID); } catch (e) { /* 忽略 */ }
      if (S) autosave();
    });

    // 后台/前台
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) { onHidden(); } else { onVisible(); }
    });

    requestAnimationFrame(loop);
  }

  function onEnter(continueSave) {
    SND.init();
    SND.applySettings(UI.settings);
    SND.play('click');
    if (continueSave) {
      var loaded = SAVE.load();
      if (!loaded.ok || !loaded.save) {
        UI.toast('存档读取失败：' + (loaded.reason || '无存档'), 'bad');
        return;
      }
      S = loaded.save.data;
      S.savedAt = loaded.save.savedAt;
      setS(S);
      // 离线结算
      var off = SYS.computeOffline(S, Date.now());
      finishEnter();
      if (off && off.gain > 0) {
        SND.play('bell');
        var hrs = Math.floor(off.ms / 3600000), mins = Math.floor(off.ms % 3600000 / 60000);
        UI.openModal({
          title: '闭关归来',
          body: '<div class="scene-hint">离线打坐 <b>' + hrs + '</b> 小时 <b>' + mins + '</b> 分钟（上限 8 小时，按基础效率 50% 结算）。</div>'
            + '<div class="scene-kv" style="margin-top:8px"><span>获得修为</span><span style="color:var(--gold-2)">+' + Math.floor(off.gain) + '</span></div>'
            + (off.filled ? '<div class="scene-hint" style="color:var(--green)">当前境界修为已满，可尝试突破。</div>' : '')
            + '<div class="scene-hint" style="margin-top:6px">离线收益不叠加限时丹药，也不会自动突破。</div>',
          foot: '<button class="btn btn-gold" data-act="close-modal">继续仙途</button>'
        });
        UI.log('闭关归来，获得修为 ' + Math.floor(off.gain), 'good');
      }
      // 中断的炼制退还材料
      if (S.furnace && S.furnace.running) {
        var f = S.furnace;
        var r = DATA.RECIPES[f.recipe];
        for (var k in r.cost) GAME.addItem(S, k, r.cost[k]);
        S.furnace = null;
        UI.log('上次炼丹中断，投入的材料已退还。', 'warn');
      }
    } else {
      // 新建角色：若已有存档先确认覆盖
      var existing = SAVE.load();
      if (existing.ok && existing.save) {
        UI.openModal({
          title: '已有存档',
          body: '<div class="scene-hint">开始新的仙途将覆盖当前存档（' + esc(existing.save.data.name) + '），建议先导出备份。</div>',
          foot: '<button class="btn" data-act="close-modal">取消</button><button class="btn btn-gold" data-act="confirm-new">继续</button>'
        });
        return;
      }
      showNameModal();
      return;
    }
    finishEnter();
  }

  function finishEnter() {
    $('title-screen').classList.add('hidden');
    $('game').classList.remove('hidden');
    UI.S = S;
    SCENE.setUpgraded(S.realm >= DATA.ZJ_IDX);
    UI.setMode('cave');
    UI.refresh();
    SND.scene('cave');
    var done = SYS.checkQuests(S);
    UI.log('欢迎回来，' + S.name + '。', 'good');
    if (done.length) done.forEach(function (q) { UI.log('仙途历程进展：' + q.name, 'warn'); });
    autosave();
  }

  function showNameModal() {
    var names = [];
    for (var i = 0; i < 3; i++) {
      names.push(DATA.NAME_A[Math.floor(Math.random() * DATA.NAME_A.length)] + DATA.NAME_B[Math.floor(Math.random() * DATA.NAME_B.length)]);
    }
    UI.openModal({
      title: '取一个道号',
      body: '<input class="name-input" id="name-input" maxlength="8" placeholder="请输入道号" value="' + names[0] + '">'
        + '<div class="scene-row" style="margin-top:10px;justify-content:center">'
        + names.map(function (n) { return '<button class="btn btn-sm" data-act="pick-name" data-arg="' + n + '">' + n + '</button>'; }).join('')
        + '</div>',
      foot: '<button class="btn btn-gold" data-act="confirm-new">开始修仙</button>'
    });
    setTimeout(function () { var i = $('name-input'); if (i) { i.focus(); i.select(); } }, 50);
  }

  function createNewGame(name) {
    name = (name || '').trim();
    if (!name) { UI.toast('道号不可为空', 'bad'); SND.play('error'); return; }
    if (name.length > 8) { UI.toast('道号最多 8 个字', 'bad'); SND.play('error'); return; }
    setS(GAME.newGame(name));
    finishEnter();
    SND.play('bell');
    UI.toast('欢迎踏入仙途，' + name + '！', 'good');
    UI.log('你拜入青云门下，道号「' + name + '」。去洞府打坐，开启仙途第一课吧。', 'good');
  }

  /* ================= 游戏循环 ================= */
  function loop(t) {
    requestAnimationFrame(loop);
    var dt = lastFrame ? Math.min(0.25, (t - lastFrame) / 1000) : 0;
    lastFrame = t;
    if (!S) { SCENE.render(t, 0); return; }
    if (!leader || UI._paused) { SCENE.render(t, 0); UI.tick(t); return; }

    var nowP = nowMs();
    var nowD = Date.now();

    GAME.cleanBuffs(S, nowD);

    // 洞府恢复进度
    if (restUntil && nowP >= restUntil) {
      restUntil = 0;
      UI._restUntil = 0;
      GAME.fullRestore(S);
      SND.play('pill');
      UI.toast('生命与灵力已恢复', 'good');
      UI.log('调息完毕，气血充盈。', 'good');
      UI.refresh();
      autosave();
    }

    // 打坐修炼（战斗与炼丹期间暂停）
    var busy = (battle && battle.running) || (S.furnace && S.furnace.running) || !!S.bt;
    if (S.cultivating && !busy) {
      var ev = SYS.cultTick(S, dt);
      if (ev && ev.t === 'full') {
        SND.play('bell');
        UI.toast('修为圆满，可尝试突破', 'good');
        UI.log('修为圆满，气机盈满，可尝试突破境界。', 'warn');
        UI.refresh();
      }
    }

    // 突破演出
    var bev = SYS.btTick(S, nowP);
    if (bev) {
      if (bev.t === 'phase' && bev.phase === 'impact') {
        SCENE.setBreak('impact');
        SND.play('breakthrough');
        if (!UI.settings.noFlash) SCENE.flash(0.3, '240,217,160');
        SCENE.shake(8, 500);
        SND.vibrate(60);
      } else if (bev.t === 'success') {
        SCENE.setBreak(null);
        SCENE.setUpgraded(S.realm >= DATA.ZJ_IDX);
        UI.setMode(UI.mode || 'cave');
        SND.play('bell');
        SND.vibrate([40, 60, 40]);
        var gx = SCENE.playerX(), gy = SCENE.groundY();
        SCENE.ring(gx, gy - 50, '216,181,106', 240, 1);
        SCENE.ring(gx, gy - 50, '111,199,184', 180, 1.2);
        SCENE.fxBreakColumn(gx, gy);
        UI.toast('突破成功：' + bev.realm, 'good');
        UI.log('天地灵气倒灌，你成功突破至<b>' + bev.realm + '</b>！', 'good');
        if (S.realm >= DATA.ZJ_IDX) UI.log('筑基功成，洞府之外多了宫灯与灵泉。', 'good');
        var qdone = SYS.checkQuests(S);
        if (qdone.length) qdone.forEach(function (q) { UI.log('仙途历程进展：' + q.name, 'warn'); });
        UI.refresh();
        autosave();
      }
    }

    // 战斗
    if (battle && battle.running) {
      var st = GAME.calcStats(S);
      battle._stats = st;
      battle._hp = S.hp; battle._hpmax = st.hp;
      var evs = SYS.battleTick(battle, S, dt, nowP);
      evs.forEach(handleBattleEvent);
      if (!battle.running) onBattleEnd();
    }

    // 炼丹炉火
    if (S.furnace && S.furnace.running) {
      SYS.furnaceTick(S.furnace, dt);
      if (!S.furnace.running && S.furnace.finished === 'done') {
        SND.play('alchemy');
        UI.log('炉火渐息，丹成在即，可开炉取丹。', 'warn');
        UI.renderSceneUI();
        autosave();
      }
    }

    // 任务检查（节流）
    if (nowD - lastQuestCheck > 600) {
      lastQuestCheck = nowD;
      var newly = SYS.checkQuests(S);
      if (newly.length) {
        newly.forEach(function (q) {
          SND.play('quest');
          UI.toast('仙途历程：' + q.name, 'good');
          UI.log('仙途历程进展：<b>' + q.name + '</b>，可领取奖励。', 'warn');
        });
        UI.refresh();
      }
    }

    // 自动保存
    if (nowD - lastSaveAt > 15000) autosave();

    SCENE.render(t, dt);
    UI.tick(t);
  }

  /* ================= 战斗事件表现 ================= */
  function handleBattleEvent(ev) {
    var px = SCENE.playerX(), ex = SCENE.enemyX(), gy = SCENE.groundY();
    if (ev.t === 'hit' && ev.src === 'player') {
      SCENE.fxHit(ex, gy - 60, ev.crit);
      SND.play(ev.crit ? 'crit' : 'hit');
      SCENE.floater('-' + ev.dmg, ex + (Math.random() - 0.5) * 30, gy - 100, { color: ev.crit ? '#e8c56d' : '#e8f3ee', size: ev.crit ? 21 : 17, bold: ev.crit });
    } else if (ev.t === 'hit' && ev.src === 'enemy') {
      SCENE.playerHurt();
      SCENE.fxHit(px, gy - 50, false);
      SND.play('hit');
      var txt = '-' + ev.dmg;
      if (ev.defended) txt += ' 防';
      if (ev.absorbed) txt += ' 盾';
      SCENE.floater(txt, px + (Math.random() - 0.5) * 24, gy - 96, { color: ev.defended || ev.absorbed ? '#6fc7b8' : '#e0a49e' });
      SCENE.shake(3, 120);
    } else if (ev.t === 'strong') {
      SCENE.playerHurt();
      SND.play('thunder');
      SCENE.flash(0.12, '255,220,180');
      SCENE.shake(6, 260);
      SCENE.floater(ev.name + ' -' + ev.dmg, px, gy - 120, { color: '#e8933c', size: 19 });
    } else if (ev.t === 'telegraph') {
      UI.toast('敌方蓄力：' + ev.name, 'bad', 1600);
    } else if (ev.t === 'skill') {
      if (ev.id === 'thunder') {
        SCENE.fxThunder(ex, gy);
        SND.play('thunder');
      } else {
        SCENE.fxSword(ex, gy - 50);
        SND.play('sword');
      }
      SCENE.floater('-' + ev.dmg, ex + (Math.random() - 0.5) * 30, gy - 110, { color: ev.crit ? '#e8c56d' : '#dff3ff', size: ev.crit ? 22 : 18 });
    } else if (ev.t === 'shield') {
      SCENE.fxShield(px, gy - 40);
      SND.play('shield');
      UI.toast('护体灵盾展开', 'good', 1400);
    } else if (ev.t === 'defend') {
      SND.play('defend');
      UI.toast('凝神防御', 'good', 1200);
    } else if (ev.t === 'pill') {
      SND.play('pill');
      if (ev.healed) SCENE.floater('+' + ev.healed, px, gy - 96, { color: '#6fbf9a' });
      if (ev.manaed) SCENE.floater('灵 +' + ev.manaed, px + 30, gy - 120, { color: '#8fd4e4' });
    } else if (ev.t === 'phase') {
      SND.play('thunder');
      SCENE.shake(9, 400);
      UI.toast(ev.name, 'bad', 2200);
      UI.log('<b>' + ev.name + '</b>', 'bad');
    }
  }

  function onBattleEnd() {
    if (battle.over === 'win') {
      S.flags.firstKill = true;
      if (battle.enemy.isBoss) {
        S.flags.bossDead = true;
        SND.play('quest');
        UI.toast('首领已伏诛！第一阶段完成', 'good', 4000);
        UI.log('你击败了后山之主<b>青鳞妖蟒</b>！第一阶段修行圆满，后续仍可继续修炼与历练。', 'good');
      } else {
        SND.play('quest');
      }
      var qd = SYS.checkQuests(S);
      if (qd.length) qd.forEach(function (q) { UI.log('仙途历程进展：' + q.name, 'warn'); });
    } else if (battle.over === 'lose') {
      SND.play('defeat');
      SND.vibrate(120);
      UI.log('你被<b>' + battle.enemy.name + '</b>击倒，性命无忧，回洞府调息后再战。', 'bad');
    } else if (battle.over === 'retreat') {
      UI.log('你选择了撤退，本次不获得掉落。', 'warn');
    }
    UI.refresh();
    autosave();
  }

  /* ================= 动作 ================= */
  function buildActions() {
    return {
      /* 修炼 */
      'cult-start': function () {
        if (!S.cultivating) {
          S.cultivating = true;
          S.flags.firstMeditate = true;
          SND.play('pill');
          UI.toast('开始打坐', 'good', 1200);
          UI.log('你于洞府中打坐，灵气入体。', 'good');
          UI.refresh();
          autosave();
        }
      },
      'cult-stop': function () {
        if (S.cultivating) {
          S.cultivating = false;
          UI.toast('已停止打坐', '', 1200);
          UI.refresh();
          autosave();
        }
      },
      'use-juqi': function () {
        var r = GAME.countItem(S, 'juqi');
        if (r <= 0) { UI.toast('没有聚气丹了', 'bad'); SND.play('error'); return; }
        GAME.removeItem(S, 'juqi', 1);
        GAME.addBuff(S, 'juqi', 60, Date.now());
        SND.play('pill');
        UI.toast('聚气丹生效：修炼速度 +50%', 'good');
        UI.log('服下聚气丹，灵气运转加快（60 秒）。', 'good');
        UI.refresh();
        autosave();
      },
      'breakthrough': function () {
        var r = SYS.startBreakthrough(S, nowMs());
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        SND.play('breakthrough');
        SCENE.setBreak('charge');
        SCENE.setScene('break');
        UI.log('你运转周身气机，开始冲击瓶颈……', 'warn');
        UI.refresh();
      },
      'upgrade-meridian': function () {
        var m = DATA.MERIDIAN.tuina;
        var lv = S.meridian.tuina;
        if (lv >= m.maxLevel) { UI.toast('已至巅峰', 'bad'); return; }
        var cost = m.cost(lv);
        if (S.stones < cost) { UI.toast('灵石不足', 'bad'); SND.play('error'); return; }
        S.stones -= cost;
        S.meridian.tuina++;
        SND.play('quest');
        UI.toast('吐纳诀升至 ' + S.meridian.tuina + ' 级', 'good');
        UI.log('吐纳诀突破至 ' + S.meridian.tuina + ' 级，修炼效率提升。', 'good');
        UI.refresh();
        autosave();
      },
      'learn-skill': function (id) {
        var r = GAME.learnSkill(S, id);
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        SND.play('quest');
        UI.toast('学会了 ' + DATA.SKILLS[id].name, 'good');
        UI.log('你参悟功法，习得<b>' + DATA.SKILLS[id].name + '</b>。', 'good');
        UI.refresh();
        autosave();
      },

      /* 历练 */
      'enter-node': function (id) {
        var node = DATA.NODES.filter(function (n) { return n.id === id; })[0];
        if (!node) return;
        var un = SYS.nodeUnlocked(S, node);
        if (!un.ok) { UI.toast(un.reason, 'bad'); SND.play('error'); return; }
        battle = SYS.createBattle(node.enemy, S, nowMs(), node.id);
        UI.battle = battle;
        SCENE.setBattle(battle);
        UI.setMode('battle');
        SND.scene('battle');
        UI.log('进入<b>' + node.name + '</b>，遭遇 ' + battle.enemy.name + '！', 'warn');
      },
      'gather': function (id) {
        var node = DATA.NODES.filter(function (n) { return n.id === id; })[0];
        if (!node) return;
        var gr = SYS.gatherReady(S, node, Date.now());
        if (!gr.ok) { UI.toast('尚在冷却', 'bad'); return; }
        var r = SYS.doGather(S, node, Date.now());
        SND.play('gather');
        UI.toast('采得 ' + DATA.ITEMS[r.item].name + '×' + r.qty, 'good');
        UI.log('在' + node.name + '采得 ' + DATA.ITEMS[r.item].name + '×' + r.qty + '。', 'good');
        UI.refresh();
        autosave();
      },
      'do-event': function (id) {
        var node = DATA.NODES.filter(function (n) { return n.id === id; })[0];
        if (!node || node.type !== 'event') return;
        if (S.flags['evt_' + id]) { UI.toast('已探寻过', 'bad'); return; }
        S.flags['evt_' + id] = true;
        S.stones += node.reward.stones;
        SND.play('pickup');
        UI.toast('获得灵石 ' + node.reward.stones, 'good');
        UI.log('在' + node.name + '拾得灵石 ' + node.reward.stones + '。', 'good');
        UI.refresh();
        autosave();
      },

      /* 战斗 */
      'use-skill': function (id) {
        if (!battle || !battle.running) return;
        var r = SYS.useSkill(battle, S, id, nowMs());
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        if (r.ev) handleBattleEvent(r.ev);
      },
      'defend': function () {
        if (!battle || !battle.running) return;
        var r = SYS.defend(battle, nowMs());
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        if (r.ev) handleBattleEvent(r.ev);
      },
      'battle-pill': function (id) {
        if (!battle || !battle.running) return;
        var r = SYS.usePillInBattle(battle, S, id, nowMs());
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        if (r.ev) handleBattleEvent(r.ev);
        UI.refresh();
      },
      'retreat': function () {
        if (!battle || !battle.running) return;
        SYS.retreat(battle);
        onBattleEnd();
      },
      'claim-drops': function () {
        if (!battle) return;
        var r = SYS.claimDrops(battle, S);
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        SND.play('pickup');
        var names = r.items.map(function (x) { return DATA.ITEMS[x.item].name + '×' + x.qty; });
        UI.toast('拾取：灵石 ' + r.stones + (names.length ? '、' + names.join('、') : ''), 'good', 3000);
        UI.log('拾取战利品：灵石 ' + r.stones + (names.length ? '、' + names.join('、') : '') + '。', 'good');
        UI.refresh();
        autosave();
      },
      'leave-battle': function () {
        battle = null;
        UI.battle = null;
        SCENE.setBattle(null);
        UI.setMode('adventure');
        SND.scene('adventure');
        UI.refresh();
        autosave();
      },

      /* 炼丹 */
      'select-recipe': function (id) {
        UI._recipeSel = id;
        SND.play('click');
        UI.renderSceneUI();
      },
      'alchemy-start': function (id) {
        if (S.cultivating) UI.log('炼丹期间打坐已暂停，结束后自动恢复。', 'warn');
        var r = SYS.startAlchemy(S, id || UI._recipeSel || 'hxue');
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        SND.play('alchemy');
        UI.log('投入材料，炉火升起。盯住火候区间！', 'warn');
        UI.renderSceneUI();
      },
      'alchemy-abort': function () {
        if (!S.furnace || !S.furnace.running) return;
        SYS.cancelAlchemy(S.furnace);
        SND.play('error');
        UI.toast('已中止炼制，材料损失', 'bad');
        UI.log('你中止了炼制，投入的材料随炉火化为乌有。', 'bad');
        UI.refresh();
        autosave();
      },
      'alchemy-settle': function () {
        var f = S.furnace;
        if (!f || f.finished !== 'done') return;
        var r = SYS.settleAlchemy(S, f);
        S.furnace = null;
        if (!r) { UI.refresh(); return; }
        var tier = DATA.TIERS[r.tier];
        SND.play('pill');
        UI.toast('炼成 ' + DATA.ITEMS[r.item].name + '×' + r.qty + '（' + tier.name + '）', 'good', 3200);
        UI.log('开炉！得 ' + DATA.ITEMS[r.item].name + '×' + r.qty + '（' + tier.name + '，区间占比 ' + Math.floor(r.ratio * 100) + '%）。', 'good');
        UI.refresh();
        autosave();
      },
      holdStart: function (k) {
        if (S.furnace && S.furnace.running) {
          if (k === 'heat') S.furnace.heatOn = true;
          if (k === 'cool') S.furnace.coolOn = true;
        }
      },
      holdStop: function (k) {
        if (!S.furnace) return;
        if (k === 'heat') S.furnace.heatOn = false;
        if (k === 'cool') S.furnace.coolOn = false;
      },

      /* 背包 */
      'open-bag': function () { SND.play('click'); UI.openBag(); },
      'bag-tab': function (tab) { UI._bagTab = tab; UI.openBagReplace(); },
      'item-detail': function (id) { SND.play('click'); UI.itemDetail(id); },
      'equip': function (id) {
        var r = GAME.equipItem(S, id);
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        SND.play('pickup');
        UI.toast('已穿戴 ' + DATA.ITEMS[id].name, 'good');
        UI.log('穿上 ' + DATA.ITEMS[id].name + '，属性已重算。', 'good');
        UI.refresh();
        autosave();
      },
      'unequip': function (slot) {
        var r = GAME.unequipItem(S, slot);
        if (!r.ok) return;
        SND.play('click');
        UI.refresh();
        autosave();
      },
      'use-item': function (id) {
        var it = DATA.ITEMS[id];
        if (!it) return;
        if (GAME.countItem(S, id) <= 0) { UI.toast('数量不足', 'bad'); return; }
        if (battle && battle.running) {
          var r = SYS.usePillInBattle(battle, S, id, nowMs());
          if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
          if (r.ev) handleBattleEvent(r.ev);
        } else {
          GAME.removeItem(S, id, 1);
          var st = GAME.calcStats(S);
          if (it.heal) { var h = Math.round(st.hp * it.heal); S.hp = Math.min(st.hp, S.hp + h); SCENE.floater('+' + h, SCENE.playerX(), SCENE.groundY() - 90, { color: '#6fbf9a' }); }
          if (it.mana) { var m = Math.round(st.mp * it.mana); S.mp = Math.min(st.mp, S.mp + m); SCENE.floater('灵 +' + m, SCENE.playerX() + 30, SCENE.groundY() - 110, { color: '#8fd4e4' }); }
          if (it.cult) GAME.addBuff(S, 'juqi', it.dur, Date.now());
          SND.play('pill');
          UI.toast('使用了 ' + it.name, 'good');
          UI.log('服下 ' + it.name + '。', 'good');
        }
        UI.refresh();
        autosave();
      },
      'rest': function () {
        if (restUntil) return;
        if (battle && battle.running) { UI.toast('战斗中无法调息', 'bad'); return; }
        restUntil = nowMs() + 3000;
        UI._restUntil = restUntil;
        SND.play('pill');
        UI.toast('调息中……', 'good', 1500);
        UI.renderSceneUI();
      },

      /* 任务 */
      'claim-quest': function (id) {
        var r = SYS.claimQuest(S, id);
        if (!r.ok) { UI.toast(r.reason, 'bad'); SND.play('error'); return; }
        SND.play('quest');
        SND.vibrate(30);
        var rw = [];
        if (r.reward.stones) rw.push('灵石×' + r.reward.stones);
        if (r.reward.item) rw.push(DATA.ITEMS[r.reward.item].name + '×' + (r.reward.qty || 1));
        if (r.reward.items) for (var k in r.reward.items) rw.push(DATA.ITEMS[k].name + '×' + r.reward.items[k]);
        UI.toast('领取奖励：' + rw.join('，'), 'good', 3000);
        UI.log('完成仙途历程「<b>' + r.quest.name + '</b>」，获得 ' + rw.join('，') + '。', 'good');
        UI.refresh();
        autosave();
      },

      /* 面板 */
      'open-status': function () { UI.openModal({ title: '人物状态', body: UI.statusHtml() }); },
      'open-quests': function () { UI.openDrawer({ title: '仙途历程', body: UI.questsHtml() }); },
      'open-log': function () {
        var list = $('log-list');
        var html = list ? list.innerHTML : '';
        UI.openDrawer({ title: '仙途见闻', body: '<div id="drawer-log">' + html + '</div>' });
      },
      'close-modal': function () { UI.closeModal(); },
      'close-drawer': function () { UI.closeDrawer(); },

      /* 设置 */
      'open-settings': function () { UI.openSettings(); },
      'toggle': function (key) {
        UI.settings[key] = !UI.settings[key];
        afterSettingsChange();
      },
      'set-setting': function (key, val) {
        UI.settings[key] = val;
        afterSettingsChange(true);
      },
      'toggle-pause': function () {
        UI._paused = !UI._paused;
        UI.toast(UI._paused ? '游戏已暂停' : '继续游戏', 'good', 1400);
        UI.closeModal();
        SND.play('click');
      },
      'manual-save': function () {
        autosave();
        UI.toast('已保存', 'good');
        SND.play('pickup');
      },
      'export-save': function () {
        var txt = SAVE.exportJson(S);
        var blob = new Blob([txt], { type: 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'qingyun-save-' + S.name + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        UI.toast('存档已导出', 'good');
      },
      'import-save': function () {
        var ta = $('import-area');
        var txt = ta ? ta.value.trim() : '';
        if (!txt) { UI.toast('请先粘贴存档 JSON', 'bad'); SND.play('error'); return; }
    var r = SAVE.importJson(txt);
    if (!r.ok) { UI.toast('导入失败：' + r.reason, 'bad', 4000); SND.play('error'); return; }
    setS(r.save.data);
    S.savedAt = Date.now();
        if (S.furnace && S.furnace.running) S.furnace = null;
        autosave();
        UI.closeModal();
        battle = null; UI.battle = null;
        SCENE.setBattle(null);
        SCENE.setUpgraded(S.realm >= DATA.ZJ_IDX);
        UI.setMode('cave');
        UI.refresh();
        SND.play('bell');
        UI.toast('存档导入成功', 'good');
        UI.log('读入存档，继续以「' + S.name + '」前行。', 'good');
      },
      'reset-save': function () {
        if (!resetArmed) {
          resetArmed = true;
          UI.toast('再次点击「重置存档」以确认（不可恢复）', 'bad', 3000);
          return;
        }
        resetArmed = false;
        SAVE.clear();
        UI.toast('存档已重置', 'good');
        setTimeout(function () { root.location.reload(); }, 600);
      },
      'pick-name': function (name) {
        var i = $('name-input');
        if (i) i.value = name;
      },
      'confirm-new': function () {
        var i = $('name-input');
        createNewGame(i ? i.value : '');
      }
    };
  }

  function afterSettingsChange(keepOpen) {
    SAVE.saveSettings(UI.settings);
    SND.applySettings(UI.settings);
    SCENE.setReduced(UI.settings.reducedMotion);
    if (!keepOpen) UI.openSettingsReplace();
    else {
      // 刷新滑块显示
      var modal = UI._modalStack[UI._modalStack.length - 1];
      if (modal) {
        var vals = modal.querySelectorAll('.val');
        var keys = ['music', 'ambient', 'sfx'];
        for (var i = 0; i < vals.length && i < keys.length; i++) vals[i].textContent = Math.round(UI.settings[keys[i]] * 100);
      }
    }
  }
  UI.openSettingsReplace = function () { UI.closeModal(); UI.openSettings(); };

  function autosave() {
    if (!S) return;
    var payload = SAVE.save(S);
    S.savedAt = payload.savedAt;
    lastSaveAt = Date.now();
  }

  /* ================= 后台 / 多标签页 ================= */
  function onHidden() {
    if (battle && battle.running) battle._hiddenAt = nowMs();
    if (S && S.cultivating) {
      // 后台修炼按离线规则结算，避免大量积压
      var off = SYS.computeOffline(S, Date.now());
      if (off && off.gain > 0) {
        UI.log('闭关修行，获得修为 ' + Math.floor(off.gain) + '。', 'good');
        UI.refresh();
      }
      autosave();
    } else if (S) {
      autosave();
    }
  }

  function onVisible() {
    if (battle && battle.running && battle._hiddenAt) {
      var shift = nowMs() - battle._hiddenAt;
      battle._hiddenAt = 0;
      // 平移所有计时，避免积压攻击
      battle.autoAt += shift;
      battle.defendUntil += shift; battle.defendCd += shift; battle.pillCd += shift;
      battle.shieldUntil += shift;
      for (var k in battle.cds) battle.cds[k] += shift;
      battle.enemy.nextAct += shift;
      if (battle.enemy.telegraph) battle.enemy.telegraph.at += shift;
    }
    if (S && S.furnace && S.furnace.running) {
      // 炉火在后台不推进（按离线规则仅结算打坐）
      UI.log('丹房炉火在离开期间暂停。', 'warn');
    }
  }

  function heartbeat() {
    try {
      root.localStorage.setItem(HB_PREFIX + TAB_ID, JSON.stringify({ t: Date.now() }));
    } catch (e) { /* 忽略 */ }
  }
  function freshOthers() {
    var out = [];
    try {
      for (var i = 0; i < root.localStorage.length; i++) {
        var key = root.localStorage.key(i);
        if (key && key.indexOf(HB_PREFIX) === 0 && key !== HB_PREFIX + TAB_ID) {
          var v = JSON.parse(root.localStorage.getItem(key) || '{}');
          if (v.t && Date.now() - v.t < 6000) out.push(key);
        }
      }
    } catch (e) { /* 忽略 */ }
    return out;
  }
  function checkLeader() {
    var others = freshOthers();
    if (!others.length) {
      if (!leader) {
        leader = true;
        $('tab-warn').classList.add('hidden');
        UI.toast('已恢复游戏', 'good', 1500);
      }
      return;
    }
    if (leader) {
      leader = false;
      $('tab-warn').classList.remove('hidden');
    }
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
    else boot();
  }

  // 调试/测试钩子
  root.XGAME = {
    getS: function () { return S; },
    setS: function (v) { setS(v); },
    actions: function () { return UI.actions; },
    enterBattle: function (enemyId, nodeId) {
      battle = SYS.createBattle(enemyId, S, performance.now(), nodeId);
      UI.battle = battle;
      SCENE.setBattle(battle);
      UI.setMode('battle');
      SND.scene('battle');
      return battle;
    }
  };
})(typeof self !== 'undefined' ? self : globalThis);
