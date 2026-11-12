/* FeverTrack · business rules. Pure functions over state so they are easy to test. */

const isFever = t => t >= cfg().fever;
const active = () => S.patients.filter(p => p.status === 'active');
const byBed = (a,b) => a.bed - b.bed;
const findP = id => S.patients.find(p => p.id === id);
const tempOn = (p,d) => p.readings[d];
const tempToday = p => p.readings[S.today];
const visitToday = p => p.visits[S.today];
const dayNo = p => (p.outcomeDay ?? S.today) - p.admittedDay + 1;

function lastTemp(p){
  const ds = Object.keys(p.readings).map(Number).sort((a,b)=>b-a);
  return ds.length ? p.readings[ds[0]] : null;
}

/* Consecutive fever free daily readings ending today (if measured) or yesterday.
   A missed day breaks the streak because nobody can prove the patient was fever free. */
function streak(p, today = S.today){
  let d = p.readings[today] ? today : today - 1, n = 0;
  while(d >= p.admittedDay){
    const r = p.readings[d];
    if(!r || isFever(r.temp)) break;
    n++; d--;
  }
  return n;
}
function calcEligibleSince(p, today = S.today){
  const s = streak(p, today);
  if(s < cfg().cureDays) return null;
  const end = p.readings[today] ? today : today - 1;
  return end - (s - cfg().cureDays);
}
function refreshEligibility(p){
  const was = p.eligibleSince;
  p.eligibleSince = calcEligibleSince(p);
  return was === null && p.eligibleSince !== null;
}
const eligible = () => active().filter(p => p.eligibleSince !== null);

function freeBeds(){
  const used = new Set(active().map(p => p.bed));
  const f = []; for(let b=1; b<=BEDS; b++) if(!used.has(b)) f.push(b);
  return f;
}
function inZone(p, zone){ if(!zone || zone==='ALL') return true; const z = ZONES.find(z=>z.id===zone); return p.bed>=z.from && p.bed<=z.to; }

/* Deadlines: compare wall clock with the configured round deadline */
function minutes(hhmm){ const [h,m] = hhmm.split(':').map(Number); return h*60+m; }
function pastDeadline(hhmm){ const n = new Date(); return n.getHours()*60+n.getMinutes() > minutes(hhmm); }

/* Outcomes: mortality on CLOSED cases only (cured + died) */
function outcomes(fromDay = -Infinity, toDay = Infinity){
  const closed = S.patients.filter(p => p.status !== 'active' && p.outcomeDay >= fromDay && p.outcomeDay <= toDay);
  const died = closed.filter(p => p.status === 'deceased').length;
  const cured = closed.length - died;
  const mort = closed.length ? died / closed.length * 100 : 0;
  const delays = closed.filter(p => p.status === 'discharged' && p.dischargeDelay != null).map(p => p.dischargeDelay);
  const avgDelay = delays.length ? delays.reduce((a,b)=>a+b,0) / delays.length : 0;
  const stays = closed.filter(p => p.status === 'discharged').map(p => p.outcomeDay - p.admittedDay + 1);
  const avgLos = stays.length ? stays.reduce((a,b)=>a+b,0) / stays.length : 0;
  return {cured, died, closed: closed.length, mort, avgDelay, avgLos, stays};
}

/* Beds likely free in the next 24h */
function forecast(){
  const a = active();
  const cleared = a.filter(p => p.eligibleSince !== null).length;
  const oneAway = a.filter(p => p.eligibleSince === null && streak(p) === cfg().cureDays - 1).length;
  return {cleared, oneAway, total: cleared + oneAway};
}

/* Daily statistics rebuilt from raw records (used by reports and CSV export) */
function dayStats(d){
  const present = S.patients.filter(p => p.admittedDay <= d && (p.outcomeDay == null || p.outcomeDay >= d));
  const measured = present.filter(p => p.readings[d]).length;
  const visited = present.filter(p => p.visits[d]).length;
  const visitBeforeTemp = present.filter(p => p.visits[d] && p.readings[d] && p.visits[d].time < p.readings[d].time).length;
  const adm = S.patients.filter(p => p.admittedDay === d).length;
  const dis = S.patients.filter(p => p.status === 'discharged' && p.outcomeDay === d).length;
  const died = S.patients.filter(p => p.status === 'deceased' && p.outcomeDay === d).length;
  const delays = S.patients.filter(p => p.status === 'discharged' && p.outcomeDay === d && p.dischargeDelay != null).map(p=>p.dischargeDelay);
  return {day:d, present:present.length, measured, visited, visitBeforeTemp, adm, dis, died,
    measuredPct: present.length ? measured/present.length*100 : 0,
    visitedPct: present.length ? visited/present.length*100 : 0,
    avgDelay: delays.length ? delays.reduce((a,b)=>a+b,0)/delays.length : null};
}
function rollingMortality(d, window = 7){ return outcomes(d - window + 1, d); }

