> ⚠️ **정정(2026-06-15, team-lead)**: 아래 영속화 수정 리뷰의 "머지 가능(MERGE)"은 Node mock 기준이었고, 실제 Chrome에선 해제가 새로고침 후 되살아나는 **resurrection 버그가 잔존**했다(다중 컨텍스트·실 Chrome 직렬화 미재현). 실브라우저 콘솔로 원인 확정 후 언로드 flush(구 C8) 제거로 최종 해소. 상세: CLAUDE.md 변경 이력 / store-api-contract.md §3 C8.

# 코드 리뷰 보고서 — FMK-Blind

- 담당: extension-reviewer
- 갱신: 2026-06-15 (**영속화 버그 수정 리뷰 추가** — 맨 아래 "## 2026-06-15 영속화 수정 리뷰(block/unblock 즉시 awaitable + persist 직렬화)" 섹션)
- 갱신: 2026-06-15 (하드닝 재리뷰 — R1·R3 RESOLVED)
- 방법론: `.claude/skills/extension-code-review/SKILL.md` (코드 품질 6차원)
- 심각도: **blocker** > **major** > **minor** / 검토 불가 항목은 "미검토"로 분류(통과 처리 금지)
- 상보성: extension-qa(`.claude/workspace/qa-report.md`)가 **통합·계약·셀렉터·샤딩 정합성**을 GREEN 처리. 본 리뷰는 그 위의 **코드 자체 품질**(정확성·보안·견고성·유지보수성·MV3·성능)만 다루며, QA가 PASS한 계약 시그니처 일치는 재지적하지 않는다.

> **2026-06-15 하드닝 재리뷰 요약:** 사용자 요청으로 minor **R3(UID 정규식 토큰-앵커드)**·**R1(매직넘버 상수화)** 을 반영. content-engineer(R3 정규식 + R1 토스트)·popup-engineer(R1 검색 디바운스)가 수정. 실측 재검증 결과 **둘 다 RESOLVED**(동작 동치 + 회귀 안전망 강화). 신규/회귀 결함 0. 잔여 minor는 R2·R4 2건(전부 v1 수용 가능). **최종 판정: 머지 가능(MERGE) 유지.**

## 진행 현황

| 차원 | 상태 | 비고 |
|------|------|------|
| 1. 정확성 | ✅ 검토완료 | 로직/정규식/비동기 — 결함 0. **R3 토큰-앵커드 RESOLVED(동치+강화 실측)** |
| 2. 보안 | ✅ 검토완료 | XSS·최소권한 — **양호(결함 0)**. grep+node 실측. R3 후 UID 캡처 더 엄격(`\d+` 유지) |
| 3. 견고성 | ✅ 검토완료 | 폴백/언로드 flush 양호. 재진입 하드닝 노트 1(MINOR-R2, 잔존·v1 수용) |
| 4. 유지보수성 | ✅ 검토완료 | **R1 매직넘버 상수화 RESOLVED(토스트·검색 디바운스 실측)** |
| 5. MV3/베스트프랙티스 | ✅ 검토완료 | manifest 구조·네임스페이스 양호. **아이콘 에셋 4종 PNG 실측 PASS(2026-06-14)** |
| 6. 성능 | ✅ 검토완료 | 스캔 비용 양호. 대량목록 팝업 재렌더 minor 1(MINOR-R4, 잔존·v1 수용) |

> **최종 판정: 머지 가능 — blocker 0 / major 0 / minor 2 잔존(R2·R4, 전부 v1 수용 가능).**
> 하드닝 재리뷰(2026-06-15)로 **R1·R3 RESOLVED**. 보안(XSS·최소권한)·정확성·견고성·아이콘 에셋 전부 실측 기준 양호. 잔여 minor 2건은 머지를 막지 않음.

---

## 발견 사항 요약

| ID | 심각도 | 차원 | 제목 | 상태 |
|----|--------|------|------|------|
| MINOR-R1 | minor | 유지보수성 | 매직넘버(토스트 2000ms·검색 디바운스 60ms) 인라인 | ✅ **RESOLVED(2026-06-15)** |
| MINOR-R3 | minor | 정확성 | UID 셀렉터·정규식 비앵커드(이론적 오매칭, 현 마크업 무해) | ✅ **RESOLVED(2026-06-15, 토큰-앵커드)** |
| MINOR-R2 | minor | 견고성 | 모듈/컨텍스트메뉴 재주입 시 리스너 중복 가능(v1 미발생) | 권고(하드닝, 잔존) |
| MINOR-R4 | minor | 성능 | 팝업 대량목록 시 검색 키입력당 전체 재렌더 | 권고(잔존) |
| ICON | — | MV3 | 아이콘 에셋(16/32/48/128)·manifest 정합 | ✅ **PASS(실측)** |

---

## ✅ 보안 — 양호 (결함 0, 강조)

확장 리뷰의 최우선 위험인 **XSS/DOM 인젝션이 전 경로에서 안전**하게 처리됨을 실측 확인.

- **위험 싱크 0건**: `grep -rE 'innerHTML|outerHTML|insertAdjacentHTML|document.write|eval|new Function' src/` → **NONE**. 모든 DOM 구성은 `textContent`/`createTextNode`/`createElement`만 사용.
  - 팝업 닉네임/UID 렌더: `popup.js:141-181` `buildItem`이 전부 `textContent`/`createElement`.
  - 검색어 강조: `popup.js:71-94` `appendHighlighted`가 `<mark>` 노드를 만들고 `mark.textContent=...`로만 채움 → **외부(fmkorea) 닉네임을 HTML로 해석하지 않음**(XSS 차단). 주석(`popup.js:69-70`)에도 의도 명시.
  - 컨텍스트 메뉴 라벨: `40-contextmenu.js:24` `row.textContent = item.label`.
  - 토스트: `50-toast.js:21` `el.textContent = message`.
- **신뢰 경계**: 페이지 DOM에서 읽은 닉네임(`getNick`)은 항상 텍스트로만 흐름. UID는 정규식 `\d+`로 숫자만 캡처되어 `unhideByUid`의 속성 셀렉터(`30-hide.js:22`)에 들어가도 **셀렉터 인젝션 불가**(digit-only).
- **최소 권한**: `manifest.json:6` `permissions:["storage"]` 단독, `host_permissions` 없음. 코드 전체 `chrome.*` 사용은 `10-store.js`의 `storage.sync` + `runtime.lastError` 읽기뿐(`grep` 실측). 팝업의 `chrome.storage` 출현은 **주석 1줄**(직접접근 금지 명시)일 뿐 실호출 0.

---

## 정확성 (차원 1)

전반 양호. 비동기 흐름·정규식·경계조건 모두 계약과 일치.

- **비동기**: `99-main.js:20` `await store.load()` 1회 선행, 차단/해제는 `await store.block/unblock` 후 즉시 숨김/복구(C3 즉시성 준수). 팝업 `popup.js:225` `Promise.resolve(store.unblock(...)).then(refresh)` 안전.
- **정규식 `member_(\d+)`**(`00-namespace.js:20`): node 실측 — `"member_plate" => null`(정상 제외), `"member_515859774 member_plate" => 515859774`, 순서 뒤바뀜도 정상. **오캡처 없음**(아래 MINOR-R3의 이론적 토큰 제외).
- **closest 판정 순서**(`20-selectors.js:33-49`): ①댓글(`li[id^="comment_"]`) → ②게시글(`.rd_hd,.top_area`→`.rd`) → ③목록행(`tr,li`). PLAN/스킬 규칙과 1:1 일치(QA D 21/21 실측 PASS). `.rd` 미발견 시 `head` 폴백(`:44`)도 안전.
- **경계조건**: UID 없음 → `scan`/`contextmenu` 조용히 스킵(`30-hide.js:46`, `40-contextmenu.js:74`), 빈 목록 → 팝업 상태 메시지(`popup.js:198`), 빈 닉네임 → `(닉네임 없음)`(`popup.js:148-149`), 멱등 차단 → store가 nick만 갱신.

### [MINOR-R3] UID 셀렉터·정규식 비앵커드 — ✅ RESOLVED (2026-06-15, 토큰-앵커드)
- 위치: `src/content/20-selectors.js:12,20-35`(`extractUid`), 단일 출처 `00-namespace.js:20`(`NS.UID_REGEX=/member_(\d+)/`, 무수정)
- 조치(content-engineer, 단일 출처 순서 준수):
  1. **스킬 먼저 갱신** — `.claude/skills/fmk-dom-selectors/SKILL.md:21-25`: "class를 공백 토큰 분리 → 각 토큰 `^member_(\d+)$` 전체 일치 → 첫 매칭 캡처"로 UID 규칙을 토큰-앵커드로 명시(비앵커드 오캡처 제거 사유 기술).
  2. **구현 동기화** — `20-selectors.js`: `const TOKEN_UID_REGEX = new RegExp('^' + NS.UID_REGEX.source + '$')`(=`/^member_(\d+)$/`)로 **숫자 패턴은 단일 출처 `NS.UID_REGEX`에 그대로 두고 적용만 토큰 경계로 앵커링**. `extractUid`는 `cls.split(/\s+/)` 후 토큰별 `exec`, 첫 매칭 `m[1]` 반환·없으면 `null`. → 00-namespace.js 무수정 + `NS.UID_REGEX` dead 회피.
  3. **PLAN.md:28** 부수 정렬(토큰-앵커드).
- 검증(node 실측, old≡new vs divergence):
  ```
  [A] 현 마크업 동치(old≡new):                      [B] 오캡처 제거(old→new):
   "member_123456 member_plate" → 123456 ≡          "nonmember_123" old=123 → new=null ✓
   "member_plate member_123456" → 123456 ≡(순서무관)  "xmember_99 foo" old=99  → new=null ✓
   "member_plate"               → null   ≡          "remember_7"     old=7   → new=null ✓
   ""(UID 없음)                  → null   ≡          "member_12abc"   old=12  → new=null ✓
  ```
  - **단일출처 일관성(grep 실측)**: `NS.UID_REGEX`는 `00-namespace.js:20` 단일 정의 → `20-selectors.js:12`에서 `.source`로만 파생. **모든 UID 추출이 토큰-앵커드 `extractUid` 하나를 경유**(`30-hide.js:34,45`·`40-contextmenu.js:72`) → 비앵커드 정규식 우회 소비자 0. 하드닝이 scan/hide/contextmenu 전 경로에 균일 적용.
  - `node --check` 통과. 보안: UID 캡처는 여전히 `\d+`(셀렉터 인젝션 불가)이며 토큰 앵커링으로 **더 엄격**.
