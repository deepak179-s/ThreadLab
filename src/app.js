// ============================================================
// MAIN APP — UI Rendering & Interaction
// ============================================================
'use strict';

// ── Helpers ───────────────────────────────────────────────
const $ = id => document.getElementById(id);
const el = (tag, cls, html) => { const e = document.createElement(tag); if(cls) e.className=cls; if(html!==undefined) e.innerHTML=html; return e; };
const RUNTIME = window.electronAPI?.isElectron ? 'electron' : 'web';
const RUNTIME_LABEL = RUNTIME === 'electron' ? 'Electron Desktop' : 'Web Browser';

function chipHTML(id, state, extra = '') {
  const dot = `<span class="state-dot dot-${state}"></span>`;
  return `<div class="thread-row"><span class="thread-chip chip-${state}">${dot}${id}</span>${extra}</div>`;
}

function logTo(containerId, msg, cls = 'info') {
  const el = $(containerId);
  if (!el) return;
  const t = (performance.now() / 1000).toFixed(2);
  const entry = document.createElement('div');
  entry.className = 'log-entry fade-in';
  entry.innerHTML = `<span class="log-time">[${t}s]</span><span class="log-${cls}">${msg}</span>`;
  el.prepend(entry);
  while (el.children.length > 60) el.removeChild(el.lastChild);
}

function clearLog(id) { const e = $(id); if(e) e.innerHTML = ''; }

// ── Build App Shell ───────────────────────────────────────
function buildShell() {
  document.body.dataset.runtime = RUNTIME;
  document.getElementById('app').innerHTML = `
    <div class="titlebar">
      <div class="titlebar-logo">⬡</div>
      <span class="titlebar-title">Multi-threaded Application Simulator</span>
      <span class="titlebar-subtitle">shared runtime</span>
      <div class="titlebar-spacer"></div>
      <span class="titlebar-runtime ${RUNTIME}">${RUNTIME_LABEL}</span>
      <span class="titlebar-badge" id="tick-badge">tick: 0</span>
    </div>

    <div class="tabs-bar">
      <button class="tab-btn active" data-tab="model"><span class="tab-icon">⬡</span>Threading Models</button>
      <button class="tab-btn" data-tab="sync"><span class="tab-icon">⚙</span>Synchronization</button>
      <button class="tab-btn" data-tab="sched"><span class="tab-icon">⏱</span>CPU Scheduler</button>
      <button class="tab-btn" data-tab="dl"><span class="tab-icon">⛔</span>Deadlock</button>
    </div>

    <div class="content">
      <div class="panel active" id="panel-model"></div>
      <div class="panel" id="panel-sync"></div>
      <div class="panel" id="panel-sched"></div>
      <div class="panel" id="panel-dl"></div>
    </div>`;

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      $(`panel-${btn.dataset.tab}`).classList.add('active');
    });
  });
}

// ════════════════════════════════════════════════════════════
// TAB 1 — THREADING MODELS
// ════════════════════════════════════════════════════════════
let modelEngine = new ThreadingModelEngine();
let modelInterval = null;
let modelRunning = false;
let modelTick = 0;

const MODEL_DESCS = {
  M1: `<b>Many-to-One (M:1):</b> All user threads share a single kernel thread. Only one runs at a time — no true parallelism. A single I/O block stalls the entire process. Simple to implement but limited scalability. Used in early green-thread implementations.`,
  '1M': `<b>One-to-One (1:1):</b> Each user thread maps to its own kernel thread. True parallelism on multi-core CPUs. One blocking thread does not affect others. Higher overhead for thread creation. Used by Linux pthreads, Windows threads.`,
  MM: `<b>Many-to-Many (M:N):</b> M user threads multiplexed over N kernel threads (N ≤ M). Best of both worlds — efficient creation, true parallelism, and blocking one kernel thread doesn't stall all user threads. Used by Go goroutines, Java virtual threads (JEP 444).`
};

function buildModelTab() {
  $('panel-model').innerHTML = `
    <div class="ctrl-row">
      <span class="ctrl-label">Model:</span>
      <select class="ctrl-sel" id="model-sel">
        <option value="M1">Many-to-One (M:1)</option>
        <option value="1M">One-to-One (1:1)</option>
        <option value="MM" selected>Many-to-Many (M:N)</option>
      </select>
      <button class="btn primary" id="btn-model-run">▶ Run</button>
      <button class="btn" id="btn-model-stop">■ Stop</button>
      <button class="btn" id="btn-model-add">+ Thread</button>
      <span class="ctrl-label" style="margin-left:8px">Speed:</span>
      <div class="speed-wrap">
        <input type="range" class="speed-slider" id="speed-model" min="1" max="10" value="5">
        <span class="ctrl-label" id="speed-model-lbl">5x</span>
      </div>
    </div>
    <div class="panel-scroll">
      <div class="grid-2" style="margin-bottom:12px">
        <div class="card">
          <div class="card-title">User Threads</div>
          <div id="model-uthreads"></div>
        </div>
        <div class="card">
          <div class="card-title">Kernel Threads</div>
          <div class="cpu-grid" id="model-kthreads"></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">Thread → Kernel Mapping</div>
        <div class="map-canvas" id="map-canvas"><svg id="map-svg" viewBox="0 0 600 180"></svg></div>
      </div>
      <div class="grid-2" style="margin-bottom:12px">
        <div class="card">
          <div class="card-title">Model Description</div>
          <div class="model-desc-box" id="model-desc"></div>
        </div>
        <div class="card">
          <div class="card-title">Activity Log</div>
          <div class="log-panel" id="log-model"></div>
        </div>
      </div>
    </div>`;

  $('model-sel').addEventListener('change', () => { stopModel(); initModel(); renderModel(); });
  $('speed-model').addEventListener('input', e => { $('speed-model-lbl').textContent = e.target.value + 'x'; });
  $('btn-model-run').addEventListener('click', startModel);
  $('btn-model-stop').addEventListener('click', stopModel);
  $('btn-model-add').addEventListener('click', () => {
    modelEngine.addUserThread();
    renderModel();
  });
  initModel();
  renderModel();
}

