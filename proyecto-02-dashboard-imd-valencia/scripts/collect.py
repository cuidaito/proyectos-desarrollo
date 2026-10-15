"""Captura la intensidad de tráfico por tramo de Valencia y la añade al histórico."""
import json
import os
import sqlite3
import sys
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

URL = (
    "https://geoportal.valencia.es/server/rest/services/OPENDATA/Trafico/MapServer/188/query"
    "?where=1%3D1&outFields=idtramo,des_tramo,estado,imv&outSR=4326&resultRecordCount=2000&f=geojson"
)
DATA = Path(os.environ.get("DATA_DIR") or Path(__file__).resolve().parent.parent / "data")


def fetch():
    for attempt in range(3):
        try:
            with urllib.request.urlopen(URL, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print("intento", attempt + 1, "falló:", e, file=sys.stderr)
            time.sleep(5)
    sys.exit("No se pudo descargar la capa de tráfico")


def centroid(coords):
    if not coords:
        return None, None
    mid = coords[len(coords) // 2]
    return round(mid[1], 6), round(mid[0], 6)


def init_db(con):
    con.execute(
        "CREATE TABLE IF NOT EXISTS tramos (idtramo TEXT PRIMARY KEY, nombre TEXT, lat REAL, lon REAL, geom TEXT)"
    )
    cols = {r[1] for r in con.execute("PRAGMA table_info(tramos)")}
    for col, typ in (("lat", "REAL"), ("lon", "REAL"), ("geom", "TEXT")):
        if col not in cols:
            con.execute(f"ALTER TABLE tramos ADD COLUMN {col} {typ}")
    con.execute(
        "CREATE TABLE IF NOT EXISTS lecturas (t TEXT, idtramo TEXT, imv INTEGER, estado INTEGER,"
        " PRIMARY KEY (t, idtramo))"
    )


def main():
    features = fetch().get("features", [])
    if len(features) < 100:
        sys.exit(f"Respuesta sospechosa: solo {len(features)} tramos")

    tramos, values = {}, {}
    for f in features:
        p = f["properties"]
        tid = p.get("idtramo")
        if not tid:
            continue
        geom = f.get("geometry")
        coords = (
            [[round(x, 5), round(y, 5)] for x, y in geom["coordinates"]]
            if geom and geom.get("type") == "LineString"
            else []
        )
        lat, lon = centroid(coords)
        tramos[tid] = (p.get("des_tramo") or tid, lat, lon, json.dumps(coords, separators=(",", ":")))
        imv = p.get("imv")
        if imv and imv.isdigit():
            estado = int(p["estado"]) if (p.get("estado") or "").isdigit() and int(p["estado"]) <= 3 else 9
            values[tid] = (int(imv), estado)

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")

    DATA.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(DATA / "trafico.db", timeout=30)
    with con:
        init_db(con)
        con.executemany(
            "INSERT OR REPLACE INTO tramos VALUES (?, ?, ?, ?, ?)", [(k, *v) for k, v in tramos.items()]
        )
        con.executemany(
            "INSERT OR IGNORE INTO lecturas VALUES (?, ?, ?, ?)", [(now, k, v[0], v[1]) for k, v in values.items()]
        )
    con.close()
    print(f"{now}: {len(values)} lecturas de {len(tramos)} tramos")


if __name__ == "__main__":
    main()
