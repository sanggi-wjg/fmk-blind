// FMK-Blind — content script 전역 네임스페이스 & 상수
// 로드 순서상 store.js 와 다른 content 모듈보다 앞/뒤 어디에 와도 안전하도록
// 항상 "병합" 방식으로 초기화한다(기존 FMKBlind.store 등을 덮어쓰지 않음).
(function () {
  'use strict';

  window.FMKBlind = window.FMKBlind || {};
  const NS = window.FMKBlind;

  // 숨김 표식 클래스: content.css 의 `.fmkb-hidden { display:none !important }` 와 짝.
  NS.HIDDEN_CLASS = 'fmkb-hidden';
  // dataset 키(카멜케이스). DOM 상으로는 `data-fmkb-uid` 로 직렬화된다.
  NS.UID_DATA_KEY = 'fmkbUid';
  // querySelector 용 속성 셀렉터(해제 시 복구 대상 탐색).
  NS.UID_DATA_ATTR = 'data-fmkb-uid';

  // 작성자 앵커 선택자(보드 목록 / 게시글 본문 / 댓글 공통).
  NS.AUTHOR_ANCHOR_SELECTOR = 'a[class*="member_"]';
  // class 문자열에서 숫자 UID 캡처. `member_plate` 는 숫자가 아니므로 자동 제외된다.
  NS.UID_REGEX = /member_(\d+)/;

  // 커스텀 UI 요소 id(중복 생성 방지 + content.css 스타일 타깃).
  NS.MENU_ID = 'fmkb-context-menu';
  NS.TOAST_ID = 'fmkb-toast';
})();
