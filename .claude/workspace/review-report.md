# 코드 리뷰 보고서: FMK-Blind

## 2026-10-05 UI/UX 1차 묶음 최종 재리뷰(2차 수정 루프): 브랜치 `feat/undo-and-error-feedback`(main f8bfba5 기준, 미커밋)

- 담당: extension-reviewer(직접 모드, 재리뷰). 소스는 고치지 않았다. 이번 실행에서 병렬로 생성 중인 `qa-report.md`는 근거로 쓰지 않았다.
- 대상: `git diff main` 전체. 직전 리뷰 뒤 반영된 수정을 중점으로 봤다.
  - R5: 토스트 낭독을 sr-only `.fmkb-toast-live`(role=status)로 옮기고, 보이는 문구는 aria-hidden 처리
  - N9: `lastActedUid`
  - N10과 QA MINOR-2R: 새 `.fmkb-toast-absorb` 클래스, pointer-events 규칙 분리
  - QA MINOR-8: `returnFocusTo`로 포커스 되돌림
  - 문서(PLAN·README·TODO)
- 검증 산출물(스크래치패드 `…/scratchpad/`)
  - `rv-ux3/toast_test3.js`(신규): **실제 headless Chrome 154 + CDP**. 실제 마우스·키 입력으로 히트 테스트, 포커스, AX 트리를 확인했다. 결과는 **33/35**이고, 실패 2건이 아래 minor R6이다. 테스트 페이지는 현재 `content.css`로 다시 만들었다(`build.js`).
  - `rv-ux3/edge_test.js`(신규): 버튼의 가장자리를 두 번 클릭하는 측정이다. 현재 CSS와 R6 수정안 CSS(`build_patched.js`)를 비교한다.
  - `rv-ux3/toast_test_prev.js`: 직전 라운드 스위트(`rv-ux2/toast_test.js`)를 현재 코드로 다시 돌렸다. **21/21**이다.
  - `rv-ux/popup_test.js` **23/23**, `rv-ux/popup_test2.js` 9/10, `rv-ux/q6b.js` N9 확인. `popup_test2`의 1건은 직전 리뷰에서 밝힌 테스트 기대 오류(Q2 중간 상태)이고, 최종 상태는 PASS다.
  - `rv-ux/content_test.js` **24/24**. `node --check`로 content 9파일과 popup.js를 확인했고 모두 통과했다.

> **판정: MERGE 가능 (blocker 0 / major 0 / minor 1 / nit 1).**
> - 직전 리뷰의 minor R5, nit N9·N10, QA MINOR-8은 **해소됐다**. QA MINOR-2R은 버튼 가운데를 누르는 경우 해소됐다.
> - 새 minor R6이 하나 남았다. 흡수 영역이 곧이어 뜨는 결과 토스트의 크기를 따라 줄어서, 버튼의 **오른쪽 끝**을 더블클릭하면 두 번째 클릭이 여전히 페이지로 간다. CSS 5줄 수정안을 실측으로 검증해 뒀다. 이번 PR에서 고치기를 권하지만, 고치지 않아도 데이터나 차단 상태가 잘못되지는 않는다.
> - 새 코드가 만든 데이터·동작 정확성 회귀는 없다. 직전 라운드 스위트(토스트 21, 팝업 23, content 24)도 모두 그대로 통과한다.

### 이전 지적 해소 여부

