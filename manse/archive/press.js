// 삼일만세운동본부 — 언론 보도 갤러리 (manse-press-setup.sql 의 press 표 · Edge Function press-meta)
//  - 누구에게나: 대표 사진 카드 갤러리 · 연도별 보기 · 카드를 누르면 기사로
//  - 임원에게: [+ 기사 추가] → 기사 주소만 넣으면 제목 · 언론사 · 날짜 · 요약 · 대표 사진을 채움
//              사진을 못 가져오면 창의 사진 칸이나 갤러리 카드 위에 사진을 끌어다 놓기 · 카드마다 고치기 · 지우기
//  표가 아직 없으면(설치 전) 홈페이지 파일에 있던 목록(data.js)을 같은 모양으로 보여 줌
(function () {
  var D = window.MANSE_DATA || {}, sb = window.msb, esc = window.mEsc;
  var $ = function (id) { return document.getElementById(id); };
  var BUCKET = 'manse-photos', FN = String(window.MANSE_SUPABASE_URL || '') + '/functions/v1/press-meta';
  var ITEMS = [], fromDb = false, year = '', perms = { officer: false, manager: false }, me = null, myName = '';
  var grid = $('pressList'), years = $('pressYears'), bar = $('pressAdmin');
  if (!grid) return;

  function staticItems() {
    var out = [];
    (D.press || []).forEach(function (g) { g.items.forEach(function (it, i) { out.push({ id: null, year: g.year, source: it[0], title: it[1], url: it[2] || '', sort: g.items.length - i }); }); });
    return out;
  }
  function imgOf(p) { return p.image_path && sb ? sb.storage.from(BUCKET).getPublicUrl(p.image_path).data.publicUrl : (p.image_url || ''); }
  function dot(d) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || ''); return m ? m[1] + '.' + m[2] + '.' + m[3] : ''; }
  function canDel(p) { return !!me && !!p.id && (perms.manager || p.created_by === me.id); }
  function sorted(list) {
    return list.slice().sort(function (a, b) { return (b.year - a.year) || String(b.published || '').localeCompare(String(a.published || '')) || ((b.sort || 0) - (a.sort || 0)); });
  }

  // ---------- 그리기 ----------
  function render() {
    var ys = Array.from(new Set(ITEMS.map(function (p) { return p.year; }))).sort(function (a, b) { return b - a; });
    if (year && ys.indexOf(+year) < 0) year = '';
    years.innerHTML = ys.length > 1 ? ['<button type="button" class="mz-chip" data-y="" aria-pressed="' + (!year) + '">전체 ' + ITEMS.length + '</button>'].concat(ys.map(function (y) {
      var n = ITEMS.filter(function (p) { return p.year === y; }).length;
      return '<button type="button" class="mz-chip" data-y="' + y + '" aria-pressed="' + (String(y) === String(year)) + '">' + y + '년 ' + n + '</button>';
    })).join('') : '';
    var list = sorted(ITEMS.filter(function (p) { return !year || String(p.year) === String(year); }));
    if (!list.length) { grid.innerHTML = '<p class="mz-press-empty">아직 올린 언론 보도가 없습니다.</p>'; return; }
    grid.innerHTML = list.map(function (p) {
      var img = imgOf(p), href = p.url ? ' href="' + esc(p.url) + '" target="_blank" rel="noopener"' : '';
      var tag = p.url ? 'a' : 'div';
      var ph = img ? '<img src="' + esc(img) + '" alt="" loading="lazy" referrerpolicy="no-referrer">' : '<span class="none"><b>' + esc(p.source || '언론 보도') + '</b><small>PRESS</small></span>';
      var tools = perms.officer && fromDb && p.id ? '<div class="tools"><button type="button" class="mz-btn ghost sm-btn" data-edit="' + p.id + '">고치기</button>' +
        (canDel(p) ? '<button type="button" class="mz-btn ghost sm-btn danger" data-del="' + p.id + '">지우기</button>' : '') +
        '<span class="hint">사진을 이 카드에 끌어다 놓으면 바뀝니다</span></div>' : '';
      return '<article class="mz-pr" data-id="' + (p.id || '') + '"><' + tag + ' class="ph"' + href + '>' + ph + '</' + tag + '>' +
        '<div class="bd"><div class="meta"><span class="src">' + esc(p.source || '언론') + '</span><span>' + esc(dot(p.published) || (p.year + '년')) + '</span></div>' +
        '<h3>' + (p.url ? '<a' + href + '>' + esc(p.title) + '</a>' : esc(p.title)) + '</h3>' + tools + '</div></article>';
    }).join('');
    // 사진을 못 불러오면(기사 사이트가 막음) 언론사 이름 카드로
    grid.querySelectorAll('.ph img').forEach(function (im) {
      im.addEventListener('error', function () { var p = ITEMS.find(function (x) { return x.id && x.id === im.closest('.mz-pr').dataset.id; }) || {}; im.outerHTML = '<span class="none"><b>' + esc(p.source || '언론 보도') + '</b><small>PRESS</small></span>'; });
    });
  }
  years.addEventListener('click', function (e) { var b = e.target.closest('[data-y]'); if (!b) return; year = b.dataset.y; render(); });

  async function load() {
    if (!sb) { ITEMS = staticItems(); render(); return; }
    var r = await sb.from('press').select('*').order('year', { ascending: false });
    if (r.error) { fromDb = false; ITEMS = staticItems(); }          // 표가 아직 없으면(설치 전) 파일의 목록
    else { fromDb = true; ITEMS = r.data || []; }
    render(); drawBar();
  }

  // ---------- 임원: 사진 줄여서 올리기 ----------
  function uid() { try { return crypto.randomUUID(); } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); } }
  async function shrink(file, max, q) {
    var src; try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
    catch (_) { src = await new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = URL.createObjectURL(file); }); }
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, k = Math.min(1, max / Math.max(w, h));
    var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    var blob = await new Promise(function (r) { cv.toBlob(r, 'image/webp', q); });
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', q); });
    return blob;
  }
  async function putImage(file) {
    if (!file || !/^image\//.test(file.type || '')) throw new Error('사진 파일(jpg · png · webp)을 넣어 주세요.');
    var blob = await shrink(file, 1280, 0.82), path = 'press/' + uid() + (blob.type === 'image/webp' ? '.webp' : '.jpg');
    var u = await sb.storage.from(BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
    if (u.error) throw u.error;
    return path;
  }
  function dropFile(e) { var f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; return f && /^image\//.test(f.type) ? f : null; }

  // ---------- 임원: 관리 막대 · 카드 단추 · 카드에 사진 끌어다 놓기 ----------
  function drawBar() {
    if (!bar) return;
    if (!perms.officer) { bar.hidden = true; return; }
    bar.hidden = false;
    var noImg = ITEMS.filter(function (p) { return p.id && p.url && !p.image_path && !p.image_url; });
    bar.innerHTML = fromDb
      ? '<button type="button" class="mz-btn navy sm-btn" id="prAdd">+ 기사 추가</button>' +
        (noImg.length ? '<button type="button" class="mz-btn ghost sm-btn" id="prFill">사진 없는 기사 ' + noImg.length + '건 사진 가져오기</button>' : '') +
        '<span class="mz-admin-msg" id="prBarMsg">기사 주소만 넣으면 제목 · 언론사 · 날짜 · 사진이 채워집니다. 사진이 없거나 틀리면 카드 위에 사진을 <b>끌어다 놓으세요</b>.</span>'
      : '<span class="mz-admin-msg">언론 보도를 홈페이지에서 고치려면 먼저 만세운동본부 Supabase에서 설치 SQL(manse-press-setup.sql)을 실행해 주세요.</span>';
    if ($('prAdd')) $('prAdd').addEventListener('click', function () { openForm(null); });
    if ($('prFill')) $('prFill').addEventListener('click', function () { fillPhotos(noImg, this); });
  }
  grid.addEventListener('click', async function (e) {
    var b = e.target.closest('[data-edit],[data-del]'); if (!b) return;
    e.preventDefault();
    var p = ITEMS.find(function (x) { return x.id === (b.dataset.edit || b.dataset.del); }); if (!p) return;
    if (b.dataset.edit) return openForm(p);
    if (!confirm('"' + p.title + '" 기사를 언론 보도에서 지울까요?')) return;
    var d = await sb.from('press').delete().eq('id', p.id).select('id');
    if (d.error || !d.data || !d.data.length) return alert(d.error ? window.mErr(d.error) : '지우지 못했습니다. 올린 임원 · 대표회장 · 서기만 지울 수 있습니다.');
    if (p.image_path) { try { await sb.storage.from(BUCKET).remove([p.image_path]); } catch (_) {} }
    load();
  });
  ['dragenter', 'dragover'].forEach(function (t) {
    grid.addEventListener(t, function (e) { var c = e.target.closest('.mz-pr'); if (!perms.officer || !fromDb || !c || !c.dataset.id) return; e.preventDefault(); c.classList.add('drop'); });
  });
  grid.addEventListener('dragleave', function (e) { var c = e.target.closest('.mz-pr'); if (c && !c.contains(e.relatedTarget)) c.classList.remove('drop'); });
  grid.addEventListener('drop', async function (e) {
    var c = e.target.closest('.mz-pr'); if (!perms.officer || !fromDb || !c || !c.dataset.id) return;
    e.preventDefault(); c.classList.remove('drop');
    var f = dropFile(e), p = ITEMS.find(function (x) { return x.id === c.dataset.id; }); if (!f || !p) return;
    c.insertAdjacentHTML('beforeend', '<div class="busy">사진 올리는 중…</div>');
    try {
      var path = await putImage(f), old = p.image_path;
      var u = await sb.from('press').update({ image_path: path, image_url: null }).eq('id', p.id).select('id');
      if (u.error || !u.data || !u.data.length) throw (u.error || new Error('바꾸지 못했습니다.'));
      if (old) { try { await sb.storage.from(BUCKET).remove([old]); } catch (_) {} }
    } catch (ex) { alert(window.mErr(ex)); }
    load();
  });

  // 기사 주소로 정보 읽기 (Edge Function press-meta)
  async function readMeta(u) {
    var s = await sb.auth.getSession(), tok = s.data && s.data.session && s.data.session.access_token;
    var r = await fetch(FN, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: window.MANSE_SUPABASE_KEY, Authorization: 'Bearer ' + tok }, body: JSON.stringify({ url: u }) });
    var j = {}; try { j = await r.json(); } catch (_) {}
    if (!r.ok) throw new Error(j.error || '기사 정보를 가져오지 못했습니다.');
    return j;
  }
  // 사진 없는 기사들의 대표 사진(과 비어 있는 날짜)을 한꺼번에
  async function fillPhotos(list, btn) {
    btn.disabled = true; var ok = 0, miss = 0, m = $('prBarMsg');
    for (var i = 0; i < list.length; i++) {
      var p = list[i]; m.textContent = '사진 가져오는 중… ' + (i + 1) + ' / ' + list.length + ' — ' + (p.source || '');
      try {
        var j = await readMeta(p.url), row = {};
        if (j.image_path || j.image_url) { row.image_path = j.image_path || null; row.image_url = j.image_path ? null : (j.image_url || null); }
        if (!p.published && j.published && +j.published.slice(0, 4) === p.year) row.published = j.published;
        if (Object.keys(row).length) { var u = await sb.from('press').update(row).eq('id', p.id); if (u.error) throw u.error; }
        if (row.image_path || row.image_url) ok++; else miss++;
      } catch (_) { miss++; }
    }
    await load();
    if ($('prBarMsg')) $('prBarMsg').textContent = '사진 ' + ok + '건을 넣었습니다.' + (miss ? ' ' + miss + '건은 못 가져왔습니다 — 그 카드 위에 사진을 끌어다 놓아 주세요.' : '');
  }

  // ---------- 임원: 기사 추가 · 고치기 창 ----------
  var M = $('prModal'), F = $('prForm'), editing = null, img = { path: '', url: '' }, lastUrl = '', busy = false, dirty = false;
  function msg(t, ok) { var m = $('prMsg'); m.textContent = t || ''; m.className = 'mz-admin-msg' + (ok ? ' ok' : ''); }
  function preview() {
    var src = img.path ? sb.storage.from(BUCKET).getPublicUrl(img.path).data.publicUrl : img.url;
    $('prDrop').innerHTML = src ? '<img src="' + esc(src) + '" alt="" referrerpolicy="no-referrer"><span>다른 사진으로 바꾸려면 여기에 끌어다 놓거나 누르세요</span>'
      : '<b>대표 사진</b><span>사진을 여기에 끌어다 놓거나 눌러서 고르세요 (기사 주소를 넣으면 자동으로 채워집니다)</span>';
  }
  function openForm(p) {
    editing = p; dirty = false; lastUrl = p ? (p.url || '') : '';
    $('prHead').textContent = p ? '언론 보도 고치기' : '언론 보도 추가';
    $('pUrl').value = p ? (p.url || '') : ''; $('pTitle').value = p ? p.title : ''; $('pSource').value = p ? (p.source || '') : '';
    $('pDate').value = p ? (p.published || '') : ''; $('pYear').value = p ? p.year : new Date().getFullYear(); $('pSum').value = p ? (p.summary || '') : '';
    img = { path: p ? (p.image_path || '') : '', url: p ? (p.image_url || '') : '' };
    preview(); msg('');
    M.classList.add('on'); document.body.classList.add('mz-lock');
    (p ? $('pTitle') : $('pUrl')).focus();
  }
  function closeForm(force) {
    if (!force && busy) return;
    if (!force && dirty && !confirm('저장하지 않은 내용이 있습니다. 닫을까요?')) return;
    M.classList.remove('on');
    if (!document.querySelector('.mz-modal.on, #evDlg.on')) document.body.classList.remove('mz-lock');
  }
  if (M && F) {
    var down = false;
    M.addEventListener('mousedown', function (e) { down = e.target === M; });
    M.addEventListener('click', function (e) { if ((down && e.target === M) || e.target.closest('[data-close]')) closeForm(); down = false; });
    M.addEventListener('keydown', function (e) { if (e.key === 'Escape') { e.stopPropagation(); closeForm(); } });
    F.addEventListener('input', function () { dirty = true; });
    $('pDate').addEventListener('change', function () { if (this.value) $('pYear').value = this.value.slice(0, 4); });

    // 기사 주소 → 자동 채우기
    async function fetchMeta() {
      var u = $('pUrl').value.trim();
      if (!/^https?:\/\/\S+$/i.test(u) || u === lastUrl || busy) return;
      lastUrl = u; busy = true; $('pFetch').disabled = true; msg('기사 정보를 불러오는 중…', true);
      try {
        var j = await readMeta(u);
        if (j.title) $('pTitle').value = j.title;
        if (j.source) $('pSource').value = j.source;
        if (j.published) { $('pDate').value = j.published; $('pYear').value = j.published.slice(0, 4); }
        if (j.summary) $('pSum').value = j.summary;
        if (j.image_path || j.image_url) { img = { path: j.image_path || '', url: j.image_path ? '' : (j.image_url || '') }; preview(); }
        var miss = [!j.title && '제목', !j.source && '언론사', !j.published && '날짜', !(j.image_path || j.image_url) && '사진'].filter(Boolean);
        msg(miss.length ? '불러왔습니다. 못 찾은 것(' + miss.join(' · ') + ')은 직접 넣어 주세요' + (miss.indexOf('사진') >= 0 ? ' — 사진은 아래 칸에 끌어다 놓으면 됩니다.' : '.')
          : (j.image_url && !j.image_path ? '불러왔습니다. 사진은 기사 사이트의 것을 그대로 씁니다 — 안 보이면 아래 칸에 사진을 끌어다 놓아 주세요.' : '불러왔습니다. 확인하고 저장하세요.'), true);
      } catch (ex) { msg(String((ex && ex.message) || ex) + (/직접/.test(String(ex && ex.message)) ? '' : ' 제목 · 언론사 · 날짜를 직접 적고 사진은 아래 칸에 끌어다 놓아 주세요.')); }
      busy = false; $('pFetch').disabled = false;
    }
    $('pUrl').addEventListener('paste', function () { setTimeout(fetchMeta, 0); });
    $('pUrl').addEventListener('change', fetchMeta);
    $('pFetch').addEventListener('click', function () { lastUrl = ''; fetchMeta(); });

    // 사진 칸: 끌어다 놓기 · 눌러서 고르기
    var dz = $('prDrop'), pick = $('pFile');
    async function takeFile(f) {
      if (!f) return;
      busy = true; msg('사진 올리는 중…', true);
      try { img = { path: await putImage(f), url: '' }; dirty = true; preview(); msg('사진을 넣었습니다.', true); }
      catch (ex) { msg(window.mErr(ex)); }
      busy = false;
    }
    dz.addEventListener('click', function () { pick.click(); });
    dz.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick.click(); } });
    pick.addEventListener('change', function () { takeFile(this.files[0]); this.value = ''; });
    ['dragenter', 'dragover'].forEach(function (t) { dz.addEventListener(t, function (e) { e.preventDefault(); dz.classList.add('over'); }); });
    dz.addEventListener('dragleave', function () { dz.classList.remove('over'); });
    dz.addEventListener('drop', function (e) { e.preventDefault(); dz.classList.remove('over'); takeFile(dropFile(e)); });

    F.addEventListener('submit', async function (e) {
      e.preventDefault(); if (busy) return;
      var url = $('pUrl').value.trim(), row = { url: url || null, title: $('pTitle').value.trim(), source: $('pSource').value.trim() || null,
        published: $('pDate').value || null, year: parseInt($('pYear').value, 10) || new Date().getFullYear(), summary: $('pSum').value.trim() || null,
        image_path: img.path || null, image_url: img.path ? null : (img.url || null) };
      if (url && !/^https?:\/\/\S+$/i.test(url)) return msg('기사 주소는 https:// 로 시작해야 합니다.');
      if (!row.title) { $('pTitle').focus(); return msg('제목을 넣어 주세요.'); }
      busy = true; var btn = F.querySelector('button[type=submit]'); btn.disabled = true; msg('저장하는 중…', true);
      var r;
      try {
        if (editing) r = await sb.from('press').update(row).eq('id', editing.id).select('id');
        else { row.created_by = me.id; row.creator_name = myName; row.sort = Math.floor(Date.now() / 1000); r = await sb.from('press').insert(row).select('id'); }
      } catch (ex) { r = { error: ex }; }
      busy = false; btn.disabled = false;
      if (r.error) return msg(/23505|duplicate|press_url_uniq/.test(String(r.error.code || '') + ' ' + String(r.error.message || '')) ? '이미 올린 기사입니다. 갤러리에서 그 기사를 고쳐 주세요.' : window.mErr(r.error));
      if (editing && editing.image_path && editing.image_path !== row.image_path) { try { await sb.storage.from(BUCKET).remove([editing.image_path]); } catch (_) {} }
      closeForm(true); load();
    });
  }

  // ---------- 시작 ----------
  async function init() {
    me = window.mUser ? await window.mUser() : null;
    perms = me && window.mPerms ? await window.mPerms() : { officer: false, manager: false };
    if (perms.officer && window.mProfile) { var pf = await window.mProfile(); myName = (pf && pf.name) || ((me.email || '').split('@')[0]); }
    await load();
  }
  ITEMS = staticItems(); render();           // 먼저 파일의 목록으로 바로 보이고
  init();                                     // 표에서 다시 불러옴
  document.addEventListener('manse:auth', init);
})();
