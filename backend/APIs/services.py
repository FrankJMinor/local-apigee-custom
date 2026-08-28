# librerías estándar
import logging
import os
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional

# Instanciamos el logger para esta parte del backend
logger = logging.getLogger(__name__)

# BASE_DIR es .../dev/backend
# .parent nos saca a .../dev/ donde está tu carpeta 'src'
BASE_DIR = Path(__file__).resolve().parent.parent.parent

BASE_CONTRACTS = "/apigee_runtime"


def get_latest_revision_path() -> Optional[str]:
    """
    Localiza dinámicamente la ruta del sistema de archivos donde se encuentra
    la revisión más reciente de los proxies desplegados en el emulador de Apigee.

    La función navega por la estructura interna del emulador (/sdlc/contracts/<ID>)
    apoyándose en :func:`get_current_revision`, que pregunta al emulador cuál es el
    contrato realmente activo. No basta con tomar la carpeta numérica más alta: un
    despliegue que falla al compilar deja igualmente su carpeta en disco, y leerla
    mostraría en la UI archivos que el emulador rechazó.

    Returns:
        Optional[str]: Ruta absoluta hacia la carpeta 'apiproxies' de la revisión
        activa, o None si no se encuentra un despliegue activo o la ruta base.

    Note:
        Esta función depende de que el volumen 'apigee_contracts_vol' esté correctamente
        montado en la ruta definida por la constante BASE_CONTRACTS.
    """
    # 1. Validación de la montura del volumen
    if not os.path.exists(BASE_CONTRACTS):
        logger.debug(f"La ruta base {BASE_CONTRACTS} no está accesible.")
        return None

    # 2. Construcción de la ruta hacia el almacén de contratos de SDLC
    ruta_contratos = os.path.join(BASE_CONTRACTS, "sdlc", "contracts")

    if not os.path.exists(ruta_contratos):
        logger.warning(f"Estructura 'sdlc/contracts' no encontrada en {BASE_CONTRACTS}")
        return None

    # 3. Revisión realmente activa según el emulador
    active = get_current_revision()

    if not active:
        logger.info("No se detectaron carpetas de revisión (sin despliegues).")
        return None

    # 4. Si el contrato activo ya no está en disco, caemos al más alto disponible
    if not os.path.isdir(os.path.join(ruta_contratos, active)):
        revisions = _revisions_on_disk()
        if not revisions:
            return None
        active = max(revisions, key=int)
        logger.warning(f"Contrato activo ausente en disco; usando la revisión {active}")

    # 5. Retorno de la ruta profunda hacia los bundles de proxies
    return os.path.join(ruta_contratos, active, "src", "main", "apigee", "apiproxies")


def _revisions_on_disk() -> List[str]:
    """Carpetas de contrato materializadas en el volumen del emulador."""
    ruta_contratos = os.path.join(BASE_CONTRACTS, "sdlc", "contracts")

    if not os.path.exists(ruta_contratos):
        logger.debug(f"Sin estructura de contratos en {ruta_contratos}")
        return []

    return [d for d in os.listdir(ruta_contratos) if d.isdigit()]


def get_current_revision() -> Optional[str]:
    """Devuelve la revisión (contrato) que el emulador tiene realmente activa.

    Ojo con no deducirla de la carpeta numérica más alta: cuando un despliegue
    falla al compilar, el emulador ya ha extraído el código fuente en
    ``contracts/<N>`` y esa carpeta se queda ahí. Fiarse del máximo haría que la
    UI mostrara —y editara— los archivos de un contrato rechazado.

    La fuente fiable es el ``proxyUID`` que reporta ``/v1/emulator/tree``, que
    identifica el contrato en ejecución. Si el emulador no responde, caemos a la
    carpeta más alta como mejor estimación disponible.

    Returns:
        Optional[str]: Número de revisión, o None si no hay despliegues activos.
    """
    # Import local: services se carga durante el arranque de Django y emulator
    # depende de settings ya configurado.
    from .emulator import EmulatorError, get_tree

    try:
        deployments = get_tree()
        uids = [str(d.get("proxyUID")) for d in deployments if str(d.get("proxyUID", "")).isdigit()]

        if uids:
            return max(uids, key=int)
    except EmulatorError as exc:
        logger.warning(f"No se pudo consultar la revisión activa al emulador: {exc}")

    revisions = _revisions_on_disk()
    return max(revisions, key=int) if revisions else None


def get_proxy_file_tree(proxy_name: str) -> Optional[Dict[str, Any]]:
    base_path = get_latest_revision_path()
    if not base_path:
        return None

    proxy_root = os.path.join(base_path, proxy_name, "apiproxy")  # Entramos a /apiproxy

    if not os.path.exists(proxy_root):
        return None

    # Estructura inicial que espera la UI
    tree = {
        "proxy_name": proxy_name,
        "policies": [],
        "proxy_endpoints": [],
        "target_endpoints": [],
        "scripts": [],
        "root_config": None,
    }

    for root, dirs, files in os.walk(proxy_root):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, proxy_root)

            # Intentamos leer el contenido del archivo para precargarlo en la UI
            content = ""
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception as e:
                logger.error(f"Error al leer contenido de {file}: {e}")

            file_data = {
                "name": file.replace(".xml", ""),  # Limpiamos extensión para el label
                "full_name": file,
                "path": rel_path,
                "ext": os.path.splitext(file)[1],
                "type": get_policy_type(full_path) if file.endswith(".xml") else "Unknown",
                "content": content,
            }

            # Categorización por carpeta
            if "policies" in rel_path:
                tree["policies"].append(file_data)
            elif "proxies" in rel_path:
                tree["proxy_endpoints"].append(file_data)
            elif "targets" in rel_path:
                tree["target_endpoints"].append(file_data)
            elif "resources" in rel_path:
                tree["scripts"].append(file_data)
            elif rel_path == f"{proxy_name}.xml":
                tree["root_config"] = file_data

    return tree


