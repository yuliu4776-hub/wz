// ===== SCANNER VIEW =====
const SCANNER_READER_ID = 'scannerReader';
const SCANNER_FILE_READER_ID = 'scannerFileReader';
const BARCODE_FORMAT_NAMES = [
  'QR_CODE', 'CODE_128', 'CODE_39', 'CODE_93', 'CODABAR',
  'EAN_13', 'EAN_8', 'ITF', 'UPC_A', 'UPC_E'
];
const BARCODE_DETECTOR_FORMATS = [
  'qr_code', 'code_128', 'code_39', 'code_93', 'codabar',
  'ean_13', 'ean_8', 'itf', 'upc_a', 'upc_e'
];

let scannerStream = null;
let scannerAnimFrame = null;
let barcodeDetector = null;
let barcodeScanBusy = false;
let html5Scanner = null;
let html5FileScanner = null;
let html5ScannerRunning = false;
let scannerBackendTimer = null;
let scannerBackendBusy = false;
let scannerLastValue = '';
let scannerLastAt = 0;
let scannerTorchOn = false;

function renderScanner() {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:12px">扫码识别机器人</h3>
      <div class="scanner-wrap scanner-reader-wrap">
        <div id="${SCANNER_READER_ID}" class="scanner-reader">
          <video id="scannerVideo" autoplay playsinline muted></video>
        </div>
        <div class="scanner-overlay"></div>
        <div class="scanner-line"></div>
      </div>
      <div class="scanner-status" id="scannerStatus">正在启动摄像头...</div>
      <div class="scanner-controls">
        <select id="scannerCameraSelect" class="scanner-camera-select" aria-label="选择摄像头">
          <option value="">自动选择后置摄像头</option>
        </select>
        <button class="btn btn-secondary btn-sm" id="scannerTorchBtn" onclick="toggleScannerTorch()" disabled>闪光灯</button>
        <label class="btn btn-secondary btn-sm scanner-file-btn">
          图片识别
          <input id="scannerFileInput" type="file" accept="image/*" onchange="scanBarcodeImage(this.files[0])">
        </label>
        <button class="btn btn-secondary btn-sm" onclick="scanSampleBarcodeImage()">识别示例</button>
      </div>
      <div class="btn-group" style="justify-content:center">
        <button class="btn btn-secondary" onclick="stopScanner();showView('list')">关闭扫码</button>
      </div>
      <div id="${SCANNER_FILE_READER_ID}" class="scanner-hidden-reader"></div>
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
  if (window.AppObs) window.AppObs.log('scanner:view-rendered', {
    html5Qrcode: Boolean(window.Html5Qrcode),
    barcodeDetector: Boolean(window.BarcodeDetector),
  });
  startScanner();
}

async function startScanner() {
  const status = document.getElementById('scannerStatus');
  if (!status) return;

  resetScannerDuplicateGuard();
  await stopScanner();

  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    status.innerHTML = '摄像头不可用：需要 HTTPS 安全连接<br><small style="color:var(--text3)">请使用 HTTPS 地址访问，或使用下方手动输入功能</small>';
    return;
  }

  if (window.Html5Qrcode) {
    const started = await startHtml5Scanner();
    if (started) return;
  }

  await startLegacyScanner();
}

async function startHtml5Scanner() {
  const status = document.getElementById('scannerStatus');
  const cameraSelect = document.getElementById('scannerCameraSelect');
  if (!status || !cameraSelect || !window.Html5Qrcode) return false;

  try {
    html5Scanner = html5Scanner || createHtml5Scanner(SCANNER_READER_ID);
    await loadScannerCameras();

    const cameraConfig = cameraSelect.value || { facingMode: 'environment' };
    await html5Scanner.start(
      cameraConfig,
      getHtml5ScannerConfig(),
      onHtml5ScanSuccess,
      onHtml5ScanFailure
    );

    html5ScannerRunning = true;
    cameraSelect.disabled = true;
    status.textContent = '请将二维码或条形码对准摄像头';
    startBackendFrameScan();
    updateScannerTorchAvailability();

    if (window.AppObs) window.AppObs.log('scanner:html5-started');
    return true;
  } catch (e) {
    if (window.AppObs) window.AppObs.warn('scanner:html5-start-failed', {
      message: e && e.message ? e.message : String(e),
    });
    await stopHtml5Scanner();
    return false;
  }
}

