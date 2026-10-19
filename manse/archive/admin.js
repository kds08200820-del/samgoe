// 삼일만세운동본부 — 홈페이지에서 활동 기록·사진·유튜브 영상 추가 (임원 전용)
//  - 누구에게나: 임원들이 추가한 기록·사진·영상을 불러와 공개 페이지에 함께 표시
//  - 임원(임원 명단 재직자)에게: [+ 활동 기록 추가], 행사 상세의 [+ 사진 추가]·[▶ 유튜브 영상 추가], 삭제·수정 버튼
//  권한은 서버(RLS)가 최종 판단합니다. 사진은 올리기 전에 브라우저에서 줄입니다(긴 변 1600px / 썸네일 480px).
//  영상 파일은 올리지 않고 유튜브 영상 ID만 저장합니다(activity_videos · activity-media-setup.sql).
(function () {
  var sb = window.msb, MZ = window.MZ;
  if (!sb || !MZ) return;
  var BUCKET = 'manse-photos';
  var CATS = ['만세길 걷기', '역사 탐방', '문화 행사', '단체 운영'];
  var $ = function (id) { return document.getElementById(id); };
  var esc = window.mEsc;
  var me = null, perms = { officer: false, manager: false }, myName = '';
  var ACTS = {};           // 'a-<uuid>' → activities 행

  function pub(path) { return sb.storage.from(BUCKET).getPublicUrl(path).data.publicUrl; }
  function uid() { try { return crypto.randomUUID(); } catch (_) { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); } }
  function canEdit(ownerId) { return !!me && (perms.manager || ownerId === me.id); }

  // ---------- 불러오기 & 합치기 ----------
  async function load() {
    var res = await Promise.all([
      sb.from('activities').select('*').order('date', { ascending: false }),
      sb.from('activity_photos').select('*').order('sort').order('created_at'),
      sb.from('activity_videos').select('id,event_key,yt_id,title,added_by').order('sort').order('created_at')
    ]);
    var a = res[0], p = res[1], v = res[2];
    if (a.error || p.error) return;               // 표가 아직 없으면(설정 전) 조용히 넘어감
    ACTS = {};
    var events = (a.data || []).map(function (r) {
      var id = 'a-' + r.id; ACTS[id] = r;
      return { id: id, dbId: r.id, date: r.date, year: +String(r.date).slice(0, 4), title: r.title, cat: r.cat || '단체 운영',
               place: r.place || '', people: r.people || '', summary: r.summary || '', walk: r.walk || undefined, cover: 0, db: true, owner: r.created_by };
    });
    var byEv = {};
    (p.data || []).forEach(function (r) {
      (byEv[r.event_key] = byEv[r.event_key] || []).push({ db: true, id: r.id, full: pub(r.path), thumb: pub(r.thumb_path), w: r.w, h: r.h,
        c: r.caption || '', path: r.path, thumb_path: r.thumb_path, canDel: canEdit(r.uploaded_by) });
    });
    var vByEv = {};                                // 영상 표가 아직 없으면(설정 전) 영상 없이 진행
    (v.error ? [] : v.data || []).forEach(function (r) {
      (vByEv[r.event_key] = vByEv[r.event_key] || []).push({ id: r.id, v: r.yt_id, t: r.title || '', canDel: canEdit(r.added_by) });
    });
    MZ.merge(events, byEv, vByEv);
    walkLabel();
    document.dispatchEvent(new CustomEvent('mz:loaded'));
  }
  // '새 회차 만들기' 버튼에 다음 회차 번호 표시
  function walkLabel() { var b = $('addWalk'); if (b) b.textContent = '+ 새 회차 만들기 (제' + (MZ.maxWalk() + 1) + '회)'; }

  // ---------- 사진 줄이기 ----------
  function loadImg(file) {
    return new Promise(function (res, rej) { var u = URL.createObjectURL(file), im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = u; });
  }
  async function shrink(file, max, q) {
    var src; try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (_) { src = await loadImg(file); }
    var w = src.width || src.naturalWidth, h = src.height || src.naturalHeight, k = Math.min(1, max / Math.max(w, h));
    var cv = document.createElement('canvas'); cv.width = Math.round(w * k); cv.height = Math.round(h * k);
    cv.getContext('2d').drawImage(src, 0, 0, cv.width, cv.height);
    var blob = await new Promise(function (r) { cv.toBlob(r, 'image/webp', q); });
    if (!blob || blob.type !== 'image/webp') blob = await new Promise(function (r) { cv.toBlob(r, 'image/jpeg', q); });
    return { blob: blob, w: cv.width, h: cv.height };
  }
  // 한글로 이름 붙인 사진은 그 이름을 설명으로 (예: '03_출발준비.jpg' → '출발준비'). 카메라 파일명(IMG_1234 등)은 비워 둠
  function capFromName(n) {
    var b = n.replace(/\.[^.]+$/, '');
    return /[가-힣]/.test(b) ? b.replace(/^\d+[_.\s-]*/, '').replace(/_/g, ' ').trim() : '';
  }
  async function uploadPhotos(eventKey, files, onStep) {
    var ok = 0, fail = 0;
    files = Array.from(files).sort(function (a, b) { return a.name.localeCompare(b.name, 'ko', { numeric: true }); }); // 01_, 02_… 이름 순서대로
    for (var i = 0; i < files.length; i++) {
      var f = files[i]; onStep && onStep(i + 1, files.length);
      try {
        var big = await shrink(f, 1600, 0.8), small = await shrink(f, 480, 0.7);
        var ext = big.blob.type === 'image/webp' ? 'webp' : 'jpg', name = uid() + '.' + ext;
        var path = eventKey + '/' + name, tpath = eventKey + '/t/' + name;
        var u1 = await sb.storage.from(BUCKET).upload(path, big.blob, { contentType: big.blob.type, upsert: false }); if (u1.error) throw u1.error;
        var u2 = await sb.storage.from(BUCKET).upload(tpath, small.blob, { contentType: small.blob.type, upsert: false }); if (u2.error) throw u2.error;
        var ins = await sb.from('activity_photos').insert({ event_key: eventKey, path: path, thumb_path: tpath, w: big.w, h: big.h, caption: capFromName(f.name),
          sort: Math.floor(Date.now() / 1000), uploaded_by: me.id, uploader_name: myName });
        if (ins.error) throw ins.error;
        ok++;
      } catch (ex) { fail++; console.warn('사진 올리기 실패', f.name, ex); }
    }
    return { ok: ok, fail: fail };
  }

  // ---------- 유튜브 영상 ----------
  // 주소에서 영상 ID(11자) 뽑기 — youtu.be/…, watch?v=…, shorts/…, live/…, embed/… 모두 받음
  function ytId(s) {
    s = String(s || '').trim();
    if (/^[\w-]{11}$/.test(s)) return s;
    var m = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([\w-]{11})/.exec(s);
    return m ? m[1] : '';
  }
  // 유튜브에 올라가 있는 영상 제목(제목 칸을 비워 두면 이것을 씀). 못 받으면 ''
  async function ytTitle(v) {
    try {
      var ctl = new AbortController(), t = setTimeout(function () { ctl.abort(); }, 5000);
      var r = await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + v), { signal: ctl.signal });
      clearTimeout(t);
      return r.ok ? ((await r.json()).title || '') : '';
    } catch (_) { return ''; }
  }
  async function addVideos(eventKey, list) {      // list: [{ v: 영상 ID, t: 제목 }]
    var base = Math.floor(Date.now() / 1000);
    var r = await sb.from('activity_videos').insert(list.map(function (x, i) {
      return { event_key: eventKey, yt_id: x.v, title: x.t || null, sort: base + i, added_by: me.id, adder_name: myName };
    }));
    if (r.error) throw r.error;
  }
  function vidErr(ex) {
    var m = String((ex && (ex.code || ex.message)) || '');
    if (/23505|duplicate key/.test(m)) return '이미 이 활동에 들어 있는 영상입니다.';
    if (/activity_videos|42P01|PGRST205/.test(m)) return '영상 기능 설정(activity-media-setup.sql)이 아직 되지 않았습니다. 관리자에게 알려 주세요.';
    return window.mErr(ex);
  }

  // 창 공통 — 배경에서 누르고 뗐을 때만 닫기(글 끌어 고르다 밖에서 놓아도 안 닫힘) · Esc는 맨 위 창만 · Tab은 창 안에서만 · 닫으면 초점 복귀
  var opener = null;
  function wireModal(m, close) {
    var down = false;
    m.addEventListener('mousedown', function (e) { down = e.target === m; });
    m.addEventListener('click', function (e) {
      if ((down && e.target === m) || (e.target.closest && e.target.closest('[data-close]'))) close();
      down = false;
    });
    m.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); close(); return; }
      if (e.key !== 'Tab') return;
      var f = Array.from(m.querySelectorAll('input,select,textarea,button')).filter(function (x) { return !x.disabled && x.offsetParent !== null; });
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    });
  }
  function showModal(m, first) { opener = document.activeElement; m.classList.add('on'); document.body.classList.add('mz-lock'); first.focus(); }
  function hideModal(m) {
    m.classList.remove('on');
    if (!$('evDlg').classList.contains('on')) document.body.classList.remove('mz-lock');
    if (opener && opener.focus && document.contains(opener)) opener.focus();
    opener = null;
  }

  // '유튜브 영상 추가' 창 (행사 상세에서 엶)
  var ytFor = null, ytBusy = false, ytFound = { v: '', t: '' }, ytTimer = null;
  function buildYtModal() {
    var m = document.createElement('div');
    m.className = 'mz-modal'; m.id = 'ytModal';
    m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-labelledby', 'ytHead');
    m.innerHTML = '<form class="box" id="ytForm" novalidate>' +
      '<h3 id="ytHead">유튜브 영상 추가</h3>' +
      '<p class="mz-admin-msg" style="margin:0">유튜브에서 <b>공유 → 복사</b>한 주소를 붙여 넣으세요. 영상 파일을 올리는 것이 아니라 유튜브 영상을 이 활동에 걸어 두는 것입니다.</p>' +
      '<label>영상 주소<input id="ytUrl" type="url" inputmode="url" autocomplete="off" placeholder="예: https://youtu.be/mw7YXifCvk4"></label>' +
      '<div class="mz-ytprev" id="ytPrev" hidden><img alt=""><span></span></div>' +
      '<label>영상 제목 <small>(선택 · 비워 두면 유튜브의 제목을 그대로 씁니다)</small><input id="ytName" maxlength="120"></label>' +
      '<p class="mz-admin-msg" id="ytMsg" role="status" style="min-height:1.4em"></p>' +
      '<div class="acts"><button type="button" class="mz-btn ghost sm-btn" data-close>취소</button><button type="submit" class="mz-btn navy sm-btn" id="ytSave">추가</button></div></form>';
    document.body.appendChild(m);
    wireModal(m, closeYt);
    $('ytUrl').addEventListener('input', function () {
      clearTimeout(ytTimer);
      var v = ytId(this.value), pv = $('ytPrev');
      $('ytMsg').textContent = '';
      if (!v) { ytFound = { v: '', t: '' }; pv.hidden = true; if (this.value.trim()) $('ytMsg').textContent = '유튜브 주소가 맞는지 확인해 주세요.'; return; }
      if (v === ytFound.v) return;
      ytFound = { v: v, t: '' };
      pv.hidden = false; pv.querySelector('img').src = 'https://i.ytimg.com/vi/' + v + '/mqdefault.jpg';
      pv.querySelector('span').textContent = '영상 확인 중…';
      ytTimer = setTimeout(async function () {
        var t = await ytTitle(v); if (ytFound.v !== v) return;
        ytFound.t = t;
        pv.querySelector('span').textContent = t || '제목을 불러오지 못했습니다. 그래도 추가할 수 있습니다.';
        $('ytName').placeholder = t;
      }, 300);
    });
    $('ytForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (ytBusy) return;
      var msg = $('ytMsg'), btn = $('ytSave'), v = ytId($('ytUrl').value);
      if (!v) { msg.textContent = $('ytUrl').value.trim() ? '유튜브 주소가 아닙니다. 유튜브에서 공유 → 복사한 주소를 붙여 넣어 주세요.' : '유튜브 영상 주소를 붙여 넣어 주세요.'; $('ytUrl').focus(); return; }
      var ev = MZ.get(ytFor);
      if (ev && (ev.yt || []).some(function (y) { return y.v === v; })) { msg.textContent = '이미 이 활동에 들어 있는 영상입니다.'; return; }
      ytBusy = true; btn.disabled = true; btn.textContent = '추가 중…';
      try {
        var t = $('ytName').value.trim() || (ytFound.v === v && ytFound.t) || await ytTitle(v);
        await addVideos(ytFor, [{ v: v, t: t }]);
        closeYt(true); await load();
        var m2 = $('dlgMsg'); if (m2) m2.textContent = '유튜브 영상을 추가했습니다.';
      } catch (ex) { msg.textContent = vidErr(ex); }
      ytBusy = false; btn.disabled = false; btn.textContent = '추가';
    });
  }
  function openYt(eventKey) {
    if (!$('ytModal')) buildYtModal();
    ytFor = eventKey; ytFound = { v: '', t: '' };
    $('ytUrl').value = ''; $('ytName').value = ''; $('ytName').placeholder = ''; $('ytMsg').textContent = ''; $('ytPrev').hidden = true;
    showModal($('ytModal'), $('ytUrl'));
  }
  function closeYt(saved) {
    if (saved !== true && ytBusy) return;
    if (saved !== true && $('ytUrl').value.trim() && !confirm('입력한 영상 주소가 있습니다. 추가하지 않고 닫을까요?')) return;
    hideModal($('ytModal'));
  }

  // ---------- 행사 상세의 관리 막대 ----------
  function dlgBar(id) {
    var bar = $('dlgAdmin'); if (!bar) return;
    if (!perms.officer) { bar.hidden = true; return; }
    var act = ACTS[id];
    bar.hidden = false;
    bar.innerHTML = '<label class="mz-btn navy sm-btn"><input type="file" id="addPh" accept="image/*" multiple hidden>+ 사진 추가</label>' +
      '<button type="button" class="mz-btn navy sm-btn" id="addYt">▶ 유튜브 영상 추가</button>' +
      (act && canEdit(act.created_by) ? '<button type="button" class="mz-btn ghost sm-btn" id="editAct">기록 수정</button><button type="button" class="mz-btn ghost sm-btn danger" id="delAct">기록 삭제</button>' : '') +
      '<span class="mz-admin-msg" id="dlgMsg">사진 여러 장을 이 화면에 끌어다 놓아도 한 번에 올라갑니다.</span>';
    $('addYt').addEventListener('click', function () { openYt(id); });
    $('addPh').addEventListener('change', async function () {
      var files = Array.from(this.files || []); if (!files.length) return;
      var msg = $('dlgMsg');
      var r = await uploadPhotos(id, files, function (i, n) { msg.textContent = '사진 올리는 중… ' + i + ' / ' + n; });
      msg.textContent = '사진 ' + r.ok + '장을 올렸습니다.' + (r.fail ? ' (' + r.fail + '장 실패)' : '');
      await load();
    });
    if ($('editAct')) $('editAct').addEventListener('click', function () { openRec(act); });
    if ($('delAct')) $('delAct').addEventListener('click', async function () {
      if (!confirm('"' + act.title + '" 기록과 사진·영상 목록을 모두 삭제할까요? 되돌릴 수 없습니다. (유튜브에 올린 영상 자체는 지워지지 않습니다)')) return;
      var ph = await sb.from('activity_photos').select('id,path,thumb_path').eq('event_key', id);
      var paths = []; (ph.data || []).forEach(function (r) { paths.push(r.path, r.thumb_path); });
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      await sb.from('activity_photos').delete().eq('event_key', id);
      await sb.from('activity_videos').delete().eq('event_key', id);
      var d = await sb.from('activities').delete().eq('id', act.id);
      if (d.error) return alert(window.mErr(d.error));
      MZ.close(); MZ.remove(id); load();
    });
  }
  document.addEventListener('mz:open', function (e) { dlgBar(e.detail.id); });
  document.addEventListener('mz:delphoto', async function (e) {
    var ev = MZ.get(e.detail.event), p = ev && ev.photos.find(function (x) { return x.id === e.detail.id; });
    if (!p || !confirm('이 사진을 삭제할까요?')) return;
    await sb.storage.from(BUCKET).remove([p.path, p.thumb_path]);
    var d = await sb.from('activity_photos').delete().eq('id', p.id);
    if (d.error) return alert(window.mErr(d.error));
    load();
  });
  document.addEventListener('mz:delvideo', async function (e) {
    var ev = MZ.get(e.detail.event), y = ev && (ev.yt || []).find(function (x) { return x.id === e.detail.id; });
    if (!y || !confirm('이 영상을 활동 기록에서 뺄까요? (유튜브에 올린 영상 자체는 지워지지 않습니다)')) return;
    var d = await sb.from('activity_videos').delete().eq('id', y.id);
    if (d.error) return alert(vidErr(d.error));
    load();
  });

  // ---------- 활동 기록 추가/수정 창 ----------
  var editing = null;
  function openRec(act, preset) {
    editing = act || null; preset = preset || {};
    $('recTitle').textContent = act ? '활동 기록 수정' : '활동 기록 추가';
    $('rDate').value = act ? act.date : new Date().toISOString().slice(0, 10);
    $('rTitle').value = act ? act.title : (preset.title || ''); $('rCat').value = act ? act.cat : (preset.cat || '만세길 걷기');
    $('rPlace').value = act ? (act.place || '') : ''; $('rPeople').value = act ? (act.people || '') : '';
    $('rWalk').value = act && act.walk ? act.walk : (preset.walk || ''); $('rSum').value = act ? (act.summary || '') : '';
    $('rFiles').value = ''; $('rFilesRow').hidden = !!act; $('recMsg').textContent = '';
    $('rYt').value = ''; $('rYtRow').hidden = !!act;     // 수정할 때 영상은 행사 상세의 [▶ 유튜브 영상 추가]로
    recDirty = false;
    showModal($('recModal'), $('rTitle'));
  }
  var recBusy = false, recDirty = false;
  function closeRec(saved) {
    if (saved !== true && recBusy) return;
    if (saved !== true && recDirty && !confirm('작성 중인 내용이 있습니다. 저장하지 않고 닫을까요?')) return;
    hideModal($('recModal'));
  }
  function setupModal() {
    $('rCat').innerHTML = CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('');
    // 새 기록에 유튜브 영상 주소도 함께 (사진 칸 바로 위)
    $('rFilesRow').insertAdjacentHTML('beforebegin', '<label id="rYtRow">유튜브 영상 주소 <small>(선택 · 여러 개면 한 줄에 하나씩)</small>' +
      '<textarea id="rYt" rows="2" placeholder="예: https://youtu.be/mw7YXifCvk4"></textarea></label>');
    wireModal($('recModal'), closeRec);
    $('recForm').addEventListener('input', function () { recDirty = true; });
    $('recForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      if (recBusy) return;
      var msg = $('recMsg'), btn = this.querySelector('button[type=submit]');
      var row = { date: $('rDate').value, title: $('rTitle').value.trim(), cat: $('rCat').value, place: $('rPlace').value.trim() || null,
                  people: $('rPeople').value.trim() || null, walk: parseInt($('rWalk').value, 10) || null, summary: $('rSum').value.trim() || null };
      if (!row.date || !row.title) { msg.textContent = '날짜와 제목을 입력해 주세요.'; return; }
      var lines = editing ? [] : $('rYt').value.split(/\s*\n\s*/).filter(Boolean), vids = [];
      var bad = lines.filter(function (l) { var v = ytId(l); if (v && vids.indexOf(v) < 0) vids.push(v); return !v; });
      if (bad.length) { msg.textContent = '유튜브 주소를 알아볼 수 없습니다: ' + bad[0]; $('rYt').focus(); return; }
      recBusy = true; btn.disabled = true; btn.textContent = '저장 중…';
      try {
        var id;
        if (editing) {
          var u = await sb.from('activities').update(row).eq('id', editing.id); if (u.error) throw u.error; id = 'a-' + editing.id;
        } else {
          row.created_by = me.id; row.creator_name = myName;
          var ins = await sb.from('activities').insert(row).select('id').single(); if (ins.error) throw ins.error; id = 'a-' + ins.data.id;
          editing = { id: ins.data.id };          // 아래에서 실패해 다시 저장을 눌러도 기록이 두 번 생기지 않게
          var files = Array.from($('rFiles').files || []);
          if (files.length) { var r = await uploadPhotos(id, files, function (i, n) { msg.textContent = '사진 올리는 중… ' + i + ' / ' + n; }); if (r.fail) alert('사진 ' + r.fail + '장은 올리지 못했습니다.'); }
          if (vids.length) {
            msg.textContent = '영상 넣는 중…';
            var titles = await Promise.all(vids.map(ytTitle));
            try { await addVideos(id, vids.map(function (v, i) { return { v: v, t: titles[i] }; })); }
            catch (ex2) { alert('기록은 저장했지만 유튜브 영상은 넣지 못했습니다. ' + vidErr(ex2)); }
          }
        }
        closeRec(true); await load(); MZ.open(id);
      } catch (ex) { msg.textContent = window.mErr(ex); }
      recBusy = false; btn.disabled = false; btn.textContent = '저장';
    });
  }

  // ---------- 사진 끌어다 놓기 (임원) — 행사 카드 위 또는 열린 행사 상세 화면에 여러 장 한 번에 ----------
  function dropTarget(e) {
    if ($('evDlg').classList.contains('on')) { var c = MZ.current(); return c ? { id: c.id, el: $('evDlg').querySelector('.box') } : null; }
    var card = e.target.closest && e.target.closest('[data-ev]');
    return card ? { id: card.getAttribute('data-ev'), el: card } : null;
  }
  var overEl = null;
  function setOver(el) { if (overEl && overEl !== el) overEl.classList.remove('mz-dropover'); overEl = el; if (el) el.classList.add('mz-dropover'); }
  function hasFiles(e) { return e.dataTransfer && Array.from(e.dataTransfer.types || []).indexOf('Files') >= 0; }
  function readImages(dt) {
    var out = [], items = Array.from(dt.items || []);
    var ents = items.map(function (it) { return it.webkitGetAsEntry ? it.webkitGetAsEntry() : null; }).filter(Boolean);
    if (!ents.length) return Promise.resolve(Array.from(dt.files || []).filter(function (f) { return /^image\//.test(f.type); }));
    function walk(en) {
      return new Promise(function (res) {
        if (en.isFile) { en.file(function (f) { if (/^image\//.test(f.type) || /\.(jpe?g|png|webp|heic)$/i.test(f.name)) out.push(f); res(); }, function () { res(); }); return; }
        var rd = en.createReader(), all = [];
        (function more() { rd.readEntries(function (xs) { if (!xs.length) { Promise.all(all.map(walk)).then(res); return; } all = all.concat(Array.from(xs)); more(); }, function () { res(); }); })();
      });
    }
    return Promise.all(ents.map(walk)).then(function () { return out; });
  }
  document.addEventListener('dragover', function (e) {
    if (!perms.officer || !hasFiles(e)) return;
    var t = dropTarget(e); if (!t) { setOver(null); return; }
    e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(t.el);
  });
  document.addEventListener('dragleave', function (e) { if (!e.relatedTarget) setOver(null); });
  document.addEventListener('drop', async function (e) {
    if (!perms.officer || !hasFiles(e)) return;
    var t = dropTarget(e); setOver(null); if (!t) return;
    e.preventDefault();
    var files = await readImages(e.dataTransfer);
    if (!files.length) return alert('사진 파일(JPG·PNG·WEBP)만 올릴 수 있습니다.');
    if (!$('evDlg').classList.contains('on') || MZ.current().id !== t.id) MZ.open(t.id);
    var msg = $('dlgMsg') || { textContent: '' };
    var r = await uploadPhotos(t.id, files, function (i, n) { msg.textContent = '사진 올리는 중… ' + i + ' / ' + n; });
    await load();
    var m2 = $('dlgMsg'); if (m2) m2.textContent = '사진 ' + r.ok + '장을 올렸습니다.' + (r.fail ? ' (' + r.fail + '장 실패)' : '');
  });

  // ---------- 시작 ----------
  async function initAdmin() {
    me = await window.mUser();
    perms = me ? await window.mPerms(true) : { officer: false, manager: false };
    var bar = $('actAdmin'), wbar = $('walkAdmin');
    document.body.classList.toggle('mz-officer', !!perms.officer);
    MZ.rerender();
    if (perms.officer && wbar) {
      wbar.hidden = false;
      wbar.innerHTML = '<button type="button" class="mz-btn navy sm-btn" id="addWalk"></button><span class="mz-admin-msg">회차를 만들면 아래에 그 회차 카드가 생깁니다. 각 카드의 <b>📷 사진 추가</b>를 누르거나, 사진 여러 장을 카드 위에 <b>끌어다 놓으면</b> 그 회차에 한 번에 올라갑니다.</span>';
      walkLabel();
      $('addWalk').addEventListener('click', function () { var n = MZ.maxWalk() + 1; openRec(null, { cat: '만세길 걷기', walk: n, title: '제' + n + '회 화성3·1운동만세길 걷기' }); });
    } else if (wbar) wbar.hidden = true;
    if (perms.officer) {
      var p = await window.mProfile(); myName = (p && p.name) || (me.email || '').split('@')[0];
      bar.hidden = false;
      bar.innerHTML = '<button type="button" class="mz-btn navy sm-btn" id="addAct">+ 활동 기록 추가</button><span class="mz-admin-msg">기존 기록에는 카드의 <b>📷 사진 추가</b>를 누르거나 사진을 카드 위에 <b>끌어다 놓으세요</b>. 유튜브 영상은 카드를 열고 <b>▶ 유튜브 영상 추가</b>를 누르세요.</span>';
      $('addAct').addEventListener('click', function () { openRec(null); });
    } else if (bar) bar.hidden = true;
    await load();
    var cur = MZ.current(); if (cur && $('evDlg').classList.contains('on')) dlgBar(cur.id);
  }
  setupModal();
  initAdmin();
  document.addEventListener('manse:auth', function () { initAdmin(); });
})();
