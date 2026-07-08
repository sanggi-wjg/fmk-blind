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

---

## 재검증 #3 — 라이브 동기(C9) `chrome.storage.onChanged` 정적·경계면 검증 (2026-06-15, Task: onChange)

- 담당: extension-qa
- 범위: 가산적 7번째 API `onChange(cb)->unsubscribe` + `rebuildFromStorage` 추출 + onChanged 리스너 + 단일 직렬화 큐(`serialTail`/`enqueueSerial`) + content(99-main)·popup(popup.js) 배선
- 방법: **정적 정합성 + 경계면 교차 비교만** 수행. 다중 컨텍스트(탭↔팝업 onChanged 전파) 런타임 동작은 Node mock이 실 Chrome 직렬화·다중 컨텍스트를 재현 못 하므로 **"실브라우저 검증 필요(미검증)"로 명시**(MEMORY 교훈: mock 거짓 PASS 전례).
- 판정: **blocker 0 / major 0 / minor 0.** 정적·경계면 전 항목 PASS. 다중 컨텍스트 라이브 전파는 미검증(아래 명시).

### V1. 문법 검사 — PASS
`node --check` 통과: `10-store.js`, `99-main.js`, `popup.js`, `30-hide.js` 모두 OK.

### V2. 정적 정합성: manifest js ↔ 실제 파일 7개 — PASS
- `manifest.json` `content_scripts[0].js` 7개 항목 ↔ `src/content/*.js` 7개 파일 1:1 실재 확인(00-namespace,10-store,20-selectors,30-hide,40-contextmenu,50-toast,99-main). MISS 0.
- 로드 순서: `10-store.js`가 소비자(99-main:51)보다 앞. `00-namespace.js`(NS.hide 등 상수/네임스페이스 정의)가 30-hide·99-main보다 앞. onChange 추가로 깨진 참조 없음.
- `src/content.css`(manifest css), `src/popup/popup.html`(action.default_popup) 실재.
- popup.html: `<script src="../content/10-store.js">`(41행) → `<script src="popup.js">`(42행) 순서 — popup이 store를 소비자보다 먼저 로드(단일 출처, 사본 금지 준수).

### V3. 경계면 — onChange 계약 일치 — PASS
**store 정의(10-store.js:511-518)**: `onChange: function (cb)` → `typeof cb !== 'function'`이면 no-op unsub 반환, 아니면 `changeSubscribers.push(cb)` 후 `unsubscribe()` 반환. 콜백 인자 = `applyExternalChange`(98-118)가 만든 `{ added: string[], removed: string[] }`(uid 문자열 배열).

- **content 소비(99-main.js:51-56)**: `if (typeof store.onChange === 'function')` 가드 후 `store.onChange((d) => { d.added.forEach(uid => NS.hide.hideByUid(uid)); d.removed.forEach(uid => NS.hide.unhideByUid(uid)); })`. → `d.added`/`d.removed`가 string[]라는 store 출력과 정확히 일치. uid를 문자열 그대로 hide 함수에 전달(XSS 무관 — innerHTML 미사용). **일치.**
- **popup 소비(popup.js:301-305)**: `if (typeof store.onChange === 'function')` 가드 후 `store.onChange(function () { refresh(); })`. diff 인자 미사용 — `refresh()`가 `store.list()`/`count()` 전체 재조회로 일괄 갱신. store 계약상 콜백 무인자 호출도 안전(자바스크립트 인자 무시). **일치.**
- 반환값 `unsubscribe`: content는 단일 페이지 생명주기라 미보관(페이지 언로드 시 컨텍스트 GC), popup도 단수명이라 미보관 — 둘 다 누수 아님(주석에 근거 명시 popup.js:294-295). 계약상 unsubscribe는 선택 사용.

### V4. 경계면 — NS.hide.hideByUid / unhideByUid 존재·시그니처 — PASS
- `hideByUid(uid)` 정의: 30-hide.js:31 — `AUTHOR_ANCHOR_SELECTOR` 전체 훑어 `extractUid(anchor) === uid`인 앵커의 컨테이너 숨김. 인자 = uid 문자열. **존재·시그니처 일치.**
- `unhideByUid(uid)` 정의: 30-hide.js:21 — `.fmkb-hidden[data-fmkb-uid="<uid>"]` 셀렉터로 복구. 인자 = uid 문자열. **존재·시그니처 일치.**
- 호출처 4곳(99-main.js:36,42,53,54) 모두 uid 문자열 전달. onChange 신규 배선(53,54)이 기존 우클릭 배선(36,42)과 **동일 함수·동일 시그니처 재사용** — 신규 표면 없음, 회귀 위험 낮음.
- 주의(설계상 한계, 버그 아님): `hideByUid`/`unhideByUid`는 **현재 DOM에만** 작용. AJAX/무한스크롤 신규 노드는 onChange로 즉시 반영 안 됨(MutationObserver는 별개 TODO) — 계약·주석에 명시됨(99-main.js:50). v1 수용.

