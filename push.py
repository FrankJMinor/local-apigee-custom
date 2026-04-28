import requests

# Configuración del emulador
URL = "http://localhost:8998/v1/organizations/test-org/apis"
PROXY_NAME = "HelloWorld"
ZIP_FILE = "HelloWorld.zip"

def upload_proxy():
    print(f" Subiendo {PROXY_NAME} al emulador...")
    
    try:
        # Abrimos el archivo zip que generamos antes
        with open(ZIP_FILE, 'rb') as f:
            # Apigee espera el archivo en un campo llamado 'file'
            files = {'file': (ZIP_FILE, f, 'application/zip')}
            
            # El parámetro action=import es clave en el emulador
            params = {'action': 'import', 'name': PROXY_NAME}
            
            response = requests.post(URL, params=params, files=files)
            
        if response.status_code in [200, 201]:
            print(" ¡Éxito! El proxy ha sido importado.")
            print("Respuesta:", response.json())
        else:
            print(f" Error al subir: {response.status_code}")
            print(response.text)
            
    except FileNotFoundError:
        print(f" No se encontró el archivo {ZIP_FILE}. Ejecuta primero el script que genera el zip.")
    except Exception as e:
        print(f" Ocurrió un error: {e}")

if __name__ == "__main__":
    upload_proxy()