// Sunny Acres: every balance number, the whole layout and the levels live here.
// Positions are in tiles (x across 0..38, y down 0..36). Times are seconds.
// The farm is a cross: the market in the middle, Home Field north, Meadow west, Pasture east,
// Hillside south, so nothing is ever more than a short run from the stalls.
// Rebalance by editing this file only; `npm test` prints the pacing table.

export const CONFIG = {
  world: { cols: 38, rows: 36, start: { x: 19, y: 15.5 },
    market: { x: 12, y: 11.6, w: 14, h: 12.4 },                         // plaza + the road below it; never mirrored
    blocked: [{ x: 0, y: 24, w: 12, h: 12 }, { x: 26, y: 24, w: 12, h: 12 }], // woods beside the Hillside
    road: { y: 20.6, h: 3.4 } },

  // ---- the player ----
  player: {
    pickupInterval: .06,   // seconds between items when grabbing from a pile
    dropInterval: .06,     // seconds between items when stocking a stand or machine
    reach: 1.05,           // how close (tiles) to a stand/pile/machine counts as "at it"
  },

  // ---- upgrades bought at the upgrade mat; levels[i] is the value at level i ----
  upgrades: {
    speed:   { label: 'Run speed',     icon: '👟', levels: [4.2, 4.8, 5.4, 6.0, 6.6], cost: [25, 90, 260, 700] },
    carry:   { label: 'Basket size',   icon: '🧺', levels: [8, 12, 16, 22, 30],        cost: [20, 70, 220, 600] },
    harvest: { label: 'Harvest speed', icon: '✂️', levels: [.22, .15, .1, .06, .03],  cost: [30, 110, 320, 800], unit: 's per crop' },
    helperSpeed: { label: 'Helper speed', icon: '🏃', levels: [3.0, 3.5, 4.0, 4.6], cost: [150, 450, 1200], needs: 'hand_carrot' },
    helperCarry: { label: 'Helper basket', icon: '🧺', levels: [6, 8, 11, 14],     cost: [180, 520, 1400], needs: 'hand_carrot' },
    machineSpeed: { label: 'Machine speed', icon: '⚙️', levels: [1, 1.4, 1.9, 2.5], cost: [300, 900, 2200], needs: 'mill' },
  },

  // ---- products: sale price per item (0 = never sold, only processed) ----
  products: {
    carrot:  { name: 'Carrots',  price: 3 },
    corn:    { name: 'Corn',     price: 5 },
    egg:     { name: 'Eggs',     price: 7 },
    wheat:   { name: 'Wheat',    price: 0 },
    flour:   { name: 'Flour',    price: 0 },
    bread:   { name: 'Bread',    price: 22 },
    pumpkin: { name: 'Pumpkins', price: 15 },
    milk:    { name: 'Milk',     price: 0 },
    cheese:  { name: 'Cheese',   price: 30 },
    wool:    { name: 'Wool',     price: 26 },
  },

  // ---- crop fields: 1-tile plots; crate is where a farmhand piles the harvest ----
  fields: [
    { id: 'carrotA', crop: 'carrot',  x: 13, y: 7,  w: 3, h: 2, grow: 4,  start: true },
    { id: 'carrotB', crop: 'carrot',  x: 13, y: 4,  w: 3, h: 2, grow: 4 },
    { id: 'cornA',   crop: 'corn',    x: 22, y: 7,  w: 3, h: 2, grow: 6 },
    { id: 'cornB',   crop: 'corn',    x: 22, y: 4,  w: 3, h: 2, grow: 6 },
    { id: 'wheat',   crop: 'wheat',   x: 1,  y: 5,  w: 3, h: 3, grow: 5 },
    { id: 'pumpkin', crop: 'pumpkin', x: 13, y: 27, w: 3, h: 3, grow: 9 },
  ],

  // ---- animal pens: each animal lays/produces one item every `interval` into the pile ----
  pens: [
    { id: 'coop',  animal: 'chicken', product: 'egg',  x: 7,  y: 5,  w: 3, h: 3, animals: 3, interval: 4.5, pile: { x: 10.7, y: 7.6 } },
    { id: 'barn',  animal: 'cow',     product: 'milk', x: 31, y: 5,  w: 3, h: 3, animals: 2, interval: 6,   pile: { x: 30.3, y: 7.6 } },
    { id: 'sheep', animal: 'sheep',   product: 'wool', x: 22, y: 27, w: 3, h: 3, animals: 3, interval: 8,   pile: { x: 21.3, y: 29.6 } },
  ],
  pileCap: 16,

  // ---- machines: one input item -> one output item every `time` (divided by machine speed) ----
  machines: [
    { id: 'mill',   name: 'Mill',         in: 'wheat', out: 'flour',  x: 4,    y: 11.5, time: 1.6 },
    { id: 'bakery', name: 'Bakery',       in: 'flour', out: 'bread',  x: 8.5,  y: 11.5, time: 2.2 },
    { id: 'press',  name: 'Cheese press', in: 'milk',  out: 'cheese', x: 29.5, y: 11.5, time: 2.5, dir: -1 }, // dir -1: input on the right
  ],
  machineCap: 20, // input and output each

  // ---- market stands along the plaza; customers buy from these ----
  stands: [
    { id: 'stand_carrot',  product: 'carrot',  x: 13.2,  start: true },
    { id: 'stand_corn',    product: 'corn',    x: 15.13 },
    { id: 'stand_egg',     product: 'egg',     x: 17.06 },
    { id: 'stand_bread',   product: 'bread',   x: 18.99 },
    { id: 'stand_pumpkin', product: 'pumpkin', x: 20.92 },
    { id: 'stand_cheese',  product: 'cheese',  x: 22.85 },
    { id: 'stand_wool',    product: 'wool',    x: 24.78 },
  ],
  standY: 12.6, standCap: 24,

  register: { mat: { x: 21.7, y: 17.1 }, counter: { x: 20.6, y: 17.1 }, playerTime: .45, cashierTime: .9,
    queue: [[19.4, 17.1], [18.4, 17.4], [17.4, 17.8], [16.4, 18.2], [15.4, 18.6], [14.4, 19]] },
  upgradeMat: { x: 24.3, y: 19.4 },
  // shipping bin: stand on it to sell whatever you carry at a share of the price, so a full basket
  // never has to wait for a stall to empty. Wheat, flour and milk (no stall price) still fetch `min`.
  shipBin: { x: 13.4, y: 17.3, rate: .5, min: 1 },

  // ---- level events (only in levels whose goals use them) ----
  cart: { x: 24.4, y: 15.9 },                       // festival cart: { fill: { carrot: 8, ... } }
  vip: { spot: { x: 15.3, y: 15.3 }, every: 5, patience: 60, items: [3, 5], bonus: 2 }, // special orders: pays bonus x price
  crows: { every: [6, 11], fly: 1.2, peck: 4.5, scare: 1.7, max: 3 },               // crow patrol
  inspect: { warn: 25, reward: 25 },

  // ---- Free Farm (endless mode): what you earn while away ----
  // coins = automated coins/sec (what helpers could sell) x seconds away x efficiency, up to maxHours.
  offline: { efficiency: .1, maxHours: 4, minSeconds: 60 },                 // seconds of warning (the inspector names one stall then); coins for passing

  customers: {
    spawn: [{ x: 15.9, y: 23.4 }, { x: 16.7, y: 23.5 }], gate: { x: 19, y: 20.2 }, // they step off the bus at the stop below the plaza
    busStop: { x: 15, y: 23.7 },
    every: 2.4, everyPerStand: -.2, everyMin: 1.2,   // seconds between arrivals
    maxBase: 3, maxPerStand: 1,                     // how many can be around at once
    buyMin: 1, buyMax: 4, takeInterval: .22, patience: 14, speed: 2.4,
    queuePatience: 30,                               // seconds in line before a customer gives up (breaks a happy streak)
  },

  // ---- zones: fences you open with a gate unlock ----
  zones: [ // rects; the market belongs to none and is always open. gate: the unlock tile's id
    { id: 'home',     name: 'Home Field', x: 12, y: 0,  w: 14, h: 11.6, start: true },
    { id: 'meadow',   name: 'Meadow',     x: 0,  y: 0,  w: 12, h: 24 },
    { id: 'pasture',  name: 'Pasture',    x: 26, y: 0,  w: 12, h: 24 },
    { id: 'hillside', name: 'Hillside',   x: 12, y: 24, w: 14, h: 12 },
  ],

  // ---- helpers; each is unlocked by an entry in UNLOCKS with the same id ----
  helpers: [
    { id: 'hand_carrot', kind: 'farmhand', fields: ['carrotA', 'carrotB'], crate: { x: 16.7, y: 7.2 } },
    { id: 'hand_corn',   kind: 'farmhand', fields: ['cornA', 'cornB'],     crate: { x: 21.3, y: 7.2 } },
    { id: 'hand_wheat',  kind: 'farmhand', fields: ['wheat'],              crate: { x: 4.7, y: 7.6 } },
    { id: 'hand_pumpkin', kind: 'farmhand', fields: ['pumpkin'],           crate: { x: 16.7, y: 28.6 } },
    { id: 'cashier',  kind: 'cashier' },
    { id: 'carrier1', kind: 'carrier', home: { x: 18, y: 15.6 } },
    { id: 'carrier2', kind: 'carrier', home: { x: 20, y: 15.6 } },
    { id: 'carrier3', kind: 'carrier', home: { x: 19, y: 14.8 } },
  ],
  crateCap: 40,
  harvestTimeHelper: .5,

};

