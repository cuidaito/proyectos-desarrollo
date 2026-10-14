# Captura de datos desde un NAS QNAP

Alternativa más fiable que GitHub Actions programado. El NAS ejecuta `scripts/nas-collect.sh` con cron y sube el histórico a `main`.

## 1. Preparar el NAS
1. Activa SSH: *Panel de control → Servicios de red y archivos → Telnet/SSH*.
2. Instala **Python 3** y **Git** (en App Center o con Entware: `opkg install python3 git git-http ca-certificates`). Comprueba con `python3 --version` y `git --version`.
3. Entra por SSH y clona el repositorio:
   ```sh
   git clone https://github.com/cuidaito/proyectos-desarrollo.git ~/proyectos-desarrollo
   git config --global user.name "NAS captura"
   git config --global user.email "nas@localhost"
   ```

## 2. Token de GitHub
Crea un *fine-grained personal access token* solo para este repositorio con permiso **Contents: Read and write**, y guárdalo:
```sh
echo "TU_TOKEN" > ~/.traffic-token && chmod 600 ~/.traffic-token
```

## 3. Probar
```sh
~/proyectos-desarrollo/proyecto-02-dashboard-imd-valencia/scripts/nas-collect.sh
```
Debe aparecer un commit nuevo `data: captura de tráfico ...` en GitHub.

## 4. Programar con cron
Añade a `/etc/config/crontab` (cada 15 minutos) y recarga:
```sh
echo "*/15 * * * * /bin/sh $HOME/proyectos-desarrollo/proyecto-02-dashboard-imd-valencia/scripts/nas-collect.sh >> $HOME/traffic.log 2>&1" >> /etc/config/crontab
crontab /etc/config/crontab && /etc/init.d/crond.sh restart
```
Revisa `~/traffic.log` si algo falla.

## 5. Desactivar el workflow de GitHub
Para evitar capturas duplicadas, en *Actions → Capturar tráfico Valencia → ⋯ → Disable workflow*.
