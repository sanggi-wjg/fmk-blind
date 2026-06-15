---
name: fmk-extension-orchestrator
description: "FMK-Blind 크롬 확장(에펨코리아 유저 블라인드)의 구현·검증·유지보수를 에이전트 팀으로 조율하는 오케스트레이터. 확장 구현/MVP 빌드, content script·저장 계층·팝업 작성, manifest 구성, fmkorea 셀렉터 수정, 차단 기능 작업 시 사용. 후속 작업도 처리: 재실행, 업데이트, 수정, 보완, 부분 재실행(예: '팝업만 다시', '저장 계층만 수정'), 이전 결과 개선, TODO 기능 추가(MutationObserver·모바일·압축·내보내기·onChanged·아이콘 에셋), 코드 리뷰. 에펨/펨코/fmkorea 차단 확장 관련 요청 시 반드시 이 스킬을 사용할 것."
---

# FMK-Extension Orchestrator

FMK-Blind 크롬 확장의 에이전트 팀을 조율하여, 동작하는 MV3 확장(content script + 저장 계층 + 팝업)을 구현·검증·유지보수하는 통합 스킬.

## 실행 모드: 에이전트 팀
저장 계층 `store.js`가 content script와 popup이 **공유하는 API 계약**이라, 두 구현자가 계약을 합의·협상해야 한다. 경계면 협업이 핵심이므로 팀 모드를 사용한다. 모든 에이전트는 `model: "opus"`.

> **커스텀 타입 폴백:** 팀원의 `agent_type`은 `.claude/agents/`의 커스텀 정의를 가리킨다. 환경이 TeamCreate에서 커스텀 타입을 받지 못하면, 해당 팀원을 `general-purpose`로 생성하고 prompt에 "`.claude/agents/{name}.md`를 Read해 역할·프로토콜을 따르라"를 넣어 동등하게 동작시킨다.

## 에이전트 구성

| 팀원 | 에이전트 타입 | 역할 | 스킬 | 출력 |
|------|-------------|------|------|------|
| storage-engineer | storage-engineer (custom) | sync 샤딩 저장 계층 + API 계약 | sync-sharded-storage | `src/store.js`, `.claude/workspace/store-api-contract.md` |
| content-engineer | content-engineer (custom) | content script: 추출·숨김·우클릭·토스트 | fmk-dom-selectors, chrome-mv3-extension | `src/content/*.js`, `src/content.css` |
| popup-engineer | popup-engineer (custom) | 팝업 UI(목록/검색/해제/인원수) | chrome-mv3-extension | `src/popup/*` |
| extension-qa | extension-qa (custom, 전체 도구·Bash 포함) | 경계면·manifest·셀렉터·샤딩 검증 | extension-qa-verification | `.claude/workspace/qa-report.md` |
| extension-reviewer | extension-reviewer (custom, 전체 도구·Bash 포함) | 코드 리뷰: 정확성·보안·견고성·유지보수성·MV3 베스트프랙티스(아이콘 포함)·성능 (QA와 상보) | extension-code-review | `.claude/workspace/review-report.md` |

## 참조 문서 (항상 먼저 읽기)
- `PLAN.md` — 확정된 설계 결정·검증된 DOM 사실·아키텍처
- `TODO.md` — 후속 작업 범위(무엇을 v1에서 제외했는가)

## 워크플로우

### Phase 0: 컨텍스트 확인 (후속 작업 지원)
1. `.claude/workspace/` 존재 여부, `src/`·`manifest.json` 존재 여부 확인.
2. 실행 모드 결정:
   - **초기 실행**: `src/`·`manifest.json` 없음 → Phase 1로.
   - **부분 재실행**: 사용자가 특정 모듈만 수정 요청(예: "팝업만", "저장 계층만", "셀렉터 수정") → 해당 팀원만 재호출, 다른 산출물은 보존. 이전 결과 경로를 프롬프트에 포함해 개선 반영 지시.
   - **새 실행/대규모 변경**: 기존 `.claude/workspace/`를 `.claude/workspace_{타임스탬프}/`로 이동 후 Phase 1.
   - **TODO 기능 추가**(MutationObserver·모바일·압축·내보내기·onChanged): 관련 팀원만 구성하고, 해당 기능을 TODO.md에서 제거(완료 반영)하도록 안내.

### Phase 1: 준비
1. `PLAN.md`·`TODO.md`를 읽어 범위·결정을 확정.
2. `.claude/workspace/` 생성(초기) 또는 보관 이동 후 재생성(새 실행).
3. 작업 범위를 TaskCreate용으로 정리.

### Phase 2: 팀 구성
1. 팀 생성:
   ```
   TeamCreate(team_name: "fmk-ext-team", members: [
     { name: "storage-engineer", agent_type: "storage-engineer", model: "opus",
       prompt: "sync-sharded-storage 스킬과 PLAN.md를 따라 src/store.js와 .claude/workspace/store-api-contract.md를 작성. 착수 즉시 API 계약을 공표하고 content/popup에 통지." },
     { name: "content-engineer", agent_type: "content-engineer", model: "opus",
       prompt: "fmk-dom-selectors·chrome-mv3-extension 스킬을 따라 content script와 content.css를 작성. store 계약 통지 후 그 API만 사용." },
     { name: "popup-engineer", agent_type: "popup-engineer", model: "opus",
       prompt: "chrome-mv3-extension 스킬을 따라 팝업(목록/검색/해제/인원수)을 작성. store 계약 통지 후 그 API만 사용." },
     { name: "extension-qa", agent_type: "extension-qa", model: "opus",
       prompt: "extension-qa-verification 스킬로 각 모듈 완성 직후 점진적으로 경계면·manifest·셀렉터·샤딩을 검증하고 .claude/workspace/qa-report.md에 증거와 함께 기록." }
   ])
   ```
