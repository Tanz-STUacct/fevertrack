/* FeverTrack · head doctor: outcomes, reports, audit log, settings */

function phaseStats(from, to){
  const days = []; for(let d=from; d<=to; d++) days.push(dayStats(d));
  const avg = k => days.length ? days.reduce((s,x)=>s+x[k],0)/days.length : 0;
  const o = outcomes(from, to);
  return {measured:avg('measuredPct'), visited:avg('visitedPct'), vbt:days.reduce((s,x)=>s+x.visitBeforeTemp,0)/Math.max(1,days.length), delay:o.avgDelay, los:o.avgLos, mort:o.mort, closed:o.closed};
}
function viewOutcomes(){
  const o = outcomes(), c = cfg(), r7 = rollingMortality(S.today-1);
  const over = o.mort > c.benchmark, warn7 = r7.closed >= 10 && r7.mort > c.benchmark;
  const before = phaseStats(-30, S.goLive-1), after = phaseStats(S.goLive, S.today-1);
  const a = active(), meas = a.filter(tempToday).length, vis = a.filter(visitToday).length;
  const days = []; for(let d=S.today-13; d<=S.today; d++) days.push(dayStats(d));
  const cmp = (k, b, n, fmt, better) => `<div><div class="k">${k}</div><div class="row"><span class="old">${fmt(b)}</span><span class="new" style="color:${better(n,b)?'var(--green)':'var(--red)'}">${fmt(n)}</span></div></div>`;
  return `<div class="ph"><div><h1>Treatment quality</h1><p class="sub">Mortality is measured on closed cases only (cured + died). Patients still in treatment are not counted, so the rate is never flattered.</p></div>
    <div class="acts">${S.simulated?'<span class="sim-tag">History before today is simulated</span>':''}</div></div>
    ${over ? `<div class="banner red">🚨 <div><b>Mortality is ${o.mort.toFixed(1)}%, above the ${c.benchmark}% benchmark.</b> Review recent deaths and treatment protocols.</div></div>`
      : warn7 ? `<div class="banner amber">⚠ <div>Overall rate is within benchmark but the <b>last 7 days are at ${r7.mort.toFixed(1)}%</b>. Early warning.</div></div>`
      : `<div class="banner green">✓ <div>Within benchmark. Success rate <b>${(100-o.mort).toFixed(1)}%</b> against the ${100-c.benchmark}% target.</div></div>`}
    <div class="stats">
      ${stat('Mortality rate', o.mort.toFixed(1)+'%', `${o.died} of ${o.closed} closed cases · benchmark ${c.benchmark}%`, over?'alert':'good')}
      ${stat('Success rate', (100-o.mort).toFixed(1)+'%', `Target ≥ ${100-c.benchmark}%`, over?'alert':'good')}
      ${stat('Last 7 days mortality', r7.mort.toFixed(1)+'%', `${r7.died} of ${r7.closed} closed`, warn7?'alert':'')}
      ${stat('Average stay', o.avgLos.toFixed(1)+' d', 'Admission to discharge')}
    </div>
    <h3 style="margin:6px 0 8px">Before and after FeverTrack <span class="meta">(go live ${fmtDay(S.goLive)})</span></h3>
    <div class="kpi-cmp mb">
      ${cmp('Patients measured daily', before.measured, after.measured, v=>v.toFixed(0)+'%', (n,b)=>n>=b)}
      ${cmp('Patients visited daily', before.visited, after.visited, v=>v.toFixed(0)+'%', (n,b)=>n>=b)}
      ${cmp('Visits before temperature / day', before.vbt, after.vbt, v=>v.toFixed(1), (n,b)=>n<=b)}
      ${cmp('Avg discharge delay', before.delay, after.delay, v=>v.toFixed(2)+' d', (n,b)=>n<=b)}
    </div>
    <div class="grid3">
      <div class="panel"><h3>Daily flow, last 14 days</h3>${barChart({labels:days.map(x=>fmtShort(x.day)), groups:[{name:'Admitted',color:'#93c5fd',values:days.map(x=>x.adm)},{name:'Discharged',color:'#15803d',values:days.map(x=>x.dis)},{name:'Died',color:'#c2410c',values:days.map(x=>x.died),stackOn:1}]})}</div>
      <div class="panel"><h3>Today's process</h3>
        <div class="kv"><span>Temperatures taken</span><b>${meas}/${a.length}</b></div>${bar(meas/a.length*100)}
        <div class="kv" style="margin-top:12px"><span>Doctor visits done</span><b>${vis}/${a.length}</b></div>${bar(vis/a.length*100)}
        <div class="kv" style="margin-top:12px"><span>Visits before temperature</span><b style="color:var(--green)">0 · blocked</b></div>
        <div class="kv"><span>Duplicate readings</span><b style="color:var(--green)">0 · blocked</b></div>
        <div class="kv"><span>Awaiting discharge</span><b>${eligible().length}</b></div>
        <div class="kv"><span>Beds likely free in 24h</span><b>${forecast().total}</b></div>
        <div class="kv"><span>Waitlist</span><b>${S.waitlist.length}</b></div>
        <a class="btn sm" style="display:inline-block;margin-top:12px;text-decoration:none" href="#/reports">Open full reports →</a>
      </div>
    </div>`;
}