// The unlock tiles, in the order they appear. Three are on the ground at a time,
// so there's always a next thing nearly in reach. `at` = where the price tile sits.
// `after`: the tile only appears once that id is built (no stand before its crop).
export const UNLOCKS = [
  { id: 'carrotB',      price: 10,   label: 'Carrot patch',    icon: '🥕', at: { x: 14.5, y: 5 } },
  { id: 'cornA',        price: 22,   label: 'Corn field',      icon: '🌽', at: { x: 23.5, y: 8 } },
  { id: 'stand_corn',   price: 18,   label: 'Corn stand',      icon: '🌽', at: { x: 15.13, y: 13 }, after: 'cornA' },
  { id: 'hand_carrot',  price: 45,   label: 'Carrot farmhand', icon: '🧑‍🌾', at: { x: 17.4, y: 5.8 } },
  { id: 'cornB',        price: 60,   label: 'More corn',       icon: '🌽', at: { x: 23.5, y: 5 } },
  { id: 'cashier',      price: 80,   label: 'Cashier',         icon: '🧑‍💼', at: { x: 22.8, y: 18.2 } },
  { id: 'hand_corn',    price: 95,   label: 'Corn farmhand',   icon: '🧑‍🌾', at: { x: 20.6, y: 5.8 } },
  { id: 'carrier1',     price: 120,  label: 'Carrier',         icon: '🛒', at: { x: 17.2, y: 15.6 } },
  { id: 'meadow',       price: 200,  label: 'Open the Meadow', icon: '🚪', at: { x: 12.9, y: 14.2 } },
  { id: 'coop',         price: 150,  label: 'Chicken coop',    icon: '🐔', at: { x: 8.5, y: 6.5 } },
  { id: 'stand_egg',    price: 120,  label: 'Egg stand',       icon: '🥚', at: { x: 17.06, y: 13 }, after: 'coop' },
  { id: 'wheat',        price: 180,  label: 'Wheat field',     icon: '🌾', at: { x: 2.5, y: 6.5 } },
  { id: 'mill',         price: 240,  label: 'Mill',            icon: '⚙️', at: { x: 4, y: 11.7 }, after: 'wheat' },
  { id: 'bakery',       price: 340,  label: 'Bakery',          icon: '🍞', at: { x: 8.5, y: 11.7 }, after: 'mill' },
  { id: 'stand_bread',  price: 300,  label: 'Bread stand',     icon: '🍞', at: { x: 18.99, y: 13 }, after: 'bakery' },
  { id: 'carrier2',     price: 380,  label: '2nd carrier',     icon: '🛒', at: { x: 20.8, y: 15.6 } },
  { id: 'hand_wheat',   price: 450,  label: 'Wheat farmhand',  icon: '🧑‍🌾', at: { x: 4.6, y: 9.3 }, after: 'wheat' },
  { id: 'pasture',      price: 650,  label: 'Open the Pasture', icon: '🚪', at: { x: 25.1, y: 14.2 } },
  { id: 'barn',         price: 600,  label: 'Cow barn',        icon: '🐄', at: { x: 32.5, y: 6.5 } },
  { id: 'press',        price: 800,  label: 'Cheese press',    icon: '🧀', at: { x: 29.5, y: 11.7 }, after: 'barn' },
  { id: 'stand_cheese', price: 700,  label: 'Cheese stand',    icon: '🧀', at: { x: 22.85, y: 13 }, after: 'press' },
  { id: 'hillside',     price: 800,  label: 'Open the Hillside', icon: '🚪', at: { x: 19, y: 23.3 } },
  { id: 'pumpkin',      price: 900,  label: 'Pumpkin patch',   icon: '🎃', at: { x: 14.5, y: 28.5 } },
  { id: 'stand_pumpkin', price: 800, label: 'Pumpkin stand',   icon: '🎃', at: { x: 20.92, y: 13 }, after: 'pumpkin' },
  { id: 'carrier3',     price: 1000, label: '3rd carrier',     icon: '🛒', at: { x: 19, y: 14.6 } },
  { id: 'sheep',        price: 1200, label: 'Sheep pen',       icon: '🐑', at: { x: 23.5, y: 28.5 } },
  { id: 'stand_wool',   price: 1000, label: 'Wool stand',      icon: '🧶', at: { x: 24.78, y: 13 }, after: 'sheep' },
  { id: 'hand_pumpkin', price: 1200, label: 'Pumpkin farmhand', icon: '🧑‍🌾', at: { x: 17.3, y: 30.4 }, after: 'pumpkin' },
];
export const SHOWN_UNLOCKS = 3;
export const LOOKAHEAD = 2;        // how far past those 3 the game may look for a tile that's showable
export const UNLOCK_SECONDS = 1;   // standing on a tile drains its whole price in about this long
export const UNLOCK_DWELL = .35;   // seconds you must stay on a tile before coins start draining (walking across is free)

