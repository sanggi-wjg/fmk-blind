# store API 계약 (store-api-contract.md)

FMK-Blind 차단 목록 저장 계층의 **공개 API 계약**. content script와 popup이 **동일 파일**을 공유한다.
이 문서는 storage-engineer가 소유하며, 변경 시 content-engineer·popup-engineer에게 재통지한다.

- 상태: **6 API FROZEN(v1 시그니처 고정) + 가산적 7번째 선택 API `onChange`(2026-06-15) + 가산적 8번째 선택 API `importMany`(2026-07-08, 배치 가져오기 C10)**
- **쓰기 안전성 재설계(2026-10-05, team-lead 대행 — storage-engineer 정지로 리더가 구현, 이슈 #13·#14·#15)**: 메모리 = 디스크 ⊕ 미저장 로컬 변경, 쓰기는 **읽기→병합→쓰기**. 저장 실패는 **reject(err.code) + 변경 되돌림**, load 읽기 실패는 reject(1회 재시도 후). **API 이름·인자·저장 레이아웃 불변**, 바뀐 것은 실패 시맨틱(C2·C3·C7·C10)과 내부 모델(C9·C11). 소비자는 block/unblock/importMany/load의 reject를 처리해야 한다(§4).
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
window.FMKBlind.store = store;   // 아래 8개 메서드(FROZEN 6 + 가산 2: onChange·importMany)를 가진 단일 객체
```

- content/popup 양쪽에서 `FMKBlind.store`로 접근한다.
- `00-namespace.js`가 먼저 `window.FMKBlind`를 만들지만, 10-store.js도 방어적으로 `||= {}` 한다(popup 단독 로드 대비).

---

## 2. API 시그니처 (6개 FROZEN + 2개 가산 선택: onChange·importMany)

```js
/**
 * window.FMKBlind.store
 *
 * uid는 항상 문자열(앵커 class="member_{UID}"에서 추출한 숫자열 그대로). 호출 측도 문자열로 전달.
 */
const store = {
  /**
   * sync에서 목록을 읽어 온다. 앱 시작 시 최초 1회 await. 중복 호출 안전(성공한 load는 캐시).
   * 읽기는 1회 재시도하고, 그래도 실패하면 **reject**(err.code = 'READ_FAILED' | 'CONTEXT_INVALIDATED').
   * 실패한 load는 캐시하지 않으므로 다시 호출하면 재시도한다(2026-10-05, 이슈 #14).
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
   * **반환 Promise는 chrome.storage.sync 쓰기 완료 시 resolve**(C3). 이미 같은 nick으로 차단돼 있으면 쓰기 없이 resolve.
   * 저장에 실패하면 메모리 변경을 되돌리고 **reject**(err.code — C7). 
   * @param {string} uid
   * @param {string} nick  표시용 닉네임(없으면 빈 문자열 허용)
   * @returns {Promise<void>}  resolve = sync 영속화 완료 / reject = 저장 실패(되돌려짐)
   */
  async block(uid, nick) {},

  /**
   * 차단 해제 + 즉시 영속화. 없으면 무시(no-op → 즉시 Promise.resolve()).
   * 메모리는 반환 전 즉시 반영 → isBlocked(uid)가 곧바로 false.
   * **반환 Promise는 chrome.storage.sync 쓰기 완료 시 resolve**(C3). 저장 실패 시 되돌리고 reject(C7).
   * @param {string} uid
   * @returns {Promise<void>}  resolve = sync 영속화 완료(삭제 대상 없으면 즉시 resolve) / reject = 저장 실패
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
   * chrome.storage.onChanged(및 bfcache 복원·탭 복귀) 시 저장소를 다시 읽어 메모리 = 디스크 ⊕ 미저장 로컬 변경으로
   * 재계산하고, 이전 대비 키 diff를 통지한다. **저장 실패로 되돌린 변경도 diff로 통지**된다(2026-10-05).
   * 자기 변경이 성공한 경우엔 통지하지 않는다.
   * cb 시그니처: ({ added: string[], removed: string[] }) => void  (uid 문자열 배열)
   *   · added: 새로 차단된 uid(외부 변경 또는 해제 실패 되돌림) · removed: 해제된 uid(외부 변경 또는 차단 실패 되돌림)
   *   · 값만 바뀌고 키셋 동일하면 added/removed 모두 빈 배열 → 콜백 호출 생략(자기-쓰기 에코 no-op 포함).
   * 다중 구독 지원. 한 콜백의 예외는 격리(다른 구독자/스토어 불영향).
   * onChanged 미지원 컨텍스트에서는 콜백이 호출되지 않을 뿐 등록/해제는 정상.
   * @param {function({added: string[], removed: string[]}): void} cb
   * @returns {function(): void}  unsubscribe (호출 시 구독 해제, 멱등)
   */
  onChange(cb) {},

  /**
   * (가산적 8번째 선택 API — 2026-07-08) 차단 목록 **배치 가져오기(import)**.
   * 내보낸 JSON(팝업이 list() 결과를 직렬화한 것)을 대량으로 메모리에 일괄 반영한 뒤 **1회 쓰기**로 저장한다.
   * **메모리를 바꾸기 전에** 가져온 뒤의 예상 용량을 재서 한도를 넘으면 아무것도 바꾸지 않고
   * reject(err.code = 'QUOTA', err.fit = 대략 더 저장할 수 있는 인원). 부분 가져오기 없음(2026-10-05, 이슈 #13).
   * nick은 64자로 자른다.
   * 항목별 block() 남발을 피해 sync 레이트리밋(분당 120/시간당 1,800) 압박을 줄인다(TODO Q7).
   *
   * 머지 시맨틱(C10):
   *   - 새 uid        → 추가. 가져온 nick·addedAt 사용(addedAt 결측/비정상이면 현재 시각).
   *   - 이미 있는 uid → **로컬 유지·스킵**(skipped++). nick/addedAt 덮어쓰지 않음.
   *   - 비정상 항목    → invalid++ (throw 없이 항목 단위 스킵). 판정: 객체 아님 / uid 결측 / uid가 숫자열(^\d+$) 아님.
   *   uid는 C1대로 String(uid)로 정규화 후 검증. items가 배열이 아니면 no-op(경고 + 0/0/0 resolve).
   *
   * 반환 Promise resolve = **chrome.storage.sync 쓰기 완료**(C3 준용). added가 0이면 쓰기 없이 즉시 resolve(멱등).
   * 쓰기 실패 시 추가분을 되돌리고 reject(err.code — C7).
   * @param {Array<{uid: string|number, nick?: string, addedAt?: number}>} items
   * @returns {Promise<{added: number, skipped: number, invalid: number}>}
   */
  importMany(items) {},
};
```

> 내구성은 **공개 API가 아니라 store 내부**에서 보장한다(§3 C3). 소비자는 추가 호출 없이
> 기존 `await block`/`await unblock`만 사용하면 되고, await 완료가 곧 sync 영속 완료다.
> **2026-10-05부터 소비자는 reject를 반드시 처리**한다(실패를 성공으로 보이지 않게 — C7, §4).
> (구 C8 언로드 자동 flush는 resurrection 원인이라 2026-06-15 제거 — 아래 C8 참고.)

---

## 3. 동작 보증 (계약 불변식)

| # | 보증 | 의미 |
|---|------|------|
| C1 | `uid` 타입 | 모든 메서드에서 **문자열**. 호출 측도 문자열로 전달(숫자 전달 금지). |
| C2 | `load()` 선행 | 조회/변경 전에 1회 await. 미호출 시 빈 맵으로 동작(에러 아님). **읽기 실패는 1회 재시도 후 reject(READ_FAILED), 실패한 load는 캐시하지 않음**(2026-10-05). load 전이나 실패 후의 쓰기도 C11(읽은 뒤 병합)이라 저장된 목록을 덮어쓰지 않는다. |
| C3 | 즉시성 + 영속화 완료(2026-10-05 갱신) | `block`/`unblock`/`importMany`는 **반환 전(동기)** 메모리를 갱신 → `isBlocked`·`list`·`count`가 즉시 정확. **반환 Promise는 chrome.storage.sync 쓰기가 완료된 뒤 resolve**, 저장 실패 시 reject(C7). 쓰기는 직렬화 큐에서 실행되며 아직 시작하지 않은 실행이 있으면 거기에 함께 실린다(coalesce). ⚠️ C11 때문에 쓰기 전에 읽기가 먼저 일어나므로 **sync.set이 클릭 태스크 안에서 바로 디스패치되지는 않는다**(수 ms 뒤). 팝업에서 해제 후 그 사이에 팝업을 닫으면 유실될 수 있으나, 사람이 클릭 직후 수 ms 안에 닫는 경우는 현실적이지 않다(모의 테스트: 25ms 뒤 닫아도 저장됨 — 실제 툴바 팝업에서는 미검증). |
| C4 | 멱등 block | 같은 uid 재차단은 중복 추가 없음. nick만 갱신, addedAt 보존. |
| C5 | 안전 unblock | 없는 uid 해제는 no-op(에러 없음). |
| C6 | list 정렬/불변 | addedAt desc. 반환은 복사본. |
| C7 | 영속화 실패 = reject + 되돌림(2026-10-05 재정의, 이슈 #13) | 실패를 숨기지 않는다. 오류 분류: **비재시도** `QUOTA`(용량·항목 수 초과 — 쓰기 전 사전 검사로 대부분 걸러 set을 호출하지 않음), `CONTEXT_INVALIDATED`(확장 업데이트·재로드 뒤 남은 content script — `runtime.id` 소실 또는 'context invalidated' 메시지). **재시도** 그 밖의 모든 오류(레이트리밋 `MAX_WRITE_OPERATIONS_*` 포함)는 1s·2s·4s 백오프로 최대 3회 재시도 후 `WRITE_FAILED`. 최종 실패 시 그 실행에 실린 변경을 미저장 목록에서 빼고 메모리를 되돌린 뒤(구독자에 diff 통지) Promise를 `err.code`와 함께 reject. 무한 재시도·백그라운드 재시도 없음. |
| C8 | ~~내구성(MAJOR-1 언로드 flush)~~ **제거됨(2026-06-15)** | 과거: `pagehide`/`visibilitychange(hidden)`에서 디바운스 보류 쓰기를 자동 flush. **현재 제거.** 사유: C3 즉시-영속화로 비울 보류 쓰기가 없어졌고, 이 flush가 **stale 탭의 옛 맵을 새로고침 시 sync에 되써 해제를 무효화(resurrection)**하는 통로였다(실 Chrome 직렬화 차이로 청크 diff 거짓 양성). 내구성은 C3(resolve = 쓰기 완료)가 대체. ※ 2026-10-05부터는 C11의 읽기가 먼저라 쓰기가 클릭 태스크 안에서 바로 디스패치되지는 않는다(C3 참고). |
| C9 | 라이브 동기(2026-10-05 재구현) | `chrome.storage.onChanged`(sync 영역, `bl_*`/`bl_meta`) 또는 `pageshow`(bfcache 복원)·`visibilitychange`(visible) 시 직렬화 큐에서 저장소를 다시 읽어 disk를 갱신하고, 메모리 = disk ⊕ 미저장 로컬 변경으로 재계산해 이전 대비 키 diff를 통지한다. 미저장 로컬 변경은 디스크와 무관하게 유지되므로 보존된다. 핸들러는 읽기 전용(쓰기 없음) → 피드백 루프 없음. 자기 쓰기 에코는 diff가 비어 no-op. 이벤트를 놓친 탭도 다음 쓰기가 C11로 최신 디스크를 읽으므로 다른 곳의 변경을 덮어쓰지 않는다(이슈 #15). |
| C10 | 배치 가져오기(2026-10-05 갱신) | `importMany(items)`: 새 uid 추가(nick 64자 절단, addedAt 결측/비정상이면 현재 시각)·기존 uid 스킵(파일 안 중복도 스킵)·비정상 invalid. **메모리를 바꾸기 전에** 가져온 뒤의 용량을 C11과 같은 방식으로 재서 넘으면 아무것도 바꾸지 않고 reject(`QUOTA`, `err.fit`=대략 더 넣을 수 있는 인원). 통과하면 미저장 변경으로 올린 뒤 **1회 쓰기**. resolve = 저장 완료, 실패 시 추가분 되돌리고 reject(C7). added 0이면 쓰기 없이 resolve. |
| C11 | 읽기→병합→쓰기(2026-10-05 신설, 이슈 #14·#15) | 메모리 = disk(마지막으로 읽은 저장소) ⊕ pending(미저장 로컬 변경, uid별 add/del + seq). 쓰기 실행은 직렬화 큐 안에서 ① `get(null)`로 저장소를 새로 읽고(**읽기 실패면 쓰지 않음**) ② 그 위에 pending을 얹어 ③ 디스크 순서를 유지한 채(새 uid는 뒤에) 청크를 만들고 ④ Chrome 방식 용량 계산(키+JSON UTF-8, `<`·U+2028/9·따옴표 밖 큰 정수(`.0`) 보정, 청크 7168B·전체 102400B·키 512개)으로 검사한 뒤 ⑤ **바뀐 청크만** set(디스크·새 청크 모두 `{addedAt, nick}` 레코드로 정규화해 비교 — 디스크 키 순서와 무관하게 안 바뀐 청크는 다시 쓰지 않음). 남는 청크는 **같은 set에서 빈 배열로 비워** 한 번에 원자적으로 반영하고 ⑥ 키 remove는 정리용(실패해도 무해). ④의 용량 검사는 **목록이 커지는 쓰기에만** 적용한다(디스크 현재 크기 추정보다 커질 때) — 추정이 근사치라 브라우저가 받아 준 한도 근처 목록의 해제까지 막으면 안 되기 때문(리뷰 M1). 성공하면 실린 변경 중 seq가 그대로인 것만 pending에서 뺀다(그사이 같은 uid의 새 변경은 남음). **남은 한계**: ① 두 컨텍스트/기기가 같은 읽기→쓰기 사이(같은 브라우저에선 수 ms, 기기 간에는 sync 전파 전)에 쓰면 Chrome sync의 키(청크) 단위 last-writer-wins로 겹친 청크의 다른 변경이 사라질 수 있다(앞쪽 해제는 뒤 청크들을 다시 써서 여러 명이 걸릴 수 있음 — 해소하려면 저장 레이아웃 변경 필요). ② 이 보호는 **모든 기기·탭이 0.8.0 이상**일 때만 성립한다(0.7.x는 읽지 않고 쓴다). ③ 용량 추정은 Chrome 방식(int32 밖 정수에 ".0")이라 Firefox(".0" 없음)에서는 항목당 2B 크게 잡혀, 커지는 쓰기가 실제 한도보다 약 3% 일찍 QUOTA가 된다(데이터 손실 없음, 실 Firefox 156 확인). |

---

## 4. 소비자별 사용 패턴 (참고)

### content-engineer (20·40·99)
```js
try { await FMKBlind.store.load(); }     // 99-main.js 진입점에서 1회
catch (e) { /* READ_FAILED 등 → 차단 없이 정상 노출하고 종료 */ }
if (FMKBlind.store.isBlocked(uid)) { /* 숨김 */ }   // 동기 조회로 스캔
try {
  await FMKBlind.store.block(uid, nick);  // 우클릭 차단 — resolve 뒤에 숨김·성공 토스트
} catch (e) {
  // e.code: 'CONTEXT_INVALIDATED'(새로고침 안내) | 'QUOTA'(목록 정리 안내) | 'WRITE_FAILED'(잠시 후 재시도)
  // store가 이미 되돌렸으므로 숨기지 않고 실패 토스트만. unblock도 동일.
}
// 모바일 목록 닉네임 폴백(2026-10-05, 이슈 #8 — 기존 API 재사용, 계약 무변경):
// list()의 nick으로 '정규화 닉 → uid' 색인을 만들고 block/unblock/onChange 때 무효화·재구성.
FMKBlind.store.list().forEach(function (it) { /* nickIndex.set(normalizeNick(it.nick), it.uid) */ });

// 라이브 동기(선택): 외부 변경을 새로고침 없이 현재 DOM에 즉시 반영. uid는 문자열 그대로.
FMKBlind.store.onChange(function (d) {
  nickIndex = null;                                                    // 닉네임 색인 무효화
  d.removed.forEach(function (uid) { NS.hide.unhideByUid(uid); });
  d.added.forEach(function (uid) { NS.hide.hideByUid(uid); });
  NS.hide.scanNickRows(document, uidForNick);                          // 모바일 목록 닉네임 폴백 재스캔
});
// 주의: onChange는 **현재 DOM에만** 재적용. 이후 삽입되는 노드는 MutationObserver(35-observer, v0.4.0)가
// 삽입 시점의 최신 차단 상태로 처리. diff의 uid/nick은 문자열만 — innerHTML 금지(XSS).
```

### popup-engineer (popup.js)
```js
await FMKBlind.store.load();              // 팝업 열릴 때 1회 — reject면 빈 목록을 보이지 말고 오류 상태로 멈춤
const items = FMKBlind.store.list();      // [{uid,nick,addedAt}] desc → 렌더
const n = FMKBlind.store.count();         // 인원수 표시
await FMKBlind.store.unblock(uid);        // 해제 버튼 → resolve = sync 영속 완료 / reject = 실패(되돌려짐) → 오류 표시 + 재렌더

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
const r = await FMKBlind.store.importMany(entries);  // resolve = sync 영속 완료 / reject: e.code==='QUOTA'면 e.fit 안내(C10)
// r = { added, skipped, invalid } → "N명 추가, M명 중복 건너뜀, K건 무시" 토스트/요약 표시
render(FMKBlind.store.list(), FMKBlind.store.count());  // 목록·카운트 갱신
// 주의: 비정상 항목은 invalid로 집계(throw 아님). 용량 초과·저장 실패는 reject(C7·C10) → 팝업이 catch해 안내.
```

> **영속화 버그 수정(2026-06-15)**: `block`/`unblock`이 이제 즉시·awaitable 영속화한다 — `await unblock(uid)`가 끝나면
> sync 쓰기가 이미 디스패치/완료된 상태다. 따라서 해제 직후 팝업이 닫혀도 유실되지 않는다(이전 디바운스 의존 시
> 팝업이 500ms 내 닫히면 유실되던 버그). 소비자는 여전히 기존 `await unblock`/`await block`만 쓰면 된다(시그니처·호출법 불변).
> ⚠️ **C8 언로드 flush는 제거됨**(잔존 안전망이 아니라 resurrection 원인이었음 — §3 C8 참고).

> ⚠️ 아래 두 단락은 2026-06-15 당시 기록이다. `persistedChunks` 스냅샷·reconcile 모델은 **2026-10-05 C11(읽기→병합→쓰기, 메모리 = disk ⊕ pending)로 대체**됐다 — 현재 동작은 §3 C9·C11 참고.
> 라이브 동기(2026-06-15 구현, C9): 팝업/다른 탭/다른 기기의 변경이 **이미 열린 fmkorea 탭에 새로고침 없이 즉시 반영**된다(`chrome.storage.onChanged`). content가 `onChange`로 현재 DOM을 즉시 숨김/복구하고, store는 메모리 맵 + `persistedChunks` 스냅샷을 스토리지 권위로 정합한다.
> **잔여 엣지 I2 해소 + 경쟁 수정(reconcile)**: "팝업 해제 직후 같은 탭에서 새로고침 없이 또 다른 사용자를 차단" 시, onChanged가 먼저 해제를 탭에 reconcile하며 `persistedChunks`를 fresh 스냅샷으로 정합하므로, 이어진 로컬 `block`이 fresh 스냅샷에 diff → 해제된 청크를 되쓰지 않는다(I2 닫힘). 또한 외부 onChanged의 syncGet await 중 들어온 **미영속 로컬 `block`은 reconcile가 외부 델타만 적용**하므로 보존된다(옛 clobber/`map.clear`가 유실·오통지하던 마이크로태스크 경쟁 수정).
> 남은 한계: ① 새 DOM(AJAX/무한스크롤)은 새로고침 시 반영(MutationObserver는 별개 TODO). ② 외부·로컬이 **같은 uid**를 동시 갱신하면 last-writer로 수렴(eventual consistency — 정상).

---

## 5. 내부 저장 레이아웃 (소비자는 몰라도 됨 — 참고용)

- `bl_meta = { ver: 1 }` — 스키마 버전.
- `bl_0`, `bl_1`, … `bl_N` — 차단 목록 `[[uid, { addedAt, nick }], ...]`을 7168B(Chrome 방식 계산) 이하 청크로 분할. 레코드는 키 정렬 순서로 쓴다(Chrome이 읽기 결과를 키 정렬해 돌려주므로 비교가 안정적). 옛 `{ nick, addedAt }` 순서·문자열 청크·메타 없음도 그대로 읽는다.
- 메모리: `disk`(마지막으로 읽은 저장소, 저장 순서 유지) + `pending`(uid → add/del + seq) → 공개 조회용 `map` = disk ⊕ pending (C11).
- 직렬화 큐(`serialTail`/`enqueueSerial`): 쓰기 실행(`persistRun`)과 외부 변경 반영(`scheduleRefresh`)이 한 체인에서 순서대로 돈다. 아직 시작하지 않은 쓰기 실행(`queuedRun`)에 이후 변경이 함께 실린다.
- 쓰기 실행: 읽기 → 병합 → 용량 검사(커지는 쓰기만) → 바뀐 청크 set(남는 청크는 같은 set에서 `[]`로 비움) → 남는 키 remove(실패해도 경고만). 실패 분류·재시도·되돌림은 C7.
- 언로드 자동 flush 없음(구 C8 폐지 유지). `pageshow`(persisted)·`visibilitychange`(visible)는 **읽기 전용 refresh**만 한다.
- 90% 임박 시 콘솔 경고. 목록이 커지는 쓰기가 한도를 넘으면 쓰기 전에 QUOTA로 거절, 줄이는 쓰기는 브라우저에 맡김(압축은 TODO).

---

## 6. 변경 절차

1. 시그니처/보증 변경 시 이 문서를 갱신하고 **버전 표기**를 올린다.
2. content-engineer·popup-engineer에게 SendMessage로 재통지.
3. 스키마 변경이면 `bl_meta.ver`를 올리고 마이그레이션 경로를 store.js에 추가.

**구현됨(2026-06-15):** `chrome.storage.onChanged` 라이브 동기(7번째 API `onChange` + C9).
**구현됨(2026-10-05):** 쓰기 안전성 재설계(C2·C3·C7·C9·C10 갱신, C11 신설 — 이슈 #13·#14·#15).
**구현됨(2026-07-08):** 내보내기/가져오기(TODO Q7) — 내보내기는 `list()` 직렬화로 팝업이 처리(새 API 없음), 가져오기는 8번째 API `importMany` + C10.
**범위 밖(구현 금지):** 압축.
