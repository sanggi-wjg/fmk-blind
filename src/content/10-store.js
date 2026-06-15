/**
 * FMK-Blind — sync 샤딩 저장 계층 (store)
 * ------------------------------------------------------------------
 * content script(content_scripts에 순서 로드)와 popup(<script src>)이
 * **동일 파일을 공유**한다. 상태는 chrome.storage.sync로 동기화된다.
 *
 * 공개 계약: window.FMKBlind.store = { load, isBlocked, block, unblock, list, count }
 * 자세한 시그니처/불변식: .claude/workspace/store-api-contract.md (v1, FROZEN)
 *
 * 저장 레이아웃:
 *   bl_meta = { ver: 1 }                         // 스키마 버전
 *   bl_0, bl_1, ... bl_N                          // 차단 목록을 8KB 미만 청크로 분할
 *   각 청크 값 = [[uid, { nick, addedAt }], ...]  // 네이티브 배열(문자열 이중직렬화 금지)
 *
 * 제약(반드시 준수):
 *   - 항목당 ~8KB(8,192B), 전체 ~100KB(102,400B)
 *   - block/unblock은 즉시·직렬 영속화(반환 Promise resolve = sync 쓰기 완료, C3), 변경된 청크만 set·stale 청크 remove
 *   - persist는 persistNow로 직렬화(in-flight 체인 + dirty coalesce, 재진입/경쟁 안전)
 *   - 레이트리밋(분당 120/시간당 1,800) 초과 시 C7 폴백(경고 + schedulePersist 디바운스 재시도). 디바운스는 이제 실패 재시도 경로에서만 쓰인다(언로드 자동 flush는 제거 — stale 탭 되쓰기 방지)
 *
 * v1 범위 밖(구현 금지): 압축 / onChanged 반영 / 내보내기·가져오기
 */