// First-run hints, before the unlock goals take over.
export const TUTORIAL = [
  { id: 'harvest', text: 'Walk over the carrots to pick them' },
  { id: 'stock',   text: 'Drop them at the carrot stand' },
  { id: 'sell',    text: 'Stand at the register to sell' },
];

// ---- levels ----
// Each level is a short timed round on the same farm.
//   start: what's already built (on top of the starter carrots + stand)
//   coins: coins you start with
//   build: which price tiles appear this level (shown in UNLOCKS order, 3 at a time)
//   goals: all must be met before time runs out. Any of:
//     { earn: n }               coins from sales this level
//     { sell: 'bread', n }      items of one product sold
//     { serve: n }              customers rung up
//     { build: 'mill' }         something built
//     { fill: { egg: 10, ... } } fill the festival cart with these
//     { orders: n, with: 'cheese' } fill n special orders from VIP customers (each includes `with`, if given)
//     { crows: n }              crows land on ripe crops: lose more than n to them and the level fails
//     { streak: n }             serve n customers in a row with nobody giving up and leaving
//     { inspect: { at: [90, 200], min: 4 } } at those seconds in, the stall the inspector names needs min+ items, or the level fails
//     { builds: n }             build n things (Mega Expansion levels)
//   mega: true marks a Mega Expansion level (big, one long build-out; seeds x META.reward.megaMult)
//   priceScale: multiplies this level's tile prices (default 1), so a level can be about one chain
//   time: seconds. Stars come from time left when you finish (STAR_TIME_LEFT).
const HOME = ['carrotB', 'cornA', 'stand_corn', 'cornB'];
const HELP = ['hand_carrot', 'cashier', 'hand_corn', 'carrier1'];
const MEADOW = ['meadow', 'coop', 'stand_egg', 'wheat', 'mill', 'bakery', 'stand_bread', 'hand_wheat', 'carrier2'];
const PASTURE = ['pasture', 'barn', 'press', 'stand_cheese', 'hillside', 'pumpkin', 'stand_pumpkin', 'carrier3', 'sheep', 'stand_wool', 'hand_pumpkin'];
export const LEVELS = [
  { name: 'First Harvest',   time: 60,  coins: 0,   start: [],                                  build: ['carrotB'],                       goals: [{ sell: 'carrot', n: 12 }], tutorial: true },
  { name: 'Festival Cart',   time: 135, coins: 25,  start: ['carrotB'],                         build: ['cornA', 'cornB'],                goals: [{ fill: { carrot: 8, corn: 8 } }] },
  { name: 'Crow Patrol',     time: 120, coins: 20,  start: ['carrotB', 'cornA', 'stand_corn'],  build: ['hand_carrot', 'cornB', 'cashier'], goals: [{ sell: 'corn', n: 20 }, { crows: 3 }] },
  { name: 'Rush Hour',       time: 165, coins: 30,  start: [...HOME, 'hand_carrot', 'hand_corn'], build: ['cashier', 'carrier1'],         goals: [{ streak: 12 }] },
  { name: 'Mega Expansion: Home Field', mega: true, time: 300, coins: 0, start: [], build: [...HOME, ...HELP], priceScale: .7, goals: [{ builds: 8 }] },
  { name: 'Into the Meadow', time: 255, coins: 60,  start: [...HOME, ...HELP, 'meadow'],        build: ['coop', 'stand_egg', 'carrier2'], priceScale: .6, goals: [{ orders: 4 }] },
  { name: 'Daily Bread',     time: 245, coins: 80,  start: [...HOME, ...HELP, 'meadow', 'coop', 'stand_egg', 'wheat', 'mill'], build: ['bakery', 'stand_bread', 'hand_wheat', 'carrier2'], priceScale: .5, goals: [{ sell: 'bread', n: 5 }, { inspect: { at: [80, 170], min: 4 } }] },
  { name: 'Harvest Fair',    time: 375, coins: 0,   start: [...HOME, ...HELP, ...MEADOW],       build: [],                                goals: [{ fill: { egg: 8, bread: 4, corn: 12 } }, { crows: 4 }] },
  { name: 'Mega Expansion: Meadow', mega: true, time: 300, coins: 80, start: [...HOME, ...HELP], build: [...MEADOW], priceScale: .4, goals: [{ builds: 8 }] },
  { name: 'Say Cheese',      time: 360, coins: 100, start: [...HOME, ...HELP, ...MEADOW, 'pasture', 'barn', 'press'], build: ['stand_cheese', 'carrier3'], priceScale: .4, goals: [{ orders: 3, with: 'cheese' }] },
  { name: 'Pumpkin Season',  time: 555, coins: 100, start: [...HOME, ...HELP, ...MEADOW, 'pasture', 'barn', 'press', 'stand_cheese', 'hillside'], build: ['pumpkin', 'stand_pumpkin', 'hand_pumpkin', 'carrier3'], priceScale: .5, goals: [{ sell: 'pumpkin', n: 12 }, { crows: 4 }] },
  { name: 'Woolly Business', time: 275, coins: 150, start: [...HOME, ...HELP, ...MEADOW, ...PASTURE.filter(id => !['sheep', 'stand_wool'].includes(id))], build: ['sheep', 'stand_wool'], priceScale: .5, goals: [{ sell: 'wool', n: 8 }, { inspect: { at: [90, 190], min: 4 } }] },
  { name: 'Grand Farm',      time: 795, coins: 100, start: [...HOME, ...HELP, ...MEADOW],       build: [...PASTURE], priceScale: .6,          goals: [{ build: 'sheep' }, { orders: 4 }] },
  { name: 'Tycoon',          time: 525, coins: 0,   start: [...HOME, ...HELP, ...MEADOW, ...PASTURE], build: [],                       goals: [{ earn: 3000 }, { orders: 3 }, { streak: 15 }] },

  { name: 'Mega Expansion: The Whole Farm', mega: true, time: 300, coins: 100, start: [], build: [...HOME, ...HELP, ...MEADOW, ...PASTURE], priceScale: .3, goals: [{ builds: 16 }] },
];
export const STAR_TIME_LEFT = [.3, .1]; // finish with 30%+ of the time left = 3 stars, 10%+ = 2, otherwise 1
// Time limits are about 1.7x the pacing bot's slowest of three wins (npm run farm:pace). Inspection
// levels can't end before their last inspection, so their clocks are last inspection / 0.7 (3 stars at the bell).

