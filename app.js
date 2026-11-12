/* FeverTrack · router, app shell and boot */

const ROUTES = [
  {re:/^#\/nurse$/,               roles:['nurse'],                       view:viewNurse,       zone:true},
  {re:/^#\/doctor$/,              roles:['doctor','head'],               view:viewDoctor,      zone:true},
  {re:/^#\/admin\/discharges$/,   roles:['admin'],                       view:viewDischarges},
  {re:/^#\/admin\/beds$/,         roles:['admin','head'],                view:viewBeds},
  {re:/^#\/admin\/admissions$/,   roles:['admin'],                       view:viewAdmissions},
  {re:/^#\/admin\/staff$/,        roles:['admin','head'],                view:viewStaff},
  {re:/^#\/head\/outcomes$/,      roles:['head'],                        view:viewOutcomes},
  {re:/^#\/reports$/,             roles:['head','admin'],                view:viewReports},
  {re:/^#\/audit$/,               roles:['head'],                        view:viewAudit},
  {re:/^#\/settings$/,            roles:['head'],                        view:viewSettings},
  {re:/^#\/patients$/,            roles:['nurse','doctor','admin','head'], view:viewPatients},
  {re:/^#\/patient\/(\w+)$/,      roles:['nurse','doctor','admin','head'], view:viewPatient},
  {re:/^#\/alerts$/,              roles:['nurse','doctor','admin','head'], view:viewAlerts},
];
const NAV = {
  nurse:  [['#/nurse','🌡','Today\'s round'],['#/patients','🧾','Patients'],['#/alerts','🔔','Alerts']],
  doctor: [['#/doctor','🩺','Doctor round'],['#/patients','🧾','Patients'],['#/alerts','🔔','Alerts']],
  admin:  [['#/admin/discharges','🚪','Discharge queue'],['#/admin/beds','🛏','Bed board'],['#/admin/admissions','➕','Admissions & waitlist'],['#/patients','🧾','Patients'],['#/reports','📈','Reports'],['#/admin/staff','👥','Staff'],['#/alerts','🔔','Alerts']],
  head:   [['#/doctor','🩺','Doctor round'],['#/head/outcomes','📊','Outcomes'],['#/reports','📈','Reports'],['#/patients','🧾','Patients'],['#/admin/beds','🛏','Bed board'],['#/audit','📜','Audit log'],['#/settings','⚙️','Settings'],['#/admin/staff','👥','Staff'],['#/alerts','🔔','Alerts']],
};

const App = {
  home(){ return me ? NAV[me.role][0][0] : '#/login'; },
  render(){
    const h = location.hash || '#/login';
    if(!me){
      $('#hdr').classList.add('hidden');
      if(h !== '#/login'){ history.replaceState(null,'','#/login'); }
      $('#app').innerHTML = viewLogin(); return;
    }
    if(h === '#/login' || h === '#/' || h === ''){ history.replaceState(null,'',App.home()); return App.render(); }
    let route = null, args = [];
    for(const r of ROUTES){ const m = h.match(r.re); if(m){ route = r; args = m.slice(1); break; } }
    if(!route){ history.replaceState(null,'',App.home()); return App.render(); }
    if(!route.roles.includes(me.role)){ toast(`A ${ROLE_LABEL[me.role].toLowerCase()} cannot open that page.`,'err'); history.replaceState(null,'',App.home()); return App.render(); }
    const focusQ = document.activeElement && document.activeElement.id === 'q';
    App.header();
    const navH = NAV[me.role].map(([href,ic,l]) => `<a href="${href}" class="${h===href||(href!=='#/patients'&&h.startsWith(href+'/'))?'on':''}">${ic} ${l}${href==='#/alerts'&&unreadCount()?`<span class="cnt">${unreadCount()}</span>`:''}${href==='#/admin/discharges'&&eligible().length?`<span class="cnt">${eligible().length}</span>`:''}</a>`).join('');
    const zoneH = ['nurse','doctor','head'].includes(me.role) ? `<div class="sec">My shift</div><div class="zone">Working zone<select onchange="App.setZone(this.value)">${[['ALL','All zones (1 to 74)'],...ZONES.map(z=>[z.id,`Zone ${z.id} (beds ${z.from} to ${z.to})`])].map(([v,l])=>`<option value="${v}" ${V.zone===v?'selected':''}>${l}</option>`).join('')}</select></div>` : '';
    $('#app').innerHTML = `<div class="shell"><nav class="side"><div class="sec">Menu</div>${navH}${zoneH}</nav><div class="content"><main>${route.view(...args)}</main></div></div>`;
    if(focusQ){ const i = $('#q'); if(i){ i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }
  },
  header(){
    $('#hdr').classList.remove('hidden');
    $('#todayLbl').textContent = 'Today · ' + fmtDay(S.today);
    $('#whoLbl').innerHTML = `${ROLE_LABEL[me.role]} · <b>${esc(me.name)}</b>`;
    const u = unreadCount(); $('#bellN').textContent = u || ''; $('#bellN').style.display = u ? '' : 'none';
  },
  setZone(z){ V.zone = z; try{ sessionStorage.setItem('ft_zone', z); }catch(e){} App.render(); },
  toggleDemo(){ $('#demoDD').classList.toggle('hidden'); },
  nextDay(){ $('#demoDD').classList.add('hidden'); const r = Actions.nextDay(); App.render(); toast(`New day: ${fmtDay(S.today)}. Yesterday ${r.missed} not measured, ${r.unvisited} not visited.`); },
  autoRound(){ $('#demoDD').classList.add('hidden'); const r = Actions.autoRound(); App.render(); toast(`Demo: filled ${r.t} readings and ${r.v} visits for today.`); },
  resetDemo(){ $('#demoDD').classList.add('hidden'); confirmBox('Reset demo data?','Everything in this browser is replaced with a fresh 30 day simulation.','Reset',()=>{ seedState(); saveState(); toast('Demo data regenerated.'); App.render(); }, true); },
};
function refreshList(){ App.render(); }

/* clock in the header, also re-checks deadlines every minute */
setInterval(() => { const c = $('#clock'); if(c) c.textContent = nowTime(); }, 1000);
setInterval(() => { if(me && !document.querySelector('.overlay') && document.activeElement?.tagName !== 'INPUT' && document.activeElement?.tagName !== 'TEXTAREA') App.render(); }, 60000);
document.addEventListener('click', e => { const dd = $('#demoDD'); if(dd && !dd.classList.contains('hidden') && !e.target.closest('.menu')) dd.classList.add('hidden'); });

/* boot */
S = loadState();
if(!S || S.version !== 2){ seedState(); saveState(); }
try{ me = JSON.parse(sessionStorage.getItem('ft_me')); if(me && !S.staff.find(s=>s.id===me.id)) me = null; }catch(e){ me = null; }
try{ V.zone = sessionStorage.getItem('ft_zone') || 'ALL'; }catch(e){}
window.addEventListener('hashchange', () => { V.q=''; closeModal(); App.render(); });
App.render();
