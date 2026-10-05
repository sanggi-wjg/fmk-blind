# QA 최종 재검증 보고서 — UI/UX 1차 묶음(실행 취소·오류 토스트·팝업 되돌리기), 2차 수정 루프

- 담당: extension-qa (직접 모드, 리더에게만 보고, 소스는 고치지 않음)
- 갱신: 2026-10-05 · 브랜치 `feat/undo-and-error-feedback`(작업 트리, 미커밋)
- 대상: 직전 QA 이후 리더 수정분
  - MINOR-2R(A2안): `50-toast.js` `absorbClicks()`, `content.css` `.fmkb-toast-absorb`
  - R5/INFO-2: `.fmkb-toast-live` 상태 영역, `.fmkb-toast-msg` aria-hidden
  - MINOR-8: `focusin` relatedTarget 기억 → `releaseFocus()`
  - N9: popup.js `lastActedUid`
  - 문서: PLAN/README/TODO
- **10-store.js·20-selectors.js·manifest는 main과 같음(0.8.2)**
- 방법
  - jsdom: 실제 `10-store.js` + 모의 `chrome.storage.sync`(키 정렬·용량 계산·비동기 onChanged·장애 주입·쓰기 게이트) 위에서 실제 popup.js·content 00~99 로드
  - 실 헤드리스 Chrome 154(puppeteer-core): 토스트 hit-testing, 키보드, CDP 접근성 트리
  - **실제 확장**: Chrome for Testing `--load-extension`(고정 ID `mnnofigckdchafggopgbjanmjmcbjppc`), 실제 content script·`chrome.storage.sync`, 합성 fmkorea 페이지(요청 가로채기), 팝업은 탭으로 연다
  - **실 Firefox 156**(puppeteer-core, WebDriver BiDi, 신규): 토스트 기하·키보드 경로
- 스크립트: `/private/tmp/claude-501/-Users-raynor-vscode-workspace-fmk-blind/0bfd71b8-e788-404e-92a5-dcba222fefbd/scratchpad/qa/`
  - 갱신: `t_toast.js`, `t_content.js`, `t_popup2.js`(직전본은 `*_r1.js`)
  - 신규: `t_chrome3.js`, `t_ext3.js`, `t_ff3.js`
  - 수정안 검증: `proto_R3_toast.js`, `extcopy3/`
  - 판별력 확인: `altroot/` + `harness_alt.js` + `t_popup2_alt.js`(N9 이전 코드)

## 판정 요약

**blocker 0 · major 0 · minor 2(신규) · 정보 5**

이번 수정 4건은 의도한 경로에서 모두 동작한다.
- MINOR-2R: 버튼 가운데를 더블클릭하면 두 번째 클릭이 페이지로 가지 않는다(실 Chrome 0/12·0/3·0/4, 실제 확장 0/3, Firefox 0/3).
- INFO-3: 사라졌다.
- R5: 접근성 트리에 상태 영역이 늘 남고 문구는 한 번만 노출된다.
- MINOR-8: Enter를 누르면 포커스가 원래 요소로 돌아간다.
- N9: 마지막으로 누른 줄로만 포커스가 간다.
- 기존 팝업·content 회귀는 없다.

남은 문제 2건은 모두 같은 종류다. 실행 취소 직후의 두 번째 입력이 페이지로 새는데, 두 브라우저(Chrome·Firefox)에서 모두 재현된다.
- **MINOR-2R2**: 후속 토스트가 원래 토스트보다 좁으면, 버튼 오른쪽 끝을 다시 누를 때 그 클릭이 페이지로 간다.
  - 데스크톱 주 경로(차단 → 실행 취소)는 안전하다.
  - 메뉴로 해제 → 실행 취소 경로와 터치에서는 샌다.
- **MINOR-9**: MINOR-8 수정으로 새로 생겼다. Enter를 두 번 누르면 두 번째 Enter가 포커스가 돌아간 원래 요소(링크)를 실행한다. 이 수정 전에는 BODY로 가서 아무 일도 없었다.

두 건을 함께 막는 수정안(`proto_R3_toast.js`)을 검증해 두었다. 결과는 실 Chrome 40/40, 실제 확장 25/25, Firefox 5/5, jsdom 66/66이다.

