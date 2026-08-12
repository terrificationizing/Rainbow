import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { createCandy, createWindow, createButton, vehicleScale, paintSky, createEscButton, scatterGlitter, rainbowGradient } from '../ui.js';
import { music } from '../audio.js';
import { SKITTLE_COLORS } from '../config.js';

const LANE_OFFSETS = [-100, 0, 100];
const TOP_Y = 90;
const PLAYER_Y = GAME_HEIGHT - 210;
const DIST_TRAVEL = 950; // world-distance an obstacle travels before reaching the player
const SEG_LENGTH = 300;
const BEACH_CHANCE = 0.32;
const HEAD_CHECK_INTERVAL = 500;
const HEAD_CHANCE = 0.05;
const HEAD_SIDE_OFFSET = 260;
const DOLPHIN_CHANCE = 0.1;

// obs_tree is handled separately in spawnObstacle() -- it only ever spawns on
// the sand islands, not out of this general pool. Weights are percentages.
const OBSTACLE_TYPES = [
  { key: 'obs_cd', weight: 39.75 },
  { key: 'obs_cursor', weight: 39.75 },
  { key: 'obs_crying', weight: 10 },
  { key: 'obs_computer', weight: 10 },
  { key: 'obs_logguy', weight: 0.5 },
];

// flavor text flashed when each obstacle type is hit
const OBSTACLE_HIT_MESSAGE = {
  obs_crying: 'OH NO SO SAD',
  obs_computer: 'COMPUTER BAD :(',
  obs_cursor: 'WEB VIRUS',
  obs_tree: 'WATCH OUT FOR TREES',
};

function pickWeighted(types) {
  const total = types.reduce((sum, t) => sum + t.weight, 0);
  let r = Math.random() * total;
  for (const t of types) {
    if (r < t.weight) return t;
    r -= t.weight;
  }
  return types[types.length - 1];
}

const VEH_TEX = {
  surfboard: 'veh_surfboard',
  hoverboard: 'veh_hoverboard',
  rollerblade: 'veh_rollerblade',
  floppy: 'veh_floppy',
};

