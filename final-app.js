
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, setPersistence, browserSessionPersistence } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, doc, getDoc, getDocs, collection, setDoc, increment, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { firebaseConfig } from './firebase-config.js';
import { CLAUSES } from './final-shanghan-data.js';

const $ = id => document.getElementById(id);
const NAMES = ['고세현','석주형','홍대진','안선웅','박준영','김지원'];
const PROGRESS_ID = 'final-2026-shanghan-v1';
const STATS_PREFIX = 'final-2026-shanghan-';
const NUMBERS = CLAUSES.map(item => item.num);
const CLAUSE_MAP = new Map(CLAUSES.map(item => [item.num,item]));
let auth,db,uid='',state=null,currentBlanks=[],graded=false,currentRevealed=false;
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
function defaultState(){return {schema:1,updatedAt:0,order:[...NUMBERS],pos:0,version:1,mode:'typing',wrongOnly:false,history:{}};}
function safeState(data){
 const s=defaultState();
 if(!data||typeof data!=='object')return s;
 if(Array.isArray(data.order)&&data.order.length===NUMBERS.length&&NUMBERS.every(n=>data.order.includes(n)))s.order=[...data.order];
 s.pos=Number.isInteger(data.pos)?Math.max(0,Math.min(NUMBERS.length-1,data.pos)):0;
 s.version=[1,2,3,4].includes(Number(data.version))?Number(data.version):1;
 s.mode=data.mode==='writing'?'writing':'typing';
 s.wrongOnly=data.wrongOnly===true;
 s.history=data.history&&typeof data.history==='object'?data.history:{};
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
 const order=Array.isArray(state?.order)?state.order:NUMBERS;
 const filtered=state?.wrongOnly?order.filter(num=>state.history[num]?.lastCorrect===false):order;
 return filtered;
}
function currentClause(){
 const items=getList();
 return CLAUSE_MAP.get(items[Math.min(state.pos,items.length-1)])||null;
}
function seedHash(text){let h=2166136261;for(const ch of text){h^=ch.codePointAt(0);h=Math.imul(h,16777619);}return h>>>0;}
function makeBlanks(clause,version){
 const candidates=[];
 const hanzi=/[\u3400-\u9fff\uf900-\ufaff]+/g;
 for(const match of clause.original.matchAll(hanzi)){
  const token=match[0],offset=match.index;
  if(token.length<2)continue;
  if(token.length<=7)candidates.push({start:offset,end:offset+token.length,text:token});
  else{
   const size=Math.min(6,Math.max(3,Math.ceil(token.length/3)));
   for(let p=0;p<token.length;p+=size){
    const length=Math.min(size,token.length-p);
    if(length<2)continue;
    candidates.push({start:offset+p,end:offset+p+length,text:token.slice(p,p+length)});
   }
  }
 }
 const target=[0,3,5,7,9][version];
 const sorted=[...candidates].sort((a,b)=>seedHash(clause.num+':'+version+':'+a.start)-seedHash(clause.num+':'+version+':'+b.start));
 const picked=[];
 for(const c of sorted){if(picked.length>=target)break;if(!picked.some(x=>x.start<c.end&&c.start<x.end))picked.push(c);}
 return picked.sort((a,b)=>a.start-b.start);
}
function normalizeAnswer(value){
 return String(value||'').normalize('NFKC').replace(/[\s,.，。．、;；:：!?！？'"‘’“”\-·]/g,'').replace(/[爲为]/g,'為').replace(/不/g,'不').toLowerCase();
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
 $('subject-pending').hidden=name==='sanghan';
 $('pending-name').textContent=name==='sanghan'?'':document.querySelector('[data-subject="'+name+'"]')?.textContent.trim()||'과목';
 if(name==='sanghan')setView(currentView);else window.scrollTo({top:0,behavior:'instant'});
}
function syncControls(){
 $('version').value=String(state.version);
 $('mode-typing').setAttribute('aria-pressed',String(state.mode==='typing'));
 $('mode-writing').setAttribute('aria-pressed',String(state.mode==='writing'));
 $('wrong-only').checked=state.wrongOnly;
 const entries=NUMBERS.map(n=>state.history[n]).filter(Boolean);
 const mastered=entries.filter(x=>x.lastCorrect===true).length;
 const attempts=entries.reduce((a,x)=>a+(Number(x.attempts)||0),0);
 $('progress-text').textContent='완료 '+mastered+' / 26조';
 $('attempts-text').textContent='누적 '+attempts+'회';
 $('progress-bar').style.width=(mastered/26*100)+'%';
}
function resetQuestion(){graded=false;currentRevealed=false;currentBlanks=[];}
function renderQuiz(){
 if(!state)return;
 syncControls();
 const items=getList();
 const item=currentClause();
 $('quiz-content').hidden=!item;$('quiz-empty').hidden=!!item;
 if(!item){
  $('empty-description').textContent=state.wrongOnly?'현재 오답으로 남아 있는 조문이 없습니다. 오답만 보기를 해제해 주세요.':'등록된 조문이 없습니다.';
  return;
 }
 currentBlanks=makeBlanks(item,state.version);
 $('question-position').textContent=(items.indexOf(item.num)+1)+' / '+items.length;
 $('question-num').textContent=item.num+'조';
 $('question-meta').textContent='기말고사 통암기 · '+currentBlanks.length+'개 빈칸';
 $('clause-text').replaceChildren();
 const passage=$('clause-text'),original=item.original;
 let last=0;
 currentBlanks.forEach((blank,i)=>{
  passage.append(document.createTextNode(original.slice(last,blank.start)));
  const slot=textNode('span','cloze','('+(i+1)+') ______');slot.dataset.index=String(i);
  passage.append(slot);last=blank.end;
 });
 passage.append(document.createTextNode(original.slice(last)));
 $('answer-fields').replaceChildren();
 const writing=state.mode==='writing';
 currentBlanks.forEach((blank,i)=>{
  const field=document.createElement('label');field.className='answer-field';
  const caption=textNode('span','field-label','빈칸 '+(i+1));field.append(caption);
  const input=document.createElement('input');input.type='text';input.id='answer-'+i;input.autocomplete='off';input.spellcheck=false;input.placeholder='한자로 입력';input.dataset.index=String(i);
  input.addEventListener('keydown',event=>{if(event.key!=='Enter'||event.isComposing)return;event.preventDefault();const next=$('answer-'+(i+1));if(next)next.focus();else gradeTyped();});
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
 $('question-prior').disabled=items.length<2;$('question-next').disabled=items.length<2;
 if(writing)$('writing-tip').textContent='종이에 한자로 써 본 다음 정답 보기를 눌러 스스로 채점하세요.';
}
function showFeedback(item,correct,revealed,drafts){
 if(!item)return;
 const panel=$('answer-feedback');panel.replaceChildren();
 panel.append(textNode('h3',correct?'feedback-good':'feedback-bad',correct?'O · 정답':'X · '+(revealed?'정답 확인':'오답')));
 currentBlanks.forEach((blank,i)=>{
  const row=textNode('div','result-row','빈칸 '+(i+1)+'  '+blank.text);
  const user=String(drafts?.[i]||'').trim();
  if(state.mode==='typing'&&!revealed)row.append(textNode('small','result-your','입력: '+(user||'(미입력)')+(normalizeAnswer(user)===normalizeAnswer(blank.text)?'  ✓':'  ✕')));
  panel.append(row);
 });
 panel.hidden=false;
 $('translation').hidden=false;
 $('button-grade').hidden=true;$('button-reveal').hidden=true;
 $('button-correct').hidden=true;$('button-wrong').hidden=true;
 $('button-next').hidden=false;
 $('answer-fields').querySelectorAll('input').forEach(i=>i.disabled=true);
 graded=true;
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
 recordAttempt(item.num,correct,revealed);
 queueSave();
 showFeedback(item,correct,revealed,drafts);
 syncControls();
}
function gradeTyped(){
 if(!state||graded||state.mode!=='typing')return;
 const drafts=currentBlanks.map((_,i)=>$('answer-'+i)?.value||'');
 const correct=drafts.every((v,i)=>normalizeAnswer(v)===normalizeAnswer(currentBlanks[i].text));
 finishAttempt(correct,false,drafts);
}
function revealAnswer(){
 if(!state||graded)return;
 if(state.mode==='writing'){
  currentRevealed=true;
  const panel=$('answer-feedback');panel.replaceChildren();
  panel.append(textNode('h3','','정답 확인 · 스스로 채점'));
  currentBlanks.forEach((blank,i)=>panel.append(textNode('div','result-row','빈칸 '+(i+1)+'  '+blank.text)));
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
 const items=getList();if(!items.length)return;
 state.pos=(Math.min(state.pos,items.length-1)+delta+items.length)%items.length;
 resetQuestion();queueSave();renderQuiz();
 $('question-num').scrollIntoView({behavior:'smooth',block:'start'});
}
function shuffle(){
 for(let i=state.order.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[state.order[i],state.order[j]]=[state.order[j],state.order[i]];}
 state.pos=0;resetQuestion();queueSave();renderQuiz();
}
function goToClause(num){
 state.wrongOnly=false;
 state.pos=state.order.indexOf(num);
 if(state.pos<0)state.pos=0;
 resetQuestion();queueSave();selectSubject('sanghan');setView('quiz');
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
  metric('학습한 조문',attempted.length+' / 26'),
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
  if(!NAMES.includes(name)){message('승인된 이름만 가입할 수 있습니다.');return;}
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
 document.querySelectorAll('[data-subject]').forEach(button=>button.onclick=()=>selectSubject(button.dataset.subject));
 document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>setView(button.dataset.view));
 $('version').onchange=event=>{state.version=Number(event.target.value);resetQuestion();queueSave();renderQuiz();};
 $('mode-typing').onclick=()=>{state.mode='typing';resetQuestion();queueSave();renderQuiz();};
 $('mode-writing').onclick=()=>{state.mode='writing';resetQuestion();queueSave();renderQuiz();};
 $('wrong-only').onchange=event=>{state.wrongOnly=event.target.checked;state.pos=0;resetQuestion();queueSave();renderQuiz();};
 $('shuffle').onclick=shuffle;
 $('reset-order').onclick=()=>{state.order=[...NUMBERS];state.pos=0;resetQuestion();queueSave();renderQuiz();};
 $('question-prior').onclick=()=>go(-1);
 $('question-next').onclick=()=>go(1);
 $('button-next').onclick=()=>go(1);
 $('button-grade').onclick=gradeTyped;
 $('button-reveal').onclick=revealAnswer;
 $('button-correct').onclick=()=>gradeWritten(true);
 $('button-wrong').onclick=()=>gradeWritten(false);
 $('empty-show-all').onclick=()=>{state.wrongOnly=false;state.pos=0;queueSave();renderQuiz();};
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
