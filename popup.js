// popup.js

const DEFAULTS = {
  whPerRequest: 18,
  mlPerToken: 3.75,
  kgCo2PerKwh: 0.800,
  yenPerKwh: 24,
  yenPerM3: 200,
  dailyLimitCo2: 10
};

function getTodayKey() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getLast7DaysKeys() {
  const keys = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    keys.push(`${year}-${month}-${day}`);
  }
  return keys;
}

function formatDateLabel(dateStr) {
  const parts = dateStr.split('-');
  return `${parts[1]}/${parts[2]}`;
}

function updateUI() {
  // totalRequests と totalTokens も一緒に取得
  chrome.storage.local.get(['dailyStats', 'totalRequests', 'totalTokens', 'totalAvoided', 'settings'], (result) => {
    
    // ★ここを修正: 計算ではなく、保存値を直接使う
    const totalRequests = result.totalRequests || 0;
    const totalTokens = result.totalTokens || 0;
    
    const dailyStats = result.dailyStats || {};
    const avoided = result.totalAvoided || 0;
    const userSettings = result.settings || {};
    const config = { ...DEFAULTS, ...userSettings };

    // 今日のデータ（バジェット用）
    const todayKey = getTodayKey();
    const todayData = dailyStats[todayKey] || { requests: 0 };
    const todayRequests = todayData.requests || 0;

    // --- 全体のCO2・コスト計算 ---
    const electricityWh = totalRequests * config.whPerRequest;
    const electricityKwh = electricityWh / 1000;
    const co2Kg = electricityKwh * config.kgCo2PerKwh;
    
    const waterLiters = (totalTokens * config.mlPerToken) / 1000;
    const waterPrice = waterLiters * (config.yenPerM3 / 1000);
    const elecPrice = electricityWh * (config.yenPerKwh / 1000);

    const savedWh = avoided * config.whPerRequest;
    const savedCo2 = (savedWh / 1000) * config.kgCo2PerKwh;

    // --- 機能1: エコ・バジェット (今日の進捗) ---
    const todayWh = todayRequests * config.whPerRequest;
    const todayCo2Kg = (todayWh / 1000) * config.kgCo2PerKwh;
    const todayCo2Grams = todayCo2Kg * 1000;
    const limitGrams = config.dailyLimitCo2;
    
    let percent = (todayCo2Grams / limitGrams) * 100;
    if (percent > 100) percent = 100;

    document.getElementById('budget-percent').textContent = percent.toFixed(0);
    document.getElementById('budget-limit-val').textContent = limitGrams;
    const bar = document.getElementById('budget-bar');
    bar.style.width = `${percent}%`;
    if (percent < 50) bar.style.background = 'linear-gradient(90deg, #2ecc71, #27ae60)';
    else if (percent < 80) bar.style.background = 'linear-gradient(90deg, #f1c40f, #f39c12)';
    else bar.style.background = 'linear-gradient(90deg, #e74c3c, #c0392b)';

    // --- 機能2: 日次グラフ ---
    const graphContainer = document.getElementById('daily-graph');
    graphContainer.innerHTML = '';
    const last7Days = getLast7DaysKeys();
    let maxReq = 0;
    
    // グラフの最大値計算
    last7Days.forEach(key => {
      if (dailyStats[key] && dailyStats[key].requests > maxReq) maxReq = dailyStats[key].requests;
    });
    if (maxReq < 10) maxReq = 10;

    last7Days.forEach(key => {
      const data = dailyStats[key] || { requests: 0 };
      const req = data.requests;
      const heightPercent = (req / maxReq) * 100;
      
      const barGroup = document.createElement('div');
      barGroup.className = 'bar-group';
      
      const barDiv = document.createElement('div');
      barDiv.className = 'bar';
      if (key === todayKey) barDiv.classList.add('today-bar');
      barDiv.style.height = `${Math.max(heightPercent, 2)}%`;
      barDiv.title = `${key}: ${req} requests`;

      const labelDiv = document.createElement('div');
      labelDiv.className = 'bar-label';
      labelDiv.textContent = formatDateLabel(key);

      barGroup.appendChild(barDiv);
      barGroup.appendChild(labelDiv);
      graphContainer.appendChild(barGroup);
    });

    // --- メイン数値表示 ---
    document.getElementById('req-count').textContent = totalRequests.toLocaleString();
    document.getElementById('token-count').textContent = totalTokens.toLocaleString();
    document.getElementById('co2-cost').textContent = co2Kg.toFixed(3);
    document.getElementById('avoided-count').textContent = avoided.toLocaleString();
    document.getElementById('saved-co2').textContent = savedCo2.toFixed(3);
    
    document.getElementById('water-cost').textContent = waterLiters.toFixed(2);
    document.getElementById('elec-cost').textContent = electricityWh.toLocaleString();
    document.getElementById('water-price').textContent = waterPrice.toFixed(2);
    document.getElementById('elec-price').textContent = elecPrice.toFixed(2);

    // --- 例え表示 ---
    const metaphorEl = document.getElementById('metaphor-text');
    if (co2Kg < 0.01) metaphorEl.innerHTML = `📱 スマホ充電 ${(co2Kg/0.004).toFixed(1)}回分`;
    else if (co2Kg < 1.0) metaphorEl.innerHTML = `🚗 ガソリン車 ${(co2Kg/0.13).toFixed(2)}km分`;
    else metaphorEl.innerHTML = `🌲 杉の木吸収 ${(co2Kg/0.038).toFixed(1)}日分`;

  });
}

document.addEventListener('DOMContentLoaded', updateUI);
document.getElementById('reload-btn').addEventListener('click', updateUI);
document.getElementById('settings-btn').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) chrome.runtime.openOptionsPage().catch(() => chrome.tabs.create({ url: 'options.html' }));
  else chrome.tabs.create({ url: 'options.html' });
});
document.getElementById('reset-btn').addEventListener('click', () => {
  if (confirm('全ての履歴データをリセットしますか？')) {
    chrome.storage.local.set({ dailyStats: {}, totalAvoided: 0, totalRequests: 0, totalTokens: 0 }, updateUI);
  }
});
document.getElementById('share-btn').addEventListener('click', () => {
  const target = document.getElementById('capture-area');
  const btn = document.getElementById('share-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '📸...';
  btn.disabled = true;
  html2canvas(target, { scale: 2, backgroundColor: "#f4f7f6", ignoreElements: (el) => el.hasAttribute('data-html2canvas-ignore') }).then(canvas => {
    const link = document.createElement('a');
    link.download = `eco-monitor_${getTodayKey()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    btn.innerHTML = originalText;
    btn.disabled = false;
  });
});