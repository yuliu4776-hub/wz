// ===== VIEWS =====
function showView(view) {
  if (currentView === 'scanner' && view !== 'scanner') stopScanner();
  currentView = view;
  const startedAt = performance.now();
  if (window.AppObs) window.AppObs.log('view:change:start', { view });
  const app = document.getElementById('app');
  const fab = document.getElementById('fabScan');
  if (fab) fab.style.display = (view === 'scanner' || view === 'add') ? 'none' : '';

  try {
    switch (view) {
      case 'list': renderList(); break;
      case 'detail': /* handled by showDetail */ break;
      case 'scanner': renderScanner(); break;
      case 'labels': renderLabels(); break;
      case 'inventory': renderInventory(); break;
      case 'config': renderConfig(); break;
      case 'add': renderAddForm(); break;
    }
    if (window.AppObs) window.AppObs.log('view:change:ok', {
      view,
      durationMs: Math.round(performance.now() - startedAt),
    });
  } catch (e) {
    console.error('View error:', e);
    if (window.AppObs) window.AppObs.error('view:change:failed', e, { view });
    app.innerHTML = '<div class="card"><h3>加载出错</h3><p>' + escapeHtml(e.message) + '</p></div>';
  }
}
