// content.js

// --- 1. サイト別設定 ---
const SITES = {
  chatgpt: {
    domain: 'chatgpt.com',
    userMessageSelector: 'div[data-message-author-role="user"]',
    aiMessageSelector: 'div[data-message-author-role="assistant"]',
    inputSelector: '#prompt-textarea'
  },
  claude: {
    domain: 'claude.ai',
    userMessageSelector: '.font-user-message',
    aiMessageSelector: '.font-claude-message',
    inputSelector: 'div[contenteditable="true"]'
  },
  gemini: {
    domain: 'gemini.google.com',
    userMessageSelector: '.user-query',
    aiMessageSelector: '.model-response',
    inputSelector: 'div[contenteditable="true"]'
  },
  aistudio: {
    domain: 'aistudio.google.com',
    userMessageSelector: 'textarea', 
    aiMessageSelector: 'ms-markdown',
    inputSelector: 'textarea'
  }
};

const TRIVIAL_WORDS = [
  'ありがとう', 'ありがとうございます', 'サンキュー', '感謝', 
  '了解', '承知', 'わかった', 'ok', 'okay', 'thx', 'thanks', 
  'すごい', 'なるほど', 'はい', 'いいえ', 'yes', 'no',
  'test', 'テスト', 'こんにちは', 'hello', 'hi'
];

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

// ナッジの状態管理用フラグ
let isWarningActive = false; 

let settings = {
  enableNudge: true
};

function loadSettings() {
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get('settings', (result) => {
      if (result.settings) {
        settings = { ...settings, ...result.settings };
      }
    });
  }
}
loadSettings();

function estimateTokens(text) {
  if (!text) return 0;
  let tokenCount = 0;
  const asciiMatches = text.match(/[\x00-\x7F]/g);
  const asciiCount = asciiMatches ? asciiMatches.length : 0;
  const nonAsciiCount = text.length - asciiCount;
  tokenCount = (asciiCount / 4) + nonAsciiCount;
  return Math.ceil(tokenCount);
}

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

  try {
    chrome.storage.local.get(['totalRequests', 'totalTokens'], (result) => {
      if (chrome.runtime.lastError) return;
      const data = result || {};
      chrome.storage.local.set({
        totalRequests: (data.totalRequests || 0) + reqToAdd,
        totalTokens: (data.totalTokens || 0) + tokensToAdd
      });
    });
  } catch (e) {
    if (saveIntervalId) clearInterval(saveIntervalId);
  }
}
saveIntervalId = setInterval(flushStats, 2000);