async function startLegacyScanner() {
  const video = document.getElementById('scannerVideo');
  const status = document.getElementById('scannerStatus');
  if (!video || !status) return;

  try {
    scannerStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } }
    });
    video.srcObject = scannerStream;
    await video.play();
    barcodeDetector = await createBarcodeDetector();
    if (window.AppObs) window.AppObs.log('scanner:legacy-camera-started', {
      barcodeDetector: Boolean(barcodeDetector),
    });
    status.textContent = barcodeDetector ? '请将二维码或条形码对准摄像头' : '请将二维码对准摄像头（条形码将尝试本地后端兜底）';
    updateScannerTorchAvailability();

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    function scan() {
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        const maxW = 900;
        const scale = video.videoWidth > maxW ? maxW / video.videoWidth : 1;
        canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
        canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        if (typeof jsQR === 'function') {
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) {
            handleScanResultOnce(code.data);
            return;
          }
        }

        if (barcodeDetector && !barcodeScanBusy) {
          barcodeScanBusy = true;
          barcodeDetector.detect(video)
            .then(codes => {
              barcodeScanBusy = false;
              if (!scannerStream) return;
              if (codes && codes.length) handleScanResultOnce(codes[0].rawValue);
            })
            .catch(() => { barcodeScanBusy = false; });
        }
      }
      scannerAnimFrame = requestAnimationFrame(scan);
    }

    startBackendFrameScan();
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

async function stopScanner() {
  await stopHtml5Scanner();

  if (scannerStream) {
    scannerStream.getTracks().forEach(t => t.stop());
    scannerStream = null;
  }
  if (scannerAnimFrame) {
    cancelAnimationFrame(scannerAnimFrame);
    scannerAnimFrame = null;
  }
  stopBackendFrameScan();
  barcodeScanBusy = false;
  barcodeDetector = null;
  scannerTorchOn = false;
  const torchBtn = document.getElementById('scannerTorchBtn');
  if (torchBtn) {
    torchBtn.disabled = true;
    torchBtn.textContent = '闪光灯';
  }
  const cameraSelect = document.getElementById('scannerCameraSelect');
  if (cameraSelect) cameraSelect.disabled = false;
  if (window.AppObs) window.AppObs.log('scanner:stopped');
}

async function stopHtml5Scanner() {
  if (!html5Scanner) {
    html5ScannerRunning = false;
    return;
  }

  try {
    if (html5ScannerRunning) await html5Scanner.stop();
    await html5Scanner.clear();
  } catch {
    // Stopping can race with browser camera teardown; ignore.
  } finally {
    html5ScannerRunning = false;
  }
}

function onHtml5ScanSuccess(decodedText, decodedResult) {
  if (window.AppObs) window.AppObs.log('scanner:html5-result', {
    format: getHtml5FormatName(decodedResult),
  });
  handleScanResultOnce(decodedText);
}

function onHtml5ScanFailure() {
  // html5-qrcode emits this frequently while scanning; keep UI quiet.
}

function handleScanResultOnce(value) {
  const normalized = normalizeScanValue(value);
  const now = Date.now();
  if (!normalized || (scannerLastValue === normalized && now - scannerLastAt < 1200)) return;
  scannerLastValue = normalized;
  scannerLastAt = now;
  handleScanResult(normalized);
}

function resetScannerDuplicateGuard() {
  scannerLastValue = '';
  scannerLastAt = 0;
}

function createHtml5Scanner(targetId) {
  const formatsToSupport = getHtml5Formats();
  const options = formatsToSupport.length ? { formatsToSupport } : {};
  return new Html5Qrcode(targetId, options);
}

function getHtml5Formats() {
  if (!window.Html5QrcodeSupportedFormats) return [];
  return BARCODE_FORMAT_NAMES
    .map(name => window.Html5QrcodeSupportedFormats[name])
    .filter(format => format !== undefined);
}

function getHtml5ScannerConfig() {
  return {
    fps: 12,
    qrbox: getScannerScanBox(),
    disableFlip: false,
    rememberLastUsedCamera: true,
  };
}

function getScannerScanBox() {
  const wrap = document.querySelector('.scanner-wrap');
  const width = Math.min((wrap && wrap.clientWidth ? wrap.clientWidth : window.innerWidth) - 40, 420);
  return {
    width: Math.max(240, width),
    height: Math.max(180, Math.round(width * 0.62)),
  };
}

function getHtml5FormatName(decodedResult) {
  const format =
    decodedResult?.result?.format?.formatName ||
    decodedResult?.result?.format ||
    decodedResult?.format;
  return normalizeBarcodeFormat(format || 'BARCODE');
}