- 판정: **RESOLVED.** 현 마크업 동작 동치(회귀 0) + 마크업 회귀 시 오캡처 원천 차단(안전망). 단일 출처(스킬→구현→PLAN) 순서·1:1 동기화 준수.
- (선택·결함 아님) `00-namespace.js:19` 주석은 `NS.UID_REGEX`의 **숫자 패턴 자체**를 기술(여전히 정확). 적용 측 토큰-앵커드는 `20-selectors.js:9-12`가 충분히 문서화 → 0비용 동기화 폴리시 정도, 머지 영향 없음.

---

## 견고성 (차원 3)

에러 폴백·언로드 flush 양호.

- **폴백**: store 미탑재/load 실패 시 차단 없이 정상 노출(`99-main.js:14,22`), storage 미가용 시 메모리 전용(`10-store.js:126,216`), sync 쓰기 실패 시 throw 없이 재시도 예약(C7, `:166-170`). 팝업도 fatal 가드(`popup.js:117-125,252-262`).
- **생명주기**: 디바운스 쓰기를 `pagehide`/`visibilitychange(hidden)`에서 자동 flush(`10-store.js:197-211`) — MAJOR-1 내부 보강(QA RESOLVED 15/15). `persistOnce`가 변경 없으면 early-return(`:156`)하여 탭 전환마다 불필요 쓰기 없음(쿼터 보호 양호).
- **컨텍스트 메뉴 닫힘**: click/scroll(capture)/blur/Escape 다중 경로 닫힘(`40-contextmenu.js:92-97`), 항목 클릭 시 `stopPropagation`으로 바깥 click과 충돌 방지(`:27`). 메뉴 재오픈 시 `closeMenu` 선행(`:39`).

### [MINOR-R2] 모듈/컨텍스트메뉴 재주입 시 리스너 중복 등록 가능 (하드닝)
- 위치: `src/content/40-contextmenu.js:60-97`(`install`이 document에 `contextmenu`/`click`/`scroll`/`keydown`, window에 `blur` 등록) ← `99-main.js:30`에서 호출. 재진입 가드는 **store(`10-store.js:27` `if(root.FMKBlind.store) return`)만** 존재.
- 증거: 20/30/40/50/99 모듈은 재실행 시 `NS.selectors`/`NS.hide`/`NS.contextmenu` 등을 **무조건 재할당**하고, `main()`이 재실행되면 `install()`이 다시 호출되어 document 리스너가 누적 → 우클릭 1회에 메뉴 중복 생성·핸들러 중복 실행 가능.
- 영향: **v1은 manifest 정적 주입 1회뿐 → 현재 트리거 경로 없음**(범위 내 무해). 향후 programmatic injection이나 SPA식 재실행(TODO MutationObserver와 무관)을 도입하면 잠재 결함.
- 수정안(선택, v1 필수 아님): `install` 1회 가드(`if (NS._cmInstalled) return; NS._cmInstalled = true;`) 또는 각 모듈 상단에 store식 멱등 가드(`if (NS.hide) return;`). 비용 거의 0, 미래 회귀 예방.

---

## 유지보수성 (차원 4)

가독성·네이밍 양호(IIFE 격리, JSDoc, 주석과 코드 일치). 죽은 코드 0(QA CLEANUP-1 RESOLVED 재확인: `src/popup`에 `store.flush()` **호출 0**, "flush"는 설명 주석 4곳뿐 — 호출부 아님).

### [MINOR-R1] 매직넘버 인라인 — ✅ RESOLVED (2026-06-15)
- 위치: `src/content/50-toast.js:9,35`, `src/popup/popup.js:28,275`
- 조치:
  - **토스트(content-engineer)** — `50-toast.js:9` `const TOAST_DURATION_MS = 2000;`(의도 주석 L8) 추출, `setTimeout(...:35)`에서 참조. `offsetWidth`(L28)는 리플로우 트리거라 상수 대상 아님(올바른 판단).
  - **검색 디바운스(popup-engineer)** — `popup.js:28` `var SEARCH_DEBOUNCE_MS = 60;`(의도 주석 L26-27) 추출, `debounce(...,SEARCH_DEBOUNCE_MS)`(L275)에서 참조.
- 검증: `grep '\b2000\b' 50-toast.js` → 선언 1줄만, `grep '\b60\b' popup.js` → 선언 1줄만(둘 다 사용처 0 잔류). `node --check` 양 파일 통과. 값/동작 동치(2000ms·60ms 불변), store API·시그니처 무변경.
- 판정: **RESOLVED.** 가독성·튜닝 용이성 확보, 동작 변화 0.

---

## MV3 / 크롬 베스트프랙티스 (차원 5)

- **manifest 구조**: `manifest_version:3`, content_scripts `js` 7개 로드순서(00→10→...→99) 정확, store(10)가 소비자(20~99) 앞, `run_at:document_end`, `css:["src/content.css"]` 실재. (QA E PASS — 재지적 아님, 구조적 결함 0 확인만.)
- **네임스페이스 격리**: 전 모듈 IIFE + `'use strict'`, 단일 전역 `window.FMKBlind`로 병합. 전역 오염 없음. content/popup이 `10-store.js` **동일 파일** 공유(사본 없음).

### [ICON] 아이콘 에셋 — ✅ PASS (PNG 헤더/CRC + manifest 정합 실측, 2026-06-14)
content-engineer 전달분(`icons/icon{16,32,48,128}.png` + manifest `icons`/`action.default_icon` 맵)을 Bash 실측 검증.

- **유효 PNG 4종**: magic `89504e470d0a1a0a` OK, 청크 구조 `[IHDR,IDAT,IEND]` 정상, **CRC32 전 청크 무결(crcBad=0)**, IEND 종료자 존재 → 순수 zlib/struct 수작업 생성이지만 **표준 디코더 호환 유효 PNG**. `file(1)`도 동일 확인(8-bit RGBA, non-interlaced).
- **크기 정합**: IHDR width×height = 파일명과 일치 — icon16=16×16, icon32=32×32, icon48=48×48, icon128=128×128. bitdepth=8, colortype=6(RGBA).
- **manifest 정합**: 최상위 `icons{16,32,48,128}` ↔ `action.default_icon{16,32,48,128}` **키·경로 완전 일치**, 4경로 전부 실재(`fs.existsSync` 실측). 키 누락/경로 드리프트 0.
- **회귀 없음**: 아이콘 추가 외 manifest 필드 보존 확인 — `permissions:["storage"]`(host_permissions 없음), `content_scripts.js` 7개 순서, `run_at:document_end`, `css`, `default_popup` 불변. JSON 파싱 유효.
- 판정: **PASS**. MV3 베스트프랙티스 아이콘 요건(4크기·유효 PNG·경로 실재·icons↔default_icon 정합) 충족.

---

## 성능 (차원 6)

- **스캔 비용**: `scan`/`hideByUid`는 `querySelectorAll('a[class*="member_"]')` 1회 + 앵커당 O(1)(정규식+`Map.has`). 페이지당 앵커 수백 규모에서 양호. 인라인 style 미사용, 숨김은 CSS 클래스 토글(`30-hide.js`/`content.css`)로 리플로우 최소.
- **팝업 검색 캐시**: `popup.js:34` `allItems` 캐시 위에서만 필터(키입력마다 store 재호출 안 함) — 적절.

### [MINOR-R4] 팝업 대량목록 시 검색 키입력당 전체 재렌더
- 위치: `src/popup/popup.js:265-271`(input → `render` 전체), `:183-217`(`render`가 `els.list.textContent=''` 후 필터 결과 **전부** DocumentFragment 재구축)
- 증거: 검색은 60ms 디바운스가 있으나, 매 렌더가 목록 DOM을 통째로 비우고 재생성. 항목이 수백~수천이면 키입력당 전체 재구축 비용.
- 영향: sync 한도(~100KB)로 항목 상한이 제한적이라 **v1 실사용 규모에선 대체로 무난**. 수천 명대(압축 TODO 이후)에서 입력 지연 여지.
- 수정안(선택, v1 필수 아님): 표시 결과 상한(예: 상위 N + "더 보기") 또는 증분 갱신/가상 스크롤. 현재는 권고 수준.

---

## 범위 밖 (결함 아님 — TODO v1 의도적 제외)
다음은 미구현이지만 **결함으로 보고하지 않음**(TODO.md / PLAN 의도적 제외): MutationObserver 증분처리, `chrome.storage.onChanged` 무새로고침 반영, 모바일(`m.fmkorea.com`), 저장 압축, 내보내기/가져오기, 컨텍스트메뉴 메모, 자기차단 가드, 인용/멘션 처리, 홈/베스트 통합목록 폴백.

## QA 소관 — 재지적 안 함 (상보성)
- MAJOR-1(디바운스 유실): QA **RESOLVED**(store 내부 자동 flush). 코드 확인만(`10-store.js:197-211`).
- MINOR-1(FOUC): QA v1 수용. 비동기 storage 구조의 내재적 한계 — 동의, 재지적 안 함.
- 계약 6 시그니처 일치, 경계면(B/C/D/F): QA PASS — 재검증 생략.

---

## 종합 판정

- **최종 종합 판정: 머지 가능 (MERGE).** blocker 0 / major 0 / minor 2 잔존(R2·R4). 6차원 전부 검토완료(미검토 0).
- **하드닝 재리뷰(2026-06-15)로 R1·R3 RESOLVED**: R3(UID 추출 토큰-앵커드 `/^member_(\d+)$/` — 현 마크업 동치 6/6 + 오캡처 제거 4/4, 단일출처 스킬→구현→PLAN 동기화)·R1(토스트 `TOAST_DURATION_MS`·검색 `SEARCH_DEBOUNCE_MS` 상수화 — 값/동작 동치). 동작 변경 0(하드닝/리팩터만), 회귀·신규 결함 0.
- 보안(XSS 싱크 0·최소권한 `["storage"]`·UID `\d+` 캡처 더 엄격)·정확성·견고성(폴백·언로드 flush)·MV3(아이콘 4종 PNG/CRC + manifest 정합)·성능 모두 실측 기준 양호.
- 잔여 minor 2건(R2 재주입 리스너 하드닝 / R4 팝업 대량목록 재렌더)은 **v1 수용 가능**으로 머지를 막지 않음. 후속 하드닝 권고로 남긴다.

