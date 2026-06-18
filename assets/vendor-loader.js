function logDependency(event, details) {
  if (window.AppObs) window.AppObs.log(event, details);
}

function warnDependency(event, details) {
  if (window.AppObs) window.AppObs.warn(event, details);
  else console.warn(event, details);
}

function loadScript(urls, callback, label) {
  if (!urls.length) {
    warnDependency('dependency:failed-all', { label });
    console.error('All CDN sources failed for:', label);
    return;
  }
  var s = document.createElement('script');
  s.src = urls[0];
  s.onload = function() {
    logDependency('dependency:loaded', { label, url: urls[0] });
    callback();
  };
  s.onerror = function() {
    warnDependency('dependency:cdn-failed', { label, url: urls[0], remaining: urls.length - 1 });
    loadScript(urls.slice(1), callback, label);
  };
  document.head.appendChild(s);
}

function loadOptionalScript(urls, callback, label) {
  if (!urls.length) {
    warnDependency('dependency:optional-failed-all', { label });
    callback();
    return;
  }
  var s = document.createElement('script');
  s.src = urls[0];
  s.onload = function() {
    logDependency('dependency:optional-loaded', { label, url: urls[0] });
    callback();
  };
  s.onerror = function() {
    warnDependency('dependency:optional-cdn-failed', { label, url: urls[0], remaining: urls.length - 1 });
    loadOptionalScript(urls.slice(1), callback, label);
  };
  document.head.appendChild(s);
}

var cdnBase = 'https://cdn.jsdelivr.net/npm/';
var cdnAlt = 'https://unpkg.com/';
loadScript([cdnBase + '@supabase/supabase-js@2/dist/umd/supabase.min.js', cdnAlt + '@supabase/supabase-js@2/dist/umd/supabase.min.js'], function() {
  loadScript([cdnBase + 'qrcode/build/qrcode.min.js', cdnAlt + 'qrcode/build/qrcode.min.js'], function() {
    loadOptionalScript([cdnBase + 'html5-qrcode@2.3.8/html5-qrcode.min.js', cdnAlt + 'html5-qrcode@2.3.8/html5-qrcode.min.js'], function() {
      loadScript([cdnBase + 'jsqr@1.4.0/dist/jsQR.min.js', cdnAlt + 'jsqr@1.4.0/dist/jsQR.min.js'], function() {
        loadScript([cdnBase + 'xlsx@0.18.5/dist/xlsx.full.min.js', cdnAlt + 'xlsx@0.18.5/dist/xlsx.full.min.js'], function() {
          // All libraries loaded
          window._libsLoaded = true;
          logDependency('dependency:all-loaded');
        }, 'xlsx');
      }, 'jsqr');
    }, 'html5-qrcode');
  }, 'qrcode');
}, 'supabase');
