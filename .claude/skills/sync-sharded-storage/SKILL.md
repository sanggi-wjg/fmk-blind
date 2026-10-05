---
name: sync-sharded-storage
description: "FMK-Blind 차단 목록의 chrome.storage.sync 샤딩 저장 계층 설계와 store(src/content/10-store.js) API 계약. 메모리 맵, bl_meta 버전, bl_0..N 청크 분할(8KB/100KB 제약), 읽기→병합→쓰기 영속화(awaitable; 실패 시 reject + 되돌림), stale 청크 정리, load/block/unblock/isBlocked/list/count + onChange(라이브 동기)·importMany(배치 가져오기) API를 정의. 저장·동기화·샤딩·차단목록 영속화·store API 작업 시 반드시 이 스킬을 사용할 것."
---

# sync-sharded-storage — 차단 목록 sync 샤딩 저장 계층

차단 목록을 `chrome.storage.sync`에 저장하되, 단일 키의 8KB 한계를 넘어 **전체 100KB를 활용**하도록 샤딩한다. content script와 popup이 **같은 `src/content/10-store.js` 파일을 공유**한다(상태는 chrome.storage.sync로 동기화).

## sync 제약 (반드시 준수)
- 전체 용량 ~100KB(102,400B), **항목당 ~8KB(8,192B)**, 최대 512 항목.
- 쓰기: 분당 120회, 시간당 1,800회. → block/unblock은 **바로 영속화(awaitable)**하고 바뀐 청크만 기록(수동 차단/해제 빈도에선 한도 무해).
- 용량은 Chrome 방식으로 잰다: 키 + base::JSONWriter 직렬화의 UTF-8 바이트. `JSON.stringify`와 다른 점은 `<`·U+2028/9를 6바이트(`\uXXXX`)로 쓰고 int32 밖 숫자(addedAt)에 ".0"을 붙이는 것뿐이라, 이 둘만 보정한다(제어문자는 `JSON.stringify`도 같은 방식으로 이스케이프).
- `unlimitedStorage` 권한은 sync에 효과 없음(local 전용).

## 저장 레이아웃
- `bl_meta` = `{ ver: 1 }` — 스키마 버전(향후 압축/구조 변경 마이그레이션 기준).
- `bl_0`, `bl_1`, ... `bl_N` — 직렬화한 차단 목록을 8KB 미만 청크로 분할 저장.
- 청크 비교는 디스크 청크와 새 청크를 **같은 정규 형태(`{ addedAt, nick }` 레코드)로 맞춘 문자열**로 한다. Chrome은 읽기 결과 객체를 키 정렬해서 돌려주므로, 정규화 없이 쓴 문자열과 그대로 비교하면 매번 "바뀐 청크"로 오판해 전체를 다시 쓴다(구 "청크 diff 거짓 양성"의 원인). 쓰는 레코드도 같은 순서로 만든다.
- 메모리 표현(2026-10-05): `disk`(마지막으로 읽은 저장소) ⊕ `pending`(미저장 로컬 변경) = 공개 조회용 `map`.

## 직렬화·청킹 규칙
1. 병합 결과를 항목 배열 `[[uid, {addedAt, nick}], ...]`로 만든다(레코드는 정규 형태).
2. 항목 크기를 Chrome 방식으로 한 번씩 재서 누적하며, 청크 1개가 `CHUNK_BUDGET`(7,168B, 8KB 대비 안전 마진)을 넘기 직전에 끊어 다음 청크로.
3. 각 청크를 `bl_{i}`에 **네이티브 배열**로 저장(문자열 이중 직렬화 금지 — 옛 문자열 청크는 읽기만 관용).
4. **stale 청크 정리**: 이전보다 청크 수가 줄면 남는 `bl_{k}`(k ≥ 새 청크 수)를 **같은 set 호출에서 `[]`로 비우고**, 키는 그 뒤 `chrome.storage.sync.remove`로 정리한다(실패해도 경고만 — 빈 청크라 무해).
5. 총 용량이 100KB에 임박하면 콘솔 경고(향후 압축 TODO 안내).

## 쓰기 규칙: 읽기 → 병합 → 쓰기 (2026-10-05, 이슈 #13·#14·#15)
- 쓰기 전에 **항상 저장소를 새로 읽고**, 그 위에 미저장 로컬 변경만 얹어 청크를 만든다. 메모리 스냅샷을 그대로 쓰면, 변경 알림을 놓친 탭이 다른 곳의 해제를 되살리거나 차단을 지운다.
- **읽기에 실패하면 쓰지 않는다**(빈 기준선으로 덮어써 목록이 지워지는 사고 방지).
- 용량은 **목록이 커지는 쓰기에 한해 쓰기 전에** 검사해, 넘으면 set을 부르지 않고 QUOTA로 거절한다. 줄이거나 그대로인 쓰기(해제 등)는 검사하지 않고 브라우저에 맡긴다 — 추정은 근사치라, 브라우저가 이미 받아 준 한도 근처 목록을 정리조차 못 하게 막으면 안 된다.
- 남는 청크는 **같은 set 호출에서 빈 배열로 비우고**, 키 삭제는 그 뒤 정리용으로만 한다(실패해도 무해).
- 이 보호는 0.8.0 이상끼리만 성립한다. 0.7.x가 남은 기기·탭은 예전처럼 덮어쓸 수 있다.
- 남는 한계: 두 기기가 같은 읽기→쓰기 사이에 서로 다른 유저를 바꾸면 Chrome sync의 키 단위 last-writer-wins로 한쪽이 사라질 수 있다.

