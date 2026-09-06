;(function applyInitialTheme() {
  var preference = 'system'
  try {
    var stored = localStorage.getItem('lunumia.theme-preference')
    if (stored === 'light' || stored === 'dark' || stored === 'system')
      preference = stored
  } catch {
    // Fall back to the system preference when storage is unavailable.
  }

  var systemPrefersDark =
    typeof matchMedia === 'function' &&
    matchMedia('(prefers-color-scheme: dark)').matches
  var effectiveTheme =
    preference === 'system'
      ? systemPrefersDark
        ? 'dark'
        : 'light'
      : preference

  document.documentElement.dataset.themePreference = preference
  document.documentElement.dataset.theme = effectiveTheme
  document.documentElement.style.colorScheme = effectiveTheme
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', effectiveTheme === 'dark' ? '#111c2b' : '#1267d6')
})()