| ID | 내용 | 결과 | 근거 |
|---|---|---|---|
| R5 | 숨김 상태의 `visibility:hidden` 때문에 다시 뜰 때 라이브 영역이 '새로 생긴' 것으로 잡혀 낭독되지 않을 수 있음 | **해소** | AX 트리에서 숨김 중에도 `status` 노드가 남는다(ignored false). 다시 show하면 15ms 시점에 비어 있다가 135ms 시점에 채워져, 진짜 내용 변경으로 잡힌다. 연달아 show하면 마지막 문구만 남는다(`liveTimer` 정리). 보이는 동안 문구 텍스트 노드는 1개뿐이다(msg aria-hidden으로 중복 없음). 1px clip 영역이라 히트 테스트에 걸리지 않고 토스트 크기도 바꾸지 않는다(데스크톱·터치 높이 38.19/45px 유지) |
| N9 | 두 줄 작업이 겹치면 먼저 끝난 줄에 포커스가 남음 | **해소** | `q6b.js`: A가 끝날 때는 body에 머물고, B가 끝나면 B의 되돌리기 버튼으로 간다. P6(사용자가 C로 옮긴 포커스 유지)은 그대로다. `beginRowWork`가 거절되면(이미 busy) `lastActedUid`가 바뀌지 않는 것도 맞다 |
| N10 | 실행 취소 토스트가 자동으로 사라질 때도 0.5초 동안 클릭을 흡수함 | **해소** | 자동 숨김 60ms 뒤의 클릭이 페이지에 닿는다. 자동 숨김 경로에서는 absorb 클래스가 붙지 않는다(`toast_test3` C, `toast_test_prev` T4 info: false) |
| QA MINOR-2R | 실행 취소 뒤 결과 토스트가 has-action을 떼어 흡수가 끊기고, 두 번째 클릭이 페이지로 감 | **대부분 해소**(잔여 R6) | 버튼 가운데 기준으로 결과 토스트 지연 {0,30,150,400}ms × 두 번째 클릭 간격 {60,200,420}ms × 문구 2종 = 24조합 모두 흡수됐다. 데스크톱과 터치에서 모두 0/24이고, 실행 취소는 정확히 1회 실행된다. 흡수가 끝난 650ms 시점에는 결과 토스트를 눌러도 클릭이 페이지에 닿는다. 단 버튼 오른쪽 끝은 R6 참고 |
| QA MINOR-8 | 키보드로 실행 취소를 누르면 포커스가 body로 감 | **해소** | `toast_test3` E: y에서 Tab으로 들어와 Enter를 누르면 1회 실행되고 포커스가 y로 돌아온다. `scrollY` 1500도 유지된다(preventScroll). textarea에서 들어와 Enter나 Space를 눌러도 포커스가 textarea로 돌아오고, **값에 개행·공백이 새지 않는다** |
| N2·N7·MINOR-6·MINOR-7 | 의도적 미반영 | 미반영 유지(타당) | 직전 리뷰 판단과 같다. PR의 알려진 한계에 적는다 |
| R1~R4, N1·N3~N6·N8 | 직전 라운드에서 해소 | 회귀 없음 | 직전 스위트를 다시 돌린 결과 그대로 통과한다(토스트 21/21, 팝업 23/23, content 24/24) |

### 중점 점검(리더 요청) 결과

- **absorb 타이머와 연속 토스트**
  - 실행 취소 클릭으로만 absorb가 켜진다(키보드 Enter·Space 포함, 무해). 500ms 뒤 꺼진다. 다시 누르면 타이머가 재시작된다.
  - 곧이어 오는 결과 토스트, 오류 토스트, 새 실행 취소 토스트 모두 absorb 동안만 클릭을 받는다. 새 실행 취소 토스트는 has-action 규칙으로 원래 클릭을 받는다.
  - 흡수가 끝나면 버튼 없는 토스트는 다시 통과시킨다. absorb 시간 500ms와 visibility 지연 0.5s가 맞물려, 숨긴 뒤 흡수가 끝나면 곧 클릭 대상에서도 빠진다.
  - 결함은 R6(흡수 영역의 크기) 하나다.
- **재로드 전 잔재**
  - `ensureEl`은 연결이 끊긴 `el`을 다시 만들 때 같은 id의 옛 토스트를 지운다.
  - `show-absorb-has-action` 클래스를 가진 가짜 옛 토스트를 넣고 확인했다. show 뒤 토스트는 하나만 남고 absorb 클래스도 없다(J).
  - 옛 `absorbTimer`·`liveTimer`는 실행되는 시점의 모듈 변수(새 `el`·`liveEl`)를 건드린다. 클래스 제거와 같은 문구 채우기뿐이라 무해하다.
  - 지우기는 '첫 show 때'에만 일어난다. 이 점은 아래 [INFO] 참고.
