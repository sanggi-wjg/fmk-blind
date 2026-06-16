/**
 * FMK-Blind — sync 샤딩 저장 계층 (store)
 * ------------------------------------------------------------------
 * content script(content_scripts에 순서 로드)와 popup(<script src>)이
 * **동일 파일을 공유**한다. 상태는 chrome.storage.sync로 동기화된다.
 *
 * 공개 계약: window.FMKBlind.store = { load, isBlocked, block, unblock, list, count, onChange }
 *   - 6개(load~count)는 v1 FROZEN. onChange는 가산적 7번째 선택 API(2026-06-15, 라이브 동기 C9).
 * 자세한 시그니처/불변식: .claude/workspace/store-api-contract.md
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
 * 라이브 동기(C9, 2026-06-15 구현): chrome.storage.onChanged로 외부(다른 탭/팝업/기기) 변경 시
 *   외부 델타만 메모리 맵에 reconcile하고(로컬 미영속 항목 보존) persistedChunks 스냅샷을 스토리지
 *   권위로 정합한 뒤 구독자에게 diff 통지(onChange). 핸들러는 절대 sync에 쓰지 않으며(읽기+메모리만)
 *   persist와 같은 직렬화 큐에서 순차 실행 → 피드백 루프·인터리브 없음. reconcile + 스냅샷 정합이
 *   잔여 엣지 I2(해제 후 되살림)와 마이크로태스크 경쟁(미영속 항목 유실)을 함께 닫는다.
 *
 * v1 범위 밖(구현 금지): 압축 / 내보내기·가져오기
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

  // 전역 직렬화 큐: persist(로컬 write)와 onChanged-rebuild(외부 변경 반영)를 **하나의 tail
  // Promise 체인**에 모두 태운다. 핵심 불변식:
  //   ① 외부 onChanged rebuild는 진행 중이던 로컬 write가 **커밋된 뒤** 실행된다
  //      → 스토리지가 (로컬 write + 외부 변경) 합집합을 반영한 상태에서 read하므로 rebuild가 둘 다 정확히 반영.
  //   ② rebuild는 절대 persist와 인터리브되지 않는다(둘 다 같은 큐에서 순차 실행).
  // rebuild는 읽기+메모리 갱신만 하고 sync에 쓰지 않으므로 피드백 루프가 없다.
  /** @type {Promise<any>} 직렬화 큐의 꼬리 */
  var serialTail = Promise.resolve();

  /**
   * task(()=>Promise)를 직렬화 큐 꼬리에 이어붙이고, 그 task의 완료 Promise를 반환한다.
   * task가 throw해도 큐 자체는 끊기지 않는다(다음 task가 계속 진행).
   * @param {function(): (Promise<any>|any)} task
   * @returns {Promise<any>}
   */
  function enqueueSerial(task) {
    var run = serialTail.then(function () { return task(); });
    // 큐 꼬리는 task 성패와 무관하게 계속 이어지도록 swallow.
    serialTail = run.then(function () {}, function () {});
    return run;
  }

  // ---- onChanged 라이브 동기 ---------------------------------------
  /** @type {Array<function({added: string[], removed: string[]}): void>} 구독자 콜백 */
  var changeSubscribers = [];

  /**
   * 외부(다른 탭/팝업/기기) sync 변경을 메모리에 **reconcile(외부 델타만 적용)**로 반영하고
   * 구독자에게 통지한다. 직렬화 큐에서 실행되므로 진행 중 persist 커밋 뒤에 돈다(인터리브 없음).
   *
   * clobber(map.clear) 대신 reconcile를 쓰는 이유(경쟁 수정): 이 핸들러가 await(syncGet) 중인
   * 사이 이 컨텍스트에서 막 block()한 항목은 map엔 있으나 디스크엔 아직 없다 — clobber면 그 미영속
   * 항목이 지워지고 이어진 persist가 못 써 **영구 유실**(+ 잘못된 removed 통지)된다. reconcile는
   * "디스크 vs 우리가 마지막에 안 디스크 스냅샷(persistedChunks=prevMap)"의 **외부 델타만** map에
   * 적용하므로, prevMap에도 디스크에도 없는 로컬 미영속 항목은 손대지 않아 보존된다(레이트리밋 C7
   * 재시도 대기분도 동일하게 보존).
   *
   * 자기-쓰기 에코: 디스크 == prevMap이라 델타가 비어 no-op(콜백 생략). 핸들러는 읽기 전용(쓰기 없음).
   * @returns {Promise<void>}
   */
  async function applyExternalChange() {
    if (!hasStorage()) return;
    var all;
    try {
      all = await syncGet(null);
    } catch (e) {
      console.warn('[FMKBlind.store] onChanged sync 읽기 실패 — 무시.', e);
      return;
    }

    var parsed = parseSnapshot(all);

    // 디스크(권위) uid→rec
    var diskMap = new Map();
    for (var i = 0; i < parsed.entries.length; i++) diskMap.set(parsed.entries[i][0], parsed.entries[i][1]);

    // 우리가 마지막으로 안 디스크 스냅샷(persistedChunks) → prevMap. 외부 델타 판정의 기준선.
    var prevMap = parsePersistedSnapshot();

    var added = [];   // 외부에서 새로 차단(map에 새로 등장) → 현재 탭 숨김 대상
    var removed = []; // 외부에서 해제 → 현재 탭 복구 대상

    // 외부 추가/변경: 디스크에 있고 prev와 다르거나 없는 uid를 map에 반영.
    diskMap.forEach(function (rec, uid) {
      var prev = prevMap.get(uid);
      if (!prev || prev.nick !== rec.nick || prev.addedAt !== rec.addedAt) {
        var wasInMap = map.has(uid);
        map.set(uid, rec);
        if (!wasInMap) added.push(uid); // 새로 등장한 것만 통지(이미 있으면 데이터 갱신뿐)
      }
    });

    // 외부 제거: prev엔 있었는데 디스크에 없는 uid만 map에서 제거.
    // 로컬 미영속 항목은 prev에 없으므로 이 루프에 안 걸려 보존된다(유실·오통지 방지).
    prevMap.forEach(function (_rec, uid) {
      if (!diskMap.has(uid)) {
        if (map.delete(uid)) removed.push(uid);
      }
    });

    // 스냅샷(persistedChunks)·메타 플래그(metaPersisted)를 디스크 권위로 재정규화
    // → 직후 로컬 persist가 미영속 항목을 변경분으로 올바로 기록(I2 유지).
    persistedChunks = parsed.snapshot;
    metaPersisted = parsed.metaOk;

    if (added.length === 0 && removed.length === 0) return;
    notifyChange({ added: added, removed: removed });
  }

  /** 등록된 구독자에게 diff 통지. 한 콜백의 예외가 다른 구독자/스토어를 깨지 않도록 격리. */
  function notifyChange(diff) {
    // 호출 중 unsubscribe가 배열을 건드려도 안전하도록 복사본 순회.
    var subs = changeSubscribers.slice();
    for (var i = 0; i < subs.length; i++) {
      try {
        subs[i](diff);
      } catch (e) {
        console.warn('[FMKBlind.store] onChange 구독자 콜백 예외(격리됨).', e);
      }
    }
  }

  /**
   * chrome.storage.onChanged 리스너 등록(존재 가드). sync 영역의 bl_*(숫자)/bl_meta 변경만 처리.
   * 외부·자기 쓰기 모두 들어오지만, 자기-쓰기는 diff가 비어 무해(applyExternalChange 참고).
   */
  function installOnChangedListener() {
    if (!(typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged
          && typeof chrome.storage.onChanged.addListener === 'function')) {
      return; // onChanged 미지원 컨텍스트 → 라이브 동기 없이도 정상 동작(load 시점 동기화).
    }
    chrome.storage.onChanged.addListener(function (changes, areaName) {
      if (areaName !== 'sync') return;
      var relevant = false;
      for (var key in changes) {
        if (!Object.prototype.hasOwnProperty.call(changes, key)) continue;
        if (key === 'bl_meta' || /^bl_\d+$/.test(key)) { relevant = true; break; }
      }
      if (!relevant) return;
      // 직렬화 큐에 합류: 진행 중 로컬 write 커밋 뒤 rebuild가 돈다(인터리브 방지).
      enqueueSerial(applyExternalChange);
    });
  }

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
   *
   * persist 작업은 **전역 직렬화 큐(serialTail)**에 태운다 → 외부 onChanged-rebuild와
   * 같은 체인에서 순차 실행되어 둘이 절대 인터리브되지 않는다(rebuild는 진행 중 write 커밋 뒤 실행).
   * @returns {Promise<void>}
   */
  function persistNow() {
    if (persistInFlight) {
      // 진행 중인 persist 작업이 끝난 뒤 한 번 더 돌도록 예약하고, 그 꼬리를 반환한다.
      persistDirty = true;
      return persistInFlight;
    }
    // 직렬화 큐에 합류. coalesce 루프로 진행 중 들어온 변경(dirty)을 흡수.
    var chain = enqueueSerial(async function run() {
      do {
        persistDirty = false;
        await persistOnce();
      } while (persistDirty);
    });
    // 에러는 persistOnce가 흡수하므로 정상 종료. 종료 시 in-flight 표식 해제.
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
  /**
   * syncGet 결과(all)에서 bl_*(숫자) 청크를 파싱해 항목 배열 + 정규화된 청크 JSON 스냅샷을 만든다.
   * load(clobber)·onChanged(reconcile)가 공유하는 순수 파서(부수효과·쓰기 없음).
   * @param {Object} all  chrome.storage.sync.get(null) 결과
   * @returns {{entries: Array<[string,{nick:string,addedAt:number}]>, snapshot: Array<string|undefined>, metaOk: boolean, meta: any}}
   */
  function parseSnapshot(all) {
    var indices = Object.keys(all)
      .filter(function (k) { return /^bl_\d+$/.test(k); })
      .map(function (k) { return parseInt(k.slice(3), 10); })
      .sort(function (a, b) { return a - b; });

    var entries = [];
    for (var j = 0; j < indices.length; j++) {
      var val = all['bl_' + indices[j]];
      try {
        var arr = Array.isArray(val) ? val : JSON.parse(val); // 배열/문자열 모두 관용 처리
        if (!Array.isArray(arr)) throw new Error('청크 형식 불일치');
        for (var m = 0; m < arr.length; m++) {
          var pair = arr[m];
          if (!pair || pair.length < 2 || !pair[1]) continue;
          var rec = pair[1];
          entries.push([String(pair[0]), {
            nick: typeof rec.nick === 'string' ? rec.nick : String(rec.nick || ''),
            addedAt: Number(rec.addedAt) || 0
          }]);
        }
      } catch (e) {
        console.warn('[FMKBlind.store] 손상 청크 건너뜀: bl_' + indices[j], e);
      }
    }

    // 디스크 청크를 우리가 쓸 형태(네이티브 배열)와 동일 직렬화로 정규화 — 변경분 diff 비교용.
    var maxIdx = indices.length ? indices[indices.length - 1] : -1;
    var snapshot = new Array(maxIdx + 1);
    for (var p = 0; p < indices.length; p++) {
      var di = indices[p];
      var dv = all['bl_' + di];
      try {
        snapshot[di] = JSON.stringify(Array.isArray(dv) ? dv : JSON.parse(dv));
      } catch (e) {
        snapshot[di] = undefined; // 손상 → 다음 쓰기에서 강제 갱신
      }
    }

    var meta = all.bl_meta;
    return { entries: entries, snapshot: snapshot, metaOk: !!(meta && meta.ver === SCHEMA_VER), meta: meta };
  }

  /**
   * 현재 persistedChunks(우리가 마지막으로 안 디스크 스냅샷, 인덱스별 JSON 문자열)를 uid→rec Map으로 파싱.
   * onChanged reconcile의 "이전 디스크 상태(prevMap)" 기준선. 로컬 미영속 항목은 여기 없다.
   * @returns {Map<string,{nick:string,addedAt:number}>}
   */
  function parsePersistedSnapshot() {
    var out = new Map();
    for (var i = 0; i < persistedChunks.length; i++) {
      var s = persistedChunks[i];
      if (typeof s !== 'string') continue;
      try {
        var arr = JSON.parse(s);
        if (!Array.isArray(arr)) continue;
        for (var k = 0; k < arr.length; k++) {
          var pair = arr[k];
          if (!pair || pair.length < 2 || !pair[1]) continue;
          var rec = pair[1];
          out.set(String(pair[0]), {
            nick: typeof rec.nick === 'string' ? rec.nick : String(rec.nick || ''),
            addedAt: Number(rec.addedAt) || 0
          });
        }
      } catch (e) { /* 손상 스냅샷 청크 무시 */ }
    }
    return out;
  }

  /**
   * chrome.storage.sync를 **단일 권위**로 메모리 맵을 통째로 재구성(clobber)한다. **load() 전용**.
   * 최초 로드엔 로컬 미영속 상태가 없어 clobber가 안전·정확하다.
   * (외부 변경 라이브 반영은 applyExternalChange의 reconcile 경로 — map.clear 안 함.)
   * 부수효과: map.clear() 후 재채움, persistedChunks/metaPersisted를 디스크 상태로 정규화.
   * **읽기 전용**(절대 sync에 쓰지 않음). 읽기 실패 시 기존 메모리 보존(빈 맵으로 덮지 않음).
   * @returns {Promise<void>}
   */
  async function rebuildFromStorage() {
    if (!hasStorage()) return;
    var all;
    try {
      all = await syncGet(null);
    } catch (e) {
      console.warn('[FMKBlind.store] sync 읽기 실패 — 기존 메모리 상태 유지.', e);
      return;
    }

    var parsed = parseSnapshot(all);
    if (parsed.meta && parsed.meta.ver !== SCHEMA_VER) {
      // v1은 ver:1만. 불일치 시 마이그레이션 훅 자리(현재는 경고 후 best-effort 복원).
      console.warn('[FMKBlind.store] 스키마 버전 불일치(저장=' + parsed.meta.ver +
        ', 기대=' + SCHEMA_VER + '). best-effort 복원 시도.');
    }

    map.clear();
    for (var i = 0; i < parsed.entries.length; i++) {
      map.set(parsed.entries[i][0], parsed.entries[i][1]);
    }
    persistedChunks = parsed.snapshot;
    metaPersisted = parsed.metaOk;
  }

  /** load() 진입점. 최초 1회 sync에서 복원(rebuildFromStorage 공유). 동작은 종전과 동일. */
  async function doLoad() {
    if (!hasStorage()) {
      console.warn('[FMKBlind.store] chrome.storage.sync 미가용 — 빈 목록으로 시작.');
      return;
    }
    await rebuildFromStorage();
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
    },

    /**
     * (선택·가산적 7번째 API) 외부 sync 변경(다른 탭/팝업/기기) 라이브 구독.
     * chrome.storage.onChanged가 발생하면 메모리 맵을 스토리지 권위로 자동 정합한 뒤,
     * 직전 키셋 대비 diff를 콜백에 통지한다. **load() 호출 여부와 무관하게 구독 가능**(권장: load 후).
     *
     * - cb 시그니처: ({ added: string[], removed: string[] }) => void  (uid 문자열 배열)
     *   · added: 외부에서 새로 차단된 uid들 · removed: 외부에서 해제된 uid들
     *   · 값만 바뀌고(nick 변경 등) 키셋이 동일하면 added/removed 모두 빈 배열 → 콜백 호출 생략.
     * - 자기-쓰기 에코(자신의 persist가 유발한 onChanged)는 diff가 비어 no-op.
     * - 반환값: **unsubscribe 함수**. 호출 시 해당 콜백 등록 해제(멱등).
     * - 다중 구독 지원. 한 콜백의 예외는 격리되어 다른 구독자/스토어에 영향 없음.
     * - onChanged 미지원 컨텍스트에서는 콜백이 호출되지 않을 뿐, 등록/해제는 정상 동작.
     *
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
    }
  };

  // 라이브 동기 리스너 등록(존재 가드 — 미지원 시 스킵). content/popup 양 컨텍스트에서 1회.
  installOnChangedListener();

  root.FMKBlind.store = store;
})();
