# 코드 리뷰 보고서 — FMK-Blind

- 담당: extension-reviewer
- 갱신: 2026-10-05 (**이슈 #9 Firefox 가져오기 미저장 — 탭 보기 우회 리뷰**. 브랜치 `fix/firefox-import-tab`, 미커밋 변경분)
- 대상: `src/popup/popup.js`(`IS_TAB_VIEW`·`NEEDS_TAB_FOR_FILE_PICKER`·`openImportTab`·탭 보기 안내), `src/popup/popup.css`(`body.fmkb-tab-view`), `manifest.json`(ver 0.7.0→0.7.1). 동반 문서는 `README.md`·`PLAN.md`·`CLAUDE.md`·`.claude/skills/chrome-mv3-extension/SKILL.md`. `.claude/settings.json`은 무관한 로컬 변경이라 제외했다.
- 방법론: `.claude/skills/extension-code-review/SKILL.md` (코드 품질 6차원)
- 심각도: **blocker** > **major** > **minor**. 검토하지 못한 항목은 통과로 두지 않고 "미검토"로 분류한다.
- 상보성: store·계약은 변경되지 않았다(`importMany` 경로 그대로). 계약 재검증은 생략하고 팝업 분기 정확성, 에러 처리, CSS 상호작용, 권한, 문서 정합에 집중했다.
- 이전 보고서(2026-10-05 이슈 #8 닉네임 폴백 리뷰, 판정 MERGE)는 이번 변경과 범위가 달라 git 이력으로 대체한다.

> **요약:** Firefox 팝업(`moz-extension:`)에서만 가져오기를 일반 탭(`popup.html?view=tab&action=import`)으로 넘기는 우회다. Chrome 경로가 바뀌지 않았음을 jsdom 분기 테스트로 확인했다(`chrome-extension:`이면 파일 입력을 바로 클릭하고, 탭 생성과 body 클래스는 없다). URL은 확장 내부 상수이고 `innerHTML`은 쓰지 않으며 권한도 추가되지 않았다. 결함은 minor 4건으로, 모두 드문 실패 경로이거나 외관·문서 문제다. **최종 판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 4.**

## 진행 현황

| 차원 | 상태 | 비고 |
|------|------|------|
| 1. 정확성 | ✅ 검토완료 | Chrome 무변경·Firefox 팝업→탭·탭 보기 직접 입력 분기 모두 정상(아래 근거). `window.close()`는 `tabs.create` resolve 뒤에만 호출 → 경쟁 없음 |
| 2. 보안 | ✅ 검토완료 | URL은 `chrome.runtime.getURL` + 고정 쿼리(외부 입력 없음). 쿼리값은 `=== 'tab'`/`=== 'import'` 비교에만 쓰이고 출력되지 않음. 안내문은 `setIoStatus`→`textContent`. 결함 0 |
| 3. 견고성 | ✅ 검토완료 | minor 2(R1 `chrome.tabs` 부재 시 동기 throw가 Promise 체인 밖으로 새어 안내 없음, R2 연타 시 탭 중복 생성) |
| 4. 유지보수성 | ✅ 검토완료 | minor 1(R4 팝업 헤더 주석 미갱신·쿼리 이중 파싱, 기존 문구 드리프트) |
| 5. MV3/베스트프랙티스 | ✅ 검토완료 | `permissions: ["storage"]` 유지. `tabs.create`는 `tabs` 권한이 필요 없다(권한은 Tab의 url/title 같은 민감 필드 열람에만 필요). 버전 패치 범프 정합 |
| 6. 성능 | ✅ 검토완료 | 영향 없음(초기화 시 URLSearchParams 1~2회) |
| CSS(터치) | ✅ 검토완료 | minor 1(R3 Firefox Android 탭 보기에서 전폭인데 테두리·라운드·상단 여백이 남음, 외관만) |

> **최종 판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 4.**
> minor는 머지를 막지 않는다. R1·R2는 함께 고쳐도 몇 줄이라 이번 PR에 넣기를 권한다.

---

## 발견 사항 요약

| ID | 심각도 | 차원 | 제목 | 상태 |
|----|--------|------|------|------|
| R1 | minor | 견고성 | `chrome.tabs` 부재·동기 throw 시 Promise 체인 밖 예외 → 사용자 안내 없음. Firefox 전용 경로인데 `chrome.*` 프로미스 반환에 의존 | 권고(저비용) |
| R2 | minor | 견고성 | Firefox 팝업에서 가져오기 연타 시 탭이 여러 개 생성됨 | 권고(저비용) |
| R3 | minor | CSS/UX | `pointer:coarse`(Firefox Android) 탭 보기에서 전폭 body에 테두리·라운드·24px 여백이 남음 | 권고(외관) |
| R4 | minor | 유지보수성 | popup.js 헤더 독블록에 탭 보기 설명 없음, `URLSearchParams` 이중 파싱. 기존 문구 드리프트(헤더 "onChanged는 TODO", popup.html 새로고침 안내, popup-engineer.md:20) | 권고(문서) |
| INFO-1 | — | 범위 | Firefox에서 **내보내기**도 "항상 저장 위치 묻기" 설정이면 저장 대화상자가 팝업을 닫을 수 있음 | 확인 필요(이번 diff 범위 밖) |

---

## 검증 근거 (jsdom 분기 테스트)

`scratchpad/rv-popup.js`: 실제 `popup.html`·`popup.js`를 URL 스킴별로 로드하고 `chrome.tabs`/`window.close`/파일 입력 `click`을 스텁으로 바꿔 실행했다. `node --check src/popup/popup.js`도 통과했다.

| 케이스 | URL | 결과 |
|--------|-----|------|
| A Chrome 팝업 | `chrome-extension://…/popup.html` | `fileClick 1`, `tabs.create 0`, `close 0`, body 클래스 없음 → **Chrome 무변경** |
| B Firefox 팝업 | `moz-extension://…/popup.html` | `tabs.create 1`(`…?view=tab&action=import`), resolve 뒤 `close 1`, `fileClick 0` |
| C Firefox 탭 보기 | `…?view=tab&action=import` | `fmkb-tab-view`, 안내 "가져오기 버튼을 눌러 파일을 선택하세요.", 클릭 시 `fileClick 1`, 추가 탭 없음 |
| D `chrome.tabs` 미정의 | moz 팝업 | **Uncaught TypeError**, io-status 빈 값 → R1 |
| E `create`가 undefined 반환(콜백식) | moz 팝업 | 다음 마이크로태스크에 `close` 호출 → R1 보조 근거 |
| F 50ms 지연 + 연타 2회 | moz 팝업 | 탭 **2개** 생성 → R2 |
| G `create` reject | moz 팝업 | `close 0`, "가져오기 화면을 열지 못했습니다." 표시 → 정상 |

요청자가 실 Firefox 156 헤드리스(임시 애드온)로 돌린 E2E 9/9(탭 열림, 원 페이지 닫힘, 탭 내 직접 입력, Chrome 포맷 3명 추가, `storage.sync` 실제 기록, 재오픈 유지, 재가져오기 3명 중복)와 결과가 맞는다.

---

## 발견 상세

### [minor] R1 `tabs.create` 동기 실패가 Promise 체인 밖으로 샘 / Firefox 전용 경로가 `chrome.*` 프로미스에 의존  (차원: 견고성)
- 위치: `src/popup/popup.js:467-477` (`openImportTab`)
- 증거:
  ```js
  var url = chrome.runtime.getURL('src/popup/popup.html?view=tab&action=import');
  Promise.resolve(chrome.tabs.create({ url: url }))   // ← 인자 평가 중 throw는 .catch에 안 잡힘
    .then(function () { window.close(); })
    .catch(function (e) { ... setIoStatus('error', '가져오기 화면을 열지 못했습니다.'); });
  ```
  `chrome.tabs`가 없거나 `create`가 동기로 throw하면 `Promise.resolve(...)`가 만들어지기 전에 예외가 나서 `.catch`가 실행되지 않는다. 실측(D)에서는 Uncaught TypeError가 나고 io-status가 비어 있었다. 사용자는 버튼을 눌러도 아무 반응이 없다.
  또한 `Promise.resolve(x)`는 `create`가 콜백식으로 undefined를 반환하면 탭 생성을 기다리지 않고 바로 resolve한다(E). 이때는 실패를 감지하지 못한 채 `window.close()`가 호출된다. Chrome MV3와 현행 Firefox MV3의 `chrome.*`는 프로미스를 반환하므로(Firefox 156 E2E에서 확인) 지금 당장 문제는 아니다. 다만 이 경로는 Firefox에서만 타므로 프로미스 반환이 보장된 `browser.*`를 쓰는 편이 의도에 맞다.
  `window.close()`와 탭 생성 사이에 경쟁은 없다. `close`는 resolve 뒤에만 호출되고, 새 탭이 활성화되면 Firefox 팝업은 어차피 스스로 닫힌다. 그 경우 `.then`이 실행되지 않아도 탭은 부모 프로세스가 이미 생성한 상태다.
- 수정안: 생성 호출을 Promise 생성자 안으로 옮겨 동기 throw도 `.catch`로 모으고, `browser.tabs`를 우선 사용한다.
  ```js
  function openImportTab() {
    var url = chrome.runtime.getURL('src/popup/popup.html?view=tab&action=import');
    var tabsApi = (typeof browser !== 'undefined' && browser.tabs) || chrome.tabs;
    new Promise(function (resolve) {
      resolve(tabsApi.create({ url: url })); // 동기 throw도 reject로 변환
    })
      .then(function () { window.close(); })
      .catch(function (e) {
        console.error('[FMK-Blind popup] 가져오기 탭 열기 실패', e);
        setIoStatus('error', '가져오기 화면을 열지 못했습니다.');
      });
  }
  ```

### [minor] R2 가져오기 연타 시 탭 중복 생성  (차원: 견고성)
- 위치: `src/popup/popup.js:520-524` (가져오기 클릭 핸들러), `467-477`
- 증거: `NEEDS_TAB_FOR_FILE_PICKER` 분기에 진행 중 가드가 없다. 실측(F)에서 `create`가 50ms 걸릴 때 두 번 클릭하면 탭이 2개 생겼다. 실제 Firefox에서는 첫 탭이 활성화되면서 팝업이 곧 닫히므로 창이 좁지만, 느린 기기(Android)나 더블클릭에서는 일어날 수 있다.
- 수정안: 함수 앞에서 버튼을 비활성화하고 실패하면 다시 켠다(기존 `setIoBusy` 재사용).
  ```js
  function openImportTab() {
    setIoBusy(true);
    ...
      .catch(function (e) { ...; setIoBusy(false); });
  }
  ```

### [minor] R3 Firefox Android 탭 보기 외관  (차원: CSS/UX)
- 위치: `src/popup/popup.css:271-276` (`body.fmkb-tab-view`)와 `:282-287` (`@media (pointer: coarse) body`)
- 증거: 특이도는 `body.fmkb-tab-view`(0,1,1)가 미디어쿼리의 `body`(0,0,1)보다 높다. 탭 보기 규칙은 `width`를 정하지 않으므로 터치 환경에서는 `width:100%`가 적용된다. 이 부분은 주석이 말한 대로 의도에 맞다. 그러나 `margin: 24px auto`, `border: 1px`, `border-radius: 8px`가 그대로 남아 전폭 화면에서 위쪽 24px 여백과 둥근 모서리 테두리가 생긴다. `box-sizing: border-box`라 가로 스크롤은 생기지 않는다. 기능 영향은 없고 외관만의 문제다.
- 수정안: 터치 미디어쿼리 안에서 탭 보기 장식을 해제한다.
  ```css
  @media (pointer: coarse) {
    body.fmkb-tab-view { margin: 0; border: 0; border-radius: 0; }
  }
  ```

### [minor] R4 주석·문서 소폭 드리프트  (차원: 유지보수성)
- 위치·증거:
  1. `src/popup/popup.js:1-32` 헤더 독블록에는 내보내기/가져오기 설명은 있지만 이번 Firefox 탭 보기 우회(`?view=tab`, `moz-extension:` 판별)는 없다. 상수 옆 주석은 충분하지만, 파일 개요에서 이 팝업이 "탭으로도 열린다"는 사실이 빠져 있다. → 헤더에 한 단락을 추가한다.
  2. `popup.js:46`·`:533`에서 `new URLSearchParams(location.search)`를 두 번 파싱한다. → `var PARAMS = new URLSearchParams(location.search);`로 한 번만 만들어 재사용한다.
  3. (기존 드리프트, 이번 변경 이전부터 있음) `popup.js:30` "v1 제약: … onChanged는 TODO"와 `popup.html:28` "해제 후 이미 열린 페이지는 새로고침해야 반영됩니다"는 C9(onChanged 라이브 반영, 2026-06-15) 이후 사실이 아니다. `.claude/agents/popup-engineer.md:20` "내보내기/가져오기는 v1 범위 밖 — 만들지 않는다"도 v0.5.0 이후 사실이 아니다. 같은 파일을 만지는 김에 정리하기를 권한다(선택).
- 수정안: 위 문구를 정정한다(동작 무변경).

### [INFO-1] Firefox 내보내기와 저장 대화상자  (범위, 확인 필요)
- 위치: `src/popup/popup.js:309-367` (`onExport`, 이번 diff에서 변경 없음)
- 내용: Firefox에서 "파일 저장 위치를 항상 묻기"가 켜져 있으면 `a[download]` 클릭이 저장 대화상자를 연다. Bug 1292701과 같은 원리로 팝업이 닫힐 수 있고, `setTimeout(…, 0)` revoke와 겹치면 다운로드가 실패할 가능성이 있다. 기본 설정(바로 다운로드)에서는 문제가 없을 가능성이 높고, 이슈 #9의 범위(가져오기)도 아니다. 실 Firefox에서 해당 설정을 켜고 확인한 뒤, 재현되면 내보내기도 탭 보기로 넘기거나 revoke를 지연시킨다.

---

## 차원별 양호 확인 (결함 아님)

- **정확성**: `NEEDS_TAB_FOR_FILE_PICKER = !IS_TAB_VIEW && protocol === 'moz-extension:'`. Chrome(`chrome-extension:`)에서는 항상 false라 기존 경로와 바이트 단위로 같다. 탭 보기에서는 false라 무한 탭 생성 루프가 없다. 탭 보기 블록은 store 미탑재 시 `init`이 일찍 return한 뒤라 실행되지 않지만, 그 경우 버튼이 `showFatal`로 비활성화되므로 문제없다. 탭 보기도 `load`→`refresh`→`onChange`를 그대로 타서 다른 컨텍스트 변경을 실시간으로 반영한다. 가져오기는 reconcile된 메모리 맵 위에서 `importMany`를 실행하므로 장수명 탭이라도 stale 덮어쓰기가 없다(언로드 flush가 없으니 resurrection 경로도 없다).
- **보안**: 외부 입력이 URL을 구성하지 않는다. 쿼리 파라미터는 동등 비교에만 쓰인다. DOM 출력은 모두 `textContent`다. 새 권한·host_permissions·백그라운드가 없다.
- **MV3**: `tabs.create`에는 권한이 필요 없고 확장 페이지 URL을 여는 것도 허용된다(Chrome·Firefox 데스크톱·Android 공통). manifest는 버전만 0.7.0→0.7.1로 바뀌었다(패치 수정에 맞는 범프).
- **문서**: README(Firefox는 새 탭에서 한 번 더 누름, 이유 #9), PLAN Q7 보강, CLAUDE.md 변경 이력, chrome-mv3-extension 스킬(Firefox 팝업 네이티브 대화상자 규약, `tabs` 권한 불필요 명시)이 코드와 일치한다. store 계약·TODO는 바뀌지 않았으므로 갱신할 필요가 없다.

## 미검토

- **Firefox Android 실기기**: Fenix 팝업(별도 화면)에서도 파일 선택 시 팝업이 닫히는지, `tabs.create` 후 `window.close()`가 팝업 시트를 정상적으로 닫는지, 탭 보기의 터치 레이아웃(R3)을 확인하지 못했다. Android에서 팝업이 닫히지 않더라도 탭 우회는 동작하므로 기능상 손해는 없고 한 단계가 늘어날 뿐이다. 사용자 실기기 게이트에서 확인해야 한다.
- **실 Chrome 회귀**: 코드 경로가 바이트 단위로 같다는 것은 분기 테스트(A)로 확인했다. 실 Chrome에서 파일 선택 E2E는 이번에 다시 돌리지 않았다.
