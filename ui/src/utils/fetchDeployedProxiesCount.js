// Utilidad para obtener el total de proxies desplegados desde la API
export async function fetchDeployedProxiesCount() {
  try {
    const res = await fetch('http://localhost:8446/v1/proxies/deployed')
    if (!res.ok) throw new Error('Error al obtener proxies')
    const data = await res.json()
    return data.total || 0
  } catch (e) {
    return 0
  }
}