| 묶음 | 실행 | PASS | FAIL | 비고 |
|------|-----:|-----:|-----:|------|
| 팝업 ↔ 실제 store 기존 (`t_popup.js`) | 61 | 60 | 1 | P11(정보, 동률 순서), 직전과 같음 |
| 팝업 신규 경로 (`t_popup2.js`) | 63 | 63 | 0 | N9 겹침 11건 추가 |
| content 전체 모듈 + 실 마크업 (`t_content.js`) | 46 | 46 | 0 | 흡수 창·live 영역 단정 갱신 |
| 토스트 가짜 시계 (`t_toast.js`) | 66 | 66 | 0 | 흡수 창·live·포커스 복귀 33건 추가 |
| 실 Chrome 기존 (`t_chrome_toast` 7, `t_chrome_tab` 1, `t_chrome_fix` 3) | 11 | 11 | 0 | 회귀 없음 |
| 실 Chrome 직전 라운드 (`t_chrome2.js`) | 19 | 17 | 2 | 2건 모두 **의도된 변경**(INFO-3 제거, 숨김 뒤에도 live 영역 유지) |
| 실 Chrome 이번 라운드 (`t_chrome3.js`) | 40 | 38 | 2 | S1e = MINOR-2R2, S3b = MINOR-9 |
| **실제 확장** (`t_ext3.js`) | 25 | 24 | 1 | E6 = MINOR-9 |
| **실 Firefox 156** (`t_ff3.js`) | 5 | 3 | 2 | F2 = MINOR-2R2, F3 = MINOR-9 |
| 셀렉터 라이브(PC 목록·게시글·모바일 목록) | 3 | 3 | 0 | 모두 HTTP 200 |
| **합계** | **339** | **331** | **8** | 실제 결함 5건(원인 2개), 의도된 변경 2건, 정보 1건 |

---

## 이전 이슈별 해소 여부

| 이전 항목 | 내용 | 결과 | 근거 |
|-----------|------|------|------|
| MINOR-2R | 실행 취소 뒤 후속 토스트가 클릭 흡수를 풀어 두 번째 클릭이 새는 문제 | **해소(버튼 가운데)** → 가장자리 잔여는 MINOR-2R2 | 아래 1절 |
| INFO-3 | 자동 숨김 뒤 0.5초 동안 보이지 않는 토스트가 클릭을 흡수 | **해소** | 실 Chrome S2: 숨김 200ms 뒤 클릭이 페이지에 닿음. Firefox F4 같음. jsdom: 자동 숨김엔 absorb 클래스가 없음 |
| INFO-2 / R5 | 숨겨져 있던 status 영역이 뜨는 순간 문구가 바뀜 | **해소(구조 기준)**. 실제 낭독은 미검증 | 아래 2절 |
| MINOR-8 | 키보드 실행 취소 뒤 포커스가 BODY로 초기화 | **해소**. 단, 부작용으로 MINOR-9 생김 | 아래 3절 |
| N9(리뷰) | 여러 줄 작업이 겹칠 때 먼저 끝난 줄이 포커스를 가져감 | **해소** | 아래 4절 |
| MINOR-1·3·4·5 | 되돌리기 실패 줄·Tab 순서·터치 높이·대기 중 줄 | 회귀 없음 | `t_popup` P9·P10, `t_chrome_tab`(`l2 -> BODY -> l1`), S5(데스크톱 38/38px·터치 45/45px, 버튼 45px) |
| INFO-1 (P11) | addedAt 동률 묶음 안에서 줄 자리 변화 | 정보, 변경 없음 | 저장 중 `1,3,4,2` → 해제됨 `2,1,3,4` |
| MINOR-7 | importMany invalid에도 "잠시 후 다시 시도" 문구 | 정보, 변경 없음 | 숫자 uid만 오가는 현 경로에선 도달하지 않음 |
| DOC-2 | 키보드 포커스로 멈추는 동작이 문서에 없음, content.css 주석 | **해소** | PLAN Q9, README, TODO에 "키보드로 포커스하면 멈춤" 반영, content.css 60-61·83-84 주석 갱신. 버전 범프(0.8.2 = main)와 CLAUDE.md 이력은 Phase 6 몫으로 남음 |

---

## 중점 검증 결과

### 1. MINOR-2R(A2) — 실 Chrome·실제 확장·Firefox
- **S1 행렬**(쓰기 지연 0/10/40/120ms × 간격 40/150/300ms, 실제 후속 토스트, 버튼 가운데 클릭)
  - 12건 모두 누수 0, 실행 1회.
  - 직전 라운드는 11/12가 샜다.
