// ===== LIST VIEW =====
function renderList() {
  const app = document.getElementById('app');

  // Stats
  const statusCounts = {};
  robots.forEach(r => { statusCounts[r.status] = (statusCounts[r.status] || 0) + 1; });

  const types = getTypes();
  const statuses = getStatuses();

  app.innerHTML = `
    <div class="stats">
      <div class="stat"><span class="stat-num">${robots.length}</span><span class="stat-label">总计</span></div>
      ${statuses.map((s, i) => {
        const colors = ['var(--green)', 'var(--amber)', 'var(--red)', 'var(--text3)', 'var(--blue)', 'var(--cyan)'];
        return `<div class="stat"><span class="stat-num" style="color:${colors[i % colors.length]}">${statusCounts[s]||0}</span><span class="stat-label">${s}</span></div>`;
      }).join('')}
    </div>
    <div class="search-bar">
      <input type="text" id="searchInput" placeholder="搜索编号、类型、责任人、备注..." oninput="debouncedFilter()">
      <select id="filterType" onchange="filterList()">
        <option value="">所有类型</option>
        ${types.map(t => `<option value="${escapeHtml(t)}">${escapeHtml(t)}</option>`).join('')}
      </select>
      <select id="filterStatus" onchange="filterList()">
        <option value="">所有状态</option>
        ${statuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
      </select>
      <select id="filterLocation" onchange="filterList()">
        <option value="">所有位置</option>
        ${locations.map(l => `<option value="${escapeHtml(l)}">${escapeHtml(l)}</option>`).join('')}
      </select>
      <button class="btn btn-secondary btn-sm" onclick="exportFiltered()">导出</button>
      <button class="btn btn-primary btn-sm mobile-add-btn" onclick="showView('add')">+ 新增</button>
    </div>
    <div id="batchBar" class="batch-bar" style="display:none">
      <span id="selectedCount">已选 0 项</span>
      <select id="batchStatus" style="padding:6px 10px;font-size:12px;border-radius:var(--radius);border:1px solid var(--border);background:var(--surface)">
        <option value="">批量改状态...</option>
        ${statuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
      </select>
      <button class="btn btn-primary btn-sm" onclick="batchUpdateStatus()">应用</button>
      <button class="btn btn-danger btn-sm" onclick="batchDelete()">删除</button>
    </div>
    <div class="card">
      <div class="table-wrap">
        <table id="robotTable">
          <thead>
            <tr>
              <th><input type="checkbox" id="selectAll" onchange="toggleSelectAll()"></th>
              <th onclick="sortBy('type')" style="cursor:pointer">类型 <span class="sort-arrow" id="sort-type"></span></th>
              <th onclick="sortBy('serial')" style="cursor:pointer">编号 <span class="sort-arrow" id="sort-serial"></span></th>
              <th onclick="sortBy('status')" style="cursor:pointer">状态 <span class="sort-arrow" id="sort-status"></span></th>
              <th onclick="sortBy('person')" style="cursor:pointer">责任人 <span class="sort-arrow" id="sort-person"></span></th>
              <th onclick="sortBy('location')" style="cursor:pointer">位置 <span class="sort-arrow" id="sort-location"></span></th>
              <th>照片</th>
              <th>最后编辑</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody id="robotBody"></tbody>
        </table>
      </div>
      <div id="emptyState" class="empty" style="display:none">无匹配记录</div>
    </div>
  `;

  filterList();
}

function sortBy(field) {
  if (sortField === field) { sortAsc = !sortAsc; }
  else { sortField = field; sortAsc = true; }
  // Update sort arrows
  document.querySelectorAll('.sort-arrow').forEach(el => { el.className = 'sort-arrow'; });
  const arrow = document.getElementById('sort-' + field);
  if (arrow) arrow.className = 'sort-arrow ' + (sortAsc ? 'asc' : 'desc');
  filterList();
}

function filterList() {
  const query = (document.getElementById('searchInput')?.value || '').toLowerCase();
  const typeFilter = document.getElementById('filterType')?.value || '';
  const statusFilter = document.getElementById('filterStatus')?.value || '';
  const locationFilter = document.getElementById('filterLocation')?.value || '';

  let filtered = robots.filter(r => {
    if (typeFilter && r.type !== typeFilter) return false;
    if (statusFilter && r.status !== statusFilter) return false;
    if (locationFilter && (r.location || '') !== locationFilter) return false;
    if (query) {
      const text = `${r.type} ${r.serial} ${r.person||''} ${r.location||''} ${r.notes||''} ${r.ip||''}`.toLowerCase();
      if (!text.includes(query)) return false;
    }
    return true;
  });

  // Sort
  if (sortField) {
    filtered.sort((a, b) => {
      const va = (a[sortField] || '').toString().toLowerCase();
      const vb = (b[sortField] || '').toString().toLowerCase();
      return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
    });
  }

  const tbody = document.getElementById('robotBody');
  const empty = document.getElementById('emptyState');

  if (!tbody) return;

  if (filtered.length === 0) {
    tbody.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }

  if (empty) empty.style.display = 'none';

  tbody.innerHTML = filtered.map(r => `
    <tr data-status="${escapeHtml(r.status)}" onclick="showDetail(robots.find(x=>x.id==='${esc(r.id)}'))">
      <td data-label=""><input type="checkbox" class="row-check" data-id="${escapeHtml(r.id)}" onclick="event.stopPropagation();updateBatchBar()"></td>
      <td data-label="类型">${escapeHtml(r.type)}</td>
      <td data-label="编号"><span class="serial">${escapeHtml(r.serial)}</span></td>
      <td data-label="状态"><span class="badge ${statusClass(r.status)}">${escapeHtml(r.status)}</span>${r.return_due && new Date(r.return_due) < new Date() ? ' <span style="color:var(--red);font-size:11px;font-weight:600">逾期</span>' : ''}</td>
      <td data-label="责任人">${escapeHtml(r.person)||'-'}</td>
      <td data-label="位置">${escapeHtml(r.location)||'-'}</td>
      <td data-label="照片">${r.image ? '<span style="color:var(--green);font-size:12px">有图</span>' : '-'}</td>
      <td data-label="编辑"><span style="font-size:12px;color:var(--text3)">${escapeHtml(r.updater)||'-'}${r.updated_at ? '<br>'+escapeHtml(formatDate(r.updated_at)) : ''}</span></td>
      <td data-label=""><button class="btn-del" onclick="event.stopPropagation();quickDelete('${esc(r.id)}','${esc(r.type+' '+r.serial)}')">删除</button></td>
    </tr>
  `).join('');
}

function statusClass(status) {
  const colorMap = {
    '测试中':'badge-testing','借出中':'badge-loaned','返修中':'badge-repair',
    '已出库':'badge-deployed'
  };
  if (colorMap[status]) return colorMap[status];
  const colors = ['badge-blue','badge-cyan','badge-testing','badge-loaned','badge-repair','badge-deployed'];
  let hash = 0;
  for (let i = 0; i < status.length; i++) hash = ((hash << 5) - hash) + status.charCodeAt(i);
  return colors[Math.abs(hash) % colors.length];
}

const debouncedFilter = debounce(filterList, 200);
