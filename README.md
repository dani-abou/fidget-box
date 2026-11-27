# Fidget Box

Ad-free fidget toys (bubble wrap, spinner, switchboard, ripples, dot field) as
an installable PWA that works fully offline. No dependencies, no bundler, no
analytics, and no requests to any other domain. The server's
Content-Security-Policy blocks them even if one slipped in.

## Run locally

Needs Node 20+. There is nothing to `npm install`.

```bash
npm run dev      # build, serve on http://localhost:3000, rebuild on every save
npm run build    # src/ -> dist/ (what Railway runs)
npm start        # serve dist/ (PORT env var, default 3000)
npm run verify   # headless-Chromium check: offline, every game, update toast, installability
npm run icons    # re-render src/icons/*.png from scripts/icon.svg (only if the art changes)
```

`verify` and `icons` need Playwright (`npm i -g playwright && npx playwright install chromium`).
The app itself doesn't.

The service worker caches aggressively, so while developing tick **DevTools >
Application > Service workers > Update on reload**. Otherwise you'll see the
toast after every save, which is the update flow working.

## Layout

```
src/
  index.html, styles.css    shell markup and shared styles (palette, header, tiles, toast)
  app.js                    home screen, router, Sound/Buzz chips, update toast
  lib/                      settings, sound + haptics, palette, canvas helpers
  games/registry.js         the list of game ids, in home-screen order
  games/<id>.js             one file per game
  sw.js                     service worker template (build fills in version + file list)
  manifest.webmanifest, icons/, fonts/ (Fredoka woff2, SIL OFL)
build.mjs                   the build
server.mjs                  the static server (cache headers, MIME types, CSP)
```

## Add a game

1. Create `src/games/<id>.js`:

   ```js
   import { ac, buzz, click, sfxPop, tone } from '../lib/sound.js';
   import { P, ACCENTS } from '../lib/palette.js';        // P.acc[0..4], P.ink, P.muted ... for canvas
   import { makeCanvas, rel } from '../lib/canvas.js';    // HiDPI canvas that fills the stage

   export default {
     id: 'myid',                       // must match the file name
     name: 'My toy',
     description: 'One line for the home tile.',
     color: '--mint',                  // a palette var: --sky --mint --lilac --peach --butter
     icon: '<svg viewBox="0 0 40 40" ...>...</svg>',   // stroke/fill currentColor
     css: `.my-thing{...}`,            // optional; injected once
     init(container) {
       // build UI inside container, call ac() on first touch so sound starts
       return () => { /* cancel rAF, remove window listeners */ };
     },
   };
   ```

2. Add `'myid',` to `src/games/registry.js`.

That's it. The home tile, the "Five little toys" count, the service worker's
precache list and the version all follow automatically. The build fails if
the registry names a file that doesn't exist or a game is missing a field. It
warns if a game file isn't in the registry.

To change a game, edit its file. To reorder the home screen, reorder the
registry (the first one gets the wide tile).

## How updates reach your phone

1. Push to `main`. Railway runs `npm run build` and `npm start`.
2. The build hashes every source file into a version (shown at the bottom of
   the home screen, e.g. `v677df3e811`) and writes it, plus the list of every
   file, into `sw.js`. Any change gives a new `sw.js`.
3. `sw.js` is served with `Cache-Control: no-cache`, so the browser always
   checks it. The app checks when it opens online, when it comes back to the
   foreground, and when the connection returns.
4. The new version downloads in the background. When it's ready, **"Update
   ready, tap to reload"** appears on the home screen. It never appears over a
   game in progress; it waits until you go back. Tap it to switch. If you
   ignore it, the old version keeps working, and the new one takes over the
   next time the app is fully closed and reopened.
5. On activate, the old version's cache is deleted.

Offline, nothing changes: the app runs entirely from the cache.

## Deploy

Railway project `fidget-box`, one service built from this repo's `main`
branch (`railway.json`: Railpack, `npm run build`, `npm start`, health check
`/healthz`). No environment variables are needed. Railway sets `PORT`.
