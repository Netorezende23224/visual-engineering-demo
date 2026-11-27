(() => {
  const view = document.querySelector('#lintel-preview');
  const ctx = view.getContext('2d');
  if (!ctx) return;
  const part = document.querySelector('#lintel-part'), angle = document.querySelector('#lintel-angle');
  const label = document.querySelector('#lintel-readout'), cover = document.querySelector('#lintel-cover');
  const cache = new Map();
  const names = {webs:'C90 · 5 diagonal webs + 2 end posts',opaque:'2 full-length opaque face plates',faces:'2 full-length translucent face plates · 5 diagonal webs + 2 end posts','no-webs':'2 plates · 0 webs',timber:'Solid timber · 90 × 300 mm'};
  function draw() {
    const img = cache.get(part.value);
    if (!img?.complete || !img.naturalWidth) return;
    const i = Number(angle.value);
    ctx.drawImage(img, i%6*720, Math.floor(i/6)*210,720,210,0,0,720,210);
    cover.hidden = true; view.hidden = false;
    label.textContent = names[part.value];
  }
  function load() {
    const key=part.value;
    if (!Object.hasOwn(names,key)) return;
    let img=cache.get(key);
    if (!img) {
      img = new Image(); cache.set(key,img); img.onload = draw;
      img.onerror = () => {cache.delete(key); if (part.value===key) {view.hidden=true; cover.hidden=false; label.textContent='Frame preview · selected view unavailable';}};
      img.src = 'media/lintel-'+key+'-orbit.webp';
    }
    draw();
  }
  part.onchange=load; angle.oninput=draw;
  let drag;
  view.onpointerdown=e=>{view.setPointerCapture(e.pointerId);drag={x:e.clientX,i:Number(angle.value)};};
  view.onpointermove=e=>{if(drag){angle.value=((drag.i+Math.round((e.clientX-drag.x)/10))%24+24)%24;draw();}};
  view.onlostpointercapture=()=>{drag=null;};
  document.querySelector('.lintel-options').hidden=false;
  new IntersectionObserver((rows,observer)=>{if(rows.some(r=>r.isIntersecting)){load();observer.disconnect();}}).observe(cover);
})();
