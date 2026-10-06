# 코드 리뷰 보고서: FMK-Blind

## 2026-10-06 UI/UX 2차 묶음 재리뷰(수정 루프 1): 브랜치 `feat/dark-mode-a11y`(main 2d178eb 기준, 미커밋)

- 담당: extension-reviewer(직접 모드). 소스는 고치지 않았다. 이번 실행에서 병렬로 생성 중인 `qa-report.md`는 근거로 쓰지 않았다.
- 대상: `git diff main` 소스 4파일(`popup.js`·`popup.css`·`40-contextmenu.js`·`content.css`)과 문서 5파일(`PLAN.md`·`README.md`·`TODO.md`·`.claude/agents/content-engineer.md`·`popup-engineer.md`). 직전 리뷰의 지적 반영분과 QA 지적 반영분을 중심으로 봤다.
- 검증 산출물(스크래치패드)
  - `rv-ux4/popup_ux2_test.js`(jsdom + 모의 `chrome.storage`, 읽기 지연·실패 주입): 현재 코드 **38/38**. 직전 라운드에서 실패한 C·D·J가 모두 통과한다.
  - `rv-ux5/menu_test4.js`: **실제 headless Chrome 154 + CDP**, 실제 마우스·키 입력. 같은 출처 iframe(srcdoc)과 다른 사이트 iframe(127.0.0.1 ↔ localhost, OOPIF)을 넣은 페이지, 실제 `night_mode.css`(fmkorea에서 받음)를 붙인 페이지로 확인했다. **45/46**이다. 실패 1건(R7i)은 테스트 정규식 문제다. forced-colors에서 외곽선이 `rgba(0,230,255,0.8)`로 **보이는데** 정규식이 rgba를 실패로 처리했다.
  - `rv-ux5/ff_reprobe.py`: **실제 Firefox 156**(Selenium/Marionette, headless). **14/16**이다. 실패 2건은 다른 사이트 iframe 안의 textarea에 포커스·입력이 들어가지 않은 것이다. 메뉴 없이 같은 클릭을 해도 똑같이 실패하므로(`ff_x.py` 기준선) Marionette 하네스 한계다. 부모 `activeElement`는 IFRAME이고, blur 시점의 활성 요소는 BODY여서 우리 코드는 포커스를 되돌리지 않는다.
  - `rv-ux5/fc_test.js`(forced-colors 외곽선), `rv-ux5/spacekeyup.*`(Space keyup 활성화 여부: Chrome·Firefox), `rv-ux5/c2.js`(대비)
  - 회귀: 팝업 23/23, content 24/24, 토스트 35/35이다. `popup_test2`는 9/10인데, 실패 1건은 기존에 밝힌 테스트 기대 오류다. `menu_test.js`는 18/20이다. M1d는 좌표 소수점 비교 문제이고, M3f는 테스트가 메뉴를 `.remove()`로 직접 지워 `returnFocusTo`가 null이 된 인공물이다. 같은 경로를 정상 조작으로 돈 `menu_test2` K1은 PASS다. `node --check`는 content 8파일과 popup.js 모두 통과했다.

> **판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 0 / nit 4**
> - 직전 major M1과 minor m1~m3, nit N1·N2·N3·N5가 모두 해소됐다. 실브라우저와 jsdom으로 확인했다.
> - 새 코드에서 데이터·차단 상태·포커스가 잘못되는 결함은 찾지 못했다.
>   - closeMenu의 무조건 복귀는 바깥 클릭, iframe 클릭, 창 전환, 재진입 어디에서도 포커스를 빼앗지 않는다.
>   - 키 가드 리스너는 남거나 쌓이지 않는다(500ms 뒤 0개).
> - 남은 것은 nit 4건(선택)과 Phase 6 마감 항목(버전 범프, CLAUDE.md 행)이다.

### 이전 이슈 해소 표