- **S1b** 오류 후속 토스트: 간격 40/150/300ms에서 누수 0/3.
- **S1c** 후속 토스트 없음(클릭만 흡수): 간격 40/150/300/450ms에서 누수 0/4. visibility 0.5초 지연 덕분에 흡수가 그 자리에서 동작한다.
- **S1d** 흡수 창 이후
  - 약 420ms에 누른 클릭은 흡수된다.
  - 약 650ms에는 후속 토스트가 보이는 중에도 `absorb` 클래스가 빠지고 `pointer-events:none`이라 클릭이 페이지에 닿는다.
- **S2** 일반·오류 토스트는 클릭을 막지 않는다. 표시 중에도, 숨김 100ms 뒤에도 페이지가 클릭을 받는다(4/4).
- **실제 확장 E1**(실제 store 쓰기, 후속 토스트가 8~9ms 뒤에 뜸)
  - 간격 60/150/300ms에서 두 번째 클릭 누수 0/3.
  - 댓글 복구, sync에서 빠짐 확인.
  - E1b(버튼 왼쪽·오른쪽 10%, 데스크톱 차단 → 실행 취소): 누수 0.
- **실 Firefox 156 F1**: 간격 40/150/300ms에서 0/3. 리더 결과(150ms 흡수, 창 이후 통과)와 일치한다.
- jsdom
  - 흡수 클래스는 클릭 직후 붙고 정확히 500ms에 빠진다.
  - `show()`는 이 클래스를 건드리지 않는다.
  - 실행 취소를 다시 누르면 타이머가 다시 시작한다.
  - 흡수 중 토스트가 DOM에서 빠져도 예외가 없다.
- 잔여: 버튼 가장자리 → **MINOR-2R2**

### 2. R5 — 실 Chrome 접근성 트리(CDP `Accessibility.getFullAXTree`)

| 시점 | status 노드 | 무시됨 | live | 자식 문구 | 보이는 문구 StaticText 수 | 버튼 |
|------|:---:|:---:|:---:|------|:---:|:---:|
| 표시 중 | 1 | 아니오 | polite | `낭독 테스트` | **1** | 있음 |
| 숨김 뒤(visibility:hidden) | 1(같은 DOM 노드) | 아니오 | polite | `두번째`(마지막 문구) | 1 | 없음 |
| 다시 표시 약 15ms | 1(같은 노드) | 아니오 | polite | `''` | - | - |
| 다시 표시 50ms 뒤 | 1(같은 노드) | 아니오 | polite | `세번째 안내` | **1** | 있음 |

- 숨김 중에도 status 노드는 같은 DOM 노드로 트리에 남는다. 다시 뜰 때는 기존 live 영역 안에서 문구가 `'' → 문구`로 바뀐다(DOM에서 텍스트 노드가 빠졌다가 다시 들어감).
- `.fmkb-toast-msg`는 aria-hidden이라 보이는 문구가 두 번 노출되지 않는다.
- 실제 확장 E7: 차단 토스트 표시 중 status 1개, 문구 1회 노출, 자동 숨김 뒤에도 status가 남는다.
- jsdom
  - 같은 문구를 다시 띄우면 텍스트 노드가 빠졌다가 다시 들어간다(기록 `-하나|+하나`).
  - 50ms 안에 A → B로 바뀌면 B만 남는다.
  - XSS 문자열은 텍스트로만 들어간다.
- 레이아웃: live 자식을 빼고 재도 크기가 같다(데스크톱 38×167, 터치 45×191).
- 미검증
  - CDP `Accessibility.nodesUpdated` 이벤트가 0건이었다. 도구 한계로 보이며, 실제 낭독기(VoiceOver/NVDA)의 알림은 확인하지 못했다.
  - 숨긴 뒤 마지막 문구가 남는 점은 INFO-4로 정리했다.

### 3. MINOR-8 — 포커스 복귀
- 실 Chrome S3(키보드)
  - Tab으로 들어가면 멈추고, Shift+Tab으로 나가면 1.5초 뒤 사라진다.
  - 사라진 버튼은 Tab 대상이 아니다.
  - Enter를 누르면 실행은 1회이고 포커스가 원래 요소 `#l2`로 돌아간다.
  - 실제 흐름(후속 토스트가 버튼을 `[hidden]` 처리)에서는 그다음 Tab이 버튼에 닿지 않는다.
- S3c
  - 원래 요소가 DOM에서 빠졌거나 `display:none`이면 BODY로 간다. `.fmkb-hidden` 댓글 안 앵커와 같은 경우다.
  - 페이지를 1500px 스크롤한 뒤 Enter를 눌러도 `scrollY`가 그대로다(preventScroll).