## 검토 아티팩트(재현용)
- **[2026-06-15 재리뷰]** `node --check` 20-selectors.js·50-toast.js·popup.js 통과
- **[2026-06-15 재리뷰]** R3 old≡new node 증명: 현 마크업 6케이스 전체 동치(`member_123456 member_plate→123456`·순서무관·`member_plate→null`·`""→null`) + 이론적 오캡처 4케이스 강화(`nonmember_123`/`xmember_99`/`remember_7`/`member_12abc` old=캡처→new=null)
- **[2026-06-15 재리뷰]** 단일출처 grep: `NS.UID_REGEX` 정의 1곳(`00-namespace.js:20`)→`.source` 파생 1곳(`20-selectors.js:12`), UID 추출 전 경로가 `extractUid` 경유(`30-hide.js:34,45`·`40-contextmenu.js:72`), 비앵커드 우회 0
- **[2026-06-15 재리뷰]** R1 잔류 매직넘버 grep: `2000`(50-toast.js)·`60`(popup.js) 각 선언 1줄만(사용처 0)
- `grep -rE 'innerHTML|outerHTML|insertAdjacentHTML|document.write|eval|new Function' src/` → NONE(XSS 싱크 0)
- `grep -rE 'chrome\.' src/` → `10-store.js`만(권한 최소화 실측), 팝업은 주석 1
- 아이콘 실측: `file(1)` + PNG IHDR/CRC32 파서(4종 magic OK·`[IHDR,IDAT,IEND]`·crcBad=0·dims 16/32/48/128·RGBA8) + manifest 아이콘 맵 정합(키·경로·실재·필드보존) → ICON PASS

---

## 2026-06-15 영속화 수정 리뷰 (block/unblock 즉시 awaitable + persist 직렬화)

