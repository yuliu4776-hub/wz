(function() {
  const MAX_EVENTS = 200;
  const events = [];

  function now() {
    return new Date().toISOString();
  }

  function normalizeError(error) {
    if (!error) return null;
    return {
      name: error.name || 'Error',
      message: error.message || String(error),
      stack: error.stack || null,
    };
  }

  function record(level, event, details) {
    const entry = {
      ts: now(),
      level,
      event,
      details: details || {},
    };
    events.push(entry);
    if (events.length > MAX_EVENTS) events.shift();

    const logger = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;
    logger.call(console, '[ROBO::TRACK]', event, entry.details);
    return entry;
  }

  window.AppObs = {
    log(event, details) { return record('info', event, details); },
    warn(event, details) { return record('warn', event, details); },
    error(event, error, details) {
      return record('error', event, { ...(details || {}), error: normalizeError(error) });
    },
    async measure(event, fn, details) {
      const start = performance.now();
      try {
        const result = await fn();
        record('info', event + ':ok', { ...(details || {}), durationMs: Math.round(performance.now() - start) });
        return result;
      } catch (error) {
        record('error', event + ':fail', { ...(details || {}), durationMs: Math.round(performance.now() - start), error: normalizeError(error) });
        throw error;
      }
    },
    recent() { return events.slice(); },
  };

  window.addEventListener('error', event => {
    window.AppObs.error('runtime:error', event.error || new Error(event.message), {
      source: event.filename,
      line: event.lineno,
      column: event.colno,
    });
  });

  window.addEventListener('unhandledrejection', event => {
    window.AppObs.error('runtime:unhandled-rejection', event.reason);
  });

  window.AppObs.log('app:observability-ready', {
    path: window.location.pathname,
    userAgent: navigator.userAgent,
  });
})();
