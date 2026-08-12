import Phaser from 'phaser';
import { SKITTLE_COLORS } from '../config.js';
import { paintDiagonalSheen } from '../ui.js';

function makeTex(scene, key, w, h, drawFn) {
  const g = scene.add.graphics();
  drawFn(g, w, h);
  g.generateTexture(key, w, h);
  g.destroy();
}

function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y, xj = poly[j].x, yj = poly[j].y;
    const hit = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
    if (hit) inside = !inside;
  }
  return inside;
}

// Rasterizes a polygon onto a CELL-sized pixel grid within [x0,y0,w,h], auto-
// detecting edge cells (any cell touching a non-filled neighbor) to paint as
// a stepped pixel-art outline. colorFn(px, py) picks the interior fill color
// per cell so a shape can be sub-regioned (e.g. body vs. belly vs. highlight).
function rasterizePoly(g, poly, { x0 = 0, y0 = 0, w, h, cell = 4, outline = 0x111114, colorFn }) {
  const cols = Math.ceil(w / cell), rows = Math.ceil(h / cell);
  const inside = new Uint8Array(cols * rows);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      const cx = x0 + gx * cell + cell / 2, cy = y0 + gy * cell + cell / 2;
      if (pointInPoly(cx, cy, poly)) inside[gy * cols + gx] = 1;
    }
  }
  const at = (gx, gy) => (gx < 0 || gy < 0 || gx >= cols || gy >= rows ? 0 : inside[gy * cols + gx]);
  for (let gy = 0; gy < rows; gy++) {
    for (let gx = 0; gx < cols; gx++) {
      if (!at(gx, gy)) continue;
      const px = x0 + gx * cell, py = y0 + gy * cell;
      const edge = !at(gx - 1, gy) || !at(gx + 1, gy) || !at(gx, gy - 1) || !at(gx, gy + 1);
      g.fillStyle(edge ? outline : colorFn(px + cell / 2, py + cell / 2), 1);
      g.fillRect(px, py, cell, cell);
    }
  }
}