- **live 영역과 aria-hidden**
  - 낭독 중복이 없고, 숨김 중에도 영역이 유지된다.
  - 실행 취소 버튼은 보이는 동안만 노출되고 숨기면 빠진다(AX `btn` 1→0).
  - 다만 보이는 문구가 aria-hidden이라 버튼이 문맥 없이 "실행 취소"로만 읽힌다. nit N11 참고.
- **returnFocusTo의 오래된 참조** 경우별 결과. 오래된 참조로 엉뚱한 곳에 포커스가 간 경우는 없었다.
  - `releaseFocus`는 포커스가 토스트 안에 있을 때만 불린다. 포커스가 토스트에 들어올 때마다 focusin이 `returnFocusTo`를 새 값으로 덮는다. 밖에서 들어오면 relatedTarget이고, body나 창 밖에서 들어오면 null이다.
  - F1: Tab으로 들어왔다가 페이지를 클릭해 body로 나가고, 자동 숨김 뒤 새 토스트를 마우스로 클릭했다. Chrome이 버튼에 포커스를 주며 focusin(relatedTarget null)이 오래된 y를 null로 덮으므로, 포커스는 **body**로 간다(y 아님).
  - F2: 마우스 클릭이 버튼에 포커스를 주지 않는 Firefox·Safari 방식을 mousedown preventDefault로 흉내 냈다. 포커스가 토스트에 없어 `releaseFocus`가 불리지 않고 **body**에 남는다.
  - F3: Tab으로 들어와 x를 클릭하고 자동 숨김이 되면, 포커스는 **x**에 그대로 있다.
  - F5: Shift+Tab으로 y에 나간 뒤 자동 숨김이 되면, 포커스는 **y**에 그대로 있다.
  - F4: x에 입력하던 중 마우스로 실행 취소를 누르면 포커스가 **x**로 돌아온다(원래 있던 곳이므로 바람직).
  - G: 되돌아갈 요소가 제거됐거나, `display:none`이거나, `disabled`이면 `focus()`가 실패한다. 이때 blur로 넘어가 **body**로 가고, 토스트 안에 갇히지 않는다.
- **주석·문서 정합**
  - `50-toast.js` 상수와 함수 주석, `content.css` 주석(visibility 지연, has-action, absorb, live)은 동작과 맞는다.
  - PLAN Q9, README, TODO의 "마우스를 올리거나 키보드로 포커스하면 멈춤"도 맞는다.
  - absorb 주석의 "결과 토스트에도 유지된다"는 클래스 기준으로는 사실이다. 다만 흡수 영역은 결과 토스트 크기로 줄어든다(R6). 수정 시 주석 한 줄을 보탠다.

### [minor] R6 클릭 흡수 영역이 '결과 토스트'의 크기를 따라 줄어, 실행 취소 버튼 오른쪽 끝을 더블클릭하면 두 번째 클릭이 페이지로 감  (차원: 정확성·UX)
- 위치: `src/content.css:85-87`(`#fmkb-toast.fmkb-toast-absorb { pointer-events: auto; }`), `src/content/50-toast.js:145-153`(show가 버튼을 `hidden`으로 바꾸고 다시 배치)
- 원인
  - absorb는 토스트 요소의 **현재 상자**만 덮는다.
  - 결과 토스트("… 차단을 취소했습니다", "… 다시 차단했습니다")는 버튼이 없어서 원래 토스트보다 좁다.
  - 가운데 정렬이므로(`left:50%; translateX(-50%)`) 오른쪽 끝이 안쪽으로 들어온다.
  - 결과 토스트는 저장이 끝나면(보통 수십 ms) 뜨므로, 대개 두 번째 클릭보다 먼저 나타난다.
