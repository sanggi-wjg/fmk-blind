# store API 계약 (store-api-contract.md)

FMK-Blind 차단 목록 저장 계층의 **공개 API 계약**. content script와 popup이 **동일 파일**을 공유한다.
이 문서는 storage-engineer가 소유하며, 변경 시 content-engineer·popup-engineer에게 재통지한다.

- 상태: **6 API FROZEN(v1 시그니처 고정) + 가산적 7번째 선택 API `onChange`(2026-06-15) + 가산적 8번째 선택 API `importMany`(2026-07-08, 배치 가져오기 C10)**
- 스키마 버전: `bl_meta.ver = 1`
- 작성: storage-engineer / 2026-06-14
- MAJOR-1 수정(team-lead 지침 = 내부 보강만): 디바운스 쓰기를 `pagehide`·`visibilitychange(hidden)`에서 자동 flush(C8). **공개 API·6 시그니처 변경 없음**, 소비자 코드 변경 불필요.
- **영속화 버그 수정(2026-06-15, storage-engineer)**: 팝업에서 `unblock` 후 fmkorea 새로고침 시 해제가 영속되지 않던 버그 수정. `block`/`unblock`을 디바운스 대신 **즉시·awaitable 영속화**로 전환 — 반환 Promise가 **chrome.storage.sync 쓰기 완료 시점에 resolve**한다(C3 갱신). **6 시그니처 변경 없음**(여전히 `Promise<void>`). 소비자는 기존처럼 `await block/unblock`만 하면 되나, 이제 await 완료가 곧 sync 반영 완료를 의미한다. 단수명 팝업 컨텍스트에서 await 후 닫혀도 쓰기가 클릭 태스크 내 디스패치되어 유실되지 않는다.
- **resurrection 버그 정정 수정(2026-06-15, team-lead, 실브라우저 콘솔로 확정)**: 위 즉시-영속화로도 실제 브라우저에서 해제가 새로고침 후 되살아나던 문제 발견. 진짜 원인은 **열린 fmkorea 탭의 stale content script**가 새로고침 시 옛 메모리 맵을 sync에 되쓰는 것이었고, 그 통로가 **C8 언로드(`pagehide`/`visibilitychange`) 자동 flush**였다(실 Chrome 직렬화 차이로 청크 diff가 거짓 양성 → stale 맵 기록). **C8 언로드 flush를 제거**해 정정. 즉시-영속화라 비울 보류 쓰기가 없어 안전. ⚠️ 직전 mock 기반 QA/리뷰가 이 결함을 못 잡고 PASS/MERGE를 준 점 기록(mock이 실 Chrome 직렬화·다중 컨텍스트를 재현 못 함).
- **라이브 동기 구현(2026-06-15, storage-engineer) — `chrome.storage.onChanged` 반영**: 가산적 7번째 선택 API `onChange(cb) -> unsubscribe` + 불변식 **C9** 추가(6 API FROZEN 유지, 비파괴). 외부(다른 탭/팝업/기기) sync 변경 시 메모리 맵 + `persistedChunks` 스냅샷을 **스토리지 권위로 자동 정합**하고 구독자에게 `{added,removed}` diff를 통지한다. 이로써 (a) 열린 탭이 새로고침 없이 외부 변경 반영(stale 해소), (b) **잔여 엣지 I2 해소**(§4): 외부 해제 반영 시 `persistedChunks`를 스토리지 권위로 리셋하므로, 이어진 로컬 `block`이 fresh 스냅샷에 diff → 해제된 청크를 되쓰지 않는다. onChanged 핸들러는 **절대 sync에 쓰지 않고**(읽기+메모리 갱신만) persist와 **같은 직렬화 큐**에서 순차 실행 → 에코 루프 없음.
- **onChanged reconcile 정정(2026-06-15, team-lead — 코드 리뷰가 경쟁 확정)**: 위 초기 구현은 핸들러가 `map.clear()` 후 디스크로 통째 재구성(clobber)했다. 리뷰에서 **마이크로태스크 경쟁** 확정: 외부 onChanged의 `syncGet` await 중 이 컨텍스트에서 `block()`한 항목은 map엔 있으나 디스크엔 아직 없어, clobber가 그 **미영속 항목을 유실**(+ 잘못된 `removed` 통지)시키고 직렬 큐상 뒤에 선 persist가 못 써 영구 손실됐다(직전 storage-engineer의 "레이트리밋 극단 엣지" 문서화는 범위가 좁았음). **정정**: 외부 핸들러를 `applyExternalChange`로 분리하고 **clobber→reconcile**(디스크 vs `persistedChunks` 외부 델타만 적용, 로컬 미영속 항목 보존)로 변경. `load()`는 clobber `rebuildFromStorage()` 유지(최초 로드엔 로컬 상태 없음), 둘은 순수 파서 `parseSnapshot()` 공유. I2 + 경쟁을 함께 닫음(상세 C9). ⚠️ 로직 회귀 테스트 통과(`/tmp/reconcile_test.js` 23/23: 경쟁 미영속 보존·I2·에코·라이브반영)했으나 **실 Chrome 다중 컨텍스트가 최종 게이트**(mock 거짓 PASS 전례).
- **배치 가져오기 추가(2026-07-08, storage-engineer) — `importMany` 8번째 API + C10**: 내보내기/가져오기(TODO Q7)를 위한 배치 import. 내보내기는 **새 API 불필요**(팝업이 `list()` 복사본을 그대로 JSON 직렬화). 가져오기는 대량 항목을 항목별 `block()`으로 넣으면 sync 레이트리밋(분당 120/시간당 1,800)을 압박하므로, **메모리에 일괄 반영 후 1회 직렬 flush**(기존 `flushPending()`/persist 경로 재사용 — 새 쓰기 경로 없음)하는 `importMany(items) -> Promise<{added,skipped,invalid}>`를 추가. 머지 시맨틱: 새 uid 추가(가져온 nick·addedAt, addedAt 결측/비정상이면 현재 시각), 기존 uid는 **로컬 유지·스킵**, 비정상 항목(객체 아님/uid 결측/비숫자열)은 **throw 없이 invalid 카운트**. 반환 Promise resolve = sync 쓰기 완료(C3 준용), added가 0이면 쓰기 없이 즉시 resolve(멱등). **6 API FROZEN 유지·비파괴.** C9 reconcile와 동형(import된 미영속 항목도 로컬 block처럼 prevMap·디스크에 없는 미영속 항목이라 보존됨). ⚠️ 로직 테스트 35/35(신규/중복/invalid 혼합·단일 syncSet·빈/비배열 no-op·다중 청크 단일 쓰기·reconcile 보존) 통과했으나 **실 Chrome 다중 컨텍스트가 최종 게이트**(mock 거짓 PASS 전례).

