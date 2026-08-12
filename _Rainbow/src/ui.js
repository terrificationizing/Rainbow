import Phaser from 'phaser';
import { Y2K_UI, GAME_WIDTH, GAME_HEIGHT, SKITTLE_COLORS } from './config.js';

const RAINBOW_STOPS = [0xff3b3b, 0xff8c1a, 0xffdd1a, 0x3ddc5b, 0x2fa0ff, 0x9b3bff];

// Splits the rainbow into `count` thin solid-color slices that smoothly blend
// stop-to-stop, instead of `count` hard-edged bands. Built from plain lerped
// solid fills rather than Phaser's fillGradientStyle, since that gradient API
// doesn't reliably follow arbitrary fillPoints() quads (only rects) -- many
// thin solid slices is the reliable way to fake a smooth gradient here.
export function rainbowGradient(count) {
  const stops = RAINBOW_STOPS;
  const colors = [];
  for (let i = 0; i < count; i++) {
    const t = (i / (count - 1)) * (stops.length - 1);
    const i0 = Math.min(Math.floor(t), stops.length - 2);
    const f = t - i0;
    const a = stops[i0], b = stops[i0 + 1];
    const r = Math.round(((a >> 16) & 0xff) * (1 - f) + ((b >> 16) & 0xff) * f);
    const g = Math.round(((a >> 8) & 0xff) * (1 - f) + ((b >> 8) & 0xff) * f);
    const bl = Math.round((a & 0xff) * (1 - f) + (b & 0xff) * f);
    colors.push((r << 16) | (g << 8) | bl);
  }
  return colors;
}

// Soft lavender -> sky blue -> pink backdrop, drawn as two stacked gradients
// (Phaser's Graphics gradient only takes 4 corner colors, so two bands fake a 3-stop blend).
export function paintSky(scene) {
  const g = scene.add.graphics();
  const midY = GAME_HEIGHT * 0.5;
  g.fillGradientStyle(0xc39bf0, 0xc39bf0, 0x7ecbf5, 0x7ecbf5, 1);
  g.fillRect(0, 0, GAME_WIDTH, midY);
  g.fillGradientStyle(0x7ecbf5, 0x7ecbf5, 0xff9edc, 0xff9edc, 1);
  g.fillRect(0, midY, GAME_WIDTH, GAME_HEIGHT - midY);
  return g;
}

// Scatters `count` ring-planet skittles across a region, spaced apart (no two
// overlap) with no two placed back-to-back sharing a flavor. Returns the
// created containers so the caller can drive their own animation/drift.
export function scatterSkittlePlanets(scene, count, opts = {}) {
  const yMin = opts.yMin ?? 0;
  const yMax = opts.yMax ?? GAME_HEIGHT;
  const depth = opts.depth ?? 1;
  const placed = [];
  let lastColorKey = null;
  const planets = [];
  for (let i = 0; i < count; i++) {
    const scale = Phaser.Math.FloatBetween(0.5, 0.85);
    const alpha = Phaser.Math.FloatBetween(0.5, 0.75);
    const minDist = 90 * scale + 60;

    let x, y, tries = 0;
    do {
      x = Phaser.Math.Between(30, GAME_WIDTH - 30);
      y = Phaser.Math.Between(yMin, yMax);
      tries++;
    } while (tries < 20 && placed.some((p) => Phaser.Math.Distance.Between(x, y, p.x, p.y) < Math.max(minDist, p.minDist)));
    placed.push({ x, y, minDist });

    let c;
    do { c = Phaser.Utils.Array.GetRandom(SKITTLE_COLORS); } while (c.key === lastColorKey);
    lastColorKey = c.key;

    const ring = scene.add.graphics();
    ring.lineStyle(3, 0xffffff, 0.85);
    ring.strokeEllipse(0, 0, 100 * scale, 34 * scale);
    const planet = scene.add.image(0, 0, `candy_${c.key}`).setScale(scale);
    const container = scene.add.container(x, y, [ring, planet])
      .setDepth(depth).setAlpha(alpha).setAngle(Phaser.Math.Between(0, 360));
    planets.push(container);
  }
  return planets;
}

