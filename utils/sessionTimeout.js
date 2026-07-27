// utils/sessionTimeout.js
// Reusable session timeout module
// Tracks user activity (mouse, keyboard, touch) and triggers a callback after inactivity.

(function () {
  const DEFAULT_TIMEOUT_MINUTES = 15;

  let _timeoutHandle = null;
  let _activityEvents = ['mousemove', 'mousedown', 'keypress', 'touchstart', 'scroll', 'click'];
  let _boundReset = null;

  function initSessionTimeout(options) {
    const timeoutMinutes = options && typeof options.timeoutMinutes === 'number'
      ? options.timeoutMinutes
      : DEFAULT_TIMEOUT_MINUTES;
    const onTimeout = typeof options.onTimeout === 'function'
      ? options.onTimeout
      : function () { console.warn('[sessionTimeout] Session timed out — no callback provided.'); };
    const timeoutMs = timeoutMinutes * 60 * 1000;

    // Cancel any previous timer before starting a new one
    cancelSessionTimeout();

    function resetTimer() {
      if (_timeoutHandle) clearTimeout(_timeoutHandle);
      // Record last activity time for cross-tab awareness
      try { localStorage.setItem('lastActivityTime', Date.now().toString()); } catch (_) {}
      _timeoutHandle = setTimeout(onTimeout, timeoutMs);
    }

    _boundReset = resetTimer;
    _activityEvents.forEach(ev => window.addEventListener(ev, _boundReset, { passive: true, capture: true }));

    // Start the timer immediately
    resetTimer();

    console.log(`[sessionTimeout] Initialized: ${timeoutMinutes} min inactivity timeout.`);
  }

  function cancelSessionTimeout() {
    if (_timeoutHandle) {
      clearTimeout(_timeoutHandle);
      _timeoutHandle = null;
    }
    if (_boundReset) {
      _activityEvents.forEach(ev => window.removeEventListener(ev, _boundReset, true));
      _boundReset = null;
    }
  }

  // Expose globally
  window.initSessionTimeout = initSessionTimeout;
  window.cancelSessionTimeout = cancelSessionTimeout;
})();
