// Compacta NE 50m a world.geo.json: {polys:{ISO:[anillo plano,...]}, dots:{ISO:[lon,lat]}}
// - solo países del juego, solo anillos exteriores
// - simplificación Douglas-Peucker con tolerancia proporcional al tamaño del país
// - países que cruzan el antimeridiano: lons negativas +360 (RU, FJ, NZ...)
// - microestados sin polígono: punto (centroide aproximado)
import { readFileSync, writeFileSync } from "node:fs";

const GAME_ISOS = "ES FR PT AD IT DE GB IE BE NL LU CH AT DK NO SE FI IS PL CZ SK HU SI HR BA RS ME MK AL GR BG RO MD UA BY LT LV EE RU MT CY MC SM LI VA CA US MX GT BZ HN SV NI CR PA CU JM HT DO BS TT BB DM GD LC VC KN AG CO VE GY SR EC PE BR BO PY CL AR UY TR GE AM AZ KZ UZ TM KG TJ AF PK IN NP BT BD LK MV CN MN KP KR JP TW MM TH LA KH VN MY SG ID BN PH TL IR IQ SY LB IL JO SA YE OM AE QA BH KW MA DZ TN LY EG SD SS ET ER DJ SO KE UG RW BI TZ MZ MW ZM ZW BW NA ZA LS SZ MG KM MU SC AO CD CG GA GQ CM CF TD NE NG BJ TG GH CI LR SL GN GW SN GM MR ML BF CV ST AU NZ PG FJ SB VU WS TO TV KI NR MH FM PW".split(" ");

const DOTS = {
  AD:[1.52,42.51], MC:[7.42,43.73], SM:[12.45,43.94], VA:[12.45,41.9], LI:[9.55,47.15],
  MT:[14.4,35.9], SG:[103.82,1.35], BH:[50.55,26.03], MV:[73.5,4.2], KM:[43.3,-11.7],
  SC:[55.45,-4.62], ST:[6.6,0.25], CV:[-23.6,15.1], MU:[57.55,-20.3],
  BB:[-59.55,13.1], LC:[-60.97,13.9], VC:[-61.2,13.25], GD:[-61.68,12.1],
  DM:[-61.35,15.42], AG:[-61.8,17.07], KN:[-62.75,17.3],
  PW:[134.55,7.5], FM:[158.2,6.9], MH:[171.2,7.1], NR:[166.93,-0.52],
  TV:[179.2,-8.5], KI:[173.0,1.42], TO:[-175.2,-21.15], WS:[-172.1,-13.75],
};

const ringArea = r => { let a=0; for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1;} return Math.abs(a/2); };

/* Douglas-Peucker iterativo sobre anillo cerrado */
function simplify(ring, tol){
  if(ring.length < 8) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length-1] = 1;
  const stack = [[0, ring.length-1]];
  while(stack.length){
    const [a,b] = stack.pop();
    if(b-a < 2) continue;
    const [ax,ay]=ring[a], [bx,by]=ring[b];
    const dx=bx-ax, dy=by-ay, len2=dx*dx+dy*dy;
    let maxD=-1, maxI=-1;
    for(let i=a+1;i<b;i++){
      const [px,py]=ring[i];
      let d;
      if(len2===0) d=Math.hypot(px-ax,py-ay);
      else{
        const t=Math.max(0,Math.min(1,((px-ax)*dx+(py-ay)*dy)/len2));
        d=Math.hypot(px-(ax+t*dx), py-(ay+t*dy));
      }
      if(d>maxD){ maxD=d; maxI=i; }
    }
    if(maxD>tol){ keep[maxI]=1; stack.push([a,maxI],[maxI,b]); }
  }
  return ring.filter((_,i)=>keep[i]);
}

const ne = JSON.parse(readFileSync("/tmp/ne50.json", "utf8"));
const polys = {};

for (const f of ne.features) {
  const p = f.properties;
  let iso = p.ISO_A2_EH && p.ISO_A2_EH !== "-99" ? p.ISO_A2_EH : p.ISO_A2;
  if (!GAME_ISOS.includes(iso)) continue;
  const geoms = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let rings = geoms.map(g => g[0]);
  rings.sort((a,b) => ringArea(b) - ringArea(a));
  const mainArea = ringArea(rings[0]);
  // tolerancia según el tamaño del país: grandes más simplificados, pequeños casi intactos
  const diag = Math.sqrt(mainArea);
  const tol = Math.min(0.07, Math.max(0.004, diag/150));
  rings = rings
    .filter((r,i) => i===0 || ringArea(r) > Math.max(0.006, mainArea/2500))  // fuera motas
    .slice(0, 18)
    .map(r => simplify(r, tol))
    .filter(r => r.length >= 4);
  const flat = rings.map(r => {
    let lons = r.map(c => c[0]);
    const cross = Math.min(...lons) < -170 && Math.max(...lons) > 170;
    const out = [];
    for (const [lon, lat] of r) {
      const L = cross && lon < 0 ? lon + 360 : lon;
      out.push(Math.round(L*100)/100, Math.round(lat*100)/100);
    }
    return out;
  });
  polys[iso] = (polys[iso] || []).concat(flat);
}

const dots = {};
for (const [iso, [lon, lat]] of Object.entries(DOTS)) {
  if (polys[iso]) continue;
  dots[iso] = [lon < -150 ? Math.round((lon+360)*100)/100 : lon, lat];
}

const missing = GAME_ISOS.filter(i => !polys[i] && !dots[i]);
if (missing.length) { console.error("SIN GEOMETRÍA NI PUNTO:", missing.join(" ")); process.exit(1); }

const out = { polys, dots };
const pts = Object.values(polys).flat().reduce((a,r)=>a+r.length/2,0);
writeFileSync("world.geo.json", JSON.stringify(out));
console.log("polígonos:", Object.keys(polys).length, "· puntos:", Object.keys(dots).length,
  "· vértices:", Math.round(pts/1000)+"k",
  "· tamaño:", Math.round(JSON.stringify(out).length/1024) + " KB");