- S3d 마우스 경로(Chrome은 mousedown 때 버튼에 포커스를 준다)
  - 입력창에 있다가 클릭하면 입력창으로 돌아간다.
  - BODY에서 클릭하면 BODY로 간다. 버튼에 남지 않는다.
  - 링크에 포커스가 있을 때 더블클릭해도 링크는 실행되지 않고 페이지도 클릭되지 않는다. 다만 두 번째 mousedown이 포커스를 못 받는 토스트에 떨어져 브라우저가 blur하므로 BODY가 된다(INFO-7).
- 실제 확장 E6(단일 Enter): 실행 취소가 되고 포커스는 원래 요소 `#under`로 돌아가며, 원래 요소는 실행되지 않는다.
- Firefox F3(단일 Enter): `#l2`로 돌아간다.
- jsdom 8건
  - 버튼에 포커스가 간 적 없는 마우스 클릭(Firefox·Safari mac)에서는 예전에 기억해 둔 요소로 포커스를 빼앗지 않는다.
  - onClick은 포커스 복귀 뒤에 실행되고, onClick 안에서 옮긴 포커스가 우선한다.
- 잔여: Enter 두 번 → **MINOR-9**

### 4. N9 — 겹친 줄 작업의 포커스(jsdom 11건 + 실제 확장 팝업)
- A(222) → B(333) 순으로 누르고 A 저장을 붙잡아 둔 뒤 차례로 풀었다.
  - A가 끝날 때 포커스는 BODY에 그대로 있다.
  - B가 끝나면 333 '되돌리기'로 간다.
- B가 실패하면 333 '차단 해제'(활성)에 오류 안내와 함께 포커스가 간다.
- A가 실패하면 A 줄에는 오류만 표시되고, 포커스는 B로 간다.
- 겹치는 동안 사용자가 검색창으로 옮기면 검색창을 유지한다.
- 되돌리기 A와 해제 B가 겹쳐도 B로 간다.
- 단일 작업 회귀 없음(R2/N7 PASS).
- **판별력**: 같은 테스트를 N9 이전 코드(`focusUid = uid` 무조건)에 돌리면 7건이 FAIL이다. 포커스가 A의 `fmkb-restore:222`에 머문다. 현재 코드는 0건 FAIL이다.
- 실제 확장 E8(실제 Chrome 포커스 정리: 비활성 버튼 → BODY)
  - A = 111 되돌리기(저장 붙잡음), B = 444 해제.
  - A가 끝날 때 BODY를 유지하고, 최종 포커스는 `fmkb-restore:444`다.

### 5. 계약·manifest·셀렉터
- store·manifest·selectors는 diff가 없다.
  - content는 `load/isBlocked/block/unblock/list/onChange/importMany`, popup은 `load/list/count/isBlocked/unblock/onChange/importMany/block`(폴백)만 쓴다. 계약 C10(`importMany([항목])`로 addedAt 유지)과 일치한다.
- 셀렉터 라이브(실제 `20-selectors.js`로 대조)
  - PC 목록 `mid=humor`: 200, UID 앵커 23개, 컨테이너 TR 23.
  - 게시글 `/1598251840`: 200, `.rd` 1, `li#comment_` 39, 하단 목록 TR 27.
  - 모바일 목록 `m.fmkorea.com/humor`(모바일 UA): 200, `NICK_ROW` 24행, 닉네임 23개 추출.
- 샤딩 경계(8KB/100KB/stale/bl_meta)는 저장 계층 diff가 없어 재검증하지 않았다.

---

## 발견 사항

### [minor] MINOR-2R2 — 후속 토스트가 원래 토스트보다 좁으면, 실행 취소 버튼 오른쪽 끝을 다시 누를 때 그 클릭이 페이지로 감
- 위치
  - `src/content.css:85`: `#fmkb-toast.fmkb-toast-absorb { pointer-events:auto }`. 흡수 범위가 지금 보이는 토스트 상자 크기를 따른다.
  - `src/content/99-main.js:156,171`: 후속 토스트는 버튼이 없어 버튼 폭(데스크톱 약 64+14px)만큼 좁아진다.
  - `src/content/50-toast.js:52`(`absorbClicks`)
