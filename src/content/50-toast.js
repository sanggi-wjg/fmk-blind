// FMK-Blind — 가벼운 토스트(차단/해제 피드백 + 실행 취소)
(function () {
  'use strict';

  window.FMKBlind = window.FMKBlind || {};
  const NS = window.FMKBlind;

  // 토스트 표시 시간(ms). 짧은 안내는 2초, 실행 취소 버튼이 있으면 누를 시간을, 오류면 긴 문구를 읽을 시간을 더 준다.
  const TOAST_DURATION_MS = 2000;
  const TOAST_ACTION_DURATION_MS = 5000;
  const TOAST_ERROR_DURATION_MS = 6000;
  // 실행 취소 토스트에 마우스를 올리거나 키보드 포커스가 들어오면 멈추고, 벗어나면 이 시간 뒤에 사라진다.
  const TOAST_RESUME_MS = 1500;
  // 실행 취소를 누른 뒤 이 시간 동안은 토스트 자리가 클릭을 받아 둔다 — 더블클릭의 두 번째 클릭이 아래 페이지
  // (링크 등)로 가지 않게. 곧이어 뜨는 결과 토스트(버튼 없음)와 무관하게 유지한다(content.css .fmkb-toast-absorb).
  const CLICK_ABSORB_MS = 500;

  let el = null;
  let liveEl = null; // 화면 낭독기용 상태 영역(보이는 문구는 aria-hidden)
  let msgEl = null;
  let actionEl = null;
  let action = null; // 현재 표시 중인 { label, onClick } | null
  let hideTimer = null;
  let absorbTimer = null;
  let liveTimer = null;
  let returnFocusTo = null; // 키보드로 실행 취소 버튼에 들어오기 전 포커스가 있던 요소
  let keyboardClick = false; // 지금 처리 중인 실행 취소가 키보드(Enter·Space)로 눌렸는지

  function clearHideTimer() {
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = null;
  }

  function hideNow() {
    clearHideTimer();
    action = null;
    if (!el) return;
    if (el.contains(document.activeElement)) releaseFocus();
    el.classList.remove('fmkb-toast-show');
  }

  // 실행 취소 버튼에 포커스가 남아 있으면 사라진 토스트에 갇히지 않게, 들어오기 전 자리로 돌려준다
  // (그 요소가 사라졌거나 포커스를 못 받으면 놓아 준다).
  function releaseFocus() {
    const back = returnFocusTo;
    returnFocusTo = null;
    if (back && back.isConnected && typeof back.focus === 'function') {
      try { back.focus({ preventScroll: true }); } catch (e) { /* 포커스 불가 요소 */ }
      // 키보드로 누른 경우에만(마우스로 누른 뒤 입력창에 바로 치는 키는 막지 않게)
      if (keyboardClick && document.activeElement === back) guardKeys(back);
    }
    if (el.contains(document.activeElement)) document.activeElement.blur();
  }

  // 포커스를 돌려준 직후 잠시 그 요소의 Enter·Space 를 막는다 — 실행 취소에서 Enter 를 두 번 누르면
  // 두 번째 Enter 가 돌아간 요소(예: 링크)를 실행하지 않게.
  function guardKeys(target) {
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    target.addEventListener('keydown', onKey, true);
    setTimeout(() => target.removeEventListener('keydown', onKey, true), CLICK_ABSORB_MS);
  }

  function absorbClicks() {
    el.classList.add('fmkb-toast-absorb');
    if (absorbTimer) clearTimeout(absorbTimer);
    absorbTimer = setTimeout(() => {
      absorbTimer = null;
      el.classList.remove('fmkb-toast-absorb');
    }, CLICK_ABSORB_MS);
  }

  // 숨겨진(visibility:hidden) 토스트의 상태 영역은 다시 뜰 때 '새로 생긴' 영역으로 잡혀 읽히지 않을 수 있어,
  // 늘 접근성 트리에 남는 별도 영역에 쓴다. 같은 문구도 다시 읽히도록 비웠다가 잠시 뒤 채운다.
  function announce(message) {
    liveEl.textContent = '';
    if (liveTimer) clearTimeout(liveTimer);
    liveTimer = setTimeout(() => {
      liveTimer = null;
      liveEl.textContent = message;
    }, 50);
  }

  // 실행 취소 토스트는 마우스를 올리거나 키보드 포커스가 들어오면 멈추고, 벗어나면 잠시 뒤 닫힌다.
  function pause() {
    if (action) clearHideTimer();
  }
  function resume() {
    if (action && el.classList.contains('fmkb-toast-show') && !isHovered() && !el.contains(document.activeElement)) {
      scheduleHide(TOAST_RESUME_MS);
    }
  }
  function isHovered() {
    try { return el.matches(':hover'); } catch (e) { return false; }
  }

  function scheduleHide(ms) {
    clearHideTimer();
    hideTimer = setTimeout(hideNow, ms);
  }

  // 메시지 칸·버튼은 처음 한 번만 만든다. 이후엔 textContent·hidden 만 바꾸므로
  // MutationObserver(35-observer)에 Element 삽입으로 잡히지 않는다.
  function ensureEl() {
    if (el && el.isConnected) return el;
    const stale = document.getElementById(NS.TOAST_ID); // 확장 재로드 전 인스턴스가 남긴 토스트
    if (stale) stale.remove();

    el = document.createElement('div');
    el.id = NS.TOAST_ID;
    liveEl = document.createElement('span');
    liveEl.className = 'fmkb-toast-live';
    liveEl.setAttribute('role', 'status'); // 화면 낭독기가 메시지를 읽도록(polite)
    msgEl = document.createElement('span');
    msgEl.id = 'fmkb-toast-msg';
    msgEl.className = 'fmkb-toast-msg';
    msgEl.setAttribute('aria-hidden', 'true'); // 낭독은 liveEl 이 맡는다(두 번 읽히지 않게)
    actionEl = document.createElement('button');
    actionEl.type = 'button';
    actionEl.className = 'fmkb-toast-action';
    actionEl.setAttribute('aria-describedby', msgEl.id); // 버튼만 들었을 때도 무엇을 취소하는지 알 수 있게
    actionEl.hidden = true;
    actionEl.addEventListener('click', (e) => {
      const act = action;
      absorbClicks();
      keyboardClick = e.detail === 0; // 키보드로 누른 click 은 detail 0
      hideNow(); // 먼저 닫아 연타로 두 번 실행되지 않게 한다
      keyboardClick = false;
      if (act) act.onClick();
    });
    el.addEventListener('mouseenter', pause);
    el.addEventListener('focusin', (e) => {
      if (!e.relatedTarget || !el.contains(e.relatedTarget)) returnFocusTo = e.relatedTarget || null;
      pause();
    });
    // mouseleave 시점엔 :hover 가 이미 풀려 있고, focusout 시점엔 activeElement 가 아직 바뀌기 전일 수 있어 다음 태스크에서 판단.
    el.addEventListener('mouseleave', () => setTimeout(resume, 0));
    el.addEventListener('focusout', () => setTimeout(resume, 0));
    el.appendChild(liveEl);
    el.appendChild(msgEl);
    el.appendChild(actionEl);
    document.body.appendChild(el);
    return el;
  }

  const toast = {
    // 짧게 메시지를 띄운다. 연속 호출 시 기존 토스트를 재사용(새 메시지가 이전 것을 대체).
    // opts.kind: 'error' 면 오류 색·긴 표시 시간.
    // opts.action: { label, onClick } 이면 버튼(예: 실행 취소)을 붙인다. 누르면 토스트를 닫고 onClick 실행.
    // message·label 은 textContent 로만 넣는다(닉네임은 외부 입력 — XSS 방지).
    show(message, opts) {
      if (!document.body) return; // 안전장치(document_end 에선 body 존재)
      opts = opts || {};
      const isError = opts.kind === 'error';
      const act = !isError && opts.action && typeof opts.action.onClick === 'function' ? opts.action : null;

      ensureEl();
      msgEl.textContent = message;
      announce(message);
      action = act;
      actionEl.hidden = !act;
      actionEl.textContent = act ? act.label : '';
      el.classList.toggle('fmkb-toast-error', isError);
      el.classList.toggle('fmkb-toast-has-action', !!act);

      // 강제 리플로우로 트랜지션 재생(연속 호출에도 애니메이션 보장).
      el.classList.remove('fmkb-toast-show');
      void el.offsetWidth;
      el.classList.add('fmkb-toast-show');

      scheduleHide(isError ? TOAST_ERROR_DURATION_MS : act ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS);
    },
  };

  NS.toast = toast;
})();
