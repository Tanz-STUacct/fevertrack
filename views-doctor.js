/* FeverTrack · doctor round, visits and deaths */

function viewDoctor(){
  const tab = V.tabs.doc || 'ready';
  const a = active().filter(p => inZone(p, V.zone));
  const ready = a.filter(p => tempToday(p) && !visitToday(p)), waiting = a.filter(p => !tempToday(p) && !visitToday(p));
  const visited = a.filter(visitToday), elig = a.filter(p => p.eligibleSince!==null);
  const crit = ready.filter(p => tempToday(p).temp >= cfg().critical);
  const late = pastDeadline(cfg().visitDeadline) && (ready.length + waiting.length);
  const lists = {ready, waiting, visited, elig};
  const rows = lists[tab].filter(matchQ);
  return `<div class="ph"><div><h1>Doctor round</h1><p class="sub">${V.zone==='ALL'?'All zones':'Zone '+V.zone} · due by ${cfg().visitDeadline}. Patients appear under Ready the moment a nurse logs today's temperature.</p></div></div>
    ${crit.length ? `<div class="banner red">🚨 <div><b>${crit.length} critical reading(s):</b> ${crit.map(p=>'bed '+p.bed).join(', ')}. Shown first.</div></div>`:''}
    ${late ? `<div class="banner amber">⏰ <div>The ${cfg().visitDeadline} visit deadline has passed with ${ready.length+waiting.length} patient(s) not yet seen.</div></div>`:''}
    <div class="stats">
      ${stat('Ready for visit', ready.length, 'Temperature in, not yet seen')}
      ${stat('Waiting on nurse', waiting.length, 'Visit locked until measured')}
      ${stat('Visited today', visited.length, '', 'good', bar(a.length?visited.length/a.length*100:0))}
      ${stat('Ready for discharge', elig.length, 'Already sent to admin')}
    </div>
    ${tabs([['ready','Ready for visit',ready.length],['waiting','Waiting for temperature',waiting.length],['visited','Visited today',visited.length],['elig','Discharge eligible',elig.length]], tab, 'setDocTab')}
    <div class="toolbar"><input class="search" id="q" placeholder="Search by name, bed or ID" value="${esc(V.q)}" oninput="V.q=this.value;refreshList()"></div>
    <div class="card">${docRows(tab, rows)}</div>`;
}
function setDocTab(t){ V.tabs.doc=t; App.render(); }
function docRows(tab, rows){
  const link = p => `<a class="pname" href="#/patient/${p.id}" style="color:inherit;text-decoration:none">${esc(p.name)}</a>`;
  if(tab==='ready'){
    rows.sort((x,y) => tempToday(y).temp - tempToday(x).temp);
    if(!rows.length) return empty('Nobody is ready right now. Check “Waiting for temperature”.');
    return `<table><tr><th>Bed</th><th>Patient</th><th>Today</th><th>Trend</th><th>Streak</th><th></th></tr>${rows.map(p => `<tr>
      <td class="bed">${p.bed}</td><td>${link(p)}<div class="meta">${p.age}${p.sex} · day ${dayNo(p)}</div></td>
      <td>${tempBadge(tempToday(p))} <span class="meta">${tempToday(p).time}</span></td><td>${trendArrow(p)}</td><td>${streakDots(p)}</td>
      <td style="text-align:right"><button class="btn primary sm" onclick="visitModal('${p.id}')">Start visit</button></td></tr>`).join('')}</table>`;
  }
  if(tab==='waiting'){
    rows.sort(byBed);
    if(!rows.length) return empty('Every patient has today\'s temperature.');
    return `<table><tr><th>Bed</th><th>Patient</th><th>Last reading</th><th></th></tr>${rows.map(p => `<tr>
      <td class="bed">${p.bed}</td><td>${link(p)}<div class="meta">${p.id}</div></td><td>${tempBadge(lastTemp(p))}</td>
      <td style="text-align:right">${S.priority[p.id] ? '<span class="badge b-amber">Nurse asked</span>' : `<button class="btn sm" onclick="Actions.requestPriority('${p.id}');toast('Nurses notified. Patient pinned to the top of their list.');App.render()">Ask nurse to measure next</button>`}</td></tr>`).join('')}</table>`;
  }
  if(tab==='visited'){
    rows.sort(byBed);
    if(!rows.length) return empty('No visits logged yet today.');
    return `<table><tr><th>Bed</th><th>Patient</th><th>Today</th><th>Visit</th><th>Note</th></tr>${rows.map(p => `<tr>
      <td class="bed">${p.bed}</td><td>${link(p)}</td><td>${tempBadge(tempToday(p))}</td><td class="meta">${visitToday(p).time} · ${esc(visitToday(p).by)}</td><td class="meta">${esc(visitToday(p).note)}</td></tr>`).join('')}</table>`;
  }
  rows.sort(byBed);
  if(!rows.length) return empty(`No patients have met the ${cfg().cureDays} day rule yet.`);
  return `<table><tr><th>Bed</th><th>Patient</th><th>Eligible since</th><th>Status</th></tr>${rows.map(p => `<tr>
    <td class="bed">${p.bed}</td><td>${link(p)}</td><td>${fmtDay(p.eligibleSince)}</td><td><span class="badge b-green">In admin queue</span></td></tr>`).join('')}</table>`;
}
function trendArrow(p){
  const t = tempToday(p), y = p.readings[S.today-1];
  if(!t || !y) return '<span class="meta">–</span>';
  const d = t.temp - y.temp;
  if(Math.abs(d) < 0.3) return '<span class="meta">→ steady</span>';
  return d > 0 ? `<span style="color:var(--red);font-weight:700">↑ +${d.toFixed(1)}</span>` : `<span style="color:var(--green);font-weight:700">↓ ${d.toFixed(1)}</span>`;
}

