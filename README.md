# Orbit Breaker

A fast, neon arcade game built with TypeScript, Vite, and the Canvas 2D API. Ride the orbital ring, dodge incoming threats, collect energy shards, and spend charge on a screen-clearing pulse.

**Play online:** [sanjays2402.github.io/orbit-breaker](https://sanjays2402.github.io/orbit-breaker/)

## Play

```sh
npm install
npm run dev
```

Open the local URL printed by Vite.

## Controls

- **Move:** Left/Right arrows, `A`/`D`, or drag around the core
- **Pulse:** Space bar or the Pulse button (costs 30 charge)
- **Pause:** `P`, Escape, or the pause button
- **Start/restart:** Enter or the on-screen button

Near misses build the Flow multiplier. Cyan and pink shards add charge, and difficulty rises every 18 seconds.

## Features

- Responsive mouse, keyboard, and touch gameplay
- Procedural Web Audio sound effects with a persistent mute preference
- Persistent local high score
- Three hazard types, combo scoring, particles, screen shake, and escalating levels
- Automatic pause when the tab loses focus
- Accessible labels, live announcements, focus states, and reduced-motion support

## Production

```sh
npm run build
npm run preview
```

Every push to `main` is automatically built and deployed to GitHub Pages by GitHub Actions.
