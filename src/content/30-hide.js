// FMK-Blind — 숨김 적용(클래스 토글) + 1회 스캔
// store 비의존: 차단 여부 판정은 호출자가 isBlocked 함수로 주입한다(보통 store.isBlocked).
(function () {
  'use strict';

  window.FMKBlind = window.FMKBlind || {};
  const NS = window.FMKBlind;

  const hide = {
    // 앵커 1개 처리: 컨테이너에 .fmkb-hidden + data-fmkb-uid 표식. 숨겼으면 true.
    // 인라인 style 금지 — content.css 의 클래스로만 숨긴다.
    hideForAnchor(anchor, uid) {
      const container = NS.selectors.findContainer(anchor);
      if (!container) return false;
      container.classList.add(NS.HIDDEN_CLASS);
      container.dataset[NS.UID_DATA_KEY] = uid;
      return true;
    },

    // 특정 uid 로 숨겼던 컨테이너를 즉시 복구(우클릭 해제 시 현재 탭 반영용).
    unhideByUid(uid) {
      const sel = '.' + NS.HIDDEN_CLASS + '[' + NS.UID_DATA_ATTR + '="' + uid + '"]';
      document.querySelectorAll(sel).forEach((el) => {
        el.classList.remove(NS.HIDDEN_CLASS);
        delete el.dataset[NS.UID_DATA_KEY];
      });
    },

    // 우클릭으로 막 차단한 uid 를 현재 탭에서 즉시 숨김 반영.
    // 해당 uid 의 작성자 앵커를 다시 훑어 컨테이너를 숨긴다. 숨긴 수 반환.
    hideByUid(uid) {
      let hidden = 0;
      document.querySelectorAll(NS.AUTHOR_ANCHOR_SELECTOR).forEach((anchor) => {
        if (NS.selectors.extractUid(anchor) !== uid) return;
        if (hide.hideForAnchor(anchor, uid)) hidden += 1;
      });
      return hidden;
    },

    // 최초 로드 1회 전체 스캔. isBlocked: (uid) => boolean 주입.
    // 숨긴 컨테이너 수 반환.
    scan(isBlocked) {
      let hidden = 0;
      document.querySelectorAll(NS.AUTHOR_ANCHOR_SELECTOR).forEach((anchor) => {
        const uid = NS.selectors.extractUid(anchor);
        if (!uid) return; // UID 없는 작성자(탈퇴/비회원) → 조용히 스킵
        if (!isBlocked(uid)) return; // 차단 대상 아님
        if (hide.hideForAnchor(anchor, uid)) hidden += 1;
      });
      return hidden;
    },
  };

  NS.hide = hide;
})();