function initModel() {
  const model = $('model-sel').value;
  modelEngine = new ThreadingModelEngine();
  modelEngine.onLog = (msg, cls) => logTo('log-model', msg, cls);
  modelEngine.init(model);
  $('model-desc').innerHTML = MODEL_DESCS[model] || '';
  modelTick = 0;
}

function startModel() {
  if (modelRunning) return;
  stopModel(); initModel(); clearLog('log-model');
  modelRunning = true;
  $('btn-model-run').disabled = true;
  const tick = () => {
    const speed = parseInt($('speed-model').value) || 5;
    modelTick++;
    $('tick-badge').textContent = `tick: ${modelTick}`;
    const done = modelEngine.tick(speed);
    renderModel();
    if (done) { stopModel(); logTo('log-model', 'All threads completed ✓', 'ok'); }
  };
  modelInterval = setInterval(tick, 280);
}

function stopModel() {
  modelRunning = false;
  if (modelInterval) { clearInterval(modelInterval); modelInterval = null; }
  if ($('btn-model-run')) $('btn-model-run').disabled = false;
}

function renderModel() {
  const snap = modelEngine.getSnapshot();
  // User threads
  $('model-uthreads').innerHTML = snap.userThreads.map(t => {
    const pct = Math.round(t.progress);
    const bar = `<div style="display:flex;align-items:center;gap:6px;flex:1">
      <div class="prog-bar-bg"><div class="prog-bar-fill" style="width:${pct}%;background:${t.color}"></div></div>
      <span class="thread-meta">${pct}%</span></div>`;
    return chipHTML(t.id, t.state === STATE.RUNNING ? 'running' : t.state, bar);
  }).join('');

  // Kernel threads
  $('model-kthreads').innerHTML = snap.kernelThreads.map(k => {
    const busy = k.running !== null;
    const ut = busy ? snap.userThreads.find(u => u.id === k.running) : null;
    const col = ut ? ut.color : '';
    return `<div class="cpu-core ${busy ? 'busy' : ''}">
      <div class="core-label">${k.id}</div>
      ${busy ? `<div class="core-thread" style="color:${col}">${k.running}</div>` : '<div class="core-idle">idle</div>'}
    </div>`;
  }).join('');

  drawMappingSVG(snap);
}

function drawMappingSVG(snap) {
  const svg = $('map-svg');
  const uCount = snap.userThreads.length;
  const kCount = snap.kernelThreads.length;
  const m = snap.model;
  const uSpacing = 560 / (uCount + 1);
  const kSpacing = 560 / (kCount + 1);
  const uy = 25, ky = 110, cpu_y = 162;

  let d = `<defs><marker id="ma" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M2 2L8 5L2 8" fill="none" stroke="#3b8cff" stroke-width="1.5"/></marker></defs>`;

  // CPU bar
  d += `<rect x="80" y="${cpu_y}" width="440" height="14" rx="4" fill="#1e2636" stroke="#2a3347" stroke-width="0.5"/>`;
  d += `<text x="300" y="${cpu_y+10}" text-anchor="middle" font-size="9" fill="#4a5568" font-family="JetBrains Mono">CPU HARDWARE</text>`;

  // Kernel threads
  snap.kernelThreads.forEach((k, i) => {
    const kx = kSpacing * (i + 1) + 20;
    const busy = k.running !== null;
    const ut = busy ? snap.userThreads.find(u => u.id === k.running) : null;
    const fillCol = busy ? '#0d2818' : '#1e2636';
    const strokeCol = busy ? '#165a2e' : '#2a3347';
    const textCol = busy && ut ? ut.color : '#6b7a94';
    d += `<rect x="${kx-22}" y="${ky}" width="44" height="22" rx="5" fill="${fillCol}" stroke="${strokeCol}" stroke-width="0.5"/>`;
    d += `<text x="${kx}" y="${ky+15}" text-anchor="middle" font-size="10" fill="${textCol}" font-family="JetBrains Mono" font-weight="500">${k.id}</text>`;
    d += `<line x1="${kx}" y1="${ky+22}" x2="${kx}" y2="${cpu_y}" stroke="#2a3347" stroke-width="0.5" stroke-dasharray="2 2"/>`;
  });

  // User threads + mapping lines
  snap.userThreads.forEach((u, i) => {
    const ux = uSpacing * (i + 1) + 20;
    let kx;
    if (m === 'M1') kx = kSpacing + 20;
    else if (m === '1M') kx = kSpacing * (i + 1) + 20;
    else kx = kSpacing * ((i % snap.kernelThreads.length) + 1) + 20;

    const running = u.state === 'running';
    const alpha = running ? '1' : '0.25';
    d += `<line x1="${ux}" y1="${uy+18}" x2="${kx}" y2="${ky}" stroke="${u.color}" stroke-width="${running?1.5:0.5}" opacity="${alpha}" stroke-dasharray="${running?'none':'3 2'}"/>`;

    const light = {ready:'#0d1e33',running:'#0d2818',waiting:'#271d08',blocked:'#250d0d',done:'#1a1f2a'}[u.state]||'#1e2636';
    const border = {ready:'#1a4a7a',running:'#165a2e',waiting:'#5a4210',blocked:'#5a1a1a',done:'#2a3347'}[u.state]||'#2a3347';
    d += `<rect x="${ux-17}" y="${uy}" width="34" height="18" rx="4" fill="${light}" stroke="${border}" stroke-width="0.5"/>`;
    d += `<text x="${ux}" y="${uy+13}" text-anchor="middle" font-size="9" fill="${u.color}" font-family="JetBrains Mono" font-weight="500">${u.id}</text>`;
  });

  svg.innerHTML = d;
}

