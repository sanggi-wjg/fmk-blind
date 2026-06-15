---
name: extension-code-review
description: "FMK-Blind 크롬 확장의 코드 리뷰 방법론. 정확성·보안(XSS/DOM 인젝션/최소권한)·견고성·유지보수성·MV3 베스트프랙티스(아이콘 에셋 포함)·성능을 차원별 체크리스트로 리뷰하고 심각도(blocker/major/minor)와 증거·수정안으로 보고. extension-qa의 통합/계약 검증과 상보적. 코드 리뷰·변경 리뷰·품질/보안 점검 작업 시 반드시 이 스킬을 사용할 것."
---

# extension-code-review — 확장 코드 리뷰 방법론

extension-qa가 **경계면·계약·셀렉터·샤딩의 통합 정합성**을 본다면, 이 스킬은 그 위의 **코드 품질**을 본다. 중복을 피하되 QA가 놓치는 결함(로직·보안·견고성·가독성)을 잡는다.

## 리뷰 차원별 체크리스트

### 1. 정확성
- 비동기: `await store.load()` 누락, Promise 미처리, 차단/해제 직후 `isBlocked` 즉시 반영
- 정규식/셀렉터: `member_(\d+)`가 `member_plate`를 오캡처하지 않는가, `closest` 판정 순서가 댓글 > 게시글 > 목록인가
- 경계 조건: 빈 목록, UID 없음(탈퇴/비회원), 중복 차단, 매우 긴 닉네임

### 2. 보안
- DOM 주입: 닉네임/UID를 `innerHTML`에 넣지 않는가(반드시 `textContent`/`createElement`). 팝업 검색 강조도 안전한가(XSS)
- 최소 권한: manifest `permissions`가 `["storage"]`뿐, 불필요 API·host_permissions 미사용
- 신뢰 경계: 페이지 DOM에서 읽은 값(닉네임)을 안전하게 다루는가

### 3. 견고성
- 에러 처리: storage 실패·미가용 시 폴백, 조용한 실패가 사용자 데이터를 잃지 않는가
- 생명주기: 디바운스 쓰기가 언로드(`pagehide`/`visibilitychange`)에 flush되는가
- 재진입: content script 중복 주입, 우클릭/리스너 중복 등록 방어

### 4. 유지보수성
- 죽은 코드, 매직 넘버(8KB/100KB 상수화), 네이밍 일관성, 주석과 코드 일치

### 5. MV3/크롬 베스트프랙티스
- manifest 구조, **아이콘 에셋**: 16/32/48/128 크기 존재·경로 실재·PNG 유효, `icons`와 `action.default_icon` 정합
- 전역 네임스페이스 단일화(`window.FMKBlind`), content script 격리

### 6. 성능
- 1회 스캔의 DOM 쿼리 비용, 대량 목록 시 팝업 렌더, 불필요한 재계산

## 범위 구분 (중요)
- **`TODO.md`의 v1 의도적 제외 항목**(MutationObserver/onChanged/모바일/압축/내보내기 등)은 **결함이 아니다**. "미구현 = 범위 밖"으로 분류하고 결함으로 올리지 않는다.
- QA가 이미 PASS 처리한 계약 시그니처 일치는 재지적하지 않는다(상보성 유지).

## 보고 형식
`.claude/workspace/review-report.md`에 발견별로 기록한다:
```
### [심각도] 제목  (차원: 정확성|보안|견고성|유지보수성|MV3|성능)
- 위치: 파일:라인
- 증거: (코드 스니펫)
- 수정안: (구체적 조치)
```
심각도: blocker > major > minor. 끝에 **종합 판정**(머지 가능 / 조건부 / 불가)과 차원별 요약을 적는다.
