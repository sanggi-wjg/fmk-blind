# FMK-Blind — 설계 계획서

에펨코리아(PC·모바일) 특정 유저 블라인드(차단) 크롬 확장.

## 확정된 설계 결정

| # | 항목 | 결정 |
|---|------|------|
| Q1 | 사용자 식별 | **UID 기준**. 작성자 앵커의 `class="member_{UID} member_plate"` 에서 UID 추출 |
| Q2 | 적용 범위 | **보드 목록 + 게시글 본문 + 댓글** / **PC(`www.fmkorea.com`) + 모바일(`m.fmkorea.com`)** (모바일 지원 2026-07-08 — 게시글·댓글은 PC와 동일 셀렉터로 커버. UID가 없는 모바일 목록(이슈 #8)·PC 위젯형 목록(웹진 보기·핫딜·베스트·홈, 이슈 #16)은 2026-10-05부터 저장 닉네임 대조 폴백으로 숨김) |
| Q3 | 차단 트리거 | **우클릭 커스텀 컨텍스트 메뉴**(작성자 닉네임 요소 위에서만). 항목: 차단 / 차단 해제(상태 토글). 키보드로도 연다 — 작성자 링크에서 메뉴 키(Windows·Linux는 Shift+F10도, macOS 키보드엔 없음), `role=menu`, Enter·Space 선택, Esc·Tab 닫기, 닫으면 원래 포커스로(2026-10-05). 시스템 다크 모드와 fmkorea 다크 모드(`body.night_mode`)를 따른다. 메모는 후속 |
| Q4 | 블라인드 방식 | **완전 숨김(`display:none`)** — 목록 행 / 본문 / 댓글 모두 제거 |
| Q5 | 저장소 | **`chrome.storage.sync` + 샤딩**(`bl_0..N`, 키당 ≤8KB, 총 ≤100KB). 메모리엔 `{uid:{nick,addedAt}}` 맵. 닉네임 메타 유지. 압축은 후속 |
| Q6 | 재적용 시점 | **최초 로드 1회 스캔**(`DOMContentLoaded`) **+ MutationObserver 증분 처리**(2026-07-08). 최초 스캔 이후 AJAX/더보기/무한스크롤로 새로 삽입되는 노드도 즉시 숨김(`35-observer.js`) |
| Q7 | 관리 UI | **툴바 팝업**: 목록(닉/UID) · 검색 · 차단 해제 · 인원수. ~~내보내기/가져오기는 후속~~ → **구현(2026-07-08)**: JSON 내보내기/가져오기(팝업 푸터, store `importMany` 배치 쓰기 — 계약 C10). Firefox는 팝업에서 파일 선택 시 팝업이 닫히므로 가져오기를 탭 보기(`popup.html?view=tab`)에서 처리(2026-10-05, 이슈 #9). 해제한 줄은 팝업을 닫을 때까지 원래 자리에 **되돌리기** 버튼과 함께 남고(원래 차단 날짜 유지 — `importMany([항목])`), 해제 실패 안내는 그 줄 안에 표시(2026-10-05). 다크 모드(`prefers-color-scheme`), 목록 읽기가 늦으면 '불러오는 중', 읽기 실패 시 [다시 시도], 검색 중 인원수 "검색 K명 / 총 N명", 열면 검색창 포커스(터치 기기·가져오기 탭 보기 제외)(2026-10-05) |
| Q8 | 판정 범위 | **작성자 본인 노드만 숨김**. `member_{UID}` 앵커가 직접 든 컨테이너만 제거(베스트댓글 중복도 자동 처리). 인용/멘션은 미처리 |
| Q9 | 피드백/가드 | 차단 시 **가벼운 토스트**. 차단·해제 토스트에 **실행 취소** 버튼(5초, 마우스를 올리거나 키보드로 포커스하면 멈춤), 저장 실패는 빨간 토스트로 6초(2026-10-05). 자기 차단 가드는 후속 |

## 검증된 DOM 사실 (실제 HTML 기준)

**작성자 앵커 패턴 — 보드 목록 / 게시글 본문 / 댓글 공통**
```html
<a href='#popup_menu_area' onclick='return false;'
   class='member_{UID} member_plate'  data-comment_srl="...">
   <img ... class="level" />닉네임텍스트
</a>
```
- **UID**: `class` 를 공백 토큰으로 분리 후 각 토큰을 `^member_(\d+)$` 로 전체 일치(토큰-앵커드) → 첫 매칭 캡처. `member_plate` 는 숫자 토큰이 아니라 제외. (단일 출처: `fmk-dom-selectors` 스킬; 비앵커드 substring의 이론적 오캡처를 토큰 경계로 차단)
- **닉네임**: 앵커의 텍스트 노드(`<img>` 뒤)
- **댓글 컨테이너**: `<li id="comment_{srl}" class="fdb_itm ...">` (실측). 베스트댓글도 `li.fdb_itm` 라 동일 규칙으로 자동 포함
- **게시글 읽기 컨테이너**: `div.rd > #bd_capture > .rd_hd > .top_area` 에 글쓴이 앵커. 본문 전체 숨김은 `.rd` 대상
- **목록 행**: `<td class="author">` 안에 앵커. 행 컨테이너는 목록 스타일에 따라 `tr` 또는 `li`

## 숨김 컨테이너 판정 규칙 (앵커 → 숨길 대상)

작성자 앵커에서 UID를 뽑은 뒤, 아래 순서로 숨길 컨테이너를 결정한다:
1. `anchor.closest('li[id^="comment_"]')` 있으면 → **댓글**(그 `li` 숨김). 베스트댓글 포함
2. 아니고 `anchor.closest('.rd_hd, .top_area')` 있으면 → **게시글 글쓴이** → `.rd` 숨김
3. 둘 다 아니면 → **보드 목록 행** → `anchor.closest('tr, li')` 숨김 (실제 매치는 PC 표형 `tr`. 웹진 보기 등 위젯형 목록은 UID가 없어 닉네임 폴백이 처리 — 아래 예외 참고)

숨길 때 컨테이너에 표식(`class="fmkb-hidden" data-fmkb-uid="{uid}"`)을 달아 추후 식별/복구 가능하게 한다. 실제 숨김은 `content.css` 의 **`.fmkb-hidden { display:none !important; }`** 로 처리(사이트 CSS 우선순위 충돌 방지, 클래스 토글만으로 복구).

**우클릭 인식 범위**: 작성자 앵커(`a[class*="member_"]`) 위에서 우클릭할 때만 커스텀 메뉴를 띄우고 그 위에서만 `preventDefault`. 그 외 영역(댓글 본문/이미지 등)은 브라우저 기본 우클릭 유지.

**모바일 `m.fmkorea.com` (실측 정정 — 2026-07-08)**
- 이전 기록 "모바일은 마크업 완전히 다름(`member_` 없음) — 미지원"은 **실측으로 부정확 판명**(단일 출처 `fmk-dom-selectors` 스킬에 상세). 정정: 모바일 **게시글 작성자 앵커는 PC와 동일**(`member_{UID} member_plate`)하고 조상 체인에 `.rd_hd`·`.rd`가 그대로 있어 위 판정 규칙 ②가 그대로 매치 → **셀렉터 코드 변경 없이** manifest `matches`에 `m.fmkorea.com` 추가만으로 게시글이 커버된다.
- 모바일 **댓글**: (정정 2026-10-05) 현재는 정적 HTML에 PC와 같은 `li#comment_{srl}.fdb_itm`으로 포함돼 판정 규칙 ①이 그대로 매치한다. 이후 삽입분은 `MutationObserver`(35-observer)가 처리.

**예외 (현재 범위 밖)**
- ~~홈 / "베스트" 통합 목록 — 미지원~~ → **2026-10-05 닉네임 폴백으로 지원**(이슈 #16): PC 위젯형 목록(`div.fm_best_widget._bd_pc > ul > li` — 웹진 보기·핫딜·베스트·홈)은 작성자가 `<span class="author"> / 닉네임</span>`뿐이라 모바일 목록과 같은 닉네임 대조로 숨긴다
- ~~모바일 목록 — 미지원~~ → **2026-10-05 닉네임 폴백으로 지원**(이슈 #8): 목록 행엔 UID가 없지만 닉네임이 표시돼 차단 유저 글 제목이 노출되던 버그. 행(`ol.bd_m_lst > li`, `/best`=`.fm_best_widget._bd_mobile > ul > li`)의 닉네임을 차단 목록 저장 닉과 대조해 숨긴다. 한계: 개명 유저 누락·옛 닉 재사용자 오차단(상세는 `fmk-dom-selectors` 스킬)

## 아키텍처

- **Manifest V3**, 권한: **`storage` 하나만**. content script 를 `content_scripts.matches: ["https://www.fmkorea.com/*"]` 로 정적 선언하면 주입 권한이 부여되므로 **별도 `host_permissions` 불필요**(외부 fetch·동적 주입 안 함)
- **백그라운드 없음** — 우클릭 메뉴 자체 구현, `chrome.storage.sync` 는 content/popup 직접 접근
- **빌드 없음** — content script 를 manifest 순서대로 로드, 전역 네임스페이스 `FMKBlind` 공유

### 알려진 v1 제약
- ~~팝업에서 차단 해제/추가 시 이미 열린 탭은 새로고침 후 반영~~ → **해소(2026-06-15)**: `chrome.storage.onChanged` 라이브 동기 구현(가산적 7번째 API `onChange` + 불변식 C9, 외부 델타만 reconcile)으로 팝업/다른 탭/다른 기기 변경이 열린 탭에 **새로고침 없이 즉시 반영**된다. 우클릭 차단도 현재 탭 즉시 반영.
- ~~AJAX/무한스크롤로 **새로 삽입되는 DOM**은 새로고침 전까지 미반영~~ → **해소(2026-07-08)**: `MutationObserver` 증분 처리(`35-observer.js`) 구현. `document.body` 를 `childList/subtree` 로 관찰해 최초 스캔 이후 삽입되는 노드의 작성자 앵커도 삽입 시점의 최신 차단 상태로 즉시 숨긴다(숨김 실동작은 30-hide 재사용).

### 파일 구조(예정)
```
fmk-blind/
├── manifest.json
├── src/
│   ├── content/
│   │   ├── 00-namespace.js   # FMKBlind 전역, 상수
│   │   ├── 10-store.js       # sync 샤딩 저장 계층 + 메모리 맵
│   │   ├── 20-selectors.js   # UID 추출, 컨테이너 탐색 규칙
│   │   ├── 30-hide.js        # display:none 적용(1회 스캔)
│   │   ├── 35-observer.js    # MutationObserver 증분 처리(새로 삽입되는 노드 숨김)
│   │   ├── 40-contextmenu.js # 우클릭 커스텀 메뉴(차단/해제)
│   │   ├── 50-toast.js       # 토스트
│   │   └── 99-main.js        # DOMContentLoaded 진입점
│   ├── content.css           # 메뉴/토스트 스타일
│   └── popup/
│       ├── popup.html
│       ├── popup.js          # 목록/검색/해제/인원수
│       └── popup.css
├── icons/
├── PLAN.md
└── TODO.md
```

## 저장 계층 동작 요약
- 스키마 버전 키 `bl_meta = { ver: 1 }` 유지 — 향후 압축/구조 변경(후속) 시 마이그레이션 기준
1. 로드 시 `bl_0..N` 키를 읽어 메모리 맵 복원(읽기 실패 시 1회 재시도 후 reject)
2. 차단/해제 → 메모리 즉시 반영(미저장 변경으로 보관) → **저장소를 새로 읽고 병합** → 8KB 청크 분할 → 용량 사전 검사 → 바뀐 청크만 `sync.set` (2026-10-05, 이슈 #13~#15 — 변경 알림을 놓친 탭도 다른 곳의 변경을 덮어쓰지 않음)
3. 청크 수가 줄면 남는 `bl_{k}`(k ≥ 새 청크 수) 키를 `sync.remove` 로 정리(유령 데이터 방지)
4. 저장 실패는 되돌리고 reject(용량 초과·확장 업데이트 뒤 남은 페이지는 재시도 없이, 그 밖은 짧은 백오프 후) → 화면에 실패 안내
