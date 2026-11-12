/* FeverTrack · demo data. Simulates 30 days of the centre with the same rules the app enforces.
   The first 20 days mimic the old paper journal (missed readings, visits before temperature,
   late discharges). From GO_LIVE the app is in use. All of it is clearly marked as simulated. */

const GO_LIVE = -10;
const SEED = 1038;
const FIRST = ['Aarav','Diya','Kabir','Meera','Rohan','Isha','Arjun','Saanvi','Vivaan','Anaya','Aditya','Kiara','Reyansh','Myra','Krish','Navya','Ishaan','Pari','Dhruv','Riya','Yash','Tara','Om','Sara','Neel','Aditi','Kunal','Pooja','Sameer','Nisha','Varun','Kavya','Rahul','Sneha','Manav','Tanvi','Harsh','Leela','Farhan','Zoya','Imran','Fatima','Joseph','Maria','Gurpreet','Simran','Arnav','Ira'];
const LAST = ['Shah','Patel','Iyer','Gupta','Nair','Khan','Reddy','Singh','Joshi','Desai','Mehta','Kulkarni','Das','Bose','Rao','Pillai','Kapoor','Verma','Malhotra','Chopra','Fernandes','Sheikh','Menon','Bhat'];

function rng(seed){ return () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
const pad = n => String(n).padStart(2,'0');
const hm = mins => pad(Math.floor(mins/60)) + ':' + pad(Math.floor(mins%60));
const r1 = (r, lo, hi) => Math.round((lo + r()*(hi-lo)) * 10) / 10;

function hiddenCourse(r){
  // the virus course the app cannot see: days of fever, and whether the patient dies
  const feverDays = 2 + Math.floor(r()*8);
  const dieDay = r() < 0.135 ? 2 + Math.floor(r()*7) : null;
  return {feverDays, dieDay};
}
function simTemp(p, day, r){
  const k = day - p.admittedDay, h = p.hidden;
  if(h.dieDay != null) return r1(r, 38.6, 40.6);
  if(k < h.feverDays) return r1(r, 38.1, 39.9);
  return r1(r, 36.3, 37.6);
}
function newPatient(data, bed, day, r = Math.random){
  const id = 'P' + String(S.nextId++).padStart(4,'0');
  return {id, name:data.name, age:+data.age, sex:data.sex, bed, admittedDay:day, status:'active', outcomeDay:null,
    readings:{}, visits:{}, plan:'', eligibleSince:null, hidden: data.hidden || hiddenCourse(r), note:data.note||''};
}

function seedState(seed = SEED){
  const r = rng(seed);
  const pick = a => a[Math.floor(r()*a.length)];
  const name = () => pick(FIRST) + ' ' + pick(LAST);
  S = {version:2, startDate:new Date().toISOString().slice(0,10), today:-30, settings:{...DEFAULT_SETTINGS},
       patients:[], waitlist:[], staff:JSON.parse(JSON.stringify(DEFAULT_STAFF)), priority:{}, notes:[], audit:[],
       nextId:1, nextNote:1, nextWait:1, nextStaff:DEFAULT_STAFF.length+1, goLive:GO_LIVE, simulated:true};
  const nurses = S.staff.filter(s=>s.role==='nurse').map(s=>s.name);
  const docs = S.staff.filter(s=>s.role==='doctor'||s.role==='head').map(s=>s.name);

  // centre is already full when the simulation starts
  for(let b=1; b<=BEDS; b++){
    const p = newPatient({name:name(), age:18+Math.floor(r()*65), sex:r()<.5?'F':'M'}, b, -30 - Math.floor(r()*6), r);
    if(p.hidden.dieDay != null && p.hidden.dieDay <= -30 - p.admittedDay) p.hidden.dieDay = null;
    S.patients.push(p);
  }

  for(let d=-30; d<=0; d++){
    S.today = d;
    const live = d >= GO_LIVE, isToday = d === 0;
    // 1 morning admissions into beds freed yesterday
    freeBeds().forEach(b => S.patients.push(newPatient({name:name(), age:16+Math.floor(r()*70), sex:r()<.5?'F':'M'}, b, d, r)));
    // 2 deaths that happen overnight / early morning
    if(!isToday) active().forEach(p => {
      if(p.hidden.dieDay != null && d - p.admittedDay === p.hidden.dieDay){
        p.status='deceased'; p.outcomeDay=d; p.freedBed=p.bed; p.bed=null; p.deathBy=pick(docs); p.deathNote='Multi organ failure following prolonged high fever.';
      }
    });
    // 3 temperature round and doctor round
    active().forEach(p => {
      const measureP = isToday ? 0.26 : live ? 0.985 : 0.82;
      if(r() < measureP){
        const t = live ? 420 + r()*200 : 420 + r()*480;
        p.readings[d] = {temp: simTemp(p, d, r), by: pick(nurses), time: hm(t)};
      }
      const visitP = isToday ? (p.readings[d] ? 0.4 : 0) : live ? 0.975 : 0.85;
      if(r() < visitP){
        let vt;
        if(live) vt = p.readings[d] ? minutes(p.readings[d].time) + 30 + r()*300 : null;
        else vt = 540 + r()*480;                       // paper era: doctor shows up whenever
        if(vt != null){
          const fev = p.readings[d] ? isFever(p.readings[d].temp) : true;
          p.visits[d] = {by: pick(docs), time: hm(Math.min(vt, 1140)), note: fev ? pick(['Fever persists. Continue antipyretics and fluids.','Still febrile. IV fluids, monitor oxygen.','High fever. Paracetamol 650 mg and cold sponging.']) : pick(['Afebrile. Monitoring.','Improving. Continue oral fluids.','No fever. Mobilising well.'])};
        }
      }
      if(!p.plan) p.plan = 'Antipyretics as needed, oral and IV fluids, daily review.';
    });
    // 4 discharge rule and (in the paper era) the delay before admin hears about it
    active().forEach(p => {
      p.eligibleSince = calcEligibleSince(p, d);
      if(p.eligibleSince === null){ p._due = null; return; }
      if(isToday) return;
      if(p._due == null){
        const x = r();
        p._due = p.eligibleSince + (live ? (x < .85 ? 0 : 1) : (x < .2 ? 0 : x < .7 ? 1 : 2));
      }
      if(d >= p._due){ p.status='discharged'; p.outcomeDay=d; p.dischargeDelay=d-p.eligibleSince; p.freedBed=p.bed; p.bed=null; }
    });
  }
  S.patients.forEach(p => delete p._due);

  // waitlist of incoming patients
  for(let i=0;i<6;i++) S.waitlist.push({id:'W'+(S.nextWait++), name:name(), age:20+Math.floor(r()*60), sex:r()<.5?'F':'M', severity:i<2?'High':'Normal', note:i<2?'Fever 40 °C at referral clinic':'', addedDay:i<3?-1:0, time:hm(480+i*35)});

  // a few notifications and audit entries so the first screens are not empty
  S.audit.push({day:-30, time:'00:00', who:'System', role:'system', action:'Demo data generated', detail:'30 days simulated. Go live on '+fmtDay(GO_LIVE)});
  active().filter(p=>p.readings[0]).forEach(p => S.audit.push({day:0, time:p.readings[0].time, who:p.readings[0].by, role:'nurse', action:'Recorded temperature', detail:p.readings[0].temp.toFixed(1)+' °C', pid:p.id}));
  eligible().forEach(p => S.notes.push({id:'N'+(S.nextNote++), day:0, time:'08:00', roles:['admin','doctor'], text:`${p.name} (bed ${p.bed}) met the ${cfg().cureDays} day rule. Ready for discharge.`, level:'ok', link:'#/admin/discharges', readBy:[]}));
  S.notes.push({id:'N'+(S.nextNote++), day:0, time:'07:30', roles:['nurse'], text:`Today's round has ${active().length} patients across 4 zones.`, level:'info', link:'#/nurse', readBy:[]});
  S.audit.sort((a,b)=>a.day-b.day || a.time.localeCompare(b.time));
  S.today = 0;
  return S;
}
