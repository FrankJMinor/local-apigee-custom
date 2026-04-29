#!/bin/bash
# Script para iniciar la app de UI

cd "$(dirname "$0")/ui" || exit 1

# Instalar dependencias si no existe node_modules
if [ ! -d "node_modules" ]; then
  echo "Instalando dependencias..."
  npm install
fi

echo "Iniciando servidor de desarrollo..."
npm run dev
