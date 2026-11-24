
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { CLAUSES } from './final-shanghan-data.js?v=20261124-sanghan-136-v2';
import { HANJA_READINGS, DUEUM_PAIRS, ALT_READINGS } from './final-hanja-readings.js?v=20261124-sanghan-136-v2';

const $ = id => document.getElementById(id);
const NAMES = ['고세현','석주형','홍대진','안선웅','박준영','김지원','정은찬'];
const PROGRESS_ID = 'final-2026-shanghan-v1';
const STATS_PREFIX = 'final-2026-shanghan-';
const NUMBERS = CLAUSES.map(item => item.num);
const CLAUSE_MAP = new Map(CLAUSES.map(item => [item.num,item]));
let auth,db,uid='',state=null,currentBlanks=[],graded=false,currentRevealed=false,manualClauseNum=null;
let authenticated=false,registering=false,syncTimer=null,syncChain=Promise.resolve(),syncFailed=false;
let currentView='quiz',selectedSubject='sanghan';

function normalizeName(value){return String(value||'').normalize('NFC').trim().replace(/\s/g,'');}
function nameUid(name){return 'student-'+[...new TextEncoder().encode(normalizeName(name))].map(b=>b.toString(16).padStart(2,'0')).join('');}
function nameEmail(name){return nameUid(name)+'-first@example.com';}
function message(text,ok=false){$('auth-message').textContent=text;$('auth-message').classList.toggle('success',ok);}
function busy(form,on){form.querySelectorAll('input,button').forEach(el=>el.disabled=on);}
function showRegistration(on){$('auth-login').hidden=on;$('auth-register').hidden=!on;message('');}
function friendly(error){
 const code=String(error?.code||'');
 if(/email-already-in-use/.test(code))return '이미 가입된 이름입니다. 로그인해 주세요.';
 if(/invalid-credential|wrong-password|user-not-found|invalid-login-credentials/.test(code))return '아이디나 비밀번호가 올바르지 않습니다.';
 if(/weak-password/.test(code))return '비밀번호는 6자 이상이어야 합니다.';
 if(/too-many-requests/.test(code))return '로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.';
 if(/permission-denied/.test(code))return '승인되지 않은 계정이거나 Firebase 접근 권한이 없습니다.';
 return '요청에 실패했습니다. 연결 상태와 Firebase 설정을 확인해 주세요.';
}
function localKey(){return 'final-2026:pending:v1:'+uid;}
function defaultState(){return {schema:2,updatedAt:0,order:[...NUMBERS],orderMode:'ordered',pos:0,version:1,mode:'typing',history:{},summaryHistory:{},roundNumbers:[...NUMBERS],setHistory:{},setResults:{},setIndex:1,finished:false,blankCoverage:{},blankRounds:{},blankSelections:{}};}
function safeState(data){
 const s=defaultState();
 if(!data||typeof data!=='object')return s;
 if(Array.isArray(data.order)){const filtered=data.order.filter(n=>NUMBERS.includes(n));if(filtered.length===NUMBERS.length&&new Set(filtered).size===NUMBERS.length)s.order=filtered;}
 s.orderMode=data.orderMode==='ordered'||data.orderMode==='random'?data.orderMode:(s.order.every((n,i)=>n===NUMBERS[i])?'ordered':'random');
 s.pos=Number.isInteger(data.pos)?Math.max(0,Math.min(NUMBERS.length-1,data.pos)):0;
 s.version=[1,2,3,4,5].includes(Number(data.version))?Number(data.version):1;
 s.mode=data.mode==='writing'?'writing':'typing';
 s.history=data.history&&typeof data.history==='object'&&!Array.isArray(data.history)?data.history:{};
 // 이전 풀이 기록은 초기 진행률로 한 번만 이관하며, 초기화 이후에도 오답 통계는 보존합니다.
 s.summaryHistory=data.summaryHistory&&typeof data.summaryHistory==='object'&&!Array.isArray(data.summaryHistory)?data.summaryHistory:Object.fromEntries(NUMBERS.filter(n=>s.history[n]).map(n=>[n,{attempts:Number(s.history[n].attempts)||0,lastCorrect:s.history[n].lastCorrect===true}]));
 // 세트별 완료 기록은 누적 풀이/오답 기록과 별도로 저장합니다.
 // 구버전 26조 데이터에서 제외 조문을 걸러내되, 해당 세트 및 기존 오답 기록은 유지합니다.
 s.setHistory=data.setHistory&&typeof data.setHistory==='object'&&!Array.isArray(data.setHistory)?Object.fromEntries(NUMBERS.filter(n=>data.setHistory[n]===true).map(n=>[n,true])):{};
 const validRound=Array.isArray(data.roundNumbers)?data.roundNumbers.filter(n=>NUMBERS.includes(n)):[];
 s.roundNumbers=validRound.length>0&&new Set(validRound).size===validRound.length?validRound:[...NUMBERS];
 s.setResults=data.setResults&&typeof data.setResults==='object'&&!Array.isArray(data.setResults)?Object.fromEntries(s.roundNumbers.filter(n=>data.setResults[n]===true||data.setResults[n]===false).map(n=>[n,data.setResults[n]])):Object.fromEntries(s.roundNumbers.filter(n=>s.setHistory[n]===true).map(n=>[n,s.history[n]?.lastCorrect===true]));
 s.setHistory=Object.fromEntries(s.roundNumbers.filter(n=>s.setHistory[n]===true).map(n=>[n,true]));
 s.setIndex=Number.isSafeInteger(data.setIndex)&&data.setIndex>0?data.setIndex:1;
 s.finished=data.finished===true;
 s.blankCoverage=data.blankCoverage&&typeof data.blankCoverage==='object'&&!Array.isArray(data.blankCoverage)?data.blankCoverage:{};
 s.blankRounds=data.blankRounds&&typeof data.blankRounds==='object'&&!Array.isArray(data.blankRounds)?data.blankRounds:{};
 s.blankSelections=data.blankSelections&&typeof data.blankSelections==='object'&&!Array.isArray(data.blankSelections)?data.blankSelections:{};
 s.updatedAt=Number(data.updatedAt)||0;
 return s;
}
function status(text,warning=false){$('sync-status').textContent=text;$('sync-status').classList.toggle('warning',warning);}
async function loadProgress(){
 let fromLocal=null;
 try{fromLocal=JSON.parse(localStorage.getItem(localKey())||'null');}catch{}
 let fromCloud=null;
 try{
  const snap=await getDoc(doc(db,'users',uid,'progress',encodeURIComponent(PROGRESS_ID)));
  if(snap.exists())fromCloud=JSON.parse(snap.data().payload||'null');
 }catch(error){syncFailed=true;console.warn('진도 읽기:',error);}
 state=safeState((Number(fromLocal?.updatedAt)||0)>=(Number(fromCloud?.updatedAt)||0)?(fromLocal||fromCloud):(fromCloud||fromLocal));
 if(fromLocal&&!fromCloud){queueSave();}
 if(fromLocal&&fromCloud&&state.updatedAt>Number(fromCloud.updatedAt||0)){queueSave();}
 try{localStorage.setItem(localKey(),JSON.stringify(state));}catch{}
 status(syncFailed?'기기 저장만 가능 · 다시 동기화': 'Firebase 연결됨',syncFailed);
}
function queueSave(){
 if(!uid||!state)return;
 state.updatedAt=Date.now();
 try{localStorage.setItem(localKey(),JSON.stringify(state));}catch{}
 status('저장 중…');
 clearTimeout(syncTimer);
 syncTimer=setTimeout(flushSave,750);
}
function flushSave(){
 clearTimeout(syncTimer);
 if(!uid||!state)return syncChain;
 const targetUid=uid,payload=JSON.stringify(state);
 syncChain=syncChain.catch(()=>{}).then(async()=>{
  if(auth.currentUser?.uid!==targetUid)return;
  try{
   await setDoc(doc(db,'users',targetUid,'progress',encodeURIComponent(PROGRESS_ID)),{payload,updatedAt:serverTimestamp()});
   syncFailed=false;
   if(uid===targetUid)status('Firebase 저장됨');
  }catch(error){
   syncFailed=true;console.warn('진도 저장:',error);
   if(uid===targetUid)status('기기에 저장됨 · 다시 동기화',true);
  }
 });
 return syncChain;
}
function recordAttempt(num,correct,revealed){
 const id=encodeURIComponent(STATS_PREFIX+String(num));
 setDoc(doc(db,'users',uid,'errorStats',id),{
  label:String(num)+'조',
  group:'상한론 · 기말고사 통암기',
  total:increment(1),wrong:increment(!correct&&!revealed?1:0),
  revealed:increment(revealed?1:0),updatedAt:serverTimestamp()
 },{merge:true}).catch(error=>{console.warn('오답 통계 저장:',error);status('진도 기기에 저장 · 오답 통계 동기화 확인 필요',true);});
}
function getList(){
 const active=new Set(state?.roundNumbers||NUMBERS);
 return (state?.order||NUMBERS).filter(num=>active.has(num));
}
function currentClause(){
 if(manualClauseNum!==null)return CLAUSE_MAP.get(manualClauseNum)||null;
 const items=getList();
 return CLAUSE_MAP.get(items[Math.min(state.pos,items.length-1)])||null;
}
function selectFirstUnanswered(){
 const items=getList();
 const index=items.findIndex(num=>state.setHistory[num]!==true);
 state.pos=index<0?0:index;
}
function shuffleOrder(){
 const old=state.order.join(',');
 for(let i=state.order.length-1;i>0;i--){
  const j=Math.floor(Math.random()*(i+1));
  [state.order[i],state.order[j]]=[state.order[j],state.order[i]];
 }
 if(state.order.length>1&&state.order.join(',')===old)[state.order[0],state.order[1]]=[state.order[1],state.order[0]];
}
function refreshBlankPositions(){
 if(state.version===5)return;
 for(const num of state.roundNumbers){
  const key=num+':'+state.version;
  state.blankRounds[key]=(Number(state.blankRounds[key])||0)+1;
 }
}
function advanceRound(){
 const wrong=state.roundNumbers.filter(num=>state.setResults[num]!==true);
 if(!wrong.length){
  state.finished=true;
  return;
 }
 state.roundNumbers=wrong;
 state.setHistory={};
 state.setResults={};
 state.setIndex+=1;
 if(state.orderMode==='random')shuffleOrder();
 refreshBlankPositions();
 state.pos=0;
}