### V5. popup refresh() onChange 콜백 재사용 안전성 — PASS
- `refresh()`(popup.js:247-258): `store.list()` try/catch → `allItems` 갱신 → `updateCount()` → `render()`. 부수효과는 화면 갱신뿐(스토리지 쓰기 없음). onChange 콜백에서 반복 호출돼도 멱등·안전.
- **중복 갱신 없음**: 팝업 자신의 `onUnblock`은 자기-쓰기 → store가 빈 diff로 콜백 미호출(V7). 따라서 `onUnblock`의 `.then(refresh)`(popup.js:237)와 onChange의 `refresh()`가 동시 발화하지 않음. 외부 변경시에만 onChange→refresh.
- 구독 등록은 `init`의 `load().then(...)` 안에서 **1회만**(popup.js:301). init 자체가 DOMContentLoaded/즉시 1회 실행 → 중복 구독 없음.

### V6. 기존 6 API FROZEN — PASS (회귀 없음)
- 시그니처 6개 모두 보존: `load()`(425) `isBlocked(uid)`(436) `block(uid,nick)`(449) `unblock(uid)`(468) `list()`(478) `count()`(491). onChange는 7번째로 **추가만**(가산적).
- `list()` 반환 필드 `{uid, nick, addedAt}`(481) desc 정렬·복사본 — 종전과 동일.
- `block`/`unblock`은 여전히 `flushPending()`(=`persistNow`) 반환 → C3(즉시·awaitable 영속화) 불변. 리팩터(rebuildFromStorage 추출)가 block/unblock 경로를 건드리지 않음.

### V7. 에코/자기-쓰기 무한루프 차단 — PASS (정적 논증)
- `applyExternalChange`(98-118): rebuild **전** `before = new Set(map.keys())` 스냅샷 → `rebuildFromStorage()`로 map 교체 → `after = map`. before↔after **키셋 diff**만 added/removed로 산출. `if (added.length===0 && removed.length===0) return;`(114) → 자기-쓰기 에코(자신의 persist가 유발한 onChanged)는 디스크 키셋이 메모리와 동일하므로 빈 diff → **콜백 미호출(no-op)**.
- onChanged 핸들러(142-152)는 `rebuildFromStorage`(읽기 전용, 절대 sync write 안 함)만 호출 → **피드백 루프 구조적 부재**. enqueueSerial로 persist와 같은 큐에서 순차 실행 → 인터리브 없음(rebuild는 진행 중 로컬 write 커밋 뒤 실행).
- ⚠️ 단, "빈 diff = no-op"이 **실제로 성립하려면** 자기-쓰기 후 디스크에서 읽은 청크가 메모리 키셋과 정확히 같아야 한다. **키셋(uid 집합) 기준**이므로 nick/값 변경·청크 직렬화 차이가 있어도 키 추가/삭제가 없으면 안전. 이 로직은 정적으로 타당하나, **실 Chrome onChanged 전파 타이밍·직렬화 차이에서의 최종 무한루프 부재는 실브라우저 검증 필요(미검증, 아래)**.

### V8. 리스너 생명주기 — PASS (정적), 다중 컨텍스트 전파는 미검증
- **단일 등록**: store.js 모듈 IIFE는 line 35 `if (root.FMKBlind.store) return;`(중복 주입 가드)가 line 522 `installOnChangedListener()`·line 524 store 노출보다 **먼저** 실행됨. 따라서 한 컨텍스트에 store.js가 두 번 주입돼도 두 번째는 line 35에서 조기 반환 → `onChanged.addListener`는 컨텍스트당 **정확히 1회**.
- **존재 가드**: `installOnChangedListener`(137-141)가 `chrome.storage.onChanged.addListener`의 typeof를 확인 후에만 등록 → 미지원 컨텍스트에서 안전(라이브 동기만 비활성, load 시점 동기화는 유효). 실제 `.addListener(` 호출은 142행 **1곳뿐**(139행은 typeof 가드).
- **영역 필터**: 리스너가 `areaName !== 'sync'` 조기 반환 + `bl_meta`/`/^bl_\d+$/` 키만 relevant 처리(143-149) → 무관 키 변경에 rebuild 안 함.
- ⚠️ **미검증(실브라우저 필요)**: content 탭 ↔ popup 간 onChanged **실제 전파**, 자기-쓰기 에코가 실 Chrome 직렬화에서 정말 빈 diff인지, 외부 변경이 열린 탭에 새로고침 없이 반영되는지는 **Node mock으로 거짓 PASS 전례**가 있어 정적 검증으로 단정 불가. → **실브라우저 콘솔 검증 필요.**

