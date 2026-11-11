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
    var hands = {
      A: Cards.sortCards(deck.slice(0, 17)),
      B: Cards.sortCards(deck.slice(17, 34)),
      C: Cards.sortCards(deck.slice(34, 51))
    };
    var bottom = deck.slice(51, 54);
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
      firstBidderId: PLAYER_IDS[firstIdx],
      highestBid: 0,
      highestBidderId: null,
      bidCount: 0,
      landlordId: null,
      currentPlayerId: PLAYER_IDS[firstIdx],
      lastPlay: null,
      lastPlayPlayerId: null,
      passCount: 0,
      history: [],
      multiplier: 1,
      successfulPlays: { A: 0, B: 0, C: 0 },
      winnerSide: null,
      result: null
    };
    var ev = [append({
      type: 'deal',
      firstBidderId: state.firstBidderId,
      initialHands: {
        A: hands.A.slice(),
        B: hands.B.slice(),
        C: hands.C.slice()
      }
    })];
    return ok(ev);
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

  DDZ.Game = DDZ.Game || {};
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
    loadState: loadStateForTest
  });
})(typeof window !== 'undefined' ? window : globalThis);
