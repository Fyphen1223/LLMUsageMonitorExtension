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
    const avoided = result.totalAvoided || 0;
    const userSettings = result.settings || {};
    const config = { ...DEFAULTS, ...userSettings };

    // 計算
    const waterLiters = (tokens * config.mlPerToken) / 1000;
    const electricityWh = requests * config.whPerRequest;
    const electricityKwh = electricityWh / 1000;
    const co2Kg = electricityKwh * config.kgCo2PerKwh;

	  const metaphorEl = document.getElementById('metaphor-text');
    
    // 比較データの定義 (出典や目安による概算)
    // スマホ充電1回 ≒ 0.005 kWh ≒ 0.004 kg-CO2 と仮定
    // LED電球(10W)1時間 ≒ 0.01 kWh ≒ 0.008 kg-CO2
    // ガソリン車走行1km ≒ 0.13 kg-CO2
    // 杉の木1本の年間吸収量 ≒ 14 kg-CO2 (1日あたり約0.038kg)
    
    let text = "まだ計測データが足りません";
    const emoji = ["📱", "💡", "🚗", "🌲", "☕"];

    if (co2Kg > 0) {
      if (co2Kg < 0.01) {
        // スマホ充電換算
        const charges = (co2Kg / 0.004).toFixed(1);
        text = `📱 スマホ充電 約 <b>${charges}</b> 回分`;
      } else if (co2Kg < 0.1) {
        // LED電球点灯時間
        const hours = (co2Kg / 0.008).toFixed(1);
        text = `💡 LED電球 約 <b>${hours}</b> 時間つけっぱなしと同じ`;
      } else if (co2Kg < 1.0) {
        // ガソリン車走行距離
        const km = (co2Kg / 0.13).toFixed(2);
        text = `🚗 ガソリン車で 約 <b>${km}km</b>走るのと同じ`;
      } else {
        // 杉の木の吸収量(日)
        const days = (co2Kg / 0.038).toFixed(1);
        text = `🌲 杉の木1本が <b>${days}日</b> かけて吸収する量`;
      }
    } else {
      text = "🤖 AIを使って環境負荷を計測しましょう";
    }
    
    metaphorEl.innerHTML = text;
    // ▲▲▲ ここまで追加 ▲▲▲
    
    const waterPrice = waterLiters * (config.yenPerM3 / 1000);
    const elecPrice = electricityWh * (config.yenPerKwh / 1000);

    const savedWh = avoided * config.whPerRequest;
    const savedKwh = savedWh / 1000;
    const savedCo2 = savedKwh * config.kgCo2PerKwh;

    // DOM更新
    document.getElementById('avoided-count').textContent = avoided.toLocaleString();
    document.getElementById('saved-wh').textContent = savedWh.toLocaleString();
    document.getElementById('saved-co2').textContent = savedCo2.toFixed(3);

    document.getElementById('req-count').textContent = requests.toLocaleString();
    document.getElementById('token-count').textContent = tokens.toLocaleString();
    
    document.getElementById('co2-cost').textContent = co2Kg.toFixed(3);
    document.getElementById('water-cost').textContent = waterLiters.toFixed(2);
    document.getElementById('elec-cost').textContent = electricityWh.toLocaleString();

    document.getElementById('water-price').textContent = waterPrice.toFixed(2);
    document.getElementById('elec-price').textContent = elecPrice.toFixed(2);

    // 設定値表示 (存在する場合のみ)
    if(document.getElementById('lbl-co2')) document.getElementById('lbl-co2').textContent = config.kgCo2PerKwh;
  });
}

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

// 設定ボタン
document.getElementById('settings-btn').addEventListener('click', () => {
  if (chrome.runtime.openOptionsPage) {
    chrome.runtime.openOptionsPage().catch(() => {
      chrome.tabs.create({ url: 'options.html' });
    });
  } else {
    chrome.tabs.create({ url: 'options.html' });
  }
});

// リセットボタン
document.getElementById('reset-btn').addEventListener('click', () => {
  if (confirm('統計データをリセットしますか？')) {
    chrome.storage.local.set({
      totalRequests: 0,
      totalTokens: 0,
      totalAvoided: 0
    }, updateUI);
  }
});

// ▼▼▼ 画像保存機能 (PNG Export) ▼▼▼
document.getElementById('share-btn').addEventListener('click', () => {
  const target = document.getElementById('capture-area');
  
  // ボタンの文字を一時的に変更
  const btn = document.getElementById('share-btn');
  const originalText = btn.innerHTML;
  btn.innerHTML = '📸 生成中...';
  btn.disabled = true;

  html2canvas(target, {
    scale: 2, // 高解像度で出力
    backgroundColor: "#f4f7f6", // 背景色を指定
    ignoreElements: (element) => {
      // data-html2canvas-ignore 属性がある要素は除外
      return element.hasAttribute('data-html2canvas-ignore');
    }
  }).then(canvas => {
    // ダウンロードリンクを作成
    const link = document.createElement('a');
    link.download = `ai-eco-stats_${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

    // ボタンを元に戻す
    btn.innerHTML = originalText;
    btn.disabled = false;
  }).catch(err => {
    console.error('Capture failed:', err);
    alert('画像の生成に失敗しました');
    btn.innerHTML = originalText;
    btn.disabled = false;
  });
});