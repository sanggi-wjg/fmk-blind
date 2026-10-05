---
name: fmk-extension-orchestrator
description: "FMK-Blind 크롬 확장(에펨코리아 유저 블라인드, PC·모바일, Chrome·Firefox)의 구현·검증·유지보수를 에이전트 팀으로 조율하는 오케스트레이터. 확장 구현, content script·저장 계층·팝업 작성, manifest 구성, fmkorea 셀렉터 수정, 차단 기능 작업, 버그 수정(이슈 대응) 시 사용. 후속 작업도 처리: 재실행, 업데이트, 수정, 보완, 부분 재실행(예: '팝업만 다시', '저장 계층만 수정', '셀렉터만 고쳐'), 이전 결과 개선, TODO 기능 추가(저장 압축·차단 메모·자기 차단 가드·글 진입 안내문·인용 처리·PC 통합목록 닉네임 폴백), 코드 리뷰·QA 재검증. 에펨/펨코/fmkorea 차단 확장 관련 요청 시 반드시 이 스킬을 사용할 것. 기능 단위는 **최신 main 기준 브랜치 생성 → 구현·검증 → PR 생성**까지를 1 작업 단위로 처리한다(머지는 사용자 몫). 하네스 자체 점검·재구성은 harness 스킬 담당."
---

# FMK-Extension Orchestrator

FMK-Blind 확장의 에이전트 팀을 조율하여, 동작하는 MV3 확장(content script + 저장 계층 + 팝업)을 구현·검증·유지보수하는 통합 스킬.

## 작업 단위: 브랜치 → 구현 → PR
기능 개발 1건은 **하나의 git 작업 단위**다: 최신 `main`에서 브랜치 따기(**Phase 0.5**) → 구현·검증(Phase 1~5) → 커밋·푸시·PR 생성(**Phase 6**). **PR에서 정지하고 머지는 사용자에게 맡긴다**(머지 시 `.github/workflows/release.yml`이 manifest 버전 기준으로 릴리즈를 자동 생성). 순수 질문/조회나 사용자가 현재 브랜치 작업을 명시한 경우는 git 단계를 생략한다.

## 실행 모드: 혼합 (변경 범위로 선택)
Phase 0에서 변경 범위를 보고 둘 중 하나를 고른다.

| 모드 | 언제 | 구성 |
|------|------|------|
| **팀 모드** (지속형 에이전트 협업) | store 계약(`10-store.js` API·불변식)을 바꾸거나, 2개 이상 모듈(store+content/popup)에 걸친 기능 | 이름 있는 `Agent(name:)`를 한 메시지에서 병렬 실행 + `TaskCreate`/`TaskUpdate` 공유 작업 목록 + `SendMessage`. 계약 협상이 핵심이라 대화 맥락 유지가 필요 |
| **직접 모드** (리더 구현 + 서브에이전트 검증) | 단일 모듈 버그 수정·셀렉터 보정·팝업 국소 수정·문서 | 리더(메인)가 직접 구현 → `extension-qa`·`extension-reviewer`를 서브에이전트로 **한 메시지에서 병렬** 호출(결과만 받으면 됨) |

판단이 애매하면 직접 모드로 시작하고, 구현 중 계약 변경이 필요해지면 팀 모드로 승격한다(storage-engineer를 이름 붙여 실행).

**모델:** 모든 에이전트 `opus`. 다섯 역할 모두 코드 생성 또는 교차 검증·리뷰(깊은 추론, 범위 명확)라 v2 기준상 opus가 맞다. 장기 자율 계획은 리더(메인)가 맡으므로 하위에 fable은 쓰지 않는다.

> **커스텀 타입 폴백:** `subagent_type`은 `.claude/agents/`의 커스텀 정의를 가리킨다. 환경이 커스텀 타입을 받지 못하면 `general-purpose`로 실행하고 prompt에 "`.claude/agents/{name}.md`를 Read해 역할·프로토콜을 따르라"를 넣어 동등하게 동작시킨다.

## 에이전트 구성

| 이름 | subagent_type | 역할 | 스킬 | 출력 |
|------|-------------|------|------|------|
| storage-engineer | storage-engineer | sync 샤딩 저장 계층 + API 계약 | sync-sharded-storage | `src/content/10-store.js`, `.claude/workspace/store-api-contract.md` |
| content-engineer | content-engineer | content script: 추출·숨김·observer·닉 폴백·우클릭·토스트, manifest 소유 | fmk-dom-selectors, chrome-mv3-extension | `src/content/*.js`(10-store 제외), `src/content.css`, `manifest.json` |
| popup-engineer | popup-engineer | 팝업(목록/검색/해제/인원수/내보내기·가져오기, Firefox 탭 보기) | chrome-mv3-extension | `src/popup/*` |
| extension-qa | extension-qa | 경계면·manifest·셀렉터·샤딩 검증 | extension-qa-verification | `.claude/workspace/qa-report.md` |
| extension-reviewer | extension-reviewer | 코드 리뷰: 정확성·보안·견고성·유지보수성·MV3·성능 (QA와 상보) | extension-code-review | `.claude/workspace/review-report.md` |

