// FMK-Blind — 작성자 앵커 우클릭 커스텀 메뉴(차단/해제 토글)
// store 비의존: 차단 상태 조회/동작은 install(handlers) 로 주입받는다.
// 작성자 앵커 위에서만 preventDefault — 그 외 영역은 브라우저 기본 우클릭 메뉴 유지.
// 키보드: 작성자 링크에 포커스를 두고 메뉴 키(Windows·Linux 는 Shift+F10 도)로 연다. 메뉴는 role=menu,
//         첫 항목에 포커스, ↑↓·Home·End 로 이동, Enter·Space 로 선택, Esc·Tab 으로 닫고 원래 포커스로 돌아간다.
(function () {
  'use strict';

  window.FMKBlind = window.FMKBlind || {};
  const NS = window.FMKBlind;

  let menuEl = null;
  let returnFocusTo = null; // 메뉴를 열기 전 포커스가 있던 요소(닫을 때 돌려준다)
  let keyboardActivation = false; // 지금 처리 중인 항목 선택이 Enter·Space 로 눌렸는지

  // 메뉴를 닫는다. 포커스가 아직 메뉴 안에 있으면(Esc·Tab·항목 선택·스크롤·창 전환 등) 열기 전 자리로 돌려준다
  // — 그대로 두면 사라진 메뉴와 함께 포커스가 body 로 떨어져 다음 Tab 이 페이지 맨 앞에서 시작한다.
  // 바깥을 클릭해 닫힌 경우엔 mousedown 이 이미 포커스를 옮겼으므로 해당 없음.
  // guard: 키보드로 항목을 고른 경우 — 돌려준 요소(작성자 링크)의 Enter·Space 를 잠시 막아, 연달아 누른 키가
  // 링크(사이트 회원 메뉴)를 실행하지 않게 한다(50-toast 의 실행 취소 키 가드와 같은 이유).
  function closeMenu(guard) {
    if (!menuEl) return;
    const hadFocus = menuEl.contains(document.activeElement);
    menuEl.remove();
    menuEl = null;
    const back = returnFocusTo;
    returnFocusTo = null;
    if (hadFocus && back && back.isConnected && typeof back.focus === 'function') {
      try { back.focus({ preventScroll: true }); } catch (e) { /* 포커스 불가 요소 */ }
      // 입력칸으로 돌아간 경우엔 막지 않는다(사용자가 바로 이어서 치는 글자·줄바꿈을 삼키지 않게).
      if (guard === true && document.activeElement === back && !isTextInput(back)) guardKeys(back);
    }
  }

  function isTextInput(el) {
    return el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName);
  }

  const KEY_GUARD_MS = 500;
  function guardKeys(target) {
    const onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    target.addEventListener('keydown', onKey, true);
    setTimeout(() => target.removeEventListener('keydown', onKey, true), KEY_GUARD_MS);
  }

  function menuItems() {
    return menuEl ? Array.from(menuEl.querySelectorAll('.fmkb-menu-item')) : [];
  }

  function onMenuKeydown(e) {
    const rows = menuItems();
    if (!rows.length) return;
    const i = rows.indexOf(document.activeElement);
    switch (e.key) {
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (i !== -1) {
          keyboardActivation = true;
          rows[i].click();
          keyboardActivation = false;
        }
        break;
      case 'ArrowDown':
        e.preventDefault();
        rows[(i + 1) % rows.length].focus();
        break;
      case 'ArrowUp':
        e.preventDefault();
        rows[(i - 1 + rows.length) % rows.length].focus();
        break;
      case 'Home':
        e.preventDefault();
        rows[0].focus();
        break;
      case 'End':
        e.preventDefault();
        rows[rows.length - 1].focus();
        break;
      case 'PageUp':
      case 'PageDown':
        e.preventDefault(); // 페이지가 스크롤되며 메뉴가 닫히지 않게(메뉴가 열린 동안은 무시)
        break;
      case 'Escape':
        e.preventDefault();
        e.stopPropagation(); // 사이트의 Esc 처리와 겹치지 않게
        closeMenu();
        break;
      case 'Tab':
        // 브라우저 메뉴처럼 Tab 은 메뉴를 닫는다. 기본 Tab 이동은 돌려받은 요소에서 이어진다.
        closeMenu();
        break;
      default:
        break;
    }
  }

  function buildMenu(items) {
    const menu = document.createElement('div');
    menu.id = NS.MENU_ID;
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', 'FMK-Blind');
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'fmkb-menu-item';
      row.setAttribute('role', 'menuitem');
      row.tabIndex = -1;
      row.textContent = item.label;
      row.addEventListener('click', (e) => {
        e.stopPropagation(); // 바깥 click → closeMenu 와 충돌 방지
        closeMenu(keyboardActivation);
        closeSitePopupMenu(); // 사이트 회원 메뉴가 비동기로 뒤늦게 다시 뜬 경우까지 닫는다
        item.onClick();
      });
      menu.appendChild(row);
    });
    menu.addEventListener('keydown', onMenuKeydown);
    return menu;
  }

  // fmkorea(XE) 자체 회원 메뉴. 닉네임 왼쪽 클릭으로 열린 상태에서 우리 메뉴를 열면 겹쳐 남으므로 닫는다
  // (사이트는 document click 으로 닫는데, 우리 메뉴 항목 클릭은 전파를 막아 닫히지 않았다 — 이슈 #19).
  function closeSitePopupMenu() {
    const area = document.getElementById('popup_menu_area');
    if (area) area.style.display = 'none';
  }

  // position:fixed 기준이므로 clientX/clientY(뷰포트 좌표)를 그대로 사용.
  function openMenuAt(x, y, items) {
    closeMenu();
    closeSitePopupMenu();
    const active = document.activeElement;
    returnFocusTo = active && active !== document.body ? active : null;
    menuEl = buildMenu(items);
    menuEl.style.left = x + 'px';
    menuEl.style.top = y + 'px';
    document.body.appendChild(menuEl);

    // 뷰포트 경계 넘침 보정.
    const rect = menuEl.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
      menuEl.style.left = Math.max(0, window.innerWidth - rect.width - 4) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
      menuEl.style.top = Math.max(0, window.innerHeight - rect.height - 4) + 'px';
    }

    // 키보드로 바로 고를 수 있게 첫 항목에 포커스(마우스로 열었을 땐 :focus-visible 이 아니라 강조되지 않음).
    const first = menuEl.querySelector('.fmkb-menu-item');
    if (first) first.focus({ preventScroll: true });
  }

  const contextmenu = {
    // handlers: {
    //   isBlocked(uid) -> boolean,
    //   onBlock(uid, nick),    // 차단 동작(보통 store.block + 즉시 숨김 + 토스트)
    //   onUnblock(uid, nick),  // 해제 동작(보통 store.unblock + 즉시 복구 + 토스트)
    // }
    install(handlers) {
      document.addEventListener('contextmenu', (e) => {
        const anchor = e.target.closest
          ? e.target.closest(NS.AUTHOR_ANCHOR_SELECTOR)
          : null;

        // 작성자 앵커 밖 → 커스텀 메뉴 닫고 브라우저 기본 메뉴 유지(preventDefault 안 함).
        if (!anchor) {
          closeMenu();
          return;
        }

        const uid = NS.selectors.extractUid(anchor);
        // UID 없는 작성자(탈퇴/비회원/익명) → 차단 불가, 기본 메뉴 유지, 메뉴 미표시.
        if (!uid) {
          closeMenu();
          return;
        }

        // 여기서부터 작성자 앵커 위 → 기본 메뉴 차단하고 커스텀 메뉴 표시.
        e.preventDefault();

        const nick = NS.selectors.getNick(anchor);
        const label = nick || uid;
        const items = handlers.isBlocked(uid)
          ? [{ label: '차단 해제 — ' + label, onClick: () => handlers.onUnblock(uid, nick) }]
          : [{ label: '차단 — ' + label, onClick: () => handlers.onBlock(uid, nick) }];

        // 마우스·롱프레스는 누른 자리에 연다. 키보드(메뉴 키·Shift+F10)로 열면 브라우저에 따라 좌표가
        // 0,0 처럼 앵커 밖일 수 있으므로, 그때는 앵커 바로 아래에 붙인다.
        let x = e.clientX;
        let y = e.clientY;
        const r = anchor.getBoundingClientRect();
        const inAnchor = x >= r.left - 2 && x <= r.right + 2 && y >= r.top - 2 && y <= r.bottom + 2;
        if (!inAnchor) {
          x = r.left;
          y = r.bottom;
        }
        openMenuAt(x, y, items);
      });

      // 메뉴 바깥 상호작용 시 닫기(포커스가 메뉴 안에 남아 있었으면 closeMenu 가 원래 자리로 돌려준다).
      document.addEventListener('click', () => closeMenu());
      document.addEventListener('scroll', () => closeMenu(), true);
      window.addEventListener('blur', () => closeMenu());
      // 메뉴 밖에 포커스가 있을 때의 Esc(메뉴 안의 Esc 는 onMenuKeydown 이 처리).
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
      });
    },
  };

  NS.contextmenu = contextmenu;
})();
