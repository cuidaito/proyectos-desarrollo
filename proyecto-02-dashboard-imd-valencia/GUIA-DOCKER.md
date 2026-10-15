# Guía paso a paso: imágenes, `.tar`, red, volumen y contenedores

Dos contenedores en una red propia:

| Contenedor | Imagen | Función | Persistencia |
|---|---|---|---|
| `datos` | `trafico-datos` | Captura cada 3 min, guarda `trafico.db` y ofrece la API (puerto 8000 interno) | Volumen `trafico` en `/data` |
| `web` | `trafico-web` | nginx con el dashboard; reenvía `/api/` a `datos:8000` | Ninguna |

La red `trafico` es imprescindible: `web` encuentra a `datos` por su **nombre** y eso solo funciona en una red creada por ti.

---

## 1. Crear las imágenes y los `.tar` (en la máquina de desarrollo)

Desde la carpeta `proyecto-02-dashboard-imd-valencia`:

```sh
docker build --platform linux/amd64 -f Dockerfile.datos -t trafico-datos:latest .
docker build --platform linux/amd64 -f Dockerfile.web   -t trafico-web:latest .

docker save trafico-datos:latest -o trafico-datos.tar
docker save trafico-web:latest   -o trafico-web.tar
```

- Usa `linux/arm64` si el destino es ARM (p. ej. algunos NAS o Raspberry Pi).
- Los `.tar` son lo que se copia al otro equipo. No hace falta el código.

## 2. Cargar las imágenes (en el equipo destino)

**Portainer:** *Images* → *Import* → selecciona cada `.tar` → *Upload*.

**Terminal:**
```sh
docker load -i trafico-datos.tar
docker load -i trafico-web.tar
```
Comprueba que existen `trafico-datos:latest` y `trafico-web:latest`.

## 3. Crear la red

**Portainer:** *Networks* → *Add network* → Name `trafico`, Driver `bridge` → *Create*.

**Terminal:**
```sh
docker network create trafico
```

## 4. Crear el volumen

**Portainer:** *Volumes* → *Add volume* → Name `trafico` → *Create*.

**Terminal:**
```sh
docker volume create trafico
```
Si no lo creas, Docker lo crea solo al arrancar `datos`, pero conviene hacerlo explícito.

## 5. Crear el contenedor `datos` (primero)

**Portainer:** *Containers* → *Add container*
- Name: `datos` (exactamente; la web lo busca por este nombre)
- Image: `trafico-datos:latest`
- Port mapping: ninguno (opcional `8001` → `8000` para acceder a la API desde fuera)
- *Advanced container settings*:
  - **Volumes** → `container` = `/data`, pulsa **Volume** (no *Bind*), host = `trafico`, *Writable*
  - **Network** → `trafico`
  - **Restart policy** → *Unless stopped*
- *Deploy the container*

**Terminal:**
```sh
docker run -d --name datos --network trafico -v trafico:/data --restart unless-stopped trafico-datos:latest
```

## 6. Crear el contenedor `web`

**Portainer:** *Containers* → *Add container*
- Name: `web`
- Image: `trafico-web:latest`
- Port mapping: host `8080` → container `80`
- *Advanced container settings*:
  - **Network** → `trafico`
  - **Env** → `API_UPSTREAM` = `datos:8000` (ya es el valor por defecto)
  - **Restart policy** → *Unless stopped*
- *Deploy the container*

**Terminal:**
```sh
docker run -d --name web --network trafico -p 8080:80 --restart unless-stopped trafico-web:latest
```

## 7. Comprobar

- `http://localhost:8080/api/health` debe responder `{"ok": true, "db": true}`.
- `http://localhost:8080/` abre el dashboard. Recarga con **Cmd+Shift+R** la primera vez.
- Logs de `datos`: una línea nueva cada 3 minutos (`354 lecturas de 389 tramos`).

Si `/api/health` da **502**: `datos` no se llama exactamente `datos`, no está en la red `trafico`, o no está en marcha. Revisa *Connected networks* en cada contenedor.

---

## Todo en uno con Docker Compose

Con las imágenes ya cargadas, desde la carpeta del proyecto:
```sh
docker compose up -d
```
Crea la red y el volumen automáticamente. Puertos configurables con `WEB_PORT` y `DATA_PORT`.

## Actualizar

- **Solo la web:** carga el nuevo `trafico-web.tar`, borra `web` y créalo de nuevo (paso 6). `datos` no se toca y sigue capturando.
- **Datos:** carga el nuevo `trafico-datos.tar`, borra `datos` y créalo de nuevo con el **mismo volumen** `trafico`. La base se conserva.

## Copia de seguridad y datos

- Botón **Base de datos** del dashboard, o `http://localhost:8080/api/trafico.db`, descarga una copia consistente.
- Al borrar un contenedor **no marques "Remove volumes"**: el volumen es donde está el histórico.
- Mientras `datos` está parado no se captura nada y esas lecturas no se recuperan (el origen no guarda histórico).

## Problemas frecuentes

| Síntoma | Causa | Solución |
|---|---|---|
| `502` en `/api/...` | `web` no encuentra `datos` | Ambos en la red `trafico`; contenedor llamado `datos` |
| `Connection refused ... 127.0.0.11:53` | `web` en la red `bridge` por defecto | Ponlo en la red `trafico` |
| Puerto ocupado | Otro servicio usa 8080/8000 | Cambia el puerto del host (`8081:80`) |
| La web se ve sin estilos | Caché del navegador | Cmd+Shift+R |
| Consola de Portainer en "Connecting" | Fallo del websocket | Usa los logs o comprueba `/api/health` |
| Volumen sin datos tras recrear | Se creó con otro nombre o con *Bind* | Usa *Volume* `trafico` en `/data` |