## 참조 문서 (항상 먼저 읽기)
- `PLAN.md` — 확정된 설계 결정·검증된 DOM 사실·아키텍처
- `TODO.md` — 남은 작업 범위
- `.claude/workspace/store-api-contract.md` — store API의 **최신·권위 계약**(스킬과 어긋나면 계약이 우선)

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)
1. `.claude/workspace/`, `src/`, `manifest.json` 존재 여부 확인.
2. 실행 유형 결정:
   - **부분 재실행**: 특정 모듈만 수정(예: "팝업만", "셀렉터 수정") → 직접 모드 또는 해당 에이전트만 실행. 다른 산출물은 보존하고 이전 결과 경로를 프롬프트에 넣어 개선만 반영.
   - **TODO 기능 추가**: 관련 에이전트만 구성하고, 완료 시 `TODO.md`에서 체크.
   - **대규모 재작성**: 기존 `.claude/workspace/`를 `.claude/workspace_{YYYYMMDD}/`로 옮긴 뒤 Phase 1.
3. 위 표로 **팀 모드/직접 모드**를 정한다.

### Phase 0.5: 브랜치 준비 (기능 단위의 시작)
코드를 생산하는 기능/수정 작업은 구현 착수 **전에** 브랜치를 딴다.
1. **선검사**: `git status`. 이번 작업과 무관한 미커밋 변경이 있으면 사용자에게 방침 확인(커밋/스태시/그대로 두고 스테이징에서 제외).
2. **최신 main 기준**: `git fetch origin` → `git switch main` → `git pull --ff-only`. stale main에서 브랜치 따는 사고 방지.
3. **브랜치 생성**: `git switch -c <type>/<slug>` — `feat/`(기능)·`fix/`(버그)·`chore/`(빌드·문서·메타). slug는 kebab-case 요약(예: `fix/mobile-list-nick-hide`).
4. **생략 조건**: 사용자가 현재 브랜치 작업을 명시했거나 순수 질문/조회인 경우. 부분 재실행도 브랜치로 묶는다.

### Phase 1: 준비
1. `PLAN.md`·`TODO.md`·계약을 읽어 범위·결정을 확정.
2. `.claude/workspace/`가 없으면 생성.
3. 작업 목록을 정리(팀 모드면 TaskCreate용).

### Phase 2: 실행 구성

**실행 모드: 팀 모드일 때 (지속형 에이전트)**
1. 필요한 에이전트만 **한 메시지에서 병렬** 실행한다(전원 필수 아님):
   ```
   Agent(name: "storage-engineer", subagent_type: "storage-engineer", model: "opus",
     prompt: "sync-sharded-storage 스킬·PLAN.md·계약을 따라 src/content/10-store.js와 .claude/workspace/store-api-contract.md를 갱신. 계약 변경분을 먼저 확정하고 content-engineer/popup-engineer에 SendMessage로 통지. 첫 보고에 실제 사용 가능한 도구 목록을 적을 것.")
   Agent(name: "content-engineer", subagent_type: "content-engineer", model: "opus",
     prompt: "fmk-dom-selectors·chrome-mv3-extension 스킬을 따라 content script를 수정. storage-engineer의 계약 통지 후 그 API만 사용. ...")
   Agent(name: "popup-engineer", subagent_type: "popup-engineer", model: "opus", prompt: "...")
   ```
2. 공유 작업 목록에 의존성과 함께 등록(`TaskCreate`): 계약 확정 → (store 구현 ‖ content 구현 ‖ popup 구현) → QA 검증 → 리뷰.
3. QA·리뷰는 구현 모듈이 나오는 대로 Phase 3에서 투입한다(처음부터 띄워 대기시키지 않는다).

**실행 모드: 직접 모드일 때 (리더 구현)**
1. 리더가 관련 스킬(fmk-dom-selectors·chrome-mv3-extension·sync-sharded-storage)을 로드해 직접 구현한다.
2. Phase 4에서 QA·리뷰 서브에이전트를 부른다.

