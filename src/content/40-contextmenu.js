// FMK-Blind — 작성자 앵커 우클릭 커스텀 메뉴(차단/해제 토글)
// store 비의존: 차단 상태 조회/동작은 install(handlers) 로 주입받는다.
// 작성자 앵커 위에서만 preventDefault — 그 외 영역은 브라우저 기본 우클릭 메뉴 유지.
(function () {
  'use strict';

  window.FMKBlind = window.FMKBlind || {};
  const NS = window.FMKBlind;

  let menuEl = null;

  function closeMenu() {
    if (menuEl) {
      menuEl.remove();
      menuEl = null;
    }
  }

  function buildMenu(items) {
    const menu = document.createElement('div');
    menu.id = NS.MENU_ID;
    items.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'fmkb-menu-item';
      row.textContent = item.label;
      row.addEventListener('click', (e) => {
        e.stopPropagation(); // 바깥 click → closeMenu 와 충돌 방지
        closeMenu();
        item.onClick();
      });
      menu.appendChild(row);
    });
    return menu;
  }

  // position:fixed 기준이므로 clientX/clientY(뷰포트 좌표)를 그대로 사용.
  function openMenuAt(x, y, items) {
    closeMenu();
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

        openMenuAt(e.clientX, e.clientY, items);
      });

      // 메뉴 바깥 상호작용 시 닫기.
      document.addEventListener('click', closeMenu);
      document.addEventListener('scroll', closeMenu, true);
      window.addEventListener('blur', closeMenu);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeMenu();
      });
    },
  };

  NS.contextmenu = contextmenu;
})();
