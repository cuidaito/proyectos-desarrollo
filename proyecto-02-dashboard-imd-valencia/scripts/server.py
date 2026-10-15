"""API mínima sobre la base SQLite: histórico agregado y descarga de la base."""
import json
import os
import sqlite3
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

DB = Path(os.environ.get("DATA_DIR") or Path(__file__).resolve().parent.parent / "data") / "trafico.db"
PORT = int(os.environ.get("API_PORT", "8000"))
HOST = os.environ.get("API_HOST", "127.0.0.1")


def bucket_minutes(days):
    return 0 if days <= 1 else 15 if days <= 7 else 60


def history(days, tramo, ids):
    if not DB.exists():
        return []
    con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=30)
    try:
        since = f"datetime('now', '-{days} days')"
        b = bucket_minutes(days)
        if b:
            t = f"strftime('%Y-%m-%dT%H:', t) || printf('%02d', (CAST(strftime('%M', t) AS INTEGER) / {b}) * {b}) || ':00Z'" if b < 60 else "strftime('%Y-%m-%dT%H:00:00Z', t)"
        else:
            t = "t"
        where, params = f"t >= strftime('%Y-%m-%dT%H:%M:%SZ', {since})", []
        if tramo != "all":
            where += " AND idtramo = ?"
            params.append(tramo)
        elif ids:
            where += f" AND idtramo IN ({','.join('?' * len(ids))})"
            params += ids
        rows = con.execute(
            f"SELECT {t} AS b, CAST(ROUND(AVG(imv)) AS INTEGER) FROM lecturas WHERE {where} GROUP BY b ORDER BY b",
            params,
        ).fetchall()
        return [{"t": r[0], "y": r[1]} for r in rows]
    finally:
        con.close()


class Handler(BaseHTTPRequestHandler):
    def send_json(self, obj, status=200):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        url = urlparse(self.path)
        if url.path == "/api/health":
            return self.send_json({"ok": True, "db": DB.exists()})
        if url.path == "/api/history":
            q = parse_qs(url.query)
            days = max(1, min(int(q.get("days", ["7"])[0]), 365))
            return self.send_json(history(days, q.get("tramo", ["all"])[0], []))
        if url.path == "/api/trafico.db" and DB.exists():
            return self.send_db()
        self.send_json({"error": "not found"}, 404)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if urlparse(self.path).path != "/api/history":
            return self.send_json({"error": "not found"}, 404)
        try:
            req = json.loads(self.rfile.read(int(self.headers.get("Content-Length", 0))) or b"{}")
            days = max(1, min(int(req.get("days", 7)), 365))
            ids = [str(i) for i in req.get("ids", [])][:2000]
            return self.send_json(history(days, str(req.get("tramo", "all")), ids))
        except Exception as e:
            return self.send_json({"error": str(e)}, 400)

    def send_db(self):
        # Copia consistente aunque el colector esté escribiendo.
        with tempfile.NamedTemporaryFile(suffix=".db") as tmp:
            src = sqlite3.connect(f"file:{DB}?mode=ro", uri=True, timeout=30)
            dst = sqlite3.connect(tmp.name)
            src.backup(dst)
            src.close()
            dst.close()
            size = os.path.getsize(tmp.name)
            self.send_response(200)
            self.send_header("Content-Type", "application/octet-stream")
            self.send_header("Content-Disposition", 'attachment; filename="trafico.db"')
            self.send_header("Content-Length", str(size))
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            with open(tmp.name, "rb") as f:
                while chunk := f.read(65536):
                    self.wfile.write(chunk)

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
