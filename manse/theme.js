(function () {
  var button=document.querySelector('.mz-menu-toggle');
  var nav=document.getElementById('manseNavigation');
  if(!button||!nav)return;
  function close(){nav.classList.remove('is-open');button.setAttribute('aria-expanded','false');button.textContent='메뉴 ☰';}
  button.addEventListener('click',function(){var open=nav.classList.toggle('is-open');button.setAttribute('aria-expanded',String(open));button.textContent=open?'닫기 ×':'메뉴 ☰';});
  nav.addEventListener('click',function(e){if(e.target.closest('a'))close();});
  document.addEventListener('keydown',function(e){if(e.key==='Escape'&&nav.classList.contains('is-open')){close();button.focus();}});
  window.matchMedia('(min-width:901px)').addEventListener('change',close);
})();
