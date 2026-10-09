
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
  return `<div class="wcol ${d===t?'istoday':''}" data-newat="${d}">${ev.map(e=>{const s=t2m(e.start),en=t2m(e.end)||s+60;return `<button class="wev c-${evColor(e)}" style="top:${(s-h0*60)/60*HH}px;height:${Math.max(26,(en-s)/60*HH-3)}px;left:calc(${e._l/L*100}% + 2px);width:calc(${100/L}% - 4px)" ${e.readonly?(e.course?`data-course="${e.course}"`:''):`data-editev="${e.id}"`} title="${esc(e.title)}"><b>${esc(e.title)}</b><span>${fmtTime(e.start)}${e.location?' · '+esc(e.location):''}</span></button>`}).join('')}${d===t&&nowM>=h0*60&&nowM<=h1*60?`<div class="nowline" style="top:${(nowM-h0*60)/60*HH}px"></div>`:''}</div>`};
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
 osInit();const e=id?S.events.find(x=>x.id===id):null;
 const d=e?clone(e):{id:uid('ev_'),kind:'class',title:'',location:'',days:[],date:todayStr(),start:'10:30',end:'11:30',startDate:todayStr(),endDate:'',remind:15,notes:'',...preset};
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
 if(!S.settings?.notify||!S.setup)return;
 const now=new Date(),d=todayStr(),fired=store.get('loop-fired',{}),nm=now.getHours()*60+now.getMinutes();
 eventsOn(d).forEach(e=>{if(!e.start)return;const r=e.remind==null?15:+e.remind;if(r<0||r>=1440)return;const diff=t2m(e.start)-nm,key=d+'|'+e.id;
  if(diff<=r&&diff>=-1&&!fired[key]){fired[key]=1;notify(`${KIND[e.kind]?.e||''} ${e.title} ${diff<=0?'is starting':`in ${diff} min`}`,[fmtTime(e.start),e.location].filter(Boolean).join(' · '))}});
 const tm=addDays(d,1);eventsOn(tm).forEach(e=>{if(+e.remind===1440&&nm>=18*60){const key=tm+'|'+e.id+'|day';if(!fired[key]){fired[key]=1;notify(`Tomorrow: ${e.title}`,[fmtTime(e.start),e.location].filter(Boolean).join(' · '))}}});
 if(nm>=8*60&&!fired['digest'+d]){fired['digest'+d]=1;const big=[...eventsOn(d),...eventsOn(tm)].filter(e=>e.kind==='exam'||e.kind==='deadline');if(big.length)notify(`📅 ${big.length} exam${big.length>1?'s':''}/deadline${big.length>1?'s':''} today or tomorrow`,big.map(e=>e.title).slice(0,3).join(' · '))}
 Object.keys(fired).forEach(k=>{if(k.slice(0,10)<addDays(d,-3)&&!k.startsWith('digest'))delete fired[k]});
 store.set('loop-fired',fired);
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
  courses:S.courses.map(c=>{const s=courseStats(c),n=s.next;return {code:c.code,name:c.name,knowledgePct:Math.round(s.know*100),topicsBehind:s.behind,nextExam:n?{name:n.name,date:n.date,predictedPct:Math.round(predictScore(c,n)*100)}:null}}),
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
 if(!el){el=document.createElement('div');el.id='chat';el.className='chatwrap';el.setAttribute('role','dialog');el.setAttribute('aria-label','Ask Loopy');document.body.appendChild(el);requestAnimationFrame(()=>el.classList.add('open'))}
 drawChat();if(q)sendChat(q);else setTimeout(()=>$('#chatin')?.focus(),250);
}
function closeChat(){const el=$('#chat');if(!el)return;el.classList.remove('open');setTimeout(()=>el.remove(),250)}
function drawChat(){
 const el=$('#chat');if(!el)return;
 const msgs=S.chat;
 el.innerHTML=`<div class="chatpanel">
  <div class="chathead">${MASCOT(52,chatBusy?'think':'happy',false)}<div style="flex:1"><div style="font-weight:700;font-size:18px">Loopy</div><div class="muted" style="font-size:12px">${chatBusy?'Thinking…':'Your uni, life & career sidekick'}</div></div>
   ${msgs.length?`<button class="iconbtn sm" data-act="clearchat" aria-label="New chat" title="New chat">↺</button>`:''}<button class="iconbtn sm" data-act="closechat" aria-label="Close">${ICON.x}</button></div>
  <div class="chatbody" id="chatbody">
   ${!msgs.length?`<div class="chatwelcome">${MASCOT(120)}<h2 style="margin:8px 0 4px">Hey ${esc(S.name||'there')}! I'm Loopy.</h2><p class="muted" style="font-size:14px;line-height:1.55;margin:0 0 14px">I know your classes, schedule, clubs and applications. Ask me about ${esc(S.uni||'your university')}, or let me find opportunities to level up your uni life, career and wellbeing.</p>
    <div class="chips">${ASKS.map(([e,q])=>`<button class="qchip" data-askq="${esc(q)}">${e} ${esc(q)}</button>`).join('')}</div>
    ${!S.profile.interests&&!S.profile.goals?`<p class="hint" style="margin-top:14px">Tip: add your program, interests and career goals in <button class="link" data-act="profilefromchat">Profile</button> for sharper suggestions.</p>`:''}</div>`
   :msgs.map(m=>`<div class="bubble ${m.role}">${m.role==='assistant'?mdLite(m.content):esc(m.content)}${m.sources?.length?`<div class="srcs">${m.sources.map(s=>`<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc((s.title||s.url).slice(0,60))}</a>`).join('')}</div>`:''}${m.err?`<div style="margin-top:8px"><button class="link" data-act="retrychat">Try again</button></div>`:''}</div>`).join('')}
   ${chatBusy?'<div class="bubble assistant typing"><i></i><i></i><i></i></div>':''}
  </div>
  <form class="chatin" id="chatform"><textarea id="chatin" rows="1" placeholder="${user?'Ask Loopy anything…':'Sign in to chat with Loopy'}" ${user?'':'disabled'} aria-label="Message Loopy"></textarea><button class="btn" type="submit" ${chatBusy||!user?'disabled':''} aria-label="Send">${ICON.arrow}</button></form>
  ${user?'':`<div style="padding:0 16px 16px"><button class="btn full" data-act="toauthchat">Create a free account</button></div>`}
 </div>`;
 const b=$('#chatbody');b.scrollTop=b.scrollHeight;
 const f=$('#chatform'),ta=$('#chatin');
 f.onsubmit=e=>{e.preventDefault();const v=ta.value.trim();if(v&&!chatBusy)sendChat(v)};
 ta.onkeydown=e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();f.requestSubmit()}};
 ta.oninput=()=>{ta.style.height='auto';ta.style.height=Math.min(140,ta.scrollHeight)+'px'};
}
async function sendChat(text){
 if(!user){drawChat();return}
 S.chat=S.chat.filter(m=>!m.err);S.chat.push({role:'user',content:text});chatBusy=true;drawChat();
 try{const r=await callAI({mode:'chat',messages:S.chat.map(({role,content})=>({role,content}))});S.chat.push({role:'assistant',content:r.text||'…',sources:r.sources||[]})}
 catch(e){S.chat.push({role:'assistant',content:e.code==='not_configured'?'I\'m almost ready! The AI key for Loop hasn\'t been added yet. Once the owner adds it, I can answer questions and find opportunities.':e.message,err:true})}
 chatBusy=false;S.chat=S.chat.slice(-30);save();drawChat();setTimeout(()=>$('#chatin')?.focus(),50);
}
