// main.js

// Data sets (題庫)
// Assign to window to avoid duplicate-declaration errors if script is loaded
// more than once (Pages or caching can cause duplicate execution).
window.SEL15Verbs = window.SEL15Verbs || [
  { base: "bike", meaning: "腳踏車" },
  { base: "inline skates", meaning: "直排溜冰鞋" },
  { base: "kite", meaning: "風箏" },
  { base: "skateboard", meaning: "滑板" },
  { base: "soccer ball", meaning: "足球" },
];

window.abaVerbs = window.abaVerbs || [
  { base: "kite", meaning: "風箏" },
  { base: "windy", meaning: "有風的" },
  { base: "scissor", meaning: "剪刀" },
  { base: "glue stick", meaning: "口紅膠" },
];

window.SPU7Verbs = window.SPU7Verbs || [
  { base: "car", meaning: "汽車" },
  { base: "star", meaning: "星星" },
  { base: "arm", meaning: "手臂" },
  { base: "start", meaning: "開始" },
  { base: "short", meaning: "短的" },
  { base: "popcorn", meaning: "爆米花" },
  { base: "card", meaning: "卡片" },
  { base: "park", meaning: "公園" },
  { base: "farmer", meaning: "農夫" },
  { base: "house", meaning: "房子" },
  { base: "cork", meaning: "軟木塞" },
  { base: "fork", meaning: "叉子" },
  { base: "store", meaning: "商店" },
  { base: "corn", meaning: "玉米" },
  { base: "north", meaning: "北方" },
];

// DOM elements (IDs required by the spec)
const selSEL15 = document.getElementById('SEL15');
const selSEL16 = document.getElementById('SEL16');
const selSPU7 = document.getElementById('SPU7');
const countSEL15 = document.getElementById('count-SEL15');
const countSEL16 = document.getElementById('count-SEL16');
const countSPU7 = document.getElementById('count-SPU7');

const wordBaseEl = document.getElementById('wordBase');
const wordMeaningEl = document.getElementById('wordMeaning');
const formsEl = document.getElementById('forms');
const refImageContainer = document.getElementById('refImageContainer');
const refImageEl = document.getElementById('refImage');
const refImageLog = document.getElementById('refImageLog');
const roundStatusEl = document.getElementById('roundStatus');
const weakStatusEl = document.getElementById('weakStatus');
const feedbackEl = document.getElementById('feedback');

const btnSpeakBase = document.getElementById('btnSpeakBase');
const btnShowForms = document.getElementById('btnShowForms');
const btnNext = document.getElementById('btnNext');
const btnMarkHard = document.getElementById('btnMarkHard');
const btnMarkEasy = document.getElementById('btnMarkEasy');
const btnResetWeak = document.getElementById('btnResetWeak');

const optLangEn = document.getElementById('optLangEn');
const optLangZh = document.getElementById('optLangZh');
const optLangRand = document.getElementById('optLangRand');
const chkAutoplay = document.getElementById('chkAutoplay');
const chkAutoSpeak = document.getElementById('chkAutoSpeak');
const inputAutoplaySec = document.getElementById('inputAutoplaySec');

const LOCAL_KEY = 'verb-practice-weakness-v2';

// Runtime state
let weaknesses = {}; // { "SEL15:bike": 2, ... }
let learningQueue = []; // first stage shuffled array of items
let learningIndex = 0;

function startLearningPhase() {
  // Build the current pool and prepare the learning queue, then show first item.
  const ok = prepareLearningQueue();
  if (!ok) return false;
  // show first question immediately
  pickNextLearningQuestion();
  return true;
}


// Prepare learning queue but do NOT immediately advance to the first question.
// This is used on init and when toggling checkboxes so the "下一題" button
// will start the sequence predictably.
function prepareLearningQueue() {
  const pool = buildPool();
  if (!pool.length) {
    learningQueue = [];
    learningIndex = 0;
    secondPhase = false;
    updateRoundStatus();
    setFeedback('請至少勾選一個題庫。');
    return false;
  }
  learningQueue = pool.slice();
  shuffle(learningQueue);
  learningIndex = 0;
  secondPhase = false;
  updateRoundStatus();
  weakStatusEl.textContent = '';
  setFeedback('');
  return true;
}

