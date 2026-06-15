# store API 계약 (store-api-contract.md)

FMK-Blind 차단 목록 저장 계층의 **공개 API 계약**. content script와 popup이 **동일 파일**을 공유한다.
이 문서는 storage-engineer가 소유하며, 변경 시 content-engineer·popup-engineer에게 재통지한다.

- 상태: **v1 확정 (FROZEN — 6 API 시그니처 고정)**
- 스키마 버전: `bl_meta.ver = 1`
- 작성: storage-engineer / 2026-06-14
- MAJOR-1 수정(team-lead 지침 = 내부 보강만): 디바운스 쓰기를 `pagehide`·`visibilitychange(hidden)`에서 자동 flush(C8). **공개 API·6 시그니처 변경 없음**, 소비자 코드 변경 불필요.
- **영속화 버그 수정(2026-06-15, storage-engineer)**: 팝업에서 `unblock` 후 fmkorea 새로고침 시 해제가 영속되지 않던 버그 수정. `block`/`unblock`을 디바운스 대신 **즉시·awaitable 영속화**로 전환 — 반환 Promise가 **chrome.storage.sync 쓰기 완료 시점에 resolve**한다(C3 갱신). **6 시그니처 변경 없음**(여전히 `Promise<void>`). 소비자는 기존처럼 `await block/unblock`만 하면 되나, 이제 await 완료가 곧 sync 반영 완료를 의미한다. 단수명 팝업 컨텍스트에서 await 후 닫혀도 쓰기가 클릭 태스크 내 디스패치되어 유실되지 않는다.
- **resurrection 버그 정정 수정(2026-06-15, team-lead, 실브라우저 콘솔로 확정)**: 위 즉시-영속화로도 실제 브라우저에서 해제가 새로고침 후 되살아나던 문제 발견. 진짜 원인은 **열린 fmkorea 탭의 stale content script**가 새로고침 시 옛 메모리 맵을 sync에 되쓰는 것이었고, 그 통로가 **C8 언로드(`pagehide`/`visibilitychange`) 자동 flush**였다(실 Chrome 직렬화 차이로 청크 diff가 거짓 양성 → stale 맵 기록). **C8 언로드 flush를 제거**해 정정. 즉시-영속화라 비울 보류 쓰기가 없어 안전. ⚠️ 직전 mock 기반 QA/리뷰가 이 결함을 못 잡고 PASS/MERGE를 준 점 기록(mock이 실 Chrome 직렬화·다중 컨텍스트를 재현 못 함). 열린 탭 실시간 정합(`chrome.storage.onChanged`)은 여전히 미구현(아래 잔여 한계 참고).

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

## 2. API 시그니처 (6개 — 계약 고정)

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

---

## 4. 소비자별 사용 패턴 (참고)

### content-engineer (20·40·99)
```js
await FMKBlind.store.load();              // 99-main.js 진입점에서 1회
if (FMKBlind.store.isBlocked(uid)) { /* 숨김 */ }   // 동기 조회로 스캔
await FMKBlind.store.block(uid, nick);    // 우클릭 차단
await FMKBlind.store.unblock(uid);        // 우클릭 해제
```

### popup-engineer (popup.js)
```js
await FMKBlind.store.load();              // 팝업 열릴 때 1회
const items = FMKBlind.store.list();      // [{uid,nick,addedAt}] desc → 렌더
const n = FMKBlind.store.count();         // 인원수 표시
await FMKBlind.store.unblock(uid);        // 해제 버튼 → await 완료 = sync 영속 완료, 이후 list()/count() 재호출로 갱신
// 추가 호출 불필요 — await만으로 sync 반영 보장(팝업이 그 뒤 닫혀도 안전).
```

> **영속화 버그 수정(2026-06-15)**: `block`/`unblock`이 이제 즉시·awaitable 영속화한다 — `await unblock(uid)`가 끝나면
> sync 쓰기가 이미 디스패치/완료된 상태다. 따라서 해제 직후 팝업이 닫혀도 유실되지 않는다(이전 디바운스 의존 시
> 팝업이 500ms 내 닫히면 유실되던 버그). 소비자는 여전히 기존 `await unblock`/`await block`만 쓰면 된다(시그니처·호출법 불변).
> ⚠️ **C8 언로드 flush는 제거됨**(잔존 안전망이 아니라 resurrection 원인이었음 — §3 C8 참고).

> v1 제약(잔여 한계): 팝업 해제는 **이미 열린 fmkorea 탭은 새로고침 후 반영**(`chrome.storage.onChanged` 실시간 반영은 미구현 TODO). 팝업 자체 화면은 즉시 갱신.
> 또한 열린 탭이 팝업 변경을 모르는 구조이므로, "팝업 해제 직후 같은 탭에서 새로고침 없이 또 다른 사용자를 차단"하면 그 `block`이 stale 맵 전체를 써 해제가 되살아날 여지가 남는다. 완전 해소엔 `onChanged` 필요(후속).

---

## 5. 내부 저장 레이아웃 (소비자는 몰라도 됨 — 참고용)

- `bl_meta = { ver: 1 }` — 스키마 버전.
- `bl_0`, `bl_1`, … `bl_N` — 직렬화 차단 목록을 ~7.5KB(8KB 안전마진) 청크로 분할.
- 메모리: `Map<uidString, { nick, addedAt }>`.
- 변경된 청크만 `sync.set`, 청크 수 감소 시 남는 `bl_{k}` `sync.remove`(유령 데이터 방지).
- **persist 직렬화**: 한 번에 하나의 `persistOnce`만 실행(in-flight Promise 체인). 진행 중 추가 변경은 dirty 플래그로 coalesce해 체인 종료 후 1회 더 실행 → 연속 `block`/`unblock`에서도 `persistedChunks` 스냅샷이 꼬이지 않음.
- **즉시쓰기 + 디바운스 폴백(2026-06-15)**: `block`/`unblock`은 즉시 직렬 persist(`flushPending`). sync 쓰기 실패(레이트리밋 분당 120/시간당 1,800 초과 등)는 `persistOnce` catch에서 흡수 → 경고 + `schedulePersist`(500ms 디바운스) 재시도. 수동 차단/해제 빈도에선 한도 무해. 디바운스(`schedulePersist`)는 이제 **실패 재시도 경로에서만** 사용(언로드 자동 flush는 제거).
- **언로드 flush 제거(2026-06-15, C8 폐지)**: 과거 `pagehide`/`visibilitychange(hidden)`에서 보류 쓰기를 flush했으나, 즉시쓰기 전환 후엔 비울 보류 쓰기가 없고 **stale 탭이 새로고침 시 옛 맵을 되써 해제를 무효화하는 통로**였다 → 제거. content/popup 어느 컨텍스트에도 언로드 리스너를 등록하지 않는다.
- 100KB 임박 시 콘솔 경고(압축은 TODO).

---

## 6. 변경 절차

1. 시그니처/보증 변경 시 이 문서를 갱신하고 **버전 표기**를 올린다.
2. content-engineer·popup-engineer에게 SendMessage로 재통지.
3. 스키마 변경이면 `bl_meta.ver`를 올리고 마이그레이션 경로를 store.js에 추가.

**v1 범위 밖(구현 금지):** 압축, `chrome.storage.onChanged` 반영, 내보내기/가져오기.