async function loadScannerCameras() {
  const cameraSelect = document.getElementById('scannerCameraSelect');
  if (!cameraSelect || !window.Html5Qrcode?.getCameras) return;

  try {
    const cameras = await Html5Qrcode.getCameras();
    cameraSelect.innerHTML = '<option value="">自动选择后置摄像头</option>';

    cameras.forEach((camera, index) => {
      const option = document.createElement('option');
      option.value = camera.id;
      option.textContent = camera.label || `摄像头 ${index + 1}`;
      cameraSelect.append(option);
    });

    const backCamera = cameras.find(camera => /back|rear|environment|后置|背面/i.test(camera.label || ''));
    if (backCamera) cameraSelect.value = backCamera.id;
  } catch {
    cameraSelect.innerHTML = '<option value="">自动选择后置摄像头</option>';
  }
}

async function createBarcodeDetector() {
  if (!('BarcodeDetector' in window)) {
    if (window.AppObs) window.AppObs.warn('scanner:barcode-detector-unavailable');
    return null;
  }
  try {
    const formats = await getNativeBarcodeFormats();
    return formats.length ? new BarcodeDetector({ formats }) : new BarcodeDetector();
  } catch {
    try { return new BarcodeDetector(); } catch { return null; }
  }
}

async function getNativeBarcodeFormats() {
  if (!window.BarcodeDetector?.getSupportedFormats) return BARCODE_DETECTOR_FORMATS;
  const supported = await window.BarcodeDetector.getSupportedFormats();
  return BARCODE_DETECTOR_FORMATS.filter(format => supported.includes(format));
}

async function toggleScannerTorch() {
  const track = getScannerVideoTrack();
  const torchBtn = document.getElementById('scannerTorchBtn');
  if (!track?.applyConstraints || !torchBtn) return;

  try {
    scannerTorchOn = !scannerTorchOn;
    await track.applyConstraints({ advanced: [{ torch: scannerTorchOn }] });
    torchBtn.textContent = scannerTorchOn ? '关灯' : '闪光灯';
  } catch {
    scannerTorchOn = false;
    torchBtn.textContent = '闪光灯';
    torchBtn.disabled = true;
    showToast('当前浏览器不支持网页控制闪光灯');
  }
}

function updateScannerTorchAvailability() {
  const torchBtn = document.getElementById('scannerTorchBtn');
  if (!torchBtn) return;
  const track = getScannerVideoTrack();
  const supportsTorch = Boolean(track?.getCapabilities?.().torch);
  torchBtn.disabled = !supportsTorch;
}

function getScannerVideoTrack() {
  if (scannerStream) return scannerStream.getVideoTracks()[0] || null;
  const reader = document.getElementById(SCANNER_READER_ID);
  const video = reader ? reader.querySelector('video') : document.getElementById('scannerVideo');
  return video?.srcObject?.getVideoTracks?.()[0] || null;
}

async function scanBarcodeImage(file) {
  if (!file) return;

  const input = document.getElementById('scannerFileInput');
  const status = document.getElementById('scannerStatus');
  if (status) status.textContent = '正在识别图片...';

  try {
    const result = await decodeBarcodeImageFile(file);
    if (!result) throw new Error('图片中没有识别到条形码或二维码');

    if (window.AppObs) window.AppObs.log('scanner:image-result', {
      format: result.format,
      source: result.source,
    });
    handleScanResultOnce(result.text);
  } catch (e) {
    if (window.AppObs) window.AppObs.warn('scanner:image-failed', {
      message: e && e.message ? e.message : String(e),
    });
    showToast(e.message || '图片识别失败');
    if (status) status.textContent = '图片识别失败，可继续摄像头扫描或手动输入';
  } finally {
    if (input) input.value = '';
  }
}

async function scanSampleBarcodeImage() {
  try {
    const response = await fetch('条形码.jpg');
    if (!response.ok) throw new Error('无法读取示例图片');
    const blob = await response.blob();
    const file = new File([blob], '条形码.jpg', { type: blob.type || 'image/jpeg' });
    await scanBarcodeImage(file);
  } catch (e) {
    showToast(e.message || '示例图片识别失败');
  }
}

async function decodeBarcodeImageFile(file) {
  const variants = await createBarcodeImageVariants(file);
  const nativeResult = await decodeImageWithNativeDetector(variants);
  if (nativeResult) return nativeResult;

  const html5Result = await decodeImageWithHtml5Qrcode(variants);
  if (html5Result) return html5Result;

  return decodeImageWithBackend(variants);
}

async function createBarcodeImageVariants(file) {
  const bitmap = await createImageBitmap(file);
  const rotations = [0, 90, 180, 270];
  const variants = [];

  for (const degrees of rotations) {
    const canvas = drawBarcodeBitmap(bitmap, degrees);
    variants.push({
      label: degrees === 0 ? '原图' : `旋转${degrees}度`,
      canvas,
      file: await barcodeCanvasToFile(canvas, `barcode-${degrees}.png`),
    });
  }

  bitmap.close?.();
  return variants;
}