// ---- Free Farm: the endless mode builds everything, saves as you go, and pays offline earnings ----
export const FREE = { name: 'Free Farm', coins: 0, start: [], build: UNLOCKS.map(u => u.id), goals: [], tutorial: true };

// ---- meta progression for levels: seeds earned by winning, spent on permanent upgrades ----
// reward: firstWin on a level's first win, perStar for each new star (over your best), replay for any win.
// upgrades apply at the start of every level; levels[i] is the value at upgrade level i.
export const META = {
  icon: '🌻', name: 'Seeds',
  reward: { firstWin: 4, perStar: 3, replay: 1, megaMult: 2 },
  upgrades: {
    headStart: { label: 'Head start',     icon: '🪙', levels: [0, 25, 50, 90, 150], cost: [4, 10, 22, 40], unit: 'coins to start' },
    time:      { label: 'Extra time',     icon: '⏱', levels: [0, 10, 20, 30],      cost: [5, 14, 30],     unit: 's per level' },
    speed:     { label: 'Running shoes',  icon: '👟', levels: [0, 1, 2],            cost: [8, 24],         unit: 'run speed levels' },
    carry:     { label: 'Bigger basket',  icon: '🧺', levels: [0, 1, 2],            cost: [6, 20],         unit: 'basket levels' },
    harvest:   { label: 'Quick hands',    icon: '✂️', levels: [0, 1, 2],            cost: [6, 20],         unit: 'harvest levels' },
    prices:    { label: 'Better prices',  icon: '💰', levels: [1, 1.1, 1.2, 1.3],   cost: [8, 22, 45],     unit: 'x sale price' },
    patience:  { label: 'Patient VIPs',   icon: '⭐', levels: [0, 15, 30],          cost: [6, 18],         unit: 's more VIP patience' },
    scarecrow: { label: 'Scarecrow',      icon: '🧑‍🌾', levels: [0, .5, 1],          cost: [6, 18],         unit: 'tiles more crow-scaring reach' },
  },
};

