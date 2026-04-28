# Usamos una imagen ligera de Python
FROM python:3.11-slim

WORKDIR /app

# Instalamos Flask directamente (no necesitamos requirements.txt para algo tan pequeño)
RUN pip install --no-cache-dir flask

# Copiamos el nuevo script de Python
COPY app.py .

# Puerto que definimos en el docker-compose
EXPOSE 8446

# Ejecutamos la aplicación
CMD ["python", "app.py"]