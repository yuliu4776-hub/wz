// ===== LABELS VIEW =====
function renderLabels() {
  const app = document.getElementById('app');
  const types = getTypes();
  const statuses = getStatuses();
  app.innerHTML = `
    <div class="card no-print">
      <h3 style="margin-bottom:8px">二维码标签生成</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px">选择需要生成标签的机器人，然后生成二维码。</p>
      <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <select id="labelTypeFilter" onchange="updateLabelList()" style="padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);font-size:13px">
          <option value="">全部类型</option>
          ${types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
        </select>
        <select id="labelStatusFilter" onchange="updateLabelList()" style="padding:10px 14px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);font-size:13px">
          <option value="">全部状态</option>
          <option value="!已出库" selected>排除已出库</option>
          ${statuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
        </select>
      </div>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">
        <button class="btn btn-secondary btn-sm" onclick="toggleLabelSelectAll()">全选/取消</button>
        <span id="labelSelectedCount" style="font-size:13px;color:var(--text3)">已选 0 个</span>
      </div>
      <div id="labelRobotList" style="max-height:300px;overflow-y:auto;border:1px solid var(--border);border-radius:var(--radius);margin-bottom:12px"></div>
      <div class="btn-group" style="margin-top:0">
        <button class="btn btn-primary" id="labelGenerateBtn" onclick="generateSelectedLabels()">生成选中标签 (0个)</button>
        <button class="btn btn-secondary" onclick="window.print()">打印</button>
      </div>
    </div>
    <div id="labelsContainer" class="labels-grid"></div>
  `;
  updateLabelList();
}

function getFilteredLabelRobots() {
  const typeFilter = document.getElementById('labelTypeFilter')?.value || '';
  const statusVal = document.getElementById('labelStatusFilter')?.value || '';

  return robots.filter(r => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusVal === '!已出库') { if (r.status === '已出库') return false; }
    else if (statusVal && r.status !== statusVal) return false;
    return true;
  });
}

function updateLabelList() {
  const list = document.getElementById('labelRobotList');
  if (!list) return;

  const filtered = getFilteredLabelRobots();

  if (!filtered.length) {
    list.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text3);font-size:13px">无匹配机器人</div>';
    updateLabelBtnCount();
    return;
  }

  list.innerHTML = filtered.map(r => `
    <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid var(--surface3);cursor:pointer;font-size:13px">
      <input type="checkbox" class="label-check" data-id="${escapeHtml(r.id)}" checked onchange="updateLabelBtnCount()" style="appearance:none;width:18px;height:18px;border:1.5px solid var(--border-light);border-radius:3px;cursor:pointer;flex-shrink:0;background:#fff">
      <span style="color:var(--text2)">${escapeHtml(r.type)}</span>
      <span class="serial" style="font-size:12px">${escapeHtml(r.serial)}</span>
      <span class="badge ${statusClass(r.status)}" style="margin-left:auto;font-size:11px">${escapeHtml(r.status)}</span>
    </label>
  `).join('');

  updateLabelBtnCount();
}

function toggleLabelSelectAll() {
  const checks = document.querySelectorAll('.label-check');
  const allChecked = Array.from(checks).every(cb => cb.checked);
  checks.forEach(cb => { cb.checked = !allChecked; });
  updateLabelBtnCount();
}

function updateLabelBtnCount() {
  const checked = document.querySelectorAll('.label-check:checked').length;
  const el = document.getElementById('labelSelectedCount');
  if (el) el.textContent = `已选 ${checked} 个`;
  const btn = document.getElementById('labelGenerateBtn');
  if (btn) btn.textContent = `生成选中标签 (${checked}个)`;
}

async function generateSelectedLabels() {
  const container = document.getElementById('labelsContainer');
  if (!container) return;

  const checkedEls = document.querySelectorAll('.label-check:checked');
  const ids = Array.from(checkedEls).map(cb => cb.dataset.id);
  const target = robots.filter(r => ids.includes(r.id));

  if (!target.length) { showToast('请至少选择一个机器人'); return; }

  container.innerHTML = '<div class="loading"><div class="spinner"></div><p>生成中...</p></div>';

  const baseUrl = window.location.origin + window.location.pathname;
  let html = '';

  for (const r of target) {
    const qrUrl = `${baseUrl}?id=${encodeURIComponent(r.type + '__' + r.serial)}`;
    const canvas = document.createElement('canvas');
    await QRCode.toCanvas(canvas, qrUrl, { width: 120, margin: 1 });
    const dataUrl = canvas.toDataURL();

    html += `
      <div class="label-card">
        <img src="${dataUrl}" style="width:120px;height:120px">
        <div class="label-info">
          <strong>${escapeHtml(r.type)}</strong>
          <span class="mono">${escapeHtml(r.serial)}</span>
        </div>
      </div>
    `;
  }

  container.innerHTML = html;
  showToast(`已生成 ${target.length} 个标签`);
}