// Update pool counts in the UI
function updatePoolCounts() {
  try {
    if (countSEL15) countSEL15.textContent = `(${SEL15Verbs.length})`;
    if (countSEL16) countSEL16.textContent = `(${abaVerbs.length})`;
    if (countSPU7 && window.SPU7Verbs) countSPU7.textContent = `(${SPU7Verbs.length})`;
  } catch (e) { /* ignore UI update failures */ }
}

function updateRoundStatus() {
  if (!secondPhase) {
    const remain = Math.max(0, learningQueue.length - learningIndex);
    roundStatusEl.textContent = `完整學習輪：剩餘 ${remain} 題`;
  } else {
    roundStatusEl.textContent = '完整學習輪：已完成';
  }
}

// Choose next in learning queue
function pickNextLearningQuestion() {
  if (learningIndex < learningQueue.length) {
    const item = learningQueue[learningIndex];
    setCurrentItem(item);
    learningIndex++;
    updateRoundStatus();
    return true;
  } else {
    // enter second phase
    enterSecondPhase();
    return false;
  }
}

function enterSecondPhase() {
  secondPhase = true;
  weakStatusEl.textContent = '弱點加強複習中';
  roundStatusEl.textContent = '弱點加強複習中';
  setFeedback('已進入弱點加強複習階段，系統將依權重加強練習。');
  pickWeightedQuestion();
}

// Weighted random selection with recent-3 avoidance
function pickWeightedQuestion() {
  const pool = buildPool();
  if (!pool.length) {
    setFeedback('請至少勾選一個題庫。');
    return;
  }
  // attach weight
  const items = pool.map(it => {
    const w = (weaknesses[it.id] && Number.isInteger(weaknesses[it.id])) ? weaknesses[it.id] : 1;
    return { ...it, weight: Math.max(1, Math.min(5, w)) };
  });

  // If pool size <= 3, it's possible all are in recent. We apply rule: if all are in recent 3, ignore recent constraint.
  const candidateNotRecent = items.filter(it => !recentIds.includes(it.id));
  const usePool = (candidateNotRecent.length > 0) ? candidateNotRecent : items;

  // compute weighted random
  const total = usePool.reduce((s, it) => s + it.weight, 0);
  let r = Math.random() * total;
  for (const it of usePool) {
    if (r < it.weight) {
      setCurrentItem(it);
      return;
    }
    r -= it.weight;
  }
  // fallback
  setCurrentItem(usePool[usePool.length - 1]);
}

// Set current item and show according to display language options
function setCurrentItem(item) {
  currentItem = { id: item.id, base: item.base, meaning: item.meaning, source: item.source };
  // determine display language (en/zh/rand)
  const mode = document.querySelector('input[name="displayLang"]:checked')?.value || 'en';
  if (mode === 'en') {
    showAsEnglish();
  } else if (mode === 'zh') {
    showAsChinese();
  } else {
    // random per question
    if (Math.random() < 0.5) showAsEnglish(); else showAsChinese();
  }
  // clear meaning/forms display (only show when user clicks show)
  wordMeaningEl.textContent = '';
  formsEl.textContent = `權重：${getWeight(currentItem.id)}`;
  // update recentIds
  recentIds.push(currentItem.id);
  if (recentIds.length > 3) recentIds.shift();
  // update weak status display
  updateWeakInfo();
  setFeedback('');
  // update reference image
  updateReferenceImage(currentItem.base);
}

// Reference image loader: try local mapping, then Unsplash static query, then hide
const LOCAL_IMAGE_MAP = {
  // provide any local overrides like 'car': 'images/car.jpg'
};

