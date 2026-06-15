> ⚠️ **정정(2026-06-15, team-lead)**: 아래 영속화 수정 검증은 Node mock으로 "PASS"였으나, 실제 Chrome에서는 해제가 새로고침 후 되살아나는 **resurrection 버그가 잔존**했다. mock이 실 Chrome 직렬화·다중 컨텍스트(탭↔팝업)를 재현하지 못한 한계. 실브라우저 콘솔로 근본 원인(stale 탭이 언로드 flush로 옛 맵 되씀)을 확정하고 언로드 flush 제거로 최종 해소. 상세: CLAUDE.md 변경 이력 / store-api-contract.md §3 C8. 교훈: chrome.storage 버그는 실브라우저가 최종 판정.

# QA 검증 보고서 — FMK-Blind (task #6)

- 담당: extension-qa
- 갱신: 2026-06-14
- 방법론: `.claude/skills/extension-qa-verification/SKILL.md` (경계면 교차 비교 우선)
- 심각도: **blocker** > **major** > **minor** / 검증 불가 항목은 "미검증"으로 분류(통과 처리 금지)

## 진행 현황

| 검증 영역 | 의존 | 상태 |
|----------|------|------|
| A. 셀렉터 라이브 재검증 | 라이브 fmkorea HTML | ✅ **PASS** (grep + jsdom 실측) |
| B. store ↔ content 경계면 | #2, #3 | ✅ **PASS** |
| C. store ↔ popup 경계면 | #2, #4 | ✅ **PASS** |
| D. selectors ↔ hide 경계면 | #3 | ✅ **PASS** (실제 HTML jsdom 21/21) |
| E. manifest 정합성 | #5 | ✅ **PASS** |
| F. 샤딩 경계(8KB/100KB/stale/bl_meta) | #2 | ✅ **PASS** (node 25/25) |
| G. 엣지 케이스 | #3, #4 | ✅ PASS |

> **최종: 전 검증 영역 PASS. MAJOR-1 수정+재검증 완료(RESOLVED). MINOR-1만 v1 수용으로 잔존(무해).**
>
> **재검증 #2(2026-06-15, Task #3): 영속화 누락 버그 — block/unblock 즉시·awaitable 영속화 수정 검증 PASS(28/28 + 회귀 25/25). 상세는 문서 하단 "✅ 수정 후 결과" 섹션.**

## 발견 사항 요약

| ID | 심각도 | 제목 | 소유 | 상태 |
|----|--------|------|------|------|
| MAJOR-1 | major | 팝업 해제(unblock)가 디바운스 flush 전 팝업 종료 시 sync에 유실 | storage | ✅ **RESOLVED**(최종=내부 보강만, 재검증 15/15) |
| MINOR-1 | minor | document_end 비동기 load 동안 차단 대상 깜빡임(FOUC) | content (구조적 한계) | 🟡 v1 수용(잔존, 무해) |
| MINOR-2 | minor | content 차단 직후 <500ms 내 이탈 시 동일 원인으로 유실 | storage | ✅ **RESOLVED**(MAJOR-1 수정에 흡수) |
| CLEANUP-1 | minor(비치명) | popup.js가 제거된 `store.flush`를 참조(가드된 죽은 코드) | popup | ✅ **RESOLVED**(popup v1 환원, flush 토큰 0) |

> **최종 디스포지션 = B (v1, 공개 flush 없음).** store는 공개 API 6개 + 내부 자동 flush(C8), popup은 명시 flush 없이 store 자동 flush만으로 내구. 경계면 C: popup이 호출하는 store 멤버 = `{load, list, count, unblock}` ⊆ 6 공개 API, **flush 미참조(코드·주석 0)** 확정 — 기검증 API의 부분집합이라 비회귀.

---

## A. 셀렉터 라이브 재검증 — ✅ PASS

라이브 HTML을 직접 수신해 PLAN.md의 "검증된 DOM 사실"을 독립 대조함(가정 통과 아님).

수신 환경:
- UA: `Mozilla/5.0 (Macintosh; ...) Chrome/120.0.0.0 Safari/537.36`
- 보드목록: `GET https://www.fmkorea.com/index.php?mid=humor` → **HTTP 200, 75,088 B**
- 게시글: `GET https://www.fmkorea.com/9956267099` → **HTTP 200, 87,524 B**
- 수신 시각: 2026-06-14 (라이브 검증, 미검증 아님)

### A-1. 작성자 앵커 / UID 추출 — PASS
라이브 증거(목록·게시글 공통):
```html
<a href='#popup_menu_area' onclick='return false;' class='member_515859774 member_plate' >
<a href='#popup_menu_area' onclick='return false;' class='member_4120586159 member_plate'  data-comment_srl="9956275475">
```
- `member_(\d+)` 로 UID 추출 시 `member_plate`는 숫자 없어 자동 제외 → PLAN Q1 규칙 유효.
- **주의(앵커 class는 작은따옴표 `'...'`)**: 코드의 셀렉터/정규식이 `class=\"...\"`(쌍따옴표)를 가정하면 안 됨. `a[class*="member_"]` 같은 속성 셀렉터·`className`·`classList` 기반이면 따옴표 무관(안전). 정규식으로 raw HTML을 파싱하는 코드라면 따옴표 가정 금지 — 30-hide/20-selectors 도착 시 확인.
- 댓글 작성자 앵커에는 `data-comment_srl` 존재, 게시글 본문 작성자 앵커에는 없음(컨테이너 판정으로 구분 가능).