// Soft floating iridescent bubbles -- a translucent gradient-rim circle with a
// bright specular highlight, gently rising and swaying. Purely decorative.
export function scatterBubbles(scene, count, opts = {}) {
  const yMin = opts.yMin ?? 0;
  const yMax = opts.yMax ?? GAME_HEIGHT;
  const depth = opts.depth ?? 1;
  const palette = [0x9ee8ff, 0xff9ee8, 0xfff29e, 0xc79eff, 0xaef2c9];
  const bubbles = [];
  for (let i = 0; i < count; i++) {
    const r = Phaser.Math.Between(18, 46);
    const x = Phaser.Math.Between(r, GAME_WIDTH - r);
    const y = Phaser.Math.Between(yMin, yMax);
    const hue = Phaser.Utils.Array.GetRandom(palette);

    const g = scene.add.graphics().setPosition(x, y).setDepth(depth).setAlpha(0);
    g.fillStyle(hue, 0.16);
    g.fillCircle(0, 0, r);
    g.lineStyle(2, hue, 0.55);
    g.strokeCircle(0, 0, r);
    g.fillStyle(0xffffff, 0.55);
    g.fillEllipse(-r * 0.35, -r * 0.4, r * 0.5, r * 0.3);

    scene.tweens.add({ targets: g, alpha: 1, duration: 500, delay: Phaser.Math.Between(0, 600) });
    scene.tweens.add({
      targets: g,
      y: y - Phaser.Math.Between(40, 90),
      x: x + Phaser.Math.Between(-25, 25),
      duration: Phaser.Math.Between(3200, 5200),
      delay: Phaser.Math.Between(0, 1500),
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    bubbles.push(g);
  }
  return bubbles;
}

// True iridescent gradient, clipped to a rounded-rect region via a geometry mask.
// Use for LIVE scene graphics (windows, buttons) -- not baked textures, since masks
// aren't captured by generateTexture(). Must be called on objects already in `container`.
//
// Was originally a plain gradient rect clipped round via a GeometryMask, but
// stacking more than one GeometryMask in the same scene (e.g. a window's
// inset sheen plus its own button's sheen) runs into WebGL stencil-buffer
// bit exhaustion and silently truncates the gradient partway down. Drawing
// straight onto fillRoundedRect sidesteps masking entirely -- fillGradientStyle
// already works correctly on it directly (confirmed elsewhere in this file).
export function paintClippedGradient(scene, container, x, y, w, h, radius, alpha = 0.4) {
  const grad = scene.add.graphics();
  grad.fillGradientStyle(0x9ee8ff, 0xff9ee8, 0xfff29e, 0xc79eff, alpha);
  grad.fillRoundedRect(x, y, w, h, radius);
  container.add(grad);
  return grad;
}

// Diagonal gloss streaks for BAKED textures (vehicles) -- generateTexture() doesn't
// capture runtime masks, so this fakes a gradient sheen with soft angled bands instead
// of blobby ovals.
export function paintDiagonalSheen(g, x, y, w, h) {
  const bands = [
    { off: -0.15, c: 0xffffff, a: 0.4, bw: 0.16 },
    { off: 0.18, c: 0x9ee8ff, a: 0.22, bw: 0.14 },
    { off: 0.48, c: 0xff9ee8, a: 0.18, bw: 0.13 },
  ];
  bands.forEach(({ off, c, a, bw }) => {
    const cx = x + w * (0.5 + off);
    const bandW = w * bw;
    const skew = h * 0.4;
    g.fillStyle(c, a);
    g.fillPoints([
      { x: cx - bandW, y }, { x: cx + bandW, y },
      { x: cx + bandW - skew, y: y + h }, { x: cx - bandW - skew, y: y + h },
    ], true);
  });
}

// Small 4-point sparkle images scattered across a region, each gently twinkling.
export function scatterGlitter(scene, count, opts = {}) {
  const yMin = opts.yMin ?? 0;
  const yMax = opts.yMax ?? GAME_HEIGHT;
  const depth = opts.depth ?? 1;
  const tints = [0xffffff, 0xffe0fb, 0xe0f7ff, 0xfff6cf, 0xd8ffe6];
  for (let i = 0; i < count; i++) {
    const x = Phaser.Math.Between(6, GAME_WIDTH - 6);
    const y = Phaser.Math.Between(yMin, yMax);
    const baseScale = Phaser.Math.FloatBetween(0.3, 1.15);
    const s = scene.add.image(x, y, 'sparkle')
      .setDepth(depth)
      .setScale(baseScale)
      .setAlpha(Phaser.Math.FloatBetween(0.35, 0.85))
      .setAngle(Phaser.Math.Between(0, 360))
      .setTint(Phaser.Utils.Array.GetRandom(tints));
    scene.tweens.add({
      targets: s,
      alpha: 0.1,
      scale: baseScale * 0.55,
      angle: s.angle + 40,
      duration: Phaser.Math.Between(700, 1700),
      yoyo: true,
      repeat: -1,
      delay: Phaser.Math.Between(0, 1600),
      ease: 'Sine.easeInOut',
    });
  }
}

// A little Y2K-glitch easter egg shown whenever a window's X is tapped: a small teal
// iridescent tooltip box that pops up near the button.
const CLOSE_MESSAGES = [
  'when you close your heart,\nyou close your mind',
  'One does not simply…\nclose this pop up.',
  "Don't be a quitter.",
];
let lastCloseMessageIdx = -1;

export function showCloseMessage(scene, nearX, nearY) {
  let idx = Phaser.Math.Between(0, CLOSE_MESSAGES.length - 1);
  if (idx === lastCloseMessageIdx) idx = (idx + 1) % CLOSE_MESSAGES.length;
  lastCloseMessageIdx = idx;
  const message = CLOSE_MESSAGES[idx];
  const boxW = 280;
  const boxH = 62;
  const x = Phaser.Math.Clamp(nearX - boxW + 14, 8, GAME_WIDTH - boxW - 8);
  const y = Phaser.Math.Clamp(nearY + 12, 8, GAME_HEIGHT - boxH - 8);

  const container = scene.add.container(x, y).setDepth(1000).setAlpha(0).setScale(0.85);

  const box = scene.add.graphics();
  box.fillStyle(0x0f9e94, 1);
  box.fillRoundedRect(0, 0, boxW, boxH, 10);
  container.add(box);

  paintClippedGradient(scene, container, 0, 0, boxW, boxH, 10, 0.5);

  const outline = scene.add.graphics();
  outline.lineStyle(2, 0x0a6e66, 1);
  outline.strokeRoundedRect(0, 0, boxW, boxH, 10);
  container.add(outline);

  const label = scene.add.text(boxW / 2, boxH / 2, message, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: '18px',
    fontStyle: 'bold',
    align: 'center',
    color: '#ffffff',
  }).setOrigin(0.5);

  container.add(label);

  scene.tweens.add({
    targets: container,
    alpha: 1,
    scale: 1,
    duration: 200,
    ease: 'Back.easeOut',
    onComplete: () => {
      scene.tweens.add({
        targets: container,
        delay: 1100,
        alpha: 0,
        y: y - 10,
        duration: 400,
        onComplete: () => container.destroy(),
      });
    },
  });
}

// Scale factor that makes a vehicle texture render at a consistent height regardless of
// its native art size (the boot/deck/floppy textures are all different pixel dimensions).
export function vehicleScale(scene, texKey, targetHeight) {
  return targetHeight / scene.textures.get(texKey).getSourceImage().height;
}

// Candy sprite with a bold "S" mark, bundled as a container so it moves as one unit.
export function createCandy(scene, x, y, colorKey, scale = 1) {
  const container = scene.add.container(x, y);
  const sprite = scene.add.image(0, 0, `candy_${colorKey}`).setScale(scale);
  const mark = scene.add.text(0, 1 * scale, 'S', {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: `${Math.round(26 * scale)}px`,
    fontStyle: 'bold',
    color: '#ffffff',
  }).setOrigin(0.5).setStroke('#00000055', 2);
  container.add([sprite, mark]);
  container.sprite = sprite;
  return container;
}

// Draws a rounded Y2K window: violet-to-pink gradient title bar, lavender body.
// Returns a container; body content can be added at local (0, titleH) and below.
export function createWindow(scene, x, y, w, h, title, opts = {}) {
  const titleH = opts.titleH ?? 34;
  const radius = opts.radius ?? 10;
  const container = scene.add.container(x, y);

  const shadow = scene.add.graphics();
  shadow.fillStyle(Y2K_UI.shadow, 0.35);
  shadow.fillRoundedRect(6, 6, w, h, radius);

  const body = scene.add.graphics();
  body.fillStyle(Y2K_UI.chromeMid, 1);
  body.fillRoundedRect(0, 0, w, h, radius);
  body.lineStyle(3, 0x2a0f4a, 1);
  body.strokeRoundedRect(0, 0, w, h, radius);

  const insetX = 4, insetY = titleH + 4, insetW = w - 8, insetH = h - titleH - 8;
  const inset = scene.add.graphics();
  inset.fillStyle(Y2K_UI.chromeLight, 1);
  inset.fillRoundedRect(insetX, insetY, insetW, insetH, radius - 4);

  container.add([shadow, body, inset]);
  paintClippedGradient(scene, container, insetX, insetY, insetW, insetH, radius - 4, 0.4);

  const insetOutline = scene.add.graphics();
  insetOutline.lineStyle(2, Y2K_UI.chromeDark, 1);
  insetOutline.strokeRoundedRect(insetX, insetY, insetW, insetH, radius - 4);
  container.add(insetOutline);

  const barFrom = opts.titleBarFrom ?? Y2K_UI.titleBarFrom;
  const barTo = opts.titleBarTo ?? Y2K_UI.titleBarTo;
  const titleBar = scene.add.graphics();
  titleBar.fillGradientStyle(barFrom, barTo, barFrom, barTo, 1);
  titleBar.fillRoundedRect(3, 3, w - 6, titleH - 3, { tl: radius - 3, tr: radius - 3, bl: 0, br: 0 });

  const titleText = scene.add.text(12, 3 + (titleH - 3) / 2, title, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize: '15px',
    fontStyle: 'bold',
    color: opts.titleTextColor ?? '#ffffff',
  }).setOrigin(0, 0.5);

  const closeBtn = scene.add.graphics();
  closeBtn.fillStyle(Y2K_UI.chromeLight, 1);
  closeBtn.fillRoundedRect(w - 30, 3 + (titleH - 3) / 2 - 8, 16, 16, 4);
  closeBtn.lineStyle(2, 0x2a0f4a, 1);
  closeBtn.strokeRoundedRect(w - 30, 3 + (titleH - 3) / 2 - 8, 16, 16, 4);
  const closeX = scene.add.text(w - 22, 3 + (titleH - 3) / 2, 'x', {
    fontFamily: 'monospace', fontSize: '12px', fontStyle: 'bold', color: '#2a0f4a',
  }).setOrigin(0.5);

  const closeHit = scene.add.zone(w - 22, 3 + (titleH - 3) / 2, 22, 22)
    .setOrigin(0.5)
    .setInteractive({ useHandCursor: true });
  closeHit.on('pointerdown', (pointer, lx, ly, event) => {
    event?.stopPropagation();
    const wt = new Phaser.GameObjects.Components.TransformMatrix();
    closeHit.getWorldTransformMatrix(wt);
    showCloseMessage(scene, wt.tx, wt.ty);
  });

  container.add([titleBar, titleText, closeBtn, closeX, closeHit]);
  container.titleH = titleH;
  return container;
}