function processNode(element, type) {
  let text = element.textContent;
  if (element.tagName === 'TEXTAREA') text = element.value;
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

// --- ナッジ＆削減カウント機能 ---

function incrementAvoidedCount() {
  chrome.storage.local.get(['totalAvoided'], (result) => {
    const current = result.totalAvoided || 0;
    chrome.storage.local.set({ totalAvoided: current + 1 }, () => {
      console.log(`[AI Eco Monitor] Waste avoided! Count: ${current + 1}`);
    });
  });
}

function analyzeWastefulVibe(text) {
  const cleanText = text.trim();
  if (cleanText.length === 0) return null;

  if (cleanText.length >= 4 && /(.)\1{3,}/.test(cleanText)) {
    return "文字の連打はAIにとって意味のある情報になりにくいです。";
  }
  const symbolRatio = (cleanText.match(/[!-/:-@[-`{-~]/g) || []).length / cleanText.length;
  if (cleanText.length >= 3 && symbolRatio > 0.8) {
    return "記号が多すぎます。具体的な言葉で指示しましょう。";
  }
  if (cleanText.length >= 4 && /^[a-zA-Z0-9]+$/.test(cleanText)) {
    const vowelCount = (cleanText.match(/[aeiouAEIOU]/g) || []).length;
    if (vowelCount / cleanText.length < 0.1) {
      return "意味のない文字列に見えます。正確な指示を入力してください。";
    }
  }
  if (/^[\p{Emoji}\p{Symbol}\s]+$/u.test(cleanText)) {
    return "絵文字のみの送信も、会話履歴の再処理コストがかかります。";
  }
  if (cleanText.length < 20) {
    const lower = cleanText.toLowerCase();
    const isTrivial = TRIVIAL_WORDS.some(word => lower.includes(word));
    if (isTrivial) {
      return "短い挨拶やお礼は環境負荷になります。心の中で感謝しましょう！";
    }
  }
  if (cleanText.length <= 5) {
    return "メッセージが短すぎます。具体的な指示をまとめて送るほうがエコです。";
  }

  return null;
}

function showWarning(targetElement, message) {
  if (!warningElement) {
    warningElement = document.createElement('div');
    Object.assign(warningElement.style, {
      position: 'absolute',
      backgroundColor: '#2c3e50',
      color: '#ecf0f1',
      padding: '10px 14px',
      borderRadius: '8px',
      fontSize: '12px',
      boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
      zIndex: '10000',
      maxWidth: '280px',
      pointerEvents: 'none',
      transition: 'opacity 0.2s, transform 0.2s',
      opacity: '0',
      transform: 'translateY(10px)',
      lineHeight: '1.5',
      borderLeft: '4px solid #e74c3c'
    });
    document.body.appendChild(warningElement);
  }

  warningElement.innerHTML = `
    <div style="font-weight:bold; margin-bottom:4px; color:#e74c3c;">🌎 Eco Alert</div>
    <div>${message}</div>
  `;

  const rect = targetElement.getBoundingClientRect();
  const scrollTop = window.scrollY || document.documentElement.scrollTop;
  warningElement.style.top = `${rect.top + scrollTop - warningElement.offsetHeight - 12}px`;
  warningElement.style.left = `${rect.left}px`;
  
  requestAnimationFrame(() => {
    warningElement.style.opacity = '1';
    warningElement.style.transform = 'translateY(0)';
  });
}

function hideWarning() {
  if (warningElement) {
    warningElement.style.opacity = '0';
    warningElement.style.transform = 'translateY(10px)';
  }
}

function checkInputForNudge(target) {
  if (!settings.enableNudge) return;

  let text = '';
  if (target.tagName === 'TEXTAREA' || target.tagName === 'INPUT') {
    text = target.value;
  } else {
    text = target.innerText || target.textContent;
  }

  const warningMessage = analyzeWastefulVibe(text);

  if (warningMessage) {
    // 警告を表示
    if (!isWarningActive) isWarningActive = true;
    showWarning(target, warningMessage);
  } else {
    // 警告を消す条件
    if (isWarningActive) {
      // もし警告が出ていた状態で、テキストが空（長さ0）になったなら
      // 「警告を見て送信をやめた」と判断してカウントアップ
      if (text.trim().length === 0) {
        incrementAvoidedCount();
        
        // "Good job!" 的なエフェクトを一瞬出すとより良いですが今回は省略
      }
      isWarningActive = false;
    }
    hideWarning();
  }
}

const observer = new MutationObserver((mutations) => {
  if (!currentSite) return;
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
    if (target && target.nodeType === 1) {
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
  
  console.log(`[AI Eco Monitor] Monitoring started on: ${currentSite.domain}`);

  observer.observe(targetNode, {
    childList: true, subtree: true, characterData: true,
    attributes: true, attributeFilter: ['value']
  });

  document.body.addEventListener('input', (e) => {
    const target = e.target;
    const isEditable = target.isContentEditable || target.tagName === 'TEXTAREA';
    if (isEditable) {
       checkInputForNudge(target);
    }
  }, { capture: true, passive: true });
}

if (typeof chrome !== 'undefined' && chrome.storage) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.settings) {
      settings = { ...settings, ...changes.settings.newValue };
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', startMonitoring);
} else {
  startMonitoring();
}