// ════════════════════════════════════════════════════════════
// TAB 2 — SYNCHRONIZATION
// ════════════════════════════════════════════════════════════
let syncEngine = new SyncEngine();
let syncInterval = null;
let syncRunning = false;

function buildSyncTab() {
  $('panel-sync').innerHTML = `
    <div class="ctrl-row">
      <span class="ctrl-label">Primitive:</span>
      <select class="ctrl-sel" id="sync-sel">
        <option value="sem">Semaphore</option>
        <option value="monitor">Monitor (Mutex + CV)</option>
        <option value="barrier">Barrier</option>
      </select>
      <div id="sync-extra-ctrl" style="display:flex;gap:8px;align-items:center"></div>
      <button class="btn primary" id="btn-sync-run">▶ Run</button>
      <button class="btn" id="btn-sync-stop">■ Stop</button>
    </div>
    <div class="panel-scroll">
      <div class="grid-2" style="margin-bottom:12px">
        <div class="card" id="sync-state-card">
          <div class="card-title" id="sync-state-title">Primitive State</div>
          <div id="sync-state-body"></div>
        </div>
        <div class="card">
          <div class="card-title">Thread States</div>
          <div id="sync-threads"></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">Visualization</div>
        <div class="sync-canvas" id="sync-canvas"><svg id="sync-svg" viewBox="0 0 600 150"></svg></div>
      </div>
      <div class="card">
        <div class="card-title">Event Log</div>
        <div class="log-panel" id="log-sync"></div>
      </div>
    </div>`;

  $('sync-sel').addEventListener('change', () => { stopSync(); buildSyncExtraCtrl(); initSync(); renderSync(); });
  $('btn-sync-run').addEventListener('click', startSync);
  $('btn-sync-stop').addEventListener('click', stopSync);
  buildSyncExtraCtrl();
  initSync();
  renderSync();
}

function buildSyncExtraCtrl() {
  const type = $('sync-sel').value;
  const extra = $('sync-extra-ctrl');
  if (type === 'sem') {
    extra.innerHTML = `<span class="ctrl-label">Initial value:</span>
      <input type="number" class="ctrl-num" id="sem-init" min="1" max="5" value="2" style="width:52px">
      <span class="ctrl-label">Threads:</span>
      <input type="number" class="ctrl-num" id="sync-tcount" min="2" max="8" value="5" style="width:52px">`;
  } else if (type === 'monitor') {
    extra.innerHTML = `<span class="ctrl-label">Producer×2 · Consumer×2 · Buffer=3</span>`;
  } else {
    extra.innerHTML = `<span class="ctrl-label">Barrier count:</span>
      <input type="number" class="ctrl-num" id="barrier-n" min="2" max="8" value="4" style="width:52px">`;
  }
}

function initSync() {
  const type = $('sync-sel').value;
  syncEngine = new SyncEngine();
  syncEngine.onLog = (msg, cls) => logTo('log-sync', msg, cls);
  syncEngine.onBarrierRelease = () => renderSync();
  const opts = {};
  if (type === 'sem') {
    opts.semMax = parseInt($('sem-init')?.value) || 2;
    opts.threadCount = parseInt($('sync-tcount')?.value) || 5;
  }
  if (type === 'barrier') opts.barrierTotal = parseInt($('barrier-n')?.value) || 4;
  syncEngine.init(type, opts);
  $('sync-state-title').textContent = {sem:'Semaphore State',monitor:'Monitor / Buffer State',barrier:'Barrier State'}[type];
}

function startSync() {
  if (syncRunning) return;
  stopSync(); clearLog('log-sync'); initSync(); syncRunning = true;
  $('btn-sync-run').disabled = true;
  syncInterval = setInterval(() => {
    const done = syncEngine.tick();
    renderSync();
    if (done) { stopSync(); logTo('log-sync','Simulation complete ✓','ok'); }
  }, 480);
}

function stopSync() {
  syncRunning = false;
  if (syncInterval) { clearInterval(syncInterval); syncInterval = null; }
  if ($('btn-sync-run')) $('btn-sync-run').disabled = false;
}

