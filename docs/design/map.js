// Shared MapLibre mount helper. window.MVMap.mount(el, {center:[lng,lat], radius, decls, zoom, onPick, interactive})
(function(){
  var loading=null;
  function load(){
    if(window.maplibregl) return Promise.resolve();
    if(loading) return loading;
    loading=new Promise(function(res,rej){
      var l=document.createElement('link'); l.rel='stylesheet'; l.href='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css'; document.head.appendChild(l);
      var s=document.createElement('script'); s.src='https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s);
    });
    return loading;
  }
  var STYLE={version:8,sources:{osm:{type:'raster',tiles:['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],tileSize:256,attribution:'© OpenStreetMap'}},layers:[{id:'osm',type:'raster',source:'osm',paint:{'raster-saturation':-0.35,'raster-brightness-max':0.96}}]};
  function fc(decls){ return {type:'FeatureCollection',features:(decls||[]).map(function(d){return {type:'Feature',properties:{id:d.id,type:d.type,ha:d.ha,dist:d.dist,received:d.received,isNew:d.isNew},geometry:{type:'Polygon',coordinates:[d.poly]}};})}; }
  function areaFc(areas){ return {type:'FeatureCollection',features:(areas||[]).map(function(a){return {type:'Feature',properties:{id:a.id,name:a.name},geometry:{type:'Polygon',coordinates:[window.MV_DATA.circlePoly(a.lng,a.lat,a.radius)]}};})}; }
  function mount(el, o){
    if(!el) return; if(el.__mv){ update(el,o); return; }
    el.__mv={opts:o};
    load().then(function(){
      if(!el.isConnected) return;
      var m=new maplibregl.Map({container:el,style:STYLE,center:o.center,zoom:o.zoom||13,attributionControl:false,interactive:o.interactive!==false,cooperativeGestures:!!o.cooperative});
      m.addControl(new maplibregl.AttributionControl({compact:true}),'bottom-right');
      m.once('idle',function(){ var a=el.querySelector('.maplibregl-ctrl-attrib'); if(a){ a.classList.remove('maplibregl-compact-show'); a.removeAttribute('open'); } });
      if(o.interactive!==false) m.addControl(new maplibregl.NavigationControl({showCompass:false}),'top-right');
      el.__mv.map=m;
      m.on('load',function(){
        m.addSource('decl',{type:'geojson',data:fc(o.decls)});
        m.addSource('areas',{type:'geojson',data:areaFc(o.areas||[])});
        m.addLayer({id:'decl-fill',type:'fill',source:'decl',paint:{'fill-color':['match',['get','type'],'harvennus','#F0B35A','uudistus','#D9572B','#9AA39D'],'fill-opacity':0.5}});
        m.addLayer({id:'decl-line',type:'line',source:'decl',paint:{'line-color':['match',['get','type'],'harvennus','#9C6010','uudistus','#A33E1A','#5C6B62'],'line-width':1.5}});
        m.addLayer({id:'area-fill',type:'fill',source:'areas',paint:{'fill-color':'#2B6247','fill-opacity':0.12}});
        m.addLayer({id:'area-line',type:'line',source:'areas',paint:{'line-color':'#2B6247','line-width':2,'line-dasharray':[2,1.5]}});
        el.__mv.markers=(o.areas||[]).map(function(a){ var mk=document.createElement('div'); mk.style.cssText='width:14px;height:14px;border-radius:50%;background:#1E4A37;border:3px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,.35);cursor:'+(o.draggable?'grab':'default'); return new maplibregl.Marker({element:mk,draggable:!!o.draggable}).setLngLat([a.lng,a.lat]).addTo(m).on('dragend',function(e){ var cur=el.__mv.opts; if(cur.onDrag){var p=e.target.getLngLat(); cur.onDrag([p.lng,p.lat]);} }); });
        if(o.onPick){ m.on('click','decl-fill',function(e){ var f=e.features[0]; el.__mv.opts.onPick(f.properties.id,e.lngLat); }); m.on('mouseenter','decl-fill',function(){m.getCanvas().style.cursor='pointer';}); m.on('mouseleave','decl-fill',function(){m.getCanvas().style.cursor='';}); }
        m.on('click',function(e){ var cur=el.__mv.opts; if(cur.onMapClick&&!m.queryRenderedFeatures(e.point,{layers:['decl-fill']}).length) cur.onMapClick([e.lngLat.lng,e.lngLat.lat]); });
        if(o.fit) fitTo(m,o);
      });
      new ResizeObserver(function(){ m.resize(); }).observe(el);
    });
  }
  function fitTo(m,o){ var pts=[]; (o.decls||[]).forEach(function(d){pts=pts.concat(d.poly);}); (o.areas||[]).forEach(function(a){pts=pts.concat(window.MV_DATA.circlePoly(a.lng,a.lat,a.radius,8));}); if(!pts.length) return; var b=pts.reduce(function(b,p){return b.extend(p);},new maplibregl.LngLatBounds(pts[0],pts[0])); m.fitBounds(b,{padding:40,duration:600,maxZoom:15}); }
  function update(el,o){ var m=el.__mv.map; el.__mv.opts=o; if(!m||!m.getSource('decl')) return; m.getSource('decl').setData(fc(o.decls)); m.getSource('areas').setData(areaFc(o.areas||[])); var mk=el.__mv.markers||[]; (o.areas||[]).forEach(function(a,i){ if(mk[i]) mk[i].setLngLat([a.lng,a.lat]); }); if(o.fit) fitTo(m,o); if(o.flyTo){ m.easeTo({center:o.flyTo,duration:500}); } }
  function recenter(el){ var m=el&&el.__mv&&el.__mv.map; if(m) fitTo(m,el.__mv.opts); }
  window.MVMap={mount:mount,update:update,recenter:recenter};
})();