- 증거(`t_chrome3.js` S1e)
  - 조건: 간격 150ms, 쓰기 10ms, 실제 문구, 버튼 폭의 10%·50%·90% 지점 클릭.

  | 화면 | 경로 | 닉 4종 결과 | 버튼 오른쪽 끝 / 후속 토스트 오른쪽 끝(홍길동) | 덮이지 않는 폭 |
  |------|------|------|------|------|
  | 데스크톱 | 차단 → 실행 취소(주 경로) | **누수 없음** | 501 / 496 | 약 5px(90% 지점은 안쪽) |
  | 데스크톱 | 메뉴 해제 → 실행 취소 | 오른쪽 90% **4/4 누수** | 514 / 496 | 약 18px(버튼의 약 27%) |
  | 터치 | 차단 → 실행 취소 | 오른쪽 90% **4/4 누수** | 521 / 510 | 약 11px(약 15%) |
  | 터치 | 메뉴 해제 → 실행 취소 | 오른쪽 90% **3/4 누수**(긴 닉은 줄바꿈으로 예외) | 536 / 510 | 약 26px(약 36%) |

  - 버튼 가운데(50%)는 모든 조건에서 새지 않는다.
  - 실 Firefox F2(홍길동)도 같다. 데스크톱 해제 경로, 터치 차단·해제 경로 3/4가 샜다.
  - 실제 확장 E1b(데스크톱 차단, 닉 `댓글러`): 버튼 오른쪽 끝 551, 후속 토스트 오른쪽 끝 546으로 누수 0.
- 영향
  - 실행 취소를 두 번 누를 때 두 번째 입력이 버튼 오른쪽 끝에 떨어지면 토스트 아래 페이지(목록 행·링크)가 클릭돼 의도치 않게 이동한다.
  - 터치는 두 번 탭이 흔한 환경이라 주 경로(차단 취소)에서도 나타난다.
  - 데이터 손실은 없다.
  - 직전 MINOR-2R 수정안 검증은 버튼 가운데만 눌러서 이 경계를 놓쳤다(QA 쪽 누락).
- 수정안(검증됨, `proto_R3_toast.js`)
  - A2는 그대로 둔다. 클릭 순간 토스트 영역(rect)을 기억하고, 0.5초 동안 그 안에서 토스트 밖으로 가는 포인터·마우스 이벤트를 capture 단계에서 막는다(아래 코드의 `onGuardPointer`).
  - A2는 후속 토스트 위의 모든 이벤트 종류(터치 포함)를 받는다. rect 가드는 후속 토스트보다 넓었던 원래 자리를 메운다.
  - 결과: 실 Chrome S1e 0/48(화면 2 × 경로 2 × 닉 4 × 지점 3), 실제 확장 25/25, Firefox F2 0/4.
  - 대안: 흡수 동안 토스트 `min-width`를 원래 폭으로 고정한다. 단순하지만 0.5초 뒤 폭이 줄어드는 게 보인다.

### [minor·a11y] MINOR-9(신규, MINOR-8 수정의 부작용) — Enter를 두 번 누르면 두 번째 Enter가 포커스가 돌아간 원래 요소(링크)를 실행
- 위치: `src/content/50-toast.js:43-50`(`releaseFocus`). 실행 취소의 첫 Enter 처리 중에 포커스를 원래 요소로 즉시 돌려준다.
- 증거
  - 실 Chrome S3b(원래 요소 = 링크 `#l2`): Enter 두 번 연속, 30ms 간격, 150ms 간격 모두 `l2` 클릭 1회(3/3). 키를 누르고 있어 자동 반복된 경우는 0이다.
  - **MINOR-8 이전 코드**(`extcopy/`의 blur 버전)로 같은 테스트를 돌리면 0/3이다. 즉 이번 수정으로 생긴 회귀다.
  - 실제 확장 E6(double): 실행 취소가 되고 원래 요소 `#under` 링크가 실행됐다(`underActivated:1`).
  - 실 Firefox F3(double): `l2` 클릭 1회.
- 영향
  - 키보드 사용자가 실행 취소에서 Enter를 두 번(또는 빠르게) 누르면 두 번째 Enter로 원래 요소가 실행된다.
  - 토스트가 body 끝에 있으므로 원래 요소는 보통 페이지의 마지막 포커스 요소(하단 링크 등)다. 마우스 더블클릭 누수(MINOR-2R)의 키보드판이다.
  - 주소창에서 Shift+Tab으로 들어온 경우는 relatedTarget이 null이라 BODY로 가서 해당이 없다.
