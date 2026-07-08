// FMK-Blind — MutationObserver 증분 처리(최초 스캔 이후 새로 삽입되는 노드 숨김)
// store 비의존: 차단 여부 판정은 install({ isBlocked }) 로 주입받는다(보통 store.isBlocked).
// 목적: AJAX 댓글 작성/갱신·더보기·무한스크롤·새 댓글 삽입 등으로 최초 로드 1회 스캔(30-hide.scan)
//       이후 DOM 에 붙는 노드에도 차단(숨김)을 즉시 적용한다. 숨김 실동작은 30-hide 를 재사용한다.
(function () {
  'use strict';

  window.FMKBlind = window.FMKBlind || {};
  const NS = window.FMKBlind;

  let observer = null; // 설치된 MutationObserver(중복 install 가드 + disconnect 용)

  // 우리가 만든 UI 노드(우클릭 메뉴/토스트)는 처리 대상에서 제외한다.
  // 이 노드들엔 작성자 앵커가 없어 어차피 무해하지만, 불필요한 순회를 아끼고 의도를 명시한다.
  function isOwnUiNode(el) {
    return el.id === NS.MENU_ID || el.id === NS.TOAST_ID;
  }

  // 작성자 앵커 1개 처리: UID 추출 → 차단 대상이면 컨테이너 숨김(30-hide 재사용).
  // UID 없는 작성자(탈퇴/비회원/익명)는 조용히 스킵 — 최초 스캔과 동일한 규칙.
  function processAnchor(anchor, isBlocked) {
    const uid = NS.selectors.extractUid(anchor);
    if (!uid) return;
    if (!isBlocked(uid)) return;
    NS.hide.hideForAnchor(anchor, uid);
  }

  // addedNode 1개 처리. Element 노드만 대상(텍스트/코멘트 등 비Element 는 즉시 스킵).
  //  (a) 노드 자신이 작성자 앵커면 그것을 처리(앵커가 통째로 삽입되는 경우)
  //  (b) 하위의 작성자 앵커들을 querySelectorAll 로 순회 처리(컨테이너가 삽입되는 경우)
  function handleAddedNode(node, isBlocked) {
    if (node.nodeType !== Node.ELEMENT_NODE) return; // 비Element 스킵
    if (isOwnUiNode(node)) return; // 우리 UI 노드 스킵

    // (a) 노드 자신이 작성자 앵커
    if (node.matches && node.matches(NS.AUTHOR_ANCHOR_SELECTOR)) {
      processAnchor(node, isBlocked);
    }
    // (b) 하위 작성자 앵커들
    if (node.querySelectorAll) {
      node
        .querySelectorAll(NS.AUTHOR_ANCHOR_SELECTOR)
        .forEach((a) => processAnchor(a, isBlocked));
    }
  }

  const observerApi = {
    // install({ isBlocked }) — document.body(폴백 documentElement)에 childList/subtree 관찰 등록.
    //  - 관찰 옵션은 childList:true, subtree:true 만 사용한다. attributes/characterData 는 관찰하지 않는다.
    //    이유(재귀 가드): 30-hide.hideForAnchor 는 .fmkb-hidden 클래스 토글(= attribute 변경)로 숨긴다.
    //    childList 만 관찰하므로 우리 숨김 동작이 다시 콜백을 유발하지 않는다(무한 재귀 없음).
    //  - 중복 install 은 no-op(가드). isBlocked 미주입/타깃 부재 시 안전하게 미설치.
    install(handlers) {
      if (observer) return; // 이미 설치됨 → no-op
      const isBlocked = handlers && handlers.isBlocked;
      if (typeof isBlocked !== 'function') return; // 안전 실패(차단 판정 없음 → 미설치)

      const target = document.body || document.documentElement;
      if (!target) return; // 관찰 대상 부재(비정상) → 안전 실패

      observer = new MutationObserver((records) => {
        // childList 만 관찰하므로 record.type 은 항상 'childList'. addedNodes 만 처리한다.
        for (let r = 0; r < records.length; r++) {
          const added = records[r].addedNodes;
          for (let i = 0; i < added.length; i++) {
            handleAddedNode(added[i], isBlocked);
          }
        }
      });

      observer.observe(target, { childList: true, subtree: true });
    },

    // 관찰 중단(생명주기 정리/테스트용). 다시 install 가능 상태로 되돌린다.
    disconnect() {
      if (observer) {
        observer.disconnect();
        observer = null;
      }
    },
  };

  NS.observer = observerApi;
})();
