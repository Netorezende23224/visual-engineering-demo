(() => {
  const id = key => document.getElementById('rw-'+key);
  const soil=id('soil'), height=id('height'), table=id('schedule');
  const cases=['G','G + Q','G + Wu','G + Q + Wu','G + Q + Ws','G + 0.7Q + Ws','1.25G + 1.5Q','1.25G + 0.4Q + Wu','1.25G + 1.5Q + Wu'];
  const loadCase=id('case');
  let inspection={soil:'Trial clay',height:1800,case:9};
  cases.forEach((c,i)=>loadCase.add(new Option('LC'+(i+1)+' · '+c,String(i+1))));
  loadCase.value=String(inspection.case);
  let data, version=0;
  const svgNS='http://www.w3.org/2000/svg';
  function svg(tag,attrs,text){
    const el=document.createElementNS(svgNS,tag);
    for(const [key,val] of Object.entries(attrs))el.setAttribute(key,val);
    if(text!==undefined)el.textContent=text;
    return el;
  }
  function chart(title,items,limit){
    const box=document.createElement('section'),head=document.createElement('h3');
    box.className='rw-chart';head.textContent=title;box.append(head);
    const plot=svg('svg',{viewBox:'0 0 310 '+(items.length*24+12),role:'img','aria-label':title});
    const max=Math.max(...items.map(i=>i.value),limit||0,.001)*1.08,scale=140/max;
    items.forEach((item,j)=>{
      const y=8+j*24;
      const bar=svg('rect',{x:39,y,width:item.value*scale,height:13,fill:item.i>=6?'#a44d37':item.i>=4?'#326b83':'#42745c'});
      bar.append(svg('title',{},cases[item.i]+' · '+item.value));
      plot.append(svg('text',{x:1,y:y+11},'LC'+(item.i+1)),bar,svg('text',{x:187,y:y+11},item.value.toFixed(2)));
    });
    if(limit!=null)plot.append(svg('line',{x1:39+limit*scale,x2:39+limit*scale,y1:3,y2:items.length*24,stroke:'#192e36','stroke-dasharray':'3 2'}));
    box.append(plot);if(limit!=null){const p=document.createElement('p');p.textContent='Dashed line · '+limit.toFixed(2)+' '+(title.includes('mm')?'mm service limit':'kNm section capacity');box.append(p);}
    id('charts').append(box);
  }
  function tableOf(heads,rows) {
    const table=document.createElement('table'), head=table.createTHead().insertRow(), body=table.createTBody();
    for(const name of heads){const th=document.createElement('th');th.scope='col';th.textContent=name;head.append(th);}
    for(const values of rows){const tr=body.insertRow(); for(const value of values) tr.insertCell().textContent=value;}
    return table;
  }
  function breakdown(row){
    const box=id('breakdown'), i=Number(loadCase.value)-1;
    const values=row.contributions[i].map(([v,m],j)=>[['Soil self-weight','Surface surcharge','Fence wind'][j],v.toFixed(3),m.toFixed(3)]);
    values.push(['Total at post base',...row.cases[i].map(n=>n.toFixed(3))]);
    const t=tableOf(['Factored action','Shear (kN)','Moment (kNm)'],values);
    t.createCaption().textContent='LC'+(i+1)+' · '+cases[i];
    box.append(t);
    if(row.post){
      const c=row.checks, message=document.createElement('p');
      message.textContent='Post flexure: LC'+c.strengthCase+', '+row.utilisation+'% of the section screen. Service movement: LC'+c.serviceCase+', '+
        row.delta[c.serviceCase-1].toFixed(3)+' mm of '+row.limit.toFixed(2)+' mm ('+c.servicePercent.toFixed(2)+'%).';
      box.append(message);
    }
    if(row.pier){
      const p=row.pier, note=document.createElement('p');
      note.textContent='LC9 pier trial: the founding clay requires '+p.soilDepth.toFixed(3)+' m. Steel bearing requires '+p.requiredEmbed.toFixed(3)+
        ' m embedment, adopted at '+p.embed.toFixed(1)+' m. Minimum toe clearance is 0.100 m. Drilled depth: '+p.depth.toFixed(1)+' m, governed by '+p.depthBasis.toLowerCase()+'.';
      box.append(note);
    }
  }
  function heightPlot(schedule, selected){
    const box=id('height-plot'), heading=document.createElement('h3');
    heading.textContent='Base moment and post resistance by retained height';box.append(heading);
    const heights=Object.keys(schedule).map(Number).sort((a,b)=>a-b), left=44, top=12, right=426, base=165;
    const series=[
      {name:'Soil weight · LC1',color:'#42745c',value:r=>r.cases[0][1]},
      {name:'Service · LC5',color:'#326b83',value:r=>r.cases[4][1]},
      {name:'Ultimate · LC9',color:'#a44d37',value:r=>r.cases[8][1]},
      {name:'Post resistance',color:'#5e3976',value:r=>r.capacity}
    ];
    const max=Math.max(1,...heights.flatMap(h=>series.map(s=>s.value(schedule[h])||0)))*1.04;
    const x=h=>left+(right-left)*(h-heights[0])/(heights.at(-1)-heights[0]), y=v=>base-(base-top)*v/max;
    const plot=svg('svg',{viewBox:'0 0 448 204',role:'img','aria-label':'Moments in kNm against retained wall height in mm. Full values in the table below.'});
    for(const k of [0,.5,1]){
      const yy=y(k*max); plot.append(svg('line',{x1:left,x2:right,y1:yy,y2:yy,stroke:'#c4d2d1'}),svg('text',{x:left-5,y:yy+4,'text-anchor':'end'},String(Math.round(k*max))));
    }
    plot.append(svg('line',{x1:x(selected),x2:x(selected),y1:top,y2:base,stroke:'#35454d','stroke-dasharray':'4 3'}));
    for(const h of [heights[0],heights.at(-1)])plot.append(svg('text',{x:x(h),y:base+16,'text-anchor':'middle'},String(h)));
    plot.append(svg('text',{x:210,y:199,'text-anchor':'middle'},'Retained height (mm)'),svg('text',{x:2,y:top},'kNm'));
    const legend=document.createElement('p');
    for(const [j,s] of series.entries()){
      const points=heights.filter(h=>s.value(schedule[h])!=null).map(h=>[x(h),y(s.value(schedule[h]))]);
      if(j<3)plot.append(svg('polyline',{points:points.map(v=>v.join(',')).join(' '),fill:'none',stroke:s.color,'stroke-width':2}));
      else for(const [xx,yy] of points)plot.append(svg('circle',{cx:xx,cy:yy,r:3,fill:s.color}));
      const tag=document.createElement('span');tag.textContent=s.name;tag.style.borderColor=s.color;legend.append(tag);
    }
    legend.className='rw-series';box.append(plot,legend);
    const details=document.createElement('details'), summary=document.createElement('summary');
    summary.textContent='Read moment values by height';details.append(summary,tableOf(['Height (mm)','LC1 (kNm)','LC5 (kNm)','LC9 (kNm)','Resistance (kNm)'],
      heights.map(h=>[h,...series.map(s=>s.value(schedule[h])?.toFixed(2) ?? 'Pending')])));box.append(details);
  }
  function result(){
    const label=soil.value,h=height.value,r=data[label]?.[h];
    id('title').textContent=label+' · '+h+' mm wall';
    id('charts').replaceChildren();id('breakdown').replaceChildren();id('height-plot').replaceChildren();
    loadCase.disabled=!r;
    if(!r){id('detail').textContent='Enter retained-soil unit weight and friction angle in a private study to calculate this category.';return;}
    breakdown(r);heightPlot(data[label],Number(h));
    const p=r.pier;
    id('detail').textContent=(r.post?r.post+' · '+r.utilisation+'% section utilisation. ':'No catalogue post meets the section and deflection screens. ')+(p?
      'Trial pier Ø'+p.diameter+' mm, depth '+p.depth.toFixed(1)+' m, steel embedment '+p.embed.toFixed(1)+' m. Cage '+p.cage+' · pier peak '+p.pierMoment.toFixed(2)+' kNm / trial flexural resistance '+p.cageCapacity.toFixed(2)+' kNm.':'No matched pier and cage trial.');
    const series=key=>r.cases.map((v,i)=>({i,value:v[key]}));
    chart('Post moment (kNm)',series(1),r.capacity);chart('Horizontal shear (kN)',series(0));
    if(r.delta)chart('Service deflection (mm)',[0,1,4,5].map(i=>({i,value:r.delta[i]})),r.limit);
    const legend=document.createElement('p');legend.textContent=cases.map((c,i)=>'LC'+(i+1)+' = '+c).join(' · ');id('charts').append(legend);
  }
  function draw(){
    const names=Object.keys(data), heights=Object.keys(data['Trial clay']);
    if(!soil.options.length){
      for(const s of names)soil.add(new Option(s,s));soil.value=inspection.soil;
      for(const h of heights)height.add(new Option(h,h));height.value=String(inspection.height);
    }
    table.replaceChildren();const head=table.createTHead().insertRow();
    for(const s of ['H (mm)',...names]){const th=document.createElement('th');th.scope='col';th.textContent=s;head.append(th);}
    const body=table.createTBody();
    for(const h of heights){
      const row=body.insertRow(),th=document.createElement('th');th.scope='row';th.textContent=h;row.append(th);
      for(const s of names){
        const r=data[s][h],cell=row.insertCell();
        if(!r){cell.textContent='Input required';continue;}
        const b=document.createElement('button'),detail=document.createElement('small');b.type='button';b.textContent=r.post||'No passing post';
        detail.textContent=r.pier?'Ø'+r.pier.diameter+' × '+Math.round(r.pier.depth*1000)+' · '+r.utilisation+'%':'No pier trial';b.append(detail);
        b.dataset.soil=s;b.dataset.height=h;b.setAttribute('aria-label',s+', '+h+' mm: '+b.textContent);
        b.setAttribute('aria-pressed',String(s===soil.value&&h===height.value));cell.append(b);
      }
    }
    result();
  }
  function selection(){
    inspection={soil:soil.value,height:Number(height.value),case:Number(loadCase.value)};
    for(const b of table.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.soil===soil.value&&b.dataset.height===height.value));
    result();
  }
  soil.onchange=height.onchange=loadCase.onchange=selection;table.onclick=e=>{const b=e.target.closest('button');if(b){soil.value=b.dataset.soil;height.value=b.dataset.height;selection();}};
  async function solve(seq){
    try{
      const res=await fetch('spacing-'+id('spacing').value+'.json?v=2');
      if(!res.ok)throw Error('The sample could not be loaded.');
      const next=await res.json();
      if(seq!==version)return;
      data=next;draw();id('output').hidden=false;id('status').textContent='';
    }catch(e){if(seq===version){id('output').hidden=true;id('status').textContent=e.message;}}
  }
  function change(){
    const seq=++version;id('output').hidden=true;id('status').textContent='Loading schedule…';
    solve(seq);
  }
  id('spacing').onchange=change;
  change();
})();
