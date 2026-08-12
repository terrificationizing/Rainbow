import Phaser from 'phaser';
import * as Tone from 'tone';
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { createCandy, createButton, vehicleScale, paintSky, scatterGlitter, createEscButton, paintDiagonalSheen, rainbowGradient } from '../ui.js';
import { music } from '../audio.js';

const VEH_TEX = {
  surfboard: 'veh_surfboard',
  hoverboard: 'veh_hoverboard',
  rollerblade: 'veh_rollerblade',
  floppy: 'veh_floppy',
};

const VEH_BUTTON_LABEL = {
  surfboard: 'SURF THE RAINBOW',
  hoverboard: 'HOVER THE RAINBOW',
  rollerblade: 'SK8 THE RAINBOW',
  floppy: 'FLOP THE RAINBOW',
};

// per-vehicle "LET'S RIDE"-style burst message -- rows are picked by hand per
// message (rather than auto-wrapped) so each line stays short enough to read
// at the big bubble-letter size; longer 3-word messages drop the font size a
// notch so they still fit the screen width
const VEH_BURST = {
  surfboard: { rows: ["SURF'S", 'UP!'], fontSize: 110 },
  hoverboard: { rows: ["IT'S", 'HOVER', 'TIME!'], fontSize: 84 },
  rollerblade: { rows: ["LET'S", 'SK8!'], fontSize: 110 },
  floppy: { rows: ["LET'S", 'GET', 'FLOPPY!'], fontSize: 78 },
};

// Fraction of the climb that's a flat, level starting plateau before the track
// crests and curves away down the hill.
const PLATEAU = 0.18;

export default class IntroScene extends Phaser.Scene {
  constructor() {
    super('Intro');
  }

  create() {
    paintSky(this);
    createEscButton(this);
    for (let i = 0; i < 4; i++) {
      this.add.image(
        Phaser.Math.Between(20, GAME_WIDTH - 20),
        Phaser.Math.Between(20, 300),
        'cloud'
      ).setAlpha(0.85);
    }
    scatterGlitter(this, 48);

    this.colorKey = this.registry.get('color') || 'red';
    this.vehicleKey = this.registry.get('vehicle') || 'hoverboard';

    this.rainbowGfx = this.add.graphics();

    // bagTargetY anchors the rainbow curve's seam (and everything measured from
    // it -- the start line, settleY, the button) -- kept at its original spot
    // so none of that shifts even though the wrapper art itself is much bigger now.
    this.bagTargetY = GAME_HEIGHT - 110;
    // The wrapper image's own landing position is separate: wrapper.svg's visible
    // art only fills part of its loaded canvas (bbox bottom at ~291px of the 449px-
    // tall texture), so it's placed so that visible bottom -- not the canvas edge --
    // sits flush with the bottom of the frame, no dead transparent space below it.
    this.bagImgTargetY = GAME_HEIGHT - 291;
    // this.settleY is computed later in drawStartLine(), once the curve's real
    // farY is known, so it can't drift out of sync with the line it's relative to.
    this.bag = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT + 260, 'bag').setOrigin(0.5, 0).setDepth(2);

