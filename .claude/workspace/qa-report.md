# QA 보고서 — UI/UX 2차 묶음 재검증(수정 루프 1)

- 담당: extension-qa (직접 모드, 리더에게만 보고, 소스는 고치지 않음)
- 갱신: 2026-10-06 · 브랜치 `feat/dark-mode-a11y`(작업 트리, 미커밋) · 직전 2차 보고서를 이 내용으로 교체
- 대상(`git diff main`): `src/popup/popup.{js,css}`, `src/content/40-contextmenu.js`, `src/content.css`, 문서(README·PLAN·TODO·agents)
  - `10-store.js`·`20-selectors.js`·`popup.html`·`manifest.json`은 main과 같다(store 계약 무변경, manifest 0.9.0 = main)
- 방법(직전과 같은 하네스 + 새 경로용 테스트)
  - jsdom: 실제 `10-store.js` + 모의 `chrome.storage.sync`(읽기 지연·장애 주입·쓰기 붙잡기) 위의 실제 popup.js·content 00~99
  - **실제 확장**: Chrome for Testing 149 `--load-extension`(고정 ID), 실제 content script·`chrome.storage.sync`, 실제 키(CDP `Input.dispatchKeyEvent`)·실제 마우스, 합성 fmkorea 페이지 + **라이브 fmkorea HTML(실제 사이트 CSS 로드, `night_mode.css` 포함)**
  - 실 Firefox 156(puppeteer-core, WebDriver BiDi): 메뉴 모듈 주입 + 실제 키·마우스
  - 라이브 fmkorea curl(PC 목록·게시글, 모바일 목록·게시글, `night_mode=Y` 쿠키 PC·모바일)
- 스크립트: `/private/tmp/claude-501/-Users-raynor-vscode-workspace-fmk-blind/0bfd71b8-e788-404e-92a5-dcba222fefbd/scratchpad/qa2/`
  - 신규: `t_popup4.js`(listReady 경계·K/N), `t_content4.js`(닫기 경로별 포커스·키 가드), `t_ext_r2.js`(실제 확장: 키 가드·바깥 클릭·PageUp/Down·휠·night_mode 조합·라이브 HTML), `t_ext_popup_lr.js`(실제 확장 팝업: 로딩·재시도 중 실제 키 입력), `t_ff_r2.js`(실 Firefox), `t_forced.js`·`t_space_keyup.js`(탐침)
  - 결과: `r2/out_*.txt`

## 판정 요약

**blocker 0 · major 0 · minor 0 (신규 결함 없음) · 정보 5 · 문서 2**

- 직전 MAJOR-1, MINOR-1·2·4는 모두 해소됐다. INFO-1·INFO-4, DOC-1·DOC-2도 반영을 확인했다.
- MINOR-3은 의도적으로 미반영했고 README에 안내했다(수용). 아래 INFO-B에 판단 근거를 하나 보탠다.
- 새 코드 경로(listReady 경계, 닫기 경로별 포커스 복귀, 키 가드, PageUp/Down, night_mode)는 jsdom·실 Chrome(실제 확장)·실 Firefox에서 모두 의도대로 동작한다.
- 1차 회귀(실행 취소 토스트 흡수·토스트 키 가드 등)도 그대로 통과한다.
- Phase 6 몫: manifest 버전이 0.9.0 = main이라 범프가 필요하다. CLAUDE.md 변경 이력도 남아 있다.

