// content.js

// --- 設定エリア ---
const SITES = {
  chatgpt: {
    domain: 'chatgpt.com',
    userMessageSelector: 'div[data-message-author-role="user"]',
    aiMessageSelector: 'div[data-message-author-role="assistant"]'
  },
  claude: {
    domain: 'claude.ai',
    userMessageSelector: '.font-user-message',
    aiMessageSelector: '.font-claude-message'
  },
  gemini: {
    domain: 'gemini.google.com',
    userMessageSelector: '.user-query',
    aiMessageSelector: '.model-response'
  },
  aistudio: {
    domain: 'aistudio.google.com',
    userMessageSelector: 'textarea', 
    aiMessageSelector: 'ms-markdown' 
  }
};

// --- 初期化 ---
const currentHost = window.location.hostname;
let currentSite = null;

if (currentHost.includes('chatgpt')) currentSite = SITES.chatgpt;
else if (currentHost.includes('claude')) currentSite = SITES.claude;
else if (currentHost.includes('gemini')) currentSite = SITES.gemini;
else if (currentHost.includes('aistudio')) currentSite = SITES.aistudio;

const elementTokenCounts = new WeakMap();

// 保存待ちのデータ
let pendingRequests = 0;
let pendingTokens = 0;
let saveIntervalId = null;

/**
 * トークン数推定
 */
function estimateTokens(text) {
  if (!text) return 0;
  let tokenCount = 0;
  const asciiMatches = text.match(/[\x00-\x7F]/g);
  const asciiCount = asciiMatches ? asciiMatches.length : 0;
  const nonAsciiCount = text.length - asciiCount;
  
  tokenCount = (asciiCount / 4) + nonAsciiCount;
  return Math.ceil(tokenCount);
}

/**
 * バッファに追加
 */
function queueStats(reqDelta, tokenDelta) {
  pendingRequests += reqDelta;
  pendingTokens += tokenDelta;
}

/**
 * Chromeストレージへの保存（エラー対策強化版）
 */
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

  try {
    chrome.storage.local.get(['totalRequests', 'totalTokens'], (result) => {
      if (chrome.runtime.lastError) return;

      const data = result || {};
      const currentRequests = data.totalRequests || 0;
      const currentTokens = data.totalTokens || 0;

      chrome.storage.local.set({
        totalRequests: currentRequests + reqToAdd,
        totalTokens: currentTokens + tokensToAdd
      }, () => {
        if (!chrome.runtime.lastError) {
           console.log(`[AI Eco Monitor] Saved: +${reqToAdd} req, +${tokensToAdd} tokens`);
        }
      });
    });
  } catch (e) {
    if (saveIntervalId) clearInterval(saveIntervalId);
  }
}

saveIntervalId = setInterval(flushStats, 2000);

/**
 * ノード処理
 */
function processNode(element, type) {
  // textareaの場合は value を、それ以外は textContent を参照
  let text = element.textContent;
  if (element.tagName === 'TEXTAREA') {
    text = element.value;
  }

  if (!text) return;

  const currentCount = estimateTokens(text);
  const lastCount = elementTokenCounts.get(element) || 0;
  const diff = currentCount - lastCount;

  if (diff <= 0) return;

  elementTokenCounts.set(element, currentCount);

  let reqCount = 0;
  if (type === 'user' && lastCount === 0) {
    reqCount = 1;
  }

  queueStats(reqCount, diff);
}

// --- DOM監視 ---
const observer = new MutationObserver((mutations) => {
  if (!currentSite) return;
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    observer.disconnect();
    return;
  }

  mutations.forEach((mutation) => {
    // 1. 追加ノードの処理
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return; // 要素以外は無視
      
      if (node.matches && node.matches(currentSite.userMessageSelector)) processNode(node, 'user');
      node.querySelectorAll(currentSite.userMessageSelector).forEach(el => processNode(el, 'user'));

      if (node.matches && node.matches(currentSite.aiMessageSelector)) processNode(node, 'ai');
      node.querySelectorAll(currentSite.aiMessageSelector).forEach(el => processNode(el, 'ai'));
    });

    // 2. 変更検知の処理
    let target = mutation.target;
    
    // テキストノードなら親要素を取得
    if (target.nodeType === 3) {
      target = target.parentElement;
    }

    // 【修正】ターゲットが存在し、かつ「要素(Type 1)」である場合のみ closest を実行
    if (target && target.nodeType === 1) {
      const userMsg = target.closest(currentSite.userMessageSelector);
      if (userMsg) processNode(userMsg, 'user');

      const aiMsg = target.closest(currentSite.aiMessageSelector);
      if (aiMsg) processNode(aiMsg, 'ai');
    }
  });
});

// --- 監視開始 ---
function startMonitoring() {
  if (!currentSite) return;
  const targetNode = document.body || document.documentElement;

  if (!targetNode) {
    setTimeout(startMonitoring, 500);
    return;
  }
  
  console.log(`[AI Eco Monitor] Monitoring started on: ${currentSite.domain}`);

  observer.observe(targetNode, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true, // textareaの値変化検知用に追加
    attributeFilter: ['value']
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMonitoring);
} else {
  startMonitoring();
}