function renderSync() {
  const type = $('sync-sel').value;
  const threads = syncEngine.threads;

  // Thread states
  $('sync-threads').innerHTML = threads.map(t => {
    let meta = '';
    if (type === 'monitor' && t.role) meta = `<span class="thread-meta">${t.role}${t.produced!=null?' prod='+t.produced:''}${t.consumed!=null?' cons='+t.consumed:''}</span>`;
    if (type === 'sem' && t.inCS) meta = `<span class="thread-meta" style="color:#3b8cff">in CS</span>`;
    if (type === 'barrier') meta = `<span class="thread-meta">${t.phase||''} ${Math.round(t.progress)}%</span>`;
    const st = t.state === STATE.RUNNING ? 'running' : t.state;
    return chipHTML(t.id, st, meta);
  }).join('');

  // State panel
  const sb = $('sync-state-body');
  if (type === 'sem') {
    const v = syncEngine.semValue, max = syncEngine.semMax;
    const cls = v === 0 ? 'zero' : v === max ? 'full' : '';
    const blocked = threads.filter(t => t.state === STATE.BLOCKED).map(t => t.id);
    const inCS = threads.filter(t => t.inCS).map(t => t.id);
    sb.innerHTML = `
      <div class="sem-block">
        <div class="sem-counter ${cls}">${v}</div>
        <div>
          <div class="sem-info">Value: ${v} / ${max} ${v===0?'(all slots taken)':'('+v+' available)'}</div>
          <div class="sem-info-sub">Blocked: ${blocked.join(', ')||'none'}</div>
          <div class="sem-info-sub">In critical section: ${inCS.join(', ')||'none'}</div>
        </div>
      </div>
      <div style="display:flex;gap:4px;margin-top:6px">${
        Array.from({length:max},(_,i)=>`<div style="width:20px;height:8px;border-radius:2px;background:${i<v?'#22c55e':'#250d0d'};border:1px solid ${i<v?'#165a2e':'#5a1a1a'}"></div>`).join('')
      }</div>`;
  } else if (type === 'monitor') {
    const bs = syncEngine.bufferSize, bm = syncEngine.bufferMax;
    sb.innerHTML = `
      <div style="font-size:11px;line-height:1.9;font-family:var(--mono)">
        <div>Lock: <b style="color:${syncEngine.monitorLocked?'#f59e0b':'#22c55e'}">${syncEngine.monitorLocked?'🔒 '+syncEngine.monitorOwner:'🔓 free'}</b></div>
        <div>Buffer: <span style="font-family:var(--mono);letter-spacing:2px">${Array.from({length:bm},(_,i)=>i<bs?'▮':'▯').join(' ')}</span> ${bs}/${bm}</div>
        <div>Waiting: ${threads.filter(t=>t.state===STATE.WAITING).map(t=>t.id).join(', ')||'none'}</div>
      </div>`;
  } else {
    const bc = syncEngine.barrierCount, bt = syncEngine.barrierTotal;
    sb.innerHTML = `
      <div style="font-size:11px;font-family:var(--mono);margin-bottom:8px">Arrived: ${bc} / ${bt}</div>
      <div class="barrier-dots">${threads.map(t=>`<div class="barrier-dot ${t.phase==='barrier_wait'?'arrived':t.done?'released':''}" title="${t.id}">${t.id}</div>`).join('')}</div>
      ${threads.map(t=>`<div style="font-size:10px;font-family:var(--mono);color:var(--text2);margin-bottom:2px">
        ${t.id}: ${t.phase||'working'} — ${Math.round(t.progress)}%</div>`).join('')}`;
  }

  drawSyncSVG(type);
}

