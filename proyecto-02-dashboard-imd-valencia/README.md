# Tráfico en tiempo real - Valencia

Dashboard estático con la **intensidad de tráfico** (veh/h) por tramo de calle de Valencia: datos en directo, **histórico propio**, mapa de tramos, selector de tramo, KPIs, gráficos (Chart.js), mapa (Leaflet), tema oscuro y exportación a CSV.

## Datos

- **En directo:** capa [Intensidad tráfico tramos](https://opendata.vlci.valencia.es/dataset/intensitat-transit-trams-intensidad-trafico-tramos) del Ayuntamiento de Valencia, consultada desde el navegador cada 60 s.
- **Histórico:** el workflow `.github/workflows/collect-traffic.yml` ejecuta `scripts/collect.py` cada 30 minutos y guarda una captura en `data/history/AAAA-MM-DD.json` (commit en `main`). El histórico empieza a acumularse desde la primera captura.
  - `data/tramos.json`: nombre y geometría de cada tramo
  - `data/latest.json`: última captura
  - `data/index.json`: días disponibles
  - Formato de captura: `{"t": fecha UTC, "v": {idtramo: [veh/h, estado]}}` (estado 0 fluido, 1 denso, 2 congestionado, 3 cortado, 9 desconocido)
- La cabecera muestra la hora de los datos en directo y de la última captura del histórico.

Limitaciones: son lecturas instantáneas (no un IMD diario ni desglose por tipo de vehículo) y algunos tramos no tienen lectura («sin datos»). GitHub Actions puede retrasar o saltarse alguna ejecución programada.

## Uso local

Sirve la carpeta con cualquier servidor estático (p. ej. `python3 -m http.server`); en `localhost` el histórico se lee de `data/`.

## Archivos

- `index.html`, `styles.css`, `config.js`, `script.js`: aplicación
- `scripts/collect.py`: captura de datos
- `data/`: histórico
