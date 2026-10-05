# 코드 리뷰 보고서 — FMK-Blind

- 담당: extension-reviewer
- 갱신: 2026-10-05 (**이슈 #16~#20 content·popup 묶음 수정 리뷰**. 브랜치 `fix/content-popup-quick-fixes`, 미커밋 변경분)
- 대상: `src/content/20-selectors.js`(`NICK_ROW` PC 위젯형 확장, #16), `src/content/40-contextmenu.js`(`closeSitePopupMenu`, #19), `src/popup/popup.html`·`popup.css`(새로고침 안내 제거 #17, 탭 보기·터치 sticky 푸터 #18), `src/popup/popup.js`(`appendHighlighted` 원문 위치 표 #20, 탭 보기 가져오기 버튼 focus #18), `manifest.json`(0.7.1→0.7.2). 동반 문서: `fmk-dom-selectors` 스킬, `PLAN.md`, `TODO.md`, `README.md`.
- 방법론: `.claude/skills/extension-code-review/SKILL.md` (코드 품질 6차원)
- 심각도: **blocker** > **major** > **minor**. 검토하지 못한 항목은 통과로 두지 않고 "미검토"로 분류한다.
- 상보성: store·계약은 바뀌지 않았다. 닉네임 폴백 경로(`scanNickRows`·`uidForNick`·observer)도 셀렉터 문자열만 바뀌었으므로 계약 재검증은 생략하고, 셀렉터 오탐, CSS 상호작용, 강조 엣지 케이스, 사이트 메뉴 재표시, 문서 정합에 집중했다.
- 이전 보고서(이슈 #9 Firefox 가져오기 탭 보기, 판정 MERGE)는 git 이력으로 대체한다. 그때의 R3(터치 탭 보기 외관)는 이미 반영되어 있고, R4-3 중 `popup.html` 새로고침 안내는 이번 #17로 해소됐다.

> **요약:** 실 PC 마크업(2026-10-05 curl)으로 `NICK_ROW`를 다시 돌렸다. 홈·웹진·핫딜·`/best`·`/best2`에서 위젯 행 20~23개가 매치했고 중첩 행 0, 빈 닉 0, 행당 `.author` 1개였다. 표형 목록(`/humor`)과 PC 게시글 페이지에서는 0행이라 오탐이 없었다. `#popup_menu_area`는 사이트 core.js가 jQuery `.css({display:'none'})`로 만들고 `.show()`/`.hide()`로 토글하므로, 인라인 `display:none`은 jQuery `hide()`와 같은 상태다. 다음 `show()`가 정상적으로 다시 연다. 강조 수정은 `İ` 케이스를 고쳤지만, 글자(코드 유닛) 단위 소문자화 때문에 그리스어 어말 시그마와 아스트랄 대소문자 문자에서 강조가 빠지는 작은 회귀가 생겼다. 나머지는 문서·주석 드리프트다. **최종 판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 3.**

## 진행 현황

| 차원 | 상태 | 비고 |
|------|------|------|
| 1. 정확성 | ✅ 검토완료 | #16 셀렉터는 실 PC 6페이지와 게시글 1개에서 오탐 0. #19 재표시 정상. minor 1(N1 강조 회귀) |
| 2. 보안 | ✅ 검토완료 | 강조는 여전히 `createTextNode`/`textContent`만 쓴다. `text.slice`는 원문 그대로라 주입 경로 없음. 결함 0 |
| 3. 견고성 | ✅ 검토완료 | #19 비동기 재표시 경쟁은 극히 좁아 INFO로 분류(INFO-1). focus 부작용 없음 |
| 4. 유지보수성 | ✅ 검토완료 | minor 1(N2 코드 주석 "모바일 목록" 잔존) |
| 5. MV3/베스트프랙티스 | ✅ 검토완료 | 권한 무변경(`["storage"]`), 패치 버전 범프 정합. `node --check` 전 파일 통과 |
| 6. 성능 | ✅ 검토완료 | PC 위젯 행 ~20개 추가 스캔, observer는 기존과 같은 `closest`/`querySelectorAll` 1회. 영향 미미 |
| CSS | ✅ 검토완료 | 데스크톱 팝업(360px, `max-height:560px` flex)에는 sticky가 적용되지 않아 무변경. 탭 보기·터치에서는 문서가 스크롤 주체라 sticky가 의도대로 동작 |
| 문서 | ✅ 검토완료 | minor 1(N3 하네스 에이전트·QA 스킬이 제거된 안내문을 여전히 요구, TODO 잔여 게이트 문구, PLAN Q2, CLAUDE.md 이력 행) |

> **최종 판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 3.**
> minor는 머지를 막지 않는다. N1은 몇 줄짜리 수정이고 N2·N3은 문서 정리라 이번 PR에 같이 넣기를 권한다(CLAUDE.md "문서 최신성" 규약).

---

## 발견 사항 요약

| ID | 심각도 | 차원 | 제목 | 상태 |
|----|--------|------|------|------|
| N1 | minor | 정확성 | 글자 단위 소문자화로 어말 시그마(`Σ`→`ς`)·아스트랄 대소문자(Deseret 등) 강조 누락. 필터는 매치하는데 강조만 빠짐(구 코드에서는 정상이던 케이스) | 권고(저비용) |
| N2 | minor | 유지보수성 | 닉 폴백 관련 코드 주석이 아직 "모바일 목록"으로 한정(20-selectors 헤더·섹션 제목, 30-hide, 35-observer, 99-main) | 권고(주석) |
| N3 | minor | 문서 | `popup-engineer.md:19`·`extension-qa-verification/SKILL.md:49`가 제거된 새로고침 안내문을 여전히 요구. `TODO.md:8` 잔여 게이트 ①(LazyFilter)·`PLAN.md:10` Q2·CLAUDE.md 이력 미갱신 | 권고(문서) |
| INFO-1 | — | 견고성 | 사이트 회원 메뉴 AJAX 응답·CSS 로드가 늦게 끝나면 우리 메뉴를 연 뒤에 사이트 메뉴가 다시 뜰 수 있음 | 수용 가능 |
| INFO-2 | — | 범위 | PC 웹진·핫딜 페이지의 공지 `tr`(`td.author` 텍스트, `member_` 앵커 없음)는 어느 규칙에도 매치하지 않음 | 범위 밖(관리자 공지) |

---

## 검증 근거

### #16 `NICK_ROW` — 실 PC 마크업 (2026-10-05, 데스크톱 UA curl → jsdom, 실제 `00-namespace.js`·`20-selectors.js` 로드)

| 페이지 | 위젯 | 매치 행 | 중첩 | 빈 닉 | 행당 `.author` | 비고 |
|--------|------|---------|------|-------|-----------------|------|
| `/` (홈) | `fm_best_widget _bd_pc` | 23 | 0 | 0 | 1 | `member_` 0개 |
| `/humor?listStyle=webzine` | 〃 (`bd_lst_wrp` 하위) | 20 | 0 | 0 | 1 | 행 밖 `.author` 3 = 공지 `td.author`(INFO-2) |
| `/hotdeal` | 〃 | 20 | 0 | 0 | 1 | 행 밖 `.author` 7 = 공지 `td.author`(INFO-2) |
| `/best` | 〃 | 23 | 0 | 0 | 1 | |
| `/best2` | 〃 | 20 | 0 | 0 | 1 | |
| `/humor` (표형) | 없음 | **0** | — | — | — | `member_` 23개 → 규칙 ③ 담당 |
| PC 게시글(`/best`에서 진입) | 없음 | **0** | — | — | — | 하단 목록도 표형 `tr` |

- 추출 닉 샘플: `"웨이크닝","핫윙봉","솔라나가솔라나",…` 앞의 `/ ` 구분자가 정확히 한 번만 제거된다(`^\s*\/\s*`).
- 위젯 `li` 전체 수 = 매치 행 수 → 위젯 안에 다른 `ul > li` 중첩 없음. `...`·`…` 말줄임 닉 0건.
- 사이드바·홈 위젯이 표형 페이지에 끼어드는 경우는 수집한 페이지에서 보이지 않았다. 핫딜 게시글 페이지는 보안 페이지(레이트리밋)로 막혀 수집하지 못했다(미검토 참고).

### #19 `#popup_menu_area` 재표시 (사이트 `static.fmkorea.com/filesn/bundle/9feee036/core.js`)

```js
// 생성: 인라인 display:none
e("<div>").attr("id","popup_menu_area").css({display:"none",zIndex:9999})
// 닫기: document click → n.hide()     열기: g.css({top,left}) … g.show()
```
- 우리 `area.style.display = 'none'`은 jQuery `hide()`가 남기는 상태와 같다. `show()`는 인라인 `display`를 비우고, 스타일시트상 숨김이면 기본 display로 되돌리므로 다음 닉네임 클릭 때 정상적으로 다시 열린다. content script는 격리 월드라 페이지 jQuery를 쓸 수 없으므로, 인라인 스타일을 직접 바꾸는 방식이 맞다.
- `blind_click`도 `$("#popup_menu_area").hide()`를 쓴다. 같은 토글 체계이므로 충돌이 없다.

### #20 `appendHighlighted` (jsdom, 실제 함수 추출, `q = query.trim().toLowerCase()`로 render와 동일하게 호출)

| text | query | 결과 | 필터 매치 | 원문 보존 |
|------|-------|------|-----------|-----------|
| `İstanbul` | `stan` | `İ[stan]bul` ✅(#20 수정 확인) | ✓ | ✓ |
| `İİabc` | `i` | `[İ][İ]abc` | ✓ | ✓ |
| `aİb` | `i̇b` | `a[İb]` (확장 문자 걸침 → 원문 글자 단위로 확장) | ✓ | ✓ |
| `😀Ab😀ab` | `ab` | `😀[Ab]😀[ab]` (서로게이트 비분할) | ✓ | ✓ |
| `aaa` | `aa` | `[aa]a` (비중첩) | ✓ | ✓ |
| `abc` | `` | `abc` (빈 q 조기 반환, 무한 루프 없음) | ✓ | ✓ |
| `ẞ`/`K` | `ß`/`k` | `[ẞ]`/`[K]` | ✓ | ✓ |
| **`ΟΔΟΣ`** | `οδος`/`ΟΔΟΣ` | **`ΟΔΟΣ` (강조 없음)** | ✓ | ✓ → N1 |
| **`𐐀𐐀x`** | `𐐨` | **강조 없음** | ✓ | ✓ → N1 |

모든 케이스에서 `textContent === text`가 유지되므로 표시 텍스트 손상은 없다. 강조만 빠진다.

---

## 발견 상세

### [minor] N1 글자(코드 유닛) 단위 소문자화로 문맥·아스트랄 대소문자 강조 누락  (차원: 정확성)
- 위치: `src/popup/popup.js:116-122` (`appendHighlighted`)
- 증거:
  ```js
  for (var c = 0; c < text.length; c++) {
    var l = text[c].toLowerCase();   // 코드 유닛 1개씩 → 문맥(어말 Σ→ς)·서로게이트 쌍 대소문자 매핑 상실
    for (var u = 0; u < l.length; u++) origAt.push(c);
    lower += l;
  }
  ```
  `q`와 `render()`의 필터는 문자열 전체를 `toLowerCase()`한다. 그래서 `ΟΔΟΣ`의 필터 문자열은 `οδος`(어말 ς)인데, 강조용 `lower`는 `οδοσ`가 되어 일치하지 않는다. 아스트랄 대문자(예: U+10400 `𐐀`)도 홀로 된 서로게이트는 소문자화되지 않아 같은 현상이 생긴다. 항목은 필터를 통과해 목록에 보이지만 강조만 빠진다. 구 코드(전체 `toLowerCase`)에서는 이 두 케이스가 정상이었으므로 작은 회귀다. 한국어 닉 위주라 실사용 영향은 매우 작다.
- 수정안: 길이가 보존되면 전체 소문자화(항등 위치 표)를 쓰고, 길이가 바뀔 때만 코드 포인트 단위 표로 내려간다.
  ```js
  var full = text.toLowerCase();
  var lower, origAt = [];
  if (full.length === text.length) {
    lower = full;                                    // Σ→ς 문맥·아스트랄 매핑 보존, 위치 1:1
    for (var k = 0; k < text.length; k++) origAt.push(k);
  } else {
    lower = '';
    for (var c = 0; c < text.length; ) {             // 코드 포인트 단위(서로게이트 쌍 보존)
      var cp = text.codePointAt(c), w = cp > 0xffff ? 2 : 1;
      var l = text.slice(c, c + w).toLowerCase();
      for (var u = 0; u < l.length; u++) origAt.push(c);
      lower += l; c += w;
    }
  }
  ```
  (길이가 바뀌는 문자열에서의 어말 시그마는 여전히 놓치지만, `İ`와 그리스어 대문자가 섞인 닉은 사실상 없다.)

### [minor] N2 닉 폴백 코드 주석이 "모바일 목록" 한정 표현으로 남음  (차원: 유지보수성)
- 위치·증거: `NICK_ROW`가 PC 위젯형까지 덮게 됐는데 주석은 그대로다.
  - `src/content/20-selectors.js:7-8` 파일 헤더 "모바일 목록은 숫자 member_ 앵커가 없어 … 닉네임 폴백", `:71` 섹션 제목 `// ── 닉네임 폴백(UID 없는 모바일 목록) ──` (바로 아래 본문 주석은 갱신됨)
  - `src/content/30-hide.js:40` "모바일 목록 행(NS.selectors.NICK_ROW)", `:64` "UID 없는 모바일 목록 행도"
  - `src/content/35-observer.js:3`, `:32`, `:48` "(c) 모바일 목록 행"
  - `src/content/99-main.js:26`, `:43`, `:79` "모바일 목록 닉네임 폴백"
- 수정안: "UID 없는 목록 행(모바일 목록·PC 위젯형 목록)"으로 일괄 정정한다(동작 무변경). 20-selectors.js는 스킬과 1:1을 선언한 파일이라 특히 맞춰 두는 것이 좋다.

### [minor] N3 하네스·계획 문서 드리프트  (차원: 문서)
- 위치·증거:
  1. `.claude/agents/popup-engineer.md:19` "이미 열린 탭은 새로고침 후 반영됨을 UI 문구로 안내(MVP 제약; onChanged는 후속)", `.claude/skills/extension-qa-verification/SKILL.md:49` "열린 탭은 새로고침 후 반영됨이 안내되는가(MVP 제약)". #17에서 안내문을 제거했으므로, 다음 팝업 작업에서 에이전트가 이를 "누락"으로 보고 되살리거나 QA가 FAIL을 줄 수 있다.
  2. `TODO.md:8` 모바일 잔여 게이트 ① "지연 렌더(LazyFilter) 댓글이 … MutationObserver가 숨기는지". 이번 PR에서 스킬·PLAN·README는 "정적 HTML에 `li#comment_*` 포함"으로 정정했는데 TODO만 옛 서술이다.
  3. `PLAN.md:10` Q2 표가 닉 폴백을 "모바일 목록"만 언급한다(PC 위젯형 #16 누락). `PLAN.md:50`의 예외 절은 갱신됐다.
  4. `CLAUDE.md` 변경 이력에 이번 묶음(#16~#20, v0.7.2) 행이 없다. #8·#9 PR은 행을 추가했다.
- 수정안: 1은 "팝업 해제는 onChanged(C9)로 열린 탭에 즉시 반영 — 새로고침 안내 불필요"로 정정한다. 2는 ①을 "해소(2026-10-05 실측: 정적 포함)"로 바꾼다. 3은 Q2 괄호에 "PC 위젯형 목록(웹진·핫딜·베스트·홈)도 이슈 #16부터"를 추가한다. 4는 이력 행을 추가한다.

### [INFO-1] 사이트 회원 메뉴의 늦은 재표시  (견고성, 수용 가능)
- 위치: `src/content/40-contextmenu.js:38-46`
- 내용: 사이트는 닉네임 왼쪽 클릭 → `exec_xml` 응답 콜백(`displayPopupMenu`)에서 `g.show()`를 호출한다. 처음 열 때는 CSS `<link>` load 콜백에서 호출하기도 한다. 왼쪽 클릭 직후 응답이 오기 전에 우클릭하면, 우리가 닫은 뒤에 사이트 메뉴가 다시 뜰 수 있다. 수백 ms 창이고 결과는 "#19 이전 상태"일 뿐 데이터 영향이 없다. 막으려면 우리 메뉴 항목 클릭 시점(`buildMenu`의 click 핸들러)에도 `closeSitePopupMenu()`를 한 번 더 호출하면 된다(선택).

### [INFO-2] PC 공지 `tr`의 UID 없는 `td.author`  (범위 밖)
- 웹진(`listStyle=webzine`)·핫딜 페이지의 상단 공지 행은 `td.author` 텍스트만 있고 `member_` 앵커가 없다(예: "공지", 핫딜 관리자 닉). `NICK_ROW`는 `tr`을 포함하지 않으므로 닉 폴백 대상이 아니다. 관리자 공지라 차단 수요가 거의 없으므로 결함으로 보지 않는다. 필요하면 별도 TODO로 다룬다.

---

## 차원별 양호 확인 (결함 아님)

- **정확성(#16)**: 이전 `._bd_mobile` 한정은 PC 오탐을 막으려는 목적이었다. 실측상 `.fm_best_widget`은 PC에서 UID 없는 위젯형 목록에만 쓰이고, 표형 목록·게시글 페이지에는 없다. 그래서 `_bd_mobile` 제거로 새로 생기는 오탐 경로가 없다. `getRowNick`은 `.author`를 우선 보며 행당 1개라 다른 `.author` 오인 여지가 없다. 숨김·복구는 기존 `data-fmkb-uid` + `unhideByUid` 그대로다. 알려진 한계(개명 누락·옛 닉 재사용 오차단)는 README·스킬에 PC 범위까지 넓혀 적었으므로 문서 기술과 실제 범위가 일치한다.
- **정확성(#18 focus)**: `focus()`는 `IS_TAB_VIEW && action=import`에서만 실행된다. store 미탑재 시에는 `init`이 그 전에 return하므로 disabled 버튼에 focus하는 경로가 없다. `focus()`의 scroll-into-view가 sticky 푸터와 함께 버튼을 보이게 한다. 데스크톱 팝업 경로에는 영향이 없다. 버튼 focus 상태에서 Enter/Space는 사용자 제스처로 파일 선택을 여는데, 이는 의도된 동작이다.
- **CSS(#18)**: 데스크톱 팝업(`pointer:fine`, 비탭)에는 sticky 규칙이 적용되지 않는다. 기존 `body{max-height:560px; flex column}` + `.fmkb-body{overflow-y:auto}` + `.fmkb-footer{flex:none}`으로 목록만 스크롤되는 구조가 그대로다. 탭 보기와 `pointer:coarse`는 `max-height:none`이라 문서(뷰포트)가 스크롤 주체가 되고, 푸터의 sticky 기준이 뷰포트가 되어 의도대로 동작한다. 푸터에 `background`가 이미 있어 겹친 목록이 비쳐 보이지 않는다. 같은 3줄 규칙이 두 곳에 중복되는 점은 사소하다(선택: 하나의 셀렉터 목록으로 합칠 수 있음).
- **정확성(#17)**: `fmkb-notice` id·클래스·CSS 변수를 참조하는 JS/CSS가 남아 있지 않다(grep 0). 헤더 주석(`popup.js:34`)도 라이브 반영을 설명한다.
- **보안**: 강조 `<mark>`는 `textContent`로, 나머지는 `createTextNode`로 채운다. `#popup_menu_area`는 style만 바꾸고 내용에는 손대지 않는다. 권한·host_permissions 무변경이다.
- **MV3**: manifest는 `version`만 0.7.2로 바뀌었다(패치 수정에 맞는 범프). `node --check`는 content 전 파일과 popup.js 모두 통과했다.

## 미검토

- **실 브라우저 E2E**: PC 위젯 행 숨김·해제 복구, 사이트 회원 메뉴 닫힘(#19), Firefox 탭 보기 sticky·focus(#18)를 실 Chrome·Firefox에서 클릭으로 확인하지 않았다. 정적 마크업(jsdom)과 사이트 JS 소스 분석으로만 판정했다.
- **핫딜 게시글 페이지·갤러리 보기**: 레이트리밋(보안 페이지)으로 수집하지 못했다. 게시글 하단에 위젯형 목록이 붙는 보드가 있다면 그 행도 닉 폴백으로 숨겨질 텐데, 이는 의도된 동작이므로 결함 가능성은 낮다.
- **Firefox Android 실기기**: 터치 팝업의 sticky 푸터는 사용자 실기기 게이트에서 확인해야 한다.
