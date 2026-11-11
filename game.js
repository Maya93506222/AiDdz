(function (root) {
  'use strict';
  var DDZ = (root.DDZ = root.DDZ || {});
  var Cards = DDZ.Cards;
  var PLAYER_IDS = ['A', 'B', 'C'];
  var PLAYER_NAMES = { A: '甲', B: '乙', C: '丙' };
  var state = null;

  function snapshot() {
    return JSON.parse(JSON.stringify(state));
  }

  function ok(events) {
    return { ok: true, state: snapshot(), events: events };
  }

  function reject(code, message) {
    return {
      ok: false,
      error: { code: code, message: message },
      state: snapshot(),
      events: []
    };
  }

  function getState() {
    return snapshot();
  }

  function append(rec) {
    rec.seq = state.history.length + 1;
    state.history.push(rec);
    return rec;
  }

  function player(id) {
    return state.players.filter(function (p) { return p.id === id; })[0];
  }

  function nextPlayer(id) {
    return PLAYER_IDS[(PLAYER_IDS.indexOf(id) + 1) % 3];
  }

  function ensureNotFinished() {
    if (!state) return reject('INVALID_PHASE', '请先开局');
    if (state.phase === 'finished') return reject('GAME_FINISHED', '牌局已结束');
    return null;
  }

  function loadStateForTest(s) {
    state = JSON.parse(JSON.stringify(s));
    return ok([]);
  }

  function shuffle(deck, random) {
    for (var i = 53; i >= 1; i--) {
      var j = Math.floor(random() * (i + 1));
      var t = deck[i]; deck[i] = deck[j]; deck[j] = t;
    }
    return deck;
  }

  function newGame(random) {
    random = random || Math.random;
    var deck = shuffle(Cards.createDeck(), random);
    var firstIdx = Math.floor(random() * 3);
    var ev = startDealt({
      A: deck.slice(0, 17),
      B: deck.slice(17, 34),
      C: deck.slice(34, 51)
    }, deck.slice(51, 54), PLAYER_IDS[firstIdx]);
    return ok(ev);
  }

  // 用给定的三家手牌、底牌和首位叫分者建立叫分阶段的初始状态，追加 deal 记录。
  // newGame 与导入重演（replay）共用；手牌按点数排序，底牌保持传入顺序。
  function startDealt(rawHands, bottomCards, firstBidderId) {
    var hands = {
      A: Cards.sortCards(rawHands.A),
      B: Cards.sortCards(rawHands.B),
      C: Cards.sortCards(rawHands.C)
    };
    var bottom = bottomCards.slice();
    var players = PLAYER_IDS.map(function (id) {
      return {
        id: id,
        name: PLAYER_NAMES[id],
        handIds: hands[id].slice(),
        role: null,
        bid: null,
        score: 0
      };
    });
    state = {
      phase: 'bidding',
      players: players,
      bottomCards: bottom,
      firstBidderId: firstBidderId,
      highestBid: 0,
      highestBidderId: null,
      bidCount: 0,
      landlordId: null,
      currentPlayerId: firstBidderId,
      lastPlay: null,
      lastPlayPlayerId: null,
      passCount: 0,
      history: [],
      multiplier: 1,
      successfulPlays: { A: 0, B: 0, C: 0 },
      winnerSide: null,
      result: null
    };
    return [append({
      type: 'deal',
      firstBidderId: state.firstBidderId,
      initialHands: {
        A: hands.A.slice(),
        B: hands.B.slice(),
        C: hands.C.slice()
      }
    })];
  }

  function finishBidding(landlordId) {
    state.landlordId = landlordId;
    state.phase = 'playing';
    state.currentPlayerId = landlordId;
    var landlordPlayer = player(landlordId);
    landlordPlayer.handIds = Cards.sortCards(
      landlordPlayer.handIds.concat(state.bottomCards)
    );
    PLAYER_IDS.forEach(function (id) {
      player(id).role = id === landlordId ? 'landlord' : 'farmer';
    });
    return [append({
      type: 'landlord',
      playerId: landlordId,
      bottomCards: state.bottomCards.slice(),
      handAfter: landlordPlayer.handIds.slice()
    })];
  }

  function bid(playerId, score) {
    var fin = ensureNotFinished(); if (fin) return fin;
    if (state.phase !== 'bidding') return reject('INVALID_PHASE', '当前不是叫分阶段');
    if (playerId !== state.currentPlayerId) return reject('NOT_CURRENT_PLAYER', '不是当前行动玩家');
    if (![0, 1, 2, 3].includes(score)) return reject('INVALID_BID', '叫分必须是 0/1/2/3');
    if (score > 0 && score <= state.highestBid) return reject('BID_NOT_HIGHER', '叫分必须高于当前最高分');

    var startLen = state.history.length;
    state.bidCount++;
    player(playerId).bid = score;
    if (score > state.highestBid) {
      state.highestBid = score;
      state.highestBidderId = playerId;
    }
    append({
      type: 'bid',
      playerId: playerId,
      score: score,
      highestBid: state.highestBid
    });

    if (score === 3) {
      finishBidding(playerId);
    } else if (state.bidCount === 3) {
      if (state.highestBid > 0) {
        finishBidding(state.highestBidderId);
      } else {
        state.phase = 'redeal';
        state.currentPlayerId = null;
      }
    } else {
      state.currentPlayerId = PLAYER_IDS[
        (PLAYER_IDS.indexOf(state.firstBidderId) + state.bidCount) % 3
      ];
    }
    return ok(state.history.slice(startLen));
  }

  function redeal(random) {
    var fin = ensureNotFinished(); if (fin) return fin;
    if (state.phase !== 'redeal') return reject('INVALID_PHASE', '当前不能重新发牌');
    return newGame(random);
  }

  function bumpMultiplier(reason, sourceSeq) {
    var before = state.multiplier;
    state.multiplier *= 2;
    return append({
      type: 'multiplier',
      reason: reason,
      before: before,
      after: state.multiplier,
      sourceSeq: sourceSeq
    });
  }

  function play(playerId, cardIds) {
    var fin = ensureNotFinished(); if (fin) return fin;
    if (state.phase !== 'playing') return reject('INVALID_PHASE', '当前不是出牌阶段');
    if (playerId !== state.currentPlayerId) return reject('NOT_CURRENT_PLAYER', '不是当前行动玩家');
    if (!Array.isArray(cardIds) || !cardIds.length) return reject('EMPTY_SELECTION', '请先选择手牌');
    if (new Set(cardIds).size !== cardIds.length) return reject('DUPLICATE_CARD', '存在重复牌');

    var hand = player(playerId).handIds;
    if (!cardIds.every(function (id) { return hand.indexOf(id) >= 0; })) {
      return reject('CARD_NOT_OWNED', '选择了不属于当前玩家的牌');
    }

    var pattern;
    if (state.lastPlay === null) {
      pattern = Cards.primaryPattern(cardIds);
    } else {
      pattern = Cards.selectBeatingPattern(cardIds, state.lastPlay.pattern);
    }
    if (!pattern) {
      return state.lastPlay
        ? reject('CANNOT_BEAT', '不能压过当前有效牌')
        : reject('INVALID_PATTERN', '非法牌型');
    }

    var startLen = state.history.length;
    player(playerId).handIds = hand.filter(function (id) {
      return cardIds.indexOf(id) < 0;
    });
    state.successfulPlays[playerId]++;
    state.lastPlay = {
      playerId: playerId,
      cardIds: Cards.sortCards(cardIds),
      pattern: pattern
    };
    state.lastPlayPlayerId = playerId;
    state.passCount = 0;
    append({
      type: 'play',
      playerId: playerId,
      cardIds: Cards.sortCards(cardIds),
      pattern: pattern,
      remainingCount: player(playerId).handIds.length
    });
    if (pattern.type === 'bomb' || pattern.type === 'rocket') {
      bumpMultiplier(pattern.type === 'rocket' ? 'rocket' : 'bomb', state.history.length);
    }
    if (player(playerId).handIds.length === 0) {
      finish(playerId);
    } else {
      state.currentPlayerId = nextPlayer(playerId);
    }
    return ok(state.history.slice(startLen));
  }

  function pass(playerId) {
    var fin = ensureNotFinished(); if (fin) return fin;
    if (state.phase !== 'playing') return reject('INVALID_PHASE', '当前不是出牌阶段');
    if (playerId !== state.currentPlayerId) return reject('NOT_CURRENT_PLAYER', '不是当前行动玩家');
    if (state.lastPlay === null) return reject('CANNOT_PASS_FREE', '自由出牌时必须领出');

    var startLen = state.history.length;
    state.passCount++;
    append({ type: 'pass', playerId: playerId, passCount: state.passCount });
    if (state.passCount === 2) {
      var owner = state.lastPlayPlayerId;
      state.lastPlay = null;
      state.passCount = 0;
      state.currentPlayerId = owner;
      append({ type: 'new_round', playerId: owner });
    } else {
      state.currentPlayerId = nextPlayer(playerId);
    }
    return ok(state.history.slice(startLen));
  }

  function finish(winnerId) {
    var landlord = state.landlordId;
    var lastPlaySeq = state.history
      .filter(function (h) { return h.type === 'play'; })
      .slice(-1)[0].seq;
    state.winnerSide = winnerId === landlord ? 'landlord' : 'farmers';

    if (state.winnerSide === 'landlord' &&
        PLAYER_IDS.filter(function (id) { return id !== landlord; })
          .every(function (id) { return state.successfulPlays[id] === 0; })) {
      bumpMultiplier('spring', lastPlaySeq);
    }
    if (state.winnerSide === 'farmers' && state.successfulPlays[landlord] === 1) {
      bumpMultiplier('anti_spring', lastPlaySeq);
    }

    var B = state.highestBid;
    var M = state.multiplier;
    var scores = { A: 0, B: 0, C: 0 };
    PLAYER_IDS.forEach(function (id) {
      var isLandlord = id === landlord;
      var score = state.winnerSide === 'landlord'
        ? (isLandlord ? 2 * B * M : -B * M)
        : (isLandlord ? -2 * B * M : B * M);
      scores[id] = score;
      player(id).score = score;
    });

    state.phase = 'finished';
    state.currentPlayerId = null;
    state.result = {
      winnerSide: state.winnerSide,
      baseBid: B,
      multiplier: M,
      scores: scores,
      multiplierEvents: state.history
        .filter(function (h) { return h.type === 'multiplier'; })
        .map(function (h) {
          return {
            seq: h.seq,
            reason: h.reason,
            before: h.before,
            after: h.after,
            sourceSeq: h.sourceSeq
          };
        })
    };
    append({
      type: 'finish',
      winnerSide: state.winnerSide,
      baseBid: B,
      multiplier: M,
      scores: Object.assign({}, scores)
    });
  }

  // ---------------------------------------------------------------------------
  // 导入校验：按文件里的记录从发牌开始用本模块的规则重演一遍，
  // 每一步都必须被规则接受，重演产生的记录与最终局面必须和文件一致。
  // 只有牌面数组（手牌、底牌、出牌等）的排列顺序不参与比较。
  // ---------------------------------------------------------------------------

  var DECK_IDS = {};
  Cards.createDeck().forEach(function (id) { DECK_IDS[id] = true; });

  var EVENT_TEXT = {
    deal: '发牌', bid: '叫分', landlord: '确定地主', play: '出牌', pass: '不要',
    new_round: '新一轮', multiplier: '倍数变化', finish: '结束'
  };
  var PLAYER_FIELDS = [
    ['id', '编号'], ['name', '名称'], ['handIds', '手牌'],
    ['role', '身份'], ['bid', '叫分'], ['score', '得分']
  ];
  var TOP_FIELDS = [
    ['phase', '阶段'], ['firstBidderId', '首位叫分者'], ['highestBid', '最高叫分'],
    ['highestBidderId', '最高叫分者'], ['bidCount', '叫分人数'], ['landlordId', '地主'],
    ['currentPlayerId', '当前行动玩家'], ['bottomCards', '底牌'],
    ['lastPlay', '当前有效出牌'], ['lastPlayPlayerId', '最后出牌者'],
    ['passCount', '连续不要次数'], ['multiplier', '倍数'],
    ['successfulPlays', '成功出牌次数'], ['winnerSide', '胜负'], ['result', '结算结果']
  ];

  function isCardArray(v) {
    return Array.isArray(v) && v.length > 0 && v.every(function (x) {
      return typeof x === 'string' && DECK_IDS[x] === true;
    });
  }

  // 规范化：对象键排序，牌面数组按点数排序，其余数组保持原有顺序。
  function canonical(v) {
    if (Array.isArray(v)) return isCardArray(v) ? Cards.sortCards(v) : v.map(canonical);
    if (v && typeof v === 'object') {
      var out = {};
      Object.keys(v).sort().forEach(function (k) { out[k] = canonical(v[k]); });
      return out;
    }
    return v;
  }

  function sameData(a, b) {
    return JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));
  }

  function recordLabel(index, h) {
    var who = h && PLAYER_NAMES[h.playerId] ? PLAYER_NAMES[h.playerId] + ' ' : '';
    var what = (h && EVENT_TEXT[h.type]) || '未知记录';
    return '第 ' + (index + 1) + ' 条记录（' + who + what + '）';
  }

  // 把一组牌登记到 seen；出现不存在或重复的牌时返回原因。
  function collectCards(ids, seen, where) {
    for (var i = 0; i < ids.length; i++) {
      var id = ids[i];
      if (typeof id !== 'string' || DECK_IDS[id] !== true) {
        return where + '里有不存在的牌：' + String(id).slice(0, 12);
      }
      if (seen[id]) return where + '里的' + Cards.cardLabel(id) + '与其他位置重复';
      seen[id] = true;
    }
    return null;
  }

  // 重演之前的结构检查：发牌记录、三家 17 张、底牌 3 张、合计 54 张不重复。
  function checkDealData(src) {
    if (!src || typeof src !== 'object' || Array.isArray(src)) return '牌局数据不是有效的对象';
    if (!Array.isArray(src.history) || !src.history.length) return '缺少出牌记录';
    var deal = src.history[0];
    if (!deal || deal.type !== 'deal') return '第 1 条记录应为发牌';
    if (PLAYER_IDS.indexOf(deal.firstBidderId) < 0) return '发牌记录里的首位叫分者无效';
    var hands = deal.initialHands;
    if (!hands || typeof hands !== 'object') return '发牌记录缺少三家初始手牌';
    var seen = {};
    for (var i = 0; i < PLAYER_IDS.length; i++) {
      var id = PLAYER_IDS[i];
      var hand = hands[id];
      var count = Array.isArray(hand) ? hand.length : 0;
      if (count !== 17) {
        return '发牌记录里' + PLAYER_NAMES[id] + '的初始手牌应为 17 张，实际 ' + count + ' 张';
      }
      var err = collectCards(hand, seen, PLAYER_NAMES[id] + '的初始手牌');
      if (err) return err;
    }
    var bottomCount = Array.isArray(src.bottomCards) ? src.bottomCards.length : 0;
    if (bottomCount !== 3) return '底牌应为 3 张，实际 ' + bottomCount + ' 张';
    return collectCards(src.bottomCards, seen, '底牌');
  }

  // 重演完成后，逐项比较文件里的最终局面与重演结果。
  function compareFinal(src) {
    if (!Array.isArray(src.players) || src.players.length !== 3) return '玩家数据应为 3 家';
    for (var p = 0; p < 3; p++) {
      var fp = src.players[p];
      var rp = state.players[p];
      if (!fp || typeof fp !== 'object') return '第 ' + (p + 1) + ' 家的玩家数据无效';
      for (var f = 0; f < PLAYER_FIELDS.length; f++) {
        var key = PLAYER_FIELDS[f][0];
        if (!sameData(fp[key], rp[key])) {
          return '文件里' + rp.name + '的' + PLAYER_FIELDS[f][1] + '与按记录推算的不一致';
        }
      }
    }
    for (var t = 0; t < TOP_FIELDS.length; t++) {
      if (!sameData(src[TOP_FIELDS[t][0]], state[TOP_FIELDS[t][0]])) {
        return '文件里的' + TOP_FIELDS[t][1] + '与按记录推算的不一致';
      }
    }
    if (!sameData(src, state)) return '文件里有多余或缺失的字段';
    return null;
  }

  // 在模块状态上重演；调用方负责事先保存、事后恢复原来的 state。
  // 成功返回 { state: 重演得到的快照 }，失败返回 { message: 原因 }。
  function replay(src) {
    var err = checkDealData(src);
    if (err) return { message: err };
    var file = src.history;
    startDealt(file[0].initialHands, src.bottomCards, file[0].firstBidderId);
    if (!sameData(state.history[0], file[0])) {
      return { message: recordLabel(0, file[0]) + '与按规则推算的结果不一致' };
    }
    var i = 1;
    while (i < file.length) {
      var h = file[i];
      var r;
      if (h && h.type === 'bid') r = bid(h.playerId, h.score);
      else if (h && h.type === 'play') r = play(h.playerId, h.cardIds);
      else if (h && h.type === 'pass') r = pass(h.playerId);
      else return { message: recordLabel(i, h) + '与按规则推算的结果不一致' };
      if (!r.ok) return { message: recordLabel(i, h) + '不合规则：' + r.error.message };
      for (var k = 0; k < r.events.length; k++) {
        var j = i + k;
        if (j >= file.length) {
          return {
            message: '第 ' + (j + 1) + ' 条记录缺失：按规则此处应有「' +
              EVENT_TEXT[r.events[k].type] + '」'
          };
        }
        if (!sameData(r.events[k], file[j])) {
          return { message: recordLabel(j, file[j]) + '与按规则推算的结果不一致' };
        }
      }
      i += r.events.length;
    }
    err = compareFinal(src);
    if (err) return { message: err };
    return { state: snapshot() };
  }

  // 导入与回放存档的入口：校验通过才载入重演得到的规范状态；
  // 校验失败（含任何异常）时返回 INVALID_SAVE，内部状态保持调用前的样子
  // （tests.js「Game: 导入校验」用例 4–8 逐条断言 getState() 不变；去掉下面的 finally 会转红）。
  function loadState(src) {
    var saved = state;
    var outcome;
    try {
      outcome = replay(src);
    } catch (e) {
      outcome = { message: '牌局数据格式不对，无法按规则重演' };
    } finally {
      state = saved;
    }
    if (!outcome.state) return reject('INVALID_SAVE', outcome.message);
    state = outcome.state;
    return ok([]);
  }

  DDZ.Game = DDZ.Game || {};
  // 测试专用：不校验，直接注入任意状态（夹具依赖它构造边界局面）。
  if (typeof window === 'undefined') {
    DDZ.Game.__loadStateForTest = loadStateForTest;
  }
  Object.assign(DDZ.Game, {
    newGame: newGame,
    getState: getState,
    bid: bid,
    redeal: redeal,
    play: play,
    pass: pass,
    loadState: loadState
  });
})(typeof window !== 'undefined' ? window : globalThis);
