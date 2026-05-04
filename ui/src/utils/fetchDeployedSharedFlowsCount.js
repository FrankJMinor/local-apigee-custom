// Utilidad para obtener el total de shared flows desplegados desde la API
export async function fetchDeployedSharedFlowsCount() {
  try {
    const res = await fetch('http://localhost:8446/v1/sharedflows/deployed')
    if (!res.ok) throw new Error('Error al obtener shared flows')
    const data = await res.json()
    return data.total || 0
  } catch (e) {
    return 0
  }
}

// Utilidad para obtener la lista de shared flows desplegados desde la API
export async function fetchDeployedSharedFlowsList() {
  try {
    const res = await fetch('http://localhost:8446/v1/sharedflows/deployed')
    if (!res.ok) throw new Error('Error al obtener shared flows')
    const data = await res.json()
    return data.shared_flows || []
  } catch (e) {
    return []
  }
}
