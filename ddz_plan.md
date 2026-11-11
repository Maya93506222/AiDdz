# AI 斗地主测试软件实施计划

> **For agentic workers:** 请按任务顺序执行；若环境提供子代理，采用子代理驱动开发，否则在当前会话按检查点执行。步骤使用 `- [ ]` 复选框跟踪。

**Goal:** 在 `E:/AiDdz` 实现一套零依赖、双击 `ddz.html` 即可在 Chrome/Edge 的 `file://` 环境运行的三人明牌斗地主测试软件，并通过 Node.js 内置 `node:test` 全量规则测试与浏览器人工验收。

**Architecture:** 四个运行脚本以 IIFE 挂载到统一 `DDZ` 命名空间，按 `cards.js → game.js → prompt.js → ui.js` 由普通 `<script>` 顺序加载；`DDZ.Cards` 为纯牌型函数、`DDZ.Game` 是唯一状态写入方并返回深拷贝快照、`DDZ.Prompt` 只读快照生成文本、`DDZ.UI` 仅负责渲染与事件。规则与状态机由 `tests.js` 以 CommonJS `require` 加载前三个脚本、读取 `globalThis.DDZ` 做无 DOM 自动化测试（不加载 `ui.js`）。

**Tech Stack:** 原生 HTML/CSS/JavaScript、浏览器 file://、Node.js 18.11.0+ 内置 `node:test`（推荐 20 LTS 及以上）

---

## 范围检查

- [ ] 复核目录现状：`E:/AiDdz` 仅有 `ddz_spec.md`(v1.1)、`ddz-rule.html`；无 `package.json`、无子目录、非 Git 仓库。规格中统一口径优先于规则参考文件。
- [ ] 本计划只覆盖规格第 3.1 节首版范围；不做第 3.2 节排除项（联网/AI 调用/癞子/多局积分/撤销/存档/移动端/动画）。
- [ ] 运行文件集合固定 6 个：`ddz.html`、`styles.css`、`cards.js`、`game.js`、`prompt.js`、`ui.js`，全部置于根目录，无子目录；`tests.js` 同在根目录且朋友运行不需要。
- [ ] 不使用 ES Modules、`fetch`、Web Worker、CDN、在线字体、远程资源；不使用任何 npm 包；不写构建脚本。
- [ ] 版本管理：目录非 Git 仓库，本计划用「保存检查点」替代 Commit。如需版本留痕，可**可选**在 Chunk 1 前执行 `git init`（不强制，且不得把 `ddz_spec.md` 之外的新文件加入 .gitignore 影响分发）。
- [ ] 实施门禁遵守：用户批准本计划前，不创建、不修改任何运行代码；本计划中的所有代码块仅为交付给工程师的骨架说明，不是已落盘的代码。

### 统一实现约定（规格未规定、由本计划定死以保证测试可复现）

- [ ] 点数映射 `RANK_VALUE`：`3→3 … 10→10, J→11, Q→12, K→13, A→14, 2→15, XJ→16, BJ→17`；连续主体仅使用值 `3..14`（即 `3..A`），`2` 与王不参与连续。
- [ ] 花色 `SUIT_ORDER`：`S=0, H=1, C=2, D=3`；显示符号 `S:♠ H:♥ C:♣ D:♦`；`XJ→小王`、`BJ→大王`。
- [ ] 发牌切片：洗好的 54 张中 `deck[0..16]→A(甲)`、`deck[17..33]→B(乙)`、`deck[34..50]→C(丙)`、`deck[51..53]→bottomCards`。玩家 ID 数组 `PLAYER_IDS = ['A','B','C']` 定义在 `game.js` 内部；显示名写入 `state.players[].name`，`prompt.js` 与 `ui.js` 一律从状态快照读取名称，不跨文件共享 `NAMES` 全局。
- [ ] 顺序：`nextPlayer(id) = PLAYER_IDS[(PLAYER_IDS.indexOf(id)+1)%3]`；叫分第 `bidCount` 位为 `PLAYER_IDS[(firstIdx+bidCount)%3]`。
- [ ] 首位叫分者：`floor(random()*3)` 的 `0/1/2` 对应 `A/B/C`。洗牌消耗固定：先 53 次 `j=floor(random()*(i+1))`（`i` 从 53→1），再 1 次 `floor(random()*3)`。
- [ ] `pattern` 统一结构（所有牌型函数、历史 `play.pattern`、`lastPlay.pattern` 共用）：
  ```js
  {
    type: 'single'|'pair'|'triple'|'triple_single'|'triple_pair'|'straight'|
          'pair_straight'|'plane'|'plane_single'|'plane_pair'|
          'four_two_single'|'four_two_pair'|'bomb'|'rocket',
    rank: Number,        // 主体点数值；rocket 固定 100
    length: Number,      // 连续主体长度：顺子=张数，连对=组数，飞机=三张组数，其余=1
    attachment: 'none'|'single'|'pair',
    cardCount: Number,   // 总张数
    cardIds: Array       // 排序后的原始牌 ID
  }
  ```
- [ ] 统一 IIFE 骨架（四个 js 文件一致）。红阶段可以先写 `DDZ.Cards = {};`，但**每个实现 Task 末尾必须按当前已实现函数更新导出对象**，否则测试会持续 `is not a function`：
  ```js
  (function (root) {
    'use strict';
    var DDZ = (root.DDZ = root.DDZ || {});
    // ... 本模块函数 ...
    DDZ.Cards = {
      createDeck: createDeck,
      sortCards: sortCards,
      cardLabel: cardLabel
      // Task 2 追加 analyzeCards；Task 4 追加 primaryPattern；
      // Task 5 追加 canBeat、selectBeatingPattern，最终共 7 个接口。
    };
  })(typeof window !== 'undefined' ? window : globalThis);
  ```
- [ ] `cards.js` 内部辅助函数必须在对应 Task 中完整落地，不得只留函数名。统一代码如下（可整体放在 IIFE 内、导出对象之前）；其中 `RANK_VALUE`、`RANK_BY_VALUE`、`sortCards` 等常量/函数来自 Task 1，不得重复声明：
  ```js
  var TABLE_ORDER = ['single','pair','triple','triple_single','triple_pair','straight',
    'pair_straight','plane','plane_single','plane_pair','four_two_single',
    'four_two_pair','bomb','rocket'];
  function mk(type, rank, length, attachment, ids){
    return { type:type, rank:rank, length:length,
             attachment:attachment, cardCount:ids.length,
             cardIds: sortCards(ids) };
  }
  function findRank(counts,n){
    var k=Object.keys(counts).filter(function(r){return counts[r]===n;});
    return k.length ? k[0] : null;
  }
  function rest(counts, excludeRank){
    var o={}; Object.keys(counts).forEach(function(r){
      if (r!==excludeRank) o[r]=counts[r];
    }); return o;
  }
  function findDistinctPairs(counts, need){
    var keys = Object.keys(counts);
    if (keys.length !== need) return null;
    for (var i=0;i<keys.length;i++){
      var r=keys[i];
      if (r==='XJ' || r==='BJ' || counts[r]!==2) return null;
    }
    return keys.sort(function(a,b){ return RANK_VALUE[a]-RANK_VALUE[b]; });
  }
  function minBy(arr, fn){
    return arr.reduce(function(best,x){ return fn(x)<fn(best) ? x : best; });
  }
  function specialScore(p){
    return p.type==='rocket' ? 3 : (p.type==='bomb' ? 2 : 0);
  }
  function comparePrimary(a,b){
    var sa=specialScore(a), sb=specialScore(b);
    if (sa!==sb) return sb-sa;                  // rocket > bomb > 普通
    if (sa===2 && a.rank!==b.rank) return b.rank-a.rank; // 炸弹高点数优先
    var na=a.attachment==='none'?1:0, nb=b.attachment==='none'?1:0;
    if (na!==nb) return nb-na;                  // 无附件优先
    if (a.length!==b.length) return b.length-a.length;
    if (a.rank!==b.rank) return b.rank-a.rank;
    return TABLE_ORDER.indexOf(a.type)-TABLE_ORDER.indexOf(b.type);
  }
  function patternBeats(a, t){
    if (a.type==='rocket') return t.type!=='rocket';
    if (t.type==='rocket') return false;
    if (a.type==='bomb'){
      if (t.type==='bomb') return a.rank>t.rank;
      return true;
    }
    if (t.type==='bomb') return false;
    return a.type===t.type && a.length===t.length &&
           a.attachment===t.attachment && a.cardCount===t.cardCount &&
           a.rank>t.rank;
  }
  function enumRuns(counts, minCount){
    var runs=[];
    for (var s=3; s<=14; ){
      if ((counts[RANK_BY_VALUE[s]]||0) < minCount){ s++; continue; }
      var e=s; while (e+1<=14 && (counts[RANK_BY_VALUE[e+1]]||0)>=minCount) e++;
      runs.push([s,e]); s=e+1;
    }
    return runs;
  }
  function eachSub(run, minLen, cb){
    for (var len=minLen; run[0]+len-1<=run[1]; len++)
      for (var st=run[0]; st+len-1<=run[1]; st++) cb(st,len,st+len-1);
  }
  function pushContinuous(out, ids, counts){
    enumRuns(counts,1).forEach(function(run){
      eachSub(run,5,function(st,len,top){
        if (ids.length!==len) return;
        for (var v=st; v<=top; v++)
          if (counts[RANK_BY_VALUE[v]]!==1) return;
        out.push(mk('straight', top, len, 'none', ids));
      });
    });
    enumRuns(counts,2).forEach(function(run){
      eachSub(run,3,function(st,len,top){
        if (ids.length!==2*len) return;
        for (var v=st; v<=top; v++)
          if (counts[RANK_BY_VALUE[v]]!==2) return;
        out.push(mk('pair_straight', top, len, 'none', ids));
      });
    });
    enumRuns(counts,3).forEach(function(run){
      eachSub(run,2,function(st,len,top){
        if (ids.length===3*len)
          out.push(mk('plane', top, len, 'none', ids));
        else if (ids.length===4*len)
          out.push(mk('plane_single', top, len, 'single', ids));
        else if (ids.length===5*len){
          var restCounts={}; Object.keys(counts).forEach(function(r){ restCounts[r]=counts[r]; });
          for (var v=st; v<=top; v++){
            var r=RANK_BY_VALUE[v]; restCounts[r]-=3;
            if (restCounts[r]===0) delete restCounts[r];
          }
          if (findDistinctPairs(restCounts,len))
            out.push(mk('plane_pair', top, len, 'pair', ids));
        }
      });
    });
  }
  ```
- [ ] 统一命令结果（game.js 全部 5 个命令）：
  ```js
  function ok(events)      { return { ok:true,  state: snapshot(), events: events }; }
  function reject(code,msg){ return { ok:false, error:{code:code,message:msg}, state: snapshot(), events: [] }; }
  function snapshot()      { return JSON.parse(JSON.stringify(state)); }
  ```
  失败路径只调用 `reject`，不得触碰 `state`；`events` 为命令开始时 `history.length` 之后的切片 `history.slice(startLen)`。
- [ ] `game.js` 内部辅助函数、导出对象与测试夹具必须在 Task 6 完整落地，不得只留函数名：
  ```js
  var Cards = DDZ.Cards;
  var PLAYER_IDS = ['A','B','C'];
  var PLAYER_NAMES = { A:'甲', B:'乙', C:'丙' };
  var state = null;
  function getState(){ return snapshot(); }
  function append(rec){
    rec.seq = state.history.length + 1;
    state.history.push(rec);
    return rec;
  }
  function player(id){
    return state.players.filter(function(p){ return p.id===id; })[0];
  }
  function nextPlayer(id){
    return PLAYER_IDS[(PLAYER_IDS.indexOf(id)+1)%3];
  }
  function ensureNotFinished(){
    if (!state) return reject('INVALID_PHASE','请先开局');
    if (state.phase==='finished')
      return reject('GAME_FINISHED','牌局已结束');
    return null;
  }
  function loadStateForTest(s){
    state = JSON.parse(JSON.stringify(s));
    return ok([]);
  }
  DDZ.Game = DDZ.Game || {};
  // 仅 Node 测试暴露；浏览器中不存在，不成为用户功能，也不违反规格 3.2「不含残局编辑」。
  if (typeof window === 'undefined') DDZ.Game.__loadStateForTest = loadStateForTest;
  ```
  每个实现 Task 末尾用 `Object.assign(DDZ.Game, {...})` **增量**追加当前已实现命令，不得整体重赋值，否则会抹掉 `__loadStateForTest`；Task 6 追加 `newGame/getState`，Task 7 追加 `bid/redeal`，Task 8 追加 `play/pass`。
