// Browser-native text-to-speech for the flavor call-outs -- each color gets a
// distinct weird slow deep pitch so they don't all sound the same. The Web Speech
// API has no real vibrato/modulation control, so "wavy" is approximated by picking
// a low pitch + slow rate on a male-leaning system voice (best-effort, varies by OS).
let cachedVoices = null;
function getVoices() {
  return new Promise((resolve) => {
    const existing = window.speechSynthesis.getVoices();
    if (existing.length) return resolve(existing);
    window.speechSynthesis.onvoiceschanged = () => {
      resolve(window.speechSynthesis.getVoices());
    };
    // Some browsers never fire the event if voices are already loading; back off.
    setTimeout(() => resolve(window.speechSynthesis.getVoices()), 300);
  });
}

const MALE_HINTS = ['male', 'david', 'daniel', 'alex', 'fred', 'george', 'james', 'aaron', 'guy', 'oliver', 'thomas', 'arthur', 'rishi', 'gordon', 'eddy'];
const FEMALE_HINTS = ['female', 'samantha', 'karen', 'victoria', 'susan', 'zira', 'moira', 'tessa', 'fiona', 'kate', 'allison', 'ava', 'emma', 'joanna', 'salli', 'nicky'];

function pickMaleVoice(voices) {
  const named = voices.find((v) => MALE_HINTS.some((h) => v.name.toLowerCase().includes(h)));
  if (named) return named;
  // avoid an accidentally-female default when nothing is explicitly labeled male
  const unlabeled = voices.filter((v) => !FEMALE_HINTS.some((h) => v.name.toLowerCase().includes(h)));
  return unlabeled.find((v) => v.lang?.startsWith('en')) || unlabeled[0] || voices[0];
}

// Safari has a well-known bug where an utterance with no surviving JS
// reference can get garbage-collected mid-flight -- speak() succeeds, no
// error ever fires, but the utterance just silently vanishes before it's
// spoken. Module-level references keep them alive for their full duration.
let currentUtterance = null;
let currentPrimer = null;

function buildUtterance(text, voice, pitch, rate) {
  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice;
  // Pitch is the one lever that reliably reads as "more male" regardless of which
  // system voice ends up being used, so we lean on it hard here.
  utter.pitch = pitch;
  utter.rate = rate;
  utter.volume = 0.9;
  return utter;
}

// iOS Safari (and WebViews built on it) only allows speechSynthesis.speak()
// to fire when it's called *synchronously* inside a user-gesture event --
// even a single microtask of `await` in between is enough to make it fail
// silently. Call this directly inside the earliest tap/click in the game
// (before any speakFlavor call is needed) to register the page as approved.
// Uses a single space, not an empty string -- some engines silently no-op
// on a truly empty utterance instead of treating it as a real speak() call.
export function unlockSpeech() {
  if (!('speechSynthesis' in window)) return;
  const primer = new SpeechSynthesisUtterance(' ');
  // near-silent, not truly 0 -- some engines treat a 0-volume utterance as
  // producing no real output and don't fully register it as "played" for
  // gesture-unlock purposes
  primer.volume = 0.01;
  currentPrimer = primer; // keep alive -- see comment near the module-level let
  window.speechSynthesis.speak(primer);
  // kicks off voice-list loading early too, so it's more likely to already
  // be populated by the time a real speakFlavor() call needs it
  window.speechSynthesis.getVoices();
}

export function speakFlavor(text, { pitch = 0.3, rate = 0.6 } = {}) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  // webkit/iOS can leave the synth stuck in a paused state after an earlier
  // interrupted utterance; resume() is a harmless no-op otherwise
  window.speechSynthesis.resume();

  const voices = cachedVoices || window.speechSynthesis.getVoices();
  if (voices.length) cachedVoices = voices;

  // ALWAYS speak right now, synchronously, in the same gesture-handler call
  // stack -- even with no voice list yet (voice ends up undefined, so the
  // utterance just uses the platform's default voice instead of our chosen
  // "male" one). Previously this only spoke when voices were already known,
  // and otherwise waited on the async getVoices() path below -- if voices
  // never populate on a given device, that meant NEVER actually speaking,
  // since the async path reliably misses iOS's gesture-linked speak() window.
  const utter = buildUtterance(text, voices.length ? pickMaleVoice(voices) : null, pitch, rate);
  currentUtterance = utter; // keep alive -- see comment near the module-level let
  window.speechSynthesis.speak(utter);

  // if the voice list wasn't ready, load it in the background so later
  // calls can use our preferred voice instead of the default
  if (!voices.length) {
    getVoices().then((v) => { cachedVoices = v; });
  }
}
