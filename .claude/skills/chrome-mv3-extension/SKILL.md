---
name: chrome-mv3-extension
description: "FMK-Blind 크롬 확장의 Manifest V3 구조·규약. 무빌드(번들러 없음)·무백그라운드, content script 로드 순서와 전역 네임스페이스 공유, manifest 필드, 권한 최소화(storage), 팝업 구성을 정의. manifest·MV3·확장 구조·content_scripts·권한·팝업 구성 작업 시 반드시 이 스킬을 사용할 것."
---

# chrome-mv3-extension — FMK-Blind MV3 구조 규약

이 프로젝트의 크롬 확장 구조 표준. **무빌드·무백그라운드·최소 권한** 원칙을 따른다.

## 핵심 원칙
- **Manifest V3** (현재 크롬 필수).
- **빌드 단계 없음** — 번들러/트랜스파일 없이 평문 ES JS 파일을 그대로 로드. 이유: 1인 프로젝트의 단순성·디버깅 용이성.
- **백그라운드 서비스워커 없음** — 우클릭 메뉴를 content script에서 자체 구현(네이티브 `chrome.contextMenus` 미사용)하고, `chrome.storage.sync`는 content script·popup이 직접 접근. background가 필요 없다.
- **최소 권한** — `permissions: ["storage"]`만. `content_scripts.matches`가 주입 권한을 부여하므로 **`host_permissions` 불필요**(외부 fetch·동적 주입을 하지 않음).

## manifest.json 골격
실제 `manifest.json`이 단일 출처다. 아래는 구조 요약(아이콘·`key` 값 생략).
```json
{
  "manifest_version": 3,
  "name": "FMK-Blind",
  "version": "x.y.z",
  "key": "…",                       // Chrome 확장 ID 고정(기기 간 sync 공유). Firefox는 무시
  "permissions": ["storage"],
  "browser_specific_settings": { "gecko": { "id": "…", "strict_min_version": "115.0",
    "data_collection_permissions": { "required": ["none"] } } },   // Firefox 전용. Chrome은 무시
  "action": { "default_popup": "src/popup/popup.html", "default_icon": { "16": "…", "32": "…", "48": "…", "128": "…" } },
  "icons": { "16": "…", "32": "…", "48": "…", "128": "…" },
  "content_scripts": [{
    "matches": ["https://www.fmkorea.com/*", "https://m.fmkorea.com/*"],
    "js": [
      "src/content/00-namespace.js",
      "src/content/10-store.js",
      "src/content/20-selectors.js",
      "src/content/30-hide.js",
      "src/content/35-observer.js",
      "src/content/40-contextmenu.js",
      "src/content/50-toast.js",
      "src/content/99-main.js"
    ],
    "css": ["src/content.css"],
    "run_at": "document_end"
  }]
}
```
- 파일명 숫자 접두사 = 로드 순서. 새 모듈은 의존 관계에 맞는 번호로 끼워 넣고 `js` 배열에도 같은 순서로 추가한다.
- 한 manifest를 Chrome·Firefox가 함께 읽는다 — 각 브라우저는 상대 전용 키(`key` / `browser_specific_settings`)를 무시한다(배포 절차는 `DEPLOY.md`).

## content script 로드·공유 규약
- content script는 격리 월드에서 실행되며, `js` 배열의 **나열 순서대로** 로드된다. 앞 파일이 만든 전역을 뒤 파일이 사용할 수 있다.
- 전역 네임스페이스는 `window.FMKBlind` 하나로 통일한다. `00-namespace.js`가 먼저 만들지만, **각 파일도 `window.FMKBlind = window.FMKBlind || {}`로 병합 초기화한 뒤** 자기 영역을 채운다(예: `FMKBlind.store`, `FMKBlind.selectors`, `FMKBlind.hide`). 특히 `10-store.js`는 popup이 `00-namespace.js` 없이 단독 로드하므로 이 병합 초기화가 필수다.
- 진입점은 마지막 `99-main.js`: `await FMKBlind.store.load()` → 전체 스캔(UID + 닉네임 폴백) → MutationObserver 시작 → 우클릭 리스너 등록 → `store.onChange` 구독.
- `run_at`은 `document_end`. 이후 지연 렌더·AJAX로 붙는 노드는 `35-observer.js`가 처리한다.

## popup 구조
- `popup.html`에서 공유 라이브러리를 재사용: `<script src="../content/10-store.js"></script>` 후 `<script src="popup.js"></script>`(사본 금지 — 단일 출처).
- 팝업도 `chrome.storage.sync`에 직접 접근 가능(별도 권한 불필요).
- 프레임워크 없이 바닐라 HTML/CSS/JS.

## 파일 구조
```
manifest.json
src/
  content.css           # .fmkb-hidden, 메뉴/토스트 스타일, @media (pointer: coarse) 터치 타깃
  content/
    00-namespace.js     # window.FMKBlind 생성
    10-store.js         # 공유 저장 계층(content+popup) — storage-engineer 소유
    20-selectors.js  30-hide.js  35-observer.js  40-contextmenu.js  50-toast.js  99-main.js
  popup/
    popup.html  popup.js  popup.css
icons/                  # icon16/32/48/128.png
```

## 팝업 크로스 브라우저 주의 (Firefox)
- **Firefox 팝업에서 파일 선택 창·컬러 피커 등 네이티브 대화상자를 열면 팝업이 포커스를 잃고 즉시 닫힌다**(Mozilla Bug 1292701). `change` 이벤트 전에 페이지가 사라져 후속 처리(예: 가져오기 저장)가 실행되지 않는다(이슈 #9). Chrome 팝업은 열린 채 유지돼 증상이 없다.
- 규약: 팝업에서 파일 선택이 필요하면 Firefox(`location.protocol === 'moz-extension:'`)에선 **같은 popup.html을 일반 탭(`?view=tab`)으로 열어** 거기서 처리한다(`chrome.tabs.create` — `tabs` 권한 불필요). 탭에서 파일 창을 자동으로 띄우지 말 것(사용자 클릭 필요) — 안내만 표시.

## 하지 말 것
- `host_permissions`, `scripting`, `tabs`, `activeTab` 추가(현 기능에 불필요). `chrome.tabs.create`는 `tabs` 권한 없이 동작하므로 탭 열기만을 위해 권한을 추가하지 말 것.
- 백그라운드/서비스워커 추가(불필요한 복잡도).
- 번들러·프레임워크 도입(무빌드 원칙 위반).
