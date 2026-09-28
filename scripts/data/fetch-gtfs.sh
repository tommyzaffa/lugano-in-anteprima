#!/usr/bin/env bash
# Scarica l'orario ufficiale svizzero (GTFS statico, opentransportdata.swiss) dell'anno orario corrente.
# Il link «permalink» punta sempre all'ultima versione pubblicata del dataset indicato.
set -euo pipefail
cd "$(dirname "$0")/../.."
mkdir -p data/raw/gtfs
DATASET="${GTFS_DATASET:-timetable-2026-gtfs2020}"
echo "→ download GTFS $DATASET (~300 MB)"
curl -fL -o data/raw/gtfs/gtfs_fp2026.zip "https://data.opentransportdata.swiss/en/dataset/${DATASET}/permalink"
ls -la data/raw/gtfs
