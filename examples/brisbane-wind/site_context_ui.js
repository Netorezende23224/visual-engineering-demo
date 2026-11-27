(() => {
  'use strict';
  const geo=window.VESiteContext, el=id=>document.getElementById(id);
  const ns='http://www.w3.org/2000/svg';
  const format=n=>n.toLocaleString('en-AU',{maximumFractionDigits:1});
  let key='',site,radius,dir='N',map,cover,buildingData,rays,buildingMessage='',demMessage='',version=0,controllers=[];
  let selected='';
  const archived=()=>site && geo.savedSite(site.lat,site.lon,radius);
  function svg(tag,attrs,text){
    const n=document.createElementNS(ns,tag);
    for(const [k,v] of Object.entries(attrs))n.setAttribute(k,v);
    if(text)n.textContent=text;
    return n;
  }
  const boundMaps=new WeakSet();
  function selectAt(event){
    if(!buildingData)return;
    const transform=map.getScreenCTM();if(!transform)return;
    const p=new DOMPoint(event.clientX,event.clientY).matrixTransform(transform.inverse());
    const x=p.x*radius/100,y=-p.y*radius/100;
    function contains(ring){
      let hit=false;
      for(let i=1;i<ring.length;i++){
        const [a,b]=ring[i-1],[c,d]=ring[i];
        if((b>y)!==(d>y) && x<a+(c-a)*(y-b)/(d-b))hit=!hit;
      }
      return hit;
    }
    const found=buildingData.features.find(b=>!b.inside&&b.rings.reduce((inside,r)=>contains(r)?!inside:inside,false));
    if(!found)return;
    const control=el('map-direction')||el('direction');
    control.value=geo.dirs[found.sector];control.dispatchEvent(new Event('change'));
    selected=found.id;el('context-footprint').value=selected;buildingDetail();footprints();
  }
  function footprints(){
    map?.querySelectorAll('[data-obstacles],[data-terrain-labels]').forEach(e=>e.remove());
    const group=svg('g',{'data-obstacles':'','pointer-events':'none'});
    if(!map || !buildingData)return;
    const scale=100/radius;
    // Combine ordinary footprints into paths to keep large urban sites responsive.
    const areas=new Map();
    for(const b of buildingData.features){
      const kind=b.id===selected?'selected':b.inside?'site':b.sector===geo.dirs.indexOf(dir)?'sector':'other';
      const path=b.rings.map(r=>r.map(([x,y],i)=>(i?'L':'M')+(x*scale).toFixed(2)+','+(-y*scale).toFixed(2)).join('')+'Z').join('');
      const paths=areas.get(kind)||[];paths.push(path);areas.set(kind,paths);
    }
    const aerial=(el('map-layer')||el('layer'))?.value==='aerial';
    const colours={other:aerial?'#a8e3ef':'#3b5361',sector:aerial?'#ffba5e':'#a63c13',site:'#167481',selected:'#ffff49'};
    for(const k of ['other','sector','site','selected']){
      if(areas.has(k))group.append(svg('path',{d:areas.get(k).join(''),fill:colours[k],stroke:k==='selected'?'#172c38':colours[k],
        'stroke-width':k==='selected'?1:.25,'fill-opacity':k==='other'?.25:.7,'fill-rule':'evenodd'}));
    }
    map.insertBefore(group,map.querySelector('path')?.closest('svg > *')||null);
    const labels=svg('g',{'data-terrain-labels':'','pointer-events':'none'});
    geo.dirs.forEach((name,i)=>{
      const bands=[0,1,2].map(b=>geo.obstacleBand(buildingData,name,b,radius,name===dir?cover?.[b]:null).tc);
      const caption=bands.every(tc=>tc!==null && tc===bands[0])?'TC'+bands[0]:bands.every(tc=>tc!==null)?'Mixed':'Review';
      const angle=i*Math.PI/4,x=89*Math.sin(angle),y=-89*Math.cos(angle);
      labels.append(svg('rect',{x:x-10,y:y-4.6,width:20,height:8,rx:1.4,fill:name===dir?'#ffdfa5':'#fff','fill-opacity':.94}),
        svg('text',{x,y:y+1.3,'font-size':5.5,'font-weight':700,'text-anchor':'middle',fill:'#173a48'},caption));
    });
    map.append(labels);
  }
  function buildingDetail() {
    const b=buildingData?.features.find(b=>b.id===selected);
    if(!b){el('footprint-detail').textContent='';return;}
    el('footprint-detail').textContent=b.type+' · '+b.source+' · '+format(b.distance)+' m from the site · '+format(b.area)+' m² footprint · '+
      (b.height?format(b.height.metres)+' m '+(b.height.estimated?'estimated from storeys':b.height.lidar?'LiDAR roof height':'mapped height'):'height unknown')+'.';
  }
  function obstacles(){
    el('building-state').textContent=buildingMessage;
    el('obstacle-title').textContent=dir+' · upwind buildings';
    const bands=el('obstacle-bands'),pick=el('context-footprint');
    bands.replaceChildren();pick.replaceChildren(new Option('Select a building',''));pick.disabled=true;
    el('sector-terrain').textContent='';
    if(buildingData){
      const suggestions=[];
      for(let i=0;i<3;i++){
        const b=geo.obstacleBand(buildingData,dir,i,radius,cover?.[i]);
        suggestions.push(b.tc);
        const p=document.createElement('p'),strong=document.createElement('strong');
        strong.textContent=Math.round(i*radius/3)+'–'+Math.round((i+1)*radius/3)+' m · '+(b.tc?'candidate TC'+b.tc:'category unresolved');
        p.append(strong,document.createElement('br'),b.count+' mapped buildings ('+b.houses+' residential), '+format(b.density)+' per ha. '+
          'Heights: '+b.known+(archived()?' LiDAR, ':' mapped, ')+b.estimated+' estimated, '+b.unknown+' unknown. '+(b.median===null?'':'Median '+format(b.median)+' m. ')+b.why);
        bands.append(p);
      }
      el('sector-terrain').textContent=suggestions.every(t=>t!==null && t===suggestions[0]) ?
        'Consistent candidate TC'+suggestions[0]+' across these viewing bands. The engineer must confirm the required fetch.' :
        'Bands differ or evidence is incomplete. Review terrain transitions before adopting a sector category.';
      const candidates=buildingData.features.filter(b=>!b.inside&&b.sector===geo.dirs.indexOf(dir)).sort((a,b)=>a.distance-b.distance);
      for(const b of candidates)pick.add(new Option(b.type+' · '+format(b.distance)+' m · '+b.id,b.id));
      if(!candidates.some(b=>b.id===selected))selected='';
      pick.value=selected;pick.disabled=!candidates.length;
    }
    buildingDetail();footprints();
  }
  function profile(){
    const chart=el('ground-profile');chart.replaceChildren();el('slope-result').textContent='';
    el('elevation-state').textContent=demMessage;chart.hidden=!rays;if(!rays)return;
    const r=geo.relief(rays,dir),opposite=geo.dirs[(geo.dirs.indexOf(dir)+4)%8];
    const heights=r.line.map(p=>p.z),min=Math.floor(Math.min(...heights)-2),max=Math.ceil(Math.max(...heights)+2);
    const x=d=>48+(d/radius+1)*209, y=z=>140-(z-min)/(max-min)*115;
    for(const z of [min,max]){
      chart.append(svg('line',{x1:48,y1:y(z),x2:466,y2:y(z),stroke:'#a2b4bc'}),svg('text',{x:43,y:y(z)+4,'text-anchor':'end','font-size':12},format(z)+' m'));
    }
    chart.append(svg('polyline',{points:r.line.map(p=>x(p.distance)+','+y(p.z)).join(' '),fill:'none',stroke:'#2c716b','stroke-width':3}),
      svg('line',{x1:x(0),y1:20,x2:x(0),y2:144,stroke:'#49636f','stroke-dasharray':'4 4'}),
      svg('circle',{cx:x(0),cy:y(r.site),r:4,fill:'#ab481a'}));
    for(const [d,label,anchor] of [[-radius,dir+' · '+radius+' m','start'],[0,'Site','middle'],[radius,opposite+' · '+radius+' m','end']]){
      chart.append(svg('text',{x:x(d),y:164,'font-size':13,'text-anchor':anchor},label));
    }
    el('slope-result').textContent=r.position+' Site elevation '+format(r.site)+' m; transect relief '+format(r.range)+
      ' m; average rise towards the site from '+dir+' '+format(r.upGrade)+'%. Highest sampled point '+format(r.peak.z)+' m, '+format(Math.abs(r.peak.distance))+' m '+(r.peak.distance<0?dir:r.peak.distance>0?opposite:'from the site')+'.';
  }
  function request(factory,success,failed){
    const id=version, controller=new AbortController();controllers.push(controller);
    const timer=setTimeout(()=>controller.abort(),19000);
    Promise.resolve().then(()=>factory(controller.signal)).then(result=>{if(id===version)success(result);})
      .catch(()=>{if(id===version)failed();}).finally(()=>clearTimeout(timer));
  }
  function refresh(){
    version++;controllers.forEach(c=>c.abort());controllers=[];buildingData=null;rays=null;selected='';
    el('context-retry').disabled=!site;
    buildingMessage=site?'Looking up building footprints…':'Building coverage unassessed.';
    demMessage=site?'Sampling elevations…':'Elevation unassessed.';
    const source=el('context-source');source.hidden=!archived();source.href=new URL('sources.txt',geo.archiveRoot);
    el('context-location').textContent=site?site.label+' · '+radius+' m radius':'Select a site to inspect its surroundings.';
    obstacles();profile();
    if(!site)return;
    request(s=>geo.loadBuildings(site.lat,site.lon,radius,s),result=>{
      buildingData=result;buildingMessage=result.features.length+' mapped footprints including the site if mapped. '+(result.archived?'Saved OSM, Microsoft and 2019 LiDAR outlines. ':'')+
        (result.omitted?result.omitted+' incomplete outlines excluded. ':'')+(result.date?'OSM snapshot '+result.date.slice(0,10)+'.':'');
      obstacles();
    },()=>{buildingMessage='Building data unavailable. Counts and terrain candidates are withheld.';obstacles();});
    request(s=>geo.profiles(site.lat,site.lon,radius,s),result=>{
      rays=result;demMessage=archived()?'Queensland bare-earth LiDAR DEM 2019 · metres AHD.':'Terrain Tiles · sampled elevation profile in metres.';profile();
    },()=>{demMessage='Elevation data unavailable. Slope and crest position remain unassessed.';profile();});
  }
  el('context-footprint').onchange=e=>{selected=e.target.value;buildingDetail();footprints();};
  el('context-retry').onclick=refresh;
  window.VESiteSurvey={
    show(point,metres,sector,svgMap,landCover){
      const next=point ? point.lat+','+point.lon+','+metres : '';
      const changedDirection=dir!==sector, changedCover=cover!==landCover;
      site=point;radius=metres;dir=sector;map=svgMap;cover=landCover;
      if(!boundMaps.has(map)){map.addEventListener('click',selectAt);boundMaps.add(map);}
      if(next!==key){key=next;refresh();}
      else if(changedDirection || changedCover){obstacles();profile();}
      else footprints();
    }
  };
})();
