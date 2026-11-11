const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
require('./cards.js');
require('./game.js');
require('./prompt.js');
const DDZ = globalThis.DDZ;
const { Cards, Game, Prompt } = DDZ;

function patternTypes(cardIds) {
  return Cards.analyzeCards(cardIds).map(function (pattern) { return pattern.type; });
}

function randomForDeck(desired, firstIdx) {
  var arr = Cards.createDeck();
  var seq = [];
  for (var i = 53; i >= 1; i--) {
    var p = arr.indexOf(desired[i]);
    if (p < 0 || p > i) throw new Error('desired 牌堆不是 createDeck 的排列');
    seq.push((p + 0.5) / (i + 1));
    var t = arr[i]; arr[i] = arr[p]; arr[p] = t;
  }
  seq.push((firstIdx + 0.5) / 3);
  var k = 0;
  return function () { return seq[k++]; };
}

function deepMerge(target, src) {
  Object.keys(src).forEach(function (k) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) {
      target[k] = deepMerge(target[k] || {}, src[k]);
    } else {
      target[k] = src[k];
    }
  });
  return target;
}

function makeBaseState() {
  Game.newGame(function () { return 0; });
  return Game.getState();
}

function makeTestState(overrides) {
  var s = deepMerge(makeBaseState(), overrides || {});
  Game.__loadStateForTest(s);
  return Game.getState();
}

function P(id, handIds, role, bid) {
  return {
    id: id,
    name: { A: '甲', B: '乙', C: '丙' }[id],
    handIds: handIds.slice(),
    role: role,
    bid: bid,
    score: 0
  };
}

function makeHistory(a, b, c, bottom, landlordId) {
  return [
    {
      seq: 1, type: 'deal', firstBidderId: 'A',
      initialHands: { A: a.slice(), B: b.slice(), C: c.slice() }
    },
    { seq: 2, type: 'bid', playerId: landlordId, score: 3, highestBid: 3 },
    {
      seq: 3, type: 'landlord', playerId: landlordId,
      bottomCards: bottom.slice(), handAfter: a.slice().concat(bottom.slice())
    }
  ];
}

function playingFixture(overrides) {
  var a = ['S3', 'H3', 'C3', 'D3', 'S4'];
  var b = ['S5', 'H5', 'C5', 'D5', 'S6'];
  var c = ['S7', 'H7', 'C7', 'D7', 'S8'];
  var bottom = ['S2', 'H2', 'C2'];
  var base = {
    phase: 'playing', bottomCards: bottom.slice(),
    firstBidderId: 'A', highestBid: 3, highestBidderId: 'A', bidCount: 3,
    landlordId: 'A', currentPlayerId: 'A',
    lastPlay: null, lastPlayPlayerId: null, passCount: 0,
    history: makeHistory(a, b, c, bottom, 'A'),
    multiplier: 1, successfulPlays: { A: 0, B: 0, C: 0 },
    winnerSide: null, result: null,
    players: [P('A', a, 'landlord', 3), P('B', b, 'farmer', 0), P('C', c, 'farmer', 0)]
  };
  return makeTestState(deepMerge(base, overrides || {}));
}

function followFixture(overrides) {
  var a = ['S3', 'H3', 'C3', 'D3', 'S4'];
  var b = ['H4', 'C4', 'D4', 'S5', 'H5'];
  var c = ['S6', 'H6', 'C6', 'D6', 'S7'];
  var bottom = ['S2', 'H2', 'C2'];
  var base = {
    currentPlayerId: 'A', lastPlayPlayerId: 'C', passCount: 0,
    lastPlay: { playerId: 'C', cardIds: ['S3'], pattern: Cards.primaryPattern(['S3']) },
    history: makeHistory(a, b, c, bottom, 'A'),
    players: [P('A', a, 'landlord', 3), P('B', b, 'farmer', 0), P('C', c, 'farmer', 0)]
  };
  return playingFixture(deepMerge(base, overrides || {}));
}

function multiBombFixture() {
  var a = ['S5', 'H5', 'C5', 'D5', 'S6', 'H6', 'C6', 'D6'];
  var b = ['S9']; var c = ['S10']; var bottom = ['S2', 'H2', 'C2'];
  return playingFixture({
    currentPlayerId: 'A', lastPlay: null, lastPlayPlayerId: null,
    passCount: 0, multiplier: 1, successfulPlays: { A: 1, B: 1, C: 0 },
    history: makeHistory(a, b, c, bottom, 'A'),
    players: [P('A', a, 'landlord', 3), P('B', b, 'farmer', 0), P('C', c, 'farmer', 0)]
  });
}

function bombRocketFixture() {
  var a = ['S5', 'H5', 'C5', 'D5', 'XJ', 'BJ'];
  var b = ['S9']; var c = ['S10']; var bottom = ['S2', 'H2', 'C2'];
  return playingFixture({
    currentPlayerId: 'A', lastPlay: null, lastPlayPlayerId: null,
    passCount: 0, multiplier: 1, successfulPlays: { A: 1, B: 1, C: 0 },
    history: makeHistory(a, b, c, bottom, 'A'),
    players: [P('A', a, 'landlord', 3), P('B', b, 'farmer', 0), P('C', c, 'farmer', 0)]
  });
}

function lastHandFixture(opts) {
  opts = opts || {};
  var winner = opts.winner || 'A';
  var lastCards = opts.lastCards || ['S3'];
  var placeholders = { A: 'S9', B: 'H9', C: 'D9' };
  var hands = {};
  ['A', 'B', 'C'].forEach(function (id) {
    hands[id] = id === winner ? lastCards.slice() : [placeholders[id]];
  });
  var successful = winner === 'A' ? { A: 1, B: 1, C: 0 } : { A: 2, B: 0, C: 0 };
  if (opts.successfulPlays) successful = opts.successfulPlays;
  var bottom = ['S2', 'H2', 'C2'];
  return playingFixture({
    currentPlayerId: winner, lastPlay: null, lastPlayPlayerId: null,
    passCount: 0, successfulPlays: successful,
    multiplier: opts.multiplier || 1,
    history: makeHistory(hands.A, hands.B, hands.C, bottom, 'A'),
    players: [
      P('A', hands.A, 'landlord', 3),
      P('B', hands.B, 'farmer', 0),
      P('C', hands.C, 'farmer', 0)
    ]
  });
}

test('Game: 发牌 用例 1 基本发牌', () => {
  const result = Game.newGame(function () { return 0; });
  assert.strictEqual(result.ok, true);
  const state = result.state;
  assert.strictEqual(state.phase, 'bidding');
  assert.strictEqual(state.players.length, 3);
  state.players.forEach(function (p) {
    assert.strictEqual(p.handIds.length, 17);
  });
  assert.strictEqual(state.bottomCards.length, 3);
  const all = state.players.reduce(function (acc, p) {
    return acc.concat(p.handIds);
  }, []).concat(state.bottomCards);
  assert.strictEqual(all.length, 54);
  assert.strictEqual(new Set(all).size, 54);
});

test('Game: 发牌 用例 2 固定随机源确定首位叫分者', () => {
  const random = randomForDeck(Cards.createDeck(), 2);
  const state = Game.newGame(random).state;
  assert.strictEqual(state.firstBidderId, 'C');
  assert.strictEqual(state.currentPlayerId, 'C');
});

test('Game: 发牌 用例 3 history 仅含 deal', () => {
  const state = Game.newGame(randomForDeck(Cards.createDeck(), 0)).state;
  assert.strictEqual(state.history.length, 1);
  assert.strictEqual(state.history[0].type, 'deal');
  assert.strictEqual(state.history[0].firstBidderId, 'A');
  assert.strictEqual(state.history[0].initialHands.A.length, 17);
  assert.strictEqual(state.history[0].initialHands.B.length, 17);
  assert.strictEqual(state.history[0].initialHands.C.length, 17);
  assert.ok(!Object.prototype.hasOwnProperty.call(state.history[0], 'bottomCards'));
});

test('Game: 发牌 用例 4 状态快照深拷贝', () => {
  const result = Game.newGame(function () { return 0; });
  result.state.players[0].handIds.push('BAD');
  const snapshot = Game.getState();
  assert.ok(!snapshot.players[0].handIds.includes('BAD'));
  snapshot.bottomCards.push('BAD2');
  assert.ok(!Game.getState().bottomCards.includes('BAD2'));
});

test('Game: 发牌 用例 5 events 与 history 一致', () => {
  const result = Game.newGame(function () { return 0; });
  assert.deepStrictEqual(result.events, result.state.history);
  assert.strictEqual(result.events[0].seq, 1);
});

test('Game: 发牌 用例 6 初始字段', () => {
  const state = Game.newGame(function () { return 0; }).state;
  assert.strictEqual(state.highestBid, 0);
  assert.strictEqual(state.landlordId, null);
  assert.strictEqual(state.multiplier, 1);
  assert.deepStrictEqual(state.successfulPlays, { A: 0, B: 0, C: 0 });
  assert.strictEqual(state.result, null);
  assert.strictEqual(state.lastPlay, null);
  assert.strictEqual(state.passCount, 0);
});

