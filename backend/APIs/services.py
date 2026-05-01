# librerías estándar
from typing import List, Dict, Any, Optional
from pathlib import Path
import logging
import os

# Instanciamos el logger para esta parte del backend
logger = logging.getLogger(__name__)

# BASE_DIR es .../dev/backend
# .parent nos saca a .../dev/ donde está tu carpeta 'src'
BASE_DIR = Path(__file__).resolve().parent.parent.parent



def get_proxy_tree(proxy_name):  # <--- Asegúrate de que se llame así
    """Mapea el árbol del proxy en el sistema de archivos local."""
    
    # Construimos la ruta: dev/src/main/apigee/proxies/HelloWorld/apiproxy
    root_path = BASE_DIR / "src" / "main" / "apigee" / "proxies" / proxy_name / "apiproxy"
    
    # Para debuggear en tu consola de Windows
    logger.debug(f"Buscando proxy físicamente en: {root_path}")

    if not root_path.exists():
        logger.error(f"ERROR: No se encontró la carpeta en {root_path}")
        return None

    response = {
        "proxy_root": proxy_name,
        "local_path": str(root_path),
        "tree": []
    }

    # Escaneamos las subcarpetas estándar
    for folder in ['proxies', 'policies', 'targets']:
        folder_path = root_path / folder
        if folder_path.exists():
            files = [f for f in os.listdir(folder_path) if f.endswith('.xml')]
            response["tree"].append({
                "folder": folder,
                "files": files
            })
            
    return response

    
BASE_CONTRACTS = '/apigee_runtime' 


def get_latest_revision_path() -> Optional[str]:
    """
    Localiza dinámicamente la ruta del sistema de archivos donde se encuentra 
    la revisión más reciente de los proxies desplegados en el emulador de Apigee.

    La función navega por la estructura interna del emulador (/sdlc/contracts/<ID>) 
    identificando la carpeta con el número de revisión más alto, asegurando que 
    el backend siempre lea el estado inmutable más reciente del runtime.

    Returns:
        Optional[str]: Ruta absoluta hacia la carpeta 'apiproxies' de la última 
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
    ruta_contratos = os.path.join(BASE_CONTRACTS, 'sdlc', 'contracts')
    
    if not os.path.exists(ruta_contratos):
        logger.warning(f"Estructura 'sdlc/contracts' no encontrada en {BASE_CONTRACTS}")
        return None

    # 3. Identificación de revisiones inmutables (directorios numéricos)
    revisions = [d for d in os.listdir(ruta_contratos) if d.isdigit()]
    
    if not revisions:
        logger.info("No se detectaron carpetas de revisión (sin despliegues).")
        return None
    
    # 4. Selección de la revisión activa (ID numérico más alto)
    latest = max(revisions, key=int)
    
    # 5. Retorno de la ruta profunda hacia los bundles de proxies
    return os.path.join(
        ruta_contratos, 
        latest, 
        'src', 'main', 'apigee', 'apiproxies'
    )
    
def get_proxy_file_tree(proxy_name: str) -> Optional[List[Dict[str, Any]]]:
    """
    Escanea la carpeta de un proxy específico y devuelve una lista plana 
    de sus archivos y rutas relativas.
    """
    base_path = get_latest_revision_path()
    if not base_path:
        return None

    proxy_root = os.path.join(base_path, proxy_name)

    if not os.path.exists(proxy_root):
        logger.error(f"El proxy {proxy_name} no existe en la ruta: {proxy_root}")
        return None

    file_list = []
    
    # os.walk recorre todas las subcarpetas automáticamente
    for root, dirs, files in os.walk(proxy_root):
        for file in files:
            # Obtenemos la ruta relativa para que sea fácil de leer en la UI
            full_path = os.path.join(root, file)
            relative_path = os.path.relpath(full_path, proxy_root)
            
            file_list.append({
                "name": file,
                "path": relative_path,
                "type": "file",
                "extension": os.path.splitext(file)[1]
            })

    logger.info(f"Se encontraron {len(file_list)} archivos para el proxy: {proxy_name}")
    return file_list