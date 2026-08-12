import * as Tone from 'tone';

// A fully synthesized, original vaporwave-style loop -- chorused jazzy pad chords,
// a warm sub bass, swung lo-fi drums, tape-wobble detune, and a hiss bed.
const CHORDS = [
  ['F3', 'A3', 'C4', 'E4'],
  ['A3', 'C4', 'E4', 'G4'],
  ['D3', 'F3', 'A3', 'C4'],
  ['C3', 'E3', 'G3', 'B3'],
];
const BASS_NOTES = ['F2', 'A2', 'D2', 'C2'];

const KICK = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0];
const SNARE = [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0];
const HAT = [1, 1, 1, 0, 1, 1, 1, 1, 1, 1, 1, 0, 1, 1, 1, 1];

class MusicManager {
  constructor() {
    this.ready = false;
    this.started = false;
    this.muted = false;
    this.intensity = 0;
  }

  init() {
    if (this.ready) return;
    this.ready = true;
    this.build();
    const startOnGesture = () => {
      Tone.start().then(() => this.begin());
      document.removeEventListener('pointerdown', startOnGesture);
    };
    document.addEventListener('pointerdown', startOnGesture, { once: true });
    this.buildMuteButton();
  }

  build() {
    this.filter = new Tone.Filter(1400, 'lowpass').toDestination();
    this.reverb = new Tone.Reverb({ decay: 4.5, wet: 0.35 }).connect(this.filter);
    this.chorus = new Tone.Chorus({ frequency: 0.6, depth: 0.7, wet: 0.5 }).connect(this.reverb).start();

    this.padBus = new Tone.Gain(0.5).connect(this.chorus);
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 1.2, decay: 0.6, sustain: 0.7, release: 2.5 },
      volume: -10,
    }).connect(this.padBus);

    this.bassBus = new Tone.Gain(0.7).connect(this.filter);
    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.3, sustain: 0.6, release: 1 },
      filter: { Q: 1, type: 'lowpass', rolloff: -12 },
      filterEnvelope: { attack: 0.05, decay: 0.2, sustain: 0.5, release: 1, baseFrequency: 200, octaves: 2 },
      volume: -6,
    }).connect(this.bassBus);

    // slow tape-wobble LFO on the bass's detune (PolySynth has no connectable detune signal)
    this.wobble = new Tone.LFO({ frequency: 0.12, min: -10, max: 10 }).start();
    this.wobble.connect(this.bass.detune);

    this.kick = new Tone.MembraneSynth({ pitchDecay: 0.05, octaves: 6, volume: -6 }).connect(this.filter);
    this.snare = new Tone.NoiseSynth({
      noise: { type: 'pink' },
      envelope: { attack: 0.001, decay: 0.18, sustain: 0 },
      volume: -16,
    });
    this.snareReverb = new Tone.Reverb({ decay: 1.8, wet: 0.5 }).connect(this.filter);
    this.snare.connect(this.snareReverb);

    this.hat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
      volume: -26,
    }).connect(this.filter);

    this.hiss = new Tone.Noise('pink').start();
    this.hissFilter = new Tone.Filter(3500, 'bandpass');
    this.hissGain = new Tone.Gain(0.02).connect(this.filter);
    this.hiss.connect(this.hissFilter);
    this.hissFilter.connect(this.hissGain);

    Tone.Transport.bpm.value = 82;
    Tone.Transport.swing = 0.15;
    Tone.Transport.swingSubdivision = '8n';

    let chordIdx = 0;
    this.chordLoop = new Tone.Loop((time) => {
      const chord = CHORDS[chordIdx % CHORDS.length];
      const bassNote = BASS_NOTES[chordIdx % BASS_NOTES.length];
      this.pad.triggerAttackRelease(chord, '1.6m', time);
      this.bass.triggerAttackRelease(bassNote, '0.4n', time);
      this.bass.triggerAttackRelease(bassNote, '0.4n', time + Tone.Time('1m').toSeconds());
      chordIdx++;
    }, '2m');

    this.drumSeq = new Tone.Sequence((time, step) => {
      if (KICK[step]) {
        this.kick.triggerAttackRelease('C1', '8n', time);
        // gentle sidechain-style pump on the pad/bass bus
        this.padBus.gain.cancelScheduledValues(time);
        this.padBus.gain.setValueAtTime(0.22, time);
        this.padBus.gain.linearRampToValueAtTime(0.5, time + 0.35);
        this.bassBus.gain.cancelScheduledValues(time);
        this.bassBus.gain.setValueAtTime(0.35, time);
        this.bassBus.gain.linearRampToValueAtTime(0.7, time + 0.35);
      }
      if (SNARE[step]) this.snare.triggerAttackRelease('16n', time);
      if (HAT[step]) this.hat.triggerAttackRelease('32n', time, step % 2 === 0 ? 0.6 : 0.3);
    }, [...Array(16).keys()], '8n');
  }

  begin() {
    if (this.started) return;
    this.started = true;
    Tone.Transport.start('+0.1');
    this.chordLoop.start(0);
    this.drumSeq.start(0);
  }

  setIntensity(rush) {
    const target = rush ? 3200 : 1400;
    this.filter.frequency.rampTo(target, 0.6);
  }

  // Still the same vaporwave loop, just slower/darker/wetter for a melancholic feel.
  setMood(mood) {
    if (mood === 'sad') {
      this.filter.frequency.rampTo(500, 1.2);
      Tone.Transport.bpm.rampTo(58, 1.5);
      this.reverb.wet.rampTo(0.6, 1.2);
    } else {
      this.filter.frequency.rampTo(1400, 1);
      Tone.Transport.bpm.rampTo(82, 1);
      this.reverb.wet.rampTo(0.35, 1);
    }
  }

  // A soft, chill synth-pad swell with a laid-back sine arpeggio for the
  // vehicle-select spin -- routed through the chorus/reverb bus so it sits
  // in the vaporwave mix rather than cutting sharply over it.
  playVehicleSpin() {
    const now = Tone.now();

    // quick filtered-noise whoosh right before the chime -- the two
    // deliberately overlap rather than waiting for the whoosh to finish
    const whooshFilter = new Tone.Filter(250, 'bandpass').toDestination();
    const whoosh = new Tone.Noise('white');
    whoosh.volume.value = -15;
    whoosh.connect(whooshFilter);
    whoosh.start(now).stop(now + 0.32);
    whooshFilter.frequency.setValueAtTime(180, now);
    whooshFilter.frequency.exponentialRampToValueAtTime(2400, now + 0.28);

    const chordAt = now + 0.1;
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.25, decay: 0.4, sustain: 0.3, release: 1.1 },
      volume: -18,
    }).connect(this.chorus);
    pad.triggerAttackRelease(['A3', 'C4', 'E4'], '2n', chordAt);

    const arp = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.3, sustain: 0, release: 0.5 },
      volume: -14,
    }).connect(this.chorus);
    ['E4', 'A4', 'C5'].forEach((note, i) => {
      arp.triggerAttackRelease(note, '4n', chordAt + 0.18 + i * 0.14);
    });
  }

  // A chill vaporwave chord stab with a shimmering top layer, for the "LET'S
  // RIDE" flooded-red interim screen -- a warm sawtooth chord through the
  // chorus/reverb bus, a soft sine sub for weight, and a bell shimmer on top.
  playLetsRideSound() {
    const t = Tone.now();
    const chord = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sawtooth' },
      envelope: { attack: 0.03, decay: 0.5, sustain: 0.45, release: 1.4 },
      volume: -16,
    }).connect(this.chorus);
    chord.triggerAttackRelease(['A3', 'C4', 'E4', 'G4'], 1.3, t);

    const sub = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.4, sustain: 0.5, release: 1.1 },
      volume: -12,
    }).toDestination();
    sub.triggerAttackRelease('A1', 1.1, t);

    const shimmer = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 1, sustain: 0.1, release: 1.2 },
      volume: -20,
    }).connect(this.chorus);
    ['E5', 'A5', 'C6', 'E6'].forEach((note, i) => {
      shimmer.triggerAttackRelease(note, 1.4, t + 0.08 + i * 0.06);
    });
  }

  // A quick ascending twinkly run, timed to play as the rainbow ribbon shoots
  // out of the bag.
  playSparkle() {
    const t = Tone.now();
    const bell = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.25, sustain: 0, release: 0.3 },
      volume: -16,
    }).connect(this.chorus);
    ['C6', 'E6', 'G6', 'C7', 'E7'].forEach((n, i) => {
      bell.triggerAttackRelease(n, '16n', t + i * 0.09);
    });
  }

  // A slow, moody chorus-drenched minor triad for collecting a CD on the
  // track -- a chill vaporwave pad rather than a bright "coin" chime, with
  // a soft sub for weight and a single hazy shimmer note drifting in late.
  playCdCollect() {
    const t = Tone.now();
    const chord = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.08, decay: 0.5, sustain: 0.25, release: 1.5 },
      volume: -17,
    }).connect(this.chorus);
    chord.triggerAttackRelease(['A3', 'C4', 'E4'], 1.1, t);

    const sub = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.05, decay: 0.4, sustain: 0.3, release: 1.2 },
      volume: -14,
    }).toDestination();
    sub.triggerAttackRelease('A2', 1, t);

    const haze = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.3, decay: 0.6, sustain: 0.1, release: 1 },
      volume: -22,
    }).connect(this.chorus);
    haze.triggerAttackRelease('E5', 1.2, t + 0.15);
  }

  // Three quick ascending sine whistle chirps -- a classic "eee-eee-eee"
  // dolphin sound, built from raw oscillators so the pitch can sweep freely.
  playDolphinSound() {
    const t = Tone.now();
    const chirp = (start, dur, f0, f1) => {
      const osc = new Tone.Oscillator({ frequency: f0, type: 'sine' });
      const gain = new Tone.Gain(0).toDestination();
      osc.connect(gain);
      osc.start(start).stop(start + dur);
      osc.frequency.setValueAtTime(f0, start);
      osc.frequency.exponentialRampToValueAtTime(f1, start + dur * 0.6);
      osc.frequency.exponentialRampToValueAtTime(f0 * 0.85, start + dur);
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.25, start + dur * 0.15);
      gain.gain.linearRampToValueAtTime(0, start + dur);
    };
    chirp(t, 0.16, 1500, 3200);
    chirp(t + 0.2, 0.14, 1800, 3600);
    chirp(t + 0.38, 0.1, 2000, 3000);
  }

  // A rising boot-chime plus stuttery disk-seek chatter, like an old PC POST
  // beep and drive read -- timed to run alongside the title screen's loading
  // bar. Silently does nothing if audio hasn't been unlocked by a gesture yet.
  // A soft, gusting wind bed plus occasional water-splash bursts, layered on
  // top of the regular music while actually riding the track.
  startTrackAmbience() {
    if (this._ambience) return;
    // static filtered noise bed -- no LFO/sweep at all, so there's no
    // periodic "whip" cycle to hear, just a constant soft wind texture
    const windFilter = new Tone.Filter(850, 'lowpass').toDestination();
    const wind = new Tone.Noise('pink');
    wind.volume.value = -34;
    wind.connect(windFilter);
    wind.start();

    this._ambience = { wind, windFilter, splashTimer: null };
    this._scheduleSplash();
  }

  stopTrackAmbience() {
    if (!this._ambience) return;
    clearTimeout(this._ambience.splashTimer);
    this._ambience.wind.stop();
    this._ambience = null;
  }

  _scheduleSplash() {
    if (!this._ambience) return;
    const delay = 3 + Math.random() * 4;
    this._ambience.splashTimer = setTimeout(() => {
      if (!this._ambience) return;
      // a soft-attack, lowpass-filtered noise swell -- an instant attack on
      // raw white noise reads as a sharp "crack"/whip, not a water splash
      const splashFilter = new Tone.Filter(1800, 'lowpass').toDestination();
      const splash = new Tone.NoiseSynth({
        noise: { type: 'pink' },
        envelope: { attack: 0.05, decay: 0.6, sustain: 0, release: 0.2 },
        volume: -26,
      }).connect(splashFilter);
      splash.triggerAttackRelease(0.4, Tone.now());
      this._scheduleSplash();
    }, delay * 1000);
  }

  playLoadingSound() {
    if (Tone.context.state !== 'running') return;
    const t = Tone.now();

    // warm, slow-swelling pad chord -- Windows-95-startup-chime energy,
    // routed through the chorus/reverb bus for the same chill vaporwave wash
    // as the background music, instead of a harsh DOS beep-and-chatter
    const pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.5, decay: 0.6, sustain: 0.5, release: 1.4 },
      volume: -15,
    }).connect(this.chorus);
    pad.triggerAttackRelease(['C4', 'E4', 'G4', 'B4'], 1.8, t);

    // soft sub pulse underneath for warmth/body
    const sub = new Tone.Synth({
      oscillator: { type: 'sine' },
      envelope: { attack: 0.4, decay: 0.5, sustain: 0.6, release: 1.2 },
      volume: -17,
    }).toDestination();
    sub.triggerAttackRelease('C2', 1.6, t + 0.05);

    // a few gentle bell chimes drifting in on top
    const bell = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.02, decay: 0.8, sustain: 0.1, release: 1 },
      volume: -17,
    }).connect(this.chorus);
    [['E5', 0.15], ['G5', 0.5], ['C6', 0.95]].forEach(([note, off]) => {
      bell.triggerAttackRelease(note, 1, t + off);
    });
  }

  // A soft, quick, bubbly "bloop" -- pitch drops fast over a short percussive
  // envelope. Used on the various "ride" button clicks.
  playBloop() {
    const t = Tone.now();
    const osc = new Tone.Oscillator({ frequency: 700, type: 'sine' });
    const gain = new Tone.Gain(0).toDestination();
    osc.connect(gain);
    osc.start(t).stop(t + 0.18);
    osc.frequency.setValueAtTime(700, t);
    osc.frequency.exponentialRampToValueAtTime(240, t + 0.14);
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(0.3, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  }

  // A dense, quiet random gain flutter through a narrow bandpass -- reads as
  // subtle crinkling paper rather than crackly plastic, for the bag exiting.
  playCrinkle() {
    const t = Tone.now();
    const gainNode = new Tone.Gain(0).toDestination();
    const filter = new Tone.Filter(3200, 'bandpass');
    filter.Q.value = 0.7;
    filter.connect(gainNode);
    const noise = new Tone.Noise('white');
    noise.volume.value = -16;
    noise.connect(filter);
    noise.start(t);
    const dur = 0.8;
    const steps = 46;
    for (let i = 0; i < steps; i++) {
      gainNode.gain.setValueAtTime(Math.random() * 0.14, t + (i / steps) * dur);
    }
    gainNode.gain.setValueAtTime(0, t + dur);
    noise.stop(t + dur + 0.02);
  }

  // A low thud with a fast pitch drop, plus a tiny noise click for bite
  // texture -- for the grey head's mouth snapping shut.
  playChompSound() {
    const t = Tone.now();
    const synth = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.001, decay: 0.09, sustain: 0, release: 0.05 },
      volume: -8,
    }).toDestination();
    synth.triggerAttackRelease(180, 0.09, t);
    synth.frequency.setValueAtTime(180, t);
    synth.frequency.exponentialRampToValueAtTime(70, t + 0.08);

    const clickFilter = new Tone.Filter(1200, 'lowpass').toDestination();
    const click = new Tone.Noise('white');
    click.volume.value = -18;
    click.connect(clickFilter);
    click.start(t).stop(t + 0.04);
  }

  // The classic dial-up modem handshake, synthesized in the same stages as the
  // real thing: dial tone hum, DTMF digits, an answer-tone burst, several rounds
  // of harsh modulated handshake screech, then settling into carrier hiss. (Built
  // from ear/structure, not sampled -- there's no way to pull real audio here.)
  playDialUp() {
    // guards against rapid repeat calls (e.g. re-entering the intro without a
    // page reload) scheduling a new sequence earlier than one already in flight
    const now = Math.max(Tone.now(), this._dialUpBusyUntil || 0);
    let t = now;

    // dial tone hum
    const dial1 = new Tone.Oscillator({ frequency: 350, type: 'sine', volume: -26 }).toDestination();
    const dial2 = new Tone.Oscillator({ frequency: 440, type: 'sine', volume: -26 }).toDestination();
    dial1.start(t).stop(t + 0.7);
    dial2.start(t).stop(t + 0.7);
    t += 0.9;

    // DTMF digits
    const beeper = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.02, sustain: 0.5, release: 0.02 },
      volume: -20,
    }).toDestination();
    const dtmfLow = [697, 770, 852, 941];
    const dtmfHigh = [1209, 1336, 1477];
    for (let i = 0; i < 7; i++) {
      const lo = dtmfLow[Math.floor(Math.random() * dtmfLow.length)];
      const hiF = dtmfHigh[Math.floor(Math.random() * dtmfHigh.length)];
      beeper.triggerAttackRelease(lo, 0.1, t);
      beeper.triggerAttackRelease(hiF, 0.1, t);
      t += 0.14;
    }
    t += 0.4;

    // answer-tone burst
    const answer = new Tone.Oscillator({ frequency: 2100, type: 'sine', volume: -22 }).toDestination();
    answer.start(t).stop(t + 0.6);
    t += 0.75;

    // handshake: rounds of harsh, rapidly-modulated square-wave screech with
    // brief gaps, getting a bit longer/denser each round
    for (let round = 0; round < 4; round++) {
      const dur = 0.3 + round * 0.12;
      const osc = new Tone.Oscillator({ frequency: 1000, type: 'square', volume: -28 }).toDestination();
      osc.start(t);
      const steps = 8 + round * 2;
      for (let s = 0; s < steps; s++) {
        const f = 700 + Math.random() * 1800;
        osc.frequency.setValueAtTime(f, t + (s * dur) / steps);
      }
      osc.stop(t + dur);
      t += dur + 0.08;
    }

    // settle into carrier hiss
    const hissFilter = new Tone.Filter(2200, 'bandpass').toDestination();
    const hiss = new Tone.Noise('pink');
    hiss.volume.value = -30;
    hiss.connect(hissFilter);
    hiss.start(t).stop(t + 1.1);
    t += 1.3;

    // a second, longer round of dialing digits and humming before it all settles
    const beeper2 = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.02, sustain: 0.5, release: 0.02 },
      volume: -21,
    }).toDestination();
    for (let i = 0; i < 11; i++) {
      const lo = dtmfLow[Math.floor(Math.random() * dtmfLow.length)];
      const hiF = dtmfHigh[Math.floor(Math.random() * dtmfHigh.length)];
      beeper2.triggerAttackRelease(lo, 0.1, t);
      beeper2.triggerAttackRelease(hiF, 0.1, t);
      t += 0.15;
    }
    t += 0.3;

    const hum1 = new Tone.Oscillator({ frequency: 340, type: 'sine', volume: -27 }).toDestination();
    const hum2 = new Tone.Oscillator({ frequency: 425, type: 'sine', volume: -27 }).toDestination();
    hum1.start(t).stop(t + 1.6);
    hum2.start(t).stop(t + 1.6);
    hum1.frequency.rampTo(360, 1.6, t);
    hum2.frequency.rampTo(410, 1.6, t);
    t += 1.6;

    const finalHissFilter = new Tone.Filter(2000, 'bandpass').toDestination();
    const finalHiss = new Tone.Noise('pink');
    finalHiss.volume.value = -32;
    finalHiss.connect(finalHissFilter);
    finalHiss.start(t).stop(t + 1);
    t += 1;

    // one more round of dialing, further out, like it's still trying to
    // connect -- then a last soft hum before it finally settles
    const beeper3 = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.005, decay: 0.02, sustain: 0.5, release: 0.02 },
      volume: -22,
    }).toDestination();
    for (let i = 0; i < 9; i++) {
      const lo = dtmfLow[Math.floor(Math.random() * dtmfLow.length)];
      const hiF = dtmfHigh[Math.floor(Math.random() * dtmfHigh.length)];
      beeper3.triggerAttackRelease(lo, 0.1, t);
      beeper3.triggerAttackRelease(hiF, 0.1, t);
      t += 0.15;
    }
    t += 0.35;

    const hum3a = new Tone.Oscillator({ frequency: 330, type: 'sine', volume: -28 }).toDestination();
    const hum3b = new Tone.Oscillator({ frequency: 415, type: 'sine', volume: -28 }).toDestination();
    hum3a.start(t).stop(t + 1.3);
    hum3b.start(t).stop(t + 1.3);
    hum3a.frequency.rampTo(345, 1.3, t);
    hum3b.frequency.rampTo(400, 1.3, t);
    t += 1.3;

    const closeHissFilter = new Tone.Filter(2100, 'bandpass').toDestination();
    const closeHiss = new Tone.Noise('pink');
    closeHiss.volume.value = -33;
    closeHiss.connect(closeHissFilter);
    closeHiss.start(t).stop(t + 0.9);
    t += 0.9;

    this._dialUpBusyUntil = t + 1.3;
  }

  buildMuteButton() {
    const btn = document.createElement('button');
    btn.textContent = '💿';
    Object.assign(btn.style, {
      position: 'fixed',
      zIndex: 1000,
      width: '48px',
      height: '48px',
      border: 'none',
      background: 'transparent',
      fontSize: '34px',
      lineHeight: '48px',
      cursor: 'pointer',
      filter: 'drop-shadow(0 1px 3px rgba(0,0,0,0.4))',
    });
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.muted = !this.muted;
      Tone.Destination.mute = this.muted;
      btn.style.opacity = this.muted ? '0.4' : '1';
    });
    document.body.appendChild(btn);

    // Phaser's FIT scale mode letterboxes/pillarboxes the actual canvas
    // inside the browser viewport (preserving aspect ratio instead of
    // stretching), so a plain viewport-fixed position drifts outside the
    // visible game frame on resize -- track the canvas's real rendered
    // bounds instead.
    const positionBtn = () => {
      const canvas = document.querySelector('#app canvas');
      if (!canvas) { requestAnimationFrame(positionBtn); return; }
      const rect = canvas.getBoundingClientRect();
      btn.style.top = `${rect.top + 6}px`;
      btn.style.left = `${rect.right - 54}px`;
    };
    positionBtn();
    window.addEventListener('resize', positionBtn);
    new ResizeObserver(positionBtn).observe(document.body);
  }
}

export const music = new MusicManager();