def get_list_shared_flows() -> List[str]:
    """
    Localiza dinámicamente la ruta del sistema de archivos donde se encuentra
    la revisión más reciente de los shared flows desplegados en el emulador de Apigee.

    La función navega por la estructura interna del emulador (/sdlc/contracts/<ID>)
    identificando la carpeta con el número de revisión más alto, asegurando que
    el backend siempre lea el estado inmutable más reciente del runtime.

    Returns:
        Optional[str]: Ruta absoluta hacia la carpeta 'shared flows' de la última
        revisión, o None si no se encuentra un despliegue activo o la ruta base.

    Note:
        Esta función depende de que el volumen 'apigee_contracts_vol' esté correctamente
        montado en la ruta definida por la constante BASE_CONTRACTS.
    """
    # 1. Validación de la montura del volumen
    if not os.path.exists(BASE_CONTRACTS):
        logger.debug(f"La ruta base {BASE_CONTRACTS} no está accesible.")
        return None

    # 2. Construcción de la ruta hacia el almacén de contratos de SDLC
    ruta_contratos = os.path.join(BASE_CONTRACTS, "sdlc", "contracts")

    if not os.path.exists(ruta_contratos):
        logger.warning(f"Estructura 'sdlc/contracts' no encontrada en {BASE_CONTRACTS}")
        return None

    # 3. Revisión realmente activa según el emulador (ver get_current_revision)
    active = get_current_revision()

    if not active:
        logger.info("No se detectaron carpetas de revisión (sin despliegues).")
        return None

    # 4. Si el contrato activo ya no está en disco, caemos al más alto disponible
    if not os.path.isdir(os.path.join(ruta_contratos, active)):
        revisions = _revisions_on_disk()
        if not revisions:
            return None
        active = max(revisions, key=int)

    # 5. Retorno de la ruta profunda hacia los bundles de shared flows
    return os.path.join(ruta_contratos, active, "src", "main", "apigee", "sharedflows")


def get_sharedflow_file_tree(shared_flow_name: str) -> Optional[Dict[str, Any]]:
    """Mapea el árbol de un shared flow en el sistema de archivos local.
       La función busca la carpeta del shared flow dentro de la revisión más reciente
       del emulador de Apigee, y construye una estructura de datos que incluye

    Inputs:
        shared_flow_name (str): El nombre del shared flow a mapear, que corresponde
        a la carpeta dentro de /sharedflows/ en el bundle del emulador.

    Returns:
        Optional[Dict[str, Any]]: Un diccionario con la estructura del shared flow,
        incluyendo políticas, scripts y configuración raíz, o None si no se encuentra
        el shared flow o la ruta base

    """
    base_path = get_list_shared_flows()
    if not base_path:
        logger.error("No se pudo localizar la ruta base para shared flows.")
        return None

    # Entramos a /sharedflowbundle para que las rutas queden relativas a la raiz
    # del bundle, igual que hace get_proxy_file_tree con /apiproxy. Si no, la UI
    # devolveria rutas con el prefijo y el guardado crearia carpetas anidadas.
    sharedflow_root = os.path.join(base_path, shared_flow_name, "sharedflowbundle")
    logger.debug(f"Buscando shared flow '{shared_flow_name}' en la ruta: {sharedflow_root}")

    if not os.path.exists(sharedflow_root):
        logger.error(
            f"No se encontró el shared flow '{shared_flow_name}' en la ruta {sharedflow_root}"
        )
        return None

    # Estructura inicial que espera la UI
    tree = {
        "shared_flow_name": shared_flow_name,
        "policies": [],
        "shared_flows": [],
        "scripts": [],
        "root_config": None,
    }

    for root, dirs, files in os.walk(sharedflow_root):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, sharedflow_root)

            # Intentamos leer el contenido del archivo para precargarlo en la UI
            content = ""
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    content = f.read()
            except Exception as e:
                logger.error(f"Error al leer contenido de {file}: {e}")

            file_data = {
                "name": file.replace(".xml", ""),  # Limpiamos extensión para el label
                "full_name": file,
                "path": rel_path,
                "ext": os.path.splitext(file)[1],
                "type": get_policy_type(full_path) if file.endswith(".xml") else "Unknown",
                "content": content,
            }

            # Categorización por carpeta
            rel_path_lower = rel_path.lower()
            if "policies" in rel_path_lower:
                tree["policies"].append(file_data)
            elif "sharedflows" in rel_path_lower:
                tree["shared_flows"].append(file_data)
            elif "resources" in rel_path_lower:
                tree["scripts"].append(file_data)
            elif rel_path == f"{shared_flow_name}.xml" or rel_path.endswith(
                f"{shared_flow_name}.xml"
            ):
                tree["root_config"] = file_data

    return tree


def get_policy_type(file_path):
    """Obtiene el tipo de política leyendo el tag raíz del XML."""
    try:
        tree = ET.parse(file_path)
        root = tree.getroot()
        # El nombre del tag raíz nos dice qué política es (ej. <VerifyAPIKey>)
        return root.tag
    except Exception:
        return "Unknown"
