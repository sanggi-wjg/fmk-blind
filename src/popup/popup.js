/*
 * FMK-Blind 팝업 — 차단 목록 관리 UI
 *
 * 완전 숨김(display:none) 설계상, 이 팝업이 차단 해제의 유일한 경로다.
 * 차단 목록 접근은 반드시 store API(window.FMKBlind.store)만 사용한다.
 * (직접 chrome.storage 접근 금지 — storage-engineer 계약 .claude/workspace/store-api-contract.md 준수)
 *
 * 사용하는 store API (v1 FROZEN — 6 시그니처):
 *   await store.load()            // 팝업 열릴 때 1회
 *   store.list()  -> [{uid, nick, addedAt}]  // addedAt desc, 복사본
 *   store.count() -> number
 *   await store.unblock(uid)      // uid는 문자열, no-op 안전
 *
 * 영속화 보장(계약 C3, 2026-06-15 갱신): store.unblock/block은 sync 쓰기가 완료된 뒤
 *   resolve한다. 따라서 unblock을 await(또는 .then 체이닝)한 시점엔 이미 sync 영속이 끝나 있어,
 *   해제 직후 팝업이 곧장 닫혀도 유실이 없다. → popup은 unblock 반환 Promise만 기다려
 *   화면을 갱신하면 되고, 추가 flush 호출은 불필요(공개 flush API 없음).
 *   (구 store 내부 pagehide/visibilitychange 자동 flush(C8)는 stale 탭이 옛 목록을 되쓰는
 *    resurrection 원인이라 2026-06-15 제거됨 — 즉시 영속화라 안전망 불필요. 계약 §3 C8 참고.)
 *
 * v1 제약: 팝업 해제는 이미 열린 fmkorea 탭은 새로고침 후 반영(onChanged는 TODO).
 *          팝업 화면 자체는 즉시 갱신한다.
 */
