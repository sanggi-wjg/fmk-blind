---
name: fmk-dom-selectors
description: "fmkorea(에펨코리아 PC·모바일) 페이지의 작성자 식별·숨김 대상 DOM 규칙. 작성자 UID(member_{UID}) 추출, 댓글/게시글/목록의 숨길 컨테이너 판정, .fmkb-hidden 적용 규칙을 정의. fmkorea DOM·셀렉터·UID 추출·차단 대상 노드 판정·우클릭 작성자 식별 작업 시 반드시 이 스킬을 사용할 것."
---

# fmk-dom-selectors — fmkorea 작성자/컨테이너 셀렉터 규칙

fmkorea(PC `www.fmkorea.com` + 모바일 `m.fmkorea.com`) 실측 HTML 기준의 검증된 셀렉터 규칙. content script와 QA가 차단 대상을 정확히 찾는 단일 기준이다. **임의 추정 금지** — 변경이 의심되면 실제 HTML을 받아 재검증한다.

> **단일 출처(source of truth):** 셀렉터·UID 추출·컨테이너 판정의 구현 기준은 이 스킬이다. `PLAN.md`의 DOM 사실은 설계 기록일 뿐이며, 셀렉터가 바뀌면 **이 스킬을 먼저 갱신**하고 PLAN은 부수적으로 맞춘다.

## 작성자 앵커 (목록·본문·댓글 공통)

작성자는 다음 앵커로 표현된다(실측):
```html
<a href='#popup_menu_area' onclick='return false;'
   class='member_{UID} member_plate'  data-comment_srl="...">
   <img ... class="level" />닉네임텍스트
</a>
```
- **UID 추출 (토큰-앵커드)**: 앵커 class 문자열을 **공백으로 토큰 분리**한 뒤, 각 토큰을 `^member_(\d+)$` 정규식에 매칭해 **첫 매칭 토큰의 캡처 그룹**을 UID로 삼는다.
  - 예: `class="member_123456 member_plate"` → 토큰 `["member_123456","member_plate"]` → `member_123456` 가 `^member_(\d+)$` 에 **전체 일치** → UID `123456`. `member_plate` 는 숫자 토큰이 아니므로 자동 제외.
  - **왜 토큰-앵커드인가**: 비앵커드 substring 매칭(`/member_(\d+)/`)은 `member_` 를 **부분문자열로 포함하는** 토큰(예: `nonmember_123`, `xmember_99`)에서 이론적으로 오캡처할 수 있다. 토큰 분리 + `^…$` 전체 일치로 **토큰 경계를 강제**하면 이 오캡처가 원천 제거된다. **현 fmkorea 마크업(`member_{UID} member_plate` 만 존재)에서는 결과가 비앵커드 방식과 동치**이며, 토큰-앵커드는 마크업 회귀에 대한 안전망이다.
- **닉네임**: 앵커의 텍스트 노드(`<img>` 뒤). `anchor.textContent.trim()`으로 취득.
- 작성자 앵커 선택자: `a[class*="member_"]` (이후 위 **토큰-앵커드** 규칙으로 UID 유무 확인).
- UID를 못 뽑는 작성자(탈퇴/비회원/익명 등)는 차단 불가 → 조용히 건너뛴다(메뉴도 표시하지 않음).

## 숨길 컨테이너 판정 규칙 (앵커 → 숨길 대상)

UID를 뽑은 작성자 앵커에서, 아래 **순서대로** 숨길 컨테이너를 결정한다:

1. `anchor.closest('li[id^="comment_"]')` 존재 → **댓글**. 그 `li`를 숨긴다.
   - 실측: `<li id="comment_{srl}" class="fdb_itm ...">`
   - 베스트댓글도 `li.fdb_itm`(예: `comment_best`)라 **같은 규칙으로 자동 포함**된다.
2. 아니고 `anchor.closest('.rd_hd, .top_area')` 존재 → **게시글 글쓴이**. 읽기 컨테이너 `.rd`를 숨긴다.
   - 실측 경로: `div.rd > #bd_capture > .rd_hd > .top_area`에 글쓴이 앵커.
