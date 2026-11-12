/* FeverTrack · admin: discharge queue, bed board, admissions with waitlist, staff */

function adminStats(){
  const a = active(), el = eligible(), free = freeBeds(), fc = forecast();
  const overdue = el.filter(p => S.today - p.eligibleSince >= 1);
  return `${overdue.length ? `<div class="banner red">⏰ <div><b>${overdue.length} patient(s) eligible for over a day.</b> Every extra night blocks a bed someone on the waitlist needs.</div></div>`:''}
    <div class="stats">
      ${stat('Occupancy', `${a.length}/${BEDS}`, '', '', bar(a.length/BEDS*100))}
      ${stat('Ready to discharge', el.length, 'Process now to free beds', el.length?'alert':'')}
      ${stat('Free beds', free.length, `${S.waitlist.length} waiting for a bed`, 'good')}
      ${stat('Beds likely free in 24h ✨', fc.total, `${fc.cleared} cleared now + ${fc.oneAway} one normal reading away`)}
    </div>`;
}
function viewDischarges(){
  const rows = eligible().filter(matchQ).sort((a,b) => a.eligibleSince - b.eligibleSince);
  const n = cfg().cureDays;
  return `<div class="ph"><div><h1>Discharge queue</h1><p class="sub">Patients land here automatically the moment they log ${n} fever free days in a row. Nobody has to remember to tell admin.</p></div>
    ${rows.length>1?`<div class="acts"><button class="btn primary" onclick="bulkDischarge()">Discharge all ${rows.length}</button></div>`:''}</div>
    ${adminStats()}
    <div class="toolbar"><input class="search" id="q" placeholder="Search by name, bed or ID" value="${esc(V.q)}" oninput="V.q=this.value;refreshList()"></div>
    <div class="card">${rows.length ? `<table><tr><th>Bed</th><th>Patient</th><th>Last ${n} readings</th><th>Eligible since</th><th>Waiting</th><th></th></tr>${rows.map(p => {
      const w = S.today - p.eligibleSince, last = [];
      for(let d=(p.readings[S.today]?S.today:S.today-1), i=0; i<n; i++, d--) last.unshift(p.readings[d]);
      return `<tr><td class="bed">${p.bed}</td><td><a class="pname" href="#/patient/${p.id}" style="color:inherit;text-decoration:none">${esc(p.name)}</a><div class="meta">${p.id} · ${dayNo(p)} days stay</div></td>
        <td>${last.map(r => tempBadge(r)).join(' ')}</td><td>${fmtDay(p.eligibleSince)}</td>
        <td>${w>=1 ? `<span class="badge b-red">${w} day${w>1?'s':''} late</span>` : '<span class="badge b-green">On time</span>'}</td>
        <td style="text-align:right"><button class="btn primary sm" onclick="dischargeModal('${p.id}')">Discharge</button></td></tr>`; }).join('')}</table>` : empty('Nobody is due for discharge right now.')}</div>`;
}
function dischargeModal(pid){
  const p = findP(pid), next = nextFromWaitlist();
  modal(`<h2>Discharge patient</h2><p class="sub">Bed ${p.bed} · ${esc(p.name)} · ${p.id}</p>
    <div class="banner green">✓ Met the rule: ${cfg().cureDays} consecutive fever free days, eligible since ${fmtDay(p.eligibleSince)}.</div>
    <p class="meta">Confirm the patient has left the facility. The bed is marked free and the case counts as cured.</p>
    ${next ? `<label style="display:flex;gap:8px;align-items:center;margin-top:10px"><input type="checkbox" id="dAdmit" checked> Admit <b>${esc(next.name)}</b> (${next.severity} priority, top of waitlist) into bed ${p.bed} straight away</label>`:''}
    <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="doDischarge('${pid}')">Confirm discharge</button></div>`);
}
function doDischarge(pid){
  const cb = $('#dAdmit'), next = nextFromWaitlist();
  const res = Actions.discharge(pid); if(res.err){ toast(res.err,'err'); return; }
  toast(`${findP(pid).name} discharged. Bed ${res.bed} is free.`);
  if(cb && cb.checked && next){ Actions.admit(next, res.bed, next.id); toast(`${next.name} admitted to bed ${res.bed}.`); }
  closeModal(); App.render();
}
function bulkDischarge(){
  const rows = eligible();
  confirmBox(`Discharge ${rows.length} patients?`, 'Confirm all of them have left the facility. Each bed is freed and counted as cured.', 'Discharge all', () => {
    rows.forEach(p => Actions.discharge(p.id)); toast(`${rows.length} patients discharged.`); App.render();
  });
}