| 묶음 | 실행 | PASS | 비PASS | 비고 |
|------|-----:|-----:|------:|------|
| 팝업 jsdom 2차 (`t_popup3`) | 97 | **97** | 0 | 직전 91/97. R7×3·R8(MAJOR-1)·C4·C5(MINOR-4) 통과 |
| 팝업 jsdom 신규 (`t_popup4`) | 35 | 34 | 1 | LR9 = INFO-A(이론상 경로) |
| content jsdom 2차 (`t_content3`) | 14 | 13 | 1 | J2 "PageDown 미처리" 탐침이 수정 의도대로 뒤집힘 |
| content jsdom 신규 (`t_content4`) | 27 | **27** | 0 | 닫기 경로별 포커스·키 가드·PageUp/Down |
| **실제 확장 팝업** (`t_ext_popup`) | 25 | **25** | 0 | 직전 22/25. RP6(MAJOR-1)·다크 placeholder(MINOR-1)·라이트 hover(INFO-1) 통과 |
| **실제 확장 팝업 신규** (`t_ext_popup_lr`) | 8 | **8** | 0 | 로딩·재시도 중 실제 키 입력, 재시도 뒤 onChange |
| **실제 확장 메뉴** (`t_ext_menu`) | 44 | 40 | 4 | M6b = MINOR-3(수용) · M8 스크롤·CT 다크 배경×2 = 수정 의도대로 바뀐 옛 단정 |
| **실제 메뉴 키** (`t_ext_menu2`) | 10 | **10** | 0 | 직전 9/10. K4(PageDown) 통과 |
| 메뉴 경계 (`t_ext_menu3`) | 5 | **5** | 0 | 직전 2/5. E1(MINOR-2)·E2·E3(INFO-4) 통과 |
| **실제 확장 신규** (`t_ext_r2`) | 48 | **48** | 0 | 키 가드·바깥 클릭·PageUp/Down·휠·창 blur·night_mode 4조합·라이브 HTML 3종 |
| 실 Firefox 156 메뉴 (`t_ff_menu`) | 7 | 5 | 2 | 직전과 같음: FFM1 = mac Shift+F10(정보), FFM2 마지막 = 테스트 가정(직전 INFO-6) |
| 실 Firefox 마우스 강조 (`t_ff_menu_fv`) | 6 | **6** | 0 | |
| **실 Firefox 신규** (`t_ff_r2`) | 14 | **14** | 0 | 바깥 클릭·키 가드·PageUp/Down·휠·night_mode |
| 1차 회귀 jsdom (`t_popup` 61·`t_popup2` 63 blur판, `t_content` 46, `t_toast` 66) | 236 | 235 | 1 | P11 = 기존 정보 |
| 1차 회귀 실 Chrome (`t_ext3` 25, `t_chrome3` 40, `t_chrome_toast` 7, `t_chrome_tab` 1) | 73 | **73** | 0 | |
| 셀렉터 라이브 | 4 | **4** | 0 | 모두 HTTP 200 |
| **합계** | **653** | **644** | **9** | **결함 0**. 수정 의도대로 바뀐 옛 단정 4(J2·M8·CT×2), 수용 1(M6b), 정보 3(LR9·P11·FFM1), 테스트 가정 1(FFM2) |

- 1차 jsdom 원본(`t_popup`·`t_popup2`)을 그대로 돌리면 P3·P4·N7이 비PASS다. 직전 INFO-7(jsdom `click()`이 버튼에 포커스를 주지 않음)과 같은 원인이고, blur판과 실 Chrome E3·E8은 통과한다.
- 리더의 실 Firefox Selenium 결과(팝업 17/17 + 다크·터치 6/6, 라이브 메뉴 30/30, 1차 회귀 30/30·35/35·5/5)는 이 표에 넣지 않았다. 범위가 겹치는 항목은 위 실 Firefox 신규(`t_ff_r2`)에서 따로 재현해 일치한다.

---

## 직전 이슈별 해소 표

| ID | 직전 판정 | 이번 결과 | 증거 |
|----|----------|----------|------|
| **MAJOR-1** 로딩·실패 중 검색이 화면을 빈 목록으로 덮음 | major | **해소** | jsdom R7·R8, LR1~LR8. 실제 확장 RP6, LRX1·LRX2. 로딩·오류·재시도 중 입력해도 화면과 `총 –명`이 유지되고, 성공 뒤 마지막 검색어가 적용된다 |
| **MINOR-1** 다크 placeholder 3.56:1 | minor | **해소** | 실 Chrome: 다크 `#a1a1aa`/`#1f1f23` **6.41**, 라이트 `#6b7280`/흰색 **4.83** |
| **MINOR-2** 메뉴 안 포커스가 닫힐 때 BODY로 떨어짐 | minor | **해소** | 실제 확장 K4·E1·M8·PG1·WH1·BL1, 실 Firefox FR4, jsdom F1~F9 |
| **MINOR-3** 키보드 차단 뒤 실행 취소에 닿기 어려움 | minor | **수용(미반영 + README 안내)** | README:29 "키보드로 차단을 되돌릴 땐 팝업에서 해제". M6b는 여전히 비PASS(의도). 근거 보강은 INFO-B |
| **MINOR-4** 해제 저장 중 K > N | minor | **해소** | jsdom C4·C5·M4a·M4b. 저장 중 `총 5명`, 끝나면 `총 4명`. 실패로 되돌려도 K > N 문구가 한 번도 나오지 않는다 |
| INFO-1 라이트 hover 위 작은 글자 4.39:1 | 정보 | **해소** | `#f8f9fa`: muted 4.59, 위험색 4.58, 강조 4.90(실 Chrome) |
| INFO-4 메뉴에서 Enter 연타 시 돌아간 앵커 실행 | 정보 | **해소** | 실제 확장 E2(0·30·100ms)·E3, KG1(100·450ms 막힘, 650ms 정상). 실 Firefox FR3 |
| INFO-2·3·5·6·7 | 정보 | 변화 없음 | 코드 경로가 그대로다 |
| DOC-1 "메뉴 키(또는 Shift+F10)" | 문서 | **해소** | README:29, PLAN:11, TODO:14, 40-contextmenu.js:4 |
| DOC-2 README 자동 포커스 예외 | 문서 | **대부분 해소** | README:32에 터치 제외가 들어갔다. 남은 사소한 점은 DOC-A |

