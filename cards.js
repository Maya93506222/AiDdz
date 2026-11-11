(function (root) {
  'use strict';
  var DDZ = (root.DDZ = root.DDZ || {});

  var NORMAL_RANKS = ['3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A', '2'];
  var RANK_VALUE = {
    '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10,
    J: 11, Q: 12, K: 13, A: 14, '2': 15, XJ: 16, BJ: 17
  };
  var RANK_BY_VALUE = {
    3: '3', 4: '4', 5: '5', 6: '6', 7: '7', 8: '8', 9: '9', 10: '10',
    11: 'J', 12: 'Q', 13: 'K', 14: 'A'
  };
  var SUIT_ORDER = { S: 0, H: 1, C: 2, D: 3 };
  var SUIT_SYMBOL = { S: '♠', H: '♥', C: '♣', D: '♦' };
  var TABLE_ORDER = [
    'single', 'pair', 'triple', 'triple_single', 'triple_pair', 'straight',
    'pair_straight', 'plane', 'plane_single', 'plane_pair', 'four_two_single',
    'four_two_pair', 'bomb', 'rocket'
  ];

  function rankOf(id) {
    return (id === 'XJ' || id === 'BJ') ? id : id.slice(1);
  }

  function valueOf(id) {
    return RANK_VALUE[rankOf(id)];
  }

  function isJoker(id) {
    return id === 'XJ' || id === 'BJ';
  }

  function createDeck() {
    var suits = ['S', 'H', 'C', 'D'];
    var deck = [];
    for (var s = 0; s < suits.length; s++) {
      for (var r = 0; r < NORMAL_RANKS.length; r++) {
        deck.push(suits[s] + NORMAL_RANKS[r]);
      }
    }
    deck.push('XJ', 'BJ');
    return deck;
  }

  function sortCards(ids) {
    return ids.slice().sort(function (a, b) {
      var diff = valueOf(b) - valueOf(a);
      if (diff !== 0) return diff;
      return (SUIT_ORDER[a[0]] || 0) - (SUIT_ORDER[b[0]] || 0);
    });
  }

  function cardLabel(id) {
    if (id === 'XJ') return '小王';
    if (id === 'BJ') return '大王';
    return SUIT_SYMBOL[id[0]] + rankOf(id);
  }

  function mk(type, rank, length, attachment, ids) {
    return {
      type: type,
      rank: rank,
      length: length,
      attachment: attachment,
      cardCount: ids.length,
      cardIds: sortCards(ids)
    };
  }

  function findRank(counts, n) {
    var keys = Object.keys(counts).filter(function (r) { return counts[r] === n; });
    return keys.length ? keys[0] : null;
  }

  function rest(counts, excludeRank) {
    var result = {};
    Object.keys(counts).forEach(function (r) {
      if (r !== excludeRank) result[r] = counts[r];
    });
    return result;
  }

  function findDistinctPairs(counts, need) {
    var keys = Object.keys(counts);
    if (keys.length !== need) return null;
    for (var i = 0; i < keys.length; i++) {
      var r = keys[i];
      if (r === 'XJ' || r === 'BJ' || counts[r] !== 2) return null;
    }
    return keys.sort(function (a, b) { return RANK_VALUE[a] - RANK_VALUE[b]; });
  }

  function minBy(arr, fn) {
    return arr.reduce(function (best, x) { return fn(x) < fn(best) ? x : best; });
  }

  function specialScore(pattern) {
    return pattern.type === 'rocket' ? 3 : (pattern.type === 'bomb' ? 2 : 0);
  }

  function comparePrimary(a, b) {
    var sa = specialScore(a);
    var sb = specialScore(b);
    if (sa !== sb) return sb - sa;
    if (sa === 2 && a.rank !== b.rank) return b.rank - a.rank;
    var na = a.attachment === 'none' ? 1 : 0;
    var nb = b.attachment === 'none' ? 1 : 0;
    if (na !== nb) return nb - na;
    if (a.length !== b.length) return b.length - a.length;
    if (a.rank !== b.rank) return b.rank - a.rank;
    return TABLE_ORDER.indexOf(a.type) - TABLE_ORDER.indexOf(b.type);
  }

  function isBombOrRocket(pattern) {
    return pattern.type === 'bomb' || pattern.type === 'rocket';
  }

  function patternBeats(a, target) {
    if (a.type === 'rocket') return target.type !== 'rocket';
    if (target.type === 'rocket') return false;
    if (a.type === 'bomb') {
      if (target.type === 'bomb') return a.rank > target.rank;
      return true;
    }
    if (target.type === 'bomb') return false;
    return a.type === target.type &&
      a.length === target.length &&
      a.attachment === target.attachment &&
      a.cardCount === target.cardCount &&
      a.rank > target.rank;
  }

  function enumRuns(counts, minCount) {
    var runs = [];
    for (var s = 3; s <= 14;) {
      if ((counts[RANK_BY_VALUE[s]] || 0) < minCount) { s++; continue; }
      var e = s;
      while (e + 1 <= 14 && (counts[RANK_BY_VALUE[e + 1]] || 0) >= minCount) e++;
      runs.push([s, e]);
      s = e + 1;
    }
    return runs;
  }

  function eachSub(run, minLen, cb) {
    for (var len = minLen; run[0] + len - 1 <= run[1]; len++) {
      for (var st = run[0]; st + len - 1 <= run[1]; st++) {
        cb(st, len, st + len - 1);
      }
    }
  }

  function pushContinuous(out, ids, counts) {
    enumRuns(counts, 1).forEach(function (run) {
      eachSub(run, 5, function (st, len, top) {
        if (ids.length !== len) return;
        for (var v = st; v <= top; v++) {
          if (counts[RANK_BY_VALUE[v]] !== 1) return;
        }
        out.push(mk('straight', top, len, 'none', ids));
      });
    });
    enumRuns(counts, 2).forEach(function (run) {
      eachSub(run, 3, function (st, len, top) {
        if (ids.length !== 2 * len) return;
        for (var v = st; v <= top; v++) {
          if (counts[RANK_BY_VALUE[v]] !== 2) return;
        }
        out.push(mk('pair_straight', top, len, 'none', ids));
      });
    });
    enumRuns(counts, 3).forEach(function (run) {
      eachSub(run, 2, function (st, len, top) {
        if (ids.length === 3 * len) {
          out.push(mk('plane', top, len, 'none', ids));
        } else if (ids.length === 4 * len) {
          out.push(mk('plane_single', top, len, 'single', ids));
        } else if (ids.length === 5 * len) {
          var restCounts = {};
          Object.keys(counts).forEach(function (r) { restCounts[r] = counts[r]; });
          for (var v = st; v <= top; v++) {
            var r = RANK_BY_VALUE[v];
            restCounts[r] -= 3;
            if (restCounts[r] === 0) delete restCounts[r];
          }
          if (findDistinctPairs(restCounts, len)) {
            out.push(mk('plane_pair', top, len, 'pair', ids));
          }
        }
      });
    });
  }

  function analyzeCards(cardIds) {
    if (!Array.isArray(cardIds) || cardIds.length === 0 ||
        new Set(cardIds).size !== cardIds.length) return [];
    var ids = cardIds.slice();
    var out = [];
    var byRank = {};
    var counts = {};
    ids.forEach(function (id) {
      var r = rankOf(id);
      (byRank[r] = byRank[r] || []).push(id);
    });
    Object.keys(byRank).forEach(function (r) { counts[r] = byRank[r].length; });
    var ranks = Object.keys(byRank);

    if (ids.length === 1) out.push(mk('single', valueOf(ids[0]), 1, 'none', ids));
    if (ids.length === 2) {
      if (isJoker(ids[0]) && isJoker(ids[1]) && ids[0] !== ids[1]) {
        out.push(mk('rocket', 100, 1, 'none', ids));
      } else if (!isJoker(ids[0]) && ranks.length === 1) {
        out.push(mk('pair', valueOf(ids[0]), 1, 'none', ids));
      }
    }
    if (ids.length === 3 && ranks.length === 1) {
      out.push(mk('triple', valueOf(ids[0]), 1, 'none', ids));
    }
    if (ids.length === 4) {
      if (ranks.length === 1) {
        out.push(mk('bomb', valueOf(ids[0]), 1, 'none', ids));
      } else {
        var tripleRank = findRank(counts, 3);
        if (tripleRank) out.push(mk('triple_single', RANK_VALUE[tripleRank], 1, 'single', ids));
      }
    }
    if (ids.length === 5) {
      var triple5 = findRank(counts, 3);
      if (triple5 && counts[triple5] === 3) {
        var pair5 = findRank(counts, 2);
        if (pair5 && pair5 !== triple5) {
          out.push(mk('triple_pair', RANK_VALUE[triple5], 1, 'pair', ids));
        }
      }
    }
    if (ids.length === 6) {
      var quad6 = findRank(counts, 4);
      if (quad6) out.push(mk('four_two_single', RANK_VALUE[quad6], 1, 'single', ids));
    }
    if (ids.length === 8) {
      var quad8 = findRank(counts, 4);
      if (quad8 && findDistinctPairs(rest(counts, quad8), 2)) {
        out.push(mk('four_two_pair', RANK_VALUE[quad8], 1, 'pair', ids));
      }
    }
    pushContinuous(out, ids, counts);
    return out;
  }

  function primaryPattern(ids) {
    var patterns = analyzeCards(ids);
    if (!patterns.length) return null;
    return patterns.slice().sort(comparePrimary)[0];
  }

  function canBeat(ids, target) {
    return analyzeCards(ids).some(function (pattern) { return patternBeats(pattern, target); });
  }

  function selectBeatingPattern(ids, target) {
    var patterns = analyzeCards(ids);
    var normals = patterns.filter(function (p) {
      return !isBombOrRocket(p) &&
        p.type === target.type &&
        p.length === target.length &&
        p.attachment === target.attachment &&
        p.cardCount === target.cardCount &&
        p.rank > target.rank;
    });
    if (normals.length) return minBy(normals, function (p) { return p.rank; });
    if (target.type !== 'rocket') {
      var bombs = patterns.filter(function (p) {
        return p.type === 'bomb' &&
          (target.type !== 'bomb' || p.rank > target.rank);
      });
      if (bombs.length) return minBy(bombs, function (p) { return p.rank; });
      var rocket = patterns.filter(function (p) { return p.type === 'rocket'; })[0];
      if (rocket) return rocket;
    }
    return null;
  }

  DDZ.Cards = {
    createDeck: createDeck,
    sortCards: sortCards,
    cardLabel: cardLabel,
    analyzeCards: analyzeCards,
    primaryPattern: primaryPattern,
    canBeat: canBeat,
    selectBeatingPattern: selectBeatingPattern
  };
})(typeof window !== 'undefined' ? window : globalThis);
