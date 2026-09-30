// 삼일만세운동본부 — 홈페이지에서 활동 기록·사진 추가 (임원 전용)
//  - 누구에게나: 임원들이 추가한 기록·사진을 불러와 공개 페이지에 함께 표시
//  - 임원(임원 명단 재직자)에게: [+ 활동 기록 추가], 행사 상세의 [+ 사진 추가], 삭제·수정 버튼
//  권한은 서버(RLS)가 최종 판단합니다. 사진은 올리기 전에 브라우저에서 줄입니다(긴 변 1600px / 썸네일 480px).
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
    var a = await sb.from('activities').select('*').order('date', { ascending: false });
    var p = await sb.from('activity_photos').select('*').order('sort').order('created_at');
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
    MZ.merge(events, byEv);
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
  async function uploadPhotos(eventKey, files, onStep) {
    var ok = 0, fail = 0;
    for (var i = 0; i < files.length; i++) {
      var f = files[i]; onStep && onStep(i + 1, files.length);
      try {
        var big = await shrink(f, 1600, 0.8), small = await shrink(f, 480, 0.7);
        var ext = big.blob.type === 'image/webp' ? 'webp' : 'jpg', name = uid() + '.' + ext;
        var path = eventKey + '/' + name, tpath = eventKey + '/t/' + name;
        var u1 = await sb.storage.from(BUCKET).upload(path, big.blob, { contentType: big.blob.type, upsert: false }); if (u1.error) throw u1.error;
        var u2 = await sb.storage.from(BUCKET).upload(tpath, small.blob, { contentType: small.blob.type, upsert: false }); if (u2.error) throw u2.error;
        var ins = await sb.from('activity_photos').insert({ event_key: eventKey, path: path, thumb_path: tpath, w: big.w, h: big.h, caption: '',
          sort: Math.floor(Date.now() / 1000), uploaded_by: me.id, uploader_name: myName });
        if (ins.error) throw ins.error;
        ok++;
      } catch (ex) { fail++; console.warn('사진 올리기 실패', f.name, ex); }
    }
    return { ok: ok, fail: fail };
  }

  // ---------- 행사 상세의 관리 막대 ----------
  function dlgBar(id) {
    var bar = $('dlgAdmin'); if (!bar) return;
    if (!perms.officer) { bar.hidden = true; return; }
    var act = ACTS[id];
    bar.hidden = false;
    bar.innerHTML = '<label class="mz-btn navy sm-btn"><input type="file" id="addPh" accept="image/*" multiple hidden>+ 사진 추가</label>' +
      (act && canEdit(act.created_by) ? '<button type="button" class="mz-btn ghost sm-btn" id="editAct">기록 수정</button><button type="button" class="mz-btn ghost sm-btn danger" id="delAct">기록 삭제</button>' : '') +
      '<span class="mz-admin-msg" id="dlgMsg"></span>';
    $('addPh').addEventListener('change', async function () {
      var files = Array.from(this.files || []); if (!files.length) return;
      var msg = $('dlgMsg');
      var r = await uploadPhotos(id, files, function (i, n) { msg.textContent = '사진 올리는 중… ' + i + ' / ' + n; });
      msg.textContent = '사진 ' + r.ok + '장을 올렸습니다.' + (r.fail ? ' (' + r.fail + '장 실패)' : '');
      await load();
    });
    if ($('editAct')) $('editAct').addEventListener('click', function () { openRec(act); });
    if ($('delAct')) $('delAct').addEventListener('click', async function () {
      if (!confirm('"' + act.title + '" 기록과 사진을 모두 삭제할까요? 되돌릴 수 없습니다.')) return;
      var ph = await sb.from('activity_photos').select('id,path,thumb_path').eq('event_key', id);
      var paths = []; (ph.data || []).forEach(function (r) { paths.push(r.path, r.thumb_path); });
      if (paths.length) await sb.storage.from(BUCKET).remove(paths);
      await sb.from('activity_photos').delete().eq('event_key', id);
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
    $('recModal').classList.add('on'); $('rTitle').focus();
  }
  function closeRec() { $('recModal').classList.remove('on'); }
  function setupModal() {
    $('rCat').innerHTML = CATS.map(function (c) { return '<option>' + c + '</option>'; }).join('');
    $('recModal').addEventListener('click', function (e) { if (e.target === this || e.target.hasAttribute('data-close')) closeRec(); });
    $('recForm').addEventListener('submit', async function (e) {
      e.preventDefault();
      var msg = $('recMsg'), btn = this.querySelector('button[type=submit]');
      var row = { date: $('rDate').value, title: $('rTitle').value.trim(), cat: $('rCat').value, place: $('rPlace').value.trim() || null,
                  people: $('rPeople').value.trim() || null, walk: parseInt($('rWalk').value, 10) || null, summary: $('rSum').value.trim() || null };
      if (!row.date || !row.title) { msg.textContent = '날짜와 제목을 입력해 주세요.'; return; }
      btn.disabled = true;
      try {
        var id;
        if (editing) {
          var u = await sb.from('activities').update(row).eq('id', editing.id); if (u.error) throw u.error; id = 'a-' + editing.id;
        } else {
          row.created_by = me.id; row.creator_name = myName;
          var ins = await sb.from('activities').insert(row).select('id').single(); if (ins.error) throw ins.error; id = 'a-' + ins.data.id;
          var files = Array.from($('rFiles').files || []);
          if (files.length) { var r = await uploadPhotos(id, files, function (i, n) { msg.textContent = '사진 올리는 중… ' + i + ' / ' + n; }); if (r.fail) alert('사진 ' + r.fail + '장은 올리지 못했습니다.'); }
        }
        closeRec(); await load(); MZ.open(id);
      } catch (ex) { msg.textContent = window.mErr(ex); }
      btn.disabled = false;
    });
  }

  // ---------- 시작 ----------
  async function initAdmin() {
    me = await window.mUser();
    perms = me ? await window.mPerms(true) : { officer: false, manager: false };
    var bar = $('actAdmin'), wbar = $('walkAdmin');
    document.body.classList.toggle('mz-officer', !!perms.officer);
    MZ.rerender();
    if (perms.officer && wbar) {
      wbar.hidden = false;
      wbar.innerHTML = '<button type="button" class="mz-btn navy sm-btn" id="addWalk"></button><span class="mz-admin-msg">회차를 만들면 아래에 그 회차 카드가 생깁니다. 각 카드의 <b>📷 사진 추가</b>로 회차별로 사진을 올리세요.</span>';
      walkLabel();
      $('addWalk').addEventListener('click', function () { var n = MZ.maxWalk() + 1; openRec(null, { cat: '만세길 걷기', walk: n, title: '제' + n + '회 화성3·1운동만세길 걷기' }); });
    } else if (wbar) wbar.hidden = true;
    if (perms.officer) {
      var p = await window.mProfile(); myName = (p && p.name) || (me.email || '').split('@')[0];
      bar.hidden = false;
      bar.innerHTML = '<button type="button" class="mz-btn navy sm-btn" id="addAct">+ 활동 기록 추가</button><span class="mz-admin-msg">기존 기록에는 카드의 <b>📷 사진 추가</b>로 사진을 올릴 수 있습니다.</span>';
      $('addAct').addEventListener('click', function () { openRec(null); });
    } else if (bar) bar.hidden = true;
    await load();
    var cur = MZ.current(); if (cur && $('evDlg').classList.contains('on')) dlgBar(cur.id);
  }
  setupModal();
  initAdmin();
  document.addEventListener('manse:auth', function () { initAdmin(); });
})();