| ID | 이전 심각도 | 상태 | 확인 근거 |
|---|---|---|---|
| M1 검색 입력이 오류·로딩 화면을 '빈 목록'으로 덮음 | major | **해소** | `popup.js:89` `listReady`, `:231`(showFatal에서 false), `:810-811`(로드 성공 시 true, 읽는 동안 친 검색어 반영), `:753`(`if (listReady) render()`). `popup_ux2_test` C·D(실패 화면에서 쳐도 오류 화면과 [다시 시도], `총 –명` 유지), J1(로딩 중 입력해도 '불러오는 중' 유지), J2(로드 후 "검색 1명 / 총 3명") 모두 PASS |
| m1 스크롤·blur·PageDown으로 닫히면 포커스가 body로 떨어짐 | minor | **해소** | `40-contextmenu.js:21-32`. Chrome: 휠 닫힘은 앵커로 가고 스크롤 위치는 300 그대로(R6c·d), 창 blur는 앵커로(R4b·c), 메뉴 안 메뉴 키는 앵커로(R2). Firefox: 스크롤 닫힘은 앵커로 가고 점프 없음(F5), 탭 전환 후 복귀하면 앵커(F6) |
| m2 forced-colors 포커스 표시 없음 | minor | **해소** | `content.css:35-36`. forced-colors에서 외곽선이 보인다. 포커스 항목은 `rgba(0,230,255,0.8)`, 비포커스 항목은 `rgb(255,255,255)`다(아래 n3 참고) |
| m3 macOS Shift+F10 문서 | minor | **해소** | README·PLAN·TODO·주석 4행에 "Windows·Linux는 Shift+F10도, macOS 키보드엔 없음"을 반영했다. README는 키보드로 차단을 되돌릴 때 팝업을 쓰라고 안내한다 |
| N1 선택 직후 두 번째 Enter가 링크 실행 | nit | **해소** | `:30`, `:34-44`. Chrome R5d(500ms 안의 Enter 2회에서 링크 실행 0회), R5e(Space로 스크롤 안 됨), R5h(500ms 뒤에는 정상 실행). Firefox F3 같음. 마우스 선택에는 가드가 붙지 않는다(R5j) |
| N2 다크 메뉴 강조 경계 대비 2.92 | nit | **해소** | `#232327`: 강조 경계 3.24:1, 글자 13.3:1(`c2.js`). Chrome 계산값 `rgb(35,35,39)` |
| N3 사이트 다크(`body.night_mode`) 미반영 | nit | **해소** | `content.css:63-72`. 실제 night_mode.css와 OS 라이트 조합에서 메뉴는 `#232327`, 강조는 빨강·흰 글자, 일반 토스트는 `rgba(63,63,70,.97)`, **오류 토스트는 빨강 유지**(R7a~e). Firefox F7 같음. 모바일(`m.fmkorea.com`)도 쿠키 night_mode=Y일 때 `<body class="night_mode …">`인 것을 확인했다 |
| N4 검색 인원수 aria-live 낭독 빈도 | nit | **미반영(알려진 한계로 둠)** | 동의한다. 다만 문서에 한계로 적혀 있지 않다. TODO에 한 줄 남기기를 권한다(아래 n4) |
| N5 문서 세부 드리프트 | nit | **해소** | PLAN Q7·TODO에 "가져오기 탭 보기 제외", content-engineer.md에 Home·End·night_mode를 반영했다 |
| QA: K > N(해제 저장 중) | — | **확인** | `updateCount`가 K와 N을 모두 `allItems`로 센다(`popup.js:266-275`). H1~H5 PASS |
| QA: 다크 placeholder, 라이트 hover 대비 | — | **확인** | placeholder: 다크 6.41, 라이트 4.83. 라이트 hover 줄: muted 4.59, danger 4.58, accent 4.90(이전 4.39). 부작용은 n2 참고 |

### 중점 확인 결과(결함 없음)

