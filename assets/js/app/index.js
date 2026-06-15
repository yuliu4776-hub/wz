// ===== START =====
// Wait for all libraries to load, then init
function waitForLibs() {
  if (typeof window.supabase !== 'undefined' && typeof QRCode !== 'undefined' && typeof jsQR !== 'undefined' && typeof XLSX !== 'undefined') {
    if (window.AppObs) window.AppObs.log('app:dependencies-ready');
    init();
  } else if (window._libsLoaded) {
    if (window.AppObs) window.AppObs.warn('app:dependencies-flag-ready');
    init();
  } else {
    setTimeout(waitForLibs, 100);
  }
}
// Start after a brief delay to let scripts begin loading
if (window.AppObs) window.AppObs.log('app:boot-scheduled');
setTimeout(waitForLibs, 200);