- [ ] `tests.js` 测试夹具在 Task 6 落地（仅供自动化测试，不进入运行分发）：
  ```js
  function randomForDeck(desired, firstIdx){
    var arr = Cards.createDeck();
    var seq = [];
    // 从 i=53 到 1 正向构造：位置 >i 已固定，desired[i] 必在 0..i 内。
    for (var i=53;i>=1;i--){
      var p = arr.indexOf(desired[i]);
      if (p < 0 || p > i) throw new Error('desired 牌堆不是 createDeck 的排列');
      seq.push((p + 0.5)/(i+1));         // 保证 0<=p<=i，且随机值落在 [0,1)
      var t=arr[i]; arr[i]=arr[p]; arr[p]=t;
    }
    seq.push((firstIdx + 0.5)/3);         // 最后一次决定首位叫分者
    var k=0;
    return function(){ return seq[k++]; };
  }
  function deepMerge(target, src){
    Object.keys(src).forEach(function(k){
      if (src[k] && typeof src[k]==='object' && !Array.isArray(src[k]))
        target[k] = deepMerge(target[k] || {}, src[k]);
      else target[k] = src[k];
    });
    return target;
  }
  function makeBaseState(){
    Game.newGame(function(){ return 0; });
    return Game.getState();
  }
  function makeTestState(overrides){
    var s = deepMerge(makeBaseState(), overrides || {});
    Game.__loadStateForTest(s);
    return Game.getState();
  }
  function P(id, handIds, role, bid){
    return { id:id, name:{A:'甲',B:'乙',C:'丙'}[id],
             handIds:handIds.slice(), role:role, bid:bid, score:0 };
  }
  function makeHistory(a, b, c, bottom, landlordId){
    return [
      {seq:1,type:'deal',firstBidderId:'A',
       initialHands:{A:a.slice(),B:b.slice(),C:c.slice()}},
      {seq:2,type:'bid',playerId:landlordId,score:3,highestBid:3},
      {seq:3,type:'landlord',playerId:landlordId,bottomCards:bottom.slice(),
       handAfter:a.slice().concat(bottom.slice())}
    ];
  }
  function playingFixture(overrides){
    var a=['S3','H3','C3','D3','S4'];
    var b=['S5','H5','C5','D5','S6'];
    var c=['S7','H7','C7','D7','S8'];
    var bottom=['S2','H2','C2'];
    var base = {
      phase:'playing', bottomCards:bottom.slice(),
      firstBidderId:'A', highestBid:3, highestBidderId:'A', bidCount:3,
      landlordId:'A', currentPlayerId:'A',
      lastPlay:null, lastPlayPlayerId:null, passCount:0,
      history:makeHistory(a,b,c,bottom,'A'),
      multiplier:1, successfulPlays:{A:0,B:0,C:0},
      winnerSide:null, result:null,
      players:[P('A',a,'landlord',3),P('B',b,'farmer',0),P('C',c,'farmer',0)]
    };
    return makeTestState(deepMerge(base, overrides || {}));
  }
  function followFixture(overrides){
    var a=['S3','H3','C3','D3','S4'];
    var b=['H4','C4','D4','S5','H5'];
    var c=['S6','H6','C6','D6','S7'];
    var bottom=['S2','H2','C2'];
    var base = {
      currentPlayerId:'A', lastPlayPlayerId:'C', passCount:0,
      lastPlay:{playerId:'C',cardIds:['S3'],pattern:Cards.primaryPattern(['S3'])},
      history:makeHistory(a,b,c,bottom,'A'),
      players:[P('A',a,'landlord',3),P('B',b,'farmer',0),P('C',c,'farmer',0)]
    };
    return playingFixture(deepMerge(base, overrides || {}));
  }
  function multiBombFixture(){
    var a=['S5','H5','C5','D5','S6','H6','C6','D6'];
    var b=['S9']; var c=['S10']; var bottom=['S2','H2','C2'];
    return playingFixture({
      currentPlayerId:'A', lastPlay:null, lastPlayPlayerId:null,
      passCount:0, multiplier:1, successfulPlays:{A:1,B:1,C:0},
      history:makeHistory(a,b,c,bottom,'A'),
      players:[P('A',a,'landlord',3),P('B',b,'farmer',0),P('C',c,'farmer',0)]
    });
  }
  function bombRocketFixture(){
    var a=['S5','H5','C5','D5','XJ','BJ'];
    var b=['S9']; var c=['S10']; var bottom=['S2','H2','C2'];
    return playingFixture({
      currentPlayerId:'A', lastPlay:null, lastPlayPlayerId:null,
      passCount:0, multiplier:1, successfulPlays:{A:1,B:1,C:0},
      history:makeHistory(a,b,c,bottom,'A'),
      players:[P('A',a,'landlord',3),P('B',b,'farmer',0),P('C',c,'farmer',0)]
    });
  }
  function lastHandFixture(opts){
    opts = opts || {};
    var winner = opts.winner || 'A';
    var lastCards = opts.lastCards || ['S3'];
    var placeholders = {A:'S9',B:'H9',C:'D9'};
    var hands = {};
    ['A','B','C'].forEach(function(id){
      hands[id] = id===winner ? lastCards.slice() : [placeholders[id]];
    });
    var successful = winner==='A' ? {A:1,B:1,C:0} : {A:2,B:0,C:0};
    if (opts.successfulPlays) successful = opts.successfulPlays;
    var bottom=['S2','H2','C2'];
    return playingFixture({
      currentPlayerId:winner, lastPlay:null, lastPlayPlayerId:null,
      passCount:0, successfulPlays:successful,
      multiplier:opts.multiplier || 1,
      history:makeHistory(hands.A,hands.B,hands.C,bottom,'A'),
      players:[P('A',hands.A,'landlord',3),P('B',hands.B,'farmer',0),P('C',hands.C,'farmer',0)]
    });
  }
  ```
  `makeTestState` 用公开快照构造边界状态，再经测试专用 `__loadStateForTest` 注入；浏览器运行时不暴露该接口。`playingFixture` 给出叫 3 分后进入 `playing` 的完整状态；`followFixture` 给出 C 已领出 `S3`、A 待跟牌的确定局势；`multiBombFixture` 让 A 可用两个炸弹配合两家不要真实打出两次倍数，`bombRocketFixture` 让 A 真实打出「炸弹 + 火箭」混合倍数；`lastHandFixture` 支持 A/B/C 任一获胜者持 `lastCards`，默认成功出牌次数为普通胜负（不叠加春天/反春），春天/反春由测试显式覆盖。所有夹具都使用 `makeHistory` 保持 `seq` 从 1 连续，不用整体替换历史数组注入倍数事件。
- [ ] 错误码枚举（UI 映射为固定中文文案，不渲染异常 HTML）：`INVALID_PHASE`、`NOT_CURRENT_PLAYER`、`INVALID_BID`、`BID_NOT_HIGHER`、`EMPTY_SELECTION`、`CARD_NOT_OWNED`、`DUPLICATE_CARD`、`INVALID_PATTERN`、`CANNOT_BEAT`、`CANNOT_PASS_FREE`、`GAME_FINISHED`。
- [ ] `error.code` 测试命名前缀：`Cards:`、`Game:`、`Prompt:`、`Security:`，便于 `--test-name-pattern` 按模块过滤。
- [ ] `tests.js` 头部按 Chunk 递增，不得在 Task 1 提前 `require` 尚未创建的文件：
  - Task 1 初始头部：
    ```js
    const test = require('node:test');
    const assert = require('node:assert');
    require('./cards.js');
    const DDZ = globalThis.DDZ;
    const { Cards } = DDZ;
    ```
  - Task 6 新建 `game.js` 后追加 `require('./game.js');`，并把解构改为 `const { Cards, Game } = DDZ;`。
  - Task 10 新建 `prompt.js` 后追加 `require('./prompt.js');`，并把解构改为 `const { Cards, Game, Prompt } = DDZ;`。

## 文件结构映射

| 路径 | 类别 | 职责（严格对应规格 5.1） |
|---|---|---|
| `E:/AiDdz/ddz.html` | Create 运行 | 静态容器、按序 `<script src>`、link/script 加载失败处理、末尾启动检查与缺文件固定提示 |
| `E:/AiDdz/styles.css` | Create 运行 | 牌桌布局、牌面、选中态、当前玩家高亮（边框+文字双表达）、禁用态、滚动区、无外部资源 |
| `E:/AiDdz/cards.js` | Create 运行 | `DDZ.Cards`：`createDeck/sortCards/analyzeCards/primaryPattern/canBeat/selectBeatingPattern/cardLabel`，纯规则、无 DOM/状态 |
| `E:/AiDdz/game.js` | Create 运行 | `DDZ.Game`：`newGame/bid/redeal/play/pass/getState`，唯一写状态、深拷贝快照、统一结果、历史追加 |
| `E:/AiDdz/prompt.js` | Create 运行 | `DDZ.Prompt`：`generate/updatePromptCache`，只读状态、固定模板、纯函数缓存 |
| `E:/AiDdz/ui.js` | Create 运行 | `DDZ.UI`：初始化监听、渲染、选牌/叫分/出牌/不要/取消/重发/新开/复制、标签页、缓存更新、beforeunload |
| `E:/AiDdz/tests.js` | Create 测试 | `node:test` 全量自动化 + 最小安全静态检查；CommonJS `require` 前三个脚本，不加载 `ui.js` |
| `E:/AiDdz/ddz_spec.md` | 现有 | 已批准规格，只读引用；不作为运行文件 |
| `E:/AiDdz/ddz-rule.html` | 现有 | 背景参考，只读；冲突时以规格为准 |

依赖方向：`ui.js → game.js → cards.js`，`ui.js → prompt.js → cards.js`；`game.js` 不依赖界面与提示词；跨文件只经 `DDZ`。

---

## Chunk 1: 基础与牌型规则

目标：建立无 DOM 依赖的 `cards.js` 全部 7 个接口，配 `tests.js` 中 `Cards:` 组测试。本块不涉及牌局状态。

### Task 1: 测试骨架、牌堆、排序与牌面

**Files:**
- Create: `E:/AiDdz/tests.js`
- Create: `E:/AiDdz/cards.js`
- Test: `node --test --test-name-pattern="Cards: 基础" tests.js`

- [ ] 在 `cards.js` 写入统一 IIFE 骨架，仅 `DDZ.Cards = {};`（空对象，无函数），确保 `require('./cards.js')` 成功但接口缺失。
- [ ] 在 `tests.js` 只写入「统一约定」中 Task 1 初始头部（仅 `require('./cards.js')`）与 4 个失败测试：
  - `Cards: 基础 createDeck 返回 54 张唯一 ID`（断言 `new Set(deck).size === 54`、含 `XJ`/`BJ`、含 `S3`/`H10`）
  - `Cards: 基础 sortCards 降序且王/2 顺序正确`（如 `['S3','BJ','H3','XJ','D2']` 排序后 `BJ,XJ,D2,H3/S3`，花色 S 先于 H）
  - `Cards: 基础 sortCards 不修改入参`
  - `Cards: 基础 cardLabel 带花色与中文王`（`cardLabel('H10')==='♥10'`、`cardLabel('XJ')==='小王'`、`cardLabel('BJ')==='大王'`）
- [ ] 运行 `node --test --test-name-pattern="Cards: 基础" tests.js`
      预期：4 个 `not ok`，报 `Cards.createDeck is not a function` 等，TAP 汇总 `# fail 4`、`# pass 0`（确认因实现缺失而失败）。
- [ ] 在 `cards.js` 实现常量与 3 个函数骨架：
  ```js
  var NORMAL_RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2']; // 13 个
  var RANK_VALUE = { '3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,
                     J:11,Q:12,K:13,A:14,'2':15,XJ:16,BJ:17 };
  var RANK_BY_VALUE = { 3:'3',4:'4',5:'5',6:'6',7:'7',8:'8',9:'9',10:'10',
                        11:'J',12:'Q',13:'K',14:'A' };
  var SUIT_ORDER = { S:0,H:1,C:2,D:3 };
  var SUIT_SYMBOL = { S:'♠',H:'♥',C:'♣',D:'♦' };
  function rankOf(id){ return (id==='XJ'||id==='BJ') ? id : id.slice(1); }
  function valueOf(id){ return RANK_VALUE[rankOf(id)]; }
  function isJoker(id){ return id==='XJ'||id==='BJ'; }
  function createDeck(){
    var d=[];
    for (var s=0;s<4;s++) for (var r=0;r<13;r++) d.push(['S','H','C','D'][s]+NORMAL_RANKS[r]);
    d.push('XJ','BJ'); return d; // 54
  }
  function sortCards(ids){
    return ids.slice().sort(function(a,b){
      var d = valueOf(b)-valueOf(a);
      if (d!==0) return d;
      return (SUIT_ORDER[a[0]]||0)-(SUIT_ORDER[b[0]]||0); // 同值必为普通牌
    });
  }
  function cardLabel(id){
    if (id==='XJ') return '小王';
    if (id==='BJ') return '大王';
    return SUIT_SYMBOL[id[0]] + rankOf(id);
  }
  ```
