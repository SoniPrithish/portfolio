# Pool Portfolio

A premium portfolio site that treats navigation like a modern 8-ball match. The home route is a realtime pool table, project balls unlock content through play, and every section has an accessible HTML equivalent.

## Stack

- React + Vite + TypeScript
- React Router for route parity between the interactive mode and the HTML mode
- Three.js via `@react-three/fiber`
- Custom fixed-step pool simulation tuned for smoothness and deterministic behavior
- Zustand for cross-layer state
- Web Audio API for generated cue, collision, rail, pocket, and ambient sounds

## Features

- Realtime 3D pool table as the primary navigation layer
- Desktop aim + pull-back shot controls and mobile drag + slider controls
- Cue ball spin selector for topspin, draw, and side English
- Cinematic intro with skip behavior and automatic low-end bypass
- Project side panel with focus trap, escape-to-close, and keyboard-safe interaction
- Accessibility mode with semantic routes: `/`, `/about`, `/projects`, `/projects/:id`, `/contact`
- Graphics presets with quality scaling and runtime performance suggestions
- Procedural cloth, wood, and ball visuals, so the project ships without heavy placeholder textures

## Setup

```bash
npm install
npm run dev
```

## Verification

TypeScript:

```bash
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
```

Production bundle:

```bash
./node_modules/.bin/vite build
```

If Vite bundling is unusually slow on a synced drive, move the repo to a local non-synced folder before final deployment builds.

## Editing Content

Update these files first:

- `src/data/portfolio.ts` for brand content, project metadata, links, and placeholder copy
- `src/components/FocusPanel.tsx` for About, Skills, Help, and Contact panel copy
- `src/index.css` for colors, typography, and overlay styling

## Project Structure

```text
src/
  components/
    AccessiblePortfolio.tsx
    FocusPanel.tsx
    PoolExperience.tsx
    TopNav.tsx
  data/
    portfolio.ts
  lib/
    audio/PoolAudioEngine.ts
    pool/PoolSimulation.ts
    pool/ballVisuals.ts
    siteConfig.ts
  store/
    usePortfolioStore.ts
  types/
    portfolio.ts
```

## Physics Notes

Core tuning lives in `src/lib/pool/PoolSimulation.ts`.

Important values:

- `FIXED_DT = 1 / 120`
- `MAX_SUBSTEPS = 4`
- `BALL_RESTITUTION = 0.96`
- `RAIL_RESTITUTION = 0.87`
- `ROLL_FRICTION = 0.88`
- `SLIDE_FRICTION = 1.95`
- `FOLLOW_FORCE = 0.58`
- `CURVE_FORCE = 0.16`
- `SIDE_THROW = 0.095`

Why a custom solver was used:

- Pool is fundamentally a 2D tabletop problem, so a dedicated solver keeps the table responsive and avoids the overhead and jitter that general 3D rigid body engines can introduce for this specific interaction model.

## Performance Notes

Current performance-oriented decisions:

- Balls render through a single instanced mesh.
- Physics runs on a fixed timestep with interpolation.
- Ball and rail audio is synthesized, avoiding network/audio asset overhead.
- Cloth and wood visuals are procedural, so there are no large texture downloads by default.
- Quality presets clamp device pixel ratio and disable shadows on low/medium.
- The UI suggests dropping graphics if measured FPS dips.

## Replacing Placeholder Assets

The current build uses procedural placeholders instead of downloaded textures or HDRIs. To replace them:

1. Update brand and project copy in `src/data/portfolio.ts`.
2. Replace the procedural cloth and wood maps in `src/lib/pool/ballVisuals.ts` with local textures or KTX2 assets.
3. Replace the generated environment in `src/components/PoolExperience.tsx`.
   Search for `RoomEnvironment`.
4. If you add real textures, prefer compressed KTX2 assets and keep lower-resolution variants for Low and Medium presets.
5. If you add screenshots or project stills, attach them to each project entry in `src/data/portfolio.ts`.

## Deployment

### Vercel

```bash
npm install
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
./node_modules/.bin/vite build
```

- `vercel.json` already rewrites SPA routes to `index.html`.

### Netlify

```bash
npm install
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
./node_modules/.bin/vite build
```

- `public/_redirects` already handles SPA routes.

## Quick Replacement Checklist

- Replace brand name, role, tagline, email, and links in `src/data/portfolio.ts`.
- Swap placeholder project descriptions and URLs in `src/data/portfolio.ts`.
- Adjust colors and fonts in `src/index.css` to match your final brand system.
- If you want true asset-based materials, replace the procedural generators in `src/lib/pool/ballVisuals.ts`.
- If you want HDRI reflections, replace `RoomEnvironment` in `src/components/PoolExperience.tsx`.
