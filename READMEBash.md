# Guía de Uso: Script de Despliegue Automatizado
[deploy.sh](deploy.sh)


Este repositorio cuenta con un script de automatización diseñado para gestionar el ciclo de vida del laboratorio local de Apigee. El script asegura que el entorno esté limpio, actualizado y verificado antes de comenzar a trabajar.

## 📋 Requisitos Previos

* Git Bash (recomendado para Windows), WSL o una terminal compatible con Bash.

* Docker Desktop v4.38.0 instalado y en ejecución.

## 🚀 Inicio Rápido
1. Dar permisos de ejecución (Solo la primera vez):

```bash
chmod +x deploy.sh
```

2. Ejecutar el despliegue:

```bash
./deploy.sh
```

### 🔄 ¿Qué hace este script?

El script ejecuta un flujo de trabajo de 4 etapas para garantizar la estabilidad del entorno:

1. Limpieza Profunda (`Cleanup`): Ejecuta `docker-compose down` para detener y eliminar contenedores, redes y volúmenes huérfanos de sesiones anteriores. Esto evita errores de "Puerto ya en uso".

2. Construcción Dinámica (`Build`): Utiliza la bandera `--build` para forzar a Docker a recompilar el microservicio de Python (`Fake Management API`). Esto asegura que cualquier cambio en `app.py` se aplique inmediatamente.

3. Verificación de Salud (`Healthcheck`): Tras una breve pausa para permitir el arranque de los servicios, el script lanza pruebas de conectividad (`curl`) a los puertos clave.

4. Reporte de Estado: Muestra una tabla con el estado actual de los contenedores y los puertos mapeados.

## 🔌 Mapa de Puertos del Laboratorio


| Servicio              | Puerto Local | Descripción                                               |
|-----------------------|--------------|-----------------------------------------------------------|
| Apigee Runtime        | 8445         | Donde vive tu proxy y se ejecutan las políticas.          |
| Fake Management API   | 8446         | Devuelve la lista de proxies en formato profesional (Python). |
| Tráfico Secundario    | 8999         | Puerto alternativo para consumo de APIs.                  |


🧪 Comandos de Prueba Manual
Si prefieres probar los servicios manualmente después del despliegue:

* Listar Proxies (Fake API):

``` bash

curl -i http://localhost:8446/v1/organizations/americamovil/apis

```

* Probar Proxy (HelloWorld):

``` bash
curl -i http://localhost:8445/hello
```

## ⚠️ Solución de Problemas
* Error de permisos: Si recibes Permission denied, recuerda ejecutar chmod +x deploy.sh.

* Archivos no actualizados: Asegúrate de guardar los cambios en VS Code (Ctrl + S) antes de correr el script, ya que Docker lee los archivos del disco físico para construir las imágenes.