import os
import re

class ApigeeTemplateService:
    def __init__(self):
        # Subimos un nivel desde APIs para llegar a la raíz del backend y luego a templates
        self.base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'templates')

    def _clean_snippet(self, body):
        """Limpia los placeholders de VS Code como ${1:name}."""
        full_text = "\n".join(body) if isinstance(body, list) else body
        return re.sub(r'\${\d+:?([^}]*)}', r'\1', full_text)

    def generate_menu_json(self):
        menu = {}
        
        if not os.path.exists(self.base_path):
            return {"error": "Path no encontrado"}

        # Iterar sobre las carpetas dentro de templates (grupos)
        for group_name in os.listdir(self.base_path):
            group_path = os.path.join(self.base_path, group_name)
            
            # Asegurarse de que sea un directorio
            if os.path.isdir(group_path):
                policies = []
                
                # Iterar sobre los archivos XML en el grupo
                for filename in os.listdir(group_path):
                    if filename.endswith(".xml"):
                        policy_name = filename.replace(".xml", "")
                        
                        with open(os.path.join(group_path, filename), 'r', encoding='utf-8') as f:
                            xml_content = f.read()
                            
                        policies.append({
                            "name": policy_name,
                            "xml_template": xml_content,
                            "type": group_name
                        })
                
                # Solo agregar el grupo si tiene políticas
                if policies:
                    menu[group_name] = policies
                    
        return menu