## 복원 규칙
- 로드 시 `chrome.storage.sync.get(null)`로 전체를 읽어 `bl_` 접두 키만 모은다.
- `bl_meta.ver`로 스키마 확인(불일치 시 마이그레이션 훅 — v1은 ver:1만).
- `bl_0..N`을 인덱스 순으로 이어붙여 파싱 → 메모리 맵 복원.
- 파싱 실패 청크는 건너뛰고 경고(부분 복원 허용).

## store API 계약 (content·popup 공유, `src/content/10-store.js`)
이 시그니처를 **계약으로 고정**한다. 변경 시 두 소비자에게 통지한다.
```js
// 전역: window.FMKBlind.store
const store = {
  async load(),            // sync에서 목록 읽기. 최초 1회 await. 읽기 1회 재시도 후 실패면 reject(READ_FAILED), 실패는 캐시 안 함
  isBlocked(uid),          // boolean (메모리 조회, 동기)
  async block(uid, nick),  // 추가 + 영속화(resolve = sync 쓰기 완료, reject = 실패·되돌림 + err.code). addedAt = 호출 시각
  async unblock(uid),      // 제거 + 영속화(resolve/reject 동일)
  list(),                  // [{ uid, nick, addedAt }] (addedAt desc 정렬 권장)
  count(),                 // number
  onChange(cb),            // (가산적 7번째) 외부 sync 변경 라이브 구독 → unsubscribe. cb({added, removed})
  async importMany(items), // (가산적 8번째, C10) 용량 사전 검사 → 일괄 반영 후 1회 쓰기 → {added, skipped, invalid}. 용량 초과·저장 실패는 reject
};
```
- `uid`는 문자열로 통일(앵커에서 추출한 숫자열 그대로).
- `block`은 이미 있으면 무시(중복 추가 금지), nick은 최신값으로 갱신 허용.
- `block`/`unblock`은 바로 영속화한다(resolve = `chrome.storage.sync` 쓰기 완료). 메모리는 반환 전 즉시 반영되어 `isBlocked`가 곧바로 정확하다. **언로드 자동 flush는 두지 않는다**(stale 탭이 옛 맵을 되쓰는 resurrection 방지). `pageshow`·`visibilitychange`에서는 읽기 전용 refresh만 한다.
- **배치 가져오기(C10)**: 대량 항목은 항목별 `block()` 대신 `importMany`로 넣는다(레이트리밋). 새 uid만 추가, 기존 uid는 로컬 유지·스킵, 비정상 항목은 invalid 집계. added 0이면 쓰기 없이 resolve.
- **API 추가 원칙**: 6 API는 FROZEN. 새 기능은 **가산적** API로만 추가하고 계약 문서에 불변식 번호(C11~)를 부여한다.
- **라이브 동기(C9)**: `onChange`는 `chrome.storage.onChanged`(및 bfcache 복원·탭 복귀) 때 저장소를 다시 읽어 메모리 = disk ⊕ pending으로 재계산하고 키 diff를 통지한다(저장 실패로 되돌린 변경도 통지). 핸들러는 읽기 전용(쓰기 없음), persist와 단일 직렬화 큐로 순차 실행. **최신·권위 계약은 `.claude/workspace/store-api-contract.md`**(이 스킬과 어긋나면 계약이 우선).

## 에러 핸들링 (2026-10-05 — 실패를 성공으로 보이지 않기)
- 비재시도: `QUOTA`(용량·항목 수 초과, 쓰기 전 사전 검사), `CONTEXT_INVALIDATED`(확장 업데이트 뒤 남은 content script — `runtime.id` 소실), `SCHEMA_NEWER`(저장소 형식 버전이 더 높음 — 덮어쓰지 않음).
- 스키마 버전을 올릴 때(압축 등): 구버전이 새 형식을 덮어쓰지 않도록 0.8.0+는 `bl_meta.ver > SCHEMA_VER`면 쓰기를 거부한다. 0.7.x 이하는 이 가드가 없다.
- 재시도: 그 밖의 오류(레이트리밋 포함)는 1s·2s·4s 백오프로 최대 3회 → `WRITE_FAILED`.
- 최종 실패: 변경을 되돌리고(구독자 통지) Promise를 `err.code`와 함께 reject. 무한·백그라운드 재시도 금지. 소비자는 reject 시 실패 안내(content 토스트, 팝업 오류 표시).
- 읽기 실패: load는 1회 재시도 후 reject(`READ_FAILED`), 쓰기 실행은 쓰지 않고 재시도/실패 처리.

## 검증 포인트 (QA 연계)
- 청크 경계가 8KB를 넘지 않는가, 총합이 100KB를 넘지 않는가.
- 해제로 청크가 줄 때 stale `bl_{k}`가 정리되는가.
- content와 popup이 호출하는 시그니처가 위 계약과 일치하는가(경계면 교차 비교).
