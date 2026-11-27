(() => {
  const nav = document.querySelector('[data-guide-nav]');
  const tabs = Array.from(nav.querySelectorAll('a'));
  const panels = tabs.map(tab => document.getElementById(tab.hash.slice(1)));
  const video = document.getElementById('shed-film');
  const viewer = document.querySelector('[data-shed-viewer]');

  function showGuide(index) {

    tabs.forEach((tab, i) => {
      const active = i === index;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
      if (!active) panels[i].querySelectorAll('video').forEach(film => film.pause());
      panels[i].hidden = !active;
    });
  }

  function selectTab(index, focus = false) {
    showGuide(index);
    const tab = tabs[index];
    if (location.hash !== tab.hash) history.pushState(null, '', tab.hash);
    if (focus) tab.focus();
  }

  function followFragment() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    const index = panels.indexOf(target.closest('[data-guide-panel]'));
    if (index === -1) return;
    showGuide(index);
    if (target !== panels[index]) target.scrollIntoView({block: 'start'});
  }

  nav.setAttribute('role', 'tablist');
  tabs.forEach((tab, i) => {
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panels[i].id);
    panels[i].setAttribute('role', 'tabpanel');
    panels[i].setAttribute('aria-labelledby', tab.id);
    panels[i].tabIndex = 0;
    tab.addEventListener('click', event => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      selectTab(i);
    });
    tab.addEventListener('keydown', event => {
      const nextIndex = {
        ArrowRight: (i + 1) % tabs.length,
        ArrowLeft: (i + tabs.length - 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      }[event.key];
      if (nextIndex === undefined) return;
      event.preventDefault();
      selectTab(nextIndex, true);
    });
  });
  showGuide(0);
  followFragment();
  window.addEventListener('hashchange', followFragment);
  window.addEventListener('popstate', followFragment);

  document.querySelector('[data-watch]').addEventListener('click', event => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    selectTab(0);
    video.focus({ preventScroll: true });
    video.scrollIntoView({ block: 'center' });
    video.play().catch(() => {
      // The visible native controls can start playback if the browser requires another tap.
    });
  });
  document.querySelector('[data-explore]').addEventListener('click', () => {
    if (viewer.dataset.ready === 'true') {
      requestAnimationFrame(() => viewer.querySelector('canvas').focus({ preventScroll: true }));
    }
  });

  const switcher = document.querySelector('[data-wind-switch]');
  const views = Array.from(switcher.querySelectorAll('button'));
  const pictures = Array.from(document.querySelectorAll('[data-wind-image]'));

  function showWindDiagram(view) {
    views.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.windView === view)));
    pictures.forEach(image => { image.hidden = image.dataset.windImage !== view; });
  }

  views.forEach(button => button.addEventListener('click', () => showWindDiagram(button.dataset.windView)));
  showWindDiagram('roof');
  switcher.hidden = false;
})();
