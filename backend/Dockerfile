# Usamos una imagen ligera de Python
FROM python:3.11-slim

WORKDIR /app

# 1. Instalamos dependencias reales desde tu archivo
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 2. CLAVE: Copiamos TODO el contenido de la carpeta backend al contenedor
COPY . .

EXPOSE 8446

# 3. Ahora manage.py sí existirá en /app/manage.py
CMD ["python", "manage.py", "runserver", "0.0.0.0:8446"]