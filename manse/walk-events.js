// ============================================================
//  3·1 만세길 걷기 — 회차(행사) 정보 공용 도우미 (walk-events-setup.sql 의 walk_events 표)
//  manse/walk.html · walk-admin.html · lucky-admin.html · 두 홈페이지 첫 화면에서 함께 씀 (표는 만세운동본부 Supabase)
//  - WalkEv.list(client)  : 모든 회차 (최근 회차부터). 표가 아직 없으면 제6회 기본값 하나
//  - WalkEv.pick(list, e) : 보여 줄 회차 — e(회차 코드)가 있으면 그 회차, 없으면 신청 받는 회차 → 첫 화면 게시 회차 → 날짜가 정해진 최근 회차
//  - WalkEv.state(ev)     : 'open'(신청 받는 중) · 'soon'(신청 전) · 'closed'(마감) · 'draft'(준비 중 — 날짜 미정)
// ============================================================
(function () {
  var FALLBACK = { event: '2026-6', no: 6, title: '제6회 3·1 만세길 걷기', event_date: '2026-10-18', time_text: '오후 2시 ~ 5시',
    place: '쌍봉산 근린공원', fee: 5000, bank: '농협', account: '355-0074-8148-33', holder: '삼괴연합회', apply_until: '2026-10-18',
    host: '주최 삼일만세운동본부 · 주관 삼괴지역기독교연합회', sponsor: 'CTS 기독교TV · 광복회 화성시지회',
    contact: '김낭주 목사 010-4271-5090', intro: null, hero: false, open: false, fallback: true };
  var COLS = 'event,no,title,event_date,time_text,place,fee,bank,account,holder,apply_until,host,sponsor,contact,intro,hero,open,updated_at,updated_by';
  var DAY = ['주일', '월', '화', '수', '목', '금', '토'];

  function parts(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? [+m[1], +m[2], +m[3]] : null; }
  function local(d) { var p = parts(d); return p ? new Date(p[0], p[1] - 1, p[2]) : null; }
  // 'YYYY-MM-DD' 다음 날 0시(한국 시각) — 이 시각 전까지가 그날
  function endOf(d) { return parts(d) ? new Date(Date.parse(d.slice(0, 10) + 'T00:00:00+09:00') + 86400000) : null; }
  function todayKST() { var k = new Date(Date.now() + 9 * 3600000); return new Date(k.getUTCFullYear(), k.getUTCMonth(), k.getUTCDate()); }

  var W = {
    FALLBACK: FALLBACK,
    COLS: COLS,
    async list(client) {
      if (!client) return [FALLBACK];
      try {
        var r = await client.from('walk_events').select(COLS).order('no', { ascending: false });
        if (r.error || !r.data) throw r.error;
        return r.data.length ? r.data : [FALLBACK];
      } catch (_) { return [FALLBACK]; }
    },
    accepting: function (ev) { var e = ev && endOf(ev.apply_until); return !!(ev && ev.open && (!e || Date.now() < e.getTime())); },
    // 신청을 안 받는 중이면: 마감일이 지났거나 행사 날(당일 포함)이 되었으면 마감, 아니면 신청 전 · 준비 중
    state: function (ev) {
      if (!ev) return 'draft';
      if (W.accepting(ev)) return 'open';
      var now = Date.now(), until = endOf(ev.apply_until), day = parts(ev.event_date) ? Date.parse(ev.event_date.slice(0, 10) + 'T00:00:00+09:00') : null;
      if ((until && now >= until.getTime()) || (day && now >= day)) return 'closed';
      return ev.event_date ? 'soon' : 'draft';
    },
    // 행사 날이 지났는지 (행사 다음 날 0시부터)
    over: function (ev) { var e = ev && endOf(ev.event_date); return !!(e && Date.now() >= e.getTime()); },
    stateLabel: function (ev) { return { open: '신청 받는 중', soon: '신청 전', closed: '마감', draft: '준비 중' }[W.state(ev)]; },
    pick: function (list, code) {
      list = list || [];
      if (code) { var hit = list.filter(function (e) { return e.event === code; })[0]; if (hit) return hit; }
      return list.filter(W.accepting)[0] || list.filter(function (e) { return e.hero; })[0] ||
             list.filter(function (e) { return e.event_date; })[0] || list[0] || FALLBACK;
    },
    // 2026년 10월 18일(주일)
    longDate: function (d) { var p = parts(d); if (!p) return ''; return p[0] + '년 ' + p[1] + '월 ' + p[2] + '일(' + DAY[local(d).getDay()] + ')'; },
    // 10월 18일(주일)
    shortDate: function (d) { var p = parts(d); if (!p) return ''; return p[1] + '월 ' + p[2] + '일(' + DAY[local(d).getDay()] + ')'; },
    // 2026.10.18
    dotDate: function (d) { var p = parts(d); return p ? p[0] + '.' + (p[1] < 10 ? '0' : '') + p[1] + '.' + (p[2] < 10 ? '0' : '') + p[2] : ''; },
    year: function (ev) { var p = parts(ev && ev.event_date); return p ? p[0] : (ev && /^(\d{4})-/.test(ev.event) ? +ev.event.slice(0, 4) : ''); },
    // 행사까지 남은 날 — 'D-12' · 'D-DAY' · ''(지났거나 날짜 미정)
    dday: function (d) { var t = local(d); if (!t) return ''; var n = Math.round((t - todayKST()) / 86400000); return n > 0 ? 'D-' + n : (n === 0 ? 'D-DAY' : ''); },
    accountDigits: function (ev) { return String((ev && ev.account) || '').replace(/\D/g, ''); }
  };
  window.WalkEv = W;
})();