function updateReferenceImage(word) {
  if (!refImageEl || !refImageContainer) return;
  // try exact local map first
  const key = (word || '').toLowerCase();
  if (LOCAL_IMAGE_MAP[key]) {
    const srcLocal = LOCAL_IMAGE_MAP[key];
    console.log('[refImage] using local image for', key, srcLocal);
    refImageEl.src = srcLocal;
    refImageEl.alt = `參考圖片：${word}`;
    refImageContainer.style.display = '';
    return;
  }

  // fallback to Unsplash source (no API key required for simple queries)
  try {
    // Use Unsplash source image with query; use small size for faster load
    const src = `https://source.unsplash.com/featured/600x400/?${encodeURIComponent(word)}`;
    console.log('[refImage] attempting remote image for', key, src);
    // set src and reveal container; if image fails to load, hide
    let settled = false;
    const timeoutId = setTimeout(() => {
      if (!settled) {
        // loading taking too long -> hide
        refImageContainer.style.display = 'none';
        if (refImageLog) refImageLog.textContent = 'timeout';
        console.log('[refImage] timeout for', src);
      }
    }, 6000);

    refImageEl.onload = () => { settled = true; clearTimeout(timeoutId); refImageContainer.style.display = ''; if (refImageLog) refImageLog.textContent = 'ok'; };
    refImageEl.onload = () => { settled = true; clearTimeout(timeoutId); refImageContainer.style.display = ''; if (refImageLog) refImageLog.textContent = 'ok'; console.log('[refImage] loaded', src); };
    refImageEl.onerror = () => { settled = true; clearTimeout(timeoutId); refImageContainer.style.display = 'none'; if (refImageLog) refImageLog.textContent = 'error'; console.log('[refImage] error loading', src); };
    // log attempted src for debugging
    if (refImageLog) refImageLog.textContent = src;
    refImageEl.src = src;
    refImageEl.alt = `參考圖片：${word}`;
  } catch (e) {
    refImageContainer.style.display = 'none';
    if (refImageLog) refImageLog.textContent = 'exception';
    console.log('[refImage] exception', e);
  }
}

function showAsEnglish() {
  currentDisplayIsEnglish = true;
  wordBaseEl.textContent = currentItem.base;
  wordBaseEl.lang = 'en';
  wordMeaningEl.textContent = '';
}

function showAsChinese() {
  currentDisplayIsEnglish = false;
  wordBaseEl.textContent = currentItem.meaning;
  wordBaseEl.lang = 'zh-Hant';
  wordMeaningEl.textContent = '';
}

// Speak utility: cancel previous then speak text in lang with rate ~0.88
// Voice selection helper with fallbacks. preferredLang may be like 'zh-TW' or 'en-US'.
let voicesCache = [];
function loadVoices() {
  voicesCache = window.speechSynthesis.getVoices() || [];
  if (!voicesCache.length) {
    // some browsers populate voices asynchronously
    window.speechSynthesis.onvoiceschanged = () => {
      voicesCache = window.speechSynthesis.getVoices() || [];
    };
  }
}

function findBestVoice(preferredLang) {
  if (!voicesCache.length) loadVoices();
  const langsToTry = [];
  if (preferredLang) {
    langsToTry.push(preferredLang);
    // push more general fallbacks
    const base = preferredLang.split('-')[0];
    if (base && base !== preferredLang) langsToTry.push(base);
  }
  // generic fallbacks
  langsToTry.push('en-US', 'en', 'zh-TW', 'zh-Hant', 'zh-CN', 'zh');

  for (const ln of langsToTry) {
    const v = voicesCache.find(voice => {
      if (!voice.lang) return false;
      // match exact or startsWith
      if (voice.lang.toLowerCase() === ln.toLowerCase()) return true;
      if (voice.lang.toLowerCase().startsWith(ln.toLowerCase())) return true;
      return false;
    });
    if (v) return v;
  }
  // last resort: return first available
  return voicesCache[0] || null;
}

