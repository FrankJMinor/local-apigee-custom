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
    
def get_proxy_file_tree(proxy_name: str) -> Optional[Dict[str, Any]]:
    base_path = get_latest_revision_path()
    if not base_path:
        return None

    proxy_root = os.path.join(base_path, proxy_name, 'apiproxy') # Entramos a /apiproxy

    if not os.path.exists(proxy_root):
        return None

    # Estructura inicial que espera la UI
    tree = {
        "proxy_name": proxy_name,
        "policies": [],
        "proxy_endpoints": [],
        "target_endpoints": [],
        "scripts": [],
        "root_config": None
    }

    for root, dirs, files in os.walk(proxy_root):
        for file in files:
            full_path = os.path.join(root, file)
            rel_path = os.path.relpath(full_path, proxy_root)
            
            file_data = {
                "name": file.replace('.xml', ''), # Limpiamos extensión para el label
                "full_name": file,
                "path": rel_path,
                "ext": os.path.splitext(file)[1]
            }

            # Categorización por carpeta
            if 'policies' in rel_path:
                tree["policies"].append(file_data)
            elif 'proxies' in rel_path:
                tree["proxy_endpoints"].append(file_data)
            elif 'targets' in rel_path:
                tree["target_endpoints"].append(file_data)
            elif 'resources' in rel_path:
                tree["scripts"].append(file_data)
            elif rel_path == f"{proxy_name}.xml":
                tree["root_config"] = file_data

    return tree

def get_proxy_file_content(proxy_name: str, file_path: str) -> Optional[str]:
    """Lee el contenido de un archivo específico dentro del bundle del proxy."""
    base_path = get_latest_revision_path()
    if not base_path:
        return None

    full_path = os.path.join(base_path, proxy_name, 'apiproxy', file_path)

    if not os.path.exists(full_path) or not os.path.isfile(full_path):
        logger.error(f"Archivo no encontrado: {full_path}")
        return None

    try:
        with open(full_path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        logger.error(f"Error al leer archivo {full_path}: {e}")
        return None