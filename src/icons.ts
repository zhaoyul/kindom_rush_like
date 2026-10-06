const paths: Record<string, string> = {
  map: '<path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2ZM9 3v16M15 5v16"/><path d="m11 10 2-2 2 2-2 3Z"/>',
  save: '<path d="M4 3h13l4 4v14H3V3ZM7 3v7h10V3M7 21v-7h10v7"/><path d="M14 4v4"/>',
  cannon: '<circle cx="7" cy="17" r="4"/><path d="m7 13 9-7 6 6-11 5M14 7l5-4 4 4-5 5M10 21h12M14 15l4 6"/>',
  cluster: '<circle cx="12" cy="12" r="3"/><circle cx="4" cy="5" r="2"/><circle cx="20" cy="5" r="2"/><circle cx="4" cy="19" r="2"/><circle cx="20" cy="19" r="2"/><path d="m6 7 3 3m6 0 3-3M6 17l3-3m6 0 3 3"/>',
  pierce: '<path d="m3 21 9-9m-4-2 6 6M12 3l8 3v6c0 6-8 9-8 9M7 7l5-4m3 4 5-1-1 5m1-5-8 8"/>',
  quake: '<circle cx="12" cy="9" r="4"/><path d="M2 17c4-4 16-4 20 0M3 21c4-3 14-3 18 0M10 13l-2 4 4-1-2 6M12 1v2M4 4l2 2m12 0 2-2"/>',
  shield: '<path d="M12 3 20 6v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 6v12M15 8h-4a2 2 0 0 0 0 4h2a2 2 0 0 1 0 4H9"/>',
  wave: '<path d="m3 19 9-6 9 6M3 12l9-6 9 6M7 6l5-3 5 3"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  play: '<path d="m8 4 12 8-12 8Z"/>',
  arrow: '<path d="m4 20 16-16M13 4h7v7M4 13v7h7"/>',
  magic: '<path d="m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3Z"/>',
  barracks: '<path d="M4 21V8l8-5 8 5v13M8 21v-7h8v7M2 21h20M8 8h1M15 8h1"/>',
  flag: '<path d="M5 21V3M5 4h14l-3 4 3 4H5"/>',
  sword: '<path d="m14 4 6-1-1 6-9 9-4-4ZM3 13l8 8M7 17l-4 4"/>',
  meteor: '<path d="m21 3-8 8m8-3-4 4m-1-9-4 4"/><circle cx="8" cy="16" r="5"/><path d="m6 15 3 3"/>',
  users: '<circle cx="9" cy="7" r="3"/><path d="M2 21v-3a7 7 0 0 1 14 0v3M17 5a3 3 0 0 1 0 6M19 15a6 6 0 0 1 3 5"/>',
  sound: '<path d="m11 4-6 5H2v6h3l6 5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/>',
  mute: '<path d="m11 4-6 5H2v6h3l6 5ZM16 9l6 6m0-6-6 6"/>',
  expand: '<path d="M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5"/>',
  book: '<path d="M12 5v16M12 5C8 2 3 3 3 3v16s5-1 9 2c4-3 9-2 9-2V3s-5-1-9 2Z"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9 9a3 3 0 0 1 6 0c0 2-3 2-3 4M12 17h.01"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  reset: '<path d="M3 10a9 9 0 1 1 2 9M3 3v7h7"/>',
  star: '<path d="m12 2 3 6.5 7 1-5 5 1 7-6-3.5-6 3.5 1-7-5-5 7-1Z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 6v6l4 2"/>',
  leaf: '<path d="M20 3C8 2 2 7 4 14c2 7 12 7 15 0 2-4 1-11 1-11ZM3 21 16 8"/>',
  armor: '<path d="m8 3 4 3 4-3 5 5-4 3v10H7V11L3 8Z"/>',
  volley: '<path d="m4 20 5-12m-5 4 5-4 1 6m3 6 3-15m-4 4 4-4 2 5m1 14 2-9m-4 2 4-2 2 4"/>',
  crosshair: '<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v5m0 10v5M2 12h5m10 0h5"/>',
  vines: '<path d="M4 22C4 6 18 21 18 2M4 14l-2-3m5 9 4 1m1-9 4 2M15 6l-3-3"/><path d="M8 12C6 4 2 4 2 4s-1 7 6 8ZM15 16c7-1 7-6 7-6s-7 0-7 6Z"/>',
  chain: '<path d="m4 18 5-6 6 4 5-10M8 4l-2 6 4-1-2 5m10-1-2 6 4-1-2 5"/><circle cx="4" cy="18" r="2"/><circle cx="20" cy="6" r="2"/>',
  arcane: '<path d="m12 3 2 6 7 3-7 3-2 6-2-6-7-3 7-3Z"/><path d="m3 3 2 2m14 14 2 2M3 21l2-2M19 5l2-2"/>',
  frost: '<path d="M12 2v20M3.3 7l17.4 10M3.3 17 20.7 7M9 4l3 3 3-3M9 20l3-3 3 3M4 10l4-1-1-4m10 14-1-4 4-1M4 14l4 1-1 4m10-14-1 4 4 1"/>',
  whirlwind: '<path d="M3 8c1-6 18-7 18 1 0 6-14 2-14 7 0 3 8 5 12 1M7 3l-4 5 6 1m6 9 4-1-1 4M9 11l10-8M13 3h6v6"/>',
  formation: '<path d="m12 3 7 3v6c0 4-7 8-7 8s-7-4-7-8V6ZM12 7v9M8 11h8M2 8v8m20-8v8"/>',
  blessing: '<path d="M9 3h6v6h6v6h-6v6H9v-6H3V9h6Z"/><path d="M2 2l3 3m14 14 3 3M2 22l3-3M19 5l3-3"/>',
  moonblade: '<path d="M12 3a9 9 0 1 0 9 9 7 7 0 0 1-9-9Z"/><path d="m10 16 9-11 3-2-1 4-9 11m-4-4 6 6"/>',
  'ancient-tree': '<path d="M10 21h4M12 21V9M12 14l-5-4m5 2 5-4M6 15H3l3-5H4l5-6 3-2 3 2 5 6h-2l3 5h-3"/><path d="M4 20c4 3 12 3 16 0"/>',
};
export function icon(name: string, cls = ''): string {
  return `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.shield}</svg>`;
}
export function emblem(): string {
  return '<svg viewBox="0 0 64 72" aria-hidden="true"><path d="M32 3 58 15v27L32 68 6 42V15Z" fill="#2c4839" stroke="#bca46b" stroke-width="2"/><path d="M32 11 50 20v20L32 57 14 40V20Z" fill="none" stroke="#d8c18b" stroke-width="1"/><path d="m32 18-14 22h10v12h8V40h10Z" fill="#e1cc91"/><path d="m27 32 5-8 5 8" stroke="#2c4839" fill="none"/></svg>';
}
type SvgPoints = number[][];
function artPoly(points: SvgPoints, fill: string, stroke = '#42563d', width = 1.5): string {
  return `<polygon points="${points.map(p => p.join(',')).join(' ')}" fill="${fill}" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round"/>`;
}
function artLine(points: SvgPoints, stroke: string, width = 1): string {
  return `<polyline points="${points.map(p => p.join(',')).join(' ')}" fill="none" stroke="${stroke}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round"/>`;
}
function artEllipse(x: number, y: number, rx: number, ry: number, fill: string, stroke = 'none'): string {
  return `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}" stroke="${stroke}" stroke-width="1.2"/>`;
}
function artStone(x: number, base: number, w: number, h: number, blue = false): string {
  const top = base - h, left = x - w / 2, right = x + w / 2;
  let out = artPoly([[left,base-3],[left+3,top],[right-3,top],[right,base-3],[x,base+5]], blue ? '#a8b2b3' : '#b5b69b', '#556951');
  out += artPoly([[x+2,top],[right-3,top],[right,base-3],[x+2,base+4]],blue ? '#798b98' : '#80957e','none');
  for(let i=1;i<h/12;i++) { const y=base-i*12; out += artLine([[left+2,y-4],[x,y+1],[right-2,y-4]],blue ? '#788a91' : '#849774'); out += artLine([[x-w*(i%2?.24:.08),y-3],[x-w*(i%2?.24:.08),y-14]],blue ? '#829197' : '#94a180'); }
  return out + artEllipse(x,top,w/2-2,Math.min(9,w/5),blue?'#c7ccc3':'#cccaac','#5c7257');
}
function artSlit(x: number, y: number, blue = false): string {
  return `<rect x="${x-3.5}" y="${y}" width="7" height="15" rx="3" fill="${blue?'#355266':'#3c5947'}" stroke="#c5c7ac"/>`+artLine([[x,y+3],[x,y+11]],blue?'#a9ddd8':'#b7be87');
}
function artCrenels(x: number, y: number, w: number, blue = false): string {
  let out=artEllipse(x,y,w/2+3,8,blue?'#b5c0c5':'#c4c8a9','#566e52');
  const count=Math.max(3,Math.round(w/13));
  for(let i=0;i<count;i++) { const xx=x-w/2+i*w/(count-1), yy=y+(1-Math.abs((xx-x)/(w/2)))*6; out+=artPoly([[xx-4.5,yy+1],[xx-4.5,yy-10],[xx+4.5,yy-11],[xx+5,yy+1]],blue?'#b9c1cb':'#c3c6a5','#5c7254',1); }
  return out;
}
function artRoof(x: number, y: number, w: number, h: number, red = false, gold = false): string {
  const peak=x+(red?-7:0);
  return artPoly([[x-w/2,y],[peak,y-h],[x+w/2,y],[x+(red?5:0),y+9]],red?'#bd7858':'#617e4d',red?'#76523d':'#355638')+
    artPoly([[peak,y-h],[x+w/2,y],[x+(red?5:0),y+9]],red?'#884d3c':'#3f6442','none')+
    artPoly([[peak,y-h+2],[x-w/2+5,y-1],[x+(red?1:-2),y+4]],red?'#d49368':'#89a064','none')+
    artLine([[x-w/2+1,y],[x+(red?5:0),y+7],[x+w/2-1,y]],gold?'#dbc17d':red?'#e4bb80':'#a9b77d',2);
}
function artDeck(x: number, y: number, w: number): string {
  return artPoly([[x-w/2,y-3],[x,y-13],[x+w/2,y-3],[x+w/2,y+8],[x,y+17],[x-w/2,y+8]],'#b59660','#575939')+
    artPoly([[x,y-2],[x+w/2,y-3],[x+w/2,y+8],[x,y+17]],'#7d6944','none')+
    artLine([[x-w/2+2,y+6],[x,y+14],[x+w/2-2,y+6]],'#dbb878',1.5);
}
function artEagle(x: number, y: number, s: number): string {
  return artPoly([[x,y-s*.65],[x+s*.25,y-s*.3],[x+s,y-s*.8],[x+s*.73,y-s*.15],[x+s*.37,y],[x+s*.65,y+s*.3],[x+s*.2,y+s*.23],[x,y+s*.65],[x-s*.2,y+s*.23],[x-s*.65,y+s*.3],[x-s*.37,y],[x-s*.73,y-s*.15],[x-s,y-s*.8],[x-s*.25,y-s*.3]],'#e4cb84','#8e8054',.7);
}
function artShield(x: number, y: number, s: number): string {
  return artPoly([[x-s,y-s],[x+s,y-s],[x+s,y+s*.25],[x,y+s],[x-s,y+s*.25]],'#557b79','#e0c88d',1.2)+artLine([[x,y-s*.65],[x,y+s*.6]],'#ecdaa6',1.4)+artLine([[x-s*.7,y-s*.15],[x+s*.7,y-s*.15]],'#ecdaa6',1.4);
}
function artBanner(x: number, y: number, h: number, red = false, eagle = false): string {
  return artLine([[x,y+h+3],[x,y-3]],'#736644',2)+artPoly([[x+1,y],[x+18,y+3],[x+17,y+h-5],[x+9,y+h+1],[x+1,y+h-3]],red?'#b3654e':'#597b4d','#546144',1)+
    (eagle?artEagle(x+9,y+15,5):artShield(x+9,y+15,4));
}
function artArcher(x: number, y: number, elite = false): string {
  return `<g transform="translate(${x} ${y})">`+artPoly([[-5,-14],[5,-14],[7,-2],[-7,-2]],elite?'#88977a':'#738b58','#455f3e',1)+artEllipse(0,-18,5.5,6,'#dec194','#526040')+
    artPoly([[-6,-20],[0,-28],[7,-20]],elite?'#b7bd94':'#5a7e4c','#425e3c',1)+artLine([[3,-18],[5,-18]],'#485437',1)+artLine([[3,-13],[13,-11]],'#cbb381',2.5)+
    '<path d="M14-21Q29-11 14-1" fill="none" stroke="#d7bf83" stroke-width="2"/><path d="m14-21-5 10 5 10M6-11h21" fill="none" stroke="#dedcb0" stroke-width=".9"/>'+artPoly([[29,-11],[24,-14],[24,-8]],'#dfe8c7','none')+'</g>';
}
function artCrystal(x: number, y: number, s: number): string {
  return artEllipse(x,y,s*1.5,s*1.1,'#93d2db44')+artPoly([[x,y-s],[x+s*.65,y],[x,y+s],[x-s*.65,y]],'#a4e0e0','#5a7e98')+
    artPoly([[x,y-s],[x+s*.65,y],[x,y+s]],'#939fdc','none')+artPoly([[x,y-s],[x-s*.65,y],[x-s*.2,y+s*.2]],'#dcf7e9','none')+artLine([[x,y-s+2],[x,y+s-2]],'#ddf8f2',1.2);
}
function artDoor(x: number, y: number, w: number, h: number, gate = false): string {
  let out=`<path d="M${x-w/2} ${y}V${y-h+w/2}Q${x} ${y-h-w/2} ${x+w/2} ${y-h+w/2}V${y}Z" fill="#3a5345" stroke="#cebf97" stroke-width="1.6"/>`;
  if(gate) for(let i=-1;i<=1;i++) out+=artLine([[x+i*w/4,y-1],[x+i*w/4,y-h+4]],'#b4ad87',1.4);
  return out;
}
function arrowArt(level: number): string {
  if(level===1) return artPoly([[-18,-5],[-17,-43],[-10,-44],[-10,-2]],'#ab8d58')+artPoly([[13,-4],[12,-44],[18,-43],[20,-5]],'#826c43')+artLine([[-15,-7],[16,-34]],'#c8a66b',4)+artLine([[-16,-34],[16,-7]],'#8e754b',4)+artDeck(0,-45,53)+artArcher(-1,-48)+artRoof(0,-78,57,19);
  if(level===2) {
    let art=artStone(0,-3,48,30)+artSlit(-6,-27)+artPoly([[-21,-29],[-22,-72],[18,-76],[23,-30],[0,-23]],'#ac8c57')+artPoly([[1,-75],[18,-76],[23,-30],[1,-24]],'#826a42','none');
    for(let y=-34;y>-72;y-=8) art+=artLine([[-20,y],[20,y-3]],'#786844');
    return art+artDeck(0,-38,66)+artDeck(0,-73,63)+artArcher(-4,-69)+artRoof(0,-98,73,20,false,true)+artBanner(25,-67,35)+artLine([[-25,-20],[-30,-39]],'#7e6a43',3)+artLine([[23,-20],[29,-39]],'#7e6a43',3);
  }
  return artStone(0,-4,58,70)+artSlit(-12,-42)+artSlit(12,-47)+artDoor(-5,-6,13,25)+artStone(-31,-3,17,25)+artStone(31,-3,17,25)+artDeck(-24,-66,44)+artDeck(24,-66,44)+artArcher(-25,-68,true)+artArcher(23,-68,true)+artStone(0,-74,31,23)+artCrenels(0,-98,35)+artRoof(0,-107,45,16,false,true)+artPoly([[-10,-78],[0,-83],[10,-78],[8,-64],[0,-58],[-8,-64]],'#486e4c','#c4af74')+artEagle(0,-70,7)+artBanner(-29,-43,28,false,true);
}
function mageArt(level: number): string {
  if(level===1) return artStone(0,-5,39,43,true)+artSlit(-2,-31,true)+artCrenels(0,-49,39,true)+artPoly([[-22,-52],[-21,-65],[-15,-65],[-14,-53]],'#8e96b1','#5d7088')+artPoly([[14,-52],[15,-65],[21,-65],[22,-53]],'#8e96b1','#5d7088')+artCrystal(0,-74,17);
  if(level===2) {
    let art=artStone(0,-4,48,66,true)+artSlit(-6,-41,true)+artEllipse(0,-55,27,8,'#8c9ab4','#596f83')+artCrenels(0,-72,49,true);
    for(const x of [-24,24]) art+=artStone(x,-65,14,28,true)+artPoly([[x-8,-93],[x,-109],[x+8,-93],[x,-87]],'#8e86bb','#586b85')+artPoly([[x-8,-93],[x,-109],[x,-87]],'#bdb7db','none');
    return art+artCrystal(-12,-90,16)+artCrystal(12,-90,16)+artLine([[-19,-11],[-19,-56]],'#c4b9e8',1.6)+artLine([[19,-11],[19,-56]],'#c4b9e8',1.6)+artLine([[6,-23],[10,-28],[7,-32],[11,-36]],'#c4e9e0',1.5);
  }
  let art=artStone(0,-4,52,71,true);
  for(const x of [-30,30]) art+=artStone(x,-4,22,67,true)+artSlit(x,-36,true)+artCrenels(x,-72,23,true)+artPoly([[x-13,-80],[x,-111],[x+13,-80],[x,-73]],'#7a82b1','#506783')+artPoly([[x-13,-80],[x,-111],[x,-73]],'#aaaad1','none');
  art+=artStone(0,-73,26,30,true)+artCrenels(0,-103,29,true)+artPoly([[-8,-111],[0,-127],[8,-111],[0,-106]],'#95b5d1','#506d8d')+artDoor(0,-10,24,44)+artEllipse(0,-76,36,11,'none','#b4ddeb')+artCrystal(0,-87,22);
  for(let i=0;i<6;i++) { const a=i*Math.PI/3; const x=Math.cos(a)*37,y=-86+Math.sin(a)*11; art+=artLine([[x-2,y-4],[x+2,y-1],[x-2,y+2],[x+2,y+4]],'#c0eee1',1.5); }
  return art+artLine([[0,-38],[0,-26],[-4,-32],[0,-36],[4,-32]],'#caefde',1.7);
}
function barracksArt(level: number): string {
  if(level===1) return artPoly([[-26,-7],[-26,-43],[4,-50],[26,-39],[26,-7],[3,3]],'#d1c199','#665f42')+artPoly([[3,-49],[26,-39],[26,-7],[3,3]],'#aa9a74','none')+artLine([[-25,-39],[-25,-5]],'#826d48',3)+artLine([[3,-39],[3,-5]],'#826d48',3)+artLine([[-24,-34],[2,-10]],'#998555',2.5)+artLine([[-24,-10],[2,-39]],'#998555',2.5)+artDoor(-8,0,13,24)+artShield(16,-22,5)+artRoof(0,-46,66,26,true)+artPoly([[16,-58],[15,-79],[23,-80],[25,-54]],'#b4b598','#657252')+artBanner(-13,-90,17,true);
  if(level===2) {
    let art=artPoly([[-31,-17],[-31,-61],[3,-71],[33,-58],[33,-17],[3,-7]],'#bdbea0','#5d7056')+artPoly([[3,-71],[33,-58],[33,-17],[3,-7]],'#84987f','none');
    for(let y=-24;y>-61;y-=12) art+=artLine([[-29,y],[2,y+6],[31,y-3]],'#869a7b');
    art+=artSlit(-18,-52)+artSlit(17,-53)+artRoof(0,-64,78,25,true)+artPoly([[-13,-58],[-13,-77],[-3,-87],[10,-77],[10,-58]],'#c2c6a7','#637559')+artRoof(-2,-78,29,12,true)+artShield(-2,-65,7)+artPoly([[-37,-4],[-37,-22],[-22,-24],[-17,-20],[17,-19],[23,-25],[38,-22],[38,-3],[0,10]],'#b1bc99','#5a7054')+artDoor(0,8,21,27,true);
    for(const x of [-32,-23,23,32]) art+=`<rect x="${x-3}" y="-30" width="7" height="12" rx="1" fill="#c6c7a4" stroke="#6a7e5c"/>`;
    return art+artBanner(16,-110,35,true)+artShield(-24,-15,5)+artShield(26,-14,5);
  }
  let art=artPoly([[-33,-5],[-32,-69],[30,-69],[35,-5],[0,10]],'#b2bf9e','#566e53')+artPoly([[1,-69],[30,-69],[35,-5],[1,10]],'#819981','none');
  for(const x of [-30,30]) art+=artStone(x,-2,26,84)+artSlit(x,-41)+artSlit(x,-65)+artCrenels(x,-87,28)+artRoof(x,-98,34,17,true);
  art+=artPoly([[-27,-77],[26,-77],[26,-65],[0,-58],[-27,-65]],'#c7ceae','#5b7558');
  for(let i=-2;i<=2;i++) art+=`<rect x="${i*10-3.5}" y="-86" width="7" height="13" rx="1" fill="#cbd0ad" stroke="#647d5b"/>`;
  return art+artPoly([[-16,-4],[-16,-37],[0,-52],[17,-36],[18,3],[0,10]],'#c8cbaa','#647c5d')+artDoor(0,8,23,43,true)+artShield(0,-47,8)+artShield(-23,-16,6)+artShield(23,-16,6)+artBanner(5,-130,42,true)+artBanner(-39,-71,29,true);
}
/** Selection preview mirrors the silhouette and architecture of the world tower. */
export function towerArt(kind: string, level = 1): string {
  const tier=Math.max(1,Math.min(3,Math.floor(level)));
  const footprint=(kind==='mage'?[25,34,43]:kind==='barracks'?[31,40,46]:[26,34,41])[tier-1];
  const common=artEllipse(6,8,footprint+3,11,'#2d432e22')+artEllipse(0,0,footprint,10,'#b0b594','#6d805e')+artEllipse(0,-4,footprint-2,9,'#c7c4a2','#8d9977');
  const art=kind==='cannon'?cannonArt(tier):kind==='mage'?mageArt(tier):kind==='barracks'?barracksArt(tier):arrowArt(tier);
  return `<svg class="tower-art" data-level="${tier}" viewBox="0 0 120 140" aria-hidden="true"><g transform="translate(60 125) scale(.86)" stroke-linejoin="round" stroke-linecap="round">${common}${art}</g></svg>`;
}
function cannonArt(level: number): string {
  const base = level === 3 ? artStone(0,0,68,38) + artCrenels(0,-42,72) : artDeck(0,-6,level===2?69:58);
  let art=base;
  const y=level===3?-60:level===2?-38:-28;
  for(const x of [-23,23]) art+=artEllipse(x,y+12,12,13,'#5c5546','#303e36')+artEllipse(x,y+12,6,7,'#b89762','#e1c88e');
  art+=artPoly([[-22,y+3],[6,y-11],[34,y-34],[41,y-22],[16,y+6],[-13,y+17]],'#586762','#2e3e35',2);
  art+=artPoly([[-22,y+3],[6,y-11],[34,y-34],[37,y-29],[5,y-5],[-17,y+8]],'#9caba0','none');
  art+=artEllipse(37,y-28,8,10,'#b9a170','#35473d')+artEllipse(37,y-28,4,6,'#1c2d27');
  for(const x of [-8,8,22]) art+=artLine([[x,y+3-x*.6],[x+7,y+10-x*.6]],'#d2b87b',3);
  if(level>1) art+=artPoly([[-31,y+20],[-29,y-7],[-18,y-15],[-8,y-6],[-8,y+17]],'#9b7750','#4e513a')+artShield(-20,y+3,7);
  if(level===3) art+=artBanner(-29,-114,39,true)+artPoly([[-5,-92],[3,-102],[11,-92],[3,-83]],'#edb253','#76512e');
  return art;
}
export function heroArt(): string {
  return `<svg class="hero-art" viewBox="0 0 100 112" aria-hidden="true"><defs>
    <linearGradient id="hero-bg" x2=".8" y2="1"><stop stop-color="#7faaa0"/><stop offset="1" stop-color="#263f3c"/></linearGradient>
    <linearGradient id="hero-steel" x2="1" y2="1"><stop stop-color="#e1eee3"/><stop offset=".5" stop-color="#9eafa5"/><stop offset="1" stop-color="#50786e"/></linearGradient>
    <linearGradient id="hero-skin" x2="1" y2=".3"><stop stop-color="#f0d2ae"/><stop offset="1" stop-color="#c3967d"/></linearGradient></defs>
    <path d="M0 0h100v112H0Z" fill="url(#hero-bg)"/><circle cx="50" cy="38" r="32" fill="none" stroke="#bdd8b9" stroke-opacity=".3"/>
    <path d="m10 111 10-38 18-9h25l18 10 12 37Z" fill="#1e5049"/><path d="m20 76-5 31 17-8 4-36Zm48-12 19 16 9 31-25-8Z" fill="#416f5e" stroke="#719477"/>
    <path d="M32 33Q29 12 48 10q24-2 24 28l-4 26-12 10-20-8Z" fill="#ac864e" stroke="#826843"/>
    <path d="M36 30q5-11 17-9l14 12-4 20-12 14-13-10-4-15Z" fill="url(#hero-skin)"/>
    <path d="M31 38q-1-23 17-27 19-3 23 21L58 24l-8-8-5 13-13 11Z" fill="#c9a663"/>
    <path d="M35 26q10-14 20-11m-8 7-7 12m14-18 10 12" stroke="#e7cf91" stroke-width="1.4" fill="none"/>
    <path d="m35 37 9-3m10 1 8 3" stroke="#4b5142" stroke-width="1.7"/><path d="m37 42 7 0m10 0 7 0" stroke="#34483c" stroke-width="1.5"/>
    <circle cx="41" cy="42" r="1.5" fill="#496d5b"/><circle cx="57" cy="42" r="1.5" fill="#496d5b"/><path d="m49 42-2 9 5 1m-8 7 7 1 5-2" fill="none" stroke="#a17663" stroke-width="1"/>
    <path d="m36 36-8-3 5 12m31-9 8-3-5 12" fill="#d4ae90" stroke="#926e5a"/><path d="m36 29 13-3 15 3" fill="none" stroke="#d1c590" stroke-width="2"/><path d="m46 26 4-6 4 6-4 4Z" fill="#c0e5cc" stroke="#718d73"/>
    <path d="M65 43q9 11 4 22l-4 8 6 8-7 8 6 10-5 8" fill="none" stroke="#ac864e" stroke-width="8"/><path d="m65 63 4 4-4 6 6 8-7 8 6 10-5 8" fill="none" stroke="#e7cf91" stroke-width="2"/>
    <path d="m37 61 13 9 13-9 5 28-18 18-22-17Z" fill="url(#hero-steel)" stroke="#476c5f" stroke-width="1.5"/><path d="m40 65 10 13 10-13-4 24-6 9-6-9Z" fill="#315e51"/>
    <path d="m23 69 13-7 8 10-5 9-18 3Zm47-7 12 8 0 14-17-4-6-8Z" fill="url(#hero-steel)" stroke="#476c5f" stroke-width="1.5"/>
    <path d="m25 72 10-6 5 5m27-5 11 6m-46 9 5 15m28-15-5 15" fill="none" stroke="#d4d3a5" stroke-width="1.3"/>
    <path d="m50 83-7 4 7 9 7-9Z" fill="#b6c399" stroke="#52765a"/><path d="M50 83v13m-4-7 4 3 4-3" stroke="#52765a" fill="none"/>
    <path d="m25 99 25 5 23-5-1 7-22 5-26-5Z" fill="#665b42"/><rect x="46" y="102" width="8" height="7" rx="1" fill="#d7c58c" stroke="#8e7e52"/>
    <path d="M80 99 81 46l9-23-2 29-5 48Z" fill="url(#hero-steel)" stroke="#d9e5ca" stroke-width="1.2"/><path d="m83 52 5-20" stroke="#eff5d6"/><path d="M74 94q8 4 17-1" fill="none" stroke="#d5c384" stroke-width="3"/>
  </svg>`;
}