---

## 새 코드 경로 검증

### 1. listReady 경계 (popup.js)
| 경우 | 결과 |
|------|------|
| 로딩(150ms 넘음) 중 입력 → 지움 → 로드 | 로딩 유지, empty·noresult가 한 번도 뜨지 않음, 로드 뒤 5줄·`총 5명` (LR1) |
| 실패할 첫 로드 중 입력 → 오류 → 오류 중 입력 | 오류 + [다시 시도] 유지, `총 –명` (LR2) |
| [다시 시도] 로딩 중 입력 → 성공 | 로딩 유지, 성공 뒤 **마지막 검색어** 적용(`검색 1명 / 총 5명`, 강조 표시), 이후 입력도 정상 렌더 (LR2) |
| 재시도 중 입력 → 재실패 | 오류 + 새 버튼, `총 –명`, 목록 줄 없음 (LR3) |
| 로딩 중 무결과 검색어 | 로드 뒤 noresult + `검색 0명 / 총 5명` (LR4) |
| 로드 완료가 디바운스(60ms) 발화보다 먼저 | 최종 필터 정확 (LR5) |
| 실제 빈 목록 + 로딩 중 입력 | 로드 뒤 empty + `검색 0명 / 총 0명`(정상 빈 목록) (LR6) |
| CONTEXT_INVALIDATED + 입력 | 다시 열기 안내 유지, 버튼 없음 (LR7) |
| onChange | 오류 상태에선 구독 0이라 외부 변경이 오류 화면을 덮지 않는다. 재시도 성공 뒤 1회 구독. 검색 중 외부 일치 차단·해제·불일치 차단의 K/N이 모두 맞다 (LR8) |
| 실제 확장 + 실제 키 | 로딩 중 '비' → 로딩 유지 → `검색 1명 / 총 4명`(LRX1). 실패 → 입력 → Tab으로 [다시 시도] → Enter → 재시도 중 '씨' → `검색 1명 / 총 4명`, 검색창 포커스. 이어 외부 추가 시 `검색 2명 / 총 5명`(LRX2) |

### 2. closeMenu 포커스 복귀 (40-contextmenu.js)
- 돌려주는 경우: 스크롤(휠·PageDown 경로), 창 blur(다른 탭을 앞으로), 앵커 밖 contextmenu(메뉴 키 재입력), Esc, Tab, 항목 선택. 모두 열기 전 자리로 돌아간다.
  - 휠로 닫힌 뒤 Tab은 `c1reply`로 이어진다(Chrome WH1·Firefox FR4).
- **바깥 클릭은 포커스를 빼앗지 않는다.**
  - textarea(실제 입력 `abc`·`xyz`가 textarea에 들어감), input, 사이트 버튼은 그대로 포커스를 받는다.
  - 빈 영역 클릭은 BODY로 남는다. 앵커로 되돌리지 않는다(Chrome OC1·OC2, Firefox FR1).
