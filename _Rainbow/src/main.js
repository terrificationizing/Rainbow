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
    // ENVELOP scales up to fully COVER the viewport (cropping slight overflow
    // on aspect-ratio mismatches) instead of FIT's letterboxing, which left
    // visible flat-color bars around the game on phones whose screen aspect
    // ratio doesn't exactly match GAME_WIDTH:GAME_HEIGHT
    mode: Phaser.Scale.ENVELOP,
    // centering is handled by #app's flexbox in style.css -- Phaser's own
    // CENTER_BOTH also injects a margin-left on the canvas, and the two
    // centering methods stack, shoving the canvas off to the right
    autoCenter: Phaser.Scale.NO_CENTER,
  },
  scene: [BootScene, TitleScene, ColorSelectScene, VehicleSelectScene, IntroScene, GameScene, GameOverScene],
});

// dev-only hook so texture/asset changes can be inspected directly from the
// console instead of guessing blind
window.__game = game;

// Mobile Safari's address bar/toolbar shows and hides dynamically, and
// window.innerWidth/innerHeight don't always update reliably or immediately
// when that happens -- window.visualViewport is the API built specifically
// to report the REAL currently-visible area, so drive Phaser's resize off
// that instead of trusting the window size alone.
if (window.visualViewport) {
  const syncToVisualViewport = () => {
    game.scale.resize(window.visualViewport.width, window.visualViewport.height);
  };
  window.visualViewport.addEventListener('resize', syncToVisualViewport);
  window.visualViewport.addEventListener('scroll', syncToVisualViewport);
}
