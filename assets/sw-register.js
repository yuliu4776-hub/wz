if ('serviceWorker' in navigator) {
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('./sw.js').catch(function(e) {
      console.log('SW registration failed:', e);
    });
  });
}
