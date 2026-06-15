// ===== SCANNER VIEW =====
function renderScanner() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:12px">扫码识别机器人</h3>
      <div class="scanner-wrap">
        <video id="scannerVideo" autoplay playsinline muted></video>
        <div class="scanner-overlay"></div>
      </div>
      <div class="scanner-status" id="scannerStatus">正在启动摄像头...</div>
      <div class="btn-group" style="justify-content:center">
        <button class="btn btn-secondary" onclick="stopScanner();showView('list')">关闭扫码</button>
      </div>
    </div>
    <div id="scanResult" style="display:none"></div>
    <div class="card">
      <h3 style="margin-bottom:8px">手动输入</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:8px">如果扫码不便，可直接输入编号或条形码内容查找</p>
      <div style="display:flex;gap:8px">
        <input type="text" id="manualSearch" placeholder="输入出厂编号或条形码..." style="flex:1" onkeydown="if(event.key==='Enter')manualFind()">
        <button class="btn btn-primary" onclick="manualFind()">查找</button>
      </div>
    </div>
  `;
  if (window.AppObs) window.AppObs.log('scanner:view-rendered');
  startScanner();
}

let scannerStream = null;
let scannerAnimFrame = null;
let barcodeDetector = null;
let barcodeScanBusy = false;

const BARCODE_FORMATS = [
  'code_128', 'code_39', 'code_93', 'codabar',
  'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e'
];

async function startScanner() {
  const video = document.getElementById('scannerVideo');
  const status = document.getElementById('scannerStatus');
  if (!video || !status) return;

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.innerHTML = '摄像头不可用：需要 HTTPS 安全连接<br><small style="color:var(--text3)">请使用 HTTPS 地址访问，或使用下方手动输入功能</small>';
    return;
  }

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 640 }, height: { ideal: 480 } }
    });
    video.srcObject = scannerStream;
    await video.play();
    barcodeDetector = createBarcodeDetector();
    if (window.AppObs) window.AppObs.log('scanner:camera-started', {
      barcodeDetector: Boolean(barcodeDetector),
    });
    status.textContent = barcodeDetector ? '请将二维码或条形码对准摄像头' : '请将二维码对准摄像头（此浏览器不支持摄像头条形码识别）';

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    function scan() {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const maxW = 800;
        const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
        canvas.width = video.videoWidth * scale;
        canvas.height = video.videoHeight * scale;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);

        if (code) {
          handleScanResult(code.data);
          return;
        }

        if (barcodeDetector && !barcodeScanBusy) {
          barcodeScanBusy = true;
          barcodeDetector.detect(video)
            .then(codes => {
              barcodeScanBusy = false;
              if (!scannerStream) return;
              if (codes && codes.length) {
                handleScanResult(codes[0].rawValue);
              }
            })
            .catch(() => { barcodeScanBusy = false; });
        }
      }
      scannerAnimFrame = requestAnimationFrame(scan);
    }
    scan();
  } catch (e) {
    if (window.AppObs) window.AppObs.error('scanner:camera-failed', e);
    let msg = '无法访问摄像头';
    if (e.name === 'NotAllowedError') msg = '摄像头权限被拒绝，请在浏览器设置中允许摄像头访问';
    else if (e.name === 'NotFoundError') msg = '未找到摄像头设备';
    else msg = '摄像头错误: ' + e.message;
    status.innerHTML = msg + '<br><small style="color:var(--text3)">可使用下方手动输入功能</small><br><button class="btn btn-secondary btn-sm" style="margin-top:8px" onclick="startScanner()">重试</button>';
  }
}

function stopScanner() {
  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  if (scannerAnimFrame) {
    cancelAnimationFrame(scannerAnimFrame);
    scannerAnimFrame = null;
  }
  barcodeScanBusy = false;
  barcodeDetector = null;
  if (window.AppObs) window.AppObs.log('scanner:stopped');
}

function createBarcodeDetector() {
  if (!('BarcodeDetector' in window)) {
    if (window.AppObs) window.AppObs.warn('scanner:barcode-detector-unavailable');
    return null;
  }
  try {
    if (window.BarcodeDetector.getSupportedFormats) {
      window.BarcodeDetector.getSupportedFormats()
        .then(formats => {
          const supported = BARCODE_FORMATS.filter(f => formats.includes(f));
          if (supported.length) barcodeDetector = new BarcodeDetector({ formats: supported });
        })
        .catch(() => {});
    }
    return new BarcodeDetector({ formats: BARCODE_FORMATS });
  } catch {
    try { return new BarcodeDetector(); } catch { return null; }
  }
}

function handleScanResult(data) {
  stopScanner();

  // Try to parse as URL with id param
  let robotId = normalizeScanValue(data);
  if (window.AppObs) window.AppObs.log('scanner:scan-result', { raw: robotId });
  try {
    const url = new URL(data);
    robotId = normalizeScanValue(url.searchParams.get('id') || data);
  } catch {}

  const robot = findRobotByScanValue(robotId);

  if (robot) {
    if (window.AppObs) window.AppObs.log('scanner:robot-found', {
      id: robot.id,
      type: robot.type,
      serial: robot.serial,
    });
    if (navigator.vibrate) navigator.vibrate(200);
    showScanResult(robot);
  } else {
    if (window.AppObs) window.AppObs.warn('scanner:robot-not-found', { value: robotId });
    showToast('未找到匹配的机器人: ' + robotId);
    restartScanner();
  }
}

function normalizeScanValue(value) {
  return String(value == null ? '' : value).trim();
}

function findRobotByScanValue(value) {
  const robotId = normalizeScanValue(value);
  if (!robotId) return null;

  // Decode the composite ID
  const parts = robotId.split('__');
  if (parts.length === 2) {
    const robot = robots.find(r => r.type === parts[0] && r.serial === parts[1]);
    if (robot) return robot;
  }

  return robots.find(r => r.serial === robotId || r.id === robotId) ||
    robots.find(r => String(r.serial || '').includes(robotId));
}

function showScanResult(robot) {
  const resultEl = document.getElementById('scanResult');
  if (!resultEl) return;

  const statusOpts = getStatuses().map(s =>
    `<option value="${escapeHtml(s)}" ${robot.status===s?'selected':''}>${escapeHtml(s)}</option>`
  ).join('');

  resultEl.innerHTML = `
    <div class="card" style="margin:0;border:2px solid var(--green);animation:slideUp .3s ease">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
        <div>
          <strong style="font-size:15px">${escapeHtml(robot.type)}</strong>
          <span class="serial" style="margin-left:6px;font-size:13px;color:var(--text3)">${escapeHtml(robot.serial)}</span>
        </div>
        <span class="badge ${statusClass(robot.status)}">${escapeHtml(robot.status)}</span>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <label style="font-size:12px;color:var(--text3);white-space:nowrap">位置:</label>
        <input id="scanLocation" value="${escapeHtml(robot.location||'')}" placeholder="当前位置" style="flex:1;padding:8px 10px;font-size:13px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)">
        <button class="btn btn-secondary btn-sm" onclick="applyScanLocation('${esc(robot.id)}')">保存</button>
      </div>
      <div style="display:flex;gap:8px;align-items:center;margin-bottom:10px">
        <label style="font-size:12px;color:var(--text3);white-space:nowrap">改状态:</label>
        <select id="scanStatus" style="flex:1;padding:8px 10px;font-size:13px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)">${statusOpts}</select>
        <button class="btn btn-primary btn-sm" onclick="applyScanStatus('${esc(robot.id)}')">应用</button>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn btn-secondary btn-sm" style="flex:1" onclick="showDetail(robots.find(x=>x.id==='${esc(robot.id)}'),()=>{showView('scanner')})">查看详情</button>
        <button class="btn btn-primary btn-sm" style="flex:1" onclick="restartScanner()">继续扫描</button>
      </div>
    </div>
  `;
  resultEl.style.display = 'block';
}

async function applyScanStatus(robotId) {
  const select = document.getElementById('scanStatus');
  if (!select) return;
  const newStatus = select.value;
  const robot = robots.find(r => r.id === robotId);
  if (!robot) return;

  const oldState = { ...robot };
  robot.status = newStatus;
  robot.borrowed = newStatus === '借出中';

  await saveChangeLog(robotId, oldState, robot);
  const ok = await saveToSupabase(robot);
  if (ok) {
    showScanResult(robot); // refresh the card
  }
}

async function applyScanLocation(robotId) {
  const input = document.getElementById('scanLocation');
  if (!input) return;
  const newLocation = input.value.trim();
  const robot = robots.find(r => r.id === robotId);
  if (!robot) return;

  const oldState = { ...robot };
  robot.location = newLocation;

  await saveChangeLog(robotId, oldState, robot);
  const ok = await saveToSupabase(robot);
  if (ok) {
    showScanResult(robot);
    showToast('位置已更新');
  }
}

function restartScanner() {
  const resultEl = document.getElementById('scanResult');
  if (resultEl) { resultEl.style.display = 'none'; resultEl.innerHTML = ''; }
  startScanner();
}

function manualFind() {
  const input = document.getElementById('manualSearch');
  if (!input) return;
  const val = input.value.trim();
  if (!val) return;

  const robot = findRobotByScanValue(val);
  if (robot) {
    showDetail(robot);
  } else {
    showToast('未找到编号为 ' + val + ' 的机器人');
  }
}
