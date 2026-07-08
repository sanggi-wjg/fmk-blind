# FMK-Blind

에펨코리아(PC `www.fmkorea.com` + 모바일 `m.fmkorea.com`) 특정 유저를 블라인드 처리하는 브라우저 확장(Manifest V3).
차단한 작성자의 글·댓글을 완전히 숨긴다. **Chrome·Firefox 모두 지원**하며, 모바일은 Firefox for Android로 커버한다(아래 *모바일* 참고).

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
- **내보내기/가져오기**: 팝업 하단의 **내보내기**로 차단 목록을 JSON 파일(`fmk-blind-blocklist-YYYY-MM-DD.json`)로 저장하고, **가져오기**로 그 파일을 다시 불러온다.
  - 용도: 목록 **백업**, 다른 기기·**브라우저 간 이관**(위 *크로스 브라우저*의 Chrome↔Firefox 목록 분리를 이 경로로 해소).
  - 가져오기는 **병합**이다 — 새 UID만 추가하고, 이미 있는 UID는 그대로 두며(중복 건너뜀), 형식이 잘못된 항목은 무시한다. 결과가 "N명 추가 · M명 중복 · K건 무시"로 표시된다.
- 차단/해제는 **열려 있는 다른 fmkorea 탭에도 새로고침 없이 즉시 반영**된다(`chrome.storage.onChanged`).

## 권한·저장

- 권한은 **`storage`** 하나뿐 — 외부로 데이터를 전송하지 않는다.
- 차단 목록은 `chrome.storage.sync`에 저장되어 로그인된 같은 브라우저 기기 간 동기화된다.

## 크로스 브라우저 (Chrome · Firefox 동시 사용)

- **코드 하나로 양쪽에서 동작한다.** 무빌드 + `chrome.*` API만 사용하고, 각 브라우저가 상대 전용 manifest 키(Chrome의 `key` / Firefox의 `browser_specific_settings`)를 무시하므로 **단일 `manifest.json`이 둘 다에서 로드**된다.
- ⚠️ **차단 목록은 브라우저별로 분리된다.** Chrome은 구글 계정, Firefox는 Firefox 계정으로 각각 동기화되며 **Chrome ↔ Firefox 사이엔 목록이 공유되지 않는다**. 두 브라우저 목록을 합치려면 팝업의 **내보내기/가져오기**(위 *사용법* 참고)로 한쪽에서 내보내 다른 쪽에 가져오면 된다.

## 모바일 (`m.fmkorea.com`)

- **지원 범위**: 모바일 **게시글·댓글**은 PC와 동일한 작성자 앵커(`member_{UID}`)를 써서 그대로 커버된다(별도 셀렉터 없이 `m.fmkorea.com`을 매치에 추가). 모바일 **목록**은 작성자에 UID·링크가 없어 범위 밖(PC 홈/베스트 통합목록과 동일).
- **설치(Firefox Android)**: 모바일 크롬은 확장을 지원하지 않으므로 **Firefox for Android**를 쓴다.
  - **Beta/Nightly**: 서명된 `.xpi` 파일을 직접 설치할 수 있다(자가 배포 xpi를 브라우저에서 열기). 정식 Release는 AMO에 `listed`로 올린 확장만 설치 가능.
  - **개발/디버깅**: PC에서 USB로 연결해 `web-ext run --target=firefox-android`로 로드. 자세한 경로는 [`DEPLOY.md`](DEPLOY.md).
- 데스크톱 UA로 `m.` 주소에 접속하면 `www`로 리다이렉트되므로, `m.` 매치는 사실상 모바일 기기 전용이다.
- 롱프레스로 작성자 우클릭 메뉴(차단/해제)가 뜨고, 터치 기기에서는 메뉴·토스트가 손가락 터치에 맞게 커진다.

> ⚠️ 모바일 실동작(지연 렌더 댓글 숨김·롱프레스 메뉴·팝업)은 **실기기 검증 단계**에 있다. PC(`www`)는 검증 완료.

## 참고·한계
- 페이지 로드 시점에 1회 스캔해 숨기고, 이후 **AJAX·무한스크롤·더보기로 새로 불러온 글·댓글**도 `MutationObserver` 증분 처리로 새로고침 없이 즉시 숨긴다.
- **여러 컴퓨터에서 사용**: 확장 자체(코드)는 기기마다 따로 로드해야 한다(압축해제/임시 로드 확장은 코드가 동기화되지 않음). 단 확장 ID가 고정돼 있어(Chrome=manifest `key` → `mnnofigckdchafggopgbjanmjmcbjppc`, Firefox=`browser_specific_settings.gecko.id` → `raynor-back@proton.me`) 어느 기기에서나 ID가 동일하므로, **차단 목록은 같은 계정 + 브라우저 동기화면 자동으로 기기 간 공유**된다(`chrome.storage.sync`). 단 위처럼 Chrome↔Firefox 간에는 공유되지 않는다.

## 라이선스

[MIT](LICENSE) © 2026 sanggi-wjg