- BODY 상태에서 연 메뉴(돌려줄 대상 없음)는 닫혀도 BODY다(F8, M8 첫 단정).
- 다른 앵커를 우클릭해 다시 열면 Chrome·Firefox 모두 우클릭이 그 앵커에 포커스를 준다. 그래서 Esc는 새 앵커(`a333`)로 간다(FR2).
  - jsdom에서 포커스를 옮기지 않는 우클릭을 흉내 내면 옛 앵커로 간다(G6 탐침). 실제 브라우저에선 생기지 않는다.

### 3. 키 가드 (Enter·Space로 고른 경우만)
- 실 Chrome·실제 확장(a444는 숨겨지지 않는 위치)
  - 키보드 선택 뒤 두 번째 Enter: 100ms·450ms에선 사이트 회원 메뉴가 열리지 않는다. **650ms에선 정상 동작**한다(KG1).
  - Space로 고르면, 100ms 안의 Space는 페이지를 스크롤하지 않고 Enter도 막힌다. 500ms 뒤 Space는 정상 스크롤한다(KG2).
  - 마우스로 연 메뉴라도 Enter로 고르면 가드가 걸린다(KG4).
- **마우스로 고르면 가드가 걸리지 않는다.** 100ms 뒤 Enter로 사이트 메뉴가 열린다(KG3). 실 Firefox도 같다(FR3).
- 가드는 Enter·Space만 막는다. 화살표 등은 그대로이고(jsdom G1), 플래그는 다음 마우스 선택에 남지 않는다(G4).

### 4. PageUp/PageDown, night_mode
- PageUp/PageDown
  - 메뉴가 열린 동안은 무시된다(메뉴 유지, 스크롤 0, 포커스 유지). Esc로 닫으면 앵커로 돌아간다.
  - 닫은 뒤 PageDown은 정상 스크롤한다(Chrome PG1, Firefox FR4, jsdom F9).
- **라이브 확인**
  - `night_mode=Y` 쿠키로 받으면 PC는 `<body class="mac_os night_mode night_mode_pc">`, 모바일은 `<body class="night_mode nplbya_lc2">`다. 둘 다 `body.night_mode` 규칙에 맞는다.
  - 사이트 `night_mode.css`에는 우리 메뉴(id 지정 div)·토스트를 덮는 넓은 규칙(`.night_mode *`·`div`·`button` 전역)이 없다.
- 실 Chrome 조합(합성 페이지): 메뉴 배경, 토스트 배경, 최저 대비

  | 시스템 | 사이트 night_mode | 메뉴 배경 | 토스트 배경 | 최저 대비 |
  |--------|------|------|------|------|
  | 라이트 | 없음 | 흰색 | 기본 `rgba(20,20,20,.92)` | 4.83(hover/포커스 흰 글자/`#dc2626`) |
  | 라이트 | 있음(배경 `#121212`) | `#232327` | `rgba(63,63,70,.97)` | 4.83 · 실행 취소 5.92 · 오류 토스트 6.82 |
  | 다크 | 없음 | `#232327` | 같음 | 4.83 · 실행 취소 5.29 |
  | 다크 | 있음 | `#232327` | 같음 | 4.83 · 실행 취소 5.92 |

  - 메뉴 글자 `#ececf1`/`#232327` = 13.3:1. 포커스 빨강과 메뉴 배경의 경계 대비는 3.24:1(≥3, 비텍스트 기준 충족)이다. 오류 토스트는 모든 조합에서 빨강을 유지한다.
- **라이브 fmkorea HTML + 실제 사이트 CSS**(목록 페이지, 실제 앵커를 우클릭)
  - night HTML + 라이트 시스템: 메뉴 `#232327`, 토스트 어두운 회색, 전 항목 4.5 이상
  - day HTML + 다크 시스템: 같은 결과
  - day HTML + 라이트 시스템: 흰 메뉴·기본 토스트(회귀 없음)
- 실 Firefox: `body.night_mode`(라이트 시스템)에서 메뉴 배경 `#232327`(FR5).

### 5. 회귀·정합
- store 계약: 무변경. popup은 `load/list/count/isBlocked/unblock/onChange/importMany/block`(폴백)만, content는 기존 그대로만 호출한다.
- manifest: 무변경(`storage`만, www·m. 매치, 참조 파일 실재). 버전 범프는 Phase 6 몫이다.
- 셀렉터 라이브(오늘 새로 받음, 실제 `20-selectors.js`)
  - PC 목록: UID 앵커 23 → TR 23
  - PC 게시글: 67 → `.rd` 1·댓글 39·TR 27
  - 모바일 목록: NICK_ROW 24(닉 23)
  - 모바일 게시글: 40 → `.rd` 1·댓글 39(글 아래 목록 NICK_ROW 27)
  - 모든 UID 앵커에 href가 있어 Tab으로 닿는다.