3. 둘 다 아니면 → **보드 목록 행**. `anchor.closest('tr, li')`를 숨긴다.
   - 실측상 이 규칙이 실제로 매치하는 건 PC **표형 목록 `tr`**(갤러리 보기 포함)이다. 웹진 보기·핫딜·베스트·홈 같은 **위젯형 목록**(`div.fm_best_widget > ul > li`)엔 `member_` 앵커가 없어 이 규칙이 닿지 않는다 → 아래 **닉네임 폴백**이 처리(2026-10-05 정정, 이슈 #16).

## 숨김 적용

- 인라인 style 대신 클래스로 처리한다: `content.css`에 `.fmkb-hidden { display:none !important; }`.
  - 이유: 사이트 자체 CSS와의 우선순위 충돌을 막고, 클래스 토글만으로 복구할 수 있다.
- 숨길 때 컨테이너에 표식을 남긴다: `el.classList.add('fmkb-hidden'); el.dataset.fmkbUid = uid;`
  - 이유: 추후(onChanged/해제) 어떤 UID 때문에 숨겼는지 식별·복구하기 위함.

## 적용 범위 (PC `www` + 모바일 `m`)

- 대상 페이지: 보드 목록 + 게시글 본문 + 댓글 (`www.fmkorea.com` + `m.fmkorea.com`).
- **미지원(범위 밖)**:
  - (없음 — PC 위젯형 목록도 2026-10-05부터 닉네임 폴백으로 처리, 이슈 #16)
- **닉네임 폴백(UID 없는 목록)**: 모바일 목록과 PC 위젯형 목록(웹진 보기·핫딜·베스트·홈) 행은 아래 "목록 — 닉네임 폴백" 규칙으로 처리한다(2026-10-05, 이슈 #8·#16).

## 모바일 `m.fmkorea.com` (실측 — 2026-07-08, 모바일 UA curl)

> **정정 이력:** 이전 판 "모바일은 마크업 완전히 다름(`member_` 없음), 후속 TODO"는 실측으로 **부정확 판명**. 아래가 실측 결론이며, 위 판정 규칙(작성자 앵커·컨테이너 판정)은 **코드 변경 없이 모바일에도 그대로 적용**된다. `matches`에 `m.fmkorea.com`을 추가하는 것만으로 게시글·댓글이 커버된다.

- **게시글 작성자**: PC와 **동일 패턴** `<a href='#popup_menu_area' class='member_{UID} member_plate'>`. 실측 조상 체인: `a.member_* < div.side < div.btm_area < div.board < div.rd_hd < #bd_capture < div.rd.rd_nav_style2 < div.bd.bd_mobile`. → **판정 규칙 ②**(`closest('.rd_hd, .top_area')` → `.rd`)가 모바일에서 그대로 매치. 숨김 컨테이너 = `div.rd`. **셀렉터 코드 변경 불요**(실측 근거: `m_article.html`·`m_article2.html`).
- **목록 — 닉네임 폴백** (정정: 2026-10-05 실측, 이슈 #8 — 이전 "범위 밖" 판정은 목록에 닉네임이 표시되는 걸 놓쳐 차단 유저 글 제목이 노출되는 버그였음): 목록 행엔 숫자 `member_{UID}` 앵커가 **0개**지만 닉네임 텍스트는 있다. UID 규칙이 매치하지 않으므로 **차단 목록의 저장 닉네임(`store.list()[].nick`)과 대조**해 행을 숨긴다.
  - 행 셀렉터 `NICK_ROW` = `ol.bd_m_lst > li, .fm_best_widget > ul > li`
    - `ol.bd_m_lst`: 모바일 보드 목록 전용
    - `.fm_best_widget`: 모바일(`_bd_mobile`) `/best` + **PC(`_bd_pc`) 웹진 보기(`?listStyle=webzine`)·핫딜(`/hotdeal` 기본 보기)·베스트(`/best`, `/best2`)·홈** (PC 실측 2026-10-05, 이슈 #16 — 이 페이지들의 `member_` 앵커 0개, 행 중첩 없음)
    - 보드 목록(유머 등, `listStyle` 무관 동일): `<div class="info"> … <span><i class="fa fa-user"></i> 닉네임</span> …` → `.info .fa-user`의 부모 span 텍스트
    - 베스트(`/best`): `<span class="author"> / 닉네임</span>` → `.author` 텍스트에서 앞 `/ ` 제거
  - 닉네임 정규화(`normalizeNick`): 연속 공백 1개로 + trim. 저장 닉·행 닉 양쪽에 적용. 저장 닉은 본문 작성자 앵커 `textContent.trim()`이며 목록 표기와 동일함을 실측 확인(모바일·PC 동일).
  - 숨김: 행에 `.fmkb-hidden` + `data-fmkb-uid={매칭된 uid}` → 해제 시 기존 `unhideByUid`로 함께 복구.
  - **한계(감수)**: 차단 후 닉네임을 바꾼 유저는 목록에서 놓치고(본문·댓글은 UID라 계속 숨김), 그 옛 닉네임을 새로 쓰는 다른 유저는 목록에서 오차단될 수 있다. 저장 닉이 빈 문자열이면 매칭하지 않는다.
  - 공지 행은 닉 자리에 "공지"/"공동공지"(또는 관리자 닉)가 들어가 같은 규칙으로 판정된다. **`li.notice`로 공지를 제외하지 말 것** — `notice … pop1` 클래스가 일반 유저의 인기글 행에도 붙는다.
- **댓글**: (정정 2026-10-05 실측) 현재 모바일 게시글 정적 HTML에 댓글이 PC와 같은 `li#comment_{srl}.fdb_itm`으로 **바로 포함**된다(베스트 댓글 `comment_N_`, 답글 `.re` 포함 — 표본 3개 글에서 33·38·50개). 판정 규칙 ①이 그대로 매치. 이후 AJAX 페이지 이동 등 삽입분은 `MutationObserver`(35-observer)가 처리. (이전 기록 "JS 지연 렌더(LazyFilter)"는 현재 마크업과 다름)
- **리다이렉트**: 데스크톱 UA로 `m.` URL 접속 시 `www`로 리다이렉트(실브라우저 확인). `m.` 매치는 사실상 모바일 기기(Firefox Android) 전용.
- **롱프레스**: Android(Firefox 포함)에서 롱프레스는 `contextmenu` 이벤트를 발화 → 40-contextmenu 기존 리스너가 그대로 동작할 구조. `preventDefault`의 네이티브 메뉴 억제 여부는 실기기 게이트.

## 변경 감지 시 재검증 절차

fmkorea 마크업이 바뀌어 숨김이 동작하지 않으면, 추정하지 말고 실제 HTML로 확인한다:
```bash
UA="Mozilla/5.0 ... Chrome/120.0 Safari/537.36"
curl -sL -A "$UA" "https://www.fmkorea.com/index.php?mid=humor" -o /tmp/list.html   # 목록
# 목록에서 글 링크 추출 후 게시글도 받아 member_/comment_/.rd 패턴 확인
grep -oE "member_[0-9]+|id=\"comment_[0-9]+\"|class=\"rd " /tmp/list.html | sort | uniq -c
```
달라진 셀렉터는 위 "판정 규칙"을 갱신하고 변경 이력에 남긴다.
