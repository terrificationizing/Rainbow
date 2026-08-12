import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config.js';
import { createWindow, createButton, createCandy } from '../ui.js';
import { music } from '../audio.js';

export default class GameOverScene extends Phaser.Scene {
  constructor() {
    super('GameOver');
  }

  create() {
    this.cameras.main.setBackgroundColor('#2a1a4a');
    music.setMood('sad');

    const score = this.registry.get('score') || 0;
    const colorKey = this.registry.get('color') || 'red';
    const deathReason = this.registry.get('deathReason');

    const winY = 190;
    const winH = 400;
    createWindow(this, 32, winY, GAME_WIDTH - 64, winH, 'crashout.exe');

    const messages = {
      head: 'IT ATE YOU!\nGAME OVER',
      wipeout: 'YOU FELL OFF\nTHE RAINBOW',
      logguy: "SHOULDN'T HAVE\nCLICKED THAT",
      inactive: 'STILL THERE?\nGAME OVER',
      meter: 'YOUR COLOR\nRAN OUT',
    };
    const message = messages[deathReason] ?? messages.meter;
    this.add.text(GAME_WIDTH / 2, winY + 78, message, {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '24px',
      fontStyle: 'bold',
      align: 'center',
      color: '#000000',
    }).setOrigin(0.5);

    // the same skittle, cracked and patched up with a bandaid
    const candy = createCandy(this, GAME_WIDTH / 2, winY + 180, colorKey, 1.3);

    const crack = this.add.graphics();
    crack.lineStyle(2, 0xffffff, 0.85);
    crack.beginPath();
    crack.moveTo(-15, -12);
    crack.lineTo(-4, -1);
    crack.lineTo(-11, 7);
    crack.lineTo(1, 16);
    crack.strokePath();
    candy.add(crack);

    const bandaid = this.add.graphics();
    bandaid.fillStyle(0xf0d9b5, 1);
    bandaid.fillRoundedRect(-19, -6, 38, 12, 4);
    bandaid.lineStyle(1.5, 0xc9a876, 1);
    bandaid.strokeRoundedRect(-19, -6, 38, 12, 4);
    bandaid.fillStyle(0xddc19c, 0.9);
    bandaid.fillRect(-4, -5, 8, 10);
    bandaid.setAngle(-28);
    candy.add(bandaid);

    this.add.text(GAME_WIDTH / 2, winY + 270, `SCORE: ${score}`, {
      fontFamily: 'Trebuchet MS, sans-serif',
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#111111',
    }).setOrigin(0.5);

    const btn = createButton(this, GAME_WIDTH / 2, winY + 330, 200, 54, 'RIDE AGAIN', {
      gradientFrom: 0x8a2be2,
      gradientTo: 0xff4fd8,
      color: '#ffffff',
      fontSize: '18px',
    });
    btn.hitZone.on('pointerdown', () => {
      music.playBloop();
      this.cameras.main.flash(200, 255, 255, 255);
      this.time.delayedCall(150, () => this.scene.start('Title'));
    });
  }
}