- 1차 회귀: 실행 취소 토스트 클릭 흡수·키 가드·자동 숨김 뒤 Tab 제외·되돌리기 줄이 jsdom 235/236, 실 Chrome 73/73으로 그대로 통과한다.

---

## 발견 사항(신규)

결함으로 분류할 신규 발견은 없다. 아래는 정보·문서 항목이다.

### [정보] INFO-A — 목록 읽은 뒤 `refresh()`가 `showFatal()`로 가면 listReady가 다시 true가 되지 않음(이론상 경로)
- 위치: `src/popup/popup.js:711-719`(refresh가 `store.list()` 예외 때 `showFatal()` → `listReady=false`), `:808-811`(listReady를 true로 두는 곳은 load 성공 콜백뿐)
- 증거(jsdom LR9, `store.list`가 한 번 예외를 던지게 주입)
  - 외부 변경 → 오류 화면 → 다음 외부 변경의 refresh가 목록 7줄을 다시 그린다.
  - 그러나 '에'를 입력해도 필터되지 않는다(7줄, `총 7명`). 가져오기·내보내기 버튼도 비활성으로 남는다(이건 main부터 그랬다).
- 영향: 사실상 없다. `store.list()`는 메모리 Map 순회라(`10-store.js:768-775`) 예외를 던질 길이 없다.
- 수정안(선택): `refresh()`가 `list()`에 성공하면 `listReady = true`로 둔다. 또는 그대로 둔다.

### [정보] INFO-B — MINOR-3 미반영 근거("Space keyup이 실행 취소 버튼을 누름")는 단발 입력에서 재현되지 않음
- 증거(`t_space_keyup.js`): 항목의 keydown(Space·Enter)에서 preventDefault하고 버튼으로 포커스를 옮겼다. 그 뒤 keyup이 와도 Chrome 149·Firefox 156 모두 버튼 click이 0회다.
- 실제 위험은 **키 자동 반복이나 두 번째 Enter**다. Enter keydown이 새로 포커스된 버튼을 바로 누른다.
  - 다시 검토한다면 50-toast의 `guardKeys`와 같은 0.5초 가드를 실행 취소 버튼에도 걸면 막힌다.
- 현재 결정(README 안내로 대체)을 뒤집을 사유는 아니다. 판단은 리더 몫이다.

### [정보] INFO-C — forced-colors에서 메뉴 항목 투명 외곽선이 포커스와 무관하게 늘 보임
- 위치: `src/content.css:34-36`. `outline: 2px solid transparent`가 `:focus-visible`이 아닌 기본 규칙에 있다.
- 증거(실 Chrome, `forced-colors: active` 에뮬레이션, `t_forced.js`)
  - 키보드로 열면 외곽선 `rgba(0,230,255,.8)`이다.
  - 마우스로 연 비포커스 상태도 외곽선 흰색 2px가 보인다. 두 상태는 색으로 구분되긴 한다.
- 영향: 메뉴 항목이 늘 1개라 실영향은 없다. 항목이 늘어나면 관용 패턴(투명 외곽선을 `:focus-visible` 규칙에만)으로 옮기는 편이 맞다.

### [정보] INFO-D — 라이트 hover 줄 배경 `#f8f9fa`는 흰 배경과 1.05:1이라 hover 표시가 아주 옅음
- hover 표시는 WCAG 요구 사항이 아니다(직전 `#f3f4f6`도 1.1:1). 가져오기·내보내기 버튼 hover는 테두리가 강조색으로 바뀌어 잘 보인다.
- 줄 hover만 옅어졌다. 디자인 판단 사항이다.

### [정보] INFO-E — content.css 주석의 토스트 대비 수치는 근사치
- 위치: `src/content.css:48-49` "흰 글자 10.4:1, 실행 취소 5.8:1"
- 실측: 페이지 배경에 따라 흰 글자 9.55~10.76, 실행 취소 5.29~5.97이다. 모두 4.5 이상이라 문제는 아니다. 메뉴 글자 "13:1"의 실측은 13.3, 경계 "3.2:1"의 실측은 3.24다.

