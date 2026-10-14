# Dashboard IMD València

Panel web estático para explorar el Índice Medio Diario (IMD) y el estado del tráfico en València. No requiere instalación de dependencias ni servidor de aplicación.

## Uso

Abre `index.html` desde un servidor HTTP local o publica esta carpeta como sitio estático. Por ejemplo, desde la raíz del repositorio:

```sh
python3 -m http.server 8000
```

Después visita `http://localhost:8000/proyecto-02-dashboard-imd-valencia/`.

## Funcionalidades

- Resumen de IMD promedio y máximo, ubicaciones y disponibilidad del feed.
- Tendencia histórica, comparación de calles, mapa Leaflet con marcadores y capas de densidad visual.
- Filtros por zona, búsqueda de calles y rango de fechas.
- Tabla exportable a CSV y JSON.
- Diseño adaptable, tema claro/oscuro y aviso de la procedencia de los datos.
- Consulta del conjunto municipal de estado del tráfico en tiempo real de Valencia Open Data.

## Fuentes y limitaciones

- `data/imd-demo.json` contiene únicamente cifras **sintéticas de demostración** para que los gráficos, el mapa y los filtros funcionen desde la primera carga. No son aforos medidos, datos oficiales, ni deben utilizarse para análisis o decisiones de movilidad.
- La composición por tipo de vehículo también es ficticia, solo ilustra la visualización y no procede de aforos municipales.
- `config.js` apunta al conjunto [Estado del tráfico en tiempo real](https://valencia.opendatasoft.com/explore/dataset/estat-transit-temps-real-estado-trafico-tiempo-real/) de Valencia Open Data. Este feed informa del estado del tráfico; no se asume que proporcione conteos vehiculares o IMD. Los registros se presentan separados y el IMD queda vacío si el campo no está disponible. La consulta directa desde el navegador puede fallar por disponibilidad del servicio o CORS.
- Los valores históricos oficiales de IMD y la distribución por tipos de vehículo no se han inventado ni se derivan de estados del tráfico. Para incorporarlos se necesita un dataset municipal con esos campos y su metodología. La capa de densidad del mapa visualiza las ubicaciones demostrativas, no un heatmap de aforos oficiales.
- Los mapas base dependen de CARTO/OpenStreetMap; los gráficos de Chart.js y el mapa de Leaflet se cargan desde CDN. Es necesaria conexión a Internet para estas bibliotecas, el mapa base y la API.

## Configuración

Edita `config.js` para cambiar la URL del API y el tiempo máximo de espera. Las plantillas de API se adaptan de forma tolerante a algunos nombres habituales, pero un cambio en el esquema del dataset puede requerir actualizar `normalizeLiveRecord` en `script.js`.