### Phase 3: 계약 우선 → 구현 → 점진 검증 (팀 모드)
1. storage-engineer가 **먼저** 계약 변경을 확정하고 소비자에게 `SendMessage`로 통지한다. 통지 전에는 content·popup이 계약 의존 작업을 시작하지 않는다.
2. **계약 동결**: 통지 이후 계약 변경은 storage-engineer가 재통지할 때만 허용한다(완료 보고 뒤 다른 에이전트 질문에 답하다 계약을 조용히 고치는 것 방지).
3. content·popup이 병렬 구현. 계약에 부족한 게 있으면 storage-engineer에 `SendMessage`로 요청 → 계약 갱신·재통지.
4. 모듈이 완료되면 리더가 `extension-qa`를 이름 붙여 실행(`Agent(name: "extension-qa", ...)`)해 해당 모듈부터 점진 검증한다. QA는 불일치를 발견하면 해당 엔지니어에게 직접 `SendMessage`(위치·증거 포함).
5. 리더는 작업 목록으로 진행률을 보고, 막힌 에이전트에 `SendMessage`로 개입한다.

### Phase 4: 통합·최종 검증
1. 산출물이 올바른 경로(`manifest.json`, `src/**`)에 있는지 확인.
2. **QA·리뷰**: 팀 모드면 이미 실행 중인 extension-qa의 `qa-report.md`를 확인하고, 그린이면 extension-reviewer를 실행. 직접 모드면 `extension-qa`와 `extension-reviewer`를 **한 메시지에서 병렬 서브에이전트**로 호출(변경 파일 목록과 이전 리포트 경로를 prompt에 포함).
3. blocker/major는 해당 엔지니어(직접 모드면 리더)가 수정 → 재검증(최대 2회).
4. 최종 구조 검증: manifest `js` 목록과 실제 파일 일치, store 계약과 소비자(content·popup) 호출 일치.
5. **실브라우저 게이트**: 저장 계층·다중 컨텍스트·팝업 생명주기·브라우저별 차이가 걸린 변경은 mock/jsdom PASS로 단정하지 않는다(거짓 PASS 전례). 가능하면 실 Firefox 헤드리스(Selenium, 임시 애드온)나 실 Chrome으로 직접 검증하고, 불가하면 사용자에게 실브라우저 확인 절차를 안내하고 PR 체크리스트에 미결로 남긴다. 모바일 런타임은 사용자 실기기 게이트.

### Phase 5: 정리
1. 팀 모드 에이전트는 작업이 끝나면 스스로 종료한다. 남아 있는 백그라운드 작업만 `TaskStop`으로 정리한다.
2. `.claude/workspace/` 보존(계약·QA·리뷰 리포트는 감사 추적용).
3. 완료한 TODO 항목은 `TODO.md`에서 체크, 결과 요약 + 남은 TODO 보고.

### Phase 6: 브랜치 PR 마감 (기능 단위의 끝)
Phase 0.5에서 브랜치를 땄다면, **커밋 전에 반드시 리뷰 게이트를 통과**한 뒤 진행한다.
1. **리뷰 게이트 (커밋 전 필수 · 생략 금지)**: 어떤 변경도 **리뷰 없이 커밋하지 않는다**.
   - Phase 4 리뷰로 충족. Phase 4를 거치지 않은 직접 변경(manifest·설정·문서 등)은 **여기서** 리뷰한다.
   - 리뷰 주체(비례 적용): **실질 코드 변경 → `extension-reviewer` 에이전트**(독립 시각, 특히 store·다중 컨텍스트·보안). **사소·기계적 변경(한 줄 설정·문서·주석) → 오케스트레이터 인라인 리뷰**.
   - 판정: **blocker/major가 있으면 커밋하지 않는다** → 수정 후 재리뷰하거나, 사용자에게 보고해 **커밋 여부를 사용자가 결정**하게 한다. minor는 기록 후 진행 가능.
   - **문서 드리프트도 리뷰 대상**: 이번 변경이 스킬·에이전트 정의·계약(`store-api-contract.md`)·`PLAN.md`·`README.md`·`TODO.md` 기술과 어긋나면 같은 PR에서 갱신한다(드리프트 0).
   - 리뷰 verdict(이슈 목록 포함)를 **사용자에게 보고**한 뒤 다음 단계로.
2. **검증 게이트**: Phase 4의 실브라우저 게이트 결과를 확인한다. 미결이면 PR 본문 체크리스트에 "실브라우저 검증"을 미결로 명시.
3. **버전 범프 정책**: 릴리즈가 필요한 변경이면 `manifest.json`의 `version`을 올린다(semver: 기능=minor, 수정=patch). `release.yml`이 버전 기준으로 릴리즈를 만들므로 **안 올리면 머지해도 릴리즈가 안 생긴다**. 문서/하네스만 바뀌면 생략.
4. **커밋**: 이번 작업 파일만 스테이징(무관한 미커밋 변경·zip·`settings.local.json` 제외 확인) → 한국어 요약 + 본문(변경·검증 결과). 메시지 끝에는 **세션이 지시하는 attribution(`Co-Authored-By`) 라인을 그대로** 붙인다(모델명 하드코딩 금지 — 모델이 바뀌면 드리프트).
5. **푸시**: `git push -u origin <branch>`.
6. **PR 생성**: `gh pr create --base main --head <branch>` + 템플릿 본문 — `## 요약` / `## 변경` / `## 검증`(리뷰·QA·테스트·실브라우저) / `## 머지 전 확인`(버전 범프, 실기기·실브라우저 미결 항목). 이슈 대응이면 `Closes #N`. 본문 끝에 세션이 지시하는 PR attribution 라인.
7. **PR에서 정지** — 자동 머지 금지(머지는 사용자 몫). 머지 시 `release.yml`이 `v{version}` 릴리즈 + zip을 만든다.
8. PR URL을 사용자에게 보고.

