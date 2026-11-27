/* Geographic screening shared with the fixed public example. Coordinates are local metres, east and north. */
(() => {
  'use strict';
  const dirs = ['N','NE','E','SE','S','SW','W','NW'];
  const deg = Math.PI/180, earth=6371008.8;
  const homes=new Set(['house','detached','semidetached_house','terrace','residential','apartments','bungalow']);
  const key=p=>p.lat+','+p.lon;
  function closeWays(parts) {
    const pending=parts.map(part=>part.slice()), rings=[];
    while(pending.length){
      let ring=pending.pop();
      while(ring.length && key(ring[0])!==key(ring.at(-1))){
        const end=key(ring.at(-1));
        const i=pending.findIndex(p=>key(p[0])===end || key(p.at(-1))===end);
        if(i<0) return null;
        const next=pending.splice(i,1)[0];
        if(key(next[0])!==end) next.reverse();
        ring=ring.concat(next.slice(1));
      }
      if(ring.length<4)return null;
      rings.push(ring);
    }
    return rings;
  }
  function parts(element,role) {
    if(element.type==='way')return role==='outer' ? [element.geometry] : [];
    return element.members.filter(m=>m.type==='way' && (m.role||'outer')===role).map(m=>m.geometry);
  }
  function polygons(element,role,lat,lon) {
    const lines=parts(element,role);
    if(lines.some(g=>!Array.isArray(g)||g.length<2||g.some(p=>!Number.isFinite(p?.lat)||!Number.isFinite(p?.lon))))return null;
    const rings=closeWays(lines);
    return rings?.map(r=>r.map(p=>[(p.lon-lon)*deg*earth*Math.cos(lat*deg),(p.lat-lat)*deg*earth]));
  }
  function metrics(ring) {
    let twice=0, x=0, y=0, contains=false;
    for(let i=1;i<ring.length;i++){
      const [a,b]=ring[i-1],[c,d]=ring[i], cross=a*d-c*b;
      twice+=cross;x+=(a+c)*cross;y+=(b+d)*cross;
      if((b>0)!==(d>0) && a+(c-a)*(-b)/(d-b)>0)contains=!contains;
    }
    return {area:Math.abs(twice)/2,x:x/(3*twice),y:y/(3*twice),contains};
  }
  function height(tags) {
    const actual=String(tags.height||'').trim().match(/^(\d+(?:\.\d+)?)\s*(?:m)?$/i);
    if(actual && +actual[1]>0 && +actual[1]<1000)return {metres:+actual[1],estimated:false};
    const levels=Number(tags['building:levels']);
    return Number.isInteger(levels)&&levels>0&&levels<=180 ? {metres:3*levels,estimated:true} : null;
  }
  function footprint(outer,inner,radius) {
    let area=0,x=0,y=0,inside=false;
    for(const [rings,sign] of [[outer,1],[inner,-1]]){
      for(const ring of rings){
        const m=metrics(ring);if(m.area<=0)continue;
        area+=sign*m.area;x+=sign*m.area*m.x;y+=sign*m.area*m.y;
        if(m.contains)inside=sign===1;
      }
    }
    if(!(area>0))return null;
    x/=area;y/=area;
    const distance=Math.hypot(x,y);
    if(distance>radius&&!inside)return null;
    const sector=Math.floor(((Math.atan2(x,y)/deg+382.5)%360)/45);
    const ring=Math.min(2,Math.floor(distance/radius*3));
    return {rings:[...outer,...inner],x,y,distance,sector,ring,area,inside};
  }
  const archiveRoot=new URL('the_gap/',document.currentScript.src);
  function savedSite(lat,lon,radius) {
    return Math.abs(lat+27.442591)<.000002 && Math.abs(lon-152.9454686)<.000002 && radius<=500;
  }
  async function readArchive(file,signal){
    const response=await fetch(new URL(file,archiveRoot),{signal});
    if(!response.ok)throw Error('Survey extract unavailable.');
    return response.json();
  }
  async function savedBuildings(radius,signal){
    const data=await readArchive('footprints.json',signal),features=[];
    for(const row of data.buildings){
      const f=footprint(row.rings.slice(0,1),row.rings.slice(1),radius);
      if(f)features.push({...f,id:String(row.id),type:row.type,residential:homes.has(row.type),source:row.source,
        height:row.height===null?null:{metres:row.height,estimated:false,lidar:true}});
    }
    return {features,omitted:0,archived:true};
  }
  async function savedProfiles(radius,signal){
    const data=await readArchive('profile.json',signal);
    return data.rays.map(ray=>Array.from({length:25},(_,i)=>{
      const distance=radius*i/24,lo=Math.floor(distance),t=distance-lo;
      return {distance,z:(1-t)*ray[lo]+t*ray[Math.ceil(distance)]};
    }));
  }
  function buildings(data,lat,lon,radius) {
    if(!Array.isArray(data?.elements) || data.remark)throw Error('Building query incomplete. Retry with a smaller radius.');
    const elements=data.elements.filter(e=>e.tags?.building && !['no','construction','demolished','ruins'].includes(e.tags.building));
    const relations=elements.filter(e=>e.type==='relation' && e.tags.type==='multipolygon');
    const members=new Set(relations.flatMap(r=>r.members.filter(m=>m.type==='way').map(m=>m.ref)));
    const features=[];let omitted=0;
    for(const e of [...relations,...elements.filter(e=>e.type==='way'&&!members.has(e.id))]){
      const outer=polygons(e,'outer',lat,lon),inner=polygons(e,'inner',lat,lon);
      if(!outer?.length||!inner){omitted++;continue;}
      const f=footprint(outer,inner,radius);
      if(f)features.push({...f,id:e.type+'/'+e.id,residential:homes.has(e.tags.building),type:e.tags.building,height:height(e.tags),source:'OpenStreetMap'});
    }
    return {features,omitted,date:data.osm3s?.timestamp_osm_base};
  }
  function median(values){
    if(!values.length)return null;
    const a=[...values].sort((p,q)=>p-q),n=Math.floor(a.length/2);
    return a.length%2?a[n]:(a[n-1]+a[n])/2;
  }
  function obstacleBand(survey,dir,band,radius,cover) {
    const objects=survey.features.filter(f=>!f.inside && f.sector===dirs.indexOf(dir) && f.ring===band);
    const area=Math.PI*(2*band+1)*(radius/3)**2/8, n=objects.length, density=n*10000/area;
    const heights=objects.filter(f=>f.height), tagged=heights.filter(f=>!f.height.estimated), h=median(heights.map(f=>f.height.metres));
    const tall=tagged.filter(f=>f.height.metres>=10 && f.area>=100);
    let tc=null, why='Mapped evidence is insufficient to assign a category.';
    // These are indicative prompts. Missing OSM features and unknown heights cannot establish a low category.
    if(n>=5 && density>=2 && tall.length>=Math.max(5,n*.6)){
      tc=4;why='Numerous large footprints with mapped heights of at least 10 m. Check obstacle spacing and continuity.';
    }else if(n>=5 && density>=10 && h!==null && heights.length>=n/2 && h>=3 && h<=10){
      tc=3;why='Closely spaced obstacles with typical heights in the 3–10 m range.';
    }else if(n>=5 && density>=10){
      why='Closely spaced buildings. TC3 is plausible if typical obstacle heights are confirmed.';
    }else if(n>=3 && density>=2 && density<10 && (h===null || h<=10)){
      tc=2.5;why='Scattered mapped buildings. Check heights and inspect gaps in the mapping.';
    }else if(density<2 && cover?.percent>=85 && ['Grassland','Bare or sparse'].includes(cover.cover)){
      tc=2;why='Sparse mapped buildings and predominantly open mapped land. Verify coverage and vegetation.';
    }
    return {count:n,houses:objects.filter(f=>f.residential).length,density,known:tagged.length,estimated:heights.length-tagged.length,
      unknown:n-heights.length,median:h,tc,why};
  }
  async function loadBuildings(lat,lon,radius,signal) {
    if(savedSite(lat,lon,radius))return savedBuildings(radius,signal);
    const near='(around:'+Math.ceil(radius)+','+lat.toFixed(6)+','+lon.toFixed(6)+')';
    const query='[out:json][timeout:15][maxsize:16000000];(way["building"]'+near+';relation["type"="multipolygon"]["building"]'+near+';);out body geom;';
    const response=await fetch('https://overpass-api.de/api/interpreter',{method:'POST',body:new URLSearchParams({data:query}),signal});
    if(!response.ok)throw Error('Building provider unavailable.');
    const text=await response.text();
    if(text.length>10000000)throw Error('Too many buildings. Use a smaller radius.');
    return buildings(JSON.parse(text),lat,lon,radius);
  }
  function pixel(lat,lon) {
    const size=256*2**12;
    return [(lon+180)/360*size,(1-Math.asinh(Math.tan(lat*deg))/Math.PI)/2*size];
  }
  const decode=(r,g,b)=>256*r+g+b/256-32768;
  async function demTile(x,y,signal){
    const response=await fetch('https://elevation-tiles-prod.s3.amazonaws.com/terrarium/12/'+x+'/'+y+'.png',{signal});
    if(!response.ok)throw Error('Elevation tile unavailable.');
    const im=await createImageBitmap(await response.blob(),{colorSpaceConversion:'none'});
    try{
      if(im.width!==256||im.height!==256)throw Error('Invalid elevation tile.');
      const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
      const ctx=canvas.getContext('2d');ctx.drawImage(im,0,0);
      return ctx.getImageData(0,0,256,256).data;
    }finally{im.close();}
  }
  async function profiles(lat,lon,radius,signal) {
    if(savedSite(lat,lon,radius))return savedProfiles(radius,signal);
    const tiles=new Map(), samples=[];
    for(let k=0;k<8;k++){
      const ray=[];
      for(let j=0;j<=24;j++){
        const distance=radius*j/24,theta=k*45*deg;
        const [px,py]=pixel(lat+Math.cos(theta)*distance/(earth*deg),lon+Math.sin(theta)*distance/(earth*deg*Math.cos(lat*deg)));
        const x=Math.floor(px/256),y=Math.floor(py/256),tile=x+'/'+y;
        if(!tiles.has(tile))tiles.set(tile,demTile(x,y,signal));
        ray.push({distance,tile,i:4*((Math.floor(py)%256)*256+(Math.floor(px)%256))});
      }
      samples.push(ray);
    }
    const grids=new Map(await Promise.all([...tiles].map(async ([k,p])=>[k,await p])));
    return samples.map(ray=>ray.map(({distance,tile,i})=>{
      const a=grids.get(tile),z=decode(a[i],a[i+1],a[i+2]);
      if(!a[i+3]||z < -500||z>9500)throw Error('Elevation coverage incomplete.');
      return {distance,z};
    }));
  }
  function relief(rays,dir){
    const k=dirs.indexOf(dir),up=rays[k],down=rays[(k+4)%8],site=up[0].z;
    const left=up.slice(1).reverse().map(o=>({distance:-o.distance,z:o.z})),line=[...left,...down];
    const peak=line.reduce((a,b)=>b.z>a.z?b:a),range=Math.max(...line.map(o=>o.z))-Math.min(...line.map(o=>o.z));
    const dropUp=site-median(up.slice(12).map(o=>o.z)),dropDown=site-median(down.slice(12).map(o=>o.z));
    let position='Variable relief along this transect.';
    if(range<6)position='Low relief along this transect.';
    else if(dropUp>=10&&dropDown>=10){
      const nearSite=Math.abs(peak.distance)<=Math.max(up[1].distance,up.at(-1).distance*.1);
      position=nearSite && peak.z-site<=2 ? 'Possible crest or ridge at the site on this transect.' :
        'Elevated ground, with the sampled high point away from the site.';
    }
    else if(dropUp<=-10&&dropDown<=-10)position='Possible low point between higher ground on this transect.';
    else if(Math.sign(dropUp)!==Math.sign(dropDown)&&Math.abs(dropUp-dropDown)>=10)position='Site on a slope along this transect.';
    return {line,site,peak,range,position,upGrade:100*(site-up.at(-1).z)/up.at(-1).distance};
  }
  window.VESiteContext={dirs,buildings,obstacleBand,loadBuildings,profiles,relief,decode,savedSite,archiveRoot};
})();
