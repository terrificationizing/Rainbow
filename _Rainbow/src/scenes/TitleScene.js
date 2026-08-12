import Phaser from 'phaser';
import * as Tone from 'tone';
import { GAME_WIDTH } from '../config.js';
import { createWindow, createButton, paintSky, scatterGlitter } from '../ui.js';
import { music } from '../audio.js';
import { unlockSpeech } from '../speech.js';

export default class TitleScene extends Phaser.Scene {
  constructor() {
    super('Title');
  }

  create() {
    music.setMood('normal');
    paintSky(this);

    for (let i = 0; i < 4; i++) {
      this.add.image(
        Phaser.Math.Between(20, GAME_WIDTH - 20),
        Phaser.Math.Between(20, 640),
        'cloud'
      ).setAlpha(0.85);
    }
    scatterGlitter(this, 32);

    const winW = GAME_WIDTH - 60;
    const winH = 226;
    const winX = (GAME_WIDTH - winW) / 2;
    const winY = 230;
    this.winBottomY = winY + winH;

    createWindow(this, winX, winY, winW, winH, 'SKITTLES.COM');

    this.add.text(GAME_WIDTH / 2, winY + 90, 'Rainbow.exe', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '32px',
      fontStyle: 'bold',
      color: '#1a1a2a',
    }).setOrigin(0.5);

    // rainbow segmented loading bar
    const barW = winW - 60;
    const barX = GAME_WIDTH / 2 - barW / 2;
    const barY = winY + 140;
    const barH = 22;
    const track = this.add.graphics();
    track.fillStyle(0xffffff, 1);
    track.fillRoundedRect(barX, barY, barW, barH, 4);
    track.lineStyle(2, 0x8888a0, 1);
    track.strokeRoundedRect(barX, barY, barW, barH, 4);

    const barColors = [0xff5b5b, 0xff9e4a, 0xffe14a, 0x6be86b, 0x4ac9ff, 0x9e6bff, 0xff6be0];
    const segCount = 26;
    const segW = barW / segCount;
    const stripes = this.add.graphics();
    for (let i = 0; i < segCount; i++) {
      stripes.fillStyle(barColors[i % barColors.length], 1);
      stripes.fillRect(barX + i * segW + 1, barY + 2, segW - 2, barH - 4);
    }
    const stripesMaskG = this.add.graphics().setPosition(0, 0).setVisible(false);
    stripesMaskG.fillStyle(0xffffff, 1);
    const revealW = { v: 0 };
    const redrawMask = () => {
      stripesMaskG.clear();
      stripesMaskG.fillStyle(0xffffff, 1);
      stripesMaskG.fillRect(barX, barY, revealW.v, barH);
    };
    redrawMask();
    stripes.setMask(new Phaser.Display.Masks.GeometryMask(this, stripesMaskG));

    const loadingText = this.add.text(GAME_WIDTH / 2, barY + barH + 24, 'LOADING...', {
      fontFamily: 'monospace',
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#2a0f4a',
    }).setOrigin(0.5);

    // only actually audible on repeat visits to Title -- a cold first load
    // can't play any audio yet since the browser hasn't seen a user gesture
    music.playLoadingSound();

    this.tweens.add({
      targets: revealW,
      v: barW,
      duration: 1400,
      ease: 'Cubic.easeOut',
      onUpdate: redrawMask,
      onComplete: () => this.showTaglineAndPrompt(loadingText),
    });
  }

  showTaglineAndPrompt(loadingText) {
    loadingText.setText('READY!');

    const btn = createButton(this, GAME_WIDTH / 2, this.winBottomY + 90, 240, 66, 'SURF THE RAINBOW', {
      gradientFrom: 0x8a2be2,
      gradientTo: 0xff4fd8,
      color: '#ffffff',
      fontSize: '18px',
    });
    btn.setScale(0).setAlpha(0);
    this.tweens.add({
      targets: btn,
      alpha: 1,
      scale: 1,
      duration: 400,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({ targets: btn, scale: 1.1, duration: 550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      },
    });

    btn.hitZone.on('pointerdown', () => {
      // the earliest real tap in the whole game -- registers speech synthesis
      // as gesture-approved before ColorSelectScene ever needs speakFlavor().
      // Tone.start() is also called defensively here (music.init() already
      // tries it on the page's very first pointerdown) since that first
      // attempt can be unreliable on iOS -- calling it again on an already-
      // running context is a harmless no-op, so extra attempts only help.
      unlockSpeech();
      Tone.start();
      music.playBloop();
      this.cameras.main.flash(200, 255, 255, 255);
      this.time.delayedCall(150, () => this.scene.start('ColorSelect'));
    });
  }
}