function viewBeds(){
  const map = {}; active().forEach(p => map[p.bed] = p);
  let h = '';
  ZONES.forEach(z => {
    h += `<h3 style="margin:18px 0 8px">Zone ${z.id} <span class="meta">beds ${z.from} to ${z.to}</span></h3><div class="beds">`;
    for(let b=z.from; b<=z.to; b++){
      const p = map[b];
      if(!p){ h += `<div class="bedcell free" onclick="go('#/admin/admissions')"><b>${b}</b>Free</div>`; continue; }
      const t = tempToday(p) || lastTemp(p);
      h += `<div class="bedcell ${p.eligibleSince!==null?'elig':''} ${t&&isFever(t.temp)?'fever':''}" onclick="go('#/patient/${p.id}')" title="${esc(p.name)}"><b>${b}</b>${esc(p.name.split(' ')[0])}<br><span class="meta">${tempToday(p)?'🌡':'·'} ${visitToday(p)?'🩺':''} ${dayNo(p)}d</span></div>`;
    }
    h += '</div>';
  });
  return `<div class="ph"><div><h1>Bed board</h1><p class="sub">All ${BEDS} beds by zone. Click any bed to open the patient.</p></div></div>
    ${adminStats()}
    <div class="legend"><span><i style="background:#f0fdf4;border:1px solid #b7e2c3"></i>Free</span><span><i style="background:var(--amber-soft);border:1px solid #f1d39b"></i>Ready to discharge</span><span><i style="background:#fff;border-left:4px solid var(--red)"></i>Fever on last reading</span><span>🌡 measured today · 🩺 visited today · Nd days in centre</span></div>${h}`;
}