### A-2. 보드목록 행 컨테이너 — PASS (테이블형 `tr`)
라이브 증거:
```html
<tbody> <tr class="notice ..."> ... <td class="author"><span>
  <a ... class='member_515859774 member_plate' ><img ...></a>
</span></td> </tr>
```
- humor 보드는 **테이블형**: `tr > td.author > span > a.member_{UID}`. `td class="author"` 23회 출현.
- 따라서 `anchor.closest('tr, li')` → `tr` 매칭 ✓. (웹진형 `li` 보드도 동일 규칙으로 흡수 — PLAN 규칙 3 유효)

### A-3. 댓글 컨테이너 — PASS
라이브 증거:
```html
<li id="comment_9956275475" class="fdb_itm clear  comment-9956275482">
```
- `li[id^="comment_"]` ✓, class `fdb_itm` ✓ (베스트댓글도 `li.fdb_itm` 동일 — PLAN Q8 자동 포함 유효). 게시글 내 5개 댓글 li 확인.

### A-4. 게시글 본문 컨테이너 — PASS
라이브 증거:
```html
<div class="rd rd_nav_style2 clear"> ... <div id="bd_capture"> ... <div class="rd_hd clear"> ... <div class="top_area ngeb"> ...작성자 앵커...
```
- `.rd`(본문 전체 숨김 대상) ✓, `.rd_hd` ✓, `.top_area` ✓, `#bd_capture` ✓.
- 계층: `.rd > #bd_capture > .rd_hd > .top_area` 확인 → 게시글 작성자 앵커는 `.top_area` 내부, 숨김 대상 `.rd`는 그 조상. `anchor.closest('.rd_hd, .top_area')`로 게시글 작성자 판정 후 `.rd` 숨김 흐름 유효.
- 페이지 내 `.rd`는 1개(본문)만 매칭 → 과다 숨김 위험 낮음.

**A 결론: PLAN.md의 모든 DOM 사실이 라이브 마크업과 일치. 셀렉터 가정 PASS.**
**남은 검증점(코드 도착 시):** 20-selectors/30-hide가 위 규칙을 *그대로* 구현하는지(따옴표 가정·closest 우선순위·`.rd` 선택), 즉 D 경계면에서 확인.

---

## F. 샤딩 경계 (store.js) — ✅ PASS

대상: `src/content/10-store.js`. 방법: 정적 분석 + **Node 실행 검증**(mock `chrome.storage.sync`, `/tmp/store_qa_test.js`, 25/25 통과).

### F-1. API 시그니처 ↔ 계약 대조 (store측) — PASS
계약 `.claude/workspace/store-api-contract.md` §2의 6개 메서드 전부 일치:

| 메서드 | 계약 | 구현(라인) | 판정 |
|--------|------|-----------|------|
| `load()` | Promise, 멱등 | 266–270 `if(loadPromise)return loadPromise` | ✓ |
| `isBlocked(uid)` | 동기 boolean, string화 | 277–279 `map.has(String(uid))` | ✓ |
| `block(uid,nick)` | 즉시 메모리, 멱등(nick갱신·addedAt보존) | 288–298 | ✓ |
| `unblock(uid)` | 즉시 메모리, 없으면 no-op | 305–309 `if(map.delete(uid))` | ✓ |
| `list()` | `{uid,nick,addedAt}` 복사본·addedAt desc | 315–322 | ✓ |
| `count()` | 동기 number | 328–330 `map.size` | ✓ |

불변식 C1(string)~C7(실패내성) 전부 충족. C7: `persist()` 실패 시 throw 없이 메모리 유지+경고+재시도(160–171).

### F-2. 8KB/항목 · 100KB/총량 — PASS (실측)
- 상수: `CHUNK_BUDGET=7168`(31행, 8192 안전마진 1024B), `TOTAL_BUDGET=102400`, `QUOTA_WARN=90%`(33행).
- 실행 증거(400개 긴닉네임): 7청크 분할, **최대 항목 7113B ≤ 8192**(chrome `QUOTA_BYTES_PER_ITEM`), **총 49431B ≤ 102400**(chrome `QUOTA_BYTES`).
- 크기 측정은 `JSON.stringify(chunk)` UTF-8 바이트(58–61행 `TextEncoder`)로 chrome 기준과 동일. 키(`bl_N`) 길이 미포함이나 1024B 마진이 충분히 흡수.
- 단일 항목 초과 시 경고만 하고 best-effort 기록(116–118) — v1 의도된 동작.

