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
  primer.volume = 0;
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

  // voices are already cached (or synchronously available) most of the time
  // after the first call -- speak immediately, still inside the same
  // synchronous gesture handler, instead of always awaiting a Promise first
  const synchronousVoices = cachedVoices || window.speechSynthesis.getVoices();
  if (synchronousVoices.length) {
    cachedVoices = synchronousVoices;
    window.speechSynthesis.speak(buildUtterance(text, pickMaleVoice(cachedVoices), pitch, rate));
    return;
  }

  // fallback for the rare case voices genuinely aren't loaded yet -- this
  // path is async and may miss iOS's gesture window, but it's better than
  // nothing on platforms that load voices lazily
  getVoices().then((voices) => {
    cachedVoices = voices;
    window.speechSynthesis.speak(buildUtterance(text, pickMaleVoice(voices), pitch, rate));
  });
}
