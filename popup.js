// popup.js

const DEFAULTS = {
  whPerRequest: 18,
  mlPerToken: 3.75,
  kgCo2PerKwh: 0.800,
  yenPerKwh: 24,
  yenPerM3: 200
};

function updateUI() {
  chrome.storage.local.get(['totalRequests', 'totalTokens', 'totalAvoided', 'settings'], (result) => {
    
    const requests = result.totalRequests || 0;
    const tokens = result.totalTokens || 0;
    const avoided = result.totalAvoided || 0; // 回避回数

    const userSettings = result.settings || {};
    const config = { ...DEFAULTS, ...userSettings };

    // --- 通常の消費量計算 ---
    const waterLiters = (tokens * config.mlPerToken) / 1000;
    const electricityWh = requests * config.whPerRequest;
    const electricityKwh = electricityWh / 1000;
    const co2Kg = electricityKwh * config.kgCo2PerKwh;

    const waterPrice = waterLiters * (config.yenPerM3 / 1000);
    const elecPrice = electricityWh * (config.yenPerKwh / 1000);

    // --- 削減量の計算（Saved） ---
    // 1回回避 = 1リクエスト分の電力とCO2を削減できたとみなす
    // ※トークン数はメッセージによって異なるため、計算には含めずリクエスト単位で算出
    const savedWh = avoided * config.whPerRequest;
    const savedKwh = savedWh / 1000;
    const savedCo2 = savedKwh * config.kgCo2PerKwh;


    // --- DOM更新 ---

    // 削減実績エリア
    document.getElementById('avoided-count').textContent = avoided.toLocaleString();
    document.getElementById('saved-wh').textContent = savedWh.toLocaleString();
    document.getElementById('saved-co2').textContent = savedCo2.toFixed(3);

    // 通常エリア
    document.getElementById('req-count').textContent = requests.toLocaleString();
    document.getElementById('token-count').textContent = tokens.toLocaleString();
    
    document.getElementById('co2-cost').textContent = co2Kg.toFixed(3);
    document.getElementById('water-cost').textContent = waterLiters.toFixed(2);
    document.getElementById('elec-cost').textContent = electricityWh.toLocaleString();

    document.getElementById('water-price').textContent = waterPrice.toFixed(2);
    document.getElementById('elec-price').textContent = elecPrice.toFixed(2);

    // 設定ラベル
    document.getElementById('lbl-co2').textContent = config.kgCo2PerKwh;
    document.getElementById('lbl-water-yen').textContent = config.yenPerM3;
    document.getElementById('lbl-water-ml').textContent = config.mlPerToken;
    document.getElementById('lbl-elec-yen').textContent = config.yenPerKwh;
    document.getElementById('lbl-elec-wh').textContent = config.whPerRequest;
  });
}

document.addEventListener('DOMContentLoaded', updateUI);

document.getElementById('reload-btn').addEventListener('click', () => {
  updateUI();
  const btn = document.getElementById('reload-btn');
  btn.style.transform = 'rotate(360deg)';
  btn.style.transition = 'transform 0.4s ease';
  setTimeout(() => {
    btn.style.transform = 'none';
    btn.style.transition = 'none';
  }, 400);
});

document.getElementById('settings-btn').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage().catch(() => {
      chrome.tabs.create({ url: 'options.html' });
    });
  } else {
    chrome.tabs.create({ url: 'options.html' });
  }
});

document.getElementById('reset-btn').addEventListener('click', () => {
  if (confirm('統計データをリセットしますか？')) {
    chrome.storage.local.set({
      totalRequests: 0,
      totalTokens: 0,
      totalAvoided: 0 // 削減実績もリセット
    }, () => {
      updateUI();
    });
  }
});