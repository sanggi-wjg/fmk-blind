/*
 * FMK-Blind 팝업 — 차단 목록 관리 UI
 *
 * 완전 숨김(display:none) 설계상, 이 팝업이 차단 해제의 유일한 경로다.
 * 차단 목록 접근은 반드시 store API(window.FMKBlind.store)만 사용한다.
 * (직접 chrome.storage 접근 금지 — storage-engineer 계약 .claude/workspace/store-api-contract.md 준수)
 *
 * 사용하는 store API (v1 FROZEN — 6 시그니처 + 가산 선택 API):
 *   await store.load()            // 팝업 열릴 때 1회
 *   store.list()  -> [{uid, nick, addedAt}]  // addedAt desc, 복사본 (내보내기 직렬화에도 사용)
 *   store.count() -> number
 *   store.isBlocked(uid) -> boolean  // 해제·되돌리기 저장 중 다른 곳의 반대 동작 판정
 *   await store.unblock(uid)      // uid는 문자열, no-op 안전
 *   store.onChange(cb) -> unsub   // (선택) 외부 변경 라이브 재렌더 — C9
 *   await store.importMany(items) -> {added,skipped,invalid}  // (선택) 배치 가져오기 — C10 · 해제 되돌리기(1개)
 *   await store.block(uid, nick)  // importMany가 없는 구 store에서만 되돌리기 폴백(차단 날짜는 지금으로 바뀜)
 *
 * 내보내기/가져오기(2026-07-08, TODO Q7): 내보내기는 새 API 불필요 — list() 복사본을
 *   JSON으로 직렬화해 Blob 다운로드(권한 추가 없음). 가져오기는 파일을 파싱해 importMany로
 *   1회 배치 반영(항목별 block 금지 — 레이트리밋). importMany는 {added,skipped,invalid}로 resolve
 *   (= sync 영속 완료)하고, 용량 초과·저장 실패면 reject한다(C10 — 아래 catch에서 안내).
 *   가져오기는 '자기-쓰기'라 onChange 에코가 없으므로(계약 C9) 콜백에 의존하지 않고
 *   명시적으로 refresh()를 호출해 목록·인원수를 갱신한다.
 *
 * 탭 보기(2026-10-05, 이슈 #9): Firefox 팝업은 파일 선택 창이 열리면 닫혀 버려 가져오기가 저장되지
 *   않는다. 그래서 Firefox 팝업의 가져오기는 같은 popup.html 을 일반 탭(?view=tab&action=import)으로
 *   열고, 파일 선택·importMany 는 그 탭에서 한다. Chrome 팝업은 기존대로 파일 입력을 직접 연다.
 *
 * 영속화 보장(계약 C3, 2026-10-05 갱신): store.unblock/importMany는 sync 쓰기가 완료된 뒤
 *   resolve하고, 저장에 실패하면 변경을 되돌린 뒤 reject(err.code: QUOTA | CONTEXT_INVALIDATED |
 *   WRITE_FAILED)한다. load는 읽기 실패 시 reject(READ_FAILED)한다. → popup은 반환 Promise만 기다려
 *   화면을 갱신하면 되고, 추가 flush 호출은 불필요(공개 flush API 없음).
 *   (구 store 내부 pagehide/visibilitychange 자동 flush(C8)는 stale 탭이 옛 목록을 되쓰는
 *    resurrection 원인이라 2026-06-15 제거됨 — 즉시 영속화라 안전망 불필요. 계약 §3 C8 참고.)
 *
 * 라이브 반영: 팝업 해제는 store.onChange(C9)로 이미 열린 fmkorea 탭에도 새로고침 없이 반영된다.
 *          팝업 화면 자체도 즉시 갱신한다.
 *
 * 해제 되돌리기(2026-10-05): 해제한 줄은 목록에서 바로 빼지 않고 원래 자리에 '차단 해제됨 + 되돌리기'로
 *   남긴다(팝업을 닫으면 사라짐). 되돌리기는 해제 전 항목을 importMany([항목])로 다시 넣는다 — importMany는
 *   항목의 addedAt을 그대로 쓰므로 원래 차단 날짜·목록 자리로 돌아간다(block은 지금 시각으로 바꾼다).
 *   해제·되돌리기 실패 안내는 푸터가 아니라 그 줄 안에 표시하고, 같은 줄을 다시 시도하면 지운다.
 */
