// Sunny Acres: every balance number and the whole layout live here.
// Positions are in tiles (x across 0..14, y down 0..47). Times are seconds.
// Rebalance by editing this file only; `npm test` prints the pacing table.

export const CONFIG = {
  world: { cols: 14, rows: 47, start: { x: 7, y: 38.5 } },

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
    helperSpeed: { label: 'Helper speed', icon: '🏃', levels: [2.6, 3.1, 3.6, 4.2], cost: [150, 450, 1200], needs: 'hand_carrot' },
    helperCarry: { label: 'Helper basket', icon: '🧺', levels: [4, 6, 9, 12],      cost: [180, 520, 1400], needs: 'hand_carrot' },
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
    { id: 'carrotA', crop: 'carrot',  x: 1,  y: 31, w: 3, h: 2, grow: 4,  start: true },
    { id: 'carrotB', crop: 'carrot',  x: 1,  y: 28, w: 3, h: 2, grow: 4 },
    { id: 'cornA',   crop: 'corn',    x: 10, y: 31, w: 3, h: 2, grow: 6 },
    { id: 'cornB',   crop: 'corn',    x: 10, y: 28, w: 3, h: 2, grow: 6 },
    { id: 'wheat',   crop: 'wheat',   x: 1,  y: 18, w: 3, h: 3, grow: 5 },
    { id: 'pumpkin', crop: 'pumpkin', x: 1,  y: 7,  w: 3, h: 3, grow: 9 },
  ],

  // ---- animal pens: each animal lays/produces one item every `interval` into the pile ----
  pens: [
    { id: 'coop',  animal: 'chicken', product: 'egg',  x: 10, y: 17, w: 3, h: 3, animals: 3, interval: 4.5, pile: { x: 9.3, y: 19.6 } },
    { id: 'barn',  animal: 'cow',     product: 'milk', x: 10, y: 6,  w: 3, h: 3, animals: 2, interval: 6,   pile: { x: 9.3, y: 8.6 } },
    { id: 'sheep', animal: 'sheep',   product: 'wool', x: 1,  y: 2,  w: 3, h: 3, animals: 3, interval: 8,   pile: { x: 4.7, y: 3.6 } },
  ],
  pileCap: 16,

  // ---- machines: one input item -> one output item every `time` (divided by machine speed) ----
  machines: [
    { id: 'mill',   name: 'Mill',         in: 'wheat', out: 'flour',  x: 7, y: 20.2, time: 1.6 },
    { id: 'bakery', name: 'Bakery',       in: 'flour', out: 'bread',  x: 7, y: 16.2, time: 2.2 },
    { id: 'press',  name: 'Cheese press', in: 'milk',  out: 'cheese', x: 7, y: 8.2,  time: 2.5 },
  ],
  machineCap: 20, // input and output each

  // ---- market stands along the plaza; customers buy from these ----
  stands: [
    { id: 'stand_carrot',  product: 'carrot',  x: 1.2,  start: true },
    { id: 'stand_corn',    product: 'corn',    x: 3.13 },
    { id: 'stand_egg',     product: 'egg',     x: 5.06 },
    { id: 'stand_bread',   product: 'bread',   x: 6.99 },
    { id: 'stand_pumpkin', product: 'pumpkin', x: 8.92 },
    { id: 'stand_cheese',  product: 'cheese',  x: 10.85 },
    { id: 'stand_wool',    product: 'wool',    x: 12.78 },
  ],
  standY: 35.6, standCap: 24,

  register: { mat: { x: 9.7, y: 40.1 }, counter: { x: 8.6, y: 40.1 }, playerTime: .45, cashierTime: .9,
    queue: [[7.4, 40.1], [6.4, 40.4], [5.4, 40.8], [4.4, 41.2], [3.4, 41.6], [2.4, 42]] },
  upgradeMat: { x: 12.3, y: 42.4 },

  customers: {
    spawn: { x: 7, y: 47.5 }, gate: { x: 7, y: 43.2 },
    every: 2.4, everyPerStand: -.2, everyMin: 1.2,   // seconds between arrivals
    maxBase: 3, maxPerStand: 1,                     // how many can be around at once
    buyMin: 1, buyMax: 4, takeInterval: .22, patience: 14, speed: 2.4,
  },

  // ---- zones: fences you open with a gate unlock ----
  zones: [
    { id: 'home',    name: 'Home Field', top: 24.2, start: true },
    { id: 'meadow',  name: 'Meadow',     top: 13.2, fenceY: 24 },
    { id: 'pasture', name: 'Pasture',    top: 1,    fenceY: 13 },
  ],

  // ---- helpers; each is unlocked by an entry in UNLOCKS with the same id ----
  helpers: [
    { id: 'hand_carrot', kind: 'farmhand', fields: ['carrotA', 'carrotB'], crate: { x: 4.7, y: 31.2 } },
    { id: 'hand_corn',   kind: 'farmhand', fields: ['cornA', 'cornB'],     crate: { x: 9.3, y: 31.2 } },
    { id: 'hand_wheat',  kind: 'farmhand', fields: ['wheat'],              crate: { x: 4.7, y: 19.6 } },
    { id: 'hand_pumpkin', kind: 'farmhand', fields: ['pumpkin'],           crate: { x: 4.7, y: 8.6 } },
    { id: 'cashier',  kind: 'cashier' },
    { id: 'carrier1', kind: 'carrier', home: { x: 6, y: 38.6 } },
    { id: 'carrier2', kind: 'carrier', home: { x: 8, y: 38.6 } },
    { id: 'carrier3', kind: 'carrier', home: { x: 7, y: 37.8 } },
  ],
  crateCap: 40,
  harvestTimeHelper: .5,

  // ---- offline earnings: only fully automated chains earn while you're away ----
  // coins = automated coins/sec (what helpers could sell) x seconds away x efficiency, up to maxHours.
  // 0.1 makes an hour away worth roughly 10 minutes of active play.
  offline: { efficiency: .1, maxHours: 4, minSeconds: 60 },
};

