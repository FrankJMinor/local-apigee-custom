
# Guía de Comandos Docker para Laboratorio Apigee

Esta guía recopila los comandos esenciales de Docker utilizados para desplegar, mantener y depurar tu laboratorio de Apigee. Cada comando está acompañado de una breve explicación y buenas prácticas.

---

## 1. Gestión de la Infraestructura (Docker Compose)

### Levantar todo el entorno
```sh
docker-compose up -d
```
Inicia todos los servicios definidos en `docker-compose.yml` en segundo plano. Crea los contenedores, redes y volúmenes necesarios de forma automática.

### Reconstruir y levantar un servicio específico
```sh
docker-compose up --build -d fake-management-api
```
Reconstruye la imagen del servicio `fake-management-api` aplicando los cambios recientes en el código (por ejemplo, en `server.js`). Es fundamental usar `--build` para evitar que Docker use una imagen antigua.

### Reiniciar un servicio
```sh
docker-compose restart fake-management-api
```
Reinicia el contenedor del servicio sin reconstruir la imagen. Útil para refrescar el servicio cuando no hay cambios en el código fuente o Dockerfile.

---

## 2. Limpieza y Resolución de Conflictos

### Eliminar un contenedor específico
```sh
docker rm -f apigee-dev
```
Elimina forzadamente el contenedor `apigee-dev`. Útil cuando los puertos quedan bloqueados o la extensión de VS Code no puede crear un contenedor porque ya existe uno con el mismo nombre.

### Listar contenedores activos
```sh
docker ps
```
Muestra todos los contenedores en ejecución. Permite verificar el estado de los servicios y los puertos asignados.

---

## 3. Inspección y Exploración Interna

### Buscar archivos dentro de un contenedor
```sh
docker exec apigee-fake-control-plane find /workspace -name deployments.json
```
Ejecuta un comando dentro del contenedor para localizar archivos, como `deployments.json`. Ayuda a encontrar rutas exactas requeridas por el servidor.

### Ver logs en tiempo real
```sh
docker logs -f apigee-fake-control-plane
```
Muestra en tiempo real la salida del servidor (por ejemplo, los `console.log` de Node.js). Esencial para depuración y monitoreo.

---

## Resumen de la Lógica Aplicada

- **Mapeo de Volúmenes:** Se mapea la raíz del proyecto (`.`) a `/workspace` en el contenedor, permitiendo que los cambios en el código se reflejen en tiempo real.
- **Aislamiento de Versiones:** Se recomienda mantener Docker Desktop en la versión 4.38.0 para evitar incompatibilidades con la extensión de Apigee.
- **Encadenamiento de Puertos:** El puerto 8446 se utiliza como acceso alternativo para archivos que el emulador oficial (puerto 8445) no expone.

---

Con esta referencia, puedes replicar o restaurar el entorno de laboratorio cuando sea necesario. ¡Microservicios en acción! 🛡️🚀