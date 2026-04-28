import zipfile
import os

# Nombre del proxy
proxy_name = "HelloWorld"

# Contenido de los archivos XML
proxy_xml = f"""<APIProxy name="{proxy_name}">
    <Basepaths>/hello</Basepaths>
    <ProxyEndpoints>
        <ProxyEndpoint>default</ProxyEndpoint>
    </ProxyEndpoints>
</APIProxy>"""

endpoint_xml = """<ProxyEndpoint name="default">
    <HTTPProxyConnection>
        <BasePath>/hello</BasePath>
    </HTTPProxyConnection>
    <RouteRule name="no-target"/>
</ProxyEndpoint>"""

# Crear estructura y comprimir
with zipfile.ZipFile(f'{proxy_name}.zip', 'w') as z:
    z.writestr(f'apiproxy/{proxy_name}.xml', proxy_xml)
    z.writestr('apiproxy/proxies/default.xml', endpoint_xml)

print(f"¡Listo! Se ha creado el archivo: {os.getcwd()}/{proxy_name}.zip")