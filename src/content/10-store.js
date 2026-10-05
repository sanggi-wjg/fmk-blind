/**
 * FMK-Blind — sync 샤딩 저장 계층 (store)
 * ------------------------------------------------------------------
 * content script(content_scripts에 순서 로드)와 popup(<script src>)이
 * **동일 파일을 공유**한다. 상태는 chrome.storage.sync로 동기화된다.
 *
 * 공개 계약: window.FMKBlind.store = { load, isBlocked, block, unblock, list, count, onChange, importMany }
 * 자세한 시그니처/불변식: .claude/workspace/store-api-contract.md
 *
 * 저장 레이아웃(하위 호환 — 기존 데이터 그대로 읽음):
 *   bl_meta = { ver: 1 }                          // 스키마 버전
 *   bl_0, bl_1, ... bl_N                          // 차단 목록을 8KB 미만 청크로 분할
 *   각 청크 값 = [[uid, { addedAt, nick }], ...]   // 네이티브 배열(문자열 이중직렬화 금지)
 *
 * 메모리 모델(2026-10-05, 이슈 #13·#14·#15):
 *   map(공개 조회 대상) = disk(마지막으로 읽은 저장소 상태) ⊕ pending(아직 저장되지 않은 로컬 변경).
 *   - 쓰기는 항상 **읽기 → 병합 → 쓰기**(read-merge-write)다. 직렬화 큐 안에서 저장소를 새로 읽고,
 *     그 위에 pending 변경만 얹어 청크를 만든다. 그래서 변경 알림을 놓친 탭이라도 다른 곳의 변경을
 *     덮어쓰지 않고(#15), 읽기에 실패하면 아예 쓰지 않는다(#14).
 *   - 쓰기 실패는 숨기지 않는다(#13). 용량 초과·확장 컨텍스트 무효는 재시도 없이, 그 밖의 오류는
 *     짧은 백오프로 몇 번 재시도한 뒤 **reject**하고, 실패한 변경은 메모리에서 되돌린다(구독자에 통지).
 *   - 청크 비교는 디스크와 새 청크를 똑같이 정규화한 레코드({addedAt, nick}) 문자열로 한다. 디스크에
 *     어떤 키 순서로 저장됐든(Chrome은 키 정렬해서 돌려준다) 바뀌지 않은 청크는 다시 쓰지 않는다.
 *
 * 남은 한계:
 *   - 같은 브라우저 안에선 읽기→쓰기 사이가 수 ms라 사람이 일으키기 어렵다(같은 ms 안의 두 쓰기는 한쪽 유실 가능). 기기 간에는 sync 전파 전에 두 기기가
 *     각각 쓰면 Chrome sync가 키(청크) 단위로 나중 쓰기를 남겨, 겹친 청크의 다른 변경이 사라질 수 있다.
 *   - 이 보호(읽은 뒤 병합)는 0.8.0 이상끼리만 성립한다. 0.7.x가 남은 기기·탭은 예전처럼 덮어쓸 수 있다.
 */
