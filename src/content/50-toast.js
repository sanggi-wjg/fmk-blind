// FMK-Blind — 가벼운 토스트(차단/해제 피드백)
(function () {
  'use strict';

  window.FMKBlind = window.FMKBlind || {};
  const NS = window.FMKBlind;

  // 토스트 표시 지속 시간(ms). 이 시간 뒤 fmkb-toast-show 클래스를 제거해 사라지게 한다.
  const TOAST_DURATION_MS = 2000;

  let hideTimer = null;

  const toast = {
    // 짧게 메시지를 띄운다. 연속 호출 시 기존 토스트를 재사용.
    show(message) {
      if (!document.body) return; // 안전장치(document_end 에선 body 존재)

      let el = document.getElementById(NS.TOAST_ID);
      if (!el) {
        el = document.createElement('div');
        el.id = NS.TOAST_ID;
        document.body.appendChild(el);
      }
      el.textContent = message;

      // 강제 리플로우로 트랜지션 재생(연속 호출에도 애니메이션 보장).
      el.classList.remove('fmkb-toast-show');
      void el.offsetWidth;
      el.classList.add('fmkb-toast-show');

      if (hideTimer) clearTimeout(hideTimer);
      hideTimer = setTimeout(() => {
        el.classList.remove('fmkb-toast-show');
        hideTimer = null;
      }, TOAST_DURATION_MS);
    },
  };

  NS.toast = toast;
})();