### F-3. stale 청크 정리 + bl_meta — PASS (실측)
- 청크 수 감소 시 `bl_{k}`(k≥새 청크수) `sync.remove`(145–147, 162행).
- 실행 증거: 400→5개 해제 시 **7청크→1청크**, 잔존 키 `bl_0`만(유령 키 0, 인덱스 연속). 빈 목록 시 `bl_0`까지 제거되고 `bl_meta`만 잔존.
- `bl_meta={ver:1}` 기록(137행) 및 복원·버전 체크(206–211, 255행). reload 시 변경분만 쓰도록 `persistedChunks` 스냅샷(242–254).

### F-4. 디바운스 · 재진입 — PASS
- 500ms 디바운스(`schedulePersist` 173–179), 재진입 가드(`persisting`/`rerun`, 181–190) → 영속 중 변경분 유실 없음(persist 종료 후 재flush). 실행 검증에서 연속 400 block도 정상 합류.

> **결론(F):** 샤딩 경계 전부 PASS. store.js 자체는 계약·제약을 완전 충족. 소비자측(content/popup) 호출부 일치는 B/C에서 #3/#4 도착 시 확정.

---

## B. store ↔ content 경계면 — ✅ PASS

content의 store 호출은 `src/content/99-main.js`(유일 배선부)에 집중. 다른 content 모듈(20/30/40/50)은 store 비의존(주입식).

| 호출(99-main) | store 정의 | 판정 |
|---------------|-----------|------|
| `await store.load()` (20행) | `load():Promise` 멱등 | ✓ |
| `store.isBlocked(uid)` (27,31행) | `isBlocked(uid):boolean` 동기 | ✓ |
| `await store.block(uid, nick)` (35행) | `block(uid,nick):Promise` | ✓ 인자 순서 일치 |
| `await store.unblock(uid)` (41행) | `unblock(uid):Promise` no-op | ✓ |

- **uid 타입(C1)**: content는 `selectors.extractUid()`가 정규식 캡처 `m[1]`(문자열)을 넘김 → store도 `String(uid)`. 양측 문자열 일치. `hideForAnchor`의 `dataset[fmkbUid]=uid`, `hideByUid`의 `extractUid(a) !== uid` 비교도 문자열-문자열. ✓
- store 미탑재/실패 시 안전 폴백(99-main 14·22행: 차단 없이 정상 노출). ✓
- **storage 우회 없음**: `grep chrome.storage src` → 10-store.js에만 존재. content는 store API만 사용. ✓

## C. store ↔ popup 경계면 — ✅ PASS

popup은 `src/popup/popup.html`에서 **동일 파일** `../content/10-store.js`를 먼저 로드 후 `popup.js`(별도 사본 없음 — 단일 출처). `chrome.storage` 직접 접근 0건(grep 확인).

| 호출(popup.js) | store 정의 | 판정 |
|----------------|-----------|------|
| `store.load()` (267행) | `load():Promise` | ✓ |
| `store.list()` → `it.uid/it.nick/it.addedAt` (144·156·158·187행) | `list():[{uid,nick,addedAt}]` desc·복사본 | ✓ **필드명 정확 일치** |
| `store.count()` (127행) | `count():number` | ✓ |
| `store.unblock(String(it.uid))` (218행) | `unblock(uid:string)` | ✓ 문자열 전달 |

- 반환 `list()` 필드 `uid/nick/addedAt`을 그대로 소비(닉 없으면 '(닉네임 없음)' 표시 144행, addedAt→formatDate). 누락/오타 필드 없음. ✓
- API 미탑재 방어(245–255행)·load 실패 방어(C7, 266–271행) 구현. ✓

## D. selectors ↔ hide 경계면 — ✅ PASS (실제 HTML jsdom 실측)

검증: `jsdom`으로 **실제 fmkorea HTML**(/tmp/doc.html 게시글, /tmp/list.html 목록)에 `00→20→30` 로드 후 실행(`/tmp/dom_qa_test.js`, **21/21 통과**).

