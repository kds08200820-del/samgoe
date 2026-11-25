(function(){
  'use strict';
  var header=document.querySelector('.r-header'), toggle=document.querySelector('.r-menu-toggle');
  function closeMenu(){if(!header||!toggle)return;header.classList.remove('menu-open');toggle.setAttribute('aria-expanded','false');}
  if(toggle){toggle.addEventListener('click',function(){var open=header.classList.toggle('menu-open');toggle.setAttribute('aria-expanded',String(open));});document.addEventListener('click',function(e){if(!header.contains(e.target))closeMenu();});document.addEventListener('keydown',function(e){if(e.key==='Escape'&&header.classList.contains('menu-open')){closeMenu();toggle.focus();}});header.querySelectorAll('.r-nav a').forEach(function(a){a.addEventListener('click',closeMenu);});window.addEventListener('resize',closeMenu);}
  var panels=Array.from(document.querySelectorAll('.r-panel')), fine=matchMedia('(hover:hover) and (pointer:fine)');
  function activate(panel){panels.forEach(function(p){var active=p===panel;p.classList.toggle('is-active',active);var b=p.querySelector('[data-panel-toggle]');if(b)b.setAttribute('aria-expanded',String(active));});}
  panels.forEach(function(p){p.addEventListener('pointerenter',function(){if(fine.matches)activate(p);});p.addEventListener('focusin',function(){activate(p);});var b=p.querySelector('[data-panel-toggle]');if(b)b.addEventListener('click',function(){activate(p);});});
  // Reuse the same loaded records as the calendar, including officer-adjusted dates.
  window.addEventListener('samgoe:prayer',function(e){renderPrayer(e.detail);});
  function renderPrayer(data){
    var label=document.getElementById('rNextDate'), place=document.getElementById('rNextPlace'), apply=document.getElementById('rApply');
    if(!label||!apply)return;
    if(data.error){label.textContent='일정을 불러오지 못했습니다';place.textContent='기도회 일정에서 다시 확인해 주세요.';apply.href='#prayer';document.getElementById('rApplyLabel').textContent='일정 확인';return;}
    var today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
    var rows=data.rows||[], slots=data.slots||{}, next=rows.filter(function(r){return r.meet_date>=today&&r.status!=='신청';}).sort(function(a,b){return a.meet_date.localeCompare(b.meet_date);})[0];
    if(next){var d=new Date(next.meet_date+'T07:00:00+09:00');label.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(d)+' 오전 7시';place.textContent=next.host_church||'장소 안내 예정';}
    else{label.textContent='확정된 다음 일정이 없습니다';place.textContent='매월 첫 주 수요일 오전 7시 · 회원교회 순회';}
    var seoul=new Date(new Date().toLocaleString('en-US',{timeZone:'Asia/Seoul'})), candidate=null,candidateDate=null;
    for(var i=0;i<24;i++){var start=new Date(seoul.getFullYear(),seoul.getMonth()+i,1),ym=start.getFullYear()+'-'+String(start.getMonth()+1).padStart(2,'0');var day=1+((3-start.getDay()+7)%7),date=slots[ym]||ym+'-'+String(day).padStart(2,'0');if(date>=today&&!rows.some(function(r){return r.meet_date.slice(0,7)===ym;})){candidate=ym;candidateDate=date;break;}}
    if(!next&&candidateDate){label.textContent=new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'long',day:'numeric',weekday:'short'}).format(new Date(candidateDate+'T07:00:00+09:00'))+' 오전 7시 · 예정';place.textContent='섬김 교회 모집 중 · 확정 후 안내합니다.';}
    if(candidate){apply.href='#prayer-apply-'+candidate;document.getElementById('rApplyLabel').textContent=Number(candidate.slice(5))+'월 섬김 신청';}
    else{apply.href='#prayer';document.getElementById('rApplyLabel').textContent='신청 가능 일정 확인';}
  }
  // Auth navigation uses the existing Supabase session and guards on officer.html.
  var original=window.renderAuth;
  if(original){window.renderAuth=function(user,profile){original(user,profile);updateAccount(user,profile);};}
  async function refreshAccount(){if(!window.sb)return;try{var r=await sb.auth.getSession(),user=r.data.session&&r.data.session.user;updateAccount(user,user?await window.getMyProfile():null);}catch(_){}}
  function updateAccount(user,profile){var link=document.getElementById('rAccount');if(!link)return;link.href=user?'mypage.html':'login.html';link.querySelector('span').textContent=user?((profile&&profile.name)||'회원')+'님의 내 정보':'로그인하고 내 정보 확인';link.querySelector('b').textContent=user?'내 정보':'로그인';}
  refreshAccount();if(window.sb)sb.auth.onAuthStateChange(function(){setTimeout(refreshAccount,0);});
})();
