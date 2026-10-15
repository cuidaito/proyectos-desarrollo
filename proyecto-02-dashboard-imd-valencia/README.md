# Tráfico en tiempo real - Valencia

Dashboard estático con la **intensidad de tráfico** (veh/h) por tramo de calle de Valencia: datos en directo, **histórico propio**, mapa de tramos, selector de tramo, KPIs, gráficos (Chart.js), mapa (Leaflet), tema oscuro y exportación a CSV.

## Datos

- **En directo:** capa [Intensidad tráfico tramos](https://opendata.vlci.valencia.es/dataset/intensitat-transit-trams-intensidad-trafico-tramos) del Ayuntamiento de Valencia, consultada desde el navegador cada 3 min (el origen se actualiza cada 3 min).
- **Histórico:** solo cuando la web corre en el contenedor Docker (ver `NAS.md`). `scripts/collect.py` consulta el origen cada 3 minutos y guarda las lecturas en SQLite (`trafico.db`); `scripts/server.py` sirve el histórico a la web y la descarga de la base. El workflow de GitHub `collect-traffic.yml` está desactivado.
  - Los archivos de `data/` del repositorio son el histórico antiguo (capturas cada 30 min hasta el 15/10/2026).
- La cabecera muestra la hora de los datos en directo y del último punto del histórico.

Limitaciones: son lecturas instantáneas (no un IMD diario ni desglose por tipo de vehículo) y algunos tramos no tienen lectura («sin datos»).

## Uso local

Sirve la carpeta con cualquier servidor estático (p. ej. `python3 -m http.server`); en `localhost` el histórico se lee de `data/`.

## Archivos

- `index.html`, `styles.css`, `config.js`, `script.js`: aplicación
- `scripts/collect.py`: captura de datos
- `data/`: histórico