function biddingState(overrides) {
  var base = {
    phase: 'bidding',
    firstBidderId: 'A',
    currentPlayerId: 'A',
    bidCount: 0,
    highestBid: 0,
    highestBidderId: null,
    landlordId: null
  };
  return makeTestState(deepMerge(base, overrides || {}));
}

function assertUnchanged(result, before, code) {
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error.code, code);
  assert.deepStrictEqual(result.events, []);
  assert.deepStrictEqual(result.state, before);
  assert.deepStrictEqual(Game.getState(), before);
}

test('Game: 叫分 用例 1 非法叫分拒绝且不改变状态', () => {
  const lower = biddingState({ highestBid: 1, highestBidderId: 'A', bidCount: 1, currentPlayerId: 'B' });
  const beforeLower = Game.getState();
  assertUnchanged(Game.bid('B', 1), beforeLower, 'BID_NOT_HIGHER');

  const zeroState = biddingState({ highestBid: 1, highestBidderId: 'A', bidCount: 1, currentPlayerId: 'B' });
  const zeroResult = Game.bid('B', 0);
  assert.strictEqual(zeroResult.ok, true);
  assert.strictEqual(zeroResult.state.currentPlayerId, 'C');

  const score = biddingState();
  const beforeScore = Game.getState();
  assertUnchanged(Game.bid('A', 4), beforeScore, 'INVALID_BID');

  const wrongPlayer = biddingState({ currentPlayerId: 'B' });
  const beforeWrong = Game.getState();
  assertUnchanged(Game.bid('A', 2), beforeWrong, 'NOT_CURRENT_PLAYER');

  const wrongPhase = makeTestState({ phase: 'playing' });
  const beforePhase = Game.getState();
  assertUnchanged(Game.bid('A', 1), beforePhase, 'INVALID_PHASE');
});

test('Game: 叫分 用例 2 叫 3 分立即成为地主', () => {
  biddingState();
  const result = Game.bid('A', 3);
  assert.strictEqual(result.ok, true);
  const state = result.state;
  assert.strictEqual(state.phase, 'playing');
  assert.strictEqual(state.landlordId, 'A');
  assert.strictEqual(state.highestBidderId, 'A');
  assert.strictEqual(state.currentPlayerId, 'A');
  assert.strictEqual(state.bidCount, 1);
  assert.strictEqual(state.players[0].handIds.length, 20);
  const landlordEvent = state.history.filter(function (h) { return h.type === 'landlord'; })[0];
  assert.ok(landlordEvent);
  assert.deepStrictEqual(landlordEvent.bottomCards, state.bottomCards);
  assert.strictEqual(landlordEvent.handAfter.length, 20);
});

test('Game: 叫分 用例 3 三家各叫一次后最高分者成为地主', () => {
  biddingState();
  Game.bid('A', 1);
  Game.bid('B', 2);
  const result = Game.bid('C', 0);
  assert.strictEqual(result.ok, true);
  const state = result.state;
  assert.strictEqual(state.phase, 'playing');
  assert.strictEqual(state.landlordId, 'B');
  assert.strictEqual(state.highestBidderId, 'B');
  assert.strictEqual(state.highestBid, 2);
  assert.strictEqual(state.currentPlayerId, 'B');
});

test('Game: 叫分 用例 4 三家均不叫进入 redeal', () => {
  biddingState();
  Game.bid('A', 0);
  Game.bid('B', 0);
  const result = Game.bid('C', 0);
  assert.strictEqual(result.ok, true);
  const state = result.state;
  assert.strictEqual(state.phase, 'redeal');
  assert.strictEqual(state.currentPlayerId, null);
  assert.strictEqual(state.landlordId, null);
  state.players.forEach(function (p) {
    assert.strictEqual(p.handIds.length, 17);
  });
});

test('Game: 叫分 用例 5 redeal 阶段限制', () => {
  makeTestState({ phase: 'playing', currentPlayerId: 'A' });
  const before = Game.getState();
  assertUnchanged(Game.redeal(), before, 'INVALID_PHASE');

  makeTestState({ phase: 'redeal', currentPlayerId: null });
  const redealResult = Game.redeal(function () { return 0; });
  assert.strictEqual(redealResult.ok, true);

  makeTestState({ phase: 'redeal', currentPlayerId: null });
  const newGameResult = Game.newGame(function () { return 0; });
  assert.strictEqual(newGameResult.ok, true);
});

test('Game: 叫分 用例 6 redeal 后状态完整重置', () => {
  makeTestState({ phase: 'redeal', currentPlayerId: null });
  const result = Game.redeal(function () { return 0; });
  assert.strictEqual(result.ok, true);
  const state = result.state;
  assert.strictEqual(state.phase, 'bidding');
  assert.strictEqual(state.history.length, 1);
  assert.strictEqual(state.history[0].type, 'deal');
  assert.strictEqual(state.bidCount, 0);
  assert.strictEqual(state.highestBid, 0);
  assert.strictEqual(state.landlordId, null);
  state.players.forEach(function (p) {
    assert.strictEqual(p.handIds.length, 17);
  });
});

test('Game: 叫分 用例 7 bid 与 landlord 历史顺序', () => {
  biddingState();
  Game.bid('A', 1);
  Game.bid('B', 2);
  Game.bid('C', 0);
  const history = Game.getState().history;
  const types = history.map(function (h) { return h.type; });
  assert.deepStrictEqual(types, ['deal', 'bid', 'bid', 'bid', 'landlord']);
  const lastBid = history.filter(function (h) { return h.type === 'bid'; }).slice(-1)[0];
  const landlord = history.filter(function (h) { return h.type === 'landlord'; })[0];
  assert.strictEqual(landlord.seq, lastBid.seq + 1);
  assert.strictEqual(lastBid.playerId, 'C');
  assert.strictEqual(lastBid.score, 0);
  assert.strictEqual(lastBid.highestBid, 2);
});

test('Game: 出牌 用例 1 自由出牌不能不要', () => {
  playingFixture();
  const before = Game.getState();
  assertUnchanged(Game.pass('A'), before, 'CANNOT_PASS_FREE');

  followFixture();
  const result = Game.pass('A');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state.currentPlayerId, 'B');
  assert.strictEqual(result.state.passCount, 1);
});

test('Game: 出牌 用例 2 非法出牌拒绝且不改变状态', () => {
  playingFixture();
  const beforeEmpty = Game.getState();
  assertUnchanged(Game.play('A', []), beforeEmpty, 'EMPTY_SELECTION');

  playingFixture();
  const beforeDuplicate = Game.getState();
  assertUnchanged(Game.play('A', ['S3', 'S3']), beforeDuplicate, 'DUPLICATE_CARD');

  playingFixture();
  const beforeNotOwned = Game.getState();
  assertUnchanged(Game.play('A', ['S9']), beforeNotOwned, 'CARD_NOT_OWNED');

  playingFixture();
  const beforeInvalid = Game.getState();
  assertUnchanged(Game.play('A', ['S3', 'S4']), beforeInvalid, 'INVALID_PATTERN');

  followFixture();
  const beforeCannotBeat = Game.getState();
  assertUnchanged(Game.play('A', ['S3']), beforeCannotBeat, 'CANNOT_BEAT');
});

test('Game: 出牌 用例 3 有效出牌状态迁移', () => {
  playingFixture();
  const result = Game.play('A', ['S3']);
  assert.strictEqual(result.ok, true);
  const state = result.state;
  const handA = state.players.filter(function (p) { return p.id === 'A'; })[0].handIds;
  assert.strictEqual(handA.length, 4);
  assert.ok(!handA.includes('S3'));
  const playEvent = state.history.slice(-1)[0];
  assert.strictEqual(playEvent.type, 'play');
  assert.strictEqual(playEvent.pattern.type, 'single');
  assert.strictEqual(playEvent.remainingCount, 4);
  assert.strictEqual(state.successfulPlays.A, 1);
  assert.strictEqual(state.passCount, 0);
  assert.strictEqual(state.currentPlayerId, 'B');
});

test('Game: 出牌 用例 4 跟牌写入 selectBeatingPattern 解释', () => {
  followFixture();
  const result = Game.play('A', ['S4']);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state.lastPlay.pattern.type, 'single');
  assert.strictEqual(result.state.lastPlay.pattern.rank, 4);
  assert.deepStrictEqual(result.state.lastPlay.cardIds, ['S4']);
});

test('Game: 出牌 用例 5 一家不要后下家出牌重置 passCount', () => {
  followFixture();
  Game.pass('A');
  const result = Game.play('B', ['S5']);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state.passCount, 0);
});