function speakText(text, preferredLang, attempt = 0) {
  try {
    // cancel any current speech
    try { window.speechSynthesis.cancel(); } catch(e){}

    // ensure voices are loaded
    if (!voicesCache.length) loadVoices();

    // If voices aren't yet available, retry a few times (useful on Android where voices load async)
    const available = (window.speechSynthesis && (window.speechSynthesis.getVoices && window.speechSynthesis.getVoices().length > 0)) || voicesCache.length > 0;
    if (!available && attempt < 6) {
      setTimeout(() => speakText(text, preferredLang, attempt + 1), 250);
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.88; // within required range

    // choose voice if available
    const voice = findBestVoice(preferredLang);
    if (voice) {
      try { utter.voice = voice; } catch(e){}
      try { utter.lang = voice.lang || preferredLang; } catch (e) {}
    } else if (preferredLang) {
      try { utter.lang = preferredLang; } catch (e) {}
    }

    utter.onerror = (ev) => {
      console.warn('TTS error', ev);
      setFeedback('語音播放失敗（TTS）');
    };

    utter.onstart = () => {
      // mark audio as unlocked when TTS starts
      audioUnlocked = true;
    };

    // resume audio context if suspended (some browsers tie audio output permission)
    try { if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(()=>{}); } catch(e){}

    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('語音發生錯誤', e);
    setFeedback('語音發生錯誤');
  }
}

// Ding sound using Web Audio for a short click/ping
let audioCtx = null;
let audioUnlocked = false;
let speechUnlocked = false;

function isPWAMode() {
  try {
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    if (window.navigator && window.navigator.standalone) return true; // iOS
    return false;
  } catch (e) { return false; }
}

function unlockSpeech() {
  if (speechUnlocked) return;
  try {
    if (!voicesCache.length) loadVoices();
    // use zero-width space to avoid audible words; set low volume so it's unobtrusive
    const probe = new SpeechSynthesisUtterance('\u200B');
    probe.volume = 0.01;
    probe.rate = 1.0;
    probe.pitch = 1.0;
    probe.onstart = () => { speechUnlocked = true; };
    probe.onend = () => { speechUnlocked = true; };
    probe.onerror = () => { /* ignore */ };
    try { window.speechSynthesis.speak(probe); } catch (e) { console.warn('unlockSpeech.speak failed', e); }
  } catch (e) {
    console.warn('unlockSpeech failed', e);
  }
}
function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // try to resume if suspended
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(()=>{});
    }
    // some mobile browsers require an actual sound to unlock — play a near-silent quick oscillator
    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.00001, audioCtx.currentTime);
    const o = audioCtx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(200, audioCtx.currentTime);
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.01);
    audioUnlocked = true;
  } catch (e) {
    // ignore — unlocking may fail on some browsers
    console.warn('unlockAudio failed', e);
  }
}
function playDing() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    // try to resume on demand (useful if called on user gesture)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(()=>{});
    }
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(1200, audioCtx.currentTime);
    g.gain.setValueAtTime(0.0001, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.12, audioCtx.currentTime + 0.001);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);
    o.connect(g); g.connect(audioCtx.destination);
    o.start();
    o.stop(audioCtx.currentTime + 0.16);
  } catch (e) {
    // fallback: try short beep via Audio element (none provided)
    console.warn('Ding failed', e);
  }
}

// btnSpeakBase handler: read current question's 原形
function onSpeakBase() {
  if (!currentItem) { setFeedback('目前沒有題目可朗讀。'); return; }
  // 讀出目前畫面上顯示的文字，並使用對應語音
  if (currentDisplayIsEnglish) {
    // 畫面顯示英文：朗讀英文原形
    speakText(currentItem.base, 'en-US');
  } else {
    // 畫面顯示中文：朗讀中文翻譯
    speakText(currentItem.meaning, 'zh-TW');
  }
}

// btnShowForms handler: show translation and auto-speak translation
function onShowForms() {
  if (!currentItem) { setFeedback('目前沒有題目可顯示。'); return; }
  if (currentDisplayIsEnglish) {
    // question shown in English -> show Chinese
    wordMeaningEl.textContent = currentItem.meaning;
    wordMeaningEl.lang = 'zh-Hant';
    speakText(currentItem.meaning, 'zh-TW');
  } else {
    // question shown in Chinese -> show English
    wordMeaningEl.textContent = currentItem.base;
    wordMeaningEl.lang = 'en';
    speakText(currentItem.base, 'en-US');
  }
}

