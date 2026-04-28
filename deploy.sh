#!/bin/bash

# --- CONFIGURACIÓN ---
PROJECT_NAME="apigee-local-lab"
COMPOSE_FILE="docker-compose.yml"

echo "----------------------------------------------------------"
echo " Iniciando despliegue de: $PROJECT_NAME"
echo "----------------------------------------------------------"

# 1. Limpieza preventiva
echo " Limpiando contenedores previos..."
docker-compose down --remove-orphans

# 2. Construcción y arranque
echo "  Construyendo imágenes y levantando servicios..."
# Usamos --build para asegurar que los cambios en Python/Node se apliquen
docker-compose up --build -d

# 3. Verificación de estado
echo " Esperando a que los servicios estén listos..."
sleep 5

echo "----------------------------------------------------------"
echo " ESTADO DE LOS CONTENEDORES:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
echo "----------------------------------------------------------"

# 4. Pruebas de conectividad rápidas
echo " Validando Fake Management API (Puerto 8446)..."
curl -s -o /dev/null -w "%{http_code}" http://localhost:8446/v1/organizations/americamovil/apis
echo " <- HTTP Status"

echo " Validando Apigee Runtime (Puerto 8445)..."
curl -s -o /dev/null -w "%{http_code}" http://localhost:8445/hello
echo " <- HTTP Status"

echo "----------------------------------------------------------"
echo " ¡Todo listo! Ya puedes seguir desarrollando."
echo "Recuerda: Si el KVM sale vacío, dale 'Deploy' desde VS Code."
echo "----------------------------------------------------------"