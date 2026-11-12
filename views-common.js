/* FeverTrack · login, patient directory, patient profile, alerts */
const V = {q:'', tabs:{}, zone:'ALL', loginRole:null};

/* ---------- Login with staff PIN ---------- */
function viewLogin(){
  const R = [['nurse','🩺','Nurse','Daily temperature round by zone. Tap or voice entry.'],
             ['doctor','👨‍⚕️','Doctor','Visit queue that only shows measured patients.'],
             ['admin','🗂','Admin staff','Discharges, beds, waitlist and staff.'],
             ['head','📊','Head doctor','Doctor tools plus outcomes, reports, audit and settings.']];
  if(!V.loginRole) return `<div class="login">
    <div class="logo" style="justify-content:center;font-size:26px"><span style="width:40px;height:40px;font-size:22px">🌡</span>FeverTrack</div>
    <h1 style="margin-top:14px">Sign in to the ward</h1>
    <p class="sub">Quarantine and treatment centre · ${BEDS} beds · ${fmtDay(S.today)}</p>
    <div class="roles">${R.map(([id,ic,t,d]) => `<div class="role" onclick="V.loginRole='${id}';App.render()"><div class="ic">${ic}</div><h3>${t}</h3><p>${d}</p></div>`).join('')}</div>
    <p class="hint">Prototype with ${S.simulated?'30 days of <b>simulated</b> history':'live data'}. Open two tabs (for example nurse and doctor) to watch screens sync live.</p></div>`;
  const staff = S.staff.filter(s => s.role === V.loginRole);
  return `<div class="pinbox">
    <button class="btn ghost sm" onclick="V.loginRole=null;App.render()">← Back</button>
    <h2 style="margin:10px 0 4px">${ROLE_LABEL[V.loginRole]} sign in</h2>
    <div class="field"><label>Name</label><select id="lgName">${staff.map(s=>`<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></div>
    <div class="field"><label>4 digit PIN</label><input id="lgPin" class="pin" type="password" maxlength="4" inputmode="numeric" onkeydown="if(event.key==='Enter')doLogin()"></div>
    <div id="lgMsg"></div>
    <button class="btn primary" style="width:100%;margin-top:14px;padding:10px" onclick="doLogin()">Sign in</button>
    <div class="demo-pins"><b>Demo PINs</b><br>Nurse 1111 · Doctor 2222 · Admin 3333 · Head doctor 4444</div></div>`;
}
function doLogin(){
  const s = S.staff.find(x => x.id === $('#lgName').value);
  if(!s || $('#lgPin').value !== s.pin){ $('#lgMsg').innerHTML = '<div class="err">Wrong PIN. Try again.</div>'; $('#lgPin').value=''; return; }
  me = {id:s.id, name:s.name, role:s.role};
  try{ sessionStorage.setItem('ft_me', JSON.stringify(me)); }catch(e){}
  audit('Signed in', ROLE_LABEL[s.role]); saveState();
  V.loginRole = null; go(App.home());
}
function logout(){ audit('Signed out',''); saveState(); me=null; try{ sessionStorage.removeItem('ft_me'); }catch(e){} go('#/login'); }

/* ---------- Patient directory ---------- */
function viewPatients(){
  const f = V.tabs.patients || 'active';
  const list = S.patients.filter(p => f==='all' || (f==='active' ? p.status==='active' : f==='closed' ? p.status!=='active' : p.eligibleSince!==null && p.status==='active'));
  return `<div class="ph"><div><h1>Patients</h1><p class="sub">Everyone who has been through the centre. Click a row for the full record.</p></div>
    <div class="acts"><button class="btn" onclick="exportPatients()">⬇ Export CSV</button></div></div>
    ${tabs([['active','Admitted',active().length],['eligible','Ready for discharge',eligible().length],['closed','Closed',S.patients.length-active().length],['all','All',S.patients.length]], f, 'setPatTab')}
    <div class="toolbar"><input class="search" id="q" placeholder="Search by name, bed or patient ID" value="${esc(V.q)}" oninput="V.q=this.value;refreshList()"></div>
    <div class="card" id="list">${patientRows(list)}</div>`;
}
function setPatTab(t){ V.tabs.patients=t; App.render(); }
function matchQ(p){ const q=V.q.trim().toLowerCase(); return !q || p.name.toLowerCase().includes(q) || String(p.bed??p.freedBed)===q || p.id.toLowerCase().includes(q); }
function patientRows(list){
  list = list.filter(matchQ).sort((a,b) => (a.bed??999)-(b.bed??999) || (b.outcomeDay??0)-(a.outcomeDay??0));
  if(!list.length) return empty('No patients match.');
  const shown = list.slice(0,150);
  return `<table><tr><th>Bed</th><th>Patient</th><th>Status</th><th>Admitted</th><th>Stay</th><th>Last reading</th></tr>${shown.map(p=>`<tr class="click" onclick="go('#/patient/${p.id}')">
    <td class="bed">${p.bed ?? '<span class="meta">'+(p.freedBed??'–')+'</span>'}</td><td><div class="pname">${esc(p.name)}</div><div class="meta">${p.id} · ${p.age}${p.sex}</div></td>
    <td>${statusBadge(p)}</td><td class="meta">${fmtDay(p.admittedDay)}</td><td>${dayNo(p)} d</td><td>${tempBadge(lastTemp(p))}</td></tr>`).join('')}</table>${list.length>150?`<div class="empty">Showing 150 of ${list.length}. Refine the search.</div>`:''}`;
}
function exportPatients(){
  const rows = [['ID','Name','Age','Sex','Status','Bed','Admitted','Outcome date','Length of stay','Discharge delay (days)','Readings','Visits']];
  S.patients.forEach(p => rows.push([p.id,p.name,p.age,p.sex,p.status,p.bed??p.freedBed,dateOf(p.admittedDay).toISOString().slice(0,10),p.outcomeDay!=null?dateOf(p.outcomeDay).toISOString().slice(0,10):'',dayNo(p),p.dischargeDelay??'',Object.keys(p.readings).length,Object.keys(p.visits).length]));
  downloadCSV('fevertrack_patients.csv', rows); audit('Exported patient CSV','');
}

/* ---------- Patient profile ---------- */
function viewPatient(id){
  const p = findP(id); if(!p) return empty('Patient not found.');
  const r = me.role, isDoc = r==='doctor'||r==='head', act = p.status==='active';
  const t = tempToday(p), v = visitToday(p);
  const acts = [];
  if(act && r==='nurse') acts.push(t ? `<button class="btn" onclick="tempModal('${p.id}',true)" ${v?'disabled title="Doctor already acted on this reading"':''}>Correct today's reading</button>` : `<button class="btn primary" onclick="tempModal('${p.id}')">Record temperature</button>`);
  if(act && isDoc){
    if(!t) acts.push(S.priority[p.id] ? '<span class="badge b-amber" style="align-self:center">Nurse asked to measure next</span>' : `<button class="btn" onclick="Actions.requestPriority('${p.id}');toast('Nurses notified');App.render()">Ask nurse to measure next</button>`);
    else if(!v) acts.push(`<button class="btn primary" onclick="visitModal('${p.id}')">Start visit</button>`);
    acts.push(`<button class="btn" style="color:var(--red)" onclick="deathModal('${p.id}')">Record death</button>`);
  }
  if(act && r==='admin' && p.eligibleSince!==null) acts.push(`<button class="btn primary" onclick="dischargeModal('${p.id}')">Discharge</button>`);
  if(p.status==='discharged' || (act && p.eligibleSince!==null)) acts.push(`<button class="btn" onclick="printSummary('${p.id}')">🖨 Discharge summary</button>`);
  return `<button class="btn ghost sm" onclick="history.back()">← Back</button>
    <div class="ph" style="margin-top:8px"><div><h1>${p.bed?'Bed '+p.bed+' · ':''}${esc(p.name)} ${statusBadge(p)}</h1>
      <p class="sub">${p.id} · ${p.age} ${p.sex==='F'?'female':'male'} · Zone ${p.bed?zoneOf(p.bed):zoneOf(p.freedBed||1)} · admitted ${fmtDay(p.admittedDay)}${p.outcomeDay!=null?' · closed '+fmtDay(p.outcomeDay):''}</p></div>
      <div class="acts">${acts.join('')}</div></div>
    ${act && isDoc && !t ? `<div class="banner amber">🔒 Visit locked until today's temperature is recorded.</div>`:''}
    ${act && v ? `<div class="banner green">✓ Visited today at ${v.time} by ${esc(v.by)}.</div>`:''}
    <div class="stats">
      ${stat('Today', t ? `${t.temp.toFixed(1)}°` : '–', t ? `${t.time} by ${esc(t.by)}` : act ? 'Not measured yet' : 'Closed case', t&&isFever(t.temp)?'alert':'')}
      ${stat('Fever free streak', `${Math.min(streak(p),cfg().cureDays)}/${cfg().cureDays}`, p.eligibleSince!==null ? 'Eligible since '+fmtDay(p.eligibleSince) : 'Consecutive normal days')}
      ${stat('Length of stay', dayNo(p)+' days', p.dischargeDelay!=null ? `Discharge delay ${p.dischargeDelay} day(s)` : '')}
      ${stat('Readings / visits', `${Object.keys(p.readings).length} / ${Object.keys(p.visits).length}`, `${missedDays(p)} missed day(s)`)}
    </div>
    <div class="grid3">
      <div>
        <div class="panel mb"><h3>Temperature trend</h3>${tempChart(p, 21)}</div>
        <div class="panel"><h3>Treatment plan</h3>
          ${isDoc && act ? `<textarea id="planTxt" style="width:100%;min-height:70px;padding:9px;border:1px solid var(--line);border-radius:8px">${esc(p.plan)}</textarea><div class="actions" style="margin-top:8px"><button class="btn sm" onclick="savePlan('${p.id}')">Save plan</button></div>` : `<p>${esc(p.plan)||'<span class="meta">No plan yet</span>'}</p>`}
          ${p.status==='deceased'?`<div class="banner red" style="margin-top:10px">Deceased on ${fmtDay(p.outcomeDay)}. ${esc(p.deathNote||'')} <span class="meta">Recorded by ${esc(p.deathBy||'')}</span></div>`:''}
        </div>
      </div>
      <div class="panel"><h3>Timeline</h3><div class="tl" style="max-height:560px;overflow:auto">${timeline(p)}</div></div>
    </div>`;
}
function missedDays(p){ let n=0; const end = p.outcomeDay ?? S.today-1; for(let d=p.admittedDay; d<=end; d++) if(!p.readings[d] && !(p.status==='deceased'&&d===p.outcomeDay)) n++; return n; }
function savePlan(id){ const p=findP(id), v=$('#planTxt').value.trim(); p.plan=v; audit('Updated treatment plan', v, id); saveState(); toast('Plan saved'); }
function timeline(p){
  const ev = [];
  ev.push({d:p.admittedDay, t:'00:00', c:'', h:'Admitted to bed '+(p.bed??p.freedBed)});
  Object.entries(p.readings).forEach(([d,r]) => ev.push({d:+d, t:r.time, c:isFever(r.temp)?'red':'green', h:`Temperature ${r.temp.toFixed(1)} °C`, s:`by ${r.by}${r.corrected?` · corrected from ${r.prevTemp} (${r.reason})`:''}`}));
  Object.entries(p.visits).forEach(([d,v]) => ev.push({d:+d, t:v.time, c:'', h:'Doctor visit', s:`${v.by}: ${v.note}`}));
  for(let d=p.admittedDay; d<(p.outcomeDay??S.today); d++) if(!p.readings[d] && !(p.status==='deceased'&&d===p.outcomeDay)) ev.push({d, t:'23:59', c:'amber', h:'No temperature recorded', s:'Streak reset'});
  if(p.eligibleSince!=null) ev.push({d:p.eligibleSince, t:'23:00', c:'green', h:`Met the ${cfg().cureDays} day rule`, s:'Sent to admin discharge queue'});
  if(p.status==='discharged') ev.push({d:p.outcomeDay, t:'23:30', c:'green', h:'Discharged', s:`Delay after eligibility: ${p.dischargeDelay} day(s)`});
  if(p.status==='deceased') ev.push({d:p.outcomeDay, t:'23:30', c:'grey', h:'Deceased', s:p.deathNote});
  ev.sort((a,b) => b.d-a.d || b.t.localeCompare(a.t));
  let html='', last=null;
  ev.forEach(e => { if(e.d!==last){ html += `<div class="day">${fmtDay(e.d)}</div>`; last=e.d; }
    html += `<div class="ev ${e.c}"><div><b>${esc(e.h)}</b></div>${e.s?`<div class="meta">${esc(e.s)}</div>`:''}${e.t!=='00:00'&&e.t<'23:00'?`<div class="when">${e.t}</div>`:''}</div>`; });
  return html;
}
function printSummary(id){
  const p = findP(id), rd = Object.keys(p.readings).map(Number).sort((a,b)=>a-b);
  $('#print').innerHTML = `<h1>Discharge summary</h1><p><b>${esc(p.name)}</b> · ${p.id} · ${p.age} ${p.sex}</p>
    <p>Admitted ${fmtDay(p.admittedDay)} · ${p.status==='discharged'?'Discharged '+fmtDay(p.outcomeDay):'Eligible since '+fmtDay(p.eligibleSince)} · Stay ${dayNo(p)} days</p>
    <p>Discharge criterion met: ${cfg().cureDays} consecutive days below ${cfg().fever} °C.</p>
    <p><b>Treatment plan:</b> ${esc(p.plan)}</p>
    <table><tr><th>Date</th><th>Temperature</th><th>Doctor note</th></tr>${rd.map(d=>`<tr><td>${fmtDay(d)}</td><td>${p.readings[d].temp.toFixed(1)} °C</td><td>${esc(p.visits[d]?p.visits[d].note:'')}</td></tr>`).join('')}</table>
    <p style="margin-top:30px">Signed: ____________________ &nbsp; Date: __________</p>`;
  audit('Printed discharge summary','',id); saveState();
  window.print();
}

/* ---------- Alerts ---------- */
function viewAlerts(){
  const list = myNotes();
  const ic = {crit:'🚨', warn:'⚠️', ok:'✅', info:'🔔'};
  return `<div class="ph"><div><h1>Alerts</h1><p class="sub">Only what matters to your role. Newest first.</p></div>
    <div class="acts"><button class="btn" onclick="Actions.markRead();App.render()">Mark all read</button></div></div>
    <div class="card">${list.length ? list.slice(0,80).map(n => `<div class="note-row lvl-${n.level} ${n.readBy.includes(me.id)?'':'unread'}" ${n.link?`style="cursor:pointer" onclick="go('${n.link}')"`:''}>
      <div class="ic">${ic[n.level]||'🔔'}</div><div><div class="t">${esc(n.text)}</div><div class="m">${fmtDay(n.day)} · ${n.time}</div></div></div>`).join('') : empty('No alerts.')}</div>`;
}
