// server.js
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const app = express();

app.use(cors());

const APIGEE_EMULATOR = 'http://localhost:8998/v1/organizations/test-org';

app.get('/api/proxies', async (req, res) => {
    try {
        // 1. Obtenemos la lista de nombres
        const response = await axios.get(`${APIGEE_EMULATOR}/apis`);
        const proxyNames = response.data;

        // 2. (Opcional) Podrías mapear cada nombre para obtener su estado de deployment
        const detailedProxies = proxyNames.map(name => ({
            name: name,
            env: 'test', // El emulador suele usar 'test' por defecto
            status: 'deployed'
        }));

        res.json(detailedProxies);
    } catch (error) {
        res.status(500).json({ error: 'No se pudo conectar con el emulador' });
    }
});

app.listen(3001, () => console.log('Proxy UI Backend en puerto 3001'));