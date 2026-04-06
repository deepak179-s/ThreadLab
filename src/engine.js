// ============================================================
// SIMULATION ENGINE — Pure JS, Zero UI Dependencies
// ============================================================
'use strict';

// ── Utilities ─────────────────────────────────────────────
const PALETTE = ['#3b8cff','#22c55e','#f59e0b','#ef4444','#a855f7','#06b6d4','#f97316','#e879f9'];

function rnd(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

// ── Thread State Machine ───────────────────────────────────
const STATE = {
  NEW: 'new', READY: 'ready', RUNNING: 'running',
  WAITING: 'waiting', BLOCKED: 'blocked', DONE: 'done'
};

class UserThread {
  constructor(id) {
    this.id = id;
    this.state = STATE.READY;
    this.progress = 0;
    this.burst = rnd(5, 14);
    this.csTime = 0;
    this.inCS = false;
    this.color = PALETTE[(parseInt(id.slice(1)) - 1) % PALETTE.length];
    this.kThread = null;
  }
}

class KernelThread {
  constructor(id) {
    this.id = id;
    this.running = null; // user thread id
  }
}

// ── Threading Model Engine ─────────────────────────────────
class ThreadingModelEngine {
  constructor() {
    this.model = 'MM';
    this.userThreads = [];
    this.kernelThreads = [];
    this.logs = [];
    this.onLog = null;
  }

  init(model) {
    this.model = model;
    const cfg = { M1: [5,1], '1M': [4,4], MM: [6,3] };
    const [uCount, kCount] = cfg[model] || [5,3];
    this.userThreads = Array.from({length: uCount}, (_, i) => new UserThread(`U${i+1}`));
    this.kernelThreads = Array.from({length: kCount}, (_, i) => new KernelThread(`K${i+1}`));
  }

  addUserThread() {
    const n = this.userThreads.length + 1;
    const t = new UserThread(`U${n}`);
    this.userThreads.push(t);
    if (this.model === '1M') {
      this.kernelThreads.push(new KernelThread(`K${n}`));
    }
    this.log(`Thread U${n} added to pool`, 'info');
    return t;
  }

  log(msg, cls = 'info') {
    const entry = { msg, cls, time: performance.now() };
    this.logs.unshift(entry);
    if (this.logs.length > 80) this.logs.pop();
    if (this.onLog) this.onLog(msg, cls);
  }

  tick(speed) {
    const m = this.model;
    if (m === 'M1') this._tickManyToOne(speed);
    else if (m === '1M') this._tickOneToOne(speed);
    else this._tickManyToMany(speed);
    return this.userThreads.every(t => t.state === STATE.DONE);
  }

  _tickManyToOne(speed) {
    const kt = this.kernelThreads[0];
    const running = this.userThreads.find(t => t.state === STATE.RUNNING);
    if (!running) {
      const next = this.userThreads.find(t => t.state === STATE.READY);
      if (next) { next.state = STATE.RUNNING; kt.running = next.id; this.log(`K1 dispatches ${next.id}`, 'ok'); }
    } else {
      running.progress = clamp(running.progress + speed * 3, 0, 100);
      if (running.progress >= 100) {
        this.log(`${running.id} completed (M:1 — sequential)`, 'ok');
        running.state = STATE.DONE; kt.running = null;
      } else if (Math.random() < 0.04) {
        running.state = STATE.WAITING; kt.running = null;
        this.log(`${running.id} I/O block — entire process stalls (M:1 limitation)`, 'warn');
      }
    }
    this.userThreads.filter(t => t.state === STATE.WAITING).forEach(t => {
      if (Math.random() < 0.12) { t.state = STATE.READY; this.log(`${t.id} unblocked → ready`, 'info'); }
    });
  }

  _tickOneToOne(speed) {
    this.userThreads.forEach((u, i) => {
      const k = this.kernelThreads[i];
      if (!k || u.state === STATE.DONE) return;
      if (u.state === STATE.READY) { u.state = STATE.RUNNING; k.running = u.id; }
      if (u.state === STATE.RUNNING) {
        u.progress = clamp(u.progress + speed * (1.5 + Math.random() * 2), 0, 100);
        if (u.progress >= 100) {
          u.state = STATE.DONE; k.running = null;
          this.log(`${u.id} done — true parallelism (1:1)`, 'ok');
        } else if (Math.random() < 0.025) {
          u.state = STATE.WAITING; k.running = null;
          this.log(`${u.id} blocks — other threads continue unaffected`, 'warn');
        }
      }
      if (u.state === STATE.WAITING && Math.random() < 0.14) {
        u.state = STATE.READY; this.log(`${u.id} resumed`, 'info');
      }
    });
  }

  _tickManyToMany(speed) {
    this.kernelThreads.forEach(k => {
      if (!k.running) {
        const next = this.userThreads.find(t => t.state === STATE.READY);
        if (next) { next.state = STATE.RUNNING; k.running = next.id; this.log(`${k.id} multiplexed to ${next.id}`, 'info'); }
      } else {
        const u = this.userThreads.find(t => t.id === k.running);
        if (u) {
          u.progress = clamp(u.progress + speed * (1.2 + Math.random() * 2), 0, 100);
          if (u.progress >= 100) {
            u.state = STATE.DONE; k.running = null;
            this.log(`${u.id} complete on ${k.id}`, 'ok');
          } else if (Math.random() < 0.03) {
            u.state = STATE.WAITING; k.running = null;
            this.log(`${u.id} blocked → ${k.id} picks up next thread`, 'warn');
          }
        }
      }
    });
    this.userThreads.filter(t => t.state === STATE.WAITING).forEach(t => {
      if (Math.random() < 0.09) { t.state = STATE.READY; this.log(`${t.id} re-queued`, 'info'); }
    });
  }

  getSnapshot() {
    return {
      userThreads: this.userThreads.map(t => ({...t})),
      kernelThreads: this.kernelThreads.map(k => ({...k})),
      model: this.model
    };
  }
}

// ── Synchronization Engine ─────────────────────────────────
class SyncEngine {
  constructor() {
    this.type = 'sem';
    this.threads = [];
    this.semValue = 2;
    this.semMax = 2;
    this.monitorLocked = false;
    this.monitorOwner = null;
    this.bufferSize = 0;
    this.bufferMax = 3;
    this.logs = [];
    this.onLog = null;
  }

  log(msg, cls = 'info') {
    const entry = { msg, cls, time: performance.now() };
    this.logs.unshift(entry);
    if (this.logs.length > 80) this.logs.pop();
    if (this.onLog) this.onLog(msg, cls);
  }

  init(type, opts = {}) {
    this.type = type;
    this.logs = [];
    if (type === 'sem') {
      this.semMax = opts.semMax || 2;
      this.semValue = this.semMax;
      const n = opts.threadCount || 5;
      this.threads = Array.from({length: n}, (_, i) => ({
        id: `T${i+1}`, state: STATE.READY, progress: 0, inCS: false, csTime: 0,
        color: PALETTE[i % PALETTE.length]
      }));
    } else if (type === 'monitor') {
      this.monitorLocked = false; this.monitorOwner = null; this.bufferSize = 0;
      this.threads = [
        {id:'P1', role:'producer', state:STATE.READY, produced:0, color:PALETTE[0]},
        {id:'P2', role:'producer', state:STATE.READY, produced:0, color:PALETTE[1]},
        {id:'C1', role:'consumer', state:STATE.READY, consumed:0, color:PALETTE[2]},
        {id:'C2', role:'consumer', state:STATE.READY, consumed:0, color:PALETTE[3]},
      ];
    }
  }

  tick() {
    if (this.type === 'sem') return this._tickSem();
    return this._tickMonitor();
  }

  _tickSem() {
    this.threads.forEach(t => {
      if (t.state === STATE.DONE) return;
      if (t.inCS) {
        t.csTime++; t.progress = clamp(t.progress + 8, 0, 100);
        if (t.csTime >= 4) {
          this.semValue = Math.min(this.semMax, this.semValue + 1);
          t.inCS = false; t.csTime = 0;
          t.state = t.progress >= 100 ? STATE.DONE : STATE.READY;
          if (t.state === STATE.DONE) this.log(`${t.id} completed all iterations`, 'ok');
          else this.log(`${t.id} exits CS → signal (sem=${this.semValue})`, 'warn');
        }
      } else if (t.state === STATE.READY) {
        if (this.semValue > 0) {
          this.semValue--;
          t.inCS = true; t.state = STATE.RUNNING;
          this.log(`${t.id} wait() → acquired (sem=${this.semValue})`, 'ok');
        } else {
          t.state = STATE.BLOCKED;
          this.log(`${t.id} wait() → blocked (sem=0)`, 'err');
        }
      } else if (t.state === STATE.BLOCKED) {
        if (this.semValue > 0) {
          this.semValue--; t.inCS = true; t.state = STATE.RUNNING;
          this.log(`${t.id} unblocked → enters CS (sem=${this.semValue})`, 'info');
        }
      }
    });
    return this.threads.every(t => t.state === STATE.DONE);
  }

  _tickMonitor() {
    this.threads.forEach(t => {
      if (t.state === STATE.DONE) return;
      if (t.role === 'producer') {
        if (t.state === STATE.READY) {
          if (!this.monitorLocked) {
            this.monitorLocked = true; this.monitorOwner = t.id; t.state = STATE.RUNNING;
            this.log(`${t.id} acquires monitor lock`, 'ok');
          } else { t.state = STATE.WAITING; }
        } else if (t.state === STATE.RUNNING) {
          if (this.bufferSize < this.bufferMax) {
            this.bufferSize++;
            t.produced = (t.produced||0) + 1;
            this.log(`${t.id} produced → buf=${this.bufferSize}/${this.bufferMax}`, 'ok');
            this.monitorLocked = false; this.monitorOwner = null; t.state = STATE.READY;
            const wc = this.threads.find(x => x.role === 'consumer' && x.state === STATE.WAITING);
            if (wc) { wc.state = STATE.READY; this.log(`${t.id} signals ${wc.id} (notEmpty)`, 'info'); }
          } else {
            this.log(`${t.id} → buffer full, wait(notFull)`, 'warn');
            this.monitorLocked = false; this.monitorOwner = null; t.state = STATE.WAITING;
          }
        } else if (t.state === STATE.WAITING && !this.monitorLocked) { t.state = STATE.READY; }
      } else {
        if (t.state === STATE.READY) {
          if (!this.monitorLocked) {
            this.monitorLocked = true; this.monitorOwner = t.id; t.state = STATE.RUNNING;
            this.log(`${t.id} acquires monitor lock`, 'ok');
          } else { t.state = STATE.WAITING; }
        } else if (t.state === STATE.RUNNING) {
          if (this.bufferSize > 0) {
            this.bufferSize--;
            t.consumed = (t.consumed||0) + 1;
            this.log(`${t.id} consumed ← buf=${this.bufferSize}/${this.bufferMax}`, 'ok');
            this.monitorLocked = false; this.monitorOwner = null; t.state = STATE.READY;
            const wp = this.threads.find(x => x.role === 'producer' && x.state === STATE.WAITING);
            if (wp) { wp.state = STATE.READY; this.log(`${t.id} signals ${wp.id} (notFull)`, 'info'); }
          } else {
            this.log(`${t.id} → buffer empty, wait(notEmpty)`, 'warn');
            this.monitorLocked = false; this.monitorOwner = null; t.state = STATE.WAITING;
          }
        } else if (t.state === STATE.WAITING && !this.monitorLocked) { t.state = STATE.READY; }
      }
      if ((t.role==='producer'&&t.produced>=6)||(t.role==='consumer'&&t.consumed>=6)) t.state = STATE.DONE;
    });
    return this.threads.every(t => t.state === STATE.DONE);
  }
}

// ── CPU Scheduler Engine ───────────────────────────────────
class SchedulerEngine {
  constructor() {
    this.processes = [];
    this.algo = 'rr';
    this.quantum = 3;
    this.tick = 0;
    this.currentProc = null;
    this.quantumLeft = 0;
    this.rrQueue = [];
    this.gantt = []; // {id, start, end, color}
    this.ganttCurrent = null;
    this.logs = [];
    this.onLog = null;
  }

  log(msg, cls = 'info') {
    const entry = {msg, cls};
    this.logs.unshift(entry);
    if (this.logs.length > 80) this.logs.pop();
    if (this.onLog) this.onLog(msg, cls);
  }

  init(algo, quantum) {
    this.algo = algo; this.quantum = quantum || 3;
    this.tick = 0; this.currentProc = null; this.quantumLeft = 0;
    this.gantt = []; this.ganttCurrent = null; this.logs = [];
    this.processes = [
      {id:'P1', burst:8, remaining:8, priority:2, arrival:0, state:STATE.READY, start:-1, finish:-1, wait:0, color:'#3b8cff'},
      {id:'P2', burst:5, remaining:5, priority:1, arrival:1, state:STATE.READY, start:-1, finish:-1, wait:0, color:'#22c55e'},
      {id:'P3', burst:3, remaining:3, priority:3, arrival:2, state:STATE.READY, start:-1, finish:-1, wait:0, color:'#f59e0b'},
      {id:'P4', burst:6, remaining:6, priority:2, arrival:0, state:STATE.READY, start:-1, finish:-1, wait:0, color:'#a855f7'},
    ];
    this.rrQueue = this.processes.map(p => p.id);
  }

  _selectNext() {
    const ready = this.processes.filter(p => p.state === STATE.READY && p.arrival <= this.tick);
    if (!ready.length) return null;
    if (this.algo === 'rr') {
      for (const id of this.rrQueue) { const p = ready.find(r => r.id === id); if (p) return p; }
      return ready[0];
    }
    if (this.algo === 'sjf')      return ready.slice().sort((a,b) => a.remaining - b.remaining)[0];
    if (this.algo === 'priority') return ready.slice().sort((a,b) => a.priority - b.priority)[0];
    return ready.slice().sort((a,b) => a.arrival - b.arrival)[0]; // fcfs
  }

  step() {
    this.tick++;
    if (this.currentProc) {
      const p = this.currentProc;
      p.remaining--;
      this.quantumLeft--;
      // Gantt update
      if (this.ganttCurrent && this.ganttCurrent.id === p.id) {
        this.ganttCurrent.end = this.tick;
      } else {
        if (this.ganttCurrent) this.gantt.push({...this.ganttCurrent});
        this.ganttCurrent = {id: p.id, start: this.tick-1, end: this.tick, color: p.color};
      }
      if (p.remaining <= 0) {
        p.finish = this.tick; p.state = STATE.DONE;
        this.log(`${p.id} finished at t=${this.tick} (wait=${p.wait})`, 'ok');
        if (this.ganttCurrent) { this.gantt.push({...this.ganttCurrent}); this.ganttCurrent = null; }
        this.currentProc = null; this.quantumLeft = 0;
      } else if (this.algo === 'rr' && this.quantumLeft <= 0) {
        p.state = STATE.READY;
        const idx = this.rrQueue.indexOf(p.id);
        if (idx > -1) { this.rrQueue.splice(idx, 1); this.rrQueue.push(p.id); }
        if (this.ganttCurrent) { this.gantt.push({...this.ganttCurrent}); this.ganttCurrent = null; }
        this.currentProc = null; this.quantumLeft = 0;
        this.log(`${p.id} quantum expired → back to queue`, 'warn');
      }
    }
    if (!this.currentProc) {
      const next = this._selectNext();
      if (next) {
        next.state = STATE.RUNNING;
        if (next.start === -1) next.start = this.tick;
        this.currentProc = next;
        this.quantumLeft = this.quantum;
        this.log(`Scheduler selects ${next.id} (remaining=${next.remaining}, algo=${this.algo.toUpperCase()})`, 'info');
      }
    }
    this.processes.filter(p => p.state === STATE.READY && p.arrival <= this.tick).forEach(p => p.wait++);
    return this.processes.every(p => p.state === STATE.DONE);
  }

  getStats() {
    const done = this.processes.filter(p => p.state === STATE.DONE);
    const avgWait = done.length ? (done.reduce((s,p)=>s+p.wait,0)/done.length).toFixed(1) : '-';
    const utilization = this.tick > 0 ? Math.round(this.gantt.reduce((s,g)=>s+(g.end-g.start),0)/this.tick*100) : 0;
    return { tick: this.tick, done: done.length, total: this.processes.length, avgWait, utilization };
  }
}

// ── Export engines to global scope ────────────────────────
window.ThreadingModelEngine = ThreadingModelEngine;
window.SyncEngine = SyncEngine;
window.SchedulerEngine = SchedulerEngine;
window.STATE = STATE;
window.PALETTE = PALETTE;
