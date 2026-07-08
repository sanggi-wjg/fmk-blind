# FMK-Blind

에펨코리아(PC, `www.fmkorea.com`) 특정 유저를 블라인드 처리하는 브라우저 확장(Manifest V3).
차단한 작성자의 글·댓글을 완전히 숨긴다. **Chrome·Firefox 모두 지원**한다.

> 배포(스토어 등록·서명 등) 절차는 [`DEPLOY.md`](DEPLOY.md) 참고. 아래는 로컬 설치·사용 안내다.

## 설치

### Chrome (압축해제 로드)

1. `chrome://extensions` 접속
2. 우측 상단 **개발자 모드** 켜기
3. **압축해제된 확장 프로그램 로드** → 이 저장소 루트 폴더 선택

### Firefox (임시 로드)

1. `about:debugging#/runtime/this-firefox` 접속
2. **임시 부가 기능 로드** → 이 저장소의 `manifest.json` 선택

> 임시 로드는 **Firefox를 재시작하면 사라진다**(테스트용). 영구 설치는 Mozilla 서명이 필요하다 → [`DEPLOY.md`](DEPLOY.md).

## 사용법

- **차단/해제**: fmkorea에서 작성자 닉네임을 **우클릭** → 커스텀 메뉴에서 차단 또는 해제
- **목록 관리**: 툴바의 확장 아이콘 클릭 → 팝업에서 차단 목록·인원수 확인, 검색, 차단 해제
- 차단/해제는 **열려 있는 다른 fmkorea 탭에도 새로고침 없이 즉시 반영**된다(`chrome.storage.onChanged`).

## 권한·저장

- 권한은 **`storage`** 하나뿐 — 외부로 데이터를 전송하지 않는다.
- 차단 목록은 `chrome.storage.sync`에 저장되어 로그인된 같은 브라우저 기기 간 동기화된다.

## 크로스 브라우저 (Chrome · Firefox 동시 사용)

- **코드 하나로 양쪽에서 동작한다.** 무빌드 + `chrome.*` API만 사용하고, 각 브라우저가 상대 전용 manifest 키(Chrome의 `key` / Firefox의 `browser_specific_settings`)를 무시하므로 **단일 `manifest.json`이 둘 다에서 로드**된다.
- ⚠️ **차단 목록은 브라우저별로 분리된다.** Chrome은 구글 계정, Firefox는 Firefox 계정으로 각각 동기화되며 **Chrome ↔ Firefox 사이엔 목록이 공유되지 않는다**. 두 브라우저 목록을 합치려면 내보내기/가져오기(후속 과제 — `TODO.md`)가 필요하다.

## 참고·한계

- **PC 전용**(`www.fmkorea.com`). 모바일(`m.fmkorea.com`)은 미지원.
- 페이지 로드 시점에 1회 스캔해 숨기고, 이후 **AJAX·무한스크롤·더보기로 새로 불러온 글·댓글**도 `MutationObserver` 증분 처리로 새로고침 없이 즉시 숨긴다.
- **여러 컴퓨터에서 사용**: 확장 자체(코드)는 기기마다 따로 로드해야 한다(압축해제/임시 로드 확장은 코드가 동기화되지 않음). 단 확장 ID가 고정돼 있어(Chrome=manifest `key` → `mnnofigckdchafggopgbjanmjmcbjppc`, Firefox=`browser_specific_settings.gecko.id` → `raynor-back@proton.me`) 어느 기기에서나 ID가 동일하므로, **차단 목록은 같은 계정 + 브라우저 동기화면 자동으로 기기 간 공유**된다(`chrome.storage.sync`). 단 위처럼 Chrome↔Firefox 간에는 공유되지 않는다.

## 라이선스

[MIT](LICENSE) © 2026 sanggi-wjg
