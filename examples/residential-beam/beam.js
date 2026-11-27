(async () => {
  const response = await fetch('results.json');
  if (!response.ok) return;
  const studies = await response.json();
  const select = id => document.getElementById(id);
  const fmt = value => value.toFixed(2);
  function svgNode(tag, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
    return element;
  }
  function plot(curve, index, label, unit, scale) {
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = label + ' (' + unit + ')';
    const svg = svgNode('svg', {viewBox: '0 0 240 112', role: 'img', 'aria-label': caption.textContent + ' along the 4 m span'});
    // A constant vertical scale per diagram allows direct comparisons across cases and widths.
    const y = v => 55 - 45 * v / scale;
    svg.append(svgNode('line', {x1: 8, x2: 232, y1: 55, y2: 55, stroke: '#8ba2a8'}));
    const points = curve.map(row => (8 + 56 * row[0]) + ',' + y(row[index])).join(' ');
    svg.append(svgNode('polyline', {points, fill: 'none', stroke: '#006879', 'stroke-width': 2.5}));
    const values = curve.map(row => row[index]);
    const range = document.createElement('small');
    range.textContent = fmt(Math.min(...values)) + ' to ' + fmt(Math.max(...values)) + ' ' + unit;
    figure.append(caption, svg, range);
    return figure;
  }
  function update() {
    const study = studies[select('width').value];
    const result = study.cases[select('combination').value];
    select('readout').textContent = study.section + ' · Each bearing carries ' + fmt(result.reaction)
      + ' kN. G = ' + fmt(study.g) + ' kN/m including self-weight. Q = ' + fmt(study.q) + ' kN/m.';
    select('plots').replaceChildren(plot(result.curve, 1, 'Shear', 'kN', 40),
      plot(result.curve, 2, 'Bending moment', 'kNm', 40), plot(result.curve, 3, 'Displacement', 'mm', 25));
  }
  select('width').onchange = select('combination').onchange = update;
  update();
  select('explore').hidden = false;
})().catch(() => { /* The tabulated results remain readable if the fixed case data cannot load. */ });
