// content.js

// --- 1. サイト別設定 ---
const SITES = {
  chatgpt: {
    domain: 'chatgpt.com',
    userMessageSelector: 'div[data-message-author-role="user"]',
    aiMessageSelector: 'div[data-message-author-role="assistant"]',
    inputSelector: '#prompt-textarea' // テキストエリアID
  },
  claude: {
    domain: 'claude.ai',
    userMessageSelector: '.font-user-message',
    aiMessageSelector: '.font-claude-message',
    inputSelector: 'div[contenteditable="true"]'
  },
  gemini: {
    domain: 'gemini.google.com',
    userMessageSelector: '.user-query, .query-container',
    aiMessageSelector: '.model-response, .response-container',
    inputSelector: 'div[contenteditable="true"]'
  },
  aistudio: {
    domain: 'aistudio.google.com',
    userMessageSelector: 'ms-chat-bubble[is-user], .history-item-user', 
    aiMessageSelector: 'ms-chat-bubble:not([is-user]), .history-item-model',
    inputSelector: 'textarea'
  }
};

const TRIVIAL_WORDS = [
  'ありがとう', 'ありがとうございます', 'サンキュー', '感謝', 
  '了解', '承知', 'わかった', 'ok', 'okay', 'thx', 'thanks', 
  'すごい', 'なるほど', 'はい', 'いいえ', 'yes', 'no',
  'test', 'テスト', 'こんにちは', 'hello', 'hi'
];

const DEFAULTS = {
  whPerRequest: 18,
  kgCo2PerKwh: 0.800,
  dailyLimitCo2: 10, 
  enableNudge: true,
  conciseText: "Please be concise to save energy." // デフォルト
};

const currentHost = window.location.hostname;
let currentSite = null;

if (currentHost.includes('chatgpt')) currentSite = SITES.chatgpt;
else if (currentHost.includes('claude')) currentSite = SITES.claude;
else if (currentHost.includes('gemini')) currentSite = SITES.gemini;
else if (currentHost.includes('aistudio')) currentSite = SITES.aistudio;

const elementTokenCounts = new WeakMap();
let pendingRequests = 0;
let pendingTokens = 0;
let saveIntervalId = null;
let warningElement = null; 
let budgetAlertElement = null;
let ecoFabElement = null; // Auto Conciseボタン

let settings = { ...DEFAULTS };

// --- 設定読み込み ---
function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('settings', (result) => {
      if (result.settings) {
        settings = { ...DEFAULTS, ...result.settings };
      }
      checkDailyBudget();
      // 設定読み込み後にボタンを表示
      if (currentSite) showEcoFab(); 
    });
  }
}
loadSettings();

// --- 日付ヘルパー ---
function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// --- トークン計算 ---
function estimateTokens(text) {
  if (!text) return 0;
  let tokenCount = 0;
  const asciiMatches = text.match(/[\x00-\x7F]/g);
  const asciiCount = asciiMatches ? asciiMatches.length : 0;
  const nonAsciiCount = text.length - asciiCount;
  tokenCount = (asciiCount / 4) + nonAsciiCount;
  return Math.ceil(tokenCount);
}

// --- データ保存 ---
function queueStats(reqDelta, tokenDelta) {
  pendingRequests += reqDelta;
  pendingTokens += tokenDelta;
}

function flushStats() {
  if (pendingRequests === 0 && pendingTokens === 0) return;
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    if (saveIntervalId) clearInterval(saveIntervalId);
    return;
  }
  const reqToAdd = pendingRequests;
  const tokensToAdd = pendingTokens;
  pendingRequests = 0;
  pendingTokens = 0;

  chrome.storage.local.get(['dailyStats', 'totalRequests', 'totalTokens'], (result) => {
    if (chrome.runtime.lastError) return;
    
    let currentTotalRequests = result.totalRequests || 0;
    let currentTotalTokens = result.totalTokens || 0;
    currentTotalRequests += reqToAdd;
    currentTotalTokens += tokensToAdd;

    const stats = result.dailyStats || {};
    const today = getTodayKey();
    if (!stats[today]) stats[today] = { requests: 0, tokens: 0 };
    stats[today].requests += reqToAdd;
    stats[today].tokens += tokensToAdd;

    chrome.storage.local.set({
      totalRequests: currentTotalRequests,
      totalTokens: currentTotalTokens,
      dailyStats: stats
    }, checkDailyBudget);
  });
}
saveIntervalId = setInterval(flushStats, 2000);

// --- ノード解析 ---
function processNode(element, type) {
  let text = element.textContent;
  if (element.tagName === 'TEXTAREA') return; 
  if (!text) return;

  const currentCount = estimateTokens(text);
  const lastCount = elementTokenCounts.get(element) || 0;
  const diff = currentCount - lastCount;

  if (diff <= 0) return;

  elementTokenCounts.set(element, currentCount);
  let reqCount = 0;
  if (type === 'user' && lastCount === 0) reqCount = 1;
  queueStats(reqCount, diff);
}