    this.tweens.add({
      targets: this.bag,
      y: this.bagImgTargetY,
      duration: 900,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        this.shootRainbow();
      },
    });
  }

  shootRainbow() {
    const bandColors = rainbowGradient(24);
    const originX = GAME_WIDTH / 2;
    const zigH = 20;
    // sit at the zig-zag's valley depth so the teeth overlap it -- no visible gap
    const originY = this.bagTargetY + zigH;
    // drawn well past the top of the screen so the track always exits off-screen
    // (twisting out via the bow) instead of ever showing a visible terminus
    const farY = -220;
    const nearHalfW = 174;
    // stash for drawStartLine() to reuse the exact same curve math
    this.curveOriginX = originX;
    this.curveOriginY = originY;
    this.curveFarY = farY;
    this.curveNearHalfW = nearHalfW;

    // wrapper.svg now has its own built-in shadow baked into the art, so no
    // separate procedural shadow graphic is drawn here anymore
    this.bagShadow = null;

    music.playSparkle();

    const progress = { v: 0 };
    this.tweens.add({
      targets: progress,
      v: 1,
      duration: 900,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        this.rainbowGfx.clear();

        // a flat extension below the bag's seam, all the way past the bottom of
        // the screen -- hidden behind the bag for now, but there so that once the
        // wrapper animates away you never see a hard cut-off at the rainbow's end
        const { halfW: baseHalfW, cx: baseCx } = this.curveShape(0);
        const baseBounds = [];
        for (let i = 0; i <= bandColors.length; i++) {
          baseBounds.push(baseCx - baseHalfW + baseHalfW * 2 * (i / bandColors.length));
        }
        for (let i = 0; i < bandColors.length; i++) {
          this.rainbowGfx.fillStyle(bandColors[i], 1);
          this.rainbowGfx.fillPoints([
            { x: baseBounds[i], y: originY }, { x: baseBounds[i], y: GAME_HEIGHT + 60 },
            { x: baseBounds[i + 1], y: GAME_HEIGHT + 60 }, { x: baseBounds[i + 1], y: originY },
          ], true);
        }

        const curTopY = Phaser.Math.Linear(originY, farY, progress.v);
        const steps = 30;
        let prevBounds = null, prevY = null;
        for (let s = 0; s <= steps; s++) {
          const y = Phaser.Math.Linear(originY, curTopY, s / steps);
          const fullT = Phaser.Math.Clamp((originY - y) / (originY - farY), 0, 1);
          const { halfW, cx } = this.curveShape(fullT);
          const bounds = [];
          for (let i = 0; i <= bandColors.length; i++) {
            bounds.push(cx - halfW + halfW * 2 * (i / bandColors.length));
          }
          if (prevBounds) {
            for (let i = 0; i < bandColors.length; i++) {
              this.rainbowGfx.fillStyle(bandColors[i], 1);
              this.rainbowGfx.fillPoints([
                { x: prevBounds[i], y: prevY }, { x: bounds[i], y },
                { x: bounds[i + 1], y }, { x: prevBounds[i + 1], y: prevY },
              ], true);
            }
          }
          prevBounds = bounds; prevY = y;
        }
      },
      onComplete: () => {
        this.drawStartLine();
        this.dropCharacter();
      },
    });
  }

  // Flat plateau right at the bag (a level place to start), a smooth blend into an
  // ease-out taper (stays wide longer), then a serpentine bow that twists side to
  // side as the track recedes down the hill and away into the distance.
  curveShape(fullT) {
    const localT = Phaser.Math.Clamp((fullT - PLATEAU) / (1 - PLATEAU), 0, 1);
    const smooth = localT * localT * (3 - 2 * localT);
    const eased = 1 - Math.pow(1 - smooth, 2.2);
    // keeps real width even at the top of the visible stretch, and swings wide
    // enough to exit past the screen edge -- reads as "twists on out of view"
    // rather than tapering down to a vanishing point
    const halfW = Phaser.Math.Linear(this.curveNearHalfW, 34, eased);
    // both terms must resolve to exactly 0 at smooth=0 so the ribbon's base stays
    // perfectly centered on the bag -- a phase-shifted term here previously caused
    // a misalignment right at the origin
    const bow = Math.sin(smooth * Math.PI) * 95 + Math.sin(smooth * Math.PI * 2.6) * 70 * smooth;
    return { halfW, cx: this.curveOriginX + bow };
  }

  drawStartLine() {
    // sits right at the hill's crest -- where the flat plateau ends and the track
    // first starts to curve away, not back at the bag itself
    const lineY = this.curveOriginY - PLATEAU * (this.curveOriginY - this.curveFarY);
    // settleY is the vehicle's *center*, and its sprite extends ~45px below that,
    // so the gap here has to clear the line by more than it looks like it needs to
    this.settleY = lineY - 130;
    const { halfW, cx } = this.curveShape(PLATEAU);
    const barH = 4;
    const cellW = (halfW * 2) / 12;

    const g = this.add.graphics().setDepth(2);
    for (let i = 0; i < 12; i++) {
      g.fillStyle(i % 2 === 0 ? 0x111111 : 0xffffff, 0.45);
      g.fillRect(cx - halfW + i * cellW, lineY - barH / 2, cellW, barH);
    }

    // arrow pointing up-track, into the distance -- plain white, no outline
    const ax = cx, aTipY = lineY - 34, aLx = cx - 16, aRx = cx + 16, aBaseY = lineY - 8;
    g.fillStyle(0xffffff, 1);
    g.fillTriangle(ax, aTipY, aLx, aBaseY, aRx, aBaseY);
  }

  dropCharacter() {
    const x = GAME_WIDTH / 2;
    const settleY = this.settleY;

    Tone.start().then(() => music.playDialUp());

    this.vehicleShadow = this.add.ellipse(x, settleY + 44, 80, 18, 0x000000, 0.4)
      .setBlendMode(Phaser.BlendModes.MULTIPLY).setAlpha(0);
    const vehTexKey = VEH_TEX[this.vehicleKey];
    const vehScale = (this.vehicleKey === 'hoverboard' || this.vehicleKey === 'surfboard')
      ? 118 / this.textures.get(vehTexKey).getSourceImage().width
      : vehicleScale(this, vehTexKey, 88);
    this.vehicle = this.add.image(x, -80, vehTexKey).setScale(vehScale);
    // the rollerblade's ankle cuff (the heel/"back" of the boot) sits toward
    // the left of its texture, so shift the candy left and lift it clear of
    // the boot instead of centering it over the whole shell
    const candyX = this.vehicleKey === 'rollerblade' ? x - 16 : x;
    const candyYTarget = this.vehicleKey === 'rollerblade' ? settleY - 30 : settleY - 14;
    this.candy = createCandy(this, candyX, -160, this.colorKey, 1.2);

    this.tweens.add({
      targets: this.vehicle,
      y: settleY + 26,
      duration: 700,
      delay: 100,
      ease: 'Bounce.easeOut',
    });
    this.tweens.add({
      targets: this.vehicleShadow,
      alpha: 1,
      duration: 400,
      delay: 300,
    });
    this.tweens.add({
      targets: this.candy,
      y: candyYTarget,
      duration: 750,
      delay: 220,
      ease: 'Bounce.easeOut',
      onComplete: () => this.showTitleAndButton(),
    });
  }

  showTitleAndButton() {
    const btnY = this.settleY - 160;
    const label = VEH_BUTTON_LABEL[this.vehicleKey] || 'RIDE THE RAINBOW';
    const btn = createButton(this, GAME_WIDTH / 2, btnY, 280, 72, label, {
      gradientFrom: 0x8a2be2,
      gradientTo: 0xff4fd8,
      color: '#ffffff',
      fontSize: '17px',
    });
    btn.setDepth(60);
    btn.setScale(0).setAlpha(0);
    this.tweens.add({
      targets: btn,
      alpha: 1,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: btn, scale: 1.15, duration: 550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });

    scatterGlitter(this, 14, { yMin: btnY - 70, yMax: btnY + 70, depth: 61 });

    btn.hitZone.on('pointerdown', () => {
      // the wrapper peels away and drops out of frame while the rainbow, vehicle,
      // and skittle stay put -- so the track reads as continuous into gameplay
      // rather than cutting to a totally different-looking road
      music.playBloop();
      music.playCrinkle();
      this.tweens.add({
        targets: this.bag,
        y: GAME_HEIGHT + 260,
        duration: 900,
        ease: 'Cubic.easeIn',
      });
      this.time.delayedCall(850, () => {
        const burst = VEH_BURST[this.vehicleKey] || { rows: ["LET'S", 'RIDE'], fontSize: 110 };
        this.showLetsRideBurst(burst.rows, burst.fontSize, () => this.scene.start('Game'));
      });
    });
  }

  // a fully flooded interim screen with a per-vehicle hype phrase in huge
  // rainbow bubble letters, one word per row
  showLetsRideBurst(rows, fontSize, onComplete) {
    // purple-to-pink iridescent flood, matching the popup title-bar gradient
    const flood = this.add.graphics().setDepth(290).setAlpha(0);
    flood.fillGradientStyle(0x8a2be2, 0xff4fd8, 0x8a2be2, 0xff4fd8, 1);
    flood.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    paintDiagonalSheen(flood, 0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.tweens.add({ targets: flood, alpha: 1, duration: 120 });
    music.playLetsRideSound();
    scatterGlitter(this, 64, { yMin: GAME_HEIGHT / 2 - 160, yMax: GAME_HEIGHT / 2 + 160, depth: 301 });

    // soft pulsing glow blob behind the letters, for a shiny/glittery backdrop
    const glow = this.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'sparkle')
      .setTint(0xffffff).setAlpha(0).setScale(18).setDepth(299);
    this.tweens.add({ targets: glow, alpha: 0.18, scale: 22, duration: 500, yoyo: true, repeat: 1, ease: 'Sine.easeInOut' });

    const colors = ['#ff3b3b', '#ff8c1a', '#ffdd1a', '#3ddc5b', '#2fa0ff', '#9b3bff'];
    const style = { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${fontSize}px`, fontStyle: 'bold' };
    // tighter leading -- rows sit closer together than the font size alone would suggest;
    // spacing (and total row count) scales with fontSize so 2- and 3-row messages both fit
    const rowGap = fontSize * 1.05;
    const rowY = rows.map((_, i) => GAME_HEIGHT / 2 + (i - (rows.length - 1) / 2) * rowGap);

    const letters = [];
    let colorIdx = 0;
    rows.forEach((word, r) => {
      const widths = [...word].map((ch) => {
        const t = this.add.text(0, 0, ch, style);
        const w = t.width;
        t.destroy();
        return w;
      });
      const totalW = widths.reduce((a, b) => a + b, 0);
      let x = GAME_WIDTH / 2 - totalW / 2;
      [...word].forEach((ch, i) => {
        if (ch !== ' ') {
          const cx = x + widths[i] / 2;
          // thick white bubble-outline layer sits behind, giving a glossy
          // two-tone border once the black-stroked colored letter sits on top
          const halo = this.add.text(cx, rowY[r], ch, { ...style, color: '#ffffff' })
            .setOrigin(0.5).setStroke('#ffffff', 5).setDepth(299).setScale(0);
          const letter = this.add.text(cx, rowY[r], ch, {
            ...style, color: colors[colorIdx % colors.length],
          }).setOrigin(0.5).setStroke('#000000', 7).setDepth(300).setScale(0);
          colorIdx++;
          letters.push(halo, letter);
          this.tweens.add({
            targets: [halo, letter], scale: 1, duration: 320, delay: 120 + colorIdx * 35, ease: 'Back.easeOut',
          });
        }
        x += widths[i];
      });
    });
    letters.push(glow);

    this.time.delayedCall(1000, () => {
      [flood, ...letters].forEach((o) => {
        this.tweens.add({ targets: o, alpha: 0, duration: 200, onComplete: () => o.destroy() });
      });
      onComplete();
    });
  }
}
