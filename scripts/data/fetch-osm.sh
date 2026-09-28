#!/usr/bin/env bash
# Scarica gli estratti OpenStreetMap (Geofabrik) e ritaglia l'area buffer con osmium.
# Requisiti: curl, osmium-tool (brew install osmium-tool / apt install osmium-tool), python3.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p data/raw/osm
cd data/raw/osm
echo "→ download estratti Geofabrik (CH + IT nord-ovest, ~1.1 GB)"
curl -L -z switzerland-latest.osm.pbf -o switzerland-latest.osm.pbf https://download.geofabrik.de/europe/switzerland-latest.osm.pbf
curl -L -z italy-nord-ovest-latest.osm.pbf -o italy-nord-ovest-latest.osm.pbf https://download.geofabrik.de/europe/italy/nord-ovest-latest.osm.pbf
B=$(python3 -c "import json;b=json.load(open('../../geo/perimeter.json'))['buffer'];print(f\"{b['west']},{b['south']},{b['east']},{b['north']}\")")
echo "→ ritaglio area buffer $B"
osmium extract -b "$B" --strategy=smart -S types=multipolygon,boundary -O -o ch-buffer.osm.pbf switzerland-latest.osm.pbf
osmium extract -b "$B" --strategy=smart -S types=multipolygon,boundary -O -o it-buffer.osm.pbf italy-nord-ovest-latest.osm.pbf
osmium merge -O -o lugano-area.osm.pbf ch-buffer.osm.pbf it-buffer.osm.pbf
cat > export-config.json <<'JSON'
{ "attributes": { "type": true, "id": true, "way_nodes": true }, "linear_tags": true, "area_tags": true,
  "exclude_tags": ["source", "source:*", "created_by", "note", "note:*", "fixme", "FIXME", "check_date:*", "survey:date", "import", "not:*"], "include_tags": [] }
JSON
osmium export -c export-config.json -f geojsonseq -O -o lugano-area.geojsonseq lugano-area.osm.pbf
osmium fileinfo -e lugano-area.osm.pbf | grep -E "Number of (nodes|ways|relations)"
echo "✓ OSM pronto: data/raw/osm/lugano-area.geojsonseq"