function viewReports(){
  const span = V.tabs.span || 30;
  const days = []; for(let d=S.today-span; d<=S.today-1; d++) days.push(dayStats(d));
  const labels = days.map(x => fmtShort(x.day));
  const gi = days.findIndex(x => x.day === S.goLive);
  const mk = gi >= 0 ? gi : null;
  const roll = days.map(x => { const r = rollingMortality(x.day); return r.closed >= 8 ? r.mort : null; });
  const o = outcomes(S.today-span, S.today-1);
  const hist = {}; o.stays.forEach(s => hist[s] = (hist[s]||0)+1);
  const losKeys = Object.keys(hist).map(Number).sort((a,b)=>a-b);
  return `<div class="ph"><div><h1>Reports</h1><p class="sub">Built from raw readings, visits and outcomes. Dashed green line marks the day FeverTrack went live.</p></div>
    <div class="acts"><div class="pill">${[14,30].map(n=>`<button class="${span===n?'on':''}" onclick="V.tabs.span=${n};App.render()">${n} days</button>`).join('')}</div>
      <button class="btn" onclick="exportDaily(${span})">⬇ Daily CSV</button><button class="btn" onclick="exportPatients()">⬇ Patients CSV</button></div></div>
    ${S.simulated?'<p><span class="sim-tag">Days before today are simulated demo data generated with the same rules the app enforces</span></p>':''}
    <div class="stats">
      ${stat('Closed cases', o.closed, `${o.cured} cured · ${o.died} died`)}
      ${stat('Mortality', o.mort.toFixed(1)+'%', 'Benchmark '+cfg().benchmark+'%', o.mort>cfg().benchmark?'alert':'good')}
      ${stat('Average stay', o.avgLos.toFixed(1)+' d', 'Cured patients')}
      ${stat('Avg discharge delay', o.avgDelay.toFixed(2)+' d', 'Eligible → discharged')}
    </div>
    <div class="grid2">
      <div class="panel"><h3>Rolling 7 day mortality vs benchmark</h3>${lineChart({labels, series:[{name:'Mortality %',color:'#c2410c',values:roll}], yMin:0, yMax:40, refLine:cfg().benchmark, refLabel:'benchmark '+cfg().benchmark+'%', marker:mk, markerLabel:'Go live', unit:'%'})}</div>
      <div class="panel"><h3>Round compliance</h3>${lineChart({labels, series:[{name:'Measured %',color:'#0f766e',values:days.map(x=>x.measuredPct)},{name:'Visited %',color:'#1d4ed8',values:days.map(x=>x.visitedPct)}], yMin:60, yMax:100, marker:mk, markerLabel:'Go live', unit:'%'})}</div>
      <div class="panel"><h3>Admissions, discharges and deaths</h3>${barChart({labels, groups:[{name:'Admitted',color:'#93c5fd',values:days.map(x=>x.adm)},{name:'Discharged',color:'#15803d',values:days.map(x=>x.dis)},{name:'Died',color:'#c2410c',values:days.map(x=>x.died),stackOn:1}], marker:mk, markerLabel:'Go live'})}</div>
      <div class="panel"><h3>Average discharge delay (days)</h3>${lineChart({labels, series:[{name:'Delay',color:'#b45309',values:days.map(x=>x.avgDelay)}], yMin:0, yMax:2.5, marker:mk, markerLabel:'Go live'})}</div>
      <div class="panel"><h3>Visits made before temperature</h3>${barChart({labels, groups:[{name:'Visits before temperature',color:'#b45309',values:days.map(x=>x.visitBeforeTemp)}], marker:mk, markerLabel:'Go live'})}</div>
      <div class="panel"><h3>Length of stay, cured patients</h3>${barChart({labels:losKeys.map(k=>k+'d'), groups:[{name:'Patients',color:'#0f766e',values:losKeys.map(k=>hist[k])}]})}</div>
    </div>`;
}
function exportDaily(span){
  const rows = [['Date','Patients present','Measured','Measured %','Visited','Visited %','Visits before temp','Admitted','Discharged','Died','Avg discharge delay']];
  for(let d=S.today-span; d<=S.today-1; d++){ const x=dayStats(d); rows.push([dateOf(d).toISOString().slice(0,10),x.present,x.measured,x.measuredPct.toFixed(1),x.visited,x.visitedPct.toFixed(1),x.visitBeforeTemp,x.adm,x.dis,x.died,x.avgDelay==null?'':x.avgDelay.toFixed(2)]); }
  downloadCSV('fevertrack_daily.csv', rows); audit('Exported daily CSV', span+' days');
}

