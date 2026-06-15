// ===== CONFIG VIEW =====
function renderConfig() {
  const app = document.getElementById('app');
  const url = localStorage.getItem('sb_url') || '';
  const key = localStorage.getItem('sb_key') || '';
  const userName = localStorage.getItem('user_name') || '';

  app.innerHTML = `
    <div class="config-panel">
      <h3>Supabase 连接配置</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px">需要先在 <a href="https://supabase.com" target="_blank">supabase.com</a> 创建项目并执行建表脚本。</p>
      <label style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Project URL</label>
      <input type="text" id="cfg_url" value="${escapeHtml(url)}" placeholder="https://xxxxx.supabase.co">
      <label style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:1px">Anon Key</label>
      <input type="text" id="cfg_key" value="${escapeHtml(key)}" placeholder="eyJ...">
      <label style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:1px">操作人名称</label>
      <input type="text" id="cfg_name" value="${escapeHtml(userName)}" placeholder="如：张三" style="font-family:inherit">
      <div class="btn-group">
        <button class="btn btn-primary" onclick="saveConfig()">保存并连接</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:12px">字段配置</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:16px">自定义下拉选项，方便在列表和表单中使用。</p>

      <div class="config-fields-grid" style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:20px">
        <!-- Status config -->
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:8px">状态选项</label>
          <div id="statusList" style="margin-bottom:8px">
            ${getStatuses().map(s => `
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <input type="text" value="${escapeHtml(s)}" style="flex:1;padding:6px 10px;font-size:13px" onchange="updateStatus(this.value,'${esc(s)}')">
                <button class="btn-del" onclick="removeStatus('${esc(s)}')">删</button>
              </div>
            `).join('')}
          </div>
          <div style="display:flex;gap:6px">
            <input type="text" id="newStatus" placeholder="新状态..." style="flex:1;padding:6px 10px;font-size:13px">
            <button class="btn btn-secondary btn-sm" onclick="addStatus()">添加</button>
          </div>
        </div>

        <!-- Type config -->
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:8px">类型选项</label>
          <div id="typeList" style="margin-bottom:8px">
            ${getTypes().map(t => `
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <input type="text" value="${escapeHtml(t)}" style="flex:1;padding:6px 10px;font-size:13px" onchange="updateType(this.value,'${esc(t)}')">
                <button class="btn-del" onclick="removeType('${esc(t)}')">删</button>
              </div>
            `).join('')}
          </div>
          <div style="display:flex;gap:6px">
            <input type="text" id="newType" placeholder="新类型..." style="flex:1;padding:6px 10px;font-size:13px">
            <button class="btn btn-secondary btn-sm" onclick="addType()">添加</button>
          </div>
        </div>

        <!-- Person config -->
        <div>
          <label style="font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:1px;display:block;margin-bottom:8px">责任人选项</label>
          <div id="personList" style="margin-bottom:8px">
            ${getPersons().map(p => `
              <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
                <input type="text" value="${escapeHtml(p)}" style="flex:1;padding:6px 10px;font-size:13px" onchange="updatePerson(this.value,'${esc(p)}')">
                <button class="btn-del" onclick="removePerson('${esc(p)}')">删</button>
              </div>
            `).join('')}
          </div>
          <div style="display:flex;gap:6px">
            <input type="text" id="newPerson" placeholder="新责任人..." style="flex:1;padding:6px 10px;font-size:13px">
            <button class="btn btn-secondary btn-sm" onclick="addPerson()">添加</button>
          </div>
        </div>
      </div>

      <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
        <p style="font-size:12px;color:var(--text3)">说明：新增/修改/删除配置后会自动保存，下次打开页面仍然生效。也会从已有数据中自动提取作为建议。</p>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">从 xlsx 导入数据</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:8px">首次使用时，将钉钉导出的 xlsx 文件导入到 Supabase。</p>
      <input type="file" id="importFile" accept=".xlsx,.xls" style="margin-bottom:8px">
      <div class="btn-group">
        <button class="btn btn-primary" onclick="importFromXlsx()">导入</button>
      </div>
      <div id="importStatus" style="margin-top:8px;font-size:13px;color:var(--text2)"></div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">导出数据</h3>
      <div class="btn-group">
        <button class="btn btn-secondary" onclick="exportToXlsx()">导出为 xlsx</button>
        <button class="btn btn-secondary" onclick="exportToJson()">导出为 JSON</button>
      </div>
    </div>

    <div class="card">
      <h3 style="margin-bottom:8px">使用说明</h3>
      <ol style="font-size:13px;padding-left:20px;line-height:2;color:var(--text2)">
        <li>在 <a href="https://supabase.com" target="_blank">supabase.com</a> 注册并创建项目</li>
        <li>在 SQL Editor 中执行 <code>supabase_setup.sql</code> 脚本</li>
        <li>在 Settings > API 中找到 Project URL 和 anon key</li>
        <li>填入上方配置并保存</li>
        <li>（可选）在 Storage 中创建名为 <code>images</code> 的存储桶，开启公开访问</li>
        <li>使用"从 xlsx 导入"功能导入现有数据</li>
        <li>在"标签"页生成二维码并打印贴到机器人上</li>
      </ol>
    </div>
  `;
}

