FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
EXPOSE 5173
# Ejecutamos en modo host para que Docker permita la conexión externa
CMD ["npm", "run", "dev", "--", "--host"]