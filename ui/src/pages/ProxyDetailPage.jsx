import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ProxyDetail from '../components/ProxyDetail';

const API_URL = '/v1/organizations/americamovil/apis';

function ProxyDetailPage() {
  const { proxyName } = useParams();
  const navigate = useNavigate();
  const [proxy, setProxy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(API_URL)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        // Buscar el proxy por nombre
        const proxies = data.aPIProxy || data;
        let found = null;
        proxies.forEach(proxy => {
          const name = proxy.name?.name || proxy.name || '-';
          if (name === proxyName) {
            // Tomar la última revisión
            const rev = (proxy.revision || [])[0] || {};
            found = {
              ...proxy,
              ...rev,
              name,
              revision: rev.name || '-',
              basePath: rev.configuration?.basePath || '-',
              lastModified: rev.lastModifiedAt || null,
            };
          }
        });
        setProxy(found);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [proxyName]);

  if (loading) return <div style={{ padding: 40 }}>Cargando...</div>;
  if (error) return <div style={{ padding: 40, color: '#ef4444' }}>Error: {error}</div>;
  if (!proxy) return <div style={{ padding: 40 }}>Proxy no encontrado</div>;

  return (
    <ProxyDetail proxy={proxy} onClose={() => navigate('/proxies')} />
  );
}

export default ProxyDetailPage;
