# Despliegue con Docker (dos contenedores)

- **`trafico-datos`**: captura el origen cada 3 min (`INTERVAL_SECONDS`), guarda en SQLite (`/data/trafico.db`) y ofrece una API. No hay que tocarlo al cambiar la web.
- **`trafico-web`**: nginx con el dashboard. Redirige `/api/` al contenedor de datos (`API_UPSTREAM`, por defecto `datos:8000`).

## Construir y exportar (desde esta carpeta)
```sh
docker build --platform linux/amd64 -f Dockerfile.datos -t trafico-datos:latest .
docker build --platform linux/amd64 -f Dockerfile.web -t trafico-web:latest .
docker save trafico-datos:latest -o trafico-datos.tar
docker save trafico-web:latest -o trafico-web.tar
```
Usa `linux/arm64` si el host es ARM.

## Instalar desde los `.tar`
```sh
docker load -i trafico-datos.tar && docker load -i trafico-web.tar
docker network create trafico
docker run -d --name datos --network trafico -v trafico-datos:/data -p 8000:8000 --restart unless-stopped trafico-datos:latest
docker run -d --name web --network trafico -p 8080:80 --restart unless-stopped trafico-web:latest
```
O con `docker-compose.yml` (usa las imágenes ya cargadas). Web en `http://HOST:8080/`.

Para actualizar la web: carga `trafico-web.tar`, borra y recrea solo `web`. `datos` sigue capturando.

Si `datos` y `web` no comparten una red de Docker definida por el usuario, pon en `web` la variable `API_UPSTREAM=IP:PUERTO` del contenedor de datos.

## API (puerto 8000, con CORS abierto para otros dashboards)
- `GET /api/health`
- `GET /api/history?days=7&tramo=all|ID`: puntos `{t, y}` (media de veh/h; sin agrupar hasta 1 día, 15 min hasta 7 días, 1 h más allá)
- `POST /api/history` con `{"days":7,"tramo":"all","ids":[...]}`
- `GET /api/trafico.db`: descarga una copia consistente de la base

## Base de datos
- `tramos(idtramo, nombre, lat, lon, geom)`: `lat`/`lon` es un punto central del tramo; `geom` es la línea en JSON `[[lon, lat], ...]`.
- `lecturas(t, idtramo, imv, estado)`: `t` en UTC ISO, `imv` en veh/h, `estado` 0 fluido, 1 denso, 2 congestionado, 3 cortado, 9 desconocido.

Para cruzar con siniestros: une cada siniestro con el tramo más cercano (`lat`/`lon`) y con la lectura más próxima en el tiempo (`t`).

Mientras `datos` está parado no se captura nada, y esas lecturas no se pueden recuperar.
