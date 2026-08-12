import Phaser from 'phaser';
import * as Tone from 'tone';
import { GAME_WIDTH, SKITTLE_COLORS } from '../config.js';
import { createWindow, createCandy, paintSky, scatterGlitter, createEscButton } from '../ui.js';
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
    this.add.text(22 + (GAME_WIDTH - 44) / 2, 70 + 58, 'PICK A COLOR', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#111111',
    }).setOrigin(0.5);
    this.add.text(22 + (GAME_WIDTH - 44) / 2, 70 + 78, 'CLICK TWICE!', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#6a1fb0',
    }).setOrigin(0.5);

    // single centered column, original candy size
    const centerX = GAME_WIDTH / 2;
    const startY = 280;
    const gap = 125;
    const candyScale = 1.3;

    this.clickCounts = {};

    SKITTLE_COLORS.forEach((c, i) => {
      const x = centerX;
      const y = startY + i * gap;

      const glow = this.add.circle(x, y, 46 * (candyScale / 1.3), c.hex, 0.25);
      const candy = createCandy(this, x, y, c.key, candyScale);

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

        // whichever skittle is the first to reach two clicks wins, even if other
        // skittles were clicked in between
        this.clickCounts[c.key] = (this.clickCounts[c.key] || 0) + 1;
        if (this.clickCounts[c.key] >= 2) {
          this.registry.set('color', c.key);
          speakFlavor('ha ha ha', c.voice);
          music.playVehicleSpin();
          this.tweens.add({ targets: candy, angle: candy.angle + 720, duration: 500, ease: 'Cubic.easeInOut' });
          this.cameras.main.flash(200, 255, 255, 255);
          this.time.delayedCall(500, () => this.scene.start('VehicleSelect'));
          return;
        }
        this.sound.play(`flavor_${c.flavor}`);
        this.popFlavorWord(x, y, c.flavor);
        // the candy itself stays the same size -- it glows instead of enlarging
        this.tweens.add({ targets: glow, alpha: 0.8, scale: 1.4, duration: 220, yoyo: true, repeat: 2 });
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