function drawBarcodeBitmap(bitmap, degrees) {
  const halfTurn = degrees % 180 === 0;
  const sourceWidth = bitmap.width;
  const sourceHeight = bitmap.height;
  const rotatedWidth = halfTurn ? sourceWidth : sourceHeight;
  const rotatedHeight = halfTurn ? sourceHeight : sourceWidth;
  const maxSide = 2600;
  const scale = Math.min(1, maxSide / Math.max(rotatedWidth, rotatedHeight));

  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(rotatedWidth * scale));
  canvas.height = Math.max(1, Math.round(rotatedHeight * scale));

  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate((degrees * Math.PI) / 180);
  ctx.drawImage(
    bitmap,
    -(sourceWidth * scale) / 2,
    -(sourceHeight * scale) / 2,
    sourceWidth * scale,
    sourceHeight * scale
  );

  return canvas;
}

function barcodeCanvasToFile(canvas, name) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => {
      if (!blob) {
        reject(new Error('图片处理失败'));
        return;
      }
      resolve(new File([blob], name, { type: 'image/png' }));
    }, 'image/png');
  });
}

async function decodeImageWithNativeDetector(variants) {
  if (!('BarcodeDetector' in window)) return null;

  try {
    const formats = await getNativeBarcodeFormats();
    if (!formats.length) return null;

    const detector = new BarcodeDetector({ formats });
    for (const variant of variants) {
      const detections = await detector.detect(variant.canvas);
      if (!detections.length) continue;

      return {
        text: detections[0].rawValue,
        format: normalizeBarcodeFormat(detections[0].format),
        source: `${variant.label} 原生识别`,
      };
    }
  } catch {
    return null;
  }

  return null;
}

async function decodeImageWithHtml5Qrcode(variants) {
  if (!window.Html5Qrcode) return null;

  html5FileScanner = html5FileScanner || createHtml5Scanner(SCANNER_FILE_READER_ID);
  for (const variant of variants) {
    try {
      const decodedText = await html5FileScanner.scanFile(variant.file, false);
      if (decodedText) {
        return {
          text: decodedText,
          format: 'ZXING',
          source: `${variant.label} ZXing`,
        };
      }
    } catch {
      // Try the next rotated image.
    }
  }

  return null;
}

async function decodeImageWithBackend(variants) {
  for (const variant of variants) {
    try {
      const result = await postBarcodeImage(variant.canvas.toDataURL('image/jpeg', 0.92));
      if (!result) continue;
      return {
        text: result.text,
        format: normalizeBarcodeFormat(result.format || 'PYZBAR'),
        source: `${variant.label} 本地后端`,
      };
    } catch {
      // The local backend is optional.
    }
  }
  return null;
}

async function postBarcodeImage(image) {
  const response = await fetch('/decode-barcode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image }),
  });

  if (!response.ok) return null;

  const payload = await response.json();
  if (!payload.ok || !payload.results?.length) return null;
  return payload.results[0];
}

function startBackendFrameScan() {
  stopBackendFrameScan();
  scannerBackendTimer = window.setInterval(scanCurrentFrameWithBackend, 1000);
}

function stopBackendFrameScan() {
  if (scannerBackendTimer) {
    window.clearInterval(scannerBackendTimer);
    scannerBackendTimer = null;
  }
  scannerBackendBusy = false;
}

async function scanCurrentFrameWithBackend() {
  if (scannerBackendBusy) return;

  const video = getScannerVideoElement();
  if (!video || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;

  scannerBackendBusy = true;
  try {
    const canvas = captureScannerFrame(video);
    const result = await postBarcodeImage(canvas.toDataURL('image/jpeg', 0.82));
    if (result) handleScanResultOnce(result.text);
  } catch {
    // Backend frame scanning is a quiet fallback path.
  } finally {
    scannerBackendBusy = false;
  }
}

function getScannerVideoElement() {
  const reader = document.getElementById(SCANNER_READER_ID);
  return reader?.querySelector('video') || document.getElementById('scannerVideo');
}

function captureScannerFrame(video) {
  const maxSide = 1280;
  const sourceWidth = video.videoWidth || video.clientWidth || 640;
  const sourceHeight = video.videoHeight || video.clientHeight || 480;
  const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sourceWidth * scale));
  canvas.height = Math.max(1, Math.round(sourceHeight * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function normalizeBarcodeFormat(format) {
  return String(format || 'BARCODE').replace(/_/g, '-').toUpperCase();
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
