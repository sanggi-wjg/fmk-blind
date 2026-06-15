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
```json
{
  "manifest_version": 3,
  "name": "FMK-Blind",
  "version": "0.1.0",
  "permissions": ["storage"],
  "action": { "default_popup": "src/popup/popup.html" },
  "content_scripts": [{
    "matches": ["https://www.fmkorea.com/*"],
    "js": [
      "src/store.js",
      "src/content/selectors.js",
      "src/content/hide.js",
      "src/content/contextmenu.js",
      "src/content/toast.js",
      "src/content/main.js"
    ],
    "css": ["src/content.css"],
    "run_at": "document_end"
  }]
}
```

## content script 로드·공유 규약
- content script는 격리 월드에서 실행되며, `js` 배열의 **나열 순서대로** 로드된다. 앞 파일이 만든 전역을 뒤 파일이 사용할 수 있다.
- 전역 네임스페이스는 `window.FMKBlind` 하나로 통일한다. 각 파일은 `window.FMKBlind = window.FMKBlind || {}` 후 자기 영역을 채운다(예: `FMKBlind.store`, `FMKBlind.selectors`, `FMKBlind.hide`).
- 진입점은 마지막 `main.js`: `await FMKBlind.store.load()` → 1회 스캔 → 우클릭 리스너 등록.
- `run_at`은 댓글이 초기 HTML에 포함되므로 `document_end`(또는 DOMContentLoaded 시점)면 충분.

## popup 구조
- `popup.html`에서 공유 라이브러리를 재사용: `<script src="../store.js"></script>` 후 `<script src="popup.js"></script>`.
- 팝업도 `chrome.storage.sync`에 직접 접근 가능(별도 권한 불필요).
- 프레임워크 없이 바닐라 HTML/CSS/JS.

## 파일 구조
```
manifest.json
src/
  store.js              # 공유 저장 계층(content+popup)
  content.css           # .fmkb-hidden, 메뉴/토스트 스타일
  content/
    selectors.js  hide.js  contextmenu.js  toast.js  main.js
  popup/
    popup.html  popup.js  popup.css
icons/
```

## 하지 말 것
- `host_permissions`, `scripting`, `tabs`, `activeTab` 추가(현 기능에 불필요).
- 백그라운드/서비스워커 추가(불필요한 복잡도).
- 번들러·프레임워크 도입(무빌드 원칙 위반).
