# Contribuir a ProtoLab

Gracias por tu interés. Se aceptan correcciones, componentes nuevos, mejoras de la interfaz y traducciones.

## Puesta en marcha

No hay dependencias que instalar ni paso de compilación. Solo necesitas Node.js 18 o superior para las pruebas y Python (o cualquier servidor estático) para abrir la web.

```bash
git clone https://github.com/ravexcode/protolab.git
cd protolab
npm start        # sirve la web en http://localhost:8000
npm test         # comprueba la sintaxis y ejecuta las pruebas
npm run bridge   # inicia el puente MCP para probar con un agente de IA
```

## Cómo enviar un cambio

1. Haz un fork y crea una rama a partir de `main`.
2. Haz cambios pequeños y centrados en una sola cosa.
3. Ejecuta `npm test`. Si cambias lógica de `js/board.js`, `js/catalog.js`, `js/ai.js` o `bridge/`, añade o actualiza una prueba en `tests/`.
4. Prueba la web a mano en escritorio y en ancho de móvil, en 2D y en 3D.
5. Abre un pull request explicando qué cambia y por qué. La integración continua debe pasar.

Al fusionarse en `main`, el sitio se publica solo en GitHub Pages.

## Añadir un componente

Los componentes se definen en `js/catalog.js`. Cada uno tiene un `kind`, que decide cómo se coloca, y un `shape`, que decide cómo se dibuja:

| `kind` | Colocación |
| --- | --- |
| `wire`, `axial`, `radial` | Dos pines libres, de agujero a agujero |
| `inline` | `n` pines en una misma fila |
| `dual` | Dos filas de `n` pines a ambos lados del canal central |

Si un `shape` existente te sirve (por ejemplo `ic`, `to92` o `module`), basta con una línea en el catálogo. Si necesitas una forma nueva, dibújala en `js/draw2d.js` (vista 2D) y en `js/view3d.js` (vista 3D). Las unidades son pasos de 2,54 mm.

## Estilo

- JavaScript moderno en módulos ES, sin dependencias ni empaquetador.
- Código y comentarios en inglés; textos de la interfaz en español.
- Todo texto introducido por el usuario se escapa con `esc()` antes de insertarlo en el HTML o el SVG.

## Errores e ideas

Abre un [issue](https://github.com/ravexcode/protolab/issues) con los pasos para reproducirlo, el navegador y, si puedes, la protoboard exportada en JSON.

## Licencia

Al contribuir aceptas que tu aportación se publique bajo la [licencia del proyecto](LICENSE): MIT con la condición Commons Clause.