// Rounded chunky button with label, returns container with a hit zone.
export function createButton(scene, x, y, w, h, label, opts = {}) {
  const fontSize = opts.fontSize ?? '18px';
  const fill = opts.fill ?? Y2K_UI.chromeLight;
  const fillHover = opts.fillHover ?? 0xffffff;
  const radius = opts.radius ?? h / 2;
  const container = scene.add.container(x, y);

  const shadow = scene.add.graphics();
  shadow.fillStyle(0x000000, 0.25);
  shadow.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w, h, radius);

  // Base fill is redrawn on hover; the gradient sheen and outline are static layers
  // on top so hovering doesn't leak new masked graphics objects each time.
  const top = scene.add.graphics();
  const drawTop = (color) => {
    top.clear();
    if (opts.gradientFrom) {
      top.fillGradientStyle(opts.gradientFrom, opts.gradientTo, opts.gradientFrom, opts.gradientTo, 1);
    } else {
      top.fillStyle(color, 1);
    }
    top.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
  };
  drawTop(fill);
  container.add([shadow, top]);
  paintClippedGradient(scene, container, -w / 2, -h / 2, w, h, radius, opts.gradientFrom ? 0.22 : 0.45);

  const outline = scene.add.graphics();
  outline.lineStyle(3, opts.outlineColor ?? 0x2a0f4a, 1);
  outline.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  container.add(outline);

  const label_ = scene.add.text(0, 0, label, {
    fontFamily: 'Trebuchet MS, sans-serif',
    fontSize,
    fontStyle: 'bold',
    color: opts.color ?? '#111111',
    letterSpacing: opts.letterSpacing ?? 0,
  }).setOrigin(0.5);

  container.add(label_);
  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
  container.add(hit);

  hit.on('pointerover', () => drawTop(fillHover));
  hit.on('pointerout', () => drawTop(fill));
  hit.on('pointerdown', () => container.setScale(0.95));
  hit.on('pointerup', () => container.setScale(1));

  container.hitZone = hit;
  return container;
}