## 데이터 흐름
```
storage-engineer → store-api-contract.md ──SendMessage──> content-engineer / popup-engineer
        │                                                         │
 src/content/10-store.js                         src/content/* , src/popup/* , manifest.json
        └──────────── extension-qa: 경계면 교차 비교 ─────────────┘
                                   ↓
              .claude/workspace/qa-report.md → extension-reviewer → review-report.md
                                   ↓
                         리더 통합 → Phase 6 PR
```

## 에러 핸들링
| 상황 | 전략 |
|------|------|
| storage 계약 지연으로 content/popup 대기 | 리더가 storage-engineer에 `SendMessage`로 우선순위 지시(계약 먼저, 구현 나중) |
| QA/리뷰가 blocker·major 발견 | 해당 엔지니어에 재할당, 최대 2회 수정 루프, 미해결 시 리포트·사용자 보고에 명시 |
| 에이전트 무응답·스톨 | `SendMessage`로 상태 확인·재지시 1회 → 그래도 실패하면 같은 subagent_type을 새 이름으로 실행하고 필요한 맥락(변경 파일·계약·이전 리포트 경로)을 prompt로 넘김 |
| 재실행해도 같은 실패(사용량 한도·인증 만료·권한 거부·소켓/인프라 오류 반복) | 재시도하지 않는다. 부분 산출물을 열어 실제 진행 범위를 확인하고, 리더가 직접 모드로 전환해 마무리. 에이전트의 판단(왜 그렇게 했는지)은 추측해 채우지 않고 리포트에 "에이전트 미완, 리더 대행"으로 기록 |
| fmkorea 접근 불가(셀렉터 라이브 검증) | 정적 분석·저장된 실마크업으로 대체, "라이브 미검증" 명시 |
| 에이전트 과반 실패 | 사용자에게 알리고 진행 여부 확인 |

## 테스트 시나리오

### 정상 흐름 A — 팀 모드 (계약 변경 기능: 저장 압축 Q5)
1. 사용자: "차단 목록 압축 저장 추가해줘".
2. Phase 0: store 계약·저장 레이아웃 변경 → 팀 모드. Phase 0.5: `git switch -c feat/storage-compression`.
3. Phase 2: storage-engineer·content-engineer·popup-engineer를 한 메시지에서 병렬 실행, 작업 목록 등록.
4. Phase 3: storage-engineer가 `bl_meta.ver` 상향·마이그레이션 계약 확정 → 통지 → 소비자 영향 확인 → 모듈별 QA.
5. Phase 4: QA 그린 → reviewer MERGE, 실브라우저 게이트(마이그레이션은 실 브라우저 필수).
6. Phase 6: 버전 범프(minor) → 커밋 → 푸시 → PR → URL 보고, 머지는 사용자.

### 정상 흐름 B — 직접 모드 (단일 모듈 수정: 셀렉터 보정)
1. 사용자: "PC 베스트 목록에서도 닉네임으로 숨겨줘".
2. Phase 0: content만 변경, 계약 무변경 → 직접 모드. `git switch -c feat/pc-best-nick-fallback`.
3. 리더가 fmk-dom-selectors 스킬로 실측 후 `20-selectors.js`·`30-hide.js` 수정.
4. Phase 4: extension-qa·extension-reviewer를 한 메시지에서 병렬 서브에이전트 호출 → 그린.
5. Phase 6: 버전 범프(minor) → PR.

### 에러 흐름
1. 팀 모드 Phase 3에서 content-engineer가 계약에 없는 `store.add(uid)`를 호출.
2. extension-qa가 경계면 교차 비교로 불일치 발견 → content-engineer에 증거와 함께 `SendMessage`.
3. content-engineer가 계약대로 `store.block`으로 수정 → QA 재검증 통과.
4. 도중 popup-engineer가 소켓 오류로 두 번 멈춤 → 재시도하지 않고 리더가 직접 모드로 popup 수정 마무리, 리포트에 "에이전트 미완, 리더 대행" 기록.
5. 최종 보고에 "경계면 1건 수정 후 통과, popup 리더 대행" 기록.