// btnNext handler
function onNext() {
  // If no pool selected, try to start learning phase
  if (!buildPool().length) {
    setFeedback('請至少勾選一個題庫。');
    return;
  }
  // If we haven't initialized learningQueue or user changed selection, (re)start learning phase
  if (!learningQueue.length || learningIndex === 0 && !secondPhase) {
    const started = startLearningPhase();
    if (!started) return;
    return;
  }

  if (!secondPhase) {
    // progress in learning queue
    const had = pickNextLearningQuestion();
    if (!had) {
      // pickNextLearningQuestion will enter second phase
      // still handle sounds for transition
      handleNextSoundBehavior();
      return;
    }
  } else {
    // second phase weighted question
    pickWeightedQuestion();
  }

  // after showing new item, handle sound behavior based on platform and settings
  // try unlocking audio on first user gesture
  try { unlockAudio(); } catch (e) {}
  // If running as PWA, also attempt to unlock speech specifically
  try { if (isPWAMode()) unlockSpeech(); } catch (e) {}
  handleNextSoundBehavior();
}

// Detect mobile device roughly via userAgent
function isMobilePlatform() {
  if (typeof navigator === 'undefined') return false;
  return /Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile/i.test(navigator.userAgent);
}

function handleNextSoundBehavior() {
  // Both desktop and mobile: if auto-speak enabled, only speak (no ding). Otherwise play ding only.
  if (chkAutoSpeak && chkAutoSpeak.checked) {
    onSpeakBase();
  } else {
    playDing();
  }
}

// Autoplay control: start or stop interval
function startAutoplay() {
  stopAutoplay();
  const sec = parseInt((inputAutoplaySec && inputAutoplaySec.value) || 10, 10);
  const ms = Math.max(1000, sec * 1000);
  autoplayIntervalId = setInterval(() => {
    onNext();
  }, ms);
}

function stopAutoplay() {
  if (autoplayIntervalId) {
    clearInterval(autoplayIntervalId);
    autoplayIntervalId = null;
  }
}

// Weakness helpers
function getWeight(id) {
  const w = weaknesses[id];
  return (Number.isInteger(w) && w >= 1 && w <= 5) ? w : 1;
}

// Persist/load weaknesses to localStorage
function loadWeaknesses() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch (e) {
    console.warn('loadWeaknesses failed', e);
  }
  return {};
}

function saveWeaknesses() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(weaknesses || {}));
  } catch (e) {
    console.warn('saveWeaknesses failed', e);
  }
}

function changeWeight(delta) {
  if (!currentItem) { setFeedback('目前沒有題目可標記。'); return; }
  const id = currentItem.id;
  const prev = getWeight(id);
  const next = Math.max(1, Math.min(5, prev + delta));
  weaknesses[id] = next;
  saveWeaknesses();
  formsEl.textContent = `權重：${next}`;
  setFeedback(`已將題目 ${id} 的權重設為 ${next}`);
  updateWeakInfo();
}

// btnMarkHard
function onMarkHard() {
  changeWeight(+1);
}

// btnMarkEasy
function onMarkEasy() {
  changeWeight(-1);
}

// btnResetWeak
function onResetWeak() {
  const ok = confirm('確定要重設所有弱點資料嗎？此操作無法還原。');
  if (!ok) return;
  weaknesses = {};
  saveWeaknesses();
  formsEl.textContent = '';
  updateWeakInfo();
  setFeedback('已重設所有弱點資料。');
}

// update weak info area
function updateWeakInfo() {
  // show summary of number of items with weight>1
  const keys = Object.keys(weaknesses).filter(k => weaknesses[k] > 1);
  if (keys.length) {
    weakStatusEl.textContent = `弱點數量：${keys.length} (查詢鍵: ${Object.keys(weaknesses).length})`;
  } else {
    if (secondPhase) weakStatusEl.textContent = '弱點加強複習中';
    else weakStatusEl.textContent = '';
  }
}

// set feedback message
function setFeedback(msg) {
  feedbackEl.textContent = msg || '';
}