function drawSyncSVG(type) {
  const svg = $('sync-svg');
  const threads = syncEngine.threads;
  let d = `<defs><marker id="sa" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M2 2L8 5L2 8" fill="none" stroke="#3d4a60" stroke-width="1.5"/></marker></defs>`;

  if (type === 'sem') {
    const n = threads.length, sp = 560 / (n + 1);
    threads.forEach((t, i) => {
      const x = sp*(i+1)+20, y=20;
      const fills = {ready:'#0d1e33',running:'#0d2818',blocked:'#250d0d',done:'#1a1f2a',waiting:'#271d08'};
      const strokes = {ready:'#1a4a7a',running:'#165a2e',blocked:'#5a1a1a',done:'#2a3347',waiting:'#5a4210'};
      const txtcols = {ready:'#3b8cff',running:'#22c55e',blocked:'#ef4444',done:'#6b7a94',waiting:'#f59e0b'};
      const st = t.state===STATE.RUNNING?'running':t.state;
      d += `<rect x="${x-18}" y="${y}" width="36" height="20" rx="4" fill="${fills[st]||'#1a1f2a'}" stroke="${strokes[st]||'#2a3347'}" stroke-width="0.5"/>`;
      d += `<text x="${x}" y="${y+14}" text-anchor="middle" font-size="10" fill="${txtcols[st]||'#6b7a94'}" font-family="JetBrains Mono" font-weight="500">${t.id}</text>`;
      if (t.inCS) d += `<line x1="${x}" y1="${y+20}" x2="300" y2="80" stroke="${t.color||'#22c55e'}" stroke-width="1.5"/>`;
      else if (t.state===STATE.BLOCKED) d += `<line x1="${x}" y1="${y+20}" x2="300" y2="80" stroke="#ef4444" stroke-width="0.5" stroke-dasharray="3 2"/>`;
    });
    const v = syncEngine.semValue, max = syncEngine.semMax;
    const cls_c = v===0?'#250d0d':v===max?'#0d2818':'#1e2636';
    const cls_s = v===0?'#5a1a1a':v===max?'#165a2e':'#2a3347';
    const cls_t = v===0?'#ef4444':v===max?'#22c55e':'#b0bac8';
    d += `<rect x="264" y="68" width="72" height="44" rx="8" fill="${cls_c}" stroke="${cls_s}" stroke-width="1"/>`;
    d += `<text x="300" y="87" text-anchor="middle" font-size="9" fill="${cls_t}" font-family="JetBrains Mono">SEMAPHORE</text>`;
    d += `<text x="300" y="103" text-anchor="middle" font-size="20" fill="${cls_t}" font-family="JetBrains Mono" font-weight="600">${v}</text>`;
    d += `<text x="300" y="130" text-anchor="middle" font-size="9" fill="#3d4a60" font-family="JetBrains Mono">critical section</text>`;
  } else if (type === 'monitor') {
    // Buffer cells
    const bm = syncEngine.bufferMax;
    for (let i=0;i<bm;i++) {
      const x = 200+i*70, filled = i<syncEngine.bufferSize;
      d += `<rect x="${x}" y="65" width="54" height="36" rx="5" fill="${filled?'#0d2818':'#1e2636'}" stroke="${filled?'#165a2e':'#2a3347'}" stroke-width="0.5"/>`;
      if (filled) d += `<text x="${x+27}" y="${65+24}" text-anchor="middle" font-size="16" fill="#22c55e" font-family="JetBrains Mono">■</text>`;
    }
    d += `<text x="305" y="120" text-anchor="middle" font-size="9" fill="#4a5568" font-family="JetBrains Mono">BUFFER (${syncEngine.bufferSize}/${bm})</text>`;
    // Lock
    const lk = syncEngine.monitorLocked;
    d += `<rect x="254" y="30" width="100" height="26" rx="4" fill="${lk?'#271d08':'#1e2636'}" stroke="${lk?'#5a4210':'#2a3347'}" stroke-width="0.5"/>`;
    d += `<text x="304" y="47" text-anchor="middle" font-size="10" fill="${lk?'#f59e0b':'#22c55e'}" font-family="JetBrains Mono">${lk?'⚷ '+syncEngine.monitorOwner:'⚷ free'}</text>`;
    // Producers left, consumers right
    threads.forEach((t,i) => {
      const st = t.state===STATE.RUNNING?'running':t.state;
      const fills = {ready:'#0d1e33',running:'#0d2818',waiting:'#271d08',done:'#1a1f2a'};
      const strokes = {ready:'#1a4a7a',running:'#165a2e',waiting:'#5a4210',done:'#2a3347'};
      const txtcols = {ready:'#3b8cff',running:'#22c55e',waiting:'#f59e0b',done:'#6b7a94'};
      if (t.role==='producer') {
        const x=30+i*70, y=65;
        d += `<rect x="${x}" y="${y}" width="54" height="22" rx="4" fill="${fills[st]||'#1e2636'}" stroke="${strokes[st]||'#2a3347'}" stroke-width="0.5"/>`;
        d += `<text x="${x+27}" y="${y+15}" text-anchor="middle" font-size="10" fill="${txtcols[st]||'#6b7a94'}" font-family="JetBrains Mono" font-weight="500">${t.id}</text>`;
        d += `<line x1="${x+54}" y1="${y+11}" x2="198" y2="83" stroke="#2a3347" stroke-width="0.5" marker-end="url(#sa)"/>`;
      } else {
        const ci = threads.filter(x=>x.role==='consumer').indexOf(t);
        const x=462+ci*70, y=65;
        d += `<rect x="${x}" y="${y}" width="54" height="22" rx="4" fill="${fills[st]||'#1e2636'}" stroke="${strokes[st]||'#2a3347'}" stroke-width="0.5"/>`;
        d += `<text x="${x+27}" y="${y+15}" text-anchor="middle" font-size="10" fill="${txtcols[st]||'#6b7a94'}" font-family="JetBrains Mono" font-weight="500">${t.id}</text>`;
        d += `<line x1="${x}" y1="${y+11}" x2="${200+bm*70}" y2="83" stroke="#2a3347" stroke-width="0.5" marker-end="url(#sa)"/>`;
      }
    });
  } else {
    // Barrier
    const n = threads.length, sp = 560/(n+1);
    threads.forEach((t, i) => {
      const x = sp*(i+1)+20;
      const y = t.phase==='barrier_wait' ? 80 : (t.done ? 100 : 20);
      const fills = ['#0d2818','#271d08','#1e2636'];
      const strokes = ['#165a2e','#5a4210','#2a3347'];
      const phase_i = t.done?0:t.phase==='barrier_wait'?1:2;
      const col = t.color || '#3b8cff';
      d += `<circle cx="${x}" cy="${y}" r="14" fill="${fills[phase_i]}" stroke="${strokes[phase_i]}" stroke-width="0.5"/>`;
      d += `<text x="${x}" y="${y+5}" text-anchor="middle" font-size="9" fill="${t.done?'#22c55e':t.phase==='barrier_wait'?'#f59e0b':col}" font-family="JetBrains Mono" font-weight="500">${t.id}</text>`;
      if (t.phase!=='barrier_wait'&&!t.done) d += `<line x1="${x}" y1="${y+14}" x2="${x}" y2="95" stroke="${col}" stroke-width="0.5" stroke-dasharray="2 2" opacity="0.4"/>`;
    });
    // Barrier wall
    d += `<rect x="20" y="98" width="560" height="5" rx="2" fill="${syncEngine.barrierCount>0?'#5a4210':'#2a3347'}"/>`;
    d += `<text x="300" y="120" text-anchor="middle" font-size="9" fill="#4a5568" font-family="JetBrains Mono">BARRIER (${syncEngine.barrierCount}/${syncEngine.barrierTotal} arrived)</text>`;
  }

  svg.innerHTML = d;
}

// ════════════════════════════════════════════════════════════
// TAB 3 — CPU SCHEDULER
// ════════════════════════════════════════════════════════════
let schedEngine = new SchedulerEngine();
let schedInterval = null;
let schedRunning = false;

function buildSchedTab() {
  $('panel-sched').innerHTML = `
    <div class="ctrl-row">
      <span class="ctrl-label">Algorithm:</span>
      <select class="ctrl-sel" id="sched-algo">
        <option value="rr">Round Robin</option>
        <option value="sjf">Shortest Job First</option>
        <option value="priority">Priority Scheduling</option>
        <option value="fcfs">FCFS</option>
      </select>
      <span class="ctrl-label">Quantum:</span>
      <input type="number" class="ctrl-num" id="quantum-val" min="1" max="10" value="3">
      <button class="btn primary" id="btn-sched-run">▶ Run</button>
      <button class="btn" id="btn-sched-stop">■ Stop</button>
      <button class="btn" id="btn-sched-reset">↺ Reset</button>
    </div>
    <div class="panel-scroll">
      <div class="stats-row" id="sched-stats"></div>
      <div class="grid-2" style="margin-bottom:12px">
        <div class="card">
          <div class="card-title">Ready Queue</div>
          <div id="ready-queue" style="display:flex;gap:6px;flex-wrap:wrap;min-height:32px;align-items:center;padding:2px 0"></div>
        </div>
        <div class="card">
          <div class="card-title">CPU Core</div>
          <div id="sched-cpu"></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">Gantt Chart</div>
        <div class="gantt-wrap" id="gantt-area"></div>
      </div>
      <div class="card">
        <div class="card-title">Process Table</div>
        <div id="proc-table" style="overflow-x:auto"></div>
      </div>
    </div>`;

  $('btn-sched-run').addEventListener('click', startSched);
  $('btn-sched-stop').addEventListener('click', stopSched);
  $('btn-sched-reset').addEventListener('click', resetSched);
  resetSched();
}

