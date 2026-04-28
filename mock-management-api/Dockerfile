FROM node:18-alpine
WORKDIR /app
RUN npm install express
COPY server.js .
EXPOSE 8446
CMD ["node", "server.js"]