/* ===== Actions. Every change is validated, audited and broadcast ===== */
const Actions = {
  recordTemp(pid, temp, reason){
    const p = findP(pid), prev = p.readings[S.today], c = cfg();
    if(p.status !== 'active') return {err:'Patient is no longer admitted.'};
    if(isNaN(temp) || temp < c.minValid || temp > c.maxValid) return {err:`Reading must be between ${c.minValid} and ${c.maxValid} °C.`};
    if(prev && !reason) return {err:`Already measured today at ${prev.time} by ${prev.by}.`};
    if(prev && p.visits[S.today]) return {err:'Doctor has already acted on this reading. It can no longer be corrected.'};
    p.readings[S.today] = {temp, by:me.name, time: prev ? prev.time : nowTime(), ...(prev ? {corrected:true, reason, prevTemp:prev.temp, correctedAt:nowTime()} : {})};
    delete S.priority[pid];
    const newly = refreshEligibility(p);
    audit(prev ? 'Corrected temperature' : 'Recorded temperature', `${prev ? prev.temp+' → ' : ''}${temp.toFixed(1)} °C${reason ? ' ('+reason+')' : ''}`, pid);
    if(temp >= c.critical) notify(['doctor'], `Critical ${temp.toFixed(1)} °C for bed ${p.bed} (${p.name})`, {level:'crit', link:'#/patient/'+pid});
    if(newly){
      notify(['admin','doctor'], `${p.name} (bed ${p.bed}) met the ${c.cureDays} day rule. Ready for discharge.`, {level:'ok', link:'#/admin/discharges'});
      audit('Discharge eligible', `${c.cureDays} consecutive fever free days`, pid);
    }
    saveState();
    return {ok:true, newly, critical: temp >= c.critical};
  },
  requestPriority(pid){
    const p = findP(pid);
    S.priority[pid] = {by:me.name, time:nowTime()};
    notify(['nurse'], `${me.name} is waiting on bed ${p.bed} (${p.name}). Please measure next.`, {level:'warn', link:'#/nurse'});
    audit('Requested priority measurement', '', pid); saveState();
  },
  recordVisit(pid, note, plan){
    const p = findP(pid);
    if(!tempToday(p)) return {err:'Visit locked until today\'s temperature is recorded.'};
    if(visitToday(p)) return {err:'Already visited today.'};
    if(!note || note.trim().length < 3) return {err:'Add a short note on assessment or treatment.'};
    p.visits[S.today] = {by:me.name, note:note.trim(), time:nowTime()};
    if(plan != null && plan.trim() !== (p.plan||'')){ p.plan = plan.trim(); audit('Updated treatment plan', p.plan, pid); }
    audit('Logged doctor visit', note.trim(), pid); saveState();
    return {ok:true};
  },
  discharge(pid){
    const p = findP(pid);
    if(p.eligibleSince === null) return {err:'Patient has not met the discharge rule.'};
    p.status = 'discharged'; p.outcomeDay = S.today; p.dischargeDelay = Math.max(0, S.today - p.eligibleSince);
    p.freedBed = p.bed; p.bed = null;
    audit('Discharged patient', `Bed ${p.freedBed} freed. Delay ${p.dischargeDelay} day(s)`, pid);
    if(S.waitlist.length) notify(['admin'], `Bed ${p.freedBed} is free. ${S.waitlist.length} patient(s) on the waitlist.`, {level:'info', link:'#/admin/admissions'});
    saveState(); return {ok:true, bed:p.freedBed};
  },
  recordDeath(pid, note){
    const p = findP(pid);
    p.status = 'deceased'; p.outcomeDay = S.today; p.deathNote = note; p.deathBy = me.name; p.freedBed = p.bed; p.bed = null;
    audit('Recorded death', note, pid);
    notify(['admin'], `Bed ${p.freedBed} released after a death.`, {level:'info', link:'#/admin/admissions'});
    const m = outcomes();
    if(m.mort > cfg().benchmark) notify(['head'], `Mortality is now ${m.mort.toFixed(1)}%, above the ${cfg().benchmark}% benchmark.`, {level:'crit', link:'#/head/outcomes'});
    else { const r = rollingMortality(S.today); if(r.closed >= 10 && r.mort > cfg().benchmark) notify(['head'], `Last 7 days mortality is ${r.mort.toFixed(1)}%. Early warning.`, {level:'warn', link:'#/head/outcomes'}); }
    saveState(); return {ok:true};
  },
  admit(data, bed, fromWaitId){
    if(!freeBeds().includes(+bed)) return {err:`Bed ${bed} is not free.`};
    const p = newPatient(data, +bed, S.today);
    S.patients.push(p);
    if(fromWaitId) S.waitlist = S.waitlist.filter(w => w.id !== fromWaitId);
    audit('Admitted patient', `${p.name} to bed ${bed}${fromWaitId ? ' from waitlist' : ''}`, p.id);
    notify(['nurse'], `New patient ${p.name} in bed ${bed}. Added to today's round.`, {level:'info', link:'#/nurse'});
    saveState(); return {ok:true, p};
  },
  addWait(data){
    const w = {id:'W'+(S.nextWait++), name:data.name, age:+data.age, sex:data.sex, severity:data.severity, note:data.note||'', addedDay:S.today, time:nowTime()};
    S.waitlist.push(w); audit('Added to waitlist', `${w.name} (${w.severity})`); saveState(); return {ok:true};
  },
  removeWait(id){ const w = S.waitlist.find(x=>x.id===id); S.waitlist = S.waitlist.filter(x=>x.id!==id); audit('Removed from waitlist', w ? w.name : id); saveState(); },
  addStaff(data){
    if(S.staff.some(s => s.name.toLowerCase() === data.name.toLowerCase())) return {err:'A staff member with that name already exists.'};
    if(!/^\d{4}$/.test(data.pin)) return {err:'PIN must be 4 digits.'};
    S.staff.push({id:'S'+(S.nextStaff++), name:data.name, role:data.role, pin:data.pin});
    audit('Added staff', `${data.name} as ${ROLE_LABEL[data.role]}`); saveState(); return {ok:true};
  },
  removeStaff(id){
    const s = S.staff.find(x=>x.id===id);
    if(s.role==='head' && S.staff.filter(x=>x.role==='head').length===1) return {err:'At least one head doctor account must remain.'};
    if(s.id === me.id) return {err:'You cannot remove your own account.'};
    S.staff = S.staff.filter(x=>x.id!==id); audit('Removed staff', s.name); saveState(); return {ok:true};
  },
  saveSettings(next){
    const old = {...S.settings};
    S.settings = {...S.settings, ...next};
    active().forEach(p => refreshEligibility(p));
    const changed = Object.keys(next).filter(k => String(old[k]) !== String(next[k])).map(k => `${k}: ${old[k]} → ${next[k]}`).join(', ');
    audit('Changed settings', changed || 'no change');
    if(changed) notify(['nurse','doctor','admin'], `The head doctor updated clinical settings (${changed}).`, {level:'warn'});
    saveState(); return {ok:true};
  },
  markRead(all){ myNotes().forEach(n => { if(!n.readBy.includes(me.id)) n.readBy.push(me.id); }); saveState(); },
  nextDay(){
    const a = active();
    const missed = a.filter(p => !tempToday(p)).length, unvisited = a.filter(p => !visitToday(p)).length;
    audit('Day closed', `${missed} not measured, ${unvisited} not visited`);
    if(missed) notify(['head','nurse'], `${fmtDay(S.today)}: ${missed} patient(s) were never measured.`, {level:'warn'});
    S.today++; S.priority = {};
    active().forEach(p => p.eligibleSince = calcEligibleSince(p));
    const late = eligible().filter(p => S.today - p.eligibleSince >= 1).length;
    if(late) notify(['admin','head'], `${late} patient(s) have been eligible for over a day and are still in a bed.`, {level:'warn', link:'#/admin/discharges'});
    saveState();
    return {missed, unvisited};
  },
  /* demo helper: finish today's round using each patient's simulated course */
  autoRound(){
    let t=0, v=0;
    active().forEach(p => {
      if(!tempToday(p)){ p.readings[S.today] = {temp: simTemp(p, S.today, Math.random), by:'Demo auto round', time:nowTime()}; t++; refreshEligibility(p); }
      if(!visitToday(p)){ p.visits[S.today] = {by:'Demo auto round', note: isFever(tempToday(p).temp) ? 'Fever persists. Continue treatment.' : 'Afebrile. Monitoring.', time:nowTime()}; v++; }
    });
    audit('Demo auto round', `${t} readings and ${v} visits filled`);
    saveState(); return {t, v};
  },
};
