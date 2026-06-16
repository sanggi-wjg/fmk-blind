// FMK-Blind — content script 진입점(로드 순서상 가장 마지막)
// store(10) + 모든 모듈(00·20·30·40·50) 로드 이후 실행.
// 흐름: await store.load() → 1회 스캔 → 우클릭 리스너 등록.
// 이 파일이 store 를 호출하는 유일한 배선부다(다른 모듈은 store 비의존).
(function () {
  'use strict';

  const NS = window.FMKBlind || {};

  async function main() {
    const store = NS.store;

    // 안전 실패: store 미탑재 시 차단 없이 페이지 정상 노출(에러로 페이지 깨지지 않게).
    if (!store || typeof store.load !== 'function') {
      console.warn('[FMK-Blind] store 미탑재 — 차단 없이 정상 노출');
      return;
    }

    try {
      await store.load(); // 최초 1회. 계약상 실패해도 내부는 빈 맵으로 안전 동작.
    } catch (e) {
      console.warn('[FMK-Blind] store.load 실패 — 차단 없이 정상 노출', e);
      return;
    }

    // 1) 최초 로드 1회 스캔 — 차단 대상 컨테이너 숨김.
    NS.hide.scan((uid) => store.isBlocked(uid));

    // 2) 우클릭 커스텀 메뉴 배선 — 차단/해제 동작을 store + 현재 탭 즉시 반영으로 연결.
    NS.contextmenu.install({
      isBlocked: (uid) => store.isBlocked(uid),

      // 계약 C3: block resolve 직후 메모리 반영 → 그 다음 숨김 처리.
      async onBlock(uid, nick) {
        await store.block(uid, nick);
        NS.hide.hideByUid(uid); // 현재 탭 즉시 숨김 반영
        NS.toast.show((nick || uid) + ' 님을 차단했습니다');
      },

      async onUnblock(uid, nick) {
        await store.unblock(uid);
        NS.hide.unhideByUid(uid); // 현재 탭 즉시 복구
        NS.toast.show((nick || uid) + ' 님을 차단 해제했습니다');
      },
    });

    // 3) 라이브 동기(C9) — 팝업/다른 탭/다른 기기의 변경을 새로고침 없이 현재 탭에 반영.
    //    store.onChange는 외부 sync 변경 시에만 diff를 통지한다(자기-쓰기 에코는 빈 diff → 미호출).
    //    added → 현재 DOM에서 해당 작성자 컨테이너 숨김, removed → 복구. 둘 다 30-hide의 기존 함수 재사용.
    //    범위: 이미 로드된 DOM만 즉시 반영. AJAX/무한스크롤로 새로 삽입되는 DOM은 별개 TODO(MutationObserver).
    if (typeof store.onChange === 'function') {
      store.onChange((d) => {
        d.added.forEach((uid) => NS.hide.hideByUid(uid));
        d.removed.forEach((uid) => NS.hide.unhideByUid(uid));
      });
    }
  }

  // run_at:document_end 라 보통 즉시 실행되지만, 방어적으로 DOMContentLoaded 를 보장한다.
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', main, { once: true });
  } else {
    main();
  }
})();