### V9. 샤딩 경계 무결 — PASS
- `rebuildFromStorage` 추출(346-406)은 기존 `load`의 복원 로직을 **함수로 뽑은 것**일 뿐: 8KB(`CHUNK_BUDGET=7168`)·100KB(`TOTAL_BUDGET=102400`)·`QUOTA_WARN` 상수 불변, `buildChunks`(206)·`persistOnce`(230)의 청크 diff(`persistedChunks[i] !== newVals[i]`)·stale remove(252)·`bl_meta` 복원(405) 로직 변경 없음.
- `doLoad`(409-415)는 이제 `rebuildFromStorage()` 위임 — 동작 동일(멱등 load는 store.load의 loadPromise 가드 426으로 유지).
- onChanged 경로의 rebuild가 `persistedChunks`를 디스크 권위로 리셋(393-404) → 계약 I2 해소 근거(외부 해제 후 로컬 block이 stale 청크 되쓰지 않음). 이 또한 정적 논증 — 실 직렬화 동등성은 실브라우저 판정.

### 재검증 #3 미검증 항목(통과 처리 금지 — 명시)
- **다중 컨텍스트 라이브 전파(탭↔팝업↔다른 기기)**: onChanged 실제 발화·전파 타이밍, 자기-쓰기 에코의 실 Chrome 빈-diff 성립, 외부 변경의 새로고침-없는 DOM 반영 — **전부 실브라우저 콘솔 검증 필요.** Node mock은 실 Chrome 직렬화·다중 컨텍스트를 재현 못 해 과거 resurrection 버그에 거짓 PASS를 준 전례 있음(CLAUDE.md/MEMORY). **정적·경계면만 PASS이며, 라이브 동기 "정상"은 단정하지 않음.**

> **재검증 #3 판정: 정적·경계면 PASS, blocker/major/minor 0건.** onChange는 가산적·비파괴로 6 API FROZEN 무회귀, content/popup 소비가 시그니처 일치, hide 함수 재사용 정합, 리스너 컨텍스트당 1회·존재 가드 안전, 에코/피드백 루프 구조적 부재. **단, 다중 컨텍스트 onChanged 전파·에코 무해성·새로고침-없는 반영은 실브라우저 검증 필요(미검증).**

---

## 재검증 #4 — MutationObserver 증분 처리(TODO Q6) (2026-07-08, branch `feat/mutation-observer-incremental`)

- 담당: extension-qa · 방법론: `extension-qa-verification`(경계면 교차 비교 + Node 하네스 + 라이브 셀렉터)
- 변경 범위(`git diff main`): 신규 `src/content/35-observer.js`(untracked, 84행), `src/content/99-main.js` 배선(+7행), `manifest.json`(js 목록에 35-observer 추가, ver `0.3.0`→`0.4.0`), 문서(PLAN/README/TODO).
- **store.js·store-api-contract.md diff 0(불변 확인) — 저장 계약 미변경.** `git diff main -- src/content/10-store.js .claude/workspace/store-api-contract.md` = 빈 출력.

### 판정 요약

| 검증 영역 | 상태 |
|----------|------|
| 1. 경계면 계약(35-observer 소비 API ↔ 00/20/30 정의, 99-main 배선) | ✅ **PASS** |
| 2. manifest 정합성(파일 실존·로드 순서·ver 0.4.0) | ✅ **PASS** |
| 3. 로직 검증(Node 하네스 A 격리 17 + B 통합 11 = 28 assert) | ✅ **PASS** |
| 4. 엣지 케이스(body 폴백/스캔-관찰 경계/컨테이너·앵커 혼재) | ✅ **PASS** |
| 5. 라이브 셀렉터(오늘자 fmkorea HTML) | ✅ **PASS** |
| 6. 실 Chrome MutationObserver 타이밍·AJAX 실사이트 동작 | ⚠️ **미검증(실브라우저 게이트)** |

> **재검증 #4 판정: 정적·경계면·Node 하네스 PASS, blocker/major/minor 0건.** 관찰: OBS-1(성능, 실브라우저 확인 권장). **실 Chrome 관찰자 타이밍·AJAX 삽입 실동작은 미검증 — 아래 실브라우저 체크리스트 필수.**

