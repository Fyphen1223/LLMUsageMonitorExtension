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
  }
};

// --- 初期化 ---
const currentHost = window.location.hostname;
let currentSite = null;

if (currentHost.includes('chatgpt')) currentSite = SITES.chatgpt;
else if (currentHost.includes('claude')) currentSite = SITES.claude;
else if (currentHost.includes('gemini')) currentSite = SITES.gemini;

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
  // script/styleタグ等の混入を防ぐため、単純なカウントに留める
  let tokenCount = 0;
  const asciiMatches = text.match(/[\x00-\x7F]/g);
  const asciiCount = asciiMatches ? asciiMatches.length : 0;
  const nonAsciiCount = text.length - asciiCount;
  
  // 英数:0.25トークン、その他:1トークン
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

  // 【修正】APIが使用可能か厳密にチェック
  // 拡張機能の更新直後などで接続が切れている場合は処理を中断
  if (typeof chrome === 'undefined' || !chrome.storage || !chrome.storage.local) {
    // console.warn("[AI Eco Monitor] Storage connection lost. Waiting for reload...");
    // 接続切れの場合はインターバルを停止してエラーの連発を防ぐ
    if (saveIntervalId) clearInterval(saveIntervalId);
    return;
  }

  const reqToAdd = pendingRequests;
  const tokensToAdd = pendingTokens;

  // バッファをリセット
  pendingRequests = 0;
  pendingTokens = 0;

  try {
    chrome.storage.local.get(['totalRequests', 'totalTokens'], (result) => {
      // コールバック内でランタイムエラーチェック
      if (chrome.runtime.lastError) {
        console.warn("[AI Eco Monitor] Storage error:", chrome.runtime.lastError);
        return;
      }

      const data = result || {};
      const currentRequests = data.totalRequests || 0;
      const currentTokens = data.totalTokens || 0;

      chrome.storage.local.set({
        totalRequests: currentRequests + reqToAdd,
        totalTokens: currentTokens + tokensToAdd
      }, () => {
        // 保存後のエラーチェック
        if (chrome.runtime.lastError) {
           // 無視（リロード時によくあるため）
        } else {
           console.log(`[AI Eco Monitor] Saved: +${reqToAdd} req, +${tokensToAdd} tokens`);
        }
      });
    });
  } catch (e) {
    // 万が一の例外キャッチ
    console.error("[AI Eco Monitor] Save failed:", e);
    if (saveIntervalId) clearInterval(saveIntervalId);
  }
}

// 2秒ごとに保存を実行
saveIntervalId = setInterval(flushStats, 2000);

/**
 * ノード処理
 */
function processNode(element, type) {
  // textContentを使って非表示テキスト（Thinking等）も取得
  const text = element.textContent;
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

  // 拡張機能コンテキストが無効なら停止
  if (typeof chrome === 'undefined' || !chrome.runtime?.id) {
    observer.disconnect();
    return;
  }

  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType !== 1) return;
      
      if (node.matches && node.matches(currentSite.userMessageSelector)) processNode(node, 'user');
      node.querySelectorAll(currentSite.userMessageSelector).forEach(el => processNode(el, 'user'));

      if (node.matches && node.matches(currentSite.aiMessageSelector)) processNode(node, 'ai');
      node.querySelectorAll(currentSite.aiMessageSelector).forEach(el => processNode(el, 'ai'));
    });

    let target = mutation.target;
    if (target.nodeType === 3) target = target.parentElement;

    if (target) {
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
    characterData: true
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMonitoring);
} else {
  startMonitoring();
}