function resetSched() {
  stopSched();
  schedEngine = new SchedulerEngine();
  schedEngine.init($('sched-algo')?.value||'rr', parseInt($('quantum-val')?.value)||3);
  renderSched();
}

function startSched() {
  if (schedRunning) return;
  stopSched();
  schedEngine = new SchedulerEngine();
  schedEngine.init($('sched-algo').value, parseInt($('quantum-val').value)||3);
  schedRunning = true;
  $('btn-sched-run').disabled = true;
  schedInterval = setInterval(() => {
    const done = schedEngine.step();
    renderSched();
    if (done || schedEngine.tick > 80) { stopSched(); }
  }, 350);
}

function stopSched() {
  schedRunning = false;
  if (schedInterval) { clearInterval(schedInterval); schedInterval = null; }
  if ($('btn-sched-run')) $('btn-sched-run').disabled = false;
}

function renderSched() {
  const procs = schedEngine.processes;
  const stats = schedEngine.getStats();
  const maxTick = Math.max(schedEngine.tick, 1);

  // Stats
  $('sched-stats').innerHTML = `
    <div class="stat-chip"><span class="stat-val">${stats.tick}</span><span class="stat-lbl">Tick</span></div>
    <div class="stat-chip"><span class="stat-val">${stats.done}/${stats.total}</span><span class="stat-lbl">Done</span></div>
    <div class="stat-chip"><span class="stat-val">${stats.avgWait}</span><span class="stat-lbl">Avg Wait</span></div>
    <div class="stat-chip"><span class="stat-val">${stats.utilization}%</span><span class="stat-lbl">CPU Util.</span></div>`;

  // Ready queue
  const rq = $('ready-queue');
  const ready = procs.filter(p => p.state === STATE.READY && p.arrival <= schedEngine.tick);
  if (ready.length) {
    rq.innerHTML = ready.map((p,i) =>
      `${i>0?'<span class="rq-arrow">›</span>':''}<span class="rq-chip" style="border-color:${p.color};color:${p.color};background:${p.color}18">${p.id}<span style="opacity:.6;font-size:9px;margin-left:3px">${p.remaining}</span></span>`
    ).join('');
  } else {
    rq.innerHTML = `<span style="font-size:11px;color:var(--text3)">empty</span>`;
  }

  // CPU
  const cpu = $('sched-cpu');
  const cur = schedEngine.currentProc;
  if (cur) {
    const pct = Math.round((1 - cur.remaining/cur.burst)*100);
    cpu.innerHTML = `<div style="display:flex;align-items:center;gap:12px;padding:6px 0">
      <div style="width:44px;height:44px;border-radius:50%;background:${cur.color}18;border:2px solid ${cur.color};display:flex;align-items:center;justify-content:center;font-size:13px;font-weight:600;color:${cur.color};font-family:var(--mono)">${cur.id}</div>
      <div style="flex:1">
        <div style="font-size:11px;color:var(--text2);margin-bottom:6px">${cur.id} — ${pct}% complete · remaining: ${cur.remaining} ticks · quantum left: ${schedEngine.quantumLeft}</div>
        <div class="prog-bar-bg" style="height:8px"><div class="prog-bar-fill" style="width:${pct}%;background:${cur.color};height:8px"></div></div>
      </div>
    </div>`;
  } else {
    cpu.innerHTML = `<div style="font-size:11px;color:var(--text3);padding:12px 0">— idle —</div>`;
  }

  // Gantt
  const allSegs = [...schedEngine.gantt];
  if (schedEngine.ganttCurrent) allSegs.push(schedEngine.ganttCurrent);
  const ganttEl = $('gantt-area');
  ganttEl.innerHTML = procs.map(p => {
    const segs = allSegs.filter(s => s.id === p.id);
    const bars = segs.map(s => {
      const left = (s.start / maxTick * 100).toFixed(2);
      const width = Math.max(((s.end - s.start) / maxTick * 100), 0.3).toFixed(2);
      return `<div class="gantt-seg" style="left:${left}%;width:${width}%;background:${p.color}33;border-color:${p.color};color:${p.color}"></div>`;
    }).join('');
    return `<div class="gantt-row-wrap">
      <div class="gantt-pid">${p.id}</div>
      <div class="gantt-track">${bars}</div>
    </div>`;
  }).join('');

  // Process table
  $('proc-table').innerHTML = `<table style="width:100%;border-collapse:collapse;font-size:11px;font-family:var(--mono)">
    <tr style="border-bottom:1px solid var(--border)">${['PID','Burst','Remaining','Priority','Arrival','State','Wait'].map(h=>`<th style="padding:5px 8px;text-align:left;font-size:9px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em">${h}</th>`).join('')}</tr>
    ${procs.map(p=>`<tr style="border-bottom:1px solid var(--border)">
      <td style="padding:4px 8px;font-weight:600;color:${p.color}">${p.id}</td>
      <td style="padding:4px 8px;color:var(--text1)">${p.burst}</td>
      <td style="padding:4px 8px;color:var(--text1)">${p.remaining}</td>
      <td style="padding:4px 8px;color:var(--text1)">${p.priority}</td>
      <td style="padding:4px 8px;color:var(--text1)">${p.arrival}</td>
      <td style="padding:4px 8px"><span class="thread-chip chip-${p.state===STATE.DONE?'done':p.state===STATE.RUNNING?'running':'ready'}" style="font-size:9px;padding:2px 7px">${p.state}</span></td>
      <td style="padding:4px 8px;color:var(--text1)">${p.wait}</td>
    </tr>`).join('')}
  </table>`;
}

