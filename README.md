# Fidget Box

Ad-free games, as an installable PWA that works fully offline:

- **Sunny Acres**: an arcade-idle farm in 12 timed levels. Drag anywhere to
  walk; everything happens by walking onto things. Pick crops (they stack on
  your back), stock the market stalls, work the register, and stand on price
  tiles to build. Each level hands you a farm, a few things to build, a goal
  (earn, sell, serve or build) and a clock; finish with time to spare for
  stars. See [Sunny Acres: balancing](#sunny-acres-balancing) below.
- **Tiny Inn**: run a little hotel. Drag anywhere to walk. Check guests in
  at the desk, walk over the cash, clean messy rooms (run over the trash, bin
  it, make the bed), and spend cash on build pads: rooms, a clerk,
  housekeepers, a janitor, vending, big arms, fast shoes, a lounge, luxury
  beds. Everything you can build is one entry in `BUILDS` in
  `src/games/hotel.js`; staff behaviour is in the same file. Saved as you play.

- **Slide Free**: slide blocks aside to get the coral block out. 60 levels,
  from 2 to 45 moves; each level's minimum is proven by a solver, and
  matching it earns three stars.
- **Spades**: you and Ollie the owl against a new pair of animal rivals each
  level, on a felt table with a fanned hand. Games go to 500 by default;
  change it under the gear (150/250/300/500). Players react with speech
  bubbles (trumps, broken nils, sets, bags, wins); tap your own face to send
  an emote. Each level is
  one game to a target score (200, then 250, then 300). Opponents get
  sharper every level: fewer slips, card counting, ducking bags, attacking
  nil. The game is saved after every card.
- **Letter Trail**: drag across touching letters to make words before time
  runs out. 30 levels with rising targets and shorter clocks, and a 5x5 board
  from level 13. Boards are pre-solved, so every target is reachable.

The app has no dependencies or bundler, and makes no analytics or other-domain requests. No dependencies, no bundler, no
analytics, and no requests to any other domain. The server's
Content-Security-Policy blocks them even if one slipped in.

## Run locally

Needs Node 20+. There is nothing to `npm install`.

```bash
npm run dev      # build, serve on http://localhost:3000, rebuild on every save
npm run build    # src/ -> dist/ (what Railway runs)
npm start        # serve dist/ (PORT env var, default 3000)
npm test         # game logic, no browser: Spades rules/scoring/AI, word boards, slide levels
npm run verify   # npm test + headless Chromium: offline, plays each game, update toast, installability
npm run icons    # re-render src/icons/*.png from scripts/icon.svg (only if the art changes)
npm run levels   # regenerate src/data/slide-levels.json (~5 min; output is committed)
npm run words    # regenerate src/data/words.txt (needs `npm i --no-save wordlist-english`)
npm run farm:pace        # Sunny Acres: a bot plays every level in seconds, prints its times vs the limits
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
  lib/                      settings, sound + haptics, palette, canvas helpers,
                            progress.js (levels unlocked, stars, saved games),
                            ui.js (result panels, level picker)
  data/                     slide-levels.json, words.txt (+ licence)
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
   import { progress, loadSave, writeSave } from '../lib/progress.js'; // levels + stars, resumable state
   import { panel, levelPicker, starsHTML, pills } from '../lib/ui.js'; // result panel, level coins, HUD pills
   import { confetti, floater, shake } from '../lib/fx.js';          // celebration effects

   export default {
     id: 'myid',                       // must match the file name
     name: 'My toy',
     description: 'One line for the home tile.',
     color: '--mint',                  // a palette var: --sky --mint --lilac --peach --butter --pink
     icon: '<svg viewBox="0 0 40 40" ...>...</svg>',   // small fallback icon, currentColor
     art: '<svg viewBox="0 0 100 100" ...>...</svg>',  // optional: the home card illustration
     levels: 30,                       // optional: shows "Lv" and stars on the home card
     meta: () => pills([...]),         // optional instead of levels: your own home-card summary
     css: `.my-thing{...}`,            // optional; injected once
     init(container) {
       // build UI inside container, call ac() on first touch so sound starts
       return () => { /* cancel rAF, remove window listeners */ };
     },
   };
   ```

2. Add `'myid',` to `src/games/registry.js`.

That's it. The home tile, the "Three games" count, the service worker's
precache list and the version all follow automatically. Data files a game
fetches go in `src/data/` (load them with `new URL('../data/x', import.meta.url)`)
and get cached for offline use the same way.

## Look and feel

One fixed "arcade at night" theme in `src/styles.css`, not following the
phone's light/dark setting: a starfield, chunky outlined pieces (3px
`--outline`, hard drop shadow, light top edge), `.btn` / `.btn.primary` /
`.ibtn` buttons that press down, `.pill` HUD counters, and panels with a
ribbon title. `panel(el, { mood: 'win' })` adds confetti, `'lose'` a peach
ribbon. Each game styles its own scene in its `css` (wooden board, felt
table, letter tiles) using those tokens.

For levels: `const prog = progress('<id>')`, start at `prog.last`, call
`prog.complete(n, stars)` on a win (this unlocks `n + 1`), and open
`levelPicker(el, { count, prog, onPick })` from a Levels button. The build fails if
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

## Sunny Acres: balancing

Files: `src/games/farm.js` (game loop and level flow),
`src/games/farm/config.js` (every number, the layout, the build order and the
levels), `src/games/farm/art.js` (all drawing). To rebalance, edit only
`config.js`, then run `npm run farm:pace`: a bot plays every level at the
player's walking speed (fast-forwarded) and prints its time against each
limit. Limits are set to about 1.7x the bot's slowest of three runs.

| Config | What it changes |
| --- | --- |
| `LEVELS[]` | Each level: `start` (already built), `coins`, `build` (tiles you can buy), `goals` (`earn`, `sell`, `serve`, `build`), `time`, `priceScale` (discounts that level's tiles). |
| `STAR_TIME_LEFT` | Stars by time left: 30%+ = 3, 10%+ = 2. |
| `UNLOCKS[].price` and order | Base tile prices and the order tiles appear in (3 at a time). `after:` hides a tile until something else is built. |
| `products.*.price` | What each item sells for. |
| `fields[].grow`, `pens[].interval` / `animals`, `machines[].time` | Production speed. |
| `customers.every`, `buyMin`/`buyMax` | Demand, often the cap on income. |
| `upgrades.*.levels` / `cost` | Speed, basket, harvest, helper and machine upgrades (reset each level). |
| `UNLOCK_SECONDS`, `UNLOCK_DWELL` | How fast coins drain into a tile, and how long you stand before they start (walking across is free). |

`npm test` checks every level can be won from its config (a stand and a
source for each sell goal, nothing behind a fence the level can't open).
