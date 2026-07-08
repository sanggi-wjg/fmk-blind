# TODO — 후속 작업

v1 범위에서 의도적으로 제외한 개선 항목. 우선순위 순.

## 기능 확장
- [x] **MutationObserver 증분 처리** (Q6) — 2026-07-08 완료. 최초 로드 1회 스캔(30-hide.scan) 이후 AJAX 댓글/더보기/무한스크롤/새 댓글 삽입 등으로 새로 삽입되는 노드에도 차단(숨김)을 즉시 적용(`src/content/35-observer.js`, `document.body` childList/subtree 관찰 → addedNodes 의 작성자 앵커를 30-hide.hideForAnchor 재사용으로 숨김). attributes 미관찰이라 클래스 토글 재귀 없음, 우리 UI 노드(메뉴/토스트) 스킵
- [x] **`chrome.storage.onChanged` 새로고침 없는 반영** — 2026-06-15 완료. 팝업/다른 탭/다른 기기 변경 시 열린 탭이 즉시 숨김/복구(가산적 7번째 API `onChange` + 불변식 C9). 외부 델타만 reconcile해 로컬 미영속 항목 보존 + 잔여 엣지 I2 닫음. MutationObserver(새 DOM 증분)는 여전히 별개 TODO
- [ ] **모바일 지원** (Q2) — `m.fmkorea.com` 별도 셀렉터 세트 + 검증. 현재 PC 전용
- [ ] **저장 압축** (Q5) — LZ-string 등으로 목록 압축 후 샤딩 → sync 수천 명대 확보
- [x] **내보내기/가져오기** (Q7) — 2026-07-08 완료. 팝업 푸터에 JSON 내보내기/가져오기 버튼(`fmk-blind-blocklist-YYYY-MM-DD.json`). QA 설계 메모대로 대량 import는 가산적 8번째 API `importMany`(계약 C10)로 **메모리 일괄 반영 후 1회 flush(배치 쓰기)** — 레이트리밋 압박 없음. 머지 시맨틱: 새 uid 추가·기존 uid 로컬 유지·비정상 invalid 집계. Chrome↔Firefox 목록 이관 경로(모바일 지원 선행 단계)
- [ ] **컨텍스트 메뉴 메모** (Q3) — 차단 사유 메모 입력/표시

## UX 보강
- [ ] **자기 자신 차단 가드** (Q9) — 로그인 사용자 UID 탐지 후 차단 시 경고
- [ ] **글쓴이 글 직접 진입 시 안내문** (Q4) — 본문이 통째 숨겨져 빈 페이지가 될 때 작은 안내 한 줄
- [ ] **인용/멘션 처리** (Q8) — 다른 사람이 인용한 차단 유저 텍스트까지 가릴지(오탐 주의)
- [ ] **홈/베스트 통합목록 폴백** (Q2) — UID 없는 화면에서 마지막 닉네임 텍스트 매칭(오차단 한계 감수)

## 운영/품질
- [ ] 셀렉터 회귀 대비 — 에펨 마크업 변경 시 깨지는 지점 모니터링/테스트
- [x] 아이콘 에셋(16/32/48/128) — 2026-06-14 완료(`icons/icon{16,32,48,128}.png` + manifest `icons`/`action.default_icon`)
- [ ] 스토어 배포용 설명/스크린샷 — 배포 **절차**는 `DEPLOY.md`(Chrome 스토어/Firefox AMO·서명, web-ext)로 정리됨. 남은 건 스토어 등록 정보(설명문안·스크린샷) 에셋 제작