- [ ] 把 `DDZ.Cards` 更新为 `{ createDeck:createDeck, sortCards:sortCards, cardLabel:cardLabel }`，不要继续保留空对象。
- [ ] 运行 `node --test --test-name-pattern="Cards: 基础" tests.js`
      预期：`# pass 4`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：`# pass 4`、`# fail 0`。
- [ ] 保存检查点：记录已建 `tests.js`、`cards.js`（3 接口），记录上述两条命令通过数（4/4、4/4）。

### Task 2: 基础牌型识别（单/对/三/三带一/三带二/炸弹/火箭/四带二）

**Files:**
- Modify: `E:/AiDdz/cards.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Cards: 基础牌型" tests.js`

- [ ] 在 `tests.js` 追加 `Cards: 基础牌型` 组共 **9 个** `test()` 用例（合法与非法样例，覆盖规格 11.1）：
  - [ ] 用例 1：单张 `['S3']`→`single`；对子 `['S3','H3']`→`pair`；`['XJ','BJ']` 不是对子；三张 `['S3','H3','C3']`→`triple`
  - [ ] 用例 2：三带一 `['S3','H3','C3','S4']`→`triple_single`；`3+1` 同点非法（无 `triple_single`）
  - [ ] 用例 3：三带二 `['S3','H3','C3','S4','H4']`→`triple_pair`；`3+2` 同点非法
  - [ ] 用例 4：`['S5','H5','C5','D5']` 只返回 `bomb`（不返回 `triple_single`，规格 7.5 补充 4）
  - [ ] 用例 5：`['XJ','BJ']`→`rocket`；`['XJ','XJ']` 重复 ID 由 cards 层返回空
  - [ ] 用例 6：`['S5','H5','C5','D5','S3','H3']` 与 `['S5','H5','C5','D5','S3','H4']` 均为 `four_two_single`，分别覆盖附件同点和附件不同点
  - [ ] 用例 7：`['S5','H5','C5','D5','S3','H3','C4','D4']`→`four_two_pair`；两对子同点非法
  - [ ] 用例 8：四带二**不**返回 `bomb`
  - [ ] 用例 9：`['S5','H5','C5','D5','S3']`、`['XJ','BJ','S3']` 等多张牌不因包含炸弹或火箭而整组识别为 `bomb`/`rocket`（规格 7.5 补充 6）
- [ ] 运行 `node --test --test-name-pattern="Cards: 基础牌型" tests.js`
      预期：9 个 `not ok`（`analyzeCards is not a function`），TAP 汇总 `# fail 9`、`# pass 0`。
- [ ] 在 `cards.js` 实现 `analyzeCards` 主体（先处理非连续分支，连续分支按 Task 3 调用 `pushContinuous`）；下方代码块中的 `mk`、`findRank` 与「统一约定」完整代码重复，落地时只保留一份定义：
  ```js
  function mk(type, rank, length, attachment, ids){
    return { type:type, rank:rank, length:length,
             attachment:attachment, cardCount:ids.length,
             cardIds: sortCards(ids) };
  }
  function analyzeCards(cardIds){
    if (!Array.isArray(cardIds) || cardIds.length===0 ||
        new Set(cardIds).size !== cardIds.length) return []; // 重复 ID 视为非法
    var ids = cardIds.slice(), out = [], byRank = {}, counts = {};
    ids.forEach(function(id){ var r=rankOf(id); (byRank[r]=byRank[r]||[]).push(id); });
    Object.keys(byRank).forEach(function(r){ counts[r]=byRank[r].length; });
    var ranks = Object.keys(byRank);
    if (ids.length===1) out.push(mk('single', valueOf(ids[0]),1,'none',ids));
    if (ids.length===2){
      if (isJoker(ids[0])&&isJoker(ids[1])&&ids[0]!==ids[1])
        out.push(mk('rocket',100,1,'none',ids));
      else if (!isJoker(ids[0])&&ranks.length===1)
        out.push(mk('pair',valueOf(ids[0]),1,'none',ids));
    }
    if (ids.length===3 && ranks.length===1) out.push(mk('triple',valueOf(ids[0]),1,'none',ids));
    if (ids.length===4){
      if (ranks.length===1) out.push(mk('bomb',valueOf(ids[0]),1,'none',ids));
      else { var t=findRank(counts,3);
             if (t) out.push(mk('triple_single',RANK_VALUE[t],1,'single',ids)); }
    }
    if (ids.length===5){ var t5=findRank(counts,3);
      if (t5 && counts[t5]===3){ var pr=findRank(counts,2);
        if (pr && pr!==t5) out.push(mk('triple_pair',RANK_VALUE[t5],1,'pair',ids)); } }
    if (ids.length===6){ var q=findRank(counts,4);
      if (q) out.push(mk('four_two_single',RANK_VALUE[q],1,'single',ids)); } // 附件 2 张允许同点
    if (ids.length===8){ var q8=findRank(counts,4);
      if (q8){ /* 剩余 4 张须拆成 2 个不同点数对子 */ var pairs=findDistinctPairs(rest(counts,q8),2);
        if (pairs) out.push(mk('four_two_pair',RANK_VALUE[q8],1,'pair',ids)); } }
    // 连续主体（顺子/连对/飞机）在 Task 3 追加到 out
    return out;
  }
  function findRank(counts,n){ var k=Object.keys(counts).filter(function(r){return counts[r]===n;}); return k.length?k[0]:null; }
  ```
  - [ ] 把「统一约定」中已给出完整代码的 `mk`、`findRank`、`rest`、`findDistinctPairs` 等内部辅助函数复制/落地到 `cards.js`；`findDistinctPairs` 只接受点数互不相同的对子，王不成对。
  - [ ] `four_two_single` 的四张主体不得再被识别为 `bomb`（`ids.length===6` 分支不调用 4 张炸弹逻辑）。
  - [ ] 把 `DDZ.Cards` 导出对象追加 `analyzeCards: analyzeCards`，当前共 4 个接口。
- [ ] 运行 `node --test --test-name-pattern="Cards: 基础牌型" tests.js`
      预期：全组 `# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录 `analyzeCards` 非连续分支完成、累计通过数。

### Task 3: 连续牌型识别（顺子/连对/飞机）

**Files:**
- Modify: `E:/AiDdz/cards.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Cards: 连续牌型" tests.js`

- [ ] 在 `tests.js` 追加 `Cards: 连续牌型` 组共 **6 个** `test()` 用例：
  - [ ] 用例 1：顺子 `34567` 合法、`10JQKA` 合法、含 `2`/王非法、4 张非法、断档非法
  - [ ] 用例 2：连对 `334455` 合法、2 组非法、含 `2`/王非法、非连续非法
  - [ ] 用例 3：飞机不带 `333444` 合法；带单 `333444+5+6`（8 张）合法；带对 `333444+55+66`（10 张）合法
  - [ ] 用例 4：不连续主体（`333555`）、附件数量错、带对重复点数非法
  - [ ] 用例 5：`33334445`（8 张）可解释为 `333444` 带单 `3`、`5`（规格 7.5 补充 2，附件可用主体第四张余牌）
  - [ ] 用例 6：三组及以上连续三张主体合法
- [ ] 运行 `node --test --test-name-pattern="Cards: 连续牌型" tests.js`
      预期：6 个 `not ok`，TAP 汇总 `# fail 6`、`# pass 0`。
- [ ] 把「统一约定」中已给出完整代码的 `enumRuns`、`eachSub`、`pushContinuous` 落地到 `cards.js`；其中 `pushContinuous(out, ids, counts)` 已明确：
  - 顺子：枚举 `count>=1` 的连续段中长度 `>=5` 子段，且该子段每个点数计数恰为 1，`mk('straight', top, len, 'none', ids)`。
  - 连对：枚举 `count>=2` 的连续段中长度 `>=3` 子段，且每个点数计数恰为 2，`mk('pair_straight', top, len, 'none', ids)`。
  - 飞机：枚举 `count>=3` 的连续段中长度 `>=2` 子段；`ids.length===3*len` → `plane`；`===4*len` → `plane_single`；`===5*len` 且剩余可拆成 `len` 个不同点数对子 → `plane_pair`。
  - 连续段只在值 `3..14` 内构造，`2`(15)/王(16,17) 永不进入主体。
- [ ] 在 `analyzeCards` 的 `return out;` 之前增加一次 `pushContinuous(out, ids, counts);`，不得继续只有注释。
- [ ] 本 Task 不新增对外接口，`DDZ.Cards` 导出对象保持 4 个，但 `analyzeCards` 内部结果已覆盖全部 14 种牌型。
- [ ] 运行 `node --test --test-name-pattern="Cards: 连续牌型" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录连续牌型枚举完成、累计通过数。

### Task 4: 主解释选择（primaryPattern）

**Files:**
- Modify: `E:/AiDdz/cards.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Cards: 主解释" tests.js`

- [ ] 在 `tests.js` 追加 `Cards: 主解释` 组共 **3 个** `test()` 用例：
  - [ ] 用例 1：单解释原样返回；`33334445` 等同时有飞机带单与其它解释时返回稳定唯一值
  - [ ] 用例 2：优先级验证：`rocket` > `bomb` > 普通、无附件 > 带附件、主体连续组数多者优先、主体点数高者优先、规格 7.5 表格靠前者优先；多解释牌组返回稳定唯一值
  - [ ] 用例 3：非法牌返回 `null`
- [ ] 运行 `node --test --test-name-pattern="Cards: 主解释" tests.js`
      预期：3 个 `not ok`（`primaryPattern is not a function`），TAP 汇总 `# fail 3`、`# pass 0`。
- [ ] 实现 `primaryPattern`，直接使用「统一约定」中已给出完整代码的 `TABLE_ORDER`、`specialScore`、`comparePrimary`：
  ```js
  function primaryPattern(ids){
    var ps = analyzeCards(ids);
    if (!ps.length) return null;
    return ps.slice().sort(comparePrimary)[0];
  }
  ```
- [ ] 把 `DDZ.Cards` 导出对象追加 `primaryPattern: primaryPattern`，当前共 5 个接口。
- [ ] 运行 `node --test --test-name-pattern="Cards: 主解释" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录 `primaryPattern` 完成、累计通过数。

### Task 5: 比较与跟牌选择（canBeat / selectBeatingPattern）

**Files:**
- Modify: `E:/AiDdz/cards.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Cards: 比较" tests.js`

- [ ] 在 `tests.js` 追加 `Cards: 比较` 组共 **4 个** `test()` 用例；`patternBeats` 是内部函数，不直接测试，统一经公开的 `canBeat` / `selectBeatingPattern` 间接断言：
  - [ ] 用例 1：同型同结构同附件同张数且 rank 更大才压过；三带一/三带二、飞机三形态、四带二两形态、不同长度顺子/连对/飞机互不压
  - [ ] 用例 2：炸弹压普通、大炸弹压小炸弹、同点炸弹不互压；火箭压一切、火箭不被压；普通牌不能压炸弹/火箭
  - [ ] 用例 3：`canBeat` 对多解释候选返回布尔；`selectBeatingPattern` 按「同型普通且最小可压过主体 → 能压过的最低点数炸弹 → 火箭」返回唯一解释
  - [ ] 用例 4：多解释跟牌采用最小可压过主体（规格 11.1）
- [ ] 运行 `node --test --test-name-pattern="Cards: 比较" tests.js`
      预期：4 个 `not ok`，TAP 汇总 `# fail 4`、`# pass 0`。
- [ ] 把「统一约定」中已给出完整代码的 `patternBeats`、`minBy` 落地到 `cards.js`；再实现以下两个公开函数：
  ```js
  function isBombOrRocket(p){ return p.type==='bomb' || p.type==='rocket'; }
  function canBeat(ids, target){
    return analyzeCards(ids).some(function(p){ return patternBeats(p, target); });
  }
  function selectBeatingPattern(ids, target){
    var ps = analyzeCards(ids);
    var normals = ps.filter(function(p){
      return !isBombOrRocket(p) && p.type===target.type &&
             p.length===target.length && p.attachment===target.attachment &&
             p.cardCount===target.cardCount && p.rank>target.rank;
    });
    if (normals.length) return minBy(normals, function(p){return p.rank;});
    if (target.type!=='rocket'){
      var bombs = ps.filter(function(p){
        return p.type==='bomb' &&
               (target.type!=='bomb' || p.rank>target.rank);
      });
      if (bombs.length) return minBy(bombs, function(p){return p.rank;});
      var rocket = ps.filter(function(p){ return p.type==='rocket'; })[0];
      if (rocket) return rocket;
    }
    return null;
  }
  ```
  - [ ] 跟牌普通解释必须与 `target` 同 `type/length/attachment/cardCount`（规格 7.6），普通解释优先于炸弹、炸弹优先于火箭。
  - [ ] 把 `DDZ.Cards` 导出对象更新为最终 7 个接口：`createDeck/sortCards/cardLabel/analyzeCards/primaryPattern/canBeat/selectBeatingPattern`。
