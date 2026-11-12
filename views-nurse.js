/* FeverTrack · nurse round, temperature entry and hands free voice entry */

function viewNurse(){
  const tab = V.tabs.nurse || 'pending';
  const a = active().filter(p => inZone(p, V.zone));
  const pending = a.filter(p => !tempToday(p)), done = a.filter(tempToday);
  const pri = pending.filter(p => S.priority[p.id]).length;
  const pct = a.length ? Math.round(done.length/a.length*100) : 100;
  const late = pastDeadline(cfg().tempDeadline) && pending.length;
  const rows = (tab==='pending' ? pending : done).filter(matchQ);
  return `<div class="ph"><div><h1>Today's temperature round</h1><p class="sub">${V.zone==='ALL'?'All zones':'Zone '+V.zone} · due by ${cfg().tempDeadline}. Patients leave this list once measured so nobody is measured twice or missed.</p></div></div>
    ${late ? `<div class="banner red">⏰ <div><b>Round is overdue.</b> ${pending.length} patient(s) still not measured and the ${cfg().tempDeadline} deadline has passed.</div></div>`:''}
    ${pri ? `<div class="banner amber">👨‍⚕️ <div><b>${pri} doctor request(s).</b> These patients are pinned to the top of your list.</div></div>`:''}
    <div class="stats">
      ${stat('Still to measure', pending.length, pct+'% of round complete', '', bar(pct))}
      ${stat('Measured today', done.length, done.filter(p=>isFever(tempToday(p).temp)).length+' with fever')}
      ${stat('Critical today', done.filter(p=>tempToday(p).temp>=cfg().critical).length, '≥ '+cfg().critical+' °C, doctors alerted')}
    </div>
    <div class="panel mb" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
      <b>🎙 Hands free entry</b><span class="meta">Gloves on? Say “bed 12, 38.4”. Every reading goes through the same checks.</span>
      <button class="btn mic ${Voice.on?'live':''}" id="micBtn" onclick="Voice.toggle()">${Voice.on?'■ Listening… tap to stop':'Start voice'}</button>
      <button class="btn sm ghost" onclick="Voice.simulate()">Type a phrase instead</button>
      <span class="heard" id="heard">${Voice.last?'Heard: “'+esc(Voice.last)+'”':''}</span>
    </div>
    ${tabs([['pending','To measure',pending.length],['done','Measured today',done.length]], tab, 'setNurseTab')}
    <div class="toolbar"><input class="search" id="q" placeholder="Search by name, bed or ID" value="${esc(V.q)}" oninput="V.q=this.value;refreshList()"></div>
    <div class="card">${tab==='pending' ? nursePending(rows) : nurseDone(rows)}</div>`;
}
function setNurseTab(t){ V.tabs.nurse=t; App.render(); }
function nursePending(rows){
  rows.sort((x,y) => (S.priority[y.id]?1:0)-(S.priority[x.id]?1:0) || byBed(x,y));
  if(!rows.length) return empty('✅ Round complete for this zone.');
  return `<table><tr><th>Bed</th><th>Patient</th><th>Last reading</th><th>Fever free streak</th><th></th></tr>${rows.map(p => { const l=lastTemp(p); return `<tr>
    <td class="bed">${p.bed}<div class="meta">Zone ${zoneOf(p.bed)}</div></td>
    <td><a class="pname" href="#/patient/${p.id}" style="color:inherit;text-decoration:none">${esc(p.name)}</a> ${S.priority[p.id]?`<span class="badge b-red">${esc(S.priority[p.id].by)} waiting</span>`:''} ${p.admittedDay===S.today?'<span class="badge b-blue">New today</span>':''}<div class="meta">${p.id} · day ${dayNo(p)} of stay</div></td>
    <td>${l ? tempBadge(l)+' <span class="meta">'+(p.readings[S.today-1]?'yesterday':'earlier')+'</span>' : '<span class="meta">none yet</span>'}</td>
    <td>${streakDots(p)}</td>
    <td style="text-align:right"><button class="btn primary sm" onclick="tempModal('${p.id}')">Record temp</button></td></tr>`; }).join('')}</table>`;
}
function nurseDone(rows){
  rows.sort(byBed);
  if(!rows.length) return empty('No readings yet today.');
  return `<table><tr><th>Bed</th><th>Patient</th><th>Today</th><th>Recorded</th><th></th></tr>${rows.map(p => { const r=tempToday(p); return `<tr>
    <td class="bed">${p.bed}</td><td><a class="pname" href="#/patient/${p.id}" style="color:inherit;text-decoration:none">${esc(p.name)}</a><div class="meta">${p.id}</div></td>
    <td>${tempBadge(r)} ${r.corrected?'<span class="badge b-amber">corrected</span>':''}</td><td class="meta">${r.time} by ${esc(r.by)}</td>
    <td style="text-align:right"><button class="btn sm" ${visitToday(p)?'disabled title="Doctor already acted on this reading"':''} onclick="tempModal('${p.id}',true)">Correct</button></td></tr>`; }).join('')}</table>`;
}

