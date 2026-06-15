// ===== SUPABASE OPERATIONS =====
async function loadFromSupabase() {
  const app = document.getElementById('app');
  app.innerHTML = '<div class="loading"><div class="spinner"></div><p>加载中...</p></div>';
  const startedAt = performance.now();

  try {
    const { data, error } = await sbClient
      .from('robots')
      .select('*')
      .order('type')
      .order('serial');

    if (error) throw error;

    robots = data || [];
    if (window.AppObs) window.AppObs.log('supabase:robots-loaded', {
      count: robots.length,
      durationMs: Math.round(performance.now() - startedAt),
    });
    localStorage.setItem('robots_cache', JSON.stringify(robots));
    extractLocations();
    updateConnStatus();
    await loadInventoryState();
    showView('list');
  } catch (e) {
    if (window.AppObs) window.AppObs.error('supabase:robots-load-failed', e, {
      durationMs: Math.round(performance.now() - startedAt),
    });
    app.innerHTML = `<div class="card"><h3 style="color:var(--red);margin-bottom:8px">连接失败</h3><p style="color:var(--text2)">${escapeHtml(e.message)}</p><p style="margin-top:12px;color:var(--text3)">请检查设置中的 Supabase 配置。</p><button class="btn btn-primary" onclick="showView('config')" style="margin-top:16px">前往设置</button></div>`;
  }
}

async function saveToSupabase(robot) {
  if (!sbClient) {
    showToast('请先配置 Supabase 连接');
    return false;
  }

  try {
    const operation = robot.id ? 'update' : 'insert';
    const startedAt = performance.now();
    const { updater, ...data } = robot;
    data.updater = localStorage.getItem('user_name') || '未知';

    if (robot.id) {
      const { error } = await sbClient.from('robots').update(data).eq('id', robot.id);
      if (error) throw error;
    } else {
      const { error } = await sbClient.from('robots').insert(data);
      if (error) throw error;
    }

    if (window.AppObs) window.AppObs.log('supabase:robot-save-ok', {
      operation,
      id: robot.id || null,
      serial: robot.serial,
      durationMs: Math.round(performance.now() - startedAt),
    });
    await loadFromSupabase();
    showToast('保存成功');
    return true;
  } catch (e) {
    if (window.AppObs) window.AppObs.error('supabase:robot-save-failed', e, {
      id: robot.id || null,
      serial: robot.serial,
    });
    showToast('保存失败: ' + e.message);
    return false;
  }
}

async function saveToSupabaseQuiet(robot) {
  if (!sbClient) { showToast('请先配置 Supabase 连接'); return false; }
  try {
    const startedAt = performance.now();
    const { updater, ...data } = robot;
    data.updater = localStorage.getItem('user_name') || '未知';
    const { error } = await sbClient.from('robots').update(data).eq('id', robot.id);
    if (error) throw error;
    if (window.AppObs) window.AppObs.log('supabase:robot-save-quiet-ok', {
      id: robot.id,
      serial: robot.serial,
      durationMs: Math.round(performance.now() - startedAt),
    });
    localStorage.setItem('robots_cache', JSON.stringify(robots));
    extractLocations();
    return true;
  } catch (e) {
    if (window.AppObs) window.AppObs.error('supabase:robot-save-quiet-failed', e, {
      id: robot.id,
      serial: robot.serial,
    });
    showToast('保存失败: ' + e.message);
    return false;
  }
}

const CHANGE_FIELDS = {
  status: '状态', person: '责任人', location: '位置',
  ip: 'IP', notes: '备注', borrowed: '借出', image: '照片',
  borrowed_to: '借用人', return_due: '预计归还'
};

async function saveChangeLog(robotId, oldState, newState) {
  if (!sbClient || !robotId) return;
  const user = localStorage.getItem('user_name') || '未知';
  const entries = [];
  for (const [field, label] of Object.entries(CHANGE_FIELDS)) {
    const oldVal = oldState[field] == null ? '' : String(oldState[field]);
    const newVal = newState[field] == null ? '' : String(newState[field]);
    if (oldVal !== newVal) {
      entries.push({ robot_id: robotId, field: label, old_value: oldVal || null, new_value: newVal || null, changed_by: user });
    }
  }
  if (entries.length === 0) return;
  try {
    await sbClient.from('change_log').insert(entries);
    if (window.AppObs) window.AppObs.log('supabase:change-log-save-ok', {
      robotId,
      count: entries.length,
    });
  } catch (e) {
    console.error('Change log save failed:', e);
    if (window.AppObs) window.AppObs.error('supabase:change-log-save-failed', e, { robotId });
  }
}

async function loadChangeLog(robotId) {
  changeLogData = [];
  if (!sbClient || !robotId) return;
  try {
    const { data, error } = await sbClient.from('change_log')
      .select('*').eq('robot_id', robotId).order('changed_at', { ascending: false }).limit(50);
    if (!error && data) changeLogData = data;
  } catch (e) {
    console.error('Change log load failed:', e);
    if (window.AppObs) window.AppObs.error('supabase:change-log-load-failed', e, { robotId });
  }
  renderChangeLog();
}

function renderChangeLog() {
  const el = document.getElementById('changeLogList');
  if (!el) return;
  if (changeLogData.length === 0) {
    el.innerHTML = '<div style="color:var(--text3);font-size:13px;padding:8px 0">暂无变更记录</div>';
    return;
  }
  el.innerHTML = changeLogData.map(c => `
    <div class="change-item">
      <div class="change-head">
        <span class="change-field">${escapeHtml(c.field)}</span>
        <span class="change-time">${escapeHtml(formatDate(c.changed_at))}</span>
      </div>
      <div class="change-body">
        <span class="change-old">${escapeHtml(c.old_value) || '(空)'}</span>
        <span class="change-arrow">→</span>
        <span class="change-new">${escapeHtml(c.new_value) || '(空)'}</span>
      </div>
      <div class="change-user">${escapeHtml(c.changed_by) || '未知'}</div>
    </div>
  `).join('');
}

async function deleteFromSupabase(id) {
  if (!sbClient) return;
  try {
    const { error } = await sbClient.from('robots').delete().eq('id', id);
    if (error) throw error;
    if (window.AppObs) window.AppObs.log('supabase:robot-delete-ok', { id });
    await loadFromSupabase();
    showToast('已删除');
  } catch (e) {
    if (window.AppObs) window.AppObs.error('supabase:robot-delete-failed', e, { id });
    showToast('删除失败: ' + e.message);
  }
}
