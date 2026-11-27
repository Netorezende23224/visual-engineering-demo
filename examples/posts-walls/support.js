(async()=>{
  const response=await fetch('cases.json');
  if(!response.ok)return;
  const cases=await response.json(),el=id=>document.getElementById(id);
  function figure(points,index,label,unit){
    const values=points.map(row=>row[index]),lo=Math.min(0,...values),hi=Math.max(0,...values);
    const y=value=>88-75*(value-lo)/(hi-lo||1),height=points.at(-1)[0];
    const make=(tag,attrs)=>{const e=document.createElementNS('http://www.w3.org/2000/svg',tag);for(const [k,v] of Object.entries(attrs))e.setAttribute(k,v);return e;};
    const svg=make('svg',{viewBox:'0 0 260 110',role:'img','aria-label':label+' from base to top'});
    svg.append(make('line',{x1:8,x2:252,y1:y(0),y2:y(0),stroke:'#a1b7bb'}),
      make('polyline',{points:points.map(p=>(8+244*p[0]/height)+','+y(p[index])).join(' '),stroke:'#176776',fill:'none','stroke-width':2}));
    const f=document.createElement('figure'),caption=document.createElement('figcaption'),range=document.createElement('small');
    caption.textContent=label+' ('+unit+')';
    range.textContent=Math.min(...values).toFixed(3)+' to '+Math.max(...values).toFixed(3)+' '+unit+' · height 0 to '+height.toFixed(2)+' m';
    f.append(caption,svg,range);return f;
  }
  function draw(){
    const r=cases[el('member').value],c=r.cases[Number(el('load').value)];
    el('status').textContent=r.member+' · ULS compression '+r.demand+' against '+r.screen+' · '+r.use+' utilisation.';
    el('plots').replaceChildren(figure(c.samples,1,c.name+' axial force','kN'),figure(c.samples,2,c.name+' axial displacement','mm'));
  }
  el('member').onchange=el('load').onchange=draw;
  draw();el('explorer').hidden=false;
})().catch(()=>{ /* The four comparison rows remain available without the diagrams. */ });
