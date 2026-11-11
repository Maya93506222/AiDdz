(function (root) {
  'use strict';
  var DDZ = (root.DDZ = root.DDZ || {});
  var Cards = DDZ.Cards;

  var RULES_PATH = 'https://transmiao.cn/ddz-rule.html';

  function nameOf(state, id) {
    var p = state.players.filter(function (x) { return x.id === id; })[0];
    return p ? p.name : id;
  }

  function roleText(role) {
    return role === 'landlord' ? '地主' : (role === 'farmer' ? '农民' : '未定');
  }

  function fmtCards(ids, sep) {
    return ids.map(Cards.cardLabel).join(sep || ' ');
  }

  function bidLines(state) {
    return state.history.filter(function (h) { return h.type === 'bid'; })
      .map(function (h) {
        return nameOf(state, h.playerId) +
          (h.score === 0 ? '不叫' : '叫 ' + h.score + ' 分');
      }).join('，') || '无';
  }

  function roundLines(state) {
    var rounds = [];
    var current = null;
    var roundNo = 0;
    state.history.forEach(function (h) {
      if (h.type === 'play') {
        if (!current) {
          roundNo++;
          current = { no: roundNo, actions: [] };
        }
        current.actions.push({ playerId: h.playerId, text: fmtCards(h.cardIds) });
      } else if (h.type === 'pass') {
        if (current) {
          current.actions.push({ playerId: h.playerId, text: '不要' });
        }
      } else if (h.type === 'new_round' || h.type === 'finish') {
        if (current) {
          rounds.push(current);
          current = null;
        }
      }
    });
    if (current) rounds.push(current);
    if (!rounds.length) return '尚无出牌轮次。';
    return rounds.map(function (round) {
      var chain = round.actions.map(function (action) {
        return nameOf(state, action.playerId) + ' ' + action.text;
      }).join(' → ');
      return '- 第 ' + round.no + ' 轮：' + chain;
    }).join('\n');
  }

  function generate(state) {
    if (!state || state.phase !== 'playing') return null;
    var cur = state.currentPlayerId;
    var curPlayer = state.players.filter(function (p) { return p.id === cur; })[0];
    var curName = nameOf(state, cur);
    var lines = [];
    lines.push('# 斗地主残局推理', '');
    lines.push('你是经典斗地主策略分析大师。请根据' + RULES_PATH +
      '中的规则和下列已知的公开历史信息，推断当前玩家' + curName + '下一步最合理的操作。', '');
    lines.push('## 1. 叫分与底牌', '');
    lines.push('- 叫分：' + bidLines(state) + '；' +
      nameOf(state, state.landlordId) + '为地主');
    lines.push('- 底牌：' + fmtCards(state.bottomCards, '、'), '');
    lines.push('## 2. 座位、身份与剩余张数', '');
    ['A', 'B', 'C'].forEach(function (id) {
      var p = state.players.filter(function (x) { return x.id === id; })[0];
      if (id === cur) {
        lines.push('- ' + nameOf(state, id) + '：' + roleText(p.role) +
          '，剩 ' + p.handIds.length + ' 张，手牌：' + fmtCards(p.handIds, '、'));
      } else {
        lines.push('- ' + nameOf(state, id) + '：' + roleText(p.role) +
          '，剩 ' + p.handIds.length + ' 张，手牌不公开');
      }
    });
    lines.push('');
    lines.push('## 3. 已知的公开历史信息', '');
    lines.push(roundLines(state), '');
    lines.push('## 4. 回答要求', '');
    lines.push('现在轮到' + curName + '出牌，请帮助' + curName + '决策，并按以下四项作答：', '');
    lines.push('1. 建议操作：出牌 或 不要。');
    lines.push('2. 具体牌面：逐项列出拟打出的牌，须带花色；若建议「不要」则填"无"。');
    lines.push('3. 牌型：填写实际牌型；若建议「不要」则填"无"。');
    lines.push('4. 简要理由：说明该选择如何配合当前身份、控制出牌权或推进获胜。');
    return lines.join('\n');
  }

  function updatePromptCache(cachedText, state) {
    var text = generate(state);
    return text === null ? cachedText : text;
  }

  DDZ.Prompt = {
    generate: generate,
    updatePromptCache: updatePromptCache
  };
})(typeof window !== 'undefined' ? window : globalThis);