// ════════════════════════════════════════════════════════════
// TAB 4 — DEADLOCK
// ════════════════════════════════════════════════════════════
let dlEngine = new DeadlockEngine();

function buildDeadlockTab() {
  $('panel-dl').innerHTML = `
    <div class="ctrl-row">
      <button class="btn primary" id="btn-dl-sim">▶ Simulate</button>
      <button class="btn" id="btn-dl-detect">🔍 Detect Deadlock</button>
      <button class="btn success" id="btn-dl-resolve">✓ Resolve</button>
      <button class="btn" id="btn-dl-reset">↺ Reset</button>
    </div>
    <div class="panel-scroll">
      <div id="dl-banner" class="dl-banner"></div>
      <div id="dl-safe-banner" class="dl-safe-banner"></div>
      <div class="grid-2" style="margin-bottom:12px">
        <div class="card">
          <div class="card-title">Resource Allocation Graph</div>
          <div class="rag-canvas" id="rag-canvas"><svg id="rag-svg" viewBox="0 0 320 220"></svg></div>
        </div>
        <div class="card">
          <div class="card-title">Thread &amp; Resource State</div>
          <div id="dl-state"></div>
        </div>
      </div>
      <div class="card" style="margin-bottom:12px">
        <div class="card-title">Banker's Algorithm — Safety Analysis</div>
        <div class="banker-box" id="banker-box">Run the simulation and click Detect to see the Banker's Algorithm analysis.</div>
      </div>
      <div class="card">
        <div class="card-title">Event Log</div>
        <div class="log-panel" id="log-dl"></div>
      </div>
    </div>`;

  $('btn-dl-sim').addEventListener('click', () => {
    clearLog('log-dl');
    $('dl-banner').classList.remove('active');
    $('dl-safe-banner').classList.remove('active');
    $('banker-box').innerHTML = 'Simulation running...';
    dlEngine.reset();
    dlEngine.onLog = (msg, cls) => logTo('log-dl', msg, cls);
    dlEngine.simulate(state => { renderDeadlock(); });
  });

  $('btn-dl-detect').addEventListener('click', () => {
    const res = dlEngine.detect();
    if (res.found) {
      $('dl-banner').innerHTML = `⚠ DEADLOCK DETECTED — Circular wait: T1 → R2 → T2 → R3 → T3 → R1 → T1`;
      $('dl-banner').classList.add('active');
      $('dl-safe-banner').classList.remove('active');
      $('banker-box').innerHTML = `<span class="unsafe">UNSAFE STATE — No safe sequence exists.</span>
Available: R1=0, R2=0, R3=0 (all held)
Allocation: T1=[R1], T2=[R2], T3=[R3]
Need:       T1=[R2], T2=[R3], T3=[R1]

<span class="unsafe">Banker's traversal: no thread can complete with zero available resources.</span>
<span class="highlight">Resolution strategy: preempt R1 from T1 → chain reaction unblocks T3 → T2 → T1</span>`;
    } else if (dlEngine.state === 'resolved') {
      $('dl-safe-banner').innerHTML = `✓ Safe sequence: ${dlEngine.safeSequence} — system is deadlock-free`;
      $('dl-safe-banner').classList.add('active');
      $('dl-banner').classList.remove('active');
    } else {
      logTo('log-dl', 'No deadlock detected — run simulation first', 'warn');
    }
    renderDeadlock();
  });

  $('btn-dl-resolve').addEventListener('click', () => {
    if (dlEngine.state !== 'deadlock') { logTo('log-dl','Run simulation and detect deadlock first','warn'); return; }
    $('dl-banner').classList.remove('active');
    dlEngine.resolve(() => {
      renderDeadlock();
      if (dlEngine.state === 'resolved') {
        $('dl-safe-banner').innerHTML = `✓ Deadlock resolved — Safe sequence: ${dlEngine.safeSequence}`;
        $('dl-safe-banner').classList.add('active');
        $('banker-box').innerHTML = `<span class="safe">DEADLOCK RESOLVED via preemption.</span>
Safe sequence achieved: <span class="safe">${dlEngine.safeSequence}</span>

Steps taken:
1. Preempt R1 from T1 → T3 unblocks (holds R3 + R1)
2. T3 completes → releases R3, R1
3. T2 acquires R3 → completes → releases R2, R3
4. T1 acquires R2 → completes → releases R2

All threads terminated successfully. System is now deadlock-free.`;
      }
    });
  });

  $('btn-dl-reset').addEventListener('click', () => {
    dlEngine.reset();
    dlEngine.onLog = (msg, cls) => logTo('log-dl', msg, cls);
    $('dl-banner').classList.remove('active');
    $('dl-safe-banner').classList.remove('active');
    $('banker-box').innerHTML = 'Run the simulation and click Detect to see the Banker\'s Algorithm analysis.';
    clearLog('log-dl');
    renderDeadlock();
  });

  dlEngine.onLog = (msg, cls) => logTo('log-dl', msg, cls);
  renderDeadlock();
}

