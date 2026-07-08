// FMK-Blind — 작성자 식별 & 숨길 컨테이너 판정
// 단일 출처: fmk-dom-selectors 스킬. 여기 규칙은 스킬과 1:1로 일치해야 한다(임의 추정 금지).
// 적용 범위: PC(www.fmkorea.com) + 모바일(m.fmkorea.com) 공통.
//   모바일 게시글 작성자 앵커는 PC와 동일 패턴(member_{UID} member_plate)이고 조상 체인에
//   .rd_hd / .rd 가 그대로 존재함을 실측 확인(2026-07-08, 모바일 UA curl: m_article.html) →
//   아래 판정 규칙 ②가 모바일에서도 그대로 매치하므로 셀렉터 코드 변경이 필요 없다.
//   (모바일 목록은 숫자 member_ 앵커가 없어 애초에 매치 안 됨 → 범위 밖, 오작동 위험 없음.)
(function () {
  'use strict';

  window.FMKBlind = window.FMKBlind || {};
  const NS = window.FMKBlind;

  // 토큰-앵커드 UID 정규식(= /^member_(\d+)$/). 패턴(member_(\d+))은 단일 출처
  // NS.UID_REGEX(00-namespace.js)에서 .source 로 파생해 토큰 전체 일치(^…$)로 강화한다.
  // → 숫자 패턴 정의를 한 곳(NS.UID_REGEX)에만 두면서, 적용은 토큰 경계로 앵커링.
  const TOKEN_UID_REGEX = new RegExp('^' + NS.UID_REGEX.source + '$');

  const selectors = {
    AUTHOR_ANCHOR: NS.AUTHOR_ANCHOR_SELECTOR,

    // 앵커 class 문자열을 공백 토큰으로 분리한 뒤, 각 토큰을 ^member_(\d+)$ 로 전체 일치시켜
    // 첫 매칭 토큰의 캡처를 UID 로 삼는다(토큰-앵커드). 못 뽑으면(탈퇴/비회원/익명 등) null.
    // 단일 출처: fmk-dom-selectors 스킬의 "UID 추출(토큰-앵커드)" 규칙과 1:1.
    extractUid(anchor) {
      if (!anchor) return null;
      // className 이 문자열이 아닐 가능성(SVG 등) 대비해 안전하게 문자열화.
      const cls =
        typeof anchor.className === 'string'
          ? anchor.className
          : anchor.getAttribute('class') || '';
      // 공백으로 토큰 분리 후 각 토큰을 전체 일치(앵커드)로 검사. member_plate 같은
      // 비숫자 토큰, *member_* 부분문자열 토큰의 이론적 오캡처를 토큰 경계로 차단한다.
      const tokens = cls.split(/\s+/);
      for (let i = 0; i < tokens.length; i++) {
        const m = TOKEN_UID_REGEX.exec(tokens[i]);
        if (m) return m[1];
      }
      return null;
    },

    // 닉네임: 앵커의 텍스트(<img> 뒤 텍스트 노드). 공백 정리.
    getNick(anchor) {
      return anchor ? anchor.textContent.trim() : '';
    },

    // 앵커 → 숨길 컨테이너. 판정 순서 고정(스킬 규칙 그대로):
    //  ① 댓글: closest('li[id^="comment_"]')  (베스트댓글 comment_best 포함)
    //  ② 게시글 글쓴이: closest('.rd_hd, .top_area') → 읽기 컨테이너 .rd 전체
    //  ③ 그 외: 보드 목록 행 closest('tr, li')  (테이블형 tr / 웹진형 li 흡수)
    findContainer(anchor) {
      if (!anchor) return null;

      // ① 댓글
      const comment = anchor.closest('li[id^="comment_"]');
      if (comment) return comment;

      // ② 게시글 글쓴이 → .rd (PC·모바일 공통: 모바일 조상 체인도
      //    a.member_* < div.side < div.btm_area < div.board < div.rd_hd < #bd_capture < div.rd)
      const head = anchor.closest('.rd_hd, .top_area');
      if (head) {
        const rd = head.closest('.rd');
        return rd || head; // .rd 못 찾는 예외 시 헤더라도 안전 처리
      }

      // ③ 보드 목록 행
      return anchor.closest('tr, li');
    },
  };

  NS.selectors = selectors;
})();
