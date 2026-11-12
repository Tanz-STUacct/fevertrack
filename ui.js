/* FeverTrack · shared UI helpers and lightweight SVG charts */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

function toast(m, kind){ const t = document.createElement('div'); t.className='toast'; if(kind==='err') t.style.background='#9a3412'; t.textContent=m; $('#toasts').appendChild(t); setTimeout(()=>t.remove(), 4200); }
function modal(html, wide){ $('#modalRoot').innerHTML = `<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal ${wide?'wide':''}">${html}</div></div>`; }
function closeModal(){ $('#modalRoot').innerHTML=''; }
function confirmBox(title, body, okLabel, onOk, danger){
  modal(`<h2>${title}</h2><p class="sub">${body}</p><div class="actions"><button class="btn" onclick="closeModal()">Cancel</button><button class="btn ${danger?'danger':'primary'}" id="cOk">${okLabel}</button></div>`);
  $('#cOk').onclick = () => { closeModal(); onOk(); };
}

function tempBadge(r){ if(!r) return '<span class="badge b-grey">not taken</span>'; return `<span class="badge ${isFever(r.temp)?'b-red':'b-green'}">${r.temp.toFixed(1)} °C</span>`; }
function statusBadge(p){
  if(p.status==='discharged') return '<span class="badge b-green">Discharged</span>';
  if(p.status==='deceased') return '<span class="badge b-grey">Deceased</span>';
  if(p.eligibleSince!==null) return '<span class="badge b-amber">Ready for discharge</span>';
  const t = tempToday(p) || lastTemp(p);
  return t && isFever(t.temp) ? '<span class="badge b-red">In treatment</span>' : '<span class="badge b-blue">Recovering</span>';
}
function streakDots(p){
  const n = cfg().cureDays, s = Math.min(streak(p), n);
  let h = '<span class="dots" title="Fever free streak">';
  for(let i=0;i<n;i++) h += `<i class="${i<s?'on':''}"></i>`;
  return h + `</span> <span class="meta">${s}/${n}</span>`;
}
function stat(k, v, d, cls, extra){ return `<div class="stat ${cls||''}"><div class="k">${k}</div><div class="v">${v}</div>${extra||''}${d?`<div class="d">${d}</div>`:''}</div>`; }
function bar(pct){ return `<div class="progress"><i style="width:${Math.max(0,Math.min(100,pct))}%"></i></div>`; }
function tabs(list, cur, fn){ return `<div class="tabs">${list.map(([id,l,n]) => `<button class="tab ${cur===id?'on':''}" onclick="${fn}('${id}')">${l}${n!=null?`<span class="n">${n}</span>`:''}</button>`).join('')}</div>`; }
function empty(msg){ return `<div class="empty">${msg}</div>`; }
function go(hash){ location.hash = hash; }

