# 402scope.org · web

La página principal del observatorio 402Scope. Estática, sin dependencias ni paso de compilación: la carpeta `site/` es lo que se publica. Lee los datos en directo de la API del propio observatorio (`/v1/...`, mismo dominio).

## Qué hay

- `site/index.html`, `site/styles.css`, `site/app.js`: la página.
- `site/fonts/`: IBM Plex Sans y Plex Mono, alojadas en el propio sitio (licencia OFL, sin llamadas a Google).
- `deploy/install.sh`: instalación en el servidor (una vez).
- `deploy/update.sh`: publica el último commit (lo ejecuta el temporizador cada 15 minutos).
- `deploy/diagnose.sh`: comprobaciones de solo lectura de la API y la base de datos.

## Instalar en el servidor (una vez)

```
ssh root@TU_SERVIDOR
curl -fsSL https://raw.githubusercontent.com/arturete58-sys/402scope-web/main/deploy/install.sh -o install.sh && bash install.sh
```

El script localiza la carpeta `public/` que sirve la API del observatorio, guarda una copia de lo que hay en `/opt/402scope-web-backup`, publica `site/` y activa la actualización automática. No toca la API, la base de datos ni la configuración del servidor web. Al final imprime un diagnóstico; pégalo en el chat.

Si la web la sirve otra carpeta: `TARGET=/ruta/de/la/web bash install.sh`.

## Después

Cada commit en `main` se publica solo en 15 minutos como máximo. Para publicar ya: `bash /opt/402scope-web/deploy/update.sh`. Para volver a la versión anterior: `cp -a /opt/402scope-web-backup/. <carpeta publicada>/`.
