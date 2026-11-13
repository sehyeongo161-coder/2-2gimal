import { FORMULAS, HERB_HANJA } from './bangjae-final-data.js';
const $ = id => document.getElementById(id);
const host = $('bangjae-area');
const ALIAS = {
  '생건지황':['건지황','생지황'], '소맥':['밀'], '이당':['교이'],
  '자감초':['감초','구감초','자감초'], '생황기':['황기'],
  '당귀미':['당귀수'], '흑강':['포강'], '반하곡':['반하국'],
  '형개수':['형개'], '백복신':['복신'], '회우슬':['우슬'],
  '생대자석':['대자석'], '생용골':['용골'], '생모려':['모려'],
  '생귀판':['귀판'], '생백작약':['백작약'], '생맥아':['맥아'],
  '인진호':['인진'], '구등':['조구등'], '호마':['호마인'],
  '선퇴':['선태'], '초결명':['결명자'], '감국':['국화'],
  '백질려':['질려'], '축사':['사인','축사인'], '아교주':['아교']
};
const EXTRA_HANJA = {
  '용담초':'龍膽草', '생건지황':'生乾地黃','소맥':'小麥','이당':'飴糖',
  '반하곡':'半夏麯','자소자':'紫蘇子','당귀미':'當歸尾',
  '생황기':'生黃芪','흑강':'黑薑','아교주':'阿膠珠','호마':'胡麻',
  '선퇴':'蟬蛻','형개수':'荊芥穗','회우슬':'懷牛膝',
  '생대자석':'生赭石','생용골':'生龍骨','생모려':'生牡蠣',
  '생귀판':'生龜板','생백작약':'生白芍','천련자':'川楝子',
  '인진호':'茵蔯蒿','생맥아':'生麥芽','석결명':'石決明',
  '초결명':'草決明','백질려':'白蒺藜','조각자':'皂角刺',
  '천산갑':'穿山甲','과루인':'瓜蔞仁','동과자':'冬瓜子',
  '축사':'縮砂','계심':'桂心','백복신':'白茯神','소목':'蘇木',
  '대자석':'代赭石','구등':'鉤藤','감국':'甘菊','패모':'貝母',
  '자감초':'炙甘草','형개수':'荊芥穗'
};
Object.assign(HERB_HANJA, EXTRA_HANJA);
if (host) {
  host.innerHTML = [
    '<div class="summary-card"><div class="summary-title"><strong>방제학 · 실습 처방 구성</strong>',
    '<div class="summary-metrics"><span id="bj-progress"></span><span id="bj-attempts"></span></div></div>',
    '<div class="track"><div id="bj-bar" class="track-fill"></div></div></div>',
    '<div class="content-card"><nav class="section-nav" aria-label="방제학 학습 화면">',
    '<button class="bj-view" data-bj-view="quiz" aria-current="true">퀴즈</button>',
    '<button class="bj-view" data-bj-view="list" aria-current="false">전체 목록</button>',
    '<button class="bj-view" data-bj-view="stats" aria-current="false">내 오답 통계</button></nav>',
    '<section id="bj-quiz"><div class="study-head"><div><h2>처방 구성 암기</h2>',
    '<p class="muted" style="font-size:13px">61~100번 · 40개 처방 · 출전 구분 45문항</p></div></div>',
    '<div class="controls"><select id="bj-order" aria-label="문제 순서"><option value="ordered">순서대로</option>',
    '<option value="random">무작위</option></select>',
    '<label class="checkbox"><input type="checkbox" id="bj-wrong">오답만</label>',
    '<button type="button" id="bj-reset">처음부터</button></div>',
    '<div id="bj-empty" class="empty" hidden><h3>풀 문제가 없습니다.</h3>',
    '<p>오답만 필터를 해제해 주세요.</p></div>',
    '<div id="bj-question"><nav id="bj-number-strip" class="bj-number-strip" aria-label="처방 번호 바로가기"></nav>',
    '<div class="question-head"><span id="bj-position" class="question-count"></span>',
    '<div class="question-navigation"><button type="button" id="bj-prior">← 이전</button>',
    '<button type="button" id="bj-skip">다음 →</button></div></div>',
    '<h3 id="bj-title" class="question-number"></h3><div id="bj-source" class="question-meta"></div>',
    '<p class="muted" style="font-size:14px;margin:14px 0">구성 약재를 입력해 주세요. 순서는 자유롭고, 쉼표·공백으로 구분합니다.</p>',
    '<input id="bj-answer" type="text" spellcheck="false" autocomplete="off" aria-label="구성 약재 입력"',
    ' placeholder="예: 황기 당귀 백출 감초">',
    '<div class="answer-actions"><button class="primary" type="button" id="bj-check">채점하기</button>',
    '<button type="button" id="bj-reveal">정답 보기</button>',
    '<button class="primary" type="button" id="bj-next" hidden>다음 문제 →</button></div>',
    '<div class="answer-feedback" id="bj-feedback" hidden aria-live="polite"></div></div></section>',
    '<section id="bj-list" hidden><div class="list-top"><h2>전체 처방</h2>',
    '<span class="muted">40개 처방 · 45문항</span></div><div id="bj-list-items" class="clauses-list"></div></section>',
    '<section id="bj-stats" hidden><h2>내 오답 통계</h2><div id="bj-metrics" class="stats-summary"></div>',
    '<div id="bj-stats-items" class="stats-list"></div></section>',
    '<p class="support">기준: 「실습시험처방 Clean 2 (1).pdf」 61~100번. 약재 용량과 포제는 채점하지 않습니다.',
    ' 78번 침향/목향, 100번 과루인(본문)/동과자(그림)는 둘 중 하나를 정답으로 인정합니다.',
    ' 풀이 기록은 현재 브라우저에 계정별로 저장됩니다.</p></div>'
  ].join('');
  const normalize = text => String(text || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}]/gu,'');
  const escape = text => String(text).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  function options(name) {
    const names = [name, ...(ALIAS[name] || [])];
    for (const n of [...names]) if (HERB_HANJA[n]) names.push(HERB_HANJA[n]);
    return names.map(normalize);
  }
  function matches(answer, herb) {
    return herb.split('/').some(opt => options(opt).includes(normalize(answer)));
  }
  const tokenList = s => String(s).split(/[\s,，、;；·ㆍ]+/).map(x=>x.trim()).filter(Boolean);
  const storeKey = () => 'final-2026-bangjae-v1:' + ($('account-name')?.textContent.trim() || 'unknown');
  let history={}, order=FORMULAS.map(q=>q.id), position=0, graded=false, view='quiz';
  function load(){try{history=JSON.parse(localStorage.getItem(storeKey())||'{}')||{}}catch{history={}}}
  function save(){try{localStorage.setItem(storeKey(),JSON.stringify(history))}catch{}}
  function sequence(){
    const onlyWrong=$('bj-wrong').checked;
    return order.map(id=>FORMULAS.find(q=>q.id===id)).filter(q=>q && (!onlyWrong || history[q.id]?.lastCorrect===false));
  }
  function currentQuestion(){const items=sequence();position=Math.min(position,Math.max(0,items.length-1));return items[position]||null}
  function metrics(){
    const attempted=FORMULAS.filter(q=>(history[q.id]?.attempts||0)>0);
    const correct=FORMULAS.filter(q=>history[q.id]?.lastCorrect===true).length;
    const attempts=attempted.reduce((n,q)=>n+history[q.id].attempts,0);
    const wrong=attempted.reduce((n,q)=>n+(history[q.id].wrong||0),0);
    $('bj-progress').textContent='최근 정답 '+correct+' / 45';
    $('bj-attempts').textContent='누적 '+attempts+'회';
    $('bj-bar').style.width=(correct/45*100)+'%';
    return {attempted:attempted.length,correct,attempts,wrong};
  }
  function renderNumberStrip(current){
    const strip=$('bj-number-strip');
    strip.replaceChildren();
    const available=sequence();
    for(let num=61;num<=100;num++){
      const matches=available.filter(q=>q.num===num);
      const button=document.createElement('button');
      button.type='button';
      button.className='bj-number'+(current?.num===num?' is-current':'');
      button.textContent=String(num);
      button.disabled=!matches.length;
      button.title=matches.length>1?'출전별 '+matches.length+'문항':'처방 '+num+'번';
      button.setAttribute('aria-label',num+'번 처방'+(matches.length>1?' · 출전 '+matches.length+'문항':''));
      if(current?.num===num)button.setAttribute('aria-current','step');
      button.onclick=()=>{
        const next=matches.findIndex(q=>q.id===current?.id);
        const target=next>=0?matches[(next+1)%matches.length]:matches[0];
        const index=available.findIndex(q=>q.id===target?.id);
        if(index<0)return;
        position=index;renderQuiz();
      };
      strip.append(button);
    }
    const currentButton=strip.querySelector('[aria-current="step"]');
    if(currentButton){
      const left=currentButton.offsetLeft-(strip.clientWidth-currentButton.offsetWidth)/2;
      strip.scrollTo({left:Math.max(0,left),behavior:'instant'});
    }
  }
  function renderQuiz(){
    metrics();
    const items=sequence(), q=currentQuestion();
    $('bj-question').hidden=!q; $('bj-empty').hidden=!!q;
    if(!q)return;
    renderNumberStrip(q);
    $('bj-position').textContent=(position+1)+' / '+items.length;
    $('bj-title').textContent=q.num+'. '+q.name+' ('+q.hanja+')';
    $('bj-source').textContent=q.source?'출전 · '+q.source:'실습시험 처방';
    $('bj-answer').value=''; $('bj-answer').disabled=false;
    $('bj-feedback').hidden=true; $('bj-feedback').replaceChildren();
    $('bj-check').hidden=false;$('bj-reveal').hidden=false;$('bj-next').hidden=true;
    $('bj-prior').disabled=items.length<=1; $('bj-skip').disabled=items.length<=1;
    graded=false;
  }
  function resultRow(parent, label, content){
    const node=document.createElement('div');node.className='result-row';
    const cap=document.createElement('strong');cap.textContent=label;
    const val=document.createElement('div');val.textContent=content;val.style.fontFamily='Pretendard,sans-serif';val.style.fontSize='15px';
    node.append(cap,val);parent.append(node);
  }
  function grade(reveal=false){
    if(graded)return;
    const q=currentQuestion();if(!q)return;
    const tokens=reveal?[]:tokenList($('bj-answer').value),remaining=[...tokens],missing=[];
    for(const herb of q.herbs){
      const idx=remaining.findIndex(v=>matches(v,herb));
      if(idx>=0)remaining.splice(idx,1);else missing.push(herb);
    }
    const correct=!reveal&&missing.length===0&&remaining.length===0;
    const panel=$('bj-feedback');panel.replaceChildren();
    const heading=document.createElement('h3');heading.className=correct?'feedback-good':'feedback-bad';
    heading.textContent=correct?'O · 정답':reveal?'정답 확인':'X · 오답';panel.append(heading);
    resultRow(panel,'정답 구성 ('+q.herbs.length+'미)',q.herbs.map(x=>x.replace('/',' 또는 ')).join(' · '));
    if(!reveal){
      if(missing.length)resultRow(panel,'빠진 약재',missing.map(x=>x.replace('/',' 또는 ')).join(' · '));
      if(remaining.length)resultRow(panel,'추가 입력',remaining.join(' · '));
    }
    panel.hidden=false;
    const prev=history[q.id]||{attempts:0,wrong:0,reveals:0};
    history[q.id]={attempts:prev.attempts+1,wrong:prev.wrong+(correct?0:1),
      reveals:prev.reveals+(reveal?1:0),lastCorrect:correct,lastAt:Date.now()};
    save();metrics();graded=true;
    $('bj-answer').disabled=true;$('bj-check').hidden=true;$('bj-reveal').hidden=true;
    $('bj-next').hidden=false;$('bj-next').focus({preventScroll:true});
  }
  function move(delta){
    const items=sequence();if(!items.length)return;
    position=(position+delta+items.length)%items.length;renderQuiz();
    if(!host.hidden&&view==='quiz')$('bj-answer').focus({preventScroll:true});
  }
  function shuffled(){
    order=FORMULAS.map(q=>q.id);
    for(let i=order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[order[i],order[j]]=[order[j],order[i]]}
  }
  function selectView(name){
    view=name;
    host.querySelectorAll('[data-bj-view]').forEach(btn=>btn.setAttribute('aria-current',String(btn.dataset.bjView===name)));
    $('bj-quiz').hidden=name!=='quiz';$('bj-list').hidden=name!=='list';$('bj-stats').hidden=name!=='stats';
    if(name==='quiz')renderQuiz();
    if(name==='list')renderList();
    if(name==='stats')renderStats();
  }
  function openItem(q){
    order=FORMULAS.map(x=>x.id);$('bj-order').value='ordered';$('bj-wrong').checked=false;
    position=order.indexOf(q.id);selectView('quiz');
  }
  function renderList(){
    metrics();const dest=$('bj-list-items');dest.replaceChildren();
    for(const q of FORMULAS){
      const record=history[q.id],btn=document.createElement('button');
      const status=record?(record.lastCorrect?'최근 정답':'복습 필요'):'미학습';
      btn.type='button';btn.className='clause-card';
      btn.innerHTML='<div class="clause-head"><strong>'+q.num+'. '+escape(q.name)+'</strong>'+
        '<span class="'+(record?(record.lastCorrect?'status-ok':'status-review'):'status-none')+'">'+status+'</span></div>'+
        '<div class="clause-excerpt">'+escape(q.hanja+(q.source?' · '+q.source:''))+'</div>'+
        '<div class="clause-open">문제 풀기 ›</div>';
      btn.onclick=()=>openItem(q);dest.append(btn);
    }
  }
  function renderStats(){
    const s=metrics(),dest=$('bj-stats-items');dest.replaceChildren();
    $('bj-metrics').innerHTML=[
      ['학습한 문항',s.attempted+' / 45'],['누적 풀이',s.attempts+'회'],
      ['오답·정답 확인',s.wrong+'회'],['최근 정답',s.correct+'문항']
    ].map(([label,value])=>'<div class="metric"><strong>'+value+'</strong><span>'+label+'</span></div>').join('');
    const tried=FORMULAS.filter(q=>history[q.id]?.attempts).sort((a,b)=>history[b.id].wrong-history[a.id].wrong);
    if(!tried.length){dest.textContent='아직 풀이 기록이 없습니다.';return}
    for(const q of tried){
      const h=history[q.id],btn=document.createElement('button');btn.type='button';btn.className='stat-row';
      btn.innerHTML='<strong>'+q.num+'. '+escape(q.name)+(q.source?' · '+escape(q.source):'')+'</strong>'+
        '<span>풀이 '+h.attempts+'회 · 오답 '+h.wrong+'회</span>'+
        '<b class="'+(h.lastCorrect?'status-ok':'status-review')+'">'+(h.lastCorrect?'최근 정답':'복습 필요')+'</b>';
      btn.onclick=()=>openItem(q);dest.append(btn);
    }
  }
  $('bj-order').onchange=e=>{if(e.target.value==='random')shuffled();else order=FORMULAS.map(q=>q.id);position=0;renderQuiz()};
  $('bj-wrong').onchange=()=>{position=0;renderQuiz()};
  $('bj-reset').onclick=()=>{if($('bj-order').value==='random')shuffled();position=0;renderQuiz()};
  $('bj-prior').onclick=()=>move(-1);$('bj-skip').onclick=()=>move(1);$('bj-next').onclick=()=>move(1);
  $('bj-check').onclick=()=>grade();$('bj-reveal').onclick=()=>grade(true);
  $('bj-answer').addEventListener('keydown',e=>{
    if(e.key!=='Enter'||e.shiftKey||e.isComposing||e.keyCode===229)return;
    e.preventDefault();grade();
  });
  $('bj-next').addEventListener('keydown',e=>{
    if(e.key!=='Enter'||e.isComposing)return;
    e.preventDefault();move(1);
  });
  host.querySelectorAll('[data-bj-view]').forEach(btn=>btn.onclick=()=>selectView(btn.dataset.bjView));
  document.addEventListener('bangjae:show',()=>{load();selectView(view)});
  load();renderQuiz();
}