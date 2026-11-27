(() => {
  const id = key => document.getElementById('rw-'+key);
  const editor=document.querySelector('.wall-editor'), form=id('save');
  const fields=[...editor.querySelectorAll('[data-wall-input]')];
  const soil=id('soil'), height=id('height'), table=id('schedule');
  const cases=['G','G + Q','G + Wu','G + Q + Wu','G + Q + Ws','G + 0.7Q + Ws','1.25G + 1.5Q','1.25G + 0.4Q + Wu','1.25G + 1.5Q + Wu'];
  let data, version=0, timer, saving=false;
  function inputs(){
    const spec={strip:id('strip').value==='strip'};
    for(const f of fields){
      if(!f.validity.valid || (!f.value && !f.dataset.wallInput.startsWith('poor')))throw Error('Review '+f.parentNode.textContent.trim()+'.');
      spec[f.dataset.wallInput]=f.value===''?null:f.valueAsNumber;
    }
    return spec;
  }
  async function post(url,spec){
    const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json','X-CSRFToken':form.elements.csrfmiddlewaretoken.value},
      body:JSON.stringify({revision:Number(form.dataset.revision),input:spec})});
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('Sign in again to continue.');
    const result=await response.json();
    if(!response.ok)throw Error(result.error||'The calculation is unavailable.');
    return result;
  }
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
  function result(){
    const label=soil.value,h=height.value,r=data[label]?.[h];
    id('title').textContent=label+' · '+h+' mm wall';
    id('charts').replaceChildren();
    if(!r){id('detail').textContent='Enter retained-soil unit weight and friction angle in a private study to calculate this category.';return;}
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
      for(const s of names)soil.add(new Option(s,s));soil.value='Trial clay';
      for(const h of heights)height.add(new Option(h,h));height.value='1800';
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
    for(const b of table.querySelectorAll('button'))b.setAttribute('aria-pressed',String(b.dataset.soil===soil.value&&b.dataset.height===height.value));
    result();
  }
  soil.onchange=height.onchange=selection;table.onclick=e=>{const b=e.target.closest('button');if(b){soil.value=b.dataset.soil;height.value=b.dataset.height;selection();}};
  async function solve(seq){
    try{
      let next;
      if(form)next=await post(form.dataset.solve,inputs());
      else{
        const res=await fetch('spacing-'+id('spacing').value+'.json');
        if(!res.ok)throw Error('The sample could not be loaded.');
        next=await res.json();
      }
      if(seq!==version)return;
      data=next;draw();id('output').hidden=false;id('status').textContent='';
    }catch(e){if(seq===version){id('output').hidden=true;id('status').textContent=e.message;}}
  }
  function change(){
    const seq=++version;id('output').hidden=true;id('status').textContent='Calculating schedule…';
    if(form){id('saved').textContent='Unsaved changes';for(const k of ['setback','width'])editor.querySelector('[data-wall-input='+k+']').disabled=id('strip').value!=='strip';}
    clearTimeout(timer);timer=setTimeout(()=>solve(seq),180);
  }
  if(form){
    const saved=JSON.parse(id('inputs').textContent);
    for(const f of fields)if(Object.hasOwn(saved,f.dataset.wallInput))f.value=saved[f.dataset.wallInput]??'';
    id('strip').value=saved.strip?'strip':'uniform';
    form.onsubmit=async e=>{
      e.preventDefault();if(saving)return;saving=true;form.querySelector('button').disabled=true;
      try{const spec=inputs(),res=await post(form.action,spec);form.dataset.revision=res.revision;
        id('saved').textContent=JSON.stringify(inputs())===JSON.stringify(spec)?'Saved to your account':'Unsaved changes';solve(++version);}
      catch(error){id('saved').textContent=error.message;}
      finally{saving=false;form.querySelector('button').disabled=false;}
    };
    editor.addEventListener('input',e=>{if(e.target.matches('[data-wall-input],#rw-strip'))change();});
  }else id('spacing').onchange=change;
  change();if(form)id('saved').textContent='';
})();