test('Game: 出牌 用例 6 连续两家不要恢复自由出牌权', () => {
  followFixture();
  Game.pass('A');
  const result = Game.pass('B');
  assert.strictEqual(result.ok, true);
  const state = result.state;
  assert.strictEqual(state.lastPlay, null);
  assert.strictEqual(state.passCount, 0);
  assert.strictEqual(state.currentPlayerId, 'C');
  assert.deepStrictEqual(
    state.history.slice(-3).map(function (h) { return h.type; }),
    ['pass', 'pass', 'new_round']
  );
});

test('Game: 出牌 用例 7 play 历史写入实际解释对象', () => {
  playingFixture();
  const result = Game.play('A', ['S3', 'H3', 'C3', 'S4']);
  assert.strictEqual(result.ok, true);
  const playEvent = result.state.history.slice(-1)[0];
  assert.ok(playEvent.pattern);
  assert.strictEqual(playEvent.pattern.type, 'triple_single');
  assert.deepStrictEqual(result.state.lastPlay.pattern, playEvent.pattern);
});

test('Game: 计分 用例 1 地主胜与农民胜及结束后命令', () => {
  lastHandFixture({ winner: 'A', lastCards: ['S3'] });
  const landlordWin = Game.play('A', ['S3']);
  assert.strictEqual(landlordWin.ok, true);
  assert.strictEqual(landlordWin.state.phase, 'finished');
  assert.strictEqual(landlordWin.state.currentPlayerId, null);
  assert.strictEqual(landlordWin.state.winnerSide, 'landlord');
  assert.strictEqual(Game.bid('A', 1).error.code, 'GAME_FINISHED');
  assert.strictEqual(Game.play('A', ['S9']).error.code, 'GAME_FINISHED');
  assert.strictEqual(Game.pass('A').error.code, 'GAME_FINISHED');
  assert.strictEqual(Game.redeal().error.code, 'GAME_FINISHED');

  lastHandFixture({ winner: 'B', lastCards: ['S3'] });
  const farmerWin = Game.play('B', ['S3']);
  assert.strictEqual(farmerWin.ok, true);
  assert.strictEqual(farmerWin.state.winnerSide, 'farmers');
});

test('Game: 计分 用例 2 普通胜负边界与末手炸弹', () => {
  lastHandFixture({ winner: 'A', successfulPlays: { A: 2, B: 1, C: 0 } });
  const normalLandlord = Game.play('A', ['S3']);
  assert.strictEqual(normalLandlord.state.result.multiplier, 1);
  assert.strictEqual(normalLandlord.state.successfulPlays.A, 3);

  lastHandFixture({ winner: 'B', successfulPlays: { A: 2, B: 0, C: 0 } });
  const normalFarmer = Game.play('B', ['S3']);
  assert.strictEqual(normalFarmer.state.result.multiplier, 1);

  lastHandFixture({ winner: 'A', lastCards: ['S5', 'H5', 'C5', 'D5'] });
  const bombFinish = Game.play('A', ['S5', 'H5', 'C5', 'D5']);
  assert.strictEqual(bombFinish.ok, true);
  assert.strictEqual(bombFinish.state.result.multiplier, 2);
  assert.deepStrictEqual(
    bombFinish.state.history.slice(-3).map(function (h) { return h.type; }),
    ['play', 'multiplier', 'finish']
  );
  assert.strictEqual(bombFinish.state.successfulPlays.A, 2);
});

test('Game: 计分 用例 3 真实命令链覆盖倍数', () => {
  multiBombFixture();
  Game.play('A', ['S5', 'H5', 'C5', 'D5']);
  Game.pass('B');
  Game.pass('C');
  const twoBombs = Game.play('A', ['S6', 'H6', 'C6', 'D6']);
  assert.strictEqual(twoBombs.ok, true);
  assert.strictEqual(twoBombs.state.result.multiplier, 4);
  const twoBombTypes = twoBombs.state.history.slice(3).map(function (h) { return h.type; });
  assert.deepStrictEqual(twoBombTypes, [
    'play', 'multiplier', 'pass', 'pass', 'new_round', 'play', 'multiplier', 'finish'
  ]);

  bombRocketFixture();
  Game.play('A', ['S5', 'H5', 'C5', 'D5']);
  Game.pass('B');
  Game.pass('C');
  const bombRocket = Game.play('A', ['XJ', 'BJ']);
  assert.strictEqual(bombRocket.state.result.multiplier, 4);
  const reasons = bombRocket.state.history
    .filter(function (h) { return h.type === 'multiplier'; })
    .map(function (h) { return h.reason; });
  assert.deepStrictEqual(reasons, ['bomb', 'rocket']);

  lastHandFixture({ winner: 'A', lastCards: ['XJ', 'BJ'] });
  const rocketFinish = Game.play('A', ['XJ', 'BJ']);
  const rocketTypes = rocketFinish.state.history.slice(-3).map(function (h) { return h.type; });
  assert.deepStrictEqual(rocketTypes, ['play', 'multiplier', 'finish']);
  const rocketMultiplier = rocketFinish.state.history.slice(-2)[0];
  const rocketPlay = rocketFinish.state.history.slice(-3)[0];
  assert.strictEqual(rocketMultiplier.reason, 'rocket');
  assert.strictEqual(rocketMultiplier.sourceSeq, rocketPlay.seq);

  lastHandFixture({
    winner: 'A',
    lastCards: ['S5', 'H5', 'C5', 'D5', 'S3', 'H3']
  });
  const fourTwoFinish = Game.play('A', ['S5', 'H5', 'C5', 'D5', 'S3', 'H3']);
  assert.strictEqual(fourTwoFinish.state.result.multiplier, 1);
  assert.strictEqual(
    fourTwoFinish.state.history.filter(function (h) { return h.type === 'multiplier'; }).length,
    0
  );
});

test('Game: 计分 用例 4 春天', () => {
  lastHandFixture({
    winner: 'A', lastCards: ['S3'], successfulPlays: { A: 0, B: 0, C: 0 }
  });
  const result = Game.play('A', ['S3']);
  assert.strictEqual(result.state.result.multiplier, 2);
  const spring = result.state.history.filter(function (h) {
    return h.type === 'multiplier' && h.reason === 'spring';
  });
  assert.strictEqual(spring.length, 1);
});

test('Game: 计分 用例 5 反春', () => {
  lastHandFixture({
    winner: 'B', lastCards: ['S3'], successfulPlays: { A: 1, B: 0, C: 0 }
  });
  const result = Game.play('B', ['S3']);
  assert.strictEqual(result.state.result.multiplier, 2);
  const antiSpring = result.state.history.filter(function (h) {
    return h.type === 'multiplier' && h.reason === 'anti_spring';
  });
  assert.strictEqual(antiSpring.length, 1);
});

test('Game: 计分 用例 6 得分公式与零和', () => {
  lastHandFixture({ winner: 'A', lastCards: ['S3'] });
  const landlordWin = Game.play('A', ['S3']).state;
  const B = landlordWin.highestBid;
  const M = landlordWin.result.multiplier;
  assert.deepStrictEqual(landlordWin.result.scores, {
    A: 2 * B * M, B: -B * M, C: -B * M
  });

  lastHandFixture({ winner: 'B', lastCards: ['S3'] });
  const farmerWin = Game.play('B', ['S3']).state;
  const B2 = farmerWin.highestBid;
  const M2 = farmerWin.result.multiplier;
  assert.deepStrictEqual(farmerWin.result.scores, {
    A: -2 * B2 * M2, B: B2 * M2, C: B2 * M2
  });
  assert.strictEqual(
    farmerWin.result.scores.A + farmerWin.result.scores.B + farmerWin.result.scores.C,
    0
  );
});

test('Game: 计分 用例 7 result 结构与 multiplierEvents', () => {
  lastHandFixture({ winner: 'A', lastCards: ['S5', 'H5', 'C5', 'D5'] });
  const state = Game.play('A', ['S5', 'H5', 'C5', 'D5']).state;
  assert.ok(state.result);
  assert.strictEqual(state.result.winnerSide, 'landlord');
  assert.strictEqual(state.result.baseBid, 3);
  assert.strictEqual(state.result.multiplier, 2);
  assert.deepStrictEqual(Object.keys(state.result).sort(), [
    'baseBid', 'multiplier', 'multiplierEvents', 'scores', 'winnerSide'
  ].sort());
  assert.strictEqual(state.result.multiplierEvents.length, 1);
  const playSeqs = state.history
    .filter(function (h) { return h.type === 'play'; })
    .map(function (h) { return h.seq; });
  state.result.multiplierEvents.forEach(function (event) {
    assert.ok(playSeqs.includes(event.sourceSeq));
  });
});

