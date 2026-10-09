/* Loop — study app. Vanilla JS, Supabase for accounts + sync + shared courses. */
(function(){
'use strict';
const sb = window.supabase.createClient('https://zycvparzzdprrdmrcsdf.supabase.co','sb_publishable_ByUhbUzYcepWUwgmO0LbkQ_-Cl0hA8-',{auth:{persistSession:true,storageKey:'loop-auth'}});

/* ---------------- helpers ---------------- */
const $=s=>document.querySelector(s);
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const todayStr=()=>new Date().toLocaleDateString('en-CA');
const dayDiff=(a,b)=>Math.round((new Date(a+'T12:00')-new Date(b+'T12:00'))/864e5);
const addDays=(s,n)=>{const d=new Date(s+'T12:00');d.setDate(d.getDate()+n);return d.toLocaleDateString('en-CA')};
const fmtDate=(d,o={month:'short',day:'numeric'})=>new Date(d+'T12:00').toLocaleDateString('en-CA',o);
const uid=p=>p+Math.random().toString(36).slice(2,9);
const shuffle=a=>{a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.random()*(i+1)|0;[a[i],a[j]]=[a[j],a[i]]}return a};
const store={get(k,d){try{return JSON.parse(localStorage.getItem(k))??d}catch{return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch{}}};
const clone=o=>JSON.parse(JSON.stringify(o));
const COLORS=['lav','mint','peach','sky','lemon'];
const EMOJIS=['📘','🧪','🌿','🌍','👥','💼','🎲','🧠','⚖️','💻','🎨','📈','🩺','🏛️','🎵','✍️'];
const colVar={mint:'var(--mintd)',lav:'var(--lavd)',peach:'var(--peachd)',sky:'var(--skyd)',lemon:'var(--lemond)'};

/* ---------------- packs (ready-made course content) ---------------- */
const PACK_Q=(window.QUESTIONS||[]).map((q,i)=>({...q,id:'p'+i}));
const PACKS=[{id:'western-f26',uni:'Western University',term:'Fall 2026',courses:(window.COURSES||[]).map(c=>({...c,src:'western-f26',uni:'Western University'}))}];
const GEN_TOPICS=new Set(['h1','h2','h3','h4','h5','h6','h7','h8','h9']);
PACKS[0].courses.forEach(c=>c.topics.forEach(t=>{if(GEN_TOPICS.has(t.id))t.gen=true}));

/* ---------------- state ---------------- */
const BLANK={v:2,name:'',uni:'',onboarded:false,setup:false,courses:[],cq:[],q:{},topic:{},rev:{},log:{},xp:0,best:0,settings:{len:8,timer:true,sound:true,theme:'auto'},updated:0,owner:null};
let S=migrate(store.get('loop-state',null));
function migrate(o){
 if(!o) return clone(BLANK);
 const s=Object.assign(clone(BLANK),o);
 // v1 stored course ids as strings and used pack data directly
 if(!o.v||o.v<2){
  const ids=(o.courses&&o.courses.length?o.courses:(o.picked?PACKS[0].courses.map(c=>c.id):[]));
  s.courses=PACKS[0].courses.filter(c=>ids.includes(c.id)).map(clone);
  s.setup=!!(o.picked||s.courses.length); s.uni=s.uni||(s.courses.length?'Western University':''); s.cq=[]; s.v=2;
 }
 s.settings=Object.assign(clone(BLANK.settings),o.settings||{});
 Object.values(s.q||{}).forEach(r=>{if(r.box&&!r.reps){r.reps=r.box;r.ivl=[1,1,3,7,14][r.box]||1;r.ease=2.5}});s.revlog=s.revlog||[];
 s.events=s.events||[];s.clubs=s.clubs||[];s.apps=s.apps||[];s.cals=s.cals||[];s.chat=s.chat||[];s.profile=s.profile||{};
 return s;
}
let user=null, view={tab:'today',filter:'all',course:null,authMode:'up'}, syncT=null;
function save(){S.updated=Date.now();store.set('loop-state',S);if(user){clearTimeout(syncT);syncT=setTimeout(push,1200)}}
async function push(){if(!user)return;try{await sb.from('studybuddy_progress').upsert({user_id:user.id,display_name:S.name,state:S,updated_at:new Date().toISOString()})}catch(e){}}
async function pull(){
 try{
  const {data}=await sb.from('studybuddy_progress').select('state').eq('user_id',user.id).maybeSingle();
  if(data?.state&&(data.state.updated||0)>(S.updated||0)){S=migrate(data.state);store.set('loop-state',S)} else push();
 }catch(e){}
}

/* ---------------- index ---------------- */
let TOPIC={}, QBYT={};
function reindex(){
 TOPIC={};QBYT={};
 S.courses.forEach(c=>c.topics.forEach(t=>TOPIC[t.id]={...t,course:c}));
 PACK_Q.forEach(q=>{if(TOPIC[q.t])(QBYT[q.t]=QBYT[q.t]||[]).push(q)});
 S.cq.forEach(q=>{if(TOPIC[q.t])(QBYT[q.t]=QBYT[q.t]||[]).push(q)});
}
const isGen=tid=>!!TOPIC[tid]?.gen;
const hasContent=tid=>isGen(tid)||(QBYT[tid]||[]).length>0;
const courseQs=c=>c.topics.flatMap(t=>QBYT[t.id]||[]);

// custom questions → multiple choice at ask-time (distractors from the same course)
function toMC(q){
 if(q.o) return q;
 const course=TOPIC[q.t].course, pool=courseQs(course).filter(x=>!x.o&&x.id!==q.id&&(x.kind||'def')===(q.kind||'def')).map(x=>x.ans);
 const wrong=[...(q.wrong||[]).filter(Boolean),...shuffle(pool)].filter((w,i,a)=>w!==q.ans&&a.indexOf(w)===i).slice(0,3);
 const o=shuffle([q.ans,...wrong]);
 return {...q,o,a:o.indexOf(q.ans),e:q.e||''};
}

/* ---------------- learning model ---------------- */
function topicMastery(tid){
 if(S.known?.[tid]) return 1;
 const ts=S.topic[tid]||{n:0,ok:0,ew:0};
 if(isGen(tid)) return ts.n?Math.min(1,ts.ew*Math.min(1,ts.n/6)):0;
 const qs=QBYT[tid]||[]; if(!qs.length) return 0;
 const box=qs.reduce((a,q)=>a+Math.min(2,(S.q[q.id]?.box||0))/2,0)/qs.length; // "known" after 2 correct in a row
 const est=ts.n?ts.ew*Math.min(1,ts.n/Math.min(8,qs.length)):0;             // recent accuracy, trusted once enough answers
 return Math.min(1,0.5*box+0.5*est);
}
const seen=tid=>(S.topic[tid]?.n||0)>0;
function topicStatus(t){
 const m=topicMastery(t.id);
 if(!hasContent(t.id)) return {k:'soon',label:'No questions',m};
 if(t.date>todayStr()) return {k:'soon',label:'Upcoming',m};
 if(!seen(t.id)) return {k:'new',label:'Not started',m};
 if(m<0.6) return {k:'behind',label:'Behind',m};
 return {k:'ok',label:'On track',m};
}
function nextExam(c){return (c.exams||[]).map(e=>({...e,days:dayDiff(e.date,todayStr())})).filter(e=>e.days>=0).sort((a,b)=>a.days-b.days)[0]}
function courseStats(c){
 const ct=c.topics.filter(t=>hasContent(t.id)), due=ct.filter(t=>t.date<=todayStr());
 const know=due.length?due.reduce((a,t)=>a+topicMastery(t.id),0)/due.length:0;
 const overall=ct.length?ct.reduce((a,t)=>a+topicMastery(t.id),0)/ct.length:0;
 const behind=due.filter(t=>topicMastery(t.id)<0.6).length;
 return {due:due.length,total:ct.length,all:c.topics.length,know,overall,behind,next:nextExam(c),empty:!ct.length};
}
// forgetting curve: R = level · e^(−days/stability); good reviews raise stability
const revEvents=tid=>(S.rev&&S.rev[tid])||[];
function retentionAt(tid,date){
 const ev=revEvents(tid).filter(e=>e.d<=date);if(!ev.length)return 0;
 let stab=1.5,lv=0,last=ev[0].d;
 for(const e of ev){const gap=dayDiff(e.d,last),r=lv*Math.exp(-gap/stab);stab=e.lv>=0.7?stab*(gap>=1?2.2:1.3):Math.max(1.5,stab*0.8);lv=Math.max(e.lv,r);last=e.d}
 return lv*Math.exp(-dayDiff(date,last)/stab);
}
function courseMemory(c,date){const ts=c.topics.filter(t=>t.date<=date&&hasContent(t.id));if(!ts.length)return null;return ts.reduce((a,t)=>a+retentionAt(t.id,date),0)/ts.length}
function predictScore(c,exam){const ts=c.topics.filter(t=>t.date<=exam.date&&hasContent(t.id));if(!ts.length)return 0;return ts.reduce((a,t)=>a+retentionAt(t.id,exam.date),0)/ts.length}
/* Spaced scheduling with Anki's documented default constants (fixed, not adaptive):
   starting ease 2.5 · Hard ×1.2 · Easy bonus ×1.3 · 1-day minimum interval · Easy on a new card = 4 days.
   Ratings: 1 Again · 2 Hard · 3 Good · 4 Easy. Multiple-choice: correct = Good, wrong = Again. */
const SCHED={ease0:2.5,hard:1.2,easyBonus:1.3,minIvl:1,easyNew:4,minEase:1.3,newPerDay:20,revPerDay:200};
function schedule(r,rating){
 r.ease=r.ease||SCHED.ease0;const ivl=r.ivl||0,isNew=!r.reps;
 if(rating===1){r.ivl=SCHED.minIvl;r.ease=Math.max(SCHED.minEase,r.ease-0.2);r.lapses=(r.lapses||0)+1;r.box=0}
 else if(rating===2){r.ivl=isNew?SCHED.minIvl:Math.max(SCHED.minIvl,Math.round(ivl*SCHED.hard));r.ease=Math.max(SCHED.minEase,r.ease-0.15);r.box=Math.max(1,r.box||0)}
 else if(rating===3){r.ivl=isNew?SCHED.minIvl:Math.max(ivl+1,Math.round(ivl*r.ease));r.box=Math.min(4,(r.box||0)+1)}
 else{r.ivl=isNew?SCHED.easyNew:Math.max(ivl+1,Math.round(ivl*r.ease*SCHED.easyBonus));r.ease+=0.15;r.box=Math.min(4,(r.box||0)+2)}
 r.reps=(r.reps||0)+1;return r;
}
function previewIvl(id,rating){const r=schedule(clone(S.q[id]||{box:0}),rating);return r.ivl>=30?Math.round(r.ivl/30)+'mo':r.ivl+'d'}
function dayCounts(){const t=todayStr();if(!S.dayc||S.dayc.d!==t)S.dayc={d:t,new:0,rev:0,sibs:[]};return S.dayc}
function logReview(q,rating,ms,extra){
 S.revlog=S.revlog||[];S.revlog.push({ts:Date.now(),id:q.gen?null:q.id,t:q.t,r:rating,ok:rating>1,ms:Math.round(ms),mode:Q?.mode||'quiz',...extra});
 if(S.revlog.length>4000)S.revlog=S.revlog.slice(-4000);
}
function record(q,ok,sec,rating,extra){
 const t=todayStr();rating=rating||(ok?3:1);
 logReview(q,rating,sec*1000,extra);
 if(!q.gen){const dc=dayCounts(),r=S.q[q.id]||{box:0,due:t};if(!r.reps)dc.new++;else dc.rev++;if(q.sib&&!dc.sibs.includes(q.sib))dc.sibs.push(q.sib);
  schedule(r,rating);r.due=addDays(t,r.ivl);r.last=t;S.q[q.id]=r}
 const ts=S.topic[q.t]||{n:0,ok:0,ew:0};ts.n++;ts.ok+=ok?1:0;ts.ew=ts.n===1?(ok?1:0):ts.ew*0.7+(ok?0.3:0);S.topic[q.t]=ts;
 const ev=S.rev[q.t]=S.rev[q.t]||[];let e=ev[ev.length-1];if(!e||e.d!==t){e={d:t,n:0,ok:0,lv:0};ev.push(e)}
 e.n++;e.ok+=ok?1:0;e.lv=Math.round(Math.max(0.15,Math.min(Math.max(ts.ew,0.15),(e.ok+1)/(e.n+2)*1.15))*100)/100;
 if(!S.log[t]){const prev=Object.keys(S.log).filter(d=>d<t&&S.log[d].n>0).sort().pop();if(prev&&dayDiff(t,prev)>=2){S.xp+=15;S.comebacks=(S.comebacks||0)+1;setTimeout(()=>toast('Welcome back! +15 XP for showing up 🌅'),600)}}
 const L=S.log[t]||{n:0,ok:0,sec:0};L.n++;L.ok+=ok?1:0;L.sec+=Math.min(sec,120);S.log[t]=L;
 const before=level().l;S.xp+=ok?10:3;save();if(level().l>before)setTimeout(()=>{toast(`Level up! You're level ${level().l} 🎉`);confetti()},400);
}
const level=()=>{const l=Math.floor(Math.sqrt(S.xp/60))+1,lo=60*(l-1)**2,hi=60*l**2;return {l,p:(S.xp-lo)/(hi-lo),to:hi-S.xp}};
// streak with one grace day per 7 days: a single missed day between practice days doesn't break it
function streak(){let s=0,d=todayStr(),i=0,lastGrace=-99;const ok=x=>S.log[x]?.n>=5;if(!ok(d))d=addDays(d,-1);
 while(i<4000){if(ok(d))s++;else if(s>0&&i-lastGrace>=7&&ok(addDays(d,-1)))lastGrace=i;else break;d=addDays(d,-1);i++}
 return s}
function pickQ(tid,avoid){
 if(isGen(tid)) return window.genMath(tid);
 const t=todayStr(),dc=dayCounts();
 const pool=(QBYT[tid]||[]).filter(q=>(!avoid||(!avoid.has(q.id)&&!(q.sib&&avoid.has('sib:'+q.sib))))&&!(q.sib&&dc.sibs.includes(q.sib)));if(!pool.length)return null;
 const reviews=pool.filter(q=>S.q[q.id]?.reps&&S.q[q.id].due<=t).sort((a,b)=>(!!S.q[b.id].cw-!!S.q[a.id].cw)||S.q[a.id].due.localeCompare(S.q[b.id].due)); // confidently-wrong, then most overdue
 const fresh=pool.filter(q=>!S.q[q.id]?.reps);
 let pick=null;
 if(reviews.length&&dc.rev<SCHED.revPerDay)pick=reviews[0];
 else if(fresh.length&&dc.new<SCHED.newPerDay)pick=fresh[Math.random()*fresh.length|0];
 else if(!avoid||avoid.size<1)pick=null;
 if(!pick){const ahead=pool.filter(q=>S.q[q.id]?.reps).sort((a,b)=>S.q[a.id].due.localeCompare(S.q[b.id].due));pick=ahead[0]||null;if(pick)pick={...pick,ahead:true}} // study-ahead only when nothing is due
 return pick?toMC(pick):null;
}
function buildSet({courseId,topicIds,n=S.settings.len,until}={}){
 const today=todayStr(),w=[];
 S.courses.filter(c=>!courseId||c.id===courseId).forEach(c=>{
  const st=courseStats(c),boost=st.next?Math.max(1,4-st.next.days/5):1;
  c.topics.forEach(t=>{
   if(!hasContent(t.id))return; if(topicIds&&!topicIds.includes(t.id))return;
   if(until&&t.date>until)return; if(!courseId&&!topicIds&&t.date>today)return;
   const m=topicMastery(t.id),up=t.date>today?0.3:1,fade=1-retentionAt(t.id,today);
   const cwN=(QBYT[t.id]||[]).filter(q=>S.q[q.id]?.cw).length;
   w.push({tid:t.id,w:((1.1-m)*0.6+fade*0.6)*boost*up+(seen(t.id)?0:.4)+Math.min(1.2,cwN*0.4)});
  });
 });
 const out=[],used=new Set();let guard=0;
 while(out.length<n&&w.length&&guard++<300){
  const tot=w.reduce((a,x)=>a+x.w,0);let r=Math.random()*tot,pick=w[0];for(const x of w){r-=x.w;if(r<=0){pick=x;break}}
  const q=pickQ(pick.tid,used);if(!q){pick.w*=0.2;continue}
  const key=q.gen?q.q:q.id;if(used.has(key)){pick.w*=0.5;continue}used.add(key);if(q.sib)used.add('sib:'+q.sib);out.push(q);pick.w*=0.55;
 }
 return out.filter(q=>q.o&&q.o.length>=2);
}
function buildDiag(c){return c.topics.filter(t=>t.date<=todayStr()&&hasContent(t.id)).flatMap(t=>{const u=new Set(),a=pickQ(t.id,u);if(a&&!a.gen)u.add(a.id);const b=isGen(t.id)?null:pickQ(t.id,u);return [a,b&&b.id!==a?.id?b:null].filter(Boolean)}).filter(q=>q.o&&q.o.length>=2).slice(0,14)}
function mistakes(){
 return Object.entries(S.q).filter(([id,r])=>(r.box===0&&r.last)||r.cw).map(([id])=>[...PACK_Q,...S.cq].find(q=>q.id===id)).filter(q=>q&&TOPIC[q.t]).map(toMC).filter(q=>q.o.length>=2);
}
function dailyGoalFor(c,e){
 // questions per day, consistent with the Autopilot minutes (~1.1 questions a minute)
 const p=planFor(c,e);if(!p)return 0;if(p.r.mid>=p.target)return 0;
 return Math.max(3,Math.round(p.mins*1.1));
}
function badges(){
 const total=Object.values(S.log).reduce((a,l)=>a+l.n,0),best=Math.max(S.best,streak()),days=Object.values(S.log).filter(l=>l.n>=5).length;
 const mastered=Object.keys(TOPIC).filter(t=>hasContent(t)&&topicMastery(t)>=0.6).length;
 return [
  ['🌱','First steps','Answer your first question',total>=1],
  ['🔥','On fire','3-day streak',best>=3],
  ['⚡','Week warrior','7-day streak',best>=7],
  ['💯','Century','Answer 100 questions',total>=100],
  ['🧠','Big brain','Answer 500 questions',total>=500],
  ['🎯','Topic tamer','Master 5 topics',mastered>=5],
  ['🏔️','Summit','Master 20 topics',mastered>=20],
  ['📅','Regular','Practise on 10 different days',days>=10],
  ['✍️','Creator','Add 10 of your own questions',S.cq.length>=10],
  ['🤝','Team player','Share a course',S.courses.some(c=>c.shareCode)],
  ['🪞','Honest','Say “Guessing” 10 times when you were',(S.revlog||[]).filter(r=>r.conf===0).length>=10],
  ['🛠️','Fixer','Fix 5 confidently-wrong answers',(S.fixed||0)>=5],
  ['🌅','Comeback','Come back after a break',(S.comebacks||0)>=1],
  ['🔬','Mistake detective','Tag 10 mistakes in the Mistake Lab',(S.revlog||[]).filter(r=>r.mk).length>=10],
  ['🔎','Researcher','Save a research brief',Object.values(S.notebook||{}).some(n=>n.length)],
  ['🎓','Self-tester','Answer 20 questions without hints',(S.revlog||[]).filter(r=>r.ok!=null&&!r.hl&&!r.hint).length>=20]
 ];
}
function todayPlan(){
 const t=todayStr();
 return S.courses.flatMap(c=>c.topics.filter(x=>x.date<=t&&hasContent(x.id)).map(x=>({t:x,c,mem:retentionAt(x.id,t),seen:seen(x.id)})))
  .filter(x=>x.mem<0.6).sort((a,b)=>{const ea=nextExam(a.c)?.days??99,eb=nextExam(b.c)?.days??99;return (a.seen-b.seen)||(ea-eb)||(a.mem-b.mem)}).slice(0,5);
}

/* ---------------- icons & art ---------------- */
const I=(p,s=22,f='none')=>`<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="${f}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const ICON={
 home:I('<path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>'),
 cal:I('<rect x="3" y="5" width="18" height="16" rx="4"/><path d="M3 10h18M8 3v4M16 3v4"/>'),
 chart:I('<rect x="3" y="3" width="18" height="18" rx="5"/><path d="M8 16v-4M12 16V8M16 16v-6"/>'),
 user:I('<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>'),
 bolt:'<svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
 arrow:I('<path d="M5 12h14M13 6l6 6-6 6"/>',22),back:I('<path d="M19 12H5M11 6l-6 6 6 6"/>'),x:I('<path d="M6 6l12 12M18 6 6 18"/>'),
 plus:I('<path d="M12 5v14M5 12h14"/>'),edit:I('<path d="M4 20h4L19 9l-4-4L4 16z"/>',20),share:I('<path d="M12 3v13M7 8l5-5 5 5M5 14v5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-5"/>',20),
 cards:I('<rect x="3" y="6" width="14" height="14" rx="3"/><path d="M7 3h11a3 3 0 0 1 3 3v11"/>',20),star:I('<path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',16),
 book:I('<path d="M4 4h9a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H4zM20 4h-3"/>',20)
};
const MASCOT=(size=180,mood='happy',anim=true)=>`<svg width="${size}" height="${size}" viewBox="0 0 200 200" class="${anim?'float':''}" aria-hidden="true">
 <ellipse cx="100" cy="186" rx="58" ry="8" fill="#0000000f"/>
 <path d="M40 120c0-45 25-82 60-82s60 37 60 82c0 38-25 58-60 58s-60-20-60-58z" fill="#8B6CF0"/>
 <path d="M58 70c8-20 24-32 42-32 6 0 12 1 17 4-25 2-45 18-52 44z" fill="#fff" opacity=".18"/>
 <circle cx="100" cy="92" r="30" fill="#fff"/><circle cx="${mood==='think'?94:104}" cy="${mood==='think'?86:94}" r="15" fill="#1F1D2B"/><circle cx="${mood==='think'?99:109}" cy="${mood==='think'?81:89}" r="5" fill="#fff"/>
 ${mood==='sad'?'<path d="M84 140q16-10 32 0" stroke="#1F1D2B" stroke-width="5" fill="none" stroke-linecap="round"/>':'<path d="M80 134q20 18 40 0" stroke="#1F1D2B" stroke-width="5" fill="#E8657A" stroke-linecap="round"/>'}
 <path d="M66 52 88 30l8 16 14-18 6 20 20-14-6 26" fill="#FBD34D" stroke="#1F1D2B" stroke-width="3" stroke-linejoin="round"/>
 <g transform="rotate(-12 139 148)"><rect x="112" y="128" width="54" height="40" rx="6" fill="#3FB27F"/><rect x="117" y="133" width="44" height="30" rx="4" fill="#fff"/><path d="M126 148h26M126 155h18" stroke="#3FB27F" stroke-width="3" stroke-linecap="round"/></g>
 <circle cx="44" cy="134" r="12" fill="#8B6CF0"/><circle cx="160" cy="146" r="12" fill="#8B6CF0"/></svg>`;
const SPARK=`<svg width="26" height="26" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z"/></svg>`;
const ring=(p,c)=>`<div class="ring" style="--p:${Math.round(p*100)};--c:${c||'var(--lavd)'}"><span>${Math.round(p*100)}%</span></div>`;
function goBtn(p,size=58){const C=2*Math.PI*31;return `<div class="go" style="width:${size}px;height:${size}px"><svg class="gring" width="${size+8}" height="${size+8}" viewBox="0 0 66 66"><circle cx="33" cy="33" r="31" fill="none" stroke="#7C5CD6" stroke-width="3" stroke-dasharray="${C*p} ${C}" stroke-linecap="round" transform="rotate(-90 33 33)"/></svg>${ICON.arrow}</div>`}
function toast(m){document.querySelectorAll('.toast').forEach(x=>x.remove());const el=document.createElement('div');el.className='toast';el.setAttribute('role','status');el.textContent=m;document.body.appendChild(el);setTimeout(()=>el.remove(),2400)}
const daysLabel=d=>d===0?'today':d===1?'tomorrow':`in ${d} days`;

/* ---------------- memory chart ---------------- */
function memoryChart(c,{back=21,fwd=14,h=190}={}){
 const today=todayStr(),days=[...Array(back+fwd+1)].map((_,i)=>addDays(today,i-back)),cs=c?[c]:S.courses;
 const pt=d=>{const v=cs.map(x=>courseMemory(x,d)).filter(v=>v!==null);return v.length?v.reduce((a,b)=>a+b,0)/v.length:0};
 const vals=days.map(pt),W=640,H=h,padL=36,padB=26,padT=16,iw=W-padL-10,ih=H-padB-padT;
 const X=i=>padL+i/(days.length-1)*iw,Y=v=>padT+(1-v)*ih;
 const tids=new Set(cs.flatMap(x=>x.topics.map(t=>t.id)));
 const revDays=new Set(Object.entries(S.rev||{}).filter(([t])=>tids.has(t)).flatMap(([,ev])=>ev.map(e=>e.d)));
 const exams=cs.flatMap(x=>x.exams||[]).filter(e=>days.includes(e.date)),ti=back;
 const path=(a,b)=>vals.slice(a,b+1).map((v,k)=>`${k?'L':'M'}${X(a+k).toFixed(1)},${Y(v).toFixed(1)}`).join('');
 let drop=null;for(let i=ti;i>=3;i--){if(vals[i-3]-vals[i]>=0.04&&![0,1,2].some(k=>revDays.has(days[i-k]))){drop=i;break}}
 const gid='g'+Math.random().toString(36).slice(2,7), empty=!vals.some(v=>v>0);
 return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Memory over time, currently ${Math.round(vals[ti]*100)} percent" style="display:block;overflow:visible">
  <defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#7C5CD6" stop-opacity=".32"/><stop offset="1" stop-color="#7C5CD6" stop-opacity="0"/></linearGradient></defs>
  ${[0,.25,.5,.75,1].map(v=>`<line x1="${padL}" x2="${W-10}" y1="${Y(v)}" y2="${Y(v)}" style="stroke:var(--grid)"/><text x="${padL-6}" y="${Y(v)+4}" text-anchor="end" font-size="10" fill="#7C7891">${v*100}%</text>`).join('')}
  <line x1="${padL}" x2="${W-10}" y1="${Y(.6)}" y2="${Y(.6)}" stroke="#3FB27F" stroke-dasharray="2 4" opacity=".6"/><text x="${W-12}" y="${Y(.6)-4}" text-anchor="end" font-size="9" font-weight="600" fill="#3E9B83">safe zone 60%</text>
  <rect x="${X(ti)}" y="${padT}" width="${W-10-X(ti)}" height="${ih}" style="fill:var(--bg)" opacity=".75" rx="6"/>
  <text x="${(X(ti)+W-10)/2}" y="${padT+12}" text-anchor="middle" font-size="10" fill="#7C7891">forecast if you stop revising</text>
  ${(()=>{let lastX=-99;return [...new Set(exams.map(e=>e.date))].sort().map(dt=>{const i=days.indexOf(dt),x=X(i),n=exams.filter(e=>e.date===dt).length,lab=x-lastX>44;if(lab)lastX=x;return `<line x1="${x}" x2="${x}" y1="${padT}" y2="${padT+ih}" stroke="#E8657A" stroke-dasharray="3 3"><title>${esc(exams.filter(e=>e.date===dt).map(e=>e.name).join(', '))} · ${fmtDate(dt)}</title></line>${lab?`<text x="${x}" y="${padT+ih+22}" text-anchor="middle" font-size="10" font-weight="700" fill="#E8657A">${n>1?n+' EXAMS':'EXAM'}</text>`:''}`}).join('')})()}
  <path d="${path(0,ti)}L${X(ti)},${Y(0)}L${X(0)},${Y(0)}Z" fill="url(#${gid})"/>
  <path d="${path(0,ti)}" fill="none" stroke="#7C5CD6" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
  <path d="${path(ti,days.length-1)}" fill="none" stroke="#7C5CD6" stroke-width="2.5" stroke-dasharray="5 5" stroke-linecap="round"/>
  ${days.map((d,i)=>revDays.has(d)&&i<=ti?`<circle cx="${X(i)}" cy="${Y(vals[i])}" r="5" fill="#3FB27F" style="stroke:var(--card)" stroke-width="2"><title>Revised ${fmtDate(d)}</title></circle>`:'').join('')}
  ${drop!==null?`<circle cx="${X(drop)}" cy="${Y(vals[drop])}" r="5" fill="#E8657A" style="stroke:var(--card)" stroke-width="2"/><text x="${X(drop)}" y="${Y(vals[drop])+18}" text-anchor="middle" font-size="10" font-weight="700" fill="#E8657A">fading</text>`:''}
  <circle cx="${X(ti)}" cy="${Y(vals[ti])}" r="7" style="fill:var(--ink);stroke:var(--card)" stroke-width="3"/>
  <text x="${X(ti)}" y="${Math.max(12,Y(vals[ti])-14)}" text-anchor="middle" font-size="12" font-weight="700" style="fill:var(--ink)">${Math.round(vals[ti]*100)}%</text>
  ${[0,Math.round(back/2),ti,days.length-1].map(i=>`<text x="${X(i)}" y="${padT+ih+16}" text-anchor="middle" font-size="10" fill="#7C7891">${i===ti?'Today':fmtDate(days[i])}</text>`).join('')}
  ${empty?`<text x="${padL+iw/2}" y="${padT+ih/2+20}" text-anchor="middle" font-size="13" font-weight="600" fill="#7C7891">Answer a few questions and your memory curve appears here</text>`:''}
 </svg>
 <div class="row" style="gap:14px;flex-wrap:wrap;font-size:12px;font-weight:500;margin-top:8px"><span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:50%;background:#3FB27F"></i>Revised</span><span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:50%;background:#E8657A"></i>Fading</span><span class="row" style="gap:5px"><i style="width:16px;border-top:2px dashed #7C5CD6"></i>Forecast</span></div>`;
}

/* ---------------- render shell ---------------- */
const root=$('#root');
function applyTheme(){const t=S.settings.theme||'auto';if(t==='auto')delete document.documentElement.dataset.theme;else document.documentElement.dataset.theme=t}
function render(){
 reindex();applyTheme();
 if(!S.onboarded) return renderHero();
 if(!S.name) return renderName();
 if(!S.setup&&!view.edit) return renderSetup();
 osInit();
 if(window._snapD!==todayStr()){window._snapD=todayStr();try{snapshotPredictions();save()}catch(err){}}
 const tabs=[['today','Today',ICON.home],['schedule','Schedule',ICON.cal],['study','Study',ICON.book],['life','Life',I('<path d="M12 2l2.4 5 5.6.8-4 3.9.9 5.5L12 14.6 7.1 17.2l.9-5.5-4-3.9 5.6-.8z"/>')],['stats','Progress',ICON.chart],['me','Profile',ICON.user]];
 let body;
 if(view.edit) body=renderEditor(); else if(view.addq) body=renderAddQ(); else if(view.course) body=renderCourse();
 else body=({today:renderToday,schedule:renderSchedule,study:renderHome,home:renderHome,life:renderLife,plan:renderSchedule,stats:renderStats,me:renderMe}[view.tab]||renderToday)();
 const sub=view.edit||view.addq||view.course;
 root.innerHTML=`<div class="app">
  <aside class="side"><div class="brand">${MASCOT(36,'happy',false)} Loop</div>
   <button class="searchbtn" data-act="palette"><span class="row" style="gap:8px">${I('<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',18)} Search</span><kbd>⌘K</kbd></button>
   ${tabs.map(([k,l,i])=>`<button data-tab="${k}" class="${view.tab===k&&!sub?'on':''}">${i}${l}</button>`).join('')}
   <div style="margin-top:auto;display:grid;gap:8px"><button class="askbtn" data-act="ask">${MASCOT(34,'happy',false)}<span><b>Ask Loopy</b><small>AI sidekick</small></span></button><button class="btn full" data-act="daily">${ICON.bolt} Daily practice</button></div></aside>
  <main class="main" id="main">${signBar()}${body}</main></div>
  <nav class="nav" aria-label="Main">
   ${tabs.slice(0,2).map(([k,l,i])=>`<button data-tab="${k}" class="${view.tab===k&&!sub?'on':''}">${i}${l}</button>`).join('')}
   <button class="mid" data-act="ask" aria-label="Ask Loopy">${MASCOT(44,'happy',false)}</button>
   ${tabs.slice(2,4).map(([k,l,i])=>`<button data-tab="${k}" class="${view.tab===k&&!sub?'on':''}">${i}${l}</button>`).join('')}
  </nav>`;
 requestAnimationFrame(()=>{document.querySelectorAll('[data-w]').forEach(e=>e.style.width=e.dataset.w);document.querySelectorAll('[data-h]').forEach(e=>e.style.height=e.dataset.h)});
}

/* ---------------- onboarding ---------------- */
function renderHero(){
 root.innerHTML=`<div class="hero">
  <div class="art"><div style="position:absolute;top:calc(40px + var(--safe-t));left:30px">${SPARK}</div><div style="position:absolute;top:calc(90px + var(--safe-t));right:40px;transform:scale(1.6)">${SPARK}</div><div style="position:absolute;bottom:30px;left:60px;transform:scale(.7)">${SPARK}</div>${MASCOT(230)}</div>
  <div class="sheet">
   <div class="row brandrow" style="gap:8px;justify-content:center;margin-bottom:10px;font-weight:800;font-size:18px;color:var(--lavd)">${MASCOT(28,'happy',false)} Loop</div>
   <h1>Learning is<br>more <span style="color:var(--lavd)">fun</span> in loops</h1>
   <p class="muted" style="margin:0 0 24px;line-height:1.55">Tiny daily quizzes for your university courses. See what you know, what you're forgetting, and what score you're on track for.</p>
   <div class="row between"><button class="btn" data-act="start">Get started</button><button class="circ" data-act="start" aria-label="Get started">${ICON.arrow}</button></div>
   <p class="muted" style="font-size:14px;margin:18px 0 0">Already have an account? <button class="link" data-act="signin">Sign in</button></p>
  </div></div>`;
}
function renderAuth(){
 const up=view.authMode==='up';
 root.innerHTML=`<div class="hero"><div class="art">${MASCOT(170)}</div><div class="sheet" style="text-align:left">
  <h1 style="font-size:30px;text-align:left">${up?'Create your account':'Welcome back'}</h1>
  <p class="muted" style="margin:0 0 18px;font-size:14px">Your progress syncs across your phone and laptop.</p>
  <form id="authf" novalidate>
   ${up?'<label class="lbl" for="an">First name</label><input class="field" id="an" autocomplete="given-name" required>':''}
   <label class="lbl" for="ae">Email</label><input class="field" id="ae" type="email" autocomplete="email" required>
   <label class="lbl" for="ap">Password</label><input class="field" id="ap" type="password" placeholder="6+ characters" autocomplete="${up?'new-password':'current-password'}" minlength="6" required>
   <div class="err" id="aerr" role="alert"></div>
   <button class="btn full" type="submit">${up?'Sign up':'Sign in'}</button>
  </form>
  <p class="muted" style="font-size:14px;text-align:center;margin:16px 0 4px">${up?'Have an account?':'New here?'} <button class="link" data-act="authswap">${up?'Sign in':'Create one'}</button></p>
  <p style="text-align:center;margin:0"><button class="muted" style="font-size:13px;text-decoration:underline" data-act="guest">Try it without an account</button></p>
 </div></div>`;
 $('#authf').onsubmit=async e=>{
  e.preventDefault();const em=$('#ae').value.trim(),pw=$('#ap').value,err=$('#aerr'),btn=e.target.querySelector('button[type=submit]');
  err.style.color='';err.textContent='';
  if(!/^\S+@\S+\.\S+$/.test(em))return err.textContent='Enter a valid email.';
  if(pw.length<6)return err.textContent='Password needs at least 6 characters.';
  btn.disabled=true;btn.textContent='One sec…';
  try{
   if(up){const nm=$('#an').value.trim();if(!nm){btn.disabled=false;btn.textContent='Sign up';return err.textContent='Add your first name.'}
    const {data,error}=await sb.auth.signUp({email:em,password:pw,options:{data:{name:nm},emailRedirectTo:location.origin}});if(error)throw error;
    S.name=S.name||nm;S.onboarded=true;save();
    if(!data.session){err.style.color='var(--good)';err.textContent='Almost there! Check your email to confirm, then sign in here.';view.authMode='in';btn.disabled=false;btn.textContent='Sign up';return}}
   else{const {error}=await sb.auth.signInWithPassword({email:em,password:pw});if(error)throw error}
  }catch(x){err.textContent=/confirm/i.test(x.message)?'Please confirm your email first (check your inbox).':x.message||'Something went wrong';btn.disabled=false;btn.textContent=up?'Sign up':'Sign in'}
 };
}
function renderName(){
 root.innerHTML=`<div class="hero" style="background:var(--mint)"><div class="art">${MASCOT(190,'think')}</div><div class="sheet">
  <h1 style="font-size:30px">What should I call you?</h1>
  <input class="field" id="nm" placeholder="Your first name" aria-label="Your first name" autocomplete="given-name" value="${esc(S.name)}">
  <button class="btn full" data-act="setname">Continue</button></div></div>`;
 setTimeout(()=>$('#nm')?.focus(),50);
}
function renderSetup(){
 const isW=/western|uwo/i.test(S.uni), pack=PACKS[0], have=new Set(S.courses.map(c=>c.id));
 root.innerHTML=`<div class="hero" style="background:var(--sky)"><div class="art">${MASCOT(170,'think')}</div><div class="sheet" style="text-align:left;overflow:auto;max-height:100dvh">
  <h1 style="font-size:28px;text-align:left">Set up your courses</h1>
  <label class="lbl" for="uni">Your university or college</label>
  <input class="field" id="uni" data-w="${isW?1:0}" list="unis" placeholder="e.g. University of Toronto" value="${esc(S.uni)}">
  <datalist id="unis">${['Western University','University of Toronto','McMaster University','Queen\'s University','University of Waterloo','York University','Toronto Metropolitan University','University of Ottawa','McGill University','UBC','University of Alberta','Wilfrid Laurier University'].map(u=>`<option value="${esc(u)}">`).join('')}</datalist>
  ${isW?`<div class="lbl">Ready-made Western courses · ${pack.term}</div><div class="stack" style="gap:8px">${pack.courses.map(c=>`<button class="topic" data-pack="${c.id}" style="text-align:left;border:2px solid ${have.has(c.id)?'var(--ink)':'transparent'};background:var(--${c.color})"><span style="font-size:22px">${c.emoji}</span><div style="flex:1"><div class="nm">${esc(c.code)}</div><div style="font-size:13px;opacity:.7">${esc(c.name)}</div></div><span style="font-size:20px" aria-hidden="true">${have.has(c.id)?'✓':'+'}</span></button>`).join('')}</div>`:''}
  <div class="lbl">${isW?'Something else?':'Add your courses'}</div>
  <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn light" style="flex:1;min-width:150px;background:var(--bg)" data-act="newcourse">${ICON.plus} Create a course</button><button class="btn light" style="flex:1;min-width:150px;background:var(--bg)" data-act="join">Join with a code</button></div>
  ${S.courses.filter(c=>!c.src||c.src!=='western-f26').length?`<div class="hint">Added: ${S.courses.filter(c=>c.src!=='western-f26').map(c=>esc(c.code||c.name)).join(', ')}</div>`:''}
  <button class="btn full" style="margin-top:18px" data-act="setupdone">${S.courses.length?`Continue with ${S.courses.length} course${S.courses.length>1?'s':''}`:'Continue'}</button>
 </div></div>`;
 const u=$('#uni');u.oninput=()=>{S.uni=u.value;store.set('loop-state',S);clearTimeout(u._t);u._t=setTimeout(()=>{if(S.setup||!document.body.contains(u))return;const wasW=u.dataset.w==='1',isW2=/western|uwo/i.test(u.value);if(wasW===isW2)return;const pos=u.selectionStart;renderSetup();const n=$('#uni');n.focus();n.setSelectionRange(pos,pos)},500)};
}

/* ---------------- home ---------------- */
function renderHome(){
 const st=streak(),today=S.log[todayStr()]||{n:0,ok:0},goal=S.settings.len;
 if(!S.courses.length) return `<h1>Hey ${esc(S.name)} 👋</h1><div class="card empty">${MASCOT(140)}<h2 style="margin-top:6px">Add your first course</h2><p class="muted">Create a course, paste your notes, and Loop turns them into quizzes.</p><div class="row" style="justify-content:center;gap:8px;flex-wrap:wrap"><button class="btn" data-act="newcourse">${ICON.plus} Create a course</button><button class="btn light" data-act="join">Join with a code</button></div></div>`;
 const list=sortCourses(S.courses.filter(c=>view.filter==='all'||c.id===view.filter));
 const allBehind=S.courses.reduce((a,c)=>a+courseStats(c).behind,0);
 const ups=S.courses.flatMap(c=>(c.exams||[]).map(e=>({...e,c,days:dayDiff(e.date,todayStr())}))).filter(e=>e.days>=0).sort((a,b)=>a.days-b.days);
 const soon=ups[0], plan=todayPlan();
 const days=[...Array(7)].map((_,i)=>addDays(todayStr(),i-6)),vals=days.map(d=>S.log[d]?.n||0),mx=Math.max(10,...vals);
 const rail=`<aside class="rail">
  <div class="card"><div class="row between"><b style="font-weight:600">This week</b><span class="muted" style="font-size:13px">${vals.reduce((a,b)=>a+b,0)} answered</span></div>
   <div class="chart" style="height:120px">${vals.map((v,i)=>`<div class="col"><div class="b" data-h="${Math.max(10,v/mx*100)}%" style="height:0;background:${i===6?'var(--lavd)':'var(--lav)'}"></div><small>${fmtDate(days[i],{weekday:'narrow'})}</small></div>`).join('')}</div></div>
  <div class="card"><b style="font-weight:600">Exams coming up</b><div class="stack" style="margin-top:12px;gap:8px">${ups.length?ups.slice(0,6).map(e=>`<button class="topic" data-cram="${e.c.id}" style="background:var(--bg);padding:10px 12px;text-align:left;width:100%"><span style="font-size:20px">${e.c.emoji}</span><div style="flex:1;min-width:0"><div class="nm" style="font-size:14px">${esc(e.c.code||e.c.name)}</div><div class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(e.name)}</div></div><span class="tag ${e.days<=7?'behind':'new'}">${e.days===0?'today':e.days+'d'}</span></button>`).join(''):'<p class="muted" style="font-size:14px;margin:0">No exams added yet. Add dates in each course.</p>'}</div></div>
  ${(()=>{const m=mistakes().length;return m?`<button class="ccard c-peach" data-act="mistakes" style="text-align:left;width:100%"><div class="row between"><div><div style="font-weight:600">Fix my mistakes</div><div style="font-size:13px;opacity:.75">${m} question${m>1?'s':''} you missed recently</div></div>${goBtn(0,44)}</div></button>`:''})()}
  <div class="ccard c-sky" style="cursor:default"><div class="row between"><div><div style="font-weight:600">Focus timer</div><div style="font-size:13px;opacity:.75">25 min focus, then a 5 min break</div></div><button class="btn" style="padding:10px 16px;font-size:14px" data-act="focus25">${F?'Restart':'Start'}</button></div></div>
  <div class="ccard c-mint row" style="cursor:default;gap:12px">${MASCOT(64,'happy',false)}<div style="font-size:14px;line-height:1.45"><b style="font-weight:600">Tip:</b> press <b>⌘K</b> to jump anywhere. In quizzes, <b>1–4</b> answers and <b>Enter</b> continues.</div></div>
 </aside>`;
 return `<div class="dash"><div>
 <div class="row between">
  <div class="row"><div class="avatar" aria-hidden="true">${esc((S.name[0]||'?').toUpperCase())}</div>
   <div><div style="font-weight:600;font-size:18px">Hey ${esc(S.name)}! 👋</div>
   <div style="font-size:13px" class="muted">${st?`🔥 ${st}-day streak · keep it going`:'Answer 5 today to start a streak'}</div></div></div>
  <div class="row" style="gap:10px"><div class="lvl" title="${level().to} XP to the next level"><b>Lv ${level().l}</b><div class="bar" style="width:70px;height:6px;background:var(--bg)"><i style="width:${Math.round(level().p*100)}%;background:var(--lavd)"></i></div></div>
  <button class="iconbtn" data-act="newcourse" aria-label="Add a course">${ICON.plus}</button><button class="iconbtn" data-tab="stats" aria-label="Progress">${ICON.chart}</button></div>
 </div>
 <h1 style="margin-top:22px">Study</h1>
 <div class="ccard c-lav" data-act="daily" role="button" tabindex="0" style="margin-bottom:14px">
  <svg class="sparkle" width="34" height="34" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z"/></svg>
  <div class="row between"><div class="glyph">⚡</div><span class="chip">${Math.min(today.n,goal)}/${goal} today</span></div>
  <div style="margin-top:14px;font-size:13px;font-weight:600;opacity:.6">Daily practice · about 5 min</div>
  <div style="font-size:21px;font-weight:600;margin:4px 0 12px;line-height:1.3">${!Object.keys(S.log).length?'Let\'s see what you already know':today.n>=goal?'Goal done! Bonus round?':allBehind?`${allBehind} topic${allBehind>1?'s':''} slipping. Let's fix that`:'Keep everything fresh'}</div>
  <div class="row between"><div class="bar" style="flex:1;margin-right:14px"><i data-w="${Math.min(100,today.n/goal*100)}%" style="width:0;background:var(--lavd)"></i></div>${goBtn(Math.min(1,today.n/goal))}</div>
 </div>
 ${soon?`<div class="card row" style="gap:14px;margin-bottom:6px;flex-wrap:wrap"><div class="glyph" style="background:var(--${soon.c.color})">${soon.c.emoji}</div><div style="flex:1;min-width:160px"><div style="font-weight:600">${soon.days===0?'Exam TODAY':soon.days===1?'Exam tomorrow':`Exam in ${soon.days} days`} · ${esc(soon.c.code||soon.c.name)}</div><div class="muted" style="font-size:14px">${esc(soon.name)} · ${readinessLine(soon.c,soon,true)||'not enough practice yet'}</div></div><button class="btn" style="padding:12px 20px" data-cram="${soon.c.id}">Cram</button></div>`:''}
 ${plan.length?`<h2>Revise today <span class="muted" style="font-size:14px;font-weight:500">· fading below 60%</span></h2>
 <div class="stack" style="gap:8px">${plan.map(p=>`<div class="planitem"><span class="mem" style="color:${p.mem<0.3?'var(--bad)':'var(--peachd)'}">${p.seen?Math.round(p.mem*100)+'%':'new'}</span><div style="flex:1;min-width:0"><div class="nm" style="font-weight:600;font-size:15px">${esc(p.t.name)}</div><div class="muted" style="font-size:12px">${p.c.emoji} ${esc(p.c.code||p.c.name)}</div></div><button class="btn" style="padding:10px 16px;font-size:14px" data-revise="${p.t.id}">Revise</button></div>`).join('')}</div>`:''}
 <h2>Your courses</h2>
 ${sortBar()}
 <div class="pills" role="tablist">
  <button class="pill ${view.filter==='all'?'on':''}" data-filter="all">All <b>${S.courses.length}</b></button>
  ${S.courses.map(c=>`<button class="pill ${view.filter===c.id?'on':''}" data-filter="${c.id}">${c.emoji} ${esc((c.code||c.name).split(' ')[0])}</button>`).join('')}
 </div>
 <div class="grid2" style="margin-top:14px">
 ${list.map(c=>{const s=courseStats(c);return `
  <div class="ccard c-${c.color}" data-course="${c.id}" role="button" tabindex="0" aria-label="Open ${esc(c.name)}">
   <svg class="sparkle" width="34" height="34" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z"/></svg>
   <div class="row between"><div class="glyph">${c.emoji}</div><div class="row" style="gap:8px"><button class="pinbtn" data-pin="${c.id}" aria-label="${pinsOf().includes(c.id)?'Unpin':'Pin'} ${esc(c.name)}" title="${pinsOf().includes(c.id)?'Unpin':'Pin to top'}">${pinsOf().includes(c.id)?'📌':'📍'}</button><span class="chip">${ICON.star} ${Math.round(s.know*100)}% known</span></div></div>
   <div style="margin-top:14px;font-size:13px;font-weight:600;opacity:.6">${esc(c.code||'')}${c.uni?` · ${esc(c.uni)}`:''} · ${updatedAgo(c)}</div>
   <div style="font-size:20px;font-weight:600;margin:2px 0 12px">${esc(c.name)}</div>
   <div class="row between">
    <div style="font-size:13px;line-height:1.65">
     ${s.empty?'<div><b>No questions yet</b>. Tap to add notes</div>':`<div><b>${s.due}</b>/${s.total} topics taught so far</div>
     <div>${s.behind?`<span style="color:var(--bad);font-weight:600">${s.behind} behind</span>`:'<span style="color:var(--good);font-weight:600">On track ✓</span>'}${s.next?` · exam ${daysLabel(s.next.days)}`:''}</div>
     ${s.next&&readiness(c,s.next)?(r=>`<div>Readiness: <b>${r.lo}–${r.hi}%</b></div>`)(readiness(c,s.next)):''}`}
    </div>${goBtn(s.know)}
   </div>
  </div>`}).join('')}
  <button class="ccard" data-act="newcourse" style="background:transparent;border:2px dashed #0000001f;display:grid;place-items:center;min-height:180px;color:var(--muted);font-weight:600">${ICON.plus}<span>Add a course</span></button>
 </div></div>${rail}</div>`;
}

/* ---------------- course ---------------- */
function renderCourse(){
 const c=S.courses.find(x=>x.id===view.course);if(!c){view.course=null;return renderHome()}
 const s=courseStats(c),rd=s.next?readiness(c,s.next):null,mem=courseMemory(c,todayStr())||0,nq=courseQs(c).length;
 return `
 <div class="row between"><button class="iconbtn" data-act="back" aria-label="Back">${ICON.back}</button>
  <div class="row" style="gap:8px"><button class="iconbtn" data-export="${c.id}" aria-label="Export notes" title="Export notes (.md)">⬇</button><button class="iconbtn" data-print="${c.id}" aria-label="Print study sheet" title="Print study sheet">🖨</button><button class="iconbtn" data-share="${c.id}" aria-label="Share course">${ICON.share}</button><button class="iconbtn" data-edit="${c.id}" aria-label="Edit course">${ICON.edit}</button></div></div>
 <div style="margin-top:18px"><span class="chip" style="background:var(--${c.color})">${c.emoji} ${esc(c.code||'Course')}${c.uni?` · ${esc(c.uni)}`:''}</span>${coursePolicy(c)!=='open'?` <span class="chip" style="background:var(--bg)" title="${esc(c.ai?.note||'')}">${coursePolicy(c)==='off'?'🚫 AI off':'🧑‍🏫 AI: tutor only'}</span>`:''}</div>
 <h1 style="margin-top:12px">${esc(c.name)}</h1>
 ${s.empty?`<div class="card empty">${MASCOT(120,'think')}<h2 style="margin-top:4px">No questions yet</h2><p class="muted">Paste your lecture notes or key terms and Loop builds quizzes from them.</p><button class="btn" data-addq="${c.id}">${ICON.plus} Add notes &amp; questions</button></div>`:`
 <div class="big3">
  <div class="stat c-mint"><div class="n">${Math.round(s.know*100)}%</div><div class="l">Knowledge<br><span style="font-weight:400;font-size:11px">of content taught so far</span></div></div>
  <div class="stat c-lav"><div class="n" style="${rd?'font-size:clamp(22px,3vw,30px)':''}">${rd?rd.lo+'–'+rd.hi+'%':'–'}</div><div class="l">Estimated readiness<br><span style="font-weight:400;font-size:11px">${rd?rd.conf+' confidence · '+fmtDate(s.next.date):'add an exam date'}</span></div></div>
  <div class="stat c-peach"><div class="n">${Math.round((1-s.overall)*100)}%</div><div class="l">Still to learn<br><span style="font-weight:400;font-size:11px">${s.behind} topic${s.behind===1?'':'s'} behind</span></div></div>
 </div>
 <div class="row" style="gap:8px;margin-top:14px;flex-wrap:wrap">
  <button class="btn" style="flex:1;min-width:140px" data-cram="${c.id}">${ICON.bolt} Practice</button>
  <button class="btn light" style="flex:1;min-width:140px" data-diag="${c.id}">Check what I know</button>
  <button class="btn light" style="flex:1;min-width:140px" data-flash="${c.id}">${ICON.cards} Flashcards</button>
 </div>
 <div style="margin-top:14px">${autopilotCard(c)}</div>
 <div class="card" style="margin-top:14px"><b style="font-weight:600">Memory curve</b><div class="muted" style="font-size:13px;margin-bottom:8px">Remembered now: ${Math.round(mem*100)}%. It fades without review and jumps back up when you revise.</div>${memoryChart(c)}</div>
 <div class="grid2" style="margin-top:14px">${calibCard(c)}${mistakeLab(c)}</div>`}
 ${(c.exams||[]).map(e=>{const d=dayDiff(e.date,todayStr());return `<div class="card row between" style="margin-top:14px;padding:16px 20px"><div><div style="font-weight:600">${esc(e.name)}</div><div class="muted" style="font-size:14px">${fmtDate(e.date,{weekday:'short',month:'short',day:'numeric'})}${d>=0&&!s.empty&&readiness(c,e)?` · ${readinessLine(c,e,true)}`:''}</div>${d>=0&&!s.empty?(()=>{const g=dailyGoalFor(c,e),tg=e.target||S.settings.target||80;return `<div style="font-size:13px;margin-top:4px;font-weight:500;color:${g?'var(--lavd)':'var(--good)'}">${g?`🎯 About ${g} questions a day to reach your ${tg}% goal`:`✓ On track for your ${tg}% goal. Keep revising`}</div>`})():''}${d<0?`<label class="row actual" style="gap:8px;margin-top:8px;font-size:13px">Your actual grade <input class="field sm" type="number" min="0" max="100" inputmode="numeric" placeholder="%" value="${e.actual??''}" data-actual="${esc(examKey(c,e))}" style="width:84px;padding:6px 10px">%</label>`:''}</div><span class="tag ${d<0?'soon':d<=7?'behind':'new'}">${d<0?'done':d===0?'today':d+' days'}</span></div>`}).join('')}
 ${notebookCard(c)}
 <div style="margin-top:14px">${courseNotesCard(c)}</div>
 <div class="row between" style="margin-top:26px;margin-bottom:12px"><h2 style="margin:0">Topics</h2><button class="btn light" style="padding:10px 16px;font-size:14px" data-addq="${c.id}">${ICON.plus} Add questions</button></div>
 <div class="stack">
 ${c.topics.length?c.topics.map(t=>{const st=topicStatus(t),n=isGen(t.id)?'∞':(QBYT[t.id]||[]).length;return `<div class="topic">${ring(st.m,colVar[c.color])}<div style="flex:1;min-width:0"><div class="nm">${esc(t.name)}</div><div class="muted" style="font-size:12px">${fmtDate(t.date)} · ${n} question${n===1?'':'s'}</div></div><span class="tag ${st.k}">${st.label}</span><button class="link known${(S.known||{})[t.id]?' on':''}" data-known="${t.id}" aria-pressed="${!!(S.known||{})[t.id]}" style="font-size:12px;white-space:nowrap">${(S.known||{})[t.id]?'✓ Known':'I know this'}</button>${hasContent(t.id)?`<button class="iconbtn" style="width:40px;height:40px;box-shadow:none;background:var(--bg)" data-revise="${t.id}" aria-label="Practise ${esc(t.name)}">${ICON.arrow}</button>`:''}</div>`}).join(''):'<p class="muted">No topics yet. Use edit to add some.</p>'}
 </div>
 <p class="muted" style="font-size:12px;margin-top:16px">${nq} questions${c.topics.some(t=>t.gen)?' plus endless generated practice problems':''}</p>`;
}

/* ---------------- editor ---------------- */
let draft=null;
function openEditor(id){
 const c=id?S.courses.find(x=>x.id===id):null;
 draft=c?clone(c):{id:uid('c_'),code:'',name:'',emoji:EMOJIS[Math.random()*EMOJIS.length|0],color:COLORS[S.courses.length%5],uni:S.uni,exams:[],topics:[{id:uid('t_'),name:'',date:todayStr()}],src:'custom',isNew:true};
 view.edit=draft.id;render();scrollTo(0,0);
}
function renderEditor(){
 const d=draft;
 return `
 <div class="row between"><button class="iconbtn" data-act="canceledit" aria-label="Cancel">${ICON.x}</button><button class="btn" data-act="saveedit">Save</button></div>
 <h1 style="margin-top:18px">${d.isNew?'New course':'Edit course'}</h1>
 <div class="card">
  <div class="grid2" style="grid-template-columns:1fr 1fr">
   <div><label class="lbl" for="ecode" style="margin-top:0">Course code</label><input class="field sm" id="ecode" data-f="code" placeholder="e.g. PSYCH 1000" value="${esc(d.code)}"></div>
   <div><label class="lbl" for="euni" style="margin-top:0">University</label><input class="field sm" id="euni" data-f="uni" placeholder="Your school" value="${esc(d.uni||'')}"></div>
  </div>
  <label class="lbl" for="ename">Course name</label><input class="field sm" id="ename" data-f="name" placeholder="e.g. Intro to Psychology" value="${esc(d.name)}">
  <div class="lbl">Icon</div><div class="swatches">${EMOJIS.map(e=>`<button class="sw ${d.emoji===e?'on':''}" style="background:var(--bg)" data-emoji="${e}" aria-label="Icon ${e}">${e}</button>`).join('')}</div>
  <div class="lbl">Colour</div><div class="swatches">${COLORS.map(c=>`<button class="sw ${d.color===c?'on':''}" style="background:var(--${c})" data-color="${c}" aria-label="${c}"></button>`).join('')}</div>
 </div>
 <h2>Topics <span class="muted" style="font-size:14px;font-weight:500">· name + date it's taught</span></h2>
 <div class="card">${d.topics.map((t,i)=>`<div class="erow"><input class="field sm" data-tn="${i}" placeholder="Topic ${i+1} e.g. Memory &amp; learning" value="${esc(t.name)}" aria-label="Topic name"><input class="field sm" type="date" data-td="${i}" value="${t.date}" aria-label="Date taught"><button class="x" data-deltopic="${i}" aria-label="Remove topic">${ICON.x}</button></div>`).join('')}
  <button class="btn light" style="background:var(--bg);margin-top:4px" data-act="addtopic">${ICON.plus} Add topic</button></div>
 <h2>Exams &amp; tests</h2>
 <div class="card">${(d.exams||[]).map((e,i)=>`<div class="erow"><input class="field sm" data-en="${i}" placeholder="e.g. Midterm" value="${esc(e.name)}" aria-label="Exam name"><input class="field sm" type="date" data-ed="${i}" value="${e.date}" aria-label="Exam date"><button class="x" data-delexam="${i}" aria-label="Remove exam">${ICON.x}</button></div>`).join('')||'<p class="muted" style="margin:0 0 10px;font-size:14px">Add exam dates to get a predicted score and countdowns.</p>'}
  <button class="btn light" style="background:var(--bg);margin-top:4px" data-act="addexam">${ICON.plus} Add exam</button></div>
 <h2>AI help <span class="muted" style="font-size:14px;font-weight:500">· match your instructor's policy</span></h2>
 <div class="card"><div class="stack" style="gap:8px">${AIPOL.map(([k,l,s])=>`<button class="polopt ${(d.ai?.level||'open')===k?'on':''}" data-aipol="${k}"><b>${l}</b><small>${s}</small></button>`).join('')}</div>
  <label class="lbl" for="eainote">Policy note (optional)</label><input class="field sm" id="eainote" placeholder="e.g. AI allowed for studying, not for assignments" value="${esc(d.ai?.note||'')}"></div>
 ${d.isNew?'':`<button class="btn light full" style="margin-top:24px;color:var(--bad)" data-act="delcourse">Remove course</button>`}`;
}
function syncDraft(){
 if(!draft)return;
 document.querySelectorAll('[data-f]').forEach(i=>draft[i.dataset.f]=i.value);
 document.querySelectorAll('[data-tn]').forEach(i=>draft.topics[+i.dataset.tn].name=i.value);
 document.querySelectorAll('[data-td]').forEach(i=>draft.topics[+i.dataset.td].date=i.value||todayStr());
 document.querySelectorAll('[data-en]').forEach(i=>draft.exams[+i.dataset.en].name=i.value);
 document.querySelectorAll('[data-ed]').forEach(i=>draft.exams[+i.dataset.ed].date=i.value||todayStr());
 const an=$('#eainote');if(an)draft.ai=Object.assign({},draft.ai,{note:an.value.trim()});
}
function saveEditor(){
 syncDraft();const d=draft;
 if(!d.name.trim()&&!d.code.trim())return toast('Give the course a name');
 d.name=d.name.trim()||d.code.trim();d.code=d.code.trim();
 d.topics=d.topics.filter(t=>t.name.trim()).map(t=>({...t,name:t.name.trim()}));
 if(!d.topics.length)d.topics=[{id:uid('t_'),name:'General',date:todayStr()}];
 d.topics.sort((a,b)=>a.date.localeCompare(b.date));
 d.exams=(d.exams||[]).filter(e=>e.name.trim()&&e.date);
 const wasNew=d.isNew;delete d.isNew;
 const i=S.courses.findIndex(c=>c.id===d.id);if(i>=0)S.courses[i]=d;else S.courses.push(d);
 if(d.uni&&!S.uni)S.uni=d.uni;
 save();draft=null;view.edit=null;
 if(!S.setup){S.setup=true;S.uni=S.uni||d.uni||'';save()}
 view.course=d.id;if(wasNew){view.addq=d.id}render();scrollTo(0,0);toast(wasNew?'Course created. Now add some notes':'Saved');
}

/* ---------------- add questions ---------------- */
let aq={mode:'notes'};
function parseNotes(txt){
 return txt.split(/\n+/).map(l=>l.trim().replace(/^[-•*\d.)\s]+/,'')).filter(Boolean).map(l=>{
  const m=l.match(/^(.{1,90}?)\s*(?:[:=–—]|\s-\s)\s*(.{3,})$/);return m?{term:m[1].trim(),def:m[2].trim()}:null}).filter(Boolean);
}
function renderAddQ(){
 const c=S.courses.find(x=>x.id===view.addq);if(!c){view.addq=null;return renderHome()}
 const tsel=`<label class="lbl" for="aqt">Topic</label><select class="field sm" id="aqt">${c.topics.filter(t=>!t.gen).map(t=>`<option value="${t.id}" ${aq.t===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}</select>`;
 const mine=S.cq.filter(q=>TOPIC[q.t]?.course.id===c.id);
 return `
 <div class="row between"><button class="iconbtn" data-act="closeaddq" aria-label="Back">${ICON.back}</button><span class="chip" style="background:var(--${c.color})">${c.emoji} ${esc(c.code||c.name)}</span></div>
 <h1 style="margin-top:18px">Add questions</h1>
 <div class="seg" role="tablist"><button class="${aq.mode==='notes'?'on':''}" data-aqmode="notes">Paste notes</button><button class="${aq.mode==='one'?'on':''}" data-aqmode="one">Write a question</button></div>
 <div class="card" style="margin-top:14px">
  ${tsel}
  ${aq.mode==='notes'?`
   <label class="lbl" for="aqn">Key terms, one per line: <b>term: definition</b></label>
   <textarea class="field" id="aqn" placeholder="Mitochondria: the organelle that makes ATP through cellular respiration&#10;Osmosis - movement of water across a membrane from low to high solute concentration&#10;Keystone species = a species whose impact is far larger than its abundance"></textarea>
   <div class="hint">Separate each term and its definition with a colon, dash or equals sign. Each line becomes two questions (term → definition and definition → term), and the other definitions act as the wrong answers. Add at least 4 lines for the best quizzes.</div>
   <div class="err" id="aqerr"></div>
   <button class="btn full" data-act="savenotes">Create questions</button>`:`
   <label class="lbl" for="aqq">Question</label><input class="field sm" id="aqq" placeholder="What does a Realistic Job Preview do?">
   <label class="lbl" for="aqa">Correct answer</label><input class="field sm" id="aqa" placeholder="Gives an honest picture of the job">
   <label class="lbl">Wrong answers <span style="font-weight:400">(optional; Loop fills these in from your other answers)</span></label>
   <div class="stack" style="gap:8px">${[1,2,3].map(i=>`<input class="field sm" id="aqw${i}" placeholder="Wrong answer ${i}" aria-label="Wrong answer ${i}">`).join('')}</div>
   <label class="lbl" for="aqe">Why it's right <span style="font-weight:400">(optional)</span></label><input class="field sm" id="aqe" placeholder="Short explanation shown after answering">
   <div class="err" id="aqerr"></div>
   <button class="btn full" data-act="saveone">Add question</button>`}
 </div>
 <h2>Your questions in this course <span class="muted" style="font-size:14px;font-weight:500">· ${mine.length}</span></h2>
 <div class="stack" style="gap:8px">${mine.slice().reverse().slice(0,40).map(q=>`<div class="topic" style="padding:12px 14px"><div style="flex:1;min-width:0"><div style="font-weight:500;font-size:14px">${esc(q.q)}</div><div class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">✓ ${esc(q.ans)} · ${esc(TOPIC[q.t]?.name||'')}</div></div><button class="x iconbtn" style="width:36px;height:36px;box-shadow:none;background:var(--bg)" data-delq="${q.id}" aria-label="Delete question">${ICON.x}</button></div>`).join('')||'<p class="muted" style="font-size:14px">None yet.</p>'}</div>`;
}

/* ---------------- plan / stats / profile ---------------- */
function renderPlan(){
 const now=new Date(),ym=view.ym||[now.getFullYear(),now.getMonth()];
 const first=new Date(ym[0],ym[1],1),start=(first.getDay()+6)%7,days=new Date(ym[0],ym[1]+1,0).getDate();
 const exams={};S.courses.forEach(c=>(c.exams||[]).forEach(e=>(exams[e.date]=exams[e.date]||[]).push({...e,c})));
 let cells='';const prevDays=new Date(ym[0],ym[1],0).getDate();
 for(let i=0;i<start;i++)cells+=`<div class="d o" aria-hidden="true">${prevDays-start+i+1}</div>`;
 for(let d=1;d<=days;d++){const ds=new Date(ym[0],ym[1],d).toLocaleDateString('en-CA');const cls=[ds===todayStr()?'today':exams[ds]?'ex':'',S.log[ds]?.n>=5?'done':''].join(' ');cells+=`<div class="d ${cls}" title="${exams[ds]?esc(exams[ds].map(e=>(e.c.code||e.c.name)+': '+e.name).join(', ')):''}">${d}</div>`}
 const tail=(7-(start+days)%7)%7;for(let i=1;i<=tail;i++)cells+=`<div class="d o" aria-hidden="true">${i}</div>`;
 const upcoming=Object.entries(exams).flatMap(([d,a])=>a.map(e=>({...e,d,days:dayDiff(d,todayStr())}))).filter(e=>e.days>=0).sort((a,b)=>a.days-b.days);
 const navb='style="width:42px;height:42px;background:transparent;border:1.5px solid #0002;box-shadow:none"';
 return `<div class="dash"><div>
 <h1>Learning<br>Schedule Plan</h1>
 <div class="ccard c-mint" style="cursor:default">
  <div class="row between" style="margin-bottom:14px"><div class="row"><div class="glyph">${ICON.cal}</div><b style="font-size:18px;font-weight:600">${first.toLocaleDateString('en-CA',{month:'long',year:'numeric'})}</b></div>
  <div class="row" style="gap:6px"><button class="iconbtn" ${navb} data-month="-1" aria-label="Previous month">‹</button><button class="iconbtn" ${navb} data-month="1" aria-label="Next month">›</button></div></div>
  <div class="cal">${['M','T','W','T','F','S','S'].map(x=>`<div class="h">${x}</div>`).join('')}${cells}</div>
  <div class="row" style="gap:14px;margin-top:12px;font-size:12px;font-weight:500"><span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:50%;background:var(--lav2)"></i>Exam</span><span class="row" style="gap:5px"><i style="width:6px;height:6px;border-radius:50%;background:var(--mintd)"></i>Practised</span><span class="row" style="gap:5px"><i style="width:10px;height:10px;border-radius:50%;background:var(--ink)"></i>Today</span></div>
 </div></div>
 <aside class="rail" style="display:flex;flex-direction:column;gap:10px"><h2 style="margin:20px 0 4px">Coming up</h2>
 ${upcoming.length?upcoming.map(e=>`<button class="topic" data-cram="${e.c.id}" style="text-align:left;width:100%;background:var(--${e.c.color})"><div class="glyph" style="width:46px;height:46px">${e.c.emoji}</div><div style="flex:1;min-width:0"><div class="nm">${esc(e.c.code||e.c.name)} · ${esc(e.name)}</div><div style="font-size:13px;opacity:.75">${e.days===0?'Today':e.days===1?'Tomorrow':`In ${e.days} days`} ${readiness(e.c,e)?' · '+readinessLine(e.c,e,true):''}</div></div><div class="go" style="width:44px;height:44px">${ICON.arrow}</div></button>`).join(''):'<p class="muted">No exams yet. Open a course and tap edit to add dates.</p>'}
 </aside></div>`;
}

const SCIENCE=[
 ['Retrieval practice','Strong','Every session makes you recall the answer before you see it, instead of rereading.'],
 ['Spaced scheduling','Strong','Cards come back on a growing schedule using Anki\'s standard fixed settings. Whether adaptive schedulers (like FSRS) beat fixed ones is still unresolved.'],
 ['Try before you flip','Moderate (concepts)','Flashcards ask you to recall first. Good for ideas and definitions; weaker evidence for long multi-step maths problems.'],
 ['Mixing topics (interleaving)','Mixed for university','Two big reviews disagree about university students: one finds no clear benefit, the other a sizable one. Loop mixes topics in Daily practice, and you can always practise one topic at a time.'],
 ['Confidence & predicted scores','Experimental','Loop\'s predicted score is an estimate from its memory model, not a validated test. Treat it as a nudge, not a promise.'],
 ['Brain breaks & session length','Weak','Short sessions with a break every 5 questions are a design choice. No study sets an ideal session length.'],
 ['AI help (Loopy)','Experimental','Loopy explains after you try, not before. Its effect on learning hasn\'t been tested yet.']
];
function scienceCard(){
 const tone=s=>/^Strong/.test(s)?'ok':/Moderate/.test(s)?'new':/Mixed|Experimental/.test(s)?'soon':'behind';
 const n=(S.revlog||[]).length,rv=(S.revlog||[]).filter(r=>r.reveal),avgRv=rv.length?Math.round(rv.reduce((a,r)=>a+r.reveal,0)/rv.length/1000):null;
 return `<details class="card science"><summary><b style="font-weight:600">How Loop decides what you study</b><span class="muted" style="font-size:13px"> · and how strong the evidence is</span></summary>
  <div class="stack" style="gap:8px;margin-top:14px">${SCIENCE.map(([f,s,d])=>`<div class="mini" style="cursor:default;align-items:flex-start"><div style="flex:1"><div class="row between" style="gap:8px"><b style="font-size:14px">${f}</b><span class="tag ${tone(s)}">${s}</span></div><div class="muted" style="font-size:13px;line-height:1.5;margin-top:4px">${d}</div></div></div>`).join('')}</div>
  <p class="hint" style="margin-top:12px">Daily limits: up to ${SCHED.newPerDay} new cards and ${SCHED.revPerDay} reviews a day, with overdue cards first. Paired cards from the same note never appear on the same day. Loop logs every review (${n} so far${avgRv!=null?`, average ${avgRv}s before flipping`:''}) so future versions can be checked against real data.</p>
 </details>`;
}
function renderStats(){
 if(!S.courses.length) return `<h1>Your Progress</h1><p class="muted">Add a course first.</p>`;
 const days=[...Array(7)].map((_,i)=>addDays(todayStr(),i-6)),vals=days.map(d=>S.log[d]?.n||0),mx=Math.max(10,...vals);
 const cols=['var(--lav2)','var(--lemon)','var(--lav2)','var(--lavd)','var(--lemon)','var(--mint)','var(--lav)'];
 const total=Object.values(S.log).reduce((a,l)=>a+l.n,0),ok=Object.values(S.log).reduce((a,l)=>a+l.ok,0);
 const mins=Math.round(days.reduce((a,d)=>a+(S.log[d]?.sec||0),0)/60);
 const ids=Object.keys(TOPIC).filter(hasContent),mastered=ids.filter(t=>topicMastery(t)>=0.6).length;
 const mc=view.memC?S.courses.find(c=>c.id===view.memC):null,mem=(mc?[mc]:S.courses).map(c=>courseMemory(c,todayStr())||0),avg=mem.reduce((a,b)=>a+b,0)/Math.max(1,mem.length);
 return `<h1>Your Progress</h1>
 <div class="card" style="margin-bottom:14px">
  <b style="font-weight:600;font-size:18px">Memory</b><div class="muted" style="font-size:13px">${Math.round(avg*100)}% of what you've studied is still in your head today</div>
  <div class="pills" style="margin:12px 0 6px">${[['','All'],...S.courses.map(c=>[c.id,c.emoji+' '+(c.code||c.name).split(' ')[0]])].map(([id,l])=>`<button class="pill ${(view.memC||'')===id?'on':''}" data-memc="${id}">${esc(l)}</button>`).join('')}</div>
  ${memoryChart(mc,{back:28,fwd:21,h:230})}</div>
 <div class="grid2" style="grid-template-columns:1fr 1fr">
  <div class="stat c-lav"><div style="font-size:13px;font-weight:600;opacity:.7">Topics mastered</div><div class="n" style="font-size:40px;margin-top:6px">${mastered}</div><div class="l">of ${ids.length}</div></div>
  <div class="stat c-lemon"><div style="font-size:13px;font-weight:600;opacity:.7">Study time</div><div class="n" style="font-size:40px;margin-top:6px">${mins}<span style="font-size:18px">m</span></div><div class="l">this week</div></div>
 </div>
 <div class="card" style="margin-top:14px">
  <div class="row between"><b style="font-weight:600">Questions per day</b><span class="chip" style="background:var(--bg)">This week</span></div>
  <div class="chart">${vals.map((v,i)=>`<div class="col"><div class="b ${v===Math.max(...vals)&&v>0?'top':''}" data-h="${Math.max(10,v/mx*100)}%" style="height:0;background:${cols[i]}"><span>${v}</span></div><small>${fmtDate(days[i],{weekday:'short'})}</small></div>`).join('')}</div>
 </div>
 <div class="ccard c-mint row" style="margin-top:14px;cursor:default;gap:14px"><div style="font-size:34px" aria-hidden="true">🏆</div><div><b style="font-weight:600">${total?`${Math.round(ok/total*100)}% accuracy`:'No answers yet'}</b><div style="font-size:13px;opacity:.75">${total} questions answered · ${S.xp} XP · best streak ${Math.max(S.best,streak())} day${Math.max(S.best,streak())===1?'':'s'}</div></div></div>
 ${predVsActual()}
 ${weekReview()}
 <h2>Calibration</h2>
 ${calibCard(null)}
 <h2>Mistake Lab</h2>
 ${mistakeLab(null)}
 <div style="height:14px"></div>${scienceCard()}
 <h2>Badges <span class="muted" style="font-size:14px;font-weight:500">· ${badges().filter(b=>b[3]).length}/${badges().length}</span></h2>
 <p class="muted" style="font-size:13px;margin:-4px 0 12px">XP rewards honesty, fixing mistakes and coming back, not just being right. Your streak has one grace day each week, and there are no leaderboards.</p>
 <div class="badges">${badges().map(([e,n,d,ok])=>`<div class="badge ${ok?'on':''}" title="${esc(d)}"><div class="be">${e}</div><div class="bn">${esc(n)}</div><div class="bd">${esc(d)}</div></div>`).join('')}</div>
 <h2>Knowledge vs. predicted score</h2>
 <div class="stack">${S.courses.map(c=>{const s=courseStats(c),p=s.next?readiness(c,s.next):null;return `<button class="topic" data-course="${c.id}" style="text-align:left;width:100%">${ring(s.know,colVar[c.color])}<div style="flex:1;min-width:0"><div class="nm">${esc(c.code||c.name)}</div><div class="bar" style="background:var(--bg);margin-top:8px"><i data-w="${s.overall*100}%" style="width:0;background:${colVar[c.color]}"></i></div><div class="muted" style="font-size:12px;margin-top:6px">${Math.round(s.overall*100)}% of the whole course${p?` · readiness ${p.lo}–${p.hi}%`:''} · ${s.behind} behind</div></div></button>`}).join('')}</div>`;
}
function renderMe(){
 return `<h1>Profile</h1>
 <div class="card row" style="gap:16px"><div class="avatar" style="width:64px;height:64px;font-size:26px" aria-hidden="true">${esc((S.name[0]||'?').toUpperCase())}</div><div style="flex:1;min-width:0"><div style="font-weight:600;font-size:18px">${esc(S.name)}</div><div class="muted" style="font-size:14px">${esc(S.uni||'No school set')}</div><div class="muted" style="font-size:13px;overflow:hidden;text-overflow:ellipsis">${user?esc(user.email)+' · synced ✓':'Guest · saved on this device only'}</div></div></div>
 ${user?'':`<button class="btn full" style="margin-top:14px" data-act="toauth">Create an account to sync</button>`}
 <h2>Your details</h2>
 <div class="card"><label class="lbl" for="pname" style="margin-top:0">Name</label><input class="field sm" id="pname" value="${esc(S.name)}"><label class="lbl" for="puni">University</label><input class="field sm" id="puni" value="${esc(S.uni)}"><button class="btn light" style="background:var(--bg);margin-top:12px" data-act="saveprofile">Save</button></div>
 <h2>About you <span class="muted" style="font-size:14px;font-weight:500">· helps Loopy personalise</span></h2>
 <div class="card"><div class="grid2" style="grid-template-columns:1fr 1fr"><div><label class="lbl" for="ppg" style="margin-top:0">Program</label><input class="field sm" id="ppg" value="${esc(S.profile.program||'')}" placeholder="e.g. BMOS, Consumer Behaviour"></div><div><label class="lbl" for="pyr" style="margin-top:0">Year</label><input class="field sm" id="pyr" value="${esc(S.profile.year||'')}" placeholder="e.g. 1st year"></div></div>
  <label class="lbl" for="pint">Interests</label><input class="field sm" id="pint" value="${esc(S.profile.interests||'')}" placeholder="e.g. finance, real estate, investing, community work">
  <label class="lbl" for="pgoal">Career goals</label><input class="field sm" id="pgoal" value="${esc(S.profile.goals||'')}" placeholder="e.g. get into Ivey HBA, land a banking internship">
  <label class="lbl" for="pcity">City</label><input class="field sm" id="pcity" value="${esc(S.profile.city||'')}" placeholder="e.g. London, Ontario">
  <button class="btn light" style="background:var(--bg);margin-top:12px" data-act="saveabout">Save</button></div>
 <h2>Courses</h2>
 <div class="stack" style="gap:8px">${S.courses.map(c=>`<button class="topic" data-course="${c.id}" style="text-align:left;width:100%"><span style="font-size:22px">${c.emoji}</span><div style="flex:1"><div class="nm">${esc(c.code||c.name)}</div><div class="muted" style="font-size:12px">${esc(c.name)}</div></div>${ICON.arrow}</button>`).join('')}</div>
 <div class="row" style="gap:8px;margin-top:10px;flex-wrap:wrap"><button class="btn light" style="flex:1" data-act="newcourse">${ICON.plus} Create course</button><button class="btn light" style="flex:1" data-act="join">Join with code</button>${/western|uwo/i.test(S.uni)?`<button class="btn light" style="flex:1" data-act="westernpack">Western courses</button>`:''}</div>
 <h2>Focus settings</h2>
 <div class="stack">
  <div class="topic"><div style="flex:1"><div class="nm">Questions per session</div><div class="muted" style="font-size:12px">Short sessions are easier to start</div></div><div class="row" style="gap:6px">${[5,8,12].map(n=>`<button class="pill ${S.settings.len===n?'on':''}" style="background:${S.settings.len===n?'':'var(--bg)'}" data-len="${n}">${n}</button>`).join('')}</div></div>
  <div class="topic" style="flex-wrap:wrap"><div style="flex:1;min-width:160px"><div class="nm">“How sure are you?” check</div><div class="muted" style="font-size:12px">After you answer, before Loop reveals it</div></div><div class="seg" style="background:var(--bg)">${[['off','Off'],['some','Sometimes'],['always','Always']].map(([k,l])=>`<button class="${(S.settings.conf||'some')===k?'on':''}" data-confset="${k}">${l}</button>`).join('')}</div></div>
  <div class="topic"><div style="flex:1"><div class="nm">Focus timer</div><div class="muted" style="font-size:12px">A gentle clock, no pressure</div></div><button class="switch ${S.settings.timer?'on':''}" role="switch" aria-checked="${S.settings.timer}" data-set="timer" aria-label="Focus timer"></button></div>
  <div class="topic"><div style="flex:1"><div class="nm">Reminders</div><div class="muted" style="font-size:12px">Notifications before classes, clubs &amp; appointments</div></div><button class="switch ${S.settings.notify?'on':''}" role="switch" aria-checked="${!!S.settings.notify}" data-act="${S.settings.notify?'notifyoff':'notifyon'}" aria-label="Reminders"></button></div>
  ${pushCard()}
  <div class="topic"><div style="flex:1"><div class="nm">Calendars</div><div class="muted" style="font-size:12px">Outlook, Google, Apple, OWL · ${S.cals.length} connected</div></div><button class="btn light" style="background:var(--bg);padding:10px 16px;font-size:14px" data-act="calmenu">Manage</button></div>
  <div class="topic"><div style="flex:1"><div class="nm">Sounds</div><div class="muted" style="font-size:12px">Little dings on right answers</div></div><button class="switch ${S.settings.sound?'on':''}" role="switch" aria-checked="${S.settings.sound}" data-set="sound" aria-label="Sounds"></button></div>
 </div>
 <div class="topic" style="margin-top:14px;flex-wrap:wrap"><div style="flex:1;min-width:140px"><div class="nm">Appearance</div><div class="muted" style="font-size:12px">Auto follows your Mac or phone</div></div><div class="seg" style="background:var(--bg)">${[['auto','Auto'],['light','Light'],['dark','Dark']].map(([k,l])=>`<button class="${(S.settings.theme||'auto')===k?'on':''}" data-theme="${k}">${l}</button>`).join('')}</div></div>
 <h2>AI &amp; integrity</h2>
 <div class="topic" style="flex-wrap:wrap"><div style="flex:1;min-width:160px"><div class="nm">AI use receipt</div><div class="muted" style="font-size:12px">A record of every time you used Loopy (${(S.aiLog||[]).length} so far), with each course's AI setting. Handy if an instructor asks.</div></div><button class="btn light" style="background:var(--bg);padding:10px 16px;font-size:14px" data-act="aireceipt">⬇️ Download</button></div>
 <h2>Get the app</h2>
 <div class="grid2"><div class="card" style="font-size:14px;line-height:1.6"><b>iPhone:</b> open Loop in <b>Safari</b> → <b>Share</b> → <b>Add to Home Screen</b>.</div><div class="card" style="font-size:14px;line-height:1.6"><b>Mac:</b> in Safari, choose <b>File → Add to Dock</b> to get Loop as an app.</div></div>
 ${user?`<button class="btn light full" style="margin-top:20px" data-act="signout">Sign out</button>`:''}
 <p class="muted" style="font-size:12px;text-align:center;margin-top:20px">Loop · made for students everywhere</p>`;
}

/* ---------------- modal (join / share) ---------------- */
function modal(html){closeModal();const m=document.createElement('div');m.id='modal';m.className='quiz';m.style.zIndex=70;m.innerHTML=`<div style="margin:auto;max-width:440px;width:100%"><div class="card" style="padding:26px">${html}</div></div>`;m.addEventListener('click',e=>{if(e.target===m)closeModal()});document.body.appendChild(m);setTimeout(()=>m.querySelector('input')?.focus(),40)}
function closeModal(){$('#modal')?.remove()}
function openJoin(){
 modal(`<div class="row between"><h2 style="margin:0">Join a course</h2><button class="iconbtn" style="width:40px;height:40px;box-shadow:none;background:var(--bg)" data-act="closemodal" aria-label="Close">${ICON.x}</button></div>
 <p class="muted" style="font-size:14px">Got a code from a classmate? Enter it to copy their course, topics and questions. Your progress stays your own.</p>
 <input class="field" id="jcode" placeholder="e.g. K7Q2XM" maxlength="10" style="text-transform:uppercase;letter-spacing:.15em;font-weight:700;text-align:center;font-size:22px" aria-label="Course code">
 <div class="err" id="jerr" role="alert"></div><button class="btn full" data-act="dojoin">Join course</button>`);
}
async function doJoin(){
 const code=($('#jcode').value||'').trim().toUpperCase(),err=$('#jerr');if(code.length<5)return err.textContent='Codes are 6 characters.';
 err.textContent='Looking…';err.style.color='var(--muted)';
 const {data:rows,error}=await sb.rpc('loop_get_shared',{p_code:code});const data=rows&&rows[0];
 err.style.color='';if(error||!data)return err.textContent='No course found with that code.';
 importCourse(data.course,data.questions||[],code);closeModal();
}
function importCourse(course,qs,code){
 const map={},c=clone(course);c.id=uid('c_');c.src='shared:'+code;
 c.topics=c.topics.map(t=>{if(t.gen)return t;const n=uid('t_');map[t.id]=n;return {...t,id:n}});
 S.cq.push(...qs.filter(q=>map[q.t]).map(q=>({...q,id:uid('q_'),t:map[q.t]})));
 if(S.courses.some(x=>x.src===c.src)){toast('You already have this course');return}
 c.color=c.color||COLORS[S.courses.length%5];S.courses.push(c);save();
 if(S.setup){view.course=c.id;view.tab='home'}render();toast(`Added ${c.code||c.name}`);
}
async function openShare(id){
 const c=S.courses.find(x=>x.id===id);
 if(!user)return modal(`<h2 style="margin-top:0">Share with classmates</h2><p class="muted" style="font-size:14px">Create a free account to share courses with a code.</p><button class="btn full" data-act="toauth">Create account</button><button class="btn light full" style="margin-top:8px;background:var(--bg)" data-act="closemodal">Not now</button>`);
 modal(`<h2 style="margin-top:0">Share ${esc(c.code||c.name)}</h2><p class="muted" style="font-size:14px">Creating a code…</p>`);
 const qs=S.cq.filter(q=>c.topics.some(t=>t.id===q.t)).map(({id,t,q,ans,wrong,e,kind})=>({id,t,q,ans,wrong,e,kind}));
 const pub={...clone(c)};delete pub.src;
 let code=c.shareCode,tries=0,error=null;
 do{
  code=code||Array.from(crypto.getRandomValues(new Uint8Array(6)),b=>'ABCDEFGHJKMNPQRSTUVWXYZ23456789'[b%31]).join('');
  ({error}=await sb.from('loop_shared_courses').upsert({code,owner:user.id,title:c.name,university:c.uni||S.uni||null,course:pub,questions:qs,updated_at:new Date().toISOString()}));
  if(error&&!c.shareCode){code=null}
 }while(error&&++tries<3);
 if(error)return modal(`<h2 style="margin-top:0">Couldn't share</h2><p class="muted">${esc(error.message)}</p><button class="btn full" data-act="closemodal">Close</button>`);
 c.shareCode=code;save();
 modal(`<div class="row between"><h2 style="margin:0">Share code</h2><button class="iconbtn" style="width:40px;height:40px;box-shadow:none;background:var(--bg)" data-act="closemodal" aria-label="Close">${ICON.x}</button></div><p class="muted" style="font-size:14px">Classmates tap <b>Join with a code</b> and enter this. They get your topics and ${qs.length} questions${c.src==='western-f26'?' plus the built-in question bank':''}. Their progress is private.</p><div class="codebox">${code}</div><button class="btn full" data-copy="${code}">Copy code</button><p class="hint" style="text-align:center">Re-share any time to update it with new questions.</p>`);
}

/* ---------------- quiz + flashcards ---------------- */
let Q=null;
function startQuiz(list,title,mode='quiz'){
 list=(list||[]).filter(Boolean);if(!list.length)return toast('Add some questions to this course first');
 Q={list,title,mode,i:0,res:[],picked:null,t0:Date.now(),qStart:Date.now(),flipped:false};
 drawQ();clearInterval(Q.tick);
 Q.tick=setInterval(()=>{const el=$('#qtimer');if(el&&Q){const s=Math.floor((Date.now()-Q.t0)/1000);el.textContent=`${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`}},1000);
}
function quizEl(){let el=$('#quiz');if(!el){el=document.createElement('div');el.id='quiz';el.className='quiz';el.setAttribute('role','dialog');el.setAttribute('aria-modal','true');document.body.appendChild(el)}return el}
function topBar(){return `<div class="qtop"><button class="iconbtn" data-q="quit" aria-label="Stop">${ICON.x}</button><div class="dots" aria-label="Question ${Q.i+1} of ${Q.list.length}">${Q.list.map((_,j)=>`<i class="${j<Q.i?(Q.res[j]?'ok':'no'):j===Q.i?'d':''}"></i>`).join('')}</div>${S.settings.timer?'<span class="timer" id="qtimer">0:00</span>':''}</div>`}
function drawQ(){
 const el=quizEl();
 if(Q.i>=Q.list.length)return drawDone(el);
 if(Q.i>0&&Q.i%5===0&&Q.breakAt!==Q.i){Q.breakAt=Q.i;return drawBreak(el)}
 const q=Q.list[Q.i],t=TOPIC[q.t],c=t.course;Q.picked=null;Q.pend=null;Q.answerMs=null;Q.hint=0;Q.flipped=false;Q.qStart=Date.now();
 if(Q.mode==='flash'){
  el.innerHTML=`${topBar()}
  <div class="flip" id="flip" role="button" tabindex="0" aria-label="Flip card"><div class="inner">
   <div class="face c-${c.color}"><div class="qtag">${c.emoji} ${esc(c.code||c.name)} · ${esc(t.name)}</div><div class="big">${esc(q.q)}</div><div class="muted" style="margin-top:auto;font-size:13px;padding-top:20px">Tap to flip</div></div>
   <div class="face back"><div class="qtag" style="color:var(--good)">Answer</div><div class="big">${esc(q.o[q.a])}</div>${q.e?`<p class="muted" style="font-size:15px;line-height:1.5;margin-bottom:0">${esc(q.e)}</p>`:''}</div>
  </div></div>
  <p class="hint" id="tryfirst" style="text-align:center">Try to recall the answer before you flip.</p>
  <div class="rate" id="fbtns" style="visibility:hidden">${[[1,'Again','bad'],[2,'Hard','peachd'],[3,'Good','good'],[4,'Easy','skyd']].map(([r,l,c])=>`<button class="ratebtn" data-fk="${r}" style="--c:var(--${c})"><b>${l}</b><small>${q.gen?'':previewIvl(q.id,r)}</small></button>`).join('')}</div>
  <div class="kbd"><b>Space</b> reveal · then <b>1</b> Again · <b>2</b> Hard · <b>3</b> Good · <b>4</b> Easy</div>`;
  clearTimeout(Q.nudge);Q.nudge=setTimeout(()=>{const h=$('#tryfirst');if(h&&!Q?.flipped)h.textContent='Stuck? It\'s fine to reveal it now.'},10000);
  return;
 }
 el.innerHTML=`${topBar()}
 <div class="qcard c-${c.color}"><div class="qtag">${c.emoji} ${esc(c.code||c.name)} · ${esc(t.name)}${q.followup?` · <span style="color:var(--lavd)">↻ ${esc(q.followup)}</span>`:''}</div><div class="qtext">${esc(q.q)}</div></div>
 <div class="opts">${q.o.map((o,j)=>`<button class="opt" data-opt="${j}"><span class="k">${j+1}</span><span>${esc(o)}</span></button>`).join('')}</div>
 ${q.o.length>2?hintBar(q):''}<div id="hintbox" aria-live="polite"></div>
 <div id="why" aria-live="polite"></div>
 <div class="qfoot"><button class="btn full" id="nextb" data-q="next" style="visibility:hidden">Continue ${ICON.arrow}</button></div>
 <div class="kbd">Press <b>1</b>–<b>${q.o.length}</b> to answer · <b>H</b> hint · <b>Enter</b> to continue · <b>Esc</b> to stop</div>`;
}
function flip(){if(!Q||Q.mode!=='flash')return;if(!Q.flipped)Q.revealMs=Date.now()-Q.qStart;Q.flipped=!Q.flipped;$('#flip')?.classList.toggle('on',Q.flipped);if(Q.flipped){$('#fbtns').style.visibility='visible';$('#tryfirst')&&($('#tryfirst').style.visibility='hidden')}}
function flashAnswer(rating){if(!Q||Q.picked!==null||!Q.flipped)return;Q.picked=1;const q=Q.list[Q.i],ok=rating>1;Q.res[Q.i]=ok;record(q,ok,(Date.now()-Q.qStart)/1000,rating,{reveal:Q.revealMs});if(S.settings.sound)beep(ok);Q.i++;drawQ()}
/* ---------- Phase A: calibration (confidence after committing, before reveal) ---------- */
const CONF=[['Guessing','🤷'],['Somewhat sure','🤔'],['Very sure','💪']];
function shouldAskConf(){const m=S.settings.conf||'some';if(m==='off')return false;if(m==='always'||Q.title==='Check')return true;return Math.random()<0.4}
function answer(j){
 if(!Q||Q.picked!==null||Q.mode==='flash')return;const q=Q.list[Q.i];if(j>=q.o.length)return;
 if(Q.pend==null&&shouldAskConf()){
  Q.pend=j;Q.answerMs=Date.now()-Q.qStart;
  document.querySelectorAll('.opt').forEach((b,k)=>b.classList.toggle('sel',k===j));
  $('#why').innerHTML=`<div class="why confq"><b>How sure are you?</b><div class="muted" style="font-size:13px;margin-bottom:10px">Be honest. It helps Loop find what you only <i>think</i> you know.</div><div class="confrow">${CONF.map(([l,e],k)=>`<button class="confbtn" data-conf="${k}"><span>${e}</span>${l}<small>${k+1}</small></button>`).join('')}</div></div>`;
  return;
 }
 if(Q.pend!=null&&j!==Q.pend){Q.pend=j;document.querySelectorAll('.opt').forEach((b,k)=>b.classList.toggle('sel',k===j));return}
 finalize(j,null);
}
function finalize(j,conf){
 const q=Q.list[Q.i];Q.picked=j;Q.pend=null;const ok=j===q.a;Q.res[Q.i]=ok;Q.conf=conf;
 record(q,ok,(Q.answerMs??(Date.now()-Q.qStart))/1000,Q.hint&&ok?2:undefined,{conf,title:Q.title,...(q.followup?{followup:1}:{}),...(Q.hint?{hl:Q.hint}:{})});$('#hintbar')?.remove();Q.answerMs=null;
 let fixedCW=false;if(!q.gen&&S.q[q.id]){if(conf===2&&!ok)S.q[q.id].cw=todayStr();else if(ok&&conf===2&&S.q[q.id].cw){delete S.q[q.id].cw;fixedCW=true;S.fixed=(S.fixed||0)+1;S.xp+=5}else if(ok&&conf===2)delete S.q[q.id].cw;save()}
 if(conf===0&&!ok)S.xp+=2; // honest "I was guessing" is rewarded
 document.querySelectorAll('.opt').forEach((b,k)=>{b.classList.remove('sel');b.classList.add(k===q.a?'ok':k===j?'no':'dim');b.disabled=true});
 const praise=['Nice!','Nailed it!','Yes! 🎉','Exactly right'],soft=['Not quite','Close one','Almost'];
 const head=ok?praise[Math.random()*praise.length|0]:soft[Math.random()*soft.length|0]+'. It\'s “'+esc(q.o[q.a])+'”';
 let note='';
 if(conf!=null){
  if(ok&&conf===0)note='Right, but you were guessing. Loop will check this one again soon so it sticks.';
  else if(ok&&conf===1)note='Correct. Fragile knowledge gets an early review.';
  else if(!ok&&conf===0)note='You already spotted the gap. That\'s good self-monitoring.';
  else if(!ok&&conf===2)note='Confidently wrong: the most useful kind of mistake to catch before an exam. Loop will bring it back first.';
 }
 if(fixedCW)note=(note?note+' ':'')+'🛠️ You fixed a mistake you used to be sure about. +5 XP.';
 if(conf===0&&!ok)note+=' +2 XP for honesty.';
 $('#why').innerHTML=`<div class="why"><b style="color:${ok?'var(--good)':'var(--bad)'}">${head}</b>${note?`<div class="calnote">${note}</div>`:''}${esc(q.e||'')}${!ok?mistakeChips(conf):''}${user&&aiAllowedFor(TOPIC[q.t]?.course)?`<div style="margin-top:10px"><button class="link" data-act="explain" style="font-size:14px">🟣 Explain this with Loopy</button></div>`:''}</div>`;
 const nb=$('#nextb');nb.style.visibility='visible';if(ok)nb.focus({preventScroll:true});
 if(S.settings.sound)beep(ok);if(navigator.vibrate)navigator.vibrate(ok?15:[30,40,30]);
}
/* ---------- Phase B: Mistake Lab ---------- */
const MISTAKES=[['concept','I didn\'t know the concept','📖'],['confused','I confused two concepts','🔀'],['retrieval','I knew it but couldn\'t recall it','🧠'],['misread','I misread the question','👀'],['procedure','I used the wrong method','🧮'],['careless','Careless / arithmetic slip','✏️'],['guess','I guessed','🎲'],['misconception','I was confidently wrong','⚠️'],['unsure','Not sure','❔']];
const MK=Object.fromEntries(MISTAKES.map(([k,l,e])=>[k,{l,e}]));
function mistakeChips(conf){
 const sug=conf===2?'misconception':conf===0?'guess':null;
 return `<div class="mklab"><div style="font-weight:600;font-size:14px;margin:12px 0 8px">What went wrong? <span class="muted" style="font-weight:400;font-size:12px">${sug?'Loop\'s guess is highlighted. You decide.':'Optional. It helps Loop choose the right follow-up.'}</span></div><div class="chips">${MISTAKES.map(([k,l,e])=>`<button class="qchip mkchip ${k===sug?'sug':''}" data-mk="${k}">${e} ${l}</button>`).join('')}</div></div>`;
}
function retryOf(q){if(q.gen)return window.genMath(q.t);const o=shuffle(q.o.slice());return {...q,o,a:o.indexOf(q.o[q.a])}}
function tagMistake(kind){
 if(!Q)return;const q=Q.list[Q.i],last=[...(S.revlog||[])].reverse().find(r=>r.t===q.t&&(q.gen||r.id===q.id));
 if(last)last.mk=kind;
 if(!q.gen&&S.q[q.id]){S.q[q.id].mk=kind;if(['retrieval','misconception','concept'].includes(kind))S.q[q.id].due=todayStr()}
 S.xp+=2;Q.follow=Q.follow||0;let add=null,why='';
 if(Q.follow<3){
  if(kind==='confused'){const picked=q.o[Q.picked];const alt=courseQs(TOPIC[q.t].course).find(x=>x.id!==q.id&&(x.ans===picked||(x.o&&x.o[x.a]===picked)));if(alt){add=toMC(alt);why='Tell them apart: a question about the one you picked.'}}
  if(!add&&kind==='misread'){const x=pickQ(q.t,new Set([q.id]));if(x){add=x;why='Similar question. Read the wording slowly.'}}
  if(!add&&kind==='procedure'&&q.gen){add=window.genMath(q.t);why='Same method, new numbers.'}
  if(!add&&kind!=='careless'){add=retryOf(q);why='Retry: you\'ll see this again shortly.'}
 }
 if(add){add.followup=why;Q.list.splice(Math.min(Q.list.length,Q.i+3),0,add);Q.follow++}
 save();
 document.querySelectorAll('.mkchip').forEach(b=>{b.classList.toggle('on',b.dataset.mk===kind);b.disabled=true});
 const msg={concept:'Got it. Loop will show this again soon.',confused:'Loop will practise telling these apart.',retrieval:'Loop will bring this back sooner than usual.',misread:'Slow down on the wording. A similar question is coming.',procedure:'Loop will give you another one with the same method.',careless:'Noted. No extra review needed for a slip.',guess:'Loop will check this again soon.',misconception:'Loop will retry this shortly, then again tomorrow.',unsure:'Noted.'}[kind];
 $('.mklab')?.insertAdjacentHTML('beforeend',`<div class="calnote" style="margin-top:8px">${msg}${add?' A follow-up is queued in this session.':''}</div>`);
 $('#nextb')?.focus({preventScroll:true});
}
function calibStats(filter){
 const L=(S.revlog||[]).filter(r=>r.conf!=null&&r.ok!=null&&(!filter||filter(r)));
 const c={n:L.length,cc:0,cu:0,wu:0,wc:0};
 L.forEach(r=>{if(r.ok){if(r.conf===2)c.cc++;else c.cu++}else{if(r.conf===2)c.wc++;else c.wu++}});
 return c;
}
function calibCard(c){
 const s=calibStats(c?(r=>TOPIC[r.t]?.course.id===c.id):null);
 if(s.n<5)return `<div class="card"><b style="font-weight:600">How accurately do you know what you know?</b><p class="muted" style="font-size:14px;margin:8px 0 0">After you pick an answer, Loop sometimes asks how sure you are. ${5-s.n} more rating${5-s.n===1?'':'s'} and this shows where you're over- or under-confident.</p></div>`;
 const pct=x=>Math.round(x/s.n*100);
 const cells=[['cc','Correct & very sure','Solid knowledge','ok'],['cu','Correct, unsure','Fragile: reviewed early','new'],['wu','Wrong, and knew it','Gap already spotted','soon'],['wc','Confidently wrong','Fixed first','behind']];
 const byCourse=S.courses.map(co=>{const R=(S.revlog||[]).filter(r=>r.conf!=null&&TOPIC[r.t]?.course.id===co.id),sure=R.filter(r=>r.conf===2),guess=R.filter(r=>r.conf===0);return {co,n:R.length,over:sure.length>=3?sure.filter(r=>!r.ok).length/sure.length:null,under:guess.length>=3?guess.filter(r=>r.ok).length/guess.length:null}}).filter(z=>z.n>=3);
 const cwTopics=[...new Set(Object.entries(S.q).filter(([,r])=>r.cw).map(([id])=>[...PACK_Q,...S.cq].find(q=>q.id===id)?.t).filter(t=>t&&TOPIC[t]&&(!c||TOPIC[t].course.id===c.id)))].slice(0,5);
 return `<div class="card"><div class="row between" style="flex-wrap:wrap;gap:8px"><b style="font-weight:600">How accurately do you know what you know?</b><span class="muted" style="font-size:12px">${s.n} rated answers</span></div>
  <div class="calgrid">${cells.map(([k,l,d,t])=>`<div class="calcell ${t}"><div class="n">${pct(s[k])}%</div><div class="l">${l}</div><div class="d">${d}</div></div>`).join('')}</div>
  ${!c&&byCourse.length?`<div class="stack" style="gap:6px;margin-top:12px">${byCourse.map(z=>`<div class="mini" style="cursor:default"><span style="font-size:18px">${z.co.emoji}</span><div style="flex:1;min-width:0"><div class="nm1">${esc(z.co.code||z.co.name)}</div><div class="muted" style="font-size:12px">${z.over!=null?`When “very sure”, wrong ${Math.round(z.over*100)}% of the time`:'Not enough “very sure” answers yet'}${z.under!=null?` · when guessing, right ${Math.round(z.under*100)}%`:''}</div></div>${z.over!=null&&z.over>=0.25?'<span class="tag behind">Overconfident</span>':z.under!=null&&z.under>=0.6?'<span class="tag new">Underconfident</span>':'<span class="tag ok">Calibrated</span>'}</div>`).join('')}</div>`:''}
  ${cwTopics.length?`<div style="margin-top:12px;font-size:13px"><b>Confidently wrong in:</b> ${cwTopics.map(t=>`<button class="link" data-revise="${t}">${esc(TOPIC[t].name)}</button>`).join(' · ')}</div>`:''}</div>`;
}
function mistakeLab(c){
 const since=Date.now()-30*864e5,inC=r=>TOPIC[r.t]&&(!c||TOPIC[r.t].course.id===c.id);
 const L=(S.revlog||[]).filter(r=>r.mk&&r.ts>=since&&inC(r));
 const W=(S.revlog||[]).filter(r=>r.ok===false&&r.ts>=since&&inC(r));
 const counts={};L.forEach(r=>counts[r.mk]=(counts[r.mk]||0)+1);
 const tops={};W.forEach(r=>tops[r.t]=(tops[r.t]||0)+1);
 const topT=Object.entries(tops).sort((a,b)=>b[1]-a[1]).slice(0,4);
 const m=mistakes().filter(q=>!c||TOPIC[q.t]?.course.id===c.id);
 return `<div class="card"><div class="row between" style="flex-wrap:wrap;gap:8px"><div><b style="font-weight:600">Mistake Lab</b><div class="muted" style="font-size:13px">Last 30 days · ${W.length} wrong answer${W.length===1?'':'s'}${L.length?` · ${L.length} tagged`:''}</div></div>${m.length?`<button class="btn" style="padding:10px 16px;font-size:14px" data-mistakes="${c?c.id:''}">Practise ${Math.min(10,m.length)} mistake${m.length===1?'':'s'}</button>`:''}</div>
  ${L.length?`<div class="mkbars">${Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(([k,n])=>`<div class="mkbar"><span>${MK[k].e} ${MK[k].l}</span><div class="bar" style="background:var(--bg)"><i style="width:${Math.round(n/L.length*100)}%;background:var(--lavd)"></i></div><b>${n}</b></div>`).join('')}</div>`:`<p class="muted" style="font-size:14px;margin:10px 0 0">${W.length?'Tag mistakes after wrong answers (“What went wrong?”) to see your patterns here.':'No mistakes yet. They\'ll appear here as you practise.'}</p>`}
  ${topT.length?`<div style="margin-top:12px;font-size:13px"><b>Most missed:</b> ${topT.map(([t,n])=>`<button class="link" data-revise="${t}">${esc(TOPIC[t].name)}</button> <span class="muted">(${n})</span>`).join(' · ')}</div>`:''}</div>`;
}
function drawBreak(el){
 const ok=Q.res.filter(Boolean).length;
 el.innerHTML=`<div style="margin:auto;text-align:center;max-width:380px">${MASCOT(170)}<h1 style="text-align:center;font-size:30px">Brain break 🌿</h1><p class="muted" style="line-height:1.55">${ok}/${Q.i} so far. Stretch, sip some water and take one slow breath. Ready when you are.</p><button class="btn full" data-q="resume" style="margin-top:10px">Keep going ${ICON.arrow}</button><button class="muted" style="margin-top:14px;font-size:14px" data-q="finish">End here, that still counts</button></div>`;
 $('[data-q="resume"]')?.focus();
}
function drawDone(el){
 clearInterval(Q.tick);
 const ok=Q.res.filter(Boolean).length,n=Q.res.length,pct=n?ok/n:0,st=streak();S.best=Math.max(S.best,st);save();
 const weak=[...new Set(Q.list.filter((q,i)=>Q.res[i]===false).map(q=>TOPIC[q.t]?.name))].filter(Boolean).slice(0,3);
 el.innerHTML=`<div style="margin:auto;text-align:center;max-width:400px;width:100%">${MASCOT(160,pct<.5&&n?'sad':'happy')}
  <h1 style="text-align:center;font-size:32px;margin-bottom:6px">${!n?'See you soon':pct>=.8?'Amazing!':pct>=.5?'Solid work!':'You showed up. That\'s the win'}</h1>
  <p class="muted" style="margin:0 0 18px">${ok}/${n} correct · +${ok*10+(n-ok)*3} XP${st?` · 🔥 ${st}-day streak`:''}</p>
  ${weak.length?`<div class="card" style="text-align:left;margin-bottom:14px"><b style="font-weight:600">Revisit next time</b><div class="muted" style="font-size:14px;margin-top:6px;line-height:1.6">${weak.map(esc).join('<br>')}</div></div>`:''}
  <button class="btn full" data-q="close">Done</button><button class="btn light full" style="margin-top:10px" data-q="again">One more round</button></div>`;
 if(pct>=.6&&n)confetti();$('[data-q="close"]')?.focus();
}
function beep(ok){try{const a=window.__ac||(window.__ac=new (window.AudioContext||window.webkitAudioContext)()),o=a.createOscillator(),g=a.createGain();o.connect(g);g.connect(a.destination);o.frequency.value=ok?880:220;o.type='sine';g.gain.setValueAtTime(.07,a.currentTime);g.gain.exponentialRampToValueAtTime(.0001,a.currentTime+.25);o.start();o.stop(a.currentTime+.25)}catch{}}
function confetti(){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;const c=document.createElement('canvas');c.className='confetti';c.width=innerWidth;c.height=innerHeight;document.body.appendChild(c);const x=c.getContext('2d'),cols=['#B9A3E6','#7C5CD6','#CFE7E0','#FBEBB0','#FBDCCB','#3FB27F'];const P=[...Array(120)].map(()=>({x:innerWidth/2,y:innerHeight/2.5,vx:(Math.random()-.5)*14,vy:Math.random()*-14-4,s:Math.random()*8+4,c:cols[Math.random()*6|0],r:Math.random()*6}));let f=0;(function loop(){x.clearRect(0,0,c.width,c.height);P.forEach(p=>{p.vy+=.4;p.x+=p.vx;p.y+=p.vy;p.r+=.1;x.save();x.translate(p.x,p.y);x.rotate(p.r);x.fillStyle=p.c;x.fillRect(-p.s/2,-p.s/2,p.s,p.s*.6);x.restore()});if(f++<120)requestAnimationFrame(loop);else c.remove()})()}
function closeQuiz(){if(Q)clearInterval(Q.tick);$('#quiz')?.remove();Q=null;render()}
function cram(cid){const c=S.courses.find(x=>x.id===cid),e=c&&nextExam(c);startQuiz(buildSet({courseId:cid,until:e?.date,n:e&&e.days<=7?Math.max(12,S.settings.len):S.settings.len}),'Cram')}



/* ======================= UNIVERSITY OS ======================= */
const WD=['SU','MO','TU','WE','TH','FR','SA'];
const DAYNAME={MO:'Mon',TU:'Tue',WE:'Wed',TH:'Thu',FR:'Fri',SA:'Sat',SU:'Sun'};
const WEEKDAYS=['MO','TU','WE','TH','FR','SA','SU'];
const KIND={class:{l:'Class',c:'sky',e:'📚'},club:{l:'Club',c:'mint',e:'🎭'},appointment:{l:'Appointment',c:'peach',e:'📍'},exam:{l:'Exam',c:'lav',e:'📝'},deadline:{l:'Deadline',c:'lemon',e:'⏰'},study:{l:'Study block',c:'lav',e:'🧠'},work:{l:'Work',c:'peach',e:'💼'},other:{l:'Other',c:'sky',e:'✨'}};
const APPTYPES={club:'Club',job:'Job',internship:'Internship',scholarship:'Scholarship',program:'Program',competition:'Competition',volunteer:'Volunteer',other:'Other'};
const APPSTAGES=[['saved','Saved'],['applied','Applied'],['interview','Interview'],['offer','Offer 🎉'],['closed','Closed']];
const wdOf=d=>WD[new Date(d+'T12:00').getDay()];
const t2m=t=>{if(!t)return null;const [h,m]=String(t).split(':').map(Number);return h*60+(m||0)};
const fmtTime=t=>{if(!t)return '';const [h,m]=t.split(':').map(Number);return `${((h+11)%12)+1}${m?':'+String(m).padStart(2,'0'):''}${h>=12?'pm':'am'}`};
const weekStart=d=>{const x=new Date(d+'T12:00');x.setDate(x.getDate()-((x.getDay()+6)%7));return x.toLocaleDateString('en-CA')};
let ICS=store.get('loop-ics',{});
function osInit(){S.events=S.events||[];S.clubs=S.clubs||[];S.apps=S.apps||[];S.cals=S.cals||[];S.feeds=S.feeds||null;S.chat=S.chat||[];S.profile=S.profile||{}}
function occursOn(e,d){
 if(e.date&&!(e.days&&e.days.length))return e.date===d;
 if(e.days&&e.days.length){if(e.startDate&&d<e.startDate)return false;if(e.endDate&&d>e.endDate)return false;if(e.except&&e.except.includes(d))return false;return e.days.includes(wdOf(d))}
 return false;
}
function eventsOn(d){
 osInit();const out=[];
 S.events.forEach(e=>{if(occursOn(e,d))out.push({...e})});
 Object.entries(ICS).forEach(([u,c])=>{const cal=S.cals.find(x=>x.url===u);if(!cal||cal.off)return;(c.events||[]).forEach(e=>{if(occursOn(e,d))out.push({...e,readonly:true,calName:cal.name,kind:e.kind||'other',color:cal.color})})});
 S.courses.forEach(c=>(c.exams||[]).forEach(x=>{if(x.date===d)out.push({id:'x_'+c.id+'_'+x.name,kind:'exam',title:`${c.code||c.name} · ${x.name}`,date:d,readonly:true,course:c.id})}));
 S.apps.forEach(a=>{if(a.deadline===d&&(a.status==='saved'))out.push({id:'a_'+a.id,kind:'deadline',title:`Apply: ${a.org}${a.role?' · '+a.role:''}`,date:d,readonly:true,app:a.id})});
 return out.sort((a,b)=>(t2m(a.start)??-1)-(t2m(b.start)??-1));
}
function nextUp(){
 const now=new Date(),nm=now.getHours()*60+now.getMinutes(),t=todayStr();
 for(let i=0;i<8;i++){const d=addDays(t,i);const ev=eventsOn(d).filter(e=>e.start&&(i>0||t2m(e.end||e.start)>=nm));if(ev.length){const e=ev[0];const mins=i===0?t2m(e.start)-nm:null;return {...e,day:d,inMin:mins,now:i===0&&mins<=0}}}
 return null;
}
const evColor=e=>KIND[e.kind]?.c||e.color||'sky';

/* ---------- Today ---------- */
function renderToday(){
 osInit();
 const t=todayStr(),ev=eventsOn(t),nu=nextUp(),st=streak(),today=S.log[t]||{n:0},goal=S.settings.len,plan=todayPlan().slice(0,3);
 const nowM=new Date().getHours()*60+new Date().getMinutes();
 const week=[...Array(7)].map((_,i)=>addDays(t,i));
 const dl=week.flatMap(d=>eventsOn(d).filter(e=>e.kind==='exam'||e.kind==='deadline').map(e=>({...e,d}))).slice(0,6);
 const news=(store.get('loop-news',{}).items||[]).slice(0,3);
 const greet=new Date().getHours()<12?'Good morning':new Date().getHours()<18?'Good afternoon':'Good evening';
 const rail=`<aside class="rail">
  <button class="ccard c-lav loopycard" data-act="ask" style="text-align:left;width:100%">
   <div class="row" style="gap:12px">${MASCOT(64,'happy',false)}<div><div style="font-weight:700;font-size:17px">Ask Loopy</div><div style="font-size:13px;opacity:.75">Your uni, life &amp; career sidekick</div></div></div>
   <div class="chips" style="margin-top:12px">${['Opportunities for me this month','Plan my week','Clubs that fit my goals'].map(q=>`<span class="qchip" data-askq="${esc(q)}">${esc(q)}</span>`).join('')}</div>
  </button>
  <div class="card"><div class="row between"><b style="font-weight:600">This week</b><button class="link" style="font-size:13px" data-tab="schedule">Schedule →</button></div>
   <div class="stack" style="gap:8px;margin-top:12px">${dl.length?dl.map(e=>`<div class="mini" ${e.app?`data-editapp="${e.app}"`:e.course?`data-course="${e.course}"`:''}><span class="dot c-${evColor(e)}"></span><div style="flex:1;min-width:0"><div class="nm1">${esc(e.title)}</div><div class="muted" style="font-size:12px">${dayDiff(e.d,t)===0?'Today':dayDiff(e.d,t)===1?'Tomorrow':fmtDate(e.d,{weekday:'long'})}</div></div></div>`).join(''):'<p class="muted" style="font-size:14px;margin:0">No exams or deadlines this week 🎉</p>'}</div></div>
  <div class="card"><div class="row between"><b style="font-weight:600">${esc(S.uni||'Campus')} news</b><button class="link" style="font-size:13px" data-tab="life">More →</button></div>
   <div class="stack" style="gap:10px;margin-top:12px">${news.length?news.map(n=>`<a class="newsitem" href="${esc(n.link)}" target="_blank" rel="noopener"><div class="nm1">${esc(n.title)}</div><div class="muted" style="font-size:12px">${esc(n.when||'')}</div></a>`).join(''):`<p class="muted" style="font-size:14px;margin:0">${user?'Loading news…':'Sign in to see campus news.'}</p>`}</div></div>
 </aside>`;
 return `<div class="dash"><div>
 <div class="row between">
  <button class="row" data-tab="me" style="text-align:left"><div class="avatar" aria-hidden="true">${esc((S.name[0]||'?').toUpperCase())}</div>
   <div><div style="font-weight:600;font-size:18px">${greet}, ${esc(S.name)}! 👋</div><div style="font-size:13px" class="muted">${fmtDate(t,{weekday:'long',month:'long',day:'numeric'})}${st?` · 🔥 ${st}-day streak`:''}</div></div></button>
  <div class="row" style="gap:10px"><div class="lvl" title="${level().to} XP to the next level"><b>Lv ${level().l}</b><div class="bar" style="width:60px;height:6px;background:var(--bg)"><i style="width:${Math.round(level().p*100)}%;background:var(--lavd)"></i></div></div>
  <button class="iconbtn" data-act="newevent" aria-label="Add to schedule">${ICON.plus}</button></div>
 </div>
 <h1 style="margin-top:22px">Your Day,<br>At a Glance</h1>
 ${nu?`<div class="ccard c-${evColor(nu)} upnext" ${nu.readonly?'':`data-editev="${nu.id}"`}>
   <svg class="sparkle" width="34" height="34" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M12 0c1 7 5 11 12 12-7 1-11 5-12 12-1-7-5-11-12-12 7-1 11-5 12-12z"/></svg>
   <div class="row between"><div class="glyph">${KIND[nu.kind]?.e||'✨'}</div><span class="chip">${nu.now?'Happening now':nu.inMin!=null?(nu.inMin<60?`In ${nu.inMin} min`:`In ${Math.floor(nu.inMin/60)}h ${nu.inMin%60}m`):dayDiff(nu.day,t)===1?'Tomorrow':fmtDate(nu.day,{weekday:'long'})}</span></div>
   <div style="margin-top:14px;font-size:13px;font-weight:600;opacity:.6">Up next · ${KIND[nu.kind]?.l||'Event'}</div>
   <div style="font-size:22px;font-weight:600;margin:2px 0 6px;line-height:1.25">${esc(nu.title)}</div>
   <div style="font-size:14px;opacity:.8">${fmtTime(nu.start)}${nu.end?'–'+fmtTime(nu.end):''}${nu.location?` · 📍 ${esc(nu.location)}`:''}</div>
  </div>`:`<div class="ccard c-mint upnext" data-act="newevent"><div class="row between"><div class="glyph">🗓️</div><span class="chip">Set up</span></div><div style="font-size:21px;font-weight:600;margin:14px 0 6px">Add your classes &amp; clubs</div><div style="font-size:14px;opacity:.8">Paste your timetable and Loopy will build your week, or add things one by one.</div></div>`}
 <h2>Today</h2>
 <div class="agenda">${ev.length?ev.map(e=>{const past=e.start&&t2m(e.end||e.start)<nowM,now=e.start&&t2m(e.start)<=nowM&&t2m(e.end||e.start)>=nowM;return `<div class="arow ${past?'past':''} ${now?'now':''}" ${e.readonly?(e.app?`data-editapp="${e.app}"`:e.course?`data-course="${e.course}"`:''):`data-editev="${e.id}"`}><div class="atime">${e.start?fmtTime(e.start):'All day'}${e.end?`<small>${fmtTime(e.end)}</small>`:''}</div><div class="abar c-${evColor(e)}"></div><div style="flex:1;min-width:0"><div class="nm1">${KIND[e.kind]?.e||''} ${esc(e.title)}</div><div class="muted" style="font-size:12px">${[e.location&&'📍 '+e.location,e.calName].filter(Boolean).map(esc).join(' · ')||KIND[e.kind]?.l||''}</div></div>${now?'<span class="tag ok">now</span>':''}</div>`}).join(''):`<div class="card empty" style="padding:22px"><p class="muted" style="margin:0">Nothing scheduled today. ${S.events.length?'Enjoy the free time, or block a study session.':'Add your timetable to see your day here.'}</p><div class="row" style="justify-content:center;gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn light" style="background:var(--card)" data-act="newevent">${ICON.plus} Add event</button><button class="btn" data-act="aiimport">✨ Paste timetable</button></div></div>`}</div>
 ${doneTodayCard()}
 ${S.courses.length?`<div style="margin-top:14px">${nextActionCard()}</div>`:''}
 <div style="margin-top:14px">${inboxCard()}</div>
 <div style="margin-top:14px">${moodCard()}</div>
 ${S.courses.length?`<h2>Study</h2>
 <div class="grid2">
  <div class="ccard c-lav" data-act="daily" role="button" tabindex="0"><div class="row between"><div class="glyph">⚡</div><span class="chip">${Math.min(today.n,goal)}/${goal}</span></div><div style="font-size:18px;font-weight:600;margin:12px 0 10px">${today.n>=goal?'Goal done! Bonus round?':'Daily practice · 5 min'}</div><div class="bar"><i data-w="${Math.min(100,today.n/goal*100)}%" style="width:0;background:var(--lavd)"></i></div></div>
  <div class="card">${plan.length?`<b style="font-weight:600">Revise before it fades</b><div class="stack" style="gap:6px;margin-top:10px">${plan.map(p=>`<button class="mini" data-revise="${p.t.id}" style="width:100%;text-align:left"><span class="dot" style="background:${p.mem<.3?'var(--bad)':'var(--peachd)'}"></span><div style="flex:1;min-width:0"><div class="nm1">${esc(p.t.name)}</div><div class="muted" style="font-size:12px">${p.c.emoji} ${esc(p.c.code||p.c.name)} · ${p.seen?Math.round(p.mem*100)+'% remembered':'not started'}</div></div></button>`).join('')}</div>`:'<b style="font-weight:600">All topics fresh ✓</b><p class="muted" style="font-size:14px">Nothing fading right now. Nice.</p>'}</div>
 </div>`:''}
 </div>${rail}</div>`;
}

/* ---------- Schedule ---------- */
function renderSchedule(){
 osInit();
 const t=todayStr(),ws=view.week||weekStart(t),days=[...Array(7)].map((_,i)=>addDays(ws,i)),mode=view.smode||'week';
 const sel=view.sday&&days.includes(view.sday)?view.sday:(days.includes(t)?t:ws);
 const head=`<div class="row between" style="flex-wrap:wrap;gap:12px"><h1 style="margin:0">Schedule</h1>
  <div class="row" style="gap:8px;flex-wrap:wrap"><button class="btn" style="padding:12px 18px" data-act="newevent">${ICON.plus} Add</button><button class="btn light" style="padding:12px 18px" data-act="aiimport">✨ Paste timetable</button><button class="btn light" style="padding:12px 18px" data-act="calmenu">${ICON.cal} Calendars</button></div></div>
  <div class="row between" style="margin:18px 0 14px;flex-wrap:wrap;gap:10px">
   <div class="row" style="gap:6px"><button class="iconbtn sm" data-wk="-1" aria-label="Previous">‹</button><button class="pill" style="background:var(--card)" data-wk="0">Today</button><button class="iconbtn sm" data-wk="1" aria-label="Next">›</button><b style="font-weight:600;margin-left:6px">${mode==='month'?new Date(sel+'T12:00').toLocaleDateString('en-CA',{month:'long',year:'numeric'}):`${fmtDate(days[0])} – ${fmtDate(days[6])}`}</b></div>
   <div class="seg" style="min-width:200px"><button class="${mode==='week'?'on':''}" data-smode="week">Week</button><button class="${mode==='month'?'on':''}" data-smode="month">Month</button></div></div>`;
 if(mode==='month'){
  const d0=new Date(sel+'T12:00'),first=new Date(d0.getFullYear(),d0.getMonth(),1),start=(first.getDay()+6)%7,n=new Date(d0.getFullYear(),d0.getMonth()+1,0).getDate();
  let cells='';for(let i=0;i<start;i++)cells+='<div class="mcell o"></div>';
  for(let i=1;i<=n;i++){const ds=new Date(d0.getFullYear(),d0.getMonth(),i).toLocaleDateString('en-CA'),ev=eventsOn(ds);cells+=`<button class="mcell ${ds===t?'today':''}" data-sday="${ds}"><span class="mn">${i}</span>${ev.slice(0,3).map(e=>`<span class="mev c-${evColor(e)}">${esc(e.title)}</span>`).join('')}${ev.length>3?`<span class="muted" style="font-size:10px">+${ev.length-3} more</span>`:''}</button>`}
  return head+`<div class="card" style="padding:14px"><div class="mgrid">${WEEKDAYS.map(w=>`<div class="mh">${DAYNAME[w]}</div>`).join('')}${cells}</div></div>`;
 }
 // week grid (desktop/tablet)
 const all=days.map(d=>eventsOn(d)),timed=all.flat().filter(e=>e.start);
 let h0=8,h1=21;timed.forEach(e=>{h0=Math.min(h0,Math.floor(t2m(e.start)/60));h1=Math.max(h1,Math.ceil(t2m(e.end||e.start)/60)+(e.end?0:1))});h0=Math.max(0,h0);h1=Math.min(24,h1);
 const HH=52,nowM=new Date().getHours()*60+new Date().getMinutes();
 const col=(d,i)=>{const ev=all[i].filter(e=>e.start);const lanes=[];ev.forEach(e=>{const s=t2m(e.start),en=t2m(e.end)||s+60;let l=lanes.findIndex(x=>x<=s);if(l<0){l=lanes.length;lanes.push(en)}else lanes[l]=en;e._l=l});const L=Math.max(1,lanes.length);
  return `<div class="wcol ${d===t?'istoday':''}" data-newat="${d}">${ev.map(e=>{const s=t2m(e.start),en=t2m(e.end)||s+60;return `<button class="wev c-${evColor(e)} ${en-s<45?'short':''}" style="top:${(s-h0*60)/60*HH}px;height:${Math.max(26,(en-s)/60*HH-3)}px;left:calc(${e._l/L*100}% + 2px);width:calc(${100/L}% - 4px)" ${e.readonly?(e.course?`data-course="${e.course}"`:''):`data-editev="${e.id}"`} title="${esc(e.title)}"><b>${esc(e.title)}</b><span>${fmtTime(e.start)}${e.location?' · '+esc(e.location):''}</span></button>`}).join('')}${d===t&&nowM>=h0*60&&nowM<=h1*60?`<div class="nowline" style="top:${(nowM-h0*60)/60*HH}px"></div>`:''}</div>`};
 const allday=days.map((d,i)=>`<div class="adcell">${all[i].filter(e=>!e.start).map(e=>`<button class="adev c-${evColor(e)}" ${e.app?`data-editapp="${e.app}"`:e.course?`data-course="${e.course}"`:e.readonly?'':`data-editev="${e.id}"`}>${esc(e.title)}</button>`).join('')}</div>`).join('');
 const grid=`<div class="card weekcard desk"><div class="whead"><div></div>${days.map(d=>`<div class="wh ${d===t?'today':''}"><span>${DAYNAME[wdOf(d)]}</span><b>${+d.slice(8)}</b></div>`).join('')}</div>
  <div class="whead adrow"><div class="muted" style="font-size:11px;text-align:right;padding-right:8px">all day</div>${allday}</div>
  <div class="wbody" style="height:${(h1-h0)*HH}px"><div class="wtimes">${[...Array(h1-h0)].map((_,i)=>`<div style="height:${HH}px">${fmtTime(String(h0+i).padStart(2,'0')+':00')}</div>`).join('')}</div>${days.map(col).join('')}</div></div>`;
 // agenda (phone)
 const sev=eventsOn(sel);
 const agenda=`<div class="mob"><div class="daystrip">${days.map(d=>`<button class="dpill ${d===sel?'on':''} ${d===t?'today':''}" data-sday="${d}"><span>${DAYNAME[wdOf(d)]}</span><b>${+d.slice(8)}</b>${eventsOn(d).length?'<i></i>':''}</button>`).join('')}</div>
  <div class="agenda" style="margin-top:12px">${sev.length?sev.map(e=>`<div class="arow" ${e.readonly?(e.app?`data-editapp="${e.app}"`:e.course?`data-course="${e.course}"`:''):`data-editev="${e.id}"`}><div class="atime">${e.start?fmtTime(e.start):'All day'}${e.end?`<small>${fmtTime(e.end)}</small>`:''}</div><div class="abar c-${evColor(e)}"></div><div style="flex:1;min-width:0"><div class="nm1">${KIND[e.kind]?.e||''} ${esc(e.title)}</div><div class="muted" style="font-size:12px">${esc([e.location,e.calName].filter(Boolean).join(' · ')||KIND[e.kind]?.l||'')}</div></div></div>`).join(''):'<p class="muted" style="text-align:center;padding:20px">Nothing on this day.</p>'}</div></div>`;
 return head+grid+agenda+`<p class="hint" style="margin-top:12px">${S.settings.notify?'🔔 Reminders are on for this device.':'<button class="link" data-act="notifyon">🔔 Turn on reminders</button> to get a heads-up before each class, club or appointment.'} Want them on your phone even when Loop is closed? <button class="link" data-act="icsexport">Export to Outlook / Apple / Google Calendar</button>.</p>`;
}

/* ---------- event editor ---------- */
function openEventEditor(id,preset={}){
 osInit();const e=S.events.find(x=>x.id===(id||preset.id))||null;
 const d=id?clone(e):preset.id?clone(preset):{id:uid('ev_'),kind:'class',title:'',location:'',days:[],date:todayStr(),start:'10:30',end:'11:30',startDate:todayStr(),endDate:'',remind:15,notes:'',...preset};
 d.days=d.days||[];
 const rep=!!(d.days&&d.days.length);
 modal(`<div class="row between"><h2 style="margin:0">${e?'Edit':'New'} ${esc(KIND[d.kind]?.l.toLowerCase()||'event')}</h2><button class="iconbtn sm" data-act="closemodal" aria-label="Close">${ICON.x}</button></div>
 <div class="kindrow">${Object.entries(KIND).map(([k,v])=>`<button class="kchip c-${v.c} ${d.kind===k?'on':''}" data-evkind="${k}">${v.e} ${v.l}</button>`).join('')}</div>
 <label class="lbl" for="evt">Title</label><input class="field sm" id="evt" value="${esc(d.title)}" placeholder="e.g. MOS 1021 Lecture">
 <label class="lbl" for="evl">Location</label><input class="field sm" id="evl" value="${esc(d.location||'')}" placeholder="e.g. NCB 101">
 <div class="seg" style="margin-top:14px;background:var(--bg)"><button class="${rep?'':'on'}" data-evrep="0">One time</button><button class="${rep?'on':''}" data-evrep="1">Repeats weekly</button></div>
 <div id="evrep">${rep?`<div class="lbl">Days</div><div class="row" style="gap:6px;flex-wrap:wrap">${WEEKDAYS.map(w=>`<button class="pill daychip ${d.days.includes(w)?'on':''}" style="background:${d.days.includes(w)?'':'var(--bg)'}" data-evday="${w}">${DAYNAME[w]}</button>`).join('')}</div>
   <div class="grid2" style="grid-template-columns:1fr 1fr"><div><label class="lbl" for="evsd">From</label><input class="field sm" type="date" id="evsd" value="${d.startDate||todayStr()}"></div><div><label class="lbl" for="eved">Until</label><input class="field sm" type="date" id="eved" value="${d.endDate||''}"></div></div>`
  :`<label class="lbl" for="evd">Date</label><input class="field sm" type="date" id="evd" value="${d.date||todayStr()}">`}</div>
 <div class="grid2" style="grid-template-columns:1fr 1fr"><div><label class="lbl" for="evs">Starts</label><input class="field sm" type="time" id="evs" value="${d.start||''}"></div><div><label class="lbl" for="eve">Ends</label><input class="field sm" type="time" id="eve" value="${d.end||''}"></div></div>
 <label class="lbl" for="evr">Remind me</label><select class="field sm" id="evr">${[[-1,'No reminder'],[0,'At start'],[5,'5 min before'],[10,'10 min before'],[15,'15 min before'],[30,'30 min before'],[60,'1 hour before'],[1440,'1 day before']].map(([v,l])=>`<option value="${v}" ${+d.remind===v?'selected':''}>${l}</option>`).join('')}</select>
 <label class="lbl" for="evn">Notes</label><input class="field sm" id="evn" value="${esc(d.notes||'')}" placeholder="Optional">
 <div class="err" id="everr"></div>
 <div class="row" style="gap:8px;margin-top:6px">${e?`<button class="btn light" style="background:var(--bg);color:var(--bad)" data-act="delevent">Delete</button>`:''}<button class="btn full" data-act="saveevent">Save</button></div>`);
 view.evDraft=d;
}
function readEvDraft(){const d=view.evDraft;if(!d)return;const g=id=>$('#'+id);d.title=g('evt')?.value.trim()??d.title;d.location=g('evl')?.value.trim()??d.location;d.start=g('evs')?.value||'';d.end=g('eve')?.value||'';d.remind=+(g('evr')?.value??15);d.notes=g('evn')?.value.trim()||'';if(g('evd'))d.date=g('evd').value;if(g('evsd'))d.startDate=g('evsd').value;if(g('eved'))d.endDate=g('eved').value}
function saveEvent(){
 readEvDraft();const d=view.evDraft,err=$('#everr');
 if(!d.title)return err.textContent='Give it a title.';
 if(d.days&&d.days.length){d.date=null}else{d.days=[];if(!d.date)return err.textContent='Pick a date.'}
 if(d.start&&d.end&&t2m(d.end)<=t2m(d.start))return err.textContent='End time should be after the start time.';
 const i=S.events.findIndex(x=>x.id===d.id);if(i>=0)S.events[i]=d;else S.events.push(d);
 save();closeModal();view.evDraft=null;render();toast('Saved to your schedule');
}

/* ---------- reminders ---------- */
function notify(title,body){
 toast(title);
 if(!('Notification'in window)||Notification.permission!=='granted')return;
 const opt={body,icon:'/icon-192.png',badge:'/icon-192.png',tag:title};
 if(navigator.serviceWorker?.controller)navigator.serviceWorker.ready.then(r=>r.showNotification(title,opt)).catch(()=>{try{new Notification(title,opt)}catch{}});
 else try{new Notification(title,opt)}catch{}
}
async function enableNotify(){
 if(!('Notification'in window)){toast('This browser can\'t show notifications. Use the calendar export instead.');return}
 const p=await Notification.requestPermission();
 if(p==='granted'){S.settings.notify=true;save();render();notify('Reminders are on 🔔','Loop will ping you before classes, clubs and appointments while it\'s open.')}
 else toast('Notifications were blocked. You can allow them in your browser settings.');
}
function notifTick(){
 if(!S.settings?.notify||!S.setup||pushHere())return; // push handles it when on for this device
 const now=new Date(),d=todayStr(),fired=store.get('loop-fired',{}),nm=now.getHours()*60+now.getMinutes();
 eventsOn(d).forEach(e=>{if(!e.start)return;const r=e.remind==null?15:+e.remind;if(r<0||r>=1440)return;const diff=t2m(e.start)-nm,key=d+'|'+e.id;
  if(diff<=r&&diff>=-1&&!fired[key]){fired[key]=1;notify(`${KIND[e.kind]?.e||''} ${e.title} ${diff<=0?'is starting':`in ${diff} min`}`,[fmtTime(e.start),e.location].filter(Boolean).join(' · '))}});
 const tm=addDays(d,1);eventsOn(tm).forEach(e=>{if(+e.remind===1440&&nm>=18*60){const key=tm+'|'+e.id+'|day';if(!fired[key]){fired[key]=1;notify(`Tomorrow: ${e.title}`,[fmtTime(e.start),e.location].filter(Boolean).join(' · '))}}});
 if(nm>=8*60&&!fired['digest'+d]){fired['digest'+d]=1;const big=[...eventsOn(d),...eventsOn(tm)].filter(e=>e.kind==='exam'||e.kind==='deadline');if(big.length)notify(`📅 ${big.length} exam${big.length>1?'s':''}/deadline${big.length>1?'s':''} today or tomorrow`,big.map(e=>e.title).slice(0,3).join(' · '))}
 Object.keys(fired).forEach(k=>{if(k.slice(0,10)<addDays(d,-3)&&!k.startsWith('digest'))delete fired[k]});
 store.set('loop-fired',fired);
}

/* ---------- Web Push (reminders when Loop is closed) ---------- */
const PUSHDEF={on:false,classes:true,deadlines:true,study:true,quietStart:'22:00',quietEnd:'08:00',studyTime:'18:00'};
const pushPrefs=()=>Object.assign({},PUSHDEF,S.settings.push||{});
const pushSupported=()=>'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window;
const isStandalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;
const isiOS=()=>/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
const b64uToBytes=s=>{const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))};
const pushHere=()=>!!store.get('loop-push-on',false);
async function enablePush(){
 if(!user){toast('Sign in first so reminders can reach you when Loop is closed');return}
 if(!pushSupported()){toast(isiOS()&&!isStandalone()?'On iPhone/iPad: add Loop to your Home Screen first, then turn this on from there':'This browser doesn\'t support push notifications');return}
 try{
  const perm=await Notification.requestPermission();if(perm!=='granted'){toast('Notifications were blocked. You can allow them in your browser settings.');return}
  const {data,error}=await sb.functions.invoke('loop-push',{body:{action:'key'}});if(error||!data?.publicKey)throw new Error('Couldn\'t reach Loop\'s notification server');
  const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToBytes(data.publicKey)});
  const j=sub.toJSON();
  const {error:e2}=await sb.from('loop_push_subs').upsert({user_id:user.id,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth,tz:Intl.DateTimeFormat().resolvedOptions().timeZone},{onConflict:'endpoint'});
  if(e2)throw new Error(e2.message);
  S.settings.push=Object.assign(pushPrefs(),{on:true});S.settings.notify=true;store.set('loop-push-on',true);save();render();
  await sb.functions.invoke('loop-push',{body:{action:'test'}}).catch(()=>{});
  toast('Push reminders are on for this device 🔔');
 }catch(err){toast(err.message||'Couldn\'t turn on push reminders')}
}
async function refreshPush(){ // keep this device's subscription alive (browsers can rotate it)
 if(!pushHere()||!user||!pushSupported()||Notification.permission!=='granted')return;
 try{const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(!sub){const {data}=await sb.functions.invoke('loop-push',{body:{action:'key'}});if(!data?.publicKey)return;sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToBytes(data.publicKey)})}
  const j=sub.toJSON();await sb.from('loop_push_subs').upsert({user_id:user.id,endpoint:j.endpoint,p256dh:j.keys.p256dh,auth:j.keys.auth,tz:Intl.DateTimeFormat().resolvedOptions().timeZone},{onConflict:'endpoint'})}catch{}
}
async function disablePush(){
 try{const reg=await navigator.serviceWorker?.ready;const sub=await reg?.pushManager?.getSubscription();if(sub){const ep=sub.endpoint;await sub.unsubscribe();if(user)await sb.from('loop_push_subs').delete().eq('endpoint',ep)}}catch{}
 store.set('loop-push-on',false);render();toast('Push reminders are off on this device');
}
function pushCard(){
 const P=pushPrefs(),on=pushHere();
 const note=!pushSupported()?(isiOS()&&!isStandalone()?'On iPhone/iPad, add Loop to your Home Screen (Share → Add to Home Screen), then turn this on there.':'This browser can\'t receive push notifications.'):!user?'Sign in to get reminders even when Loop is closed.':on?'On for this device. Loop will remind you even when it\'s closed.':'Get reminders even when Loop is closed.';
 return `<div class="topic" style="flex-wrap:wrap"><div style="flex:1;min-width:160px"><div class="nm">Push reminders</div><div class="muted" style="font-size:12px">${note}</div></div><button class="switch ${on?'on':''}" role="switch" aria-checked="${on}" data-act="${on?'pushoff':'pushon'}" aria-label="Push reminders" ${pushSupported()&&user?'':'disabled'}></button></div>
 ${on?`<div class="card pushprefs"><div class="lbl" style="margin-top:0">Remind me about</div><div class="chips">${[['classes','📚 Classes, clubs & appointments'],['deadlines','📅 Exams & deadlines'],['study','🧠 Reviews that are due']].map(([k,l])=>`<button class="pill ${P[k]?'on':''}" data-pushcat="${k}">${l}</button>`).join('')}</div>
  <div class="grid2" style="grid-template-columns:1fr 1fr 1fr;gap:8px;margin-top:10px"><label class="lbl" style="margin:0">Quiet from<input class="field sm" type="time" data-pushtime="quietStart" value="${P.quietStart}"></label><label class="lbl" style="margin:0">Quiet until<input class="field sm" type="time" data-pushtime="quietEnd" value="${P.quietEnd}"></label><label class="lbl" style="margin:0">Study nudge<input class="field sm" type="time" data-pushtime="studyTime" value="${P.studyTime}"></label></div>
  <p class="hint" style="margin:10px 0 0">No notifications during quiet hours. Calendars you subscribed to by link only remind you while Loop is open.</p></div>`:''}`;
}

