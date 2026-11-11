(function (root) {
  'use strict';
  var DDZ = (root.DDZ = root.DDZ || {});
  var Game = DDZ.Game;
  var Prompt = DDZ.Prompt;
  var Cards = DDZ.Cards;

  var REQUIRED_IDS = [
    'fatal', 'phase-label', 'current-label', 'new-game-btn', 'hint',
    'copy-btn', 'prompt-text', 'history-panel',
    'hand-A', 'hand-B', 'hand-C', 'bottom-cards', 'result-box',
    'save-game-btn', 'replay-game-btn', 'saved-game-select', 'delete-game-btn',
    'export-game-btn', 'import-game-btn', 'import-file-input',
    'save-prompt-btn'
  ];

  var ERROR_TEXT = {
    INVALID_PHASE: '当前阶段不允许该操作',
    NOT_CURRENT_PLAYER: '不是当前行动玩家',
    INVALID_BID: '叫分必须是 0、1、2、3 或不叫',
    BID_NOT_HIGHER: '叫分必须高于当前最高分',
    EMPTY_SELECTION: '请先选择手牌',
    CARD_NOT_OWNED: '选择了不属于当前玩家的牌',
    DUPLICATE_CARD: '存在重复牌',
    INVALID_PATTERN: '非法牌型',
    CANNOT_BEAT: '不能压过当前有效牌',
    CANNOT_PASS_FREE: '自由出牌时必须领出',
    GAME_FINISHED: '牌局已结束'
  };

  var PATTERN_TEXT = {
    single: '单张', pair: '对子', triple: '三张', triple_single: '三带一',
    triple_pair: '三带二', straight: '顺子', pair_straight: '连对',
    plane: '飞机不带', plane_single: '飞机带单', plane_pair: '飞机带对',
    four_two_single: '四带二单', four_two_pair: '四带二对',
    bomb: '炸弹', rocket: '火箭'
  };
  var REASON_TEXT = {
    bomb: '炸弹', rocket: '火箭', spring: '春天', anti_spring: '反春'
  };
  var PHASE_TEXT = {
    idle: '待开始', bidding: '叫分中', redeal: '等待重新发牌',
    playing: '出牌中', finished: '已结束'
  };

  var dom = {};
  var currentState = null;
  var cachedPrompt = '';
  var selectedCards = new Set();

  function getEl(id) {
    return document.getElementById(id);
  }

  function setFatal(message) {
    var fatal = getEl('fatal');
    if (fatal) fatal.textContent = message;
    var buttons = document.querySelectorAll('button');
    Array.prototype.forEach.call(buttons, function (button) {
      button.disabled = true;
    });
  }

  function assertRequiredDom() {
    for (var i = 0; i < REQUIRED_IDS.length; i++) {
      if (!getEl(REQUIRED_IDS[i])) {
        setFatal('请保留完整目录及全部 CSS、JS 文件');
        return false;
      }
    }
    var groups = document.querySelectorAll('.hand-controls');
    if (groups.length !== 3) {
      setFatal('请保留完整目录及全部 CSS、JS 文件');
      return false;
    }
    return true;
  }

  function cacheDom() {
    dom.phaseLabel = getEl('phase-label');
    dom.currentLabel = getEl('current-label');
    dom.newGameBtn = getEl('new-game-btn');
    dom.hint = getEl('hint');
    dom.copyBtn = getEl('copy-btn');
    dom.savePromptBtn = getEl('save-prompt-btn');
    dom.promptText = getEl('prompt-text');
    dom.promptPanel = getEl('prompt-panel');
    dom.historyPanel = getEl('history-panel');
    dom.historyList = getEl('history-list');
    dom.historyEmpty = getEl('history-empty');
    dom.saveBtn = getEl('save-game-btn');
    dom.replayBtn = getEl('replay-game-btn');
    dom.savedSelect = getEl('saved-game-select');
    dom.deleteBtn = getEl('delete-game-btn');
    dom.exportBtn = getEl('export-game-btn');
    dom.importBtn = getEl('import-game-btn');
    dom.importFileInput = getEl('import-file-input');
    dom.bottomCards = getEl('bottom-cards');
    dom.highestBid = getEl('highest-bid');
    dom.landlordLabel = getEl('landlord-label');
    dom.multiplierLabel = getEl('multiplier-label');
    dom.lastPlay = getEl('last-play');
    dom.lastPlayer = getEl('last-player');
    dom.passCount = getEl('pass-count');
    dom.redealBtn = getEl('redeal-btn');
    dom.resultDetail = getEl('result-detail');
    dom.handControls = {
      A: document.querySelector('.hand-controls[data-player="A"]'),
      B: document.querySelector('.hand-controls[data-player="B"]'),
      C: document.querySelector('.hand-controls[data-player="C"]')
    };
    dom.hands = {
      A: getEl('hand-A'),
      B: getEl('hand-B'),
      C: getEl('hand-C')
    };
  }

  function showError(code) {
    showHint(ERROR_TEXT[code] || '操作未生效，请检查当前阶段和选择');
  }

  function showHint(text) {
    if (dom.hint) dom.hint.textContent = text;
  }

  function selectAllText(el) {
    if (!el) return;
    var range = document.createRange();
    range.selectNodeContents(el);
    var selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(range);
    }
  }

  function nameOf(state, id) {
    if (!state || !id) return '无';
    var found = state.players.filter(function (p) { return p.id === id; })[0];
    return found ? found.name : id;
  }

  function roleText(role) {
    return role === 'landlord' ? '地主' : (role === 'farmer' ? '农民' : '未定');
  }

  function sideText(side) {
    return side === 'landlord' ? '地主胜' : '农民胜';
  }

  function fmtCards(ids) {
    return ids.map(Cards.cardLabel).join(' ');
  }

  function clearEl(el) {
    if (!el) return;
    while (el.firstChild) el.removeChild(el.firstChild);
  }

  function makeCard(id, clickable, selected) {
    var card = document.createElement('span');
    var label = Cards.cardLabel(id);
    var classes = ['card'];
    if (id === 'BJ') classes.push('red');
    else if (id === 'XJ') classes.push('black');
    else if (label.indexOf('♥') >= 0 || label.indexOf('♦') >= 0) classes.push('red');
    else classes.push('black');
    if (clickable) classes.push('clickable');
    if (selected) classes.push('selected');
    card.className = classes.join(' ');

    var corner = document.createElement('span');
    corner.className = 'card-corner';
    if (id === 'XJ' || id === 'BJ') {
      corner.classList.add('card-corner-joker');
      ['J', 'O', 'K'].forEach(function (ch) {
        var line = document.createElement('span');
        line.appendChild(document.createTextNode(ch));
        corner.appendChild(line);
      });
      card.appendChild(corner);
    } else {
      var rankEl = document.createElement('span');
      rankEl.className = 'card-rank';
      var suitEl = document.createElement('span');
      suitEl.className = 'card-suit';
      var rank = label.slice(1);
      if (rank === '10') rankEl.classList.add('card-rank-ten');
      rankEl.appendChild(document.createTextNode(rank));
      suitEl.appendChild(document.createTextNode(label.charAt(0)));
      corner.appendChild(rankEl);
      corner.appendChild(suitEl);
      card.appendChild(corner);
    }
    card.setAttribute('data-card-id', id);
    return card;
  }

  function toggleCard(id, playerId) {
    if (!currentState || currentState.currentPlayerId !== playerId) return;
    if (selectedCards.has(id)) selectedCards.delete(id);
    else selectedCards.add(id);
    render(currentState);
  }

  function makeMiniCard(id) {
    var card = makeCard(id, false, false);
    card.classList.add('mini');
    return card;
  }

  function renderTracker(id, state) {
    var section = dom.hands[id];
    if (!section) return;
    var tracker = section.querySelector('.hand-tracker');
    if (!tracker) return;
    clearEl(tracker);
    state.history.forEach(function (h) {
      if (h.type !== 'play' || h.playerId !== id) return;
      var group = document.createElement('span');
      group.className = 'tracker-group';
      h.cardIds.forEach(function (cardId) {
        group.appendChild(makeMiniCard(cardId));
      });
      tracker.appendChild(group);
    });
  }

  function renderHand(id, state) {
    var section = dom.hands[id];
    if (!section) return;
    var player = state.players.filter(function (p) { return p.id === id; })[0];
    var cardsBox = section.querySelector('.hand-cards');
    var meta = section.querySelector('.hand-meta');
    clearEl(cardsBox);
    var isCurrent = state.currentPlayerId === id;
    var clickable = isCurrent && state.phase === 'playing';
    player.handIds.forEach(function (cardId) {
      var card = makeCard(cardId, clickable, selectedCards.has(cardId));
      if (clickable) {
        card.addEventListener('click', function () {
          toggleCard(cardId, id);
        });
      }
      cardsBox.appendChild(card);
    });
    renderTracker(id, state);
    if (isCurrent) section.classList.add('current');
    else section.classList.remove('current');
    var avatar = section.querySelector('.avatar');
    if (avatar) {
      avatar.classList.remove('landlord', 'farmer');
      if (player.role === 'landlord') {
        avatar.textContent = '\uD83E\uDE99'; // 地主：金元宝
        avatar.classList.add('landlord');
        avatar.classList.remove('hidden');
      } else if (player.role === 'farmer') {
        avatar.textContent = '\uD83D\uDC52'; // 农民：草帽
        avatar.classList.add('farmer');
        avatar.classList.remove('hidden');
      } else {
        avatar.textContent = '';
        avatar.classList.add('hidden');
      }
    }
    var roleTag = section.querySelector('.role-tag');
    if (roleTag) {
      roleTag.classList.remove('landlord', 'farmer');
      if (player.role === 'landlord' || player.role === 'farmer') {
        roleTag.textContent = roleText(player.role);
        roleTag.classList.add(player.role);
      } else {
        roleTag.textContent = '';
      }
    }
    var bidText = player.bid === null ? '未叫' :
      (player.bid === 0 ? '不叫' : player.bid + ' 分');
    meta.textContent = roleText(player.role) + '，剩余 ' +
      player.handIds.length + ' 张，叫分：' + bidText;
  }

  function formatHistory(h, state, seqMap) {
    var seq = seqMap[h.seq];
    if (h.type === 'bid') {
      return seq + '. ' + nameOf(state, h.playerId) +
        (h.score === 0 ? '不叫' : '叫 ' + h.score + ' 分') +
        '；当前最高 ' + h.highestBid + ' 分';
    }
    if (h.type === 'landlord') {
      return seq + '. 确定地主：' + nameOf(state, h.playerId) +
        '；底牌 ' + fmtCards(h.bottomCards);
    }
    if (h.type === 'play') {
      return seq + '. ' + nameOf(state, h.playerId) + ' 出牌：' +
        fmtCards(h.cardIds) + '；牌型 ' +
        (PATTERN_TEXT[h.pattern.type] || h.pattern.type) +
        '；剩余 ' + h.remainingCount + ' 张';
    }
    if (h.type === 'pass') {
      return seq + '. ' + nameOf(state, h.playerId) +
        ' 不要；连续不要次数 ' + h.passCount;
    }
    if (h.type === 'new_round') {
      return seq + '. 新一轮：' + nameOf(state, h.playerId) + ' 获得自由出牌权';
    }
    if (h.type === 'multiplier') {
      return seq + '. 倍数变化：' +
        (REASON_TEXT[h.reason] || h.reason) + '，' +
        h.before + ' → ' + h.after + '（关联事件 ' + seqMap[h.sourceSeq] + '）';
    }
    if (h.type === 'finish') {
      return seq + '. 结束：' + sideText(h.winnerSide) +
        '；倍数 ' + h.multiplier +
        '；得分 甲 ' + h.scores.A + '，乙 ' + h.scores.B + '，丙 ' + h.scores.C;
    }
    return seq + '. 未知事件 ' + h.type;
  }

  function formatResult(state) {
    if (!state.result) return '尚未结算';
    var r = state.result;
    var lines = [
      sideText(r.winnerSide),
      '基础叫分：' + r.baseBid + ' 分',
      '最终倍数：' + r.multiplier,
      '甲得分：' + r.scores.A,
      '乙得分：' + r.scores.B,
      '丙得分：' + r.scores.C
    ];
    r.multiplierEvents.forEach(function (event) {
      lines.push('倍数变化：' + (REASON_TEXT[event.reason] || event.reason) +
        '，' + event.before + ' → ' + event.after);
    });
    return lines.join('\n');
  }

  function renderHistory(state) {
    clearEl(dom.historyList);
    var seqMap = {};
    var count = 0;
    state.history.forEach(function (h) {
      if (h.type === 'deal') return;
      count++;
      seqMap[h.seq] = count;
      var li = document.createElement('li');
      li.appendChild(document.createTextNode(formatHistory(h, state, seqMap)));
      dom.historyList.appendChild(li);
    });
    if (dom.historyEmpty) {
      dom.historyEmpty.classList.toggle('hidden', count > 0);
    }
  }

  function renderPromptText(text) {
    clearEl(dom.promptText);
    var lines = text.split('\n');
    var re = /([♠♥♣♦](?:10|[A2-9JQK])|小王|大王)/g;
    lines.forEach(function (line, i) {
      if (i > 0) dom.promptText.appendChild(document.createTextNode('\n'));
      var last = 0;
      var m;
      while ((m = re.exec(line))) {
        if (m.index > last) {
          dom.promptText.appendChild(document.createTextNode(line.slice(last, m.index)));
        }
        var span = document.createElement('span');
        var label = m[0];
        if (label === '小王') span.className = 'card black';
        else if (label === '大王') span.className = 'card red';
        else if (label.indexOf('♥') >= 0 || label.indexOf('♦') >= 0) {
          span.className = 'card red';
        } else {
          span.className = 'card black';
        }
        span.appendChild(document.createTextNode(label));
        dom.promptText.appendChild(span);
        last = m.index + label.length;
      }
      if (last < line.length) {
        dom.promptText.appendChild(document.createTextNode(line.slice(last)));
      }
    });
  }

  function renderPromptArea(state) {
    var display = '';
    if (state.phase === 'playing') {
      display = cachedPrompt;
    } else if (state.phase === 'bidding') {
      display = '复制提示词给外部 AI，测试其斗地主推理能力。确定地主后自动生成提示词。';
    } else if (state.phase === 'redeal') {
      display = '三家均不叫，请重新发牌';
    } else if (state.phase === 'finished') {
      display = cachedPrompt + '\n\n[牌局已结束，对应已结束牌局的最后决策点]';
    }
    renderPromptText(display);
    dom.copyBtn.disabled = !cachedPrompt;
    dom.savePromptBtn.disabled = !cachedPrompt;
  }

  function renderControls(state) {
    var bidding = state.phase === 'bidding';
    var playing = state.phase === 'playing';
    var redeal = state.phase === 'redeal';

    dom.redealBtn.classList.toggle('hidden', !redeal);
    dom.redealBtn.disabled = !redeal;

    ['A', 'B', 'C'].forEach(function (id) {
      var group = dom.handControls[id];
      if (!group) return;
      var isCurrent = state.currentPlayerId === id;
      var bidBox = group.querySelector('.hand-bid-controls');
      var playBox = group.querySelector('.hand-play-controls');
      bidBox.classList.toggle('hidden', !bidding);
      playBox.classList.toggle('hidden', !playing);

      group.classList.toggle('inactive', !isCurrent);
      Array.prototype.forEach.call(
        group.querySelectorAll('button[data-action="bid"]'),
        function (button) {
          var score = Number(button.getAttribute('data-score'));
          button.disabled = !isCurrent || !bidding ||
            (score > 0 && score <= state.highestBid);
        }
      );
      Array.prototype.forEach.call(
        group.querySelectorAll('button[data-action="play"]'),
        function (button) { button.disabled = !isCurrent || !playing; }
      );
      Array.prototype.forEach.call(
        group.querySelectorAll('button[data-action="pass"]'),
        function (button) {
          button.disabled = !isCurrent || !playing || state.lastPlay === null;
        }
      );
      Array.prototype.forEach.call(
        group.querySelectorAll('button[data-action="clear"]'),
        function (button) { button.disabled = !isCurrent || !playing; }
      );
    });

    if (state.phase === 'finished') {
      ['A', 'B', 'C'].forEach(function (id) {
        var group = dom.handControls[id];
        if (!group) return;
        group.classList.add('inactive');
        group.querySelector('.hand-bid-controls').classList.add('hidden');
        group.querySelector('.hand-play-controls').classList.add('hidden');
        Array.prototype.forEach.call(
          group.querySelectorAll('button'),
          function (button) { button.disabled = true; }
        );
      });
      dom.redealBtn.disabled = true;
      dom.redealBtn.classList.add('hidden');
      dom.newGameBtn.disabled = false;
      dom.copyBtn.disabled = !cachedPrompt;
      dom.savePromptBtn.disabled = !cachedPrompt;
      return;
    }

    if (playing && state.lastPlay === null) {
      showHint('自由出牌，必须领出');
    }
  }

  function render(state) {
    currentState = state || Game.getState();
    dom.phaseLabel.textContent = PHASE_TEXT[currentState.phase] || currentState.phase;
    dom.currentLabel.textContent = currentState.currentPlayerId
      ? nameOf(currentState, currentState.currentPlayerId)
      : '无';
    dom.highestBid.textContent = String(currentState.highestBid);
    dom.landlordLabel.textContent = currentState.landlordId
      ? nameOf(currentState, currentState.landlordId)
      : '未定';
    dom.multiplierLabel.textContent = String(currentState.multiplier);
    dom.bottomCards.textContent = currentState.landlordId
      ? fmtCards(currentState.bottomCards)
      : '隐藏';
    dom.lastPlayer.textContent = currentState.lastPlayPlayerId
      ? nameOf(currentState, currentState.lastPlayPlayerId)
      : '无';
    dom.passCount.textContent = String(currentState.passCount);
    if (currentState.lastPlay) {
      clearEl(dom.lastPlay);
      dom.lastPlay.appendChild(document.createTextNode(
        nameOf(currentState, currentState.lastPlay.playerId) +
        '、' + (PATTERN_TEXT[currentState.lastPlay.pattern.type] ||
          currentState.lastPlay.pattern.type) + '、'));
      currentState.lastPlay.cardIds.forEach(function (cardId) {
        dom.lastPlay.appendChild(makeMiniCard(cardId));
      });
    } else {
      dom.lastPlay.textContent = '无';
    }

    ['A', 'B', 'C'].forEach(function (id) { renderHand(id, currentState); });
    renderHistory(currentState);
    renderPromptArea(currentState);
    renderControls(currentState);
    dom.resultDetail.textContent = formatResult(currentState);
  }

  function dispatch(result) {
    if (!result.ok) {
      showError(result.error.code);
      return;
    }
    selectedCards.clear();
    cachedPrompt = DDZ.Prompt.updatePromptCache(cachedPrompt, result.state);
    showHint('');
    render(result.state);
  }

  function copyPrompt() {
    var text = cachedPrompt;
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).catch(fallbackCopy);
    } else {
      fallbackCopy();
    }
  }

  function savePrompt() {
    var text = cachedPrompt;
    if (!text) return;
    var lines = ['# 斗地主推理提示词', '', text];
    if (currentState) {
      lines.push('', '## 状态数据（供导入还原）', '');
      lines.push('```json');
      lines.push(JSON.stringify(currentState, null, 2));
      lines.push('```', '');
    }
    var md = lines.join('\n');
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var ts = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = '斗地主提示词_' + ts.getFullYear() + pad(ts.getMonth() + 1) +
      pad(ts.getDate()) + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) +
      pad(ts.getSeconds()) + '.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showHint('已保存提示词文件（.md）');
  }

  function fallbackCopy() {
    var ta = document.createElement('textarea');
    ta.value = cachedPrompt;
    var prev = document.activeElement;
    document.body.appendChild(ta);
    ta.select();
    var done = false;
    try {
      done = document.execCommand('copy');
    } catch (e) {
      done = false;
    }
    ta.remove();
    if (prev && prev.focus) prev.focus();
    if (!done) {
      selectAllText(dom.promptText);
      showHint('复制失败，请按 Ctrl+C 手动复制');
    }
  }

  var SAVED_KEY = 'ddz-saved-games';
  var MAX_SAVED = 20;

  function readSavedGames() {
    try {
      var raw = localStorage.getItem(SAVED_KEY);
      var list = raw ? JSON.parse(raw) : [];
      return Array.isArray(list) ? list : [];
    } catch (e) {
      return [];
    }
  }

  function writeSavedGames(list) {
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(list));
    } catch (e) {
      showHint('保存失败：浏览器存储不可用');
    }
  }

  function savedLabel(item) {
    var s = item.state;
    var landlord = s.landlordId ? nameOf(s, s.landlordId) : '地主未定';
    var counts = ['A', 'B', 'C'].map(function (id) {
      var p = s.players.filter(function (x) { return x.id === id; })[0];
      return nameOf(s, id) + p.handIds.length;
    }).join('/');
    return '#' + item.no + ' ' + item.time + ' ' + landlord + ' 剩牌 ' + counts;
  }

  function refreshSavedList() {
    clearEl(dom.savedSelect);
    var list = readSavedGames();
    if (!list.length) {
      var empty = document.createElement('option');
      empty.value = '';
      empty.appendChild(document.createTextNode('暂无已保存牌局'));
      dom.savedSelect.appendChild(empty);
    }
    list.forEach(function (item, i) {
      var opt = document.createElement('option');
      opt.value = String(i);
      opt.appendChild(document.createTextNode(savedLabel(item)));
      dom.savedSelect.appendChild(opt);
    });
    dom.replayBtn.disabled = !list.length;
    dom.deleteBtn.disabled = !list.length;
  }

  function saveCurrentGame() {
    if (!currentState) return;
    var list = readSavedGames();
    var item = {
      no: list.length + 1,
      time: new Date().toLocaleString('zh-CN', { hour12: false }),
      state: JSON.parse(JSON.stringify(currentState))
    };
    list.push(item);
    while (list.length > MAX_SAVED) list.shift();
    writeSavedGames(list);
    refreshSavedList();
    showHint('已保存当前牌局（第 ' + item.no + ' 条）');
  }

  function replaySavedGame() {
    var idx = Number(dom.savedSelect.value);
    var list = readSavedGames();
    var item = list[idx];
    if (!item || !item.state) {
      showHint('请先保存并选择要回放的牌局');
      return;
    }
    var result = Game.loadState(item.state);
    if (!result.ok) {
      showHint('回放失败：存档数据无效');
      return;
    }
    selectedCards.clear();
    cachedPrompt = DDZ.Prompt.updatePromptCache('', result.state);
    showHint('');
    render(result.state);
  }

  function deleteSavedGame() {
    var idx = Number(dom.savedSelect.value);
    var list = readSavedGames();
    if (!(idx >= 0) || idx >= list.length) {
      showHint('请先选择要删除的牌局');
      return;
    }
    var item = list[idx];
    if (!window.confirm('确定删除 ' + savedLabel(item) + ' 吗？')) return;
    list.splice(idx, 1);
    list.forEach(function (it, i) { it.no = i + 1; });
    writeSavedGames(list);
    refreshSavedList();
    showHint('已删除牌局（' + item.no + ' 号存档）');
  }

  function buildExportMd(state) {
    var lines = [];
    lines.push('# 斗地主牌局存档', '');
    lines.push('- 导出时间：' + new Date().toLocaleString('zh-CN', { hour12: false }));
    lines.push('- 阶段：' + (PHASE_TEXT[state.phase] || state.phase));
    lines.push('- 地主：' + (state.landlordId ? nameOf(state, state.landlordId) : '未定'));
    ['A', 'B', 'C'].forEach(function (id) {
      var p = state.players.filter(function (x) { return x.id === id; })[0];
      lines.push('- ' + nameOf(state, id) + '：' + roleText(p.role) +
        '，剩 ' + p.handIds.length + ' 张，手牌：' + fmtCards(p.handIds, '、'));
    });
    lines.push('- 当前行动：' + (state.currentPlayerId
      ? nameOf(state, state.currentPlayerId) : '无'));
    lines.push('- 当前倍数：' + state.multiplier);
    lines.push('', '## 状态数据（供导入还原）', '');
    lines.push('```json');
    lines.push(JSON.stringify(state, null, 2));
    lines.push('```', '');
    return lines.join('\n');
  }

  function exportGame() {
    if (!currentState) return;
    var md = buildExportMd(currentState);
    var blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    var ts = new Date();
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    a.download = '斗地主牌局_' + ts.getFullYear() + pad(ts.getMonth() + 1) +
      pad(ts.getDate()) + '_' + pad(ts.getHours()) + pad(ts.getMinutes()) +
      pad(ts.getSeconds()) + '.md';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showHint('已导出牌局文件（.md）');
  }

  function importGame() {
    dom.importFileInput.value = '';
    dom.importFileInput.click();
  }

  function onImportFile(event) {
    var file = event.target.files && event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result);
      if (text.slice(0, 200).indexOf('# 斗地主牌局存档') >= 0) {
        importGameMd(text);
      } else {
        importPromptMd(text);
      }
    };
    reader.readAsText(file, 'utf-8');
  }

  function importGameMd(text) {
    var m = /```json\s*([\s\S]*?)```/.exec(text);
    if (!m) {
      showHint('导入失败：文件中未找到状态数据代码块');
      return;
    }
    var state;
    try {
      state = JSON.parse(m[1]);
    } catch (e) {
      showHint('导入失败：状态数据格式错误');
      return;
    }
    var result = Game.loadState(state);
    if (!result.ok) {
      showHint('导入失败：牌局数据无效');
      return;
    }
    selectedCards.clear();
    cachedPrompt = DDZ.Prompt.updatePromptCache('', result.state);
    render(result.state);
    showHint('已导入牌局');
  }

  function importPromptMd(text) {
    var stateIdx = text.indexOf('## 状态数据（供导入还原）');
    var headText = stateIdx >= 0 ? text.slice(0, stateIdx) : text;
    var body = headText
      .replace(/^# 斗地主推理提示词[ \t]*\r?\n\s*/, '')
      .replace(/\s+$/, '');
    if (!body) {
      showHint('导入失败：提示词内容为空');
      return;
    }
    cachedPrompt = body;
    if (stateIdx < 0) {
      renderPromptText(cachedPrompt);
      dom.copyBtn.disabled = false;
      dom.savePromptBtn.disabled = false;
      showHint('已导入提示词');
      return;
    }
    var m = /```json\s*([\s\S]*?)```/.exec(text.slice(stateIdx));
    if (!m) {
      showHint('导入失败：状态数据格式错误');
      return;
    }
    var state;
    try {
      state = JSON.parse(m[1]);
    } catch (e) {
      showHint('导入失败：状态数据格式错误');
      return;
    }
    var result = Game.loadState(state);
    if (!result.ok) {
      showHint('导入失败：牌局数据无效');
      return;
    }
    selectedCards.clear();
    render(result.state);
    showHint('已导入提示词并恢复牌局');
  }

  function startNewGame() {
    cachedPrompt = '';
    selectedCards.clear();
    dispatch(Game.newGame());
  }

  function doRedeal() {
    cachedPrompt = '';
    selectedCards.clear();
    dispatch(Game.redeal());
  }

  function doBid(score, playerId) {
    if (!currentState || playerId !== currentState.currentPlayerId) return;
    dispatch(Game.bid(playerId, score));
  }

  function doPlay(playerId) {
    if (!currentState || currentState.phase !== 'playing' ||
        playerId !== currentState.currentPlayerId) return;
    dispatch(Game.play(playerId, Array.from(selectedCards)));
  }

  function doPass(playerId) {
    if (!currentState || currentState.phase !== 'playing' ||
        playerId !== currentState.currentPlayerId) return;
    dispatch(Game.pass(playerId));
  }

  function clearSelection(playerId) {
    if (!currentState || playerId !== currentState.currentPlayerId) return;
    selectedCards.clear();
    render(currentState);
  }

  function controlButtonOf(node) {
    while (node && node !== document.body) {
      if (node.getAttribute && node.getAttribute('data-action')) return node;
      node = node.parentNode;
    }
    return null;
  }

  function onControlClick(event) {
    var button = controlButtonOf(event.target);
    if (!button || button.disabled) return;
    var action = button.getAttribute('data-action');
    var playerId = button.getAttribute('data-player');
    var score = Number(button.getAttribute('data-score'));
    if (action === 'bid') doBid(score, playerId);
    else if (action === 'play') doPlay(playerId);
    else if (action === 'pass') doPass(playerId);
    else if (action === 'clear') clearSelection(playerId);
  }

  function bindEvents() {
    dom.newGameBtn.addEventListener('click', startNewGame);
    dom.redealBtn.addEventListener('click', doRedeal);
    document.body.addEventListener('click', onControlClick);
    dom.copyBtn.addEventListener('click', copyPrompt);
    dom.savePromptBtn.addEventListener('click', savePrompt);
    dom.saveBtn.addEventListener('click', saveCurrentGame);
    dom.replayBtn.addEventListener('click', replaySavedGame);
    dom.deleteBtn.addEventListener('click', deleteSavedGame);
    dom.exportBtn.addEventListener('click', exportGame);
    dom.importBtn.addEventListener('click', importGame);
    dom.importFileInput.addEventListener('change', onImportFile);
  }

  function init() {
    if (!assertRequiredDom()) return;
    cacheDom();
    bindEvents();
    refreshSavedList();
    startNewGame();
  }

  DDZ.UI = { init: init };
})(typeof window !== 'undefined' ? window : globalThis);
