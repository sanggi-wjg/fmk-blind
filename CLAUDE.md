# FMK-Blind

에펨코리아(fmkorea, PC) 특정 유저 블라인드 크롬 확장(MV3). 설계는 `PLAN.md`, 후속 작업은 `TODO.md` 참조.

## 하네스: FMK-Blind 크롬 확장

**목표:** content script + sync 샤딩 저장 + 팝업으로 구성된 fmkorea 유저 차단 확장을 에이전트 팀으로 구현·검증·유지보수한다.

**트리거:** 확장 구현/MVP 빌드, content script·저장 계층·팝업 작성, manifest 구성, fmkorea 셀렉터 수정, 차단 기능 작업, 그리고 후속 작업(재실행·수정·보완·부분 재실행·TODO 기능 추가: MutationObserver/모바일/압축/내보내기/onChanged) 요청 시 `fmk-extension-orchestrator` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-14 | 초기 구성 | 전체 (에이전트 4 + 스킬 4 + 오케스트레이터 1) | 신규 하네스 구축 |
| 2026-06-14 | 검토 반영 | content-engineer(manifest 소유 명시), extension-qa(타입 표현 정정), 오케스트레이터(커스텀 타입 폴백), fmk-dom-selectors(단일 출처 선언) | 하네스 구성 검토에서 불일치·드리프트 보강 |
| 2026-06-14 | MVP 구현·검증 완료 | `manifest.json` + `src/**`(content·store·popup) 신규, `.claude/workspace/`(계약·QA 리포트) | 에이전트 팀으로 v1 MVP 구현, QA 그린(MAJOR-1 수정) |
| 2026-06-14 | 리뷰 에이전트 도입 + 아이콘 추가 | extension-reviewer 에이전트 + extension-code-review 스킬 신규(에이전트 5 + 스킬 5 + 오케스트레이터 1), 오케스트레이터 등록, `icons/` 에셋 + manifest `icons`/`action.default_icon` 반영, TODO 아이콘 항목 완료 | 사용자 요청(아이콘 에셋 추가·코드 리뷰 전담 에이전트) |
| 2026-06-15 | 감사 산출물 경로 이동 `_workspace/` → `.claude/workspace/` | 하네스 전반 참조 일괄 갱신(오케스트레이터·에이전트 5·스킬 2·settings.json 권한·src 주석), CLAUDE.md | Chrome이 `_` 접두사 폴더를 예약어로 거부해 압축해제 로드 실패 → 확장 루트에서 제외(`.claude/`는 Chrome이 무시) |
| 2026-06-15 | 팝업 차단 해제 영속화 버그 수정(부분 재실행) | `src/content/10-store.js`(block/unblock 즉시·awaitable 영속화 + `persistNow` 직렬화), `popup.js`·계약 C3 주석 동기화, `.claude/workspace/`(qa·review 리포트 갱신), TODO.md Q7 배치쓰기 가이드 | 단수명 팝업 컨텍스트에서 unblock의 500ms 디바운스가 팝업 종료와 함께 폐기돼 해제가 sync에 미반영(새로고침 후 차단 잔존). 에이전트 팀으로 수정·검증(영속화 28/28·회귀 25/25·DOM 21/21 PASS, 리뷰 MERGE) |
| 2026-06-15 | resurrection 버그 정정 수정(실브라우저 콘솔로 확정) | `src/content/10-store.js`(언로드 `pagehide`/`visibilitychange` 자동 flush=구 C8 **제거**), 계약 C8 폐지·C3 유지로 정정, CLAUDE.md | 위 즉시-영속화로도 실제 Chrome에서 해제가 새로고침 후 되살아남. 진짜 원인=열린 탭의 stale content script가 새로고침 시 옛 맵을 sync에 되씀(resurrection), 통로는 언로드 flush(실 Chrome 직렬화 차이로 청크 diff 거짓 양성). 즉시-영속화라 flush 불필요→제거로 해소. **교훈: mock QA가 실 Chrome 직렬화·다중 컨텍스트 미재현→거짓 PASS. 실브라우저 콘솔 검증으로 근본 원인 확정.** 잔여: `onChanged` 실시간 정합 미구현(TODO) |