- **closeMenu 무조건 복귀의 부작용**
  - 바깥 비포커스 영역 클릭: mousedown이 먼저 포커스를 body로 옮긴다. 그래서 `hadFocus=false`이고 되돌리지 않는다(Chrome R1c, Firefox F2b).
  - 바깥 textarea 클릭: textarea 포커스가 유지된다(Chrome R1d, Firefox F2).
  - **iframe 클릭**(같은 출처, 다른 사이트 OOPIF)
    - window blur 시점의 `activeElement`가 Chrome은 이미 IFRAME이고(`win:blur:fr`), Firefox는 BODY다(`win:blur:BODY`).
    - 그래서 부모 앵커로 포커스를 빼앗지 않는다. iframe 안 textarea에 focus 뒤 blur가 없었고, 같은 출처 iframe에서는 타이핑이 iframe으로 들어갔다(Chrome R3, Firefox F1 same).
    - 이 경로를 가장 걱정했다. 사이트의 광고·영상 iframe을 클릭할 때 포커스를 뺏을 수 있기 때문이다. 결과는 문제없음이다.
  - **다른 창·탭 전환**
    - 창이 비활성인 상태에서 `focus()`는 OS 포커스를 가져오지 않고 문서의 활성 요소만 앵커로 바꾼다.
    - 돌아오면 앵커에 있다(Firefox F6). headless Chrome은 탭 전환에 window blur를 쏘지 않아, 합성 blur로 경로만 확인했다(R4b·c).
  - **openMenuAt 재진입**
    - 키보드로 연 A 메뉴에 포커스가 있는 채 B를 마우스로 우클릭했다. 결과는 메뉴 1개, 새 메뉴에 포커스, B 라벨이었고, Esc를 누르면 **B**로 간다(R1e~h).
    - 키보드로만 재진입해도 B로 간다(R1i).
    - 메뉴 안에서 메뉴 키를 누르면(대상이 메뉴 항목) 닫히고 앵커로 간다(R2).
- **키 가드 리스너**
  - 키보드 선택 1회에 keydown 캡처 리스너 1개가 생긴다(`DOMDebugger.getEventListeners`, R5c).
  - 연속 3회 선택하면 3개까지 쌓이지만, 600ms 뒤 **0개**다(R5f·g). 각 클로저가 자기 타이머로 제거되므로 누수가 없다.
  - 마우스로 선택하면 0개다(R5j).
  - `rows[i].click()` 안에서 리스너가 예외를 던져도 dispatch가 삼키므로 `keyboardActivation=false`가 항상 실행된다.
  - `closeMenu`를 이벤트 리스너에 직접 넘기지 않고 `() => closeMenu()`로 감쌌고, `guard === true`로 엄격 비교한다. 그래서 이벤트 객체가 guard로 새는 일이 없다.
- **PageUp/PageDown**: 스크롤되지 않고 메뉴가 유지되며, 이어서 화살표로 이동할 수 있다(Chrome R6a·b, Firefox F4).
- **listReady와 refresh·onChange의 일관성**
  - `refresh()`를 부르는 곳은 `endRowWork`, 가져오기, onChange, 로드 성공 넷이다.
  - 해제 버튼은 render 뒤에만 생긴다. 가져오기 버튼은 로드 성공 전까지 비활성이다. onChange는 첫 로드 성공 때 구독한다. 따라서 넷 모두 `listReady=true` 이후에만 도달한다.
  - [다시 시도] 버튼은 로드 실패 화면에만 생긴다. 첫 성공 뒤에는 `startLoad`가 다시 불리지 않는다. 그래서 성공 뒤 `listReady`가 false로 돌아가는 경로는 `refresh()`의 `store.list()` 예외뿐이다.
  - `store.list()`는 메모리 Map 순회라 던지지 않는다(`10-store.js:768-775`). 사실상 도달 불가능한 방어 코드다.
  - 연타 시 두 `startLoad`는 같은 `loadPromise`를 공유한다. 각자 자기 hint 타이머만 지우고, `subscribed` 가드로 구독은 1회다(F1·F2).
- **night_mode CSS 특이성**
  - `body.night_mode #fmkb-toast:not(.fmkb-toast-error)`의 특이성은 (1,2,1)로 기본 `#fmkb-toast`(1,0,0)보다 높다.
  - `:not`이 오류 토스트를 제외하므로 `#fmkb-toast.fmkb-toast-error`(1,1,0)와 겨루지 않는다. 계산값으로 확인했다(R7e·g).
  - 사이트 `night_mode.css`의 `.night_mode{color:#ccc;background:#121212}`는 메뉴와 토스트가 색을 직접 지정하므로 영향이 없다.
  - `div`·`*` 같은 넓은 규칙 중 우리 요소에 걸리는 것은 없었다.
  - 사이트 토글(`night_mode_toggle.js`)은 body 클래스만 바꾸므로 새로고침 없이 바로 반영된다.
- **문서 정합성**
  - README·PLAN Q3/Q7·TODO·agents 2종의 기술이 코드와 일치한다.
  - README의 "알림의 실행 취소 버튼은 페이지 맨 끝에 있어 Tab으로 닿기 어렵다"는 실측과 맞다. 키보드로 차단하면 포커스가 body로 가고, 다음 Tab은 숨겨진 댓글 **다음 요소**로 간다(`menu_test3`: `after → 실행 취소 → …`).
