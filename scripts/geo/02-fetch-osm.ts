/**
 * Fase 1 — Import OSM dell'area buffer (perimetro + margine di routing).
 * Scarica i gruppi tematici necessari a cartografia, grafo pedonale, trasporti e POI.
 * I file grezzi (data/raw/osm/*.json) non sono versionati; lo sono i derivati.
 *
 * Uso: npx tsx scripts/geo/02-fetch-osm.ts [--refresh]
 */
import { readFileSync } from 'node:fs';
import { overpass, bboxString } from '../lib/overpass.ts';

const perimeter = JSON.parse(readFileSync('data/geo/perimeter.json', 'utf8'));
const B = bboxString(perimeter.buffer);
const refresh = process.argv.includes('--refresh');

const GROUPS: Record<string, string> = {
  highways: `[out:json][timeout:240][maxsize:1073741824];
way["highway"](${B});
out body geom;`,
  transport: `[out:json][timeout:240];
(
  way["railway"~"^(rail|funicular|light_rail|narrow_gauge|tram|subway|platform|disused)$"](${B});
  way["aerialway"](${B});
  way["route"="ferry"](${B});
  way["public_transport"="platform"](${B});
);
out body geom;
(
  relation["route"~"^(ferry|bus|funicular|train|trolleybus|light_rail)$"](${B});
);
out body geom;`,
  water: `[out:json][timeout:240];
(
  way["natural"="water"](${B});
  relation["natural"="water"](${B});
  way["waterway"](${B});
  way["water"](${B});
  relation["water"](${B});
  way["natural"="coastline"](${B});
);
out body geom;`,
  landcover: `[out:json][timeout:240];
(
  way["landuse"](${B});
  relation["landuse"](${B});
  way["natural"~"^(wood|scrub|grassland|heath|bare_rock|scree|cliff|beach|wetland|tree_row|shingle|sand)$"](${B});
  relation["natural"~"^(wood|scrub|grassland|heath|bare_rock|scree|wetland)$"](${B});
  way["leisure"~"^(park|garden|pitch|playground|golf_course|nature_reserve|sports_centre|stadium|swimming_pool|marina|beach_resort|swimming_area|common|track|dog_park)$"](${B});
  relation["leisure"~"^(park|garden|nature_reserve|golf_course|sports_centre)$"](${B});
  way["amenity"~"^(grave_yard|parking|school|university|hospital)$"](${B});
  way["man_made"~"^(pier|breakwater|groyne|bridge)$"](${B});
);
out body geom;`,
  buildings: `[out:json][timeout:300][maxsize:1073741824];
(
  way["building"](${B});
  relation["building"](${B});
  way["building:part"](${B});
);
out body geom;`,
  places: `[out:json][timeout:120];
(
  node["place"](${B});
  node["natural"~"^(peak|saddle|spring|cave_entrance|rock|tree)$"]["name"](${B});
  node["natural"="peak"](${B});
  node["tourism"="viewpoint"](${B});
);
out body;`,
  pois: `[out:json][timeout:240];
(
  nwr["amenity"~"^(restaurant|cafe|bar|pub|ice_cream|biergarten|fast_food|theatre|cinema|arts_centre|nightclub|marketplace|library|place_of_worship|toilets|drinking_water|ferry_terminal|fountain|community_centre|events_venue|music_venue|casino|bench|shelter|townhall|bus_station)$"](${B});
  nwr["tourism"](${B});
  nwr["historic"](${B});
  nwr["leisure"~"^(park|garden|playground|beach_resort|swimming_area|sports_centre|swimming_pool|marina|nature_reserve|picnic_site|bathing_place|miniature_golf|water_park|fitness_station|stadium)$"]["name"](${B});
  nwr["leisure"="playground"](${B});
  nwr["shop"~"^(bakery|confectionery|chocolate|ice_cream|wine|deli|books|gift|farm|pastry|cheese)$"](${B});
  nwr["public_transport"](${B});
  node["highway"="bus_stop"](${B});
  node["railway"~"^(station|halt|stop|tram_stop)$"](${B});
  nwr["aerialway"="station"](${B});
  node["entrance"](${B});
  nwr["man_made"~"^(tower|lighthouse)$"](${B});
);
out body center;`,
  admin: `[out:json][timeout:240];
(
  relation["boundary"="administrative"]["admin_level"~"^(8|9|10)$"](${B});
);
out body geom;`,
};

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  for (const [name, q] of Object.entries(GROUPS)) {
    if (only.length && !only.includes(name)) continue;
    console.log(`→ ${name}`);
    await overpass(name, q, { refresh });
    await new Promise((r) => setTimeout(r, 2000));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