export default class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload() {
    // real vector art, rasterized at load time -- replaces the hand-built
    // procedural textures below
    this.load.svg('dolphin', 'dolphin.svg', { width: 216, height: 216 });
    this.load.svg('obs_logguy', 'tung.svg', { width: 130, height: 130 });
    this.load.svg('obs_tree', 'tree.svg', { width: 200, height: 200 });
    // wrapper.svg's actual artwork (torn red top edge, built-in shadow, and
    // rainbow peeking out) is a ~446x278 region within its viewBox -- loaded a
    // lot wider than the rainbow track itself (348px at its base) so the track
    // visibly emerges from the wrapper rather than poking out past its edges,
    // at that same aspect ratio rather than stretched
    this.load.svg('bag', 'wrapper.svg', { width: 720, height: 449 });
  }

  create() {
    this.buildCandyTextures();
    this.buildVehicleTextures();
    this.buildObstacleTextures();
    this.buildMiscTextures();
    this.scene.start('Title');
  }

  buildCandyTextures() {
    SKITTLE_COLORS.forEach(({ key, hex, dark }) => {
      makeTex(this, `candy_${key}`, 64, 64, (g) => {
        // layered drop shadow
        g.fillStyle(0x000000, 0.1);
        g.fillEllipse(33, 57, 44, 11);
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(32, 55, 36, 8);

        // dark base rim, then the main body shifted up so a rim of shadow shows below
        g.fillStyle(dark, 1);
        g.fillCircle(32, 32, 28);
        g.fillStyle(hex, 1);
        g.fillCircle(32, 29, 26);

        // ambient occlusion band hugging the lower inside edge
        g.fillStyle(0x000000, 0.16);
        g.fillEllipse(32, 42, 34, 15);

        // broad soft highlight + tight specular glint
        g.fillStyle(0xffffff, 0.4);
        g.fillEllipse(22, 19, 20, 12);
        g.fillStyle(0xffffff, 0.9);
        g.fillCircle(19, 16, 4);

        // thin rim light opposite the shadow
        g.lineStyle(2, 0xffffff, 0.35);
        g.beginPath();
        g.arc(32, 29, 25, Phaser.Math.DegToRad(-65), Phaser.Math.DegToRad(15));
        g.strokePath();

        g.lineStyle(2.5, dark, 0.7);
        g.strokeCircle(32, 29, 26);
      });
    });
  }

  buildVehicleTextures() {
    // Skateboard-deck silhouette, side profile with kicktails at both ends -- no wheels,
    // it hovers on a glowing energy trail instead.
    // Thin flat deck with sharp kicktails at both ends -- reads as a skateboard, not
    // a rounded pill -- and no wheels, since it hovers.
    makeTex(this, 'veh_hoverboard', 140, 50, (g) => {
      const top = [
        { x: 8, y: 28 }, { x: 24, y: 15 }, { x: 116, y: 15 }, { x: 132, y: 28 },
      ];
      const bottom = [
        { x: 132, y: 35 }, { x: 116, y: 25 }, { x: 24, y: 25 }, { x: 8, y: 35 },
      ];
      const deck = [...top, ...bottom];

      g.fillStyle(0xece7f8, 1);
      g.fillPoints(deck, true);
      paintDiagonalSheen(g, 16, 15, 108, 13);
      g.lineStyle(3, 0x2a0f4a, 1);
      g.strokePoints(deck, true);

      // grip-tape hint + specular streak
      g.lineStyle(1, 0x2a0f4a, 0.25);
      for (let i = 0; i < 6; i++) {
        const lx = 30 + i * 13;
        g.beginPath();
        g.moveTo(lx, 16);
        g.lineTo(lx + 5, 21);
        g.strokePath();
      }
      g.fillStyle(0xffffff, 0.55);
      g.fillEllipse(45, 18, 40, 4);
    });

    // Inline skate, side profile: two-piece boot (lower shell + separate ankle cuff with
    // pull tab), buckle, laces, ankle pivot rivet, and a 4-wheel frame.
    makeTex(this, 'veh_rollerblade', 150, 128, (g) => {
      const shell = [
        { x: 20, y: 78 }, { x: 15, y: 62 }, { x: 17, y: 46 }, { x: 26, y: 35 },
        { x: 40, y: 29 }, { x: 55, y: 27 }, { x: 70, y: 28 }, { x: 85, y: 31 },
        { x: 100, y: 37 }, { x: 115, y: 47 }, { x: 126, y: 59 }, { x: 129, y: 70 },
        { x: 123, y: 78 },
      ];
      g.fillStyle(0xece7f8, 1);
      g.fillPoints(shell, true);
      paintDiagonalSheen(g, 25, 32, 100, 46);
      g.lineStyle(3, 0x2a0f4a, 1);
      g.strokePoints(shell, true);

      // ankle cuff (separate upper piece)
      const cuff = [
        { x: 26, y: 35 }, { x: 24, y: 16 }, { x: 30, y: 7 }, { x: 43, y: 4 },
        { x: 55, y: 8 }, { x: 59, y: 20 }, { x: 57, y: 35 },
      ];
      g.fillStyle(0xdcd4f2, 1);
      g.fillPoints(cuff, true);
      paintDiagonalSheen(g, 25, 7, 34, 26);
      g.lineStyle(3, 0x2a0f4a, 1);
      g.strokePoints(cuff, true);

      // pull-tab loop
      g.lineStyle(3, 0x2a0f4a, 1);
      g.strokeRoundedRect(28, 1, 12, 14, 5);

      // buckle strap across the cuff
      g.fillStyle(0xa9d8dc, 1);
      g.fillRoundedRect(24, 30, 34, 11, 4);
      g.lineStyle(2, 0x2a0f4a, 1);
      g.strokeRoundedRect(24, 30, 34, 11, 4);
      g.fillStyle(0x7c8a92, 1);
      g.fillRect(48, 32, 7, 7);

      // laces along the vamp
      g.lineStyle(2, 0xf3c2d0, 1);
      for (let i = 0; i < 4; i++) {
        const lx = 62 + i * 9;
        g.beginPath(); g.moveTo(lx, 30); g.lineTo(lx + 11, 45); g.strokePath();
        g.beginPath(); g.moveTo(lx + 11, 30); g.lineTo(lx, 45); g.strokePath();
      }

      // ankle pivot rivet
      g.fillStyle(0xfff29e, 1);
      g.fillCircle(30, 46, 5);
      g.lineStyle(2, 0x2a0f4a, 1);
      g.strokeCircle(30, 46, 5);

      // sole + struts down to the frame
      g.fillStyle(0x4a3f66, 1);
      g.fillRect(24, 77, 100, 4);
      g.fillRect(36, 81, 6, 9);
      g.fillRect(70, 81, 6, 9);
      g.fillRect(104, 81, 6, 9);

      // frame rail with four evenly spaced wheels
      g.fillStyle(0xe6b8bc, 1);
      g.fillRoundedRect(18, 90, 112, 10, 3);
      g.lineStyle(2, 0x2a0f4a, 1);
      g.strokeRoundedRect(18, 90, 112, 10, 3);

      const wheelXs = [34, 62, 90, 118];
      const wheelHues = [0xff3b3b, 0xffdd1a, 0x9b3bff, 0x3ddc5b];
      wheelXs.forEach((wx, i) => {
        g.fillStyle(0xb9c8d6, 1);
        g.fillCircle(wx, 95, 3);
        g.fillStyle(wheelHues[i], 1);
        g.fillCircle(wx, 108, 13);
        g.lineStyle(2, 0x2a0f4a, 1);
        g.strokeCircle(wx, 108, 13);
        g.fillStyle(0xf4f1fb, 1);
        g.fillCircle(wx, 108, 4);
      });
    });

    // Surfboard: blunted (not razor-pointed) nose, wide-ish rounded tail, side
    // profile like the hoverboard deck -- nose faces right, tail/fin faces left.
    // Filled with solid green->purple interpolated slices (not fillGradientStyle
    // -- unreliable on arbitrary fillPoints shapes) for a genuinely two-tone
    // iridescent board. The shimmer bands are built from the same per-t width
    // function as the hull itself, so they're clipped to the silhouette and
    // never poke outside the outline the way a plain rectangular sheen would.
    makeTex(this, 'veh_surfboard', 150, 46, (g) => {
      const noseX = 5, tailX = 145, cy = 23;
      const maxHalfW = 15, minHalfW = 4;
      const widthAt = (t) => t < 0.6
        ? minHalfW + (maxHalfW - minHalfW) * Math.sin((t / 0.6) * Math.PI / 2)
        : maxHalfW * (1 - 0.35 * ((t - 0.6) / 0.4));
      // t=0 (nose) maps to tailX and t=1 (tail/fin) maps to noseX, so the
      // pointed end faces right and the wide fin end faces left
      const xAt = (t) => tailX - t * (tailX - noseX);
      const green = { r: 0x3d, g: 0xdc, b: 0x5b };
      const purple = { r: 0x9b, g: 0x3b, b: 0xff };
      const colorAt = (t) => {
        const r = Math.round(green.r + (purple.r - green.r) * t);
        const gg = Math.round(green.g + (purple.g - green.g) * t);
        const b = Math.round(green.b + (purple.b - green.b) * t);
        return (r << 16) | (gg << 8) | b;
      };

      const slices = 14;
      for (let i = 0; i < slices; i++) {
        const t0 = i / slices, t1 = (i + 1) / slices;
        const x0 = xAt(t0), x1 = xAt(t1);
        const w0 = widthAt(t0), w1 = widthAt(t1);
        const quad = [
          { x: x0, y: cy - w0 }, { x: x1, y: cy - w1 },
          { x: x1, y: cy + w1 }, { x: x0, y: cy + w0 },
        ];
        g.fillStyle(colorAt((t0 + t1) / 2), 1);
        g.fillPoints(quad, true);
      }

      // diagonal shimmer bands, each its own hull-shaped sliver (built the
      // same way as the color slices) so they can never spill past the edge
      const sheenBand = (centerT, halfT, color, alpha) => {
        const t0 = Phaser.Math.Clamp(centerT - halfT, 0, 1);
        const t1 = Phaser.Math.Clamp(centerT + halfT, 0, 1);
        const skew = 4;
        const quad = [
          { x: xAt(t0), y: cy - widthAt(t0) }, { x: xAt(t1), y: cy - widthAt(t1) },
          { x: xAt(t1) - skew, y: cy + widthAt(t1) }, { x: xAt(t0) - skew, y: cy + widthAt(t0) },
        ];
        g.fillStyle(color, alpha);
        g.fillPoints(quad, true);
      };
      sheenBand(0.28, 0.05, 0xffffff, 0.4);
      sheenBand(0.5, 0.045, 0x9ee8ff, 0.25);
      sheenBand(0.7, 0.04, 0xff9ee8, 0.2);

      // full outline
      const top = [];
      const bottom = [];
      for (let i = 0; i <= slices; i++) {
        const t = i / slices;
        top.push({ x: xAt(t), y: cy - widthAt(t) });
        bottom.push({ x: xAt(t), y: cy + widthAt(t) });
      }
      const outline = [...top, ...bottom.reverse()];
      g.lineStyle(3, 0x2a0f4a, 1);
      g.strokePoints(outline, true);

      // center stringer
      g.lineStyle(1.5, 0xffffff, 0.5);
      g.beginPath();
      g.moveTo(xAt(0.02), cy);
      g.lineTo(xAt(0.98), cy);
      g.strokePath();

      // small tail fin, at the wide (now left) end
      const fin = [
        { x: xAt(0.90), y: cy + widthAt(0.90) - 2 },
        { x: xAt(0.95), y: cy + widthAt(0.95) + 10 },
        { x: xAt(0.99), y: cy + widthAt(0.99) - 2 },
      ];
      g.fillStyle(0x2a0f4a, 0.85);
      g.fillPoints(fin, true);
    });

    makeTex(this, 'veh_floppy', 80, 80, (g) => {
      // classic 3.5" shape: chamfered top-right corner, metal shutter with a
      // write-protect window, and a ruled paper label -- purple shell (same
      // purple as the popup title bars) instead of the usual black casing
      const body = [
        { x: 10, y: 6 }, { x: 56, y: 6 }, { x: 74, y: 22 }, { x: 74, y: 70 }, { x: 70, y: 74 },
        { x: 10, y: 74 }, { x: 6, y: 70 }, { x: 6, y: 10 },
      ];
      g.fillStyle(0x8a2be2, 1);
      g.fillPoints(body, true);
      paintDiagonalSheen(g, 9, 9, 62, 62);
      g.lineStyle(3, 0x2a0f4a, 1);
      g.strokePoints(body, true);

      // metal shutter
      g.fillStyle(0xd8d8e2, 1);
      g.fillRect(20, 11, 40, 21);
      g.fillStyle(0xffffff, 0.5);
      g.fillRect(20, 11, 14, 21);
      g.lineStyle(2, 0x6a6a7a, 1);
      g.strokeRect(20, 11, 40, 21);
      // write-protect window
      g.fillStyle(0x39394a, 1);
      g.fillRect(42, 14, 12, 15);

      // ruled paper label
      g.fillStyle(0xfaf7f2, 1);
      g.fillRect(14, 42, 52, 28);
      g.lineStyle(1, 0xc9a0c9, 1);
      for (let i = 1; i < 5; i++) {
        const ly = 42 + i * 5.2;
        g.beginPath(); g.moveTo(15, ly); g.lineTo(65, ly); g.strokePath();
      }
      g.lineStyle(2, 0x8888a0, 1);
      g.strokeRect(14, 42, 52, 28);
      // pink accent strip along the bottom of the label
      g.fillStyle(0xff4fd8, 1);
      g.fillRect(14, 64, 52, 6);
      // write-protect tab notch
      g.fillStyle(0xf0e8fa, 1);
      g.fillRect(62, 65, 8, 6);
      g.lineStyle(1.5, 0x2a0f4a, 1);
      g.strokeRect(62, 65, 8, 6);

      // iridescent sparkle accents
      g.fillStyle(0xff66ff, 0.9);
      g.fillCircle(66, 30, 3.5);
      g.fillStyle(0x66ffff, 0.9);
      g.fillCircle(11, 60, 3);
      g.fillStyle(0xfff066, 0.9);
      g.fillCircle(72, 22, 2.5);
    });
  }

  buildObstacleTextures() {
    // Flat pixel-art CD: white disc with two opposite lavender wedges, two opposite
    // mint/tan/cyan diffraction streaks, a chunky black rim, and a bullseye hub.
    makeTex(this, 'obs_cd', 68, 68, (g) => {
      const cx = 34, cy = 34, r = 29;
      g.fillStyle(0x000000, 0.18);
      g.fillCircle(cx + 2, cy + 4, r);

      const wedge = (a0, a1, color) => {
        g.fillStyle(color, 1);
        g.beginPath();
        g.moveTo(cx, cy);
        g.arc(cx, cy, r, Phaser.Math.DegToRad(a0), Phaser.Math.DegToRad(a1), false);
        g.closePath();
        g.fillPath();
      };
      const lav = 0xc9c2ea, mint = 0xaee8c9, tan = 0xe8d9ae, cyan = 0x9ee8e8;
      wedge(0, 360, 0xffffff);
      wedge(45, 60, lav); wedge(60, 75, mint); wedge(75, 90, tan); wedge(90, 105, cyan);
      wedge(105, 135, lav);
      wedge(225, 240, lav); wedge(240, 255, mint); wedge(255, 270, tan); wedge(270, 285, cyan);
      wedge(285, 315, lav);

      // thin, clean circular outline -- no protruding tabs/nodules
      g.lineStyle(2, 0x111114, 1);
      g.strokeCircle(cx, cy, r);

      // bullseye hub
      g.fillStyle(0xffffff, 1);
      g.fillCircle(cx, cy, 10);
      g.lineStyle(4, 0x111114, 1);
      g.strokeCircle(cx, cy, 9);
      g.fillStyle(0x111114, 1);
      g.fillCircle(cx, cy, 3.5);
    });

    // Vintage Windows-style arrow pointer: white body, black outline, a little
    // diagonal specular streak.
    makeTex(this, 'obs_cursor', 34, 50, (g) => {
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(16, 46, 22, 6);

      const arrow = [
        { x: 2, y: 2 }, { x: 2, y: 36 }, { x: 12, y: 28 }, { x: 19, y: 42 },
        { x: 24, y: 39 }, { x: 17, y: 26 }, { x: 30, y: 24 },
      ];
      g.fillStyle(0xffffff, 1);
      g.fillPoints(arrow, true);
      g.fillStyle(0xffffff, 0.7);
      g.fillTriangle(5, 6, 5, 22, 11, 17);

      g.lineStyle(2, 0x000000, 1);
      g.strokePoints(arrow, true);
    });

    // obs_tree texture now comes from the loaded tree.svg (see preload())

    // Pixel-art crying emoji: yellow face with a chunky black stepped rim (built
    // by filling a slightly bigger dark circle behind the yellow one, so the
    // exposed ring between them naturally comes out jagged/pixelated).
    makeTex(this, 'obs_crying', 76, 76, (g) => {
      const CELL = 4;
      const pixelCircle = (cx, cy, r, color) => {
        g.fillStyle(color, 1);
        const gx0 = Math.floor((cx - r) / CELL) * CELL;
        const gy0 = Math.floor((cy - r) / CELL) * CELL;
        for (let y = gy0; y <= cy + r; y += CELL) {
          for (let x = gx0; x <= cx + r; x += CELL) {
            const dx = x + CELL / 2 - cx, dy = y + CELL / 2 - cy;
            if (dx * dx + dy * dy <= r * r) g.fillRect(x, y, CELL, CELL);
          }
        }
      };
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(38, 70, 46, 8);

      pixelCircle(38, 36, 32, 0x1a1408);
      pixelCircle(38, 36, 28, 0xffd93b);
      pixelCircle(46, 30, 20, 0xffb020);

      // scrunched-shut eyes
      g.fillStyle(0x5c3a10, 1);
      g.fillRect(20, 26, 10, 4);
      g.fillRect(46, 26, 10, 4);

      // open crying mouth
      g.fillStyle(0x5c3a10, 1);
      g.fillRoundedRect(28, 44, 20, 14, 4);
      g.fillStyle(0xffffff, 1);
      g.fillRect(30, 45, 16, 4);
      g.fillStyle(0xd9720f, 1);
      g.fillRoundedRect(30, 50, 16, 7, 3);

      // no baked-in tear streams -- animated tear_drop sprites fall from the
      // eyes instead (see buildObstacleVisual in GameScene)
    });

    // Small falling teardrop -- lighter highlight over a darker base, used as
    // an animated sprite dripping from the crying emoji's eyes.
    makeTex(this, 'tear_drop', 12, 18, (g) => {
      g.fillStyle(0x3a9cd8, 0.95);
      g.fillEllipse(6, 10, 10, 15);
      g.fillStyle(0x7fe0f0, 0.9);
      g.fillEllipse(6, 6, 7, 9);
    });

    // same face, but smiling -- swapped in while a speed-boost is active
    makeTex(this, 'obs_crying_happy', 76, 76, (g) => {
      const CELL = 4;
      const pixelCircle = (cx, cy, r, color) => {
        g.fillStyle(color, 1);
        const gx0 = Math.floor((cx - r) / CELL) * CELL;
        const gy0 = Math.floor((cy - r) / CELL) * CELL;
        for (let y = gy0; y <= cy + r; y += CELL) {
          for (let x = gx0; x <= cx + r; x += CELL) {
            const dx = x + CELL / 2 - cx, dy = y + CELL / 2 - cy;
            if (dx * dx + dy * dy <= r * r) g.fillRect(x, y, CELL, CELL);
          }
        }
      };
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(38, 70, 46, 8);

      pixelCircle(38, 36, 32, 0x1a1408);
      pixelCircle(38, 36, 28, 0xffd93b);
      pixelCircle(46, 30, 20, 0xffb020);

      // bright open eyes
      g.fillStyle(0x5c3a10, 1);
      g.fillRect(20, 24, 8, 8);
      g.fillRect(48, 24, 8, 8);
      g.fillStyle(0xffffff, 1);
      g.fillRect(22, 25, 3, 3);
      g.fillRect(50, 25, 3, 3);

      // big upturned smile, no tears
      g.fillStyle(0x5c3a10, 1);
      g.fillRoundedRect(24, 44, 28, 16, { tl: 4, tr: 4, bl: 14, br: 14 });
      g.fillStyle(0xffffff, 1);
      g.fillRoundedRect(26, 46, 24, 6, 2);
    });

    // Pixel-art vintage computer: beige CRT monitor showing a little app window,
    // a base unit with drive slots, and a checkered-front keyboard.
    makeTex(this, 'obs_computer', 84, 92, (g) => {
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(42, 88, 68, 8);

      // monitor
      g.fillStyle(0xc7c7ce, 1);
      g.fillRect(10, 4, 64, 54);
      g.fillStyle(0x8a8a92, 1);
      g.fillRect(10, 52, 64, 6);
      g.lineStyle(2, 0x3a3a40, 1);
      g.strokeRect(10, 4, 64, 54);

      g.fillStyle(0x2a4a4e, 1);
      g.fillRect(18, 12, 48, 36);
      g.fillStyle(0xffffff, 1);
      g.fillRect(24, 18, 32, 22);
      g.fillStyle(0x2a5fd6, 1);
      g.fillRect(24, 18, 32, 5);
      g.lineStyle(1.5, 0x18282a, 1);
      g.strokeRect(18, 12, 48, 36);

      // base unit
      g.fillStyle(0xb4b4bc, 1);
      g.fillRect(16, 58, 52, 16);
      g.lineStyle(2, 0x3a3a40, 1);
      g.strokeRect(16, 58, 52, 16);
      g.fillStyle(0x3ddc5b, 1);
      g.fillRect(22, 68, 4, 4);
      g.fillStyle(0x1a1a1e, 1);
      g.fillRect(46, 66, 16, 4);

      // keyboard
      g.fillStyle(0xcccdd4, 1);
      g.fillPoints([
        { x: 4, y: 90 }, { x: 12, y: 76 }, { x: 72, y: 76 }, { x: 80, y: 90 },
      ], true);
      g.lineStyle(2, 0x3a3a40, 1);
      g.strokePoints([
        { x: 4, y: 90 }, { x: 12, y: 76 }, { x: 72, y: 76 }, { x: 80, y: 90 },
      ], true);
      for (let i = 0; i < 12; i++) {
        g.fillStyle(i % 2 === 0 ? 0x1a1a1e : 0xe8e8ee, 1);
        g.fillRect(8 + i * 6, 84, 6, 6);
      }
    });

    // obs_logguy texture now comes from the loaded tung.svg (see preload())
  }

  buildMiscTextures() {
    // dolphin texture now comes from the loaded dolphin.svg (see preload())

    // Splash: a few droplet blobs used for the dolphin's leap effect.
    makeTex(this, 'splash', 20, 20, (g) => {
      g.fillStyle(0xbdf5ef, 0.9);
      g.fillCircle(10, 10, 6);
      g.fillStyle(0xffffff, 0.9);
      g.fillCircle(10, 10, 2.5);
    });

    // bag texture now comes from the loaded wrapper.svg (see preload())

    // Fluffy cloud: many overlapping circles (not stretched ovals) so it reads as puffy.
    makeTex(this, 'cloud', 100, 50, (g) => {
      const puffs = [
        { x: 20, y: 34, r: 15 }, { x: 34, y: 24, r: 18 }, { x: 50, y: 30, r: 16 },
        { x: 62, y: 20, r: 17 }, { x: 76, y: 28, r: 15 }, { x: 86, y: 34, r: 12 },
        { x: 40, y: 36, r: 14 }, { x: 58, y: 36, r: 14 }, { x: 28, y: 38, r: 12 },
      ];
      g.fillStyle(0xffffff, 0.85);
      puffs.forEach((p) => g.fillCircle(p.x, p.y, p.r));
      g.fillStyle(0xffffff, 1);
      puffs.forEach((p) => g.fillCircle(p.x, p.y - 2, p.r * 0.8));
    });

    // 4-point twinkle sparkle used for the glitter overlay.
    makeTex(this, 'sparkle', 20, 20, (g) => {
      const cx = 10, cy = 10;
      g.fillStyle(0xffffff, 1);
      g.fillPoints([
        { x: cx, y: 0 }, { x: cx + 3, y: cy - 3 }, { x: 20, y: cy }, { x: cx + 3, y: cy + 3 },
        { x: cx, y: 20 }, { x: cx - 3, y: cy + 3 }, { x: 0, y: cy }, { x: cx - 3, y: cy - 3 },
      ], true);
      g.fillStyle(0xffffff, 0.6);
      g.fillCircle(cx, cy, 2.6);
    });

    // Huge grey floating mannequin head hazard: bald, blank eyes, open mouth (overlay).
    makeTex(this, 'head', 160, 200, (g) => {
      g.fillStyle(0x000000, 0.18);
      g.fillEllipse(80, 192, 80, 14);

      const face = [
        { x: 80, y: 6 }, { x: 118, y: 18 }, { x: 132, y: 55 }, { x: 126, y: 95 },
        { x: 108, y: 130 }, { x: 80, y: 145 }, { x: 52, y: 130 }, { x: 34, y: 95 },
        { x: 28, y: 55 }, { x: 42, y: 18 },
      ];

      // neck
      g.fillStyle(0x9a9aa4, 1);
      g.fillRect(60, 132, 40, 45);

      // ears
      g.fillStyle(0xa8a8b2, 1);
      g.fillEllipse(26, 72, 13, 22);
      g.fillEllipse(134, 72, 13, 22);

      // base face + shadow side + scalp highlight
      g.fillStyle(0xb4b4be, 1);
      g.fillPoints(face, true);
      g.fillStyle(0x8f8f9a, 0.4);
      g.fillPoints(face.map((p) => ({ x: p.x < 80 ? p.x : p.x - (p.x - 80) * 0.15, y: p.y })), true);
      g.fillStyle(0xffffff, 0.28);
      g.fillEllipse(55, 30, 46, 26);

      g.lineStyle(3, 0x5c5c66, 1);
      g.strokePoints(face, true);

      // blank mannequin eyes
      g.fillStyle(0xf0f0f2, 1);
      g.fillEllipse(58, 72, 17, 10);
      g.fillEllipse(102, 72, 17, 10);
      g.lineStyle(2, 0x8a8a94, 1);
      g.strokeEllipse(58, 72, 17, 10);
      g.strokeEllipse(102, 72, 17, 10);

      // nose
      g.fillStyle(0x9a9aa4, 1);
      g.fillTriangle(80, 78, 74, 100, 86, 100);
      g.fillStyle(0x7a7a84, 0.6);
      g.fillEllipse(76, 101, 6, 3);
      g.fillEllipse(84, 101, 6, 3);
    });

    makeTex(this, 'head_mouth', 76, 46, (g) => {
      g.fillStyle(0x1a1214, 1);
      g.fillEllipse(38, 22, 72, 40);
      g.fillStyle(0x4a1f26, 1);
      g.fillEllipse(38, 30, 58, 22);
    });

    // closed, upturned smile -- swapped in while a speed-boost is active,
    // in place of the chomping cavity
    makeTex(this, 'head_mouth_happy', 76, 46, (g) => {
      g.lineStyle(7, 0x1a1214, 1);
      g.beginPath();
      const p0 = { x: 8, y: 10 }, p1 = { x: 38, y: 34 }, p2 = { x: 68, y: 10 };
      g.moveTo(p0.x, p0.y);
      const steps = 12;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = (1 - t) * (1 - t) * p0.x + 2 * (1 - t) * t * p1.x + t * t * p2.x;
        const y = (1 - t) * (1 - t) * p0.y + 2 * (1 - t) * t * p1.y + t * t * p2.y;
        g.lineTo(x, y);
      }
      g.strokePath();
    });
  }
}
