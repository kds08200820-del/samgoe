// ============================================================
//  임원방 — 문서 바구니(넣는 곳) + 자료실(보는 곳)
//  officer.html 에서 로드. 전역 me / myProfile / isAdminUser / esc / fmtDT / fmtSize / fileIcon 사용.
// ============================================================
(function(){
  var FOLDERS = [];   // officer_folders
  var FILES = [];     // officer_files (전체)
  var basket = [];    // 업로드 전 선택 파일
  var view = { folder: '', year: '', role: '', q: '' };
  var ROLES = ['회장','부회장','사무총장','부사무총장','서기','회계','실무위원'];

  // ---------- 자동 분류 규칙 (파일명·제목 기준) ----------
  var RULES = [
    { code:'gongmun_grant', re:/보조금|공모|교부|지원신청|선정|활성화\s*사업|집행\s*매뉴얼|정산/ },
    { code:'gongmun_in',    re:/(^|[^집])회신|수신|통보|안내문|알림|공고/ },
    { code:'gongmun_out',   re:/공문|발신|요청서|신청서|신고|협조|도로점유|제출/ },
    { code:'media_press',   re:/언론|보도|기사|신문|방송|취재|TV/ },
    { code:'meeting_ga',    re:/총회/ },
    { code:'meeting_ofc',   re:/임원\s*회의|임원회|회의록|회의\s*결과|안건/ },
    { code:'meeting_mon',   re:/월례/ },
    { code:'finance',       re:/결산|예산|통장|사용내역|영수증|회계|지출|수입|정산서|입금/ },
    { code:'rules',         re:/회칙|규정|조직|가입원서|서식|양식|명부|봉투|우편|라벨|명함/ },
    { code:'edu',           re:/교육|세미나|강의|강좌|연수|자료집|워크숍|훈련/ },
    { code:'history_manse', re:/3[.\s·]?1\s*운동|스코필드|제암리|독립|항일|역사|유적|사적/ },
    { code:'history_org',   re:/연혁|기록물|연합회\s*역사|창립|발자취/ },
    { code:'media_design',  re:/포스터|현수막|현수기|배너|시안|초대장|홍보문|리플렛|전단/ },
    { code:'event_manse',   re:/만세길|걷기|라이딩/ },
    { code:'event_easter',  re:/부활절|부활주일/ },
    { code:'event_815',     re:/광복절|8[.\s·]?15|3[.\s·]?1\s*절|삼일절/ },
    { code:'event_newyear', re:/신년|하례|조찬|연합\s*기도회|성회|수요기도/ },
    { code:'event_xmas',    re:/성탄|크리스마스/ },
    { code:'event_etc',     re:/순서지|기획안|추진계획|진행표|식순|큐시트|명단|야유회|세미나\s*참석|단합|여행|행사/ },
    { code:'meeting_ofc',   re:/보고서|보고/ }
  ];
  // 3·1 만세길 걷기 자료 (삼일만세운동본부 사업) — 공문 · 회의 자료라도 걷기 것은 '3·1 만세길 걷기' 자료실로 따로
  var WALK_RE = /만세길|걷기|라이딩|만세운동본부/;
  var WALK_RULES = [
    { code:'walk_org',     re:/만세운동본부/, and:/회칙|단체\s*소개|봉투|본부\s*자료/ },
    { code:'walk_press',   re:/언론\s*보도|보도\s*자료|기사|신문/ },
    { code:'walk_grant',   re:/보조금|공모|교부|지원\s*신청|선정|활성화\s*사업|정산/ },
    { code:'walk_meeting', re:/회의|간담회|전략|제안서|계획|평가/ },
    { code:'walk_in',      re:/(^|[^집])회신|수신|통보|알림/ },
    { code:'walk_out',     re:/공문|신고|협조|요청|대관|발신/ }
  ];
  function walkCode(s){
    if(!WALK_RE.test(s) || !folderByCode('walk')) return null;
    for(var i=0;i<WALK_RULES.length;i++){ var r=WALK_RULES[i]; if(r.re.test(s) && (!r.and || r.and.test(s)) && folderByCode(r.code)) return r.code; }
    return 'event_manse';   // 순서지 · 포스터 · 명찰 · 사진 등 → 3·1 만세길 걷기 › 행사 진행 자료
  }
  function walkRoot(){ return folderByCode('walk'); }
  function inWalk(folderId){ var w=walkRoot(); return !!(w && folderId && descendants(w.id).indexOf(folderId)>=0); }
  var ARC_TYPE_FALLBACK = { '총회자료':'meeting_ga', '회의록':'meeting_ofc', '월례·임원회의':'meeting_mon', '공문':'gongmun', '보고서':'meeting_ofc', '순서지':'event_etc' };
  function isArc(f){ return /^arc(db)?:/.test(f.path||''); }
  var IMG_RE = /\.(jpe?g|png|gif|webp|heic|mov|mp4)$/i;

  function guessYear(s){
    var yt = (typeof yearFromTitle==='function') ? yearFromTitle(s.trim()) : null; if(yt) return yt;
    var m = s.match(/(20[0-3]\d)/); if(m) return +m[1];
    m = s.match(/(^|[^0-9])(1\d|2\d)\s*년/); if(m) return 2000 + (+m[2]);
    return null;
  }
  function guessRole(s){ for(var i=0;i<ROLES.length;i++){ if(s.indexOf(ROLES[i])>=0) return ROLES[i]; } return ''; }
  function folderByCode(code){ return FOLDERS.find(function(f){ return f.code===code; }); }
  function classify(name, title){
    var s = (title||'') + ' ' + (name||'');
    var hit = walkCode(s);
    if(!hit) for(var i=0;i<RULES.length;i++){ if(RULES[i].re.test(s)){ hit = RULES[i].code; break; } }
    // 사진·영상인데 행사 이름만 있으면 '행사 사진'
    if(IMG_RE.test(name||'') && (!hit || (/^event_/.test(hit) && hit!=='event_manse') || hit==='history_manse')) hit = 'media_photo';
    if(!hit) hit = 'etc';
    var f = folderByCode(hit) || folderByCode('etc');
    return { folder_id: f ? f.id : null, year: guessYear(s), role: guessRole(s) };
  }

  // ---------- 폴더 유틸 ----------
  function roots(){ return FOLDERS.filter(function(f){ return !f.parent_id; }).sort(bySort); }
  function children(pid){ return FOLDERS.filter(function(f){ return f.parent_id===pid; }).sort(bySort); }
  function bySort(a,b){ return (a.sort||100)-(b.sort||100) || (a.name<b.name?-1:1); }
  function fById(id){ return FOLDERS.find(function(f){ return f.id===id; }); }
  function pathName(id){ var f=fById(id); if(!f) return '미분류'; var p=f.parent_id?fById(f.parent_id):null; return (p?p.name+' › ':'')+f.name; }
  function descendants(id){ var out=[id]; children(id).forEach(function(c){ out=out.concat(descendants(c.id)); }); return out; }
  function folderOptions(sel){
    var html = '<option value="">미분류</option>';
    roots().forEach(function(r){
      var kids = children(r.id);
      if(!kids.length){ html += '<option value="'+r.id+'"'+(sel===r.id?' selected':'')+'>'+esc(r.name)+'</option>'; return; }
      html += '<optgroup label="'+esc(r.name)+'"><option value="'+r.id+'"'+(sel===r.id?' selected':'')+'>'+esc(r.name)+' (일반)</option>';
      kids.forEach(function(k){ html += '<option value="'+k.id+'"'+(sel===k.id?' selected':'')+'>'+esc(k.name)+'</option>'; });
      html += '</optgroup>';
    });
    return html;
  }
  function roleOptions(sel){ return '<option value="">역할 없음</option>'+ROLES.map(function(r){ return '<option'+(sel===r?' selected':'')+'>'+r+'</option>'; }).join(''); }

  // ---------- 데이터 ----------
  async function loadAll(){
    var r = await Promise.all([
      window.sb.from('officer_folders').select('*'),
      window.sb.from('officer_files').select('*').order('created_at',{ascending:false})
    ]);
    var err = r[0].error || r[1].error;
    if(err){
      var msg = '불러오기 오류 — 관리자: <b>doc-basket-setup.sql</b> 실행이 필요할 수 있습니다.<br><span style="font-size:12px">('+esc(err.message)+')</span>';
      document.getElementById('pendingList').innerHTML = '<div class="empty">'+msg+'</div>';
      document.getElementById('docList').innerHTML = '<div class="empty">'+msg+'</div>';
      return false;
    }
    FOLDERS = r[0].data||[]; FILES = r[1].data||[];
    return true;
  }

  // ---------- 문서 바구니 (넣는 곳) ----------
  function drawBasket(){
    var el = document.getElementById('basketPicked');
    el.innerHTML = basket.map(function(f,i){
      return '<div class="f"><span>'+esc(f.name)+' <span style="color:var(--muted)">('+fmtSize(f.size)+')</span></span><button data-i="'+i+'">빼기</button></div>';
    }).join('');
    document.getElementById('basketSubmit').style.display = basket.length ? '' : 'none';
    document.getElementById('basketSubmit').textContent = '바구니에 담기 ('+basket.length+')';
  }
  async function submitBasket(){
    var prog = document.getElementById('basketProg');
    var r2 = (window.R2_WORKER_URL||'').replace(/\/$/,'');
    if(!r2){ prog.textContent='파일 저장소(Cloudflare) 설정이 필요합니다.'; return; }
    if(!basket.length) return;
    var btn = document.getElementById('basketSubmit'); btn.disabled = true;
    var ok=0, fail=0;
    for(var i=0;i<basket.length;i++){
      var file = basket[i];
      prog.textContent = '올리는 중… ('+(i+1)+'/'+basket.length+') '+file.name;
      try{
        var sess = await window.sb.auth.getSession();
        var token = sess.data&&sess.data.session?sess.data.session.access_token:'';
        var resp = await fetch(r2+'/file',{ method:'POST', headers:{ 'Authorization':'Bearer '+token, 'Content-Type':file.type||'application/octet-stream', 'X-Filename':encodeURIComponent(file.name) }, body:file });
        var j = await resp.json().catch(function(){return {};});
        if(!resp.ok) throw new Error(j.error||('업로드 실패('+resp.status+')'));
        var g = classify(file.name, '');
        var ins = await window.sb.from('officer_files').insert({
          name:file.name, path:j.key, url:j.url, size:j.size, mime:j.mime,
          status:'pending', suggested_folder_id:g.folder_id, year:g.year, role:(myProfile&&myProfile.officer_role)||null,
          author_id:me.id, author_name:(myProfile&&myProfile.name)||(me.email||'임원')
        });
        if(ins.error) throw ins.error;
        ok++;
      }catch(e){ fail++; console.error(e); }
    }
    btn.disabled = false; basket = []; drawBasket();
    prog.textContent = ok+'개를 바구니에 담았습니다. 아래에서 분류를 확인하고 승인해 주세요.'+(fail?(' · '+fail+'개 실패'):'');
    await loadAll(); renderPending(); renderDocs();
  }

  function renderPending(){
    var list = document.getElementById('pendingList');
    var pend = FILES.filter(function(f){ return f.status==='pending'; });
    var unfiled = FILES.filter(function(f){ return f.status!=='pending' && !f.folder_id; });
    document.getElementById('pendingCount').textContent = pend.length ? pend.length+'건' : '';
    var legacy = document.getElementById('legacyBox');
    if(unfiled.length){ legacy.style.display=''; document.getElementById('legacyMsg').textContent = '분류되지 않은 기존 자료 '+unfiled.length+'건이 있습니다. 자동 분류로 바구니에 올려 정리할 수 있습니다.'; }
    else legacy.style.display='none';
    if(!pend.length){ list.innerHTML = '<div class="empty">분류를 기다리는 자료가 없습니다.</div>'; document.getElementById('approveAll').style.display='none'; return; }
    document.getElementById('approveAll').style.display='';
    list.innerHTML = pend.map(function(f){
      var sug = f.suggested_folder_id;
      return '<div class="prow" data-id="'+f.id+'">'+
        '<div class="ptop"><span class="ic">'+fileIcon(f.name)+'</span><input class="pt" type="text" maxlength="100" value="'+esc(f.title||f.name.replace(/\.[^.]+$/,''))+'" placeholder="제목" />'+
          '<span class="pm">'+esc(f.name)+' · '+fmtSize(f.size)+' · '+esc(f.author_name||'')+' · '+fmtDT(f.created_at)+'</span></div>'+
        '<div class="pctl">'+
          '<label>자료실 <span class="sug">'+(sug?'자동 추천':'추천 없음')+'</span><select class="pf">'+folderOptions(sug)+'</select></label>'+
          '<label>연도<input class="py" type="number" min="1990" max="2099" value="'+(f.year||'')+'" placeholder="연도" /></label>'+
          '<div class="pbtns"><button class="btn sm approve">승인 · 이동</button><button class="btn danger sm pdel">삭제</button></div>'+
        '</div></div>';
    }).join('');
  }
  async function approve(row){
    var id = row.getAttribute('data-id');
    var fid = row.querySelector('.pf').value || null;
    if(!fid){ alert('자료실을 선택해 주세요.'); return; }
    var title = row.querySelector('.pt').value.trim() || null;
    var year = parseInt(row.querySelector('.py').value,10) || null;
    var up = await window.sb.from('officer_files').update({ status:'filed', folder_id:fid, title:title, year:year, filed_at:new Date().toISOString(), filed_by:me.id }).eq('id',id);
    if(up.error){ alert('이동 실패: '+up.error.message); return false; }
    return true;
  }
  async function approveAll(){
    var rows = Array.prototype.slice.call(document.querySelectorAll('#pendingList .prow'));
    var missing = rows.filter(function(r){ return !r.querySelector('.pf').value; });
    if(missing.length){ alert('자료실이 비어 있는 항목이 '+missing.length+'건 있습니다. 먼저 선택해 주세요.'); return; }
    if(!confirm(rows.length+'건을 모두 승인하여 자료실로 옮길까요?')) return;
    for(var i=0;i<rows.length;i++){ await approve(rows[i]); }
    await loadAll(); renderPending(); renderDocs();
  }
  async function legacyToBasket(){
    var unfiled = FILES.filter(function(f){ return f.status!=='pending' && !f.folder_id; });
    if(!unfiled.length) return;
    if(!confirm('기존 자료 '+unfiled.length+'건을 자동 분류하여 바구니(분류 대기)에 올릴까요?\n승인하기 전까지 자료실에는 "미분류"로 그대로 보입니다.')) return;
    for(var i=0;i<unfiled.length;i++){
      var f = unfiled[i]; var g = classify(f.name, f.title);
      await window.sb.from('officer_files').update({ status:'pending', suggested_folder_id:g.folder_id, year:f.year||g.year, role:f.role||g.role||null }).eq('id',f.id);
    }
    await loadAll(); renderPending(); renderDocs();
  }

  // ---------- 자료실 (보는 곳) ----------
  function renderTree(){
    var tree = document.getElementById('folderTree');
    var all = FILES.filter(function(f){ return f.status!=='pending'; });
    var w = walkRoot();
    function cnt(id){ var ids=descendants(id); return all.filter(function(f){ return ids.indexOf(f.folder_id)>=0; }).length; }
    function node(r){
      var h = '<div class="tn root'+(view.folder===r.id?' on':'')+'" data-f="'+r.id+'">'+esc(r.name)+' <span class="c">'+cnt(r.id)+'</span></div>';
      children(r.id).forEach(function(k){ h += '<div class="tn sub'+(view.folder===k.id?' on':'')+'" data-f="'+k.id+'">'+esc(k.name)+' <span class="c">'+cnt(k.id)+'</span></div>'; });
      return h;
    }
    var mine = all.filter(function(f){ return !inWalk(f.folder_id); });
    var html = '<div class="tn'+(view.folder===''?' on':'')+'" data-f="">'+(w?'삼괴연합회 자료 전체':'전체 자료')+' <span class="c">'+mine.length+'</span></div>';
    roots().forEach(function(r){ if(!w || r.id!==w.id) html += node(r); });
    var un = all.filter(function(f){ return !f.folder_id; }).length;
    if(un) html += '<div class="tn'+(view.folder==='__none'?' on':'')+'" data-f="__none">미분류 <span class="c">'+un+'</span></div>';
    // 3·1 만세길 걷기 — 삼일만세운동본부 사업 자료는 따로
    html += '<div class="tn sep">3·1 만세길 걷기 · 삼일만세운동본부</div>';
    if(w) html += node(w);
    html += '<a class="tn" href="manse/officer.html#docs">삼일만세운동본부 관리자 메뉴 →</a>';
    tree.innerHTML = html;
  }
  function renderFilters(){
    var years = []; FILES.forEach(function(f){ if(f.year && years.indexOf(f.year)<0) years.push(f.year); }); years.sort(function(a,b){ return b-a; });
    var ys = document.getElementById('docYear'); ys.innerHTML = '<option value="">모든 연도</option>'+years.map(function(y){ return '<option value="'+y+'"'+(String(view.year)===String(y)?' selected':'')+'>'+y+'년</option>'; }).join('');
  }
  function matches(f){
    if(view.folder==='__none'){ if(f.folder_id) return false; }
    else if(view.folder){ if(descendants(view.folder).indexOf(f.folder_id)<0) return false; }
    else if(!view.q && inWalk(f.folder_id)) return false;   // 삼괴연합회 자료 전체: 걷기 자료는 따로 (찾기는 모두에서)
    if(view.year && String(f.year)!==String(view.year)) return false;
    if(view.q){
      var hay = [f.title, f.name, f.memo, (f.tags||[]).join(' '), f.year, f.role, pathName(f.folder_id), f.author_name].join(' ').toLowerCase();
      var terms = view.q.toLowerCase().split(/\s+/).filter(Boolean);
      for(var i=0;i<terms.length;i++){ if(hay.indexOf(terms[i])<0) return false; }
    }
    return true;
  }
  function renderDocs(){
    renderTree(); renderFilters();
    var all = FILES.filter(function(f){ return f.status!=='pending'; });
    var res = all.filter(matches);
    var head = document.getElementById('docHead');
    head.textContent = (view.folder==='__none'?'미분류':(view.folder?pathName(view.folder):(walkRoot()?(view.q?'모든 자료':'삼괴연합회 자료 전체'):'전체 자료')))+' · '+res.length+'건'+(view.q?' (검색: '+view.q+')':'');
    var unN = all.filter(function(f){ return !f.folder_id; }).length;
    if(unN){ head.innerHTML += ' <button class="btn sm" style="margin-left:10px" onclick="window.refileUnfiled()">미분류 '+unN+'건 자동 정리</button>'; }
    var list = document.getElementById('docList');
    if(!res.length){ list.innerHTML = '<div class="empty">'+(view.q?'검색 결과가 없습니다.':'자료가 없습니다.')+'</div>'; return; }
    // 연도 내림차순 → 최근 등록순
    res.sort(function(a,b){ var ay=a.year||0, by=b.year||0; if(ay!==by) return by-ay; return a.created_at<b.created_at?1:-1; });
    var groupByYear = !view.year;
    var html = '', lastY = null;
    res.forEach(function(f){
      if(groupByYear){ var y = f.year||'연도 미상'; if(y!==lastY){ html += '<div class="ygrp">'+y+(f.year?'년':'')+'</div>'; lastY=y; } }
      var canRm = me && (f.author_id===me.id || isAdminUser);
      var arc = isArc(f);
      var meta = arc ? esc(pathName(f.folder_id))+' · 기록물'+(f.memo?' · '+esc(f.memo):'')
                     : esc(pathName(f.folder_id))+' · '+esc(f.name)+' · '+fmtSize(f.size)+' · '+esc(f.author_name||'')+' · '+fmtDT(f.created_at)+(f.memo?' · '+esc(f.memo):'');
      var open = arc ? '<button class="btn ghost sm dopen">열기</button>' : '<a class="btn ghost sm" href="'+esc(f.url)+'" target="_blank" rel="noopener">다운로드</a>';
      html += '<div class="row drow" data-id="'+f.id+'"><div class="ic">'+(arc?'기록':fileIcon(f.name))+'</div><div class="main">'+
        '<div class="t">'+esc(f.title||f.name)+'</div>'+
        '<div class="m">'+meta+'</div></div>'+
        '<div class="side">'+open+'<button class="btn ghost sm dedit">정보 수정</button>'+(canRm?'<button class="btn danger sm ddel">삭제</button>':'')+'</div></div>';
    });
    list.innerHTML = html;
  }
  function openEdit(id){
    var f = FILES.find(function(x){ return x.id===id; }); if(!f) return;
    var box = document.getElementById('docEdit');
    box.innerHTML = '<div class="writeBox" style="margin:0 0 14px;border-color:var(--primary)"><h3>자료 정보 수정</h3>'+
      '<div class="fld"><label>제목</label><input id="eTitle" type="text" maxlength="100" value="'+esc(f.title||'')+'" /></div>'+
      '<div class="pctl">'+
        '<label>자료실<select id="eFolder">'+folderOptions(f.folder_id)+'</select></label>'+
        '<label>연도<input id="eYear" type="number" min="1990" max="2099" value="'+(f.year||'')+'" /></label>'+
        '</div>'+
      '<div class="fld"><label>메모 <span style="font-weight:400;color:var(--muted)">(검색에 포함됩니다)</span></label><input id="eMemo" type="text" maxlength="200" value="'+esc(f.memo||'')+'" /></div>'+
      '<div style="display:flex;gap:8px;"><button class="btn sm" id="eSave">저장</button><button class="btn ghost sm" id="eCancel">취소</button><span class="prog" id="eProg"></span></div></div>';
    box.style.display=''; box.scrollIntoView({behavior:'smooth',block:'nearest'});
    document.getElementById('eCancel').onclick = function(){ box.style.display='none'; box.innerHTML=''; };
    document.getElementById('eSave').onclick = async function(){
      var up = await window.sb.from('officer_files').update({
        title: document.getElementById('eTitle').value.trim()||null,
        folder_id: document.getElementById('eFolder').value||null,
        year: parseInt(document.getElementById('eYear').value,10)||null,
        memo: document.getElementById('eMemo').value.trim()||null
      }).eq('id',id);
      if(up.error){ document.getElementById('eProg').textContent='저장 실패: '+up.error.message; return; }
      box.style.display='none'; box.innerHTML='';
      await loadAll(); renderPending(); renderDocs();
    };
  }
  async function delFile(id){
    var f = FILES.find(function(x){ return x.id===id; }); if(!f) return;
    if(!confirm('“'+(f.title||f.name)+'” 자료를 삭제할까요?')) return;
    try{
      var r2=(window.R2_WORKER_URL||'').replace(/\/$/,'');
      if(r2 && !isArc(f)){ var sess=await window.sb.auth.getSession(); var token=sess.data&&sess.data.session?sess.data.session.access_token:''; await fetch(r2+'/file-delete',{method:'POST',headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({key:f.path})}); }
      var d=await window.sb.from('officer_files').delete().eq('id',id); if(d.error) throw d.error;
      await loadAll(); renderPending(); renderDocs();
    }catch(err){ alert('삭제 실패: '+(err.message||err)); }
  }

  // ---------- 새 자료실 만들기 ----------
  function openNewFolder(){
    var box = document.getElementById('docEdit');
    box.innerHTML = '<div class="writeBox" style="margin:0 0 14px;border-color:var(--primary)"><h3>새 자료실 만들기</h3>'+
      '<div class="pctl"><label>이름<input id="nfName" type="text" maxlength="40" placeholder="예: 2027 만세길 걷기" /></label>'+
      '<label>위치<select id="nfParent"><option value="">최상위</option>'+roots().map(function(r){ return '<option value="'+r.id+'">'+esc(r.name)+' 아래</option>'; }).join('')+'</select></label></div>'+
      '<div style="display:flex;gap:8px;"><button class="btn sm" id="nfSave">만들기</button><button class="btn ghost sm" id="nfCancel">취소</button><span class="prog" id="nfProg"></span></div></div>';
    box.style.display='';
    document.getElementById('nfCancel').onclick=function(){ box.style.display='none'; box.innerHTML=''; };
    document.getElementById('nfSave').onclick=async function(){
      var name=document.getElementById('nfName').value.trim(); if(!name){ document.getElementById('nfProg').textContent='이름을 입력해 주세요.'; return; }
      var ins=await window.sb.from('officer_folders').insert({ name:name, parent_id:document.getElementById('nfParent').value||null, sort:500, created_by:me.id });
      if(ins.error){ document.getElementById('nfProg').textContent='만들기 실패: '+ins.error.message; return; }
      box.style.display='none'; box.innerHTML='';
      await loadAll(); renderPending(); renderDocs();
    };
  }
  async function deleteFolder(){
    if(!view.folder || view.folder==='__none') return;
    var f=fById(view.folder); if(!f) return;
    var n = FILES.filter(function(x){ return descendants(f.id).indexOf(x.folder_id)>=0; }).length;
    if(n){ alert('이 자료실에 자료가 '+n+'건 있습니다. 먼저 다른 자료실로 옮겨 주세요.'); return; }
    if(f.code && !isAdminUser){ alert('기본 자료실은 관리자만 삭제할 수 있습니다.'); return; }
    if(!confirm('“'+f.name+'” 자료실을 삭제할까요?')) return;
    var d=await window.sb.from('officer_folders').delete().eq('id',f.id);
    if(d.error){ alert('삭제 실패: '+d.error.message); return; }
    view.folder=''; await loadAll(); renderDocs();
  }

  // ---------- 초기화 ----------
  async function autoFileLegacy(){
    var unfiled = FILES.filter(function(f){ return f.status!=='pending' && !f.folder_id; });
    if(!unfiled.length || !FOLDERS.length) return;
    var errs = [];
    for(var i=0;i<unfiled.length;i++){
      var f = unfiled[i]; var g = classify(f.name, f.title); if(!g.folder_id) continue;
      var up = await window.sb.from('officer_files').update({ folder_id:g.folder_id, year:f.year||g.year, filed_at:new Date().toISOString(), filed_by:me.id }).eq('id',f.id).select('id');
      if(up.error) errs.push(up.error.message);
      else if(!up.data || !up.data.length) errs.push('수정 권한 없음(0건 반영)');
    }
    await loadAll();
    if(errs.length){
      var n = document.getElementById('fileNotice'); n.style.display='';
      n.innerHTML = '미분류 자료 자동 정리에 실패했습니다: '+esc(errs[0])+'<br><span style="font-size:12px">관리자: <b>doc-basket-setup.sql</b>을 다시 실행해 주세요.</span>';
    }
  }
  window.refileUnfiled = async function(){ await autoFileLegacy(); renderPending(); renderDocs(); };
  function openArc(id){
    var f = FILES.find(function(x){ return x.id===id; }); if(!f || !window.openDoc) return;
    var title = f.title||f.name;
    if(f.path.indexOf('arcdb:')===0){
      window.sb.from('archive_docs').select('html').eq('id', f.path.slice(6)).single().then(function(r){
        if(r.error||!r.data){ alert('문서를 여는 데 실패했습니다.'); return; }
        window.openDoc({ html:r.data.html||'', title:title });
      });
    } else {
      window.openDoc({ src:f.url, title:title });
    }
  }
  // 역사 자료 아카이브(정적 HTML + 업로드 변환본)를 자료실 항목으로 한 번만 옮긴다 (관리자)
  async function migrateArchive(){
    if(!isAdminUser || !window.mergedDocs || !FOLDERS.length) return;
    var have = {}; FILES.forEach(function(f){ if(isArc(f)) have[f.path]=true; });
    var docs = window.mergedDocs(); var rows = [];
    docs.forEach(function(d){
      var path = d.kind==='db' ? 'arcdb:'+d.key : 'arc:'+d.key;
      if(have[path]) return;
      var nm = String(d.name||'').replace(/^[0-9.]+\s+/, '').replace(/^'(.*)'$/, '$1').trim();
      var g = classify(nm + ' ' + (d.type||''), '');
      var fid = g.folder_id; var fe = folderByCode('etc');
      if((!fid || (fe && fid===fe.id)) && ARC_TYPE_FALLBACK[d.type]){ var ff = folderByCode(ARC_TYPE_FALLBACK[d.type]); if(ff) fid = ff.id; }
      rows.push({ title: nm, name: nm + '.html', path: path, url: d.href || '#', size: null, mime: 'text/html',
        status:'filed', folder_id: fid, year: (d.year ? +d.year : null) || g.year, memo: d.type||null,
        author_id: me.id, author_name: '기록물', filed_at: new Date().toISOString(), filed_by: me.id });
    });
    if(!rows.length) return;
    for(var i=0;i<rows.length;i+=40){
      var ins = await window.sb.from('officer_files').insert(rows.slice(i,i+40));
      if(ins.error){ console.error('archive migrate', ins.error); break; }
    }
    await loadAll();
  }
  window.meetingFiles = function(){
    var root = folderByCode('meeting'); if(!root) return [];
    var ids = descendants(root.id);
    return FILES.filter(function(f){ return f.status!=='pending' && ids.indexOf(f.folder_id)>=0; });
  };
  window.folderName = function(id){ return pathName(id); };
  window.openFileById = function(id){ openArc(id); };
  // 제목에 적힌 연도가 저장된 연도와 다르면 바로잡는다 (예: 업로드 연도 2026 → 문서 연도 2019)
  function yearFromTitle(t){
    t = String(t||'');
    var m = t.match(/^\s*(?:[0-9]{4}\.[0-9]{2}\.[0-9]{2}\s+)?'?\s*((?:19|20)\d\d)(?=[_\s\-.년]|\d{4})/); if(m) return +m[1];
    m = t.match(/((?:19|20)\d\d)\s*년/); if(m) return +m[1];
    m = t.match(/((?:19|20)\d\d)[.\-](\d{1,2})[.\-](\d{1,2})/); if(m) return +m[1];
    m = t.match(/(?:^|[^0-9])((?:19|20)\d\d)(?:[^0-9]|$)/); if(m) return +m[1];
    return null;
  }
  async function fixYears(){
    var bad = FILES.filter(function(f){ var y = yearFromTitle(f.title||f.name); return y && y!==f.year; });
    for(var i=0;i<bad.length;i++){
      var f = bad[i];
      await window.sb.from('officer_files').update({ year: yearFromTitle(f.title||f.name) }).eq('id', f.id);
    }
    if(bad.length) await loadAll();
  }
  window.initDocs = async function(){
    if(!(await loadAll())) return;
    try{ await migrateArchive(); }catch(e){ console.error(e); }
    try{ await fixYears(); }catch(e){ console.error(e); }
    await autoFileLegacy();
    renderPending(); renderDocs();

    var drop=document.getElementById('basketDrop'), inp=document.getElementById('basketInput');
    drop.addEventListener('click', function(){ inp.click(); });
    inp.addEventListener('change', function(){ Array.prototype.slice.call(inp.files).forEach(function(f){ basket.push(f); }); inp.value=''; drawBasket(); });
    ['dragenter','dragover'].forEach(function(ev){ drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.add('over');}); });
    ['dragleave','drop'].forEach(function(ev){ drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.remove('over');}); });
    drop.addEventListener('drop', function(e){ var f=e.dataTransfer&&e.dataTransfer.files; if(f) Array.prototype.slice.call(f).forEach(function(x){ basket.push(x); }); drawBasket(); });
    document.getElementById('basketPicked').addEventListener('click', function(e){ var b=e.target.closest&&e.target.closest('[data-i]'); if(!b)return; basket.splice(parseInt(b.getAttribute('data-i'),10),1); drawBasket(); });
    document.getElementById('basketSubmit').addEventListener('click', submitBasket);
    document.getElementById('approveAll').addEventListener('click', approveAll);
    document.getElementById('legacyBtn').addEventListener('click', legacyToBasket);
    document.getElementById('pendingList').addEventListener('click', async function(e){
      var row=e.target.closest&&e.target.closest('.prow'); if(!row) return;
      if(e.target.closest('.approve')){ if(await approve(row)){ await loadAll(); renderPending(); renderDocs(); } }
      else if(e.target.closest('.pdel')){ delFile(row.getAttribute('data-id')); }
    });

    document.getElementById('folderTree').addEventListener('click', function(e){ var n=e.target.closest&&e.target.closest('.tn'); if(!n) return; view.folder=n.getAttribute('data-f'); renderDocs(); });
    document.getElementById('docYear').addEventListener('change', function(){ view.year=this.value; renderDocs(); });
    var timer=null; document.getElementById('docSearch').addEventListener('input', function(){ var v=this.value.trim(); clearTimeout(timer); timer=setTimeout(function(){ view.q=v; renderDocs(); },150); });
    document.getElementById('docList').addEventListener('click', function(e){
      var row=e.target.closest&&e.target.closest('.drow'); if(!row) return;
      if(e.target.closest('.dopen')) openArc(row.getAttribute('data-id'));
      else if(e.target.closest('.dedit')) openEdit(row.getAttribute('data-id'));
      else if(e.target.closest('.ddel')) delFile(row.getAttribute('data-id'));
    });
    document.getElementById('newFolder').addEventListener('click', openNewFolder);
    document.getElementById('delFolder').addEventListener('click', deleteFolder);
  };
})();
