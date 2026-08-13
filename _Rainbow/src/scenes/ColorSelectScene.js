import Phaser from 'phaser';
import * as Tone from 'tone';
import { GAME_WIDTH, GAME_HEIGHT, SKITTLE_COLORS } from '../config.js';
import { createWindow, createCandy, paintSky, scatterGlitter, createEscButton, rainbowGradient } from '../ui.js';
import { speakFlavor } from '../speech.js';
import { music } from '../audio.js';

export default class ColorSelectScene extends Phaser.Scene {
  constructor() {
    super('ColorSelect');
  }

  create() {
    paintSky(this);
    this.buildSky();
    scatterGlitter(this, 26);
    createEscButton(this);

    const win = createWindow(this, 22, 70, GAME_WIDTH - 44, 110, 'YUMMMMM');
    // vertically centered in the inset panel now that CLICK TWICE! is gone --
    // greys out while Music Mode is on, since tapping a skittle no longer
    // does anything color-pick-related in that state (see setMusicMode)
    this.pickColorText = this.add.text(22 + (GAME_WIDTH - 44) / 2, 70 + 38 + 34, 'PICK A COLOR', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#111111',
    }).setOrigin(0.5);

    // tapping the body of the header box (below the title bar, so the X
    // stays untouched) while Music Mode is on is a quick way to switch it
    // back off without reaching all the way down to the toggle
    const boxOffZone = this.add.zone(22 + (GAME_WIDTH - 44) / 2, 70 + 38 + 34, GAME_WIDTH - 52, 68)
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    boxOffZone.on('pointerdown', () => this.setMusicMode(false));

    // single centered column, original candy size
    const centerX = GAME_WIDTH / 2;
    // pulled up and slightly closer together vs. the original 280/125 --
    // frees up real breathing room above the (now-larger) toggle switch
    // while still leaving the top skittle clear of the header box
    const startY = 275;
    const gap = 108;
    const candyScale = 1.3;

    // off by default -- when on, tapping a skittle only plays its flavor
    // sound (a pure soundboard) and never enters the game; when off, a
    // single tap picks that color and enters the game directly
    this.musicMode = false;
    this.buildMusicModeToggle();

    // sax sits to the right of the column, level with the 2nd skittle;
    // horn sits to the left, level with the 4th -- both only visible/
    // tappable while Music Mode is on. horn pops in first, sax follows
    // shortly after (see the appearDelay passed to each).
    this.musicIcons = [];
    this.buildInstrumentIcon('horn', centerX - 112, startY + 3 * gap, () => music.playHornSolo(), 0);
    this.buildInstrumentIcon('sax', centerX + 112, startY + gap, () => music.playSaxSolo(), 260);

    SKITTLE_COLORS.forEach((c, i) => {
      const x = centerX;
      const y = startY + i * gap;

      const glow = this.add.circle(x, y, 46 * (candyScale / 1.3), c.hex, 0.25);
      const candy = createCandy(this, x, y, c.key, candyScale);

      const playFlavorSound = () => {
        // wrapped so a playback problem (missing asset, locked audio, etc.)
        // can never take the rest of this interaction down with it -- the
        // popup animation and glow below must always run regardless
        try {
          this.sound.play(`flavor_${c.flavor}`);
        } catch (err) {
          console.error('flavor sound failed to play:', err);
        }
        this.popFlavorWord(x, y, c.flavor);
        // the candy itself stays the same size -- it glows instead of enlarging.
        // killing any tween already in flight (and resetting to the known base
        // values) before starting a new one keeps rapid re-taps from stacking
        // overlapping tweens on the same properties -- without this, a second
        // tap starting mid-pulse would yoyo back to whatever alpha/scale it was
        // at *then*, not the original resting state, leaving the glow visibly
        // stuck larger/brighter than it started.
        this.tweens.killTweensOf(glow);
        glow.setAlpha(1).setScale(1);
        this.tweens.add({ targets: glow, alpha: 0.8, scale: 1.4, duration: 220, yoyo: true, repeat: 2 });
      };

      const hit = this.add.circle(x, y, 50 * (candyScale / 1.3)).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        // defensive re-attempt at unlocking Tone's audio context on every tap
        // here -- the very first attempt (on the Title button) can be
        // unreliable on iOS, and retrying on an already-running context is a
        // harmless no-op. NOT calling unlockSpeech() here anymore: it queues
        // its own speak() call, and if that primer utterance never cleanly
        // finishes, the real speakFlavor() call right after it gets stuck
        // waiting behind it in the queue forever -- unlockSpeech() only
        // needs to run once, on the Title screen, before any of this.
        Tone.start();
        // Phaser's sound manager has its own separate AudioContext from
        // Tone's -- explicitly nudge it to resume too, defensively, on
        // every tap (harmless no-op if it's already running)
        if (this.sound.context && this.sound.context.state !== 'running') {
          this.sound.context.resume();
        }

        // Music Mode: pure soundboard -- always just play the flavor sound,
        // never progress toward picking a color / entering the game
        if (this.musicMode) {
          playFlavorSound();
          return;
        }

        // off mode: a single tap picks this color and heads straight into
        // the game -- no flavor voice on the way in anymore
        this.registry.set('color', c.key);
        speakFlavor('ha ha ha', c.voice);
        music.playVehicleSpin();
        this.tweens.add({ targets: candy, angle: candy.angle + 720, duration: 500, ease: 'Cubic.easeInOut' });
        this.cameras.main.flash(200, 255, 255, 255);
        this.time.delayedCall(500, () => this.scene.start('VehicleSelect'));
      });