// Event bindings
btnSpeakBase.addEventListener('click', onSpeakBase);
btnShowForms.addEventListener('click', onShowForms);
btnNext.addEventListener('click', onNext);
btnMarkHard.addEventListener('click', onMarkHard);
btnMarkEasy.addEventListener('click', onMarkEasy);
btnResetWeak.addEventListener('click', onResetWeak);

// When pool checkboxes change: reshuffle and immediately show a new question
selSEL15.addEventListener('change', () => {
  // restart learning phase to reshuffle and display immediately
  startLearningPhase();
});
selSEL16.addEventListener('change', () => {
  startLearningPhase();
});

// autoplay checkbox
if (chkAutoplay) {
  chkAutoplay.addEventListener('change', () => {
    if (chkAutoplay.checked) startAutoplay(); else stopAutoplay();
  });
}

// PWA / inline autoplay elements (duplicate controls placed in button bar for installed mode)
const autoplayInline = document.getElementById('autoplayInline');
const chkAutoplayInline = document.getElementById('chkAutoplayInline');
const inputAutoplaySecInline = document.getElementById('inputAutoplaySecInline');
const chkAutoSpeakInline = document.getElementById('chkAutoSpeakInline');

// If running as PWA, mirror controls into inline bar for easier thumb reach.
function enablePWAInlineControls() {
  if (!autoplayInline) return;
  document.documentElement.classList.add('pwa-mode');
  // initialize inline states from primary controls
  if (chkAutoplayInline) chkAutoplayInline.checked = chkAutoplay.checked;
  if (inputAutoplaySecInline) inputAutoplaySecInline.value = inputAutoplaySec.value;
  if (chkAutoSpeakInline) chkAutoSpeakInline.checked = chkAutoSpeak.checked;

  // listeners to inline controls: mirror back to main controls
  if (chkAutoplayInline) {
    chkAutoplayInline.addEventListener('change', () => {
      chkAutoplay.checked = chkAutoplayInline.checked;
      if (chkAutoplay.checked) startAutoplay(); else stopAutoplay();
      if (chkAutoplayInline.checked) setFeedback('已啟用自動播放（PWA）');
    });
  }
  if (inputAutoplaySecInline) {
    inputAutoplaySecInline.addEventListener('change', () => {
      inputAutoplaySec.value = inputAutoplaySecInline.value;
      if (chkAutoplay && chkAutoplay.checked) startAutoplay();
    });
  }
  if (chkAutoSpeakInline) {
    chkAutoSpeakInline.addEventListener('change', () => {
      chkAutoSpeak.checked = chkAutoSpeakInline.checked;
      setFeedback(chkAutoSpeak.checked ? '已啟用自動發音' : '已停用自動發音');
    });
  }
}

// if in PWA/standalone, enable inline controls
if (isPWAMode()) enablePWAInlineControls();

// when user changes interval, restart autoplay if currently enabled
if (inputAutoplaySec) {
  inputAutoplaySec.addEventListener('change', () => {
    if (chkAutoplay && chkAutoplay.checked) {
      startAutoplay();
    }
  });
}

// auto-speak checkbox listener (no other action needed here)
if (chkAutoSpeak) {
  chkAutoSpeak.addEventListener('change', () => {
    setFeedback(chkAutoSpeak.checked ? '已啟用自動發音' : '已停用自動發音');
  });
}

// When display language changed, re-render current display
document.querySelectorAll('input[name="displayLang"]').forEach(r => {
  r.addEventListener('change', () => {
    // reshuffle pool and immediately display a new question when display language changes
    startLearningPhase();
  });
});

// initialize
function init() {
  weaknesses = loadWeaknesses();
  updateWeakInfo();
  // default: select all available pools
  selSEL15.checked = true;
  selSEL16.checked = true;
  if (selSPU7) selSPU7.checked = true;
  // populate counts
  updatePoolCounts();
  // start immediately: build, shuffle, and show the first question
  const started = startLearningPhase();
  if (!started) {
    roundStatusEl.textContent = '請選擇題庫並按「下一題」開始';
    setFeedback('請選擇題庫，然後按「下一題」開始。');
  }
}

init();