---

## 0. 파일 경로 (드리프트 해소 — 확정)

```
src/content/10-store.js
```

- **확정 경로 = `src/content/10-store.js`** (PLAN.md 파일구조 58~79행 기준).
- 근거: content script는 manifest `content_scripts.js` 배열에 **순서대로 로드**되어 `window.FMKBlind` 전역을 공유한다.
  `00-namespace.js` → `10-store.js` → … 순서로 로드되며, store는 네임스페이스 뒤·소비자(20~99) 앞에 위치해야 한다.
- sync-sharded-storage 스킬이 참조하던 `src/store.js`는 **사용하지 않는다**. 모든 참조를 위 경로로 통일.
- popup도 **같은 파일**을 `<script src="../content/10-store.js">`로 로드한다(별도 사본 금지 — 단일 출처).

---

## 1. 전역 노출

```js
window.FMKBlind = window.FMKBlind || {};
window.FMKBlind.store = store;   // 아래 6개 메서드를 가진 단일 객체
```

- content/popup 양쪽에서 `FMKBlind.store`로 접근한다.
- `00-namespace.js`가 먼저 `window.FMKBlind`를 만들지만, 10-store.js도 방어적으로 `||= {}` 한다(popup 단독 로드 대비).

---

## 2. API 시그니처 (6개 FROZEN + 1개 가산 선택)

