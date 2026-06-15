// ===== DETAIL VIEW =====
let detailDirty = false;
let detailSaveCallback = null; // for post-save navigation

function showDetail(robot, afterSave) {
  if (!robot) return;
  editingRobot = { ...robot };
  originalRobotState = { ...robot };
  currentView = 'detail';
  detailDirty = false;
  detailSaveCallback = afterSave || null;
  const fab = document.getElementById('fabScan');
  if (fab) fab.style.display = 'none';
  loadChangeLog(robot.id);

  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="card detail-hero">
      <div class="detail-header">
        <button class="detail-back" onclick="detailBack()">←</button>
        <div>
          <h2>${escapeHtml(robot.type)}</h2>
          <div class="sub">SN ${escapeHtml(robot.serial)}</div>
        </div>
        <span class="badge ${statusClass(robot.status)}">${escapeHtml(robot.status)}</span>
      </div>
      <div class="detail-meta">
        <span>更新人: ${escapeHtml(robot.updater)||'-'}</span>
        <span>${escapeHtml(formatDate(robot.updated_at||robot.created_at))}</span>
      </div>
    </div>

    <div class="card">
      <div class="section-title">快速操作</div>
      <div class="form-row">
        <div class="form-group">
          <label>状态</label>
          <select id="d_status" onchange="detailDirty=true;document.getElementById('borrowSection').style.display=this.value==='借出中'?'':'none'">
            ${getStatuses().map(s => `<option value="${escapeHtml(s)}" ${robot.status===s?'selected':''}>${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group autocomplete-wrap">
          <label>当前位置</label>
          <input type="text" id="d_location" value="${escapeHtml(robot.location||'')}" placeholder="输入位置" oninput="showLocationSuggestions(this);detailDirty=true" onfocus="showLocationSuggestions(this)" onblur="setTimeout(()=>hideLocationSuggestions(),200)">
          <div class="autocomplete-list" id="locationSuggestions"></div>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group autocomplete-wrap">
          <label>关联责任人</label>
          <input type="text" id="d_person" value="${escapeHtml(robot.person||'')}" placeholder="多个责任人用逗号分隔" oninput="showPersonSuggestions(this);detailDirty=true" onfocus="showPersonSuggestions(this)" onblur="setTimeout(()=>hidePersonSuggestions(),200)">
          <div class="autocomplete-list" id="personSuggestions"></div>
        </div>
        <div class="form-group">
          <label>位置照片</label>
          <div id="imagePreview" style="margin-bottom:8px">
            ${robot.image ? `<img src="${escapeHtml(robot.image)}" style="max-width:100%;max-height:150px;border-radius:var(--radius);border:1px solid var(--border)">` : '<span style="color:var(--text3);font-size:13px">暂无照片</span>'}
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <input type="file" id="imageFile" accept="image/*" capture="environment" style="font-size:13px" onchange="previewImage(this);detailDirty=true">
            <button class="btn btn-secondary btn-sm" onclick="uploadImage()">上传</button>
          </div>
        </div>
      </div>
    </div>

    <div class="card" id="borrowSection" style="${robot.status==='借出中'?'':'display:none'}">
      <div class="section-title">借出信息</div>
      <div class="form-row">
        <div class="form-group">
          <label>借用人</label>
          <input type="text" id="d_borrowed_to" value="${escapeHtml(robot.borrowed_to||'')}" placeholder="借用人姓名/部门" onchange="detailDirty=true">
        </div>
        <div class="form-group">
          <label>预计归还日期</label>
          <input type="date" id="d_return_due" value="${robot.return_due ? robot.return_due.slice(0,10) : ''}" onchange="detailDirty=true">
        </div>
      </div>
      ${robot.return_due && new Date(robot.return_due) < new Date() ? '<div style="color:var(--red);font-size:13px;font-weight:600">⚠ 已逾期</div>' : ''}
    </div>

    <div class="card">
      <div class="section-title">备注</div>
      <div id="notesHistory" style="max-height:200px;overflow-y:auto;margin-bottom:8px;font-size:13px;color:var(--text2);line-height:1.6;background:var(--surface2);padding:10px;border-radius:var(--radius)">
        ${formatNotes(robot.notes)}
      </div>
      <div style="display:flex;gap:8px">
        <input type="text" id="d_notes_new" placeholder="添加新备注..." style="flex:1" onkeydown="if(event.key==='Enter')appendNote()">
        <button class="btn btn-secondary btn-sm" onclick="appendNote()">追加</button>
      </div>
      <input type="hidden" id="d_notes" value="${escapeHtml(robot.notes||'')}">
    </div>

    <div class="card">
      <div class="section-title">其他信息</div>
      <div class="form-row">
        <div class="form-group">
          <label>机器人类型</label>
          <input type="text" value="${escapeHtml(robot.type)}" readonly style="background:var(--surface2);color:var(--text3);cursor:not-allowed">
        </div>
        <div class="form-group">
          <label>出厂编号</label>
          <input type="text" value="${escapeHtml(robot.serial)}" readonly style="background:var(--surface2);color:var(--text3);cursor:not-allowed">
        </div>
      </div>
      <div class="form-group">
        <label>IP 地址</label>
        <input type="text" id="d_ip" value="${escapeHtml(robot.ip||'')}" placeholder="可选" onchange="detailDirty=true">
      </div>
    </div>

    <div class="card" style="text-align:center">
      <p style="font-size:12px;color:var(--text3);text-transform:uppercase;letter-spacing:1px;margin-bottom:12px">QR Code</p>
      <canvas id="detailQR"></canvas>
      <div style="margin-top:8px;display:flex;gap:8px;justify-content:center">
        <button class="btn btn-secondary btn-sm" onclick="downloadQR()">下载二维码</button>
        <button class="btn btn-primary btn-sm" onclick="printLabel()">打印标签</button>
      </div>
    </div>

    <div class="card">
      <div class="section-title">变更记录</div>
      <div id="changeLogList" style="max-height:300px;overflow-y:auto">
        <div style="color:var(--text3);font-size:13px;padding:8px 0">加载中...</div>
      </div>
    </div>

    <div class="btn-group" style="padding:0 0 20px">
      <button class="btn btn-primary" onclick="saveDetail()">保存</button>
      <button class="btn btn-secondary" onclick="detailBack()">返回</button>
      <button class="btn btn-danger btn-sm" onclick="confirmDelete('${esc(robot.id)}')" style="margin-left:auto">删除</button>
    </div>
  `;

  // Generate QR code
  const baseUrl = window.location.origin + window.location.pathname;
  const qrUrl = `${baseUrl}?id=${encodeURIComponent(robot.type + '__' + robot.serial)}`;
  QRCode.toCanvas(document.getElementById('detailQR'), qrUrl, { width: 180, margin: 2 });

  // Mark dirty on any input change
  app.querySelectorAll('input:not([readonly]),select,textarea').forEach(el => {
    el.addEventListener('change', () => { detailDirty = true; });
  });
}

function detailBack() {
  if (detailDirty) {
    showModal('未保存的修改', '当前有未保存的修改，确定离开吗？',
      `<button class="btn btn-secondary" onclick="closeModal()">继续编辑</button>
       <button class="btn btn-danger" onclick="closeModal();showView('list')">离开</button>`
    );
  } else {
    showView('list');
  }
}

function showLocationSuggestions(input) {
  const val = input.value.toLowerCase();
  const list = document.getElementById('locationSuggestions');
  if (!list) return;

  const filtered = locations.filter(l => l.toLowerCase().includes(val)).slice(0, 8);
  if (filtered.length === 0) { list.style.display = 'none'; return; }

  list.innerHTML = filtered.map(l => `<div class="autocomplete-item" onmousedown="document.getElementById('d_location').value='${esc(l)}'">${escapeHtml(l)}</div>`).join('');
  list.style.display = 'block';
}

function hideLocationSuggestions() {
  const list = document.getElementById('locationSuggestions');
  if (list) list.style.display = 'none';
}

function showLocationSuggestionsFor(input, listId, targetInputId) {
  const val = input.value.toLowerCase();
  const list = document.getElementById(listId);
  if (!list) return;
  const filtered = locations.filter(l => l.toLowerCase().includes(val)).slice(0, 8);
  if (filtered.length === 0) { list.style.display = 'none'; return; }
  list.innerHTML = filtered.map(l => `<div class="autocomplete-item" onmousedown="document.getElementById('${targetInputId}').value='${esc(l)}';setTimeout(()=>document.getElementById('${listId}').style.display='none',100)">${escapeHtml(l)}</div>`).join('');
  list.style.display = 'block';
}

function hideLocationSuggestionsFor(listId) {
  const list = document.getElementById(listId);
  if (list) list.style.display = 'none';
}

function startInvLocEdit(robotId) {
  const robot = robots.find(r => r.id === robotId);
  if (!robot) return;
  const el = document.getElementById('inv-' + robotId);
  if (!el) return;
  const loc = robot.location || '';
  el.outerHTML = `<div class="inv-loc-edit" id="inv-${escapeHtml(robotId)}">
    <div style="font-size:13px;font-weight:600;color:var(--text);margin-bottom:10px">${escapeHtml(robot.type)} <span class="serial" style="font-size:12px">${escapeHtml(robot.serial)}</span></div>
    <div style="position:relative">
      <input class="inv-loc-input" type="text" id="invLocInput" value="${escapeHtml(loc)}" placeholder="输入新位置..." oninput="showLocationSuggestionsFor(this,'invLocSuggestions','invLocInput')" onfocus="showLocationSuggestionsFor(this,'invLocSuggestions','invLocInput')" onblur="setTimeout(()=>hideLocationSuggestionsFor('invLocSuggestions'),200)">
      <div class="autocomplete-list" id="invLocSuggestions" style="top:100%;left:0;right:0;z-index:60"></div>
    </div>
    <div class="inv-loc-actions">
      <button class="btn btn-primary" onclick="saveInvLoc('${esc(robotId)}')">保存</button>
      <button class="btn btn-secondary" onclick="renderInventory()">取消</button>
    </div>
  </div>`;
  document.getElementById('invLocInput').focus();
}

async function saveInvLoc(robotId) {
  const input = document.getElementById('invLocInput');
  if (!input) return;
  const newLocation = input.value.trim();
  const robot = robots.find(r => r.id === robotId);
  if (!robot) return;
  if (newLocation === (robot.location || '')) { renderInventory(); return; }
  const oldState = { ...robot };
  robot.location = newLocation;
  await saveChangeLog(robotId, oldState, robot);
  const ok = await saveToSupabaseQuiet(robot);
  if (ok) { renderInventory(); showToast('位置已更新'); }
}

function showPersonSuggestions(input) {
  const val = input.value.toLowerCase();
  const list = document.getElementById('personSuggestions');
  if (!list) return;

  const persons = getPersons();
  const filtered = persons.filter(p => p.toLowerCase().includes(val)).slice(0, 8);
  if (filtered.length === 0) { list.style.display = 'none'; return; }

  list.innerHTML = filtered.map(p => `<div class="autocomplete-item" onmousedown="document.getElementById('d_person').value='${esc(p)}'">${escapeHtml(p)}</div>`).join('');
  list.style.display = 'block';
}

function hidePersonSuggestions() {
  const list = document.getElementById('personSuggestions');
  if (list) list.style.display = 'none';
}

async function saveDetail() {
  if (!editingRobot) return;
  const btn = document.querySelector('.btn-primary[onclick="saveDetail()"]');
  if (btn) { btn.disabled = true; btn.innerHTML = '<div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:6px"></div>保存中...'; }

  const status = document.getElementById('d_status').value;
  const borrowedTo = document.getElementById('d_borrowed_to');
  const returnDue = document.getElementById('d_return_due');
  const robot = {
    ...editingRobot,
    type: editingRobot.type,       // readonly, from original
    serial: editingRobot.serial,   // readonly, from original
    status,
    person: document.getElementById('d_person').value.trim() || null,
    location: document.getElementById('d_location').value.trim() || null,
    ip: document.getElementById('d_ip').value.trim() || null,
    borrowed: status === '借出中',
    borrowed_to: status === '借出中' && borrowedTo ? borrowedTo.value.trim() || null : null,
    borrowed_at: status === '借出中' && !editingRobot.borrowed_at ? new Date().toISOString() : (status === '借出中' ? editingRobot.borrowed_at : null),
    return_due: status === '借出中' && returnDue && returnDue.value ? returnDue.value + 'T00:00:00Z' : null,
    notes: document.getElementById('d_notes').value || null,
  };

  if (originalRobotState) await saveChangeLog(robot.id, originalRobotState, robot);
  const ok = await saveToSupabase(robot);
  detailDirty = false;
  if (btn) { btn.disabled = false; btn.textContent = '保存'; }
  if (ok && detailSaveCallback) detailSaveCallback();
}

function confirmDelete(id) {
  showModal('删除确认', '确定要删除这条记录吗？此操作不可撤销。',
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-danger" onclick="closeModal();doDelete('${id}')">删除</button>`
  );
}

function quickDelete(id, name) {
  showModal('删除确认', `确定删除 ${name} 吗？`,
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-danger" onclick="closeModal();doDelete('${id}')">删除</button>`
  );
}

function doDelete(id) {
  deleteFromSupabase(id);
  showView('list');
}

function toggleSelectAll() {
  const checked = document.getElementById('selectAll').checked;
  document.querySelectorAll('#robotBody .row-check').forEach(cb => { cb.checked = checked; });
  updateBatchBar();
}

function updateBatchBar() {
  const checked = document.querySelectorAll('.row-check:checked');
  const bar = document.getElementById('batchBar');
  const count = document.getElementById('selectedCount');
  if (checked.length > 0) {
    bar.style.display = 'flex';
    count.textContent = `已选 ${checked.length} 项`;
  } else {
    bar.style.display = 'none';
  }
}

async function batchDelete() {
  const checked = document.querySelectorAll('.row-check:checked');
  const ids = Array.from(checked).map(cb => cb.dataset.id);
  if (!ids.length) return;

  showModal('批量删除', `确定删除选中的 ${ids.length} 条记录吗？此操作不可撤销。`,
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-danger" onclick="closeModal();doBatchDelete()">删除</button>`
  );
}

async function doBatchDelete() {
  const checked = document.querySelectorAll('.row-check:checked');
  const ids = Array.from(checked).map(cb => cb.dataset.id);
  let success = 0, fail = 0;
  for (const id of ids) {
    try {
      const { error } = await sbClient.from('robots').delete().eq('id', id);
      if (!error) success++; else fail++;
    } catch { fail++; }
  }
  showToast(fail ? `已删除 ${success} 条，${fail} 条失败` : `已删除 ${success} 条`);
  await loadFromSupabase();
}

async function batchUpdateStatus() {
  const newStatus = document.getElementById('batchStatus').value;
  if (!newStatus) { showToast('请选择状态'); return; }
  const checked = document.querySelectorAll('.row-check:checked');
  const ids = Array.from(checked).map(cb => cb.dataset.id);
  if (!ids.length) return;

  let success = 0, fail = 0;
  for (const id of ids) {
    try {
      const { error } = await sbClient.from('robots').update({ status: newStatus }).eq('id', id);
      if (!error) success++; else fail++;
    } catch { fail++; }
  }
  showToast(fail ? `已更新 ${success} 条，${fail} 条失败` : `已更新 ${success} 条状态为 ${newStatus}`);
  document.getElementById('batchStatus').value = '';
  await loadFromSupabase();
}

function exportFiltered() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('filterType')?.value || '';
  const statusFilter = document.getElementById('filterStatus')?.value || '';
  const locationFilter = document.getElementById('filterLocation')?.value || '';

  let filtered = robots.filter(r => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (locationFilter && (r.location||'') !== locationFilter) return false;
    if (query) {
      const text = `${r.type} ${r.serial} ${r.person||''} ${r.location||''} ${r.notes||''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  if (!filtered.length) { showToast('无匹配数据可导出'); return; }

  const rows = filtered.map(r => ({
    '机器人类型': r.type,
    '出厂编号': r.serial,
    '状态': r.status,
    '责任人': r.person || '',
    'IP': r.ip || '',
    '位置': r.location || '',
    '备注': r.notes || '',
    '是否借出': r.borrowed ? 'OK' : '',
    '更新人': r.updater || '',
    '更新时间': r.updated_at || '',
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '入库管理');
  XLSX.writeFile(wb, '机器人资产_筛选导出_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  showToast(`已导出 ${filtered.length} 条`);
}

function downloadQR() {
  const canvas = document.getElementById('detailQR');
  if (!canvas) return;
  const link = document.createElement('a');
  link.download = `QR_${editingRobot.serial}.png`;
  link.href = canvas.toDataURL();
  link.click();
}

function printLabel() {
  const canvas = document.getElementById('detailQR');
  if (!canvas || !editingRobot) return;
  const dataUrl = canvas.toDataURL();
  const win = window.open('', '_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>标签</title><style>
    body{margin:0;display:flex;justify-content:center;align-items:center;min-height:100vh;font-family:'PingFang SC','Microsoft YaHei',sans-serif}
    .label{border:2px solid #333;padding:16px;text-align:center;width:200px}
    .type{font-size:16px;font-weight:700;margin-bottom:4px}
    .serial{font-size:12px;color:#666;font-family:monospace;margin-bottom:8px}
    img{width:140px;height:140px}
    @media print{body{min-height:auto}.label{border:1px solid #000}}
  </style></head><body><div class="label">
    <div class="type">${escapeHtml(editingRobot.type)}</div>
    <div class="serial">${escapeHtml(editingRobot.serial)}</div>
    <img src="${dataUrl}">
  </div><script>setTimeout(()=>window.print(),300)<\/script></body></html>`);
}

// ===== IMAGE UPLOAD =====
function previewImage(input) {
  const preview = document.getElementById('imagePreview');
  if (!preview || !input.files.length) return;

  const file = input.files[0];
  if (file.size > 5 * 1024 * 1024) {
    showToast('图片不能超过 5MB');
    input.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = function(e) {
    preview.innerHTML = `<img src="${e.target.result}" style="max-width:100%;max-height:200px;border-radius:var(--radius);border:1px solid var(--border)">`;
  };
  reader.readAsDataURL(file);
}

async function uploadImage() {
  const input = document.getElementById('imageFile');
  if (!input.files.length) { showToast('请先选择图片'); return; }
  if (!editingRobot) return;

  const file = input.files[0];
  showToast('正在压缩和上传...');

  try {
    // Compress image
    const compressed = await compressImage(file, 800, 0.7);

    // Upload to Supabase Storage
    if (sbClient) {
      const fileName = `robots/${editingRobot.type}_${editingRobot.serial}_${Date.now()}.jpg`;

      // Try to upload to storage
      const { data, error } = await sbClient.storage
        .from('images')
        .upload(fileName, compressed, { contentType: 'image/jpeg', upsert: true });

      if (error) {
        // Storage might not be set up, fallback to base64
        console.warn('Storage upload failed, using base64:', error);
        const reader = new FileReader();
        reader.onload = async function(e) {
          editingRobot.image = e.target.result;
          await saveToSupabase(editingRobot);
          showToast('图片已保存（base64）');
        };
        reader.readAsDataURL(compressed);
      } else {
        // Get public URL
        const { data: urlData } = sbClient.storage.from('images').getPublicUrl(fileName);
        editingRobot.image = urlData.publicUrl;
        await saveToSupabase(editingRobot);
        showToast('图片上传成功');
      }
    } else {
      // No Supabase, use base64
      const reader = new FileReader();
      reader.onload = async function(e) {
        editingRobot.image = e.target.result;
        showToast('图片已保存（本地）');
      };
      reader.readAsDataURL(compressed);
    }
  } catch (e) {
    showToast('上传失败: ' + e.message);
  }
}

function compressImage(file, maxSize, quality) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = function(e) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = (height / width) * maxSize;
            width = maxSize;
          } else {
            width = (width / height) * maxSize;
            height = maxSize;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(function(blob) {
          if (blob) resolve(blob);
          else reject(new Error('压缩失败'));
        }, 'image/jpeg', quality);
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
