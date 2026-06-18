# 배포 가이드 (Chrome · Firefox)

FMK-Blind를 각 브라우저에 설치·배포하는 절차를 정리한다. 일상 설치·사용법은 [`README.md`](README.md) 참고.

이 확장은 **무빌드**(번들러 없음) + `chrome.*` API만 사용해, **저장소 폴더 그대로가 배포 단위**다. 같은 코드/`manifest.json` 하나가 Chrome·Firefox 양쪽에서 동작한다(§4 참고).

---

## 0. 공통 — 패키징

- 배포 zip에 포함: `manifest.json`, `src/`, `icons/`, `src/content.css` 등 **확장 동작에 필요한 파일만**.
- 제외 권장: `.git/`, `.claude/`(Chrome이 `_`/예약 폴더로 오인하지 않도록 확장 루트에서 분리됨), `*.md`(`README`·`PLAN`·`TODO`·`DEPLOY`·`CLAUDE`), 이전 빌드 `*.zip`.
- **자동화**: `main`에 머지되면 `.github/workflows/release.yml`이 `manifest.json`의 `version` 기준으로 `v{version}` GitHub 릴리즈 + zip을 자동 생성한다. 이 zip을 Chrome 스토어/압축해제 로드, Firefox AMO/서명의 소스로 쓸 수 있다.
- 새 배포 전 **버전 범프**: `manifest.json`의 `version`을 올린다(SemVer). Chrome·Firefox 모두 동일 버전 문자열을 읽는다.

---

## 1. Chrome

### 1-1. 개발/개인용 — 압축해제 로드 (서명 불필요)

1. `chrome://extensions`
2. **개발자 모드** 켜기
3. **압축해제된 확장 프로그램 로드** → 저장소 루트 폴더 선택

manifest의 고정 `key` 덕분에 확장 ID가 **`mnnofigckdchafggopgbjanmjmcbjppc`** 로 어느 기기에서나 동일 → 같은 구글 계정·동기화면 차단 목록(`chrome.storage.sync`) 공유.

### 1-2. Chrome 웹 스토어 등록 (공개 배포)

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) 접속 (개발자 등록비 **$5 1회**)
2. §0의 zip 업로드 → 스토어 등록 정보(설명·아이콘·스크린샷) 작성 → 제출 → 검수
3. 게시되면 사용자는 스토어에서 설치, 자동 업데이트

> ⚠️ 스토어 게시 시 확장 ID는 **스토어가 부여**한다. manifest `key`는 압축해제 ID 고정용이므로 스토어 빌드에선 제거해도 무방하다(있어도 무시됨).

---

## 2. Firefox

> Firefox는 **영구 설치 시 Mozilla 서명이 필수**다(임시 로드 제외). 정식 빌드/베타에선 서명 없는 확장을 영구 설치할 수 없다.

### 2-1. 임시 로드 (테스트, 서명 불필요)

1. `about:debugging#/runtime/this-firefox`
2. **임시 부가 기능 로드** → 저장소의 `manifest.json` 선택

재시작하면 사라진다. 빠른 동작 확인용.

### 2-2. 서명된 XPI 자가 배포 (`unlisted`) — ⭐ 개인 영구 설치 권장

스토어에 공개하지 않고 서명만 받아, 받은 `.xpi`를 직접 설치/배포한다. Chrome의 "압축해제 + ID 고정" 워크플로에 가장 가까운 Firefox 대응 경로.

1. [AMO 개발자 허브 → API 자격증명](https://addons.mozilla.org/developers/addon/api/key/)에서 키 발급 (JWT **issuer** + **secret**)
2. 서명 요청:
   ```bash
   npx web-ext sign \
     --channel=unlisted \
     --api-key="$AMO_JWT_ISSUER" \
     --api-secret="$AMO_JWT_SECRET"
   ```
3. 받은 `.xpi`를 `about:addons`에 드래그&드롭(또는 톱니 → "파일에서 부가 기능 설치")으로 영구 설치

`browser_specific_settings.gecko.id` = **`raynor-back@proton.me`** 로 확장 ID가 고정 → 같은 Firefox 계정·동기화면 차단 목록(`storage.sync`) 공유.

### 2-3. AMO 공개 등록 (`listed`)

1. `npx web-ext sign --channel=listed ...` 또는 [AMO](https://addons.mozilla.org/developers/)에 §0 zip 직접 업로드
2. 등록 정보 작성 → 제출 → 검수(사람 리뷰 포함) → 게시, 자동 업데이트

> ⚠️ 제출 전 manifest의 **`key`(Chrome 전용)는 제거 권장**. Firefox는 `key`를 무시하지만 `web-ext lint`가 경고를 낸다(§4).

---

## 3. 도구: `web-ext` (Mozilla 공식 CLI)

```bash
npx web-ext lint        # manifest·코드 검증 (key 경고 등 확인)
npx web-ext run         # Firefox를 띄워 확장 로드 (개발 핫리로드)
npx web-ext build       # 배포용 zip 생성 (web-ext-artifacts/)
npx web-ext sign --channel=unlisted|listed --api-key=… --api-secret=…  # AMO 서명
```

전역 설치: `npm i -g web-ext`. `--source-dir`로 폴더, `--ignore-files`로 제외 파일 지정 가능.

---

## 4. manifest 키 — 크로스 브라우저 동작 원리

| 키 | 역할 | Chrome | Firefox |
|----|------|:---:|:---:|
| `key` | 압축해제 확장 ID 고정 | 읽음 ✅ | 무시(`web-ext lint` 경고) |
| `browser_specific_settings.gecko` | 확장 ID(`id`)·최소 버전(`strict_min_version`) | 무시(경고 로그) | 읽음 ✅ |

각 브라우저가 **상대 전용 키를 무시**하므로 **단일 `manifest.json`이 양쪽에서 로드**된다. 개발·개인용(압축해제/임시 로드)은 손댈 것이 없다. **AMO `listed` 제출 시에만** lint 경고 제거를 위해 `key`를 빼는 게 깔끔하다(Firefox 전용 빌드로 분기).

현재 설정: `strict_min_version: "115.0"`(Firefox 115 ESR 이상).

---

## 5. 차단 목록 동기화 범위

| | 동기화 계정 | 공유 범위 |
|---|---|---|
| Chrome `storage.sync` | 구글 계정 | Chrome 기기 간 |
| Firefox `storage.sync` | Firefox 계정(로그인 + 동기화 켜짐) | Firefox 기기 간 |

- **Chrome ↔ Firefox 간에는 목록이 공유되지 않는다**(저장소가 완전히 분리). 동시 사용은 가능하나 각 브라우저가 자기 목록을 따로 관리한다.
- 두 브라우저 목록 이전/병합은 **내보내기/가져오기**(후속 과제 — [`TODO.md`](TODO.md)) 필요.

---

## 6. 버전·릴리즈 자동화

1. `manifest.json`의 `version` 범프
2. 기능 브랜치 → PR → `main` 머지(머지는 사용자 몫)
3. 머지 시 `.github/workflows/release.yml`이 `v{version}` GitHub 릴리즈 + zip 자동 생성
4. 그 zip을 Chrome 스토어 업로드 / Firefox `web-ext sign` 소스로 사용
