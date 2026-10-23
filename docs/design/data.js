// Sample data for the Metsävahti prototype (fictional declarations)
(function(){
  function circlePoly(lng, lat, m, n){ n=n||48; var c=[]; for(var i=0;i<=n;i++){var a=i/n*Math.PI*2; c.push([lng+(m/111320/Math.cos(lat*Math.PI/180))*Math.cos(a), lat+(m/111320)*Math.sin(a)]);} return c; }
  function blob(lng, lat, w, h, seed){ var c=[]; for(var i=0;i<8;i++){var a=i/8*Math.PI*2; var r=0.75+0.35*Math.abs(Math.sin(seed+i*1.7)); c.push([lng+(w/111320/Math.cos(lat*Math.PI/180))*Math.cos(a)*r, lat+(h/111320)*Math.sin(a)*r]);} c.push(c[0]); return c; }
  var TYPES={harvennus:{label:'Harvennushakkuu',color:'#F0B35A'},uudistus:{label:'Uudistushakkuu',color:'#D9572B'},muu:{label:'Muu hakkuu',color:'#9AA39D'}};
  var areas=[
    {id:'a1',name:'Mökki, Rääkkylä',place:'Rääkkylä, Pohjois-Karjala',lng:29.6212,lat:62.3115,radius:1000,notify:true,newCount:2,lastChecked:'6.9.2026 klo 06:10'},
    {id:'a2',name:'Kotitalo, Vihti',place:'Vihti, Uusimaa',lng:24.5541,lat:60.3187,radius:500,notify:true,newCount:0,lastChecked:'6.9.2026 klo 06:10'}
  ];
  var decl=[
    {id:'d1',area:'a1',type:'uudistus',ha:3.4,dist:420,received:'5.9.2026',isNew:true,species:'Kuusi, mänty',method:'Avohakkuu',regen:'Istutus',poly:blob(29.6280,62.3140,260,180,1)},
    {id:'d2',area:'a1',type:'harvennus',ha:6.1,dist:760,received:'4.9.2026',isNew:true,species:'Mänty',method:'Alaharvennus',regen:'–',poly:blob(29.6100,62.3060,330,200,2)},
    {id:'d3',area:'a1',type:'harvennus',ha:2.2,dist:880,received:'14.6.2026',isNew:false,species:'Kuusi',method:'Alaharvennus',regen:'–',poly:blob(29.6320,62.3050,200,150,3)},
    {id:'d4',area:'a1',type:'muu',ha:0.9,dist:610,received:'2.3.2026',isNew:false,species:'Koivu',method:'Erikoishakkuu',regen:'–',poly:blob(29.6160,62.3170,160,120,4)},
    {id:'d5',area:'a1',type:'uudistus',ha:4.8,dist:1320,received:'11.11.2025',isNew:false,species:'Mänty',method:'Siemenpuuhakkuu',regen:'Luontainen',poly:blob(29.6400,62.3080,300,220,5)},
    {id:'d6',area:'a2',type:'harvennus',ha:1.7,dist:310,received:'20.8.2026',isNew:false,species:'Kuusi',method:'Alaharvennus',regen:'–',poly:blob(24.5590,60.3200,180,120,6)}
  ];
  var alerts=[
    {id:'n1',declId:'d1',areaId:'a1',date:'5.9.2026',time:'06:12',read:false},
    {id:'n2',declId:'d2',areaId:'a1',date:'4.9.2026',time:'18:04',read:false},
    {id:'n3',declId:'d6',areaId:'a2',date:'20.8.2026',time:'06:11',read:true},
    {id:'n4',declId:'d3',areaId:'a1',date:'14.6.2026',time:'18:03',read:true}
  ];
  window.MV_DATA={TYPES:TYPES,areas:areas,decl:decl,alerts:alerts,circlePoly:circlePoly,dataMonth:'09/2026'};
})();
