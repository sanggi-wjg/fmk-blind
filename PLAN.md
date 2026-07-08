# FMK-Blind — 설계 계획서

에펨코리아(PC) 특정 유저 블라인드(차단) 크롬 확장.

## 확정된 설계 결정

| # | 항목 | 결정 |
|---|------|------|
| Q1 | 사용자 식별 | **UID 기준**. 작성자 앵커의 `class="member_{UID} member_plate"` 에서 UID 추출 |
| Q2 | 적용 범위 | **보드 목록 + 게시글 본문 + 댓글** / **PC(`www.fmkorea.com`) 전용** (모바일은 후속) |
| Q3 | 차단 트리거 | **우클릭 커스텀 컨텍스트 메뉴**(작성자 닉네임 요소 위에서만). 항목: 차단 / 차단 해제(상태 토글). 메모는 후속 |
| Q4 | 블라인드 방식 | **완전 숨김(`display:none`)** — 목록 행 / 본문 / 댓글 모두 제거 |
| Q5 | 저장소 | **`chrome.storage.sync` + 샤딩**(`bl_0..N`, 키당 ≤8KB, 총 ≤100KB). 메모리엔 `{uid:{nick,addedAt}}` 맵. 닉네임 메타 유지. 압축은 후속 |
| Q6 | 재적용 시점 | **최초 로드 1회 스캔**(`DOMContentLoaded`) **+ MutationObserver 증분 처리**(2026-07-08). 최초 스캔 이후 AJAX/더보기/무한스크롤로 새로 삽입되는 노드도 즉시 숨김(`35-observer.js`) |
| Q7 | 관리 UI | **툴바 팝업**: 목록(닉/UID) · 검색 · 차단 해제 · 인원수. 내보내기/가져오기는 후속 |
| Q8 | 판정 범위 | **작성자 본인 노드만 숨김**. `member_{UID}` 앵커가 직접 든 컨테이너만 제거(베스트댓글 중복도 자동 처리). 인용/멘션은 미처리 |
| Q9 | 피드백/가드 | 차단 시 **가벼운 토스트**. 자기 차단 가드는 후속 |

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
3. 둘 다 아니면 → **보드 목록 행** → `anchor.closest('tr, li')` 숨김 (테이블형/웹진형 모두 흡수)

숨길 때 컨테이너에 표식(`class="fmkb-hidden" data-fmkb-uid="{uid}"`)을 달아 추후 식별/복구 가능하게 한다. 실제 숨김은 `content.css` 의 **`.fmkb-hidden { display:none !important; }`** 로 처리(사이트 CSS 우선순위 충돌 방지, 클래스 토글만으로 복구).

**우클릭 인식 범위**: 작성자 앵커(`a[class*="member_"]`) 위에서 우클릭할 때만 커스텀 메뉴를 띄우고 그 위에서만 `preventDefault`. 그 외 영역(댓글 본문/이미지 등)은 브라우저 기본 우클릭 유지.

**예외 (현재 범위 밖)**
- 홈 / "베스트" 통합 목록: 작성자가 `<span class="author"> / 닉네임</span>` — **UID·링크 없음**. 이 화면은 미지원
- 모바일 `m.fmkorea.com`: 마크업 완전히 다름(`member_` 없음) — 미지원

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
1. 로드 시 `bl_0..N` 키를 읽어 메모리 맵 복원
2. 차단/해제 → 메모리 맵 갱신 → 직렬화 → 8KB 청크 분할 → 변경된 청크만 `sync.set`
3. 청크 수가 줄면 남는 `bl_{k}`(k ≥ 새 청크 수) 키를 `sync.remove` 로 정리(유령 데이터 방지)
4. 쓰기 디바운스(분당 120/시간당 1,800 제한 보호)