(function () {
  'use strict';

  // ── 튜닝 상수 ─────────────────────────────────────────
  // 검색 입력 디바운스(ms): input 폭주 시 render 호출 빈도를 제한.
  // 60ms는 체감 즉시성(키입력 후 1프레임 남짓)과 렌더 부하의 절충값.
  var SEARCH_DEBOUNCE_MS = 60;

  // 내보내기 파일 포맷(팀 합의). 가져오기는 이 포맷의 entries 배열과 bare 배열을 관용 수용한다.
  var EXPORT_SCHEMA = 'fmk-blind/blocklist';
  var EXPORT_VER = 1;

  // 탭 보기: 같은 popup.html 을 일반 탭으로 연 경우(?view=tab). 아래 Firefox 가져오기 우회용.
  var PARAMS = new URLSearchParams(location.search);
  var IS_TAB_VIEW = PARAMS.get('view') === 'tab';
  // Firefox(데스크톱·Android)는 팝업에서 파일 선택 창이 열리면 팝업이 포커스를 잃고 즉시 닫힌다
  // (Mozilla Bug 1292701) → change 이벤트가 오기 전에 페이지가 사라져 가져오기가 저장되지 않는다(이슈 #9).
  // 그래서 Firefox 팝업에선 파일 선택을 탭 보기에서 하도록 넘긴다. 판별은 확장 URL 스킴(moz-extension:)으로.
  var NEEDS_TAB_FOR_FILE_PICKER =
    !IS_TAB_VIEW && location.protocol === 'moz-extension:';
  // 터치 기기(Firefox Android)에선 우클릭 대신 길게 눌러 작성자 메뉴를 연다 — 빈 목록 안내 문구에 반영.
  var IS_TOUCH =
    typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;

  var store = window.FMKBlind && window.FMKBlind.store;

  var els = {
    count: document.getElementById('fmkb-count'),
    search: document.getElementById('fmkb-search'),
    list: document.getElementById('fmkb-list'),
    state: document.getElementById('fmkb-state'),
    exportBtn: document.getElementById('fmkb-export'),
    importBtn: document.getElementById('fmkb-import'),
    importFile: document.getElementById('fmkb-import-file'),
    ioStatus: document.getElementById('fmkb-io-status'),
    live: document.getElementById('fmkb-live'),
  };

  // store.list() 스냅샷 캐시. 검색은 이 캐시 위에서만 필터(매 입력마다 store 재호출 안 함).
  var allItems = [];
  var query = '';

  // 이번 팝업에서 해제한 유저(uid → {uid, nick, addedAt}). 원래 자리에 '해제됨' 줄로 남겨 되돌릴 수 있게 한다.
  // 팝업을 닫으면 사라진다. 다른 곳에서 다시 차단되면 refresh가 지운다.
  var undone = new Map();
  // 저장 중인 uid — 그사이 목록이 다시 그려져도 버튼을 비활성으로 유지해 연타를 막는다.
  // refresh의 undone·rowErrors 정리도 저장 중인 uid는 건너뛴다(결과는 작업이 끝날 때 정한다).
  var busy = new Set();
  // 해제 저장 중인 항목(uid → 해제 전 항목). store 메모리에선 이미 빠졌지만 저장이 끝날 때까지
  // 원래 줄을 그대로 그린다(다른 줄 작업이 먼저 끝나 다시 그려져도 줄이 사라졌다 나타나지 않게).
  var inflight = new Map();
  // 줄별 실패 안내(uid → 문구). 같은 줄을 다시 시도하면 지운다.
  var rowErrors = new Map();
  // 작업이 끝난 뒤 다시 그릴 때 포커스를 돌려줄 줄(uid). 저장 중 버튼을 비활성하면 포커스가 빠지므로 기억해 둔다.
  // 여러 줄 작업이 겹치면 마지막으로 누른 줄(lastActedUid)이 끝날 때만 돌려준다.
  var focusUid = null;
  var lastActedUid = null;

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
   * 소문자 변환으로 길이가 바뀌는 문자(예: 'İ' → 'i̇')가 있으면 소문자 문자열의 인덱스가 원문과
   * 어긋난다(이슈 #20). 그래서 매칭은 항상 필터와 같은 '전체 문자열 소문자'로 하고(문맥 의존 변환 — 예:
   * 끝의 Σ→ς — 도 필터와 일치), 길이가 다를 때만 코드포인트별 소문자 길이로 '소문자 위치 → 원문 구간' 표를 만든다.
   * (코드포인트별 소문자 길이는 문맥과 무관해 그 합이 전체 소문자 길이와 같다. 어긋나면 강조 없이 원문만 표시)
   */
  function appendHighlighted(parent, text, q) {
    text = String(text == null ? '' : text);
    if (!q) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    var lower = text.toLowerCase();
    var origStart = null; // origStart[k]/origEnd[k] = lower[k]를 만든 원문 글자의 [시작, 끝) 위치
    var origEnd = null;
    if (lower.length !== text.length) {
      origStart = [];
      origEnd = [];
      for (var c = 0; c < text.length; ) {
        var ch = String.fromCodePoint(text.codePointAt(c));
        var n = ch.toLowerCase().length;
        for (var u = 0; u < n; u++) {
          origStart.push(c);
          origEnd.push(c + ch.length);
        }
        c += ch.length;
      }
      if (origStart.length !== lower.length) {
        parent.appendChild(document.createTextNode(text)); // 위치 표를 믿을 수 없으면 강조 생략
        return;
      }
    }
    var idx = lower.indexOf(q);
    if (idx === -1) {
      parent.appendChild(document.createTextNode(text));
      return;
    }
    var i = 0;
    while (idx !== -1) {
      var start = origStart ? origStart[idx] : idx;
      var end = origEnd ? origEnd[idx + q.length - 1] : idx + q.length; // 마지막 소문자를 만든 원문 글자까지
      if (start >= i) {
        if (start > i) parent.appendChild(document.createTextNode(text.slice(i, start)));
        var mark = document.createElement('mark');
        mark.className = 'fmkb-mark';
        mark.textContent = text.slice(start, end);
        parent.appendChild(mark);
        i = end;
      }
      idx = lower.indexOf(q, idx + q.length);
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

  // store 실패(reject err.code) → 사용자 안내 문구. withFit: QUOTA의 err.fit(더 넣을 수 있는 인원)을 덧붙일지
  // — 가져오기에만 의미가 있다(한 명을 되돌리다 실패했을 때 "약 0명까지"는 도움이 안 됨).
  function storeErrorMessage(e, what, withFit) {
    var code = e && e.code;
    if (code === 'CONTEXT_INVALIDATED') return '확장 프로그램이 업데이트되었습니다 — 팝업을 다시 열어 주세요.';
    if (code === 'SCHEMA_NEWER') return what + ' 실패 — 다른 기기의 더 새 버전이 저장한 목록입니다. 확장을 업데이트해 주세요.';
    if (code === 'QUOTA') {
      var fit = withFit && e && typeof e.fit === 'number' ? ' 지금은 약 ' + e.fit + '명까지 더 저장할 수 있습니다.' : '';
      return what + ' 실패 — 동기화 저장 공간(약 100KB)이 부족합니다.' + fit;
    }
    return what + ' 실패 — 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.';
  }

  function showFatal(message) {
    if (els.count) els.count.textContent = '총 –명';
    if (els.list) els.list.textContent = '';
    // store 접근 불가 상태에서는 내보내기/가져오기도 동작 불가 → 버튼 비활성으로 오조작 방지.
    if (els.exportBtn) els.exportBtn.disabled = true;
    if (els.importBtn) els.importBtn.disabled = true;
    setState(
      'error',
      '⚠️',
      message || '차단 목록을 불러오지 못했습니다.\n확장을 다시 로드한 뒤 팝업을 열어 주세요.'
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
    var uid = String(it.uid);
    var isUndone = undone.has(uid);
    var li = document.createElement('li');
    li.className = isUndone ? 'fmkb-item fmkb-item-undone' : 'fmkb-item';

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
    appendHighlighted(uidSpan, uid, q);
    meta.appendChild(uidSpan);
    var dateStr = isUndone ? '차단 해제됨' : formatDate(it.addedAt);
    if (dateStr) meta.appendChild(document.createTextNode(' · ' + dateStr));

    info.appendChild(nick);
    info.appendChild(meta);

    var err = rowErrors.get(uid);
    if (err) {
      var errEl = document.createElement('div');
      errEl.className = 'fmkb-item-error';
      errEl.textContent = err;
      info.appendChild(errEl);
    }

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('data-uid', uid);
    btn.disabled = busy.has(uid);
    if (isUndone) {
      btn.className = 'fmkb-restore';
      btn.textContent = '되돌리기';
      btn.setAttribute('aria-label', nickText + ' 다시 차단');
      btn.addEventListener('click', function () {
        onRestore(it, btn);
      });
    } else {
      btn.className = 'fmkb-unblock';
      btn.textContent = '차단 해제';
      btn.setAttribute('aria-label', nickText + ' 차단 해제');
      btn.addEventListener('click', function () {
        onUnblock(it, btn);
      });
    }

    li.appendChild(info);
    li.appendChild(btn);
    return li;
  }

  function byAddedAtDesc(a, b) {
    return (b.addedAt || 0) - (a.addedAt || 0);
  }

  function render() {
    var q = query.trim().toLowerCase();

    // 다시 그린 뒤 포커스를 돌려줄 버튼: 지금 목록 안에서 포커스를 가진 버튼, 없으면(저장 중 버튼이
    // 비활성돼 포커스가 빠진 경우) 작업이 막 끝난 줄(focusUid). 사용자가 검색창·다른 버튼으로 옮겼으면 뺏지 않는다.
    var active = document.activeElement;
    var focusInList = !!active && els.list.contains(active);
    var restoreUid = focusInList ? active.getAttribute('data-uid') : null;
    if (focusUid && (!active || active === document.body)) restoreUid = focusUid;
    focusUid = null;

    // 로드 모듈 부재 등 치명적 상태에서는 render 호출 안 됨(init에서 차단).
    // 이번 팝업에서 해제한 줄·해제 저장 중인 줄도 addedAt 순서로 원래 자리에 끼워 넣는다(정렬은 안정적).
    // 같은 uid는 한 줄만: 해제됨(되돌리기 저장 중이면 store에도 있음) → store 목록 → 해제 저장 중 순으로 우선.
    var items = allItems;
    if (undone.size || inflight.size) {
      var seen = new Set();
      items = [];
      var addOnce = function (it) {
        var u = String(it.uid);
        if (seen.has(u)) return;
        seen.add(u);
        items.push(it);
      };
      undone.forEach(addOnce);
      allItems.forEach(addOnce);
      inflight.forEach(addOnce);
      items.sort(byAddedAtDesc);
    }
    if (q) {
      items = items.filter(function (it) {
        var nick = (it.nick || '').toLowerCase();
        var uid = String(it.uid).toLowerCase();
        return nick.indexOf(q) !== -1 || uid.indexOf(q) !== -1;
      });
    }

    els.list.textContent = '';

    if (allItems.length === 0 && undone.size === 0 && inflight.size === 0) {
      setState(
        'empty',
        '🗒️',
        '차단한 유저가 없습니다.\nfmkorea에서 작성자 닉네임을 ' +
          (IS_TOUCH ? '길게 눌러' : '우클릭해') +
          ' 차단할 수 있어요.'
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

    if (restoreUid) {
      var target = els.list.querySelector('button[data-uid="' + CSS.escape(restoreUid) + '"]');
      if (target && !target.disabled) target.focus({ preventScroll: true });
    }
  }

  // ── 차단 해제 / 되돌리기 ───────────────────────────────

  // 화면 낭독기용 알림. 줄 안의 실패 안내는 다시 그린 요소라 읽히지 않으므로 별도 live 영역으로 알린다.
  // 같은 문구가 연달아 와도 다시 읽히도록 비웠다가 다음 태스크에 채운다.
  function announce(text) {
    if (!els.live) return;
    els.live.textContent = '';
    setTimeout(function () {
      els.live.textContent = text;
    }, 50);
  }

  // 저장 시작: 연타 방지 + 같은 줄의 이전 실패 안내 제거.
  function beginRowWork(uid, btn) {
    if (busy.has(uid)) return false;
    busy.add(uid);
    lastActedUid = uid;
    rowErrors.delete(uid);
    btn.disabled = true;
    var li = btn.closest('li');
    var oldErr = li && li.querySelector('.fmkb-item-error');
    if (oldErr) oldErr.remove();
    return true;
  }

  function endRowWork(uid) {
    busy.delete(uid);
    if (lastActedUid === uid) focusUid = uid;
    refresh(); // store.list()/count() 재호출로 화면 즉시 갱신
  }

  function rowFailed(uid, e, what) {
    console.error('[FMK-Blind popup] ' + what + ' 실패', e);
    var msg = storeErrorMessage(e, what);
    rowErrors.set(uid, msg);
    announce(msg);
  }

  function onUnblock(it, btn) {
    var uid = String(it.uid);
    if (!beginRowWork(uid, btn)) return;
    var entry = { uid: uid, nick: it.nick == null ? '' : String(it.nick), addedAt: it.addedAt };
    inflight.set(uid, entry);
    // store.unblock은 sync 쓰기가 끝난 뒤 resolve한다(계약 C3). 실패하면 store가 해제를 되돌리고
    // reject하므로, 그 줄에 오류를 표시하고 다시 그린다(항목이 그대로 남아 재시도 가능 — 이슈 #13).
    new Promise(function (resolve) { resolve(store.unblock(uid)); })
      .then(
        function () {
          // 저장을 기다리는 사이 다른 곳에서 다시 차단됐으면 되돌릴 것이 없다.
          if (!store.isBlocked(uid)) undone.set(uid, entry);
        },
        function (e) {
          rowFailed(uid, e, '차단 해제');
        }
      )
      .then(function () {
        inflight.delete(uid);
        endRowWork(uid);
      });
  }

  function onRestore(entry, btn) {
    var uid = entry.uid;
    if (!beginRowWork(uid, btn)) return;
    new Promise(function (resolve) {
      resolve(
        typeof store.importMany === 'function'
          ? store.importMany([entry])
          : store.block(uid, entry.nick)
      );
    })
      .then(
        function () {
          if (store.isBlocked(uid)) undone.delete(uid);
          else rowFailed(uid, null, '되돌리기'); // importMany가 항목을 받지 않은 경우(비정상 uid 등)
        },
        function (e) {
          rowFailed(uid, e, '되돌리기');
        }
      )
      .then(function () {
        endRowWork(uid);
      });
  }

  // ── 내보내기 / 가져오기(TODO Q7) ───────────────────────

  /**
   * 내보내기/가져오기 상태 메시지. 외부(파일) 문자열은 신뢰 불가 → textContent로만 채운다.
   * @param {?string} kind  'success' | 'error' | null(중립/진행)
   * @param {string}  text  빈 문자열이면 영역 숨김
   */
  function setIoStatus(kind, text) {
    if (!els.ioStatus) return;
    if (!text) {
      els.ioStatus.hidden = true;
      els.ioStatus.textContent = '';
      els.ioStatus.removeAttribute('data-kind');
      return;
    }
    els.ioStatus.hidden = false;
    if (kind) els.ioStatus.setAttribute('data-kind', kind);
    else els.ioStatus.removeAttribute('data-kind');
    els.ioStatus.textContent = text; // ← innerHTML 금지(XSS 방지)
  }

  function pad2(n) {
    return String(n).padStart(2, '0');
  }

  // 파일명용 로컬 날짜 스탬프(YYYY-MM-DD).
  function todayStamp() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /**
   * 내보내기: list() 스냅샷을 팀 합의 포맷 JSON으로 직렬화 → Blob 다운로드.
   * URL.createObjectURL + a[download] 방식이라 추가 권한이 필요 없다. 사용 후 revoke.
   * 0명이어도 동작(빈 entries) — 상태 메시지로 알림.
   */
  function onExport() {
    var items;
    try {
      items = store.list();
    } catch (e) {
      console.error('[FMK-Blind popup] export: store.list 실패', e);
      setIoStatus('error', '내보내기에 실패했습니다 — 목록을 읽지 못했습니다.');
      return;
    }
    if (!Array.isArray(items)) items = [];

    var entries = items.map(function (it) {
      return {
        uid: String(it.uid),
        nick: it.nick == null ? '' : String(it.nick),
        addedAt:
          typeof it.addedAt === 'number' && isFinite(it.addedAt) ? it.addedAt : null,
      };
    });

    var payload = {
      schema: EXPORT_SCHEMA,
      ver: EXPORT_VER,
      exportedAt: new Date().toISOString(),
      count: entries.length,
      entries: entries,
    };

    var url;
    try {
      var blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: 'application/json',
      });
      url = URL.createObjectURL(blob);
    } catch (e) {
      console.error('[FMK-Blind popup] export: Blob 생성 실패', e);
      setIoStatus('error', '내보내기에 실패했습니다.');
      return;
    }

    var a = document.createElement('a');
    a.href = url;
    a.download = 'fmk-blind-blocklist-' + todayStamp() + '.json';
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();

    // 다운로드 시작 뒤 정리. 즉시 revoke하면 일부 환경에서 다운로드가 취소될 수 있어 다음 태스크로 미룬다.
    setTimeout(function () {
      if (a.parentNode) a.parentNode.removeChild(a);
      URL.revokeObjectURL(url);
    }, 0);

    setIoStatus(
      'success',
      entries.length === 0
        ? '빈 목록을 내보냈습니다 (0명).'
        : entries.length + '명을 파일로 내보냈습니다.'
    );
  }

  /**
   * 파싱된 JSON에서 항목 배열을 관용 추출.
   *   - bare 배열                → 그대로
   *   - { entries: [...] }        → entries (내보내기 포맷)
   *   - { items: [...] }          → items (store 계약 §4 예시 호환)
   *   - 그 외                     → null (형식 불일치)
   */
  function extractEntries(parsed) {
    if (Array.isArray(parsed)) return parsed;
    if (parsed && typeof parsed === 'object') {
      if (Array.isArray(parsed.entries)) return parsed.entries;
      if (Array.isArray(parsed.items)) return parsed.items;
    }
    return null;
  }

  // "3명 추가 · 2명 중복 · 1건 무시" 형태. added는 항상, 나머지는 있을 때만.
  function formatImportResult(added, skipped, invalid) {
    var parts = [added + '명 추가'];
    if (skipped) parts.push(skipped + '명 중복');
    if (invalid) parts.push(invalid + '건 무시');
    return parts.join(' · ');
  }

  function setIoBusy(busy) {
    if (els.exportBtn) els.exportBtn.disabled = busy;
    if (els.importBtn) els.importBtn.disabled = busy;
  }

  /**
   * 가져오기: 파일 → text() → JSON.parse → entries 추출 → importMany → 결과 표시 + 재렌더.
   * JSON.parse/파일 읽기 실패는 상태 메시지로만 알리고 throw하지 않는다.
   * importMany는 비정상 항목을 invalid로 집계하고, 용량 초과(QUOTA, err.fit)·저장 실패는 reject한다(계약 C10).
   */
  function onImportFileChosen(ev) {
    var input = ev.target;
    var file = input && input.files && input.files[0];
    // 같은 파일을 다시 선택해도 change가 다시 발화하도록 즉시 초기화(file 참조는 이미 확보).
    input.value = '';
    if (!file) return;

    if (typeof store.importMany !== 'function') {
      setIoStatus('error', '이 버전은 가져오기를 지원하지 않습니다.');
      return;
    }

    setIoStatus(null, '가져오는 중…');

    file
      .text()
      .then(function (text) {
        var parsed;
        try {
          parsed = JSON.parse(text);
        } catch (e) {
          setIoStatus('error', '가져오기 실패 — 올바른 JSON 파일이 아닙니다.');
          return;
        }

        var entries = extractEntries(parsed);
        if (entries === null) {
          setIoStatus('error', '가져오기 실패 — 차단 목록 형식이 아닙니다.');
          return;
        }

        setIoBusy(true);
        return Promise.resolve(store.importMany(entries))
          .then(function (r) {
            r = r || {};
            var added = r.added || 0;
            var skipped = r.skipped || 0;
            var invalid = r.invalid || 0;
            // 자기-쓰기는 onChange 에코가 없으므로(계약 C9) 콜백에 의존하지 않고 직접 재렌더.
            refresh();
            setIoStatus('success', formatImportResult(added, skipped, invalid));
          })
          .catch(function (e) {
            // 용량 초과면 아무것도 바뀌지 않고, 쓰기 실패면 store가 추가분을 되돌린다(계약 C10).
            console.error('[FMK-Blind popup] importMany 실패', e);
            refresh();
            setIoStatus('error', storeErrorMessage(e, '가져오기', true));
          })
          .then(function () {
            setIoBusy(false);
          });
      })
      .catch(function (e) {
        console.error('[FMK-Blind popup] 파일 읽기 실패', e);
        setIoStatus('error', '파일을 읽지 못했습니다.');
        setIoBusy(false);
      });
  }

  /**
   * Firefox 팝업 전용: 가져오기 화면을 일반 탭(popup.html?view=tab&action=import)으로 열고 팝업을 닫는다.
   * 탭은 파일 선택 창이 떠도 닫히지 않으므로 거기서 가져오기 버튼을 다시 누르면 정상 동작한다.
   * tabs.create 는 tabs 권한 없이 쓸 수 있다(권한 추가 없음). 파일 선택은 사용자 클릭이 필요해
   * 탭에서 자동으로 띄우지 않고 안내만 표시한다.
   */
  function openImportTab() {
    setIoBusy(true); // 연타 시 탭이 여러 개 열리는 것 방지
    // new Promise 로 감싸 tabs API 부재 등 동기 throw 도 아래 catch 로 모은다.
    new Promise(function (resolve) {
      var url = chrome.runtime.getURL('src/popup/popup.html?view=tab&action=import');
      resolve(chrome.tabs.create({ url: url }));
    })
      .then(function () {
        window.close();
      })
      .catch(function (e) {
        console.error('[FMK-Blind popup] 가져오기 탭 열기 실패', e);
        setIoStatus('error', '가져오기 화면을 열지 못했습니다.');
        setIoBusy(false);
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
    // 다른 곳(탭·기기)에서 다시 차단된 '해제됨' 줄은 일반 줄로 돌아가고,
    // 목록에서 사라진 유저의 실패 안내는 버린다(나중에 다시 나타날 때 옛 오류가 붙지 않게).
    // 저장 중인 uid는 건너뛴다 — 되돌리기 저장 중엔 store 메모리에 이미 들어가 있어(isBlocked true)
    // 여기서 지우면 실패했을 때 줄과 실패 안내가 함께 사라진다.
    undone.forEach(function (_, uid) {
      if (!busy.has(uid) && store.isBlocked(uid)) undone.delete(uid);
    });
    rowErrors.forEach(function (_, uid) {
      if (!busy.has(uid) && !store.isBlocked(uid) && !undone.has(uid)) rowErrors.delete(uid);
    });
    updateCount();
    render();
  }

  // ── 초기화 ─────────────────────────────────────────────

  function init() {
    if (
      !store ||
      typeof store.list !== 'function' ||
      typeof store.count !== 'function' ||
      typeof store.unblock !== 'function' ||
      typeof store.isBlocked !== 'function'
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

    // 내보내기/가져오기(TODO Q7). 가져오기 버튼은 숨긴 파일 입력을 트리거한다.
    if (els.exportBtn) els.exportBtn.addEventListener('click', onExport);
    if (els.importBtn && els.importFile) {
      els.importBtn.addEventListener('click', function () {
        if (NEEDS_TAB_FOR_FILE_PICKER) {
          openImportTab();
          return;
        }
        els.importFile.click();
      });
      els.importFile.addEventListener('change', onImportFileChosen);
    }

    // 탭 보기(Firefox 가져오기 우회로 열린 경우): 탭 폭에 맞춘 레이아웃 + 다음 동작 안내.
    if (IS_TAB_VIEW) {
      document.body.classList.add('fmkb-tab-view');
      if (PARAMS.get('action') === 'import') {
        setIoStatus(null, '가져오기 버튼을 눌러 파일을 선택하세요.'); // 버튼 포커스는 목록을 읽은 뒤(활성화 후)
      }
    }

    // load()는 읽기를 1회 재시도한 뒤에도 실패하면 reject한다(이슈 #14). 빈 목록을 정상인 척
    // 보여 주지 않고 오류 상태로 멈춘다(가져오기·해제 비활성).
    // 목록을 읽기 전엔 가져오기·내보내기를 막는다(중복 판정이 빈 목록 기준이 되거나 빈 파일을 내보내지 않게
    // — 최종 리뷰 #23 M6).
    if (els.importBtn) els.importBtn.disabled = true;
    if (els.exportBtn) els.exportBtn.disabled = true;
    var loaded = typeof store.load === 'function' ? store.load() : Promise.resolve();
    Promise.resolve(loaded)
      .then(function () {
        if (els.exportBtn) els.exportBtn.disabled = false;
        if (els.importBtn) {
          els.importBtn.disabled = false;
          if (IS_TAB_VIEW && PARAMS.get('action') === 'import') els.importBtn.focus();
        }
        refresh();

        // 라이브 동기(가산적 7번째 API onChange, 계약 C9): 팝업이 열려 있는 동안 외부
        // (fmkorea 탭 우클릭 차단/해제, 다른 기기 sync)에서 목록이 바뀌면 자동 재렌더.
        // - 최초 load→refresh 이후 1회만 등록(중복 구독 방지). 구독은 팝업 종료와 함께 GC되므로
        //   별도 unsubscribe 불필요(단수명 팝업).
        // - diff 인자는 사용하지 않는다 — store.list()/count() 전체 재조회로 충분하고,
        //   기존 refresh()가 캐시/인원수/렌더(검색 필터 포함)를 일괄 갱신한다.
        // - 팝업 자신의 해제가 성공하면 diff가 비어 이 콜백이 호출되지 않는다. 저장에 실패하면 store가
        //   되돌린 변경을 통지하므로 해제·되돌리기 실패 처리(endRowWork)와 함께 두 번 갱신될 수 있으나 무해하다(계약 C7·C9).
        // - typeof 가드: onChange 미탑재(구버전 store)에도 안전 — 단순히 라이브 동기만 비활성.
        if (typeof store.onChange === 'function') {
          store.onChange(function () {
            refresh();
          });
        }
      })
      .catch(function (e) {
        console.warn('[FMK-Blind popup] store.load 실패', e);
        showFatal(e && e.code === 'CONTEXT_INVALIDATED'
          ? '확장 프로그램이 업데이트되었습니다.\n팝업을 다시 열어 주세요.'
          : '차단 목록을 불러오지 못했습니다.\n잠시 후 팝업을 다시 열어 주세요.');
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