- **보안**: 새 DOM(다시 시도 버튼, 메뉴 role·aria)은 모두 `textContent`와 고정 문자열이다. 권한·manifest 변경은 없다.

### QA MINOR-3(키보드 차단 뒤 실행 취소 자동 포커스) 미반영 판단

- **결정(자동 포커스하지 않음)은 타당하다.** 다만 근거는 바꾸기를 권한다.
- 제시한 근거는 "Space 선택의 keyup이 실행 취소 버튼을 누른다"였다. 이것은 **재현되지 않았다.**
  - keydown 뒤 포커스를 버튼으로 옮기고 keyup을 보냈다. 지연 0ms와 30ms 모두, Chrome 154와 Firefox 156 모두, Space와 Enter 모두 버튼 click이 **0회**였다(`rv-ux5/spacekeyup.*`).
  - 두 엔진 모두 keydown이 다른 곳에서 일어난 keyup으로는 버튼을 활성화하지 않는다.
- 실제로 더 타당한 근거는 세 가지다.
  - (1) Enter를 연타하거나 누르고 있으면, 두 번째 keydown이 실행 취소 버튼을 바로 눌러 **차단이 곧바로 취소된다**. 같은 500ms 가드가 버튼에도 필요하다.
  - (2) 토스트는 사라지는 상태 메시지다. 포커스를 가져가면 사라질 때 포커스를 다시 옮겨야 하고, 원래 자리(숨겨진 앵커)는 이미 없다.
  - (3) WAI-ARIA APG는 상태 메시지(role=status)가 포커스를 가져가지 않는 쪽을 권장한다.
- README의 팝업 해제 안내로 충분하다. 개선이 필요하면 후속 TODO 후보로 둔다. 예를 들어 숨겨진 자리의 다음 요소로 포커스를 옮기거나, 토스트가 떠 있는 동안 키보드 접근 경로를 제공하는 방법이 있다.

### [nit] n1 열기 전 포커스가 입력창이었으면 키 가드가 입력창의 Enter·Space를 0.5초 삼킬 수 있음  (차원: 정확성)
- 위치: `src/content/40-contextmenu.js:30`, `:132-133`
- 조건
  - `returnFocusTo`가 textarea나 input이어야 한다. 이는 우클릭 mousedown이 링크에 포커스를 주지 않는 환경(Safari, 터치 롱프레스)에서만 생긴다.
  - 그 상태에서 메뉴를 **키보드로** 골라야 한다.
  - Chrome과 Firefox는 mousedown이 먼저 앵커에 포커스를 주므로 해당하지 않는다(직전 리뷰 M1 로그, F1).
- 증거: 조건을 만족하면 `guardKeys(back)`가 그 입력창에 걸린다. 그러면 0.5초 안에 친 공백이나 줄바꿈이 사라진다. 토스트 쪽 가드도 "입력창에 바로 치는 키는 막지 않게"를 원칙으로 둔다.
- 수정안(선택): `if (guard === true && document.activeElement === back && !back.matches('input, textarea, select, [contenteditable=""], [contenteditable="true"]')) guardKeys(back);`

### [nit] n2 라이트 팝업의 줄 hover가 거의 보이지 않음(#f8f9fa / #fff = 1.05:1)  (차원: 유지보수성·UX)
- 위치: `src/popup/popup.css:10`, `:136-138`
- 근거
  - 작은 글자 4.5:1을 맞추려고 hover 배경을 밝혔다. 그 결과 줄 hover 강조가 1.10에서 1.05로 줄었다.
  - hover 강조는 WCAG 요구 사항이 아니고 버튼 자체에도 hover 표시가 있어 결함은 아니다. `io-btn:hover`도 테두리가 accent로 바뀌므로 표시가 남는다.
