(async () => {
  const el = id => document.getElementById(id);
  try {
    const response = await fetch('pages.json');
    if (!response.ok) throw new Error();
    const pages = await response.json();
    const select = el('page');
    pages.forEach((page, i) => select.add(new Option(String(i + 1), String(i + 1))));
    select.disabled = false;
    function display() {
      const value = Number(new URL(location.href).searchParams.get('page')) || 1;
      const n = Math.min(pages.length, Math.max(1, Math.floor(value)));
      const page = pages[n - 1];
      select.value = String(n);
      el('prev').disabled = n === 1;
      el('next').disabled = n === pages.length;
      el('scan').src = page.source;
      el('scan').alt = page.section + ', page ' + page.local + '. A text version follows the page.';
      el('position').textContent = page.section + ' · ' + page.local + ' of ' + page.total;
      el('text').textContent = page.text;
      el('paper').scrollLeft = 0;
    }
    function go(n) {
      const url = new URL(location.href);
      url.searchParams.set('page', String(n));
      history.pushState(null, '', url);
      display();
    }
    select.onchange = () => go(select.value);
    el('prev').onclick = () => go(Number(select.value) - 1);
    el('next').onclick = () => go(Number(select.value) + 1);
    el('zoom').onclick = () => el('zoom').setAttribute('aria-pressed', String(el('paper').classList.toggle('enlarged')));
    window.addEventListener('popstate', display);
    document.querySelector('nav').addEventListener('click', event => {
      const link = event.target.closest('a');
      if (link && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        go(new URL(link.href).searchParams.get('page'));
      }
    });
    display();
  } catch { el('position').textContent = 'The report could not load. Refresh to try again.'; }
})();
