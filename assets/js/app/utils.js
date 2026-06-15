// ===== UTILS =====
function extractLocations() {
  locations = [...new Set(robots.map(r => r.location).filter(Boolean))].sort();
}

function formatNotes(notes) {
  if (!notes) return '<span style="color:var(--text3)">暂无备注</span>';
  return notes.split('\n').filter(Boolean).map(line => {
    const isDate = /^\[/.test(line);
    return `<div style="${isDate?'font-size:11px;color:var(--text3);margin-top:6px':'padding-left:8px'}">${escapeHtml(line)}</div>`;
  }).join('');
}

function appendNote() {
  const input = document.getElementById('d_notes_new');
  const hidden = document.getElementById('d_notes');
  const history = document.getElementById('notesHistory');
  if (!input || !hidden || !history) return;
  const val = input.value.trim();
  if (!val) return;

  const now = new Date().toLocaleString('zh-CN');
  const userName = localStorage.getItem('user_name') || '未知';
  const newEntry = `[${now} ${userName}] ${val}`;
  const existing = hidden.value || '';
  hidden.value = existing ? existing + '\n' + newEntry : newEntry;
  input.value = '';

  history.innerHTML = formatNotes(hidden.value);
  history.scrollTop = history.scrollHeight;
}

function extractPersons() {
  const persons = [];
  robots.forEach(r => {
    if (r.person) {
      // Split by comma for multiple persons
      r.person.split(/[,，]/).forEach(p => {
        const trimmed = p.trim();
        if (trimmed && !persons.includes(trimmed)) persons.push(trimmed);
      });
    }
  });
  return persons.sort();
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

// ===== MODAL =====
function showModal(title, desc, actions) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalDesc').textContent = desc;
  document.getElementById('modalActions').innerHTML = actions;
  document.getElementById('modalOverlay').classList.add('show');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('show');
}

// ===== UTILS =====
function escapeHtml(str) {
  if (str == null) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function esc(str) {
  if (str == null) return '';
  return String(str).replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/"/g,'\\"').replace(/</g,'\\x3c').replace(/>/g,'\\x3e').replace(/\n/g,'\\n').replace(/\r/g,'\\r');
}

// ===== DATE FORMAT =====
function formatDate(dateStr) {
  if (!dateStr) return '-';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return Math.floor(diff/60000) + '分钟前';
    if (diff < 86400000) return Math.floor(diff/3600000) + '小时前';
    if (diff < 604800000) return Math.floor(diff/86400000) + '天前';
    return d.toLocaleDateString('zh-CN', {year:'numeric',month:'2-digit',day:'2-digit'});
  } catch { return dateStr; }
}

// ===== DEBOUNCE =====
function debounce(fn, delay) {
  let timer;
  return function(...args) { clearTimeout(timer); timer = setTimeout(() => fn.apply(this, args), delay); };
}

// ===== CONNECTION STATUS =====
function updateConnStatus() {
  const el = document.getElementById('connStatus');
  if (!el) return;
  el.className = 'conn-status ' + (sbClient ? 'online' : 'offline');
  el.title = sbClient ? '已连接 Supabase' : '离线模式（本地缓存）';
}

// ===== BACK TO TOP =====
window.addEventListener('scroll', function() {
  const btn = document.getElementById('backTop');
  if (btn) btn.classList.toggle('show', window.scrollY > 400);
});