const sevRank = {High:0, Normal:1};
function nextFromWaitlist(){ return [...S.waitlist].sort((a,b) => sevRank[a.severity]-sevRank[b.severity] || a.addedDay-b.addedDay || a.time.localeCompare(b.time))[0]; }
function viewAdmissions(){
  const free = freeBeds(), wl = [...S.waitlist].sort((a,b) => sevRank[a.severity]-sevRank[b.severity] || a.addedDay-b.addedDay || a.time.localeCompare(b.time));
  return `<div class="ph"><div><h1>Admissions and waitlist</h1><p class="sub">Incoming patients wait here by priority. When a bed frees up the top of the list is offered that bed.</p></div></div>
    ${adminStats()}
    ${!free.length ? `<div class="banner amber">All ${BEDS} beds are occupied. ${eligible().length ? `Discharging the ${eligible().length} eligible patient(s) frees beds now.` : 'Beds will open as patients meet the discharge rule.'}</div>`:''}
    <div class="grid3">
      <div class="panel"><h3>Waitlist <span class="meta">(${wl.length})</span></h3>
        ${wl.length ? `<table><tr><th>#</th><th>Name</th><th>Priority</th><th>Waiting since</th><th></th></tr>${wl.map((w,i) => `<tr>
          <td>${i+1}</td><td><div class="pname">${esc(w.name)}</div><div class="meta">${w.age}${w.sex}${w.note?' · '+esc(w.note):''}</div></td>
          <td><span class="badge ${w.severity==='High'?'b-red':'b-grey'}">${w.severity}</span></td><td class="meta">${fmtDay(w.addedDay)} ${w.time}</td>
          <td style="text-align:right;white-space:nowrap">${free.length ? `<button class="btn primary sm" onclick="admitFromWait('${w.id}')">Admit to bed ${free[0]}</button>` : '<span class="meta">No bed yet</span>'} <button class="btn sm ghost" onclick="Actions.removeWait('${w.id}');App.render()">✕</button></td></tr>`).join('')}</table>` : empty('Nobody waiting.')}
      </div>
      <div class="panel"><h3>New arrival</h3>
        <div class="field"><label>Full name</label><input id="aName"></div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          <div class="field"><label>Age</label><input id="aAge" type="number" min="0" max="120"></div>
          <div class="field"><label>Sex</label><select id="aSex"><option>F</option><option>M</option></select></div></div>
        <div class="field"><label>Priority</label><select id="aSev"><option>Normal</option><option>High</option></select></div>
        <div class="field"><label>Referral note</label><input id="aNote" placeholder="optional"></div>
        <div id="aMsg"></div>
        <div class="actions">
          <button class="btn" onclick="saveArrival(false)">Add to waitlist</button>
          <button class="btn primary" ${free.length?'':'disabled title="No free bed"'} onclick="saveArrival(true)">Admit${free.length?' to bed '+free[0]:''}</button></div>
      </div>
    </div>`;
}
function readArrival(){
  const d = {name:$('#aName').value.trim(), age:$('#aAge').value, sex:$('#aSex').value, severity:$('#aSev').value, note:$('#aNote').value.trim()};
  if(d.name.length < 2 || d.age==='' || d.age<0 || d.age>120){ $('#aMsg').innerHTML = '<div class="err">Enter a name and a valid age.</div>'; return null; }
  return d;
}
function saveArrival(admitNow){
  const d = readArrival(); if(!d) return;
  if(admitNow){ const b = freeBeds()[0]; const r = Actions.admit(d, b); if(r.err) return toast(r.err,'err'); toast(`${d.name} admitted to bed ${b}. Added to today's nurse round.`); }
  else { Actions.addWait(d); toast(`${d.name} added to the waitlist.`); }
  App.render();
}
function admitFromWait(id){
  const w = S.waitlist.find(x=>x.id===id), b = freeBeds()[0];
  const r = Actions.admit(w, b, id); if(r.err) return toast(r.err,'err');
  toast(`${w.name} admitted to bed ${b}.`); App.render();
}

function viewStaff(){
  return `<div class="ph"><div><h1>Staff accounts</h1><p class="sub">Every action in the app is tied to one of these accounts.</p></div></div>
    <div class="grid3"><div class="card"><table><tr><th>Name</th><th>Role</th><th>Actions logged</th><th></th></tr>${S.staff.map(s => `<tr>
      <td class="pname">${esc(s.name)}</td><td>${ROLE_LABEL[s.role]}</td><td>${S.audit.filter(a=>a.who===s.name).length}</td>
      <td style="text-align:right"><button class="btn sm ghost" onclick="rmStaff('${s.id}')">Remove</button></td></tr>`).join('')}</table></div>
    <div class="panel"><h3>Add staff</h3>
      <div class="field"><label>Name</label><input id="sName"></div>
      <div class="field"><label>Role</label><select id="sRole">${Object.entries(ROLE_LABEL).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></div>
      <div class="field"><label>4 digit PIN</label><input id="sPin" maxlength="4" inputmode="numeric"></div><div id="sMsg"></div>
      <div class="actions"><button class="btn primary" onclick="addStaff()">Add</button></div></div></div>`;
}
function addStaff(){ const r = Actions.addStaff({name:$('#sName').value.trim(), role:$('#sRole').value, pin:$('#sPin').value.trim()}); if(r.err){ $('#sMsg').innerHTML=`<div class="err">${r.err}</div>`; return; } toast('Staff added.'); App.render(); }
function rmStaff(id){ const s=S.staff.find(x=>x.id===id); confirmBox('Remove '+esc(s.name)+'?','They will no longer be able to sign in. Their past actions stay in the audit log.','Remove',()=>{ const r=Actions.removeStaff(id); if(r.err) toast(r.err,'err'); App.render(); }, true); }
