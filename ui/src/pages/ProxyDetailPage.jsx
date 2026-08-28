import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import ProxyDetail from '../components/ProxyDetail';

const API_URL = '/v1/organizations/americamovil/apis';

function ProxyDetailPage() {
  const { proxyName } = useParams();
  const navigate = useNavigate();
  const [proxy, setProxy] = useState(null);
  const [fileTree, setFileTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);

    // Fetch Proxy List to get general info (optional, but keep for compatibility)
    const fetchGeneral = fetch(API_URL)
      .then(res => res.json())
      .then(data => {
        const proxies = data.aPIProxy || data;
        return proxies.find(p => (p.name?.name || p.name) === proxyName);
      });

    // Fetch File Tree from the new local API
    const fetchFiles = fetch(`http://localhost:8446/v1/proxies/${proxyName}/files`)
      .then(res => {
        if (!res.ok) throw new Error(`Error al cargar archivos: ${res.status}`);
        return res.json();
      });

    Promise.all([fetchGeneral, fetchFiles])
      .then(([foundProxy, fileData]) => {
        // El emulador materializa cada despliegue como contrato numerado; esa
        // revisión (la que devuelve /files) manda sobre la de la lista.
        const emulatorRevision = fileData.revision;

        if (foundProxy) {
          const rev = (foundProxy.revision || [])[0] || {};
          setProxy({
            ...foundProxy,
            ...rev,
            name: proxyName,
            revision: emulatorRevision || rev.name || '1',
          });
        } else {
          // Fallback if not found in list but files exist
          setProxy({ name: proxyName, revision: emulatorRevision || '1' });
        }
        setFileTree(fileData.files);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [proxyName]);

  const refreshFiles = () => {
    fetch(`/v1/proxies/${proxyName}/files`)
      .then(res => res.json())
      .then(data => {
        setFileTree(data.files);
        if (data.revision) {
          setProxy(prev => (prev ? { ...prev, revision: String(data.revision) } : prev));
        }
      })
      .catch(e => console.error("Error refreshing files:", e));
  };

  if (loading) return <div style={{ padding: 40 }}>Cargando datos del proxy...</div>;
  if (error) return <div style={{ padding: 40, color: '#ef4444' }}>Error: {error}</div>;

  return (
    <ProxyDetail 
      proxy={proxy} 
      fileTree={fileTree} 
      onClose={() => navigate('/proxies')} 
      refreshFileTree={refreshFiles}
    />
  );
}

export default ProxyDetailPage;
