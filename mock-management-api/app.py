
from flask import Flask, jsonify
import socket
import json
import os

app = Flask(__name__)

# La ruta exacta que encontramos con el comando 'find'
DEPLOYMENTS_PATH = '/workspace/src/main/apigee/environments/apigee-dev/deployments.json'

@app.route('/v1/organizations/<org>/apis', methods=['GET'])
def get_deployed_proxies(org):
    try:
        # 1. Intentar leer el archivo local de VS Code
        if not os.path.exists(DEPLOYMENTS_PATH):
            return jsonify({"error": "Archivo deployments.json no encontrado"}), 500
        
        with open(DEPLOYMENTS_PATH, 'r') as f:
            local_data = json.load(f)
            proxies_list = local_data.get("proxies", [])
            
            
        # 2. Obtener el ID real del contenedor (Hostname)
        # En Docker, el hostname por defecto es el ID corto del contenedor
        local_container_id = socket.gethostname()

        # 3. Construir la estructura espejo de Americamovil
        # Extraer el nombre del environment desde la ruta del deployments.json
        env_name = DEPLOYMENTS_PATH.split('/')[-2] if '/' in DEPLOYMENTS_PATH else DEPLOYMENTS_PATH.split('\\')[-2]
        response = {
            "aPIProxy": [],
            "name": env_name,  # Nombre dinámico del environment
            "organization": org
        }

        # 4. Mapear cada proxy a la estructura detallada
        i = 1
        for proxy_name in proxies_list:
            proxy_detail = {
                "name": proxy_name,
                "revision": [
                    {
                        "configuration": {
                            "basePath": "/",
                            "configVersion": "SHA-512:local-mock-hash-{}".format(i),
                            "steps": []
                        },
                        "name": "{}".format(i), # Revisión local siempre 1
                        "server": [
                            {
                                "pod": {"name": "gateway-1", "region": "local"},
                                "status": "deployed",
                                "type": ["message-processor"],
                                "uUID": local_container_id
                            }
                        ],
                        "state": "deployed"
                    }
                ]
            }
            response["aPIProxy"].append(proxy_detail)
            i += 1

        # 5. Devolver la respuesta
        return jsonify(response)

    except Exception as e:
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Escuchamos en el puerto 8446 que definiste en el compose
    app.run(host='0.0.0.0', port=8446)