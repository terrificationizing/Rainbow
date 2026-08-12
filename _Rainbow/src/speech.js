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

export async function speakFlavor(text, { pitch = 0.3, rate = 0.6 } = {}) {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();

  if (!cachedVoices) cachedVoices = await getVoices();
  const voice = pickMaleVoice(cachedVoices);

  const utter = new SpeechSynthesisUtterance(text);
  if (voice) utter.voice = voice;
  // Pitch is the one lever that reliably reads as "more male" regardless of which
  // system voice ends up being used, so we lean on it hard here.
  utter.pitch = pitch;
  utter.rate = rate;
  utter.volume = 0.9;
  window.speechSynthesis.speak(utter);
}
