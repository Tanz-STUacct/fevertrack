/* FeverTrack · state, persistence, live sync, audit and notifications */
const BEDS = 74;
const KEY = 'fevertrack_v2';
const ZONES = [
  {id:'A', from:1,  to:19},
  {id:'B', from:20, to:37},
  {id:'C', from:38, to:56},
  {id:'D', from:57, to:74},
];
const ROLE_LABEL = {nurse:'Nurse', doctor:'Doctor', admin:'Admin staff', head:'Head doctor'};
const DEFAULT_SETTINGS = {fever:38.0, cureDays:3, benchmark:15, tempDeadline:'11:00', visitDeadline:'17:00', minValid:34, maxValid:43, critical:41.0};
const DEFAULT_STAFF = [
  {id:'S1', name:'Priya Nair',   role:'nurse',  pin:'1111'},
  {id:'S2', name:'Rahul Desai',  role:'nurse',  pin:'1111'},
  {id:'S3', name:'Anita Joshi',  role:'nurse',  pin:'1111'},
  {id:'S4', name:'Dr. Mehta',    role:'doctor', pin:'2222'},
  {id:'S5', name:'Dr. Khan',     role:'doctor', pin:'2222'},
  {id:'S6', name:'Sana Shaikh',  role:'admin',  pin:'3333'},
  {id:'S7', name:'Dr. Rao',      role:'head',   pin:'4444'},
];

let S = null;     // persisted state (shared by every tab on this browser)
let me = null;    // logged in staff member (per tab)

const cfg = () => S.settings;

function loadState(){ try{ const s = localStorage.getItem(KEY); if(s) return JSON.parse(s); }catch(e){} return null; }
function saveState(){
  try{ localStorage.setItem(KEY, JSON.stringify(S)); }catch(e){ console.warn('save failed', e); }
  try{ chan && chan.postMessage('sync'); }catch(e){}
}

/* live sync between open tabs: nurse saves in one tab, doctor tab refreshes instantly */
let chan = null; try{ chan = new BroadcastChannel('fevertrack'); }catch(e){}
function onRemoteChange(){ const s = loadState(); if(!s) return; S = s; if(me && !document.querySelector('.overlay')) App.render(); }
if(chan) chan.onmessage = onRemoteChange;
window.addEventListener('storage', e => { if(e.key === KEY) onRemoteChange(); });

/* audit trail: every write goes through here */
function audit(action, detail, pid){
  S.audit.push({day:S.today, time:nowTime(), who:me?me.name:'System', role:me?me.role:'system', action, detail, pid:pid||null});
  if(S.audit.length > 3000) S.audit.splice(0, S.audit.length - 3000);
}

/* role targeted notifications */
function notify(roles, text, opts={}){
  S.notes.unshift({id:'N'+(S.nextNote++), day:S.today, time:nowTime(), roles, text, level:opts.level||'info', link:opts.link||null, readBy:[]});
  if(S.notes.length > 300) S.notes.length = 300;
}
const myNotes = () => S.notes.filter(n => n.roles.includes(me.role) || (me.role==='head' && n.roles.includes('doctor')));
const unreadCount = () => myNotes().filter(n => !n.readBy.includes(me.id)).length;

/* time helpers (simulated day number + real wall clock) */
function nowTime(){ return new Date().toTimeString().slice(0,5); }
function dateOf(day){ const d = new Date(S.startDate+'T00:00:00'); d.setDate(d.getDate()+day); return d; }
function fmtDay(day){ return dateOf(day).toLocaleDateString('en-IN',{weekday:'short', day:'numeric', month:'short'}); }
function fmtShort(day){ const d = dateOf(day); return d.getDate()+'/'+(d.getMonth()+1); }
function zoneOf(bed){ const z = ZONES.find(z => bed>=z.from && bed<=z.to); return z ? z.id : '–'; }
