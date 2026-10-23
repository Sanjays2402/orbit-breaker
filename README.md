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

Choose **Drift**, **Classic**, or **Hyper** before launch. Hyper makes threats faster and more frequent, but awards a 1.5× score bonus.

## Features

- Responsive mouse, keyboard, and touch gameplay
- Procedural Web Audio sound effects with a persistent mute preference
- Persistent local high score
- Separate persistent high scores per flight mode, so Drift, Classic, and Hyper records never compete
- Three hazard types, combo scoring, particles, screen shake, and escalating levels
- Three flight modes with separate threat pacing and score multipliers
- Aegis shields, Chrono slow-motion fields, and shard-attracting Magnet capsules
- Recurring nine-shard storm bonus events
- Void Warden boss encounters with telegraphed volleys and multi-hit pulse combat
- Flow Overdrive at 5× combo, adding bonus score and passive charge regeneration
- Seven persistent achievement badges with in-game notifications
- Persistent pilot career stats for runs, Warden defeats, best Flow, and lifetime shards
- Automatic pause when the tab loses focus
- Accessible labels, live announcements, focus states, and reduced-motion support

## Production

```sh
npm run build
npm run preview
```

Every push to `main` is automatically built and deployed to GitHub Pages by GitHub Actions.

## Terms & Disclaimer

By using this project you agree to the following.

- **No warranty.** This software is provided "as is", without warranty of any kind, express or implied, including merchantability, fitness for a particular purpose, and non-infringement.
- **No liability.** To the maximum extent permitted by law, the author and contributors are not liable for any claim, loss, or damage (direct, indirect, incidental, or consequential, including lost data or profits) arising from its use.
- **Your responsibility.** You use it at your own risk and are responsible for complying with the laws that apply to you.
- **Third parties.** Names, logos, APIs, and services of others belong to their owners and are used for identification only; no affiliation or endorsement is implied.
- **Your statutory rights.** Nothing here limits rights that cannot be waived by agreement, including under consumer-protection laws in the USA, Canada (including Quebec), and India (Consumer Protection Act, 2019).
- **License.** No open-source license is granted. All rights reserved; you may view and fork this repository only as GitHub's Terms of Service allow.
