(() => {
  const gap=new URLSearchParams(location.search).get('site')==='the-gap';
  const lat=gap?-27.442591:-27.4751912, lon=gap?152.9454686:153.02579637, earth=6371008.8, degrees=180/Math.PI;
  const svg=document.querySelector('svg'), field=id=>document.getElementById(id);
  const dirs=['N','NE','E','SE','S','SW','W','NW'];
  const classes={'0,100,0':'Tree cover','255,187,34':'Shrubland','255,255,76':'Grassland',
    '240,150,255':'Cropland','250,0,0':'Built-up','180,180,180':'Bare or sparse',
    '240,240,240':'Snow or ice','0,100,200':'Permanent water','0,150,160':'Herbaceous wetland',
    '0,207,117':'Mangroves','250,230,160':'Moss or lichen'};
  let generation=0, raster;
  for(const dir of dirs) field('direction').add(new Option(dir,dir));
  const siteLabel=gap?'Yuruga Street, The Gap, Brisbane QLD 4061':'1 William Street, Brisbane';
  if(gap){
    document.title='Yuruga Street · WindLab terrain assessment';document.querySelector('h1').textContent='Yuruga Street terrain assessment';
    field('site-location').textContent=siteLabel+' · public road reference point';
    field('city-case').hidden=true;
    field('radius').replaceChildren(...[150,250,350,500].map(n=>new Option(n,n,n===350,n===350)));
    field('layer').add(new Option('Saved 2022 aerial','aerial'),0);field('layer').value='aerial';
    field('osm-pin').href='https://www.openstreetmap.org/?mlat='+lat+'&mlon='+lon+'#map=17/'+lat+'/'+lon;
  }
  function node(tag, attrs, text) {
    const element=document.createElementNS('http://www.w3.org/2000/svg',tag);
    for(const [key,value] of Object.entries(attrs)) element.setAttribute(key,value);
    if(text) element.textContent=text;
    svg.append(element);return element;
  }
  function polar(a,r) {return [Math.sin(a/degrees)*r,-Math.cos(a/degrees)*r];}
  const exampleTerrain=Object.fromEntries(dirs.map(d=>[d,'3']));
  const multiplier={'1':1.08,'2':1,'2.5':.92,'3':.83,'4':.75};
  const exampleMt=Object.fromEntries(dirs.map(d=>[d,1]));
  field('example-mt').onchange=()=>{exampleMt[field('direction').value]=Number(field('example-mt').value);overlay();};
  field('example-tc').onchange=()=>{exampleTerrain[field('direction').value]=field('example-tc').value;overlay();};
  function overlay() {
    svg.querySelectorAll('[data-overlay]').forEach(e=>e.remove());
    const before=svg.childElementCount, bearing=dirs.indexOf(field('direction').value)*45;
    node('path',{d:'M0,0 L'+polar(bearing-22.5,100)+' A100,100 0 0 1 '+polar(bearing+22.5,100)+' Z',fill:'#0d6792','fill-opacity':.21,stroke:'#df3588','stroke-width':1});
    for(const r of [100/3,200/3,100])node('circle',{cx:0,cy:0,r,stroke:'#223c4c',fill:'none','stroke-width':.65});
    dirs.forEach((dir,i)=>{
      const [x,y]=polar(i*45-22.5,100);
      node('line',{x1:0,y1:0,x2:x,y2:y,stroke:'#da3685','stroke-width':.85});
      const [cx,cy]=polar(i*45,100);
      node('line',{x1:0,y1:0,x2:cx,y2:cy,stroke:'#ff66b2','stroke-width':dir===field('direction').value?2.4:1.2});
      const [tx,ty]=polar(i*45,113);
      node('text',{x:tx,y:ty+3,'text-anchor':'middle','font-size':9,'font-weight':700,stroke:'white','stroke-width':2.7,'paint-order':'stroke',fill:'#203744'},dir);
    });
    node('circle',{cx:0,cy:0,r:3.2,fill:'#10394d',stroke:'white','stroke-width':1});
    [...svg.children].slice(before).forEach(e=>e.dataset.overlay='');
    const sectorBands=Object.fromEntries(dirs.map(d=>[d,[{},{},{}]]));
    const bands=sectorBands[field('direction').value];
    if(raster){
      for(let y=0;y<256;y++)for(let x=0;x<256;x++){
        const east=(x+.5)/128-1,north=1-(y+.5)/128,dist=Math.hypot(east,north);
        if(dist>1)continue;
        const name=dirs[Math.floor(((Math.atan2(east,north)*degrees+382.5)%360)/45)];
        const i=(256*y+x)*4,c=raster[i+3]===255?classes[[raster[i],raster[i+1],raster[i+2]].join(',')]:'Unknown';
        const row=sectorBands[name][Math.min(2,Math.floor(dist*3))],key=c||'Unknown';row[key]=(row[key]||0)+1;
      }
    }
    const radius=Number(field('radius').value);
    const sectorCover=Object.fromEntries(dirs.map(d=>[d,sectorBands[d].map(band=>{
      const entry=Object.entries(band).sort((a,b)=>b[1]-a[1])[0];
      return entry ? {cover:entry[0],percent:100*entry[1]/Object.values(band).reduce((a,b)=>a+b,0)} : null;
    })]));
    field('example-tc').value=exampleTerrain[field('direction').value];
    field('example-mt').value=String(exampleMt[field('direction').value]);
    const values={};
    for(const d of dirs){
      const reference=57*multiplier[exampleTerrain[d]], mt=exampleMt[d];
      const q=.0006*Math.max(30,reference*mt)**2;
      values[d]={q,net:q*.7,mt,neutralQ:.0006*Math.max(30,reference)**2};
    }
    window.VESiteSurvey.show({lat,lon,label:siteLabel},radius,field('direction').value,svg,sectorCover[field('direction').value],values,exampleTerrain,sectorCover);
    field('sector').textContent=field('direction').value+' · upwind bands';
    field('bands').replaceChildren(...bands.map((band,i)=>{
      const li=document.createElement('li'),entry=Object.entries(band).sort((a,b)=>b[1]-a[1])[0];
      li.textContent=Math.round(i*radius/3)+'–'+Math.round((i+1)*radius/3)+' m'+(entry?' · '+entry[0]+' '+Math.round(100*entry[1]/Object.values(band).reduce((a,b)=>a+b,0))+'%':' · WorldCover unassessed');return li;
    }));
  }
  function draw(){
    const version=++generation, radius=Number(field('radius').value),status=field('status'),credit=field('credit');
    raster=null;svg.replaceChildren();status.textContent='Loading map…';
    if(field('layer').value==='aerial'){
      const w=500/radius*100;
      node('image',{x:-w,y:-w,width:2*w,height:2*w,href:new URL('aerial.webp',window.VESiteContext.archiveRoot)});
      status.textContent='2022 aerial photograph · true north up. Click a building to inspect it.';
      credit.textContent='© State of Queensland · imagery and data credits';credit.href='the_gap/sources.txt';
    }else if(field('layer').value==='cover'){
      credit.textContent='ESA WorldCover 2021 · CC BY 4.0';credit.href='https://esa-worldcover.org/en/data-access';
      const dy=radius/earth*degrees,dx=dy/Math.cos(lat/degrees);
      const query=new URLSearchParams({service:'WMS',version:'1.1.1',request:'GetMap',layers:'WORLDCOVER_2021_MAP',styles:'',format:'image/png',transparent:'true',srs:'EPSG:4326',width:'256',height:'256',bbox:[lon-dx,lat-dy,lon+dx,lat+dy].join(',')});
      const url='https://services.terrascope.be/wms/v2?'+query;
      const img=new Image();img.crossOrigin='anonymous';
      img.onload=()=>{
        if(version!==generation)return;
        const canvas=document.createElement('canvas');canvas.width=canvas.height=256;
        const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,256,256);
        try {raster=ctx.getImageData(0,0,256,256).data;} catch {raster=null;}
        svg.prepend(node('image',{x:-100,y:-100,width:200,height:200,href:url}));
        status.textContent='2021 land cover · true north up.';overlay();
      };
      img.onerror=()=>{if(version===generation)status.textContent='Land cover unavailable. The bands remain unassessed.';};
      img.src=url;
    }else{
      credit.textContent='© OpenStreetMap contributors';credit.href='https://www.openstreetmap.org/copyright';
      const zoom=Math.round(Math.log2(40075016.686*Math.cos(lat/degrees)/(2*radius))),n=2**zoom;
      const cx=(lon+180)/360*n,cy=(1-Math.asinh(Math.tan(lat/degrees))/Math.PI)/2*n;
      const w=40075016.686*Math.cos(lat/degrees)*100/(radius*n),extent=127/w;
      let failed=false;
      for(let x=Math.floor(cx-extent);x<=Math.floor(cx+extent);x++) for(let y=Math.floor(cy-extent);y<=Math.floor(cy+extent);y++){
        const tile=node('image',{x:(x-cx)*w,y:(y-cy)*w,width:w,height:w,href:'https://tile.openstreetmap.org/'+zoom+'/'+x+'/'+y+'.png',referrerpolicy:'origin'});
        tile.onload=()=>{if(version===generation&&!failed)status.textContent='Street map · true north up.';};
        tile.onerror=()=>{failed=true;if(version===generation)status.textContent='Street tiles unavailable or incomplete. The distance grid remains visible.';};
      }
    }
    overlay();
  }
  field('direction').onchange=overlay;field('radius').onchange=draw;field('layer').onchange=draw;draw();
})();