function hashRand(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

// multiplies an 0xRRGGBB color's channels by `mult`, for quick brightness shading
function shadeColor(color, mult) {
  const r = Phaser.Math.Clamp(Math.round(((color >> 16) & 0xff) * mult), 0, 255);
  const g = Phaser.Math.Clamp(Math.round(((color >> 8) & 0xff) * mult), 0, 255);
  const b = Phaser.Math.Clamp(Math.round((color & 0xff) * mult), 0, 255);
  return (r << 16) | (g << 8) | b;
}

// segments before this never roll a beach, so the player always gets a
// clear first stretch (roughly 5 seconds) before the first sand appears
const MIN_BEACH_SEG = 5;

// -1 = beach hugs the left edge, 1 = right edge, 0 = no beach this segment.
function beachSideForSegment(seg) {
  if (seg < MIN_BEACH_SEG) return 0;
  const r = hashRand(seg);
  if (r < BEACH_CHANCE / 2) return -1;
  if (r < BEACH_CHANCE) return 1;
  return 0;
}

const BOOST_CHANCE = 0.24;
const MIN_BOOST_SEG = 8;

// -1 = boost pad covers the left half of the road this segment, 1 = right
// half, 0 = none. Never rolls on a beach segment, so the two don't overlap.
function boostSideForSegment(seg) {
  if (seg < MIN_BOOST_SEG) return 0;
  if (beachSideForSegment(seg) !== 0) return 0;
  const r = hashRand(seg * 7.31 + 91.7);
  if (r < BOOST_CHANCE / 2) return -1;
  if (r < BOOST_CHANCE) return 1;
  return 0;
}

// Wavy, irregular sand-island boundary depth (as a fraction of road width) for this
// stretch of track, so the long edge between sand and rainbow isn't a straight line.
const SAND_TAPER = 90;

// Fades depth to 0 over SAND_TAPER world-units at either end of a beach run,
// so the leading/trailing ends of a sand island curve to a point too, instead
// of cutting off in a straight line the instant the segment index changes.
function sandDepthAt(worldPos, seg, side) {
  const base = 0.4
    + Math.sin(worldPos * 0.012) * 0.12
    + Math.sin(worldPos * 0.031 + 1.7) * 0.07;
  const localPos = worldPos - seg * SEG_LENGTH;
  let taper = 1;
  if (localPos < SAND_TAPER && beachSideForSegment(seg - 1) !== side) {
    const t = Phaser.Math.Clamp(localPos / SAND_TAPER, 0, 1);
    taper = Math.min(taper, t * t * (3 - 2 * t));
  }
  if (localPos > SEG_LENGTH - SAND_TAPER && beachSideForSegment(seg + 1) !== side) {
    const t = Phaser.Math.Clamp((SEG_LENGTH - localPos) / SAND_TAPER, 0, 1);
    taper = Math.min(taper, t * t * (3 - 2 * t));
  }
  return base * taper;
}

export default class GameScene extends Phaser.Scene {
  constructor() {
    super('Game');
  }

  create() {
    this.colorKey = this.registry.get('color') || 'red';
    this.vehicleKey = this.registry.get('vehicle') || 'hoverboard';

    // the intro's road math and this scene's road math aren't the same
    // formula, so the width/position always re-settles the instant this
    // scene takes over -- fading in from white hides that snap as a soft
    // crossfade instead of a hard cut
    this.cameras.main.fadeIn(280, 255, 255, 255);

    paintSky(this);
    createEscButton(this);
    music.startTrackAmbience();
    this.events.on('shutdown', () => music.stopTrackAmbience());
    this.skyClouds = [];
    for (let i = 0; i < 3; i++) {
      this.skyClouds.push(this.add.image(
        Phaser.Math.Between(20, GAME_WIDTH - 20),
        Phaser.Math.Between(20, 130),
        'cloud'
      ).setAlpha(0.8));
    }
    scatterGlitter(this, 50, { yMin: 0, yMax: TOP_Y + 550, depth: 1 });
    this.buildBackgroundDecor();

    this.roadGfx = this.add.graphics();
    this.railGfx = this.add.graphics();

    this.scrollDistance = 0;
    this.speed = 190;
    this.speedMultiplier = 1;
    this.sugarRushUntil = 0;
    this.boostUntil = 0;
    this.nextBoostSparkleAt = 0;
    this.nextBoostStreakAt = 0;
    this.currentLane = 1;
    this.targetLane = 1;
    this.laneX = this.roadCenterX(0) + LANE_OFFSETS[1];
    this.invincibleUntil = 0;
    this.meter = 100;
    this.score = 0;
    this.gameOver = false;
    this.lastWipeoutSeg = null;
    this.sandDwellStart = null;
    this.lastObstacleKey = null;
    this.lastTreeSeg = null;
    this.lastDamageSource = null;
    this.flippingUntil = 0;
    this.nextObstacleAt = 400;
    this.nextDolphinAt = 500;
    this.nextHeadCheckAt = 1400;
    this.headSide = Math.random() < 0.5 ? -1 : 1;
    this.activePopup = null;
    this.elapsed = 0;
    this.lastActionAt = 0;
    // measured against this.elapsed (seconds into this run), not the global
    // clock -- see the note in update()
    this.nextPopupAt = 10;

    this.obstacles = [];
    this.dolphins = [];
    this.dolphinFaceToggle = false;
    this.heads = [];

    // only the hoverboard actually floats, so it's the only vehicle that
    // gets a ground shadow -- visible=false rather than alpha so it stays
    // hidden even through the dolphin-ride hop-off/hop-back alpha tweens
    this.vehicleShadow = this.add.ellipse(GAME_WIDTH / 2, PLAYER_Y + 46, 90, 20, 0x000000, 0.4)
      .setDepth(9).setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setVisible(this.vehicleKey === 'hoverboard');
    // the hoverboard's deck is very wide relative to its height, so sizing it by
    // height alone (like the other vehicles) blows it up far too wide on the track
    const vehTexKey = VEH_TEX[this.vehicleKey];
    const vehScale = (this.vehicleKey === 'hoverboard' || this.vehicleKey === 'surfboard')
      ? 112 / this.textures.get(vehTexKey).getSourceImage().width
      : vehicleScale(this, vehTexKey, 84);
    this.vehicleSprite = this.add.image(GAME_WIDTH / 2, PLAYER_Y + 30, vehTexKey)
      .setScale(vehScale).setDepth(10);
    // the rollerblade's boot comes up fairly high, so the candy sits low
    // enough by default to hide most of it -- lift it clear on that vehicle
    const candyY = this.vehicleKey === 'rollerblade' ? PLAYER_Y - 30 : PLAYER_Y;
    this.candyXOffset = this.vehicleKey === 'rollerblade' ? -16 : 0;
    this.playerCandy = createCandy(this, GAME_WIDTH / 2 + this.candyXOffset, candyY, this.colorKey, 1.05);
    this.playerCandy.setDepth(11);

    this.buildHud();
    this.buildControls();
  }

  // The life bar is a row of skittles, one per flavor color -- each starts
  // grey and fills in with its real color as the meter fills that fifth of
  // the bar, so the bar reads as "healthy" exactly when fully colored.
  buildHud() {
    const pipD = 30, gap = 7;
    const n = SKITTLE_COLORS.length;
    const totalW = n * pipD + (n - 1) * gap;
    const startX = GAME_WIDTH / 2 - totalW / 2 + pipD / 2;
    // extra margin from the very top edge -- mobile browser chrome is the
    // first thing to eat into that space
    const y = 54;
    const pipScale = pipD / 64;

    this.meterPips = SKITTLE_COLORS.map((c, i) => {
      const x = startX + i * (pipD + gap);
      const bg = this.add.image(x, y, `candy_${c.key}`).setScale(pipScale).setTint(0x9096a0).setDepth(30);
      // thin ring, hidden until this specific pip fully empties -- then it's
      // the only thing left, reading as "gone clear" for that one skittle
      const outline = this.add.graphics().setDepth(29.5).setAlpha(0);
      outline.lineStyle(2.5, 0xffffff, 0.9);
      outline.strokeCircle(x, y, pipD / 2 + 1);
      const fg = this.add.image(x, y, `candy_${c.key}`).setScale(pipScale).setAlpha(0).setDepth(31);
      const mark = this.add.text(x, y + 1, 'S', {
        fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${Math.round(pipD * 0.42)}px`, fontStyle: 'bold', color: '#ffffff',
      }).setOrigin(0.5).setStroke('#00000055', 2).setDepth(32);
      return { bg, fg, mark, outline };
    });

    this.scoreText = this.add.text(16, 36, 'SCORE 0', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '15px', fontStyle: 'bold', color: '#ffffff',
    }).setStroke('#00000088', 3).setDepth(30);

    this.drawMeter();
  }

  // each skittle depletes in sequence, not the whole bar fading together:
  // full color -> grey (in-progress) -> a bare outline once that one skittle
  // is completely emptied
  drawMeter() {
    const pct = Phaser.Math.Clamp(this.meter, 0, 100);
    const per = 100 / this.meterPips.length;
    this.meterPips.forEach((pip, i) => {
      const frac = Phaser.Math.Clamp((pct - i * per) / per, 0, 1);
      const depleted = pct <= i * per;
      pip.fg.setAlpha(frac);
      pip.bg.setAlpha(depleted ? 0.1 : 1);
      pip.outline.setAlpha(depleted ? 1 : 0);
      pip.mark.setAlpha(depleted ? 0.55 : 1);
    });
  }

  buildControls() {
    this.leftZone = this.add.zone(0, 0, GAME_WIDTH / 2, GAME_HEIGHT).setOrigin(0).setInteractive();
    this.rightZone = this.add.zone(GAME_WIDTH / 2, 0, GAME_WIDTH / 2, GAME_HEIGHT).setOrigin(0).setInteractive();
    this.leftZone.on('pointerdown', () => this.changeLane(-1));
    this.rightZone.on('pointerdown', () => this.changeLane(1));

    this.cursors = this.input.keyboard?.createCursorKeys();

    // double-chevron hints at the bottom of each half, so it's clear the
    // whole left/right side of the screen is tappable to steer -- gently
    // pulsing so they read as a persistent control hint, not a one-off toast
    this.buildTapHints();
  }

  buildTapHints() {
    // back on Scale.FIT the whole game frame is always fully visible (never
    // cropped by mobile browser chrome), so these can sit close to the
    // bottom edge again
    const y = GAME_HEIGHT - 60;
    const buildArrow = (cx, dir) => {
      const g = this.add.graphics().setDepth(45).setAlpha(0.55);
      g.fillStyle(0xffffff, 1);
      g.lineStyle(2, 0x2a0f4a, 0.6);
      const tri = dir < 0
        ? [cx + 13, y - 16, cx - 13, y, cx + 13, y + 16]
        : [cx - 13, y - 16, cx + 13, y, cx - 13, y + 16];
      g.fillTriangle(...tri);
      g.strokeTriangle(...tri);
      this.tweens.add({
        targets: g, alpha: 0.15, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return g;
    };
    buildArrow(GAME_WIDTH / 4, -1);
    buildArrow((GAME_WIDTH / 4) * 3, 1);

    const label = this.add.text(GAME_WIDTH / 2, y, 'TAP TO MOVE', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '13px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setStroke('#2a0f4a', 3).setDepth(45).setAlpha(0.55);
    this.tweens.add({
      targets: label, alpha: 0.15, duration: 700, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
    });
  }

  // purely cosmetic background: skittle-colored "planets" and stars drifting
  // slowly down the sky, like they're floating toward the player -- not
  // obstacles, no collision, just atmosphere behind the road
  buildBackgroundDecor() {
    this.bgDecor = [];
    const edgeX = () => (Math.random() < 0.5
      ? Phaser.Math.Between(20, 90)
      : Phaser.Math.Between(GAME_WIDTH - 90, GAME_WIDTH - 20));

    const placed = [];
    let lastColorKey = null;
    for (let i = 0; i < 3; i++) {
      const scale = Phaser.Math.FloatBetween(0.65, 1.0);
      const alpha = Phaser.Math.FloatBetween(0.55, 0.8);
      const minDist = 90 * scale + 60;

      // kept high in the sky and off to the sides -- distant background
      // atmosphere, not meant to drift down over the track itself
      let x, y, tries = 0;
      do {
        x = edgeX();
        y = Phaser.Math.Between(-350, 260);
        tries++;
      } while (tries < 20 && placed.some((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) < Math.max(minDist, p.minDist)));
      placed.push({ x, y, minDist });

      // never the same flavor as the planet placed right before it
      let c;
      do { c = Phaser.Utils.Array.GetRandom(SKITTLE_COLORS); } while (c.key === lastColorKey);
      lastColorKey = c.key;

      const ring = this.add.graphics();
      ring.lineStyle(3, 0xffffff, 0.85);
      ring.strokeEllipse(0, 0, 100 * scale, 34 * scale);

      const planet = this.add.image(0, 0, `candy_${c.key}`).setScale(scale);
      const container = this.add.container(x, y, [ring, planet])
        .setDepth(1).setAlpha(alpha).setAngle(Phaser.Math.Between(0, 360));
      // slow drift and a shallow wrap band -- reads as distant, not falling
      // down through the middle of the track
      this.bgDecor.push({ img: container, speed: Phaser.Math.FloatBetween(3, 8), wrapY: 260, edgeX: true });
    }
    // kept to the outer edges (never over the track itself, which curves
    // through the middle) -- only the tiny scatterGlitter twinkles are
    // allowed to sit on top of the road
    for (let i = 0; i < 12; i++) {
      const img = this.add.image(
        edgeX(),
        Phaser.Math.Between(-400, TOP_Y + 500),
        'sparkle'
      ).setDepth(1).setAlpha(Phaser.Math.FloatBetween(0.4, 0.75)).setScale(Phaser.Math.FloatBetween(0.8, 1.8));
      this.bgDecor.push({ img, speed: Phaser.Math.FloatBetween(10, 22), wrapY: GAME_HEIGHT + 40, edgeX: true });
    }
  }

  updateBackgroundDecor(dt) {
    this.bgDecor.forEach((d) => {
      d.img.y += d.speed * dt;
      d.img.rotation += dt * 0.15;
      const wrapY = d.wrapY ?? (GAME_HEIGHT + 40);
      if (d.img.y > wrapY) {
        d.img.y = -400;
        d.img.x = d.edgeX
          ? (Math.random() < 0.5 ? Phaser.Math.Between(20, 90) : Phaser.Math.Between(GAME_WIDTH - 90, GAME_WIDTH - 20))
          : Phaser.Math.Between(20, GAME_WIDTH - 20);
      }
    });
  }

  changeLane(dir) {
    if (this.gameOver) return;
    this.targetLane = Phaser.Math.Clamp(this.targetLane + dir, 0, LANE_OFFSETS.length - 1);
    this.lastActionAt = this.elapsed;
  }

  roadCenterX(worldPos) {
    const base = GAME_WIDTH / 2
      + Math.sin(worldPos * 0.0022) * 75
      + Math.sin(worldPos * 0.0009 + 1.3) * 42
      + Math.sin(worldPos * 0.0045 + 0.6) * 18;
    // an occasional sharp turn: a slow envelope that's zero almost all the
    // time, briefly spiking to enable a tighter, higher-frequency bend --
    // layered on top of the gentle wobble rather than replacing it
    const sharpEnvelope = Math.max(0, Math.sin(worldPos * 0.00035) - 0.72) / 0.28;
    const sharpTurn = Math.sin(worldPos * 0.007) * 95 * sharpEnvelope;
    return base + sharpTurn;
  }

  update(time, delta) {
    if (this.gameOver) return;
    const dt = delta / 1000;
    // scene-local elapsed time -- `time` itself is the game's global clock
    // (since Phaser booted), not time-since-this-scene-started, and even
    // this.time.now isn't reliably synced yet at the moment create() runs,
    // so anything that needs "N seconds into this run" has to track its own
    this.elapsed = (this.elapsed || 0) + dt;

    if (this.cursors?.left.isDown && !this._leftHeld) { this.changeLane(-1); this._leftHeld = true; }
    if (!this.cursors?.left.isDown) this._leftHeld = false;
    if (this.cursors?.right.isDown && !this._rightHeld) { this.changeLane(1); this._rightHeld = true; }
    if (!this.cursors?.right.isDown) this._rightHeld = false;

    const boosted = time < this.boostUntil;
    const rushActive = time < this.sugarRushUntil || boosted;
    if (rushActive !== this._rushWasActive) {
      music.setIntensity(rushActive);
      this._rushWasActive = rushActive;
    }
    this.speedMultiplier = rushActive ? 1.7 : 1;
    const effSpeed = this.speed * this.speedMultiplier;
    this.scrollDistance += effSpeed * dt;
    this.speed = Math.min(360, this.speed + dt * 1.6);

    this.currentLane = Phaser.Math.Linear(this.currentLane, this.targetLane, Math.min(1, dt * 8));
    const laneIdxFloor = Math.round(this.currentLane);
    const laneOffset = Phaser.Math.Linear(
      LANE_OFFSETS[Phaser.Math.Clamp(Math.floor(this.currentLane), 0, 2)],
      LANE_OFFSETS[Phaser.Math.Clamp(Math.ceil(this.currentLane), 0, 2)],
      this.currentLane - Math.floor(this.currentLane)
    );
    // the near end of the road is pinned to screen-center now, so the player's
    // base x is fixed too -- only the lane offset moves them left/right
    const px = GAME_WIDTH / 2 + laneOffset;
    // the rollerblade's ankle cuff ("back" of the boot) sits toward the left
    // of its texture, so the candy rides shifted left of the boot's own center
    this.playerCandy.x = px + this.candyXOffset;
    this.vehicleSprite.x = px;
    this.vehicleShadow.x = px;
    if (boosted) {
      // flipping all over the place while boosted, instead of the normal
      // lane-tilt lean
      this.playerCandy.rotation += dt * 14;
      this.vehicleSprite.rotation += dt * 11;
    } else if (time > this.flippingUntil) {
      const tilt = (this.targetLane - this.currentLane) * -18;
      this.playerCandy.rotation = Phaser.Math.DegToRad(tilt);
      this.vehicleSprite.rotation = Phaser.Math.DegToRad(tilt * 0.6);
    }

    this.drawRoad();
    this.checkBeach(laneIdxFloor);
    this.checkBoost(laneIdxFloor, px, boosted);
    this.updateBackgroundDecor(dt);
    this.checkTreeSpawn();
    this.updateObstacles(dt, px);
    this.updateDolphins(dt, px);
    this.updateHeads(dt);
    this.updatePopups(time);
    if (this.gameOver) return;

    this.meter -= dt * 2.2;
    this.score += dt * 12 * this.speedMultiplier;
    this.scoreText.setText('SCORE ' + Math.floor(this.score));
    this.drawMeter();

    if (this.meter <= 0) this.triggerGameOver();
    if (this.elapsed - this.lastActionAt > 30) {
      this.lastDamageSource = 'inactive';
      this.triggerGameOver();
    }

    if (this.scrollDistance > this.nextObstacleAt) this.spawnObstacle();
    if (this.scrollDistance > this.nextDolphinAt) {
      this.nextDolphinAt = this.scrollDistance + Phaser.Math.Between(260, 420);
      if (Math.random() < DOLPHIN_CHANCE) this.spawnDolphin();
    }
    if (this.scrollDistance > this.nextHeadCheckAt) {
      this.nextHeadCheckAt = this.scrollDistance + HEAD_CHECK_INTERVAL;
      if (Math.random() < HEAD_CHANCE) this.spawnHead();
    }
    if (!this.activePopup && this.elapsed > this.nextPopupAt) this.spawnPopup(time);
  }

  drawRoad() {
    this.roadGfx.clear();
    this.railGfx.clear();
    const steps = 44;
    const bandColors = rainbowGradient(24);
    const beachColor = 0xf2d98a;
    let prev = null;

    const leftRuns = [];
    const rightRuns = [];
    let leftRun = [];
    let rightRun = [];

    for (let s = 0; s <= steps; s++) {
      const depth = s / steps;
      const worldPos = this.scrollDistance + (1 - depth) * DIST_TRAVEL;
      // hills cresting and dipping out near the horizon -- strongest at the
      // far end, fading to nothing by the pinned near/player end
      const hillBob = Math.sin(this.scrollDistance * 0.0012) * 40 * (1 - depth);
      const y = Phaser.Math.Linear(TOP_Y, GAME_HEIGHT, depth) + hillBob;
      // the near/bottom end (depth 1, right under the player) is pinned to
      // screen-center; only the far end curves as it recedes into the distance
      const cx = Phaser.Math.Linear(this.roadCenterX(worldPos), GAME_WIDTH / 2, depth);
      // eased falloff so the road stays wide through the middle distance and
      // only tapers to a sharp point right at the far edge -- no visible "end"
      const halfW = Phaser.Math.Linear(12, 176, Math.pow(depth, 0.6));
      const left = cx - halfW;
      const right = cx + halfW;

      const seg = Math.floor(worldPos / SEG_LENGTH);
      const beachSide = beachSideForSegment(seg);
      const sandDepthL = beachSide < 0 ? sandDepthAt(worldPos, seg, beachSide) : 0;
      const sandDepthR = beachSide > 0 ? sandDepthAt(worldPos, seg, beachSide) : 0;
      const sandLeftX = left + (right - left) * sandDepthL;
      const sandRightX = right - (right - left) * sandDepthR;

      // lengthwise rainbow lanes: N parallel color bands running along the road's
      // direction of travel (like real rainbow-road stripes), not rings across it.
      const bounds = [];
      for (let i = 0; i <= bandColors.length; i++) {
        bounds.push(left + (right - left) * (i / bandColors.length));
      }

      if (prev) {
        for (let i = 0; i < bandColors.length; i++) {
          this.roadGfx.fillStyle(bandColors[i], 1);
          this.roadGfx.fillPoints([
            { x: prev.bounds[i], y: prev.y }, { x: bounds[i], y },
            { x: bounds[i + 1], y }, { x: prev.bounds[i + 1], y: prev.y },
          ], true);
        }

        // glossy tube sheen: a bright streak riding along the inner edge, plus a soft
        // rim shadow along the outer edge, so the flat band reads as a rounded pipe
        const hlIn = cx - halfW * 0.55, hlOut = cx - halfW * 0.15;
        const prevHlIn = prev.cx - prev.halfW * 0.55, prevHlOut = prev.cx - prev.halfW * 0.15;
        this.roadGfx.fillStyle(0xffffff, 0.22);
        this.roadGfx.fillPoints([
          { x: prevHlIn, y: prev.y }, { x: hlIn, y }, { x: hlOut, y }, { x: prevHlOut, y: prev.y },
        ], true);

        const shIn = cx + halfW * 0.6, shOut = cx + halfW * 0.98;
        const prevShIn = prev.cx + prev.halfW * 0.6, prevShOut = prev.cx + prev.halfW * 0.98;
        this.roadGfx.fillStyle(0x000000, 0.14);
        this.roadGfx.fillPoints([
          { x: prevShIn, y: prev.y }, { x: shIn, y }, { x: shOut, y }, { x: prevShOut, y: prev.y },
        ], true);

        // boost pad: a glowing half-width overlay that pulses/shimmers, covering
        // whichever half of the road this segment's boost zone is on
        const boostSide = boostSideForSegment(seg);
        if (boostSide !== 0) {
          const half = bandColors.length / 2;
          const i0 = boostSide < 0 ? 0 : half, i1 = boostSide < 0 ? half : bandColors.length;
          const boostPts = [
            { x: prev.bounds[i0], y: prev.y }, { x: bounds[i0], y },
            { x: bounds[i1], y }, { x: prev.bounds[i1], y: prev.y },
          ];
          // shimmering iridescent overlay -- a cyan/pink tint that alternates
          // as it pulses, plus a brighter white core streak riding on top, so
          // it reads as a distinct foil-like sheen instead of a flat wash
          const phase = worldPos * 0.03 + this.scrollDistance * 0.01;
          const pulse = 0.55 + 0.35 * Math.sin(phase);
          const tint = Math.sin(phase * 0.6) > 0 ? 0x9ee8ff : 0xffb3f0;
          this.roadGfx.fillStyle(tint, pulse);
          this.roadGfx.fillPoints(boostPts, true);
          this.roadGfx.fillStyle(0xffffff, Math.max(0, pulse - 0.35));
          this.roadGfx.fillPoints(boostPts, true);
        }

        // sand islands: filled as their own smoothly-curved overlay on top of the
        // bands (boundary follows the continuous sandDepthAt curve, not quantized
        // to band edges), with a soft dune-shading ripple and scattered grain flecks
        if (sandDepthL > 0.002 || prev.sandDepthL > 0.002) {
          const duneShade = 0.86 + 0.16 * Math.sin(worldPos * 0.018);
          this.roadGfx.fillStyle(shadeColor(beachColor, duneShade), 1);
          this.roadGfx.fillPoints([
            { x: prev.left, y: prev.y }, { x: left, y },
            { x: sandLeftX, y }, { x: prev.sandLeftX, y: prev.y },
          ], true);
          if (s % 2 === 0) {
            for (let k = 0; k < 2; k++) {
              const gx = Phaser.Math.Linear(left, sandLeftX, Math.random());
              this.roadGfx.fillStyle(0xc9a968, 0.45);
              this.roadGfx.fillCircle(gx, y - Math.random() * (y - prev.y), Phaser.Math.Linear(0.8, 2.2, depth));
            }
          }
        }
        if (sandDepthR > 0.002 || prev.sandDepthR > 0.002) {
          const duneShade = 0.86 + 0.16 * Math.sin(worldPos * 0.018 + 2.1);
          this.roadGfx.fillStyle(shadeColor(beachColor, duneShade), 1);
          this.roadGfx.fillPoints([
            { x: sandRightX, y }, { x: prev.sandRightX, y: prev.y },
            { x: prev.right, y: prev.y }, { x: right, y },
          ], true);
          if (s % 2 === 1) {
            for (let k = 0; k < 2; k++) {
              const gx = Phaser.Math.Linear(sandRightX, right, Math.random());
              this.roadGfx.fillStyle(0xc9a968, 0.45);
              this.roadGfx.fillCircle(gx, y - Math.random() * (y - prev.y), Phaser.Math.Linear(0.8, 2.2, depth));
            }
          }
        }

        if (s % 4 === 0) {
          const sparkle = 0.4 + 0.6 * Math.max(0, Math.sin(worldPos * 0.06));
          this.roadGfx.fillStyle(0xffffff, sparkle * 0.5);
          this.roadGfx.fillCircle(hlIn + (hlOut - hlIn) / 2, y, Phaser.Math.Linear(1, 4, depth));
        }
      }

      // rails only vanish on the beach's own edge -- the far side keeps its rail
      const leftIsSand = sandDepthL > (0.5 / bandColors.length);
      const rightIsSand = sandDepthR > (0.5 / bandColors.length);

      if (!leftIsSand) {
        leftRun.push({ x: left, y });
      } else if (leftRun.length > 1) {
        leftRuns.push(leftRun); leftRun = [];
      } else leftRun = [];

      if (!rightIsSand) {
        rightRun.push({ x: right, y });
      } else if (rightRun.length > 1) {
        rightRuns.push(rightRun); rightRun = [];
      } else rightRun = [];

      prev = { y, cx, halfW, bounds, left, right, sandLeftX, sandRightX, sandDepthL, sandDepthR };
    }
    if (leftRun.length > 1) leftRuns.push(leftRun);
    if (rightRun.length > 1) rightRuns.push(rightRun);

    // chrome/glass tube rails: dark base, silver body, iridescent tint, bright glint core
    const allRuns = [...leftRuns, ...rightRuns];

    // soft pulsating outer glow -- rails only exist where there's no sand to
    // fall through, so this glow doubles as a "safe edge" cue, and the gap
    // wherever a run breaks (the beach) is exactly where you can fall off
    const glowPulse = 0.45 + 0.35 * Math.sin(this.time.now * 0.0035);
    this.railGfx.lineStyle(20, 0xbfe8ff, glowPulse * 0.35);
    allRuns.forEach((run) => this.railGfx.strokePoints(run, false));
    this.railGfx.lineStyle(13, 0xffffff, glowPulse * 0.4);
    allRuns.forEach((run) => this.railGfx.strokePoints(run, false));

    this.railGfx.lineStyle(8, 0x6a5f95, 0.55);
    allRuns.forEach((run) => this.railGfx.strokePoints(run, false));
    this.railGfx.lineStyle(6, 0xe4e0f5, 1);
    allRuns.forEach((run) => this.railGfx.strokePoints(run, false));
    const iriPalette = [0x9ee8ff, 0xff9ee8, 0xfff29e, 0xc79eff, 0xaef2c9];
    const iriHue = iriPalette[Math.floor(this.scrollDistance * 0.008) % iriPalette.length];
    this.railGfx.lineStyle(4, iriHue, 0.35);
    allRuns.forEach((run) => this.railGfx.strokePoints(run, false));
    this.railGfx.lineStyle(2, 0xffffff, 0.95);
    allRuns.forEach((run) => this.railGfx.strokePoints(run.map((p) => ({ x: p.x, y: p.y - 1.5 })), false));

    allRuns.forEach((run) => {
      run.forEach((p, i) => {
        if (i % 6 !== 0) return;
        const glint = 0.5 + 0.5 * Math.sin(p.y * 0.08 + this.scrollDistance * 0.02);
        this.railGfx.fillStyle(0xffffff, glint * 0.7);
        this.railGfx.fillCircle(p.x, p.y - 2, 2);
      });
    });
  }

  checkBeach(laneIdxFloor) {
    const seg = Math.floor(this.scrollDistance / SEG_LENGTH);
    const beachSide = beachSideForSegment(seg);
    const dangerLane = beachSide < 0 ? 0 : beachSide > 0 ? 2 : null;

    if (dangerLane === null || laneIdxFloor !== dangerLane) {
      this.sandDwellStart = null;
      return;
    }
    // riding onto the sand isn't punished by itself -- only lingering there
    // long enough to drift out toward its outer edge actually drops you off,
    // and that's instant -- no more shrugging off a wipeout with a meter hit
    if (this.sandDwellStart === null) this.sandDwellStart = this.time.now;
    const dwell = this.time.now - this.sandDwellStart;
    if (dwell > 500 && this.lastWipeoutSeg !== seg) {
      this.lastWipeoutSeg = seg;
      this.lastDamageSource = 'wipeout';
      this.cameras.main.shake(300, 0.02);
      this.flashMessage('WIPEOUT!', '#ffdd1a');
      this.triggerGameOver();
    }
  }

  // riding through the glowing half-width pad: a speed boost, a rainbow
  // streak trail, a sparkle chime, and everyone on the track cracks a smile
  checkBoost(laneIdxFloor, px, wasBoosted) {
    const seg = Math.floor(this.scrollDistance / SEG_LENGTH);
    const boostSide = boostSideForSegment(seg);
    const boostLane = boostSide < 0 ? 0 : boostSide > 0 ? 2 : null;
    const inBoost = boostLane !== null && laneIdxFloor === boostLane;

    if (inBoost) {
      this.boostUntil = this.time.now + 300;
      if (this.time.now > this.nextBoostSparkleAt) {
        this.nextBoostSparkleAt = this.time.now + 450;
        music.playSparkle();
      }
      if (this.time.now > this.nextBoostStreakAt) {
        this.nextBoostStreakAt = this.time.now + 90;
        this.spawnBoostStreak(px);
      }
    }

    const boostedNow = this.time.now < this.boostUntil;
    if (boostedNow !== this._boostedWasActive) {
      this._boostedWasActive = boostedNow;
      this.setSmilingMode(boostedNow);
    }
  }

  spawnBoostStreak(px) {
    const colors = [0xff3b3b, 0xff8c1a, 0xffdd1a, 0x3ddc5b, 0x2fa0ff, 0x9b3bff];
    const c = Phaser.Utils.Array.GetRandom(colors);
    const streak = this.add.image(px + Phaser.Math.Between(-14, 14), PLAYER_Y + 50, 'sparkle')
      .setTint(c).setScale(0.9).setDepth(9);
    this.tweens.add({
      targets: streak, y: streak.y + 70, alpha: 0, scale: 0.3, duration: 380,
      ease: 'Cubic.easeIn', onComplete: () => streak.destroy(),
    });
  }

  // while boosted, every crying emoji on screen and the grey head hazard
  // swap to a happy face instead of their normal sad/chomping look
  setSmilingMode(active) {
    this.obstacles.forEach((o) => {
      if (o.key === 'obs_crying') {
        o.img.faceImg.setTexture(active ? 'obs_crying_happy' : 'obs_crying');
        o.img.tearImgs.forEach((tear) => tear.setVisible(!active));
      }
    });
    this.heads.forEach((h) => {
      if (active) {
        h.chompTween.pause();
        h.mouthImg.setTexture('head_mouth_happy').setScale(1, 1);
      } else {
        h.mouthImg.setTexture('head_mouth');
        h.chompTween.resume();
      }
    });
  }

  spawnObstacle() {
    // a wider, more variable gap so objects never feel like they're on a
    // fixed conveyor belt
    this.nextObstacleAt = this.scrollDistance + Phaser.Math.Between(280, 520);
    const worldPos = this.scrollDistance + DIST_TRAVEL;

    let type = pickWeighted(OBSTACLE_TYPES);
    // never let the same obstacle type land twice in a row
    if (type.key === this.lastObstacleKey) {
      const rest = OBSTACLE_TYPES.filter((t) => t.key !== type.key);
      type = pickWeighted(rest);
    }
    this.lastObstacleKey = type.key;
    const lane = this.nonSandLane(worldPos);

    const img = this.buildObstacleVisual(type.key);
    this.obstacles.push({
      img, lane, t0: this.scrollDistance, baseX: this.roadCenterX(worldPos),
      key: type.key,
    });
    // log guy is only dangerous if you actually tap him -- riding past him
    // in his lane is harmless (see updateObstacles)
    if (type.key === 'obs_logguy') {
      img.setInteractive({ useHandCursor: true });
      img.on('pointerdown', () => {
        if (this.gameOver) return;
        this.lastDamageSource = 'logguy';
        this.cameras.main.shake(400, 0.03);
        this.cameras.main.flash(300, 20, 0, 0);
        this.flashMessage('NOPE!', '#ff3b3b');
        this.triggerGameOver();
      });
    }
  }

  // most obstacles are just a plain image; obs_computer gets a small
  // screen-flash rectangle layered on top so its monitor can blink on its
  // own without needing a whole separate animated texture; obs_crying gets
  // a couple of looping falling-teardrop sprites dripping from its eyes
  buildObstacleVisual(key) {
    if (key === 'obs_computer') {
      const base = this.add.image(0, 0, key);
      const flash = this.add.rectangle(-2, -17, 32, 22, 0x9fe0ff, 0.5);
      const container = this.add.container(GAME_WIDTH / 2, TOP_Y, [base, flash]).setDepth(5);
      this.tweens.add({
        targets: flash, alpha: 0.05, duration: 260, yoyo: true, repeat: -1, ease: 'Sine.easeInOut',
      });
      return container;
    }
    if (key === 'obs_crying') {
      const face = this.add.image(0, 0, key);
      const tearImgs = [-14, 14].map((tx, i) => {
        const tear = this.add.image(tx, -6, 'tear_drop').setOrigin(0.5, 0).setAlpha(0.9);
        this.tweens.add({
          targets: tear,
          y: 30,
          alpha: 0,
          duration: 750,
          delay: i * 380,
          repeat: -1,
          repeatDelay: 250,
          ease: 'Cubic.easeIn',
        });
        return tear;
      });
      const container = this.add.container(GAME_WIDTH / 2, TOP_Y, [face, ...tearImgs]).setDepth(5);
      container.faceImg = face;
      container.tearImgs = tearImgs;
      return container;
    }
    return this.add.image(GAME_WIDTH / 2, TOP_Y, key).setDepth(5);
  }

  // palm trees are the only thing ever allowed on the sand -- picks a random
  // lane, but excludes whichever side is sand at that world position
  nonSandLane(worldPos) {
    const seg = Math.floor(worldPos / SEG_LENGTH);
    const beachSide = beachSideForSegment(seg);
    if (beachSide === 0) return Phaser.Math.Between(0, 2);
    const sandLane = beachSide < 0 ? 0 : 2;
    const choices = [0, 1, 2].filter((l) => l !== sandLane);
    return choices[Phaser.Math.Between(0, choices.length - 1)];
  }

  // guarantees every sand island gets exactly one palm tree, independent of
  // the general obstacle timer (which might otherwise skip a short segment)
  checkTreeSpawn() {
    const worldPos = this.scrollDistance + DIST_TRAVEL;
    const seg = Math.floor(worldPos / SEG_LENGTH);
    if (seg === this.lastTreeSeg) return;
    this.lastTreeSeg = seg;
    const beachSide = beachSideForSegment(seg);
    if (beachSide === 0) return;
    const lane = beachSide < 0 ? 0 : 2;
    const img = this.add.image(GAME_WIDTH / 2, TOP_Y, 'obs_tree').setDepth(5);
    this.obstacles.push({
      img, lane, t0: this.scrollDistance, baseX: this.roadCenterX(worldPos),
      key: 'obs_tree', pickup: false,
    });
  }

  spawnDolphin() {
    const worldPos = this.scrollDistance + DIST_TRAVEL;
    const lane = this.nonSandLane(worldPos);
    // alternates each dolphin's facing direction instead of flipping mid-flight
    this.dolphinFaceToggle = !this.dolphinFaceToggle;
    // always drawn above the player skittle/vehicle (depth 10-11) so it
    // reads as floating/jumping over the track rather than sliding under it
    const img = this.add.image(GAME_WIDTH / 2, TOP_Y, 'dolphin').setDepth(12)
      .setInteractive({ useHandCursor: true })
      .setFlipX(this.dolphinFaceToggle);
    const baseX = this.roadCenterX(worldPos);
    const d = {
      img, lane, t0: this.scrollDistance, baseX, x: baseX,
      // swims off in whatever direction it's facing once it reaches the player
      exitDir: this.dolphinFaceToggle ? 1 : -1,
      phase: Math.random() * Math.PI * 2, splashedEntry: false, splashedExit: false,
    };
    img.on('pointerdown', () => this.rideDolphin(d));
    this.dolphins.push(d);
  }

  // Tapping a dolphin directly: a quick sound, a hop off the vehicle, and a
  // brief ride before hopping back on.
  rideDolphin(d) {
    if (this.riding || d.resolved || this.gameOver) return;
    d.resolved = true;
    this.riding = true;
    music.playDolphinSound();
    this.sugarRushUntil = this.time.now + 3000;
    this.meter = Math.min(100, this.meter + 100 / SKITTLE_COLORS.length);
    this.spawnBubbles(d.img.x, d.img.y);
    this.spawnSplash(d.img.x, d.img.y);
    this.flashMessage('DOLPHIN RIDE', '#2fa0ff');

    this.tweens.add({ targets: [this.vehicleSprite, this.vehicleShadow], alpha: 0, duration: 150 });
    this.tweens.add({
      targets: this.playerCandy,
      y: PLAYER_Y - 60,
      scaleX: this.playerCandy.scaleX * 1.15,
      scaleY: this.playerCandy.scaleY * 1.15,
      duration: 200,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.time.delayedCall(650, () => {
          this.tweens.add({
            targets: this.playerCandy,
            y: PLAYER_Y,
            scaleX: this.playerCandy.scaleX / 1.15,
            scaleY: this.playerCandy.scaleY / 1.15,
            duration: 220,
            ease: 'Bounce.easeOut',
          });
          this.tweens.add({
            targets: [this.vehicleSprite, this.vehicleShadow],
            alpha: 1,
            duration: 250,
            onComplete: () => { this.riding = false; },
          });
        });
      },
    });
  }

  spawnHead() {
    let side = this.headSide;
    this.headSide *= -1;
    const worldPos = this.scrollDistance + DIST_TRAVEL;
    const seg = Math.floor(worldPos / SEG_LENGTH);
    const beachSide = beachSideForSegment(seg);
    // never let the head land on the sand lane -- flip to the other edge instead
    if (beachSide !== 0 && side === beachSide) side *= -1;
    const dangerLane = side < 0 ? 0 : 2;
    const baseX = this.roadCenterX(worldPos);

    const container = this.add.container(GAME_WIDTH / 2, TOP_Y).setDepth(4);
    const headImg = this.add.image(0, 0, 'head');
    const mouthImg = this.add.image(0, 24, 'head_mouth');
    container.add([headImg, mouthImg]);

    const chompTween = this.tweens.add({
      targets: mouthImg,
      scaleY: 0.35,
      duration: 260,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
      onYoyo: () => music.playChompSound(),
    });

    this.heads.push({
      container, side, dangerLane, t0: this.scrollDistance, baseX, chompTween, mouthImg, resolved: false,
    });
  }

  updateHeads(dt) {
    for (let i = this.heads.length - 1; i >= 0; i--) {
      const h = this.heads[i];
      const progress = Phaser.Math.Clamp((this.scrollDistance - h.t0) / DIST_TRAVEL, 0, 1.15);
      const y = Phaser.Math.Linear(TOP_Y - 30, PLAYER_Y - 10, progress);
      const scale = Phaser.Math.Linear(0.4, 3, Math.min(1, progress));
      const x = Phaser.Math.Linear(
        h.baseX, GAME_WIDTH / 2 + h.side * HEAD_SIDE_OFFSET, Math.min(1, progress)
      );
      h.container.setPosition(x, y).setScale(scale).setDepth(4 + Math.floor(progress * 6));

      if (!this.gameOver && progress >= 0.85 && progress < 1.1 && !h.resolved) {
        const laneHit = Math.round(this.currentLane) === h.dangerLane;
        if (laneHit) {
          h.resolved = true;
          this.triggerHeadGameOver();
        }
      }

      if (progress >= 1.15) {
        h.chompTween.stop();
        h.container.destroy();
        this.heads.splice(i, 1);
      }
    }
  }

  triggerHeadGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.registry.set('score', Math.floor(this.score));
    this.registry.set('deathReason', 'head');
    this.cameras.main.shake(400, 0.03);
    this.cameras.main.flash(300, 20, 0, 0);
    this.flashMessage('GULP!', '#ff3b3b');
    this.time.delayedCall(500, () => this.scene.start('GameOver'));
  }

  spawnSplash(x, y) {
    for (let i = 0; i < 5; i++) {
      const drop = this.add.image(x, y, 'splash').setDepth(7).setScale(0.6);
      const angle = (i / 5) * Math.PI * 2;
      this.tweens.add({
        targets: drop,
        x: x + Math.cos(angle) * 22,
        y: y + Math.sin(angle) * 10 + 6,
        scale: 0.15,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => drop.destroy(),
      });
    }
  }

  // small bubbles rising and fading from around the dolphin's tail/fins,
  // for the tap-to-ride moment (no text, just sound + this)
  spawnBubbles(x, y, count = 10) {
    for (let i = 0; i < count; i++) {
      const offX = Phaser.Math.Between(-30, 30);
      const offY = Phaser.Math.Between(-10, 25);
      const b = this.add.circle(x + offX, y + offY, Phaser.Math.Between(2, 5), 0xdff6ff, 0.75).setDepth(8);
      this.tweens.add({
        targets: b,
        y: b.y - Phaser.Math.Between(30, 60),
        x: b.x + Phaser.Math.Between(-15, 15),
        alpha: 0,
        duration: Phaser.Math.Between(500, 900),
        delay: Phaser.Math.Between(0, 200),
        ease: 'Sine.easeOut',
        onComplete: () => b.destroy(),
      });
    }
  }

  // rainbow-tinted music notes drifting up and fading, for collecting a CD
  spawnMusicNotes(x, y, count = 6) {
    const glyphs = ['♪', '♫'];
    const colors = ['#ff3b3b', '#ff8c1a', '#ffdd1a', '#3ddc5b', '#2fa0ff', '#9b3bff'];
    for (let i = 0; i < count; i++) {
      const offX = Phaser.Math.Between(-24, 24);
      const note = this.add.text(x + offX, y, Phaser.Utils.Array.GetRandom(glyphs), {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: `${Phaser.Math.Between(16, 22)}px`,
        fontStyle: 'bold',
        color: Phaser.Utils.Array.GetRandom(colors),
      }).setOrigin(0.5).setDepth(13).setAngle(Phaser.Math.Between(-20, 20));
      this.tweens.add({
        targets: note,
        y: note.y - Phaser.Math.Between(50, 90),
        x: note.x + Phaser.Math.Between(-25, 25),
        angle: note.angle + Phaser.Math.Between(-30, 30),
        alpha: 0,
        duration: Phaser.Math.Between(600, 1000),
        delay: Phaser.Math.Between(0, 180),
        ease: 'Cubic.easeOut',
        onComplete: () => note.destroy(),
      });
    }
  }

  updateObstacles(dt, playerX) {
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      const progress = Phaser.Math.Clamp((this.scrollDistance - o.t0) / DIST_TRAVEL, 0, 1.15);
      const y = Phaser.Math.Linear(TOP_Y, PLAYER_Y, progress);
      const scale = Phaser.Math.Linear(0.25, 1.1, Math.min(1, progress));
      const x = Phaser.Math.Linear(o.baseX, GAME_WIDTH / 2 + LANE_OFFSETS[o.lane], Math.min(1, progress));
      o.img.setPosition(x, y).setScale(scale).setDepth(5 + Math.floor(progress * 5));

      // small idle animations, per obstacle type
      if (o.key === 'obs_cd') {
        o.img.rotation += dt * 3.2;
      } else if (o.key === 'obs_tree') {
        o.img.rotation = Math.sin(this.time.now * 0.0016 + o.t0) * 0.09;
      }

      if (progress >= 0.94 && progress < 1.05 && !o.resolved) {
        const laneHit = Math.round(this.currentLane) === o.lane;
        // the CD is a pickup, not a hazard -- +1 skittle, a chill vaporwave
        // chord, and music notes drifting off of it, no damage/invincibility
        if (laneHit && o.key === 'obs_cd') {
          o.resolved = true;
          this.meter = Math.min(100, this.meter + 100 / SKITTLE_COLORS.length);
          music.playCdCollect();
          this.spawnMusicNotes(x, y);
          this.flashMessage('AHHH, RELAXING MUSIC', '#9b3bff');
        } else if (laneHit && o.key !== 'obs_logguy' && this.time.now > this.invincibleUntil) {
          // log guy is only dangerous if you tap him (see spawnObstacle) --
          // just riding past in his lane does nothing
          o.resolved = true;
          this.meter -= 100 / SKITTLE_COLORS.length;
          this.lastDamageSource = 'obstacle';
          this.invincibleUntil = this.time.now + 900;
          this.cameras.main.shake(200, 0.012);
          this.cameras.main.flash(150, 255, 60, 60);
          this.flashMessage(OBSTACLE_HIT_MESSAGE[o.key] || 'OUCH!', '#ff3b3b');
        }
      }

      if (progress >= 1.15) {
        o.img.destroy();
        this.obstacles.splice(i, 1);
      }
    }
  }

  updateDolphins(dt, playerX) {
    for (let i = this.dolphins.length - 1; i >= 0; i--) {
      const d = this.dolphins[i];
      const progress = Phaser.Math.Clamp((this.scrollDistance - d.t0) / DIST_TRAVEL, 0, 1.15);
      const y = Phaser.Math.Linear(TOP_Y, PLAYER_Y, progress);
      // clean single jump-arc over the track, and a fixed facing direction
      // set once at spawn (see spawnDolphin)
      const scale = Phaser.Math.Linear(0.36, 1.4, Math.min(1, progress));
      const arc = Math.sin(progress * Math.PI) * -55;
      if (progress < 1) {
        // eases into its lane on the way in, same as before
        d.x = Phaser.Math.Linear(d.baseX, GAME_WIDTH / 2 + LANE_OFFSETS[d.lane], progress);
      } else {
        // once it reaches the player it keeps swimming sideways off-frame
        // in whichever direction it's facing, instead of just sitting there
        d.x += d.exitDir * 240 * dt;
      }
      const x = d.x;
      // depth stays above the player skittle/vehicle (10-11) the whole way
      // through its arc, so it always reads as floating over the track
      d.img.setPosition(x, y + arc).setScale(scale).setDepth(12 + Math.floor(progress * 5));
      // base arc rotation plus a faster flutter, like the tail/fins flapping
      const flap = Math.sin(this.time.now * 0.018 + d.phase * 3) * 0.06;
      d.img.setRotation(Math.cos(progress * Math.PI) * 0.25 + flap);

      if (!d.splashedEntry && progress > 0.05) {
        d.splashedEntry = true;
        this.spawnSplash(x, y);
      }

      if (progress >= 0.94 && progress < 1.05 && !d.resolved) {
        const laneHit = Math.round(this.currentLane) === d.lane;
        if (laneHit) {
          d.resolved = true;
          this.sugarRushUntil = this.time.now + 3000;
          this.flashMessage('SUGAR RUSH! squeak!', '#3ddc5b');
          this.spawnSplash(x, y);
        }
      }

      if (!d.splashedExit && progress >= 1) {
        d.splashedExit = true;
        this.spawnSplash(x, y);
      }

      if (progress >= 1.15 && (x < -90 || x > GAME_WIDTH + 90)) {
        d.img.destroy();
        this.dolphins.splice(i, 1);
      }
    }
  }

  flashMessage(text, color) {
    const t = this.add.text(GAME_WIDTH / 2, 210, text, {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '24px', fontStyle: 'bold', color,
    }).setOrigin(0.5).setStroke('#000000', 4).setDepth(40);
    this.tweens.add({
      targets: t, y: t.y - 30, alpha: 0, duration: 800, onComplete: () => t.destroy(),
    });
  }

  spawnPopup(time) {
    this.nextPopupAt = this.elapsed + Phaser.Math.Between(7, 11);
    const type = Math.random() < 0.5 ? 'kickflip' : 'taste';
    const winW = 128, winH = 92, titleH = 20;
    const onLeft = Math.random() < 0.5;
    const offsetX = onLeft ? -(GAME_WIDTH / 2 - 14 - winW / 2) : (GAME_WIDTH / 2 - 14 - winW / 2);
    const startY = 190;
    const t0 = this.scrollDistance;
    const container = this.add.container(this.roadCenterX(this.scrollDistance) + offsetX, startY).setDepth(50);
    const win = createWindow(this, -winW / 2, -winH / 2, winW, winH, type === 'kickflip' ? 'trick.exe' : 'yum.exe', { titleH });
    const label = this.add.text(0, -15, type === 'kickflip' ? '⚠️ Flip' : '😊 Taste', {
      fontFamily: 'Trebuchet MS, sans-serif', fontSize: '13px', fontStyle: 'bold', color: '#2a0f4a',
    }).setOrigin(0.5);
    const btn = createButton(this, 0, 12, 80, 26, type === 'kickflip' ? 'GO' : 'NOMNOM', {
      gradientFrom: 0x8a2be2, gradientTo: 0xff4fd8, color: '#ffffff', fontSize: '12px', radius: 6,
    });
    const timerBarW = 96;
    const timerBarBg = this.add.rectangle(0, 38, timerBarW, 5, 0x000000, 0.3).setOrigin(0.5);
    const timerBar = this.add.rectangle(-timerBarW / 2, 38, timerBarW, 5, 0x2fa0ff, 1).setOrigin(0, 0.5);

    container.add([win, label, btn, timerBarBg, timerBar]);
    container.setScale(0.6).setAlpha(0);
    this.tweens.add({ targets: container, scale: 1, alpha: 1, duration: 250, ease: 'Back.easeOut' });

    const duration = 2600;
    const startTime = time;
    btn.hitZone.on('pointerdown', () => {
      if (!this.activePopup) return;
      this.resolvePopup(type, true);
    });

    this.activePopup = { container, type, startTime, duration, timerBar, timerBarW, offsetX, startY, t0 };
  }

  updatePopups(time) {
    if (!this.activePopup) return;
    const { startTime, duration, timerBar, timerBarW, container, offsetX, startY, t0 } = this.activePopup;
    const pct = Phaser.Math.Clamp(1 - (time - startTime) / duration, 0, 1);
    timerBar.width = timerBarW * pct;
    // rides along with the track instead of sitting frozen in place: x tracks
    // the road's curve, y creeps down slightly as the world scrolls by -- but
    // always clamped to stay fully on screen, never drifting out of frame
    const rawX = this.roadCenterX(this.scrollDistance) + offsetX;
    container.x = Phaser.Math.Clamp(rawX, 68, GAME_WIDTH - 68);
    container.y = Phaser.Math.Clamp(startY + Math.min(1, (this.scrollDistance - t0) / 400) * 40, 60, 260);
    if (pct <= 0) {
      this.resolvePopup(this.activePopup.type, false);
    }
  }

  resolvePopup(type, success) {
    if (!this.activePopup) return;
    const { container } = this.activePopup;
    if (success && type === 'kickflip') {
      // 1 skittle's worth, straight onto the life bar
      this.meter = Math.min(100, this.meter + 100 / SKITTLE_COLORS.length);
      this.invincibleUntil = this.time.now + 1200;
      this.flashMessage('KICKFLIP!! +1', '#ff2fd6');
      this.doKickflipJump();
    } else if (success && type === 'taste') {
      this.meter = Math.min(100, this.meter + 100 / SKITTLE_COLORS.length);
      this.flashMessage('NOM NOM +1', '#3ddc5b');
      this.spawnSkittleBurst(container.x, container.y);
    }
    this.tweens.add({
      targets: container, scale: 0.6, alpha: 0, duration: 180, onComplete: () => container.destroy(),
    });
    this.activePopup = null;
  }

  // a burst of tiny skittles exploding outward from a point, for the NOMNOM
  // taste popup's success moment
  spawnSkittleBurst(x, y, count = 50) {
    for (let i = 0; i < count; i++) {
      const c = Phaser.Utils.Array.GetRandom(SKITTLE_COLORS);
      const img = this.add.image(x, y, `candy_${c.key}`).setScale(0.22).setDepth(60);
      const angle = Math.random() * Math.PI * 2;
      const dist = Phaser.Math.Between(40, 150);
      this.tweens.add({
        targets: img,
        x: x + Math.cos(angle) * dist,
        y: y + Math.sin(angle) * dist,
        scale: 0,
        alpha: 0,
        rotation: Phaser.Math.FloatBetween(-4, 4),
        duration: Phaser.Math.Between(800, 1400),
        ease: 'Cubic.easeOut',
        onComplete: () => img.destroy(),
      });
    }
  }

  // vehicle + candy hop up and spin a full rotation, for a successful kickflip
  doKickflipJump() {
    this.flippingUntil = this.time.now + 600;
    this.tweens.add({
      targets: [this.vehicleSprite, this.playerCandy],
      y: '-=50',
      duration: 280,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    this.tweens.add({
      targets: [this.vehicleSprite, this.playerCandy],
      rotation: '+=6.283185',
      duration: 560,
      ease: 'Cubic.easeInOut',
    });
  }

  triggerGameOver() {
    if (this.gameOver) return;
    this.gameOver = true;
    this.registry.set('score', Math.floor(this.score));
    // only blame a specific cause if that's what actually ended the run --
    // a generic obstacle hit or plain time-drain just falls back to 'meter'
    const specific = ['wipeout', 'logguy', 'inactive'];
    this.registry.set('deathReason', specific.includes(this.lastDamageSource) ? this.lastDamageSource : 'meter');
    this.cameras.main.shake(300, 0.02);
    this.time.delayedCall(400, () => this.scene.start('GameOver'));
  }
}
