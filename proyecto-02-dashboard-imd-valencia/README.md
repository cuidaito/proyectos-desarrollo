# Dashboard de tráfico en tiempo real - Valencia

Dashboard estático con la **intensidad de tráfico en tiempo real** (veh/h) por tramo de calle de Valencia: KPIs, gráficos (Chart.js), mapa (Leaflet), tabla, filtros, tema oscuro y exportación a CSV.

## Datos

Datos **reales** del Ayuntamiento de Valencia, capa [Intensidad tráfico tramos](https://opendata.vlci.valencia.es/dataset/intensitat-transit-trams-intensidad-trafico-tramos), consultada desde el navegador y refrescada cada 60 s.

Limitaciones: es una lectura instantánea (sin histórico ni desglose por tipo de vehículo) y algunos tramos no tienen lectura (se muestran como «sin datos»).

## Uso local

Abre `index.html` en el navegador (sin build).

## Archivos

- `index.html`: estructura
- `styles.css`: estilos
- `config.js`: API, colores y mapa
- `script.js`: carga de datos, filtros y visualizaciones