test('Game: 计分 用例 8 结束历史顺序', () => {
  lastHandFixture({
    winner: 'A', lastCards: ['S3'], successfulPlays: { A: 0, B: 0, C: 0 }
  });
  const result = Game.play('A', ['S3']);
  const tail = result.state.history.slice(-3);
  assert.deepStrictEqual(tail.map(function (h) { return h.type; }), [
    'play', 'multiplier', 'finish'
  ]);
  const finish = tail[2];
  assert.strictEqual(finish.winnerSide, 'landlord');
  assert.strictEqual(finish.baseBid, 3);
  assert.strictEqual(finish.multiplier, 2);
  assert.deepStrictEqual(finish.scores, { A: 12, B: -6, C: -6 });
});

test('Game: 计分 用例 9 新开局与重新发牌清空上一局', () => {
  lastHandFixture({ winner: 'A', lastCards: ['S3'] });
  Game.play('A', ['S3']);
  const restarted = Game.newGame(function () { return 0; });
  assert.strictEqual(restarted.ok, true);
  assert.strictEqual(restarted.state.phase, 'bidding');
  assert.strictEqual(restarted.state.result, null);
  assert.strictEqual(restarted.state.multiplier, 1);
  assert.strictEqual(restarted.state.history.length, 1);
  restarted.state.players.forEach(function (p) {
    assert.strictEqual(p.score, 0);
  });

  biddingState();
  Game.bid('A', 0);
  Game.bid('B', 0);
  Game.bid('C', 0);
  const redealt = Game.redeal(function () { return 0; });
  assert.strictEqual(redealt.ok, true);
  assert.strictEqual(redealt.state.phase, 'bidding');
  assert.strictEqual(redealt.state.result, null);
  assert.strictEqual(redealt.state.multiplier, 1);
  assert.strictEqual(redealt.state.history.length, 1);
});

test('Prompt 用例 1 非 playing 阶段返回 null', () => {
  const bidding = biddingState();
  assert.strictEqual(Prompt.generate(bidding), null);

  const redeal = makeTestState({ phase: 'redeal', currentPlayerId: null });
  assert.strictEqual(Prompt.generate(redeal), null);

  lastHandFixture({ winner: 'A', lastCards: ['S3'] });
  Game.play('A', ['S3']);
  assert.strictEqual(Prompt.generate(Game.getState()), null);
});