- 수정안(검증됨, `proto_R3_toast.js`): 포커스를 실제로 돌려준 경우에만 0.5초 동안 토스트 밖의 Enter·Space keydown을 capture 단계에서 막는다.
  - 결과: S3b 0/4, E6 PASS, F3 PASS. 단일 Enter 포커스 복귀와 jsdom 66/66은 그대로다.
  - 다듬을 점(선택): 클릭 이벤트의 `e.detail === 0`(키보드로 누름)일 때만 키를 막는다. 그러면 Chrome 마우스 경로에서 입력창으로 돌아간 직후의 Enter 입력(0.5초 안)을 막지 않는다.
  - 대안: 포커스 복귀를 흡수 창 끝(500ms)으로 미룬다. 그동안은 BODY에 두고, 그 시점에 activeElement가 BODY일 때만 돌려준다. 코드는 짧지만 화면 낭독기에는 포커스 이동이 0.5초 늦게 알려진다.

  ```js
  // proto_R3_toast.js — 50-toast.js 현재본 대비 추가분(검증본)
  let guardRect = null, guardUntil = 0, keyGuardUntil = 0;
  function onGuardPointer(e) {
    if (Date.now() > guardUntil || !guardRect) return;
    if (el && el.contains(e.target)) return;            // 토스트가 받는 건 A2(pointer-events)에 맡김
    if (e.clientX >= guardRect.left && e.clientX <= guardRect.right &&
        e.clientY >= guardRect.top && e.clientY <= guardRect.bottom) { e.preventDefault(); e.stopPropagation(); }
  }
  function onGuardKey(e) {
    if (Date.now() > keyGuardUntil) return;
    if ((e.key === 'Enter' || e.key === ' ') && !(el && el.contains(e.target))) { e.preventDefault(); e.stopPropagation(); }
  }
  ['pointerdown','pointerup','mousedown','mouseup','click','dblclick'].forEach((t) => window.addEventListener(t, onGuardPointer, true));
  window.addEventListener('keydown', onGuardKey, true);
  // absorbClicks() 맨 앞:
  guardRect = el.getBoundingClientRect(); guardUntil = Date.now() + CLICK_ABSORB_MS;
  // releaseFocus()의 back.focus(...) 직후:
  if (document.activeElement === back) keyGuardUntil = Date.now() + CLICK_ABSORB_MS;
  ```

### [정보] INFO-1(P11) — 변경 없음
addedAt 동률 묶음 안에서 줄 자리가 바뀐다(저장 중 `1,3,4,2` → 해제됨 `2,1,3,4` → 복원 `1,3,4,2`). 외관만 바뀌는 문제다.

### [정보] INFO-4(신규) — 토스트가 사라진 뒤에도 live 영역에 마지막 문구가 남음
- 증거: S4 숨김 뒤 status 자식이 `두번째`다. 실제 확장 E7도 같다.
- 영향: 화면 낭독기 가상 커서로 페이지 끝을 읽으면 지난 안내("○○ 님을 차단했습니다")가 남아 있다. 새 알림에는 영향이 없다.
- 제안(선택): `hideNow` 뒤 충분히 지나서 `liveEl.textContent = ''`로 비운다. 비우는 변경은 기본 `aria-relevant`(additions text)에서 읽히지 않는다.

### [정보] INFO-5 — 실제 낭독기 알림은 미검증
접근성 트리 구조(지속 노드, polite, 문구 1회, `'' → 문구`)까지만 확인했다. CDP `nodesUpdated` 이벤트는 0건이었고, VoiceOver/NVDA 실제 낭독은 확인하지 못했다.

### [정보] INFO-6(신규) — 후속 토스트가 없을 때, 키보드로 실행 취소한 뒤 0.5초 동안 Tab이 흐려진 버튼에 다시 들어감
- 증거: S3에서 후속 토스트 없이 Enter를 누른 뒤 Tab을 누르면 `fmkb-toast-action`에 닿는다(visibility 지연 0.5초).
- 실제 99-main 흐름은 항상 후속 토스트(성공 또는 오류)를 띄우고, 그때 버튼이 `[hidden]`이라 Tab이 닿지 않는다(S3 a3 PASS).
- 후속 토스트가 없는 유일한 경로는 "저장 중 반대 동작이 이긴" 경우로, 매우 드물다. 다시 누르면 `action=null`이라 아무 일도 없다.

### [정보] INFO-7(신규) — 링크에 포커스가 있을 때 마우스로 더블클릭하면 포커스가 BODY로 감
- 첫 클릭 뒤 포커스는 원래 링크로 돌아간다.
- 두 번째 mousedown은 포커스를 못 받는 흡수 토스트에 떨어지고, 브라우저 기본 동작으로 blur된다.
- 링크 실행이나 페이지 클릭은 없다(S3d). 수정이 필요 없다.

### [정보] MINOR-7 — 변경 없음(직전 리포트 참고)

---