```js
/**
 * window.FMKBlind.store
 *
 * uid는 항상 문자열(앵커 class="member_{UID}"에서 추출한 숫자열 그대로). 호출 측도 문자열로 전달.
 */
const store = {
  /**
   * sync에서 메모리 맵을 복원한다. 앱 시작 시 최초 1회 반드시 await.
   * 중복 호출은 안전(이미 로드됐으면 즉시 resolve). 실패해도 빈 맵으로 동작.
   * @returns {Promise<void>}
   */
  async load() {},

  /**
   * 차단 여부 조회 — **동기**. load() 이후 메모리 맵만 본다.
   * @param {string} uid
   * @returns {boolean}
   */
  isBlocked(uid) {},

  /**
   * 차단 추가 + 즉시 영속화. addedAt은 호출 시각(ms epoch).
   * 이미 있으면 중복 추가하지 않되 nick은 최신값으로 갱신(addedAt 유지).
   * 메모리는 반환 전 즉시 반영 → isBlocked(uid)가 곧바로 true.
   * **반환 Promise는 chrome.storage.sync 쓰기 완료 시 resolve**(C3). await하면 sync 반영 보장.
   * @param {string} uid
   * @param {string} nick  표시용 닉네임(없으면 빈 문자열 허용)
   * @returns {Promise<void>}  resolve = sync 영속화 완료
   */
  async block(uid, nick) {},

  /**
   * 차단 해제 + 즉시 영속화. 없으면 무시(no-op → 즉시 Promise.resolve()).
   * 메모리는 반환 전 즉시 반영 → isBlocked(uid)가 곧바로 false.
   * **반환 Promise는 chrome.storage.sync 쓰기 완료 시 resolve**(C3). 팝업이 await 후 닫혀도 유실 없음.
   * @param {string} uid
   * @returns {Promise<void>}  resolve = sync 영속화 완료(삭제 대상 없으면 즉시 resolve)
   */
  async unblock(uid) {},

  /**
   * 차단 목록 스냅샷. **addedAt 내림차순(최신 먼저)** 정렬.
   * 반환 배열/객체는 복사본(호출 측이 수정해도 내부 상태 불변).
   * @returns {Array<{uid: string, nick: string, addedAt: number}>}
   */
  list() {},

  /**
   * 차단 인원수 — 동기.
   * @returns {number}
   */
  count() {},

  /**
   * (가산적 7번째 선택 API — 2026-06-15) 외부 sync 변경(다른 탭/팝업/기기) 라이브 구독.
   * chrome.storage.onChanged 발생 시 **외부 델타만** 메모리 맵에 reconcile(로컬 미영속 항목 보존)하고
   * 외부 변경분에 한해 diff를 통지.
   * cb 시그니처: ({ added: string[], removed: string[] }) => void  (uid 문자열 배열)
   *   · added: 외부에서 새로 차단된 uid · removed: 외부에서 해제된 uid
   *   · 값만 바뀌고 키셋 동일하면 added/removed 모두 빈 배열 → 콜백 호출 생략(자기-쓰기 에코 no-op 포함).
   * 다중 구독 지원. 한 콜백의 예외는 격리(다른 구독자/스토어 불영향).
   * onChanged 미지원 컨텍스트에서는 콜백이 호출되지 않을 뿐 등록/해제는 정상.
   * @param {function({added: string[], removed: string[]}): void} cb
   * @returns {function(): void}  unsubscribe (호출 시 구독 해제, 멱등)
   */
  onChange(cb) {},

  /**
   * (가산적 8번째 선택 API — 2026-07-08) 차단 목록 **배치 가져오기(import)**.
   * 내보낸 JSON(팝업이 list() 결과를 직렬화한 것)을 대량으로 메모리에 일괄 반영한 뒤 **1회 직렬 flush**한다.
   * 항목별 block() 남발을 피해 sync 레이트리밋(분당 120/시간당 1,800) 압박을 줄인다(TODO Q7).
   *
   * 머지 시맨틱(C10):
   *   - 새 uid        → 추가. 가져온 nick·addedAt 사용(addedAt 결측/비정상이면 현재 시각).
   *   - 이미 있는 uid → **로컬 유지·스킵**(skipped++). nick/addedAt 덮어쓰지 않음.
   *   - 비정상 항목    → invalid++ (throw 없이 항목 단위 스킵). 판정: 객체 아님 / uid 결측 / uid가 숫자열(^\d+$) 아님.
   *   uid는 C1대로 String(uid)로 정규화 후 검증. items가 배열이 아니면 no-op(경고 + 0/0/0 resolve).
   *
   * 반환 Promise resolve = **chrome.storage.sync 쓰기 완료**(C3 준용). added가 0이면 쓰기 없이 즉시 resolve(멱등).
   * @param {Array<{uid: string|number, nick?: string, addedAt?: number}>} items
   * @returns {Promise<{added: number, skipped: number, invalid: number}>}
   */
  importMany(items) {},
};
```