function tempModal(pid, correct){
  const p = findP(pid), cur = tempToday(p);
  if(!correct && cur){ toast(`Already measured today at ${cur.time} by ${cur.by}.`, 'err'); return; }
  modal(`<h2>${correct?'Correct reading':'Record temperature'}</h2><p class="sub" style="margin:0">Bed ${p.bed} · ${esc(p.name)} · ${p.id}</p>
    ${correct ? `<div class="banner amber" style="margin-top:12px">Current reading ${cur.temp.toFixed(1)} °C by ${esc(cur.by)} at ${cur.time}. The original stays in the audit log.</div>`:''}
    <div class="field"><label>Temperature (°C)</label><input id="tIn" class="big-temp" type="number" step="0.1" inputmode="decimal" placeholder="37.0" oninput="validateT()" onkeydown="if(event.key==='Enter')saveT('${pid}',${!!correct})"></div>
    <div id="tMsg"></div>
    ${correct ? `<div class="field"><label>Reason for correction</label><input id="tReason" placeholder="for example wrong patient or thermometer error"></div>`:''}
    <div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn primary" onclick="saveT('${pid}',${!!correct})">Save reading</button></div>`);
  setTimeout(() => $('#tIn').focus(), 30);
}
function validateT(){
  const c = cfg(), v = parseFloat($('#tIn').value), m = $('#tMsg');
  if(isNaN(v)){ m.innerHTML=''; return null; }
  if(v < c.minValid || v > c.maxValid){ m.innerHTML = `<div class="err">${v} °C is outside the possible range (${c.minValid} to ${c.maxValid}). Check the thermometer or the units.</div>`; return null; }
  if(v >= c.critical) m.innerHTML = `<div class="warn">⚠ Critical fever. Saving alerts every doctor straight away.</div>`;
  else if(v < 35) m.innerHTML = `<div class="warn">Unusually low. Please measure again before saving.</div>`;
  else m.innerHTML = `<div class="meta" style="margin-top:6px">${isFever(v) ? `🔴 Counts as fever (≥ ${c.fever} °C). Fever free streak resets.` : `🟢 No fever. Counts toward the ${c.cureDays} day discharge rule.`}</div>`;
  return v;
}
function saveT(pid, correct){
  const v = validateT();
  if(v == null){ if(!$('#tMsg').innerHTML) $('#tMsg').innerHTML = '<div class="err">Enter a temperature.</div>'; return; }
  let reason = null;
  if(correct){ reason = $('#tReason').value.trim(); if(!reason){ $('#tMsg').innerHTML += '<div class="err">A reason is required to correct a reading.</div>'; return; } }
  const res = Actions.recordTemp(pid, v, reason);
  if(res.err){ toast(res.err,'err'); return; }
  afterTemp(pid, v, res); closeModal(); App.render();
}
function afterTemp(pid, v, res){
  const p = findP(pid);
  toast(`Bed ${p.bed} · ${v.toFixed(1)} °C saved. ${isFever(v)?'Fever.':'No fever.'} Doctor queue updated.`);
  if(res.newly) toast(`🎉 ${p.name} completed ${cfg().cureDays} fever free days. Sent to discharge queue.`);
  if(res.critical) toast(`⚠ Critical temperature for bed ${p.bed}. Doctors alerted.`);
}

/* ---------- voice entry (Web Speech API, works in Chrome and Edge) ---------- */
const NUMW = {zero:0,one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,thirteen:13,fourteen:14,fifteen:15,sixteen:16,seventeen:17,eighteen:18,nineteen:19,twenty:20,thirty:30,forty:40,fifty:50,sixty:60,seventy:70};
const Voice = {
  on:false, rec:null, last:'',
  parse(t){
    t = t.toLowerCase().replace(/point/g,'.')
      .replace(new RegExp('\\b('+Object.keys(NUMW).join('|')+')\\b','g'), w => NUMW[w])
      .replace(/\b([2-7]0)[\s-]+([1-9])\b/g, (m,a,b) => +a + +b)
      .replace(/\s*\.\s*/g,'.');
    const bed = t.match(/(?:bed|bad|bid|bedroom)\s*(?:number\s*)?(\d{1,2})/);
    const nums = (t.replace(/(?:bed|bad|bid)\s*(?:number\s*)?\d{1,2}/,'').match(/\d{2}(?:\.\d)?/g) || []).map(Number).filter(n => n>=cfg().minValid && n<=cfg().maxValid);
    let temp = nums.length ? nums[nums.length-1] : null;
    if(temp == null){ const m = t.match(/\b(3\d|4[0-3])\s+(\d)\b/); if(m) temp = parseFloat(m[1]+'.'+m[2]); }
    return {bed: bed ? +bed[1] : null, temp};
  },
  handle(txt){
    this.last = txt; const h = $('#heard'); if(h) h.textContent = 'Heard: “'+txt+'”';
    const {bed, temp} = this.parse(txt);
    if(!bed || temp == null){ toast('Did not catch both bed and temperature. Try “bed 12, 38.4”.','err'); return; }
    const p = active().find(x => x.bed === bed);
    if(!p){ toast(`Bed ${bed} is empty.`,'err'); return; }
    const res = Actions.recordTemp(p.id, temp, null);
    if(res.err){ toast(`Bed ${bed}: ${res.err}`,'err'); return; }
    afterTemp(p.id, temp, res); App.render();
  },
  toggle(){
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if(!SR){ toast('Voice needs Chrome or Edge. Use “Type a phrase instead”.','err'); return; }
    if(this.on){ this.stop(); return; }
    this.rec = new SR(); this.rec.lang = 'en-IN'; this.rec.continuous = true; this.rec.interimResults = false;
    this.rec.onresult = e => this.handle(e.results[e.results.length-1][0].transcript);
    this.rec.onend = () => { if(this.on) try{ this.rec.start(); }catch(e){} };
    this.rec.onerror = e => { if(e.error==='not-allowed'){ toast('Microphone permission denied.','err'); this.stop(); } };
    this.rec.start(); this.on = true; App.render();
  },
  stop(){ this.on = false; try{ this.rec && this.rec.stop(); }catch(e){} App.render(); },
  simulate(){ const t = prompt('Type what the nurse would say, for example "bed 12, 38.4"'); if(t) this.handle(t); },
};
