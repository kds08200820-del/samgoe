// ============================================================
//  삼괴연합회(삼기연) 홈페이지의 3·1 만세길 걷기 자료 → 삼일만세운동본부 홈페이지 (import-samgoe.html)
//  · 삼기연 임원방 자료(파일 · 기록물 HTML) → 공문·자료 (분류: 폴더와 이름으로 정함, 화면에서 바꿀 수 있음)
//  · 삼기연 갤러리 사진 · 유튜브 영상 → 활동 기록 (회차가 이미 홈페이지에 있으면 건너뜀)
//  · 삼기연 언론 보도 → 언론 보도 (같은 기사 주소는 건너뜀)
//  · 경품 당첨 인증 사진 → 같은 자리(prize-proofs/회차/묶음/…)로 — 인증 기록은 이미 이 홈페이지에 있고 사진만 복사
//  · 공문 · 자료마다 '구분'(3·1 만세길 걷기 제N회 / 본부 일반 자료)을 정해서 넣음 — 관리자 메뉴에서 걷기 자료를 회차별로 따로 묶음
//  필요한 로그인: 이 홈페이지 대표회장 · 서기 · 최고관리자 + 같은 브라우저의 삼기연 임원 로그인 (파일은 삼기연 저장소에서 바로 받아 옴)
//  삼기연 자료는 그대로 두고 복사만, 다시 눌러도 이미 가져온 것은 건너뜀 (파일 이름에 삼기연 쪽 번호를 남겨 둠: sg-…)
// ============================================================
(function () {
  var $ = function (id) { return document.getElementById(id); }, esc = window.mEsc;
  var SG_URL = window.SAMGOE_SUPABASE_URL, SG_KEY = window.SAMGOE_SUPABASE_KEY, SUPER = 'kds08200820@gmail.com';
  var neo = window.msb, sg = null, me = null, sgUser = null, busy = false;
  var DOCS_BUCKET = 'manse-docs', PHOTO_BUCKET = 'manse-photos', PROOF_BUCKET = 'prize-proofs', WALK_BASE = 2020;   // 제N회 = (2020 + N)년
  var CATS = ['공문(발신)', '공문(수신)', '공고·고시', '공모·협약·보조금', '회의록', '계획·보고', '행사 운영',
              '홍보·언론', '교회 연합 활동', '행정·대관', '회계·예산', '단체 기본', '명부·개인정보', '기타'];
  var CAT_CODE = { '공문(발신)': 'out', '공문(수신)': 'in', '공고·고시': 'notice', '공모·협약·보조금': 'grant', '회의록': 'minutes',
                   '계획·보고': 'report', '행사 운영': 'event', '홍보·언론': 'press', '교회 연합 활동': 'church', '행정·대관': 'admin', '회계·예산': 'finance',
                   '단체 기본': 'basic', '명부·개인정보': 'private', '기타': 'etc' };
  var MANSE_RE = /만세|걷기|삼일|스코필드/;   // 만세길 걷기 자료로 볼 이름 (3·1절 기념 예배 자료는 삼기연 것이라 뺌)

  function n0(v) { return Number(v || 0).toLocaleString('ko-KR'); }
  function kb(n) { return n ? (n >= 1048576 ? (n / 1048576).toFixed(1) + 'MB' : Math.max(1, Math.round(n / 1024)) + 'KB') : ''; }
  function extOf(name) { var m = /\.([A-Za-z0-9]{1,6})$/.exec(name || ''); return m ? m[1].toLowerCase() : 'bin'; }
  function say(id, cls, html) { var el = $(id); el.className = 'm-msg' + (cls ? ' ' + cls : ''); el.innerHTML = html || ''; }
  function err(e) { return window.mErr ? window.mErr(e) : ((e && e.message) || String(e)); }
  function log(s) { var el = $('log'); el.hidden = false; el.textContent += s + '\n'; el.scrollTop = el.scrollHeight; }
  async function all(c, table, sel, mod) {   // 1000줄씩 끝까지
    var out = [], from = 0;
    for (;;) {
      var q = c.from(table).select(sel); if (mod) q = mod(q);
      var r = await q.range(from, from + 999); if (r.error) throw r.error;
      out = out.concat(r.data || []); if (!r.data || r.data.length < 1000) return out; from += 1000;
    }
  }

  // ---------- 삼기연 로그인 (같은 브라우저 · walk-report.js 와 같은 방식) ----------
  function sgStorage() {
    function on() { try { return localStorage.getItem('sam_remember') !== '0'; } catch (_) { return true; } }
    return {
      getItem: function (k) { try { return (on() ? localStorage : sessionStorage).getItem(k); } catch (_) { return null; } },
      setItem: function (k, v) { try { (on() ? localStorage : sessionStorage).setItem(k, v); } catch (_) {} },
      removeItem: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (_) {} }
    };
  }
  async function connectSg() {
    if (!window.supabase || !SG_URL || !SG_KEY) return null;
    sg = window.supabase.createClient(SG_URL, SG_KEY, { auth: { persistSession: true, autoRefreshToken: false, detectSessionInUrl: false, storage: sgStorage() } });
    var s = await sg.auth.getSession(), u = s.data && s.data.session ? s.data.session.user : null;
    if (!u) return null;
    var officer = String(u.email || '').toLowerCase() === SUPER, name = '';
    try { var p = await sg.from('profiles').select('name,officer_role').eq('id', u.id).maybeSingle(); if (p.data) { officer = officer || !!p.data.officer_role; name = p.data.name || ''; } } catch (_) {}
    return { user: u, officer: officer, name: name };
  }

  // ---------- 분류 ----------
  var FOLDER_CAT = { '발신 공문': '공문(발신)', '수신 공문': '공문(수신)', '보조금·공모사업': '공모·협약·보조금', '임원회의': '회의록', '총회': '회의록', '월례회': '회의록',
                     '만세길 걷기': '행사 운영', '행사 진행 자료': '행사 운영', '언론 보도': '홍보·언론', '포스터·현수막': '행사 운영', '행사 사진': '행사 운영',
                     '회계·결산': '회계·예산', '규정·서식': '단체 기본', '3·1운동·만세길 역사': '계획·보고', '연합회 연혁·기록': '계획·보고' };
  function catFor(name, folder) {
    var s = name || '';
    if (/보도자료|언론/.test(s)) return '홍보·언론';
    if (/회칙|단체소개서|본부 자료|표창/.test(s)) return '단체 기본';
    if (/회의록|회의자료|임원회의/.test(s)) return '회의록';
    if (/순서지|명찰|명패|포스터|시안|봉투|현수막/.test(s)) return '행사 운영';
    if (/공고|선정결과/.test(s)) return '공고·고시';
    if (/지원신청서|교부|보조금|공모|자료집/.test(s)) return '공모·협약·보조금';
    if (/제안서|간담회|업무내용|전략|계획/.test(s)) return '계획·보고';
    if (FOLDER_CAT[folder]) return FOLDER_CAT[folder];
    if (/공문/.test(s)) return '공문(발신)';
    return '기타';
  }
  // '2022_(붙임1)…' · "2026.07.06 '…'" 같은 머리말을 떼고 밑줄을 띄어쓰기로
  function cleanTitle(t) {
    t = String(t || '').replace(/\.[A-Za-z0-9]{1,6}$/, '').replace(/^\d{4}(\.\d{2}\.\d{2})?\s*'(.*)'$/, '$2').replace(/^(19|20)\d{2}_/, '').replace(/^(19|20)\d{2}_/, '');
    return t.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function yearOf(f) {
    var m = /(19|20)\d{2}/.exec((f.title || '') + ' ' + f.name);
    return f.year || (m ? +m[0] : null) || +String(f.created_at || '').slice(0, 4) || new Date().getFullYear();
  }
  // 3·1 만세길 걷기 자료인지 — 이름이나 폴더에 '걷기'가 있으면 제N회 (없으면 그 해 회차), 역사 · 기념 자료는 본부 일반
  function walkFor(text, folder, year) {
    if (!/걷기/.test(text || '') && folder !== '만세길 걷기') return null;
    var n = walkNoOf(text) || (year - WALK_BASE);
    return n >= 1 && n <= 99 ? n : null;
  }
  function dateOf(name) {
    var m = /(20\d{2})[.\-]?(0[1-9]|1[0-2])[.\-]?(0[1-9]|[12]\d|3[01])(?!\d)/.exec(name || '');
    return m ? m[1] + '-' + m[2] + '-' + m[3] : null;
  }

  // ---------- 읽기 ----------
  var SRC = null, PLAN = null, HAVE = null;
  async function readSamgoe() {
    var r = await Promise.all([
      all(sg, 'officer_folders', 'id,name,parent_id'),
      all(sg, 'officer_files', 'id,title,name,path,url,size,mime,folder_id,author_name,created_at,year'),
      all(sg, 'gallery_posts', 'id,title,event_name,event_date,body,author_name,embed_url,embed_kind', function (q) { return q.order('event_date'); }),
      all(sg, 'press_articles', 'id,url,title,source,published,summary,image_url'),
      all(sg, 'walk_events', 'event,no,title,event_date,place')
    ]);
    var F = {}; r[0].forEach(function (f) { F[f.id] = f; });
    var fname = function (id) { var f = F[id]; if (!f) return ''; var p = f.parent_id && F[f.parent_id]; return (p ? p.name + ' › ' : '') + f.name; };
    var files = r[1].filter(function (f) { var fn = F[f.folder_id] ? F[f.folder_id].name : ''; return /^(officer\/|arcdb:)/.test(f.path) && (MANSE_RE.test((f.title || '') + ' ' + f.name) || fn === '만세길 걷기' || fn === '3·1운동·만세길 역사'); });
    files.forEach(function (f) { f.folder = F[f.folder_id] ? F[f.folder_id].name : ''; f.folderPath = fname(f.folder_id); });
    var posts = r[2].filter(function (p) { return MANSE_RE.test(p.title + ' ' + (p.event_name || '')); });
    var pid = posts.map(function (p) { return p.id; }), photos = [];
    for (var i = 0; i < pid.length; i += 50) {
      var ids = pid.slice(i, i + 50);
      photos = photos.concat(await all(sg, 'gallery_photos', 'id,post_id,path,url,caption,uploader_name,sort,created_at', function (q) { return q.in('post_id', ids).order('sort').order('created_at'); }));
    }
    var press = r[3].filter(function (p) { return /만세|3[.·]?1운동/.test(p.title || ''); });
    return { files: files, posts: posts, photos: photos, press: press, events: r[4] };
  }
  async function readManse() {
    var r = await Promise.all([
      all(neo, 'docs', 'id,path,orig_path'), all(neo, 'activities', 'id,title,date'), all(neo, 'activity_photos', 'id,path,event_key'),
      all(neo, 'activity_videos', 'event_key,yt_id'), all(neo, 'press', 'url'),
      all(neo, 'prize_claims', 'event,batch_id,photo_paths').catch(function () { return []; })   // 걷기 설치 SQL 전이면 없음
    ]);
    var sgId = function (p) { var m = /sg-([0-9a-f-]{36})/.exec(p || ''); return m ? m[1] : null; }, H = { doc: {}, act: {}, photo: {}, vid: {}, press: {} };
    r[0].forEach(function (d) { var a = sgId(d.path), b = sgId(d.orig_path); if (a) H.doc[a] = 1; if (b) H.doc[b] = 1; });
    r[1].forEach(function (a) { H.act[a.id] = a; });
    r[2].forEach(function (p) { var a = sgId(p.path); if (a) H.photo[a] = 1; });
    r[3].forEach(function (v) { H.vid[v.event_key + '|' + v.yt_id] = 1; });
    r[4].forEach(function (p) { if (p.url) H.press[p.url] = 1; });
    // 인증 사진 — 인증 기록이 가리키는 사진 중 이 홈페이지 저장소에 아직 없는 것 (서명 주소를 못 만들면 없는 것)
    var ev = {};
    r[5].forEach(function (c) { var e = ev[c.event] || (ev[c.event] = { event: c.event, batches: {}, paths: {} }); e.batches[c.batch_id] = 1; (c.photo_paths || []).forEach(function (p) { e.paths[p] = 1; }); });
    H.proofs = [];
    for (var k in ev) {
      var paths = Object.keys(ev[k].paths), miss = [];
      for (var i = 0; i < paths.length; i += 100) {
        var part = paths.slice(i, i + 100), sg_ = await neo.storage.from(PROOF_BUCKET).createSignedUrls(part, 60);
        if (sg_.error) { miss = miss.concat(part); continue; }
        var ok = {}; (sg_.data || []).forEach(function (x) { if (x && !x.error && (x.signedUrl || x.signedURL)) ok[x.path] = 1; });
        part.forEach(function (p) { if (!ok[p]) miss.push(p); });
      }
      H.proofs.push({ event: k, batches: Object.keys(ev[k].batches).length, total: paths.length, todo: miss });
    }
    H.proofs.sort(function (a, b) { return b.event.localeCompare(a.event); });
    return H;
  }

  // ---------- 계획 ----------
  function ytId(u) { var m = /(?:youtu\.be\/|v=|\/live\/|\/shorts\/|\/embed\/)([A-Za-z0-9_-]{11})/.exec(u || ''); return m ? m[1] : null; }
  function walkNoOf(t) { var m = /\((\d{1,2})회\)|제\s*(\d{1,2})\s*회/.exec(t || ''); return m ? +(m[1] || m[2]) : null; }
  function staticEvents() { return (window.MANSE_DATA && window.MANSE_DATA.events) || []; }
  function makePlan() {
    var S = SRC, H = HAVE, P = { docs: [], acts: [], press: [], proofs: [] };
    // 1) 공문·자료
    S.files.forEach(function (f) {
      var isHtml = /^arcdb:/.test(f.path), title = cleanTitle(f.title || f.name);
      var year = yearOf(f);
      P.docs.push({ id: f.id, f: f, title: title, cat: catFor(title + ' ' + f.name, f.folder), year: year, date: dateOf(f.name) || dateOf(f.title || ''),
        walk: walkFor(title + ' ' + f.name, f.folder, year), html: isHtml, ext: isHtml ? 'html' : extOf(f.name), have: !!H.doc[f.id], on: !H.doc[f.id] });
    });
    P.docs.sort(function (a, b) { return b.year - a.year || a.title.localeCompare(b.title, 'ko'); });
    // 2) 활동 기록 — 회차 사진이 홈페이지에 이미 있으면 건너뜀, 회차 사진이 없는 처음 기록(제1회 라이딩)엔 사진만 붙임
    var byPost = {}; S.photos.forEach(function (p) { (byPost[p.post_id] = byPost[p.post_id] || []).push(p); });
    var stat = staticEvents(), byWalk = {}; stat.forEach(function (e) { if (e.walk) byWalk[e.walk] = e; });
    var mainOfYear = {};   // 그해 걷기 본행사 글 (포스터 · 영상을 여기에 붙임)
    S.posts.forEach(function (p) {
      var n = walkNoOf(p.title), y = +String(p.event_date || '').slice(0, 4);
      if (n && (byPost[p.id] || []).length >= 3 && !/준비|회의|포스터|추첨/.test(p.title)) { if (!mainOfYear[y] || (byPost[p.id] || []).length > (byPost[mainOfYear[y].id] || []).length) mainOfYear[y] = p; }
    });
    S.posts.forEach(function (p) {
      var ph = byPost[p.id] || [], n = walkNoOf(p.title), y = +String(p.event_date || '').slice(0, 4), yt = ytId(p.embed_url), main = mainOfYear[y];
      var a = { id: p.id, p: p, title: p.title.replace(/^\[\d{4}\]\s*/, ''), date: p.event_date, photos: ph, yt: yt, skip: '', target: null, newAct: null };
      if (/추첨번호/.test(p.title)) a.skip = '내부 기록 (추첨 번호)';
      else if (n && byWalk[n] && (byWalk[n].photos || []).length) a.skip = '홈페이지에 이미 사진 ' + byWalk[n].photos.length + '장';
      else if (/탐방/.test(p.title) && stat.some(function (e) { return /탐방/.test(e.title) && String(e.date).slice(0, 4) === String(y) && (e.photos || []).length; })) a.skip = '홈페이지에 이미 있는 탐방 기록';
      else if (n && byWalk[n]) { a.target = byWalk[n].id; a.targetTitle = byWalk[n].title; }
      else if ((yt || /포스터/.test(p.title)) && main && main.id !== p.id) { a.target = 'a-' + main.id; a.targetTitle = cleanWalkTitle(main); }
      else {
        var cat = n ? '만세길 걷기' : /회의/.test(p.title) ? '단체 운영' : /탐방/.test(p.title) ? '역사 탐방' : /걷기/.test(p.title) ? '만세길 걷기' : '단체 운영';
        a.newAct = { id: p.id, date: p.event_date, title: n ? cleanWalkTitle(p) : (/회의/.test(p.title) && n == null && main ? cleanWalkTitle(main) + ' ' + (/2차/.test(p.title) ? '2차 준비회의' : '준비 임원회의') : a.title),
          cat: cat, walk: n, place: n ? (S.events.filter(function (e) { return e.no === n; })[0] || {}).place || null : null,
          summary: (p.body && p.body !== p.title && !/미모저모|^\s*$/.test(p.body)) ? p.body : null, creator_name: p.author_name || null };
        a.target = 'a-' + p.id; a.targetTitle = a.newAct.title;
      }
      if (!a.skip) {
        a.todoPhotos = ph.filter(function (x) { return !H.photo[x.id]; });
        a.todoVid = yt && !H.vid[a.target + '|' + yt] ? yt : null;
        a.haveAct = !!H.act[p.id];
        a.on = a.todoPhotos.length > 0 || !!a.todoVid || (a.newAct && !a.haveAct);
      }
      P.acts.push(a);
    });
    // 3) 언론 보도
    S.press.forEach(function (p) {
      var d = /(\d{4})[.\-](\d{1,2})[.\-](\d{1,2})/.exec(p.published || ''), pub = d ? d[1] + '-' + ('0' + d[2]).slice(-2) + '-' + ('0' + d[3]).slice(-2) : null;
      P.press.push({ id: p.id, p: p, pub: pub, year: pub ? +pub.slice(0, 4) : (+String(p.published || '').slice(0, 4) || new Date().getFullYear()), have: !!H.press[p.url], on: !H.press[p.url] });
    });
    // 4) 경품 당첨 인증 사진
    (H.proofs || []).forEach(function (x) { P.proofs.push({ event: x.event, batches: x.batches, total: x.total, todo: x.todo, have: !x.todo.length, on: x.todo.length > 0 }); });
    return P;
  }
  function cleanWalkTitle(p) { var n = walkNoOf(p.title); return n ? '제' + n + '회 3·1 만세길 걷기' : p.title.replace(/^\[\d{4}\]\s*/, ''); }

  // ---------- 화면 ----------
  function drawPlan() {
    var P = PLAN, h = '';
    var head = function (t, list, key) { return '<h3>' + t + ' <small>' + n0(list.filter(function (x) { return !x.skip && !x.have; }).length) + '건 가져올 수 있음 · 삼기연에 ' + n0(list.length) + '건</small>' +
      '<span class="pick"><button type="button" data-all="' + key + '">모두</button> · <button type="button" data-none="' + key + '">없음</button></span></h3>'; };
    var chk = function (key, i, x) { return '<td class="c"><input type="checkbox" data-k="' + key + '" data-i="' + i + '"' + (x.on ? ' checked' : '') + (x.have || x.skip ? ' disabled' : '') + '></td>'; };
    var top = new Date().getFullYear() - WALK_BASE + 1, NOS = []; for (var n = top; n >= 1; n--) NOS.push(n);
    var walkName = function (n) { return n ? '걷기 제' + n + '회' : '본부 일반'; };
    h += head('공문 · 자료', P.docs, 'docs') + '<div class="o-table-wrap"><table><tr><th></th><th>제목</th><th>구분</th><th>분류</th><th class="r">연도</th><th class="hide">삼기연 폴더</th><th class="r hide">크기</th></tr>';
    P.docs.forEach(function (d, i) {
      h += '<tr' + (d.have ? ' class="have"' : '') + '>' + chk('docs', i, d) + '<td><span class="t">' + esc(d.title) + '</span><span class="s">' + esc(d.f.name) + (d.html ? ' · 기록물(HTML)' : '') + (d.have ? ' · 이미 가져옴' : '') + '</span></td>' +
        '<td>' + (d.have ? '' : '<select data-walk="' + i + '" aria-label="구분"><option value="">본부 일반</option>' +
          NOS.concat(d.walk && NOS.indexOf(d.walk) < 0 ? [d.walk] : []).map(function (n) { return '<option value="' + n + '"' + (n === d.walk ? ' selected' : '') + '>' + walkName(n) + '</option>'; }).join('') + '</select>') + '</td>' +
        '<td>' + (d.have ? esc(d.cat) : '<select data-cat="' + i + '">' + CATS.map(function (c) { return '<option' + (c === d.cat ? ' selected' : '') + '>' + c + '</option>'; }).join('') + '</select>') + '</td>' +
        '<td class="r">' + d.year + '</td><td class="hide">' + esc(d.f.folderPath) + '</td><td class="r hide">' + kb(d.f.size) + '</td></tr>';
    });
    h += '</table></div>';
    h += head('활동 기록 · 사진 · 영상', P.acts, 'acts') + '<div class="o-table-wrap"><table><tr><th></th><th>삼기연 갤러리 글</th><th>날짜</th><th>가져올 것</th><th>이 홈페이지에서</th></tr>';
    P.acts.forEach(function (a, i) {
      var what = a.skip ? '<span class="chip gray">건너뜀</span> ' + esc(a.skip) : [a.todoPhotos.length ? '사진 ' + n0(a.todoPhotos.length) + '장' : '', a.todoVid ? '영상 1' : '', (!a.todoPhotos.length && !a.todoVid) ? '<span class="chip ok">이미 가져옴</span>' : ''].filter(Boolean).join(' · ');
      h += '<tr' + (a.skip || !a.on ? ' class="have"' : '') + '>' + chk('acts', i, Object.assign({}, a, { have: !a.on })) + '<td><span class="t">' + esc(a.p.title) + '</span><span class="s">사진 ' + a.photos.length + '장' + (a.yt ? ' · 유튜브' : '') + (a.p.author_name ? ' · ' + esc(a.p.author_name) : '') + '</span></td>' +
        '<td class="r">' + esc(a.date || '') + '</td><td>' + what + '</td><td>' + (a.skip ? '' : (a.newAct && !a.haveAct ? '새 기록: ' : '기록에 추가: ') + esc(a.targetTitle || '')) + '</td></tr>';
    });
    h += '</table></div>';
    h += head('언론 보도', P.press, 'press') + '<div class="o-table-wrap"><table><tr><th></th><th>기사</th><th>언론사</th><th class="r">보도일</th></tr>';
    P.press.forEach(function (x, i) {
      h += '<tr' + (x.have ? ' class="have"' : '') + '>' + chk('press', i, x) + '<td><span class="t">' + esc(x.p.title) + '</span>' + (x.have ? '<span class="s">이미 있음</span>' : '') + '</td><td>' + esc(x.p.source || '') + '</td><td class="r">' + esc(x.p.published || '') + '</td></tr>';
    });
    h += '</table></div>';
    if (P.proofs.length) {
      h += head('경품 당첨 인증 사진', P.proofs, 'proofs') + '<div class="o-table-wrap"><table><tr><th></th><th>회차</th><th class="r">인증 묶음</th><th class="r">사진</th><th>가져올 것</th></tr>';
      P.proofs.forEach(function (x, i) {
        var ev = (SRC.events || []).filter(function (e) { return e.event === x.event; })[0];
        h += '<tr' + (x.have ? ' class="have"' : '') + '>' + chk('proofs', i, x) + '<td><span class="t">' + esc(ev ? ev.title || ('제' + ev.no + '회 3·1 만세길 걷기') : x.event) + '</span><span class="s">' + esc(x.event) + '</span></td>' +
          '<td class="r">' + n0(x.batches) + '</td><td class="r">' + n0(x.total) + '장</td><td>' + (x.todo.length ? '사진 ' + n0(x.todo.length) + '장' : '<span class="chip ok">이미 가져옴</span>') + '</td></tr>';
      });
      h += '</table></div>';
    }
    $('plan').innerHTML = h;
    $('plan').querySelectorAll('[data-all],[data-none]').forEach(function (b) {
      b.addEventListener('click', function () { var k = b.dataset.all || b.dataset.none, on = !!b.dataset.all; $('plan').querySelectorAll('input[data-k="' + k + '"]:not(:disabled)').forEach(function (c) { c.checked = on; }); syncGo(); });
    });
    $('plan').addEventListener('change', syncGo);
    syncGo();
  }
  function picked() {
    var out = { docs: [], acts: [], press: [], proofs: [] };
    $('plan').querySelectorAll('input[data-k]:checked:not(:disabled)').forEach(function (c) { out[c.dataset.k].push(PLAN[c.dataset.k][+c.dataset.i]); });
    out.docs.forEach(function (d) {
      var i = PLAN.docs.indexOf(d), s = $('plan').querySelector('select[data-cat="' + i + '"]'), w = $('plan').querySelector('select[data-walk="' + i + '"]');
      if (s) d.cat = s.value; if (w) d.walk = parseInt(w.value, 10) || null;
    });
    return out;
  }
  function syncGo() {
    var p = picked(), n = p.docs.length + p.acts.reduce(function (s, a) { return s + a.todoPhotos.length + (a.todoVid ? 1 : 0) + (a.newAct && !a.haveAct ? 1 : 0); }, 0) + p.press.length + p.proofs.reduce(function (s, x) { return s + x.todo.length; }, 0);
    $('goAll').disabled = busy || !n; $('goAll').textContent = n ? '가져오기 (' + n0(n) + '건)' : '가져올 것이 없습니다';
  }
  async function scan() {
    $('scanSt').textContent = '삼괴연합회 홈페이지와 이 홈페이지의 자료를 읽는 중…'; $('plan').innerHTML = '';
    try {
      var r = await Promise.all([readSamgoe(), readManse()]); SRC = r[0]; HAVE = r[1]; PLAN = makePlan();
      $('scanSt').innerHTML = '삼기연 임원방 자료 <b>' + n0(PLAN.docs.length) + '</b>건 · 갤러리 글 <b>' + n0(PLAN.acts.length) + '</b>개 (사진 ' + n0(SRC.photos.length) + '장) · 기사 <b>' + n0(PLAN.press.length) + '</b>건' +
        (PLAN.proofs.length ? ' · 경품 인증 사진 <b>' + n0(PLAN.proofs.reduce(function (t, x) { return t + x.total; }, 0)) + '</b>장' : '') +
        '을 찾았습니다. 공문 · 자료는 <b>구분</b>(3·1 만세길 걷기 회차 / 본부 일반)과 <b>분류</b>를 확인하고 가져올 것을 고르세요.';
      drawPlan(); $('c3').classList.remove('off');
    } catch (ex) { $('scanSt').innerHTML = '<span class="chip bad">읽지 못함</span> ' + esc(err(ex)); }
  }

  // ---------- 가져오기 ----------
  var done = 0, total = 0, fails = 0;
  function tick(label) { done++; $('bar').firstChild.style.width = Math.round(done / Math.max(1, total) * 100) + '%'; $('prog').textContent = label + ' (' + n0(done) + ' / ' + n0(total) + ')'; }
  function fail(what, ex) { fails++; log('못 가져옴 — ' + what + ': ' + err(ex)); }
  async function fetchBlob(url) {
    var r = await fetch(url, { mode: 'cors', credentials: 'omit' });
    if (!r.ok) throw new Error('삼기연 저장소에서 받지 못했습니다 (' + r.status + ')');
    return await r.blob();
  }
  async function put(bucket, path, blob, type) {
    var u = await neo.storage.from(bucket).upload(path, blob, { contentType: type || blob.type || 'application/octet-stream', upsert: false });
    if (u.error && !/exist|duplicate/i.test(u.error.message || '') && String(u.error.statusCode) !== '409') throw u.error;
  }
  async function insertOne(table, row, ignoreDup) {
    var r = await neo.from(table).insert(row);
    if (r.error && !(ignoreDup && /duplicate|unique/i.test(r.error.message || ''))) throw r.error;
  }
  function wrapHtml(html, title) {
    if (/<html[\s>]/i.test(html)) return html;
    return '<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>' + esc(title) + '</title>' +
      '<style>body{max-width:900px;margin:24px auto;padding:0 16px;font-family:"Pretendard Variable",Pretendard,"Apple SD Gothic Neo","Malgun Gothic",sans-serif;line-height:1.7;color:#222}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body>' + html + '</body></html>';
  }
  async function loadImg(blob) { return new Promise(function (ok, no) { var u = URL.createObjectURL(blob), im = new Image(); im.onload = function () { URL.revokeObjectURL(u); ok(im); }; im.onerror = function () { URL.revokeObjectURL(u); no(new Error('사진을 읽지 못했습니다')); }; im.src = u; }); }
  async function shrink(blob, max, q) {
    var src; try { src = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (_) { src = await loadImg(blob); }
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, k = Math.min(1, max / Math.max(w, h));
    var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    var out = await new Promise(function (r) { cv.toBlob(r, 'image/webp', q); });
    if (!out || out.type !== 'image/webp') out = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', q); });
    return { blob: out, w: cv.width, h: cv.height };
  }
  async function pool(items, n, fn) { var i = 0; async function w() { while (i < items.length) { var x = items[i++]; await fn(x); } } var ws = []; for (var k = 0; k < Math.min(n, items.length); k++) ws.push(w()); await Promise.all(ws); }
  function who(name) { return name === '기록물' ? '삼괴연합회 기록물' : (name || '삼괴연합회'); }

  async function importAll() {
    if (busy) return; var p = picked();
    busy = true; $('goAll').disabled = true; done = 0; fails = 0; var ok = 0;
    total = p.docs.length + p.acts.reduce(function (s, a) { return s + a.todoPhotos.length + (a.todoVid ? 1 : 0) + (a.newAct && !a.haveAct ? 1 : 0); }, 0) + p.press.length + p.proofs.reduce(function (s, x) { return s + x.todo.length; }, 0);
    $('bar').hidden = false; $('log').textContent = ''; $('log').hidden = true;
    // 1) 공문·자료 — 파일을 삼기연 저장소에서 받아 이 홈페이지 저장소로, 기록물 HTML은 글을 파일로
    await pool(p.docs, 3, async function (d) {
      try {
        var f = d.f, path = d.year + '/' + (CAT_CODE[d.cat] || 'etc') + '/sg-' + f.id + '.' + d.ext, blob, mime;
        if (d.html) {
          var r = await sg.from('archive_docs').select('html').eq('id', f.path.slice(6)).single(); if (r.error) throw r.error;
          blob = new Blob([wrapHtml(r.data.html || '', d.title)], { type: 'text/html; charset=utf-8' }); mime = 'text/html';
        } else { blob = await fetchBlob(f.url); mime = f.mime || blob.type || 'application/octet-stream'; }
        await put(DOCS_BUCKET, path, blob, mime);
        await insertOne('docs', { year: d.year, category: d.cat, title: d.title, walk_no: d.walk || null, doc_date: d.date, date_text: null, doc_no: null,
          note: '삼괴연합회 임원방에서 가져옴' + (f.folderPath ? ' (' + f.folderPath + ')' : ''), path: path, mime: mime, size: blob.size, orig_path: null, orig_name: null,
          sensitive: d.cat === '명부·개인정보', uploaded_by: me.id, uploader_name: who(f.author_name), created_at: f.created_at || undefined });
        ok++;
      } catch (ex) { fail('자료 "' + d.title + '"', ex); }
      tick('공문 · 자료');
    });
    // 2) 활동 기록 · 사진 · 영상
    for (var i = 0; i < p.acts.length; i++) {
      var a = p.acts[i];
      if (a.newAct && !a.haveAct) {
        try {
          await insertOne('activities', Object.assign({}, a.newAct, { created_by: me.id }));
          a.haveAct = true; ok++;
        } catch (ex) { fail('활동 기록 "' + a.newAct.title + '"', ex); tick('활동 기록'); continue; }
        tick('활동 기록');
      }
      var key = a.target;
      await pool(a.todoPhotos, 3, async function (ph) {
        try {
          var src = await fetchBlob(ph.url), big = await shrink(src, 1600, 0.8), small = await shrink(src, 480, 0.7);
          var ext = big.blob.type === 'image/webp' ? 'webp' : 'jpg', path = key + '/sg-' + ph.id + '.' + ext, tpath = key + '/t/sg-' + ph.id + '.' + ext;
          await put(PHOTO_BUCKET, path, big.blob); await put(PHOTO_BUCKET, tpath, small.blob);
          await insertOne('activity_photos', { event_key: key, path: path, thumb_path: tpath, w: big.w, h: big.h, caption: ph.caption || null, sort: ph.sort || 0,
            uploaded_by: me.id, uploader_name: ph.uploader_name || a.p.author_name || '삼괴연합회', created_at: ph.created_at || undefined });
          ok++;
        } catch (ex) { fail('사진 ' + (ph.caption || ph.id.slice(0, 8)), ex); }
        tick('활동 사진 — ' + a.targetTitle);
      });
      if (a.todoVid) {
        try { await insertOne('activity_videos', { event_key: key, yt_id: a.todoVid, title: a.p.title, sort: 0, added_by: me.id, adder_name: a.p.author_name || '삼괴연합회' }, true); ok++; }
        catch (ex) { fail('영상 ' + a.p.title, ex); }
        tick('활동 영상');
      }
    }
    // 3) 언론 보도 (대표 사진은 홈페이지에서 자동으로 채움)
    for (var j = 0; j < p.press.length; j++) {
      var x = p.press[j];
      try {
        await insertOne('press', { url: x.p.url, title: x.p.title, source: x.p.source || null, published: x.pub, year: x.year, summary: x.p.summary || null,
          image_path: null, image_url: null, sort: 0, created_by: me.id, creator_name: '삼괴연합회 홈페이지' }, true);
        ok++;
      } catch (ex) { fail('기사 "' + x.p.title + '"', ex); }
      tick('언론 보도');
    }
    // 4) 경품 당첨 인증 사진 — 삼기연 저장소에서 받아 같은 이름으로
    for (var k = 0; k < p.proofs.length; k++) {
      await pool(p.proofs[k].todo, 3, async function (path) {
        try {
          var dl = await sg.storage.from(PROOF_BUCKET).download(path); if (dl.error) throw dl.error;
          var type = dl.data.type && /^image\//.test(dl.data.type) ? dl.data.type : (/\.png$/i.test(path) ? 'image/png' : /\.jpe?g$/i.test(path) ? 'image/jpeg' : 'image/webp');
          await put(PROOF_BUCKET, path, dl.data, type); ok++;
        } catch (ex) { fail('인증 사진 ' + path, ex); }
        tick('경품 인증 사진');
      });
    }
    busy = false;
    $('prog').innerHTML = fails
      ? '<b>' + n0(ok) + '건 가져왔고 ' + n0(fails) + '건은 못 가져왔습니다.</b> 아래 기록을 확인하고 <b>다시 누르면</b> 못 가져온 것만 다시 합니다.'
      : '<b>다 가져왔습니다 (' + n0(ok) + '건).</b> <a href="officer.html">관리자 메뉴</a> · <a href="./#activity">활동 기록</a> · <a href="./#press">언론 보도</a>에서 확인해 보세요.';
    await scan();
  }

  // ---------- 시작 ----------
  async function start() {
    if (!neo || !window.supabase) { $('newSt').textContent = '로그인 기능을 불러오지 못했습니다. 새로 고쳐 주세요.'; return; }
    var u = await window.mRequireLogin(); if (!u) return;
    me = u; var perms = await window.mPerms(true);
    if (!perms.manager) { $('newSt').innerHTML = '<span class="chip bad">권한 없음</span> 대표회장 · 서기 · 최고관리자만 가져올 수 있습니다. (지금 로그인: ' + esc(u.email) + ')'; $('sgSt').hidden = true; return; }
    $('newSt').innerHTML = '<span class="chip ok">삼일만세운동본부</span> <b>' + esc(u.email) + '</b> · ' + (perms.admin ? '최고관리자' : esc(perms.role || '운영임원'));
    sgUser = await connectSg();
    var next = encodeURIComponent('manse/import-samgoe.html');
    if (!sgUser) { $('sgSt').innerHTML = '<span class="chip gray">삼괴연합회 로그인 필요</span> 이 브라우저에서 삼괴연합회 홈페이지에 <b>임원 계정</b>으로 로그인하면 자료를 읽을 수 있습니다. <a class="m-btn ghost sm" href="../login.html?next=' + next + '">삼괴연합회 로그인 →</a>'; return; }
    if (!sgUser.officer) { $('sgSt').innerHTML = '<span class="chip bad">삼괴연합회 임원 아님</span> <b>' + esc(sgUser.user.email) + '</b>(으)로 로그인되어 있지만 삼괴연합회 임원 명단에 없어 임원방 자료를 읽을 수 없습니다.'; return; }
    $('sgSt').innerHTML = '<span class="chip ok">삼괴연합회</span> <b>' + esc(sgUser.user.email) + '</b>' + (sgUser.name ? ' · ' + esc(sgUser.name) : '') + ' (임원)';
    $('c2').classList.remove('off');
    $('goAll').addEventListener('click', function () {
      if (!confirm('고른 자료를 삼괴연합회 홈페이지에서 이 홈페이지로 복사합니다. 삼기연 쪽은 그대로 남습니다.\n\n계속할까요?')) return;
      importAll().catch(function (ex) { busy = false; $('goAll').disabled = false; $('prog').textContent = '멈췄습니다: ' + err(ex) + ' — 다시 누르면 이어서 가져옵니다.'; });
    });
    await scan();
  }
  start();
})();
