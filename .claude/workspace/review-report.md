# 코드 리뷰 보고서 — FMK-Blind

- 담당: extension-reviewer
- 갱신: 2026-10-05 (**이슈 #8 모바일 목록 닉네임 폴백 리뷰** — 브랜치 `fix/mobile-list-nick-hide`, 미커밋 변경분)
- 대상: `src/content/20-selectors.js`·`30-hide.js`·`35-observer.js`·`99-main.js` (+ 동반 문서 `fmk-dom-selectors` 스킬·`store-api-contract.md`·`PLAN.md`·`README.md`·`TODO.md`, `manifest.json` ver 0.7.0). `.claude/settings.json`은 무관한 로컬 변경이라 제외.
- 방법론: `.claude/skills/extension-code-review/SKILL.md` (코드 품질 6차원)
- 심각도: **blocker** > **major** > **minor** / 검토 불가 항목은 "미검토"로 분류(통과 처리 금지)
- 상보성: store API·계약은 무변경(`list()`/`isBlocked` 재사용) → 계약 시그니처 재검증은 생략. 본 리뷰는 셀렉터 정밀도·오차단·색인 정합·observer 비용·주석/문서 정합에 집중.
- 이전 보고서(2026-06-15 영속화/onChanged 리뷰, 판정 MERGE)는 이번 변경과 무관한 범위라 git 이력으로 대체한다.

> **2026-10-05 요약:** UID가 없는 모바일 목록 행을 저장 닉네임과 대조해 숨기는 폴백. 실측(오늘자 모바일 UA로 받은 humor·football_world·best 3페이지 + PC best·humor)과 jsdom 엣지 테스트로 검증했다. 셀렉터는 정밀하다. 모바일 행은 전부 잡히고 PC에서는 0행이며, `fa-user`를 가진 li 중 놓친 것도 0개다. 보안 결함은 0이다. 결함은 minor 5건이며 모두 드문 엣지이거나 문서 정합 문제다. **최종 판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 5.**

## 진행 현황

| 차원 | 상태 | 비고 |
|------|------|------|
| 1. 정확성 | ✅ 검토완료 | 실측 셀렉터 정밀(아래 근거). minor 2(N1 같은 닉 다중 uid 해제 시 조기 복구, N2 nick만 바뀐 변경 시 색인 stale) |
| 2. 보안 | ✅ 검토완료 | `textContent`만 사용·`innerHTML` 없음. 닉네임은 비교에만 쓰임. dataset엔 store의 숫자 uid만 기록 → 결함 0 |
| 3. 견고성 | ✅ 검토완료 | 지연 색인·`isBlocked` 재확인 양호. minor 1(N3 기존 행에 닉네임이 나중에 채워지면 observer 미탐지, 현 마크업에선 미발생) |
| 4. 유지보수성 | ✅ 검토완료 | 주석·스타일 일관. minor 1(N5 문서·주석 소폭 드리프트) |
| 5. MV3/베스트프랙티스 | ✅ 검토완료 | 권한 변화 없음(`storage`만), ver 0.6.1→0.7.0 범프 정합 |
| 6. 성능 | ✅ 검토완료 | 차단 5,000건 + 25행 load+scan 85ms(jsdom). minor 1(N4 PC 포함 모든 페이지에서 observer가 매 추가 노드마다 NICK_ROW 쿼리) |

> **최종 판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 5.**
> minor는 모두 머지를 막지 않는다. N1은 수정 비용이 거의 없어(2줄) 이번 PR에 함께 넣기를 권한다.

---

## 발견 사항 요약

| ID | 심각도 | 차원 | 제목 | 상태 |
|----|--------|------|------|------|
| N1 | minor | 정확성 | 같은 정규화 닉을 가진 차단 uid가 둘 이상일 때 하나만 해제해도 행이 복구됨(다른 uid는 여전히 차단) | 권고(저비용 수정 권장) |
| N2 | minor | 정확성 | 키셋은 그대로이고 nick만 바뀐 외부 변경엔 `onChange`가 호출되지 않아 `nickIndex`가 stale | 권고(현 코드 경로로는 사실상 도달 불가 → 문서화) |
| N3 | minor | 견고성 | 이미 있는 행에 닉네임 노드가 나중에 삽입되면 observer가 놓침 | 권고(현 마크업 미발생) |
| N4 | minor | 성능 | observer가 PC 포함 모든 추가 Element에 `scanNickRows`(matches + qSA) 실행 | 참고(실측상 무시 가능) |
| N5 | minor | 유지보수성 | 스킬 "미지원" 문구·계약 §4 스니펫·observer 독블록이 새 동작과 어긋남 | 권고(문서) |
| INFO-1 | — | 정확성 | 공지 행 자리표시 닉("공지"/"공동공지")·관리자 닉 | 확인 필요(오차단 위험 낮음) |
| INFO-2 | — | 범위 | PC `/best`도 `.author` 형식에 UID가 없음 | 범위 밖(TODO.md:17에 이미 등재) |

---

## 실측 근거 (셀렉터 정밀도)

2026-10-05에 모바일 UA(`Android 14; Pixel 8 … Mobile Safari`)·PC UA로 curl해 jsdom에서 `NICK_ROW`/`getRowNick`을 그대로 실행했다.

| 페이지 | NICK_ROW 매치 | member_ 앵커 | `fa-user` 있는데 놓친 li | 비고 |
|--------|---------------|-----------------|------------------------|------|
| m `/humor` | 25 | 0 | 0 | 닉 추출 25/25. 접힌 공지 토글 행(`show_folded_notice`)은 `''` → 스킵 |
| m `/football_world` | 23 | 0 | 0 | `"공동공지"`, 관리자 `"독고"` 포함 |
| m `/best` | 20 | 0 | 0 | `.author` `" / 닉"` → 닉 추출 정상. 핫딜 행은 작성자가 없어 `''` → 스킵 |
| PC `/best` | **0** | 0 | 0 | 위젯 클래스가 `fm_best_widget _bd_pc` → `_bd_mobile` 미매치 확인 |
| PC `/humor` | **0** | 23 | 0 | PC 목록은 기존 UID 경로가 처리 |

- `node --check` 7개 content 파일 모두 통과.
- 동반 jsdom 8/8(요청자 제공)에 더해 아래 엣지 테스트를 추가로 돌렸다(`scratchpad/rv.js`). T1→N1, T2→N2, T3→N3, T4 성능 85ms.

---

## 발견 상세

### [minor] N1 같은 닉의 차단 uid가 둘 이상일 때 하나만 해제해도 행이 복구됨  (차원: 정확성)
- 위치: `src/content/99-main.js:65-70` (`onUnblock`), `src/content/99-main.js:80-85` (`onChange`)
- 증거:
  ```js
  async onUnblock(uid, nick) {
    await store.unblock(uid);
    nickIndex = null;
    NS.hide.unhideByUid(uid); // ← 닉으로 숨긴 행도 uid A로 표식돼 있어 함께 복구
    ...
  // onChange
  d.added.forEach((uid) => NS.hide.hideByUid(uid));
  if (d.added.length) NS.hide.scanNickRows(document, uidForNick);
  d.removed.forEach((uid) => NS.hide.unhideByUid(uid)); // ← 해제 후 재스캔 없음
  ```
  색인은 첫 uid만 남긴다(`!nickIndex.has(n)`). 그래서 행은 `data-fmkb-uid=A`로 표식된다. A만 해제하면 `unhideByUid(A)`가 행을 복구하는데, 같은 닉의 B는 여전히 차단 상태다. 새로고침 전까지 노출된다.
  실측(T1): `[['A','솔티코'],['B','솔티코']]` 상태에서 A를 해제하면 숨김이 3 → **0**이 된다(기대값 3).
  발생 조건은 개명 유저를 차단한 뒤 그 옛 닉을 쓰는 다른 유저도 차단한 경우, 또는 같은 닉이 들어간 목록을 가져온 경우다. 드물지만 실제로 일어날 수 있다.
- 수정안: 해제/외부 diff 처리 마지막에 닉네임 재스캔을 한 번 돌린다. 색인은 이미 무효화돼 재구성된다. 순서는 복구를 먼저 하고 재스캔을 나중에 해야 한다. 그래야 A→B 표식 갈아타기도 자연스럽게 정합된다.
  ```js
  async onUnblock(uid, nick) {
    await store.unblock(uid);
    nickIndex = null;
    NS.hide.unhideByUid(uid);
    NS.hide.scanNickRows(document, uidForNick); // 같은 닉의 다른 차단 uid 재적용
    ...
  store.onChange((d) => {
    nickIndex = null;
    d.removed.forEach((uid) => NS.hide.unhideByUid(uid));
    d.added.forEach((uid) => NS.hide.hideByUid(uid));
    if (d.added.length || d.removed.length) NS.hide.scanNickRows(document, uidForNick);
  });
  ```

### [minor] N2 nick만 바뀐 외부 변경에서 nickIndex stale  (차원: 정확성)
- 위치: `src/content/99-main.js:29-40` (색인 무효화 트리거), 근거 `src/content/10-store.js:581` 계약 주석
- 증거: `onChange` 계약은 "값만 바뀌고(nick 변경 등) 키셋이 동일하면 … 콜백 호출 생략"이다. 따라서 다른 컨텍스트에서 uid의 저장 nick만 바뀌면 이 탭의 `nickIndex`는 무효화되지 않고 옛 닉을 계속 쓴다. 실측(T2): 저장 nick을 바꾼 뒤 새 닉으로 추가된 행이 숨겨지지 않았다.
  다만 **현 코드에서는 사실상 도달할 수 없다**. 우클릭 메뉴는 이미 차단된 uid에 "해제"만 띄우므로 `block` 재호출이 없다. `importMany`는 기존 uid를 스킵한다. 팝업은 `block`을 호출하지 않는다.
- 수정안: 이번 PR에서는 코드 변경 없이 99-main 색인 주석의 "한계"에 "nick만 바뀐 외부 변경은 새로고침 전까지 반영 안 됨"을 한 줄 추가한다. 나중에 nick 갱신 경로(예: 재차단 시 nick 갱신 UI)를 넣을 때는 store가 값 변경도 알리도록 확장하거나, 색인을 `store.list()` 시그니처로 검증하도록 바꾼다.

### [minor] N3 기존 행에 닉네임이 나중에 채워지면 observer가 놓침  (차원: 견고성)
- 위치: `src/content/35-observer.js:46-47`, `src/content/30-hide.js:47-48`
- 증거: `scanNickRows(node, …)`는 추가된 노드 **자신이나 그 하위**에서만 `NICK_ROW`를 찾는다. 이미 DOM에 있는 `li` 안에 `<span><i class="fa fa-user">…` 같은 하위 노드가 나중에 붙으면 행을 찾지 못한다. 실측(T3): 빈 행을 먼저 붙이고 닉 span을 나중에 붙이자 숨김이 `false`였다.
  현재 모바일 목록은 서버 렌더이고 더보기/페이지네이션도 행(`li`)이나 `ol` 단위로 붙으므로 **지금은 일어나지 않는다**.
- 수정안(선택, 저비용): `handleAddedNode`에서 조상 행도 검사한다.
  ```js
  const row = node.closest && node.closest(NS.selectors.NICK_ROW);
  NS.hide.scanNickRows(row || node, uidForNick);
  ```

### [minor] N4 observer가 모든 페이지에서 추가 Element마다 NICK_ROW 쿼리  (차원: 성능)
- 위치: `src/content/35-observer.js:46-47`
- 증거: PC 포함 모든 페이지에서 Element가 추가될 때마다 `matches` + `querySelectorAll('ol.bd_m_lst > li, .fm_best_widget._bd_mobile > ul > li')`가 한 번씩 더 돈다. 기존 AUTHOR_ANCHOR 쿼리와 비용이 같은 수준이고 PC에서는 매치가 0이라 `uidForNick`/`store.list()`는 호출되지 않는다(색인은 행이 있을 때만 지연 생성). 실측상 무시해도 되는 수준이다(T4: 차단 5,000건에서 load+scan 85ms).
- 수정안(선택): 차단 목록이 비면 건너뛴다(`if (!store.count()) return null;`를 `uidForNick` 앞단 게이트로 두거나, `scanNickRows` 호출 전에 확인). 지금 그대로 머지해도 된다.

### [minor] N5 문서·주석 소폭 드리프트  (차원: 유지보수성)
- 위치·증거:
  1. `.claude/skills/fmk-dom-selectors/SKILL.md:50-51`: "미지원(범위 밖): 홈/'베스트' 통합 목록 — `<span class="author"> / 닉네임</span>`"이 바로 아래 52·59행(모바일 `/best` 지원)과 부분적으로 충돌한다. → "**PC** 홈/베스트 통합 목록(모바일은 닉네임 폴백으로 지원)"으로 한정한다.
  2. `.claude/workspace/store-api-contract.md` §4 content 사용 패턴: `onChange` 스니펫에 닉네임 재스캔이 없다. 그 아래 주석 "MutationObserver는 별개 TODO"는 v0.4.0 이후 사실이 아니다(이번 변경 전부터 있던 드리프트지만 같은 섹션을 수정했으니 함께 정리). → 스니펫을 99-main의 실제 배선(색인 무효화 + `scanNickRows`)과 맞추고 stale 주석을 삭제한다.
  3. `src/content/35-observer.js:29-31` 독블록은 (a)(b)만 나열하고 (c) 닉네임 폴백은 본문(46행)에만 있다. 같은 파일 53-54행의 "재귀 가드" 근거도 `hideForAnchor`만 언급한다. → 독블록에 "(c) 모바일 목록 행 닉네임 폴백(`scanNickRows`, 역시 class/dataset 토글뿐이라 childList 재귀 없음)"을 추가한다.
- 수정안: 위 3곳 문구를 정정한다(코드 무변경).

### [INFO-1] 공지 행 자리표시 닉·관리자 닉  (차원: 정확성, 확인 필요)
- 실측: 모바일 공지 행 닉은 `"공지"`, `"공동공지"`, 관리자 `"독고"`다. 저장 닉은 실제 회원 앵커 텍스트나 가져온 JSON에서만 온다. 따라서 `"공지"`라는 닉의 실제 회원을 차단한 경우에만 공지 행이 오차단된다. fmkorea가 이런 닉을 예약어로 막는지는 **미확인**이라 "확인 필요"로 둔다. 관리자를 차단해 공지가 숨는 것은 PC UID 경로와 같은 동작이라 일관적이다.
- **주의(회귀 방지)**: 공지 오차단을 막겠다고 `li.notice`를 제외하면 안 된다. `notice … pop1` 클래스는 **실제 유저의 인기글 행**에도 붙는다(humor: 솔티코·은다왕다 등 6행). 제외가 필요해지면 닉 자리표시(`공지`/`공동공지`) 기준으로 좁혀야 한다.

### [INFO-2] PC `/best`도 UID 없음  (범위)
- PC `/best`는 `fm_best_widget _bd_pc`이고 `<span class="author"> / 닉</span>`이며 숫자 member_ 앵커가 0개다. 이번 셀렉터는 의도대로 미매치한다. 결함이 아니라 `TODO.md:17`(PC 통합목록 폴백)에 이미 등재된 범위 밖 항목이다. 확장할 때는 `.fm_best_widget > ul > li`로 넓히면 같은 `getRowNick`(`.author`) 경로를 재사용할 수 있다.

---

## 차원별 양호 확인 (결함 아님)

- **정확성**: `normalizeNick`은 저장 닉(`anchor.textContent.trim()`)과 행 닉 양쪽에 같이 적용되고 `\s`가 NBSP도 흡수한다. 빈 저장 닉은 `n &&`로, 빈 행 닉은 `if (!nick) return`으로 매칭에서 빠진다. `uidForNick`이 `store.isBlocked(uid)`를 다시 확인해 stale 색인이 해제된 uid로 숨기는 일은 없다. `onBlock`은 `await store.block` 다음에 색인 무효화와 재스캔을 하므로 계약 C3 순서와 맞다.
- **보안**: DOM에서 읽은 닉은 `textContent`로만 읽어 비교에만 쓰고 출력·주입은 없다. `dataset`에는 store 출처의 숫자 uid만 쓴다(`importMany`가 `/^\d+$/` 검증). `unhideByUid`의 셀렉터 문자열 결합도 숫자 uid라 안전하다. 권한 변화도 없다.
- **견고성**: 색인은 클로저 변수라 observer, 우클릭 메뉴, onChange가 같은 최신 상태를 본다. `scanNickRows`는 `uidForNick`이 함수가 아니면 0을 반환하는 안전 실패라 선택 주입과 호환된다. 숨김은 class/dataset 토글뿐이어서 childList 관찰 재귀가 없다.
- **유지보수성**: 실측 날짜와 마크업 예시 주석, 한계 주석, 기존 `.fmkb-hidden`/`data-fmkb-uid`/`unhideByUid` 재사용이 기존 스타일과 일관된다.
- **MV3**: manifest는 버전 범프만 바뀌었다. PLAN·README·TODO·스킬·계약 문서가 같은 작업 단위에서 갱신됐다(N5의 소폭 문구는 제외).

## 미검토

- **실기기 런타임**(Firefox Android): 실제 스크롤/더보기 시 행 삽입 단위(N3 전제), 렌더 타이밍. 실기기 게이트에서 확인해야 한다.
- **긴 닉네임의 목록 표기 절단 여부**: 표본의 최장 닉은 8자이고 서버측 말줄임(`…`) 사례는 관찰되지 않았다. 최대 길이 닉 표본은 확보하지 못했다.
- **닉네임 예약어 정책**(INFO-1): fmkorea 측 규칙을 확인하지 못했다.