// Small sideways tab on the left edge, present on every screen except Title and
// GameOver, that bails out of the run back to the title screen. Styled like a
// physical keyboard keycap: a darker "well" peeking out from behind a raised
// top face, rather than the usual pill button.
export function createEscButton(scene) {
  // note: the button is rotated -90deg below, so `w` here becomes the button's
  // on-screen *height* (the direction the text reads), and `h` becomes its
  // on-screen thickness -- taller-looking means a bigger w, not a bigger h
  const w = 150, h = 30, radius = 6;
  const container = scene.add.container(24, GAME_HEIGHT / 2);

  // the key's side wall, offset down so the top face reads as raised above it
  const base = scene.add.graphics();
  base.fillStyle(0x93aec4, 1);
  base.fillRoundedRect(-w / 2, -h / 2 + 4, w, h, radius);
  base.lineStyle(2, 0x5f7d94, 1);
  base.strokeRoundedRect(-w / 2, -h / 2 + 4, w, h, radius);

  const top = scene.add.graphics();
  const drawTop = (color) => {
    top.clear();
    top.fillStyle(color, 1);
    top.fillRoundedRect(-w / 2, -h / 2, w, h, radius);
    // inner bevel highlight along one edge, like light catching the key face
    top.fillStyle(0xffffff, 0.6);
    top.fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.38, radius - 2);
    top.lineStyle(2, 0x6f8fae, 1);
    top.strokeRoundedRect(-w / 2, -h / 2, w, h, radius);
  };
  drawTop(0xeaf5ff);
  container.add([base, top]);

  const label = scene.add.text(0, 0, 'ESC THE RAINBOW', {
    fontFamily: '"Courier New", monospace',
    fontSize: '11px',
    fontStyle: 'bold',
    color: '#2a4f6e',
    letterSpacing: 1.5,
  }).setOrigin(0.5);
  container.add(label);

  container.setSize(w, h);
  const hit = scene.add.zone(0, 0, w, h).setOrigin(0.5).setInteractive({ useHandCursor: true });
  container.add(hit);

  hit.on('pointerover', () => drawTop(0xffffff));
  hit.on('pointerout', () => drawTop(0xeaf5ff));
  // pressed-key feel: the top face drops down to meet the base, like a real keypress
  hit.on('pointerdown', () => { top.y = 3; label.y = 3; });
  hit.on('pointerup', () => { top.y = 0; label.y = 0; });

  container.hitZone = hit;
  container.setAngle(-90);
  container.setDepth(500);
  hit.on('pointerdown', () => {
    scene.cameras.main.flash(200, 255, 255, 255);
    scene.time.delayedCall(150, () => scene.scene.start('Title'));
  });
  return container;
}
