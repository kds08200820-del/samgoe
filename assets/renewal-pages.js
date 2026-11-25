(function(){
 'use strict';
 function el(tag,cls,text){var n=document.createElement(tag);if(cls)n.className=cls;if(text!=null)n.textContent=text;return n;}
 function safeUrl(value){try{var u=new URL(value);return /^https?:$/.test(u.protocol)?u.href:null;}catch(_){return null;}}
 var grid=document.getElementById('rChurches');
 if(grid){
   fetch('assets/council-churches.json').then(function(r){if(!r.ok)throw Error();return r.json();}).then(function(churches){
     var input=document.getElementById('rSearch'), region=document.getElementById('rRegion');
     function render(){var q=input.value.trim().toLocaleLowerCase(),filtered=churches.filter(function(c){return(!region.value||c.region===region.value)&&[c.name,c.pastor,c.denomination,c.address].join(' ').toLocaleLowerCase().includes(q);});grid.replaceChildren();document.getElementById('rChurchCount').textContent=filtered.length+'개 교회';
       filtered.forEach(function(c){var card=el('article','r-church');card.append(el('h3','',c.name),el('p','',c.pastor+' · '+c.denomination),el('p','',c.address));grid.append(card);});if(!filtered.length)grid.append(el('p','r-empty','검색 결과가 없습니다. 다른 교회명이나 목사님 성함으로 찾아보세요.'));}
     input.addEventListener('input',render);region.addEventListener('change',render);render();
   }).catch(function(){grid.replaceChildren(el('p','r-empty','교회 명단을 불러오지 못했습니다. 새로고침해 주세요.'));});
   if(window.sb)sb.from('officer_card_photos').select('slot,url').then(function(r){(r.data||[]).forEach(function(row){var img=document.querySelector('[data-officer="'+Number(row.slot)+'"] img'),url=safeUrl(row.url);if(img&&url)img.src=url;});});
 }
 var news=document.getElementById('rNews');
 if(news){
   var articles=[],search=document.getElementById('rNewsSearch');
   function renderNews(){var q=search.value.trim().toLocaleLowerCase(),items=articles.filter(function(a){return[a.title,a.source,a.summary].join(' ').toLocaleLowerCase().includes(q);});news.replaceChildren();document.getElementById('rNewsCount').textContent=items.length+'건의 보도';
     items.forEach(function(a){var card=el('article','r-news'),url=safeUrl(a.url),image=safeUrl(a.image_url);if(image){var img=el('img');img.src=image;img.alt='';img.loading='lazy';img.addEventListener('error',function(){img.hidden=true;});card.append(img);}var body=el('div','r-news-body');body.append(el('small','',(a.source||'언론 보도')+(a.published?' · '+a.published:'')),el('h2','',a.title||'제목 없음'));if(a.summary)body.append(el('p','',a.summary));if(url){var link=el('a','r-read','기사 원문 읽기');link.href=url;link.target='_blank';link.rel='noopener noreferrer';link.setAttribute('aria-label',(a.title||'기사')+' 원문 읽기 (새 창)');body.append(link);}card.append(body);news.append(card);});
     if(!items.length)news.append(el('p','r-empty',q?'검색 결과가 없습니다. 다른 검색어로 찾아보세요.':'아직 등록된 언론 보도가 없습니다.'));}
   async function load(){if(!window.sb){news.replaceChildren(el('p','r-empty','기사를 불러올 수 없습니다. 잠시 후 새로고침해 주세요.'));return;}try{var r=await sb.from('press_articles').select('id,title,source,published,summary,url,image_url').order('published',{ascending:false,nullsFirst:false});if(r.error)throw r.error;articles=r.data||[];renderNews();}catch(_){news.replaceChildren(el('p','r-empty','기사를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'));var retry=el('button','r-return','다시 불러오기');retry.type='button';retry.addEventListener('click',function(){retry.disabled=true;retry.textContent='불러오는 중…';load();});news.append(retry);}}
   search.addEventListener('input',renderNews);load();
 }
})();