> 내구성은 **공개 API가 아니라 store 내부**에서 보장한다(§3 C3). 소비자는 추가 호출 없이
> 기존 `await block`/`await unblock`만 사용하면 되고, await 완료가 곧 sync 영속 완료다.
> (구 C8 언로드 자동 flush는 resurrection 원인이라 2026-06-15 제거 — 아래 C8 참고.)

---

## 3. 동작 보증 (계약 불변식)

| # | 보증 | 의미 |
|---|------|------|
| C1 | `uid` 타입 | 모든 메서드에서 **문자열**. 호출 측도 문자열로 전달(숫자 전달 금지). |
| C2 | `load()` 선행 | 조회/변경 전에 1회 await. 미호출 시 빈 맵으로 동작(에러 아님). |
| C3 | 즉시성 + 영속화 완료(2026-06-15 갱신) | `block`/`unblock`은 **반환 전(동기)** 메모리를 갱신 → `isBlocked`·`list`·`count`가 즉시 정확. **반환 Promise는 chrome.storage.sync 쓰기가 완료(또는 동기 디스패치)된 뒤 resolve**. 따라서 `await block/unblock` 후에는 sync 영속이 보장된다(단수명 팝업 종료에도 유실 없음). persist는 직렬화(in-flight 체인 + coalesce)되어 연속 호출에도 최종 상태·내부 스냅샷이 일관. 레이트리밋(분당 120/시간당 1,800) 초과 시 C7 경로(경고+디바운스 재시도)로 폴백. |
| C4 | 멱등 block | 같은 uid 재차단은 중복 추가 없음. nick만 갱신, addedAt 보존. |
| C5 | 안전 unblock | 없는 uid 해제는 no-op(에러 없음). |
| C6 | list 정렬/불변 | addedAt desc. 반환은 복사본. |
| C7 | 영속화 실패 내성 | sync.set 실패해도 throw 안 함 — 메모리 유지 + 콘솔 경고 + `schedulePersist`(디바운스) 재시도. |
| C8 | ~~내구성(MAJOR-1 언로드 flush)~~ **제거됨(2026-06-15)** | 과거: `pagehide`/`visibilitychange(hidden)`에서 디바운스 보류 쓰기를 자동 flush. **현재 제거.** 사유: C3 즉시-영속화로 비울 보류 쓰기가 없어졌고, 이 flush가 **stale 탭의 옛 맵을 새로고침 시 sync에 되써 해제를 무효화(resurrection)**하는 통로였다(실 Chrome 직렬화 차이로 청크 diff 거짓 양성). 내구성은 C3(즉시 쓰기 동기 디스패치)가 대체. |
| C9 | 라이브 동기(2026-06-15 추가, **reconcile로 정정**) | `chrome.storage.onChanged`(sync 영역, `bl_*`/`bl_meta` 변경)에서 **외부 델타만 메모리 맵에 reconcile**하고 외부 변경분에 한해 diff(`{added,removed}`)를 `onChange` 구독자에게 통지한다. 델타 = (현재 디스크) vs (우리가 마지막에 안 디스크 스냅샷 `persistedChunks`=prevMap): prev엔 있고 디스크엔 없으면 제거, 디스크에 새로/다르게 있으면 반영. **prevMap에도 디스크에도 없는 로컬 미영속 항목은 손대지 않아 보존**된다. 핸들러는 **읽기+메모리 갱신만**(절대 sync write 안 함) → 피드백 루프 없음. persist와 **하나의 직렬화 큐**에서 순차 실행되어 인터리브 없음. 자기-쓰기 에코는 델타가 비어 no-op·멱등. reconcile 후 `persistedChunks`를 디스크 권위로 정합 → 직후 로컬 persist가 미영속 항목을 변경분으로 올바로 기록. 이로써 **(a) 잔여 엣지 I2**(해제 후 되살림)와 **(b) 마이크로태스크 경쟁**(외부 rebuild의 syncGet await 중 들어온 미영속 로컬 `block`을 옛 clobber가 유실·오통지하던 결함)을 **함께 닫는다**. 미지원 컨텍스트면 비활성(나머지 동작 정상). 남는 한계: 외부 변경과 로컬 변경이 **같은 uid**를 동시 갱신하면 last-writer 수렴(eventual consistency 정상). |
| C10 | 배치 가져오기(2026-07-08 추가, **C3 준용**) | `importMany(items)`는 items를 순회하며 **메모리 맵에 일괄 반영**(새 uid 추가·기존 uid 스킵·비정상 invalid 카운트)한 뒤 **flushPending() 1회**로 변경분을 직렬 persist한다(항목별 block()처럼 여러 번 쓰지 않음 → 레이트리밋 압박 완화). 반환 Promise resolve = **sync 쓰기 완료**(C3와 동일 경로·의미). **added가 0이면(빈 배열·전량 중복·전량 invalid·비배열) 쓰기 없이 즉시 resolve**(멱등). uid는 C1대로 String 정규화 후 `^\d+$` 검증(비숫자열=invalid), 기존 uid는 C4 정신을 확장해 nick/addedAt도 **덮지 않고 스킵**. import된 미영속 항목은 C9 reconcile 관점에서 로컬 `block` 항목과 **동형**(prevMap·디스크에 없는 로컬 미영속) → flush 대기 중 외부 onChanged가 끼어들어도 보존된다(메모리는 동기적으로 이미 반영됨). 용량: 사전 추정 초과 시 콘솔 경고(차단하지 않음 — best-effort), 실제 쓰기 때 C-quota(persistOnce의 `QUOTA_WARN`) 경로가 재검증. |

