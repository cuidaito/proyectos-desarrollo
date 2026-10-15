# Dashboard en Docker (NAS QNAP u otro host)

Una sola imagen con nginx (web) y una captura cada 3 minutos (`INTERVAL_SECONDS`, el origen se actualiza cada 3 min) y una API mínima. Todo se guarda en SQLite (`trafico.db`) dentro del volumen.

Construir y exportar la imagen (desde esta carpeta; `linux/amd64` para la mayoría de QNAP, `linux/arm64` para modelos ARM):
```sh
docker build --platform linux/amd64 -t trafico-valencia:latest .
docker save trafico-valencia:latest -o trafico-valencia-amd64.tar
```
En el QNAP: *Container Station → Imágenes → Importar* el `.tar`. Después crea el contenedor con puerto `8080 → 80`, reinicio automático y un volumen de una carpeta del NAS montada en `/usr/share/nginx/html/data` (ahí queda el histórico). O con `docker-compose.yml` (*Aplicaciones → Crear*): usa la imagen ya importada (`trafico-valencia:latest`), sin construir nada en el NAS.

La web queda en `http://IP-DEL-NAS:8080/`. Con otra arquitectura, genera la imagen con la plataforma adecuada.

## Datos

`trafico.db` (SQLite) se descarga desde el botón **Base de datos** de la web o en `/api/trafico.db`.
- `tramos(idtramo, nombre, lat, lon, geom)`: `lat`/`lon` es un punto central del tramo; `geom` es la línea en JSON `[[lon, lat], ...]`.
- `lecturas(t, idtramo, imv, estado)`: `t` en UTC ISO, `imv` en veh/h, `estado` 0 fluido, 1 denso, 2 congestionado, 3 cortado, 9 desconocido.

Para cruzar con siniestros: une cada siniestro con el tramo más cercano (`lat`/`lon`) y con la lectura más próxima en el tiempo (`t`).