## 문서
- **DOC-A** README:32 자동 포커스 예외에 "가져오기 탭 보기(가져오기 버튼이 포커스)"가 빠져 있다. PLAN·TODO·popup-engineer에는 있다. 사용자 문서라 생략해도 무방하다.
- **DOC-B**(직전 DOC-2의 사소한 점, 그대로) `.claude/skills/chrome-mv3-extension/SKILL.md:67`의 `content.css` 주석에 다크 모드·night_mode가 없다.
- 그 밖(Phase 6 몫): manifest 버전 범프(0.9.0 = main), CLAUDE.md 변경 이력.

## 미검증(통과로 두지 않음)
- 툴바에서 연 실제 action 팝업 창의 초기 포커스. 탭으로 연 popup.html로만 확인했다.
- Windows/Linux의 Shift+F10, Firefox 메뉴 키(BiDi가 키를 표현하지 못함), VoiceOver·NVDA의 role=menu·aria-live 실제 낭독
- 실제 OS 고대비 모드. forced-colors는 CDP 에뮬레이션으로만 확인했다.
- 키 자동 반복(길게 누름) 상태의 키 가드. CDP·BiDi 단발 입력으로만 확인했다.
- Firefox 팝업 다크 모드·자동 포커스·로딩/재시도는 리더의 실 Firefox 검증 범위라 이 보고서에선 재현하지 않았다. Firefox placeholder 대비도 실측하지 않았다.
- Firefox Android 길게 누르기 → 항목 포커스. 실기기 게이트다.
- 라이브 fmkorea 게시글 페이지의 night_mode 색. 목록 페이지 HTML + 사이트 CSS로만 확인했다(메뉴·토스트 규칙은 페이지 종류와 무관).

---

## 최종 델타 재확인 (마지막 nit 묶음, 실 Chrome)

- 대상: `git diff main -- src/popup/popup.css src/content.css src/content/40-contextmenu.js`
  1. 라이트 hover `#f3f4f6`로 복귀, `--fmkb-muted` `#636974`, `--fmkb-danger` `#c81e1e`. `--fmkb-danger-fill`은 `#dc2626` 그대로다.
  2. 메뉴 항목 기본 `outline:none`, 투명 외곽선은 `:focus-visible`에만 둔다.
  3. `closeMenu(guard)`가 입력칸(INPUT·TEXTAREA·SELECT·contenteditable)으로 돌아갈 때는 키 가드를 걸지 않는다(`isTextInput`).
  4. 주석, 스킬(DOC-B), TODO(N4)를 정정했다.
- 환경 메모
  - 실행 도중 디스플레이가 잠들어 vsync가 멈추자, headless Chrome의 마우스 입력(`Input.dispatchMouseEvent`)이 시간 초과로 멈췄다. 아주 단순한 페이지에서도 재현됐다.
  - 그래서 모든 Chrome 실행에 `--disable-gpu-vsync --disable-frame-rate-limit`를 붙여 다시 돌렸다(`scratchpad/qa2/preload_flags.js`, `NODE_OPTIONS=--require`). 프레임 타이밍만 바꾸는 플래그라 검증 내용에는 영향이 없다.
  - 결과: `scratchpad/qa2/r3/out_*.txt`

### 결과
| 확인 항목 | 결과 | 근거 |
|----------|------|------|
| 라이트 팝업 글자 대비 ≥ 4.5:1(일반·hover 줄 회색 메타, 해제 버튼, 줄 오류, io 오류, 상태 오류 포함) | **PASS** | `t_ext_popup` CT 라이트(아래 표) |
| 다크 팝업 무변화 | **PASS** | 다크 측정 32줄이 직전 실행과 한 글자도 다르지 않다(`diff`) |
| forced-colors: 포커스 없는 항목은 외곽선 없음, 포커스된 항목만 보임 | **PASS** | `t_forced2` 7/7 |
| 키 가드: 링크로 돌아가면 걸림 | **PASS** | `t_ext_r2` KG1~KG4, `t_ext_menu3` E2·E3, `t_ext_r3` TI4 |
| 키 가드: 입력칸으로 돌아가면 걸리지 않음 | **PASS** | `t_ext_r3` TI1~TI3 |