test('Prompt 用例 2 正式提示词引用规则文件且不含明牌', () => {
  const freeState = playingFixture();
  const freeText = Prompt.generate(freeState);
  assert.ok(freeText);
  [
    '## 1. 叫分与底牌',
    '## 2. 座位、身份与剩余张数',
    '## 3. 已知的公开历史信息',
    '## 4. 回答要求'
  ].forEach(function (heading) {
    assert.ok(freeText.includes(heading));
  });
  assert.ok(freeText.startsWith('# 斗地主残局推理\n'));
  assert.ok(freeText.includes('你是经典斗地主策略分析大师。请根据https://transmiao.cn/ddz-rule.html中的规则和下列已知的公开历史信息，推断当前玩家甲下一步最合理的操作。'));
  assert.ok(freeText.includes('叫分：'));
  assert.ok(freeText.includes('；甲为地主'));
  assert.ok(freeText.includes('底牌：'));
  assert.ok(!freeText.includes('...'));
  assert.ok(freeText.includes('1. 建议操作：出牌 或 不要。'));
  assert.ok(freeText.includes('4. 简要理由：说明该选择如何配合当前身份、控制出牌权或推进获胜。'));
  assert.strictEqual(freeText.split('\n').filter(function (l) { return l.length; }).pop(), '4. 简要理由：说明该选择如何配合当前身份、控制出牌权或推进获胜。');
  assert.strictEqual((freeText.match(/^## 2\. 座位、身份与剩余张数$/gm) || []).length, 1);
  assert.ok(!freeText.includes('随附规则文件'));
  assert.ok(!freeText.includes('《ddz-rule.html》'));
  assert.ok(!freeText.includes('规则摘要'));
  assert.ok(!freeText.includes('点数：3 < 4'));
  assert.ok(!freeText.includes('支持牌型：'));
  assert.ok(!freeText.includes('设叫分为 B'));
  assert.ok(freeText.includes('手牌：'));
  assert.ok(freeText.includes('手牌不公开'));
  assert.ok(freeText.includes('尚无出牌轮次。'));
  assert.ok(!freeText.includes('不要假设你能看到另外两家未打出的牌。'));
  assert.ok(!freeText.includes('另外两家的手牌尚未公开'));
  assert.ok(!freeText.includes('你的回答只是建议'));
  assert.ok(!freeText.includes('三家真实手牌'));
  assert.ok(!freeText.includes('你可以看到三家'));
  assert.ok(!freeText.includes('界面为方便用户'));
  assert.ok(!freeText.includes('一人操控三家'));
  assert.ok(!freeText.includes('初始手牌'));
  assert.ok(!freeText.includes('地主最终手牌'));
  assert.ok(!freeText.includes(Cards.cardLabel('S5')));
  assert.ok(!freeText.includes(Cards.cardLabel('S7')));

  const followState = followFixture();
  const followText = Prompt.generate(followState);
  assert.ok(followText.includes('现在轮到'));
});

test('Prompt 用例 3 当前玩家牌面带花色且不泄露另两家手牌', () => {
  const state = playingFixture();
  const text = Prompt.generate(state);
  const current = state.players.filter(function (p) {
    return p.id === state.currentPlayerId;
  })[0];
  current.handIds.forEach(function (id) {
    assert.ok(text.includes(Cards.cardLabel(id)));
  });
  state.bottomCards.forEach(function (id) {
    assert.ok(text.includes(Cards.cardLabel(id)));
  });
  ['S5', 'S7'].forEach(function (id) {
    assert.ok(!text.includes(Cards.cardLabel(id)), '不应泄露另两家手牌: ' + id);
  });
});

test('Prompt 用例 4 有效操作更新提示词且按轮汇总公开出牌', () => {
  playingFixture();
  const beforePlay = Prompt.generate(Game.getState());
  Game.play('A', ['S3']);
  const afterPlay = Prompt.generate(Game.getState());
  assert.notStrictEqual(afterPlay, beforePlay);
  assert.ok(afterPlay.includes('- 第 1 轮：甲 ♠3'));

  Game.play('B', []);
  const afterInvalid = Prompt.generate(Game.getState());
  assert.strictEqual(afterInvalid, afterPlay);

  Game.pass('B');
  Game.pass('C');
  const afterRound = Prompt.generate(Game.getState());
  assert.ok(afterRound.includes('- 第 1 轮：甲 ♠3 → 乙 不要 → 丙 不要'));

  followFixture();
  const beforePass = Prompt.generate(Game.getState());
  Game.pass('A');
  const afterPass = Prompt.generate(Game.getState());
  assert.notStrictEqual(afterPass, beforePass);
});

test('Prompt 用例 5 updatePromptCache 纯函数缓存', () => {
  playingFixture();
  const playingText = Prompt.generate(Game.getState());
  const cached = Prompt.updatePromptCache('old', Game.getState());
  assert.strictEqual(cached, playingText);

  const bidding = biddingState();
  assert.strictEqual(Prompt.updatePromptCache(cached, bidding), cached);

  lastHandFixture({ winner: 'A', lastCards: ['S3'] });
  const beforeFinish = Prompt.generate(Game.getState());
  Game.play('A', ['S3']);
  const finished = Game.getState();
  assert.strictEqual(Prompt.generate(finished), null);
  assert.strictEqual(Prompt.updatePromptCache(beforeFinish, finished), beforeFinish);
  assert.ok(!beforeFinish.includes('结束：'));
});

test('Prompt 用例 6 空缓存语义', () => {
  const bidding = biddingState();
  assert.strictEqual(Prompt.updatePromptCache('', bidding), '');
});

test('Prompt 用例 7 生成无副作用', () => {
  playingFixture();
  const before = Game.getState();
  const copy = JSON.parse(JSON.stringify(before));
  Prompt.generate(before);
  assert.deepStrictEqual(Game.getState(), copy);
  assert.deepStrictEqual(before, copy);
});

test('Security: 结构 用例 1 脚本与样式加载顺序', () => {
  const html = fs.readFileSync('ddz.html', 'utf8');
  const scripts = Array.from(
    html.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)
  ).map(function (m) { return m[1]; });
  assert.deepStrictEqual(scripts, [
    './cards.js', './game.js', './prompt.js', './ui.js'
  ]);
  assert.ok(!html.includes('type="module"'));
  assert.ok(html.includes('<link rel="stylesheet" href="./styles.css">'));
});

test('Security: 结构 用例 2 必需容器 id', () => {
  const html = fs.readFileSync('ddz.html', 'utf8');
  const ids = [
    'fatal', 'phase-label', 'current-label', 'new-game-btn', 'hint',
    'copy-btn', 'save-prompt-btn', 'prompt-text', 'history-panel',
    'hand-A', 'hand-B', 'hand-C', 'bottom-cards', 'result-box',
    'save-game-btn', 'replay-game-btn', 'saved-game-select', 'delete-game-btn',
    'export-game-btn', 'import-game-btn', 'import-file-input'
  ];
  ids.forEach(function (id) {
    assert.ok(html.includes('id="' + id + '"'), '缺少 id: ' + id);
  });
  const copyIndex = html.indexOf('id="copy-btn"');
  const promptPanelIndex = html.indexOf('id="prompt-panel"');
  assert.strictEqual((html.match(/id="copy-btn"/g) || []).length, 1);
  assert.ok(copyIndex > html.indexOf('</header>'), '复制按钮不应再放在顶部栏');
  assert.ok(copyIndex < promptPanelIndex, '复制按钮应在提示词面板之前，保证常显');
  const panelStart = promptPanelIndex;
  const panelEnd = html.indexOf('</section>', panelStart);
  const panelHtml = html.slice(panelStart, panelEnd);
  assert.ok(!panelHtml.includes('id="copy-btn"'), '提示词面板内不应再放复制按钮');

  ['A', 'B', 'C'].forEach(function (player) {
    const handIndex = html.indexOf('id="hand-' + player + '"');
    const handEnd = html.indexOf('</section>', handIndex);
    const handHtml = html.slice(handIndex, handEnd);
    assert.ok(handIndex >= 0, '缺少玩家手牌区: ' + player);
    assert.ok(handHtml.includes('class="hand-controls" data-player="' + player + '"'),
      '玩家 ' + player + ' 下方缺少按钮组');
    assert.strictEqual((handHtml.match(/data-action="bid"/g) || []).length, 4,
      '玩家 ' + player + ' 应有 4 个叫分按钮');
    assert.strictEqual((handHtml.match(/data-action="play"/g) || []).length, 1,
      '玩家 ' + player + ' 应有 1 个出牌按钮');
    assert.strictEqual((handHtml.match(/data-action="pass"/g) || []).length, 1);
    assert.strictEqual((handHtml.match(/data-action="clear"/g) || []).length, 1);
  });
  assert.strictEqual((html.match(/class="hand-controls"/g) || []).length, 3);
});

test('Security: 结构 用例 3 无远程资源与网络引用', () => {
  const html = fs.readFileSync('ddz.html', 'utf8');
  assert.ok(!/https?:\/\//.test(html));
  assert.ok(!html.includes('fetch('));
  assert.ok(!html.includes('XMLHttpRequest'));
  assert.ok(!/cdn/i.test(html));
});

test('Security: 结构 用例 4 结算免责文本', () => {
  const html = fs.readFileSync('ddz.html', 'utf8');
  assert.ok(html.includes('积分仅用于规则测试，无现金价值，不涉及充值、提现或交易'));
});

test('Security: 结构 用例 5 styles.css 本地且含颜色哨兵', () => {
  const css = fs.readFileSync('styles.css', 'utf8');
  assert.ok(!css.includes('@import'));
  assert.ok(!css.includes('url('));
  assert.ok(!/https?:\/\//.test(css));
  assert.ok(css.includes('.ddz-css-probe'));
  assert.ok(/color:\s*rgb\(1,\s*2,\s*3\)/.test(css));
});

function readUiSource() {
  return fs.readFileSync('ui.js', 'utf8');
}

test('Security: UI 用例 1 禁止危险 DOM 与动态执行', () => {
  const source = readUiSource();
  [
    '.innerHTML =', '.outerHTML =', 'insertAdjacentHTML(', 'document.write(',
    'eval(', 'new Function(', 'setTimeout(\'', 'setInterval(\''
  ].forEach(function (bad) {
    assert.ok(!source.includes(bad), '不应出现: ' + bad);
  });
});

test('Security: UI 用例 2 禁止网络与剪贴板读取', () => {
  const source = readUiSource();
  [
    '.clipboard.read', 'readText', 'XMLHttpRequest', 'fetch(',
    'WebSocket', 'EventSource', 'sendBeacon'
  ].forEach(function (bad) {
    assert.ok(!source.includes(bad), '不应出现: ' + bad);
  });
});

test('Security: UI 用例 3 仅本地资源与安全 DOM 写入', () => {
  const source = readUiSource();
  assert.ok(!/https?:\/\//.test(source));
  assert.ok(source.includes('textContent'));
  assert.ok(source.includes('document.createElement'));
  assert.ok(source.includes('createTextNode'));
});

test('Security: UI 用例 4 导出与缓存策略', () => {
  const source = readUiSource();
  assert.ok(source.includes('DDZ.UI ='));
  assert.ok(source.includes('function init('));
  assert.ok(source.includes('updatePromptCache'));
  assert.ok(!source.includes('Prompt.generate('));
});

test('Security: UI 用例 5 必需辅助函数与渲染入口', () => {
  const source = readUiSource();
  [
    'assertRequiredDom', 'ERROR_TEXT', 'showError', 'showHint',
    'selectAllText', 'render', 'dispatch'
  ].forEach(function (name) {
    assert.ok(source.includes(name), '缺少: ' + name);
  });
});

test('Security: 行为 用例 1 复制三级降级', () => {
  const source = readUiSource();
  assert.ok(source.includes('copyPrompt'));
  assert.ok(source.includes('fallbackCopy'));
  assert.ok(source.includes('navigator.clipboard.writeText('));
  assert.ok(source.includes('dom.copyBtn.addEventListener'));
  assert.ok(source.includes("document.createElement('textarea')"));
  assert.ok(source.includes("document.execCommand('copy')"));
  assert.ok(source.includes('Ctrl+C'));
  assert.ok(!source.includes('.clipboard.read'));
  assert.ok(!source.includes('readText'));
});

test('Security: 行为 用例 2 无拦截退出与复制入口', () => {
  const source = readUiSource();
  assert.ok(!source.includes("addEventListener('beforeunload'"));
  assert.ok(!source.includes('returnValue'));
  assert.ok(!source.includes('确定离开'));
  assert.ok(source.includes('copyPrompt'));
});

test('Security: 行为 用例 3 结束态与按玩家按钮控制', () => {
  const source = readUiSource();
  assert.ok(source.includes("state.phase === 'finished'"));
  assert.ok(source.includes('dom.newGameBtn.disabled = false'));
  assert.ok(source.includes('dom.redealBtn.disabled = true'));
  assert.ok(source.includes('data-action="bid"'));
  assert.ok(source.includes('data-action="play"'));
  assert.ok(source.includes("group.classList.add('inactive')"));
  assert.ok(source.includes('button.disabled = true;'));
  assert.ok(!source.includes('dom.playBtn'));
  assert.ok(!source.includes('getEl(\'bid-\''));
});

const RUNTIME_FILES = [
  'cards.js', 'game.js', 'prompt.js', 'ui.js', 'ddz.html', 'styles.css'
];
const FORBIDDEN = [
  /\.innerHTML\s*[+]?=/, /\.outerHTML\s*[+]?=/, /insertAdjacentHTML\s*\(/, /document\.write\s*\(/,
  /\beval\s*\(/, /new\s+Function\s*\(/, /[^.\w]Function\s*\(\s*['"]/,
  /setTimeout\s*\(\s*['"]/, /setInterval\s*\(\s*['"]/,
  /\.clipboard\.read\b/, /readText\s*\(/,
  /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /EventSource/,
  /sendBeacon/, /https?:\/\//,
  /FileReader\s*\(/, /type\s*=\s*['"]file['"]/
];

test('Security: 运行脚本 用例 1 六个运行文件无危险模式', () => {
  RUNTIME_FILES.forEach(function (file) {
    assert.ok(fs.existsSync(file), '缺少运行文件: ' + file);
    const source = fs.readFileSync(file, 'utf8');
    FORBIDDEN.forEach(function (pattern) {
      // prompt.js 中的 https 链接仅为提示词文本引用（规则文件地址），不发起网络请求
      if (file === 'prompt.js' && pattern.source === 'https?:\\/\\/') return;
      // ui.js 的本地牌局导入功能需要 FileReader 与 file 输入框，不涉及网络上传
      if (file === 'ui.js' &&
          (pattern.source === 'FileReader\\s*\\(' ||
           pattern.source === 'type\\s*=\\s*[\'"]file[\'"]')) return;
      // ddz.html 中的 file 输入框供本地导入牌局使用
      if (file === 'ddz.html' && pattern.source === 'type\\s*=\\s*[\'"]file[\'"]') return;
      assert.ok(!pattern.test(source), file + ' 命中禁用模式: ' + pattern);
    });
  });
});

test('Security: 运行脚本 用例 2 剪贴板只写不读', () => {
  const ui = fs.readFileSync('ui.js', 'utf8');
  assert.ok(ui.includes('navigator.clipboard.writeText('));
  assert.ok(ui.includes("dom.copyBtn.addEventListener('click', copyPrompt)"));
  assert.ok(!ui.includes('.clipboard.read'));
  assert.ok(!/readText\s*\(/.test(ui));
});

test('Security: 运行脚本 用例 3 提示词引用规则文件且固定拼接', () => {
  const promptSource = fs.readFileSync('prompt.js', 'utf8');
  assert.ok(promptSource.includes('ddz-rule.html'));
  assert.ok(promptSource.includes('RULES_PATH'));
  assert.ok(promptSource.includes('你是经典斗地主策略分析大师。请根据'));
  assert.ok(!promptSource.includes('RULES_REFERENCE'));
  assert.ok(!promptSource.includes('RULES_FILE'));
  assert.ok(!promptSource.includes('RULES_SUMMARY'));
  assert.ok(!promptSource.includes('点数：3 < 4'));
  assert.ok(!promptSource.includes('支持牌型：'));
  assert.ok(promptSource.includes("lines.join('\\n')"));
  assert.ok(!/\beval\s*\(/.test(promptSource));
  assert.ok(!/new\s+Function\s*\(/.test(promptSource));
  assert.ok(!/[^.\w]Function\s*\(\s*['"]/.test(promptSource));
});

test('Security: 运行脚本 用例 4 script src 依赖顺序', () => {
  const html = fs.readFileSync('ddz.html', 'utf8');
  const scripts = Array.from(
    html.matchAll(/<script\s+src="([^"]+)"[^>]*><\/script>/g)
  ).map(function (m) { return m[1]; });
  assert.deepStrictEqual(scripts, [
    './cards.js', './game.js', './prompt.js', './ui.js'
  ]);
  assert.ok(!html.includes('type="module"'));
});

test('Cards: 基础 createDeck 返回 54 张唯一 ID', () => {
  const deck = Cards.createDeck();
  assert.strictEqual(deck.length, 54);
  assert.strictEqual(new Set(deck).size, 54);
  assert.ok(deck.includes('XJ'));
  assert.ok(deck.includes('BJ'));
  assert.ok(deck.includes('S3'));
  assert.ok(deck.includes('H10'));
});

test('Cards: 基础 sortCards 降序且王/2 顺序正确', () => {
  const input = ['S3', 'BJ', 'H3', 'XJ', 'D2'];
  assert.deepStrictEqual(Cards.sortCards(input), ['BJ', 'XJ', 'D2', 'S3', 'H3']);
});

test('Cards: 基础 sortCards 不修改入参', () => {
  const input = ['S3', 'BJ', 'H3', 'XJ', 'D2'];
  const copy = input.slice();
  Cards.sortCards(input);
  assert.deepStrictEqual(input, copy);
});

test('Cards: 基础 cardLabel 带花色与中文王', () => {
  assert.strictEqual(Cards.cardLabel('H10'), '♥10');
  assert.strictEqual(Cards.cardLabel('S3'), '♠3');
  assert.strictEqual(Cards.cardLabel('XJ'), '小王');
  assert.strictEqual(Cards.cardLabel('BJ'), '大王');
});

test('Cards: 基础牌型 用例 1 单张对子三张', () => {
  assert.deepStrictEqual(patternTypes(['S3']), ['single']);
  assert.deepStrictEqual(patternTypes(['S3', 'H3']), ['pair']);
  assert.deepStrictEqual(patternTypes(['XJ', 'BJ']), ['rocket']);
  assert.deepStrictEqual(patternTypes(['S3', 'H3', 'C3']), ['triple']);
});

test('Cards: 基础牌型 用例 2 三带一', () => {
  assert.deepStrictEqual(patternTypes(['S3', 'H3', 'C3', 'S4']), ['triple_single']);
  assert.deepStrictEqual(patternTypes(['S3', 'H3', 'C3', 'D3']), ['bomb']);
});

test('Cards: 基础牌型 用例 3 三带二', () => {
  assert.deepStrictEqual(patternTypes(['S3', 'H3', 'C3', 'S4', 'H4']), ['triple_pair']);
  assert.deepStrictEqual(patternTypes(['S3', 'H3', 'C3', 'D3', 'S3']), []);
});

test('Cards: 基础牌型 用例 4 四张同点只识别炸弹', () => {
  assert.deepStrictEqual(patternTypes(['S5', 'H5', 'C5', 'D5']), ['bomb']);
});

test('Cards: 基础牌型 用例 5 火箭与重复牌', () => {
  assert.deepStrictEqual(patternTypes(['XJ', 'BJ']), ['rocket']);
  assert.deepStrictEqual(patternTypes(['XJ', 'XJ']), []);
});

test('Cards: 基础牌型 用例 6 四带二单附件同点与异点', () => {
  assert.deepStrictEqual(
    patternTypes(['S5', 'H5', 'C5', 'D5', 'S3', 'H3']),
    ['four_two_single']
  );
  assert.deepStrictEqual(
    patternTypes(['S5', 'H5', 'C5', 'D5', 'S3', 'H4']),
    ['four_two_single']
  );
});

test('Cards: 基础牌型 用例 7 四带二对', () => {
  assert.deepStrictEqual(
    patternTypes(['S5', 'H5', 'C5', 'D5', 'S3', 'H3', 'C4', 'D4']),
    ['four_two_pair']
  );
  assert.deepStrictEqual(
    patternTypes(['S5', 'H5', 'C5', 'D5', 'S3', 'H3', 'C3', 'D3']),
    []
  );
});

test('Cards: 基础牌型 用例 8 四带二不返回炸弹', () => {
  assert.ok(!patternTypes(['S5', 'H5', 'C5', 'D5', 'S3', 'H3']).includes('bomb'));
  assert.ok(!patternTypes(['S5', 'H5', 'C5', 'D5', 'S3', 'H3', 'C4', 'D4']).includes('bomb'));
});

test('Cards: 基础牌型 用例 9 多张牌含炸弹或火箭不整组算特殊牌型', () => {
  assert.deepStrictEqual(patternTypes(['S5', 'H5', 'C5', 'D5', 'S3']), []);
  assert.deepStrictEqual(patternTypes(['XJ', 'BJ', 'S3']), []);
});

test('Cards: 连续牌型 用例 1 顺子', () => {
  assert.ok(patternTypes(['S3', 'H4', 'C5', 'D6', 'S7']).includes('straight'));
  assert.ok(patternTypes(['S10', 'HJ', 'CQ', 'DK', 'SA']).includes('straight'));
  assert.ok(!patternTypes(['S10', 'HJ', 'CQ', 'DK', 'S2']).includes('straight'));
  assert.ok(!patternTypes(['S3', 'H4', 'C5', 'D6']).includes('straight'));
  assert.ok(!patternTypes(['S3', 'H4', 'C5', 'D7', 'S8']).includes('straight'));
});

test('Cards: 连续牌型 用例 2 连对', () => {
  assert.ok(patternTypes(['S3', 'H3', 'S4', 'H4', 'S5', 'H5']).includes('pair_straight'));
  assert.ok(!patternTypes(['S3', 'H3', 'S4', 'H4']).includes('pair_straight'));
  assert.ok(!patternTypes(['SJ', 'HJ', 'SQ', 'HQ', 'S2', 'H2']).includes('pair_straight'));
  assert.ok(!patternTypes(['S3', 'H3', 'S4', 'H4', 'S6', 'H6']).includes('pair_straight'));
});

test('Cards: 连续牌型 用例 3 飞机不带带单带对', () => {
  const body = ['S3', 'H3', 'C3', 'S4', 'H4', 'C4'];
  assert.ok(patternTypes(body).includes('plane'));
  assert.ok(patternTypes(body.concat(['S5', 'H6'])).includes('plane_single'));
  assert.ok(patternTypes(body.concat(['S5', 'H5', 'S6', 'H6'])).includes('plane_pair'));
});

test('Cards: 连续牌型 用例 4 非法飞机', () => {
  const validPlane = ['S3', 'H3', 'C3', 'S4', 'H4', 'C4'];
  assert.ok(patternTypes(validPlane).includes('plane'));
  assert.ok(!patternTypes(['S3', 'H3', 'C3', 'S5', 'H5', 'C5']).includes('plane'));
  assert.ok(!patternTypes(['S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'S5']).includes('plane_single'));
  assert.ok(!patternTypes([
    'S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'S5', 'H5', 'C5', 'D5'
  ]).includes('plane_pair'));
});

test('Cards: 连续牌型 用例 5 主体第四张余牌作单附件', () => {
  assert.ok(patternTypes([
    'S3', 'H3', 'C3', 'D3', 'S4', 'H4', 'C4', 'S5'
  ]).includes('plane_single'));
});

test('Cards: 连续牌型 用例 6 三组连续三张', () => {
  const body = [
    'S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'S5', 'H5', 'C5'
  ];
  assert.ok(patternTypes(body).includes('plane'));
  assert.ok(patternTypes(body.concat(['S6', 'H7', 'C8'])).includes('plane_single'));
});

const mixedPlane = [
  'S3', 'H3', 'C3', 'S4', 'H4', 'C4',
  'S5', 'H5', 'C5', 'S6', 'H6', 'C6'
];

test('Cards: 主解释 用例 1 单解释与多解释稳定唯一值', () => {
  assert.strictEqual(Cards.primaryPattern(['S3']).type, 'single');
  assert.strictEqual(Cards.primaryPattern(mixedPlane).type, 'plane');
  assert.strictEqual(Cards.primaryPattern(mixedPlane).length, 4);
});

test('Cards: 主解释 用例 2 固定优先级', () => {
  assert.strictEqual(Cards.primaryPattern(['XJ', 'BJ']).type, 'rocket');
  assert.strictEqual(Cards.primaryPattern(['S5', 'H5', 'C5', 'D5']).type, 'bomb');
  assert.strictEqual(Cards.primaryPattern(['S3', 'H3', 'C3', 'S4']).type, 'triple_single');
  const first = Cards.primaryPattern(mixedPlane);
  const reversed = Cards.primaryPattern(mixedPlane.slice().reverse());
  assert.deepStrictEqual(first, reversed);
  assert.strictEqual(first.attachment, 'none');
});

test('Cards: 主解释 用例 3 非法牌返回 null', () => {
  assert.strictEqual(Cards.primaryPattern(['XJ', 'XJ']), null);
  assert.strictEqual(Cards.primaryPattern([]), null);
  assert.strictEqual(Cards.primaryPattern(['S3', 'S3']), null);
});

const planeSingleTarget = {
  type: 'plane_single',
  rank: 4,
  length: 3,
  attachment: 'single',
  cardCount: 12,
  cardIds: []
};

test('Cards: 比较 用例 1 同型同结构比较', () => {
  const single3 = Cards.primaryPattern(['S3']);
  assert.strictEqual(Cards.canBeat(['S4'], single3), true);
  assert.strictEqual(Cards.canBeat(['H3'], single3), false);

  const pair3 = Cards.primaryPattern(['S3', 'H3']);
  assert.strictEqual(Cards.canBeat(['S4', 'H4'], pair3), true);
  assert.strictEqual(Cards.canBeat(['S3', 'H3'], pair3), false);

  const tripleSingle = Cards.primaryPattern(['S3', 'H3', 'C3', 'S4']);
  const triplePair = Cards.primaryPattern(['S3', 'H3', 'C3', 'S4', 'H4']);
  assert.strictEqual(Cards.canBeat(['S3', 'H3', 'C3', 'S4', 'H4'], tripleSingle), false);
  assert.strictEqual(Cards.canBeat(['S3', 'H3', 'C3', 'S4'], triplePair), false);

  const plane = Cards.primaryPattern(['S3', 'H3', 'C3', 'S4', 'H4', 'C4']);
  const planeSingle = Cards.primaryPattern([
    'S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'S5', 'H6'
  ]);
  const planePair = Cards.primaryPattern([
    'S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'S5', 'H5', 'S6', 'H6'
  ]);
  assert.strictEqual(Cards.canBeat([
    'S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'S5', 'H6'
  ], plane), false);
  assert.strictEqual(Cards.canBeat([
    'S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'S5', 'H5', 'S6', 'H6'
  ], plane), false);
  assert.ok(planeSingle && planePair);

  const fourTwoSingle = Cards.primaryPattern([
    'S5', 'H5', 'C5', 'D5', 'S3', 'H3'
  ]);
  assert.strictEqual(Cards.canBeat([
    'S5', 'H5', 'C5', 'D5', 'S3', 'H3', 'C4', 'D4'
  ], fourTwoSingle), false);

  const straight5 = Cards.primaryPattern(['S3', 'H4', 'C5', 'D6', 'S7']);
  assert.strictEqual(Cards.canBeat([
    'S4', 'H5', 'C6', 'D7', 'S8', 'H9'
  ], straight5), false);

  const pairStraight3 = Cards.primaryPattern([
    'S3', 'H3', 'S4', 'H4', 'S5', 'H5'
  ]);
  assert.strictEqual(Cards.canBeat([
    'S3', 'H3', 'S4', 'H4', 'S5', 'H5', 'S6', 'H6'
  ], pairStraight3), false);

  assert.strictEqual(Cards.canBeat([
    'S3', 'H3', 'C3', 'S4', 'H4', 'C4', 'S5', 'H5', 'C5'
  ], plane), false);
});

test('Cards: 比较 用例 2 炸弹与火箭', () => {
  const single3 = Cards.primaryPattern(['S3']);
  const bomb5 = Cards.primaryPattern(['S5', 'H5', 'C5', 'D5']);
  const bomb6 = Cards.primaryPattern(['S6', 'H6', 'C6', 'D6']);
  const rocket = Cards.primaryPattern(['XJ', 'BJ']);

  assert.strictEqual(Cards.canBeat(['S5', 'H5', 'C5', 'D5'], single3), true);
  assert.strictEqual(Cards.canBeat(['XJ', 'BJ'], single3), true);
  assert.strictEqual(Cards.canBeat(['S6', 'H6', 'C6', 'D6'], bomb5), true);
  assert.strictEqual(Cards.canBeat(['S5', 'H5', 'C5', 'D5'], bomb5), false);
  assert.strictEqual(Cards.canBeat(['XJ', 'BJ'], bomb5), true);
  assert.strictEqual(Cards.canBeat(['S5', 'H5', 'C5', 'D5'], rocket), false);
  assert.strictEqual(Cards.canBeat(['XJ', 'BJ'], rocket), false);
  assert.strictEqual(Cards.canBeat(['S4'], bomb5), false);
  assert.ok(bomb6);
});

test('Cards: 比较 用例 3 公开函数优先级', () => {
  const single3 = Cards.primaryPattern(['S3']);
  const bomb5 = Cards.primaryPattern(['S5', 'H5', 'C5', 'D5']);

  assert.strictEqual(Cards.canBeat(mixedPlane, planeSingleTarget), true);
  assert.strictEqual(Cards.selectBeatingPattern(['S4'], single3).type, 'single');
  assert.strictEqual(Cards.selectBeatingPattern(['S5', 'H5', 'C5', 'D5'], single3).type, 'bomb');
  assert.strictEqual(Cards.selectBeatingPattern(['XJ', 'BJ'], single3).type, 'rocket');
  assert.strictEqual(Cards.selectBeatingPattern(['S6', 'H6', 'C6', 'D6'], bomb5).type, 'bomb');
});

test('Cards: 比较 用例 4 多解释跟牌采用最小可压过主体', () => {
  const selected = Cards.selectBeatingPattern(mixedPlane, planeSingleTarget);
  assert.ok(selected);
  assert.strictEqual(selected.type, 'plane_single');
  assert.strictEqual(selected.rank, 5);
});

// ---------------------------------------------------------------------------
// 导入校验：Game.loadState 必须按规则从发牌重演，数据不对就拒绝且不动原局面。
// 正例只用两种真实局面：公开命令真实打完的整局，以及磁盘上的残局存档文件；
// 现有注入夹具（每家几张牌、handAfter 写死）按规则必然不一致，不能当正例。
// ---------------------------------------------------------------------------

// 用公开命令真实打完一整局：甲叫 3 分当地主，每轮领出最小单张，乙丙都不要，
// 直到甲出完——会产生 new_round、春天 multiplier 和 finish 等派生记录。
function playSpringGame() {
  Game.newGame(randomForDeck(Cards.createDeck(), 0));
  Game.bid('A', 3);
  for (let guard = 0; guard < 200; guard++) {
    const s = Game.getState();
    if (s.phase === 'finished') break;
    const cur = s.currentPlayerId;
    if (s.lastPlay === null) {
      const hand = s.players.filter(function (p) { return p.id === cur; })[0].handIds;
      assert.strictEqual(Game.play(cur, [hand[hand.length - 1]]).ok, true);
    } else {
      assert.strictEqual(Game.pass(cur).ok, true);
    }
  }
  const done = Game.getState();
  assert.strictEqual(done.phase, 'finished');
  return done;
}

// 与 ui.js 导入相同的取法：去掉可能的 BOM，整个文件按 JSON 解析。
function readArchiveState(file) {
  const text = fs.readFileSync(file, 'utf8');
  return JSON.parse(text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text);
}

const ARCHIVE_FILE = '经典斗地主残局.json';

function clone(v) {
  return JSON.parse(JSON.stringify(v));
}

// 先把内部状态设成一个已知局面，再调用 loadState(bad)：
// 必须被拒绝、不抛异常、events 为空，且内部状态与调用前完全相同。
function assertImportRejected(bad, messageParts) {
  playSpringGame();
  const before = Game.getState();
  const result = Game.loadState(bad);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.error.code, 'INVALID_SAVE');
  assert.strictEqual(typeof result.error.message, 'string');
  assert.ok(result.error.message.length > 0);
  assert.deepStrictEqual(result.events, []);
  assert.deepStrictEqual(Game.getState(), before);
  (messageParts || []).forEach(function (part) {
    assert.ok(result.error.message.includes(part),
      '错误原因应包含「' + part + '」，实际：' + result.error.message);
  });
  return result;
}

test('Game: 导入校验 用例 1 真实打完的整局可以载入且原样还原', () => {
  const finished = playSpringGame();
  Game.newGame(function () { return 0; });
  const result = Game.loadState(clone(finished));
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.events, []);
  assert.deepStrictEqual(Game.getState(), finished);
  assert.strictEqual(finished.result.multiplierEvents[0].reason, 'spring');
});

test('Game: 导入校验 用例 2 残局存档文件可以载入，发牌记录未排序也算对', () => {
  const file = readArchiveState(ARCHIVE_FILE);
  // 判别现场：文件里甲的初始手牌没有按大小排，顺序敏感的比较会在这里拒绝。
  assert.notDeepStrictEqual(file.history[0].initialHands.A,
    Cards.sortCards(file.history[0].initialHands.A));
  const result = Game.loadState(clone(file));
  assert.strictEqual(result.ok, true, result.error && result.error.message);
  const loaded = Game.getState();
  assert.strictEqual(loaded.currentPlayerId, 'C');
  assert.strictEqual(loaded.history.length, file.history.length);
  loaded.players.forEach(function (p, i) {
    assert.deepStrictEqual(p.handIds, Cards.sortCards(file.players[i].handIds));
  });
  // 载入的是按规则重演出的规范状态，不是文件原对象。
  assert.deepStrictEqual(loaded.history[0].initialHands.A,
    Cards.sortCards(file.history[0].initialHands.A));
  // 底牌保持文件里的顺序（♥7 ♣2 ♦7 未按大小排；排序后会变成 ♣2 ♥7 ♦7）。
  assert.notDeepStrictEqual(file.bottomCards, Cards.sortCards(file.bottomCards));
  assert.deepStrictEqual(loaded.bottomCards, file.bottomCards);
});

test('Game: 导入校验 用例 3 牌面数组顺序打乱仍可载入', () => {
  const finished = playSpringGame();
  const shuffled = clone(finished);
  shuffled.players.forEach(function (p) { p.handIds.reverse(); });
  ['A', 'B', 'C'].forEach(function (id) { shuffled.history[0].initialHands[id].reverse(); });
  // 底牌不打乱：发牌时底牌保持洗牌顺序（不排序），重演照文件顺序还原。
  Game.newGame(function () { return 0; });
  const result = Game.loadState(shuffled);
  assert.strictEqual(result.ok, true, result.error && result.error.message);
  assert.deepStrictEqual(Game.getState(), finished);
});

test('Game: 导入校验 用例 4 非对象或缺发牌记录的数据被拒绝且不抛异常', () => {
  [null, undefined, 'abc', 42, [], {}, { history: 'x' }, { history: [] },
    { history: [{ type: 'bid' }] }, { history: [{ type: 'deal' }] }
  ].forEach(function (bad) {
    assertImportRejected(bad);
  });

  // 结构合法、但嵌套极深：规范化比较时会栈溢出，必须被兜底拦下而不是抛到界面。
  const deep = clone(readArchiveState(ARCHIVE_FILE));
  let node = {};
  deep.extra = node;
  for (let d = 0; d < 100000; d++) { node.x = {}; node = node.x; }
  assertImportRejected(deep, ['格式不对']);
});

test('Game: 导入校验 用例 4b 发牌记录本身被改写被拒绝', () => {
  const file = readArchiveState(ARCHIVE_FILE);
  const bad = clone(file);
  bad.history[0].note = '手工添加的字段';
  assertImportRejected(bad, ['第 1 条', '发牌']);
});

test('Game: 导入校验 用例 5 发牌记录不完整被拒绝', () => {
  const file = readArchiveState(ARCHIVE_FILE);
  const bad = clone(file);
  bad.history[0].initialHands.A.pop();
  assertImportRejected(bad, ['甲', '17']);

  const dup = clone(file);
  dup.bottomCards = [dup.bottomCards[0], dup.bottomCards[0], dup.bottomCards[1]];
  assertImportRejected(dup, ['底牌']);
});

test('Game: 导入校验 用例 6 历史里有一手不合规则被拒绝并写明第几条', () => {
  const file = readArchiveState(ARCHIVE_FILE);
  // 第 6 条：甲本来用 ♥6 压丙的 ♥5，改成 ♥3（甲确有此牌）就压不过。
  const early = clone(file);
  assert.strictEqual(early.history[5].seq, 6);
  early.history[5].cardIds = ['H3'];
  assertImportRejected(early, ['第 6 条', '甲', '不能压过']);

  // 第 39 条：乙最后自由领出（手里是 ♦2 ♠7 ♣7），改成不成牌型的 ♦2 ♠7——已执行三十多条命令后才失败。
  const late = clone(file);
  assert.strictEqual(late.history[38].seq, 39);
  late.history[38].cardIds = ['D2', 'S7'];
  assertImportRejected(late, ['第 39 条', '乙', '非法牌型']);
});

test('Game: 导入校验 用例 7 剩余手牌或当前玩家与记录对不上被拒绝', () => {
  const file = readArchiveState(ARCHIVE_FILE);
  const missing = clone(file);
  missing.players[1].handIds = ['S7'];          // 乙应剩 ♠7 ♣7 两张
  assertImportRejected(missing, ['乙', '手牌']);

  const swapped = clone(file);
  swapped.players[0].handIds = ['SA', 'HK', 'CQ', 'SJ', 'D3']; // 甲应剩 ♠A ♥K ♣Q ♠J ♥3；♥3 换成已打出的 ♦3
  assertImportRejected(swapped, ['甲', '手牌']);

  const wrongTurn = clone(file);
  wrongTurn.currentPlayerId = 'A';
  assertImportRejected(wrongTurn, ['当前行动玩家']);
});

test('Game: 导入校验 用例 8 派生记录被改或记录被截断被拒绝', () => {
  const finished = playSpringGame();
  const badMultiplier = clone(finished);
  const mIdx = badMultiplier.history.findIndex(function (h) { return h.type === 'multiplier'; });
  badMultiplier.history[mIdx].after = 4;
  assertImportRejected(badMultiplier, ['第 ' + badMultiplier.history[mIdx].seq + ' 条']);

  const badScore = clone(finished);
  badScore.result.scores = { A: 0, B: 0, C: 0 };
  assertImportRejected(badScore, ['结算']);

  const file = readArchiveState(ARCHIVE_FILE);
  const truncated = clone(file);
  truncated.history = truncated.history.slice(0, 3); // 丙叫 3 分后本应有「确定地主」
  assertImportRejected(truncated, ['第 4 条', '缺失', '确定地主']);
});

test('Security: 导入 用例 1 存档只用纯 JSON，保存提示词不附状态数据', () => {
  const ui = fs.readFileSync('ui.js', 'utf8');
  assert.ok(!ui.includes('importPromptMd'), '不应再有从提示词文件导入的分支');
  // 旧 .md 存档格式的痕迹全部去掉：标题、状态数据段、json 代码块解析、md 导出函数。
  ['# 斗地主牌局存档', '## 状态数据（供导入还原）', '```json', 'buildExportMd'].forEach(function (old) {
    assert.ok(!ui.includes(old), 'ui.js 不应再出现旧 .md 存档格式：' + old);
  });
  assert.ok(ui.includes("'.json'"), '导出文件应为 .json');
  assert.ok(ui.includes('不是有效的 JSON'), '非 JSON 文件应给出明确拒绝提示');
  assert.ok(ui.includes('charCodeAt(0) === 0xFEFF'), '解析前应去掉开头可能残留的 BOM');
  assert.ok(!ui.includes('# 斗地主推理提示词'), '保存提示词只存提示词正文');

  const html = fs.readFileSync('ddz.html', 'utf8');
  assert.ok(html.includes('id="import-file-input" type="file" accept=".json,application/json"'),
    '导入的文件选择框只列 .json 文件');
});

test('Security: 导入 用例 3 坏存档不拖垮启动、已结束牌局无提示词时有说明', () => {
  // 界面行为只能静态检查；实际表现由仓库外的无界面 Chrome 测试页实跑（见规格 §11.1）。
  const ui = fs.readFileSync('ui.js', 'utf8');
  assert.ok(ui.includes('（存档已损坏，可删除）'), '坏存档应在下拉框里显示为已损坏');
  assert.ok(ui.includes('导入或回放的已结束牌局不会生成提示词，没有可复制的内容。'),
    '已结束且无提示词时应给出说明，而不是只拼一句结束标注');
});

test('Security: 导入 用例 2 残局示例是纯 JSON 牌局数据', () => {
  const text = fs.readFileSync(ARCHIVE_FILE, 'utf8');
  assert.ok(text.trimStart().startsWith('{'), '应是纯 JSON，开头不带 markdown 标题');
  const state = JSON.parse(text);
  assert.ok(Array.isArray(state.history) && state.history[0].type === 'deal');
});
