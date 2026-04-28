const express = require('express');
const fs = require('fs');
const app = express();

app.get('/v1/organizations/:org/apis', (req, res) => {
    try {
        // Usamos la ruta exacta que nos dio el comando find
        const path = '/workspace/src/main/apigee/environments/apigee-dev/deployments.json';
        const rawData = fs.readFileSync(path);
        const deployments = JSON.parse(rawData);
        
        console.log("Archivo encontrado y leído con éxito.");
        res.status(200).json(deployments.proxies || []);
    } catch (error) {
        console.error("Error al leer el archivo:", error.message);
        res.status(500).json({ error: "No se pudo leer el archivo de despliegues" });
    }
});

app.listen(8446, () => {
    console.log('Fake API corriendo en el puerto 8446');
});