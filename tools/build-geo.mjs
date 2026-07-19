// Compacta NE 110m a world.geo.json: {polys:{ISO:[anillo plano,...]}, dots:{ISO:[lon,lat]}}
// - solo países del juego, solo anillos exteriores, coords a 2 decimales
// - países que cruzan el antimeridiano: lons negativas +360 (RU, FJ...)
// - microestados sin polígono en 110m: punto (centroide aproximado)
import { readFileSync, writeFileSync } from "node:fs";

const GAME_ISOS = "ES FR PT AD IT DE GB IE BE NL LU CH AT DK NO SE FI IS PL CZ SK HU SI HR BA RS ME MK AL GR BG RO MD UA BY LT LV EE RU MT CY MC SM LI VA CA US MX GT BZ HN SV NI CR PA CU JM HT DO BS TT BB DM GD LC VC KN AG CO VE GY SR EC PE BR BO PY CL AR UY TR GE AM AZ KZ UZ TM KG TJ AF PK IN NP BT BD LK MV CN MN KP KR JP TW MM TH LA KH VN MY SG ID BN PH TL IR IQ SY LB IL JO SA YE OM AE QA BH KW MA DZ TN LY EG SD SS ET ER DJ SO KE UG RW BI TZ MZ MW ZM ZW BW NA ZA LS SZ MG KM MU SC AO CD CG GA GQ CM CF TD NE NG BJ TG GH CI LR SL GN GW SN GM MR ML BF CV ST AU NZ PG FJ SB VU WS TO TV KI NR MH FM PW".split(" ");

// centroides aproximados para los que no tienen polígono en 110m
const DOTS = {
  AD:[1.52,42.51], MC:[7.42,43.73], SM:[12.45,43.94], VA:[12.45,41.9], LI:[9.55,47.15],
  MT:[14.4,35.9], SG:[103.82,1.35], BH:[50.55,26.03], MV:[73.5,4.2], KM:[43.3,-11.7],
  SC:[55.45,-4.62], ST:[6.6,0.25], CV:[-23.6,15.1], MU:[57.55,-20.3],
  BB:[-59.55,13.1], LC:[-60.97,13.9], VC:[-61.2,13.25], GD:[-61.68,12.1],
  DM:[-61.35,15.42], AG:[-61.8,17.07], KN:[-62.75,17.3],
  PW:[134.55,7.5], FM:[158.2,6.9], MH:[171.2,7.1], NR:[166.93,-0.52],
  TV:[179.2,-8.5], KI:[173.0,1.42], TO:[-175.2,-21.15], WS:[-172.1,-13.75],
};

const ne = JSON.parse(readFileSync("/tmp/ne110.json", "utf8"));
const polys = {};

const ringArea = r => { let a=0; for(let i=0;i<r.length;i++){const[x1,y1]=r[i],[x2,y2]=r[(i+1)%r.length];a+=x1*y2-x2*y1;} return Math.abs(a/2); };

for (const f of ne.features) {
  const p = f.properties;
  let iso = p.ISO_A2_EH && p.ISO_A2_EH !== "-99" ? p.ISO_A2_EH : p.ISO_A2;
  if (!GAME_ISOS.includes(iso)) continue;
  const geoms = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  let rings = geoms.map(g => g[0]); // solo anillo exterior
  rings.sort((a,b) => ringArea(b) - ringArea(a));
  rings = rings.slice(0, 15); // Canadá/Indonesia: nos quedamos con las 15 islas mayores
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

// puntos también desplazados al espacio 150..210 si caen cerca del antimeridiano oeste
const dots = {};
for (const [iso, [lon, lat]] of Object.entries(DOTS)) {
  if (polys[iso]) continue;
  dots[iso] = [lon < -150 ? Math.round((lon+360)*100)/100 : lon, lat];
}

const missing = GAME_ISOS.filter(i => !polys[i] && !dots[i]);
if (missing.length) { console.error("SIN GEOMETRÍA NI PUNTO:", missing.join(" ")); process.exit(1); }

const out = { polys, dots };
writeFileSync("world.geo.json", JSON.stringify(out));
console.log("polígonos:", Object.keys(polys).length, "· puntos:", Object.keys(dots).length,
  "· tamaño:", Math.round(JSON.stringify(out).length/1024) + " KB");