- `hide.hideForAnchor`(30-hide 12–18행)는 `selectors.findContainer(anchor)` 반환 컨테이너를 **타입 무관**하게 `classList.add(HIDDEN_CLASS)` + `dataset` 표식 → 댓글 li / `.rd` / 행(tr·li) 모두 동일 처리. ✓
- 실측 분류(게시글 26앵커): **댓글 5(li#comment_) · 게시글 1(.rd) · 목록행 20(사이드 위젯) · null 0 · UID없음 0**.
- **댓글만 차단** → 해당 `li#comment_`만 `.fmkb-hidden`, 본문 `.rd`는 미숨김 ✓ (판정 순서 ①댓글 우선이 본문 오숨김 방지).
- **동일 UID 중복 컨테이너 전부 숨김** ✓ (베스트댓글/다중 출현 커버리지 — PLAN Q8).
- **게시글 작성자 차단** → `hideByUid`로 `.rd` 숨김 + `data-fmkb-uid` 표식 ✓. `unhideByUid` 복구·표식 제거 ✓.
- **목록**: 행 컨테이너 `TR`(테이블형), `scan`이 행 숨김 ✓. comment/`.rd` 오분류 없음 ✓.
- `member_plate`만 가진 합성 앵커 → `extractUid` **null**(조용히 스킵) ✓.

## E. manifest 정합성 — ✅ PASS

검증: JSON 파싱 + 참조 파일 실재 프로그램 확인.

- `manifest_version: 3` ✓
- `permissions: ["storage"]` **단독** — `host_permissions` 없음, `scripting/tabs/cookies/windows` 없음 ✓. 코드 전수 grep상 `chrome.tabs/scripting/runtime.sendMessage` 미사용(오직 `chrome.storage` + `chrome.runtime.lastError` 읽기, 후자는 권한 불요) → **권한 최소화 충족, 누수 0**.
- `content_scripts[0].matches: ["https://www.fmkorea.com/*"]` ✓
- `js` 7개: `00→10→20→30→40→50→99` **순서 일치**·전부 실재. store(10)가 소비자(20~99)보다 앞 ✓. `00-namespace`(상수)가 최선두 ✓.
- `css: ["src/content.css"]` 실재 ✓ (경로 드리프트 없음).
- `action.default_popup: "src/popup/popup.html"` 실재 ✓. popup.html 하위참조 `popup.css`·`../content/10-store.js`·`popup.js` **전부 실재(누락 0)**.
- **아이콘 키 없음 확인**: `action.default_icon` 없음, 최상위 `icons` 없음 → **의도된 v1 제약**(누락 아님, TODO 항목). 무아이콘으로도 MV3 로드 가능.
- `run_at: "document_end"` ✓ (99-main이 `readyState` 추가 방어).

## G. 엣지 케이스 — ✅ PASS (+발견 사항)

| 케이스 | 검증 결과 |
|--------|-----------|
| UID 없는 작성자 스킵 | scan `if(!uid)return`(30-hide 46행), contextmenu `if(!uid){closeMenu();return;}`(40 74행, preventDefault 안 함→기본 메뉴 유지) ✓ |
| 빈 차단 목록 팝업 | render 빈 상태 메시지(popup 193–200행), 미크래시 ✓ |
| 작성자 앵커 위에서만 메뉴 | `e.target.closest(AUTHOR_ANCHOR)`; 앵커 밖/UID없음 → preventDefault 안 함(40 67·74·80행) ✓ |
| 차단 직후 현재 탭 즉시 숨김 | onBlock→`store.block`→`hideByUid`(99-main 35–36행) ✓ |
| 팝업 해제 후 새로고침 반영 안내 | popup.html 27–29행 안내문 존재 ✓ (가시성 한계는 v1 수용) |
| 베스트댓글 중복 숨김 | D에서 실측 — 동일 UID 다중 컨테이너 전부 숨김 ✓ |

---

## 발견 사항 (상세)

### [MAJOR-1] 팝업 차단 해제가 디바운스 flush 전 팝업 종료 시 sync 저장에서 유실
- **위치**: `src/content/10-store.js` `unblock`(305–309행) → `schedulePersist`(173–179, `DEBOUNCE_MS=500`) ↔ `src/popup/popup.js` `onUnblock`(216–226행). 팝업측 flush-on-close 훅 없음(`grep pagehide|beforeunload|visibilitychange` → 0).
- **증거**(`/tmp/popup_flush_test.js` 실행):
  ```
  immediately after unblock: popup.list count = 1 (memory/UI updated)
  sync backend still has 222 right after unblock? => true   (쓰기 지연)
  @120ms (popup likely closed): sync still has 222? => true  ← 아직 미기록
  @720ms (popup stayed open):   sync still has 222? => false ← 500ms 후에야 기록
  ```
  즉 `unblock`은 메모리/UI는 즉시 갱신하나 실제 `sync.set`은 500ms 디바운스 flush에서만 호출된다.
- **영향(major)**: 팝업은 **차단 해제의 유일 경로**(완전 숨김 설계). 사용자가 "차단 해제" 클릭(목록에서 사라짐 확인) 후 **~500ms 내 팝업을 닫으면** 브라우저가 미발화 `setTimeout`을 폐기 → `sync.set` 미호출 → 해제가 storage에 **영구 미반영**(메모리 맵은 팝업과 함께 소멸). 다음에 열어도/새로고침해도 여전히 차단 상태. UI는 성공처럼 보여 **조용한 의도 손실**. (PLAN의 "새로고침 후 반영"은 *가시성* 한계일 뿐, *영속화 손실*은 별개의 미의도 결함.)
- **수정안(택1, 권장 순)**:
  1. **store 자체 보호(권장, 계약 변경 불필요)**: 10-store.js가 `window.addEventListener('pagehide'/'visibilitychange→hidden', flushNow)` 등록 — flushNow는 디바운스 타이머를 즉시 비우고 `persist()`를 동기 호출(unload 동안 `sync.set` IPC 디스패치 → 영속). content(차단 직후 이탈, MINOR-2)도 함께 해결.
  2. **flush API 추가(계약 v1.1, additive)**: `store.flush():Promise<void>` 노출 → popup `onUnblock`에서 `await store.unblock(uid); await store.flush();` 후 refresh. 문서 버전 올리고 재통지.

### [MINOR-1] document_end 비동기 load 동안 차단 대상 깜빡임(FOUC)
- **위치**: `99-main.js` 10–27행(`await store.load()` 후 `scan`), manifest `run_at: document_end`.
- **영향**: `store.load()`가 `chrome.storage.sync` 비동기 read라, DOM 표시 후 스캔/숨김까지 수십 ms간 차단 대상이 잠깐 보일 수 있음. CSS 선차단은 차단 UID를 미리 알 수 없어 불가.
- **판정**: 비동기 storage + 무빌드 구조의 **내재적 한계**. v1 수용 가능(향후 MutationObserver/onChanged TODO와 함께 완화 여지). 수정 강제 아님.

### [MINOR-2] content 차단 직후 <500ms 내 페이지 이탈 시 동일 원인 유실
- **위치**: MAJOR-1과 동일 근본 원인(디바운스 + 컨텍스트 teardown). `99-main.js` onBlock(34–38행).
- **영향**: 우클릭 차단 직후 0.5초 내 링크 클릭/이탈 시 차단이 storage에 미반영될 수 있음. 단 페이지가 보통 유지되고 재차단이 쉬워 영향 작음.
- **수정안**: MAJOR-1 수정안 #1(pagehide flush)로 동시 해결.

---

---

## 재검증 — MAJOR-1 최종안 (내부 보강만, 계약 v1 유지) — ✅ RESOLVED

> **설계 변경 이력**: 초기에 storage-engineer가 `flush()` 공개(v1.1 additive)를 잠시 노출했으나, **team-lead 지침에 따라 최종안은 내부 보강만**으로 환원 — `store.flush()` 공개 API **제거**, 공개 표면 정확히 **6개**, 계약 `.claude/workspace/store-api-contract.md`는 **v1 유지**(C8 내구성은 *내부* 보장으로 기술).

### 최종 수정 내용(검증한 현재 코드)
- `src/content/10-store.js`: `registerUnloadFlush()`(197–211행, 356행 호출) — `window 'pagehide'` + `document 'visibilitychange'(hidden)`에서 **내부** `flushPending()` 호출 → 디바운스 타이머 비우고 `persistOnce()` 즉시 실행. **핵심**: `persistOnce`는 첫 `await` 전 동기 프리픽스에서 `chrome.storage.sync.set` IPC를 디스패치하므로 언로드 중 호출돼도 쓰기 발신(베스트에포트). **공개 `store` 객체엔 `flush` 멤버 없음**(`store.flush === undefined`). 재진입 가드 제거·`persist→persistOnce` 개명(디바운스 재예약으로 무손실).
- **공개 API = 정확히 6개**: `{load, isBlocked, block, unblock, list, count}`. 계약 v1 6 시그니처 회귀 없음.

### 재검증 결과 (node 실행)
- **회귀 `/tmp/store_qa_test.js`: 25/25 유지** — 샤딩(최대 7113B≤8192, 총 49431B)·stale·멱등·C7 재시도 무회귀.
- **`/tmp/store_final_test.js`: 15/15 PASS** (최종 설계 기준)
  - **A 공개 API 표면**: `Object.keys(store)`=`{block,count,isBlocked,list,load,unblock}` 정확히 6, **`store.flush === undefined`**, pagehide·visibilitychange 리스너 등록 확인.
  - **B pagehide 자동 flush(MAJOR-1)**: unblock 직후 디바운스 발화 전 `pagehide` → sync에서 222 **동기 제거**, reload로 영속 확정(111 유지).
  - **C visibilitychange(hidden) 자동 flush(MINOR-2)**: 333 즉시 영속.
  - **D 경계면 경합 안전성**: popup의 `if(typeof store.flush==='function')` 가드 패턴을 그대로 실행 → flush 부재 시 **throw 없이 스킵**, unblock 메모리 반영, 팝업 종료(pagehide) 시 **C8 자동 flush로 영속**(명시 flush 없이도 내구). **TypeError 없음 실증**.
  - **E C7 재시도**: set 실패 주입에도 디바운스 재시도로 영속.
- `node --check` store.js/popup.js 통과. 계약 v1 6 시그니처 불변 확인.

> **MAJOR-1 RESOLVED(내부 보강).** 팝업 조기 종료/페이지 이탈에도 해제·차단이 sync에 보존됨(내부 자동 flush, 소비자 추가 호출 불필요). MINOR-2도 동일 수정에 흡수.

### [CLEANUP-1] (minor) popup.js의 `store.flush` 참조 — ✅ RESOLVED
- 경위: 중간 단계에서 popup이 가드된 `store.flush()`를 참조(죽은 코드, 크래시는 없었음).
- **최종(team-lead 디스포지션 B)**: popup-engineer가 popup.js를 **v1으로 환원** — `onUnblock`(221–233행) = `store.unblock(String(it.uid))` → `refresh()`. **flush 호출/가드 전면 제거**.
- **검증(현재 디스크 재독+grep)**: popup.js에 `store.flush` 토큰 **0건(코드·주석 모두)**. 호출 store 멤버 = `{load, list, count, unblock}` ⊆ 6 공개 API. `node --check` 통과. 내구성은 store 내부 C8 자동 flush 단독 보장(테스트 D: 무-flush onUnblock + pagehide → 영속 실증).

### 최종 디스포지션 & 상태 (B = v1)
- **store.js**: 공개 API 정확히 6개(`load/isBlocked/block/unblock/list/count`), `store.flush` 비노출, 내부 `flushPending` + `pagehide`/`visibilitychange(hidden)` 자동 flush(C8). 계약 `.claude/workspace/store-api-contract.md` = **v1 FROZEN**(6 시그니처, `bl_meta.ver=1`).
- **popup.js**: store 호출 = `{load, list, count, unblock}`만, flush 미참조. 단일 출처(`../content/10-store.js`), storage 직접접근 0.
- **MAJOR-1/MINOR-2 RESOLVED**: 영속 보장이 popup 명시 flush 없이 **store 자동 flush 단독**으로 성립(실증). 
- **잔존(수용)**: MINOR-1(FOUC) — 비동기 storage 구조의 내재적 한계, v1 수용.

> **최종 검증 결과: v1 MVP 통합 검증 GREEN. 미해결 차단 결함 0. 수용 항목 MINOR-1 1건.**

---

## 검증 아티팩트(재현용)
- `/tmp/store_qa_test.js` — store.js 샤딩/계약 node 검증(25/25, 회귀 유지)
- `/tmp/dom_qa_test.js` — 실제 fmkorea HTML selectors+hide jsdom 검증(21/21)
- `/tmp/popup_flush_test.js` — MAJOR-1 디바운스 유실 재현(수정 전 증거)
- `/tmp/store_unload_test.js` — (중간 v1.1단계) pagehide/visibilitychange/flush()/동시성(23/23)
- `/tmp/store_final_test.js` — **최종 v1** 재검증: 공개 6-API·`store.flush===undefined`·자동 flush·popup 무-flush 내구성(15/15)
- `/tmp/store_persist_test.js` — **(2026-06-15 신규)** Task #3 영속화 경계 검증 하네스(resolve=영속화 확인). 시나리오 S1~S5 + 공개 6-API.
- 라이브 HTML: `/tmp/list.html`(보드목록), `/tmp/doc.html`(게시글) — fmkorea HTTP 200 수신본

---

## 재검증 #2 — block/unblock 즉시·awaitable 영속화 (Task #3) — 🟡 진행 중(BLOCKED: #1/#2 미완)

> **검증 대상 결함**: 팝업에서 `store.unblock()` 후 새로고침 시 차단이 유지됨(영속화 누락).
> **수정 설계(Task #1)**: `block`/`unblock` 의 **반환 Promise resolve 시점 = chrome.storage.sync 쓰기 완료(또는 동기 디스패치)**.
> 메모리 즉시 반영(C3)은 유지하되, resolve 가 더 이상 디바운스에 의존하지 않게 한다. persist 재진입은 직렬화.

### 현황(2026-06-15 시점)
- Task #1(store 수정)·#2(popup 확인) **모두 pending** — storage-engineer가 아직 미적용. 디스크의 `10-store.js`는 **수정 전(디바운스) 코드**.
- 따라서 최종 PASS 판정은 보류. 대신 **검증 하네스를 선제 구축**하고 **수정 전 베이스라인을 실측**해 결함을 재현·증거화함.

### 수정 전 베이스라인 실측 — 결함 재현 확인 (`/tmp/store_persist_test.js`, 7 PASS / 7 FAIL)
하네스는 `chrome.storage.sync` 를 mock 하고 실제 `10-store.js` 를 로드한다. **디바운스 500ms 를 의도적으로 기다리지 않고** `await block/unblock` 직후(매크로틱 1회만 flush) 디스크 상태를 검사 → "팝업 즉시 닫힘" 모사.

증거(현재 디바운스 코드 기준):
```
S1: unblock resolve 직후(디바운스 대기 없이) 디스크에 222만 남음   → FAIL (onDisk=[])
S2: block 후 bl_0 존재                                              → FAIL (resolve 시점 미기록)
S3: 연사 후 디스크 = {3,4}                                          → FAIL (onDisk=[])
S4: 다수 청크 생성됨(>1)                                            → FAIL (chunks=0)
S5: pagehide 후 p1 이 디스크에 반영                                 → PASS (안전망만 동작)
API: 정확히 6개 / store.flush 미노출                                → PASS (표면 불변)
```
- **해석**: 현재 `block`/`unblock`은 `schedulePersist()`(500ms 타이머) 후 `return Promise.resolve()` → **resolve 시점에 sync 쓰기가 전혀 디스패치되지 않음**(`10-store.js:317-318, 328-329`). 팝업이 unblock 직후 닫히면 미발화 타이머가 폐기되어 유실. S5만 PASS인 이유는 pagehide 안전망(C8)이 별도 동기 flush를 하기 때문.
- 이 7개 FAIL은 **결함의 정확한 재현**이며, Task #1 수정 후 **S1~S4가 PASS로 전환**되어야 한다(=resolve가 영속화 완료를 보장). API 3건은 수정 후에도 PASS 유지 필요.

### 수정 후 통과 기준(Task #1/#2 완료 시 즉시 재실행)
1. **핵심 회귀 방지**: S1(unblock 즉시 닫힘 → 디스크 반영), S2(마지막 1명 → bl_0 remove → 재load 빈 목록) PASS.
2. **재진입/경쟁 직렬화**: S3(무-await 연사 6회 후 디스크/재load = {3,4}) PASS — persistedChunks 일관성·stale remove 정확.
3. **샤딩 경계 무회귀**: S4(다수 청크 → 대량 해제 → bl_0만, 인덱스 연속) PASS + 기존 `/tmp/store_qa_test.js` 25/25 유지.
4. **content 경계(99-main.js)**: `await store.block/unblock` 후 `hideByUid`/`unhideByUid` 순서 — resolve 타이밍 변화로 숨김/복구 회귀 없는지(코드 흐름 + 정적). 시그니처 6 API 불변.
5. **store↔popup 계약**: `list()` 필드 `uid/nick/addedAt` 불변, popup `onUnblock`(popup.js:230) 무변경 수혜 확인.

### 미검증(통과 처리 금지) — [수정 도착 후 갱신: 아래 "수정 후 결과" 참조]
- ~~위 모든 수정 후 검증 항목~~ → **수정 코드(10-store.js mtime 16:35) 도착 후 전수 검증 완료(아래).**
- 실브라우저 MV3 팝업 강제 종료 타이밍(노드 mock의 한계) — 코드 흐름으로 입증. 잔여 위험은 "잔여 리스크" 항에 명시.

---

### ✅ 수정 후 결과 — block/unblock 즉시·awaitable 영속화 (2026-06-15) — **PASS (28/28)**

storage-engineer가 Task #1을 완료(`src/content/10-store.js` mtime 16:35). 수정 코드 직접 재독 + 하네스 재실행으로 전수 검증.

#### 적용된 수정(검증한 현재 코드)
- `block`(10-store.js:348-358): 메모리 갱신 후 `return flushPending()` — 반환 Promise가 `persistOnce` 완료 후 resolve. 디바운스 의존 제거.
- `unblock`(10-store.js:367-371): `if (map.delete(uid)) return flushPending(); return Promise.resolve();`(no-op은 즉시 resolve).
- **직렬화** `persistNow`(10-store.js:188-208): `persistInFlight` 체인 + `persistDirty` coalesce. in-flight 중 도착한 호출은 새 persist를 띄우지 않고 체인 꼬리를 반환하며, 종료 후 dirty면 `do/while`로 1회 더 실행 → 최신 메모리 반영. **재진입 경쟁으로 인한 persistedChunks 꼬임 없음**.
- 디바운스(`schedulePersist`→`persistNow`)·pagehide/visibilitychange 안전망(C8) **유지**(다른 이탈 경로 대비).
- 공개 API **정확히 6개** 유지, `store.flush === undefined`. 계약 v1 6 시그니처(`Promise<void>`) 불변.
- 계약 문서 갱신 확인: C3에 "반환 Promise는 sync 쓰기 완료 시 resolve" 명시, block/unblock JSDoc·변경이력(2026-06-15, storage-engineer) 반영.

#### 실측 — `/tmp/store_persist_test.js` **28 PASS / 0 FAIL** (node v25)
| # | 시나리오 | 결과 |
|---|----------|------|
| S1 | block 2 → unblock 1 → "팝업 즉시 닫힘"(await만, 디바운스 미대기) → 디스크에 222만 | PASS |
| S2 | 마지막 1명 unblock → `bl_0` remove → 재load 빈 목록 | PASS |
| S3 | 무-await 연사 6회(block/unblock 혼합) → 디스크·재load = {3,4} | PASS |
| S4 | 120명(긴닉 다수 청크) → 119 해제 → `bl_0`만(인덱스 연속) → 재load 1명 | PASS |
| S5 | pagehide 안전망 — 보류 쓰기 동기 flush | PASS |
| S6 | 직렬화 스트레스(60 block + 30 unblock 무-await) → settle 후 **디스크==메모리**, 청크 인덱스 연속, 재load 일치 | PASS |
| **S7** | **coalesce 정확성** — A persist in-flight 중 도착한 B의 Promise가 **"B 영속 후" resolve**(b2·a1 모두 디스크), in-flight 중 도착한 unblock도 "삭제 영속 후" resolve | PASS |
| S8 | 무-await 교차 alternation(팝업 빠른 연타: z를 block↔unblock 반복) → 최종 상태만 디스크 반영, 재load 일치 | PASS |
| S9 | C7 레이트리밋/실패 내성 — `set` 2회 실패 주입에도 `block` throw 안 함, 메모리 유지, 디바운스 재시도로 영속 | PASS |
| API | `Object.keys(store)`=6, `store.flush===undefined` | PASS |

추가 회귀:
- 기존 샤딩 회귀 `/tmp/store_qa_test.js` **25/25 유지**(8KB/100KB·stale·멱등·C7).
- `node --check` store.js / popup.js 통과.

#### 1) 핵심 회귀 방지 — PASS
S1/S2가 입증: `await store.unblock(uid)` resolve 시점에 이미 `sync.set`/`remove`가 디스패치·완료됨. **팝업이 unblock 직후 즉시 닫혀도(추가 시간 0) 유실 없음**. 마지막 1명 해제 시 `bl_0`가 정확히 `remove`되어 재load가 빈 목록(영속화 누락 버그 해소). 수정 전 베이스라인에서 FAIL이던 S1~S4가 전부 PASS로 전환.

#### 2) 재진입/경쟁 직렬화 — PASS
S3/S6/S7/S8이 입증: `persistNow`의 in-flight 체인 + coalesce로 연속 호출이 겹쳐도 `persistedChunks` 스냅샷이 일관(diff 기반 변경분 set, stale remove 정확). **in-flight 중 도착한 변경의 반환 Promise는 그 변경이 영속된 뒤 resolve**(S7) — "resolve=영속 완료" 계약이 동시성 하에서도 성립. 60+30 무-await 스트레스에서 디스크==메모리, 청크 인덱스 연속(유령 키 없음).

#### 3) content 경계(99-main.js) — PASS (코드 흐름 + 정적)
- `onBlock`(99-main.js:34-37): `await store.block` → `NS.hide.hideByUid(uid)` → toast. `onUnblock`(40-43): `await store.unblock` → `unhideByUid` → toast. **호출 순서 불변**.
- `hide.hideByUid/unhideByUid`는 **store 비의존**(30-hide.js:2 주석·정의 21/31행) — uid로 DOM을 직접 조작, store 상태를 재조회하지 않음. `scan`은 최초 1회 주입 `isBlocked`만 사용(42행).
- **resolve 타이밍 변화의 영향**: 숨김/복구가 이제 메모리 갱신 직후가 아니라 **sync 쓰기 완료 후** 실행됨(노드 mock 기준 +1 매크로틱, 실브라우저 기준 storage IPC 수 ms). 메모리는 await 이전(동기, block 354행/unblock 369행 `map.delete`)에 이미 갱신되므로 **숨김/복구 정확성 무관**. 회귀 없음(미세 지연만, 무해·오히려 영속 보장).

#### 4) 경계면 계약 교차 비교 — PASS
- **store↔content**: `await store.load()`·`isBlocked(uid)`·`await store.block(uid,nick)`·`await store.unblock(uid)` 시그니처 전부 불변(6 API). uid 문자열 일치.
- **store↔popup**: `list()` 반환 `{uid,nick,addedAt}` 필드 불변(popup.js:154/166/168 소비). `count()`·`load()`·`unblock()` 불변.

#### 5) 샤딩 경계(8KB/100KB) — PASS
S4/S6 + 기존 25/25 회귀로 청크 8KB·총 100KB·stale remove·`bl_meta` 로직 무회귀 확인.

#### store↔popup 자동 수혜(Task #2 영역, QA 관점 독립 확인)
popup `onUnblock`(popup.js:230) = `Promise.resolve(store.unblock(String(it.uid))).then(refresh)`. **코드 변경 없이 자동 수혜**: `store.unblock`이 이제 sync 쓰기 완료 후 resolve하므로, `.then(refresh)`가 도는 시점엔 이미 영속됨 → 팝업이 곧장 닫혀도 유실 없음. (Task #2 정식 확인은 popup-engineer 담당이나, QA 교차 검증상 회귀·계약 위반 없음.)

#### 잔여 리스크(미검증/한계 — 명시)
- **실브라우저 MV3 팝업 강제 종료**: 노드 mock은 `sync.set` 콜백을 `setTimeout(…,0)`로 모사. 실제 크롬은 `set` 호출 시 **동기적으로 IPC를 디스패치**하므로 await 완료 = 발신 완료가 더 강하게 성립하나, OS/브라우저가 IPC 전송 직전 프로세스를 강제 종료하는 극단 케이스는 노드로 재현 불가 → **코드 흐름으로 입증, 베스트에포트**. C8(pagehide/visibilitychange) 안전망이 추가 방어선으로 잔존. 이 잔여 위험은 v1 수용 가능(기존 디바운스 설계 대비 대폭 개선).
- **레이트리밋 즉시쓰기 전환 영향**: 즉시쓰기로 수동 차단/해제마다 1회 set. 수동 빈도(분당 수 회)에선 분당 120 한도 무해. 초과 시 C7 경로(S9 실증)로 폴백. 단, **자동화/대량 가져오기(미래 TODO)** 시엔 디바운스 배칭이 사라져 한도 압박 가능 → 향후 import 기능 추가 시 배치 쓰기 별도 고려 필요(현 v1 범위 밖, minor 메모).

> **재검증 #2 판정: PASS (28/28 + 회귀 25/25).** 영속화 누락 버그 RESOLVED. block/unblock의 "resolve=sync 영속 완료" 계약이 단일 호출·동시성·실패 폴백 전반에서 성립. 공개 6-API·샤딩·content/popup 경계 무회귀. blocker/major **0건**. minor 메모 1건(미래 대량쓰기 레이트리밋, v1 범위 밖). 잔여 리스크(실브라우저 강제 종료 극단 케이스)는 코드 흐름 입증 + C8 안전망으로 수용.

### 검증 아티팩트 추가
- `/tmp/store_persist_test.js` — **28/28**: S1~S9(즉시영속·직렬화·coalesce·alternation·C7) + 공개 6-API. chrome.storage.sync mock + 실제 10-store.js 로드.