## 미검증(통과 처리하지 않음)
- 실제 화면 낭독기(VoiceOver/NVDA/TalkBack) 낭독: INFO-5, 팝업 `#fmkb-live` 포함.
- 실기기 터치(Firefox Android)
  - MINOR-2R2 터치 경로는 `pointer:coarse` CSS를 강제하고 마우스 클릭으로 재현했다. 실제 터치 탭의 이벤트 순서(touch → pointer → 호환 mouse → click)에서도 같은지는 재지 않았다.
  - A2 흡수는 hit-testing 기반이라 이벤트 종류와 무관하다. rect 가드(수정안)는 pointer·mouse·click을 막는다. 사이트가 `touchstart/touchend`만으로 이동시키는 요소는 수정안의 rect 가드 밖이다.
- 실 Chrome **툴바 팝업**(탭이 아닌 실제 팝업 창)의 포커스 동작. 이번에도 탭으로 연 같은 페이지에서 검증했다.
- Firefox 실제 확장(설치형) 경로는 리더의 Selenium 31/31·30/30·5/5에 의존한다. 이번 `t_ff3.js`는 같은 CSS와 50-toast.js를 페이지에 직접 올린 검증이다.
- 사이트 CSS가 `button{display:…!important}`로 `[hidden]` 방어를 무력화하는지. 외부 CSS 번들은 대조하지 않았다.
- 샤딩 경계(8KB/100KB/stale/bl_meta). 저장 계층 diff가 없어 이번 범위에서 뺐다.

---

## 최종 델타 재확인 (MINOR-2R2·MINOR-9·리뷰 N11 반영분, 실 Chrome)

- 대상: `git diff main -- src/content.css src/content/50-toast.js`
  - `#fmkb-toast.fmkb-toast-absorb::after`(흡수 영역을 위아래 16px·좌우 48px 넓힘)
  - `guardKeys(back)`(포커스를 돌려준 요소에만 500ms 동안 capture keydown으로 Enter·Space 차단)
  - `id="fmkb-toast-msg"`와 `aria-describedby`
- 소스는 고치지 않았다.
- 스크립트
  - 재실행: `t_chrome3.js`, `t_ext3.js`, `t_chrome_toast`·`t_chrome_tab`·`t_chrome_fix`, jsdom 4종
  - 신규 델타: `t_chrome4.js`, `t_ext4.js`
  - 출력: `out_chrome3_delta.txt`, `out_ext3_delta.txt`, `out_chrome4.txt`

### 판정: MINOR-2R2·MINOR-9 해소, N11 확인, 회귀 없음

| 묶음 | 실행 | PASS | FAIL | 비고 |
|------|-----:|-----:|-----:|------|
| `t_chrome3.js` 재실행 | 40 | 40 | 0 | 직전 FAIL이던 S1e(가장자리 0/48)와 S3b(Enter 두 번 0/4) 해소 |
| `t_ext3.js` 재실행(실제 확장) | 25 | 25 | 0 | 직전 FAIL이던 E6 double 해소 |
| `t_chrome4.js` 델타(신규) | 18 | 18 | 0 | 아래 D1~D6 |
| `t_ext4.js` 델타(실제 확장, 신규) | 6 | 6 | 0 | 아래 X1~X3 |
| 실 Chrome 기존 3종 | 11 | 11 | 0 | |
| jsdom: `t_toast` / `t_content` / `t_popup` / `t_popup2` | 66 / 46 / 61 / 63 | 66 / 46 / 60 / 63 | 0 / 0 / 1 / 0 | `t_popup` FAIL 1건은 P11(정보), 직전과 같음 |
| **합계** | **336** | **335** | **1** | 정보 1건(P11)만 남음 |

### 확인 내용

**버튼 오른쪽 끝 더블클릭(D1, 120회)**
- 조건
  - 화면: 데스크톱·터치
  - 경로: 차단 → 실행 취소, 메뉴 해제 → 실행 취소
  - 결과 토스트 지연: 10/120/300ms(늦게 뜨는 경우 포함)
  - 클릭 간격: 60/150ms
  - 클릭 지점: 버튼 폭 90% 지점의 위 10%·가운데·아래 90%, 그리고 오른쪽 끝 1~2px의 위·아래 끝. 버튼·토스트 둥근 모서리는 원래 클릭이 안 되므로, 버튼에 실제로 닿는 지점까지 안쪽으로 옮겼다.
- 결과
  - 누수 0/120, 실행은 매번 1회.
  - 두 번째 클릭이 토스트 상자 밖에 떨어진 68회는 모두 `::after` 덕분에 hit 대상이 `#fmkb-toast`였다. 원인은 둘이다.
    - 결과 토스트가 좁다.
    - 숨김 전환 중 토스트가 translateY로 12px 내려가 버튼 위쪽 끝이 상자 밖으로 나간다.
  - 두 번째 클릭 때 결과 토스트가 아직 뜨지 않은 60회도 누수 0이다.