      this.tweens.add({
        targets: [candy, glow],
        y: '+=8',
        duration: 900 + i * 80,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }

  // rainbow-piano-styled toggle below the skittles -- grey/off by default,
  // full rainbow color when on. Doesn't touch the normal click-twice flow at
  // all; that branch just checks this.musicMode each tap.
  buildMusicModeToggle() {
    const toggleY = GAME_HEIGHT - 48;
    const trackW = 74, trackH = 30;
    const knobR = 13;
    const cornerR = trackH / 2;
    const labelGap = 14;

    const label = this.add.text(0, toggleY, 'MUSIC MODE', {
      fontFamily: '"Courier New", monospace',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#ffffff',
      letterSpacing: 1.5,
    }).setOrigin(1, 0.5).setStroke('#00000099', 3).setDepth(55);

    // label + switch centered together as a single unit, rather than the
    // switch alone sitting at screen-center with the label hanging off it
    const groupWidth = label.width + labelGap + trackW;
    const groupLeft = GAME_WIDTH / 2 - groupWidth / 2;
    label.x = groupLeft + label.width;
    const trackX = groupLeft + label.width + labelGap;
    const trackCenterX = trackX + trackW / 2;

    const trackG = this.add.graphics().setDepth(55);
    const knob = this.add.circle(trackX + knobR + 2, toggleY, knobR, 0xffffff)
      .setStrokeStyle(2, 0x2a0f4a).setDepth(56);

    const drawTrack = (on) => {
      trackG.clear();
      if (on) {
        // rainbow piano-key look: solid color bands, no divider lines --
        // just a clean gradient. Only the outer edge of the first/last band
        // gets rounded (matching the pill's own corner radius) so no square
        // band corner ever peeks out past the rounded track -- the middle
        // bands stay plain rects since they're fully interior.
        const bandColors = rainbowGradient(8);
        const bandW = trackW / bandColors.length;
        const top = toggleY - trackH / 2;
        bandColors.forEach((color, i) => {
          trackG.fillStyle(color, 1);
          const bx = trackX + i * bandW;
          const isFirst = i === 0;
          const isLast = i === bandColors.length - 1;
          if (isFirst || isLast) {
            trackG.fillRoundedRect(bx, top, bandW, trackH, {
              tl: isFirst ? cornerR : 0,
              bl: isFirst ? cornerR : 0,
              tr: isLast ? cornerR : 0,
              br: isLast ? cornerR : 0,
            });
          } else {
            trackG.fillRect(bx, top, bandW, trackH);
          }
        });
      } else {
        trackG.fillStyle(0x8a8a9a, 1);
        trackG.fillRoundedRect(trackX, toggleY - trackH / 2, trackW, trackH, cornerR);
      }
      trackG.lineStyle(2, 0x2a0f4a, 1);
      trackG.strokeRoundedRect(trackX, toggleY - trackH / 2, trackW, trackH, cornerR);
    };
    drawTrack(false);

    // shared so anything else (like tapping the header box) can flip Music
    // Mode too, not just the switch itself. No-ops if already in that state.
    this.setMusicMode = (on) => {
      if (this.musicMode === on) return;
      this.musicMode = on;
      this.pickColorText.setColor(on ? '#aaaaaa' : '#111111');
      drawTrack(on);
      this.tweens.add({
        targets: knob,
        x: on ? trackX + trackW - knobR - 2 : trackX + knobR + 2,
        duration: 180,
        ease: 'Cubic.easeOut',
      });
      this.setMusicIconsVisible(on);
      if (on) {
        Tone.start();
        music.playPianoToggle();
        this.spawnMusicNotes(trackCenterX, toggleY);
      }
    };

    const hitZone = this.add.zone(trackCenterX, toggleY, trackW + 14, trackH + 14)
      .setOrigin(0.5).setInteractive({ useHandCursor: true }).setDepth(57);
    hitZone.on('pointerdown', () => this.setMusicMode(!this.musicMode));
  }

  // a floating, sparkling instrument icon -- hidden and untappable until
  // Music Mode is switched on, then it plays its solo on tap
  buildInstrumentIcon(textureKey, x, y, onTap, appearDelay = 0) {
    const container = this.add.container(x, y).setAlpha(0).setVisible(false).setDepth(40);

    const icon = this.add.image(0, 0, textureKey).setScale(0.935);
    container.add(icon);

    for (let i = 0; i < 4; i++) {
      const spark = this.add.image(
        Phaser.Math.Between(-38, 38),
        Phaser.Math.Between(-38, 38),
        'sparkle'
      ).setScale(Phaser.Math.FloatBetween(0.35, 0.6))
        .setAlpha(Phaser.Math.FloatBetween(0.3, 0.7))
        .setTint(0xffffff);
      container.add(spark);
      this.tweens.add({
        targets: spark,
        alpha: 0.1,
        scale: spark.scale * 0.5,
        angle: 360,
        duration: Phaser.Math.Between(900, 1600),
        yoyo: true,
        repeat: -1,
        delay: Phaser.Math.Between(0, 1200),
        ease: 'Sine.easeInOut',
      });
    }

    // gentle float for the whole icon+sparkle group -- the tap zone below
    // stays put, same as the skittles' own hit circles do
    this.tweens.add({
      targets: container,
      y: '+=10',
      duration: 1600 + Phaser.Math.Between(0, 400),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // slight side-to-side rocking on the icon itself, layered on top of the
    // float, like it's swaying to its own solo
    icon.setAngle(-6);
    this.tweens.add({
      targets: icon,
      angle: 6,
      duration: 1100 + Phaser.Math.Between(0, 300),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    const hit = this.add.zone(x, y, 90, 90).setOrigin(0.5).setInteractive({ useHandCursor: true }).setVisible(false);
    hit.input.enabled = false;
    hit.on('pointerdown', () => {
      Tone.start();
      onTap();
      this.tweens.add({ targets: icon, scale: 1.045, duration: 90, yoyo: true, ease: 'Sine.easeInOut' });
    });

    this.musicIcons.push({ container, hit, appearDelay });
  }

  setMusicIconsVisible(on) {
    this.musicIcons.forEach(({ container, hit, appearDelay }) => {
      if (on) {
        container.setVisible(true);
        hit.setVisible(true);
        container.setScale(0.6);
        this.tweens.add({ targets: container, alpha: 1, scale: 1, duration: 260, delay: appearDelay, ease: 'Back.easeOut' });
        // tap zone comes alive once the icon has actually popped in, not
        // the instant the toggle is flipped
        this.time.delayedCall(appearDelay, () => { hit.input.enabled = true; });
      } else {
        hit.input.enabled = false;
        this.tweens.add({
          targets: container,
          alpha: 0,
          scale: 0.6,
          duration: 180,
          ease: 'Cubic.easeIn',
          onComplete: () => { container.setVisible(false); hit.setVisible(false); },
        });
      }
    });
  }

  // a little burst of music notes that rise and fade out -- fired once,
  // right as Music Mode is switched on
  spawnMusicNotes(x, y) {
    const glyphs = ['♪', '♫', '♬'];
    for (let i = 0; i < 6; i++) {
      const note = this.add.text(
        x + Phaser.Math.Between(-30, 30),
        y,
        Phaser.Utils.Array.GetRandom(glyphs),
        { fontFamily: 'Trebuchet MS, sans-serif', fontSize: `${Phaser.Math.Between(14, 20)}px`, color: '#ffffff' }
      ).setOrigin(0.5).setStroke('#2a0f4a', 3).setDepth(60).setAlpha(0.95);

      this.tweens.add({
        targets: note,
        y: note.y - Phaser.Math.Between(70, 110),
        x: note.x + Phaser.Math.Between(-25, 25),
        alpha: 0,
        angle: Phaser.Math.Between(-30, 30),
        duration: Phaser.Math.Between(700, 1100),
        delay: i * 40,
        ease: 'Cubic.easeOut',
        onComplete: () => note.destroy(),
      });
    }
  }

  popFlavorWord(x, y, word) {
    const t = this.add.text(x, y - 40, word, {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#ffffff',
    }).setOrigin(0.5).setStroke('#00000099', 4).setDepth(50);

    this.tweens.add({
      targets: t,
      y: y - 110,
      alpha: 0,
      duration: 1200,
      ease: 'Cubic.easeOut',
      onComplete: () => t.destroy(),
    });
    this.tweens.add({
      targets: t,
      x: x + 12,
      angle: 8,
      duration: 160,
      yoyo: true,
      repeat: 6,
      ease: 'Sine.easeInOut',
    });
  }

  buildSky() {
    for (let i = 0; i < 4; i++) {
      const cloud = this.add.image(
        Phaser.Math.Between(20, GAME_WIDTH - 20),
        Phaser.Math.Between(20, 640),
        'cloud'
      ).setAlpha(0.85).setScale(Phaser.Math.FloatBetween(0.7, 1.2));
      this.tweens.add({
        targets: cloud,
        x: cloud.x + Phaser.Math.Between(-20, 20),
        duration: 4000 + i * 500,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    }
  }
}