- 증거(실제 Chrome 154, `rv-ux3/toast_test3.js` B와 `edge_test.js`)

  | 페이지 | 토스트 폭(원래 → 결과) | 버튼 오른쪽 끝~토스트 끝 | 버튼 가운데 | 버튼 오른쪽 끝 −1px | 버튼 위 +1px |
  |---|---|---|---|---|---|
  | 데스크톱 | 237 → 193px(한쪽 22px 축소) | 18px | 0/12 샘 | **12/12 샘** | 1/12 |
  | 터치(coarse) | 262 → 221px(한쪽 20.5px 축소) | 10px | 0/12 | **12/12 샘** | 3/12(아래 −1px도 3/12) |

  - 정리하면 데스크톱은 버튼 오른쪽 약 4px, 터치는 약 10px가 결과 토스트 밖으로 나간다.
  - 터치의 위아래 끝도 샌다. 결과 토스트가 늦게 뜨면 다시 올라오는 애니메이션(`translateY(12px)→0`) 동안 상자가 아래로 내려가 있기 때문이다.
  - 실행 취소는 어느 경우에도 1회만 실행된다. 샌 클릭은 토스트 아래 페이지 요소(목록 링크 등)를 누른다.
- 영향: N1과 MINOR-2R에서 막으려던 "두 번째 클릭이 링크로 감"이 좁은 띠에 남는다. 확률은 낮다. 버튼 끝을 더블클릭하거나 더블탭해야 하고, 결과 토스트가 두 번째 클릭보다 먼저 떠야 한다.
- 수정안(CSS만, **검증 완료**: `rv-ux3/build_patched.js` → `t.p.html`·`t_coarse.p.html`):
  ```css
  /* 흡수 중엔 결과 토스트가 좁아지거나(버튼 없음) 다시 떠오르며 아래로 밀려 있어도
     원래 실행 취소 버튼 자리를 덮도록 보이지 않는 여백을 둔다. */
  #fmkb-toast.fmkb-toast-absorb::after {
    content: '';
    position: absolute;
    top: -16px; bottom: -16px; left: -48px; right: -48px;
  }
  ```
  - 측정 결과(같은 12조합 × 5지점: 가운데, 오른쪽 −1, 왼쪽 +1, 위 +1, 아래 −1): 데스크톱과 터치 모두 **0/12**다.
  - 흡수가 끝난 650ms 시점에 결과 토스트 오른쪽 끝에서 20px 바깥을 누르면 페이지에 닿는다(흡수 뒤 부작용 없음).
  - 위아래 8px로는 터치 위쪽에서 2/12가 여전히 샜다. 그래서 16px로 둔다(translateY 12px보다 크게).
  - `#fmkb-toast`가 `position:fixed`라 containing block이 된다. `content:''`라 접근성 트리와 배치에 영향이 없고, absorb 동안(≤500ms)에만 있다.

### [nit] N11 (R5 수정의 부작용) 보이는 문구가 aria-hidden이라 실행 취소 버튼이 문맥 없이 읽히고, 숨긴 뒤에도 마지막 문구가 접근성 트리에 남음  (차원: 접근성, 선택)
- 위치: `src/content/50-toast.js:104`(msg `aria-hidden`), `:63-70`(liveEl은 숨김 뒤에도 문구 유지)
- 증거(AX 트리)
  - 버튼의 accessible name은 "실행 취소"이고 description이 없다. 직전에는 role=status 안에 문구와 함께 있었다.
  - 낭독을 놓쳤거나, 화면 낭독기의 탐색 모드나 터치 탐색으로 버튼에 간 사용자는 무엇을 취소하는지 알 수 없다.
  - 토스트가 숨겨진 뒤에도 status 노드에 "H 님을 차단했습니다"가 남는다. 탐색 모드로 페이지 끝까지 읽으면 지난 안내가 읽힌다.
- 수정안(검증: `rv-ux3/desc.js`. 적용 시 버튼 description이 "닉 님을 차단했습니다"가 된다):
  ```js
  msgEl.id = 'fmkb-toast-msg';                            // ensureEl
  actionEl.setAttribute('aria-describedby', 'fmkb-toast-msg'); // aria-hidden 대상도 직접 참조는 설명에 포함됨
  // (선택) hideNow 끝에: if (liveTimer) { clearTimeout(liveTimer); liveTimer = null; } liveEl.textContent = '';
  ```
  - 지운 텍스트는 aria-relevant 기본값(additions text)에서 낭독되지 않는다. 그래서 숨긴 뒤 비워도 안전하다.

