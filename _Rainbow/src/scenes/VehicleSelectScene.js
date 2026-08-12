import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, VEHICLES } from '../config.js';
import { createWindow, vehicleScale, paintSky, scatterGlitter, createEscButton } from '../ui.js';
import { music } from '../audio.js';

const TEX = {
  surfboard: 'veh_surfboard',
  hoverboard: 'veh_hoverboard',
  rollerblade: 'veh_rollerblade',
  floppy: 'veh_floppy',
};

export default class VehicleSelectScene extends Phaser.Scene {
  constructor() {
    super('VehicleSelect');
  }

  create() {
    paintSky(this);
    scatterGlitter(this, 26);
    createEscButton(this);

    createWindow(this, 22, 70, GAME_WIDTH - 44, 110, 'ZOOOOOOM');
    this.add.text(GAME_WIDTH / 2, 70 + 70, 'CHOOSE YOUR VEHICLE', {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#111111',
    }).setOrigin(0.5);

    const startY = 300;
    const gap = 180;

    const panelW = GAME_WIDTH - 60;
    const panelH = 150;
    const panelRadius = 16;

    VEHICLES.forEach((v, i) => {
      const y = startY + i * gap;
      const panelG = this.add.graphics();
      const drawPanel = (alpha) => {
        panelG.clear();
        panelG.fillStyle(0xffffff, alpha);
        panelG.fillRoundedRect(GAME_WIDTH / 2 - panelW / 2, y - panelH / 2, panelW, panelH, panelRadius);
        panelG.lineStyle(2, 0xffffff, 0.5);
        panelG.strokeRoundedRect(GAME_WIDTH / 2 - panelW / 2, y - panelH / 2, panelW, panelH, panelRadius);
      };
      drawPanel(0.15);

      const baseScale = vehicleScale(this, TEX[v.key], (v.key === 'hoverboard' || v.key === 'surfboard') ? 46 : 88);
      const img = this.add.image(GAME_WIDTH / 2, y - 10, TEX[v.key]).setScale(baseScale);

      if (v.key === 'hoverboard') {
        const glow = this.add.ellipse(GAME_WIDTH / 2, y + 16, 90, 16, 0xc79eff, 0.5);
        this.tweens.add({
          targets: glow,
          scaleX: 1.25,
          scaleY: 0.7,
          alpha: 0.25,
          duration: 700,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }
      const label = this.add.text(GAME_WIDTH / 2, y + 55, v.label, {
        fontFamily: 'Trebuchet MS, sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#6a1fb0',
      }).setOrigin(0.5).setStroke('#ffffff', 3);

      const panel = this.add.zone(GAME_WIDTH / 2, y, panelW, panelH)
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      panel.on('pointerover', () => {
        drawPanel(0.3);
        this.tweens.add({ targets: img, scale: baseScale * 1.12, duration: 120 });
      });
      panel.on('pointerout', () => {
        drawPanel(0.15);
        this.tweens.add({ targets: img, scale: baseScale, duration: 120 });
      });
      panel.on('pointerdown', () => {
        if (this.picking) return;
        this.picking = true;
        this.registry.set('vehicle', v.key);
        this.tweens.killTweensOf(img);
        music.playVehicleSpin();

        // flip in place before moving on
        this.tweens.add({
          targets: img,
          angle: img.angle + 360,
          scale: baseScale * 1.3,
          duration: 550,
          ease: 'Cubic.easeInOut',
          onComplete: () => {
            this.cameras.main.flash(200, 255, 255, 255);
            this.time.delayedCall(150, () => this.scene.start('Intro'));
          },
        });
      });

      this.tweens.add({
        targets: img,
        y: img.y - 8,
        duration: 1000 + i * 100,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    });
  }
}