(function () {
  'use strict';

  /** @type {any} */
  var root = (typeof window !== 'undefined') ? window : (typeof self !== 'undefined' ? self : this);
  root.FMKBlind = root.FMKBlind || {};
  if (root.FMKBlind.store) return; // 이미 로드됨(중복 주입 방어)

  // ---- 상수 -------------------------------------------------------
  var SCHEMA_VER = 1;
  var CHUNK_BUDGET = 7168;   // 청크 값 1개의 바이트 상한(8,192B 안전마진)
  var TOTAL_BUDGET = 102400; // sync 전체 한도(~100KB)
  var QUOTA_WARN = Math.floor(TOTAL_BUDGET * 0.9); // 90% 임박 경고
  var DEBOUNCE_MS = 500;     // 쓰기 디바운스

  // ---- 내부 상태 --------------------------------------------------
  /** @type {Map<string, {nick: string, addedAt: number}>} 메모리 맵 */
  var map = new Map();

  /** @type {Promise<void>|null} load 멱등 보장 */
  var loadPromise = null;

  /** 현재 sync에 반영돼 있다고 보는 청크 스냅샷(인덱스별 JSON 문자열). 변경 청크만 쓰기 위함 */
  var persistedChunks = [];
  var metaPersisted = false;

  // 디바운스 제어
  var persistTimer = null;

  // 직렬화 제어: 한 번에 하나의 persistOnce만 실행되도록 in-flight Promise를 체인한다.
  // 연속 block→unblock가 직접 즉시쓰기를 호출해도 persistOnce가 겹치지 않게 하여
  // persistedChunks 스냅샷 경쟁(둘이 동시에 스냅샷→diff→스냅샷 갱신)으로 인한 꼬임을 막는다.
  /** @type {Promise<void>|null} 현재 실행 중인 persist 체인 꼬리 */
  var persistInFlight = null;
  /** persist 진행 중에 또 변경이 들어왔는지 — 체인 종료 후 한 번 더 돌려 coalesce */
  var persistDirty = false;

  // ---- 유틸 -------------------------------------------------------
  function hasStorage() {
    return (typeof chrome !== 'undefined') && chrome.storage && chrome.storage.sync;
  }

  /** UTF-8 바이트 길이(크롬이 항목 크기를 재는 기준과 동일) */
  function byteLen(str) {
    try { return new TextEncoder().encode(str).length; }
    catch (e) { return unescape(encodeURIComponent(str)).length; }
  }

  function nowMs() { return Date.now(); }

  // chrome.storage.sync 콜백 → Promise 래퍼(content/popup 양쪽 동작)
  function syncGet(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.sync.get(keys, function (res) {
          var err = chrome.runtime && chrome.runtime.lastError;
          if (err) reject(new Error(err.message)); else resolve(res || {});
        });
      } catch (e) { reject(e); }
    });
  }
  function syncSet(obj) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.sync.set(obj, function () {
          var err = chrome.runtime && chrome.runtime.lastError;
          if (err) reject(new Error(err.message)); else resolve();
        });
      } catch (e) { reject(e); }
    });
  }
  function syncRemove(keys) {
    return new Promise(function (resolve, reject) {
      try {
        chrome.storage.sync.remove(keys, function () {
          var err = chrome.runtime && chrome.runtime.lastError;
          if (err) reject(new Error(err.message)); else resolve();
        });
      } catch (e) { reject(e); }
    });
  }

  // ---- 청킹 -------------------------------------------------------
  /**
   * 메모리 항목 배열을 청크로 분할. 각 청크는 JSON 직렬화 시 CHUNK_BUDGET 미만.
   * @param {Array<[string, {nick:string, addedAt:number}]>} entries
   * @returns {Array<Array<[string, {nick:string, addedAt:number}]>>}
   */
  function buildChunks(entries) {
    var chunks = [];
    var cur = [];
    for (var i = 0; i < entries.length; i++) {
      var entry = entries[i];
      var next = cur.concat([entry]);
      if (cur.length > 0 && byteLen(JSON.stringify(next)) > CHUNK_BUDGET) {
        chunks.push(cur);
        cur = [entry];
      } else {
        cur = next;
      }
      // 단일 항목 자체가 한도 초과(비정상 닉 등) → 경고(쓰기 실패는 catch에서 흡수)
      if (cur.length === 1 && byteLen(JSON.stringify(cur)) > CHUNK_BUDGET) {
        console.warn('[FMKBlind.store] 단일 항목이 청크 한도를 초과합니다(uid=' + entry[0] + '). 8KB 제약 위반 가능.');
      }
    }
    if (cur.length > 0) chunks.push(cur);
    return chunks;
  }

  // ---- 영속화 -----------------------------------------------------
  // 메모리 → sync 1회 영속화. 항상 resolve(실패 시 경고 + 디바운스 재시도).
  // 동기 프리픽스에서 chrome.storage.sync.set IPC를 디스패치하므로 언로드 중 호출돼도 쓰기가 발신된다.
  async function persistOnce() {
    if (!hasStorage()) {
      console.warn('[FMKBlind.store] chrome.storage.sync 미가용 — 메모리 전용 모드(영속화 생략).');
      return;
    }

    var entries = Array.from(map.entries());
    var chunks = buildChunks(entries);
    var newVals = chunks.map(function (c) { return JSON.stringify(c); });

    // 변경된 청크만 set
    var toSet = {};
    if (!metaPersisted) toSet.bl_meta = { ver: SCHEMA_VER };
    var total = byteLen('bl_meta') + byteLen(JSON.stringify({ ver: SCHEMA_VER }));
    for (var i = 0; i < chunks.length; i++) {
      var key = 'bl_' + i;
      total += byteLen(key) + byteLen(newVals[i]);
      if (persistedChunks[i] !== newVals[i]) toSet[key] = chunks[i];
    }

    // 청크 수 감소 → 남는 키 정리(유령 데이터 방지)
    var staleKeys = [];
    for (var k = chunks.length; k < persistedChunks.length; k++) staleKeys.push('bl_' + k);

    // 용량 임박 경고
    if (total > QUOTA_WARN) {
      console.warn('[FMKBlind.store] 차단 목록이 sync 한도(' + TOTAL_BUDGET +
        'B)에 임박합니다(' + total + 'B). 항목 정리 또는 압축(TODO)이 필요합니다.');
    }

    var setKeys = Object.keys(toSet);
    if (setKeys.length === 0 && staleKeys.length === 0) {
      return; // 변경 없음
    }

    try {
      if (setKeys.length > 0) await syncSet(toSet);
      if (staleKeys.length > 0) await syncRemove(staleKeys);
      // 성공 시에만 스냅샷 갱신
      persistedChunks = newVals;
      metaPersisted = true;
    } catch (e) {
      // 메모리 상태는 유지, 경고 후 재시도(schedulePersist) 경로로 재시도
      console.warn('[FMKBlind.store] sync 쓰기 실패 — 메모리 유지, 재시도 예약.', e);
      schedulePersist();
    }
  }

  /**
   * persistOnce를 직렬 실행한다. 이미 실행 중이면 새로 시작하지 않고 dirty 플래그만 세워
   * 현재 체인이 끝난 뒤 한 번 더 돌려(coalesce) 최신 메모리 상태를 반영한다.
   * 반환 Promise는 "이 호출 시점의 변경이 sync에 반영 완료될 때"까지 resolve되지 않는다.
   * (체인 꼬리를 await → 진행 중이던 쓰기 + 필요 시 coalesce된 후속 쓰기까지 포함)
   * @returns {Promise<void>}
   */
  function persistNow() {
    if (persistInFlight) {
      // 진행 중인 쓰기가 끝난 뒤 한 번 더 돌도록 예약하고, 그 꼬리를 반환한다.
      persistDirty = true;
      return persistInFlight;
    }
    var chain = (async function run() {
      // 적어도 한 번 실행하고, 도중에 들어온 변경(dirty)이 있으면 비워질 때까지 반복.
      do {
        persistDirty = false;
        await persistOnce();
      } while (persistDirty);
    })();
    // 체인 꼬리 등록 + 종료 시 정리(에러는 persistOnce가 흡수하므로 여기선 항상 정상 종료).
    persistInFlight = chain.then(function () {
      persistInFlight = null;
    }, function () {
      persistInFlight = null;
    });
    return persistInFlight;
  }

  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(function () {
      persistTimer = null;
      persistNow();
    }, DEBOUNCE_MS);
  }

  /**
   * 보류 중 디바운스 쓰기를 즉시 반영(awaitable). 타이머를 비우고 직렬 persist를 즉시 실행한다.
   * persistOnce가 동기 프리픽스에서 sync.set IPC를 디스패치하므로, 언로드 핸들러에서
   * await 없이 호출돼도 쓰기가 발신된다.
   * @returns {Promise<void>}
   */
  function flushPending() {
    if (persistTimer) { clearTimeout(persistTimer); persistTimer = null; }
    return persistNow();
  }

  // [제거됨] 언로드(pagehide/visibilitychange) 자동 flush.
  // 과거 디바운스 모델에선 팝업 조기 종료 시 보류 쓰기를 살리는 안전망이었으나(MAJOR-1),
  // 현재 block/unblock은 즉시·동기 디스패치로 영속화하므로 비울 보류 쓰기가 없다.
  // 게다가 이 flush는 "변경되지 않은" stale 탭(팝업이 다른 곳에서 목록을 바꾼 뒤에도
  // 옛 메모리 맵을 가진 content script)이 새로고침 시 옛 목록을 sync에 되써(resurrection)
  // 해제를 무효화하는 통로였다. 실제 Chrome 직렬화 차이로 persistOnce의 청크 diff가
  // 거짓 양성이 되어 stale 맵이 기록됐다. → 통로 자체를 제거한다.

  // ---- 복원 -------------------------------------------------------
  async function doLoad() {
    if (!hasStorage()) {
      console.warn('[FMKBlind.store] chrome.storage.sync 미가용 — 빈 목록으로 시작.');
      return;
    }
    var all;
    try {
      all = await syncGet(null);
    } catch (e) {
      console.warn('[FMKBlind.store] sync 읽기 실패 — 빈 목록으로 시작.', e);
      return;
    }

    var meta = all.bl_meta;
    if (meta && meta.ver !== SCHEMA_VER) {
      // v1은 ver:1만. 불일치 시 마이그레이션 훅 자리(현재는 경고 후 best-effort 복원).
      console.warn('[FMKBlind.store] 스키마 버전 불일치(저장=' + meta.ver +
        ', 기대=' + SCHEMA_VER + '). best-effort 복원 시도.');
    }

    // bl_<숫자> 키만 인덱스 순으로
    var indices = Object.keys(all)
      .filter(function (k) { return /^bl_\d+$/.test(k); })
      .map(function (k) { return parseInt(k.slice(3), 10); })
      .sort(function (a, b) { return a - b; });

    map.clear();
    for (var j = 0; j < indices.length; j++) {
      var idx = indices[j];
      var val = all['bl_' + idx];
      try {
        var arr = Array.isArray(val) ? val : JSON.parse(val); // 배열/문자열 모두 관용 처리
        if (!Array.isArray(arr)) throw new Error('청크 형식 불일치');
        for (var m = 0; m < arr.length; m++) {
          var pair = arr[m];
          if (!pair || pair.length < 2 || !pair[1]) continue;
          var uid = String(pair[0]);
          var rec = pair[1];
          map.set(uid, {
            nick: typeof rec.nick === 'string' ? rec.nick : String(rec.nick || ''),
            addedAt: Number(rec.addedAt) || 0
          });
        }
      } catch (e) {
        // 파싱 실패 청크는 건너뛰고 나머지로 부분 복원
        console.warn('[FMKBlind.store] 손상 청크 건너뜀: bl_' + idx, e);
      }
    }

    // 현재 디스크 상태를 스냅샷으로 — 이후 첫 쓰기는 변경분만 기록
    var maxIdx = indices.length ? indices[indices.length - 1] : -1;
    persistedChunks = new Array(maxIdx + 1);
    for (var p = 0; p < indices.length; p++) {
      var di = indices[p];
      var dv = all['bl_' + di];
      // set 시 우리가 쓸 형태(네이티브 배열)와 동일 직렬화로 비교 가능하게 정규화
      try {
        persistedChunks[di] = JSON.stringify(Array.isArray(dv) ? dv : JSON.parse(dv));
      } catch (e) {
        persistedChunks[di] = undefined; // 손상 → 다음 쓰기에서 강제 갱신
      }
    }
    metaPersisted = !!(meta && meta.ver === SCHEMA_VER);
  }

  // ---- 공개 API ---------------------------------------------------
  /** @namespace window.FMKBlind.store */
  var store = {
    /**
     * sync에서 메모리 맵을 복원한다. 앱 시작 시 최초 1회 await.
     * 멱등(중복 호출 안전). 실패해도 빈 맵으로 동작.
     * @returns {Promise<void>}
     */
    load: function () {
      if (loadPromise) return loadPromise;
      loadPromise = doLoad();
      return loadPromise;
    },

    /**
     * 차단 여부 조회(동기).
     * @param {string} uid
     * @returns {boolean}
     */
    isBlocked: function (uid) {
      return map.has(String(uid));
    },

    /**
     * 차단 추가 + 즉시 영속화. 멱등(있으면 nick만 갱신, addedAt 보존).
     * 메모리는 반환 전 즉시 반영(isBlocked 곧바로 true). 반환 Promise는
     * **chrome.storage.sync 쓰기가 완료될 때** resolve(계약 C3 갱신).
     * 단수명 팝업 컨텍스트에서 await 후 닫혀도 쓰기가 클릭 태스크 내에서 디스패치되어 유실되지 않는다.
     * @param {string} uid
     * @param {string} [nick]
     * @returns {Promise<void>}
     */
    block: function (uid, nick) {
      uid = String(uid);
      var existing = map.get(uid);
      if (existing) {
        if (typeof nick === 'string' && nick !== existing.nick) existing.nick = nick;
      } else {
        map.set(uid, { nick: typeof nick === 'string' ? nick : '', addedAt: nowMs() });
      }
      // 디바운스(schedulePersist) 대신 즉시·직렬 영속화. 보류 타이머가 있으면 함께 흡수.
      return flushPending();
    },

    /**
     * 차단 해제 + 즉시 영속화. 없으면 no-op(Promise.resolve()). 메모리는 반환 전 즉시 반영.
     * 반환 Promise는 **chrome.storage.sync 쓰기가 완료될 때** resolve(계약 C3 갱신).
     * 팝업에서 await 후 닫혀도 쓰기가 유실되지 않는다(영속화 누락 버그 수정).
     * @param {string} uid
     * @returns {Promise<void>}
     */
    unblock: function (uid) {
      uid = String(uid);
      if (map.delete(uid)) return flushPending();
      return Promise.resolve(); // 삭제 대상 없음 → no-op
    },

    /**
     * 차단 목록 스냅샷(복사본). addedAt 내림차순(최신 먼저).
     * @returns {Array<{uid: string, nick: string, addedAt: number}>}
     */
    list: function () {
      var out = [];
      map.forEach(function (rec, uid) {
        out.push({ uid: uid, nick: rec.nick, addedAt: rec.addedAt });
      });
      out.sort(function (a, b) { return b.addedAt - a.addedAt; });
      return out;
    },

    /**
     * 차단 인원수(동기).
     * @returns {number}
     */
    count: function () {
      return map.size;
    }
  };

  root.FMKBlind.store = store;
})();
