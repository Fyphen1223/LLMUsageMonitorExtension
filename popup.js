// popup.js

// デフォルト設定 (ユーザー設定がない場合に使用)
const DEFAULTS = {
  whPerRequest: 18,
  mlPerToken: 3.75,
  kgCo2PerKwh: 0.800,
  yenPerKwh: 24,
  yenPerM3: 200
};

function updateUI() {
  // 'settings' も一緒に取得する
  chrome.storage.local.get(['totalRequests', 'totalTokens', 'settings'], (result) => {
    
    // データ取得（なければ0）
    const requests = result.totalRequests || 0;
    const tokens = result.totalTokens || 0;

    // 設定取得（保存されたものがあれば使い、なければデフォルトをマージ）
    const userSettings = result.settings || {};
    const config = { ...DEFAULTS, ...userSettings };

    // --- 計算 ---

    // 水 (リットル) = トークン数 * (ml/Token) / 1000
    const waterLiters = (tokens * config.mlPerToken) / 1000;
    
    // 電気 (Wh) = リクエスト数 * (Wh/Request)
    const electricityWh = requests * config.whPerRequest;

    // CO2 (kg) = (Wh / 1000) * (kg/kWh)
    const electricityKwh = electricityWh / 1000;
    const co2Kg = electricityKwh * config.kgCo2PerKwh;

    // 金額
    // 水道代 (円) = リットル * (円/m3 / 1000)
    const waterPrice = waterLiters * (config.yenPerM3 / 1000);
    // 電気代 (円) = Wh * (円/kWh / 1000)
    const elecPrice = electricityWh * (config.yenPerKwh / 1000);

    // --- DOM更新 ---

    // メイン数値
    document.getElementById('req-count').textContent = requests.toLocaleString();
    document.getElementById('token-count').textContent = tokens.toLocaleString();
    
    document.getElementById('co2-cost').textContent = co2Kg.toFixed(3);
    document.getElementById('water-cost').textContent = waterLiters.toFixed(2);
    document.getElementById('elec-cost').textContent = electricityWh.toLocaleString();

    document.getElementById('water-price').textContent = waterPrice.toFixed(2);
    document.getElementById('elec-price').textContent = elecPrice.toFixed(2);

    // 設定値のラベル表示（現在の設定値がわかるように）
    document.getElementById('lbl-co2').textContent = config.kgCo2PerKwh;
    document.getElementById('lbl-water-yen').textContent = config.yenPerM3;
    document.getElementById('lbl-water-ml').textContent = config.mlPerToken;
    document.getElementById('lbl-elec-yen').textContent = config.yenPerKwh;
    document.getElementById('lbl-elec-wh').textContent = config.whPerRequest;
  });
}

// 初期表示
document.addEventListener('DOMContentLoaded', updateUI);

// 更新ボタン
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

// 設定ボタン (オプションページを開く)
// 設定ボタン (より確実に開くための修正版)
document.getElementById('settings-btn').addEventListener('click', () => {
  // 標準のAPIを試す
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage().catch(() => {
      // 失敗したらタブとして強制的に開く
      chrome.tabs.create({ url: 'options.html' });
    });
  } else {
    // APIがない場合もタブとして開く
    chrome.tabs.create({ url: 'options.html' });
  }
});

// リセットボタン
document.getElementById('reset-btn').addEventListener('click', () => {
  if (confirm('統計データをリセットしますか？\n(設定値は保持されます)')) {
    chrome.storage.local.set({
      totalRequests: 0,
      totalTokens: 0
    }, () => {
      updateUI();
    });
  }
});