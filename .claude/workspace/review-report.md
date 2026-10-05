# 코드 리뷰 보고서 — FMK-Blind

- 담당: extension-reviewer
- 갱신: 2026-10-05 **재리뷰(델타)** — PR B(저장 계층 쓰기 안전성 재설계, 이슈 #13·#14·#15) 1차 지적 M1·R2~R7 + QA minor-2 수정분. 브랜치 `fix/store-write-safety`, 미커밋 변경분. 1차 리뷰 본문은 아래 "1차 리뷰 기록"에 그대로 둔다.
- 대상(델타): `src/content/10-store.js`(`valueLen`·`BARE_BIG_INT_RE`, `buildChunks` O(n), `writeMerged`의 `diskTotal`·커지는 쓰기만 사전 검사·stale 청크 `[]` 비우기·remove best-effort·`lastRead`, `persistOps`/`carryingRun`, `classify` 문자열 코드만 신뢰, `importMany` `err.fit` 평균), `src/popup/popup.js` 주석, 계약 C3·C8·C11, `sync-sharded-storage` 스킬, popup/content/storage-engineer 정의, README.
- 방법론: `.claude/skills/extension-code-review/SKILL.md`
- 심각도: **blocker** > **major** > **minor**. 검토하지 못한 항목은 "미검토"로 분류한다.
- 상보성: 병렬 QA 재실행 결과는 근거로 쓰지 않았다. 모의 저장소(`scratchpad/rv/mock2.js`, `STORE_SRC_PATH`=워크트리 `10-store.js`: 키 정렬 읽기, Chromium JSONWriter 용량 계산, 전 컨텍스트 비동기 onChanged)로 기존 r1~r6을 다시 돌리고, 델타 전용 프로브 4개(`scratchpad/rv2/p1~p4`)를 새로 작성했다. 리더 모음 `store-b/t_b.js` 50/50 재현.

> **재리뷰 요약:** 1차 지적 7건(M1, R2~R7)과 QA minor-2가 모두 닫혔다. 바뀐 줄에서 새 결함은 찾지 못했다. 용량 추정은 2만 건 퍼징에서 Chrome 실제 크기보다 **작게 잡은 경우가 0건**이고(과대는 숫자열이 든 닉, int32 범위 10자리 정수 같은 비현실·적대 입력에서만 최대 +4B), 청크 합 = `built.total` = 실측 합이 정확히 일치한다. 한도 근처 10자리 UID 목록에서도 해제가 통과하고, 모의 Chrome이 정확히 102,400B까지 채워 준다(가용 용량 손실 0). 남은 것은 문서 잔재 2곳(계약 C11 ④의 `>`·`&` 보정 표기, 계약 §5의 remove·용량 검사 설명)과 INFO 1건(같은 실행에 함께 실린 차단+해제가 커지는 쓰기면 해제도 같이 거절)이다. 둘 다 머지를 막지 않는다. **최종 판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 1(문서) / INFO 1.**

> **PR #23 최종 독립 리뷰(2026-10-05, 푸시된 e5119c8 기준): MERGE, minor 7** — #13·#14 해결, #15는 핵심 해결·하위 항목 후속 이슈(#25 안정 패킹, #26 기기 간 동시 쓰기, #27 같은 실행 묶음 거절, #28 팝업 즉시 닫힘 실브라우저 확인). 반영: M1 예전 버전의 초과 크기 항목이 다른 차단·해제를 막던 경우(기존 항목은 혼자 청크, 크기 판단은 브라우저), M4 더 새 스키마 덮어쓰기 거부(`SCHEMA_NEWER`), M5 content 목록 읽기 실패 시 재시도(탭 복귀·5초, 최대 3번), M6 팝업은 load 전 가져오기·내보내기 비활성 + C10 문구, M7 헤더 문구, N1 스킬 문구, M2는 C11·README에 한계로 기록. 후속 변경 리뷰 OK-TO-COMMIT + QA PASS(모의 54/54·29/29, 실 Firefox 156 후속 게이트·회귀 29/29, content 재시도 jsdom 14/14).

## 재리뷰 진행 현황

| 차원 | 상태 | 비고 |
|------|------|------|
| 1. 정확성 | ✅ 검토완료 | M1·R2 닫힘. `BARE_BIG_INT_RE`·`buildChunks` 경계·`diskTotal` 비교·`carryingRun` 수명 모두 정상 |
| 2. 보안 | ✅ 검토완료 | 델타에 DOM·권한 변경 없음 |
| 3. 견고성 | ✅ 검토완료 | R3·R5·R7 닫힘. stale `[]` 잔존 시 다음 쓰기에서 재정리 확인. INFO-4(동반 실행 거절) |
| 4. 유지보수성 | ✅ 검토완료 | R6 대부분 닫힘, 잔재 2곳(minor R6') |
| 5. MV3/베스트프랙티스 | ✅ 검토완료 | `node --check` 3파일 통과, manifest 0.8.0 유지 |
| 6. 성능 | ✅ 검토완료 | R4 닫힘: `buildChunks(1501)` 26~32ms → 2.6~3.8ms |

> **최종 판정: 머지 가능(MERGE). blocker 0 / major 0 / minor 1 / INFO 1.** R6'은 커밋 전에 문구 2곳만 고치면 되고, 고치지 않아도 동작에는 영향이 없다.

## 1차 지적 종결 확인

| ID | 1차 심각도 | 상태 | 근거 |
|----|-----------|------|------|
| M1 | major | **닫힘** | ① `valueLen`이 `<`만 +5, U+2028/9 +3, **따옴표 밖** 10자리 이상 정수만 +2(`/[:,\[]-?\d{10,}(?=[,\]}])/g`). UID는 문자열이라 앞에 `"`가 와서 안 걸린다. ② `writeMerged`가 디스크 원값으로 `diskTotal`을 재고 `built.total > diskTotal`일 때만 `checkQuota`. `r1_overquota`: 6자리·10자리 모두 해제 2회 ok. `p4`: 모의 Chrome이 102,400B 정확히까지 채움 → 추정이 Chrome과 일치 |
| R2 | minor | **닫힘** | `r2_idem`: 1차·2차 모두 QUOTA reject. `p2-B`: 이미 끝난 실행 뒤 같은 차단은 쓰기 없이 resolve(쓰기 1회), 실패·되돌림 뒤 재차단은 새 쓰기로 성공, 진행 중 실행의 중복 해제는 같은 Promise(`q2===q1`), 실패 시 둘 다 reject |
| R3 | minor | **닫힘** | `p2-A`: 3청크→1청크 축소 시 `set bl_0,bl_1:[],bl_2:[]` 한 번 + remove 실패 → **200/200 resolve**, 경고 1회, 다른 탭·새 load 모두 50명. 다음 쓰기는 `[]`를 다시 set하지 않고 remove만 재시도. 다시 늘릴 때 `bl_1`(`[]`)을 덮어쓰고 남은 `bl_2` 제거 → 199명 일치 |
| R4 | minor | **닫힘** | 항목당 `valueLen` 1회, 청크 길이 = 2 + Σlen + 쉼표. `p1`: n=1/50/500/1600에서 `built.total` = 청크별 `quotaLen` 합(정확 일치), 최대 청크 7,161B ≤ 7,168B, 덜 채워진 청크 0. `r5_perf2`: 1,501명 2.6~3.8ms |
| R5 | minor | **닫힘** | `OUR_CODES[e.code]`(문자열)만 신뢰. 숫자 `code`는 메시지 분류로 가고, 최종 throw는 `e.code === code`가 아니면 `coded(...)`로 감싸 계약 4개 코드만 나간다 |
| R6 | minor | **대부분 닫힘** | store 헤더(기기 간 = sync 전파, 0.8.0+), C3(실 팝업 미검증 명시), C8, C11(커지는 쓰기만 검사, `[]` 비우기, 겹친 청크 다중 유실, 혼합 버전), 스킬 정규화 설명, popup 주석 2곳, popup/content-engineer reject 처리, README 반영 확인. 잔재 2곳은 R6' |
| R7 | minor | **닫힘** | `p2-C`: 동결 탭(onChanged 놓침)에서 첫 시도 읽기 성공 → set 일시 실패 → 이후 읽기 실패 3회 → 최종 `WRITE_FAILED`. 첫 읽기의 외부 차단 `999`가 `disk`에 반영되고, diff `{added:[999], removed:[555]}` 1회 통지 |
| QA minor-2 | minor | **닫힘** | `p3`: 1,000명 상태에서 2,000명 가져오기 → `fit` 264 → 264명 가져오기 성공 → 이후 단건 17명 추가 가능(약 6% 보수적, 재실패 없음) |

## 델타 집중 점검 (리더 요청 항목)

| 질문 | 결론 | 근거 |
|------|------|------|
| `BARE_BIG_INT_RE` — 배열 시작·음수 | **정상** | `[`·`:`·`,` 뒤 + 선택 `-` + 10자리 이상 + 뒤가 `,`·`]`·`}`. `[1234567890123,1234567890123]`처럼 연속이어도 lookahead가 `,`를 소비하지 않아 둘 다 잡힌다. 음수 `-3000000000` 보정됨. 소수(`1718000000000.5`)·지수(`1e+21`)는 뒤가 `.`/`e`라 제외(Chrome도 `.0`을 안 붙임). int32 범위 10자리(1e9~2147483647)는 +2 과대지만 ms 타임스탬프로는 1970년 1월뿐이라 무시 가능. 퍼징 2만 건 과소 0 |
| 닉 안의 숫자열 | **안전(과대)** | 닉 `x:1234567890,y` 같은 문자열 안 패턴도 +2로 세어 과대 쪽으로만 틀린다 |
| `buildChunks` 경계 수식 | **정확** | 엔트리 사이에 숫자가 걸치는 경계가 없어(UID가 문자열) 엔트리별 보정 합 = 청크 전체 보정. 단일 항목 검사는 분할 전 키(`bl_9`→`bl_10`) 기준이라 최대 1B 차이, 7,168 대 8,192 여유로 무해 |
| stale `[]`와 `chunkIdx`/`diskTotal` | **정상** | `[]` 키는 `chunkIdx`에 들어가 `diskTotal`에 6B씩 더해진다(축소 판정 쪽으로 보수적). `chunkStr`가 `'[]'`라 재-set 생략, remove만 재시도. 인덱스가 다시 필요해지면 내용 비교로 덮어씀. `MAX_ITEMS` 검사는 잔존 `[]` 키를 세지 않지만 1~2개라 한도(512)와 무관 |
| `diskTotal` vs 재청킹 | **정상** | 구버전 레이아웃에서 첫 쓰기로 청크가 1개 늘어도 키+괄호 약 7B, 해제 1건은 최소 약 40B를 줄여 축소로 판정된다. 메타 없는 디스크는 `diskTotal`이 메타만큼(16B) 크게 잡히지만 0.7.x도 메타를 썼으므로 실무 영향 없음 |
| `carryingRun` — 실행 종료·op 제거 뒤 | **정상** | 성공하면 같은 seq의 pending이 지워져 `null` → `Promise.resolve()`(이미 저장됨). 실패하면 되돌림으로 pending이 지워지고 `map`에서도 빠져 다음 호출은 새 op 경로를 탄다. `p.run`은 항상 아직 시작 전인 실행(`queuedRun` 또는 새 실행)이라 그 실행이 반드시 스냅샷한다. 메모리 전용 모드(저장소 없음)는 pending이 남지만 실행이 resolve돼 있어 기존과 같다 |
| `lastRead` — 재시도·동시 refresh | **정상** | `persistRun` 시작 때 `null`로 초기화하고 읽기 성공마다 갱신한다. 재시도 중 `sleep`도 직렬 큐 안이라 refresh가 끼지 못하므로 `lastRead`가 가장 최근 디스크다. 이후 읽기가 실패하면 앞 시도의 읽기가 남는데, 그 사이 다른 읽기가 없으므로 여전히 최신이다 |
| set 성공·콜백 오류(일시 오류 오탐) | **수용** | `disk = lastRead`(쓰기 전 상태)로 되돌리지만 자기 쓰기의 onChanged refresh가 곧 실제 디스크로 맞춘다(1차 R3 분석과 동일) |

---

## 재리뷰 발견 사항

### [minor] R6' 계약 문서 잔재 2곳  (차원: 유지보수성·문서)
- 위치·증거:
  1. `.claude/workspace/store-api-contract.md:162`(C11 ④) "Chrome 방식 용량 계산(키+JSON UTF-8, **`<`·`>`·`&`**·U+2028/9·큰 숫자 보정 …)". 코드는 이제 `<`만 보정한다(Chromium은 `>`·`&`를 이스케이프하지 않음 — M1 수정의 핵심).
  2. 같은 파일 `:242` "남는 청크 remove(**remove 실패 시 재시도 때 다시 읽어 바로잡음**)", `:244` "**초과 시 쓰기 전에 QUOTA로 거절**". 현재는 남는 청크를 같은 set에서 `[]`로 비우고 remove 실패는 경고만 하며, 사전 검사는 커지는 쓰기에만 한다(C11 본문·스킬 `SKILL.md:32-33`과 불일치).
- 수정안: ① `` `<`·U+2028/9·따옴표 밖 큰 정수(`.0`) 보정 `` ② "남는 청크는 같은 set에서 `[]`로 비우고, 키 remove는 정리용(실패 시 경고, 다음 쓰기에서 재시도)" / "목록이 커지는 쓰기만 사전 검사해 넘으면 QUOTA로 거절(줄이는 쓰기는 브라우저 판정)". 동작 변경 없음.
- (참고, 기존 잔재) `.claude/skills/sync-sharded-storage/SKILL.md:21-23` 직렬화 규칙 1·3이 `{nick, addedAt}` 순서와 "`JSON.stringify`로 저장"을 적고 있다. 실제는 키 정렬 레코드(`{addedAt, nick}`)를 네이티브 배열로 저장한다. 이번 PR 이전부터 있던 문구라 별도 정리 대상으로만 남긴다.

### [INFO-4] 같은 실행에 함께 실린 차단+해제가 커지는 쓰기면 해제도 같이 거절됨  (견고성, 수용 가능)
- 재현(`p4_coalesce.js`): 모의 Chrome을 102,400B까지 채운 뒤 같은 컨텍스트에서 `block(긴 닉)`과 `unblock`을 같은 틱에 호출 → 한 실행으로 합쳐져 순증이므로 사전 검사 → **둘 다 QUOTA**. 이어서 `unblock`만 다시 부르면 성공.
- 판단: 실행 단위 전부-또는-전무 시맨틱이라 일관되고, 해제를 다시 하면 풀리므로 잠금이 아니다. 팝업은 해제만 하고, content의 우클릭은 사람이 같은 틱에 차단과 해제를 동시에 할 수 없어 현실 경로가 없다. README "해제는 항상 가능"과도 실질적으로 충돌하지 않는다. 기록만 남긴다.

---

## 재리뷰 실측 요약

| 시나리오 | 결과 | 파일 |
|----------|------|------|
| 리더 모음 | 50/50 PASS | `store-b/t_b.js` |
| 한도 근처 해제(6·10자리 UID) | 1·2회 모두 ok | `rv/r1_overquota.js` |
| 멱등 경로 실패 전파 | p1·p2 모두 QUOTA reject | `rv/r2_idem.js` |
| 혼합 버전·업그레이드 재청킹 | 1차와 동일(혼합 버전 덮어쓰기는 문서화됨) | `rv/r4_mixed.js`, `rv/r6_upgrade.js` |
| `buildChunks(1501)` | 2.6~3.8ms | `rv/r5_perf2.js` |
| `valueLen` 퍼징 2만 건 vs Chromium JSON | 과소 0 / 과대 6,667(적대 닉·int32 10자리만, 최대 +4B) / 일치 13,333 | `rv2/p1_accounting.js` |
| 청크 수식 vs 실측 | n=1·50·500·1600 모두 `built.total` = Σ`quotaLen`, 최대 7,161B | `rv2/p1_accounting.js` |
| stale `[]`·remove 실패·재성장 / `carryingRun` / `lastRead` | 위 종결 표 참고 | `rv2/p2_paths.js` |
| `err.fit` 정확도 | fit 264 → 가져오기 성공 → 단건 17 추가 | `rv2/p3_fit.js` |
| 동반 실행 거절 | 결합 시 QUOTA 2건, 해제 단독 재시도 ok | `rv2/p4_coalesce.js` |

`r3_perf.js`는 스크립트 자체의 용량 초과 가져오기에서 처리하지 않은 QUOTA로 끝난다(store 결함 아님, 리더 확인과 동일).

## 재리뷰 미검토

- **실 브라우저**: 이번에도 모의 저장소 근거뿐이다. 1차 "미검토" 항목(고아 content script 토스트, 팝업 해제 직후 종료, 두 탭 동시 조작)은 그대로 남는다. 머지 전 실 Chrome·Firefox 확인을 권한다.
- **Firefox 용량 계산**: Firefox는 정수에 `.0`을 붙이지 않는 것으로 보여 추정이 항목당 약 2B 과대다. 축소 쓰기는 검사하지 않으므로 해제는 막히지 않고, 커지는 쓰기만 약 3% 일찍 거절된다(안전 방향). 소스 확인은 하지 않았다.

---

# 1차 리뷰 기록 (2026-10-05, FIX-REQUIRED — 위 재리뷰로 종결)

## 검증 근거

### 동시성 모델 점검 (코드 추적 + 모의)

| 질문 | 결론 | 근거 |
|------|------|------|
| `queuedRun` 리셋 시점 | **정상** | `requestPersist`(`10-store.js:348-356`)는 `queuedRun = run`을 동기로 대입하고, task는 `serialTail.then`(마이크로태스크 이후)에서 `queuedRun = null` → `persistRun()`을 실행한다. `persistRun`의 첫 `await` 전 구간(`contextAlive`·`hasStorage`·`snapshotOps`)이 같은 틱이라, 리셋과 스냅샷 사이에 끼어드는 `addOp`이 없다. 이후 `addOp`은 모두 새 `requestPersist`를 부른다(`block` 멱등 경로 제외 → R2) |
| 되돌림 vs 더 새로운 op | **정상** | `rollback`(`:336-342`)과 성공 정리(`:322-325`) 모두 `p.seq === o.seq`일 때만 pending에서 뺀다. 실행 중 같은 uid에 `unblock`이 들어오면 seq가 달라 남고, 그 op는 자신이 만든 다음 실행에 실린다 |
| refresh와 미저장 로컬 변경 | **정상** | `scheduleRefresh`는 `disk`만 교체하고 `recompute`가 pending을 다시 얹는다. refresh의 `syncGet` await 중에 `block`이 들어와도 그 op는 pending에 있어 보존되고, `removed` 오통지도 없다(구 clobber 경쟁의 구조적 해소) |
| 재시도 멱등성 | **정상** | 재시도마다 `get(null)`을 새로 하고 같은 ops를 다시 병합한다. 콜백은 오류였는데 실제로는 set이 반영된 경우에도 다음 시도에서 차이 0 → set 생략 |
| 성공 시 통지 | **정상** | 성공 후 `recompute(true)`는 쓰기 직전 읽기에서 발견한 **외부** 변경만 diff로 낸다(자기 변경은 이미 `map`에 있음). 자기 쓰기의 onChanged → refresh는 diff 0 |
| 되돌림 시 통지 | **정상(중복 1회 가능)** | 되돌림은 `removed`(block 실패)/`added`(unblock 실패)를 통지한다. content는 observer가 pending 동안 숨긴 새 노드도 이 통지로 복구한다. 팝업은 onChange 콜백과 `.catch`의 `refresh()`가 둘 다 돌아 2회 재렌더(무해). set 성공 + remove 실패 후 되돌림이면 "되돌림 diff → onChanged refresh diff"로 2단 통지된다(R3) |
| 누락 통지 | **대체로 없음** | 외부 쓰기는 자기 onChanged로 refresh가 예약된다. 단 동결 탭처럼 이벤트를 놓친 경우, 실패한 쓰기 실행의 읽기 결과는 버려진다(R7) |
| `contextAlive` (Chrome 고아) | **정상** | 확장 재로드 뒤 남은 content script에서는 `chrome.runtime.id`가 `undefined`가 된다. `runtimeIdAtInit && !chrome.runtime.id` → false. 동기 throw("Extension context invalidated")도 `classify` 정규식으로 잡힌다 |
| `contextAlive` (Firefox) | **정상** | Firefox content script에도 `runtime.id`가 노출된다(MDN: content script에서 쓸 수 있는 runtime API에 `id` 포함) → `runtimeIdAtInit` 설정됨. Firefox는 확장 언로드 시 content script 샌드박스를 nuke하므로, 접근 시 "dead object" throw → `catch` → false. 팝업·테스트(`chrome` 없음 → `storageAtInit=false` → true)도 의도대로 동작 |

### M1 재현 — 한도 근처 기존 목록 (`scratchpad/rv/r1_overquota.js`)

0.7.x 방식(평문 `byteLen(JSON.stringify)`로 7,168B 청킹)으로 기록한 목록을 Chrome 계산(모의, Chromium JSONWriter)으로 101.8KB까지 채운 뒤 새 store로 해제를 시도했다.

| UID 자릿수 | 항목 수 | Chrome 실제 용량 | store 추정 | `unblock` 1회 | 2회 |
|------------|---------|------------------|------------|---------------|-----|
| 6 | 1,671 | 101,801B | ≤ 102,400 | ok | ok |
| **10** | 1,569 | **101,855B** | **104,934B** | **REJECT QUOTA** | **REJECT QUOTA** |

- 실제 fmkorea UID는 10자리가 흔하다(저장소 내 실측 샘플 `member_4120586159` 10자리, `member_515859774` 9자리).
- 과대 폭은 **10자리 UID 문자열 1개당 +2B**(`/\d{10,}/`가 따옴표 안 숫자열까지 셈)이고, 1,569명이면 약 3.1KB다. 해제 1건은 약 65B만 줄이므로, 약 48명을 지워야 추정치가 한도 밑으로 내려간다. 그런데 그 해제가 하나도 통과하지 못한다. 결과적으로 **잠금**이다.
- 수정안(아래 M1)을 복사본에 적용하자 같은 시나리오에서 해제가 통과했고, 모의 Chrome도 그 쓰기를 받아들였다(`r1_fixed.js`: 6자리·10자리 모두 ok).

### 기타 실측

| 시나리오 | 결과 | 파일 |
|----------|------|------|
| 앞 실행이 QUOTA로 실패하는 사이, 같은 uid로 `block` 재호출 | 1차 reject, **2차 resolve**, `isBlocked=false`, 디스크 없음 → R2 | `r2_idem.js` |
| 1,500명: `block` 20회 평균(모의 `get(null)`+파싱+재청킹+백엔드 계산 포함) | 38ms/회. 앞쪽 uid 해제 1회는 16키 중 **15청크 재기록**(연쇄 시프트) | `r3_perf.js` |
| 1,501명 `buildChunks` 단독(`importMany` 사전 검사의 동기 구간) | 26~32ms/회(Apple Silicon, Node) → R4 | `r5_perf2.js` |
| 구버전(HEAD `10-store.js`)이 신버전 데이터 읽기 | 200/200 정상, 닉·addedAt 정상. 신버전 해제가 구버전 탭에 라이브 반영됨 | `r4_mixed.js` |
| 신버전이 구버전 탭과 공존 | 신버전이 555를 추가한 직후(onChanged 전달 전) 구버전 탭이 666을 차단하자 **555가 사라짐**. 구버전은 메모리 맵 전체를 쓰기 때문이다(기존 동작이며 회귀 아님 → R6 문서화) | `r4_mixed.js` |
| 구버전이 쓴 800명 → 신버전 첫 쓰기 | 7청크 전부 재기록(1회), 두 번째 쓰기부터는 `bl_6`만 기록 → INFO-3 | `r6_upgrade.js` |
| 기존 모의 모음 | 47/47 PASS 재현 | `store-b/t_b.js` |

---

## 발견 상세

### [major] M1 용량 과대 추정 때문에 한도 근처 목록에서 해제까지 QUOTA로 거절됨  (차원: 정확성)
- 위치: `src/content/10-store.js:103-110`(`quotaLen`), `:227-237`(`checkQuota`), `:273-274`(`writeMerged`의 검사 호출)
- 증거:
  ```js
  var s = JSON.stringify(value);
  var n = byteLen(key) + byteLen(s);
  n += 5 * ((s.match(/[<>&]/g) || []).length);        // Chromium은 '<'만 <로 이스케이프한다. '>'·'&'는 원문 그대로
  n += 3 * ((s.match(LINE_SEP_RE) || []).length);
  n += 2 * ((s.match(/\d{10,}/g) || []).length);      // addedAt(.0)뿐 아니라 따옴표 안 10자리 UID·숫자 닉도 +2
  ...
  if (built.chunks.length + 1 > MAX_ITEMS || total > QUOTA_BYTES) { throw coded('QUOTA', ...) }  // 줄이는 쓰기도 동일하게 거절
  ```
  추정은 "넘치지 않게"라는 방향으로는 안전하다(과소 추정 경로 없음: `<`·U+2028/9·`.0`을 모두 보정한다). 문제는 과대 폭이 크고, **쓰기 방향을 보지 않는다**는 점이다. 0.8.0 이전 버전이 쓴 목록은 브라우저가 실제 계산으로 받아들인 것이라 `실제 ≤ 102,400`이다. 하지만 추정치는 102,400을 넘을 수 있다. 그 구간에서는 `block`뿐 아니라 `unblock`도 `checkQuota`에서 거절되고, 토스트는 "팝업에서 목록을 정리해 주세요"라고 안내한다. 그런데 팝업의 해제도 같은 이유로 실패한다. 완전 숨김 설계상 해제는 팝업이 유일한 경로이므로, 사용자는 sync 저장소를 직접 지우는 것 말고는 빠져나갈 방법이 없다.
  - Chrome: 10자리 UID 기준 항목당 +2B → 약 3% 구간(위 실측).
  - **Firefox(확인 필요)**: Firefox `storage.sync`의 용량 계산은 키 + JSON 문자열 길이이고, 정수에 `.0`을 붙이지 않는 것으로 안다. 그렇다면 addedAt 보정(+2)까지 전부 과대라 항목당 약 +4B, 약 6% 구간이 잠긴다. Firefox Android가 모바일 주 런타임이라 영향 범위가 Chrome보다 넓다.
  - 발생 조건이 "기존 목록 약 1,500명 이상 + 한도 근처"라 드물다. 하지만 걸리면 기능 잠금이고, 이번 PR이 도입한 회귀다(0.7.x는 사전 검사 없이 브라우저 판정에 맡겼다).
- 수정안(둘 다 권장, 최소 ①):
  1. **줄어들거나 같은 쓰기는 사전 검사로 막지 않는다.** 최종 판정은 브라우저가 하고, 브라우저가 거절하면 `classify`가 QUOTA로 분류한다.
     ```js
     function checkQuota(built, otherBytes, prevTotal) {
       var total = built.total + (otherBytes || 0);
       var growing = !(typeof prevTotal === 'number' && built.total <= prevTotal);
       if (built.chunks.length + 1 > MAX_ITEMS || (total > QUOTA_BYTES && growing)) { /* QUOTA */ }
       ...
     }
     // writeMerged
     var prevTotal = buildChunks(Array.from(parsed.entries.entries())).total; // 또는 디스크 키별 quotaLen 합(R4와 함께 O(n)으로)
     checkQuota(built, parsed.otherBytes, prevTotal);
     ```
     (모의로 검증함: `scratchpad/rv/fixed-store.js` + `r1_fixed.js`.) `importMany`의 사전 검사는 항상 늘리는 쓰기라 그대로 둬도 된다.
  2. **보정을 구조에 맞춰 정확히 한다.** 레코드 구조를 알고 있으므로 문자열 정규식 대신 다음처럼 센다. 그러면 정상 목록의 가용 용량 손실(현재 약 3~6%, 대략 50~100명)도 없어진다.
     ```js
     // 레코드당: addedAt이 int32 밖의 정수면 +2(".0"), 문자열(uid·nick)의 '<' 개수 ×5, U+2028/9 ×3
     ```
     Firefox까지 정확히 맞추려면 `.0` 보정을 Chrome에서만 적용해야 한다(`typeof browser === 'undefined'` 등으로 판별, 확인 필요). ①만 적용해도 잠금은 풀린다.
  - 회귀 테스트: `r1_overquota.js`를 모음에 추가한다(10자리 UID, 실제 101.8KB 목록에서 unblock이 통과하는지).

### [minor] R2 멱등 경로가 앞 실행의 실패를 모른 채 resolve함  (차원: 정확성)
- 위치: `src/content/10-store.js:474-476`(`block`의 "이미 있고 nick 같음" 경로), `:492`(`unblock`의 "map에 없음" 경로)
- 증거:
  ```js
  if (typeof nick !== 'string' || nick === existing.nick) {
    return pending.has(uid) ? requestPersist() : Promise.resolve();   // 이 uid의 op는 이미 진행 중인 실행에 실려 있다
  }
  ```
  진행 중인 실행 run1에 이미 실린 op에 대해 `requestPersist()`를 부르면 새 run2가 만들어진다. run1이 실패해 op를 되돌리면 run2는 실을 op가 없어 바로 resolve한다. 실측(`r2_idem.js`): 1차는 `QUOTA`로 reject, **2차는 resolve**인데 `isBlocked=false`이고 디스크에도 없다. `unblock`도 같다. pending del이 진행 중일 때 다시 부르면 `map.has`가 false라 즉시 resolve하고, 앞 실행이 실패하면 거짓 성공이 된다. 지금 소비자에서는 우클릭 메뉴가 `isBlocked`에 따라 차단/해제 중 하나만 보여 주고, 팝업은 버튼을 비활성화하므로 **도달하지 않는다**. 하지만 계약 C3("resolve = 저장 완료")을 API 수준에서 어기므로, 이후 소비자(예: 차단 메모 TODO)에서 드러날 수 있다.
- 수정안: 멱등 경로는 실행이 끝난 뒤 의도가 실제로 성립하는지 확인한다.
  ```js
  function persistAndVerify(uid, wantBlocked) {
    return requestPersist().then(function () {
      if (map.has(uid) !== wantBlocked) throw coded('WRITE_FAILED', '앞선 저장이 실패해 되돌려졌습니다.');
    });
  }
  // block 멱등:   return pending.has(uid) ? persistAndVerify(uid, true) : Promise.resolve();
  // unblock 없음: return pending.has(uid) ? persistAndVerify(uid, false) : Promise.resolve();
  ```
  (pending op마다 자기를 실은 실행 Promise를 기억해 그것을 돌려주는 방법도 된다.)

### [minor] R3 `set`→`remove` 2단계 쓰기의 비원자성  (차원: 견고성)
- 위치: `src/content/10-store.js:285-290`
- 증거:
  ```js
  if (Object.keys(toSet).length) await syncSet(toSet);
  if (stale.length) await syncRemove(stale);   // 여기서 최종 실패 → persistRun이 rollback + reject
  disk = merged;
  ```
  ① set은 성공했는데 remove가 재시도 끝에 실패하면, 호출자는 "저장 실패"를 받고 메모리도 되돌려진다. 하지만 디스크는 이미 새 청크로 바뀌어 있다. 이어서 도착하는 onChanged refresh가 디스크 상태를 다시 반영하므로 최종 상태는 디스크와 일치한다. 다만 사용자는 실패 토스트를 본 뒤 결과가 성공 쪽으로 뒤집히는 것을 보게 된다. ② 정상 경로에서도 set과 remove 사이에 다른 컨텍스트의 refresh가 끼면, stale 청크에 남은 **삭제된 항목**이 잠깐 되살아난다. 그 탭은 잠깐 숨겼다가 다음 onChanged에서 복구한다(깜빡임).
- 수정안: stale 키를 같은 `set` 호출에 `[]`로 함께 넣어 논리 상태를 한 번의 원자적 set으로 바꾸고, 이어지는 `remove`는 정리 작업(실패해도 run은 성공 처리, 다음 쓰기에서 다시 정리)으로 낮춘다. 빈 배열 청크는 `parseDisk`가 이미 관용 처리한다. 키 수(MAX_ITEMS)는 순간적으로 그대로라 문제없다.

### [minor] R4 `buildChunks`의 이차 비용  (차원: 성능)
- 위치: `src/content/10-store.js:204-224`
- 증거:
  ```js
  var next = cur.concat([entry]);                                         // 매 항목마다 배열 복사
  if (cur.length > 0 && quotaLen('bl_' + chunks.length, next) > CHUNK_BUDGET) {  // 청크 전체 stringify + 정규식 3개
  ```
  청크당 약 100항목이면 항목마다 약 100항목짜리 문자열화가 일어난다. 실측 1,501명 기준 26~32ms(데스크톱 Node)이다. 쓰기마다 1회(`writeMerged`), `importMany`는 최대 3회(사전 검사, 실패 시 `fit` 계산) 돈다. content script 메인 스레드에서 돌고, Firefox Android 중급 기기에서는 수 배가 될 수 있어 우클릭 차단 직후 잠깐 멈출 수 있다. 최대 약 1,600명(100KB)이 상한이라 치명적이지는 않다.
- 수정안: 항목별 크기를 한 번만 잰다(`[`+`]` 2B + 항목 사이 쉼표 1B를 더하면 청크 JSON 길이와 같다). 보정(M1-②)도 항목 단위로 더하면 O(n)이 된다.
  ```js
  var size = 2 + byteLen(key);                    // '[' ']' + 키
  // 항목마다: var es = entryQuotaLen(entry); if (cur.length && size + 1 + es > CHUNK_BUDGET) { push; size = 2 + byteLen(nextKey); }
  //          size += (cur.length ? 1 : 0) + es;
  ```

### [minor] R5 `classify`가 숫자 `e.code`까지 그대로 통과시킴  (차원: 견고성)
- 위치: `src/content/10-store.js:126-127`, `:317`
- 증거:
  ```js
  function classify(e) {
    if (e && e.code) return e.code;   // DOMException(code 22 등)·기타 code 있는 오류도 여기서 반환
  ```
  `syncCall`의 동기 `catch (e) { reject(e); }`로 들어오는 브라우저 예외(`DOMException`은 숫자 `code`를 가짐, 예: Firefox `QuotaExceededError` = 22)는 재시도 대상 판정을 건너뛴다. 또 `throw e && e.code ? e : …`로 그대로 reject되어 계약 C7의 4개 코드(`QUOTA`·`CONTEXT_INVALIDATED`·`WRITE_FAILED`·`READ_FAILED`) 밖의 값이 소비자에게 간다. 소비자는 일반 문구로 떨어지므로 크래시는 없지만, 용량 초과인데 "잠시 후 다시 시도" 문구가 나갈 수 있다.
- 수정안: 우리 코드만 신뢰한다.
  ```js
  var OWN_CODES = { QUOTA: 1, CONTEXT_INVALIDATED: 1, WRITE_FAILED: 1, READ_FAILED: 1 };
  if (e && typeof e.code === 'string' && OWN_CODES[e.code]) return e.code;
  // 그 외에는 메시지·name으로 분류(e.name === 'QuotaExceededError' → QUOTA 추가)
  ```
  `:317`도 `OWN_CODES[e.code]`일 때만 원 오류를 그대로 던지고, 아니면 `coded(code, …, e)`로 감싼다.

### [minor] R6 문서·주석 드리프트  (차원: 문서)
- 위치·증거:
  1. `src/content/10-store.js:25-26` "두 기기가 같은 읽기→쓰기 사이(**수 ms**)에 … 창이 좁아졌을 뿐". 기기 간 창은 수 ms가 아니라 **sync 전파 지연(수 초~수 분)**이다. 기기 B는 A의 변경을 아직 받지 못한 로컬 저장소를 읽고 병합한다. 게다가 앞쪽 uid를 해제하면 청크가 연쇄로 밀려 거의 모든 청크를 다시 쓴다(실측 16키 중 15). 그래서 키 단위 last-writer-wins의 피해 범위가 "한 유저"보다 클 수 있다. 계약 C11은 "기기 간에는 sync 전파 전"으로 맞게 적었고 스킬은 모호하다. 셋을 C11 표현으로 맞춘다.
  2. 계약 C3 "(모의 테스트: 25ms 뒤 닫아도 저장됨)". 모의 저장소의 `get` 지연은 2ms 고정이라 실 브라우저 근거가 아니다. 이 프로젝트에는 mock 거짓 PASS 전례가 있다(2026-06-15). "실브라우저 확인 전"이라고 명시하거나 실측값으로 바꾼다(INFO-2).
  3. 계약 C8 "내구성은 C3(**즉시 쓰기 동기 디스패치**)가 대체". 새 C3는 동기 디스패치가 아니라고 스스로 적고 있다. "C3(쓰기 완료 시 resolve)"로 정정한다.
  4. `src/popup/popup.js:440-441` JSDoc "importMany는 … throw하지 않는다(계약 C10)". 이제 QUOTA·쓰기 실패 때 reject한다. `:598-599` "팝업 자신의 onUnblock은 '자기-쓰기'라 … 이 콜백이 호출되지 않으므로 … 중복 갱신이 없다". 실패(되돌림) 시에는 콜백과 `.catch`의 `refresh()`가 둘 다 돈다(무해하지만 주석은 사실과 다르다).
  5. `.claude/skills/sync-sharded-storage/SKILL.md:19` "키 정렬로 쓰지 않으면 매번 '바뀐 청크'로 오판해 전체를 다시 쓴다". 새 구현은 `parseDisk`가 디스크 레코드를 `canonRec`로 정규화한 뒤 비교하므로, 쓰기 순서와 무관하게 비교가 안정적이다. 구 코드(정규화 없이 디스크 원문 문자열과 비교)에만 맞는 설명이다. "비교 전 양쪽을 정규형으로 맞춘다"가 실제 불변식이다. `10-store.js:22-23` 헤더도 같다.
  6. **혼합 버전 경고 없음**: 0.7.x가 설치된 기기·브라우저 프로필은 여전히 메모리 맵 전체를 쓰므로, 0.8.0 기기가 방금 한 변경을 덮을 수 있다(`r4_mixed.js` 재현). #15의 보호는 **모든 쓰기 주체가 0.8.0 이상일 때만** 성립한다. README의 다기기 절이나 계약 C11 "남은 한계"에 "모든 기기를 0.8.0 이상으로 업데이트"를 적는다.
  7. `.claude/agents/popup-engineer.md:37`에는 load 실패만 있고 `unblock`·`importMany` reject 처리(`err.code`별 문구, 재렌더)가 없다. content-engineer 정의도 block/unblock reject 처리를 언급하지 않는다. 다음 작업에서 에이전트가 catch를 빼먹지 않도록 한 줄씩 추가한다.
- 수정안: 위 항목별 정정. 동작 변경은 없다.

### [minor] R7 실패한 쓰기 실행의 읽기 결과를 버림  (차원: 견고성, 선택)
- 위치: `src/content/10-store.js:266-291`, `:316`
- 내용: `writeMerged`가 `get(null)`에 성공한 뒤 set에서 실패하면 `parsed`(최신 디스크)는 버려지고, `rollback`은 옛 `disk` 기준으로 `recompute`한다. 보통은 외부 쓰기의 onChanged가 refresh를 예약하므로 곧 맞춰진다. 하지만 동결 등으로 이벤트를 놓친 탭은 다음 이벤트(가시성 복귀 등)까지 stale이다. `writeMerged`가 읽기 직후 `lastRead = parsed.entries`를 남기고, `rollback` 전에 `disk = lastRead`로 갱신하면 된다(`set`이 이미 반영됐을 가능성은 R3 처리에 맡긴다).

### [INFO-1] 재시도 백오프가 직렬 큐를 최대 약 7초 점유  (견고성, 수용 가능)
- `persistRun`은 `await sleep(1000/2000/4000)`을 큐 안에서 수행한다. 그동안 refresh와 후속 block·unblock이 기다린다. content는 resolve 뒤에 숨기므로 우클릭 차단 반영이 최대 7초 이상 늦어질 수 있다. 다만 이 경로는 일시 오류에서만 타고, 레이트리밋(분당 120)은 수동 조작 빈도로는 사실상 닿지 않는다. 분당 한도라면 7초 안에 풀리지도 않아 결국 `WRITE_FAILED`로 안내한다. refresh는 읽기 전용이라 늦어져도 데이터 손상은 없고, 같은 큐에서 돌기 때문에 쓰기와 경쟁하지 않는다는 이점이 지연 비용보다 크다. 수용한다. 팝업이 재시도 중에 닫히면 그 해제는 저장되지 않지만, 사용자는 성공 표시를 본 적이 없으므로 "실패를 성공으로 보이지 않기" 원칙은 지켜진다.

### [INFO-2] C3 변경: 팝업 조기 종료 창  (생명주기, 수용 가능)
- 읽기→병합→쓰기 때문에 `sync.set`은 `get(null)` 왕복(같은 브라우저 IPC, 보통 수 ms. Firefox는 이보다 길 수 있음) 뒤에 나간다. 팝업은 resolve 후에 목록을 다시 그리므로 사용자는 자연히 결과를 기다리게 되고, 실질 위험은 낮다. 근거가 모의(2ms 고정 지연)뿐이므로 실 Chrome·Firefox에서 "해제 클릭 직후 Esc/바깥 클릭"을 한 번 확인할 것을 권한다(R6-2).

### [INFO-3] 업그레이드 직후 1회 전체 재청킹  (호환성, 수용 가능)
- 새 용량 계산(`.0`·이스케이프 보정)은 구 `byteLen` 청킹보다 약간 크게 잡으므로 청크 경계가 달라진다. 0.8.0의 첫 쓰기에서 모든 청크가 1회 재기록된다(`r6_upgrade.js`: 7/7). 이후에는 바뀐 청크만 쓴다. 쓰기 호출은 1회라 레이트리밋 영향이 없다. 구버전 기기와 번갈아 쓰면 그때마다 재청킹되지만 정합성 문제는 없다.

---

## 차원별 양호 확인 (결함 아님)

- **계약 적합성(직접 확인)**: 8개 API 이름·인자·반환 타입이 그대로다. reject 코드는 `QUOTA`·`CONTEXT_INVALIDATED`·`WRITE_FAILED`(쓰기), `READ_FAILED`·`CONTEXT_INVALIDATED`(load)로 계약 C2·C7과 일치한다(R5의 예외 경로 제외). `importMany`의 사전 검사는 메모리를 바꾸기 전에 돌고, `err.fit`은 0 이상 정수다. 실패한 load는 `loadPromise = null`로 캐시하지 않는다. 소비자 99-main은 load 실패 시 차단 없이 종료하고, block·unblock 실패 시 숨김·복구 없이 토스트만 띄운다. popup은 load 실패 시 `showFatal`(가져오기·내보내기 비활성), 해제·가져오기 실패 시 `storeErrorMessage` + 재렌더를 한다. 전부 계약 §4와 맞다.
- **#14(읽기 실패 후 덮어쓰기) 해소**: 쓰기 실행은 매번 `get(null)`부터 하고, 읽기가 실패하면 throw → 재시도/실패 처리로 가서 set을 부르지 않는다. load 전이나 load 실패 후의 block도 디스크를 다시 읽어 병합하므로 목록을 지우지 않는다.
- **#15(알림을 놓친 탭) 해소**: 쓰기는 pending op만 최신 디스크에 얹는다. 메모리 스냅샷을 쓰지 않으므로 stale 탭이 다른 곳의 해제를 되살리거나 차단을 지우지 않는다(같은 브라우저 안. 기기 간 한계는 R6-1).
- **#13(실패를 성공으로 보임) 해소**: 무한 500ms 재시도가 없어졌고, 최종 실패 시 reject + 되돌림 + 통지를 한다. QUOTA는 사전 검사로 set 전에 거른다(M1의 과대 거절 문제는 별도).
- **언로드 flush 부재 유지**: `pagehide`·`visibilitychange(hidden)` 쓰기가 없다. 새로 붙은 `pageshow(persisted)`·`visibilitychange(visible)`는 `scheduleRefresh`(읽기 전용)만 부른다. resurrection 통로가 다시 열리지 않았다.
- **하위 호환**: 구 `{nick, addedAt}`·문자열 청크·메타 없음·숫자 uid를 모두 읽는다. `canonRec`로 양쪽을 정규화해 비교하므로 키 순서 차이로 매번 전체를 재기록하던 구 결함이 사라졌다(두 번째 쓰기부터 1청크만 기록). 구버전도 새 키 정렬 레코드를 이름으로 읽으므로 정상이다(`r4_mixed.js`).
- **손상 데이터 관용**: 손상 청크는 건너뛰고 다음 쓰기에서 덮어쓴다(`chunkStr` 없음 → 차이로 판정). 중복 uid(이전 remove 실패 잔재)는 Map으로 합쳐지고 재기록으로 정리된다.
- **보안**: 오류 문구는 상수 문자열과 숫자(`e.fit`)만 조합하고, `toast.show`·`setIoStatus`는 textContent 경로다. 가져오기 닉은 64자로 자른다(`NICK_MAX`). 권한·host_permissions 무변경이다.
- **MV3**: `manifest.json`은 `version`만 0.8.0으로 바뀌었다. 저장 실패 시맨틱이 바뀌는 변경이라 마이너 범프가 적절하다. `node --check`는 `10-store.js`·`99-main.js`·`popup.js` 모두 통과했다.

## 미검토

- **실 브라우저 다중 컨텍스트**: 모든 동시성 판정은 코드 추적과 모의 저장소(키 정렬·JSONWriter 계산·비동기 onChanged 재현)에 근거한다. 실 Chrome·Firefox에서 (a) 고아 content script의 `CONTEXT_INVALIDATED` 토스트, (b) 팝업 해제 직후 종료(INFO-2), (c) 두 탭 동시 조작을 확인하지 않았다. 이 프로젝트의 전례(mock 거짓 PASS)를 감안하면 머지 전에 실 브라우저 확인을 권한다.
- **Firefox `storage.sync` 용량 계산 방식**: M1의 Firefox 과대 폭(항목당 약 4B)은 Firefox가 정수에 `.0`을 붙이지 않는다는 이해에 기반한다. 소스로 확인하지 않았으므로 "확인 필요"로 둔다. M1-①은 이 사실과 무관하게 잠금을 푼다.
- **Chromium JSONWriter의 `>`·`&` 비이스케이프**: 기억(`string_escape.cc` "Escape < to prevent script execution; escaping > is not necessary")에 근거한다. 어느 쪽이든 추정은 보수적이라 안전성에는 영향이 없고, M1의 과대 폭에만 영향을 준다.
- **모바일 실기기 성능(R4)**: Firefox Android에서 실측하지 않았다. 데스크톱 수치로 추정했다.

---

## 이전 PR #22(이슈 #16~#20) 리뷰 기록

> **재리뷰·QA 기록(2026-10-05, 커밋 전):** N1(강조의 그리스어·보조평면 회귀)·N2(주석)·N3(문서)·INFO-1(항목 클릭 시에도 사이트 메뉴 닫기) 반영 → QA 재검증 PASS(실마크업 jsdom 10/10·오숨김 19/19, 실 Firefox 156 레이아웃 36/30/39·강조 12/12). QA minor m1(좁은 창 탭 보기 가로 넘침 → `body.fmkb-tab-view { max-width: 100% }`)·m2(에이전트/스킬 TODO 예시 문구) 반영 후 실 Firefox 레이아웃 재확인.
> **PR #22 최종 독립 리뷰(2026-10-05, 푸시된 f7f0220 기준): MERGE, minor 3** — M1 `İ`+끝 `Σ` 조합에서 강조 누락 → 매칭은 전체 소문자, 위치 표만 코드포인트별 길이로 만들도록 수정 / M2 "모바일 목록 전용" 표현 잔존(계약·QA 에이전트·스킬 2곳·셀렉터 스킬 섹션 위치) → 정리 / M3 이 보고서에 재리뷰 기록 누락 → 이 단락 추가. 다섯 이슈(#16~#20) 모두 해결 확인(19개 캐시 페이지 jsdom 종단 검증).