### 1. 경계면 계약 — PASS (양쪽 파일 대조)
35-observer가 소비하는 심볼을 정의처와 1:1 대조(모두 존재·시그니처 일치):
- `NS.AUTHOR_ANCHOR_SELECTOR`(35:36,42 소비) ↔ 00-namespace.js:18 정의 `'a[class*="member_"]'`. ✔
- `NS.MENU_ID`/`NS.TOAST_ID`(35:16 소비) ↔ 00-namespace.js:23,24 정의(`'fmkb-context-menu'`/`'fmkb-toast'`). ✔ 실 삽입부(40-contextmenu.js:21,42·50-toast.js:20,22)가 **최상위 노드로 body에 append** → 35의 top-level `isOwnUiNode` 체크와 정합(래핑 없음). ✔
- `NS.selectors.extractUid(anchor)`(35:22 소비) ↔ 20-selectors.js:20 정의(인자=anchor, 반환=uid문자열|null). ✔
- `NS.hide.hideForAnchor(anchor, uid)`(35:25 소비) ↔ 30-hide.js:12 정의(인자=(anchor,uid), 반환=bool). ✔
- **99-main 배선 일치**: 99-main.js:33 `NS.observer.install({ isBlocked: (uid)=>store.isBlocked(uid) })` ↔ 35-observer.js:53 `install(handlers)`가 `handlers.isBlocked`를 함수로 소비(55). shape 일치. ✔ `store.isBlocked`는 기존 6 API(계약 불변)로 재사용 — 신규 store 표면 0.

### 2. manifest 정합성 — PASS
- js 배열 8개 파일 전부 실존(`for f in ...; test -f`로 확인): 00·10·20·30·**35**·40·50·99. ✔
- 로드 순서 `00→10→20→30→35→40→50→99`: 35는 20(NS.selectors)·30(NS.hide) **이후**, 00(상수) 이후. ✔ 단, 35 IIFE 본문은 로드 시점에 `NS`만 참조(라인 8-9)하고 selectors/hide/상수는 전부 **콜백 실행 시점**에 참조 → 로드 순서 위반해도 즉시 깨지진 않으나, 현 순서가 의존성과 정합해 안전. ✔
- `manifest_version:3`, `permissions:["storage"]`(host_permissions/scripting/tabs 없음), `matches:["https://www.fmkorea.com/*"]`, `default_popup:src/popup/popup.html`(실존), `version:"0.4.0"`. ✔ MutationObserver는 **추가 권한 불요**(표준 DOM API) — 최소권한 유지. ✔

### 3. 로직 검증(Node 하네스) — PASS (28/28)
`vm`로 실제 파일을 로드해 구동. 산출물: 하단 아티팩트.
- **하네스 A(35 격리, stub NS)** 17/17: install→관찰옵션 `{childList:true,subtree:true}`만(attributes/characterData 미관찰=재귀가드) · (a)자기앵커 차단→hideForAnchor · (b)하위앵커 순회(차단2/비차단1 정확) · (c)비Element·메뉴·토스트 스킵 · (d)중복 install no-op(생성자 1회) · (e)isBlocked=false 미숨김 · (f)UID없음 스킵 · (g)isBlocked 미주입·(i)타깃 부재 안전미설치 · (h)body부재→documentElement 폴백 · (j)컨테이너+후행 형제앵커 동시 처리 · (k)disconnect후 재install · (l)자기앵커+하위앵커 동시.
- **하네스 B(00/20/30/35 통합, fake DOM)** 11/11: 실 `extractUid`+`hideForAnchor`+`findContainer(closest)` 재사용 경로로 — AJAX 삽입 `li[id=comment_777] > a.member_123456` 차단 컨테이너 숨김·`data-fmkb-uid` 표식 · 비차단 댓글 미숨김 · 보드목록 `<tr>` 행 `closest('tr,li')` 숨김 · `member_plate`(비숫자 토큰) 미숨김(토큰-앵커드) · 회귀: `hide.scan`/`unhideByUid` 정상.

