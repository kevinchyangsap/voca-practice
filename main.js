// main.js

// Data sets (題庫)
const SEL15Verbs = [
  { base: "bike", meaning: "腳踏車" },
  { base: "inline skates", meaning: "直排溜冰鞋" },
  { base: "kite", meaning: "風箏" },
  { base: "skateboard", meaning: "滑板" },
  { base: "soccer ball", meaning: "足球" },
];

const abaVerbs = [
  { base: "kite", meaning: "風箏" },
  { base: "windy", meaning: "有風的／刮風的" },
  { base: "scissor", meaning: "剪刀" },
  { base: "glue stick", meaning: "膠棒" },
];

// DOM elements (IDs required by the spec)
const selSEL15 = document.getElementById('SEL15');
const selSEL16 = document.getElementById('SEL16');

const wordBaseEl = document.getElementById('wordBase');
const wordMeaningEl = document.getElementById('wordMeaning');
const formsEl = document.getElementById('forms');
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

const LOCAL_KEY = 'verb-practice-weakness-v2';

// Runtime state
let weaknesses = {}; // { "SEL15:bike": 2, ... }
let learningQueue = []; // first stage shuffled array of items
let learningIndex = 0;
let secondPhase = false;
let recentIds = []; // last 3 ids
let currentItem = null; // { id, base, meaning, source }
let currentDisplayIsEnglish = true;

// Utility: safe localStorage read
function loadWeaknesses() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) return parsed;
    return {};
  } catch (e) {
    console.warn('讀取弱點資料失敗，使用空資料。', e);
    return {};
  }
}

function saveWeaknesses() {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(weaknesses));
  } catch (e) {
    console.warn('儲存弱點資料失敗。', e);
  }
}

// Fisher-Yates shuffle
function shuffle(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// Build pool from selected checkboxes
function buildPool() {
  const pool = [];
  if (selSEL15.checked) {
    SEL15Verbs.forEach(v => {
      pool.push({ id: `SEL15:${v.base}`, base: v.base, meaning: v.meaning, source: 'SEL15' });
    });
  }
  if (selSEL16.checked) {
    abaVerbs.forEach(v => {
      pool.push({ id: `SEL16:${v.base}`, base: v.base, meaning: v.meaning, source: 'SEL16' });
    });
  }
  return pool;
}

// Start or restart the learning phase
function startLearningPhase() {
  const pool = buildPool();
  if (!pool.length) {
    setFeedback('請至少勾選一個題庫（SEL15 或 SEL16）。');
    return false;
  }
  // initialize learning queue: shuffle and set index
  learningQueue = pool.slice();
  shuffle(learningQueue);
  learningIndex = 0;
  secondPhase = false;
  updateRoundStatus();
  weakStatusEl.textContent = '';
  setFeedback('');
  // start with first question
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
    setFeedback('請至少勾選一個題庫（SEL15 或 SEL16）。');
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
    setFeedback('請至少勾選一個題庫（SEL15 或 SEL16）。');
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
function speakText(text, lang) {
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    utter.lang = lang;
    utter.rate = 0.88;
    window.speechSynthesis.speak(utter);
  } catch (e) {
    console.warn('語音發生錯誤', e);
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
  if (!selSEL15.checked && !selSEL16.checked) {
    setFeedback('請至少勾選一個題庫（SEL15 或 SEL16）。');
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
      return;
    }
  } else {
    // second phase weighted question
    pickWeightedQuestion();
  }
}

// Weakness helpers
function getWeight(id) {
  const w = weaknesses[id];
  return (Number.isInteger(w) && w >= 1 && w <= 5) ? w : 1;
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

// Also re-run learning phase when user toggles pool checkboxes (to reflect change)
selSEL15.addEventListener('change', () => {
  // prepare learning queue when toggling checkboxes
  prepareLearningQueue();
});
selSEL16.addEventListener('change', () => {
  prepareLearningQueue();
});

// When display language changed, re-render current display
document.querySelectorAll('input[name="displayLang"]').forEach(r => {
  r.addEventListener('change', () => {
    if (!currentItem) return;
    // re-show current item according to new preference
    const mode = document.querySelector('input[name="displayLang"]:checked')?.value || 'en';
    if (mode === 'en') showAsEnglish();
    else if (mode === 'zh') showAsChinese();
    else {
      // random: pick randomly for the current item (but keep current state predictable)
      if (Math.random() < 0.5) showAsEnglish(); else showAsChinese();
    }
  });
});

// initialize
function init() {
  weaknesses = loadWeaknesses();
  updateWeakInfo();
  // pre-check SEL15 by default for convenience
  if (!selSEL15.checked && !selSEL16.checked) {
    selSEL15.checked = true;
  }
  // prepare initial learning queue but don't auto-advance until user presses 下一題
  prepareLearningQueue();
  roundStatusEl.textContent = '請選擇題庫並按「下一題」開始';
  setFeedback('請選擇題庫，然後按「下一題」開始。');
}

init();