- **라이트 대비**(실 Chrome, 알파 합성)

  | 대상 | 흰 배경 | hover 줄 `#f3f4f6` |
  |------|------|------|
  | 회색 `#636974`(메타·인원수·placeholder·상태 문구·해제됨 닉) | 5.52 | 5.02 |
  | 빨강 `#c81e1e`(해제 버튼·줄 오류·io 오류·상태 오류) | 5.74 | 5.21 |
  | 해제 hover 흰 글자/`#dc2626` | 4.83 | |
  | 강조 `#1a1a1a`/`#fde68a` | | 13.98 |

  - 최저는 파랑 `#2563eb`/`#f3f4f6`의 4.70(되돌리기 버튼 hover 줄, io 버튼 hover)이다. 측정한 32개 항목 모두 4.5 이상이다.
- **forced-colors**(CDP `forced-colors: active`)
  - 키보드로 연 항목(`:focus-visible`): 외곽선 실선 2px, offset -2px, 강제 색 표시
  - 마우스로 연 항목(포커스는 있으나 `:focus-visible` 아님): `outline-style: none`
  - 마우스로 연 뒤 ↓: 외곽선 표시
  - 일반 모드: `:focus-visible` 외곽선이 투명(보이지 않음)이고, 마우스로 연 항목은 `none`
- **입력칸 복귀 경로**
  - Chrome의 실제 우클릭은 링크에 먼저 포커스를 줘서 이 경로가 생기지 않는다. 그래서 입력칸에 포커스를 둔 채 앵커에 contextmenu를 합성으로 보냈다. 항목 선택과 이후 키는 실제 CDP 키다.
  - INPUT: 포커스가 돌아온다. 500ms 안에 친 `a b`(Space 포함)가 그대로 들어가고, Enter가 document까지 가서 폼이 1회 제출된다.
  - TEXTAREA·contenteditable: 포커스가 돌아오고 `x y`·줄바꿈·`z`가 입력된다.
  - SELECT: 포커스가 돌아온다. 합성 Enter·Space keydown이 막히지 않고 document까지 간다. 실제 키를 쓰면 네이티브 선택 창이 떠서 합성으로 확인했다.
  - 대조군(같은 합성 경로로 링크 `#pre`에 돌아감): 80ms Enter는 삼켜지고(click 0, document 미도달), 500ms 뒤 Enter는 링크를 실행한다.

### 회귀 요약
| 묶음 | PASS / 실행 | 비고 |
|------|------------|------|
| 실제 확장 팝업 `t_ext_popup` | 25/25 | |
| 실제 확장 팝업 `t_ext_popup_lr` | 8/8 | |
| 실제 확장 메뉴 `t_ext_r2` | 48/48 | 키 가드·바깥 클릭·PageUp/Down·휠·창 blur·night_mode 4조합·라이브 HTML |
| 실제 확장 메뉴 `t_ext_menu` | 40/44 | 직전과 같은 4건: M6b = MINOR-3 수용, M8·CT×2 = 수정 의도대로 바뀐 옛 단정 |
| 실제 메뉴 키 `t_ext_menu2` | 10/10 | |
| 메뉴 경계 `t_ext_menu3` | 5/5 | |
| **신규** 입력칸 가드 `t_ext_r3` | 8/8 | |
| **신규** forced-colors `t_forced2` | 7/7 | |
| 1차 회귀 실 Chrome(`t_ext3`·`t_chrome3`·`t_chrome_toast`·`t_chrome_tab`) | 73/73 | |
| jsdom(`t_popup3` 97, `t_popup4` 35, `t_content3` 14, `t_content4` 27, 1차 236) | 406/409 | 직전과 같은 3건: LR9·P11 정보, J2 의도 반전 |
| **합계** | **630/637** | 결함 0. 비PASS 7건은 모두 직전 보고와 같은 사유다 |

### 남은 사소한 점
- **DOC-C**(주석) `src/popup/popup.css:14`의 "흰 글자를 올리는 채움색(hover). 라이트에선 글자색과 같고"
  - 이번 변경으로 라이트 빨강 글자색(`#c81e1e`)과 채움색(`#dc2626`)이 달라졌다. 파랑만 같다.
  - 동작에는 영향이 없다.
- DOC-B(스킬 `content.css` 주석)와 N4(TODO:21)는 반영을 확인했다.
