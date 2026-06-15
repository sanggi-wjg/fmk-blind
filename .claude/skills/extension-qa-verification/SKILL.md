---
name: extension-qa-verification
description: "FMK-Blind 크롬 확장의 통합 검증 방법론. content script·store.js·popup의 경계면 계약 교차 비교, manifest 정합성, fmkorea 실제 HTML 대비 셀렉터 유효성, 샤딩 경계(8KB/100KB), 엣지 케이스 체크리스트. QA·검증·테스트·정합성·경계면·셀렉터 재검증 작업 시 반드시 이 스킬을 사용할 것."
---

# extension-qa-verification — 확장 통합 검증 방법론

단순 "존재 확인"이 아니라 **경계면 교차 비교**로 통합 버그를 잡는다. 각 모듈 완성 직후 **점진적으로** 검증한다(전체 후 1회 금지).

## 1. 경계면 계약 교차 비교 (최우선)
가장 흔한 버그는 모듈 경계에서 발생한다. 두 파일을 **동시에 읽고 shape을 대조**한다.

| 경계 | 확인 |
|------|------|
| store.js ↔ content | content가 호출하는 `store.block/unblock/isBlocked` 시그니처가 store 정의와 일치하는가 |
| store.js ↔ popup | popup이 쓰는 `store.list()` 반환 필드(`uid/nick/addedAt`)가 store 출력과 일치하는가 |
| selectors ↔ hide | selectors가 돌려준 컨테이너 타입을 hide가 그대로 숨기는가 |

불일치는 추측이 아니라 **파일·라인 + 양쪽 스니펫**으로 증거를 남긴다.

## 2. manifest 정합성
- `manifest_version: 3`, `permissions`가 `["storage"]`뿐인가(host_permissions/scripting/tabs 없음).
- `content_scripts.matches`가 `https://www.fmkorea.com/*`인가, `js` 배열 파일이 **모두 실재**하는가(경로 오타 검출).
- `action.default_popup` 경로가 실재하는가.
- `js` 로드 순서상 `store.js`가 이를 쓰는 파일보다 앞에 오는가.

## 3. 셀렉터 라이브 재검증
가정만으로 통과시키지 않는다. 실제 HTML을 받아 대조한다:
```bash
UA="Mozilla/5.0 ... Chrome/120.0 Safari/537.36"
curl -sL -A "$UA" "https://www.fmkorea.com/index.php?mid=humor" -o /tmp/list.html
# 글 링크 하나 받아 게시글도 확인
grep -oE "member_[0-9]+" /tmp/list.html | head      # 목록에 UID 앵커 존재?
grep -oE "id=\"comment_[0-9]+\"|class=\"rd " /tmp/doc.html | head  # 댓글 li / .rd 존재?
```
코드의 `member_(\d+)`·`li[id^="comment_"]`·`.rd`·`closest('tr, li')` 가정이 실제와 맞는지 확인. 접근 실패 시 "라이브 미검증"으로 명시(통과 처리 금지).

## 4. 샤딩 경계
- 청크 직렬화가 8KB를 넘지 않는가(경계 케이스: 긴 닉네임 다수).
- 총합이 100KB를 넘지 않는가, 임박 시 경고가 있는가.
- 해제로 청크 수가 줄 때 stale `bl_{k}`가 `remove`되는가.
- `bl_meta.ver`가 저장/복원되는가.

## 5. 엣지 케이스 체크리스트
- UID 없는 작성자(탈퇴/비회원) → 메뉴 미표시, 숨김 미적용으로 **조용히 스킵**되는가.
- 빈 차단 목록에서 팝업이 깨지지 않는가.
- 우클릭이 작성자 앵커 위에서만 메뉴를 띄우고, 그 외 영역은 기본 메뉴를 유지하는가.
- 차단 직후 현재 탭에서 해당 노드가 즉시 `.fmkb-hidden` 되는가.
- 팝업 해제는 storage만 갱신하고, 열린 탭은 새로고침 후 반영됨이 안내되는가(MVP 제약).
- 베스트댓글에 중복된 차단 유저 댓글도 함께 숨겨지는가.

## 보고 형식
`.claude/workspace/qa-report.md`에 발견별로 기록한다:
```
### [심각도] 제목
- 위치: 파일:라인
- 증거: (코드/HTML 스니펫)
- 영향: (어떤 동작이 깨지는가)
- 수정안: (구체적 조치)
```
심각도: blocker > major > minor. 미검증 항목은 통과로 두지 않고 "미검증"으로 분류.
