(() => {
  const root = document.documentElement;
  const updateViewport = () => {
    const h = window.visualViewport?.height || window.innerHeight;
    if (Number.isFinite(h) && h > 0) root.style.setProperty('--app-vh', `${h}px`);
  };
  updateViewport();
  window.addEventListener('resize', updateViewport, { passive: true });
  window.visualViewport?.addEventListener('resize', updateViewport, { passive: true });
  window.visualViewport?.addEventListener('scroll', updateViewport, { passive: true });
  root.dataset.kansanFinal = 'v30';
})();