### [INFO] 확인 필요·관찰(결함으로 집계하지 않음)
- **창을 다시 활성화할 때**: 실행 취소 버튼에 포커스를 둔 채 다른 창이나 탭으로 갔다가 돌아오면, 브라우저가 버튼에 focusin(relatedTarget null)을 다시 보낸다. 이때 `returnFocusTo`가 null이 된다. 그러면 Enter를 눌렀을 때 원래 자리가 아니라 body로 간다. 이전 동작으로 내려갈 뿐이고, 엉뚱한 곳에 포커스가 가지는 않는다. headless에서는 창 blur가 재현되지 않아 분석으로만 판단했다.
- **업데이트로 없어진 이전 인스턴스의 토스트**: 옛 토스트 제거가 새 인스턴스의 '첫 show 때'에만 일어난다(`ensureEl`).
  - Firefox에서는 업데이트 때 옛 content script가 정리되고 새 스크립트가 주입된다고 추정한다.
  - 실행 취소 토스트가 떠 있는 5초(또는 멈춘 동안)에 업데이트가 일어나면 다음 일이 생길 수 있다. 옛 토스트가 `fmkb-toast-show·has-action`인 채 새 CSS로 다시 보이고 클릭을 받으며, 버튼은 동작하지 않는다. 이 상태는 새 인스턴스가 처음 토스트를 띄울 때까지 이어진다.
  - main도 같은 구조였고(2초 창) 지금은 창만 길어졌다. 극히 드물다.
  - 원하면 50-toast 모듈이 로드될 때 `document.getElementById(NS.TOAST_ID)?.remove()`를 한 번 실행하면 된다. 실 Firefox 업데이트 경로는 확인하지 못했다.
- **작업 단위 마감(Phase 6)**: `manifest.json` version이 아직 0.8.2다. 0.9.0으로 올려야 한다. `CLAUDE.md` 변경 이력에도 이번 행이 없다.

### 확인 완료(결함 없음)
- **보안**
  - 토스트의 메시지·라벨·live 문구, 팝업의 줄 오류·live 문구는 모두 `textContent`로 넣는다.
  - `role`·`aria-*`·클래스는 고정 문자열이다.
  - `CSS.escape`를 유지한다. 권한·manifest 변경은 없다.
- **토스트 생명주기**
  - `hideNow`는 `action = null`을 포커스 되돌림보다 먼저 실행한다. 그래서 되돌림이 일으키는 focusout → resume은 아무것도 하지 않는다.
  - 되돌림 대상은 토스트 밖이라 el의 focusin이 다시 불리지 않는다.
  - 두 번째 mousedown이 아직 보이는 버튼에 포커스를 줘도, 그 click 처리에서 다시 되돌린다. 포커스가 숨은 버튼에 남지 않는다(`toast_test_prev` T2).
- **MutationObserver**
  - liveEl도 첫 생성 때 함께 삽입된다. 이후 텍스트 변경은 Text 노드 추가뿐이라 `handleAddedNode`의 nodeType 검사에서 바로 빠진다.
- **팝업 N9**: `lastActedUid`는 `beginRowWork`가 성공할 때만 갱신된다. `endRowWork`는 그 uid가 끝날 때만 `focusUid`를 정한다. 사용자가 검색창 등으로 옮긴 포커스는 `render`의 body 검사로 지켜진다.
- **계약 대조**: C3·C7·C9·C10과 맞는다(직전 리뷰와 같음, 이번 수정은 store 사용 방식을 바꾸지 않음).

### 미검토
- 실제 화면 낭독기(NVDA·JAWS·VoiceOver·TalkBack)에서의 낭독. 이번에는 AX 트리 수준까지만 확인했다.
- 실 Firefox와 Safari의 마우스 클릭 포커스 동작. mousedown preventDefault로 흉내만 냈다. 리더의 실 Firefox 156 검증(라이브 31/31, 팝업 30/30, 터치 5/5)으로 보완된다.
- 실 Firefox Android에서의 더블탭과 R6 띠. 실기기 게이트로 남는다.