(function () {
  'use strict';

  /** @type {any} */
  var root = (typeof window !== 'undefined') ? window : (typeof self !== 'undefined' ? self : this);
  root.FMKBlind = root.FMKBlind || {};
  if (root.FMKBlind.store) return; // 이미 로드됨(중복 주입 방어)

  // ---- 상수 -------------------------------------------------------
  var SCHEMA_VER = 1;
  var QUOTA_BYTES = 102400;         // sync 전체 한도
  var QUOTA_BYTES_PER_ITEM = 8192;  // 항목(키+값) 한도
  var MAX_ITEMS = 512;              // 키 개수 한도
  var CHUNK_BUDGET = 7168;          // 청크 값 1개의 바이트 상한(항목 한도 안전마진)
  var QUOTA_WARN = Math.floor(QUOTA_BYTES * 0.9);
  var NICK_MAX = 64;                // 가져오기 닉네임 길이 상한(비정상 파일 방어)
  var RETRY_DELAYS_MS = [1000, 2000, 4000]; // 일시 오류 재시도 간격
  var LOAD_RETRY_MS = 300;          // load 읽기 1회 재시도 간격

  // ---- 내부 상태 --------------------------------------------------
  /** @type {Map<string, {nick: string, addedAt: number}>} 마지막으로 읽은 저장소 상태(저장 순서 유지) */
  var disk = new Map();
  /** @type {Map<string, {op: 'add'|'del', rec?: {nick: string, addedAt: number}, seq: number}>} 미저장 로컬 변경 */
  var pending = new Map();
  var opSeq = 0;
  /** @type {Map<string, {nick: string, addedAt: number}>} 공개 조회 대상 = disk ⊕ pending */
  var map = new Map();

  /** @type {Promise<void>|null} 성공한(또는 진행 중인) load. 실패하면 null로 되돌려 다음 호출이 재시도 */
  var loadPromise = null;

  // 전역 직렬화 큐: 쓰기(persistRun)와 외부 변경 반영(refresh)을 하나의 체인에서 순서대로 실행한다.
  /** @type {Promise<any>} */
  var serialTail = Promise.resolve();
  /** 큐에 들어갔지만 아직 시작하지 않은 쓰기 실행(이후 변경은 이 실행에 함께 실린다) */
  var queuedRun = null;
  /** 큐에 들어갔지만 아직 시작하지 않은 refresh(중복 예약 방지) */
  var queuedRefresh = null;
  /** 진행 중인 쓰기 실행이 마지막으로 읽은 디스크 상태(실패해도 반영) */
  var lastRead = null;

  /** @type {Array<function({added: string[], removed: string[]}): void>} */
  var changeSubscribers = [];

  // ---- 유틸 -------------------------------------------------------
  function hasStorage() {
    try {
      return (typeof chrome !== 'undefined') && !!chrome.storage && !!chrome.storage.sync;
    } catch (e) { return false; }
  }
  // 스크립트 시작 시 저장소가 있었는지. 나중에 사라지면(확장 업데이트로 고아가 된 content script)
  // "메모리 전용 모드"가 아니라 컨텍스트 무효로 취급해야 한다.
  var storageAtInit = hasStorage();
  var runtimeIdAtInit = (function () {
    try { return (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) || null; }
    catch (e) { return null; }
  })();

  /** 확장 컨텍스트가 살아 있는가. 업데이트·재로드 뒤 남은 content script는 runtime.id가 사라진다. */
  function contextAlive() {
    try {
      if (typeof chrome === 'undefined') return !storageAtInit;
      if (runtimeIdAtInit && !(chrome.runtime && chrome.runtime.id)) return false;
      return !storageAtInit || hasStorage();
    } catch (e) { return false; }
  }

  function byteLen(str) {
    try { return new TextEncoder().encode(str).length; }
    catch (e) { return unescape(encodeURIComponent(str)).length; }
  }

  var LINE_SEP_RE = new RegExp('[\\u2028\\u2029]', 'g'); // U+2028/U+2029(소스에 원문자로 쓰면 정규식이 깨짐)
  // 따옴표 밖의 큰 정수(addedAt 등). uid는 문자열이라 앞에 '"'가 와서 걸리지 않는다.
  var BARE_BIG_INT_RE = /[:,\[]-?\d{10,}(?=[,\]}])/g;

  /**
   * 값 하나가 Chrome sync 용량에서 차지하는 바이트(키 제외)를 근사한다. Chrome은 base::JSONWriter로
   * 직렬화한 UTF-8 길이를 센다: JSON.stringify와 같되 '<'와 U+2028/U+2029를 \uXXXX(6바이트)로 쓰고,
   * int32 밖의 정수(addedAt)에 ".0"을 붙인다. Firefox는 ".0"을 붙이지 않아 이 값보다 작게 센다.
   */
  function valueLen(value) {
    var s = JSON.stringify(value);
    var n = byteLen(s);
    n += 5 * ((s.match(/</g) || []).length);
    n += 3 * ((s.match(LINE_SEP_RE) || []).length);
    n += 2 * ((s.match(BARE_BIG_INT_RE) || []).length);
    return n;
  }
  function quotaLen(key, value) { return byteLen(key) + valueLen(value); }

  function nowMs() { return Date.now(); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  /** 오류에 code를 붙여 돌려준다(QUOTA | CONTEXT_INVALIDATED | WRITE_FAILED | READ_FAILED). */
  function coded(code, message, cause) {
    var e = new Error(message);
    e.code = code;
    if (cause) e.cause = cause;
    return e;
  }

  /** 쓰기 오류 분류. 비재시도: QUOTA·CONTEXT_INVALIDATED. 나머지(레이트리밋 포함)는 재시도 대상. */
  var OUR_CODES = { QUOTA: 1, CONTEXT_INVALIDATED: 1, WRITE_FAILED: 1, READ_FAILED: 1, SCHEMA_NEWER: 1 };
  function classify(e) {
    if (e && typeof e.code === 'string' && OUR_CODES[e.code]) return e.code; // DOMException 숫자 code 등은 무시
    var msg = String((e && e.message) || e);
    if (!contextAlive() || /context invalidated/i.test(msg)) return 'CONTEXT_INVALIDATED';
    if (/MAX_WRITE_OPERATIONS/i.test(msg)) return 'WRITE_FAILED'; // 레이트리밋(메시지에 quota 포함 — 먼저 거른다)
    if (/quota|QUOTA_BYTES|MAX_ITEMS/i.test(msg)) return 'QUOTA';
    return 'WRITE_FAILED';
  }

  function enqueueSerial(task) {
    var run = serialTail.then(function () { return task(); });
    serialTail = run.then(function () {}, function () {}); // 큐는 task 성패와 무관하게 이어진다
    return run;
  }

  // chrome.storage.sync 콜백 → Promise 래퍼(content/popup 양쪽 동작)
  function syncCall(method, arg) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.sync[method](arg, function (res) {
          var err = chrome.runtime && chrome.runtime.lastError;
          if (err) reject(new Error(err.message)); else resolve(res);
        });
      } catch (e) { reject(e); }
    });
  }
  function syncGet(keys) { return syncCall('get', keys).then(function (r) { return r || {}; }); }
  function syncSet(obj) { return syncCall('set', obj); }
  function syncRemove(keys) { return syncCall('remove', keys); }

  // ---- 레코드·청크 ------------------------------------------------
  /** 레코드를 키 정렬된 정규 형태로. Chrome 읽기 결과와 같은 키 순서라 문자열 비교가 안정적이다. */
  function canonRec(rec) {
    return { addedAt: Number(rec && rec.addedAt) || 0, nick: (rec && typeof rec.nick === 'string') ? rec.nick : String((rec && rec.nick) || '') };
  }

  /**
   * get(null) 결과에서 차단 목록을 읽는다(순수 함수).
   * @returns {{entries: Map<string,{nick:string,addedAt:number}>, chunkStr: Object<number,string>, chunkIdx: number[], metaOk: boolean, meta: any, otherBytes: number}}
   *   chunkStr[i] = 디스크 청크 i의 정규 문자열(손상 청크는 없음 → 다음 쓰기에서 덮어씀)
   */
  function parseDisk(all) {
    var entries = new Map();
    var chunkStr = {};
    var otherBytes = 0;
    var idx = [];
    Object.keys(all).forEach(function (k) {
      if (/^bl_\d+$/.test(k)) idx.push(parseInt(k.slice(3), 10));
      else if (k !== 'bl_meta') otherBytes += quotaLen(k, all[k]); // 우리 키가 아닌 값도 전체 한도를 쓴다
    });
    idx.sort(function (a, b) { return a - b; });
    for (var j = 0; j < idx.length; j++) {
      var val = all['bl_' + idx[j]];
      try {
        var arr = Array.isArray(val) ? val : JSON.parse(val); // 배열/문자열 모두 관용 처리
        if (!Array.isArray(arr)) throw new Error('청크 형식 불일치');
        var canon = [];
        for (var m = 0; m < arr.length; m++) {
          var pair = arr[m];
          if (!pair || pair.length < 2 || !pair[1]) continue;
          var uid = String(pair[0]);
          var rec = canonRec(pair[1]);
          entries.set(uid, rec);
          canon.push([uid, rec]);
        }
        chunkStr[idx[j]] = JSON.stringify(canon);
      } catch (e) {
        console.warn('[FMKBlind.store] 손상 청크 건너뜀: bl_' + idx[j], e);
      }
    }
    var meta = all.bl_meta;
    return { entries: entries, chunkStr: chunkStr, chunkIdx: idx, metaOk: !!(meta && meta.ver === SCHEMA_VER), meta: meta, otherBytes: otherBytes };
  }

  /**
   * 항목 배열을 청크로 나누고 용량을 잰다. 새로 넣는 항목이 청크 한도를 넘으면 QUOTA 오류,
   * 이미 저장돼 있던 초과 항목은 혼자 청크 하나를 쓰게 둔다(판단은 브라우저).
   * @param {Array} list  [uid, rec] 배열
   * @param {function(string): boolean} [isNew]  이번에 새로 넣는 항목인가(기본: 모두 새 항목으로 엄격 검사)
   * @returns {{chunks: Array<Array<[string,{addedAt:number,nick:string}]>>, total: number}}
   */
  function buildChunks(list, isNew) {
    // 청크 값 = '[' + 항목들을 ','로 이은 것 + ']' 이므로 항목 크기를 한 번씩만 재서 더한다.
    var chunks = [];
    var cur = [];
    var curLen = 0; // 현재 청크 값의 바이트(키 제외)
    var total = quotaLen('bl_meta', { ver: SCHEMA_VER });
    // 이미 저장돼 있던 초과 항목은 맨 앞(가장 짧은 키 bl_0…)에 혼자 청크로 둔다. 뒤로 밀려 키가 길어지면
    // (bl_9 → bl_10) 항목 한도 8192B에 딱 맞던 항목이 1B 넘쳐 모든 쓰기가 막힐 수 있다.
    var legacyBig = [];
    var rest = [];
    for (var p = 0; p < list.length; p++) {
      var cand = [list[p][0], canonRec(list[p][1])];
      var big = byteLen('bl_0') + 2 + valueLen(cand) > CHUNK_BUDGET;
      if (big && isNew && !isNew(cand[0])) legacyBig.push(list[p]); else rest.push(list[p]);
    }
    list = legacyBig.concat(rest);
    for (var i = 0; i < list.length; i++) {
      var entry = [list[i][0], canonRec(list[i][1])];
      var len = valueLen(entry);
      if (byteLen('bl_' + chunks.length) + 2 + len > CHUNK_BUDGET) {
        // 청크 예산(7168B)을 넘는 항목. 새로 넣는 항목이면 거절하고, 예전 버전이 이미 저장해 둔 항목이면
        // (브라우저가 받아 준 것이므로) 항목 한도(8192B) 안에서 혼자 청크 하나를 쓰게 둔다 — 그렇지 않으면
        // 그 항목 하나 때문에 다른 유저의 차단·해제까지 모두 막힌다(최종 리뷰 #23 M1).
        // 기존 항목은 크기 추정과 무관하게 받아 둔다(추정은 근사치라 브라우저가 받아 준 항목을 거절할 수 있다
        // — 예: Firefox는 '<'를 이스케이프하지 않음). 실제로 너무 크면 브라우저의 set이 판단한다.
        var soloKey = 'bl_' + (chunks.length + (cur.length ? 1 : 0));
        if (isNew ? isNew(entry[0]) : true) {
          throw coded('QUOTA', '항목 하나가 저장 한도를 넘습니다(uid=' + entry[0] + ').');
        }
        if (cur.length) {
          total += byteLen('bl_' + chunks.length) + curLen;
          chunks.push(cur);
          cur = [];
          curLen = 0;
        }
        total += byteLen(soloKey) + 2 + len;
        chunks.push([entry]);
        continue;
      }
      var key = 'bl_' + chunks.length;
      if (cur.length > 0 && byteLen(key) + curLen + 1 + len > CHUNK_BUDGET) {
        chunks.push(cur);
        total += byteLen(key) + curLen;
        cur = [];
        curLen = 0;
      }
      curLen = cur.length ? curLen + 1 + len : 2 + len;
      cur.push(entry);
    }
    if (cur.length > 0) {
      total += byteLen('bl_' + chunks.length) + curLen;
      chunks.push(cur);
    }
    return { chunks: chunks, total: total };
  }

  /** 용량 한도 검사. 넘으면 QUOTA 오류(쓰기 전에 거른다). */
  function checkQuota(built, otherBytes) {
    var total = built.total + (otherBytes || 0);
    if (built.chunks.length + 1 > MAX_ITEMS || total > QUOTA_BYTES) {
      var e = coded('QUOTA', '동기화 저장 한도(' + QUOTA_BYTES + 'B)를 넘습니다(' + total + 'B).');
      e.bytes = total;
      throw e;
    }
    if (total > QUOTA_WARN) {
      console.warn('[FMKBlind.store] 차단 목록이 sync 한도에 임박합니다(' + total + '/' + QUOTA_BYTES + 'B).');
    }
  }

  // ---- 파생 상태·통지 --------------------------------------------
  /** map = disk ⊕ pending 재계산. notify면 이전 map 대비 키 diff를 구독자에게 알린다. */
  function recompute(notify) {
    var next = new Map(disk);
    pending.forEach(function (p, uid) {
      if (p.op === 'add') next.set(uid, p.rec); else next.delete(uid);
    });
    var added = [];
    var removed = [];
    next.forEach(function (_r, uid) { if (!map.has(uid)) added.push(uid); });
    map.forEach(function (_r, uid) { if (!next.has(uid)) removed.push(uid); });
    map = next;
    if (notify && (added.length || removed.length)) notifyChange({ added: added, removed: removed });
  }

  function notifyChange(diff) {
    var subs = changeSubscribers.slice();
    for (var i = 0; i < subs.length; i++) {
      try { subs[i](diff); } catch (e) { console.warn('[FMKBlind.store] onChange 구독자 콜백 예외(격리됨).', e); }
    }
  }

  // ---- 쓰기(read-merge-write) -------------------------------------
  /**
   * 저장소를 새로 읽고 ops를 얹어 바뀐 청크만 쓴다. 성공하면 disk를 병합 결과로 갱신한다.
   * 읽기 실패·용량 초과·쓰기 실패는 throw(호출자가 분류·재시도).
   */
  async function writeMerged(ops) {
    var all = await syncGet(null);
    var parsed = parseDisk(all);
    lastRead = parsed.entries; // 쓰기가 실패해도 방금 읽은 디스크 상태는 살린다
    // 더 새 버전이 다른 형식으로 저장한 데이터면 쓰지 않는다(덮어쓰면 그 데이터가 사라진다 — 최종 리뷰 #23 M4).
    if (parsed.meta && Number(parsed.meta.ver) > SCHEMA_VER) { // "2" 같은 문자열 버전도 막는다
      throw coded('SCHEMA_NEWER', '더 새 버전의 확장이 저장한 목록입니다(형식 ' + parsed.meta.ver + ') — 확장을 업데이트해 주세요.');
    }
    var merged = new Map(parsed.entries);
    ops.forEach(function (o) {
      if (o.op === 'add') merged.set(o.uid, o.rec); else merged.delete(o.uid);
    });

    var newUids = {};
    ops.forEach(function (o) { if (o.op === 'add') newUids[o.uid] = 1; });
    var built = buildChunks(Array.from(merged.entries()), function (uid) { return !!newUids[uid]; });
    // 용량 사전 검사는 목록이 커지는 쓰기에만 한다. 추정은 근사치라, 브라우저가 이미 받아 준 목록을
    // 줄이는 쓰기(해제 등)까지 막으면 한도 근처 사용자가 영영 정리할 수 없다 — 최종 판단은 브라우저에 맡긴다.
    var diskTotal = quotaLen('bl_meta', { ver: SCHEMA_VER });
    parsed.chunkIdx.forEach(function (n) { diskTotal += quotaLen('bl_' + n, all['bl_' + n]); });
    if (built.total > diskTotal) checkQuota(built, parsed.otherBytes);

    var toSet = {};
    if (!parsed.metaOk) toSet.bl_meta = { ver: SCHEMA_VER };
    for (var i = 0; i < built.chunks.length; i++) {
      if (parsed.chunkStr[i] !== JSON.stringify(built.chunks[i])) toSet['bl_' + i] = built.chunks[i];
    }
    var stale = parsed.chunkIdx
      .filter(function (n) { return n >= built.chunks.length; })
      .map(function (n) { return 'bl_' + n; });

    // 남는 청크는 같은 set 호출에서 빈 배열로 비운다(한 번의 원자적 쓰기 — 다른 탭이 중간 상태에서
    // 지워진 항목을 보거나, 지우기만 실패해 되살아나는 일이 없다). 키 삭제는 그 뒤 정리용(실패해도 무해).
    stale.forEach(function (k) {
      if (parsed.chunkStr[parseInt(k.slice(3), 10)] !== '[]') toSet[k] = [];
    });
    if (Object.keys(toSet).length) await syncSet(toSet);
    disk = merged;
    if (stale.length) {
      try { await syncRemove(stale); } catch (e) { console.warn('[FMKBlind.store] 빈 청크 정리 실패(무해).', e); }
    }
  }

  /** 현재 pending 전부를 한 번에 저장한다. 실패하면 그 변경들을 되돌리고 reject. */
  async function persistRun() {
    lastRead = null;
    if (!contextAlive()) {
      var dead = coded('CONTEXT_INVALIDATED', '확장 컨텍스트가 무효합니다(확장 업데이트·재로드 후 남은 페이지).');
      rollback(snapshotOps());
      throw dead;
    }
    if (!hasStorage()) return; // 저장소 없는 환경(테스트 등) — 메모리 전용

    var ops = snapshotOps();
    if (!ops.length) return;

    for (var attempt = 0; ; attempt++) {
      try {
        await writeMerged(ops);
        break;
      } catch (e) {
        var code = classify(e);
        if (code === 'WRITE_FAILED' && attempt < RETRY_DELAYS_MS.length) {
          console.warn('[FMKBlind.store] sync 쓰기 실패 — 재시도 ' + (attempt + 1) + '/' + RETRY_DELAYS_MS.length, e);
          await sleep(RETRY_DELAYS_MS[attempt]);
          continue;
        }
        if (lastRead) disk = lastRead;
        rollback(ops);
        throw (e && e.code === code) ? e : coded(code, String((e && e.message) || e), e);
      }
    }

    // 성공: 이번에 실은 변경만 pending에서 뺀다(그사이 같은 uid에 새 변경이 오면 seq가 달라 남는다).
    ops.forEach(function (o) {
      var p = pending.get(o.uid);
      if (p && p.seq === o.seq) pending.delete(o.uid);
    });
    recompute(true); // 읽기에서 발견한 외부 변경만 diff로 나간다(자기 변경은 이미 map에 반영돼 있음)
  }

  function snapshotOps() {
    var ops = [];
    pending.forEach(function (p, uid) { ops.push({ uid: uid, op: p.op, rec: p.rec, seq: p.seq }); });
    return ops;
  }

  /** 실패한 변경을 pending에서 빼고 map을 되돌린다(구독자에 통지 → 화면도 원상 복구). */
  function rollback(ops) {
    ops.forEach(function (o) {
      var p = pending.get(o.uid);
      if (p && p.seq === o.seq) pending.delete(o.uid);
    });
    recompute(true);
  }

  /**
   * 쓰기를 요청한다. 아직 시작하지 않은 실행이 있으면 거기에 함께 실리고, 없으면 새로 큐에 넣는다.
   * 반환 Promise: resolve = sync에 저장 완료, reject = 저장 실패(코드 포함, 변경은 되돌려짐).
   */
  function requestPersist() {
    if (queuedRun) return queuedRun;
    var run = enqueueSerial(function () {
      queuedRun = null;
      return persistRun();
    });
    queuedRun = run;
    return run;
  }

  function addOp(uid, op, rec) {
    pending.set(uid, { op: op, rec: rec, seq: ++opSeq, run: null });
  }

  /** uid들의 변경을 실어 갈 쓰기를 요청하고, 각 pending 항목에 그 실행을 기록한다. */
  function persistOps(uids) {
    var run = requestPersist();
    uids.forEach(function (uid) {
      var p = pending.get(uid);
      if (p) p.run = run;
    });
    return run;
  }

  /** 이미 미저장 변경이 있는 uid면 그 변경을 실은 실행을, 아니면 null(→ 이미 저장된 상태). */
  function carryingRun(uid, op) {
    var p = pending.get(uid);
    return (p && p.op === op && p.run) ? p.run : null;
  }

  // ---- 읽기(load·refresh) -----------------------------------------
  async function readDisk() {
    try {
      return parseDisk(await syncGet(null));
    } catch (e) {
      await sleep(LOAD_RETRY_MS);
      try {
        return parseDisk(await syncGet(null));
      } catch (e2) {
        throw coded(classify(e2) === 'CONTEXT_INVALIDATED' ? 'CONTEXT_INVALIDATED' : 'READ_FAILED',
          '차단 목록을 읽지 못했습니다.', e2);
      }
    }
  }

  /** 외부 변경 반영: 저장소를 다시 읽어 disk를 갱신하고 diff를 통지한다(쓰기 없음). */
  function scheduleRefresh() {
    if (!hasStorage() || queuedRefresh) return;
    queuedRefresh = enqueueSerial(async function () {
      queuedRefresh = null;
      var parsed;
      try {
        parsed = parseDisk(await syncGet(null));
      } catch (e) {
        console.warn('[FMKBlind.store] 변경 반영용 읽기 실패 — 무시.', e);
        return;
      }
      if (parsed.meta && parsed.meta.ver !== SCHEMA_VER) {
        console.warn('[FMKBlind.store] 스키마 버전 불일치(저장=' + parsed.meta.ver + '). best-effort.');
      }
      disk = parsed.entries;
      recompute(true);
    });
  }

  function installListeners() {
    try {
      if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged &&
          typeof chrome.storage.onChanged.addListener === 'function') {
        chrome.storage.onChanged.addListener(function (changes, areaName) {
          if (areaName !== 'sync') return;
          for (var key in changes) {
            if (Object.prototype.hasOwnProperty.call(changes, key) && (key === 'bl_meta' || /^bl_\d+$/.test(key))) {
              scheduleRefresh();
              return;
            }
          }
        });
      }
    } catch (e) { /* onChanged 미지원 — load 시점 동기화만 */ }

    // 알림을 놓쳤을 수 있는 순간(뒤로가기 캐시 복원, 백그라운드 탭 복귀)에 저장소와 다시 맞춘다.
    try {
      if (typeof window !== 'undefined' && window.addEventListener) {
        window.addEventListener('pageshow', function (e) { if (e && e.persisted && loadPromise) scheduleRefresh(); });
      }
      if (typeof document !== 'undefined' && document.addEventListener) {
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible' && loadPromise) scheduleRefresh();
        });
      }
    } catch (e) { /* 이벤트 미지원 컨텍스트 */ }
  }

  // ---- 공개 API ---------------------------------------------------
  /** @namespace window.FMKBlind.store */
  var store = {
    /**
     * 저장소에서 목록을 읽어 온다. 앱 시작 시 1회 await(멱등).
     * 읽기는 1회 재시도하고, 그래도 실패하면 reject(code READ_FAILED | CONTEXT_INVALIDATED).
     * 실패한 load는 캐시하지 않으므로 다시 호출하면 재시도한다.
     * @returns {Promise<void>}
     */
    load: function () {
      if (loadPromise) return loadPromise;
      if (!hasStorage()) {
        console.warn('[FMKBlind.store] chrome.storage.sync 미가용 — 빈 목록으로 시작.');
        loadPromise = Promise.resolve();
        return loadPromise;
      }
      var p = enqueueSerial(async function () {
        var parsed = await readDisk();
        if (parsed.meta && parsed.meta.ver !== SCHEMA_VER) {
          console.warn('[FMKBlind.store] 스키마 버전 불일치(저장=' + parsed.meta.ver +
            ', 기대=' + SCHEMA_VER + '). best-effort 복원 시도.');
        }
        disk = parsed.entries;
        recompute(false);
      });
      loadPromise = p.catch(function (e) {
        loadPromise = null;
        throw e;
      });
      return loadPromise;
    },

    /** @param {string} uid @returns {boolean} */
    isBlocked: function (uid) {
      return map.has(String(uid));
    },

    /**
     * 차단 추가. 메모리는 반환 전에 바로 바뀐다(isBlocked 즉시 true).
     * 이미 차단돼 있으면 nick만 갱신(addedAt 유지), 바뀐 게 없으면 쓰지 않는다.
     * @param {string} uid
     * @param {string} [nick]
     * @returns {Promise<void>} resolve = sync 저장 완료. reject = 저장 실패(err.code), 변경은 되돌려짐.
     */
    block: function (uid, nick) {
      uid = String(uid);
      var existing = map.get(uid);
      if (existing) {
        if (typeof nick !== 'string' || nick === existing.nick) {
          // 바뀐 게 없으면 쓰지 않는다. 아직 저장 중인 차단이면 그 결과(실패 시 reject)를 따른다.
          return carryingRun(uid, 'add') || Promise.resolve();
        }
        addOp(uid, 'add', { nick: nick, addedAt: existing.addedAt });
      } else {
        addOp(uid, 'add', { nick: typeof nick === 'string' ? nick : '', addedAt: nowMs() });
      }
      recompute(false);
      return persistOps([uid]);
    },

    /**
     * 차단 해제. 메모리는 반환 전에 바로 바뀐다. 없는 uid는 no-op.
     * @param {string} uid
     * @returns {Promise<void>} resolve = sync 저장 완료. reject = 저장 실패(err.code), 변경은 되돌려짐.
     */
    unblock: function (uid) {
      uid = String(uid);
      if (!map.has(uid)) return carryingRun(uid, 'del') || Promise.resolve();
      addOp(uid, 'del');
      recompute(false);
      return persistOps([uid]);
    },

    /** 차단 목록 스냅샷(복사본). addedAt 내림차순. @returns {Array<{uid:string,nick:string,addedAt:number}>} */
    list: function () {
      var out = [];
      map.forEach(function (rec, uid) {
        out.push({ uid: uid, nick: rec.nick, addedAt: rec.addedAt });
      });
      out.sort(function (a, b) { return b.addedAt - a.addedAt; });
      return out;
    },

    /** @returns {number} */
    count: function () {
      return map.size;
    },

    /**
     * 목록 변경 구독. 다른 탭/팝업/기기의 변경, 그리고 저장 실패로 되돌린 변경을
     * ({ added: string[], removed: string[] }) 키 diff로 알린다. 자기 변경이 성공한 경우엔 알리지 않는다.
     * @param {function({added: string[], removed: string[]}): void} cb
     * @returns {function(): void} unsubscribe
     */
    onChange: function (cb) {
      if (typeof cb !== 'function') return function () {};
      changeSubscribers.push(cb);
      return function unsubscribe() {
        var i = changeSubscribers.indexOf(cb);
        if (i !== -1) changeSubscribers.splice(i, 1);
      };
    },

    /**
     * 배치 가져오기. 새 uid는 추가, 이미 있는 uid는 건너뛰고(skipped), 비정상 항목은 invalid로 센다.
     * 닉네임은 NICK_MAX자로 자른다. 메모리를 건드리기 전에 가져온 뒤의 예상 용량을 재서
     * 한도를 넘으면 아무것도 바꾸지 않고 reject(code QUOTA, err.fit = 대략 더 넣을 수 있는 인원).
     * @param {Array<{uid: string|number, nick?: string, addedAt?: number}>} items
     * @returns {Promise<{added: number, skipped: number, invalid: number}>} resolve = sync 저장 완료.
     */
    importMany: function (items) {
      var result = { added: 0, skipped: 0, invalid: 0 };
      if (!Array.isArray(items)) {
        console.warn('[FMKBlind.store] importMany: items가 배열이 아닙니다 — 무시.');
        return Promise.resolve(result);
      }

      var adds = [];
      var seen = new Set();
      for (var i = 0; i < items.length; i++) {
        var it = items[i];
        if (!it || typeof it !== 'object') { result.invalid++; continue; }
        if (it.uid === undefined || it.uid === null) { result.invalid++; continue; }
        var uid = String(it.uid);
        if (!/^\d+$/.test(uid)) { result.invalid++; continue; }
        if (map.has(uid) || seen.has(uid)) { result.skipped++; continue; }
        seen.add(uid);
        var nick = (typeof it.nick === 'string') ? it.nick.slice(0, NICK_MAX) : '';
        var addedAt = Number(it.addedAt);
        if (!isFinite(addedAt) || addedAt <= 0) addedAt = nowMs();
        adds.push([uid, { nick: nick, addedAt: addedAt }]);
      }
      result.added = adds.length;
      if (!adds.length) return Promise.resolve(result);

      // 메모리를 바꾸기 전에 용량부터 확인(부분 가져오기 없음).
      try {
        var current = Array.from(map.entries());
        var addSet = {};
        adds.forEach(function (a) { addSet[a[0]] = 1; });
        checkQuota(buildChunks(current.concat(adds), function (uid) { return !!addSet[uid]; }));
      } catch (e) {
        if (e && e.code === 'QUOTA') {
          try {
            var used = buildChunks(Array.from(map.entries()), function () { return false; }).total;
            var per = 0;
            adds.forEach(function (a) { per += valueLen([a[0], canonRec(a[1])]) + 1; });
            per /= adds.length;
            // 청크 경계·키 바이트 몫을 감안해 5% 낮춰 잡는다(안내한 인원을 넣었는데 또 실패하지 않게).
            e.fit = Math.max(0, Math.floor((QUOTA_BYTES - used) / Math.max(per, 1) * 0.95));
          } catch (e2) { e.fit = 0; }
        }
        return Promise.reject(e);
      }

      adds.forEach(function (a) { addOp(a[0], 'add', a[1]); });
      recompute(false);
      return persistOps(adds.map(function (a) { return a[0]; })).then(function () { return result; });
    }
  };

  installListeners();

  root.FMKBlind.store = store;
})();