// The unlock tiles, in the order they appear. Three are on the ground at a time,
// so there's always a next thing nearly in reach. `at` = where the price tile sits.
// `after`: the tile only appears once that id is built (no stand before its crop).
export const UNLOCKS = [
  { id: 'carrotB',      price: 10,   label: 'Carrot patch',    icon: '🥕', at: { x: 2.5, y: 29 } },
  { id: 'cornA',        price: 22,   label: 'Corn field',      icon: '🌽', at: { x: 11.5, y: 32 } },
  { id: 'stand_corn',   price: 18,   label: 'Corn stand',      icon: '🌽', at: { x: 3.13, y: 36 }, after: 'cornA' },
  { id: 'hand_carrot',  price: 45,   label: 'Carrot farmhand', icon: '🧑‍🌾', at: { x: 5.4, y: 29.8 } },
  { id: 'cornB',        price: 60,   label: 'More corn',       icon: '🌽', at: { x: 11.5, y: 29 } },
  { id: 'cashier',      price: 80,   label: 'Cashier',         icon: '🧑‍💼', at: { x: 10.8, y: 41.2 } },
  { id: 'hand_corn',    price: 95,   label: 'Corn farmhand',   icon: '🧑‍🌾', at: { x: 8.6, y: 29.8 } },
  { id: 'carrier1',     price: 120,  label: 'Carrier',         icon: '🛒', at: { x: 5.2, y: 38.6 } },
  { id: 'meadow',       price: 200,  label: 'Open the Meadow', icon: '🚪', at: { x: 7, y: 25.1 } },
  { id: 'coop',         price: 150,  label: 'Chicken coop',    icon: '🐔', at: { x: 11.5, y: 18.5 } },
  { id: 'stand_egg',    price: 120,  label: 'Egg stand',       icon: '🥚', at: { x: 5.06, y: 36 }, after: 'coop' },
  { id: 'wheat',        price: 180,  label: 'Wheat field',     icon: '🌾', at: { x: 2.5, y: 19.5 } },
  { id: 'mill',         price: 240,  label: 'Mill',            icon: '⚙️', at: { x: 7, y: 20.4 }, after: 'wheat' },
  { id: 'bakery',       price: 340,  label: 'Bakery',          icon: '🍞', at: { x: 7, y: 16.4 }, after: 'mill' },
  { id: 'stand_bread',  price: 300,  label: 'Bread stand',     icon: '🍞', at: { x: 6.99, y: 36 }, after: 'bakery' },
  { id: 'carrier2',     price: 380,  label: '2nd carrier',     icon: '🛒', at: { x: 8.8, y: 38.6 } },
  { id: 'hand_wheat',   price: 450,  label: 'Wheat farmhand',  icon: '🧑‍🌾', at: { x: 4.4, y: 22.7 }, after: 'wheat' },
  { id: 'pasture',      price: 650,  label: 'Open the Pasture', icon: '🚪', at: { x: 7, y: 14.1 } },
  { id: 'barn',         price: 600,  label: 'Cow barn',        icon: '🐄', at: { x: 11.5, y: 7.5 } },
  { id: 'press',        price: 800,  label: 'Cheese press',    icon: '🧀', at: { x: 7, y: 8.4 }, after: 'barn' },
  { id: 'stand_cheese', price: 700,  label: 'Cheese stand',    icon: '🧀', at: { x: 10.85, y: 36 }, after: 'press' },
  { id: 'pumpkin',      price: 900,  label: 'Pumpkin patch',   icon: '🎃', at: { x: 2.5, y: 8.5 } },
  { id: 'stand_pumpkin', price: 800, label: 'Pumpkin stand',   icon: '🎃', at: { x: 8.92, y: 36 }, after: 'pumpkin' },
  { id: 'carrier3',     price: 1000, label: '3rd carrier',     icon: '🛒', at: { x: 7, y: 37.6 } },
  { id: 'sheep',        price: 1200, label: 'Sheep pen',       icon: '🐑', at: { x: 2.5, y: 3.5 } },
  { id: 'stand_wool',   price: 1000, label: 'Wool stand',      icon: '🧶', at: { x: 12.78, y: 36 }, after: 'sheep' },
  { id: 'hand_pumpkin', price: 1200, label: 'Pumpkin farmhand', icon: '🧑‍🌾', at: { x: 4.4, y: 11.2 }, after: 'pumpkin' },
];
export const SHOWN_UNLOCKS = 3;
export const LOOKAHEAD = 2;        // how far past those 3 the game may look for a tile that's showable
export const UNLOCK_SECONDS = 1;   // standing on a tile drains its whole price in about this long

// First-run hints, before the unlock goals take over.
export const TUTORIAL = [
  { id: 'harvest', text: 'Walk over the carrots to pick them' },
  { id: 'stock',   text: 'Drop them at the carrot stand' },
  { id: 'sell',    text: 'Stand at the register to sell' },
];