- [ ] 运行 `node --test --test-name-pattern="Cards: 比较" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：`Cards:` 全组累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录 `cards.js` 7 接口全部完成、`node --test tests.js` 通过数、无 DOM 依赖确认。

### 本块完成判据

- `node --test --test-name-pattern="Cards" tests.js` 全通过，`# fail 0`。
- `createDeck` 54 张唯一；`sortCards` 稳定（王/2/花色）；`cardLabel` 精确花色文本。
- 14 种牌型的合法/非法样例、`5555+33`、四张同点只识别炸弹、飞机多解释与附件余牌、同点炸弹不互压、多解释跟牌唯一选择均被测试覆盖且通过。
- `cards.js` 可被 Node 直接 `require`，不含 DOM 操作，也不引用 `document`；仅允许统一 IIFE 根对象表达式中的 `typeof window` 环境判断。

---

## Chunk 2: 牌局状态机与提示词

目标：实现 `game.js` 全状态机与 `prompt.js`，配 `Game:`、`Prompt:` 组测试。本块仍不加载 DOM，不写 `ui.js`。

### Task 6: game.js 骨架、发牌、快照与统一结果

**Files:**
- Create: `E:/AiDdz/game.js`
- Read: `E:/AiDdz/cards.js`（只读依赖，不修改）
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Game: 发牌" tests.js`

- [ ] 在 `game.js` 写入统一 IIFE 骨架，红阶段仅 `DDZ.Game = {};`；在 `tests.js` 头部追加 `require('./game.js');` 并把解构改为 `const { Cards, Game } = DDZ;`。
- [ ] 在 `tests.js` 落地「统一约定」中的 `randomForDeck/deepMerge/makeBaseState/makeTestState/P/makeHistory/playingFixture/followFixture/multiBombFixture/bombRocketFixture/lastHandFixture` 完整代码；它们只在 Node 测试中使用。
- [ ] 在 `tests.js` 追加 `Game: 发牌` 失败测试：
  - `newGame(random)` 返回 `ok:true`，`state.phase==='bidding'`，三家各 17 张、底牌 3 张、54 张无重复
  - 注入固定 `random`（如恒定 `0` 序列）可复现：完整洗牌 53 次 + 1 次首家随机的消耗顺序，首位叫分者确定
  - `history` 仅含 1 条 `deal`，含 `firstBidderId` 与三家 `initialHands`（各 17），**不含**底牌
  - `getState()` 与命令 `state` 均为深拷贝：外部修改快照后内部不变
  - `events` 与 `history` 本次追加记录一致
  - 初始字段：`highestBid=0`、`landlordId=null`、`multiplier=1`、`successfulPlays={A:0,B:0,C:0}`、`result=null`、`lastPlay=null`、`passCount=0`
- [ ] 运行 `node --test --test-name-pattern="Game: 发牌" tests.js`
      预期：6 个 `not ok`、`Game.newGame is not a function`，TAP 汇总 `# fail 6`、`# pass 0`。
- [ ] 在 `game.js` 落地「统一约定」中的 `Cards/PLAYER_IDS/PLAYER_NAMES/state/getState/append/player/nextPlayer/ensureNotFinished/loadStateForTest/ok/reject/snapshot/DDZ.Game` 完整代码；再实现 `shuffle` 与 `newGame`：
  ```js
  function shuffle(deck, random){
    for (var i=53;i>=1;i--){ var j=Math.floor(random()*(i+1));
      var t=deck[i]; deck[i]=deck[j]; deck[j]=t; } return deck;
  }
  function newGame(random){
    random = random || Math.random;
    var deck = shuffle(Cards.createDeck(), random);
    var firstIdx = Math.floor(random()*3);
    var hands = { A:Cards.sortCards(deck.slice(0,17)),
                  B:Cards.sortCards(deck.slice(17,34)),
                  C:Cards.sortCards(deck.slice(34,51)) };
    var bottom = deck.slice(51,54);
    var players = PLAYER_IDS.map(function(id){
      return { id:id, name:PLAYER_NAMES[id], handIds:hands[id].slice(),
               role:null, bid:null, score:0 };
    });
    state = { phase:'bidding', players:players, bottomCards:bottom,
      firstBidderId: PLAYER_IDS[firstIdx], highestBid:0, highestBidderId:null,
      bidCount:0, landlordId:null, currentPlayerId: PLAYER_IDS[firstIdx],
      lastPlay:null, lastPlayPlayerId:null, passCount:0, history:[],
      multiplier:1, successfulPlays:{A:0,B:0,C:0}, winnerSide:null, result:null };
    var ev = [ append({ type:'deal', firstBidderId:state.firstBidderId,
                        initialHands:{A:hands.A.slice(),B:hands.B.slice(),C:hands.C.slice()} }) ];
    return ok(ev);
  }
  ```
  - [ ] 用 `Object.assign(DDZ.Game, { newGame:newGame, getState:getState })` 增量导出；测试专用 `__loadStateForTest` 已在统一约定代码中于 `typeof window === 'undefined'` 时挂上，不得覆盖。
  - [ ] `snapshot()` 用 `JSON.parse(JSON.stringify(state))`；`ok/reject` 见统一约定。
- [ ] 运行 `node --test --test-name-pattern="Game: 发牌" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass（Cards + Game 发牌）、`# fail 0`。
- [ ] 保存检查点：记录 `game.js` 发牌/快照完成、通过数。

### Task 7: 叫分状态机（bid / redeal / 确定地主）

**Files:**
- Modify: `E:/AiDdz/game.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Game: 叫分" tests.js`

- [ ] 在 `tests.js` 追加 `Game: 叫分` 失败测试：
  - 后叫必须 `> highestBid`；`0` 不叫始终合法；分数非 `0/1/2/3` 拒绝；非当前玩家拒绝；非 `bidding` 阶段拒绝；失败 `events:[]` 且状态/历史完全不变
  - 叫 `3` 立即成为地主：`landlord` 事件含 `bottomCards` 与 `handAfter`（20 张），`phase='playing'`、`currentPlayerId=landlordId`，`bidCount` 不再增长
  - 三家各叫一次后最高分者成为地主（`landlordId`/`highestBidderId` 为 `B`，`highestBid` 为对应分值）
  - 三家均不叫 → `phase='redeal'`、`currentPlayerId=null`、底牌不发放、不进 `playing`
  - `redeal` 阶段仅 `redeal()` 与 `newGame()` 可用；其他阶段调用 `redeal()` 必须 `ok:false`
  - `redeal(random)` 后状态完整重置、`history` 重新从 `deal` 开始
  - `bid` 历史 `type='bid'` 含 `playerId/score/highestBid`；`landlord` 紧跟最后一条 `bid`
- [ ] 运行 `node --test --test-name-pattern="Game: 叫分" tests.js`
      预期：7 个 `not ok`、`Game.bid is not a function` 等，TAP 汇总 `# fail 7`、`# pass 0`。
- [ ] 实现 `bid(playerId, score)`；`bid/redeal/play/pass` 四个改状态命令开头先调用 `ensureNotFinished()`，结束后统一返回 `GAME_FINISHED`；`newGame/getState` 在结束后仍可用：
  ```js
  function bid(playerId, score){
    var fin = ensureNotFinished(); if (fin) return fin;
    if (state.phase!=='bidding') return reject('INVALID_PHASE','当前不是叫分阶段');
    if (playerId!==state.currentPlayerId) return reject('NOT_CURRENT_PLAYER','不是当前行动玩家');
    if (![0,1,2,3].includes(score)) return reject('INVALID_BID','叫分必须是 0/1/2/3');
    if (score>0 && score<=state.highestBid) return reject('BID_NOT_HIGHER','叫分必须高于当前最高分');
    var startLen = state.history.length;
    state.bidCount++;
    var p = player(playerId); p.bid = score;
    if (score>state.highestBid){ state.highestBid=score; state.highestBidderId=playerId; }
    append({ type:'bid', playerId:playerId, score:score, highestBid:state.highestBid });
    var ev;
    if (score===3) ev = finishBidding(playerId);
    else if (state.bidCount===3) ev = state.highestBid>0
        ? finishBidding(state.highestBidderId)
        : (function(){ state.phase='redeal'; state.currentPlayerId=null;
                       return []; })();
    else { state.currentPlayerId = PLAYER_IDS[(PLAYER_IDS.indexOf(state.firstBidderId)+state.bidCount)%3]; ev=[]; }
    return ok(state.history.slice(startLen));
  }
  function finishBidding(landlordId){
    state.landlordId=landlordId; state.phase='playing';
    state.currentPlayerId=landlordId;
    var lp=player(landlordId);
    lp.handIds = Cards.sortCards(lp.handIds.concat(state.bottomCards));
    PLAYER_IDS.forEach(function(id){ player(id).role = id===landlordId?'landlord':'farmer'; });
    return [ append({ type:'landlord', playerId:landlordId,
                      bottomCards: state.bottomCards.slice(),
                      handAfter: lp.handIds.slice() }) ];
  }
  ```
  - [ ] `redeal(random)` 完整实现：
    ```js
    function redeal(random){
      var fin = ensureNotFinished(); if (fin) return fin;
      if (state.phase!=='redeal') return reject('INVALID_PHASE','当前不能重新发牌');
      return newGame(random);
    }
    ```
  - [ ] `newGame(random)` 任意阶段调用均直接重置（规格 5.1）；`finished` 阶段也要能新开一局。
  - [ ] 用 `Object.assign(DDZ.Game, { bid:bid, redeal:redeal })` 增量导出，保留 Task 6 已挂的 `newGame/getState/__loadStateForTest`。
- [ ] 运行 `node --test --test-name-pattern="Game: 叫分" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录叫分/redeal/确定地主完成、通过数。

### Task 8: 出牌 / 不要 / 回合推进（play / pass）

**Files:**
- Modify: `E:/AiDdz/game.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Game: 出牌" tests.js`

- [ ] 在 `tests.js` 追加 `Game: 出牌` 组共 **7 个** `test()` 用例；自由领出用 `playingFixture()`，跟牌/不要统一用 `followFixture()`，不再用模糊的「脚本化叫分」：
  - [ ] 用例 1：`playingFixture()` 下自由出牌不能不要（`pass` 拒绝 `CANNOT_PASS_FREE`）；`followFixture()` 下跟牌可以不要
  - [ ] 用例 2：非法牌型（`INVALID_PATTERN`）、不能压过（`CANNOT_BEAT`）、非当前玩家牌（`CARD_NOT_OWNED`）、重复牌 ID（`DUPLICATE_CARD`）、空选择（`EMPTY_SELECTION`）全部 `ok:false`、`events:[]`、状态与历史完全不变
  - [ ] 用例 3：有效出牌：扣减手牌、追加 `play`（含 `pattern/remainingCount`）、`successfulPlays+1`、`passCount=0`、未结束则移交下家
  - [ ] 用例 4：`followFixture()` 的 `lastPlay.pattern` 用 `Cards.primaryPattern(['S3'])` 固定为上家领出解释；调用 `Game.play('A',['S4'])` 后，新 `lastPlay` 写入 `selectBeatingPattern` 选出的同型 `single` 解释，测到「同型普通牌最小可压过优先」
  - [ ] 用例 5：`followFixture()` 下 `Game.pass('A')` 后 `Game.play('B',['S5'])`，`passCount` 重新归零
  - [ ] 用例 6：`followFixture()` 下 `Game.pass('A')`、`Game.pass('B')`，先第二条 `pass` 再 `new_round`，`lastPlay` 清空、`passCount=0`、`currentPlayerId='C'`（`lastPlayPlayerId` 已在夹具中设为 C）
  - [ ] 用例 7：`play` 的 `pattern` 字段为实际采用的解释对象
- [ ] 运行 `node --test --test-name-pattern="Game: 出牌" tests.js`
      预期：7 个 `not ok`、`Game.play is not a function` 等，TAP 汇总 `# fail 7`、`# pass 0`。