function saveConfig() {
  const url = document.getElementById('cfg_url').value.trim();
  const key = document.getElementById('cfg_key').value.trim();
  const name = document.getElementById('cfg_name').value.trim();

  if (!url || !key) {
    showToast('URL 和 Key 不能为空');
    return;
  }

  localStorage.setItem('sb_url', url);
  localStorage.setItem('sb_key', key);
  if (name) localStorage.setItem('user_name', name);

  sbClient = window.supabase.createClient(url, key);
  updateConnStatus();
  loadFromSupabase();
}

// ===== FIELD CONFIG FUNCTIONS =====
function addStatus() {
  const input = document.getElementById('newStatus');
  const val = input.value.trim();
  if (!val) return;

  const opts = getFieldOptions();
  if (opts.statuses.includes(val)) { showToast('该状态已存在'); return; }
  opts.statuses.push(val);
  saveFieldOptions(opts);
  input.value = '';
  renderConfig();
  showToast('已添加状态: ' + val);
}

function removeStatus(status) {
  const inUse = robots.filter(r => r.status === status).length;
  if (inUse > 0) {
    showModal('无法删除', `有 ${inUse} 台机器人正在使用"${status}"状态，请先修改这些机器人的状态。`,
      `<button class="btn btn-primary" onclick="closeModal()">知道了</button>`
    );
    return;
  }
  showModal('删除状态', `确定删除"${status}"吗？`,
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-danger" onclick="closeModal();doRemoveStatus('${status}')">删除</button>`
  );
}
function doRemoveStatus(status) {
  const opts = getFieldOptions();
  opts.statuses = opts.statuses.filter(s => s !== status);
  saveFieldOptions(opts);
  renderConfig();
  showToast('已删除');
}

function updateStatus(newVal, oldVal) {
  if (!newVal.trim()) return;
  const opts = getFieldOptions();
  const idx = opts.statuses.indexOf(oldVal);
  if (idx >= 0) {
    opts.statuses[idx] = newVal.trim();
    saveFieldOptions(opts);
    showToast('已更新');
  }
}

function addType() {
  const input = document.getElementById('newType');
  const val = input.value.trim();
  if (!val) return;

  const opts = getFieldOptions();
  if (opts.types.includes(val)) { showToast('该类型已存在'); return; }
  opts.types.push(val);
  saveFieldOptions(opts);
  input.value = '';
  renderConfig();
  showToast('已添加类型: ' + val);
}

function removeType(type) {
  const inUse = robots.filter(r => r.type === type).length;
  if (inUse > 0) {
    showModal('无法删除', `有 ${inUse} 台机器人属于"${type}"类型，请先修改这些机器人的类型。`,
      `<button class="btn btn-primary" onclick="closeModal()">知道了</button>`
    );
    return;
  }
  showModal('删除类型', `确定删除"${type}"吗？`,
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-danger" onclick="closeModal();doRemoveType('${type}')">删除</button>`
  );
}
function doRemoveType(type) {
  const opts = getFieldOptions();
  opts.types = opts.types.filter(t => t !== type);
  saveFieldOptions(opts);
  renderConfig();
  showToast('已删除');
}

