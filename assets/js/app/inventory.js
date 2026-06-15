// ===== INVENTORY MODE =====
let inventorySessionId = null;
let inventoryState = {}; // { robotId: { status, checkedBy, checkedAt } }

function getInventorySessionId() {
  if (!inventorySessionId) {
    inventorySessionId = 'inv_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  }
  return inventorySessionId;
}

async function loadInventoryState() {
  // Try Supabase first
  if (sbClient) {
    try {
      const { data, error } = await sbClient.from('inventory_checks')
        .select('*')
        .order('checked_at', { ascending: false });
      if (!error && data) {
        inventoryState = {};
        data.forEach(check => {
          // Latest check per robot wins
          if (!inventoryState[check.robot_id]) {
            inventoryState[check.robot_id] = {
              status: check.status,
              checkedBy: check.checked_by,
              checkedAt: check.checked_at,
              sessionId: check.session_id,
            };
          }
        });
        return;
      }
    } catch (e) { console.warn('Inventory load from Supabase failed:', e); }
  }
  // Fallback to localStorage
  const saved = localStorage.getItem('inventory_state');
  if (saved) {
    try {
      const local = JSON.parse(saved);
      inventoryState = {};
      Object.entries(local).forEach(([id, status]) => {
        inventoryState[id] = { status, checkedBy: '本地', checkedAt: null };
      });
    } catch {}
  }
}

async function saveInventoryCheck(robotId, status) {
  const userName = localStorage.getItem('user_name') || '未知';
  const sessionId = getInventorySessionId();

  // Update local state immediately
  inventoryState[robotId] = { status, checkedBy: userName, checkedAt: new Date().toISOString() };

  // Save to Supabase
  if (sbClient) {
    try {
      await sbClient.from('inventory_checks').upsert({
        robot_id: robotId,
        status,
        checked_by: userName,
        session_id: sessionId,
      }, { onConflict: 'robot_id,session_id' });
    } catch (e) {
      console.warn('Inventory save to Supabase failed:', e);
    }
  }

  // Also save to localStorage as backup
  const local = {};
  Object.entries(inventoryState).forEach(([id, s]) => { local[id] = s.status; });
  localStorage.setItem('inventory_state', JSON.stringify(local));
}

function renderInventory() {
  const app = document.getElementById('app');

  // Group by location
  const byLocation = {};
  robots.forEach(r => {
    const loc = r.location || '未分配位置';
    if (!byLocation[loc]) byLocation[loc] = [];
    byLocation[loc].push(r);
  });

  const locations = Object.keys(byLocation).sort();
  const confirmed = Object.values(inventoryState).filter(s => s.status === 'confirmed').length;
  const missing = Object.values(inventoryState).filter(s => s.status === 'missing').length;

  app.innerHTML = `
    <div class="card no-print">
      <h3 style="margin-bottom:8px">批量盘点模式</h3>
      <p style="font-size:13px;color:var(--text2);margin-bottom:12px">按位置分组，逐个确认机器人是否在位。${sbClient ? '盘点数据多人实时共享。' : '（离线模式，仅本机可见）'}</p>
      <div class="stats">
        <div class="stat"><span class="stat-num" id="invTotal">${robots.length}</span><span class="stat-label">总计</span></div>
        <div class="stat"><span class="stat-num" style="color:var(--green)" id="invConfirmed">${confirmed}</span><span class="stat-label">已确认</span></div>
        <div class="stat"><span class="stat-num" style="color:var(--red)" id="invMissing">${missing}</span><span class="stat-label">未找到</span></div>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button class="btn btn-secondary btn-sm" onclick="resetInventory()">重置盘点</button>
        <button class="btn btn-secondary btn-sm" onclick="exportInventoryResult()">导出盘点结果</button>
      </div>
    </div>
    ${locations.map(loc => `
      <div class="card">
        <h4 style="margin-bottom:8px;font-size:13px;color:var(--text3);text-transform:uppercase;letter-spacing:1px">${escapeHtml(loc)} <span style="color:var(--text3);font-weight:400">· ${byLocation[loc].length}台</span></h4>
        ${byLocation[loc].map(r => {
          const check = inventoryState[r.id];
          const checkedClass = check ? (check.status === 'confirmed' ? 'confirmed' : 'missing') : '';
          const checkedBy = check ? `<span style="font-size:10px;color:var(--text3)">${escapeHtml(check.checkedBy||'')}</span>` : '';
          return `
          <div class="inv-item" id="inv-${escapeHtml(r.id)}">
            <div class="info">
              <strong>${escapeHtml(r.type)} <span class="serial">${escapeHtml(r.serial)}</span></strong>
              <div class="meta-line" id="inv-loc-${escapeHtml(r.id)}">${escapeHtml(r.location||'未分配')}<span class="inv-edit-icon" onclick="event.stopPropagation();startInvLocEdit('${esc(r.id)}')" title="编辑位置">&#9998;</span> · ${escapeHtml(r.status)}${r.person?' · '+escapeHtml(r.person):''} ${checkedBy}</div>
            </div>
            <div class="inv-actions">
              <button class="inv-btn ${checkedClass==='confirmed'?'confirmed':''}" onclick="markInventory('${esc(r.id)}','confirmed',this)">在位</button>
              <button class="inv-btn ${checkedClass==='missing'?'missing':''}" onclick="markInventory('${esc(r.id)}','missing',this)">未找到</button>
            </div>
          </div>`;
        }).join('')}
      </div>
    `).join('')}
  `;
}

async function markInventory(id, status, btn) {
  const item = document.getElementById(`inv-${id}`);
  if (!item) return;

  // Reset buttons
  item.querySelectorAll('.inv-btn').forEach(b => b.classList.remove('confirmed', 'missing'));
  btn.classList.add(status);

  await saveInventoryCheck(id, status);
  updateInventoryStats();
}

function updateInventoryStats() {
  const confirmed = Object.values(inventoryState).filter(s => s.status === 'confirmed').length;
  const missing = Object.values(inventoryState).filter(s => s.status === 'missing').length;

  const el1 = document.getElementById('invConfirmed');
  const el2 = document.getElementById('invMissing');
  if (el1) el1.textContent = confirmed;
  if (el2) el2.textContent = missing;
}

function resetInventory() {
  showModal('重置盘点', '确定要重置所有盘点状态吗？',
    `<button class="btn btn-secondary" onclick="closeModal()">取消</button>
     <button class="btn btn-danger" onclick="closeModal();doResetInventory()">重置</button>`
  );
}
async function doResetInventory() {
  // Clear Supabase - only current session
  if (sbClient && inventorySessionId) {
    try {
      await sbClient.from('inventory_checks').delete().eq('session_id', inventorySessionId);
    } catch (e) { console.warn('Clear inventory from Supabase failed:', e); }
  }
  inventoryState = {};
  localStorage.removeItem('inventory_state');
  inventorySessionId = null;
  renderInventory();
  showToast('盘点已重置');
}

function exportInventoryResult() {
  if (!Object.keys(inventoryState).length) { showToast('尚无盘点数据'); return; }

  const rows = robots.map(r => {
    const check = inventoryState[r.id];
    return {
      '机器人类型': r.type,
      '出厂编号': r.serial,
      '位置': r.location || '未分配',
      '状态': r.status,
      '责任人': r.person || '',
      '盘点结果': check ? (check.status === 'confirmed' ? '在位' : '未找到') : '未盘点',
      '盘点人': check?.checkedBy || '',
      '盘点时间': check?.checkedAt ? new Date(check.checkedAt).toLocaleString('zh-CN') : '',
    };
  });

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '盘点结果');
  XLSX.writeFile(wb, '盘点结果_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  showToast('导出成功');
}