---

## 4. 소비자별 사용 패턴 (참고)

### content-engineer (20·40·99)
```js
await FMKBlind.store.load();              // 99-main.js 진입점에서 1회
if (FMKBlind.store.isBlocked(uid)) { /* 숨김 */ }   // 동기 조회로 스캔
await FMKBlind.store.block(uid, nick);    // 우클릭 차단
await FMKBlind.store.unblock(uid);        // 우클릭 해제

// 라이브 동기(선택): 외부 변경을 새로고침 없이 현재 DOM에 즉시 반영. uid는 문자열 그대로.
FMKBlind.store.onChange(function (d) {
  d.added.forEach(function (uid) { NS.hide.hideByUid(uid); });
  d.removed.forEach(function (uid) { NS.hide.unhideByUid(uid); });
});
// 주의: onChange는 **현재 DOM에만** 재적용(MutationObserver는 별개 TODO — AJAX/무한스크롤로
// 새로 불러온 노드는 새로고침 시 반영). diff의 uid/nick은 문자열만 — innerHTML 금지(XSS).
```

### popup-engineer (popup.js)
```js
await FMKBlind.store.load();              // 팝업 열릴 때 1회
const items = FMKBlind.store.list();      // [{uid,nick,addedAt}] desc → 렌더
const n = FMKBlind.store.count();         // 인원수 표시
await FMKBlind.store.unblock(uid);        // 해제 버튼 → await 완료 = sync 영속 완료, 이후 list()/count() 재호출로 갱신
// 추가 호출 불필요 — await만으로 sync 반영 보장(팝업이 그 뒤 닫혀도 안전).

// 라이브 동기(선택·저비용): 팝업이 열린 채 탭에서 우클릭 차단/해제 시 목록/카운트 자동 재렌더.
FMKBlind.store.onChange(function () { render(FMKBlind.store.list(), FMKBlind.store.count()); });

// ── 내보내기/가져오기(2026-07-08, TODO Q7) ──────────────────────────────
// 내보내기: 새 API 불필요 — list()가 uid/nick/addedAt 복사본을 반환하므로 그대로 직렬화.
// 파일 포맷(확정 — popup.js 구현 기준): entries 키 + schema/ver/exportedAt(ISO)/count.
const payload = JSON.stringify({
  schema: 'fmk-blind/blocklist', ver: 1,
  exportedAt: new Date().toISOString(), count: FMKBlind.store.count(),
  entries: FMKBlind.store.list(),
});
// → Blob/다운로드 앵커로 저장(파일명: fmk-blind-blocklist-YYYY-MM-DD.json). 별도 저장 호출 없음.

// 가져오기: 파일에서 파싱한 배열을 importMany로 한 번에 반영(항목별 block 호출 금지 — 레이트리밋).
// popup은 { entries: [...] }(위 포맷) 외에 bare 배열·구버전 { items: [...] }도 관용 수용한다.
const parsed = JSON.parse(fileText);
const entries = Array.isArray(parsed) ? parsed : (parsed && (parsed.entries || parsed.items)) || [];
const r = await FMKBlind.store.importMany(entries);  // await 완료 = sync 영속 완료(C10)
// r = { added, skipped, invalid } → "N명 추가, M명 중복 건너뜀, K건 무시" 토스트/요약 표시
render(FMKBlind.store.list(), FMKBlind.store.count());  // 목록·카운트 갱신
// 주의: importMany는 throw하지 않는다(비정상 항목은 invalid로 집계). JSON.parse 실패만 팝업이 try/catch.
```