- [ ] 实现 `play(playerId, cardIds)`（先全量校验，后提交）：
  ```js
  function play(playerId, cardIds){
    var fin = ensureNotFinished(); if (fin) return fin;
    if (state.phase!=='playing') return reject('INVALID_PHASE','当前不是出牌阶段');
    if (playerId!==state.currentPlayerId) return reject('NOT_CURRENT_PLAYER','不是当前行动玩家');
    if (!Array.isArray(cardIds)||!cardIds.length) return reject('EMPTY_SELECTION','请先选择手牌');
    if (new Set(cardIds).size!==cardIds.length) return reject('DUPLICATE_CARD','存在重复牌');
    var hand = player(playerId).handIds;
    if (!cardIds.every(function(id){ return hand.indexOf(id)>=0; }))
      return reject('CARD_NOT_OWNED','选择了不属于当前玩家的牌');
    var pattern;
    if (state.lastPlay===null) pattern = Cards.primaryPattern(cardIds);
    else pattern = Cards.selectBeatingPattern(cardIds, state.lastPlay.pattern);
    if (!pattern) return reject(state.lastPlay?'CANNOT_BEAT':'INVALID_PATTERN',
                                state.lastPlay?'不能压过当前有效牌':'非法牌型');
    var startLen = state.history.length;
    // 提交：移除手牌、更新统计与 lastPlay
    player(playerId).handIds = hand.filter(function(id){ return cardIds.indexOf(id)<0; });
    state.successfulPlays[playerId]++;
    state.lastPlay = { playerId:playerId, cardIds:Cards.sortCards(cardIds),
                       pattern:pattern };
    state.lastPlayPlayerId = playerId;
    state.passCount = 0;
    append({ type:'play', playerId:playerId, cardIds:Cards.sortCards(cardIds),
             pattern:pattern, remainingCount:player(playerId).handIds.length });
    // 炸弹/火箭：play 之后追加 multiplier（先倍数再判结束）
    if (pattern.type==='bomb'||pattern.type==='rocket')
      bumpMultiplier(pattern.type==='rocket'?'rocket':'bomb', state.history.length);
    if (player(playerId).handIds.length===0) finish(playerId);
    else state.currentPlayerId = nextPlayer(playerId);
    return ok(state.history.slice(startLen));
  }
  function pass(playerId){
    var fin = ensureNotFinished(); if (fin) return fin;
    if (state.phase!=='playing') return reject('INVALID_PHASE','当前不是出牌阶段');
    if (playerId!==state.currentPlayerId) return reject('NOT_CURRENT_PLAYER','不是当前行动玩家');
    if (state.lastPlay===null) return reject('CANNOT_PASS_FREE','自由出牌时必须领出');
    var startLen = state.history.length;
    state.passCount++;
    append({ type:'pass', playerId:playerId, passCount:state.passCount });
    if (state.passCount===2){
      var owner = state.lastPlayPlayerId;
      state.lastPlay=null; state.passCount=0; state.currentPlayerId=owner;
      append({ type:'new_round', playerId:owner });
    } else state.currentPlayerId = nextPlayer(playerId);
    return ok(state.history.slice(startLen));
  }
  ```
  - [ ] `bumpMultiplier(reason, sourceSeq)` 完整实现：
    ```js
    function bumpMultiplier(reason, sourceSeq){
      var before = state.multiplier;
      state.multiplier *= 2;
      return append({ type:'multiplier', reason:reason, before:before,
                      after:state.multiplier, sourceSeq:sourceSeq });
    }
    ```
    `sourceSeq` 对炸弹/火箭填对应 `play` 事件的 `seq`；对春天/反春填触发结算的最后一手 `play` 事件 `seq`。
  - [ ] 用 `Object.assign(DDZ.Game, { play:play, pass:pass })` 增量导出，最终 `DDZ.Game` 含 6 个公开接口与测试专用 `__loadStateForTest`，不得整体重赋值。
  - [ ] 失败路径在任何 `append`/赋值之前返回，确保 `events:[]` 且状态不变。
- [ ] 运行 `node --test --test-name-pattern="Game: 出牌" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录 play/pass/回合推进完成、通过数。

### Task 9: 胜负、倍数、计分与结算（finish / result）

**Files:**
- Modify: `E:/AiDdz/game.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Game: 计分" tests.js`

- [ ] 在 `tests.js` 追加 `Game: 计分` 组共 **9 个** `test()` 用例；普通胜负、春天、反春、多炸弹、火箭分别用不重叠的确定夹具：
  - [ ] 用例 1：`lastHandFixture({winner:'A',lastCards:['S3']})` 后 `Game.play('A',['S3'])` 断言地主胜；`lastHandFixture({winner:'B',lastCards:['S3']})` 后 `Game.play('B',['S3'])` 断言农民胜；结束后 `phase='finished'`、`currentPlayerId=null`，`bid/play/pass/redeal` 全部 `GAME_FINISHED`
  - [ ] 用例 2：普通胜负边界：`lastHandFixture({winner:'A',successfulPlays:{A:2,B:1,C:0}})` 与 `{winner:'B',successfulPlays:{A:2,B:0,C:0}}` 断言不额外翻倍；最后一手计入 `successfulPlays`；`lastHandFixture({winner:'A',lastCards:['S5','H5','C5','D5']})` 的末手炸弹先 `multiplier` 再结算
  - [ ] 用例 3：真实命令链覆盖倍数：`multiBombFixture()` 下依次 `Game.play('A',['S5','H5','C5','D5'])` → `Game.pass('B')` → `Game.pass('C')` → `Game.play('A',['S6','H6','C6','D6'])`，断言 events 顺序为两次 `play→multiplier(bomb)` 夹着 `new_round`，最终 `M=4`；`bombRocketFixture()` 下先出炸弹、两家不要、再出火箭，断言 `multiplier(bomb)` → `multiplier(rocket)` 且最终 `M=4`；`lastHandFixture({winner:'A',lastCards:['XJ','BJ']})` 末手火箭断言 `play→multiplier(rocket，sourceSeq=该 play.seq)→finish`；`lastHandFixture({winner:'A',lastCards:['S5','H5','C5','D5','S3','H3']})` 四带二末手断言不产生炸弹倍数
  - [ ] 用例 4：`lastHandFixture({winner:'A',lastCards:['S3'],successfulPlays:{A:0,B:0,C:0}})` 触发春天，倍数 `×2` 并追加 `spring` 的 `multiplier`
  - [ ] 用例 5：`lastHandFixture({winner:'B',lastCards:['S3'],successfulPlays:{A:1,B:0,C:0}})` 触发反春，倍数 `×2` 并追加 `anti_spring` 的 `multiplier`
  - [ ] 用例 6：地主胜 `+2BM / -BM / -BM`；农民胜 `-2BM / +BM / +BM`；`M` 一律从 `state.result.multiplier` 读取，不硬编码，三家得分之和恒为 0
  - [ ] 用例 7：`result={winnerSide,baseBid,multiplier,scores,multiplierEvents}`，`multiplierEvents` 为所有 `type='multiplier'` 历史的有序摘要；每条 `sourceSeq` 均指向已存在的 `play` 事件 `seq`
  - [ ] 用例 8：历史顺序：结束时先结算末手倍数与春天/反春，最后追加 `finish`；`finish` 含 `winnerSide/baseBid/multiplier/scores`
  - [ ] 用例 9：新开局/重新发牌清空上一局数据、不累计
- [ ] 运行 `node --test --test-name-pattern="Game: 计分" tests.js`
      预期：9 个 `not ok`，TAP 汇总 `# fail 9`、`# pass 0`（结算逻辑尚未实现）。
- [ ] 实现 `finish(winnerId)`：
  ```js
  function finish(winnerId){
    var landlord = state.landlordId;
    var lastPlaySeq = state.history.filter(function(h){return h.type==='play';})
                                  .slice(-1)[0].seq;
    state.winnerSide = (winnerId===landlord) ? 'landlord' : 'farmers';
    // 春天/反春倍数（仅一次），关联最后一手 play 的 seq
    if (state.winnerSide==='landlord' &&
        PLAYER_IDS.filter(function(id){return id!==landlord;})
                  .every(function(id){return state.successfulPlays[id]===0;}))
      bumpMultiplier('spring', lastPlaySeq);
    if (state.winnerSide==='farmers' && state.successfulPlays[landlord]===1)
      bumpMultiplier('anti_spring', lastPlaySeq);
    var B = state.highestBid, M = state.multiplier, scores = {A:0,B:0,C:0};
    PLAYER_IDS.forEach(function(id){
      var isL = id===landlord;
      var base = (state.winnerSide==='landlord') ? (isL? 2*B*M : -B*M)
                                                 : (isL?-2*B*M :  B*M);
      scores[id]=base; player(id).score=base;
    });
    state.phase='finished'; state.currentPlayerId=null;
    state.result = { winnerSide:state.winnerSide, baseBid:B, multiplier:M,
      scores:scores,
      multiplierEvents: state.history.filter(function(h){return h.type==='multiplier';}).map(function(h){
        return { seq:h.seq, reason:h.reason, before:h.before, after:h.after, sourceSeq:h.sourceSeq }; }) };
    append({ type:'finish', winnerSide:state.winnerSide, baseBid:B,
             multiplier:M, scores:Object.assign({},scores) });
  }
  ```
  - [ ] 结束后 `bid/play/pass/redeal` 统一 `reject('GAME_FINISHED','牌局已结束')`；仅 `newGame` 与 `getState` 可用。
- [ ] 运行 `node --test --test-name-pattern="Game: 计分" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录胜负/倍数/计分/历史顺序完成、零和校验通过、通过数。

### Task 10: prompt.js 正式提示词与纯函数缓存

**Files:**
- Create: `E:/AiDdz/prompt.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Prompt" tests.js`

- [ ] 在 `prompt.js` 写入统一 IIFE 骨架，红阶段仅 `DDZ.Prompt = {};`；在 `tests.js` 头部追加 `require('./prompt.js');`（在 `game.js` 之后），并把解构改为 `const { Cards, Game, Prompt } = DDZ;`。
- [ ] 在 `tests.js` 追加 `Prompt:` 组共 **7 个** `test()` 用例：
  - [ ] 用例 1：非 `playing` 阶段（bidding/redeal/finished）`generate(state)` 返回 `null`
  - [ ] 用例 2：正式提示词含 7 个固定小节标题、当前行动者、身份、三家完整带花色手牌、底牌、叫分过程、从 `deal` 开始的完整历史（不省略、无省略号）、自由出牌/跟牌两种决策类型文本、`连续不要次数`、`当前总倍数`、三家成功出牌次数、第 7 节回答要求四项
  - [ ] 用例 3：所有牌面带花色（用 `Cards.cardLabel` 校验）
  - [ ] 用例 4：出牌阶段每次有效出牌/不要后文本变化；无效操作后文本不变（由 `getState` 前后对比）
  - [ ] 用例 5：`updatePromptCache(cached, state)`：`playing` 返回新文本；非 `playing` 原样返回 `cached`；最后一手进入 `finished` 后仍保留最后决策文本；保留文本不含 `finish` 事件（因生成时未发生）
  - [ ] 用例 6：新开局/重新发牌由 UI 清空缓存，测试验证 `updatePromptCache('', biddingState)===''` 语义
  - [ ] 用例 7：生成前后状态深度相等（`assert.deepStrictEqual(before, after)`），确认无副作用
  - [ ] 「提示词模板通过固定字符串拼接、不执行插值内容」移入 Task 14 `Security: 运行脚本` 组，不计入本组 7 个用例，避免红阶段空骨架令否定断言提前通过。
- [ ] 运行 `node --test --test-name-pattern="Prompt" tests.js`
      预期：7 个 `not ok`、`Prompt.generate is not a function` 等，TAP 汇总 `# fail 7`、`# pass 0`。
