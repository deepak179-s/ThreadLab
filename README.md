# Real-Time Multi-threaded Application Simulator
### Desktop App — Electron

---

## 🚀 Quick Start (2 commands)

```bash
# 1. Install Electron
npm install

# 2. Launch the app
npm start
```

That's it. The app window opens immediately.

---

## 📁 Folder Structure

```
multithreaded-sim/
├── main.js          ← Electron main process (window creation)
├── preload.js       ← Context bridge
├── package.json     ← Dependencies
└── src/
    ├── index.html   ← App entry point
    ├── styles.css   ← Full dark-theme stylesheet
    ├── engine.js    ← Simulation engine (threads, sync, scheduler, deadlock)
    └── app.js       ← UI rendering & interaction
```

---

## 🖥 System Requirements

- **Node.js** v16 or higher → https://nodejs.org
- **npm** v7 or higher (comes with Node.js)
- Windows 10+, macOS 10.15+, or Ubuntu 18.04+

---

## 📦 Manual Install (if npm install fails)

```bash
npm install --save-dev electron@latest
```

Or install Electron globally:
```bash
npm install -g electron
electron .
```

---

## 🎮 How to Use Each Tab

### Tab 1 — Threading Models
1. Select model: Many-to-One / One-to-One / Many-to-Many
2. Click **▶ Run** — watch threads animate through the CPU
3. Click **+ Thread** to add more user threads mid-simulation
4. Adjust the **Speed** slider (1x–10x)

### Tab 2 — Synchronization
1. Select primitive: **Semaphore**, **Monitor**, or **Barrier**
2. Configure parameters (semaphore value, thread count)
3. Click **▶ Run** — observe blocking, signaling, and CS access

### Tab 3 — CPU Scheduler
1. Select algorithm: RR / SJF / Priority / FCFS
2. Set the time quantum for Round Robin
3. Click **▶ Run** — Gantt chart builds in real-time
4. Click **↺ Reset** to re-run with a different algorithm

### Tab 4 — Deadlock
1. Click **▶ Simulate** — watch circular wait form in stages
2. Click **🔍 Detect** — Banker's Algorithm analysis appears
3. Click **✓ Resolve** — preemption unwinds the deadlock
4. Click **↺ Reset** to start over

---

## 🛠 Development Mode (with DevTools)

```bash
npm run dev
```

This opens the app with Chrome DevTools detached for debugging.

---

## 📦 Package as Installer

Install electron-builder then build:
```bash
npm install --save-dev electron-builder
npx electron-builder
```

Output will be in the `dist/` folder:
- Windows: `.exe` installer
- macOS: `.dmg`
- Linux: `.AppImage`
