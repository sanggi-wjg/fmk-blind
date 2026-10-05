// FMK-Blind — content script 진입점(로드 순서상 가장 마지막)
// store(10) + 모든 모듈(00·20·30·35·40·50) 로드 이후 실행.
// 흐름: await store.load() → 1회 스캔 → 증분 관찰(MutationObserver) → 우클릭 리스너 등록.
// 이 파일이 store 를 호출하는 유일한 배선부다(다른 모듈은 store 비의존).
(function () {
  'use strict';

  const NS = window.FMKBlind || {};

  // store 쓰기 실패(reject err.code) → 사용자 안내 문구.
  function saveFailMessage(e) {
    const code = e && e.code;
    if (code === 'CONTEXT_INVALIDATED') return '확장 프로그램이 업데이트되어 저장하지 못했습니다 — 페이지를 새로고침한 뒤 다시 시도하세요';
    if (code === 'QUOTA') return '저장 공간이 가득 차 저장하지 못했습니다 — 팝업에서 목록을 정리해 주세요';
    if (code === 'SCHEMA_NEWER') return '다른 기기의 더 새 버전이 저장한 목록이라 저장하지 않았습니다 — 확장을 업데이트해 주세요';
    return '저장하지 못했습니다 — 잠시 후 다시 시도하세요';
  }

  // 목록 읽기에 실패하면 그 탭은 차단 없이 남는다. 탭으로 돌아오거나 5초 뒤에 다시 시도한다(최대 3번
  // — 예: Firefox 시작 직후 storage.sync 일시 오류, 최종 리뷰 #23 M5). 성공하면 그때부터 정상 동작.
  const MAX_LOAD_RETRIES = 3;
  let started = false;
  let retryArmed = false;
  let loadRetries = 0;
  function armLoadRetry() {
    if (retryArmed || loadRetries >= MAX_LOAD_RETRIES) return;
    retryArmed = true;
    loadRetries += 1;
    const retry = () => {
      document.removeEventListener('visibilitychange', onVisible);
      clearTimeout(timer);
      retryArmed = false;
      main();
    };
    const onVisible = () => { if (document.visibilityState === 'visible') retry(); };
    const timer = setTimeout(retry, 5000);
    document.addEventListener('visibilitychange', onVisible);
  }

  async function main() {
    if (started) return;
    const store = NS.store;

    // 안전 실패: store 미탑재 시 차단 없이 페이지 정상 노출(에러로 페이지 깨지지 않게).
    if (!store || typeof store.load !== 'function') {
      console.warn('[FMK-Blind] store 미탑재 — 차단 없이 정상 노출');
      return;
    }

    try {
      await store.load(); // 최초 1회. 읽기는 store가 1회 재시도하고, 그래도 실패하면 reject(READ_FAILED 등).
    } catch (e) {
      console.warn('[FMK-Blind] store.load 실패 — 차단 없이 정상 노출, 잠시 뒤 다시 시도', e);
      if (!e || e.code !== 'CONTEXT_INVALIDATED') armLoadRetry();
      return;
    }
    if (started) return; // 재시도와 겹친 경우
    started = true;

    // 닉네임 → uid 색인(UID 없는 목록 — 모바일 목록·PC 위젯형 목록 — 의 닉네임 폴백용). store.list() 의 저장 닉네임으로 구성하고
    // 차단 목록이 바뀌면(차단/해제/onChange) null 로 무효화 → 다음 조회 때 재구성한다.
    // 한계: 차단 후 닉네임을 바꾼 유저는 놓치고, 그 옛 닉네임을 쓰는 다른 유저는 목록에서 숨겨질 수 있다.
    //       외부에서 닉네임만 바뀐 변경(키셋 동일)은 onChange 가 통지하지 않아 새로고침 전까지 옛 색인을 쓴다.
    let nickIndex = null;
    function uidForNick(nick) {
      if (!nickIndex) {
        nickIndex = new Map();
        store.list().forEach((it) => {
          const n = NS.selectors.normalizeNick(it.nick);
          if (n && !nickIndex.has(n)) nickIndex.set(n, it.uid);
        });
      }
      const uid = nickIndex.get(nick);
      return uid && store.isBlocked(uid) ? uid : null;
    }

    // 1) 최초 로드 1회 스캔 — 차단 대상 컨테이너 숨김(+ UID 없는 목록 닉네임 폴백).
    NS.hide.scan((uid) => store.isBlocked(uid), uidForNick);

    // 2) 증분 처리(MutationObserver) — 최초 스캔 이후 AJAX 댓글/더보기/무한스크롤/새 댓글 삽입 등으로
    //    새로 삽입되는 노드에도 차단(숨김)을 즉시 적용. 판정은 삽입 시점의 최신 store.isBlocked 를 참조한다.
    //    여기 도달했다는 건 store.load 성공(안전 실패 경로를 통과)했다는 뜻 → observer 설치 안전.
    if (NS.observer && typeof NS.observer.install === 'function') {
      NS.observer.install({ isBlocked: (uid) => store.isBlocked(uid), uidForNick });
    }

    // 3) 우클릭 커스텀 메뉴 배선 — 차단/해제 동작을 store + 현재 탭 즉시 반영으로 연결.
    NS.contextmenu.install({
      isBlocked: (uid) => store.isBlocked(uid),

      // 계약 C3: resolve = sync 저장 완료 → 그 다음 숨김 처리. reject면 store가 변경을 되돌렸으므로
      // 숨기지 않고 실패 안내만 한다(저장 실패를 성공으로 보이지 않게 — 이슈 #13).
      async onBlock(uid, nick) {
        try {
          await store.block(uid, nick);
        } catch (e) {
          console.warn('[FMK-Blind] 차단 저장 실패', e);
          NS.toast.show(saveFailMessage(e));
          return;
        }
        // 저장을 기다리는 사이 같은 유저를 바로 해제했으면 그 결과가 이긴다(숨기지 않는다).
        if (!store.isBlocked(uid)) return;
        nickIndex = null;
        NS.hide.hideByUid(uid); // 현재 탭 즉시 숨김 반영
        NS.hide.scanNickRows(document, uidForNick);
        NS.toast.show((nick || uid) + ' 님을 차단했습니다');
      },

      async onUnblock(uid, nick) {
        try {
          await store.unblock(uid);
        } catch (e) {
          console.warn('[FMK-Blind] 차단 해제 저장 실패', e);
          NS.toast.show(saveFailMessage(e));
          return;
        }
        if (store.isBlocked(uid)) return; // 그사이 다시 차단했으면 그 결과가 이긴다
        nickIndex = null;
        NS.hide.unhideByUid(uid); // 현재 탭 즉시 복구
        // 같은 닉네임의 다른 차단 uid 가 남아 있으면 방금 복구된 목록 행을 그 uid 로 다시 숨긴다.
        NS.hide.scanNickRows(document, uidForNick);
        NS.toast.show((nick || uid) + ' 님을 차단 해제했습니다');
      },
    });

    // 4) 라이브 동기(C9) — 팝업/다른 탭/다른 기기의 변경을 새로고침 없이 현재 탭에 반영.
    //    store.onChange는 외부 sync 변경과, 저장 실패로 되돌린 변경을 diff로 통지한다(자기 변경이 성공하면 미호출).
    //    removed → 복구(닉네임 폴백으로 숨긴 행도 data-fmkb-uid 를 남기므로 unhideByUid 로 함께 복구),
    //    added → 현재 DOM에서 해당 작성자 컨테이너 숨김, 마지막에 UID 없는 목록 닉네임 폴백 재스캔. 30-hide 함수 재사용.
    //    범위: 이미 로드된 DOM을 즉시 반영. 이후 새로 삽입되는 DOM은 (2)의 MutationObserver 가
    //    삽입 시점의 최신 차단 상태로 처리하므로 별도 처리가 필요 없다.
    if (typeof store.onChange === 'function') {
      store.onChange((d) => {
        nickIndex = null;
        d.removed.forEach((uid) => NS.hide.unhideByUid(uid));
        d.added.forEach((uid) => NS.hide.hideByUid(uid));
        // 복구 후 재스캔: 추가된 uid 의 목록 행 숨김 + 같은 닉의 다른 차단 uid 로 남아야 할 행 재숨김.
        NS.hide.scanNickRows(document, uidForNick);
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
