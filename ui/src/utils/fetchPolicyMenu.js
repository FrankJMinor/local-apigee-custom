// Utilidad para obtener el menú dinámico de políticas desde Django
export async function fetchPolicyMenu() {
  try {
    const res = await fetch('http://localhost:8446/v1/policies/menu');
    if (!res.ok) throw new Error('Error al obtener el catálogo de políticas');
    return await res.json();
  } catch (e) {
    console.error("Error fetching policy menu:", e);
    return null;
  }
}