// ---- layout variety: each level dresses the same farm differently ----
// season: ground and tree palette; mirror: the fields and pens swap sides above the market
// (the market, path and machines stay put); decor: seed for ponds, rocks, flowers and hay on free ground.
export const SEASONS = {
  spring: { grass: ['#86CF62', '#7EC65A', '#8ED66B'], tuft: '#5FAE45', flowers: ['#FFFFFF', '#FFF3A6'], path: '#E9D29A', leaves: ['#4FAE4A'], decor: ['flowers', 'rocks', 'pond', 'bush'] },
  summer: { grass: ['#7CC85A', '#73BF51', '#86D163'], tuft: '#54A33C', flowers: ['#FF8FB1', '#FFD24A'], path: '#EDD497', leaves: ['#3E9E3F', '#48A846'], decor: ['flowers', 'pond', 'hay', 'bush'] },
  autumn: { grass: ['#B7C665', '#ABBA5A', '#C2CF70'], tuft: '#8C9A3E', flowers: ['#FF9A3C', '#E2553A'], path: '#E3C48C', leaves: ['#E58A2E', '#D9542F', '#F0B43A'], decor: ['hay', 'leaves', 'rocks', 'mushrooms'] },
  winter: { grass: ['#E4EDF2', '#D9E4EB', '#EEF4F8'], tuft: '#B3C6D2', flowers: ['#FFFFFF', '#CFE3F0'], path: '#D8D0C2', leaves: ['#3F8A6A'], snow: true, decor: ['snowman', 'rocks', 'ice', 'bush'] },
};
// free ground big enough for a pond (x, y = centre)
export const DECOR_SPOTS = [
  { x: 14.5, y: 1.8 }, { x: 23.5, y: 1.8 }, { x: 14.4, y: 10.2, small: true }, { x: 23.6, y: 10.2, small: true },  // Home Field
  { x: 2.5, y: 2.2 }, { x: 8.5, y: 2.2 }, { x: 2.5, y: 17.6 }, { x: 7, y: 17.8 }, { x: 10.6, y: 18.4, small: true }, // Meadow
  { x: 35.5, y: 2.2 }, { x: 29.5, y: 2.2 }, { x: 35.5, y: 17.6 }, { x: 31, y: 17.8 }, { x: 27.4, y: 18.4, small: true }, { x: 36, y: 9, small: true }, // Pasture
  { x: 14.5, y: 32.6 }, { x: 23.5, y: 32.6 }, { x: 14.4, y: 25.4, small: true }, { x: 23.6, y: 25.4, small: true }, // Hillside
];
const SEASON_ORDER = ['spring', 'summer', 'autumn', 'winter'];
// levels 1-4 spring, 5-8 summer, 9-12 autumn, 13-15 winter; every other level mirrored (level 1 stays the classic farm)
LEVELS.forEach((L, i) => { L.layout ??= { season: SEASON_ORDER[Math.min(3, Math.floor(i / 4))], mirror: i % 2 === 1, decor: i + 1 }; });
// Free Farm follows the calendar
FREE.layout = { season: SEASON_ORDER[Math.floor(((new Date().getMonth() + 10) % 12) / 3)], mirror: false, decor: 99 };