(function () {
  'use strict';

  // ── 튜닝 상수 ─────────────────────────────────────────
  // 검색 입력 디바운스(ms): input 폭주 시 render 호출 빈도를 제한.
  // 60ms는 체감 즉시성(키입력 후 1프레임 남짓)과 렌더 부하의 절충값.
  var SEARCH_DEBOUNCE_MS = 60;

  var store = window.FMKBlind && window.FMKBlind.store;

  var els = {
    count: document.getElementById('fmkb-count'),
    search: document.getElementById('fmkb-search'),
    list: document.getElementById('fmkb-list'),
    state: document.getElementById('fmkb-state'),
  };

  // store.list() 스냅샷 캐시. 검색은 이 캐시 위에서만 필터(매 입력마다 store 재호출 안 함).
  var allItems = [];
  var query = '';

  // ── 유틸 ───────────────────────────────────────────────

  function debounce(fn, ms) {
    var t = null;
    return function () {
      var ctx = this;
      var argz = arguments;
      if (t) clearTimeout(t);
      t = setTimeout(function () {
        t = null;
        fn.apply(ctx, argz);
      }, ms);
    };
  }

  function formatDate(ms) {
    if (typeof ms !== 'number' || !isFinite(ms)) return '';
    try {
      var d = new Date(ms);
      if (isNaN(d.getTime())) return '';
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, '0');
      var day = String(d.getDate()).padStart(2, '0');
      return y + '-' + m + '-' + day;
    } catch (e) {
      return '';
    }
  }

  /**
   * text를 parent에 추가하되 q(소문자) 일치 구간을 <mark>로 강조.
   * 닉네임은 외부(fmkorea) 입력이므로 textContent로만 다룬다(XSS 방지).
   */
  function appendHighlighted(parent, text, q) {
    text = String(text == null ? '' : text);
    if (!q) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    var lower = text.toLowerCase();
    var idx = lower.indexOf(q);
    if (idx === -1) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    var i = 0;
    while (idx !== -1) {
      if (idx > i) parent.appendChild(document.createTextNode(text.slice(i, idx)));
      var mark = document.createElement('mark');
      mark.className = 'fmkb-mark';
      mark.textContent = text.slice(idx, idx + q.length);
      parent.appendChild(mark);
      i = idx + q.length;
      idx = lower.indexOf(q, i);
    }
    if (i < text.length) parent.appendChild(document.createTextNode(text.slice(i)));
  }

  // ── 상태 메시지(빈 목록 / 무결과 / 오류) ───────────────

  function setState(kind, emoji, text) {
    if (!kind) {
      els.state.hidden = true;
      els.state.textContent = '';
      els.state.removeAttribute('data-kind');
      return;
    }
    els.state.hidden = false;
    els.state.setAttribute('data-kind', kind);
    els.state.textContent = '';
    if (emoji) {
      var e = document.createElement('span');
      e.className = 'fmkb-state-emoji';
      e.textContent = emoji;
      els.state.appendChild(e);
    }
    els.state.appendChild(document.createTextNode(text));
  }

  function showFatal() {
    if (els.count) els.count.textContent = '총 –명';
    if (els.list) els.list.textContent = '';
    setState(
      'error',
      '⚠️',
      '차단 목록을 불러오지 못했습니다.\n확장을 다시 로드한 뒤 팝업을 열어 주세요.'
    );
  }

  // ── 인원수 ─────────────────────────────────────────────

  function updateCount() {
    var n;
    try {
      n = store.count();
    } catch (e) {
      n = allItems.length;
    }
    els.count.textContent = '총 ' + n + '명';
  }

  // ── 항목 렌더 ──────────────────────────────────────────

  function buildItem(it, q) {
    var li = document.createElement('li');
    li.className = 'fmkb-item';

    var info = document.createElement('div');
    info.className = 'fmkb-item-info';

    var nickText =
      it.nick && String(it.nick).length ? String(it.nick) : '(닉네임 없음)';

    var nick = document.createElement('div');
    nick.className = 'fmkb-item-nick';
    nick.title = nickText;
    appendHighlighted(nick, nickText, q);

    var meta = document.createElement('div');
    meta.className = 'fmkb-item-meta';
    meta.appendChild(document.createTextNode('UID '));
    var uidSpan = document.createElement('span');
    uidSpan.className = 'fmkb-item-uid';
    appendHighlighted(uidSpan, String(it.uid), q);
    meta.appendChild(uidSpan);
    var dateStr = formatDate(it.addedAt);
    if (dateStr) meta.appendChild(document.createTextNode(' · ' + dateStr));

    info.appendChild(nick);
    info.appendChild(meta);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fmkb-unblock';
    btn.textContent = '차단 해제';
    btn.setAttribute('aria-label', nickText + ' 차단 해제');
    btn.addEventListener('click', function () {
      onUnblock(it, btn);
    });

    li.appendChild(info);
    li.appendChild(btn);
    return li;
  }

  function render() {
    var q = query.trim().toLowerCase();

    // 로드 모듈 부재 등 치명적 상태에서는 render 호출 안 됨(init에서 차단).
    var items = allItems;
    if (q) {
      items = allItems.filter(function (it) {
        var nick = (it.nick || '').toLowerCase();
        var uid = String(it.uid).toLowerCase();
        return nick.indexOf(q) !== -1 || uid.indexOf(q) !== -1;
      });
    }

    els.list.textContent = '';

    if (allItems.length === 0) {
      setState(
        'empty',
        '🗒️',
        '차단한 유저가 없습니다.\nfmkorea에서 작성자 닉네임을 우클릭해 차단할 수 있어요.'
      );
      return;
    }
    if (items.length === 0) {
      setState('noresult', '🔍', '"' + query.trim() + '" 검색 결과가 없습니다.');
      return;
    }
    setState(null);

    var frag = document.createDocumentFragment();
    for (var i = 0; i < items.length; i++) {
      frag.appendChild(buildItem(items[i], q));
    }
    els.list.appendChild(frag);
  }

  // ── 차단 해제 ──────────────────────────────────────────

  function onUnblock(it, btn) {
    btn.disabled = true;
    // store.unblock은 내부적으로 flushPending()을 반환하므로, sync 쓰기가 이 클릭 핸들러
    // 태스크 안에서 디스패치되고 쓰기 완료 후 resolve한다(계약 C3). 따라서 아래 .then(refresh)는
    // 영속화가 끝난 뒤에 돌고, 해제 직후 팝업이 곧장 닫혀도 유실이 없다(추가 flush 호출 불필요).
    // 영속 실패는 store가 reject 없이 내부 흡수·재시도(C7)하므로 .catch는 sync 쓰기 실패로는
    // 발화하지 않고, unblock 호출 자체의 동기 예외(store 미탑재 등)에 대한 방어로만 남는다.
    Promise.resolve(store.unblock(String(it.uid)))
      .then(function () {
        refresh(); // store.list()/count() 재호출로 화면 즉시 갱신
      })
      .catch(function (e) {
        console.error('[FMK-Blind popup] unblock 실패', e);
        btn.disabled = false; // 실패 시 같은 항목 재시도 허용
      });
  }

  // ── 데이터 새로고침(store → 캐시 → 렌더) ───────────────

  function refresh() {
    try {
      var l = store.list();
      allItems = Array.isArray(l) ? l : [];
    } catch (e) {
      console.error('[FMK-Blind popup] store.list 실패', e);
      showFatal();
      return;
    }
    updateCount();
    render();
  }

  // ── 초기화 ─────────────────────────────────────────────

  function init() {
    if (
      !store ||
      typeof store.list !== 'function' ||
      typeof store.count !== 'function' ||
      typeof store.unblock !== 'function'
    ) {
      console.error('[FMK-Blind popup] window.FMKBlind.store API 미탑재 — store.js 로드 실패 추정');
      showFatal();
      return;
    }

    // 검색 입력 → 캐시 위 필터(가벼운 디바운스).
    els.search.addEventListener(
      'input',
      debounce(function () {
        query = els.search.value;
        render();
      }, SEARCH_DEBOUNCE_MS)
    );

    // load()는 계약상 실패해도 throw 안 함(C7) — 방어적으로 catch 후 빈/부분 목록 진행.
    var loaded = typeof store.load === 'function' ? store.load() : Promise.resolve();
    Promise.resolve(loaded)
      .catch(function (e) {
        console.warn('[FMK-Blind popup] store.load 실패 — 가능한 범위로 표시', e);
      })
      .then(function () {
        refresh();

        // 라이브 동기(가산적 7번째 API onChange, 계약 C9): 팝업이 열려 있는 동안 외부
        // (fmkorea 탭 우클릭 차단/해제, 다른 기기 sync)에서 목록이 바뀌면 자동 재렌더.
        // - 최초 load→refresh 이후 1회만 등록(중복 구독 방지). 구독은 팝업 종료와 함께 GC되므로
        //   별도 unsubscribe 불필요(단수명 팝업).
        // - diff 인자는 사용하지 않는다 — store.list()/count() 전체 재조회로 충분하고,
        //   기존 refresh()가 캐시/인원수/렌더(검색 필터 포함)를 일괄 갱신한다.
        // - 팝업 자신의 onUnblock은 '자기-쓰기'라 diff가 비어 이 콜백이 호출되지 않으므로
        //   onUnblock의 명시적 .then(refresh)와 중복 갱신이 없다(계약 §C9·onChange 주석).
        // - typeof 가드: onChange 미탑재(구버전 store)에도 안전 — 단순히 라이브 동기만 비활성.
        if (typeof store.onChange === 'function') {
          store.onChange(function () {
            refresh();
          });
        }
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