> **영속화 버그 수정(2026-06-15)**: `block`/`unblock`이 이제 즉시·awaitable 영속화한다 — `await unblock(uid)`가 끝나면
> sync 쓰기가 이미 디스패치/완료된 상태다. 따라서 해제 직후 팝업이 닫혀도 유실되지 않는다(이전 디바운스 의존 시
> 팝업이 500ms 내 닫히면 유실되던 버그). 소비자는 여전히 기존 `await unblock`/`await block`만 쓰면 된다(시그니처·호출법 불변).
> ⚠️ **C8 언로드 flush는 제거됨**(잔존 안전망이 아니라 resurrection 원인이었음 — §3 C8 참고).

> 라이브 동기(2026-06-15 구현, C9): 팝업/다른 탭/다른 기기의 변경이 **이미 열린 fmkorea 탭에 새로고침 없이 즉시 반영**된다(`chrome.storage.onChanged`). content가 `onChange`로 현재 DOM을 즉시 숨김/복구하고, store는 메모리 맵 + `persistedChunks` 스냅샷을 스토리지 권위로 정합한다.
> **잔여 엣지 I2 해소 + 경쟁 수정(reconcile)**: "팝업 해제 직후 같은 탭에서 새로고침 없이 또 다른 사용자를 차단" 시, onChanged가 먼저 해제를 탭에 reconcile하며 `persistedChunks`를 fresh 스냅샷으로 정합하므로, 이어진 로컬 `block`이 fresh 스냅샷에 diff → 해제된 청크를 되쓰지 않는다(I2 닫힘). 또한 외부 onChanged의 syncGet await 중 들어온 **미영속 로컬 `block`은 reconcile가 외부 델타만 적용**하므로 보존된다(옛 clobber/`map.clear`가 유실·오통지하던 마이크로태스크 경쟁 수정).
> 남은 한계: ① 새 DOM(AJAX/무한스크롤)은 새로고침 시 반영(MutationObserver는 별개 TODO). ② 외부·로컬이 **같은 uid**를 동시 갱신하면 last-writer로 수렴(eventual consistency — 정상).

