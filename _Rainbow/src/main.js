import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './config.js';
import { music } from './audio.js';
import BootScene from './scenes/BootScene.js';
import TitleScene from './scenes/TitleScene.js';
import ColorSelectScene from './scenes/ColorSelectScene.js';
import VehicleSelectScene from './scenes/VehicleSelectScene.js';
import IntroScene from './scenes/IntroScene.js';
import GameScene from './scenes/GameScene.js';
import GameOverScene from './scenes/GameOverScene.js';

music.init();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'app',
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: '#4b7fd6',
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, TitleScene, ColorSelectScene, VehicleSelectScene, IntroScene, GameScene, GameOverScene],
});

// dev-only hook so texture/asset changes can be inspected directly from the
// console instead of guessing blind
window.__game = game;
