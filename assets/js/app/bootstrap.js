// ===== TAB SWITCH =====
function switchTab(el, view) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  el.classList.add('active');
  showView(view);
}

// ===== NAME PROMPT =====
function showNamePrompt() {
  const overlay = document.getElementById('modalOverlay');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDesc');
  const actions = document.getElementById('modalActions');

  title.textContent = '欢迎使用 ROBO::TRACK';
  desc.innerHTML = `
    <p style="margin-bottom:12px;color:var(--text2)">请输入您的姓名，用于记录操作信息</p>
    <input type="text" id="nameInput" placeholder="输入姓名..." style="width:100%;padding:12px 14px;font-size:16px;border:1px solid var(--border);border-radius:var(--radius);background:var(--surface)">
  `;
  actions.innerHTML = `<button class="btn btn-primary" style="width:100%" onclick="submitName()">确认进入</button>`;

  overlay.classList.add('show');
  overlay.style.display = 'flex';

  // Disable closing by clicking overlay
  overlay.onclick = null;

  setTimeout(() => {
    const input = document.getElementById('nameInput');
    if (input) { input.focus(); input.addEventListener('keydown', e => { if (e.key === 'Enter') submitName(); }); }
  }, 100);
}

function submitName() {
  const input = document.getElementById('nameInput');
  const name = input ? input.value.trim() : '';
  if (!name) { input.focus(); return; }

  localStorage.setItem('user_name', name);

  // Close modal and re-init
  const overlay = document.getElementById('modalOverlay');
  overlay.classList.remove('show');
  overlay.onclick = function() { if (event.target === this) closeModal(); };

  init();
}

// ===== INIT =====
function init() {
  if (window.AppObs) window.AppObs.log('app:init:start');
  // Check if user name is set
  const userName = localStorage.getItem('user_name');
  if (!userName) {
    if (window.AppObs) window.AppObs.log('app:init:needs-user-name');
    showNamePrompt();
    return;
  }

  // Load config from localStorage
  const url = localStorage.getItem('sb_url') || SUPABASE_URL;
  const key = localStorage.getItem('sb_key') || SUPABASE_ANON_KEY;

  if (url && key && url !== 'YOUR_SUPABASE_URL' && key !== 'YOUR_SUPABASE_ANON_KEY') {
    // Try connecting to Supabase
    try {
      if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        sbClient = window.supabase.createClient(url, key);
        if (window.AppObs) window.AppObs.log('supabase:init:ok', { url });
        loadFromSupabase();
      } else {
        console.warn('Supabase SDK not loaded, using cache');
        if (window.AppObs) window.AppObs.warn('supabase:init:sdk-missing');
        loadFromCacheOrShowConfig();
      }
    } catch (e) {
      console.error('Supabase init error:', e);
      if (window.AppObs) window.AppObs.error('supabase:init:error', e);
      loadFromCacheOrShowConfig();
    }
  } else {
    if (window.AppObs) window.AppObs.log('app:init:no-config');
    loadFromCacheOrShowConfig();
  }

  // Check URL params for deep linking
  const params = new URLSearchParams(window.location.search);
  const robotId = params.get('id');
  if (robotId) {
    setTimeout(() => {
      const robot = robots.find(r => r.id === robotId || `${r.type}__${r.serial}` === robotId);
      if (robot) showDetail(robot);
    }, 1500);
  }
}

async function loadFromCacheOrShowConfig() {
  const cached = localStorage.getItem('robots_cache');
  if (cached) {
    robots = JSON.parse(cached);
    extractLocations();
    updateConnStatus();
    await loadInventoryState();
    showView('list');
  } else {
    updateConnStatus();
    showView('config');
  }
}
