// options.js

// デフォルト値の定義
const DEFAULTS = {
  whPerRequest: 18,
  mlPerToken: 3.75,
  kgCo2PerKwh: 0.800,
  yenPerKwh: 24,
  yenPerM3: 200
};

// 設定を保存
function saveOptions() {
  const settings = {
    whPerRequest: parseFloat(document.getElementById('whPerRequest').value),
    mlPerToken: parseFloat(document.getElementById('mlPerToken').value),
    kgCo2PerKwh: parseFloat(document.getElementById('kgCo2PerKwh').value),
    yenPerKwh: parseFloat(document.getElementById('yenPerKwh').value),
    yenPerM3: parseFloat(document.getElementById('yenPerM3').value)
  };

  chrome.storage.local.set({ settings: settings }, () => {
    const status = document.getElementById('status');
    status.textContent = '設定を保存しました！';
    setTimeout(() => {
      status.textContent = '';
    }, 2000);
  });
}

// 設定を読み込み
function restoreOptions() {
  chrome.storage.local.get('settings', (result) => {
    const settings = result.settings || DEFAULTS;

    document.getElementById('whPerRequest').value = settings.whPerRequest ?? DEFAULTS.whPerRequest;
    document.getElementById('mlPerToken').value = settings.mlPerToken ?? DEFAULTS.mlPerToken;
    document.getElementById('kgCo2PerKwh').value = settings.kgCo2PerKwh ?? DEFAULTS.kgCo2PerKwh;
    document.getElementById('yenPerKwh').value = settings.yenPerKwh ?? DEFAULTS.yenPerKwh;
    document.getElementById('yenPerM3').value = settings.yenPerM3 ?? DEFAULTS.yenPerM3;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);