- 실제 확장 X1(실제 저장, 실제 결과 토스트, 버튼 폭 90% 지점의 위·가운데·아래와 오른쪽 끝 2px, 간격 60/150ms): 누수 0/8, 실행 취소 8/8.

**흡수 창 이후(D2)**: 약 650ms 뒤에는 버튼 오른쪽 끝 클릭도, `::after` 확장 구역(결과 토스트 오른쪽 30px) 클릭도 페이지에 닿는다(데스크톱·터치). 일반·오류 토스트 통과도 회귀 없다(`t_chrome3` S2).

**키보드(D3, X2)**
- 원래 요소가 링크일 때: Enter 두 번(바로, 30ms, 300ms 간격) 모두 실행 0/3. 0.6초 뒤 Enter는 정상 실행.
- 원래 요소가 버튼일 때
  - Enter→Enter, Space→Space, Enter→Space 모두 실행 0.
  - 0.6초 뒤 Space와 Enter는 정상 실행.
- 차단은 돌려받은 요소에만 걸린다. 0.5초 안에 Shift+Tab으로 l1에 가서 Enter를 누르면 l1이 정상 실행된다.
- 실제 확장 X2: Enter 두 번이면 `#under` 실행 0, 0.6초 뒤 Enter는 1회.

**마우스 경로(D4)**
- 입력창에서 누르면 포커스가 입력창으로 돌아가고, 곧바로 친 글자 "ab"도 정상 입력된다.
- BODY에서 누르면 BODY로 간다.
- `t_chrome3` S3d 회귀 없음.

**N11(D5, X3)**
- `aria-describedby="fmkb-toast-msg"`가 유일한 `.fmkb-toast-msg`를 가리킨다.
- 실 Chrome 접근성 트리에서 버튼 이름은 "실행 취소", 설명은 메시지다(예: "홍길동 님을 차단했습니다"). 메시지 요소가 aria-hidden이어도 설명은 잡힌다.
- 메시지가 바뀌면 설명도 따라 바뀐다("김철수 님을 차단 해제했습니다").
- 본문 텍스트 노출은 여전히 1회다(live 영역만).
- 실제 확장 X3: 설명 "댓글러 님을 차단했습니다".

**레이아웃(D6)**: 360px 화면, 긴 닉네임 기준. 흡수 중 `::after`는 absolute이고, 토스트 크기(180×87)와 문서 가로 넘침(scrollWidth 360 = clientWidth)이 변하지 않는다. 0.5초 뒤 `::after`는 사라진다.

### 남은 정보 항목(수정 필요 없음, 참고)
- INFO-8(신규): 마우스로 실행 취소한 직후 0.5초 안에 입력창에서 Space를 치면 삼켜진다(D4: "x y" → "xy"). 키 차단이 키보드로 누른 경우뿐 아니라, Chrome의 마우스 경로(mousedown 때 버튼에 포커스)에도 걸리기 때문이다. 글자는 영향이 없다.
  - 클릭 후 0.5초 안에 Space를 칠 일은 드물다.
  - 원하면 클릭 이벤트의 `e.detail === 0`(키보드로 누름)일 때만 `guardKeys`를 건다.
- INFO-9(신규): 흡수 창(0.5초) 안에 새 실행 취소 토스트가 뜨면, 그 버튼 위를 `::after`가 덮어 창이 끝날 때까지 눌리지 않는다(D7: 창 안 0회, 창 뒤 1회). 실행 취소 직후 0.5초 안에 다른 작성자를 차단해야 생기는 일이라 사실상 일어나지 않는다.
- 흡수 중 확장 구역(토스트 바깥 좌우 48px·위아래 16px)의 페이지 클릭도 0.5초 동안 흡수된다. 의도된 범위다.
- INFO-1(P11)·INFO-4·INFO-5·INFO-6·INFO-7·MINOR-7: 변경 없음.

### 미검증(변경 없음)
- 실제 화면 낭독기 낭독: describedby 낭독 포함.
- Firefox Android 실기기 터치: `::after`는 hit-testing 기반이라 이벤트 종류와 무관할 것으로 보이지만, 실기기 탭은 재지 않았다.
- 실 Chrome 툴바 팝업 창.
- 사이트 CSS의 `[hidden]` 무력화.
- 샤딩 경계.