---

## 5. 내부 저장 레이아웃 (소비자는 몰라도 됨 — 참고용)

- `bl_meta = { ver: 1 }` — 스키마 버전.
- `bl_0`, `bl_1`, … `bl_N` — 직렬화 차단 목록을 ~7.5KB(8KB 안전마진) 청크로 분할.
- 메모리: `Map<uidString, { nick, addedAt }>`.
- 변경된 청크만 `sync.set`, 청크 수 감소 시 남는 `bl_{k}` `sync.remove`(유령 데이터 방지).
- **persist + onChanged 직렬화(C9)**: persist(로컬 write)와 onChanged-reconcile(외부 변경)를 **하나의 직렬화 큐(tail Promise 체인 `serialTail`/`enqueueSerial`)**에 함께 태운다. 한 번에 하나의 `persistOnce`만 실행되고(in-flight + dirty coalesce), 외부 reconcile는 진행 중 로컬 write **커밋 뒤** 실행되어 둘이 인터리브되지 않는다 → `persistedChunks` 스냅샷 경쟁 없음. 핸들러는 읽기+메모리 갱신만(sync write 안 함)이라 피드백 루프 없음.
- **onChanged 핸들러(`applyExternalChange`, reconcile)**: sync 영역의 `bl_*`(숫자)/`bl_meta` 변경 시 디스크를 읽어 **(디스크 vs `persistedChunks`=prevMap) 외부 델타만** 메모리 맵에 적용(추가/변경 set·외부제거 delete)하고, 로컬 미영속 항목은 보존한다. 이후 `persistedChunks`를 디스크 권위로 정합. 외부 변경분에 한해 diff 통지. 자기-쓰기 에코는 델타가 비어 무해. `load()`는 별도 `rebuildFromStorage()`(clobber, 최초 로드 전용 — 로컬 상태 없음)를 쓰며, 둘은 순수 파서 `parseSnapshot()`을 공유. 미지원 컨텍스트는 리스너 미등록(가드).
- **즉시쓰기 + 디바운스 폴백(2026-06-15)**: `block`/`unblock`은 즉시 직렬 persist(`flushPending`). sync 쓰기 실패(레이트리밋 분당 120/시간당 1,800 초과 등)는 `persistOnce` catch에서 흡수 → 경고 + `schedulePersist`(500ms 디바운스) 재시도. 수동 차단/해제 빈도에선 한도 무해. 디바운스(`schedulePersist`)는 이제 **실패 재시도 경로에서만** 사용(언로드 자동 flush는 제거).
- **언로드 flush 제거(2026-06-15, C8 폐지)**: 과거 `pagehide`/`visibilitychange(hidden)`에서 보류 쓰기를 flush했으나, 즉시쓰기 전환 후엔 비울 보류 쓰기가 없고 **stale 탭이 새로고침 시 옛 맵을 되써 해제를 무효화하는 통로**였다 → 제거. content/popup 어느 컨텍스트에도 언로드 리스너를 등록하지 않는다.
- 100KB 임박 시 콘솔 경고(압축은 TODO).

---

## 6. 변경 절차

1. 시그니처/보증 변경 시 이 문서를 갱신하고 **버전 표기**를 올린다.
2. content-engineer·popup-engineer에게 SendMessage로 재통지.
3. 스키마 변경이면 `bl_meta.ver`를 올리고 마이그레이션 경로를 store.js에 추가.

**구현됨(2026-06-15):** `chrome.storage.onChanged` 라이브 동기(7번째 API `onChange` + C9).
**구현됨(2026-07-08):** 내보내기/가져오기(TODO Q7) — 내보내기는 `list()` 직렬화로 팝업이 처리(새 API 없음), 가져오기는 8번째 API `importMany` + C10.
**범위 밖(구현 금지):** 압축.