- [ ] 实现 `prompt.js`：
  ```js
  var Cards = DDZ.Cards;
  var RULES_SUMMARY = [
    '点数：3 < 4 < … < 10 < J < Q < K < A < 2 < 小王 < 大王；花色不影响大小。',
    '支持牌型：单张、对子、三张、三带一、三带二、顺子、连对、飞机不带、飞机带单、飞机带对、四带二单、四带二对、炸弹、火箭。',
    '三带一的附件单牌必须与三张主体点数不同；三带二的附件是对子。',
    '顺子至少 5 张连续单牌；连对至少 3 组连续对子；飞机至少 2 组连续三张。这些连续主体都只能使用 3 至 A，不能包含 2 或王。',
    '飞机带单携带与三组数量相同的单牌，总张数为 4 × 三组数量，附件之间允许同点，也允许使用主体点数多余的第四张牌。',
    '飞机带对携带与三组数量相同的不同点数对子，总张数为 5 × 三组数量。',
    '四带二单为四张同点牌加任意两张单牌，附件允许同点；四带二对为四张同点牌加两个不同点数的对子。四带二不是炸弹。',
    '四张同点牌单独出是炸弹；双王是火箭。',
    '普通牌只能由相同牌型、相同结构长度、相同附件形式且主体更大的牌压过。',
    '同一组牌有多种解释时，领出由软件按固定优先级确定主解释；跟牌优先使用同牌型、同结构且主体点数最小的可压过解释，普通牌解释优先于炸弹，炸弹优先于火箭。回答牌型时应尽量与软件实际采用的解释一致。',
    '炸弹可压过任何普通牌；炸弹之间只有更大点数才能压过，同点不能互压；火箭最大且不能被压过。',
    '自由出牌时不能不要；跟牌时可以不要；连续两家不要后由最后出牌者自由领出。',
    '地主先出完则地主胜；任一农民先出完则农民胜。',
    '每打出一个炸弹或火箭，倍数乘 2。地主胜且两农民均未成功出牌为春天，倍数乘 2；农民胜且地主仅成功出牌一次为反春，倍数乘 2。',
    '设叫分为 B、最终倍数为 M：地主胜时地主 +2BM、两农民各 -BM；农民胜时地主 -2BM、两农民各 +BM。'
  ].join('\n');
  function nameOf(state, id){
    var p = state.players.filter(function(x){ return x.id===id; })[0];
    return p ? p.name : id;
  }
  function roleText(role){
    return role==='landlord' ? '地主' : (role==='farmer' ? '农民' : '未定');
  }
  var PATTERN_TEXT = {
    single:'单张', pair:'对子', triple:'三张', triple_single:'三带一',
    triple_pair:'三带二', straight:'顺子', pair_straight:'连对',
    plane:'飞机不带', plane_single:'飞机带单', plane_pair:'飞机带对',
    four_two_single:'四带二单', four_two_pair:'四带二对',
    bomb:'炸弹', rocket:'火箭'
  };
  var REASON_TEXT = { bomb:'炸弹', rocket:'火箭', spring:'春天', anti_spring:'反春' };
  function sideText(side){ return side==='landlord' ? '地主胜' : '农民胜'; }
  function fmtCards(ids){ return ids.map(Cards.cardLabel).join(' '); }
  function bidLines(state){
    return state.history.filter(function(h){ return h.type==='bid'; }).map(function(h){
      return nameOf(state,h.playerId) + (h.score===0 ? '不叫' : '叫 ' + h.score + ' 分');
    }).join('；') || '无';
  }
  function formatOne(h, state){
    if (h.type==='deal')
      return '发牌：首位叫分者 ' + nameOf(state,h.firstBidderId) +
             '；初始手牌 甲 ' + fmtCards(h.initialHands.A) +
             '，乙 ' + fmtCards(h.initialHands.B) +
             '，丙 ' + fmtCards(h.initialHands.C);
    if (h.type==='bid')
      return nameOf(state,h.playerId) + (h.score===0 ? '不叫' : '叫 ' + h.score + ' 分') +
             '；当前最高 ' + h.highestBid + ' 分';
    if (h.type==='landlord')
      return '确定地主：' + nameOf(state,h.playerId) + '；底牌 ' + fmtCards(h.bottomCards) +
             '；地主最终手牌 ' + fmtCards(h.handAfter);
    if (h.type==='play')
      return nameOf(state,h.playerId) + ' 出牌：' + fmtCards(h.cardIds) +
             '；牌型 ' + (PATTERN_TEXT[h.pattern.type] || h.pattern.type) +
             '；剩余 ' + h.remainingCount + ' 张';
    if (h.type==='pass')
      return nameOf(state,h.playerId) + ' 不要；连续不要次数 ' + h.passCount;
    if (h.type==='new_round')
      return '新一轮：' + nameOf(state,h.playerId) + ' 获得自由出牌权';
    if (h.type==='multiplier')
      return '倍数变化：' + (REASON_TEXT[h.reason] || h.reason) + '，' + h.before + ' → ' + h.after +
             '（关联事件 ' + h.sourceSeq + '）';
    if (h.type==='finish')
      return '结束：' + sideText(h.winnerSide) + '；倍数 ' + h.multiplier +
             '；得分 甲 ' + h.scores.A + '，乙 ' + h.scores.B + '，丙 ' + h.scores.C;
    return '未知事件 ' + h.type;
  }
  function historyLines(state){
    return state.history.map(function(h){
      return h.seq + '. ' + formatOne(h, state);
    }).join('\n');
  }
  function generate(state){
    if (!state || state.phase!=='playing') return null;
    var cur = state.currentPlayerId;
    var curPlayer = state.players.filter(function(p){ return p.id===cur; })[0];
    var lines = [];
    lines.push('# 斗地主出牌推理任务','');
    lines.push('你是一名斗地主策略分析助手。请根据下面的完全信息，判断当前行动玩家下一步最合理的操作。');
    lines.push('本局由一人操控三家，因此你可以看到三家的真实手牌。农民属于同一阵营，应互相配合。');
    lines.push('你的回答只是建议，不会自动执行。','');
    lines.push('## 1. 本次任务');
    lines.push('当前行动玩家：' + nameOf(state,cur));
    lines.push('当前身份：' + roleText(curPlayer.role));
    lines.push('行动顺序：甲 → 乙 → 丙 → 甲（逆时针）');
    lines.push('当前决策类型：' + (state.lastPlay===null ? '自由出牌' : '必须压过当前有效牌/选择不要'),'');
    lines.push('## 2. 规则摘要（本项目统一约定）');
    lines.push(RULES_SUMMARY,'');
    lines.push('## 3. 座位、身份与剩余手牌');
    ['A','B','C'].forEach(function(id){
      var p = state.players.filter(function(x){ return x.id===id; })[0];
      lines.push(nameOf(state,id) + '：' + roleText(p.role) + '，剩余 ' +
                 p.handIds.length + ' 张，手牌：' + fmtCards(p.handIds));
    });
    lines.push('');
    lines.push('## 4. 叫分与底牌');
    lines.push('首位叫分者：' + nameOf(state,state.firstBidderId));
    lines.push('叫分过程：' + bidLines(state));
    lines.push('地主：' + nameOf(state,state.landlordId));
    lines.push('最终叫分：' + state.highestBid + ' 分');
    lines.push('底牌：' + fmtCards(state.bottomCards),'');
    lines.push('## 5. 当前牌面局势');
    lines.push('最后成功出牌者：' + (state.lastPlayPlayerId ? nameOf(state,state.lastPlayPlayerId) : '无'));
    lines.push('当前需要压过的牌：' + (state.lastPlay
      ? nameOf(state,state.lastPlay.playerId) + '、' +
        (PATTERN_TEXT[state.lastPlay.pattern.type] || state.lastPlay.pattern.type) +
        '、' + fmtCards(state.lastPlay.cardIds)
      : '无'));
    lines.push('连续不要次数：' + state.passCount);
    lines.push('当前总倍数：' + state.multiplier);
    lines.push('三家成功出牌次数：甲 ' + state.successfulPlays.A +
               '，乙 ' + state.successfulPlays.B + '，丙 ' + state.successfulPlays.C,'');
    lines.push('## 6. 完整行动历史');
    lines.push(historyLines(state),'');
    lines.push('## 7. 回答要求');
    lines.push('请严格按以下四项回答：');
    lines.push('1. 建议操作：出牌 或 不要。');
    lines.push('2. 具体牌面：逐项列出建议打出的牌，必须带花色；若建议不要则填“无”。');
    lines.push('3. 牌型：填写实际牌型；若建议不要则填“无”。');
    lines.push('4. 简要理由：说明该选择如何配合当前身份、控制出牌权或推进获胜。');
    lines.push('');
    lines.push('建议必须是当前行动玩家真实拥有且符合上述局势的合法操作。');
    lines.push('不要修改任何手牌或历史，不要假装已经执行建议。');
    return lines.join('\n');
  }
  function updatePromptCache(cachedText, state){
    var text = generate(state);
    return text === null ? cachedText : text;
  }
  DDZ.Prompt = { generate:generate, updatePromptCache:updatePromptCache };
  ```
  - [ ] `RULES_SUMMARY` 必须按规格 9.3 写入上述 15 行固定字面量，不得只写 2 行或留注释；`formatOne` 必须覆盖 `deal/bid/landlord/play/pass/new_round/multiplier/finish` 全部枚举。
  - [ ] 完整历史用 `historyLines(state)` 遍历**全部** `state.history`，从 `deal` 起逐行展开，`landlord` 含底牌（与第 4 节有意重复，不得省略）；`finish` 不在 `generate` 中出现（生成时牌局未结束）。
  - [ ] 玩家名称一律经 `nameOf(state,id)` 从 `state.players[].name` 读取，不使用 `NAMES` 全局。
  - [ ] `generate` 只读 `state`，不修改、不读 DOM、不调用网络、不自动复制。
  - [ ] 模板中花括号字段用普通字符串拼接替换，禁止 `eval`/`new Function`/模板执行。
- [ ] 运行 `node --test --test-name-pattern="Prompt" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：`Cards` + `Game` + `Prompt` 全组累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录 `prompt.js` 完成、`node --test tests.js` 全量通过数、提示词无副作用确认。

### 本块完成判据

- `node --test --test-name-pattern="Game|Prompt" tests.js` 全通过，`# fail 0`。
- 发牌可复现、三家各 17/底牌 3/地主 20 张；叫分、`redeal`、出牌、`pass`、`new_round`、胜负、倍数、春天/反春、零和计分、历史顺序与 `events` 一致性全部通过。
- `getState()` 与命令快照深拷贝隔离；失败命令零状态变更、零历史追加。
- 提示词仅 `playing` 生成、`updatePromptCache` 纯函数保留最后决策文本、生成前后状态深度相等。
- `game.js`/`prompt.js` 不含 DOM 操作；`game.js` 仅允许 `typeof window === 'undefined'` 这一环境判断用于挂测试接口，二者仅经 `DDZ.Cards` 依赖 `cards.js`。

---

## Chunk 3: 界面集成与验收

目标：完成 `ddz.html`、`styles.css`、`ui.js`，补齐 `Security:` 静态检查测试，执行全量自动化测试与 Chrome/Edge 人工验收。

说明：规格 11.1 明确 Node 测试**不加载 DOM、不加载 `ui.js`**，故 UI 层 TDD 采用「`tests.js` 中的静态结构/安全断言（读源码文本）+ 浏览器人工验收」替代运行时单测；每个 UI Task 仍按「写失败断言 → 运行确认失败 → 实现 → 运行确认通过 → 保存检查点」执行。

### Task 11: ddz.html 静态结构、styles.css、缺文件启动检查

**Files:**
- Create: `E:/AiDdz/ddz.html`
- Create: `E:/AiDdz/styles.css`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Security: 结构" tests.js`

- [ ] 在 `tests.js` 追加 `Security: 结构` 组共 **5 个** `test()` 用例；只匹配 `<script src=...>` 标签，避免误伤末尾内联启动脚本：
  - [ ] 用例 1：`ddz.html` 含 4 个 `<script src="./cards.js">`/`game.js`/`prompt.js`/`ui.js` 且顺序正确、均为普通脚本（无 `type="module"`）、含 `<link rel="stylesheet" href="./styles.css">`
  - [ ] 用例 2：`ddz.html` 必须含以下确切 id：`fatal`、`phase-label`、`current-label`、`new-game-btn`、`hint`、`copy-btn`、`prompt-text`、`tab-history`、`tab-prompt`，以及三家手牌区 `hand-A`/`hand-B`/`hand-C`、底牌 `bottom-cards`、结算区 `result-box`；这些 id 与 Task 11/12/13 代码引用逐一对应
  - [ ] 用例 3：`ddz.html` 不含 `fetch(`、`XMLHttpRequest`、远程 `http(s)://` 资源引用、CDN 链接
  - [ ] 用例 4：结算区含固定文本「积分仅用于规则测试，无现金价值，不涉及充值、提现或交易」
  - [ ] 用例 5：`styles.css` 不含 `@import`、`url(`、远程字体，且含 `.ddz-css-probe` 颜色哨兵规则
- [ ] 运行 `node --test --test-name-pattern="Security: 结构" tests.js`
      预期：5 个 `not ok`（文件不存在），TAP 汇总 `# fail 5`、`# pass 0`。
