# Dashboard en un NAS QNAP (web y datos locales)

## Opción A (recomendada): contenedor Docker

Una sola imagen con nginx (web) y la captura cada 15 minutos (`INTERVAL_SECONDS`). Los datos se guardan en un volumen.

Construir y exportar la imagen (desde esta carpeta; `linux/amd64` para la mayoría de QNAP, `linux/arm64` para modelos ARM):
```sh
docker build --platform linux/amd64 -t trafico-valencia:latest .
docker save trafico-valencia:latest -o trafico-valencia-amd64.tar
```
En el QNAP: *Container Station → Imágenes → Importar* el `.tar`. Después crea el contenedor con puerto `8080 → 80`, reinicio automático y un volumen de una carpeta del NAS montada en `/usr/share/nginx/html/data` (ahí queda el histórico). O con `docker-compose.yml` (*Aplicaciones → Crear*): usa la imagen ya importada (`trafico-valencia:latest`), sin construir nada en el NAS.

La web queda en `http://IP-DEL-NAS:8080/`. Con otra arquitectura, genera la imagen con la plataforma adecuada.

## Opción B: sin Docker

La web se sirve desde el NAS y el histórico se guarda en una carpeta del NAS. GitHub solo guarda el código.
Fuera de `github.io`, el dashboard lee el histórico de `data/` junto a `index.html`.

## 1. Servidor web en el QNAP
Activa el servidor web: *Panel de control → Aplicaciones → Servidor web* (Apache) y habilítalo. Se sirve desde la carpeta compartida `Web` (normalmente `/share/Web`). Alternativa: un contenedor nginx en Container Station apuntando a la carpeta.

## 2. Copiar la web
Copia estos archivos a `/share/Web/trafico/` (por ejemplo con File Station o `scp`):

`index.html`, `styles.css`, `config.js`, `script.js` y la carpeta `scripts/`.

Crea también la carpeta de datos `/share/Web/trafico/data/history/`. Opcional: copia la carpeta `data/` del repositorio para conservar el histórico ya capturado.

La web quedará en `http://IP-DEL-NAS/trafico/`.

## 3. Python 3 en el NAS
Instálalo desde App Center (Python 3) o con Entware (`opkg install python3 ca-certificates`) y comprueba `python3 --version` por SSH.

## 4. Probar la captura
```sh
python3 /share/Web/trafico/scripts/collect.py
```
Debe imprimir algo como `2026-..: 357 lecturas de 389 tramos` y crear `data/latest.json`. Por defecto escribe en `data/` junto a `scripts/`; con otra ruta, usa `DATA_DIR=/ruta/data python3 ...`.

## 5. Programar con cron
Añade a `/etc/config/crontab` (cada 15 minutos) y recarga:
```sh
echo "*/15 * * * * python3 /share/Web/trafico/scripts/collect.py >> /share/Web/trafico/collect.log 2>&1" >> /etc/config/crontab
crontab /etc/config/crontab && /etc/init.d/crond.sh restart
```
Revisa `collect.log` si algo falla. Si usas Entware y `python3` no está en el PATH de cron, escribe la ruta completa (p. ej. `/opt/bin/python3`).

## 6. Dejar de usar GitHub para los datos
En GitHub, *Actions → Capturar tráfico Valencia → Disable workflow*. Si pasas el repositorio a privado, la web de GitHub Pages deja de estar disponible (requiere plan de pago), pero la del NAS no se ve afectada.

## Actualizar la web
Vuelve a copiar `index.html`, `styles.css`, `config.js` y `script.js` sin tocar `data/`.

## Copias de seguridad
Incluye `/share/Web/trafico/data` en tus copias del NAS: es el único sitio con el histórico.