function renderDeadlock() {
  const threads = dlEngine.threads;
  const resources = dlEngine.resources;

  // State panel
  const stateEl = $('dl-state');
  const stateFills = {ready:'#0d1e33',running:'#0d2818',blocked:'#250d0d',waiting:'#271d08',done:'#1a1f2a'};
  const stateStrokes = {ready:'#1a4a7a',running:'#165a2e',blocked:'#5a1a1a',waiting:'#5a4210',done:'#2a3347'};
  const stateColors = {ready:'#3b8cff',running:'#22c55e',blocked:'#ef4444',waiting:'#f59e0b',done:'#6b7a94'};

  let html = '<div style="margin-bottom:10px">';
  threads.forEach(t => {
    const st = t.state;
    html += `<div class="dl-state-row">
      <span class="thread-chip chip-${st==='done'?'done':st==='blocked'?'blocked':st==='waiting'?'waiting':'running'}"
        style="min-width:36px">
        <span class="state-dot dot-${st==='done'?'done':st==='blocked'?'blocked':st==='waiting'?'waiting':'running'}"></span>${t.id}
      </span>
      <span style="font-size:10px;color:var(--text2)">holds: [${t.holds.join(',')||'—'}]</span>
      <span style="font-size:10px;color:${t.wants?'#ef4444':'var(--text3)'}">wants: ${t.wants||'—'}</span>
    </div>`;
  });
  html += '</div><div class="card-title" style="margin-top:8px">Resources</div>';
  resources.forEach(r => {
    const held = r.heldBy !== null;
    html += `<div class="dl-state-row">
      <div class="dl-res-chip ${held?'held':'free'}">${r.id}</div>
      <span style="font-size:10px;color:${held?'#ef4444':'#22c55e'}">${held?`held by ${r.heldBy}`:'free'}</span>
    </div>`;
  });
  stateEl.innerHTML = html;

  // RAG SVG
  drawRAG();
}

function drawRAG() {
  const svg = $('rag-svg');
  const threads = dlEngine.threads;
  const resources = dlEngine.resources;

  // Positions
  const tp = {T1:{x:60,y:50}, T2:{x:260,y:50}, T3:{x:160,y:170}};
  const rp = {R1:{x:60,y:165}, R2:{x:260,y:165}, R3:{x:160,y:85}};

  const stFill = {ready:'#0d1e33',running:'#0d2818',blocked:'#250d0d',waiting:'#271d08',done:'#1a1f2a'};
  const stStroke = {ready:'#1a4a7a',running:'#165a2e',blocked:'#5a1a1a',waiting:'#5a4210',done:'#2a3347'};
  const stText = {ready:'#3b8cff',running:'#22c55e',blocked:'#ef4444',waiting:'#f59e0b',done:'#6b7a94'};

  let d = `<defs>
    <marker id="ra-g" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M2 2L8 5L2 8" fill="none" stroke="#22c55e" stroke-width="1.5"/></marker>
    <marker id="ra-r" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto"><path d="M2 2L8 5L2 8" fill="none" stroke="#ef4444" stroke-width="1.5"/></marker>
  </defs>`;

  // Allocation edges (resource → thread, green)
  resources.forEach(r => {
    if (r.heldBy) {
      const rPos = rp[r.id], tPos = tp[r.heldBy];
      d += `<line x1="${rPos.x}" y1="${rPos.y}" x2="${tPos.x}" y2="${tPos.y}" stroke="#22c55e" stroke-width="1.5" marker-end="url(#ra-g)"/>`;
    }
  });

  // Request edges (thread → resource, red dashed)
  threads.forEach(t => {
    if (t.wants) {
      const tPos = tp[t.id], rPos = rp[t.wants];
      d += `<line x1="${tPos.x}" y1="${tPos.y}" x2="${rPos.x}" y2="${rPos.y}" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 2" marker-end="url(#ra-r)"/>`;
    }
  });

  // Thread circles
  threads.forEach(t => {
    const p = tp[t.id];
    const st = t.state;
    d += `<circle cx="${p.x}" cy="${p.y}" r="20" fill="${stFill[st]||'#1e2636'}" stroke="${stStroke[st]||'#2a3347'}" stroke-width="1"/>`;
    d += `<text x="${p.x}" y="${p.y+5}" text-anchor="middle" font-size="11" fill="${stText[st]||'#6b7a94'}" font-family="JetBrains Mono" font-weight="600">${t.id}</text>`;
  });

  // Resource squares
  resources.forEach(r => {
    const p = rp[r.id];
    const held = r.heldBy !== null;
    d += `<rect x="${p.x-16}" y="${p.y-16}" width="32" height="32" rx="5" fill="${held?'#250d0d':'#1e2636'}" stroke="${held?'#5a1a1a':'#2a3347'}" stroke-width="0.5"/>`;
    d += `<text x="${p.x}" y="${p.y+5}" text-anchor="middle" font-size="10" fill="${held?'#ef4444':'#6b7a94'}" font-family="JetBrains Mono" font-weight="600">${r.id}</text>`;
  });

  // Legend
  d += `<line x1="20" y1="205" x2="44" y2="205" stroke="#22c55e" stroke-width="1.5" marker-end="url(#ra-g)"/>`;
  d += `<text x="50" y="209" font-size="9" fill="#6b7a94" font-family="JetBrains Mono">allocation</text>`;
  d += `<line x1="130" y1="205" x2="154" y2="205" stroke="#ef4444" stroke-width="1" stroke-dasharray="4 2" marker-end="url(#ra-r)"/>`;
  d += `<text x="160" y="209" font-size="9" fill="#6b7a94" font-family="JetBrains Mono">request</text>`;

  svg.innerHTML = d;
}

// ── Init ──────────────────────────────────────────────────
buildShell();
buildModelTab();
buildSyncTab();
buildSchedTab();
buildDeadlockTab();