2. 작업 등록(의존성 명시):
   ```
   TaskCreate(tasks: [
     { title: "store API 계약 확정", assignee: "storage-engineer" },
     { title: "store.js 구현", assignee: "storage-engineer", depends_on: ["store API 계약 확정"] },
     { title: "content script 구현", assignee: "content-engineer", depends_on: ["store API 계약 확정"] },
     { title: "popup 구현", assignee: "popup-engineer", depends_on: ["store API 계약 확정"] },
     { title: "manifest.json 작성", assignee: "content-engineer" },
     { title: "경계면·셀렉터·샤딩 검증", assignee: "extension-qa", depends_on: ["store.js 구현","content script 구현","popup 구현"] }
   ])
   ```

### Phase 3: 계약 우선 → 팬아웃 구현 → 점진 검증
**실행 방식:** 팀원 자체 조율
1. storage-engineer가 **먼저** `store-api-contract.md`를 확정하고 content·popup에 SendMessage로 통지(이 통지 전까지 두 엔지니어는 계약 의존 작업을 시작하지 않는다).
2. 계약 확정 후 content·popup이 병렬로 구현. 계약에 부족한 게 있으면 storage-engineer에 SendMessage로 요청 → 계약 갱신·재통지.
3. 각 모듈 완료 시 extension-qa에 검증 요청. QA는 경계면 불일치 발견 즉시 해당 엔지니어에게 직접 SendMessage(위치·증거 포함).
4. 리더는 TaskGet으로 진행률 모니터링, 막힌 팀원에 개입.

### Phase 4: 통합·최종 검증
1. 모든 작업 완료 대기(TaskGet).
2. 산출물이 프로젝트 루트의 올바른 경로(`manifest.json`, `src/**`)에 배치됐는지 확인.
3. extension-qa의 `qa-report.md`에서 blocker/major 잔여 항목을 확인 → 있으면 해당 팀원에 수정 재할당(최대 2회).
4. 최종 구조 검증: manifest의 `js` 목록과 실제 파일 일치, store 계약과 소비자 일치.
5. **코드 리뷰(extension-reviewer)**: QA의 통합 검증이 그린이면(또는 사용자가 리뷰를 명시 요청하면) extension-reviewer를 구성해 정확성·보안·견고성·유지보수성·MV3 베스트프랙티스·성능을 리뷰한다. `.claude/workspace/review-report.md`의 blocker/major는 해당 엔지니어에 수정 재할당(최대 2회). QA(통합/계약)와 리뷰어(코드 품질)는 상보적이며 중복 지적을 피한다.
6. 사용자에게 "크롬 → 확장 관리 → 압축해제된 확장 로드"로 수동 테스트하는 법을 안내.

### Phase 5: 정리
1. 팀원 종료(SendMessage) → TeamDelete.
2. `.claude/workspace/` 보존(계약·QA 리포트는 감사 추적용).
3. 결과 요약 + 남은 TODO 보고. 완료한 TODO 항목은 `TODO.md`에서 체크/제거.

## 데이터 흐름
```
storage-engineer → store-api-contract.md ──SendMessage──> content-engineer / popup-engineer
        │                                                         │
   src/store.js                                          src/content/* , src/popup/*
        └──────────────── extension-qa: 경계면 교차 비교 ─────────┘
                                   ↓
                          .claude/workspace/qa-report.md → 리더 통합 → 루트 배치
```

## 에러 핸들링
| 상황 | 전략 |
|------|------|
| storage 계약 지연으로 content/popup 대기 | 리더가 storage-engineer에 우선순위 지시(계약 먼저, 구현 나중) |
| QA가 경계면 불일치 발견 | 해당 엔지니어에 즉시 재할당, 1~2회 수정 루프, 미해결 시 리포트에 명시 |
| 팀원 1명 실패/중지 | 리더 감지 → 상태 확인 → 재시작 또는 작업 재할당 |
| fmkorea 접근 불가(QA 셀렉터 검증) | 정적 분석으로 대체, "라이브 미검증" 명시 |
| 팀원 과반 실패 | 사용자에게 알리고 진행 여부 확인 |

## 테스트 시나리오

### 정상 흐름
1. 사용자: "FMK-Blind MVP 구현해줘".
2. Phase 1: PLAN/TODO 확정, `.claude/workspace/` 생성.
3. Phase 2: 4인 팀 + 6작업 등록.
4. Phase 3: storage가 계약 공표 → content/popup 병렬 구현 → QA 점진 검증.
5. Phase 4: `manifest.json` + `src/**` 루트 배치, blocker 0 확인.
6. Phase 5: 팀 정리, 수동 로드 테스트 안내.
7. 예상 결과: 크롬에 압축해제 로드 시 fmkorea에서 작성자 우클릭 차단 → 해당 글/댓글 숨김 동작.

### 에러 흐름
1. Phase 3에서 content가 `store.block(uid)` 대신 존재하지 않는 `store.add(uid)`를 호출.
2. extension-qa가 경계면 교차 비교로 불일치 발견 → content-engineer에 증거와 함께 SendMessage.
3. content-engineer가 계약대로 `store.block`으로 수정 → QA 재검증 통과.
4. 최종 보고서에 "경계면 1건 수정 후 통과" 기록.