// --- ナッジ ---
function incrementAvoidedCount() {
  chrome.storage.local.get(['totalAvoided'], (result) => {
    const current = result.totalAvoided || 0;
    chrome.storage.local.set({ totalAvoided: current + 1 });
  });
}

function analyzeWastefulVibe(text) {
  const cleanText = text.trim();
  if (cleanText.length === 0) return null;
  if (cleanText.length >= 4 && /(.)\1{3,}/.test(cleanText)) return "文字の連打は無駄です。";
  const symbolRatio = (cleanText.match(/[!-/:-@[-`{-~]/g) || []).length / cleanText.length;
  if (cleanText.length >= 3 && symbolRatio > 0.8) return "記号が多すぎます。";
  if (cleanText.length >= 4 && /^[a-zA-Z0-9]+$/.test(cleanText)) {
    const vowelCount = (cleanText.match(/[aeiouAEIOU]/g) || []).length;
    if (vowelCount / cleanText.length < 0.1) return "意味のない文字列です。";
  }
  if (/^[\p{Emoji}\p{Symbol}\s]+$/u.test(cleanText)) return "絵文字のみの送信もコスト増です。";
  if (cleanText.length < 20 && TRIVIAL_WORDS.some(w => cleanText.toLowerCase().includes(w))) return "短い挨拶は控えましょう。";
  if (cleanText.length <= 5) return "短すぎます。まとめて指示を。";
  return null;
}

function showWarning(targetElement, message) {
  if (!warningElement) {
    warningElement = document.createElement('div');
    Object.assign(warningElement.style, {
      position: 'absolute', backgroundColor: '#2c3e50', color: '#ecf0f1',
      padding: '10px 14px', borderRadius: '8px', fontSize: '12px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.3)', zIndex: '10000',
      maxWidth: '280px', pointerEvents: 'none', transition: 'opacity 0.2s',
      opacity: '0', borderLeft: '4px solid #e74c3c'
    });
    document.body.appendChild(warningElement);
  }
  warningElement.innerHTML = `<div style="font-weight:bold;color:#e74c3c;">🌎 Eco Alert</div><div>${message}</div>`;
  const rect = targetElement.getBoundingClientRect();
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  warningElement.style.top = `${rect.top + scrollTop - warningElement.offsetHeight - 12}px`;
  warningElement.style.left = `${rect.left}px`;
  requestAnimationFrame(() => warningElement.style.opacity = '1');
}

function hideWarning() {
  if (warningElement) warningElement.style.opacity = '0';
}

let isWarningActive = false;
function checkInputForNudge(target) {
  if (!settings.enableNudge) return;
  let text = (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') ? target.value : (target.innerText || target.textContent);
  const warningMessage = analyzeWastefulVibe(text);
  if (warningMessage) {
    if (!isWarningActive) isWarningActive = true;
    showWarning(target, warningMessage);
  } else {
    if (isWarningActive) {
      if (text.trim().length === 0) incrementAvoidedCount();
      isWarningActive = false;
    }
    hideWarning();
  }
}

// --- バジェットアラート ---
function showBudgetAlert(percentage, limit) {
  if (!budgetAlertElement) {
    budgetAlertElement = document.createElement('div');
    Object.assign(budgetAlertElement.style, {
      position: 'fixed', top: '15px', right: '15px', backgroundColor: '#e74c3c', color: 'white',
      padding: '12px 16px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: '2147483647',
      fontSize: '13px', display: 'flex', alignItems: 'center', gap: '10px',
      transform: 'translateX(200px)', transition: 'transform 0.3s ease-out', cursor: 'default'
    });
    const closeBtn = document.createElement('span');
    closeBtn.innerHTML = '&times;';
    closeBtn.style.cssText = 'cursor:pointer; font-size:18px; font-weight:bold; margin-left:5px;';
    closeBtn.onclick = () => {
      budgetAlertElement.style.transform = 'translateX(200px)'; 
      setTimeout(() => { budgetAlertElement.dataset.dismissed = 'true'; }, 300);
    };
    const content = document.createElement('div');
    content.className = 'alert-content';
    budgetAlertElement.appendChild(content);
    budgetAlertElement.appendChild(closeBtn);
    document.body.appendChild(budgetAlertElement);
  }

  if (budgetAlertElement.dataset.dismissed !== 'true') {
    const contentDiv = budgetAlertElement.querySelector('.alert-content');
    contentDiv.innerHTML = `<div style="font-weight:bold;margin-bottom:2px;">⚠️ Daily Limit Exceeded</div><div>Goal: ${limit}g<br>Current: <b>${percentage.toFixed(0)}%</b></div>`;
    requestAnimationFrame(() => budgetAlertElement.style.transform = 'translateX(0)');
  }
}

function checkDailyBudget() {
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) return;
  chrome.storage.local.get(['dailyStats'], (result) => {
    const stats = result.dailyStats || {};
    const today = getTodayKey();
    if (!stats[today]) return;
    const reqs = stats[today].requests || 0;
    const wh = reqs * settings.whPerRequest;
    const kgCo2 = (wh / 1000) * settings.kgCo2PerKwh;
    const gCo2 = kgCo2 * 1000;
    const limit = settings.dailyLimitCo2 || 10;
    if (gCo2 > limit) showBudgetAlert((gCo2 / limit) * 100, limit);
  });
}
setInterval(checkDailyBudget, 5000);


// --- ▼▼▼ 新機能: Auto Concise ボタン ▼▼▼ ---

/**
 * Auto Conciseボタンを作成して表示する
 */
function showEcoFab() {
  if (document.getElementById('ai-eco-fab')) return; // すでに存在すれば作成しない

  ecoFabElement = document.createElement('button');
  ecoFabElement.id = 'ai-eco-fab';
  ecoFabElement.innerHTML = '🌱 Concise';
  ecoFabElement.title = 'Click to insert: "Please be concise to save energy."';
  
  // スタイル (画面左下または右下に固定)
  Object.assign(ecoFabElement.style, {
    position: 'fixed',
    bottom: '20px',
    right: '20px', // 右下
    zIndex: '9999',
    backgroundColor: '#27ae60',
    color: 'white',
    border: 'none',
    borderRadius: '20px',
    padding: '8px 16px',
    fontSize: '13px',
    fontWeight: 'bold',
    boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
    cursor: 'pointer',
    transition: 'transform 0.2s, background 0.2s'
  });

  // ホバー効果
  ecoFabElement.onmouseenter = () => ecoFabElement.style.transform = 'scale(1.05)';
  ecoFabElement.onmouseleave = () => ecoFabElement.style.transform = 'scale(1)';
  ecoFabElement.onclick = handleEcoFabClick;

  document.body.appendChild(ecoFabElement);
}

/**
 * ボタンクリック時の動作: 入力欄にテキストを追記
 */
function handleEcoFabClick() {
  if (!currentSite) return;
  
  // 入力欄を探す
  const inputEl = document.querySelector(currentSite.inputSelector);
  if (!inputEl) {
    alert('入力欄が見つかりませんでした');
    return;
  }

  const appendText = "\n" + (settings.conciseText || "Please be concise to save energy.");

  // アニメーション (クリックした感触)
  ecoFabElement.innerHTML = '✅ Added!';
  setTimeout(() => ecoFabElement.innerHTML = '🌱 Concise', 1500);

  // テキスト挿入処理 (サイトの仕組みに合わせて分岐)
  if (inputEl.tagName === 'TEXTAREA') {
    // ChatGPT / AI Studio等
    inputEl.value += appendText;
    // React等に値の変化を通知するためのイベント発火
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.focus();
  } else if (inputEl.isContentEditable) {
    // Claude / Gemini等 (div contenteditable)
    // 単純な追記だとReactが検知しない場合があるが、まずはtextContentへの追記を試みる
    // より確実なのは document.execCommand だが非推奨。
    // ここでは現代的なアプローチとして textContent操作 + inputイベント発火を行う
    
    // 既存のテキストの末尾に追加
    // ※Geminiなどはpタグ構造を持つため、末尾のpタグ内に入れるのが理想だが、
    // 簡易的に末尾にテキストノードを追加する
    inputEl.textContent += appendText;
    
    inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    inputEl.focus();
    
    // カーソルを末尾に移動 (UX向上)
    const range = document.createRange();
    const sel = window.getSelection();
    range.selectNodeContents(inputEl);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);
  }
}


// --- 監視実行 ---
const observer = new MutationObserver((mutations) => {
  if (!currentSite) return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) { observer.disconnect(); return; }

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      if (!node.matches) return;
      if (node.matches(currentSite.userMessageSelector)) processNode(node, 'user');
      node.querySelectorAll(currentSite.userMessageSelector).forEach(el => processNode(el, 'user'));
      if (node.matches(currentSite.aiMessageSelector)) processNode(node, 'ai');
      node.querySelectorAll(currentSite.aiMessageSelector).forEach(el => processNode(el, 'ai'));
    });
    let target = mutation.target;
    if (target.nodeType === 3) target = target.parentElement;
    if (target && target.nodeType === 1 && target.matches) {
      const userMsg = target.closest(currentSite.userMessageSelector);
      if (userMsg) processNode(userMsg, 'user');
      const aiMsg = target.closest(currentSite.aiMessageSelector);
      if (aiMsg) processNode(aiMsg, 'ai');
    }
  });
});

function startMonitoring() {
  if (!currentSite) return;
  const targetNode = document.body || document.documentElement;
  if (!targetNode) { setTimeout(startMonitoring, 500); return; }
  
  console.log(`[AI Eco Monitor] Start: ${currentSite.domain}`);
  observer.observe(targetNode, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['value']
  });
  document.body.addEventListener('input', (e) => {
    const t = e.target;
    if (t.isContentEditable || t.tagName === 'TEXTAREA') checkInputForNudge(t);
  }, { capture: true, passive: true });

  checkDailyBudget();
  // ★ボタン表示
  showEcoFab();
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.onChanged.addListener((c, a) => {
    if (a === 'local' && c.settings) {
      settings = { ...settings, ...c.settings.newValue };
      checkDailyBudget();
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', startMonitoring);
else startMonitoring();