- 대안(선택): hover는 `#f3f4f6`로 되돌리고 `--fmkb-muted`를 약간 진하게 한다(예: `#646b78`, 흰 바탕 5.3 이상, #f3f4f6 위 4.6 이상). `--fmkb-danger`는 hover 줄 위에서 4.37이 되므로 함께 확인한다.

### [nit] n3 forced-colors 외곽선이 기본 규칙에 있어 포커스가 없는 항목에도 항상 보임  (차원: 접근성)
- 위치: `src/content.css:35-36`
- 증거(`fc_test.js`, Chrome forced-colors)
  - 포커스가 없거나 blur된 항목: `solid 2px rgb(255,255,255)`
  - `:focus-visible` 항목: `rgba(0,230,255,0.8)`
  - 색은 달라 구분은 되지만, 외곽선 자체가 포커스 신호는 아니다.
- 영향: 지금 메뉴는 항상 1항목이고 열 때 그 항목에 포커스가 가므로 실해가 없다. 항목이 늘면(예: TODO의 '메모') 문제가 된다.
- 수정안(선택): 기본 규칙은 `outline: none`으로 두고, `:focus-visible` 규칙에 `outline: 2px solid transparent; outline-offset: -2px;`를 둔다. 이것이 관용 패턴이다.

### [nit] n4 작은 중복과 문서 누락
- `guardKeys`가 `50-toast.js:57-66`과 글자까지 같다(500ms, 같은 키). 작업 설명에서 이미 인정한 부분이다. 공용으로 빼려면 로드 순서상 `00-namespace.js`나 `20-selectors.js`에 둬야 한다. 지금은 그대로 둬도 된다.
- N4(검색 인원수 낭독 빈도)를 알려진 한계로 둔다면 TODO의 'UX 보강'에 한 줄 남기기를 권한다(드리프트 방지).

### [INFO] 관찰(결함으로 집계하지 않음)
- **열기 전 포커스가 없을 때(`returnFocusTo=null`)**
  - Safari 마우스, 터치, 합성 이벤트가 여기에 해당한다. 이때 Esc나 Tab으로 닫으면 포커스가 body로 가고, 다음 Tab은 문서 처음부터 시작한다(`menu_test2` K3).
  - Chrome과 Firefox의 실제 우클릭·메뉴 키는 앵커가 먼저 포커스를 받으므로 해당하지 않는다.
  - 원하면 `returnFocusTo = … : anchor`(앵커로 폴백)로 보완할 수 있다. 선택 사항이다.
- **바깥 클릭인데 사이트가 mousedown을 preventDefault하는 요소인 경우**: 포커스가 메뉴에 남아 앵커로 돌아간다. 사용자 클릭 대상이 포커스를 받지 않는 요소이므로 실해가 없다.
- **사이트 단축키**: 메뉴에 포커스가 있을 때 글자 키(S·F 이전/다음 글 등)를 치면 사이트 단축키가 실행된다. 앵커에 포커스가 있을 때와 같으므로 회귀가 아니다(직전 리뷰와 동일).
- **night_mode 규칙 중복**: 미디어쿼리와 클래스 셀렉터 두 묶음이 같다. 주석에 "두 규칙 묶음은 내용이 같다"고 명시돼 있어 유지보수 위험은 낮다. 색을 바꿀 때 두 곳을 함께 고쳐야 한다.
- **작업 단위 마감(Phase 6)**: `manifest.json` version이 main과 같은 **0.9.0**이다. minor 범프(0.10.0)가 필요하다. `CLAUDE.md` 변경 이력에도 이번 작업 행이 아직 없다.

### 미검토
- **실제 툴바 팝업에서의 자동 포커스**: Chrome 툴바 팝업과 Firefox 패널은 실브라우저 게이트로 남긴다.
- **실제 Chrome의 창·앱 전환 blur**: headless는 이벤트를 쏘지 않는다. 합성 blur와 Firefox 실측으로 대신했다.
- **Windows·Linux의 실제 메뉴 키·Shift+F10 좌표, Firefox의 키보드 contextmenu 좌표**
- **화면 낭독기**(NVDA·JAWS·VoiceOver·TalkBack): role=menu와 인원수 live 영역의 실제 낭독
- **Safari**
- **모바일 실기기(Firefox Android)**: 입력 중 롱프레스로 메뉴를 열면 포커스 이동으로 화상 키보드가 닫힌다. 이때 viewport가 바뀌어 scroll 이벤트가 나고 메뉴가 바로 닫히는지 **확인이 필요하다.** 이 경로는 직전 라운드의 첫 항목 포커스에서 생겼고, 이번 m1 수정과는 무관하다. 닫은 뒤 입력창으로 돌아갈 때 화상 키보드가 다시 뜨는 것도 함께 본다.