function viewAudit(){
  const role = V.tabs.auditRole || 'all', q = V.q.trim().toLowerCase();
  const list = S.audit.slice().reverse().filter(a => (role==='all' || a.role===role) && (!q || (a.who+a.action+a.detail+(a.pid||'')).toLowerCase().includes(q))).slice(0,300);
  return `<div class="ph"><div><h1>Audit log</h1><p class="sub">Every write in the app, who did it and when. Nothing can be edited or deleted here.</p></div></div>
    <div class="toolbar"><div class="pill">${['all','nurse','doctor','admin','head','system'].map(r=>`<button class="${role===r?'on':''}" onclick="V.tabs.auditRole='${r}';App.render()">${r==='all'?'All':ROLE_LABEL[r]||'System'}</button>`).join('')}</div>
      <input class="search" id="q" placeholder="Search action, person or patient ID" value="${esc(V.q)}" oninput="V.q=this.value;refreshList()"></div>
    <div class="card">${list.length ? `<table><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th><th>Patient</th></tr>${list.map(a=>`<tr>
      <td class="meta" style="white-space:nowrap">${fmtDay(a.day)} ${a.time}</td><td>${esc(a.who)}<div class="meta">${ROLE_LABEL[a.role]||'System'}</div></td>
      <td><b>${esc(a.action)}</b></td><td class="meta">${esc(a.detail)}</td><td>${a.pid?`<a href="#/patient/${a.pid}">${a.pid}</a>`:''}</td></tr>`).join('')}</table>` : empty('No entries.')}</div>`;
}

function viewSettings(){
  const c = cfg();
  const f = (id,l,v,h,type='number',step='0.1') => `<div class="field"><label>${l}</label><input id="st_${id}" type="${type}" step="${step}" value="${v}"><div class="meta" style="margin-top:4px">${h}</div></div>`;
  return `<div class="ph"><div><h1>Clinical settings</h1><p class="sub">Only the head doctor can change these. Every change is logged and announced to all staff.</p></div></div>
    <div class="grid2">
      <div class="panel"><h3>Clinical rules</h3>
        ${f('fever','Fever threshold (°C)',c.fever,'A reading at or above this counts as fever.')}
        ${f('cureDays','Fever free days needed for discharge',c.cureDays,'Must be consecutive daily readings.','number','1')}
        ${f('critical','Critical temperature (°C)',c.critical,'Readings at or above this alert every doctor.')}
        ${f('benchmark','Expected mortality benchmark (%)',c.benchmark,'Dashboard alerts when the centre goes above this.','number','0.5')}
      </div>
      <div class="panel"><h3>Round deadlines</h3>
        ${f('tempDeadline','Temperature round due by',c.tempDeadline,'Nurses see an overdue banner after this time.','time')}
        ${f('visitDeadline','Doctor round due by',c.visitDeadline,'Doctors see an overdue banner after this time.','time')}
        <div id="stMsg"></div>
        <div class="actions"><button class="btn primary" onclick="saveSettingsUI()">Save settings</button></div>
        <h3 style="margin-top:26px">Demo data</h3><p class="meta">Wipes everything in this browser and regenerates 30 simulated days.</p>
        <button class="btn" onclick="App.resetDemo()">Reset demo data</button>
      </div>
    </div>`;
}
function saveSettingsUI(){
  const g = id => $('#st_'+id).value;
  const n = {fever:+g('fever'), cureDays:parseInt(g('cureDays')), critical:+g('critical'), benchmark:+g('benchmark'), tempDeadline:g('tempDeadline'), visitDeadline:g('visitDeadline')};
  const errs = [];
  if(!(n.fever>=37 && n.fever<=39.5)) errs.push('Fever threshold should be between 37 and 39.5 °C.');
  if(!(n.cureDays>=1 && n.cureDays<=7)) errs.push('Fever free days should be between 1 and 7.');
  if(!(n.critical>n.fever && n.critical<=42.5)) errs.push('Critical temperature must be above the fever threshold.');
  if(!(n.benchmark>0 && n.benchmark<100)) errs.push('Benchmark must be between 0 and 100.');
  if(!n.tempDeadline || !n.visitDeadline || minutes(n.visitDeadline) <= minutes(n.tempDeadline)) errs.push('Doctor round deadline must be after the temperature round deadline.');
  if(errs.length){ $('#stMsg').innerHTML = errs.map(e=>`<div class="err">${e}</div>`).join(''); return; }
  confirmBox('Apply new settings?', 'Discharge eligibility is recalculated for every admitted patient straight away.', 'Apply', () => { Actions.saveSettings(n); toast('Settings saved and staff notified.'); App.render(); });
}
