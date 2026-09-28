/**
 * Formato serializzato dei grafi di percorrenza (pedonale, stradale per bus, ferroviario).
 * Coordinate in microgradi WGS84 (EPSG:4326 × 1e6), lunghezze e quote in decimetri.
 */
export interface SerializedGraph {
  kind: 'walk' | 'road' | 'rail';
  version: 1;
  builtAt: string;
  source: string;
  crs: 'EPSG:4326 microdegrees; lengths/elevations in decimetres';
  nodeLon: number[];
  nodeLat: number[];
  /** quota in decimetri (DEM Terrarium, stima) */
  nodeEle: number[];
  edgeA: number[];
  edgeB: number[];
  edgeLen: number[];
  /** dislivello positivo percorrendo A→B (dm) */
  edgeUp: number[];
  /** dislivello negativo percorrendo A→B (dm) */
  edgeDown: number[];
  edgeCls: number[];
  edgeFlags: number[];
  edgeSac: number[];
  edgeName: number[];
  /** 0 = doppio senso, 1 = solo A→B, 2 = solo B→A (grafo stradale) */
  edgeDir: number[];
  edgeWay: number[];
  edgeGeomOff: number[];
  geomLon: number[];
  geomLat: number[];
  classes: string[];
  names: string[];
}

export const EdgeFlag = {
  STEPS: 1,
  TRAIL: 2,
  UNPAVED: 4,
  LIT: 8,
  TUNNEL: 16,
  BRIDGE: 32,
  WHEELCHAIR_NO: 64,
  WHEELCHAIR_YES: 128,
  STROLLER_RAMP: 256,
  PATH: 512,
  PEDESTRIAN_SAFE: 1024,
  ROAD_NO_SIDEWALK_INFO: 2048,
  STEEP: 4096,
  ELEVATOR: 8192,
  FUNICULAR: 16384,
} as const;