- [ ] 创建 `ddz.html`：
  - [ ] 静态容器按规格 8.1，并严格使用上一步列出的确切 id：顶部（软件名/`#phase-label`/`#current-label`/`#new-game-btn`）、牌桌上方（`#bottom-cards`/最高叫分/地主/倍数）、左上丙/右上乙/下方甲分别为 `#hand-C`/`#hand-B`/`#hand-A`、中央（当前有效出牌/最后出牌者/连续不要次数/操作提示 `#hint`）、信息区两个标签页（`#tab-history`/`#tab-prompt`）、提示词只读区 `#prompt-text`、复制按钮 `#copy-btn`、结算区 `#result-box`（含固定免责文本）、缺文件提示 `#fatal`。
  - [ ] 按 `cards.js → game.js → prompt.js → ui.js` 顺序引入普通 `<script src="./xxx.js">`；`<link rel="stylesheet" href="./styles.css">`。
  - [ ] 每个 `<link>`/`<script>` 的 `onerror` 只置位统一命名空间内的标记 `(window.DDZ = window.DDZ || {}).__missing = true`，不新增 `DDZ` 之外的全局；末尾内联启动检查使用**标准计算颜色**作为 CSS 哨兵，不依赖自定义属性字符串（避免 Chrome/Edge 可能返回带前导空白的值导致误判）：
    ```html
    <script>
    (function(){
      var DDZ0 = window.DDZ;
      var okAll = !(DDZ0 && DDZ0.__missing) && DDZ0 &&
                  DDZ0.Cards && DDZ0.Game && DDZ0.Prompt && DDZ0.UI;
      var probe = document.createElement('div');
      probe.className = 'ddz-css-probe';
      document.body.appendChild(probe);
      var color = getComputedStyle(probe).color.replace(/\s/g,'');
      var cssOk = color === 'rgb(1,2,3)';
      probe.remove();
      if (!okAll || !cssOk){
        var box = document.getElementById('fatal');
        box.textContent = '请保留完整目录及全部 CSS、JS 文件';
        document.querySelectorAll('button').forEach(function(b){ b.disabled = true; });
      } else { DDZ0.UI.init(); }
    })();
    </script>
    ```
  - [ ] 启动检查只用 `textContent`，不拼接动态 HTML；`#fatal` 为预置空容器；`link.onerror` 已能覆盖 CSS 缺失，颜色哨兵只作为补充，`okAll` 与 `cssOk` 任一失败都显示固定提示。
- [ ] 创建 `styles.css`：牌桌三区布局、牌面（红黑花色区分、王中文）、`.selected` 选中态、`.current` 当前玩家高亮（边框 + 「正在行动」文字双表达）、`.disabled` 禁用态、`.hint` 内联错误提示、标签页、滚动区（`overflow:auto`）、`.ddz-css-probe { color: rgb(1, 2, 3); }` 颜色哨兵；无外部资源；不写全部最终规则，按此清单落地即可。
- [ ] 运行 `node --test --test-name-pattern="Security: 结构" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass（含 Chunk 1/2）、`# fail 0`。
- [ ] 保存检查点：记录 `ddz.html`/`styles.css` 完成、结构断言通过数。

### Task 12: ui.js 渲染与事件主流程

**Files:**
- Create: `E:/AiDdz/ui.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Security: UI" tests.js`

- [ ] 在 `tests.js` 追加 `Security: UI` 组共 **5 个** `test()` 用例（读 `ui.js` 源码）：
  - [ ] 用例 1：不含 `.innerHTML =`/`.outerHTML =`/`insertAdjacentHTML(`/`document.write(`/`eval(`/`new Function(`/字符串定时器
  - [ ] 用例 2：不含 `.clipboard.read`/`readText`/`XMLHttpRequest`/`fetch(`/`WebSocket`/`EventSource`/`sendBeacon`
  - [ ] 用例 3：不含远程 `http(s)://`；动态写入仅用 `textContent`/`createTextNode`/固定属性
  - [ ] 用例 4：含 `DDZ.UI =` 与 `init` 入口；含 `updatePromptCache` 调用（不直接调用 `generate` 覆盖缓存）
  - [ ] 用例 5：源码中必须出现 `assertRequiredDom`、`ERROR_TEXT`、`showError`、`showHint`、`selectAllText`、`render`、`dispatch` 这些函数/常量名，防止空壳通过断言；`copyPrompt`、`fallbackCopy` 留到 Task 13 的用例 1 检查
- [ ] 运行 `node --test --test-name-pattern="Security: UI" tests.js`
      预期：5 个 `not ok`（文件不存在），TAP 汇总 `# fail 5`、`# pass 0`。
- [ ] 创建 `ui.js`（统一 IIFE 骨架，挂 `DDZ.UI`），实现：
  - [ ] `assertRequiredDom()`：检查 `fatal/phase-label/current-label/new-game-btn/hint/copy-btn/prompt-text/tab-history/tab-prompt/hand-A/hand-B/hand-C/bottom-cards/result-box` 全部存在；任一缺失时在 `#fatal` 用 `textContent` 显示「请保留完整目录及全部 CSS、JS 文件」，禁用全部按钮并返回 false。
  - [ ] `ERROR_TEXT`：将 11 个 `error.code` 全部映射为固定中文文案，例如 `INVALID_PHASE:'当前阶段不允许该操作'`、`GAME_FINISHED:'牌局已结束'`；未识别 code 统一显示「操作未生效，请检查当前阶段和选择」。
  - [ ] `showError(code)`：`document.getElementById('hint').textContent = ERROR_TEXT[code] || ...`。
  - [ ] `showHint(text)`：同样只写 `textContent`，供复制失败等提示使用。
  - [ ] `selectAllText(el)`：用 `document.createRange()` + `window.getSelection()` 选中 `#prompt-text` 全部文本，供两级复制失败后 `Ctrl+C` 使用。
  - [ ] `nameOf(state,id)`：从 `state.players[].name` 读取显示名。
  - [ ] `init()`：先 `assertRequiredDom()` → 缓存 DOM 引用 → 绑定叫分/出牌/标签页/新开一局等事件（`copyPrompt` 尚未定义，本 Task 不绑定 `#copy-btn`）→ `newGame()` 渲染首局；注册唯一 `beforeunload`（见 Task 13）。
  - [ ] 文件末尾显式 `DDZ.UI = { init:init };`，不能只定义局部函数。
  - [ ] 单一渲染入口 `render(state)`：由 `Game.getState()` 取快照，逐区用 `textContent`/`createTextNode` 写入；手牌用 `document.createElement` + `textContent` 生成（禁止 `innerHTML`）；仅当前玩家手牌可点选；当前玩家区加 `.current` 类并显示「正在行动」；非当前玩家手牌可见不可选。
  - [ ] 命令统一入口 `dispatch(result)`：`ok:true` → 清空选中、`cachedPrompt = Prompt.updatePromptCache(cachedPrompt, result.state)`、`render(result.state)`；`ok:false` → 保留选中、在 `#hint` 用固定文案映射 `error.code` 显示原因（不渲染异常 HTML）。
  - [ ] 选牌：点当前玩家牌切换 `selectedCards`（Set）；`取消选择`清空；`出牌`调用 `Game.play(currentId, [...selectedCards])`。
  - [ ] 叫分阶段：只渲染当前玩家合法的 `不叫/1/2/3` 按钮，`<= highestBid` 的按钮 `disabled`；`bid` 调用 `Game.bid`。
  - [ ] 出牌阶段：`出牌`/`不要`/`取消选择`；`state.lastPlay===null` 时 `不要` 禁用并显示「必须领出」。
  - [ ] 标签页：`#tab-history`/`#tab-prompt` 切换显示；历史区按 `history` 逐行渲染（含 `finish`）；提示词区显示 `cachedPrompt`。
  - [ ] 阶段状态说明（叫分显示「进入出牌阶段后生成提示词」、`redeal` 显示重发提示、`finished` 显示结算与「已结束」标注）由 UI 单独生成，**不得**覆盖 `cachedPrompt`。
  - [ ] `新开一局`/`重新发牌`：进行中点击 `新开一局` 用 `window.confirm` 二次确认；`重新发牌` 仅在 `redeal` 出现；**新开局与重新发牌时显式 `cachedPrompt = ''`**（规格 9.1）。
  - [ ] 关键片段（缓存策略）：
    ```js
    function dispatch(result){
      if (!result.ok){ showError(result.error.code); return; }
      selectedCards.clear();
      cachedPrompt = DDZ.Prompt.updatePromptCache(cachedPrompt, result.state);
      render(result.state);
    }
    ```
