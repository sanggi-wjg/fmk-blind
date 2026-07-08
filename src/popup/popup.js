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
 *   await store.unblock(uid)      // uid는 문자열, no-op 안전
 *   store.onChange(cb) -> unsub   // (선택) 외부 변경 라이브 재렌더 — C9
 *   await store.importMany(items) -> {added,skipped,invalid}  // (선택) 배치 가져오기 — C10
 *
 * 내보내기/가져오기(2026-07-08, TODO Q7): 내보내기는 새 API 불필요 — list() 복사본을
 *   JSON으로 직렬화해 Blob 다운로드(권한 추가 없음). 가져오기는 파일을 파싱해 importMany로
 *   1회 배치 반영(항목별 block 금지 — 레이트리밋). importMany는 throw하지 않고
 *   {added,skipped,invalid}를 반환하며 반환 Promise resolve = sync 영속 완료(C10).
 *   가져오기는 '자기-쓰기'라 onChange 에코가 없으므로(계약 C9) 콜백에 의존하지 않고
 *   명시적으로 refresh()를 호출해 목록·인원수를 갱신한다.
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

  // 내보내기 파일 포맷(팀 합의). 가져오기는 이 포맷의 entries 배열과 bare 배열을 관용 수용한다.
  var EXPORT_SCHEMA = 'fmk-blind/blocklist';
  var EXPORT_VER = 1;

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
    // store 접근 불가 상태에서는 내보내기/가져오기도 동작 불가 → 버튼 비활성으로 오조작 방지.
    if (els.exportBtn) els.exportBtn.disabled = true;
    if (els.importBtn) els.importBtn.disabled = true;
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
   * importMany는 비정상 항목을 invalid로 집계하며 throw하지 않는다(계약 C10).
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
            console.error('[FMK-Blind popup] importMany 실패', e);
            setIoStatus('error', '가져오기 중 오류가 발생했습니다.');
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

    // 내보내기/가져오기(TODO Q7). 가져오기 버튼은 숨긴 파일 입력을 트리거한다.
    if (els.exportBtn) els.exportBtn.addEventListener('click', onExport);
    if (els.importBtn && els.importFile) {
      els.importBtn.addEventListener('click', function () {
        els.importFile.click();
      });
      els.importFile.addEventListener('change', onImportFileChosen);
    }

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