/* ---------- charts (plain SVG, no libraries) ---------- */
function lineChart({labels, series, yMin, yMax, refLine, refLabel, marker, markerLabel, height=200, unit=''}){
  const W=640, H=height, L=40, R=12, T=14, B=26, n=labels.length;
  const x = i => L + (n<2 ? 0 : i/(n-1)*(W-L-R));
  const y = v => T + (yMax - Math.max(yMin, Math.min(yMax, v))) / (yMax - yMin) * (H-T-B);
  let g = '';
  for(let k=0;k<=4;k++){ const v = yMin + (yMax-yMin)*k/4, yy=y(v); g += `<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#eef1f4"/><text x="${L-6}" y="${yy+3}" font-size="10" text-anchor="end" fill="#66727f">${(yMax-yMin)<10?v.toFixed(1):Math.round(v)}${unit}</text>`; }
  const step = Math.ceil(n/8);
  labels.forEach((l,i) => { if(i%step===0 || (i===n-1 && (n-1)%step > step/2)) g += `<text x="${x(i)}" y="${H-8}" font-size="10" text-anchor="middle" fill="#66727f">${l}</text>`; });
  if(refLine!=null) g += `<line x1="${L}" x2="${W-R}" y1="${y(refLine)}" y2="${y(refLine)}" stroke="#c2410c" stroke-dasharray="5 4"/><text x="${W-R}" y="${y(refLine)-5}" font-size="10" text-anchor="end" fill="#c2410c">${refLabel||''}</text>`;
  if(marker!=null) g += `<line x1="${x(marker)}" x2="${x(marker)}" y1="${T}" y2="${H-B}" stroke="#0f766e" stroke-dasharray="3 3"/><text x="${x(marker)+4}" y="${T+10}" font-size="10" fill="#0f766e" font-weight="700">${markerLabel||''}</text>`;
  series.forEach(s => {
    const pts = s.values.map((v,i) => v==null ? null : `${x(i)},${y(v)}`);
    let path='', on=false; pts.forEach(p => { if(!p){on=false;return;} path += (on?' L':' M') + p; on=true; });
    g += `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2.2"/>`;
    s.values.forEach((v,i) => { if(v!=null) g += `<circle cx="${x(i)}" cy="${y(v)}" r="2.6" fill="${s.color}"><title>${labels[i]}: ${typeof v==='number'?v.toFixed(1):v}${unit}</title></circle>`; });
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${g}</svg>` + (series.length>1 ? `<div class="legend" style="margin-top:4px">${series.map(s=>`<span><i style="background:${s.color}"></i>${s.name}</span>`).join('')}</div>` : '');
}
function barChart({labels, groups, height=200, marker, markerLabel}){
  // groups: [{name,color,values,stackOn?}] where stackOn = index of group to stack on
  const W=640, H=height, L=32, R=8, T=14, B=26, n=labels.length, bw=(W-L-R)/n;
  const tops = groups.map((g,gi) => g.values.map((v,i) => (g.stackOn!=null ? groups[g.stackOn].values[i] : 0) + v));
  const max = Math.max(4, ...tops.flat());
  const sc = v => (H-T-B) * v / max;
  const cols = groups.filter(g=>g.stackOn==null).length;
  let s='';
  for(let k=0;k<=4;k++){ const v=max*k/4, yy=H-B-sc(v); s+=`<line x1="${L}" x2="${W-R}" y1="${yy}" y2="${yy}" stroke="#eef1f4"/><text x="${L-5}" y="${yy+3}" font-size="10" text-anchor="end" fill="#66727f">${Math.round(v)}</text>`; }
  const step = Math.ceil(n/10);
  labels.forEach((l,i) => {
    let c=0; const w = Math.max(2,(bw-4)/cols);
    groups.forEach((g,gi) => {
      const ci = g.stackOn!=null ? groups.filter(x=>x.stackOn==null).indexOf(groups[g.stackOn]) : c++;
      const base = g.stackOn!=null ? groups[g.stackOn].values[i] : 0;
      const X = L + i*bw + 2 + ci*w;
      s += `<rect x="${X}" y="${H-B-sc(base+g.values[i])}" width="${w-1}" height="${sc(g.values[i])}" fill="${g.color}" rx="1.5"><title>${l} ${g.name}: ${g.values[i]}</title></rect>`;
    });
    if(i%step===0) s += `<text x="${L+i*bw+bw/2}" y="${H-8}" font-size="10" text-anchor="middle" fill="#66727f">${l}</text>`;
  });
  if(marker!=null) s += `<line x1="${L+marker*bw}" x2="${L+marker*bw}" y1="${T}" y2="${H-B}" stroke="#0f766e" stroke-dasharray="3 3"/><text x="${L+marker*bw+4}" y="${T+10}" font-size="10" fill="#0f766e" font-weight="700">${markerLabel||''}</text>`;
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">${s}</svg><div class="legend" style="margin-top:4px">${groups.map(g=>`<span><i style="background:${g.color}"></i>${g.name}</span>`).join('')}</div>`;
}
function tempChart(p, days=14){
  const end = p.outcomeDay ?? S.today, start = Math.max(p.admittedDay, end - days + 1);
  const ds = []; for(let d=start; d<=end; d++) ds.push(d);
  const W=700,H=200,L=38,R=10,T=12,B=26,lo=35.5,hi=41, F=cfg().fever;
  const x=i=>L+(ds.length<2?(W-L-R)/2:(i/(ds.length-1))*(W-L-R)), y=t=>T+(hi-Math.min(hi,Math.max(lo,t)))/(hi-lo)*(H-T-B);
  let pts=[], dots='', lbl='';
  ds.forEach((d,i) => {
    const r = p.readings[d];
    lbl += `<text x="${x(i)}" y="${H-8}" font-size="10" text-anchor="middle" fill="#66727f">${fmtShort(d)}</text>`;
    if(r){ pts.push(`${x(i)},${y(r.temp)}`); dots += `<circle cx="${x(i)}" cy="${y(r.temp)}" r="4.5" fill="${isFever(r.temp)?'#c2410c':'#15803d'}"><title>${fmtDay(d)}: ${r.temp} °C</title></circle>`; }
    else if(d < S.today) dots += `<text x="${x(i)}" y="${H-B-4}" font-size="12" text-anchor="middle" fill="#b45309" font-weight="700">✕</text>`;
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${H}">
    <rect x="${L}" y="${y(hi)}" width="${W-L-R}" height="${y(F)-y(hi)}" fill="#fdeee6"/>
    <line x1="${L}" x2="${W-R}" y1="${y(F)}" y2="${y(F)}" stroke="#c2410c" stroke-dasharray="4 4"/>
    <text x="${W-R}" y="${y(F)-4}" font-size="10" text-anchor="end" fill="#c2410c">fever ≥ ${F} °C</text>
    ${[36,37,38,39,40,41].map(t=>`<text x="${L-6}" y="${y(t)+3}" font-size="10" text-anchor="end" fill="#66727f">${t}</text>`).join('')}
    <polyline points="${pts.join(' ')}" fill="none" stroke="#0f766e" stroke-width="2"/>${dots}${lbl}</svg>
    <div class="meta">✕ means no reading that day, which breaks the fever free streak</div>`;
}
function downloadCSV(name, rows){
  const csv = rows.map(r => r.map(v => `"${String(v??'').replace(/"/g,'""')}"`).join(',')).join('\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv],{type:'text/csv'})); a.download = name; a.click();
}