**대상 변경**(부분 재실행, 버그 수정):
- `src/content/10-store.js`: `block`(348-358)/`unblock`(367-371)이 `schedulePersist`(500ms 디바운스)+`Promise.resolve()` 대신 **`flushPending()` 반환**(즉시·awaitable 영속화). `unblock` no-op은 `Promise.resolve()` 유지.
- 신설 `persistNow()`(188-208): in-flight Promise 체인(`persistInFlight`) + dirty 플래그(`persistDirty`) coalesce로 **persist 직렬화**(재진입/경쟁 안전). `schedulePersist`(210-216)·`flushPending`(224-227) 모두 `persistNow` 경유.
- `pagehide`/`visibilitychange(hidden)` 자동 flush(C8, 234-248)는 **보조 안전망**으로 잔존.
- `src/popup/popup.js`(Task #5): 헤더 주석(14-18)·`onUnblock` 주석(229-233)을 갱신된 C3(resolve=영속완료) 의미로 동기화. 코드 로직 무변경.
- 계약 `.claude/workspace/store-api-contract.md`: C3 갱신(즉시성+영속완료), §2 block/unblock JSDoc, §4 소비자 패턴, §5 내부 레이아웃(직렬화·즉시쓰기+디바운스 폴백) 갱신.

> **수정 리뷰 요약: blocker 0 / major 0 / minor 0 잔존(R5b RESOLVED) / 정보성 1(I1, v1 수용).** 6차원 전부 검토완료. 핵심 변경(직렬화·resolve 타이밍·coalesce·실패 폴백)을 node 목 하네스로 실측 검증(23/23 PASS). 공개 6-API 불변·`flush`/`persistNow`/`flushPending` 비노출 실측. 계약·popup 주석 동기화 정확. 유일 minor(R5b 헤더 주석 드리프트)는 storage-engineer가 즉시 반영해 **RESOLVED**(주석 전용, 동작 0). **판정: 머지 가능(MERGE).**

### 정확성 (차원 1) — ✅ 양호 (실측)
가장 위험한 영역(직렬화·resolve 타이밍·재진입). node 목으로 직접 실측:
- **resolve 타이밍 = 영속화 완료**: `block`/`unblock` 반환 Promise는 메모리는 동기 즉시 반영(C3 즉시성 유지, `isBlocked` 곧바로 정확)하되, **실제 `chrome.storage.sync.set` 완료 후에만 resolve**한다. 실측 T1: latency 20ms 목에서 resolve 전 backend 비어있고 resolve 후 `bl_0`+`bl_meta` 기록 확인. `flushPending`→`persistNow`→`run()` IIFE가 동기 진입해 `persistOnce`의 첫 `await syncSet` 직전까지 동기 실행 → **sync.set IPC가 호출 태스크(팝업 클릭 핸들러) 내에서 디스패치**됨(popup.js:229-231 주석 정확). 단수명 팝업 종료에도 유실 없음.
- **직렬화/재진입 안전(persistNow)**: 연속 `block`→`unblock`(동시) 시 두 `persistOnce`가 겹쳐 `persistedChunks` 스냅샷(스냅샷→diff→스냅샷갱신)이 꼬일 위험을 in-flight 체인으로 제거. 실측 T2: `222 차단 후 [111 차단 + 222 해제] 동시` → reload 시 backend가 최종 메모리(111만)와 정확히 일치(꼬임 0). T11: 5건 동시 호출 전부 영속 + 직렬(set 콜백 비중첩), coalesce로 `sync.set` 5→2회 축소.
- **coalesce 정합 + 합류 호출 resolve 타이밍**: 진행 중 persist에 들어온 변경은 `persistDirty`로 표시→체인 종료 후 1회 더 실행. 실측 T3: `block(1)`+`block(2)`+`block(3)` 동시 → 3건 모두 영속. **합류 호출도 자기 데이터 영속 후 resolve**(T4·T10: 늦게 합류한 호출의 반환 Promise=`persistInFlight` 꼬리를 await → dirty 재실행 iteration에 자기 변경 포함되어 backend 반영 확인). 이벤트루프 분석: 합류 호출은 별도 매크로태스크라 `.then(()=>persistInFlight=null)` 마이크로태스크가 먼저 드레인 → in-flight 판정에 경합 갭 없음.
- **unblock no-op**: 삭제 대상 없으면 `flushPending` 미호출·`Promise.resolve()`. 실측 T6: 없는 uid 해제는 `sync.set` 0회(불필요 쓰기 없음).
- **멱등 재차단**: 동일 nick 재차단은 메모리 무변경 → `persistOnce` 변경없음 early-return(:164)으로 `sync.set` 0회. nick 변경 시에만 1회 쓰기(T8).
- (정보) `persistNow`의 `persistInFlight = chain.then(ok, err)`의 reject 핸들러(204-206)는 `persistOnce`가 에러를 흡수(C7 try/catch)하므로 실질 도달 불가한 방어 코드 — 결함 아님(올바른 보수적 처리).

### 견고성 (차원 3) — ✅ 양호 (실측)
- **쓰기 실패 폴백(C7) 유지**: set 실패 주입 시 `block`이 throw하지 않고(메모리 유지) `persistOnce` catch→`schedulePersist`(500ms) 재시도. 실측 T5: 첫 set 실패 후 디바운스 재시도로 결국 backend 영속. 즉시쓰기 전환 후에도 C7 경로 정상.
- **언로드 안전망 잔존**: `pagehide`/`visibilitychange(hidden)` 자동 flush(C8) 그대로 유지(:234-248). 즉시쓰기로 주 경로는 보강됐으나, C7 재시도로 생긴 보류 타이머가 언로드 시점에 남아있을 수 있어 **보조 안전망으로 유의미**(잔존 타당). `pagehide` 리스너 등록 실측 확인.
- **stale 청크 정리 정합**: 대량→소량 해제 후에도 유령 키 부활 없음. 실측 T12: 200건→5건 해제 시 청크 4→1 감소, reload count=5(정확).
- **persist 실패 시 스냅샷 불변**: `persistedChunks`/`metaPersisted`는 set 성공 시에만 갱신(:171-173) → 실패 후 재시도가 변경분 재계산. 직렬화로 실패-재시도 중 다른 persist가 끼어들지 않음.

### 견고성 — [MINOR-R5] 레이트리밋 보호 약화는 v1 무해(정보성 I1과 동일 근거)
- 위치/성격: 즉시쓰기 전환으로 500ms 디바운스의 쓰기 합치기(분당 120/시간당 1,800 한도 보호)가 **수동 동작 경로에서 사라짐**. 변경 전엔 0.5s 내 연속 동작이 1회로 합쳐졌으나, 이제 awaited 순차 호출은 각각 1회 쓰기.
- 영향: **v1 무해.** `block`/`unblock`은 우클릭·팝업 버튼의 **수동 사용자 동작**이라 사람이 120/min을 칠 수 없음(team-lead 사전 평가 일치). 동시 도착분은 coalesce로 자동 축소(T11). 한도 초과 시 C7 catch→디바운스 재시도로 그레이스풀(T5). → **결함 아님, v1 수용**(정보성으로 기록). 후속(대량 가져오기 TODO 도입 시)엔 배치 쓰기 권고.

### 유지보수성 (차원 4) — ✅ 양호 (minor 1)
- **주석/코드 일치(핵심 변경부)**: `persistNow`(181-187)·`flushPending`(218-223)·`block`/`unblock` JSDoc(339-366) 모두 새 동작(즉시·직렬·resolve=영속완료)을 정확히 기술. popup.js 헤더(14-18)·`onUnblock`(229-233) 주석과 계약 C3·§5도 정확히 동기화(아래 실측). 죽은 코드 0(`flush`/`persistNow` 비공개·`schedulePersist`는 재시도·디바운스 경로에서 사용).
- **[MINOR-R5b] 모듈 헤더 주석 드리프트 — ✅ RESOLVED (2026-06-15)**: (지적) `10-store.js:17` 헤더가 쓰기 정책을 "쓰기 디바운스(분당 120 / 시간당 1,800 보호)"로만 요약 → 즉시쓰기 전환(주 경로) 미반영. (조치, storage-engineer) 헤더 `15-19`를 4줄로 확장 동기화: 즉시·직렬 영속화(resolve=sync 쓰기 완료 C3)·변경 청크 set·stale remove / persistNow 직렬화(in-flight 체인+dirty coalesce, 재진입 안전) / 레이트리밋 초과 시 C7 폴백·디바운스는 재시도·언로드 안전망 경로. **인라인 docs·계약 §5와 일치.** (검증, 디스크 재독+grep) OLD "쓰기 디바운스(분당…" 헤더 문구 제거 확인, `node --check` 재통과, 공개 6-API 불변·`flush`/`persistNow`/`flushPending` 비노출 재확인 — **주석 전용 변경(동작/시그니처 0)**. `:395-396` "보류 디바운스 쓰기"는 C7 재시도 타이머가 언로드 시 잔존 가능하므로 정확 — 그대로 둠(올바른 판단).
- 매직넘버: `DEBOUNCE_MS`(:34) 상수 유지, 신규 매직넘버 없음. `persistInFlight`/`persistDirty` 네이밍 명확.

### MV3 / 베스트프랙티스 (차원 5) — ✅ 양호 (실측)
- **공개 API 표면 불변**: `Object.keys(store)` = `["block","count","isBlocked","list","load","unblock"]` 정확히 6. `store.flush`/`store.persistNow`/`store.flushPending` **전부 `undefined`**(내부 전용) 실측. 계약 v1 FROZEN 6 시그니처 회귀 0.
- **전역 네임스페이스**: 전 선언이 IIFE+`'use strict'` 내부, 전역 할당은 `root.FMKBlind`(:26,:398)뿐. `persistNow` 등 신규 내부 상태(`persistInFlight`/`persistDirty`)도 IIFE 클로저 변수 — 전역 누수 0(grep 실측).
- content/popup이 `10-store.js` 동일 파일 공유(사본 없음) — 변경이 양 컨텍스트에 단일 출처로 반영.

### 성능 (차원 6) — ✅ 양호
- 즉시쓰기 빈도: 수동 동작이라 무해(MINOR-R5/I1 참조). coalesce가 동시 변경을 적은 `sync.set`으로 축소(T11: 5→2). `persistOnce` 변경없음 early-return(:164)으로 멱등/무변경 호출의 불필요 쓰기 0(T6·T8).
- persist 직렬화는 추가 비용 거의 0(Promise 체인 1개). 청킹/diff 비용은 변경 전과 동일.

### QA 소관 — 재지적 안 함 (상보성)
QA(Task #2/#3)가 영속화 28/28 + 샤딩 25/25 + DOM 21/21 PASS로 **통합·계약 정합성·소비자 회귀**를 GREEN 처리. 본 리뷰는 그 위 **코드 자체 품질**만 다룸. 계약 시그니처 일치·경계면(B/C)·소비자 await 구조 무변경은 QA 소관이라 재검증 생략.

### 수정 리뷰 종합 판정
- **머지 가능 (MERGE).** 이번 영속화 수정분: blocker 0 / major 0 / minor 0 잔존(R5b RESOLVED) / 정보성 1(R5/I1 레이트리밋 보호 약화, v1 수용). 6차원 전부 검토완료(미검토 0).
- R5b(헤더 주석 드리프트)는 storage-engineer가 헤더 `15-19`로 즉시 동기화 반영 → **RESOLVED**(주석 전용, `node --check` 통과·공개 6-API 불변·내부 함수 비노출 재확인). 잔여 minor 0.
- 핵심 변경(직렬화·resolve=영속완료·coalesce·실패 폴백)은 node 목 하네스 실측으로 **정확성·견고성 PASS**(`/tmp/store_review_test.js` 18/18 + `/tmp/store_review_test2.js` 5/5 = 23/23). 공개 6-API 불변·내부 함수 비노출·네임스페이스 무누수·계약/popup 주석 동기화 정확 실측.
- 영속화 누락 버그(팝업 unblock 후 새로고침 시 차단 잔존)는 resolve=sync-쓰기-완료 전환으로 근본 수정됨. 보안(XSS·최소권한)은 이번 변경 무관·무영향(신규 DOM 싱크/권한 0).

### 수정 리뷰 검토 아티팩트(재현용)
- `node --check` 10-store.js·popup.js·99-main.js 통과
- `/tmp/store_review_test.js` (18/18): T1 resolve=쓰기완료·T2 직렬화 스냅샷 무꼬임·T3 coalesce 3건·T4 합류호출 resolve 타이밍·T5 C7 실패 폴백·T6 no-op 무쓰기·T7 체인 재시작·T8 멱등 무쓰기/nick변경 1쓰기
- `/tmp/store_review_test2.js` (5/5): T9 첫호출 첫iteration 포함·T10 합류호출 자기데이터 영속후 resolve·T11 5동시→직렬 coalesce(set 2회)·T12 stale 청크 정리(200→5, 청크 4→1, reload 무부활)
- 공개 API 실측: `Object.keys(store)`=6, `store.flush/persistNow/flushPending===undefined`, pagehide 리스너 등록
- 네임스페이스 grep: 전역 할당 `root.FMKBlind`(:26,:398)만, 신규 내부 상태 클로저 격리
- 계약 동기화 확인: C3(:109 즉시성+영속완료) / §2 block·unblock JSDoc(:64-81) / §4 popup 패턴(:133-140) / §5 직렬화·즉시쓰기+디바운스 폴백(:152-154) — 코드와 1:1 일치
- popup 주석 동기화: 헤더(:14-18)·onUnblock(:229-233) — "unblock 반환 Promise=영속완료, .catch는 동기 예외 방어, C8은 잔존 안전망" 정확

---

## 2026-06-15 resurrection 수정 리뷰 (언로드 자동 flush 제거 + 진단 로그 클린업)

**대상 변경**(부분 재실행, 정정 수정 — `src/content/10-store.js`만):
- **언로드 자동 flush 제거(구 C8 폐지)**: 과거 `registerUnloadFlush()`가 `window 'pagehide'` + `document 'visibilitychange'(hidden)`에서 `flushPending()`을 호출하던 안전망을 **완전 삭제**. 코드엔 `10-store.js:231-237` `// [제거됨] …` 사유 주석만 남고, IIFE 끝의 `registerUnloadFlush()` 호출도 삭제.
- **진단 로그 클린업**: 직전 디버깅에 쓰던 `console.log('[FMKBlind dbg]…')`/`DBG` 일체 제거.
- 배경(실브라우저 확정): 즉시-영속화 전환 후에도 실 Chrome에서 해제가 새로고침 후 되살아남. 진짜 원인 = 열린 fmkorea 탭의 **stale content script**가 새로고침(`pagehide`) 시 자기 옛 메모리 맵을 sync에 되씀(resurrection). 실 Chrome 직렬화/구조화복제 차이로 `persistOnce`의 청크 diff(`persistedChunks[i] !== newVals[i]`, JSON 문자열 비교)가 거짓 양성이 되어 stale 맵을 기록한 것으로 추정. 비울 보류 쓰기가 없는 즉시-영속화에선 언로드 flush가 무익·유해 → 제거. **사용자 실브라우저 재현으로 수정 확인됨.**

> **검증 방법론 주의(직전 거짓 PASS의 교훈):** 직전 영속화 라운드는 Node mock 28/28 PASS·리뷰 MERGE였으나 실 Chrome에선 버그가 잔존했다. mock은 **실 Chrome 직렬화·다중 컨텍스트(탭↔팝업 stale)를 재현 못 한다.** 따라서 이번 판정의 1차 근거는 **코드 흐름 추론**이며, mock 하네스(다중 store 인스턴스가 한 sync 공유)는 **보조 확인일 뿐 최종 판정이 아니다.** 실브라우저 재현이 최종 판정이다(이미 사용자가 확인).

> **수정 리뷰 요약: blocker 0 / major 0 / minor 1(R6, popup 주석 드리프트 — 코드 무관·동작 0) / 정보성 1(I2, 알려진 잔여 한계).** 6차원 검토완료. 핵심(언로드 flush 제거가 정상 쓰기 유실을 만들지 않는가, C7 재시도×언로드, 죽은 코드 0, 로그 0, 공개 6-API 불변)을 코드 흐름 + 다중 컨텍스트 mock으로 점검. **판정: 머지 가능(MERGE).**

### 1. 정확성/회귀 — 언로드 flush 제거로 정상 쓰기 유실 경로 신설 안 됨 — ✅ 양호
- **핵심 근거(코드 흐름)**: `block`(`10-store.js:337-347`)·`unblock`(`:356-360`)은 메모리 동기 갱신 후 `return flushPending()`. `flushPending`(`:226-229`)은 보류 타이머를 비우고 `persistNow()`(`:190-210`) 반환 → `persistOnce()`(`:135-181`)가 **동기 진입**해 변경분 계산 후 첫 `await syncSet`(`:171`) 직전까지 동기 실행. `syncSet`(`:84-93`)은 `chrome.storage.sync.set`을 **호출 즉시(동기)** 디스패치하고 콜백 Promise만 await한다. 즉 **sync.set IPC 디스패치는 호출 태스크(우클릭/팝업 클릭 핸들러) 내에서 이미 일어난다** → 언로드 안전망 없이도 단발 동작의 쓰기는 발신됨. 과거 안전망은 "디바운스로 *미발화된* 보류 쓰기"를 살리기 위한 것인데, 즉시-영속화엔 그런 보류 쓰기가 **존재하지 않으므로** 제거해도 유실 경로가 신설되지 않는다.
- **mock 보조 확인(`/tmp/store_resurrection_test.js` R-B 2/2)**: 안전망 없는 단일 인스턴스에서 `block('777')` resolve 직후 디스크에 `777` 존재, `unblock('777')` resolve 직후 디스크에서 제거 — **resolve=쓰기완료가 안전망 없이도 성립**.
- **resurrection 제거 입증(같은 하네스 R-A 4/4)**: 두 store 인스턴스(tab+popup)가 한 sync 공유. popup이 `222` 해제 → 디스크에서 사라짐. 옛 stale tab(메모리 `{111,222}` 유지)이 언로드 이벤트를 받아도 **되쓰기 통로(리스너)가 없어** `222`가 되살아나지 않음(`111`만 잔존). 구 코드라면 stale 맵을 flush해 `222` 부활.

### 2. C7 실패 재시도 × 언로드 상호작용 — ✅ 수용 가능 엣지(과민 대응 금지 동의)
- **흐름**: sync 쓰기 실패 시 `persistOnce` catch(`:176-180`)가 throw 없이 `schedulePersist()`(`:212-218`, 500ms)로 재시도 예약. 그 500ms 창 안에 페이지가 언로드되면, 이제 언로드 flush가 없으므로 **그 재시도 타이머는 유실**된다.
- **평가**: 수용 가능. (a) 그 시점의 쓰기는 **이미 storage가 거부(실패)한 상태**라 "성공한 쓰기를 잃는" 것이 아니다. (b) 메모리만 갱신된 상태이고, 다음 동작이나 어떤 컨텍스트의 다음 `load()`에서 디스크 진실로 회복된다. (c) 가장 중요: 언로드 flush를 부활시키면 **stale 탭이 옛 맵을 되쓰는 resurrection 통로가 재개**된다 — 재시도 1건 구제의 이득보다 resurrection 재발의 손해가 압도적. **언로드 flush 부활은 권하지 않음**(과제 지침과 동일 결론).
- **mock 보조 확인(`/tmp/store_api_c7_test.js` C7/C7b 7/7)**: set 1회 실패 주입 시 `block` throw 안 함·메모리 유지·디스크 비어있다가 500ms 디바운스 재시도로 영속. 재시도 전 컨텍스트 폐기(언로드 모사) → 새 컨텍스트 `load()`가 디스크 진실(미기록) 반영, 재동작으로 깨끗이 회복.

### 3. 잔존 참조/죽은 코드 — ✅ 클린 (grep 실측)
- `registerUnloadFlush` **정의·호출 0건**(`grep -rn registerUnloadFlush src/` → exit 1). IIFE 끝 호출도 삭제 확인.
- `pagehide`/`visibilitychange`/`beforeunload`/`addEventListener` — `10-store.js`엔 **제거 사유 주석 1줄(`:231`)뿐, 실 리스너 0**.
- `flushPending`은 고아 아님: `block`(`:346`)·`unblock`(`:358`)이 여전히 호출(`:226` 정의 + 2 사용처).
- `persistNow`/`schedulePersist` 일관: `schedulePersist`는 C7 재시도(`:179`)·디바운스(`:216`)에서만 사용, `persistNow`는 `flushPending`(`:228`)·`schedulePersist`(`:216`) 경유. 죽은 코드 없음.

### 4. 진단 로그 제거 완전성 / unblock 원형 환원 — ✅ 완전
- `grep -rn 'FMKBlind dbg\|DBG\|console.log' src/` → **0건**(exit 1). 남은 `console.warn`/`console.error`는 전부 정상 폴백·경고 경로(C7 실패·미가용·손상 청크·스키마 불일치)로, 디버그 잔재 아님.
- `unblock`이 디버그용 `var had = …`로 분해됐던 흔적 **완전 환원**: 현재 `if (map.delete(uid)) return flushPending(); return Promise.resolve();`(`:358-359`) — `Map.delete` 반환값을 직접 분기에 사용하는 원형. `grep 'var had'` → 0건. 부수효과(삭제)·동작(있으면 flush, 없으면 no-op resolve) 정확.

### 5. 공개 6-API 불변 — ✅ 실측
- `Object.keys(store)` = `["block","count","isBlocked","list","load","unblock"]` 정확히 6(`/tmp/store_api_c7_test.js`).
- `store.flush`/`store.persistNow`/`store.flushPending`/`store.schedulePersist` **전부 `undefined`**(내부 클로저 전용) 실측. 계약 v1 FROZEN 6 시그니처 회귀 0. (QA 소관 계약 일치는 재지적 안 함 — 표면 회귀 0만 확인.)

### 6. 주석·문서 정합 — minor 1(R6)
- **store 헤더(`10-store.js:15-19`) ✅ 정합**: 제약 주석이 "디바운스는 이제 실패 재시도 경로에서만 쓰인다(언로드 자동 flush는 제거 — stale 탭 되쓰기 방지)"로 갱신됨. 제거 사유 블록 주석(`:231-237`)도 resurrection 메커니즘을 정확히 기술.
- **계약 §3 C8 ✅ 정합**: `store-api-contract.md` C8이 "제거됨(2026-06-15)"로 폐지·사유 기술, C3 즉시-영속화 유지, §5 내부 레이아웃도 "언로드 flush 제거"로 동기화. §0 머리말에 resurrection 정정 이력 추가.

#### [MINOR-R6] popup.js 헤더/주석이 폐지된 C8 안전망을 여전히 "잔존"으로 기술 — 주석 드리프트
- 위치: `src/popup/popup.js:18`(헤더) — `(store 내부 pagehide/visibilitychange 자동 flush(C8)는 보조 안전망으로만 잔존.)`. 또한 `:229-231` onUnblock 주석은 C8을 직접 언급하진 않으나 "추가 flush 호출 불필요" 맥락에서 같은 모델을 전제.
- 차원: 유지보수성(주석과 코드 불일치). 심각도: **minor**.
- 증거: 이번 라운드에 `10-store.js`의 C8 언로드 flush가 **제거**됐는데, popup 헤더 `:18`은 그것이 "보조 안전망으로만 잔존"한다고 단언 → **사실과 불일치**. 단 popup **코드 로직은 무변경·정확**(`onUnblock`이 `store.unblock` 반환 Promise=영속완료를 await 후 refresh; C8 유무와 무관하게 올바름). 동작 영향 0.
- 영향 범위: 과제 지침상 이번 변경 대상은 `10-store.js`뿐이라 popup 미수정 자체는 정상이나, 문서 정합성에서 드리프트가 남았다(직전 라운드 R5b와 동형의 주석 드리프트).
- 수정안(저비용, 동작 0): `popup.js:18`을 사실에 맞게 교정 — 예:
  ```
  *   (store는 block/unblock 호출 태스크 내에서 sync.set IPC를 동기 디스패치하므로 await 완료=영속 완료.
  *    구 pagehide/visibilitychange 자동 flush는 stale 탭 resurrection 통로라 2026-06-15 제거됨.)
  ```
  onUnblock 주석(`:229-233`)은 C8을 직접 거론하지 않아 그대로 두어도 무방하나, 같은 김에 "C8 안전망" 전제 표현이 있으면 정리 권고. **머지를 막지 않는 minor**(주석 전용).

### MV3/네임스페이스·보안·성능 — 이번 변경 무영향
- **MV3/네임스페이스**: 전역 할당은 `root.FMKBlind`(`:28,:384`)뿐, 신규 내부 상태 없음(리스너만 삭제). IIFE+`'use strict'` 유지. 리스너 제거로 오히려 생명주기 표면 단순화.
- **보안**: 이번 변경은 DOM 싱크·권한·신뢰 입력과 무관(언로드 리스너 삭제 + 로그 삭제). XSS/최소권한 기존 PASS 무영향. 오히려 디버그 `console.log` 제거로 정보 누출 표면 미세 축소.
- **성능**: 언로드 시 동기 flush 1회가 사라져 탭 닫힘 경로 더 가벼움. persist 경로 비용 변화 없음.

#### [I2] (정보성, 결함 아님) 열린 탭의 팝업 변경 미인지로 인한 same-tab 차단 시 해제 부활 여지
- 성격: 열린 fmkorea 탭의 content script는 팝업의 sync 변경을 실시간으로 모른다(`chrome.storage.onChanged` 미구현). 따라서 **"팝업에서 해제 직후, 같은 탭에서 새로고침 없이 또 다른 사용자를 차단"** 하면, 그 `block`이 stale 전체 맵을 직렬화해 써 해제가 되살아날 여지가 남는다.
- 검증(`/tmp/store_resurrection_test.js` R-C 2/2): popup이 `222` 해제 후, stale tab이 `333`을 차단 → 디스크가 `{111,222,333}`이 되어 `222` 부활(`333`도 정상 기록). **이 시나리오는 재현됨.**
- 분류: **기존 v1 알려진 한계(결함 아님)**. 계약 §4 v1 제약·`store-api-contract.md:144-145`에 명문화됨. 이번 수정이 해소한 것은 "**언로드(새로고침)에 의한** 무동작 resurrection"이고, "**같은 탭에서의 능동적 후속 block에 의한** resurrection"은 별개로 남는다.
- 심각도/권고: 실사용 노출 낮음(해제 직후 같은 탭에서 새로고침 없이 다른 사람을 곧바로 차단해야 발생). **완전 해소엔 `chrome.storage.onChanged`로 열린 탭 메모리를 실시간 동기화하는 것이 정공법**(현재 미구현 TODO, v1 범위 밖). v1 범위에선 수용하되, onChanged TODO 우선순위 근거로 기록 권고. **머지를 막지 않음.**

### 수정 리뷰 종합 판정
- **머지 가능 (MERGE).** 이번 resurrection 정정분: **blocker 0 / major 0 / minor 1(R6, popup 주석 드리프트·동작 0) / 정보성 1(I2, 알려진 v1 한계)**. 6차원 검토완료(미검토 0).
- **핵심 결론(코드 흐름)**: 언로드 자동 flush 제거는 **정상 쓰기 유실 경로를 신설하지 않는다** — 즉시-영속화가 sync.set IPC를 호출 태스크 내 동기 디스패치하므로 안전망이 불필요하고, 안전망 부재가 곧 stale 탭 되쓰기(resurrection) 통로 제거다. C7 재시도×언로드 유실은 "이미 실패한 쓰기"라 수용 가능하며, 언로드 flush 부활은 resurrection 재발이므로 권하지 않음.
- **죽은 코드 0**(`registerUnloadFlush` 정의·호출 0, 리스너 0)·**디버그 로그 0**(`[FMKBlind dbg]`/`DBG`/`console.log` 0)·**unblock 원형 환원**(`var had` 0)·**공개 6-API 불변**(`flush`/`persistNow`/`flushPending`/`schedulePersist` 비노출) 실측.
- 유일 minor(R6)는 popup 헤더 주석이 폐지된 C8을 "잔존"으로 기술하는 드리프트로, **주석 전용·동작 0**. popup-engineer가 1줄 교정 권고(머지 비차단).
- ⚠️ **mock은 보조 확인일 뿐 최종 판정 아님**: `/tmp/store_resurrection_test.js`(8/8, 다중 컨텍스트 resurrection 제거·잔여 한계 재현)·`/tmp/store_api_c7_test.js`(12/12, API 표면·C7×언로드)는 **코드 흐름 추론을 뒷받침**할 뿐, 실 Chrome 직렬화·구조화복제·프로세스 강제종료를 재현하지 못한다(직전 거짓 PASS의 원인). **실브라우저 재현이 최종 판정이며, 사용자가 이미 수정을 확인**했다.

### 수정 리뷰 검토 아티팩트(재현용)
- `node --check src/content/10-store.js` 통과
- `grep -rn registerUnloadFlush src/` → 0건 / `pagehide|visibilitychange|beforeunload|addEventListener`(store) → 제거 사유 주석 1줄만, 리스너 0
- `grep -rn 'FMKBlind dbg|DBG|console.log' src/` → 0건 / `var had` → 0건
- `/tmp/store_resurrection_test.js` (8/8): R-A 다중 컨텍스트 resurrection 제거(stale 탭 언로드해도 해제 유지) / R-B 안전망 없이 단발 block·unblock 영속(resolve=쓰기완료) / R-C 알려진 한계(stale 탭 능동 block이 해제 부활) 재현
- `/tmp/store_api_c7_test.js` (12/12): 공개 6-API·내부 4함수 비노출 / C7 set 실패 시 throw 0·메모리 유지·디바운스 재시도 회복 / C7b 재시도 창 중 언로드(컨텍스트 폐기) 후 새 load=디스크 진실·재동작 회복
- **mock 한계 명시**: 위 하네스는 `setTimeout(…,0)` 콜백으로 sync를 모사 — 실 Chrome 직렬화/구조화복제 차이·다중 OS 프로세스·강제종료 미재현. 보조 근거이며 실브라우저가 최종 판정.

---

## 2026-06-15 onChanged 라이브 동기 리뷰 (onChange API + reconcile 경쟁 수정)

- 대상: `src/content/10-store.js`(onChange/리스너/직렬화/reconcile), `99-main.js`(배선), `popup.js`(배선).
- 리뷰 진행: extension-reviewer 에이전트가 인프라 스톨(워치독 600s)로 최종 리포트 기록 전 중단됐으나, **중단 직전 출력이 핵심 경쟁을 확정**(아래). team-lead가 그 판정을 받아 수정·검증·기록.

### [MAJOR-O1] onChanged clobber의 미영속-로컬-write 유실 경쟁 — ✅ RESOLVED (reconcile)
- **결함(확정)**: 초기 구현의 `applyExternalChange`는 `before` 키셋 스냅 후 `rebuildFromStorage()`로 `map.clear()`+디스크 재구성(clobber). 외부 onChanged 핸들러의 `syncGet` await(수 ms~수십 ms) 동안 이 컨텍스트에서 `block(B)`가 일어나면 B는 map엔 있으나 디스크엔 없어, clobber가 B를 지우고(+ before에 있었으면 `removed` 오통지) 직렬 큐상 뒤에 선 persist가 map(B 없음)을 써 **B 영구 유실**. 리뷰어 판정: "loss happens with **microtask-level** lead, not requiring rate-limit retry at all. storage-engineer's 'rate-limit extreme edge' framing is **too narrow**." → 동의. 심각도 **major(무성 데이터 유실)**.
- **수정**: 외부 경로를 `applyExternalChange`로 분리하고 **clobber→reconcile**: 디스크 vs `persistedChunks`(prevMap) **외부 델타만** map에 적용(추가/변경 set·외부제거 delete), prev·디스크 어디에도 없는 **로컬 미영속 항목은 보존**. 이후 `persistedChunks`를 디스크 권위로 정합 → 직후 로컬 persist가 미영속분을 변경분으로 기록. `load()`는 clobber `rebuildFromStorage()` 유지(최초 로드엔 로컬 상태 없음), 둘은 순수 파서 `parseSnapshot()` 공유. 계약 C9·§4·§5 동기화.
- **검증**: `/tmp/reconcile_test.js` **23/23 PASS** — S4(경쟁: 미영속 B 보존 + 디스크 영속 + B는 added 오통지 미포함 + A 외부해제 반영) / S3(I2 해제후 되살림 없음) / S5(자기-쓰기 에코 무통지) / S6(nick만 변경 무통지) / S1·S2(라이브 add/remove 통지). `node --check` 통과.

### 기타 확인 (양호)
- **에코/피드백 루프**: reconcile 핸들러는 읽기+메모리만(절대 sync write 없음) → 루프 구조적 부재. 자기-쓰기는 디스크==prevMap이라 델타 빈 diff → 통지 생략.
- **직렬화**: persist·reconcile 단일 큐(`serialTail`/`enqueueSerial`) 순차 실행 → 인터리브/스냅샷 경쟁 없음.
- **onChange API**: unsubscribe 멱등, 다중 구독, 콜백 예외 격리(`notifyChange` slice 복사 순회), `typeof cb!=='function'` 가드.
- **리스너 생명주기**: 중복주입 가드(`if(root.FMKBlind.store)return`)가 `installOnChangedListener()`보다 먼저 → 컨텍스트당 1회. `chrome.storage.onChanged` 존재 가드로 미지원 안전.
- **배선(99-main/popup)**: 기존 흐름 회귀 없음, uid 문자열만(XSS 해당 없음), 6 API FROZEN 불변.

### 판정
- **머지 가능 (MERGE)** — onChanged 분: blocker 0 / major 0(O1 RESOLVED) / minor 0. 6차원 검토.
- ⚠️ **mock은 보조**: reconcile_test는 로직 회귀만 보장. **실 Chrome 다중 컨텍스트(탭↔팝업↔기기) onChanged 전파·직렬화가 최종 게이트** — 사용자 실브라우저 4개 시나리오(특히 I2 회귀) 검증 필요. mock PASS만으로 "완료" 단정 금지(직전 resurrection 거짓 PASS 교훈).

---

### reviewer2 독립 재검증 (2026-06-16)

대상: `src/content/10-store.js`(reconcile·serialTail·parse·onChange API), `99-main.js`·`popup.js`(배선). 직전 team-lead 기록(MAJOR-O1 RESOLVED)을 **추측 없이 코드 재추론 + 독립 로직 하네스**로 재검증. 산출은 오케스트레이터행 데이터.

**판정: 머지 가능 (MERGE)** — blocker 0 / major 0 / minor 1(문서성). 실 Chrome 다중 컨텍스트가 최종 게이트(미검토, 아래 명시).

#### 항목 1 — reconcile가 경쟁을 실제로 닫는가: 성립(PASS)
- `applyExternalChange`(107~153): 외부 제거 A + 동시 미영속 로컬 block(B) 시나리오를 독립 하네스(`/tmp/reviewer2_probe.js`)로 재현 → **B 보존·A 제거·removed=[A]·added=[](B 오통지 없음)** 4건 모두 성립. 근거: `prevMap`(=persistedChunks)에 B가 없으므로 제거 루프(141~145)에 안 걸리고, diskMap에도 B가 없어 추가 루프(130~137)에도 안 걸림 → 손대지 않아 보존. clobber 유실 경로(map.clear) 구조적 부재.

#### 항목 2 — reconcile가 새 결함을 만드는가: 만들지 않음(PASS)
- **2a 로컬 미영속 unblock 되살림 없음(핵심)**: A를 로컬 unblock(map에서 delete)했으나 디스크엔 잔존한 상태에서 reconcile가 먼저 돌아도, diskMap.forEach가 A를 만나지만 `prev.nick===rec.nick && prev.addedAt===rec.addedAt`라 set 스킵 → **map에 A 재삽입 안 됨**. 이어 큐에 선 로컬 persist가 map(={C})로 청크를 다시 써 디스크의 A까지 제거. persist 선/후 두 순서 모두 수렴(`/tmp/reviewer2_probe2.js`로 양방향 확인). **map이 persist의 단일 진실원**이라는 점이 되살림을 닫는 핵심.
- **2b parsePersistedSnapshot 안전성(427~447)**: sparse hole(`undefined` 청크)·손상 JSON 문자열·비배열 JSON 모두 `typeof s!=='string'` continue + try/catch + `Array.isArray` 가드로 건너뜀, 나머지 정상 청크는 정확 파싱(3/3 PASS). `parseSnapshot`(379~420)도 동일 방어 + 손상 시 `snapshot[di]=undefined`로 다음 쓰기 강제 갱신.
- **2c 멀티청크·인덱스 시프트**: prevMap/diskMap이 청크 레이아웃 무관 **uid 합집합**으로 구성되므로(인덱스 위치 비의존), 동일 논리집합의 청크 재배치는 added/removed 빈 diff·map 무변(2/2 PASS).
- **2d persistedChunks=parsed.snapshot 리셋 후 I2**: 리셋 직후 로컬 block(D)이 새 청크 ≠ 스냅샷 청크 → 변경분으로 기록됨(diff 성립). I2(해제 후 되살림) 유지 확인.

#### 표준 점검(양호)
- **직렬화/인터리브**: `persistNow`의 do/while coalesce 루프는 **단일 serial task 내부**에서 await되며, `enqueueSerial`의 체인 의미상(task N의 promise가 settle해야 N+1 시작) reconcile는 그 루프가 끝나기 전 끼어들 수 없음 → persistedChunks 스냅샷 경쟁 없음(`/tmp/reviewer2_probe3.js`로 무인터리브 증명). persist 진행 중 들어온 block은 `persistInFlight`+`persistDirty` coalesce로 흡수.
- **에코/루프**: reconcile는 읽기+메모리만(sync write 없음) → 피드백 루프 구조적 부재. 자기-쓰기는 disk==prevMap이라 delta 빈 diff → notify 생략(151).
- **onChange API**: unsubscribe 멱등(indexOf -1 가드, 585~592), 다중 구독, 콜백 예외 격리(`notifyChange` slice 복사 순회 156~166), `typeof cb!=='function'` 가드. 6 API FROZEN 불변 + onChange 가산 7번째 — 시그니처 변형 없음.
- **생명주기/리스너**: 중복주입 가드(`if(root.FMKBlind.store)return` 36행)가 `installOnChangedListener()`(596행)보다 선행 → 컨텍스트당 1회 등록. `chrome.storage.onChanged` 존재 가드(173~176)로 미지원 안전. 언로드 자동 flush는 의도적 제거(resurrection 통로 차단, 364~370 주석).
- **XSS/보안**: 배선은 uid/nick 문자열만 전달, popup은 textContent/createElement·`appendHighlighted` 안전 강조(innerHTML 미사용). 신규 인젝션 표면 없음.

#### minor (문서성, 비차단)
- **[MINOR] `applyExternalChange`의 `metaPersisted=parsed.metaOk` 갱신 부수효과(149행)**: reconcile가 메모리 상태뿐 아니라 `metaPersisted`도 디스크 권위로 덮어쓴다. 외부가 bl_meta를 미설정/구버전으로 만든 직후 reconcile→로컬 persist 시 `bl_meta`를 다시 쓰는 정상 동작이라 결함은 아니나, 주석은 persistedChunks 리셋만 언급(147~149)하고 metaPersisted 리셋 의도는 미기재. 한 줄 주석 보강 권장(동작 변경 불필요).

#### 미검토(외부 의존 — 통과로 두지 않음)
- 실 Chrome 다중 컨텍스트(탭↔팝업↔기기)의 onChanged 전파 타이밍·직렬화 차이는 Node 하네스로 단정 불가(MEMORY 교훈: mock 거짓 PASS 전례=resurrection). 로직 회귀는 reviewer2 독립 하네스 16/16 + 양방향 수렴까지 PASS이나, **사용자 실브라우저 4시나리오(특히 I2 회귀·미영속 경쟁)가 최종 게이트**로 남는다.

---

## 리뷰 #4 — MutationObserver 증분 처리(TODO Q6) (2026-07-08, branch `feat/mutation-observer-incremental`)

- 담당: extension-reviewer · 방법론: `extension-code-review`(6차원 체크리스트) · QA 재검증 #4(28/28 PASS)와 상보(계약 일치는 재지적 없음, 코드 품질에 집중)
- 대상: 신규 `src/content/35-observer.js`(84행), `src/content/99-main.js` 배선(+7행), `manifest.json`(js 목록+ver 0.4.0), 문서(PLAN/README/TODO)
- 사실 확인: `node --check` 통과(35·99 둘 다), 소비 심볼(`AUTHOR_ANCHOR_SELECTOR`/`MENU_ID`/`TOAST_ID`) 전부 `00-namespace.js`(로드 1순위) 정의 확인, 재사용 함수(`selectors.extractUid`·`hide.hideForAnchor`·`hide.scan`) 시그니처 대조 일치, icons diff 0(불변)

### 종합 판정: **머지 가능 (MERGE)** — blocker 0 / major 0 / minor 2(관찰·비차단)

6차원 전부 결함 없음. 신규 store 표면 0(계약 불변), 신규 권한 0(MutationObserver=표준 DOM). 실 fmkorea AJAX 실동작·광고 잦은 페이지 부하는 정적으로 단정 불가 → 실브라우저 게이트 유지(아래).

### 차원별 요약
- **정확성 — PASS.** ①`handleAddedNode`가 (a)노드 자신이 앵커 + (b)하위 앵커 `querySelectorAll` 두 갈래를 모두 수행 → 앵커 단독/컨테이너 통삽입/`innerHTML` 치환(새 서브트리 루트가 addedNodes로 옴) 전부 커버. ②멱등성: `hideForAnchor`가 `classList.add`+dataset 토글이라 동일 컨테이너 재처리 무해(중복 숨김 인플레이션 없음). ③판정 재사용 경로 정합: `extractUid`(토큰-앵커드, `member_plate` 오캡처 차단)→`isBlocked`(삽입 시점 최신 store 참조)→`findContainer`(closest 댓글>게시글>목록 순서)까지 30/20 모듈 그대로 → 최초 스캔과 동일 규칙. ④UID 없는 작성자(탈퇴/비회원)·비Element 노드 조용히 스킵.
- **견고성 — PASS.** ①재귀 가드가 구조적으로 성립: 숨김은 attribute(class/dataset) 변경인데 관찰은 `childList`만 → 자기 트리거 무한루프 부재. 코드로 재확인 — `hideForAnchor`/`findContainer`는 노드를 **삽입하지 않음**(classList/dataset만) → childList 미유발이 확정적. ②우리 UI 상호작용 안전: 메뉴/토스트는 body 최상위 append(40:42·50:23)라 `isOwnUiNode` top-level 체크와 정합, 삽입 시 콜백은 즉시 스킵. 메뉴/토스트 서브트리엔 앵커 없음(라벨 textContent) → (b) 경로 오처리 없음. ③생명주기: `pagehide`/`visibilitychange` 자동 flush **없음**(스킬 금지 규칙 준수 — resurrection 통로 미도입). 관찰자는 페이지 파기 시 브라우저가 정리 → 누수 없음. ④중복 install 가드(`if(observer)return`) + isBlocked 미주입/타깃 부재 안전 미설치.
- **보안 — PASS.** DOM 인젝션 0(innerHTML 미사용, dataset에 넣는 uid는 `\d+`만). 신규 권한 0. 최소권한(`["storage"]`) 유지.
- **유지보수성 — PASS.** IIFE·`NS` 네임스페이스·주석 컨벤션 기존과 일치. 주석 정확성 검증: 62행("record.type 항상 childList")·49~51행(재귀 가드 근거)·30~34행 분기 설명 모두 코드와 일치. 문서(PLAN/README/TODO) 전부 실동작과 정합(드리프트 0 — 아래).
- **MV3/베스트프랙티스 — PASS.** manifest js 로드 순서(00→10→20→30→35→40→50→99) 의존성 정합, MutationObserver 추가 권한 불요, content script 격리 유지, 무백그라운드 유지.
- **성능 — 관찰(OBS-1, 아래 minor).** 전역 subtree 관찰이나 콜백 비용은 삽입 서브트리에 국한(전체 DOM 재스캔 아님).

### minor (관찰·비차단)
- **[MINOR][성능] 전역 subtree 관찰 + 디바운스 부재 — QA OBS-1 독립 재판정: 결함 아님(정당한 트레이드오프).** `35:71` `observe(body,{childList:true,subtree:true})`, 콜백은 매 addedNode 서브트리에 `querySelectorAll('a[class*="member_"]')` 수행(디바운스/throttle/rIC 없음). **독립 판단:** 이 기능의 목표는 "삽입 즉시 숨김(플래시 없음)"이므로 디바운스를 넣으면 오히려 차단 대상이 한 틱 동안 노출됐다 사라지는 flash-of-blocked-content가 생겨 **정확성이 후퇴**한다 → 디바운스 부재는 결함이 아니라 의도에 맞는 선택. 비용도 전체 DOM이 아니라 삽입분에 비례(O(삽입 서브트리)), iframe 광고엔 앵커 없음(cross-origin, qSA 미하강). 잔여 리스크는 초당 수천 소노드를 꽂는 병리적 광고 페이지의 jank뿐 → **실브라우저 프로파일로만 확인 가능**(정적 단정 불가). QA와 동일 결론(minor·실측 권장)이되, "디바운스를 넣어야 한다"는 처방은 반대. 최적화가 정말 필요하면 rAF 배치보다 `data-fmkb-uid`/처리표식 기반 스킵이 flash 없이 안전.
- **[MINOR][유지보수성] `disconnect()` 프로덕션 미사용(35:75).** 테스트/생명주기용으로 노출됐으나 실경로에서 호출 없음. 관찰자는 페이지 파기 시 자동 정리되므로 누수는 없고, 재install 가능 상태 복원이라는 정당한 API 표면 → 죽은 코드로 제거할 필요는 없음. 관찰만 기록(조치 불요).

### 기타 확인(양호, 지적 아님)
- **onChange(C9) ↔ observer 책임 분리 정합**: 99-main (4)의 onChange는 **이미 로드된 DOM**을 즉시 반영(added→hideByUid/removed→unhideByUid), (2)의 observer는 **이후 삽입 DOM**을 삽입 시점 최신 `store.isBlocked`로 처리. 외부 차단이 reconcile로 store에 반영된 뒤 삽입되는 노드는 observer가 자동 숨김 → 99-main 주석 "별도 처리 불요"는 정확. 두 메커니즘 사이 커버 공백 없음.
- **스캔↔관찰 경계(TOCTOU)**: 99-main `hide.scan`(27) → `observer.install`(33) 사이 await 없음(동기) → 두 단계 틈에 노드 삽입 불가 → 누락 경계 없음.
- **재사용 무회귀**: 30-hide(`hideForAnchor`/`hideByUid`/`unhideByUid`/`scan`)·20-selectors·00-namespace **코드 변경 0**(diff는 신규 파일·배선·문서·manifest뿐) → 기존 기능 회귀 표면 없음.

### 문서 드리프트 검토 — PASS (0건)
코드 실동작과 갱신 문서를 1:1 대조:
- **PLAN.md Q6/known-constraints/파일구조**: "document.body를 childList/subtree로 관찰, 숨김은 30-hide 재사용, 최초 스캔 이후 삽입 노드 처리" — 코드(35:71 옵션, 25 hideForAnchor, 99-main 흐름)와 정확히 일치. ✔
- **README.md**: "이후 AJAX·무한스크롤·더보기로 새로 불러온 글·댓글도 MutationObserver 증분 처리로 즉시 숨김" — 실동작과 일치(과대약속 없음). ✔
- **TODO.md Q6 [x]**: "attributes 미관찰이라 클래스 토글 재귀 없음, 우리 UI 노드 스킵, hideForAnchor 재사용" — 코드 근거(49~51·13~17·25)와 일치. ✔
- **manifest ver 0.4.0**: 가산 기능 범프 규약 부합. ✔

### 미검토(외부 의존 — 통과로 두지 않음) · 실브라우저 게이트
Node/정적 검증은 **실 Chrome MutationObserver 발화 타이밍·배치**와 **fmkorea AJAX가 실제 addedNodes로 오는지(vs 문서프래그먼트/부분 innerHTML)**, **광고 잦은 페이지 부하(OBS-1)**를 재현 못 함. 이 프로젝트는 mock 거짓 PASS 전례(resurrection)가 있으므로 아래를 머지 전 게이트로 남긴다(QA 체크리스트와 동일):
- [ ] 차단 유저 댓글이 있는 글에서 "더보기/새 댓글" AJAX 로드 시 새 댓글 즉시 숨김(새로고침 없이).
- [ ] 무한스크롤/페이지네이션으로 목록 행 추가 시 차단 유저 행 즉시 숨김.
- [ ] 우클릭 차단 직후, 같은 유저의 이후 삽입 노드도 숨김(삽입 시점 최신 isBlocked).
- [ ] 콘솔 에러/무한루프 없음, 스크롤/입력 체감 jank 없음(OBS-1).
- [ ] 메뉴/토스트가 관찰자에 오작동시키지 않음(isOwnUiNode 스킵 실동작).

---

## 리뷰 #5 — 내보내기/가져오기(TODO Q7, `importMany` C10) (2026-07-08, branch `feat/export-import`)

- 담당: extension-reviewer · 방법론: `extension-code-review`(6차원) · QA 재검증(독립 하네스 38/38 PASS)·storage-engineer 자체 35/35와 상보(계약 시그니처 일치는 재지적 없음, 코드 품질·정확성 독립 리뷰에 집중)
- 대상: `git diff main` 전체 — `src/content/10-store.js`(가산 8번째 API `importMany`, +74행), `src/popup/popup.{html,js,css}`(내보내기/가져오기 UI), 계약 §2/C10/§4, 문서(TODO/PLAN/README/DEPLOY), `manifest.json` ver 0.5.0. content script(00/20/30/35/40/50/99) 무변경.
- 사실 확인(직접 실행):
  - `node --check` 통과(10-store.js·popup.js 둘 다).
  - `importMany` 분류·카운트 로직 독립 재현(중복-인-파일→skip, 숫자열 정규식(공백/소수/음수/`__proto__` 전부 invalid), addedAt 폴백(null/0/음수/NaN→now, 숫자문자열 coerce), 비배열 no-op, 숫자 uid coerce) — **전부 기대대로**. `({}).polluted===undefined`로 프로토타입 오염 부재 확인.
  - 팝업 레이아웃: `body` flex column + `.fmkb-body{flex:1 1 auto;overflow-y:auto}` + `.fmkb-footer{flex:none}` → 목록만 스크롤·푸터 하단 고정 정합. 숨김 파일입력은 `hidden` 속성으로 display:none(간섭 규칙 없음).

### 종합 판정: **머지 가능 (MERGE)** — blocker 0 / major 0 / minor 2(비차단, 기존 설계와 정합)

가산적·비파괴 확장. 내보내기는 신규 API/권한 없이 `list()` 직렬화 + Blob 다운로드, 가져오기는 기존 `flushPending()`/persist 경로를 재사용하는 `importMany`. 정확성·보안·견고성·유지보수성·MV3·성능 6차원 모두 결함 없음. 남은 minor 2건은 모두 **기존 C7(영속 실패 내성) 모델과 일관**된 비차단 항목이며, 실 파일 I/O·실 Chrome sync는 QA 체크리스트대로 실브라우저 게이트로 남긴다.

### 차원별 요약
- **정확성 — PASS.** ①머지 시맨틱(C10) 정확: 새 uid 추가·기존 uid 스킵(nick/addedAt 미덮어씀)·비정상 invalid. **동일 파일 내 중복 uid는 2번째가 skip으로 집계**(map.has 선반영)됨을 실측 확인 — 의도대로. ②uid 검증 `String(rawUid)` 후 `^\d+$` → `member_{UID}` 규칙과 정합, 공백 포함·소수·음수·비숫자 문자열 전부 invalid(실측). ③`addedAt = Number(it.addedAt)` 후 `!isFinite||<=0 → nowMs()` — null/0/음수/NaN 폴백, 숫자문자열은 강제 보존(실측). ④`added===0`이면 flush 생략이 정확(스킵/invalid는 map 미변경 → 쓰기 불필요 ⟺ 멱등). ⑤export 직렬화: addedAt 비유한수 → null, nick null-safe(`==null?'':String`), uid String 정규화 — 무손실 왕복(QA T6/T7과 일치). ⑥`extractEntries` 관용 추출(bare/entries/items→그 외 null)이 계약 §4와 일치.
- **보안 — PASS(독립 재확인).** ①신뢰 불가 파일 문자열이 DOM에 닿는 경로 전수 추적: `setIoStatus`는 `textContent`만(주석 "innerHTML 금지"와 실제 일치), 결과 요약 `formatImportResult`는 **숫자만**, 목록 렌더는 기존 `appendHighlighted`(createTextNode/textContent) 재사용 → 신규 인젝션 표면 0. ②프로토타입 오염 방어: uid가 `^\d+$`라 `__proto__`/`constructor` 등은 invalid로 거부되고, 저장소는 plain object가 아닌 `Map`이라 키 오염 불가. `JSON.parse`의 `__proto__`는 own-property로 안전. ③최소권한 불변: `permissions:["storage"]`, 내보내기는 `URL.createObjectURL`+`a[download]`(다운로드 권한 불요), host_permissions/scripting 없음.
- **견고성 — PASS(minor 2건 관찰).** ①에러 경로 완비: JSON.parse 실패→"올바른 JSON 아님", 형식 불일치(extractEntries null)→"형식이 아님", 파일읽기 실패 outer `.catch`, importMany 자체는 throw 안 함(계약 C10). 각 에러가 조용한 실패 없이 상태 메시지로 표면화. ②busy-state 무-스톨: `.then→.catch→.then(setIoBusy(false))` 체인이 성공/실패 어느 쪽이든 최종 `.then`에 도달 → 버튼 잠금 해제 보장(실측 추론). ③import 중 팝업 닫힘: map은 동기 반영, 쓰기는 block/unblock과 **동일 flushPending 경로**로 클릭/선택 태스크 내 디스패치(C3 준용) → 부분쓰기·유실 표면은 block과 동형(신규 위험 없음). 파일 읽기 중 닫히면 아무것도 안 씀(무해). ④C9 reconcile 상호작용: import 미영속 항목은 prevMap·디스크에 없어 외부 onChanged reconcile가 손대지 않음 → block과 동형 보존(리뷰 #3에서 이미 심층 검증한 메커니즘 재사용, 신규 코드경로 없음). ⑤언로드 자동 flush 미도입(스킬 금지 규칙 준수 — resurrection 통로 없음).
- **유지보수성 — PASS.** IIFE·`FMKBlind` 네임스페이스·JSDoc·주석 컨벤션 기존과 일치. 주석 정확성 검증: importMany 헤더(600~621)·C9 상호작용 주석·용량 best-effort 주석 모두 코드와 일치. `EXPORT_SCHEMA`/`EXPORT_VER`는 내보내기에 기록되나 가져오기가 강제하지 않음(관용 수용 = 전방호환 의도, 결함 아님). `pad2`가 기존 `formatDate`의 인라인 padStart와 소소하게 중복되나 별개 용도(파일명 스탬프)로 무해.
- **MV3/베스트프랙티스 — PASS.** manifest ver 0.5.0(가산 기능 minor 범프 정합), 권한 불변, popup.html 로드 순서(store→popup.js) 유지, Blob 다운로드가 표준 웹 API(추가 권한/백그라운드 불요). 버튼/입력 id 4개 배선 일치(html↔els).
- **성능 — PASS.** 대량 항목도 **단일 flush 1회**(항목별 block 남발 없음 → 레이트리밋 압박 회피, 기능 핵심 목표 달성). export/import 모두 O(n) 단일 패스. 사전 용량 추정은 best-effort(persistOnce가 정밀 재검증).

### minor (비차단 · 기존 설계와 정합)

- **[MINOR][견고성] busy 가드가 비동기 파일 읽기(`file.text()`) 이후에야 설정됨 → 읽기 창(window) 동안 재트리거 가능(popup.js:408~427).** `onImportFileChosen`은 `setIoStatus('가져오는 중…')` 직후 `file.text()`(비동기)를 시작하지만 `setIoBusy(true)`는 **파싱 성공 후**에 호출된다. 따라서 파일 읽기~파싱 사이 창에서 사용자가 "가져오기"를 다시 눌러 파일 대화상자를 또 열고 두 번째 import를 동시 시작할 수 있다. **영향은 경미**: importMany는 map을 동기 반영 후 flushPending을 호출하고, 그 쓰기는 전역 직렬화 큐(`serialTail`)+coalesce로 순차 처리되므로 **데이터 손상은 없다**(두 파일이 병합됨). 유일한 증상은 상태 메시지가 마지막 import 결과만 표시하는 표시상 혼동. **수정안(선택):** 파일 대화상자를 여는 `importBtn` 클릭 시점 또는 `onImportFileChosen` 진입 직후(파일 확보 직후, `file.text()` 호출 전)에 `setIoBusy(true)`를 당겨 읽기 창 동안 재진입을 차단. 데이터 안전성 이슈가 아니므로 비차단.

- **[MINOR][견고성/UX] 용량 초과 대량 import가 실제 sync 쓰기 거부(quota)에도 "N명 추가" 성공으로 표시됨(popup.js:436, 계약 C7 경유).** `importMany`의 반환 Promise는 `flushPending()→persistOnce`가 sync.set 실패(레이트리밋/QUOTA_BYTES 초과)를 **C7대로 삼키고 resolve**하므로, 100KB 한도를 넘긴 대량 import에서도 팝업은 성공 메시지를 띄운다(콘솔엔 best-effort 경고만). import는 단일 최대-볼륨 writer라 block/unblock보다 이 괴리가 **더 가시적**이다: 팝업 재오픈(reload) 후 load()가 디스크만 읽어 미영속 초과분이 사라진다. **기존 C7(영속 실패 내성) 모델과 일관**이라 비차단이나, 대량 import 특성상 "성공 표시=디스크 영속"이라는 사용자 기대와 어긋날 수 있다. **수정안(선택):** persistOnce의 쓰기 성공/실패를 importMany 결과에 반영하거나(예: `{added,skipped,invalid,persisted:boolean}`), 사전 용량 추정 초과 시 팝업에서 "일부는 용량 한도로 저장되지 않을 수 있음" 경고를 병기. 압축(TODO) 도입 전까지의 근본 한계와 맞물리므로 minor로 유지.

### 기타 확인(양호 · 지적 아님)
- **6+1 API FROZEN 불변**: load/isBlocked/block/unblock/list/count/onChange 본문 diff 0 — `importMany` 추가만(가산·비파괴). content 소비자(99-main) 영향 0.
- **새 쓰기 경로 없음**: importMany는 line 666에서 block/unblock과 동일한 `flushPending()` 호출(별도 syncSet 없음) — 계약 C10 "기존 persist 경로 재사용" 준수.
- **문서 드리프트 — 0건.** 계약(§2·C10 표·§4 예시·로드맵), TODO Q7 `[x]`, PLAN Q7, README(사용법·머지 시맨틱·크로스브라우저), DEPLOY(v0.5.0+ 경로), manifest 0.5.0 모두 코드 동작과 일치. README의 "N명 추가·M명 중복·K건 무시"는 대표 예시(`formatImportResult`는 0인 항목 생략) — 과대표기 아님. 계약 §4 예시의 `|| []`(미인식 형식→빈배열 no-op)와 popup `extractEntries`의 `null`(→에러 메시지)은 팝업이 더 친절한 UX(에러 표시)일 뿐 계약 위반 아님.
- **onChange(C9) 중복 갱신 없음**: 가져오기는 자기-쓰기라 onChange 에코 diff가 비어 콜백 미발화 → 명시적 `refresh()`와 중복 렌더 없음(popup.js 주석·계약 C9 정합).

### 미검토(외부 의존 — 통과로 두지 않음) · 실브라우저 게이트
이 프로젝트는 mock 거짓 PASS 전례(resurrection)가 있어 아래는 Node/정적으로 단정 불가 → 머지 전 사용자 실브라우저 확인 필요(QA 체크리스트와 동일):
- [ ] 팝업 컨텍스트에서 `a.click()` Blob 다운로드가 실제 파일로 저장되는가(팝업이 닫히지 않는가, `revokeObjectURL` setTimeout(0) 지연으로 취소 안 되는가) — Chrome·Firefox.
- [ ] `<input type=file>` 선택→`file.text()`→import→목록 즉시 갱신, 동일 파일 재선택 시 change 재발화(`input.value=''`).
- [ ] 대량 import 후 다른 열린 탭이 새로고침 없이 반영(C9), 단일 flush라 레이트리밋(분당 120) 미초과 실측.
- [ ] Chrome↔Firefox 왕복 이관.
- [ ] 수천 명(100KB 근접) import 시 용량 경고·부분저장 실동작(위 MINOR 2 관련).
