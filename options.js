// options.js

const DEFAULTS = {
  whPerRequest: 18,
  mlPerToken: 3.75,
  kgCo2PerKwh: 0.800,
  yenPerKwh: 24,
  yenPerM3: 200,
  enableNudge: true,
  dailyLimitCo2: 10,
  conciseText: "Please be concise to save energy." // デフォルト文言
};

function saveOptions() {
  const settings = {
    whPerRequest: parseFloat(document.getElementById('whPerRequest').value),
    mlPerToken: parseFloat(document.getElementById('mlPerToken').value),
    kgCo2PerKwh: parseFloat(document.getElementById('kgCo2PerKwh').value),
    yenPerKwh: parseFloat(document.getElementById('yenPerKwh').value),
    yenPerM3: parseFloat(document.getElementById('yenPerM3').value),
    enableNudge: document.getElementById('enableNudge').checked,
    dailyLimitCo2: parseFloat(document.getElementById('dailyLimitCo2').value),
    
    // ▼ 新規追加
    conciseText: document.getElementById('conciseText').value
  };

  chrome.storage.local.set({ settings: settings }, () => {
    const status = document.getElementById('status');
    status.textContent = '設定を保存しました！';
    setTimeout(() => { status.textContent = ''; }, 2000);
  });
}

function restoreOptions() {
  chrome.storage.local.get('settings', (result) => {
    const settings = result.settings || DEFAULTS;

    document.getElementById('whPerRequest').value = settings.whPerRequest ?? DEFAULTS.whPerRequest;
    document.getElementById('mlPerToken').value = settings.mlPerToken ?? DEFAULTS.mlPerToken;
    document.getElementById('kgCo2PerKwh').value = settings.kgCo2PerKwh ?? DEFAULTS.kgCo2PerKwh;
    document.getElementById('yenPerKwh').value = settings.yenPerKwh ?? DEFAULTS.yenPerKwh;
    document.getElementById('yenPerM3').value = settings.yenPerM3 ?? DEFAULTS.yenPerM3;
    document.getElementById('enableNudge').checked = settings.enableNudge ?? DEFAULTS.enableNudge;
    document.getElementById('dailyLimitCo2').value = settings.dailyLimitCo2 ?? DEFAULTS.dailyLimitCo2;
    
    // ▼ 新規追加
    document.getElementById('conciseText').value = settings.conciseText ?? DEFAULTS.conciseText;
  });
}

document.addEventListener('DOMContentLoaded', restoreOptions);
document.getElementById('save').addEventListener('click', saveOptions);