function visitModal(pid){
  const p = findP(pid), t = tempToday(p);
  if(!t){ toast('Visit locked until today\'s temperature is recorded.','err'); return; }
  modal(`<div class="ph"><div><h2>Visit · Bed ${p.bed} · ${esc(p.name)}</h2><p class="sub" style="margin:0">${p.id} · ${p.age}${p.sex} · day ${dayNo(p)} · today ${t.temp.toFixed(1)} °C at ${t.time}</p></div><div>${streakDots(p)}</div></div>
    <div class="box" style="margin-top:12px"><h4>Last 10 days</h4>${tempChart(p,10)}</div>
    <div class="field"><label>Assessment and treatment given today</label><textarea id="vNote" placeholder="for example still febrile, started IV fluids"></textarea></div>
    <div class="field"><label>Ongoing treatment plan</label><textarea id="vPlan" style="min-height:60px">${esc(p.plan)}</textarea></div>
    <div id="vMsg"></div>
    <div class="actions"><button class="btn" style="margin-right:auto" onclick="go('#/patient/${p.id}');closeModal()">Open full record</button><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveVisit('${p.id}')">Complete visit</button></div>`, true);
  setTimeout(() => $('#vNote').focus(), 40);
}
function saveVisit(pid){
  const res = Actions.recordVisit(pid, $('#vNote').value, $('#vPlan').value);
  if(res.err){ $('#vMsg').innerHTML = `<div class="err">${res.err}</div>`; return; }
  toast(`Visit logged for bed ${findP(pid).bed}.`); closeModal(); App.render();
}
function deathModal(pid){
  const p = findP(pid);
  modal(`<h2>Record death</h2><p class="sub">Bed ${p.bed} · ${esc(p.name)} · ${p.id}</p>
    <div class="banner red">This closes the case, frees the bed and counts toward the centre's mortality rate. It cannot be undone in the app.</div>
    <div class="field"><label>Time and cause notes</label><textarea id="dNote"></textarea></div>
    <div class="field"><label>Type the bed number (${p.bed}) to confirm</label><input id="dConf"></div><div id="dMsg"></div>
    <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn danger" onclick="saveDeath('${pid}')">Confirm</button></div>`);
}
function saveDeath(pid){
  const p = findP(pid);
  if($('#dConf').value.trim() !== String(p.bed) || !$('#dNote').value.trim()){ $('#dMsg').innerHTML = '<div class="err">Add notes and type the correct bed number.</div>'; return; }
  const bed = p.bed; Actions.recordDeath(pid, $('#dNote').value.trim()); closeModal(); toast(`Death recorded. Bed ${bed} released to admin.`); App.render();
}