// 기말고사 21학번 족보: 실제 빈칸 구간이 명확히 복기된 4문항만 표기.
const PAST_EXAM_BLANKS=Object.freeze({105:[{text:'調胃承氣湯',year:'21학번'}],118:[{text:'因燒鍼煩躁',year:'21학번'}],136:[{text:'但頭微汗出',year:'21학번'}]});
function seedHash(text){let h=2166136261;for(const ch of text){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
// 쉼표·마침표 등 구두점으로 끊긴 한자 구간을 빈칸 후보 하나로 취급합니다.
// 처방명 + 主之 및 구두점 없는 문장은 임의의 글자 수로 분할하지 않습니다.
function getBlankCandidates(clause){
 const original=clause.original;
 const result=[];
 for(const match of original.matchAll(/[\u3400-\u9fff\uf900-\ufaff]+/g)){
  const start=match.index,end=start+match[0].length;
  const candidate={start,end,text:match[0],id:start+':'+end};
  const exam=(PAST_EXAM_BLANKS[clause.num]||[]).find(({text})=>{
   const examStart=original.indexOf(text);
   return examStart>=start&&examStart+text.length<=end;
  });
  if(exam){
   candidate.pastYear=exam.year;
   candidate.pastExamText=exam.text;
  }
  result.push(candidate);
 }
 return result;
}
function makeBlanks(clause,version,progress=state){
 const candidates=getBlankCandidates(clause);
 if(version===5)return candidates;
 const target=[0,3,5,7,9][version]||3;
 // 오답 복습용 빈칸 조합은 페이지 이동/새로고침 후에도 동일하게 유지합니다.
 const stored=progress?.blankSelections?.[clause.num+':'+version];
 if(Array.isArray(stored)){
  const ids=new Set(stored);
  const selected=candidates.filter(candidate=>ids.has(candidate.id));
  if(selected.length===Math.min(target,candidates.length))return selected;
 }
 const rounds=Number(progress?.blankRounds?.[clause.num+':'+version])||0;
 // 기출 여부에 관계없이 모든 덩어리를 같은 우선순위로 배치합니다.
 // 한 번 변경할 때마다 target칸씩 순환하므로, 후보가 더 많으면 반드시 조합이 달라집니다.
 const pool=[...candidates].sort((a,b)=>seedHash(clause.num+':'+version+':'+a.id)-seedHash(clause.num+':'+version+':'+b.id));
 const at=pool.length?((rounds*target)%pool.length+pool.length)%pool.length:0;
 const selected=Array.from({length:Math.min(target,pool.length)},(_,i)=>pool[(at+i)%pool.length]);
 return selected.sort((a,b)=>a.start-b.start);
}
// 이전에 틀린 빈칸은 고정하고, 맞힌 빈칸 자리에는 다른 후보를 무작위로 채웁니다.
// 새 후보가 부족한 경우에만 기존 정답 빈칸을 다시 사용합니다.
function makeRetryBlanks(clause,version,previous,wrongIds){
 const candidates=getBlankCandidates(clause);
 const target=version===5?candidates.length:Math.min([0,3,5,7,9][version]||3,candidates.length);
 const locked=new Set(wrongIds);
 const previousIds=new Set(previous.map(blank=>blank.id));
 const kept=candidates.filter(blank=>locked.has(blank.id));
 const randomize=items=>{
  for(let i=items.length-1;i>0;i--){
   const j=Math.floor(Math.random()*(i+1));
   [items[i],items[j]]=[items[j],items[i]];
  }
  return items;
 };
 const fresh=randomize(candidates.filter(blank=>!previousIds.has(blank.id)));
 const fallback=randomize(candidates.filter(blank=>previousIds.has(blank.id)&&!locked.has(blank.id)));
 return [...kept,...fresh,...fallback].slice(0,target).map(blank=>blank.id);
}
function normalizeAnswer(value){
 return String(value||'').normalize('NFKC').replace(/[\s,.，。．、;；:：!?！？'"‘’“”\-·]/g,'').replace(/[爲为]/g,'為').replace(/不/g,'不').toLowerCase();
}
// 한자 원문, 한글 독음, 한자+한글 혼용을 글자 위치별로 비교합니다.
// 則(칙/즉), 便(편/변), 數(수/삭), 惡(악/오) 및 두음법칙을 허용합니다.
function answerMatches(input,expected){
 const given=[...normalizeAnswer(input)],original=[...normalizeAnswer(expected)];
 if(given.length!==original.length)return false;
 return original.every((ch,i)=>{
  const typed=given[i];
  if(typed===ch)return true;
  if(!/^[가-힣]$/.test(typed))return false;
  const primary=HANJA_READINGS[ch];
  if(!primary)return false;
  const allowed=new Set([primary,...(ALT_READINGS[ch]||[])]);
  for(const [before,after] of DUEUM_PAIRS){
   if(allowed.has(before))allowed.add(after);
   if(allowed.has(after))allowed.add(before);
  }
  return allowed.has(typed);
 });
}
// 사이트의 한자 독음 사전을 사용해 각 빈칸의 정답 독음을 표시합니다.
function correctReading(value){
 const chars=[...String(value||'').normalize('NFKC')];
 return chars.map((ch,i)=>{
  const next=chars[i+1]||'',prev=chars[i-1]||'';
  // 기말 20개 조문에서 문맥에 따라 독음이 달라지는 다의자.
  if(ch==='便'&&(prev==='小'||prev==='大'))return '변';
  if(ch==='數')return '삭';
  if(ch==='惡'&&next==='寒')return '오';
  if(ch==='更'&&next==='加')return '갱';
  return HANJA_READINGS[ch]||ch;
 }).join('');
}
function textNode(tag,className,value){const el=document.createElement(tag);if(className)el.className=className;el.textContent=value;return el;}
function setView(view){
 currentView=view;
 document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-current',String(b.dataset.view===view)));
 $('quiz-view').hidden=view!=='quiz';$('list-view').hidden=view!=='list';$('stats-view').hidden=view!=='stats';
 if(view==='quiz')renderQuiz();
 if(view==='list')renderList();
 if(view==='stats')renderStats();
 window.scrollTo({top:0,behavior:'instant'});
}
function selectSubject(name){
 selectedSubject=name;
 document.querySelectorAll('[data-subject]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.subject===name)));
 $('sanghan-area').hidden=name!=='sanghan';
 $('bangjae-area').hidden=name!=='bangjae';
 $('subject-pending').hidden=name==='sanghan'||name==='bangjae';
 $('pending-name').textContent=name==='sanghan'?'':document.querySelector('[data-subject="'+name+'"]')?.textContent.trim()||'과목';
 if(name==='sanghan')setView(currentView);
 else if(name==='bangjae'){document.dispatchEvent(new Event('bangjae:show'));window.scrollTo({top:0,behavior:'instant'});}
 else window.scrollTo({top:0,behavior:'instant'});
}
function syncControls(){
 $('version').value=String(state.version);
 $('order-mode').value=state.orderMode;
 $('mode-typing').setAttribute('aria-pressed',String(state.mode==='typing'));
 $('mode-writing').setAttribute('aria-pressed',String(state.mode==='writing'));
 const entries=NUMBERS.map(n=>state.summaryHistory[n]).filter(Boolean);
 const total=state.roundNumbers.length;
 const completed=state.roundNumbers.filter(n=>state.setHistory[n]===true).length;
 const attempts=entries.reduce((a,x)=>a+(Number(x.attempts)||0),0);
 $('set-text').textContent=state.setIndex+'세트';
 $('progress-text').textContent='완료 '+completed+' / '+total+'조';
 $('attempts-text').textContent='누적 '+attempts+'회';
 $('progress-bar').style.width=(total?completed/total*100:0)+'%';
 $('shuffle-study-order').disabled=state.finished;
}
function resetQuestion(){graded=false;currentRevealed=false;currentBlanks=[];}
function renderNumberStrip(current){
 const strip=$('sh-number-strip');
 strip.replaceChildren();
 const available=getList();
 for(const num of NUMBERS){
  const button=document.createElement('button');
  button.type='button';
  const active=available.includes(num);
  const canOpen=active||manualClauseNum!==null;
  const attempted=state.setHistory[num]===true;
  const resultClass=attempted?(state.setResults[num]===true?' is-correct':' is-wrong'):'';
  button.className='bj-number'+resultClass+(current?.num===num?' is-current':'');
  button.textContent=num+'조';
  button.disabled=!canOpen;
  button.title=num+'조'+(attempted?(state.setResults[num]===true?' · 이번 세트 정답':' · 이번 세트 오답'):(active?'':' · 현재 복습 세트에서 제외'));
  button.setAttribute('aria-label',button.title);
  if(current?.num===num)button.setAttribute('aria-current','step');
  button.onclick=()=>{
   if(!canOpen)return;
   if(state.finished||!active){goToClause(num);return;}
   manualClauseNum=null;
   state.pos=available.indexOf(num);
   resetQuestion();queueSave();renderQuiz();
  };
  strip.append(button);
 }
 const currentButton=strip.querySelector('[aria-current="step"]');
 if(currentButton){
  const left=currentButton.offsetLeft-(strip.clientWidth-currentButton.offsetWidth)/2;
  strip.scrollTo({left:Math.max(0,left),behavior:'instant'});
 }
}
function changeCurrentBlanks(){
 if(!state)return;
 const item=currentClause();
 const target=[0,3,5,7,9][state.version]||3;
 if(!item||state.version===5||getBlankCandidates(item).length<=target)return;
 const key=item.num+':'+state.version;
 state.blankSelections[key]=makeRetryBlanks(item,state.version,currentBlanks,[]);
 resetQuestion();queueSave();renderQuiz();
}
function renderQuiz(){
 if(!state)return;
 syncControls();
 const manual=manualClauseNum!==null;
 const items=manual?[manualClauseNum]:getList();
 const item=state.finished&&!manual?null:currentClause();
 $('quiz-content').hidden=!item;$('quiz-empty').hidden=!!item;
 const target=[0,3,5,7,9][state.version]||3;
 $('refresh-study-blanks').disabled=!item||state.version===5||getBlankCandidates(item).length<=target;
 if(!item){
  $('quiz-empty').querySelector('h3').textContent=state.finished?'모든 조문 학습 완료':'풀 문제가 없습니다.';
  $('empty-description').textContent=state.finished?'현재 세트의 모든 조문을 맞혔습니다. 새로고침으로 20개 조문을 다시 시작할 수 있습니다.':'등록된 조문이 없습니다.';
  $('empty-show-all').textContent='20개 다시 시작';
  $('empty-show-all').hidden=!state.finished;
  return;
 }
 renderNumberStrip(item);
 currentBlanks=makeBlanks(item,state.version,state);
 const chunks=getBlankCandidates(item);
 const practiced=chunks.filter(c=>(state.blankCoverage[item.num]?.[c.id]?.tries||0)>0).length;
 $('question-position').textContent=manual?'개별 복습':(items.indexOf(item.num)+1)+' / '+items.length;
 $('question-num').textContent=item.num+'조';
 $('question-meta').textContent=currentBlanks.length+'개 빈칸 · '+practiced+'/'+chunks.length+' 덩어리 학습';
 $('clause-text').replaceChildren();
 const passage=$('clause-text'),original=item.original;
 let last=0;
 currentBlanks.forEach((blank,i)=>{
  passage.append(document.createTextNode(original.slice(last,blank.start)));
  const slot=textNode('span','cloze'+(blank.pastYear?' past-cloze':''),'('+(i+1)+') ______');slot.dataset.index=String(i);
  if(blank.pastYear)slot.append(textNode('span','past-tag',blank.pastExamText&&blank.pastExamText!==blank.text?blank.pastYear+' 기출 포함':blank.pastYear+' 기출'));
  passage.append(slot);last=blank.end;
 });
 passage.append(document.createTextNode(original.slice(last)));
 $('answer-fields').replaceChildren();
 $('answer-fields').style.setProperty('--blank-rows',String(Math.max(1,Math.ceil(currentBlanks.length/2))));
 const writing=state.mode==='writing';
 currentBlanks.forEach((blank,i)=>{
  const field=document.createElement('label');field.className='answer-field';
  const caption=textNode('span','field-label','빈칸 '+(i+1));
  if(blank.pastYear)caption.append(textNode('span','past-input-tag',blank.pastExamText&&blank.pastExamText!==blank.text?blank.pastYear+' 기출 포함':blank.pastYear+' 기출'));
  field.append(caption);
  const input=document.createElement('input');input.type='text';input.id='answer-'+i;input.autocomplete='off';input.spellcheck=false;input.placeholder='한자 또는 독음 입력';input.dataset.index=String(i);
  input.addEventListener('keydown',event=>{
   if(event.key!=='Enter'||event.isComposing||event.keyCode===229)return;
   event.preventDefault();
   const entries=currentBlanks.map((_,index)=>$('answer-'+index));
   // 모두 입력했거나 마지막 남은 빈칸에 도달하면, 미입력 칸이 있어도 채점합니다.
   if(entries.every(node=>node?.value.trim())){gradeTyped();return;}
   // Enter는 뒤쪽 미입력 칸으로 이동하고, 더 이상 이동할 빈칸이 없으면 채점합니다.
   const next=entries.find((node,index)=>index>i&&!node.value.trim());
   if(next)next.focus();
   else gradeTyped();
  });
  field.append(input);$('answer-fields').append(field);
 });
 $('answer-fields').hidden=writing;
 $('writing-tip').hidden=!writing;
 $('answer-feedback').hidden=true;$('answer-feedback').replaceChildren();
 $('button-grade').hidden=writing;
 $('button-reveal').hidden=false;
 $('button-correct').hidden=true;$('button-wrong').hidden=true;
 $('button-next').hidden=true;
 $('button-grade').disabled=false;$('button-reveal').disabled=false;
 $('translation').hidden=true;$('translation').textContent=item.translation;
 $('question-prior').disabled=manual||items.length<2;$('question-next').disabled=manual||items.length<2;
 if(writing)$('writing-tip').textContent='종이에 한자로 써 본 다음 정답 보기를 눌러 스스로 채점하세요.';
}
function showFeedback(item,correct,revealed,drafts){
 if(!item)return;
 const panel=$('answer-feedback');panel.replaceChildren();
 panel.append(textNode('h3',correct?'feedback-good':'feedback-bad',correct?'O · 정답':'X · '+(revealed?'정답 확인':'오답')));
 currentBlanks.forEach((blank,i)=>{
  const user=String(drafts?.[i]||'').trim();
  const evaluated=state.mode==='typing'&&!revealed;
  const passed=evaluated&&answerMatches(user,blank.text);
  const row=textNode('div','result-row'+(evaluated?(passed?' result-correct':' result-wrong'):''),(evaluated?(passed?'O  ':'X  '):'')+'빈칸 '+(i+1)+'  '+blank.text);
  row.append(textNode('small','result-reading','정답 독음: '+correctReading(blank.text)));
  if(evaluated){
   row.append(textNode('small','result-your','입력: '+(user||'(미입력)')));
   // 개별 빈칸과 입력란에도 O/X 결과 표시
   const passageBlank=$('clause-text').querySelector('.cloze[data-index="'+i+'"]');
   if(passageBlank){
    passageBlank.classList.add(passed?'cloze-correct':'cloze-wrong');
    passageBlank.append(textNode('span','blank-verdict '+(passed?'verdict-correct':'verdict-wrong'),passed?'O':'X'));
   }
   const input=$('answer-'+i);
   if(input){
    input.classList.add(passed?'input-correct':'input-wrong');
    input.setAttribute('aria-invalid',String(!passed));
    const verdict=textNode('span','input-verdict '+(passed?'verdict-correct':'verdict-wrong'),passed?'O':'X');
    verdict.setAttribute('aria-label',passed?'정답':'오답');
    input.after(verdict);
   }
  }
  panel.append(row);
 });
 panel.hidden=false;
 $('translation').hidden=false;
 $('button-grade').hidden=true;$('button-reveal').hidden=true;
 $('button-correct').hidden=true;$('button-wrong').hidden=true;
 $('button-next').hidden=false;
 $('answer-fields').querySelectorAll('input').forEach(i=>i.disabled=true);
 graded=true;
 // Enter를 다시 누르면 다음 조문으로 넘어가도록 포커스를 옮깁니다.
 if(state.mode==='typing')$('button-next').focus({preventScroll:true});
 requestAnimationFrame(()=>panel.scrollIntoView({behavior:'smooth',block:'nearest'}));
}
function finishAttempt(correct,revealed,drafts){
 if(graded||!state)return;
 const item=currentClause();if(!item)return;
 const old=state.history[item.num]||{attempts:0,wrong:0,revealed:0};
 state.history[item.num]={
  attempts:(Number(old.attempts)||0)+1,
  wrong:(Number(old.wrong)||0)+(!correct&&!revealed?1:0),
  revealed:(Number(old.revealed)||0)+(revealed?1:0),
  lastCorrect:correct&&!revealed,
  lastAt:Date.now()
 };
 const priorSummary=state.summaryHistory[item.num]||{};
 state.summaryHistory[item.num]={attempts:(Number(priorSummary.attempts)||0)+1,lastCorrect:correct&&!revealed};
 // 정답 여부와 무관하게 한 세트에서 조문별 첫 풀이만 완료로 집계합니다.
 if(manualClauseNum===null){
  state.setHistory[item.num]=true;
  state.setResults[item.num]=correct&&!revealed;
 }
 const usage=state.blankCoverage[item.num] ||= {};
 currentBlanks.forEach((blank,i)=>{
  const passed=state.mode==='typing'&&!revealed
   ? answerMatches(drafts?.[i]||'',blank.text)
   : state.mode==='writing'&&!revealed&&correct;
  const oldChunk=usage[blank.id]||{tries:0,wrong:0};
  usage[blank.id]={
   tries:(Number(oldChunk.tries)||0)+1,
   wrong:(Number(oldChunk.wrong)||0)+(passed?0:1)
  };
 });
 const blankKey=item.num+':'+state.version;
 if(correct&&!revealed){
  // 정답 조문을 다시 열면 직전과 다른 복습용 빈칸 조합을 출제합니다.
  state.blankSelections[blankKey]=makeRetryBlanks(item,state.version,currentBlanks,[]);
 }else{
  // 타자 입력에서는 개별 O/X를 반영합니다. 한자쓰기/정답 보기에서는
  // 어떤 빈칸이 맞았는지 알 수 없으므로 현재 빈칸 전체를 유지합니다.
  const wrongIds=currentBlanks.filter((blank,i)=>
   revealed||state.mode!=='typing'||!answerMatches(drafts?.[i]||'',blank.text)
  ).map(blank=>blank.id);
  state.blankSelections[blankKey]=makeRetryBlanks(item,state.version,currentBlanks,wrongIds);
 }
 recordAttempt(item.num,correct,revealed);
 queueSave();
 showFeedback(item,correct,revealed,drafts);
 syncControls();
 renderNumberStrip(item);
}
function gradeTyped(){
 if(!state||graded||state.mode!=='typing')return;
 const drafts=currentBlanks.map((_,i)=>$('answer-'+i)?.value||'');
 const correct=drafts.every((v,i)=>answerMatches(v,currentBlanks[i].text));
 finishAttempt(correct,false,drafts);
}
function revealAnswer(){
 if(!state||graded)return;
 if(state.mode==='writing'){
  currentRevealed=true;
  const panel=$('answer-feedback');panel.replaceChildren();
  panel.append(textNode('h3','','정답 확인 · 스스로 채점'));
  currentBlanks.forEach((blank,i)=>{
   const row=textNode('div','result-row','빈칸 '+(i+1)+'  '+blank.text);
   row.append(textNode('small','result-reading','정답 독음: '+correctReading(blank.text)));
   panel.append(row);
  });
  panel.hidden=false;$('translation').hidden=false;
  $('button-reveal').hidden=true;$('button-correct').hidden=false;$('button-wrong').hidden=false;
  requestAnimationFrame(()=>panel.scrollIntoView({behavior:'smooth',block:'nearest'}));
  return;
 }
 finishAttempt(false,true,[]);
}
function gradeWritten(correct){
 if(state.mode!=='writing'||!currentRevealed||graded)return;
 finishAttempt(correct,false,[]);
}
function go(delta){
 if(!state)return;
 if(manualClauseNum!==null){
  manualClauseNum=null;
  if(!state.finished)selectFirstUnanswered();
 }else{
  const items=getList();if(!items.length||state.finished)return;
  if(delta>0&&state.roundNumbers.every(num=>state.setHistory[num]===true)){
   advanceRound();
  }else if(delta>0){
   const index=Math.min(state.pos,items.length-1);
   let target=index;
   for(let step=1;step<=items.length;step++){
    const next=(index+step)%items.length;
    if(state.setHistory[items[next]]!==true){target=next;break;}
   }
   state.pos=target;
  }else{
   state.pos=(Math.min(state.pos,items.length-1)+delta+items.length)%items.length;
  }
 }
 resetQuestion();queueSave();renderQuiz();
 $('quiz-view').scrollIntoView({behavior:'smooth',block:'start'});
 if(state.mode==='typing'&&!state.finished)requestAnimationFrame(()=>$('answer-0')?.focus({preventScroll:true}));
}
function shuffle(){
 if(state.finished)return;
 manualClauseNum=null;
 state.orderMode='random';
 shuffleOrder();
 selectFirstUnanswered();
 resetQuestion();queueSave();renderQuiz();
}
function goToClause(num){
 manualClauseNum=num;
 resetQuestion();selectSubject('sanghan');setView('quiz');
}
function renderList(){
 const host=$('clauses-list');host.replaceChildren();
 $('list-count').textContent='총 '+CLAUSES.length+'개 조문';
 for(const item of CLAUSES){
  const data=state.history[item.num];
  const card=document.createElement('button');card.type='button';card.className='clause-card';
  const head=document.createElement('div');head.className='clause-head';
  head.append(textNode('strong','',item.num+'조'));
  head.append(textNode('span',data?(data.lastCorrect?'status-ok':'status-review'):'status-none',data?(data.lastCorrect?'최근 정답':'복습 필요'):'미학습'));
  card.append(head,textNode('div','clause-excerpt',item.original),textNode('div','clause-open','문제 풀기 ›'));
  card.addEventListener('click',()=>goToClause(item.num));host.append(card);
 }
}
function renderStats(){
 const host=$('stats-list');host.replaceChildren();
 const attempted=NUMBERS.map(num=>({num,...state.history[num]})).filter(x=>Number.isFinite(x.attempts));
 const attempts=attempted.reduce((v,x)=>v+(x.attempts||0),0);
 const misses=attempted.reduce((v,x)=>v+(x.wrong||0),0);
 const mastered=attempted.filter(x=>x.lastCorrect).length;
 $('stats-summary').replaceChildren(
  metric('학습한 조문',attempted.length+' / '+NUMBERS.length),
  metric('누적 풀이',attempts+'회'),
  metric('오답',misses+'회'),
  metric('최근 정답',mastered+'조')
 );
 attempted.sort((a,b)=>((b.wrong||0)/Math.max(1,b.attempts||0))-((a.wrong||0)/Math.max(1,a.attempts||0))||(b.wrong||0)-(a.wrong||0)||a.num-b.num);
 if(!attempted.length){host.append(textNode('p','muted','아직 풀이 기록이 없습니다. 상한론 문제를 풀면 조문별 오답 통계가 쌓입니다.'));return;}
 for(const item of attempted){
  const row=document.createElement('button');row.type='button';row.className='stat-row';
  row.append(textNode('strong','',item.num+'조'),textNode('span','','풀이 '+item.attempts+'회 · 오답 '+item.wrong+'회'),textNode('b',item.lastCorrect?'status-ok':'status-review',item.lastCorrect?'최근 정답':'복습 필요'));
  row.addEventListener('click',()=>goToClause(item.num));host.append(row);
 }
}
function metric(label,value){const div=textNode('div','metric','');div.append(textNode('strong','',value),textNode('span','',label));return div;}
function initEvents(){
 $('open-register').onclick=()=>showRegistration(true);
 $('open-login').onclick=()=>showRegistration(false);
 $('login-form').onsubmit=async event=>{
  event.preventDefault();message('');
  const name=normalizeName($('login-name').value),password=$('login-password').value;
  if(!NAMES.includes(name)){message('승인된 이름만 로그인할 수 있습니다.');return;}
  busy(event.currentTarget,true);
  try{await signInWithEmailAndPassword(auth,nameEmail(name),password);}
  catch(error){message(friendly(error));}
  finally{busy(event.currentTarget,false);}
 };
 $('register-form').onsubmit=async event=>{
  event.preventDefault();message('');
  const name=normalizeName($('register-name').value),password=$('register-password').value,confirm=$('register-confirm').value;
  if(!NAMES.includes(name)){message('승인되지 않은 이름입니다.');return;}
  if(password.length<6){message('비밀번호를 6자 이상 입력해 주세요.');return;}
  if(password!==confirm){message('비밀번호 확인이 일치하지 않습니다.');return;}
  const form=event.currentTarget;busy(form,true);registering=true;
  try{
   const credential=await createUserWithEmailAndPassword(auth,nameEmail(name),password);
   registering=false;
   await activate(credential.user);
  }catch(error){registering=false;message(friendly(error));}
  finally{busy(form,false);}
 };
 $('sign-out').onclick=async()=>{
  await flushSave();await signOut(auth);location.reload();
 };
 $('sync-status').onclick=()=>{flushSave();};
 $('shuffle-study-order').onclick=()=>{
  if(!state||!uid)return;
  shuffle();
  if(currentView!=='quiz')setView('quiz');
 };
 $('refresh-study-blanks').onclick=()=>{
  if(!state||!uid)return;
  changeCurrentBlanks();
  if(currentView!=='quiz')setView('quiz');
 };
 const restartStudy=async ask=>{
  if(!state||!uid)return;
  if(ask&&!window.confirm('현재 상한론 세트를 초기화하고 20개 조문부터 다시 시작하시겠습니까?\n기존 풀이·오답 통계는 유지됩니다.'))return;
  manualClauseNum=null;
  state.summaryHistory={};
  state.roundNumbers=[...NUMBERS];
  state.setHistory={};
  state.setResults={};
  state.blankSelections={};
  state.finished=false;
  state.setIndex=1;
  state.pos=0;
  if(state.orderMode==='ordered')state.order=[...NUMBERS];
  else shuffleOrder();
  resetQuestion();queueSave();renderQuiz();
  await flushSave();
 };
 $('reset-study-progress').onclick=()=>restartStudy(true);
 document.querySelectorAll('[data-subject]').forEach(button=>button.onclick=()=>selectSubject(button.dataset.subject));
 document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
 $('version').onchange=event=>{state.version=Number(event.target.value);resetQuestion();queueSave();renderQuiz();};
 // 셔플은 조문 순서만, 빈칸 변경은 현재 조문의 빈칸 위치만 갱신합니다.
 $('mode-typing').onclick=()=>{state.mode='typing';resetQuestion();queueSave();renderQuiz();};
 $('mode-writing').onclick=()=>{state.mode='writing';resetQuestion();queueSave();renderQuiz();};
 $('order-mode').onchange=event=>{
  if(event.target.value==='random'){shuffle();return;}
  state.orderMode='ordered';state.order=[...NUMBERS];manualClauseNum=null;selectFirstUnanswered();resetQuestion();queueSave();renderQuiz();
 };
 $('question-prior').onclick=()=>go(-1);
 $('question-next').onclick=()=>go(1);
 $('button-next').onclick=()=>go(1);
 $('button-grade').onclick=gradeTyped;
 $('button-reveal').onclick=revealAnswer;
 $('button-correct').onclick=()=>gradeWritten(true);
 $('button-wrong').onclick=()=>gradeWritten(false);
 $('empty-show-all').onclick=()=>restartStudy(false);
 $('back-from-pending').onclick=()=>selectSubject('sanghan');
 window.addEventListener('online',()=>{if(uid&&syncFailed)flushSave();});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&uid)flushSave();});
}
async function activate(user){
 if(authenticated&&uid===user.uid)return;
 const name=NAMES.find(n=>nameEmail(n)===user.email);
 if(!name){await signOut(auth);message('승인되지 않은 아이디입니다.');return;}
 try{
  const snap=await getDoc(doc(db,'profiles',nameUid(name)));
  const profile=snap.exists()?snap.data():null;
  if(!profile||!profile.approved||!profile.active||profile.name!==name)throw new Error('NOT_APPROVED');
  uid=user.uid;
  await loadProgress();
  authenticated=true;
  $('account-name').textContent=name+'님';
  $('sync-status').hidden=false;$('sign-out').hidden=false;
  $('account-gate').hidden=true;$('signed-in').hidden=false;
  resetQuestion();selectSubject('sanghan');setView('quiz');
 }catch(error){
  console.error('계정 확인 또는 콘텐츠 로드 실패:',error);
  authenticated=false;uid='';$('signed-in').hidden=true;$('account-gate').hidden=false;
  $('sync-status').hidden=true;$('sign-out').hidden=true;
  message(error.message==='NOT_APPROVED'?'이름별 승인 설정이 완료되지 않은 계정입니다.':'로그인 확인에 실패했습니다. Firebase 연결을 확인해 주세요.');
  if(error.message==='NOT_APPROVED')await signOut(auth);
 }
}
initEvents();
if(!firebaseConfig.apiKey||firebaseConfig.apiKey.startsWith('YOUR_')||firebaseConfig.projectId==='YOUR_PROJECT_ID'){
 message('Firebase 설정이 아직 등록되지 않았습니다.');
}else{
 try{
  const app=initializeApp(firebaseConfig);
  auth=getAuth(app);db=getFirestore(app);
  await setPersistence(auth,browserSessionPersistence);
  onAuthStateChanged(auth,async user=>{
   if(registering)return;
   if(!user){authenticated=false;uid='';$('signed-in').hidden=true;$('account-gate').hidden=false;$('sync-status').hidden=true;$('sign-out').hidden=true;return;}
   await activate(user);
  });
 }catch(error){console.error(error);message('Firebase를 시작할 수 없습니다. 연결 상태를 확인해 주세요.');}
}