function updateType(newVal, oldVal) {
  if (!newVal.trim()) return;
  const opts = getFieldOptions();
  const idx = opts.types.indexOf(oldVal);
  if (idx >= 0) {
    opts.types[idx] = newVal.trim();
    saveFieldOptions(opts);
    showToast('已更新');
  }
}

function addPerson() {
  const input = document.getElementById('newPerson');
  const val = input.value.trim();
  if (!val) return;

  const opts = getFieldOptions();
  if (opts.persons.includes(val)) { showToast('该责任人已存在'); return; }
  opts.persons.push(val);
  saveFieldOptions(opts);
  input.value = '';
  renderConfig();
  showToast('已添加责任人: ' + val);
}

function removePerson(person) {
  showModal('删除责任人', `确定删除"${person}"吗？`,
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-danger" onclick="closeModal();doRemovePerson('${person}')">删除</button>`
  );
}
function doRemovePerson(person) {
  const opts = getFieldOptions();
  opts.persons = opts.persons.filter(p => p !== person);
  saveFieldOptions(opts);
  renderConfig();
  showToast('已删除');
}

function updatePerson(newVal, oldVal) {
  if (!newVal.trim()) return;
  const opts = getFieldOptions();
  const idx = opts.persons.indexOf(oldVal);
  if (idx >= 0) {
    opts.persons[idx] = newVal.trim();
    saveFieldOptions(opts);
    showToast('已更新');
  }
}

async function importFromXlsx() {
  const fileInput = document.getElementById('importFile');
  const status = document.getElementById('importStatus');
  if (!fileInput.files.length) { showToast('请选择文件'); return; }

  status.innerHTML = '<div class="spinner"></div> 读取中...';

  const file = fileInput.files[0];
  const data = await file.arrayBuffer();
  const workbook = XLSX.read(data);

  // Find the sheet with "入库" in name
  let sheetName = workbook.SheetNames.find(n => n.includes('入库'));
  if (!sheetName) sheetName = workbook.SheetNames[0];

  const sheet = workbook.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1 });

  if (rows.length < 2) { status.textContent = '数据为空'; return; }

  // Map columns
  const header = rows[0];
  const robotsData = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || !row[1]) continue;

    const borrowed = String(row[7] || '').toUpperCase();
    robotsData.push({
      type: String(row[0] || '').trim(),
      serial: String(row[1] || '').trim(),
      status: String(row[2] || '测试中').trim(),
      person: String(row[3] || '').trim() || null,
      ip: String(row[4] || '').trim() || null,
      location: String(row[5] || '').trim() || null,
      notes: String(row[6] || '').trim() || null,
      borrowed: borrowed === 'OK' || borrowed === 'TRUE' || borrowed === '是',
      image: String(row[8] || '').trim() || null,
      updater: localStorage.getItem('user_name') || '导入',
    });
  }

  status.innerHTML = `<div class="spinner"></div> 正在导入 ${robotsData.length} 条记录...`;

  if (!sbClient) {
    // Save to localStorage only
    localStorage.setItem('robots_cache', JSON.stringify(robotsData));
    robots = robotsData;
    status.textContent = `已导入 ${robotsData.length} 条到本地缓存（未配置 Supabase）`;
    return;
  }

  // Batch insert to Supabase
  let success = 0;
  let errors = 0;
  const batchSize = 20;

  for (let i = 0; i < robotsData.length; i += batchSize) {
    const batch = robotsData.slice(i, i + batchSize);
    try {
      const { error } = await sbClient.from('robots').upsert(batch, { onConflict: 'type,serial' });
      if (error) { errors += batch.length; console.error(error); }
      else { success += batch.length; }
    } catch (e) {
      errors += batch.length;
      console.error(e);
    }
    status.innerHTML = `<div class="spinner"></div> 已导入 ${success}/${robotsData.length}...`;
  }

  status.textContent = `导入完成: ${success} 成功, ${errors} 失败`;
  await loadFromSupabase();
}

function exportToXlsx() {
  if (!robots.length) { showToast('无数据可导出'); return; }

  const rows = robots.map(r => ({
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
  XLSX.writeFile(wb, '机器人资产_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  showToast('导出成功');
}

function exportToJson() {
  const blob = new Blob([JSON.stringify(robots, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'robots_' + new Date().toISOString().slice(0, 10) + '.json';
  a.click();
  URL.revokeObjectURL(url);
}
