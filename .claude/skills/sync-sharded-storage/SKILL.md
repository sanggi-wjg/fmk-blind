---
name: sync-sharded-storage
description: "FMK-Blind 차단 목록의 chrome.storage.sync 샤딩 저장 계층 설계와 store.js API 계약. 메모리 맵, bl_meta 버전, bl_0..N 청크 분할(8KB/100KB 제약), 즉시 영속화(awaitable; 실패 시 디바운스 재시도), stale 청크 정리, block/unblock/isBlocked/list/count + onChange(라이브 동기) API를 정의. 저장·동기화·샤딩·차단목록 영속화·store API 작업 시 반드시 이 스킬을 사용할 것."
---

# sync-sharded-storage — 차단 목록 sync 샤딩 저장 계층

차단 목록을 `chrome.storage.sync`에 저장하되, 단일 키의 8KB 한계를 넘어 **전체 100KB를 활용**하도록 샤딩한다. content script와 popup이 **같은 `store.js` 파일을 공유**한다(상태는 chrome.storage.sync로 동기화).

## sync 제약 (반드시 준수)
- 전체 용량 ~100KB(102,400B), **항목당 ~8KB(8,192B)**, 최대 512 항목.
- 쓰기: 분당 120회, 시간당 1,800회. → block/unblock은 **즉시 영속화(awaitable)**하고 변경된 청크만 기록. 레이트리밋 초과 등 **실패 시에만 디바운스 재시도**(수동 차단/해제 빈도에선 한도 무해).
- `unlimitedStorage` 권한은 sync에 효과 없음(local 전용).

## 저장 레이아웃
- `bl_meta` = `{ ver: 1 }` — 스키마 버전(향후 압축/구조 변경 마이그레이션 기준).
- `bl_0`, `bl_1`, ... `bl_N` — 직렬화한 차단 목록을 8KB 미만 청크로 분할 저장.
- 메모리 표현: `Map<uidString, { nick, addedAt }>`.

## 직렬화·청킹 규칙
1. 메모리 맵을 항목 배열 `[[uid, {nick, addedAt}], ...]`로 직렬화(JSON).
2. 항목 단위로 누적하며 청크 1개가 ~7.5KB(안전 마진)를 넘기 직전에 끊어 다음 청크로.
3. 각 청크를 `bl_{i}`에 `JSON.stringify`로 저장.
4. **stale 청크 정리**: 이전보다 청크 수가 줄면 남는 `bl_{k}`(k ≥ 새 청크 수)를 `chrome.storage.sync.remove`로 삭제(유령 데이터 방지).
5. 총 용량이 100KB에 임박하면 콘솔 경고(향후 압축 TODO 안내).

## 복원 규칙
- 로드 시 `chrome.storage.sync.get(null)`로 전체를 읽어 `bl_` 접두 키만 모은다.
- `bl_meta.ver`로 스키마 확인(불일치 시 마이그레이션 훅 — v1은 ver:1만).
- `bl_0..N`을 인덱스 순으로 이어붙여 파싱 → 메모리 맵 복원.
- 파싱 실패 청크는 건너뛰고 경고(부분 복원 허용).

## store.js API 계약 (content·popup 공유)
이 시그니처를 **계약으로 고정**한다. 변경 시 두 소비자에게 통지한다.
```js
// 전역: window.FMKBlind.store
const store = {
  async load(),            // sync에서 메모리 맵 복원. 최초 1회 await 필수
  isBlocked(uid),          // boolean (메모리 조회, 동기)
  async block(uid, nick),  // 추가 + 즉시 영속화(반환 Promise = sync 쓰기 완료). addedAt = 호출 시각
  async unblock(uid),      // 제거 + 즉시 영속화(반환 Promise = sync 쓰기 완료)
  list(),                  // [{ uid, nick, addedAt }] (addedAt desc 정렬 권장)
  count(),                 // number
  onChange(cb),            // (가산적 7번째) 외부 sync 변경 라이브 구독 → unsubscribe. cb({added, removed})
};
```
- `uid`는 문자열로 통일(앵커에서 추출한 숫자열 그대로).
- `block`은 이미 있으면 무시(중복 추가 금지), nick은 최신값으로 갱신 허용.
- `block`/`unblock`은 **즉시 영속화**한다(반환 Promise = `chrome.storage.sync` 쓰기 완료). 메모리는 반환 전 즉시 반영되어 `isBlocked`가 곧바로 정확하다. 디바운스(500ms)는 **쓰기 실패 재시도 경로에서만** 쓰고, **언로드 자동 flush(`pagehide`/`visibilitychange`)는 두지 않는다**(stale 탭이 옛 맵을 되쓰는 resurrection 방지).
- **라이브 동기(C9)**: `onChange`는 `chrome.storage.onChanged`로 외부(다른 탭/팝업/기기) 변경을 **외부 델타만 reconcile**(로컬 미영속 항목 보존)해 메모리에 반영하고 구독자에 통지한다. 핸들러는 읽기 전용(쓰기 없음), persist와 단일 직렬화 큐로 순차 실행. **최신·권위 계약은 `.claude/workspace/store-api-contract.md`**(이 스킬과 어긋나면 계약이 우선).

## 에러 핸들링
- sync 쓰기 실패: 메모리 상태 유지 + 경고, 다음 디바운스에서 재시도.
- 할당량 초과: 사용자에게 "차단 목록 한도 임박" 경고(콘솔/팝업), 데이터 손실 금지.

## 검증 포인트 (QA 연계)
- 청크 경계가 8KB를 넘지 않는가, 총합이 100KB를 넘지 않는가.
- 해제로 청크가 줄 때 stale `bl_{k}`가 정리되는가.
- content와 popup이 호출하는 시그니처가 위 계약과 일치하는가(경계면 교차 비교).
