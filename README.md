# Real-Time Multi-threaded Application Simulator

Interactive simulator for threading models, synchronization primitives, CPU scheduling, and deadlock handling.

The project now supports both:

- Electron desktop mode
- Static web deployment for Vercel, Render, or any static host

## Run Locally

Install dependencies once:

```bash
npm install
```

Launch the Electron app:

```bash
npm start
```

Launch the browser version:

```bash
npm run web
```

The local web preview starts on `http://127.0.0.1:4173`.

## Available Scripts

```bash
npm start         # Electron app
npm run desktop   # Electron app
npm run dev       # Electron app with DevTools
npm run desktop:dev
npm run web       # Static web preview
npm run preview   # Alias for web preview
```

## Deployment

### Vercel

1. Import the GitHub repository into Vercel.
2. Keep the project as a static site.
3. No build command is required.
4. The included `vercel.json` rewrites requests to `index.html`.



## Project Structure

```text
.
├── index.html               # Shared web entry used by both browser and Electron
├── main.js                  # Electron main process
├── preload.js               # Electron preload bridge
├── render.yaml              # Render static hosting config
├── vercel.json              # Vercel routing config
├── scripts/
│   └── serve-static.js      # Local web preview server
└── src/
    ├── app.js               # UI rendering and interaction
    ├── engine.js            # Simulation engines
    ├── index.html           # Legacy source entry
    └── styles.css           # Shared styling
```

## What Changed

- The Electron shell now loads the shared root `index.html`.
- The UI detects whether it is running in Electron or a browser.
- The same visual design is preserved across both runtimes.
- Static hosting configuration is included for Vercel.

## Notes

- Electron remains available, so you can continue using the desktop app at any time.
- The browser deployment is fully static and does not require a backend.