### 4. 엣지 케이스 — PASS
- **body 부재 폴백**: 35:58 `document.body || document.documentElement`, 59 둘 다 없으면 안전 미설치. 하네스 A(h)(i)로 확인. document_end 실행이라 통상 body 존재. ✔
- **스캔↔관찰 경계 명확**: 99-main 흐름 = ①`hide.scan`(27, 관찰 전 존재 노드 책임) → ②`observer.install`(33, 이후 삽입 노드 책임). **두 단계 사이 await 없음(동기)** → 스캔·설치 틈에 DOM 삽입 불가 → 누락 경계 없음(TOCTOU 부재). 35 헤더 주석(3-4행)·99-main 주석(29-31)이 "최초 스캔 이후 삽입 노드"로 책임 분리 명시. ✔
- **컨테이너 단위 삽입(앵커가 컨테이너보다 나중/함께)**: `handleAddedNode`가 addedNodes를 인덱스 순회, 각 노드에 (a)자신 매칭+(b)하위 querySelectorAll 둘 다 수행 → 순서 무관 처리. 하네스 A(j)(l)로 확인. ✔
- **재귀 가드**: 숨김은 class·dataset 토글(=attribute 변경)인데 관찰은 childList만 → 자기 트리거 무한루프 부재(35:49-51 주석 + 하네스 A 관찰옵션 assert). ✔

### 5. 라이브 셀렉터 재검증 — PASS (오늘자 fmkorea, 2026-07-08)
`curl`로 실 HTML 수신(UA=Chrome/120). 증분 삽입 노드도 동일 마크업을 지님을 전제하므로 최초 스캔과 같은 셀렉터 유효성 확인:
- 목록(`mid=humor`, http 200, 76KB): `member_[0-9]+` 앵커 **고유 20개** → `a[class*="member_"]` 유효, `member_(\d+)` UID 추출 유효(9~11자리 가변 길이도 `\d+`로 흡수). ✔
- 게시글(`/1598251840`, http 200, 155KB): `id="comment_[0-9]+"` 댓글 li **21개**(+`comment_best` 존재) → `li[id^="comment_"]`·베스트댓글 유효. `.rd`(`class="rd rd_nav_style2 clear"`)·`.rd_hd`·`.top_area` 존재 → 게시글 컨테이너 판정 유효. ✔

### 발견/관찰 사항
- **[OBS-1] (minor·성능, 실브라우저 확인 권장)** `observe(target, {childList:true, subtree:true})`가 document 전역이라 **모든 하위 노드 삽입**(광고/트래킹/스크립트 포함)마다 콜백이 돌고, 각 addedNode 서브트리에 `querySelectorAll('a[class*="member_"]')`를 수행한다. 디바운스/throttle·requestIdleCallback 없음. fmkorea 정도 트래픽에선 통상 무해하나, 광고 삽입이 잦은 페이지에서의 CPU/jank는 **정적으로 단정 불가 → 실브라우저에서 프로파일 관찰 권장**. 기능 정확성 결함 아님(=minor 관찰).
- blocker/major 결함 **0건**. 신규 store 표면 0(계약 불변), 신규 권한 0(표준 DOM API).

### 미검증(통과 처리 금지 — 명시) · 실브라우저 게이트
이 프로젝트는 **Node mock 거짓 PASS 전례**(resurrection 버그, MEMORY/CLAUDE.md)가 있다. 아래는 mock으로 재현 불가:
1. **실 Chrome MutationObserver 발화 타이밍/배치**: 여러 삽입이 마이크로태스크로 배치돼 한 records[]로 오는 경우의 실제 처리(하네스는 콜백을 직접 호출해 흉내만 냄).
2. **fmkorea AJAX 실동작**: 댓글 작성/더보기/무한스크롤 시 실제 DOM 삽입이 `addedNodes`로 오는지(vs innerHTML 치환/문서프래그먼트) — 실사이트에서만 확정. 정적 커버(하네스 B에서 컨테이너/앵커 양형태 처리)로 논리적 대비는 됐으나 실동작 미확인.
3. **성능(OBS-1)**: 광고 잦은 실페이지에서 관찰자 콜백 부하/jank.

**실브라우저 체크리스트(머지 전 게이트):**
- [ ] 차단 유저가 쓴 댓글이 있는 게시글에서 "더보기/새 댓글" AJAX 로드 시 새 댓글이 **즉시 숨김**되는가(새로고침 없이).
- [ ] 무한스크롤/페이지네이션 AJAX로 목록 행 추가 시 차단 유저 행이 즉시 숨김되는가.
- [ ] 우클릭 차단 직후, 같은 유저의 **이후 삽입** 노드도 숨김되는가(삽입 시점 최신 isBlocked 참조 확인).
- [ ] 콘솔 에러/무한루프 없이 동작, 페이지 스크롤/입력에 체감 jank 없는가(OBS-1).
- [ ] 우클릭 메뉴/토스트 자체가 관찰자에 의해 오작동하지 않는가(isOwnUiNode 스킵 실동작).