const inMarket = p => { const m = CONFIG.world.market; return p.x >= m.x && p.x <= m.x + m.w && p.y >= m.y && p.y <= m.y + m.h; };
export function layoutFor(L) {
  const lay = L.layout || { season: 'spring', mirror: false, decor: 0 };
  const W = CONFIG.world.cols, mx = lay.mirror ? x => W - x : x => x;
  // the market (stalls, register, road) never moves; everything around it swaps sides
  const pt = (p, force) => (p && (force || !inMarket(p)) ? { ...p, x: +mx(p.x).toFixed(2) } : p);
  const rect = r => (lay.mirror ? { ...r, x: W - r.x - r.w } : { ...r });
  const zoneIds = new Set(CONFIG.zones.map(z => z.id));
  const C = {
    ...CONFIG,
    fields: CONFIG.fields.map(rect),
    pens: CONFIG.pens.map(p => ({ ...rect(p), pile: pt(p.pile) })),
    machines: CONFIG.machines.map(m => ({ ...m, x: mx(m.x), dir: (m.dir || 1) * (lay.mirror ? -1 : 1) })),
    helpers: CONFIG.helpers.map(h => ({ ...h, crate: pt(h.crate) })),
    zones: CONFIG.zones.map(rect),
  };
  const spots = DECOR_SPOTS.map(p => pt(p));
  return { C, unlocks: UNLOCKS.map(u => ({ ...u, at: pt(u.at, zoneIds.has(u.id)) })), theme: SEASONS[lay.season] || SEASONS.spring, season: lay.season, decor: lay.decor, spots };
}
