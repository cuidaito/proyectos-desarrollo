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
HISTORY = DATA / "history"


def fetch():
    for attempt in range(3):
        try:
            with urllib.request.urlopen(URL, timeout=60) as r:
                return json.load(r)
        except Exception as e:
            print("intento", attempt + 1, "falló:", e, file=sys.stderr)
            time.sleep(5)
    sys.exit("No se pudo descargar la capa de tráfico")


def write(path, obj):
    path.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def save_sqlite(tramos, snapshot):
    con = sqlite3.connect(DATA / "trafico.db")
    with con:
        con.execute("CREATE TABLE IF NOT EXISTS tramos (idtramo TEXT PRIMARY KEY, nombre TEXT)")
        con.execute(
            "CREATE TABLE IF NOT EXISTS lecturas (t TEXT, idtramo TEXT, imv INTEGER, estado INTEGER,"
            " PRIMARY KEY (t, idtramo))"
        )
        con.executemany(
            "INSERT OR REPLACE INTO tramos VALUES (?, ?)", [(k, v["n"]) for k, v in tramos.items()]
        )
        con.executemany(
            "INSERT OR IGNORE INTO lecturas VALUES (?, ?, ?, ?)",
            [(snapshot["t"], k, v[0], v[1]) for k, v in snapshot["v"].items()],
        )
    con.close()


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
        tramos[tid] = {"n": p.get("des_tramo") or tid, "g": coords}
        imv = p.get("imv")
        if imv and imv.isdigit():
            estado = int(p["estado"]) if (p.get("estado") or "").isdigit() and int(p["estado"]) <= 3 else 9
            values[tid] = [int(imv), estado]

    now = datetime.now(timezone.utc).replace(microsecond=0)
    snapshot = {"t": now.isoformat().replace("+00:00", "Z"), "v": values}

    HISTORY.mkdir(parents=True, exist_ok=True)
    write(DATA / "tramos.json", tramos)
    write(DATA / "latest.json", snapshot)

    day_file = HISTORY / f"{now:%Y-%m-%d}.json"
    day = json.loads(day_file.read_text(encoding="utf-8")) if day_file.exists() else []
    day.append(snapshot)
    write(day_file, day)

    save_sqlite(tramos, snapshot)

    days = sorted(p.stem for p in HISTORY.glob("*.json"))
    write(DATA / "index.json", days)
    print(f"{snapshot['t']}: {len(values)} lecturas de {len(tramos)} tramos")


if __name__ == "__main__":
    main()