/* ---------- .ics export (Outlook / Apple / Google) ---------- */
function icsExport(){
 osInit();const L=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//Loop//University OS//EN','CALSCALE:GREGORIAN','X-WR-CALNAME:Loop'];
 const icsEsc=s=>String(s||'').replace(/\\/g,'\\\\').replace(/[,;]/g,m=>'\\'+m).replace(/\n/g,'\\n');
 const dt=(d,t)=>d.replace(/-/g,'')+(t?'T'+t.replace(':','')+'00':'');
 const stamp=new Date().toISOString().replace(/[-:]/g,'').slice(0,15)+'Z';
 const alarm=r=>r==null||r<0?[]:['BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Reminder',`TRIGGER:-PT${Math.max(0,r)}M`,'END:VALARM'];
 S.events.forEach(e=>{
  let first=e.date;
  if(e.days&&e.days.length){first=e.startDate||todayStr();for(let i=0;i<7&&!e.days.includes(wdOf(first));i++)first=addDays(first,1)}
  if(!first)return;
  L.push('BEGIN:VEVENT',`UID:${e.id}@loop`,`DTSTAMP:${stamp}`,`SUMMARY:${icsEsc(e.title)}`);
  if(e.start){L.push(`DTSTART:${dt(first,e.start)}`,`DTEND:${dt(first,e.end||fmtPlus(e.start,60))}`)}else{L.push(`DTSTART;VALUE=DATE:${dt(first)}`,`DTEND;VALUE=DATE:${dt(addDays(first,1))}`)}
  if(e.days&&e.days.length)L.push(`RRULE:FREQ=WEEKLY;BYDAY=${e.days.join(',')}${e.endDate?`;UNTIL=${dt(e.endDate)}T235959`:''}`);
  if(e.location)L.push(`LOCATION:${icsEsc(e.location)}`);if(e.notes)L.push(`DESCRIPTION:${icsEsc(e.notes)}`);
  L.push(...alarm(e.remind==null?15:+e.remind),'END:VEVENT');
 });
 S.courses.forEach(c=>(c.exams||[]).forEach(x=>{L.push('BEGIN:VEVENT',`UID:${c.id}-${x.date}-${encodeURIComponent(x.name)}@loop`,`DTSTAMP:${stamp}`,`SUMMARY:${icsEsc((c.code||c.name)+' · '+x.name)}`,`DTSTART;VALUE=DATE:${dt(x.date)}`,`DTEND;VALUE=DATE:${dt(addDays(x.date,1))}`,'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Exam tomorrow','TRIGGER:-P1D','END:VALARM','END:VEVENT')}));
 S.apps.filter(a=>a.deadline).forEach(a=>{L.push('BEGIN:VEVENT',`UID:${a.id}@loop`,`DTSTAMP:${stamp}`,`SUMMARY:${icsEsc('Deadline: '+a.org+(a.role?' · '+a.role:''))}`,`DTSTART;VALUE=DATE:${dt(a.deadline)}`,`DTEND;VALUE=DATE:${dt(addDays(a.deadline,1))}`,...(a.url?[`URL:${a.url}`]:[]),'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:Deadline in 2 days','TRIGGER:-P2D','END:VALARM','END:VEVENT')});
 L.push('END:VCALENDAR');
 const blob=new Blob([L.join('\r\n')],{type:'text/calendar'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='loop-schedule.ics';document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
 modal(`<h2 style="margin-top:0">Calendar file downloaded ✓</h2><p class="muted" style="font-size:14px;line-height:1.6">Open <b>loop-schedule.ics</b> to add everything, with reminders, to your calendar:</p><ul style="font-size:14px;line-height:1.7;padding-left:18px"><li><b>Outlook:</b> double-click the file, or in Outlook on the web go to Calendar → Add calendar → Upload from file.</li><li><b>Apple Calendar (Mac/iPhone):</b> open the file and choose a calendar.</li><li><b>Google Calendar:</b> Settings → Import &amp; export → Import.</li></ul><p class="hint">Your phone will then remind you even when Loop is closed. Re-export after big changes.</p><button class="btn full" data-act="closemodal">Got it</button>`);
}
function fmtPlus(t,m){const x=t2m(t)+m;return String(Math.floor(x/60)%24).padStart(2,'0')+':'+String(x%60).padStart(2,'0')}

/* ---------- .ics import (Outlook / Google / Apple / OWL calendar links) ---------- */
function parseICS(txt){
 const lines=txt.replace(/\r\n[ \t]/g,'').replace(/\n[ \t]/g,'').split(/\r?\n/),out=[];let cur=null;
 const unesc=s=>String(s||'').replace(/\\n/gi,' ').replace(/\\([,;\\])/g,'$1').trim();
 const pd=(v,params)=>{const m=String(v).match(/(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?/);if(!m)return null;
  if(m[4]&&m[7]){const x=new Date(Date.UTC(+m[1],m[2]-1,+m[3],+m[4],+m[5]));return {d:x.toLocaleDateString('en-CA'),t:String(x.getHours()).padStart(2,'0')+':'+String(x.getMinutes()).padStart(2,'0')}}
  return {d:`${m[1]}-${m[2]}-${m[3]}`,t:m[4]?`${m[4]}:${m[5]}`:null}};
 const lo=addDays(todayStr(),-45),hi=addDays(todayStr(),240);
 for(const ln of lines){
  if(ln==='BEGIN:VEVENT'){cur={};continue}
  if(ln==='END:VEVENT'){if(cur&&cur.DTSTART){const s=pd(cur.DTSTART),e=cur.DTEND?pd(cur.DTEND):null;const ev={id:'ics_'+(cur.UID||Math.random()).toString().slice(0,60)+'_'+(s&&s.d),title:unesc(cur.SUMMARY)||'(busy)',location:unesc(cur.LOCATION)||'',start:s.t,end:e&&e.t&&e.d===s.d?e.t:null,kind:/exam|midterm|final|quiz|test/i.test(cur.SUMMARY||'')?'exam':/due|deadline|submit/i.test(cur.SUMMARY||'')?'deadline':'other'};
    const rr=cur.RRULE||'';
    if(/FREQ=WEEKLY/.test(rr)){const by=(rr.match(/BYDAY=([^;]+)/)||[])[1];ev.days=by?by.split(',').map(x=>x.replace(/[^A-Z]/g,'')):[wdOf(s.d)];ev.startDate=s.d;const u=(rr.match(/UNTIL=(\d{8})/)||[])[1];if(u)ev.endDate=`${u.slice(0,4)}-${u.slice(4,6)}-${u.slice(6,8)}`;if(cur.EXDATE)ev.except=cur.EXDATE.split(',').map(x=>pd(x)?.d).filter(Boolean);if(!ev.endDate||ev.endDate>=lo)out.push(ev)}
    else if(/FREQ=DAILY/.test(rr)){ev.days=WEEKDAYS.slice();ev.startDate=s.d;const u=(rr.match(/UNTIL=(\d{8})/)||[])[1];if(u)ev.endDate=`${u.slice(0,4)}-${u.slice(4,6)}-${u.slice(6,8)}`;out.push(ev)}
    else{ev.date=s.d;if(s.d>=lo&&s.d<=hi)out.push(ev)}}
   cur=null;continue}
  if(!cur)continue;const i=ln.indexOf(':');if(i<0)continue;const key=ln.slice(0,i).split(';')[0].toUpperCase(),val=ln.slice(i+1);
  if(key==='EXDATE')cur.EXDATE=(cur.EXDATE?cur.EXDATE+',':'')+val;else if(!(key in cur))cur[key]=val;
 }
 return out.slice(0,2500);
}
async function proxyFetch(url){
 const {data,error}=await sb.functions.invoke('loop-fetch',{body:{url}});
 if(error){let m='Couldn\'t load that link.';try{m=(await error.context.json()).error||m}catch{}throw new Error(m)}
 return data.text;
}
async function refreshCals(force){
 osInit();if(!user)return;let changed=false;
 for(const c of S.cals){const cached=ICS[c.url];if(!force&&cached&&Date.now()-cached.at<6*3600e3)continue;
  try{const txt=await proxyFetch(c.url);ICS[c.url]={at:Date.now(),events:parseICS(txt)};changed=true}catch(e){c.err=e.message}}
 if(changed){store.set('loop-ics',ICS);if(!Q&&!$('#modal'))render()}
}
function calMenu(){
 osInit();
 modal(`<div class="row between"><h2 style="margin:0">Calendars</h2><button class="iconbtn sm" data-act="closemodal" aria-label="Close">${ICON.x}</button></div>
 <p class="muted" style="font-size:14px">Bring in Outlook, Google, Apple or your OWL Brightspace calendar, or send Loop's schedule out to them.</p>
 ${S.cals.length?`<div class="stack" style="gap:8px;margin:10px 0">${S.cals.map((c,i)=>`<div class="mini"><span class="dot c-${c.color||'sky'}"></span><div style="flex:1;min-width:0"><div class="nm1">${esc(c.name)}</div><div class="muted" style="font-size:12px">${c.err?'⚠️ '+esc(c.err):ICS[c.url]?`${ICS[c.url].events.length} events · synced ${Math.round((Date.now()-ICS[c.url].at)/60000)} min ago`:'Not synced yet'}</div></div><button class="iconbtn sm" data-delcal="${i}" aria-label="Remove calendar">${ICON.x}</button></div>`).join('')}</div><button class="btn light" style="background:var(--bg);width:100%" data-act="synccals">↻ Sync now</button>`:''}
 <h2 style="font-size:17px">Subscribe to a calendar</h2>
 ${user?`<input class="field sm" id="caln" placeholder="Name, e.g. Outlook" style="margin-bottom:8px"><input class="field sm" id="calu" placeholder="https://… or webcal://… calendar link (.ics)"><div class="err" id="calerr"></div><button class="btn full" data-act="addcal">Add calendar</button>
 <details class="howto"><summary>Where do I find the link?</summary><ul><li><b>Outlook (school or personal):</b> Outlook on the web → ⚙️ Settings → Calendar → Shared calendars → <i>Publish a calendar</i> → pick a calendar → copy the <b>ICS</b> link.</li><li><b>Google Calendar:</b> Settings → your calendar → <i>Secret address in iCal format</i>.</li><li><b>Apple iCloud:</b> Calendar app → share icon next to a calendar → <i>Public Calendar</i> → copy link.</li><li><b>OWL Brightspace:</b> Calendar → <i>Subscribe</i> → copy the link (shows due dates and course events).</li></ul></details>`:`<p class="muted" style="font-size:14px">Sign in to sync outside calendars.</p><button class="btn full" data-act="toauth">Create account</button>`}
 <h2 style="font-size:17px">Send Loop to your calendar</h2>
 <button class="btn light full" style="background:var(--bg)" data-act="icsexport">⬇️ Export .ics for Outlook / Apple / Google</button>`);
}

/* ---------- AI timetable import ---------- */
function aiImport(){
 modal(`<div class="row between"><h2 style="margin:0">✨ Paste your timetable</h2><button class="iconbtn sm" data-act="closemodal" aria-label="Close">${ICON.x}</button></div>
 <p class="muted" style="font-size:14px">Paste anything: your class schedule from Student Center, a syllabus, club meeting times, an email about an appointment. Loopy turns it into calendar events you can review.</p>
 <textarea class="field" id="aitxt" placeholder="MOS 1021A  LEC  Tu Th 4:30PM-6:00PM  NCB 101  Sep 8 - Dec 9&#10;MATH 1228A  Mon Wed Fri 10:30-11:20  MC 110&#10;Finance club meets Wednesdays 6-7pm in UCC 56"></textarea>
 <div class="err" id="aierr"></div>
 <button class="btn full" id="aigo" data-act="aiparse">${user?'Build my schedule':'Sign in to use AI'}</button>`);
}
async function aiParse(){
 const txt=$('#aitxt').value.trim(),err=$('#aierr'),b=$('#aigo');if(!user){closeModal();view.authMode='up';return renderAuth()}
 if(txt.length<10)return err.textContent='Paste a bit more text.';
 b.disabled=true;b.textContent='Loopy is reading…';err.textContent='';
 try{
  const r=await callAI({mode:'parse',messages:[{role:'user',content:txt}]});
  const m=r.text.match(/\{[\s\S]*\}/);const items=(JSON.parse(m?m[0]:r.text).items||[]).filter(x=>x&&x.title);
  if(!items.length)throw new Error('Loopy couldn\'t find any events in that text.');
  view.aiItems=items.map(x=>({id:uid('ev_'),kind:KIND[x.kind]?x.kind:'other',title:x.title,location:x.location||'',days:(x.days||[]).filter(d=>WEEKDAYS.includes(d)),date:x.date||null,start:x.start||null,end:x.end||null,startDate:x.startDate||(x.days?.length?todayStr():null),endDate:x.endDate||'',remind:15,notes:x.notes||''}));
  modal(`<h2 style="margin-top:0">Found ${view.aiItems.length} item${view.aiItems.length>1?'s':''}</h2><p class="muted" style="font-size:14px">Untick anything you don't want, then add.</p>
   <div class="stack" style="gap:6px;max-height:50vh;overflow:auto">${view.aiItems.map((e,i)=>`<label class="mini" style="cursor:pointer"><input type="checkbox" checked data-aipick="${i}" style="width:18px;height:18px"><span class="dot c-${evColor(e)}"></span><div style="flex:1;min-width:0"><div class="nm1">${KIND[e.kind].e} ${esc(e.title)}</div><div class="muted" style="font-size:12px">${e.days.length?e.days.map(d=>DAYNAME[d]).join(', '):e.date?fmtDate(e.date):''} ${e.start?'· '+fmtTime(e.start)+(e.end?'–'+fmtTime(e.end):''):''}${e.location?' · '+esc(e.location):''}</div></div></label>`).join('')}</div>
   <button class="btn full" style="margin-top:14px" data-act="aiadd">Add to my schedule</button>`);
 }catch(e){err.textContent=e.message;b.disabled=false;b.textContent='Try again'}
}

/* ---------- Life: clubs, applications, news ---------- */
function nextMeeting(club){
 const evs=S.events.filter(e=>e.clubId===club.id);const t=todayStr();
 for(let i=0;i<21;i++){const d=addDays(t,i);const e=evs.find(x=>occursOn(x,d));if(e)return {d,e}}return null;
}
function renderLife(){
 osInit();
 const t=todayStr(),news=store.get('loop-news',{}).items||[];
 const appsBy=k=>S.apps.filter(a=>(a.status||'saved')===k).sort((a,b)=>(a.deadline||'9').localeCompare(b.deadline||'9'));
 return `<div class="row between" style="flex-wrap:wrap;gap:12px"><h1 style="margin:0">Life &amp; Career</h1><button class="btn" data-act="ask" style="padding:12px 20px">${MASCOT(26,'happy',false)} Find opportunities</button></div>
 <h2>Clubs <span class="muted" style="font-size:14px;font-weight:500">· ${S.clubs.length}</span></h2>
 <div class="clubgrid">${S.clubs.map(c=>{const nm=nextMeeting(c);return `<button class="ccard c-${c.color||'mint'}" data-editclub="${c.id}" style="text-align:left"><div class="row between"><div class="glyph">${c.emoji||'🎭'}</div><span class="chip">${esc({member:'Member',exec:'Exec',interested:'Interested',applied:'Applied'}[c.status]||'Member')}</span></div><div style="font-size:18px;font-weight:600;margin:12px 0 4px">${esc(c.name)}</div><div style="font-size:13px;opacity:.8">${c.role?esc(c.role)+' · ':''}${nm?`Next: ${dayDiff(nm.d,t)===0?'today':dayDiff(nm.d,t)===1?'tomorrow':fmtDate(nm.d,{weekday:'short'})} ${fmtTime(nm.e.start)}${nm.e.location?' · '+esc(nm.e.location):''}`:'No meetings set'}</div></button>`}).join('')}
  <button class="ccard addcard" data-act="newclub">${ICON.plus}<span>Add a club</span></button></div>
 <div class="row between" style="margin-top:28px"><h2 style="margin:0">Applications</h2><button class="btn light" style="padding:10px 16px;font-size:14px" data-act="newapp">${ICON.plus} Track one</button></div>
 <p class="muted" style="font-size:13px;margin:6px 0 12px">Clubs, jobs, internships, scholarships, case comps: everything you're applying to, in one place.</p>
 <div class="board">${APPSTAGES.map(([k,l])=>`<div class="bcol"><div class="bhead">${l} <b>${appsBy(k).length}</b></div>${appsBy(k).map(a=>{const dd=a.deadline?dayDiff(a.deadline,t):null;return `<button class="bcard" data-editapp="${a.id}"><div class="row between" style="gap:6px"><span class="tag soon">${esc(APPTYPES[a.type]||'Other')}</span>${dd!=null&&k==='saved'?`<span class="tag ${dd<0?'soon':dd<=3?'behind':'new'}">${dd<0?'passed':dd===0?'today':dd+'d'}</span>`:''}</div><div class="nm1" style="margin-top:8px">${esc(a.org)}</div>${a.role?`<div class="muted" style="font-size:12px">${esc(a.role)}</div>`:''}</button>`}).join('')||'<div class="bempty">—</div>'}</div>`).join('')}</div>
 <div class="row between" style="margin-top:28px"><h2 style="margin:0">${esc(S.uni||'Campus')} news</h2><button class="link" style="font-size:14px" data-act="feeds">Sources</button></div>
 <div class="newsgrid" style="margin-top:12px">${news.length?news.slice(0,9).map(n=>`<a class="card newscard" href="${esc(n.link)}" target="_blank" rel="noopener"><div class="muted" style="font-size:12px">${esc(n.src||'')}${n.when?' · '+esc(n.when):''}</div><div style="font-weight:600;margin:6px 0;line-height:1.35">${esc(n.title)}</div>${n.desc?`<div class="muted" style="font-size:13px;line-height:1.5">${esc(n.desc.slice(0,140))}${n.desc.length>140?'…':''}</div>`:''}</a>`).join(''):`<p class="muted">${user?'Loading news…':'Sign in to load campus news.'}</p>`}</div>`;
}
const CLUBCOLORS=['mint','lav','peach','sky','lemon'];
function openClubEditor(id){
 osInit();const c=id?S.clubs.find(x=>x.id===id):null,ev=c?S.events.find(e=>e.clubId===c.id):null;
 const d=c?clone(c):{id:uid('cl_'),name:'',emoji:'🎭',status:'member',role:'',url:'',notes:'',color:CLUBCOLORS[S.clubs.length%5]};
 view.clubDraft={...d,days:ev?.days?.slice()||[],start:ev?.start||'18:00',end:ev?.end||'19:00',location:ev?.location||''};
 const D=view.clubDraft;
 modal(`<div class="row between"><h2 style="margin:0">${c?'Edit club':'New club'}</h2><button class="iconbtn sm" data-act="closemodal" aria-label="Close">${ICON.x}</button></div>
 <label class="lbl" for="cln">Club name</label><input class="field sm" id="cln" value="${esc(D.name)}" placeholder="e.g. Western Finance Association">
 <div class="lbl">Icon</div><div class="swatches">${['🎭','💼','📈','⚽','🎨','🎵','🤝','🧪','💻','🌍','🏀','📸','🙏','🗳️'].map(e=>`<button class="sw ${D.emoji===e?'on':''}" style="background:var(--bg)" data-clemoji="${e}">${e}</button>`).join('')}</div>
 <div class="grid2" style="grid-template-columns:1fr 1fr"><div><label class="lbl" for="cls">Status</label><select class="field sm" id="cls">${[['member','Member'],['exec','Exec'],['interested','Interested'],['applied','Applied']].map(([k,l])=>`<option value="${k}" ${D.status===k?'selected':''}>${l}</option>`).join('')}</select></div><div><label class="lbl" for="clr">Your role</label><input class="field sm" id="clr" value="${esc(D.role||'')}" placeholder="e.g. VP Events"></div></div>
 <div class="lbl">Meets every</div><div class="row" style="gap:6px;flex-wrap:wrap">${WEEKDAYS.map(w=>`<button class="pill ${D.days.includes(w)?'on':''}" style="background:${D.days.includes(w)?'':'var(--bg)'}" data-clday="${w}">${DAYNAME[w]}</button>`).join('')}</div>
 <div class="grid2" style="grid-template-columns:1fr 1fr 1.3fr"><div><label class="lbl" for="clst">From</label><input class="field sm" type="time" id="clst" value="${D.start}"></div><div><label class="lbl" for="clen">To</label><input class="field sm" type="time" id="clen" value="${D.end}"></div><div><label class="lbl" for="cll">Where</label><input class="field sm" id="cll" value="${esc(D.location)}" placeholder="UCC 56"></div></div>
 <label class="lbl" for="clu">Link</label><input class="field sm" id="clu" value="${esc(D.url||'')}" placeholder="Instagram, website or Western Connect page">
 <label class="lbl" for="clno">Notes</label><input class="field sm" id="clno" value="${esc(D.notes||'')}" placeholder="Optional">
 <div class="row" style="gap:8px;margin-top:16px">${c?`<button class="btn light" style="background:var(--bg);color:var(--bad)" data-act="delclub">Delete</button>`:''}<button class="btn full" data-act="saveclub">Save</button></div>`);
}
function readClub(){const D=view.clubDraft,g=id=>$('#'+id)?.value;if(!D)return;D.name=(g('cln')??D.name).trim();D.status=g('cls')||D.status;D.role=(g('clr')??'').trim();D.start=g('clst')||D.start;D.end=g('clen')||D.end;D.location=(g('cll')??'').trim();D.url=(g('clu')??'').trim();D.notes=(g('clno')??'').trim()}
function saveClub(){
 readClub();const D=view.clubDraft;if(!D.name)return toast('Add the club name');
 const {days,start,end,location,...club}=D;const i=S.clubs.findIndex(c=>c.id===club.id);if(i>=0)S.clubs[i]=club;else S.clubs.push(club);
 S.events=S.events.filter(e=>e.clubId!==club.id);
 if(days.length)S.events.push({id:uid('ev_'),clubId:club.id,kind:'club',title:club.name,location,days,start,end,startDate:todayStr(),endDate:'',remind:30});
 save();closeModal();render();toast('Club saved');
}
function openAppEditor(id){
 osInit();const a=id?S.apps.find(x=>x.id===id):null;
 const d=a?clone(a):{id:uid('ap_'),type:'internship',org:'',role:'',status:'saved',deadline:'',url:'',notes:''};view.appDraft=d;
 modal(`<div class="row between"><h2 style="margin:0">${a?'Edit application':'Track an application'}</h2><button class="iconbtn sm" data-act="closemodal" aria-label="Close">${ICON.x}</button></div>
 <div class="kindrow">${Object.entries(APPTYPES).map(([k,l])=>`<button class="kchip ${d.type===k?'on':''}" style="background:var(--bg)" data-apptype="${k}">${l}</button>`).join('')}</div>
 <div class="grid2" style="grid-template-columns:1fr 1fr"><div><label class="lbl" for="apo">Organization</label><input class="field sm" id="apo" value="${esc(d.org)}" placeholder="e.g. RBC, Ivey Case Club"></div><div><label class="lbl" for="apr">Role / program</label><input class="field sm" id="apr" value="${esc(d.role||'')}" placeholder="e.g. Summer Analyst"></div></div>
 <div class="grid2" style="grid-template-columns:1fr 1fr"><div><label class="lbl" for="aps">Stage</label><select class="field sm" id="aps">${APPSTAGES.map(([k,l])=>`<option value="${k}" ${d.status===k?'selected':''}>${l}</option>`).join('')}</select></div><div><label class="lbl" for="apd">Deadline</label><input class="field sm" type="date" id="apd" value="${d.deadline||''}"></div></div>
 <label class="lbl" for="apu">Link</label><input class="field sm" id="apu" value="${esc(d.url||'')}" placeholder="Posting URL">
 <label class="lbl" for="apn">Notes</label><input class="field sm" id="apn" value="${esc(d.notes||'')}" placeholder="Contacts, requirements, interview dates…">
 ${d.url?`<a class="link" style="display:inline-block;margin-top:10px;font-size:14px" href="${esc(d.url)}" target="_blank" rel="noopener">Open posting ↗</a>`:''}
 <div class="row" style="gap:8px;margin-top:16px">${a?`<button class="btn light" style="background:var(--bg);color:var(--bad)" data-act="delapp">Delete</button>`:''}<button class="btn full" data-act="saveapp">Save</button></div>`);
}
function saveApp(){
 const d=view.appDraft,g=id=>$('#'+id)?.value??'';d.org=g('apo').trim();d.role=g('apr').trim();d.status=g('aps')||'saved';d.deadline=g('apd');d.url=g('apu').trim();d.notes=g('apn').trim();
 if(!d.org)return toast('Add the organization');
 const i=S.apps.findIndex(x=>x.id===d.id);if(i>=0)S.apps[i]=d;else S.apps.push(d);
 save();closeModal();render();toast(d.status==='offer'?'Congrats! 🎉':'Saved');if(d.status==='offer')confetti();
}
function defaultFeeds(){
 if(/western|uwo/i.test(S.uni||''))return [{name:'Western News',url:'https://news.westernu.ca/feed/'}];
 if(S.uni)return [{name:`${S.uni} in the news`,url:`https://news.google.com/rss/search?q=${encodeURIComponent('"'+S.uni+'"')}&hl=en-CA&gl=CA&ceid=CA:en`}];
 return [];
}
async function refreshNews(force){
 osInit();if(!user)return;const c=store.get('loop-news',{});
 if(!force&&c.at&&Date.now()-c.at<3*3600e3&&c.uni===S.uni)return;
 const feeds=S.feeds||defaultFeeds();const items=[];
 for(const f of feeds){try{const txt=await proxyFetch(f.url);const doc=new DOMParser().parseFromString(txt,'text/xml');
  doc.querySelectorAll('item, entry').forEach(it=>{const g=s=>it.querySelector(s)?.textContent?.trim()||'';const link=g('link')||it.querySelector('link')?.getAttribute('href')||'';const dt=new Date(g('pubDate')||g('updated')||g('published'));
   const desc=g('description').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
   items.push({title:g('title'),link,src:f.name,ts:+dt||0,when:isNaN(dt)?'':dt.toLocaleDateString('en-CA',{month:'short',day:'numeric'}),desc})})}catch(e){}}
 items.sort((a,b)=>b.ts-a.ts);store.set('loop-news',{at:Date.now(),uni:S.uni,items:items.slice(0,30)});
 if(!Q&&!$('#modal')&&(view.tab==='today'||view.tab==='life'))render();
}
function feedsMenu(){
 osInit();const feeds=S.feeds||defaultFeeds();
 modal(`<div class="row between"><h2 style="margin:0">News sources</h2><button class="iconbtn sm" data-act="closemodal" aria-label="Close">${ICON.x}</button></div>
 <div class="stack" style="gap:8px;margin:12px 0">${feeds.map((f,i)=>`<div class="mini"><div style="flex:1;min-width:0"><div class="nm1">${esc(f.name)}</div><div class="muted" style="font-size:11px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(f.url)}</div></div><button class="iconbtn sm" data-delfeed="${i}" aria-label="Remove">${ICON.x}</button></div>`).join('')||'<p class="muted">No sources.</p>'}</div>
 <input class="field sm" id="fdn" placeholder="Name, e.g. Student union" style="margin-bottom:8px"><input class="field sm" id="fdu" placeholder="RSS feed link"><button class="btn full" style="margin-top:10px" data-act="addfeed">Add source</button>
 <p class="hint">Tip: most university news sites and club blogs have an RSS feed (often ending in /feed).</p>`);
}

/* ---------- Ask Loopy (AI creature) ---------- */
function aiContext(){
 osInit();const t=todayStr();
 return {name:S.name,uni:S.uni,program:S.profile.program,year:S.profile.year,interests:S.profile.interests,goals:S.profile.goals,city:S.profile.city,tz:Intl.DateTimeFormat().resolvedOptions().timeZone,
  courses:S.courses.map(c=>{const s=courseStats(c),n=s.next;return {code:c.code,name:c.name,aiPolicy:{level:coursePolicy(c),note:c.ai?.note||''},knowledgePct:Math.round(s.know*100),topicsBehind:s.behind,nextExam:n?(r=>({name:n.name,date:n.date,goalPct:n.target||S.settings.target||80,readinessRange:r?`${r.lo}-${r.hi}%`:'unknown',readinessConfidence:r?r.conf:'Low'}))(readiness(c,n)):null}}),
  next7days:[...Array(7)].flatMap((_,i)=>{const d=addDays(t,i);return eventsOn(d).map(e=>`${d} ${e.start||'all-day'} ${e.title}${e.location?' @ '+e.location:''}`)}).slice(0,50),
  clubs:S.clubs.map(c=>({name:c.name,status:c.status,role:c.role})),
  applications:S.apps.map(a=>({org:a.org,role:a.role,type:a.type,stage:a.status,deadline:a.deadline})),
  studyStreakDays:streak(),fadingTopics:todayPlan().map(p=>p.t.name).slice(0,5)};
}
async function callAI(body){
 const {data:{session}}=await sb.auth.getSession();if(!session)throw new Error('Sign in to talk to Loopy.');
 const {data,error}=await sb.functions.invoke('loop-ai',{body:{context:aiContext(),...body}});
 if(error){let m='Loopy couldn\'t answer right now.',code='';try{const j=await error.context.json();m=j.message||j.error||m;code=j.error}catch{}const e=new Error(m);e.code=code;throw e}
 return data;
}
let chatBusy=false;
function mdLite(s){
 let h=esc(s);
 h=h.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,'<a href="$2" target="_blank" rel="noopener">$1</a>');
 h=h.replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g,'$1<a href="$2" target="_blank" rel="noopener">$2</a>');
 h=h.replace(/\*\*([^*]+)\*\*/g,'<b>$1</b>').replace(/(^|\n)#{1,4} ?([^\n]+)/g,'$1<b class="mh">$2</b>');
 const lines=h.split('\n');let out='',inL=false;
 for(const ln of lines){const m=ln.match(/^\s*(?:[-•*]|\d+[.)])\s+(.*)/);if(m){if(!inL){out+='<ul>';inL=true}out+=`<li>${m[1]}</li>`}else{if(inL){out+='</ul>';inL=false}out+=ln.trim()?`<p>${ln}</p>`:''}}
 return out+(inL?'</ul>':'');
}
const ASKS=[['🚀','Opportunities for me this month'],['🗓️','Plan my week around my classes'],['🎭','Which clubs fit my goals?'],['💼','Internships I should apply to'],['🧘','I feel overwhelmed. Help me prioritise'],['🏛️','Campus resources I\'m not using']];
function openChat(q){
 osInit();let el=$('#chat');
 if(!el){el=document.createElement('div');el.id='chat';el.className='chatwrap';el.setAttribute('role','dialog');el.setAttribute('aria-label','Ask Loopy');document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('open'));el.addEventListener('click',e=>{if(e.target===el)closeChat()})}
 drawChat();if(q)sendChat(q);else setTimeout(()=>$('#chatin')?.focus(),250);
}
function closeChat(){const el=$('#chat');if(!el)return;el.classList.remove('open');setTimeout(()=>el.remove(),250)}
function drawChat(){
 const el=$('#chat');if(!el)return;
 const msgs=S.chat;
 el.innerHTML=`<div class="chatpanel">
  <div class="chathead">${MASCOT(52,chatBusy?'think':'happy',false)}<div style="flex:1"><div style="font-weight:700;font-size:18px">Loopy</div><div class="muted" style="font-size:12px">${chatBusy?'Thinking…':'Your uni, life & career sidekick'}</div></div>
   ${msgs.length?`<button class="iconbtn sm" data-act="clearchat" aria-label="New chat" title="New chat">↺</button>`:''}<button class="iconbtn sm" data-act="closechat" aria-label="Close">${ICON.x}</button></div>
  ${modeChips()}
  <div class="chatbody" id="chatbody">
   ${!msgs.length?chatWelcome():''}${msgs.map((m,i)=>`<div class="bubble ${m.role}${m.report?' report':''}">${m.role==='assistant'?mdLite(m.content):esc(m.content)}${m.sources?.length?`<div class="srcs">${m.report?'<b style="font-size:11.5px;width:100%">Sources</b>':''}${m.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc((s.title||s.url).slice(0,60))}</a>`).join('')}</div>`:''}${reportActions(i)}${m.err?`<div style="margin-top:8px"><button class="link" data-act="retrychat">Try again</button></div>`:''}</div>`).join('')}
   ${msgs.length&&(S.chatMode||'find')==='research'&&!chatBusy?researchForm():''}
   ${chatBusy?'<div class="bubble assistant typing"><i></i><i></i><i></i></div>':''}
  </div>
  <form class="chatin" id="chatform" ${(S.chatMode||'find')==='research'?'style="display:none"':''}><textarea id="chatin" rows="1" placeholder="${user?({learn:'What do you want to learn?',explain:'What should I explain?',quiz:'Which course or topic?',plan:'What should we plan?',find:'Ask Loopy anything…',reflect:'How are things going?'}[S.chatMode||'find']||'Ask Loopy anything…'):'Sign in to chat with Loopy'}" ${user?'':'disabled'} aria-label="Message Loopy"></textarea><button class="btn" type="submit" ${chatBusy||!user?'disabled':''} aria-label="Send">${ICON.arrow}</button></form>
  ${user?'':`<div style="padding:0 16px 16px"><button class="btn full" data-act="toauthchat">Create a free account</button></div>`}
 </div>`;
 const b=$('#chatbody');b.scrollTop=(S.chatMode==='research'&&!msgs.length)?0:b.scrollHeight;
 const f=$('#chatform'),ta=$('#chatin');
 f.onsubmit=e=>{e.preventDefault();const v=ta.value.trim();if(v&&!chatBusy)sendChat(v)};
 ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();f.requestSubmit()}};
 ta.oninput=()=>{ta.style.height='auto';ta.style.height=Math.min(140,ta.scrollHeight)+'px'};
}
async function sendChat(text){
 if(!user){drawChat();return}
 S.chat=S.chat.filter(m=>!m.err);S.chat.push({role:'user',content:text});chatBusy=true;drawChat();
 const lm=S.chatMode&&S.chatMode!=='research'?S.chatMode:'find';
 try{const r=await callAI({mode:'chat',loopyMode:lm,messages:S.chat.filter(m=>!m.research&&!m.report).map(({role,content})=>({role,content}))});S.chat.push({role:'assistant',content:r.text||'…',sources:r.sources||[]});logAI('chat',{mode:lm,course:chatCourse(),ask:text,out:'reply',sources:(r.sources||[]).length})}
 catch(e){S.chat.push({role:'assistant',content:aiErrMsg(e),err:true})}
 chatBusy=false;S.chat=S.chat.slice(-30);save();drawChat();setTimeout(()=>$('#chatin')?.focus(),50);
}



/* ======================= Phase C/G/I: Loopy modes, hints, research, AI policy, receipts ======================= */
const LMODES=[
 ['learn','📘','Learn','Teach me step by step',['Teach me the topic I\'m weakest on','Walk me through my next exam\'s first topic']],
 ['explain','💡','Explain','Simple + an example',['Explain my most-missed concept simply','What\'s the difference between two ideas I keep mixing up?']],
 ['quiz','❓','Quiz me','One question at a time',['Quiz me on my fading topics','Quiz me for my next exam']],
 ['research','🔎','Research','Cited brief from real sources',[]],
 ['plan','🗓️','Plan','Around your real schedule',['Plan my week around my classes','Plan my study for my next exam']],
 ['find','🚀','Find','Opportunities & resources',ASKS.map(a=>a[1])],
 ['reflect','🌱','Reflect','A quick check-in',['How\'s my week going?','I feel overwhelmed. Help me prioritise']],
];
const LM=Object.fromEntries(LMODES.map(([k,e,l,s,a])=>[k,{e,l,s,a}]));
const AIPOL=[['open','Study help','Loopy can explain, quiz and research'],['tutor','Tutor only','Hints and questions, never answers you could submit'],['off','Off','No AI content help for this course']];
const coursePolicy=c=>(c&&c.ai&&c.ai.level)||'open';
const aiAllowedFor=c=>coursePolicy(c)!=='off';
function chatCourse(){return S.courses.find(c=>c.id===view.course)||(Q&&Q.list[Q.i]&&TOPIC[Q.list[Q.i].t]?.course)||null}
function logAI(kind,detail){S.aiLog=S.aiLog||[];const c=detail.course||null;S.aiLog.push({ts:Date.now(),kind,mode:detail.mode||null,course:c?(c.code||c.name):null,policy:c?coursePolicy(c):null,ask:String(detail.ask||'').slice(0,240),out:detail.out||'',sources:detail.sources||0});if(S.aiLog.length>500)S.aiLog.shift()}
function aiReceipt(){
 const L=S.aiLog||[];const pol=S.courses.map(c=>`- ${c.code||c.name}: ${AIPOL.find(p=>p[0]===coursePolicy(c))[1]}${c.ai?.note?` (${c.ai.note})`:''}`).join('\n');
 const rows=L.map(x=>`| ${new Date(x.ts).toLocaleString('en-CA',{dateStyle:'medium',timeStyle:'short'})} | ${x.kind}${x.mode?' · '+x.mode:''} | ${x.course||'–'} | ${(x.ask||'').replace(/\|/g,'/').replace(/\n/g,' ')} | ${x.out||''}${x.sources?` · ${x.sources} sources`:''} |`).join('\n');
 const md=`# AI use receipt · Loop\n\nStudent: ${S.name||''}${S.uni?` · ${S.uni}`:''}\nGenerated: ${new Date().toLocaleString('en-CA')}\nEntries: ${L.length}\n\nThis is a record of every time Loop's AI (Loopy) was used for study help. Loopy is set up to tutor, explain, quiz and research. It is not used to write work for submission.\n\n## Course AI settings\n${pol||'- none'}\n\n## Log\n| When | What | Course | Asked | Result |\n|---|---|---|---|---|\n${rows||'| – | – | – | – | – |'}\n`;
 const blob=new Blob([md],{type:'text/markdown'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`loop-ai-receipt-${todayStr()}.md`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);
 toast('AI use receipt downloaded');
}
function aiErrMsg(e){return e.code==='not_configured'?'Loopy isn\'t set up yet. The AI key for Loop hasn\'t been added. Everything else in Loop still works.':e.message}

/* ---- chat drawer: modes + research ---- */
function modeChips(){const m=S.chatMode||'find';return `<div class="lmodes" role="tablist" aria-label="Loopy mode">${LMODES.map(([k,e,l])=>`<button class="lmode ${m===k?'on':''}" role="tab" aria-selected="${m===k}" data-lmode="${k}">${e} ${l}</button>`).join('')}</div>`}
function chatWelcome(){
 const m=S.chatMode||'find',M=LM[m];
 if(m==='research')return researchForm();
 return `<div class="chatwelcome">${MASCOT(110)}<h2 style="margin:8px 0 4px">${M.e} ${M.l}</h2><p class="muted" style="font-size:14px;line-height:1.55;margin:0 0 14px">${{
  learn:'I\'ll teach in small steps and check you\'ve got each one before moving on.',
  explain:'Plain words, one example, one common mistake. Then a quick check.',
  quiz:'One question at a time from your courses. Try first; I\'ll explain after.',
  plan:'A realistic plan built around your classes, clubs and exams. Suggestions only; nothing changes in your calendar unless you add it.',
  find:`Clubs, events, jobs, scholarships and campus resources at ${esc(S.uni||'your university')} that fit you.`,
  reflect:'A short, kind check-in. No judgement.'}[m]}</p>
  <div class="chips">${M.a.map(q=>`<button class="qchip" data-askq="${esc(q)}">${esc(q)}</button>`).join('')}</div>
  ${!S.profile.interests&&!S.profile.goals&&m==='find'?`<p class="hint" style="margin-top:14px">Tip: add your program, interests and career goals in <button class="link" data-act="profilefromchat">Profile</button> for sharper suggestions.</p>`:''}</div>`;
}
function researchForm(){
 const c=chatCourse(),R=view.rs||{};
 return `<div class="rsform"><div class="row" style="gap:10px;align-items:center">${MASCOT(54,'think',false)}<div><div style="font-weight:700">Deep Research</div><div class="muted" style="font-size:12.5px">A short, cited brief from real sources. Then quiz yourself on it.</div></div></div>
  <label class="lbl" for="rsq">What do you want to understand?</label><textarea class="field sm" id="rsq" rows="3" placeholder="e.g. Does spaced repetition work for long-term learning? / What causes ocean acidification?">${esc(R.q||'')}</textarea>
  <div class="lbl">Purpose</div><div class="seg wrap" id="rsp">${[['understand','Understand it'],['essay','Background for an essay'],['exam','Exam prep'],['decision','A life / career decision']].map(([k,l])=>`<button class="${(R.p||'understand')===k?'on':''}" data-rsp="${k}">${l}</button>`).join('')}</div>
  <div class="lbl">Sources</div><div class="seg wrap" id="rss">${[['scholarly','🎓 Scholarly'],['general','✅ Reliable'],['news','📰 News']].map(([k,l])=>`<button class="${(R.s||'scholarly')===k?'on':''}" data-rss="${k}">${l}</button>`).join('')}</div>
  <label class="lbl" for="rsc">Save to course</label><select class="field sm" id="rsc"><option value="">None</option>${S.courses.map(x=>`<option value="${x.id}" ${(R.c||c?.id)===x.id?'selected':''} ${aiAllowedFor(x)?'':'disabled'}>${esc(x.code||x.name)}${aiAllowedFor(x)?'':' (AI off)'}</option>`).join('')}</select>
  <button class="btn full" style="margin-top:14px" data-act="runresearch" ${user&&!chatBusy?'':'disabled'}>🔎 Research it</button>
  <p class="hint" style="margin-top:10px">Uses 3 of your daily Loopy messages. Loopy only cites sources it actually found, and tells you where evidence is weak. For learning, not for submitting.</p></div>`;
}
function reportActions(i){const m=S.chat[i];if(!m||!m.report)return '';const c=S.courses.find(x=>x.id===m.course);
 return `<div class="ractions">${c?`<button class="btn light" data-rsave="${i}">${m.saved?'✓ Saved':'📓 Save to '+esc(c.code||c.name)}</button>`:''}${m.quiz?.length&&c?`<button class="btn light" data-rquiz="${i}">❓ Quiz me (${m.quiz.length})</button><button class="btn light" data-rflash="${i}">🃏 Flashcards</button>`:''}</div>`}
async function runResearch(){
 const q=$('#rsq')?.value.trim();if(!q)return toast('Type a question first');
 const R=view.rs=Object.assign(view.rs||{},{q,c:$('#rsc')?.value||''});const c=S.courses.find(x=>x.id===R.c)||null;
 if(c&&!aiAllowedFor(c))return toast('AI is off for that course');
 const purpose={understand:'understand the topic',essay:'background reading before writing their own essay (do not write the essay)',exam:'exam preparation',decision:'making a personal or career decision'}[R.p||'understand'];
 S.chat=S.chat.filter(m=>!m.err);S.chat.push({role:'user',content:`🔎 Research: ${q}`,research:true});chatBusy=true;drawChat();
 try{const r=await callAI({mode:'research',question:q,purpose,sources:R.s||'scholarly',courseName:c?(c.code+' '+c.name):''});
  S.chat.push({role:'assistant',content:r.text||'I couldn\'t find enough reliable sources for that. Try rewording it.',sources:r.sources||[],report:true,quiz:r.quiz||[],course:c?.id||null,rq:q});
  logAI('research',{mode:R.s||'scholarly',course:c,ask:q,out:`brief · ${(r.quiz||[]).length} quiz questions`,sources:(r.sources||[]).length});view.rs={s:R.s,p:R.p,c:R.c};}
 catch(e){S.chat.push({role:'assistant',content:aiErrMsg(e),err:true})}
 chatBusy=false;S.chat=S.chat.slice(-30);save();drawChat();
}
function researchTopic(c){let t=c.topics.find(x=>x.research);if(!t){t={id:uid('t_'),name:'Research notes',date:todayStr(),research:true};c.topics.push(t)}return t}
function reportToQs(i){const m=S.chat[i],c=S.courses.find(x=>x.id===m?.course);if(!c||!m.quiz?.length)return null;
 if(!m.qids){const t=researchTopic(c);m.qids=m.quiz.map(x=>{const id=uid('q_');S.cq.push({id,t:t.id,q:String(x.q),ans:String(x.answer),wrong:(x.wrong||[]).map(String).slice(0,3),e:String(x.why||''),kind:'custom',src:'research'});return id});save();reindex()}
 return m.qids.map(id=>S.cq.find(q=>q.id===id)).filter(Boolean).map(toMC)}
function saveReport(i){const m=S.chat[i],c=S.courses.find(x=>x.id===m?.course);if(!c)return;S.notebook=S.notebook||{};const N=S.notebook[c.id]=S.notebook[c.id]||[];
 if(!m.saved){N.unshift({id:uid('n_'),ts:Date.now(),title:m.rq||'Research brief',md:m.content,sources:m.sources||[]});m.saved=true;save();toast(`Saved to ${c.code||c.name} notebook`)}drawChat()}
function notebookCard(c){const N=(S.notebook||{})[c.id]||[];if(!N.length)return '';
 return `<h2>Notebook <span class="muted" style="font-size:14px;font-weight:500">· research you saved</span></h2><div class="stack" style="gap:8px">${N.map(n=>`<details class="card nb"><summary><div style="flex:1;min-width:0"><div class="nm1">${esc(n.title)}</div><div class="muted" style="font-size:12px">${fmtDate(new Date(n.ts).toLocaleDateString('en-CA'))} · ${n.sources.length} sources</div></div><button class="iconbtn sm" data-delnote="${c.id}|${n.id}" aria-label="Delete note">${ICON.x}</button></summary><div class="bubble assistant" style="max-width:none;margin-top:10px">${mdLite(n.md)}${n.sources.length?`<div class="srcs">${n.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc((s.title||s.url).slice(0,70))}</a>`).join('')}</div>`:''}</div></details>`).join('')}</div>`}

/* ---- hint ladder ---- */
function hintBar(q){const c=TOPIC[q.t]?.course;const lvl=Q.hint||0;
 return `<div class="hintbar" id="hintbar">${lvl<3?`<button class="link" data-q="hint">💡 ${lvl===0?'Hint':'Another hint'}</button>`:''}${lvl>0?`<button class="link muted2" data-q="show">Just show me</button>`:''}<span class="muted" style="font-size:12px;margin-left:auto">${lvl?`Hint ${lvl}/3`:''}</span></div>`}
function eliminateOne(){const q=Q.list[Q.i];const live=[...document.querySelectorAll('.opt')].map((b,k)=>({b,k})).filter(x=>x.k!==q.a&&!x.b.classList.contains('elim'));
 if(live.length<=1)return false;const x=live[Math.random()*live.length|0];x.b.classList.add('elim');x.b.disabled=true;x.b.setAttribute('aria-label','Ruled out');return true}
async function giveHint(){
 if(!Q||Q.picked!==null||Q.mode==='flash')return;const q=Q.list[Q.i],c=TOPIC[q.t]?.course;Q.hint=(Q.hint||0)+1;const lvl=Q.hint;
 const box=$('#hintbox');const say=(h)=>{if(box)box.innerHTML=`<div class="why hintmsg">${h}</div>`};
 if(lvl===1){eliminateOne();say(`<b>Hint 1:</b> One wrong option is ruled out. This is about <b>${esc(TOPIC[q.t].name)}</b>. What's the key idea there?`)}
 else if(lvl===2&&user&&aiAllowedFor(c)&&coursePolicy(c)!=='off'){
  say('<b>Hint 2:</b> <span class="muted">Loopy is thinking…</span>');
  try{const r=await callAI({mode:'hint',level:2,question:q.q,options:q.o,answer:q.o[q.a],topic:TOPIC[q.t].name});if(Q&&Q.list[Q.i]===q&&Q.picked===null){say(`<b>Hint 2:</b> ${esc(r.text||'')}`);logAI('hint',{mode:'level 2',course:c,ask:q.q,out:'hint'})}}
  catch(e){eliminateOne();say(`<b>Hint 2:</b> Another wrong option is gone.${e.code==='not_configured'?'':''}`)}
 }
 else if(lvl===2){eliminateOne();say('<b>Hint 2:</b> Another wrong option is gone. Say the answer to yourself before you pick.')}
 else{eliminateOne();say('<b>Hint 3:</b> Down to the last few. Make your best pick. A guess you commit to still helps memory.')}
 const hb=$('#hintbar');if(hb)hb.outerHTML=hintBar(q);
}
function justShow(){
 if(!Q||Q.picked!==null||Q.mode==='flash')return;const q=Q.list[Q.i];Q.picked=q.a;Q.pend=null;Q.res[Q.i]=false;
 record(q,false,(Date.now()-Q.qStart)/1000,1,{hint:'show',hl:Q.hint||0,title:Q.title});
 document.querySelectorAll('.opt').forEach((b,k)=>{b.classList.remove('sel');b.classList.add(k===q.a?'ok':'dim');b.disabled=true});
 $('#hintbox')&&($('#hintbox').innerHTML='');$('#hintbar')?.remove();
 $('#why').innerHTML=`<div class="why"><b>It's “${esc(q.o[q.a])}”.</b><div class="calnote">No problem. Seeing it now and trying again soon still builds memory. Loop will bring it back shortly.</div>${esc(q.e||'')}</div>`;
 const nb=$('#nextb');nb.style.visibility='visible';nb.focus({preventScroll:true});
}

/* ======================= Knowt-style polish + 10 features ======================= */
function signBar(){
 if(user||!S.setup) return '';
 return `<div class="signbar" role="status"><div style="flex:1;min-width:0"><b style="font-weight:600">Sync your progress</b><div class="muted" style="font-size:12.5px">Sign in to keep your study history on every device.</div></div><button class="btn" style="padding:10px 16px;font-size:14px" data-act="signin">Sign in</button></div>`;
}
const pinsOf=()=>S.pins||(S.pins=[]);
function sortCourses(list){
 const by=view.sortBy||'pinned';const pins=pinsOf();
 const lastOf=c=>{const ids=new Set(c.topics.map(t=>t.id));return Math.max(0,...(S.revlog||[]).filter(r=>ids.has(r.t)).map(r=>r.ts))};
 const sorted=[...list].sort((a,b)=>{
  if(by==='exam'){const na=nextExam(a),nb=nextExam(b);return (na?na.days:9999)-(nb?nb.days:9999)}
  if(by==='behind'){return courseStats(b).behind-courseStats(a).behind}
  if(by==='recent'){return lastOf(b)-lastOf(a)}
  return 0;
 });
 if(by==='pinned'){const P=pinsOf();return [...sorted].sort((x,y)=>(P.includes(y.id)?1:0)-(P.includes(x.id)?1:0))}
 return sorted;
}
function sortBar(){
 const by=view.sortBy||'pinned';
 return `<div class="sortbar" role="group" aria-label="Sort courses">${[['pinned','Pinned first'],['exam','Next exam'],['behind','Most behind'],['recent','Recently studied']].map(([k,l])=>`<button class="${by===k?'on':''}" data-sortby="${k}">${l}</button>`).join('')}</div>`;
}
function updatedAgo(c){
 const ids=new Set(c.topics.map(t=>t.id));const last=Math.max(0,...(S.revlog||[]).filter(r=>ids.has(r.t)).map(r=>r.ts));
 if(!last) return 'Not studied yet';
 const d=Math.floor((Date.now()-last)/864e5);return d<=0?'Updated today':d===1?'Updated yesterday':`Updated ${d}d ago`;
}
function exportNotes(c){
 const L=[`# ${c.code||''} ${c.name}`.trim(),'',`Exported from Loop on ${new Date().toLocaleDateString('en-CA')}`,''];
 if(c.exams?.length){L.push('## Exams');c.exams.forEach(e=>L.push(`- ${e.name}: ${fmtDate(e.date)}`));L.push('')}
 L.push('## Topics');c.topics.forEach(t=>{L.push(`### ${t.name}`);L.push(`Taught: ${fmtDate(t.date)}`);const qs=(QBYT[t.id]||[]).filter(q=>!q.gen);qs.forEach(q=>L.push(`- Q: ${q.q}  \n  A: ${q.ans??(q.o&&q.o[q.a])??''}`));L.push('')});
 const note=(S.cnotes||{})[c.id];if(note){L.push('## My notes',note,'')}
 const blob=new Blob([L.join('\n')],{type:'text/markdown'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=`${(c.code||c.name).replace(/[^A-Za-z0-9]+/g,'-')}-notes.md`;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},500);toast('Notes exported');
}
function printSheet(c){
 const rows=c.topics.map(t=>`<tr><td>${esc(t.name)}</td><td>${fmtDate(t.date)}</td><td>${Math.round(topicMastery(t.id)*100)}%</td></tr>`).join('');
 const ex=(c.exams||[]).map(e=>`<li>${esc(e.name)}: ${fmtDate(e.date)}</li>`).join('')||'<li>No exams added</li>';
 const w=window.open('','_blank','width=800,height=900');if(!w)return toast('Allow pop-ups to print');
 w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(c.name)} study sheet</title><style>body{font-family:Poppins,system-ui,sans-serif;color:#16202A;padding:32px;max-width:720px;margin:auto}h1{margin:0 0 4px}table{width:100%;border-collapse:collapse;margin-top:16px}td,th{border-bottom:1px solid #ddd;padding:8px;text-align:left;font-size:14px}th{font-size:12px;text-transform:uppercase;color:#6B7785}ul{padding-left:18px}</style></head><body><h1>${esc(c.code||'')} ${esc(c.name)}</h1><p style="color:#6B7785">Study sheet · Loop</p><h3>Exams</h3><ul>${ex}</ul><h3>Topics</h3><table><tr><th>Topic</th><th>Taught</th><th>Known</th></tr>${rows}</table><script>window.onload=()=>setTimeout(()=>print(),200)<\/script></body></html>`);
 w.document.close();
}
function markKnown(tid,on){S.known=S.known||{};if(on)S.known[tid]=1;else delete S.known[tid];save();render();toast(on?'Marked as known. Loop will still check it now and then':'Back on your list')}
function moodCard(){
 const t=todayStr(),cur=(S.moods||{})[t];S.moods=S.moods||{};
 const opts=[['😊','Good'],['😐','Okay'],['😩','Rough']];
 const last7=[...Array(7)].map((_,i)=>addDays(t,i-6)).map(d=>S.moods[d]?.v).filter(Boolean);
 return `<div class="card moodcard"><div class="row between"><b style="font-weight:600">How are you today?</b><span class="muted" style="font-size:12px">${cur?'Logged. Thanks':'Optional, one tap'}</span></div>
  <div class="row" style="gap:8px;margin-top:10px">${opts.map(([e,l],i)=>`<button class="moodbtn ${cur===i?'on':''}" data-mood="${i}" aria-label="${l}"><span style="font-size:22px">${e}</span><small>${l}</small></button>`).join('')}</div>
  ${last7.length>1?`<p class="muted" style="font-size:12px;margin:10px 0 0">This week: ${last7.map(v=>opts[v]?.[0]||'').join(' ')}. Rough days are normal. Loop will go easy on the plan.</p>`:''}</div>`;
}
function shortcutsModal(){
 const rows=[['1–4','Pick an answer'],['H','Hint'],['Enter','Continue'],['Esc','Stop quiz'],['⌘K','Search'],['?','This list'],['Space','Flip flashcard'],['1–4 (flashcards)','Rate recall']];
 modal(`<div class="row between"><h2 style="margin:0">Keyboard shortcuts</h2><button class="iconbtn sm" data-act="closemodal" aria-label="Close">${ICON.x}</button></div><div class="stack" style="gap:8px;margin-top:12px">${rows.map(([k,v])=>`<div class="row between" style="font-size:14px"><span>${v}</span><kbd>${k}</kbd></div>`).join('')}</div>`);
}
function copyWeek(){
 const days=[...Array(7)].map((_,i)=>addDays(todayStr(),i-6));
 const n=days.reduce((a,d)=>a+(S.log[d]?.n||0),0),ok=days.reduce((a,d)=>a+(S.log[d]?.ok||0),0);
 const txt=`My week on Loop: ${n} questions, ${n?Math.round(ok/n*100):0}% right, ${Object.values(S.q).filter(r=>r.reps).length} topics in rotation. Learning in loops 🔁`;
 (navigator.clipboard?.writeText(txt)||Promise.reject()).then(()=>toast('Copied your week summary')).catch(()=>toast(txt));
}
function courseNotesCard(c){
 const v=(S.cnotes||{})[c.id]||'';
 return `<div class="card"><div class="row between"><b style="font-weight:600">My notes</b><span class="muted" style="font-size:12px">Saved automatically on this device and synced when signed in</span></div><textarea class="field sm cnotes" data-cnote="${c.id}" rows="4" placeholder="Anything you want to remember about this course…" style="margin-top:8px;width:100%">${esc(v)}</textarea></div>`;
}
(function(){const k=(x)=>x;})();

/* ======================= Features: brain-dump inbox, done-for-today, week in review ======================= */
S.inbox=S.inbox||[];
function inboxCard(){
 const items=(S.inbox||[]).filter(x=>!x.done);
 return `<div class="card inboxcard"><div class="row between"><b style="font-weight:600">Brain dump</b><span class="muted" style="font-size:12px">${items.length} parked</span></div>
  <p class="muted" style="font-size:13px;margin:4px 0 10px">Anything on your mind? Drop it here and get back to what you were doing.</p>
  <form class="row" id="inboxform" style="gap:8px"><input class="field sm" id="inboxin" placeholder="e.g. email prof about essay, buy notebook" maxlength="140" aria-label="Add to brain dump" style="flex:1;min-width:0"><button class="btn" style="padding:12px 16px" type="submit">Park it</button></form>
  <div class="stack" style="gap:6px;margin-top:10px">${items.slice(0,6).map(x=>`<div class="mini" style="cursor:default"><button class="iconbtn sm" data-inboxdone="${x.id}" aria-label="Mark done" style="width:30px;height:30px">✓</button><div class="nm1" style="flex:1;font-weight:500">${esc(x.text)}</div><button class="link muted2" data-inboxdel="${x.id}" aria-label="Remove" style="font-size:12px">remove</button></div>`).join('')}</div>
  ${items.length>6?`<p class="muted" style="font-size:12px;margin:8px 0 0">+${items.length-6} more</p>`:''}</div>`;
}
function doneTodayCard(){
 const t=todayStr(),n=S.log[t]?.n||0,goal=S.settings.len;
 if(n<goal)return '';
 const acc=S.log[t].n?Math.round(S.log[t].ok/S.log[t].n*100):0;
 return `<div class="ccard c-mint" style="cursor:default;margin-bottom:14px"><div class="row between"><div class="glyph">🌙</div><span class="chip">Done for today</span></div>
  <div style="font-size:20px;font-weight:600;margin:12px 0 4px">${n} questions. ${acc}% right.</div>
  <div style="font-size:14px;opacity:.85">Your memory keeps working overnight. Come back tomorrow for about 5 minutes.</div></div>`;
}
function weekReview(){
 const days=[...Array(7)].map((_,i)=>addDays(todayStr(),i-6));
 const n=days.reduce((a,d)=>a+(S.log[d]?.n||0),0),ok=days.reduce((a,d)=>a+(S.log[d]?.ok||0),0);
 const active=days.filter(d=>(S.log[d]?.n||0)>=5).length;
 const prevDays=[...Array(7)].map((_,i)=>addDays(todayStr(),i-13)).slice(0,7);
 const pn=prevDays.reduce((a,d)=>a+(S.log[d]?.n||0),0),pok=prevDays.reduce((a,d)=>a+(S.log[d]?.ok||0),0);
 const acc=n?Math.round(ok/n*100):null,pacc=pn?Math.round(pok/pn*100):null;
 const fixed=(S.revlog||[]).filter(r=>r.ts>=Date.now()-7*864e5&&r.conf===2&&r.ok).length;
 const cwNow=Object.values(S.q).filter(r=>r.cw).length;
 const lines=[];
 if(!n) lines.push('No practice this week yet. One 5-minute session is enough to restart.');
 else{
  lines.push(`${n} question${n>1?'s':''} answered on ${active} day${active===1?'':'s'} of 7 with 5+ questions.`);
  if(acc!=null&&pacc!=null){const d=acc-pacc;lines.push(d>2?`Accuracy up ${d} points on last week.`:d<-2?`Accuracy down ${-d} points on last week. Worth a look at which topics dropped.`:`Accuracy steady at ${acc}%.`)}
  if(fixed) lines.push(`You corrected ${fixed} answer${fixed>1?'s':''} you were sure about. That's the best kind of learning.`);
  if(cwNow) lines.push(`${cwNow} confidently-wrong answer${cwNow>1?'s':''} still to fix. Loop will bring them back first.`);
 }
 return `<div class="card weekrev"><div class="row between"><b style="font-weight:600">Week in review</b><button class="link" data-copyweek="1" style="font-size:13px">Copy summary</button></div><ul style="margin:10px 0 0;padding-left:18px;line-height:1.7;font-size:14px">${lines.map(l=>`<li>${esc(l)}</li>`).join('')}</ul></div>`;
}

/* ======================= Phase E+F: readiness, autopilot, recovery ======================= */
const examKey=(c,e)=>c.id+'|'+e.name+'|'+e.date;
function examTopics(c,e){return c.topics.filter(t=>t.date<=e.date&&hasContent(t.id))}
function readiness(c,e){
 const ts=examTopics(c,e);if(!ts.length)return null;
 const t0=todayStr(),days=Math.max(0,dayDiff(e.date,t0));
 const know=ts.reduce((a,t)=>a+topicMastery(t.id),0)/ts.length,keep=ts.reduce((a,t)=>a+retentionAt(t.id,e.date),0)/ts.length;
 const mid=Math.round((0.55*know+0.45*keep)*100);
 const ids=new Set(ts.map(t=>t.id)),since=Date.now()-30*864e5;
 const R=(S.revlog||[]).filter(r=>ids.has(r.t)&&r.ts>=since&&r.ok!=null),n=R.length;
 const recent=R.filter(r=>r.ts>=Date.now()-14*864e5),acc=recent.length?Math.round(recent.filter(r=>r.ok).length/recent.length*100):null;
 const unseen=ts.filter(t=>!seen(t.id)).length,uf=unseen/ts.length;
 const cw=ts.reduce((a,t)=>a+(QBYT[t.id]||[]).filter(q=>S.q[q.id]?.cw).length,0);
 const hw=Math.min(30,3+25*uf+18/Math.sqrt(1+n/5)+2*cw);
 const lo=Math.max(0,Math.round(mid-hw)),hi=Math.min(100,Math.round(mid+hw*0.8));
 const conf=n>=80&&uf<0.15?'High':n>=25&&uf<0.4?'Medium':'Low';
 const why=[];
 if(acc!=null)why.push(`${acc}% recent accuracy (${recent.length} answers in 14 days)`);else why.push('No recent answers on these topics yet');
 if(unseen)why.push(`${unseen} of ${ts.length} topics not tested yet`);
 if(cw)why.push(`${cw} confidently wrong answer${cw>1?'s':''} still to fix`);
 why.push(days?`Exam in ${days} day${days>1?'s':''}: memory fades without review`:'Exam is today');
 why.push('Based on practice questions only, not written answers');
 return {lo,hi,mid,conf,why,n,unseen,acc};
}
function readinessLine(c,e,short){const r=readiness(c,e);if(!r)return '';return short?`Readiness ${r.lo}–${r.hi}%`:`Estimated readiness ${r.lo}–${r.hi}% · ${r.conf} confidence`}
function snapshotPredictions(){
 S.predlog=S.predlog||{};const t=todayStr();
 S.courses.forEach(c=>(c.exams||[]).forEach(e=>{if(e.date<t)return;const k=examKey(c,e),L=S.predlog[k]=S.predlog[k]||[];if(L.length&&L[L.length-1].d===t)return;const r=readiness(c,e);if(r){L.push({d:t,lo:r.lo,hi:r.hi,mid:r.mid,conf:r.conf});if(L.length>60)L.shift()}}));
}
function topicPriority(t,c,e){
 const today=todayStr(),days=e?Math.max(0,dayDiff(e.date,today)):30;
 const F=1-retentionAt(t.id,today),M=1-topicMastery(t.id);
 const qs=QBYT[t.id]||[],cwN=qs.filter(q=>S.q[q.id]?.cw).length,od=qs.filter(q=>S.q[q.id]?.reps&&S.q[q.id].due<today).length;
 const C=Math.min(1,cwN/2),E=e?1/(1+days/7):0.15,O=Math.min(1,od/5);
 const P=0.30*F+0.25*M+0.20*C+0.15*E+0.10*O;
 const why=[];
 if(cwN)why.push(`you were confidently wrong on ${cwN} question${cwN>1?'s':''} here`);
 if(!seen(t.id))why.push('you haven\'t tried this topic yet');else if(F>0.5)why.push(`you've likely forgotten ~${Math.round(F*100)}% since you last practised`);
 if(od)why.push(`${od} review${od>1?'s are':' is'} overdue`);
 if(M>0.6&&seen(t.id))why.push('it isn\'t mastered yet');
 if(e&&days<=10)why.push(`${c.code||c.name} ${e.name} is ${days===0?'today':days===1?'tomorrow':'in '+days+' days'}`);
 return {t,c,e,P,why,cwN,od};
}
function rankedActions(courseId){
 const today=todayStr(),out=[];
 S.courses.filter(c=>!courseId||c.id===courseId).forEach(c=>{const e=nextExam(c);c.topics.filter(t=>t.date<=today&&hasContent(t.id)).forEach(t=>out.push(topicPriority(t,c,e&&e.days<=28?e:null)))});
 return out.sort((a,b)=>b.P-a.P);
}
function freeSlots(d,minLen=25){
 const ev=eventsOn(d).filter(e=>e.start).map(e=>[t2m(e.start),t2m(e.end)||t2m(e.start)+60]).sort((a,b)=>a[0]-b[0]);
 const now=new Date(),nm=d===todayStr()?Math.ceil((now.getHours()*60+now.getMinutes()+5)/5)*5:8*60;
 let cur=Math.max(8*60,nm);const out=[];
 for(const [s,e] of ev){if(s-cur>=minLen)out.push([cur,s]);cur=Math.max(cur,e)}
 if(22*60-cur>=minLen)out.push([cur,22*60]);
 return out.map(([s,e])=>({s,e,len:e-s,before:ev.find(x=>x[0]===e)?eventsOn(d).find(x=>t2m(x.start)===e):null}));
}
const m2t=m=>String(Math.floor(m/60)).padStart(2,'0')+':'+String(m%60).padStart(2,'0');
function planFor(c,e){
 const r=readiness(c,e);if(!r)return null;
 const target=(e.target||S.settings.target||80),days=Math.max(1,dayDiff(e.date,todayStr()));
 const gap=Math.max(0,target-r.mid)/100,ts=examTopics(c,e).length;
 let mins=Math.round(Math.min(60,Math.max(gap>0?10:0,gap*ts*25/days))/5)*5;
 const top=rankedActions(c.id).filter(x=>x.P>0.15).slice(0,3);
 return {r,target,mins,top,days};
}
function recoveryPlan(){
 const t=todayStr();if(Object.keys(S.log).length<3)return null;
 const soon=S.courses.map(c=>({c,e:nextExam(c)})).filter(x=>x.e&&x.e.days<=14);if(!soon.length)return null;
 let missed=0;for(let i=1;i<=3;i++){if(!(S.log[addDays(t,-i)]?.n>=3))missed++}
 const overdue=Object.values(S.q).filter(r=>r.reps&&r.due<t).length;
 if(missed<2&&overdue<15)return null;
 const behind=Math.min(120,Math.round((missed*15+overdue*0.6)/5)*5);if(behind<15)return null;
 const split=[0.35,0.4,0.25].map(p=>Math.max(5,Math.round(behind*p/5)*5));
 return {behind,split,soon};
}
function addStudyBlock(d,s,e,courseName){
 osInit();S.events.push({id:uid('ev_'),kind:'study',title:`Loop study · ${courseName}`,date:d,days:[],start:m2t(s),end:m2t(e),remind:5,notes:'Loop-generated study block. Edit or delete any time.',loopgen:true});
 save();render();toast('Study block added to your schedule');
}
function autopilotCard(c){
 const e=nextExam(c);if(!e)return `<div class="card"><b style="font-weight:600">Exam Autopilot</b><p class="muted" style="font-size:14px;margin:8px 0 0">Add an exam date (edit ✎) and Loop will plan your studying around your schedule.</p></div>`;
 const p=planFor(c,e);if(!p)return '';
 const slot=freeSlots(todayStr()).find(x=>x.len>=Math.max(20,p.mins));
 const k=examKey(c,e);
 return `<div class="card autopilot"><div class="row between" style="flex-wrap:wrap;gap:8px"><div><b style="font-weight:600">Exam Autopilot · ${esc(e.name)}</b><div class="muted" style="font-size:13px">${e.days===0?'Today':e.days===1?'Tomorrow':`${e.days} days away`} · ${fmtDate(e.date,{weekday:'short',month:'short',day:'numeric'})}</div></div>
  <label class="row" style="gap:6px;font-size:13px;font-weight:600">Goal <select class="field sm" style="width:auto;padding:6px 10px" data-target="${esc(k)}">${[60,65,70,75,80,85,90,95].map(v=>`<option ${v===p.target?'selected':''}>${v}</option>`).join('')}</select>%</label></div>
  <div class="readyrow"><div><div class="rng">${p.r.lo}–${p.r.hi}%</div><div class="muted" style="font-size:12px">Estimated readiness · ${p.r.conf} confidence · <span class="tag soon" style="font-size:10px">experimental</span></div></div>
   <div class="rbar"><i style="left:${p.r.lo}%;width:${Math.max(2,p.r.hi-p.r.lo)}%"></i><b style="left:${p.target}%" title="Goal"></b></div></div>
  <details class="why2"><summary>Why this estimate?</summary><ul>${p.r.why.map(w=>`<li>${esc(w)}</li>`).join('')}</ul></details>
  <div class="todayplan"><div style="font-weight:600;margin-bottom:6px">${p.mins?`Today: about ${p.mins} min`:p.r.lo>=p.target?'On track for your goal. A light review keeps it there.':'Today: a short review'}</div>
   ${p.top.length?p.top.map(x=>`<div class="mini" style="cursor:default;align-items:flex-start"><span class="dot c-${c.color}" style="margin-top:6px"></span><div style="flex:1;min-width:0"><div class="nm1">${esc(x.t.name)}</div><div class="muted" style="font-size:12px">Because ${esc(x.why.slice(0,2).join(' and ')||'it keeps your memory fresh')}.</div></div><button class="btn" style="padding:8px 14px;font-size:13px" data-revise="${x.t.id}">Go</button></div>`).join(''):'<p class="muted" style="font-size:13px;margin:0">Nothing urgent. Everything is fresh.</p>'}
   ${p.mins&&slot?`<div class="slotnote">🕒 You have ${slot.len>=120?Math.floor(slot.len/60)+'h free':slot.len+' min free'} from ${fmtTime(m2t(slot.s))}${slot.before?` before ${esc(slot.before.title)}`:''}. <button class="link" data-addblock="${c.id}|${slot.s}|${Math.min(slot.e,slot.s+Math.max(20,p.mins))}">Add a ${Math.max(20,p.mins)}-min study block</button></div>`:''}
  </div></div>`;
}
function nextActionCard(){
 const rec=recoveryPlan();
 if(rec)return `<div class="ccard c-peach nextact" style="cursor:default"><div class="row between"><div class="glyph">🌱</div><span class="chip">Recovery plan</span></div>
  <div style="font-size:20px;font-weight:600;margin:12px 0 4px">You're about ${rec.behind} minutes behind. Nothing is ruined.</div>
  <div style="font-size:14px;opacity:.85">Today ${rec.split[0]} min · Tomorrow ${rec.split[1]} min · Day after ${rec.split[2]} min</div>
  <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" data-recover="${rec.split[0]}">Start today's ${rec.split[0]} min</button></div></div>`;
 const top=rankedActions()[0];if(!top||top.P<0.12)return '';
 const n=Math.max(4,Math.min(10,4+top.cwN*2+Math.round(top.P*6)));
 return `<div class="ccard c-lav nextact" style="cursor:default"><div class="row between"><div class="glyph">🎯</div><span class="chip">Next right action</span></div>
  <div style="font-size:20px;font-weight:600;margin:12px 0 4px">Do ${n} questions on ${esc(top.t.name)}</div>
  <div style="font-size:13.5px;opacity:.85;line-height:1.5">${top.c.emoji} ${esc(top.c.code||top.c.name)} · Why: ${esc(top.why.slice(0,3).join('; ')||'keeps it fresh')}.</div>
  <div class="row" style="gap:8px;margin-top:12px;flex-wrap:wrap"><button class="btn" data-revise="${top.t.id}" data-n="${n}">Start · about ${Math.round(n*0.9)} min</button>${top.e?`<button class="btn light" data-course="${top.c.id}">See exam plan</button>`:''}</div></div>`;
}
function predVsActual(){
 const rows=[];S.courses.forEach(c=>(c.exams||[]).forEach(e=>{if(e.actual==null)return;const L=(S.predlog||{})[examKey(c,e)]||[],last=L.filter(x=>x.d<=e.date).pop();rows.push({c,e,last})}));
 if(!rows.length)return '';
 return `<h2>Predicted vs actual</h2><div class="card"><p class="muted" style="font-size:13px;margin:0 0 10px">Loop checks its own estimates against your real results so future predictions can be calibrated.</p>${rows.map(({c,e,last})=>`<div class="mini" style="cursor:default;margin-bottom:6px"><span style="font-size:18px">${c.emoji}</span><div style="flex:1"><div class="nm1">${esc(c.code||c.name)} · ${esc(e.name)}</div><div class="muted" style="font-size:12px">${last?`Loop estimated ${last.lo}–${last.hi}% · you got ${e.actual}%`:`You got ${e.actual}% (no estimate saved before the exam)`}</div></div>${last?`<span class="tag ${e.actual>=last.lo&&e.actual<=last.hi?'ok':e.actual>last.hi?'new':'behind'}">${e.actual>=last.lo&&e.actual<=last.hi?'In range':e.actual>last.hi?'Beat estimate':'Below estimate'}</span>`:''}</div>`).join('')}</div>`;
}

/* ---------------- focus timer (pomodoro) ---------------- */
let F=store.get('loop-focus',null),fTick=null;
function focusStart(min,kind='focus'){F={end:Date.now()+min*60000,min,kind};store.set('loop-focus',F);focusLoop();toast(kind==='focus'?`Focus ${min} min. You've got this`:`Break ${min} min. Step away from the screen`)}
function focusStop(){F=null;store.set('loop-focus',null);clearInterval(fTick);$('#focuspill')?.remove()}
function focusLoop(){
 clearInterval(fTick);if(!F)return;
 const draw=()=>{
  let el=$('#focuspill');if(!el){el=document.createElement('div');el.id='focuspill';el.className='focuspill';document.body.appendChild(el)}
  const left=Math.max(0,F.end-Date.now()),m=Math.floor(left/60000),s=Math.floor(left/1000)%60,p=1-left/(F.min*60000);
  el.innerHTML=`<div class="fring" style="--p:${Math.round(p*100)}"><span>${F.kind==='focus'?'🎯':'🌿'}</span></div><div><div style="font-weight:700;font-variant-numeric:tabular-nums;font-size:17px">${m}:${String(s).padStart(2,'0')}</div><div style="font-size:11px;opacity:.7">${F.kind==='focus'?'Focus':'Break'}</div></div><button data-act="focusstop" aria-label="Stop timer" style="opacity:.6">${ICON.x}</button>`;
  if(left<=0){const k=F.kind;focusStop();beep(true);setTimeout(()=>beep(true),300);
   if(k==='focus'){toast('Focus done! Take a 5 min break 🌿');focusStart(5,'break')}else toast('Break over. Ready for another round?')}
 };
 draw();fTick=setInterval(draw,1000);
}
/* ---------------- ⌘K command palette ---------------- */
function openPalette(){
 closeModal();
 const items=[
  {l:'⚡ Daily practice',a:()=>startQuiz(buildSet(),'Daily')},
  {l:'🟣 Ask Loopy',a:()=>openChat()},
  {l:'🗓️ Add to schedule',a:()=>openEventEditor(null)},
  {l:'✨ Paste my timetable',a:()=>aiImport()},
  {l:'📌 Track an application',a:()=>openAppEditor(null)},
  {l:'🎭 Add a club',a:()=>openClubEditor(null)},
  {l:'📅 Schedule',a:()=>go(()=>{view.tab='schedule';view.course=null})},
  {l:'🌟 Life & career',a:()=>go(()=>{view.tab='life';view.course=null})},
  {l:'🎯 Start a 25-min focus timer',a:()=>focusStart(25)},
  {l:'➕ Create a course',a:()=>openEditor(null)},
  {l:'🔑 Join a course with a code',a:()=>openJoin()},
  {l:'📈 Progress',a:()=>go(()=>{view.tab='stats';view.course=null})},
  ...(mistakes().length?[{l:`🩹 Fix my mistakes (${mistakes().length})`,a:()=>startQuiz(shuffle(mistakes()).slice(0,10),'Mistakes')}]:[]),
  ...S.courses.flatMap(c=>[{l:`${c.emoji} ${c.code||''} ${c.name}`,s:'Open course',a:()=>go(()=>{view.course=c.id;view.edit=view.addq=null})},{l:`${c.emoji} Cram ${c.code||c.name}`,s:'Practice',a:()=>cram(c.id)},{l:`${c.emoji} Flashcards: ${c.code||c.name}`,s:'Flashcards',a:()=>startQuiz(buildSet({courseId:c.id,n:12}),'Flashcards','flash')}]),
  ...S.courses.flatMap(c=>c.topics.filter(t=>hasContent(t.id)).map(t=>({l:`↻ Revise: ${t.name}`,s:c.code||c.name,a:()=>startQuiz(buildSet({topicIds:[t.id],n:6}),'Revise')})))
 ];
 modal(`<input class="field" id="pal" placeholder="Search courses, topics, actions…" autocomplete="off" aria-label="Search"><div id="palres" class="stack" style="gap:4px;max-height:50vh;overflow:auto"></div><div class="hint" style="text-align:center">↑ ↓ to move · Enter to open · Esc to close</div>`);
 let sel=0,res=items;
 const draw=()=>{$('#palres').innerHTML=res.slice(0,40).map((it,i)=>`<button class="palitem ${i===sel?'on':''}" data-pal="${i}"><span>${esc(it.l)}</span>${it.s?`<small class="muted">${esc(it.s)}</small>`:''}</button>`).join('')||'<p class="muted" style="text-align:center">Nothing found</p>'};
 const inp=$('#pal');
 inp.oninput=()=>{const q=inp.value.toLowerCase().split(/\s+/).filter(Boolean);res=items.filter(it=>q.every(w=>(it.l+' '+(it.s||'')).toLowerCase().includes(w)));sel=0;draw()};
 inp.onkeydown=e=>{if(e.key==='ArrowDown'){sel=Math.min(res.length-1,sel+1);draw();e.preventDefault()}else if(e.key==='ArrowUp'){sel=Math.max(0,sel-1);draw();e.preventDefault()}else if(e.key==='Enter'){const it=res[sel];if(it){closeModal();it.a()}}};
 $('#palres').onclick=e=>{const b=e.target.closest('[data-pal]');if(b){const it=res[+b.dataset.pal];closeModal();it.a()}};
 draw();
}


async function osClick(b,d,e){
 if(d.sortby){view.sortBy=d.sortby;return render()}
 if(d.pin!==undefined){const P=pinsOf(),i=P.indexOf(d.pin);i>=0?P.splice(i,1):P.push(d.pin);save();render();return true}
 if(d.export!==undefined){const c=S.courses.find(x=>x.id===d.export);if(c)exportNotes(c);return true}
 if(d.print!==undefined){const c=S.courses.find(x=>x.id===d.print);if(c)printSheet(c);return true}
 if(d.known!==undefined){markKnown(d.known,!(S.known||{})[d.known]);return true}
 if(d.mood!==undefined){S.moods=S.moods||{};S.moods[todayStr()]={v:+d.mood,ts:Date.now()};save();render();toast(['Glad it\'s a good one 😊','Okay days count too','Rest counts as study. Be gentle with yourself 💜'][+d.mood]);return true}
 if(d.copyweek){copyWeek();return true}
 if(d.askq){e.stopPropagation();if(S.chatMode==='research')S.chatMode='find';openChat(d.askq);return true}
 if(d.inboxdone!==undefined){const x=S.inbox.find(i=>i.id===d.inboxdone);if(x){x.done=true;save();render();toast('Nice. One less thing.')}return true}
 if(d.inboxdel!==undefined){S.inbox=S.inbox.filter(i=>i.id!==d.inboxdel);save();render();return true}
 if(d.pushcat){const P=pushPrefs();P[d.pushcat]=!P[d.pushcat];S.settings.push=P;save();render();return true}
 if(d.lmode){S.chatMode=d.lmode;save();drawChat();if(d.lmode!=='research')setTimeout(()=>$('#chatin')?.focus(),50);return true}
 if(d.rsp||d.rss){view.rs=Object.assign(view.rs||{},{q:$('#rsq')?.value||'',c:$('#rsc')?.value||''},d.rsp?{p:d.rsp}:{s:d.rss});drawChat();return true}
 if(d.rsave!==undefined){saveReport(+d.rsave);return true}
 if(d.rquiz!==undefined||d.rflash!==undefined){const qs=reportToQs(+(d.rquiz??d.rflash));if(qs){closeChat();startQuiz(qs,'Research',d.rflash!==undefined?'flash':'quiz')}return true}
 if(d.delnote){const [cid,nid]=d.delnote.split('|');e.preventDefault();S.notebook[cid]=(S.notebook[cid]||[]).filter(n=>n.id!==nid);save();render();toast('Removed from notebook');return true}
 if(d.aipol){syncDraft();draft.ai=Object.assign({},draft.ai,{level:d.aipol});render();return true}
 if(b.classList.contains('wcol')&&!e.target.closest('.wev')){const r=b.getBoundingClientRect(),y=e.clientY-r.top,body=b.parentElement,h0=t2m(body.querySelector('.wtimes div')?.textContent?.replace(/(am|pm)/,'')?'00:00':'00:00');const HH=52;const firstLabel=body.querySelector('.wtimes div').textContent;let hh=parseInt(firstLabel);if(/pm/.test(firstLabel)&&hh!==12)hh+=12;if(/am/.test(firstLabel)&&hh===12)hh=0;const mins=Math.floor((hh*60+y/HH*60)/30)*30;const st=String(Math.floor(mins/60)).padStart(2,'0')+':'+String(mins%60).padStart(2,'0');openEventEditor(null,{date:d.newat,start:st,end:fmtPlus(st,60),startDate:d.newat});return true}
 if(d.editev){openEventEditor(d.editev);return true}
 if(d.editapp){openAppEditor(d.editapp);return true}
 if(d.editclub){openClubEditor(d.editclub);return true}
 if(d.sday){view.sday=d.sday;if(view.smode==='month'){view.smode='week';view.week=weekStart(d.sday)}render();return true}
 if(d.wk!==undefined){const t=todayStr();if(d.wk==='0'){view.week=weekStart(t);view.sday=t}else if(view.smode==='month'){const x=new Date((view.sday||t)+'T12:00');x.setMonth(x.getMonth()+ +d.wk,1);view.sday=x.toLocaleDateString('en-CA')}else{view.week=addDays(view.week||weekStart(t),7*+d.wk);view.sday=view.week}render();return true}
 if(d.smode){view.smode=d.smode;render();return true}
 if(d.evkind){readEvDraft();view.evDraft.kind=d.evkind;const v=view.evDraft;openEventEditor(null,v);view.evDraft.id=v.id;return true}
 if(d.evrep!==undefined){readEvDraft();const v=view.evDraft;v.days=d.evrep==='1'?(v.days.length?v.days:[wdOf(v.date||todayStr())]):[];if(d.evrep==='1'&&!v.startDate)v.startDate=todayStr();openEventEditor(null,v);view.evDraft.id=v.id;return true}
 if(d.evday){readEvDraft();const v=view.evDraft,i=v.days.indexOf(d.evday);i>=0?v.days.splice(i,1):v.days.push(d.evday);v.days.sort((x,y)=>WEEKDAYS.indexOf(x)-WEEKDAYS.indexOf(y));openEventEditor(null,v);view.evDraft.id=v.id;return true}
 if(d.clemoji){readClub();view.clubDraft.emoji=d.clemoji;reopenClub();return true}
 if(d.clday){readClub();const D=view.clubDraft,i=D.days.indexOf(d.clday);i>=0?D.days.splice(i,1):D.days.push(d.clday);reopenClub();return true}
 if(d.apptype){view.appDraft.type=d.apptype;document.querySelectorAll('[data-apptype]').forEach(x=>x.classList.toggle('on',x.dataset.apptype===d.apptype));return true}
 if(d.delcal!==undefined){const c=S.cals.splice(+d.delcal,1)[0];if(c){delete ICS[c.url];store.set('loop-ics',ICS)}save();calMenu();render();return true}
 if(d.delfeed!==undefined){const f=(S.feeds||defaultFeeds()).slice();f.splice(+d.delfeed,1);S.feeds=f;save();store.set('loop-news',{});feedsMenu();refreshNews(true);return true}
 switch(d.act){
  case 'ask':openChat();return true;
  case 'explain':{if(!Q)return true;S.chatMode='explain';const q=Q.list[Q.i],pick=q.o[Q.picked];S.revlog.push({ts:Date.now(),id:q.id||null,t:q.t,hint:'loopy'});save();
   openChat(`I just answered a practice question and want to understand it.\nQuestion: ${q.q}\nMy answer: ${pick}\nCorrect answer: ${q.o[q.a]}\nExplain why in 3-4 short lines, then give me one quick follow-up question to check I get it.`);return true}
  case 'closechat':closeChat();return true;
  case 'runresearch':runResearch();return true;
  case 'aireceipt':aiReceipt();return true;
  case 'pushon':enablePush();return true;
  case 'pushoff':disablePush();return true;
  case 'clearchat':S.chat=[];save();drawChat();return true;
  case 'retrychat':{const last=[...S.chat].reverse().find(m=>m.role==='user');S.chat=S.chat.filter(m=>!m.err);if(last){S.chat.pop();sendChat(last.content)}return true}
  case 'toauthchat':closeChat();view.authMode='up';renderAuth();return true;
  case 'profilefromchat':closeChat();go(()=>{view.tab='me';view.course=null});return true;
  case 'newevent':openEventEditor(null);return true;
  case 'saveevent':saveEvent();return true;
  case 'delevent':S.events=S.events.filter(x=>x.id!==view.evDraft.id);save();closeModal();render();toast('Deleted');return true;
  case 'aiimport':aiImport();return true;
  case 'aiparse':aiParse();return true;
  case 'aiadd':{const picks=[...document.querySelectorAll('[data-aipick]')].filter(x=>x.checked).map(x=>view.aiItems[+x.dataset.aipick]);S.events.push(...picks);save();closeModal();view.tab='schedule';view.course=null;render();toast(`Added ${picks.length} to your schedule`);return true}
  case 'calmenu':calMenu();return true;
  case 'icsexport':icsExport();return true;
  case 'notifyon':enableNotify();return true;
  case 'notifyoff':S.settings.notify=false;save();render();return true;
  case 'addcal':{const n=$('#caln').value.trim()||'Calendar',u=$('#calu').value.trim(),err=$('#calerr');if(!/^(https?|webcals?):\/\//i.test(u))return err.textContent='Paste the full calendar link (starts with https:// or webcal://).',true;err.style.color='var(--muted)';err.textContent='Connecting…';try{const txt=await proxyFetch(u);const evs=parseICS(txt);if(!/BEGIN:VCALENDAR/.test(txt))throw new Error('That link isn\'t an .ics calendar.');S.cals.push({name:n,url:u,color:['sky','mint','peach','lav','lemon'][S.cals.length%5]});ICS[u]={at:Date.now(),events:evs};store.set('loop-ics',ICS);save();calMenu();render();toast(`Connected ${n} · ${evs.length} events`)}catch(x){err.style.color='';err.textContent=x.message}return true}
  case 'synccals':await refreshCals(true);calMenu();toast('Calendars synced');return true;
  case 'newclub':openClubEditor(null);return true;
  case 'saveclub':saveClub();return true;
  case 'delclub':{const id=view.clubDraft.id;S.clubs=S.clubs.filter(c=>c.id!==id);S.events=S.events.filter(x=>x.clubId!==id);save();closeModal();render();return true}
  case 'newapp':openAppEditor(null);return true;
  case 'saveapp':saveApp();return true;
  case 'delapp':S.apps=S.apps.filter(x=>x.id!==view.appDraft.id);save();closeModal();render();return true;
  case 'feeds':feedsMenu();return true;
  case 'addfeed':{const n=$('#fdn').value.trim()||'News',u=$('#fdu').value.trim();if(!/^https:\/\//.test(u))return toast('Paste an https feed link'),true;S.feeds=[...(S.feeds||defaultFeeds()),{name:n,url:u}];save();store.set('loop-news',{});feedsMenu();refreshNews(true);return true}
  case 'saveabout':{S.profile={...S.profile,program:$('#ppg').value.trim(),year:$('#pyr').value.trim(),interests:$('#pint').value.trim(),goals:$('#pgoal').value.trim(),city:$('#pcity').value.trim()};save();toast('Saved. Loopy will use this');return true}
 }
 return false;
}
function reopenClub(){const D=view.clubDraft;const keep=clone(D);openClubEditor(S.clubs.some(c=>c.id===D.id)?D.id:null);view.clubDraft=keep;const g=(id,v)=>{const x=$('#'+id);if(x)x.value=v??''};g('cln',keep.name);g('cls',keep.status);g('clr',keep.role);g('clst',keep.start);g('clen',keep.end);g('cll',keep.location);g('clu',keep.url);g('clno',keep.notes);document.querySelectorAll('[data-clemoji]').forEach(x=>x.classList.toggle('on',x.dataset.clemoji===keep.emoji));document.querySelectorAll('[data-clday]').forEach(x=>{const on=keep.days.includes(x.dataset.clday);x.classList.toggle('on',on);x.style.background=on?'':'var(--bg)'})}

/* ---------------- events ---------------- */
function go(fn){fn();render();scrollTo(0,0)}
document.addEventListener('click',async e=>{
 if(e.target.closest('a[href]'))return;
 const b=e.target.closest('[data-askq],button,[data-course],[data-act],[data-editev],[data-editapp],[data-sday],.wcol,#flip,label');if(!b||b.tagName==='LABEL')return;const d=b.dataset;
 if(await osClick(b,d,e))return;
 if(b.id==='flip')return flip();
 if(d.opt!==undefined)return answer(+d.opt);
 if(d.conf!==undefined){if(Q&&Q.pend!=null)finalize(Q.pend,+d.conf);return}
 if(d.mk){return tagMistake(d.mk)}
 if(d.mistakes!==undefined){const m=mistakes().filter(q=>!d.mistakes||TOPIC[q.t]?.course.id===d.mistakes);return startQuiz(shuffle(m).slice(0,10),'Mistakes')}
 if(d.fk!==undefined)return flashAnswer(+d.fk);
 if(d.q){({next:()=>{Q.i++;drawQ()},quit:()=>{if(Q.res.length)drawDone(quizEl());else closeQuiz()},resume:drawQ,hint:giveHint,show:justShow,finish:()=>{Q.list=Q.list.slice(0,Q.i);drawQ()},close:closeQuiz,again:()=>{const m=Q.mode;closeQuiz();startQuiz(buildSet(),'Daily',m)}})[d.q]?.();return}
 if(d.copy){try{await navigator.clipboard.writeText(d.copy);toast('Code copied')}catch{toast(d.copy)}return}
 if(d.tab){closeChat();return go(()=>{view.tab=d.tab;view.course=view.edit=view.addq=null;draft=null})}
 if(d.filter){view.filter=d.filter;return render()}
 if(d.memc!==undefined){view.memC=d.memc||null;return render()}
 if(d.course)return go(()=>{view.course=d.course;view.addq=view.edit=null});
 if(d.cram)return cram(d.cram);
 if(d.revise)return startQuiz(buildSet({topicIds:[d.revise],n:d.n?+d.n:Math.min(6,S.settings.len)}),'Revise');
 if(d.addblock){const [cid,s0,e0]=d.addblock.split('|'),cc=S.courses.find(x=>x.id===cid);return addStudyBlock(todayStr(),+s0,+e0,cc?(cc.code||cc.name):'Study')}
 if(d.recover){const n=Math.max(5,Math.min(30,Math.round(+d.recover/1.2)));return startQuiz(buildSet({n}),'Recovery')}
 if(d.diag){const c=S.courses.find(x=>x.id===d.diag);return startQuiz(buildDiag(c),'Check')}
 if(d.flash)return startQuiz(buildSet({courseId:d.flash,n:12}),'Flashcards','flash');
 if(d.edit)return openEditor(d.edit);
 if(d.share)return openShare(d.share);
 if(d.addq)return go(()=>{view.addq=d.addq;aq={mode:aq.mode||'notes'}});
 if(d.aqmode){aq.t=$('#aqt')?.value;aq.mode=d.aqmode;return render()}
 if(d.delq){S.cq=S.cq.filter(q=>q.id!==d.delq);save();return render()}
 if(d.month){const now=new Date(),ym=view.ym||[now.getFullYear(),now.getMonth()],m=new Date(ym[0],ym[1]+ +d.month,1);view.ym=[m.getFullYear(),m.getMonth()];return render()}
 if(d.len){S.settings.len=+d.len;save();return render()}
 if(d.set){S.settings[d.set]=!S.settings[d.set];save();return render()}
 if(d.theme){S.settings.theme=d.theme;save();return render()}
 if(d.confset){S.settings.conf=d.confset;save();return render()}
 if(d.emoji){syncDraft();draft.emoji=d.emoji;return render()}
 if(d.color){syncDraft();draft.color=d.color;return render()}
 if(d.deltopic!==undefined){syncDraft();draft.topics.splice(+d.deltopic,1);return render()}
 if(d.delexam!==undefined){syncDraft();draft.exams.splice(+d.delexam,1);return render()}
 if(d.pack){const i=S.courses.findIndex(c=>c.id===d.pack);if(i>=0)S.courses.splice(i,1);else S.courses.push(clone(PACKS[0].courses.find(c=>c.id===d.pack)));save();return renderSetup()}
 switch(d.act){
  case 'start':view.authMode='up';return renderAuth();
  case 'signin':view.authMode='in';return renderAuth();
  case 'toauth':closeModal();view.authMode='up';return renderAuth();
  case 'authswap':view.authMode=view.authMode==='up'?'in':'up';return renderAuth();
  case 'guest':S.onboarded=true;save();return render();
  case 'setname':{const v=$('#nm').value.trim();if(!v)return toast('Type your name');S.name=v;S.onboarded=true;save();return render()}
  case 'setupdone':{S.uni=($('#uni')?.value||S.uni).trim();S.setup=true;save();view.tab='home';return render()}
  case 'westernpack':S.setup=false;S.uni=S.uni||'Western University';save();return render();
  case 'daily':return startQuiz(buildSet(),'Daily');
  case 'focus25':return focusStart(25);
  case 'focusstop':return focusStop();
  case 'palette':return openPalette();
  case 'mistakes':return startQuiz(shuffle(mistakes()).slice(0,10),'Mistakes');
  case 'back':return go(()=>{view.course=null});
  case 'newcourse':return openEditor(null);
  case 'canceledit':draft=null;view.edit=null;return render();
  case 'saveedit':return saveEditor();
  case 'addtopic':syncDraft();draft.topics.push({id:uid('t_'),name:'',date:draft.topics.at(-1)?.date||todayStr()});render();return document.querySelector(`[data-tn="${draft.topics.length-1}"]`)?.focus();
  case 'addexam':syncDraft();draft.exams=draft.exams||[];draft.exams.push({id:uid('e_'),name:'',date:addDays(todayStr(),14)});render();return document.querySelector(`[data-en="${draft.exams.length-1}"]`)?.focus();
  case 'delcourse':{if(!confirm('Remove this course and its progress?'))return;const id=draft.id,tids=new Set(draft.topics.map(t=>t.id));S.courses=S.courses.filter(c=>c.id!==id);S.cq=S.cq.filter(q=>!tids.has(q.t));save();draft=null;return go(()=>{view.edit=view.course=null;view.filter='all'})}
  case 'closeaddq':return go(()=>{view.addq=null});
  case 'savenotes':{const items=parseNotes($('#aqn').value),t=$('#aqt').value,err=$('#aqerr');if(!items.length)return err.textContent='No "term: definition" lines found. Put a colon or dash between each term and its definition.';
   items.forEach(it=>{const sib=uid('s_');S.cq.push({id:uid('q_'),t,sib,q:`What is “${it.term}”?`,ans:it.def,kind:'def'});S.cq.push({id:uid('q_'),t,sib,q:`Which term matches: “${it.def}”`,ans:it.term,kind:'term'})});
   aq.t=t;save();render();return toast(`Created ${items.length*2} questions`)}
  case 'saveone':{const q=$('#aqq').value.trim(),a=$('#aqa').value.trim(),t=$('#aqt').value,err=$('#aqerr');if(!q||!a)return err.textContent='Add a question and its correct answer.';
   S.cq.push({id:uid('q_'),t,q,ans:a,wrong:[1,2,3].map(i=>$('#aqw'+i).value.trim()).filter(Boolean),e:$('#aqe').value.trim(),kind:'custom'});aq.t=t;save();render();return toast('Question added')}
  case 'join':return openJoin();
  case 'dojoin':return doJoin();
  case 'closemodal':return closeModal();
  case 'saveprofile':{S.name=$('#pname').value.trim()||S.name;S.uni=$('#puni').value.trim();save();render();return toast('Saved')}
  case 'signout':await sb.auth.signOut();return;
 }
});
document.addEventListener('submit',e=>{if(e.target?.id!=='inboxform')return;e.preventDefault();const i=$('#inboxin'),v=(i?.value||'').trim();if(!v)return;S.inbox=S.inbox||[];S.inbox.unshift({id:uid('in_'),text:v,ts:Date.now()});S.inbox=S.inbox.slice(0,200);save();render();setTimeout(()=>$('#inboxin')?.focus(),30)});
document.addEventListener('input',e=>{const el=e.target;if(el&&el.dataset&&el.dataset.cnote!==undefined){S.cnotes=S.cnotes||{};S.cnotes[el.dataset.cnote]=el.value;clearTimeout(window._cnT);window._cnT=setTimeout(()=>save(),400)}});
document.addEventListener('keydown',e=>{if((e.key==='?'||(e.key==='/'&&e.shiftKey))&&!/INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName||'')&&!Q){e.preventDefault();shortcutsModal()}});
document.addEventListener('change',e=>{
 const el=e.target;if(!el||!el.dataset)return;
 const find=k=>{for(const c of S.courses)for(const x of (c.exams||[]))if(examKey(c,x)===k)return x;return null};
 if(el.dataset.pushtime){const P=pushPrefs();P[el.dataset.pushtime]=el.value||PUSHDEF[el.dataset.pushtime];S.settings.push=P;save();toast('Saved')}
 if(el.dataset.target){const x=find(el.dataset.target);if(x){x.target=+el.value;save();render();toast(`Goal set to ${el.value}%`)}}
 if(el.dataset.actual!==undefined){const x=find(el.dataset.actual);if(x){const v=el.value===''?null:Math.max(0,Math.min(100,+el.value));if(v==null)delete x.actual;else x.actual=v;save();toast(v==null?'Grade cleared':'Grade saved. Loop will learn from it')}}
});
document.addEventListener('keydown',e=>{
 if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'&&S.setup){e.preventDefault();return $('#modal')?closeModal():openPalette()}
 if(e.target.matches?.('input,textarea,select'))return;
 if((e.key==='Enter'||e.key===' ')&&e.target.matches?.('[role=button]')&&!Q){e.preventDefault();e.target.click();return}
 if(!Q)return;
 if(Q.mode==='flash'){
  if(e.key===' '||e.key==='Enter'){e.preventDefault();if($('#flip')&&!Q.flipped)flip();else if(!$('#flip'))$('[data-q="resume"],[data-q="close"]')?.click()}
  else if(Q.flipped&&/^[1-4]$/.test(e.key))flashAnswer(+e.key);
  else if(e.key==='Escape')$('[data-q="quit"]')?.click();return;
 }
 if((e.key==='h'||e.key==='H')&&Q.picked===null&&Q.pend==null&&Q.mode!=='flash'&&$('#hintbar [data-q="hint"]')){giveHint();return}
 if(/^[1-3]$/.test(e.key)&&Q.pend!=null&&Q.picked===null)finalize(Q.pend,+e.key-1);
 else if(/^[1-4]$/.test(e.key)&&Q.picked===null&&$('.opt'))answer(+e.key-1);
 else if((e.key==='Enter'||e.key===' ')&&Q.picked!==null&&$('#nextb')){e.preventDefault();Q.i++;drawQ()}
 else if(e.key==='Escape')$('[data-q="quit"]')?.click();
});
document.addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.id==='nm')$('[data-act="setname"]')?.click();if(e.key==='Enter'&&e.target.id==='jcode')doJoin();if(e.key==='Escape'&&$('#modal'))closeModal();else if(e.key==='Escape'&&$('#chat'))closeChat()});

/* ---------------- boot ---------------- */
sb.auth.onAuthStateChange(async(ev,session)=>{
 const was=user?.id;user=session?.user||null;
 if(ev==='SIGNED_OUT'){S=clone(BLANK);store.set('loop-state',S);view={tab:'home',filter:'all',authMode:'in'};if(!Q)render();return}
 if(user&&S.owner&&S.owner!==user.id)S=clone(BLANK);
 if(user&&was!==user.id){S.owner=user.id;S.onboarded=true;if(!S.name)S.name=user.user_metadata?.name||user.email.split('@')[0];await pull();S.owner=user.id;save()}
 if(!Q&&!$('#modal')&&!view.edit)render();
 if(user){refreshCals();refreshNews();refreshPush()}
});
// ?join=CODE deep link
const jp=new URLSearchParams(location.search).get('join');
render();
if(jp&&S.setup){setTimeout(()=>{openJoin();$('#jcode').value=jp},300)}
if(new URLSearchParams(location.search).get('go')==='daily'&&S.setup){history.replaceState(null,'','/');setTimeout(()=>startQuiz(buildSet(),'Daily'),300)}
focusLoop();
setInterval(notifTick,30000);setTimeout(notifTick,3000);
if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
window.__loop={get S(){return S},render,buildSet,todayPlan};
})();
