// ===== ADD ROBOT =====
function renderAddForm() {
  currentView = 'add';
  const app = document.getElementById('app');
  const types = getTypes();
  const statuses = getStatuses();

  app.innerHTML = `
    <div class="card">
      <h3 style="margin-bottom:16px">新增机器人</h3>
      <div class="form-row">
        <div class="form-group">
          <label>机器人类型 *</label>
          <input type="text" id="a_type" list="typeList" placeholder="输入或选择类型">
          <datalist id="typeList">${types.map(t => `<option value="${escapeHtml(t)}">`).join('')}</datalist>
        </div>
        <div class="form-group">
          <label>出厂编号 *</label>
          <input type="text" id="a_serial" placeholder="如 26060101">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>状态</label>
          <select id="a_status">
            ${statuses.map(s => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
        <div class="form-group autocomplete-wrap">
          <label>关联责任人</label>
          <input type="text" id="a_person" placeholder="多个用逗号分隔" oninput="showPersonSuggestionsAdd(this)" onfocus="showPersonSuggestionsAdd(this)" onblur="setTimeout(()=>hidePersonSuggestionsAdd(),200)">
          <div class="autocomplete-list" id="personSuggestionsAdd"></div>
        </div>
      </div>
      <div class="form-group autocomplete-wrap">
        <label>当前位置</label>
        <input type="text" id="a_location" placeholder="输入位置" oninput="showLocationSuggestionsAdd(this)" onfocus="showLocationSuggestionsAdd(this)" onblur="setTimeout(()=>hideLocationSuggestionsAdd(),200)">
        <div class="autocomplete-list" id="locationSuggestionsAdd"></div>
      </div>
      <div class="form-group">
        <label>备注</label>
        <textarea id="a_notes" placeholder="备注信息..."></textarea>
      </div>
      <div class="btn-group">
        <button class="btn btn-primary" onclick="saveNewRobot()">保存</button>
        <button class="btn btn-secondary" onclick="showView('list')">取消</button>
      </div>
    </div>
  `;
}

function showLocationSuggestionsAdd(input) {
  const val = input.value.toLowerCase();
  const list = document.getElementById('locationSuggestionsAdd');
  if (!list) return;
  const filtered = locations.filter(l => l.toLowerCase().includes(val)).slice(0, 8);
  if (filtered.length === 0) { list.style.display = 'none'; return; }
  list.innerHTML = filtered.map(l => `<div class="autocomplete-item" onmousedown="document.getElementById('a_location').value='${esc(l)}'">${escapeHtml(l)}</div>`).join('');
  list.style.display = 'block';
}

function hideLocationSuggestionsAdd() {
  const list = document.getElementById('locationSuggestionsAdd');
  if (list) list.style.display = 'none';
}

function showPersonSuggestionsAdd(input) {
  const val = input.value.toLowerCase();
  const list = document.getElementById('personSuggestionsAdd');
  if (!list) return;
  const persons = getPersons();
  const filtered = persons.filter(p => p.toLowerCase().includes(val)).slice(0, 8);
  if (filtered.length === 0) { list.style.display = 'none'; return; }
  list.innerHTML = filtered.map(p => `<div class="autocomplete-item" onmousedown="document.getElementById('a_person').value='${esc(p)}'">${escapeHtml(p)}</div>`).join('');
  list.style.display = 'block';
}

function hidePersonSuggestionsAdd() {
  const list = document.getElementById('personSuggestionsAdd');
  if (list) list.style.display = 'none';
}

async function saveNewRobot() {
  const type = document.getElementById('a_type').value.trim();
  const serial = document.getElementById('a_serial').value.trim();

  if (!type || !serial) {
    showToast('类型和编号不能为空');
    return;
  }

  // Check duplicate
  const exists = robots.find(r => r.type === type && r.serial === serial);
  if (exists) {
    showToast('该机器人已存在');
    return;
  }

  const status = document.getElementById('a_status').value;
  const robot = {
    type,
    serial,
    status,
    person: document.getElementById('a_person').value.trim() || null,
    location: document.getElementById('a_location').value.trim() || null,
    borrowed: status === '借出中',
    notes: document.getElementById('a_notes').value.trim() || null,
  };

  await saveToSupabase(robot);
  showView('list');
}