- [ ] 运行 `node --test --test-name-pattern="Security: UI" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录 `ui.js` 主流程完成、UI 静态断言通过数。

### Task 13: 复制、beforeunload、结算与结束态

**Files:**
- Modify: `E:/AiDdz/ui.js`
- Modify: `E:/AiDdz/tests.js`
- Test: `node --test --test-name-pattern="Security: 行为" tests.js`

- [ ] 在 `tests.js` 追加 `Security: 行为` 组共 **3 个** `test()` 用例（读 `ui.js` 源码）：
  - [ ] 用例 1：源码含 `copyPrompt`、`fallbackCopy` 函数名；含 `navigator.clipboard.writeText(`；含 `#copy-btn` 的 click 绑定；含 `document.createElement('textarea')`、`document.execCommand('copy')`、`Ctrl+C` 提示文案；不含 `.clipboard.read`/`readText`
  - [ ] 用例 2：含 `addEventListener('beforeunload'` 与 `removeEventListener('beforeunload'`；`returnValue` 只赋空串，用正则 `/returnValue\s*=\s*['\"]['\"]/` 断言，不得出现自定义文案
  - [ ] 用例 3：`finished` 分支禁用对局按钮、仅保留新开一局与复制；源码含 `phase==='finished'` 或等价明确分支
- [ ] 运行 `node --test --test-name-pattern="Security: 行为" tests.js`
      预期：3 个 `not ok`，TAP 汇总 `# fail 3`、`# pass 0`。
- [ ] 在 `ui.js` 实现复制（规格 9.4 关键片段）：
  ```js
  function copyPrompt(){
    var text = cachedPrompt;
    if (!text) return;
    if (navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(text).catch(fallbackCopy);
    } else fallbackCopy();
  }
  function fallbackCopy(){
    var ta = document.createElement('textarea');
    ta.value = cachedPrompt;            // 只放当前提示词
    var prev = document.activeElement;
    document.body.appendChild(ta); ta.select();
    var done=false;
    try { done = document.execCommand('copy'); } catch(e){}
    ta.remove(); if (prev && prev.focus) prev.focus();   // 移除并恢复焦点
    if (!done){
      var box = document.getElementById('prompt-text');
      selectAllText(box);                                  // 选中完整提示词
      showHint('复制失败，请按 Ctrl+C 手动复制');
    }
  }
  ```
  - [ ] 在 `init()` 中把 `copyPrompt` 绑定到 `#copy-btn` 的 `click`；仅用户手势触发，不自动复制、不读取剪贴板、复制失败不改牌局状态。
- [ ] `beforeunload`：进行中 `addEventListener('beforeunload', handler)` 注册唯一监听器，`handler` 仅 `e.preventDefault(); e.returnValue = '';`（空串，不写自定义文案）；`finished` 或确认新开局时 `removeEventListener` 移除，不再请求提醒。浏览器是否展示由浏览器决定，计划不承诺。
- [ ] `finished` 渲染：展示 `result`（基础叫分、每次炸弹/火箭、春天/反春、最终倍数、三家得分）、胜负、免责文本；保留完整历史（含 `finish`）与 `cachedPrompt` 并标注「对应已结束牌局的最后决策点」；禁用叫分/出牌/不要/取消/重发，仅留新开一局与复制。
- [ ] 运行 `node --test --test-name-pattern="Security: 行为" tests.js`
      预期：`# pass`、`# fail 0`。
- [ ] 运行 `node --test tests.js`
      预期：累计全 pass、`# fail 0`。
- [ ] 保存检查点：记录复制降级/beforeunload/结束态完成、通过数。

### Task 14: 最小安全静态检查、全量自动化、浏览器人工验收

**Files:**
- Modify: `E:/AiDdz/tests.js`（补 `Security:` 全量检查）
- Test: `node --test tests.js`
- 人工验收：`ddz.html`（Chrome 与 Edge，`file://`，断网）

- [ ] 在 `tests.js` 补 `Security: 运行脚本` 组：**只读取** `cards.js/game.js/prompt.js/ui.js/ddz.html/styles.css` 六个运行文件，绝不扫描 `tests.js`、`ddz_spec.md`、`ddz_plan.md`，否则正则字面量自身会误报：
  ```js
  var RUNTIME_FILES = ['cards.js','game.js','prompt.js','ui.js','ddz.html','styles.css'];
  var FORBIDDEN = [
    /\.innerHTML\s*[+]?=/, /\.outerHTML\s*[+]?=/, /insertAdjacentHTML\s*\(/, /document\.write\s*\(/,
    /\beval\s*\(/, /new\s+Function\s*\(/, /[^.\w]Function\s*\(\s*['"]/,
    /setTimeout\s*\(\s*['"]/, /setInterval\s*\(\s*['"]/,
    /\.clipboard\.read\b/, /readText\s*\(/,
    /\bfetch\s*\(/, /XMLHttpRequest/, /new\s+WebSocket/, /EventSource/,
    /sendBeacon/, /https?:\/\//,   // 远程资源
    /FileReader\s*\(/, /type\s*=\s*['"]file['"]/  // 运行时文件读取/文件输入
  ];
  ```
  - [ ] 断言 `navigator.clipboard.writeText` 允许存在（写入 + 用户手势），只禁读取与自动复制；自动复制/手势由人工验收第 5 项覆盖。
  - [ ] 断言提示词模板为固定字符串拼接、不执行插值内容：`prompt.js` 不含 `eval`/`new Function`/`Function('…')`/模板执行；本断言承接 Task 10 移出的第 8 项，不计入 `Prompt:` 组用例数。
  - [ ] 断言 `ddz.html` 的 `script[src]` 标签按依赖顺序恰为 4 个，末尾内联启动脚本不算入 `script[src]` 匹配。
- [ ] 运行 `node --test tests.js`
      预期：TAP 汇总 `# fail 0`、`# pass <全部用例数>`，且无 `not ok`。记录最终通过数。
- [ ] 运行 `node --test --test-name-pattern="Cards|Game|Prompt|Security" tests.js`
      预期：`# fail 0`（按模块复跑确认稳定）。
- [ ] 浏览器人工验收（规格 11.2，分别在 Chrome 与 Edge 双击 `E:/AiDdz/ddz.html`）。每项写明操作、预期与判定：
  - [ ] 人工 1：断网后完整玩一局；DevTools Network 只出现本地 `ddz.html/styles.css/cards.js/game.js/prompt.js/ui.js`，Console 无红色未处理异常 → 判定通过。
  - [ ] 人工 2：核对甲在下方、乙右上、丙左上；三家手牌降序、红黑花色区分、王中文、每区显示身份/剩余张数/叫分；当前玩家有边框与「正在行动」文字，其他两家手牌可见不可点 → 判定通过。
  - [ ] 人工 3：分别触发非法叫分、非法牌型、错误跟牌、错误轮次、自由出牌点不要；预期 `#hint` 显示具体中文原因且手牌/历史/回合不变；随后一次合法出牌预期四处同步更新 → 判定通过。
  - [ ] 人工 4：切换出牌记录/AI 提示词标签、滚动历史、取消选择、进行中点新开一局出现 `confirm` → 判定通过。
  - [ ] 人工 5：正常点复制并粘贴核对；在 DevTools Console 覆盖 `navigator.clipboard.writeText = () => Promise.reject(new Error('blocked'))` 后点复制，预期走 `textarea` 降级；再覆盖 `document.execCommand = () => false` 后点复制，预期 `#prompt-text` 全选且提示 `Ctrl+C`；若当前 `file://` 环境 `navigator.clipboard` 本就 undefined，则直接走 `textarea` 降级也判定通过；全程不得调用剪贴板读取 → 判定通过。
  - [ ] 人工 6：先点击任意按钮产生用户交互，再刷新/关闭；若浏览器展示原生离开提醒则记录，未展示也符合规格「不保证」；牌局结束后重复刷新不应再请求提醒 → 判定通过。
  - [ ] 人工 7：把窗口缩到 `<1280`，横向/纵向滚动可到达所有按钮和手牌 → 判定通过。
  - [ ] 人工 8：临时移走任一必要 JS 后刷新，预期 `#fatal` 显示「请保留完整目录及全部 CSS、JS 文件」且按钮禁用；恢复文件 → 判定通过。
  - [ ] 人工 9：临时移走 `styles.css` 后刷新，预期同样显示固定提示并禁用按钮；恢复文件 → 判定通过。
  - [ ] 人工 10：打到最后一手结束，核对完整历史含 `finish`、提示词区仍是结束前最后决策文本且标注已结束、Console 无异常 → 判定通过。
  - [ ] 人工 11：三家均不叫后预期只能点「重新发牌」，或经二次确认「新开一局」；无其他推进按钮 → 判定通过。
  - [ ] 人工 12（规格第 12 节，不属于 11.2 的 11 项）：把 6 个运行文件复制到另一纯本地路径，双击 `ddz.html` 能正常开局 → 判定通过。
- [ ] 用一整局实际状态逐项核对提示词：当前行动者、三家手牌、身份、底牌、叫分、完整历史无遗漏/错牌。
- [ ] 末尾「最终验收清单」是**签收汇总**，本节是**执行记录**；执行记录全部通过后，再勾选最终清单，避免重复劳动。
- [ ] 保存检查点：记录最终 `node --test tests.js` 通过数、Chrome/Edge 人工验收结论、6 文件清单。

### 本块完成判据

- `ddz.html`、`styles.css`、`cards.js`、`game.js`、`prompt.js`、`ui.js` 六文件齐备于根目录；`tests.js` 静态检查与全量自动化 `node --test tests.js` 全通过、`# fail 0`。
- Chrome 与 Edge 的 `file://` 双击运行无未处理异常与资源错误，断网可完整玩一局。
- 缺 CSS/JS 提示、复制三级降级、beforeunload 注册/移除、结束态保留最后提示词、窄窗滚动、异地拷贝运行均通过人工验收。
- 实施完成定义（规格第 12 节）全部满足。

---

## 实施门禁

- **用户审核并批准本实施计划之前，不得创建或修改任何运行代码（`ddz.html`、`styles.css`、`cards.js`、`game.js`、`prompt.js`、`ui.js`），也不得创建 `tests.js`。**
- 规格已批准、架构已定；本计划不再做需求澄清、不提 2-3 个方案、不重新设计架构。
- 用户批准计划后，严格按 Chunk 1 → 2 → 3 与 Task 1 → 14 顺序执行；每个 Task 完成其「保存检查点」后方可进入下一个 Task。
- 每个 Chunk 的「本块完成判据」未全部满足时，不得进入下一 Chunk。
- 计划中的代码块是交付给工程师的骨架说明，不是已落盘代码；实际编码由用户在批准后授权执行。

## 风险与缓解

| 风险 | 缓解措施 |
|---|---|
| `file://` 限制：ES Module import 会被同源策略拦截，`fetch` 本地文件通常报 "URL scheme file is not supported" | 普通 `<script src="./xxx.js">` 在 `file://` 下可正常加载；全部用它顺序加载、IIFE + `DDZ` 命名空间，不用 `type="module"`/`import`/`fetch`；运行文件与 HTML 同目录；分发整个目录而非单个 HTML（规格 4.8）。 |
| 剪贴板：`file://` 下 `navigator.clipboard` 可能不可用或权限被拒；不能读取剪贴板 | 三级降级：`writeText` → 临时 `<textarea>` + `execCommand('copy')` → 全选提示 `Ctrl+C`；只写入当前提示词、只读不取；由按钮 click 手势触发，不自动复制（Task 13 + 人工验收第 5 项）。 |
| `beforeunload`：浏览器仅在有用户交互后才可能展示，且行为差异大、进程终止无法覆盖 | 进行中注册唯一监听器、仅 `preventDefault()`+空 `returnValue` 不写自定义文案；`finished` 与确认新开局时移除；规格明确「不承诺提醒」，人工验收只在有交互后验证、不保证一定展示（Task 13 + 8.4）。 |
| 牌型歧义：飞机/四带二多解释、附件余牌、同结构跟牌 | 规格 7.5 补充 1-6 与 7.6 固定优先级在 `analyzeCards/primaryPattern/selectBeatingPattern` 中定死；同一组牌跟牌写回 `lastPlay.pattern` 保证比较可重复；Chunk 1 用规格 11.1 的歧义样例做失败测试先行锁定口径；附件规则在提示词中标注为「本项目统一约定」，不宣称平台唯一口径。 |
| CSS/JS 缺失：只发 `ddz.html` 或漏文件导致静默无反应 | `link`/`script` 加 `onerror` 置位 + 末尾启动检查（`DDZ` 四模块 + 标准 `color` 计算样式哨兵）；缺任一显示固定安全文本「请保留完整目录及全部 CSS、JS 文件」并禁用全部按钮（Task 11 + 人工验收第 8/9 项）。 |
| 浏览器差异：Chrome/Edge 的 `execCommand`、`getComputedStyle` 颜色归一化、`navigator.clipboard` 表现不一 | 双浏览器分别人工验收（规格 11.2）；复制用 `.catch` + `try/catch` 兜底；CSS 哨兵用 `getComputedStyle(probe).color.replace(/\s/g,'') === 'rgb(1,2,3)'`，不依赖自定义属性；`link.onerror` 作为主判断，颜色哨兵只是补充；不使用实验性 API。 |
| 测试环境差异：Node 与浏览器全局对象不同 | IIFE 根对象统一 `typeof window !== 'undefined' ? window : globalThis`；`tests.js` 按 CommonJS `require` 前三个脚本、不建伪造 `window`、不加载 `ui.js`；项目及上级目录不得有把 `.js` 声明为 ESM 的 `package.json`（规格 11.1）。 |
| 状态被外部篡改 / 历史与状态不一致 | 所有 `state`/命令结果经 `snapshot()` 深拷贝；失败命令先校验后提交、`events:[]` 且零写入；`history` 仅追加、`seq = length+1`；`events` 取 `history.slice(startLen)` 保证与历史同源（Task 6-9 测试覆盖）。 |
| 分数非零和 / 结算顺序错 | 计分公式固定 `+2BM/-BM/-BM` 与 `-2BM/+BM/+BM` 并做零和断言；末手倍数、春天/反春先于 `finish` 追加（Task 9 顺序测试）。 |

## 最终验收清单

对应规格第 2 节（9 条）：
- [ ] 1. 解压整个目录后双击 `ddz.html` 在现代 Chrome 与 Edge 运行，无网络请求、无构建、无本地服务。
- [ ] 2. 可操控三家完成整局，含无人叫分重发、地主获胜、农民获胜。
- [ ] 3. 三家手牌始终可见，只有当前行动玩家可操作。
- [ ] 4. 非法叫分/牌型/跟牌/轮次/不要均被拒绝且状态不变。
- [ ] 5. 每次轮到出牌时提示词自动更新，与手牌、完整历史、当前有效牌、行动玩家一致。
- [ ] 6. 提示词一键复制；剪贴板受限时仍可手动选中复制。
- [ ] 7. 炸弹、火箭、春天、反春、三家得分按规格计算，三家得分之和恒为零。
- [ ] 8. 结束后禁止继续叫分/出牌，展示明确胜负与计分明细。
- [ ] 9. Chrome 与 Edge 的 `file://` 测试无未处理异常与资源加载错误。

对应规格第 11 节（自动化 + 人工验收）：
- [ ] 11.1 自动化：`node --test tests.js` 全通过；覆盖牌堆/排序/14 牌型/多解释/叫分/`redeal`/出牌/`pass`/`new_round`/胜负/倍数/春天反春/零和/历史顺序/`events`/快照隔离/提示词/无副作用/最小安全静态检查。
- [ ] 11.2 人工 1：断网可玩一局、Network 仅本地 HTML/CSS/JS、Console 无异常。
- [ ] 11.2 人工 2：三家明牌、当前玩家与可操作状态清晰。
- [ ] 11.2 人工 3：非法操作提示准确、成功后手牌/历史/回合/提示词同步。
- [ ] 11.2 人工 4：标签页、历史滚动、取消选择、新开局确认正常。
- [ ] 11.2 人工 5：复制三级降级正确、全程不读取剪贴板。
- [ ] 11.2 人工 6：有交互后原生离开提醒（浏览器决定）、结束后不再请求。
- [ ] 11.2 人工 7：窄窗口可滚动、无不可达按钮。
- [ ] 11.2 人工 8：删除任一必要 JS 出现明确缺文件提示并禁用操作。
- [ ] 11.2 人工 9：删除 `styles.css` 出现明确缺文件提示并禁用操作。
- [ ] 11.2 人工 10：最后一手结束后完整历史与最后一份正式提示词保留、对应最后决策点、无异常。
- [ ] 11.2 人工 11：无人叫分后只能重新发牌继续，或二次确认新开一局。
- [ ] 第 12 节：整局核对提示词无遗漏/错牌/错误行动者；目录复制到另一纯本地路径仍可运行；无手牌重复/丢失、回合卡死、历史与状态不一致、计分非零和。
