# Replicación Local de Splunk para Logs de Apigee

Este proyecto documenta los pasos necesarios para levantar una instancia local de Splunk mediante Docker y configurarla para replicar el entorno de la aplicación "Mexico" alojada en Splunk Cloud, permitiendo la ingesta de logs JSON provenientes de Apigee vía HEC (HTTP Event Collector).

## Requisitos Previos

*   **Windows:** Tener instalado Docker Desktop (se recomienda usar el backend de WSL 2).
*   **Ubuntu / Linux:** Tener instalado Docker Engine (`sudo apt install docker.io`).

---

## 1. Descargar y Ejecutar el Contenedor de Splunk

El siguiente comando descarga la última imagen oficial de Splunk, acepta las licencias, establece la contraseña del usuario `admin` y expone los puertos necesarios:
*   `8000`: Interfaz Web de Splunk.
*   `8088`: Puerto para el HTTP Event Collector (HEC).

### Para Windows (PowerShell)
```powershell
docker run -d -p 8000:8000 -p 8088:8088 `
  -e "SPLUNK_START_ARGS=--accept-license" `
  -e "SPLUNK_GENERAL_TERMS=--accept-sgt-current-at-splunk-com" `
  -e "SPLUNK_PASSWORD=TuPasswordSeguro123" `
  --name splunk_local `
  splunk/splunk:latest
```

### Para Ubuntu / Linux (Bash)
```bash
docker run -d -p 8000:8000 -p 8088:8088 \
  -e "SPLUNK_START_ARGS=--accept-license" \
  -e "SPLUNK_GENERAL_TERMS=--accept-sgt-current-at-splunk-com" \
  -e "SPLUNK_PASSWORD=AdminPassw0rd2026!" \
  --name splunk_local \
  splunk/splunk:latest
```

**Nota:** El contenedor puede tardar un par de minutos en inicializar todos los servicios. Puedes verificar el estado con `docker logs -f splunk_local`.

---

## 2. Acceso Inicial

1.  Abre un navegador web y navega a: `http://localhost:8000`
2.  Inicia sesión con las siguientes credenciales:
    *   **Usuario:** `admin`
    *   **Contraseña:** `AdminPassw0rd2026!` (o la que hayas definido en el paso anterior).

---

## 3. Creación de la Aplicación (App "Mexico")

Para aislar las configuraciones y dashboards:

1.  Ve al ícono de engrane **Manage Apps** (esquina superior izquierda).
2.  Haz clic en **Create app**.
3.  Llena el formulario con los siguientes datos:
    *   **Name:** Mexico
    *   **Folder name:** mexico
    *   **Version:** 1.0.0
    *   **Visible:** Yes
    *   **Template:** barebones
4.  Haz clic en **Save**.

---

## 4. Configuración del Source Type (JSON de Apigee)

Para que Splunk parsee correctamente los JSON:

1.  Ve a **Settings** > **Source types**.
2.  Haz clic en **New Source Type**.
3.  Configura los siguientes valores:
    *   **Name:** `apigee_cdr_v2_prd`
    *   **Destination app:** `Mexico`
    *   **Category:** `Custom`
    *   **Indexed extractions:** `json`
    *   **Timestamp > Extraction:** `Auto`
4.  Haz clic en **Save**.

---

## 5. Configuración de HEC (HTTP Event Collector)

Para habilitar la recepción de logs vía HTTP:

### Habilitar HEC Globalmente
1.  Ve a **Settings** > **Data Inputs** > **HTTP Event Collector**.
2.  Haz clic en **Global Settings**.
3.  Asegúrate de que **All Tokens** esté en **Enabled** y el puerto sea `8088`. Guarda los cambios.

### Crear el Token para Apigee
1.  En la misma pantalla de HEC, haz clic en **New Token**.
2.  **Name:** `apigee_cdr_token`
3.  **Source name override:** `http:apigee_cdr_v2_prd`
4.  Avanza a la pantalla de **Input Settings**:
    *   **Source type:** Selecciona `apigee_cdr_v2_prd` (el que creamos en el paso 4).
    *   **App context:** `Mexico`
    *   **Index:** `main` (o crea un índice específico para apigee).
5.  Finaliza el proceso y **copia el Token Value** generado.

---

## 6. Prueba de Ingesta de Datos

Para verificar que el flujo funciona, envía un payload de prueba al puerto 8088. Reemplaza `<TU_TOKEN_AQUÍ>` con el Token Value del paso 5.

### Windows (PowerShell) / Linux (Bash)
```bash
curl -k "http://localhost:8088/services/collector" \
    -H "Authorization: Splunk <TU_TOKEN_AQUÍ>" \
    -d '{"event": {"StreamID": "b1e56e67-9730-4793", "TimeStamp": "2026-05-04 18:23:21", "LogLevel": "INFO", "ApigeeHeaderInfo": {"proxy": "tmf622-product-ordering"}}, "sourcetype": "apigee_cdr_v2_prd", "source": "http:apigee_cdr_v2_prd", "host": "http-inputs-speedymovil.splunkcloud.com"}'
```

Si la respuesta es `{"text":"Success","code":0}`, la ingesta fue exitosa.

---

## 7. Verificación Final

1.  Ve a la interfaz de Splunk (`http://localhost:8000`).
2.  Entra a la aplicación **Mexico**.
3.  En la barra de búsqueda ejecuta: `index="main" sourcetype="apigee_cdr_v2_prd"`
4.  Deberás ver el evento ingresado con el resaltado de sintaxis JSON y los campos extraídos automáticamente.
````</TU_TOKEN_AQUÍ>