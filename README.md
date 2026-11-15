# ProtoLab

Editor de protoboards en el navegador: diseña en 2D, mira el resultado en 3D y guarda todo localmente.

**Demo:** https://ravexcode.github.io/protolab/

## Funciones

- **Editor 2D** (SVG): coloca, mueve, edita y borra componentes. Zoom con la rueda, arrastra el fondo para desplazarte.
- **Vista 3D** (Three.js): la misma protoboard renderizada en 3D, con órbita, zoom y sombras. Se puede ver sola o junto al editor.
- **Tamaño a elección**: Mini (170), Media (400), Completa (830), Doble (1660) o personalizado de 5 a 150 columnas, con rieles de alimentación en ambos lados, solo arriba o sin rieles, y varios colores.
- **89 componentes**: cables, resistencias (con código de colores según el valor), condensadores, LEDs, diodos, transistores, reguladores, circuitos integrados DIP, pulsadores, displays, sensores, y placas como Arduino Nano, ESP32, NodeMCU y Raspberry Pi Pico.
- **Varias protoboards**: crea, duplica, renombra y elimina. Exporta e importa en JSON.
- **Guardado local**: todo se guarda en `localStorage` del navegador. No hay servidor ni cuentas.
- Deshacer / rehacer y lista de materiales automática.

## Conectar un agente de IA (solo PC)

Un agente de IA instalado en tu ordenador puede leer y editar las protoboards que tienes abiertas, en vivo. Funciona con Claude Code, Codex, OpenCode y cualquier otro cliente [MCP](https://modelcontextprotocol.io).

1. Inicia el puente local (Node.js 18 o superior, sin dependencias) y deja la terminal abierta:

   ```bash
   curl -fsSLO https://ravexcode.github.io/protolab/bridge/protolab-mcp.mjs && node protolab-mcp.mjs
   ```

2. Da acceso a tu agente, una sola vez:

   ```bash
   # Claude Code
   claude mcp add --transport http --scope user protolab http://127.0.0.1:7337/mcp
   # Codex
   codex mcp add protolab --url http://127.0.0.1:7337/mcp
   # OpenCode
   opencode mcp add protolab --url http://127.0.0.1:7337/mcp --global
   # Otros clientes, por stdio
   node /ruta/a/protolab-mcp.mjs --stdio
   ```

3. En la web pulsa **IA → Conectar** y pídele algo al agente, por ejemplo: «Monta en ProtoLab un LED rojo con una resistencia de 220 Ω entre los rieles».

El agente dispone de estas herramientas: `list_components`, `list_boards`, `get_board`, `create_board`, `select_board`, `update_board`, `add_parts`, `update_part` y `remove_parts`. Cada cambio se puede deshacer con `Ctrl+Z`.

Seguridad: el puente solo escucha en `127.0.0.1`, solo acepta la página de ProtoLab (y páginas servidas desde `localhost`) y rechaza peticiones de navegador a su punto de acceso MCP. Si alojas tu propia copia, añade `--origin https://tu-dominio`. Opciones: `--port <n>`.

Navegadores: Chrome, Edge y Firefox. Si el navegador pide permiso para acceder a la red local, acéptalo. Safari bloquea la conexión a `127.0.0.1` desde una página HTTPS.

## Atajos

| Tecla | Acción |
| --- | --- |
| `V` | Seleccionar |
| `E` | Borrar |
| `W` / `R` / `L` | Cable / Resistencia / LED |
| `Supr` | Eliminar el componente seleccionado |
| `Esc` | Cancelar |
| `Ctrl+Z` / `Ctrl+Y` | Deshacer / Rehacer |

## Uso local

Los módulos ES no cargan desde `file://`, así que hace falta un servidor estático:

```bash
python3 -m http.server 8000
# abre http://localhost:8000
```

No hay dependencias que instalar ni paso de compilación. Three.js está incluido en `vendor/`.

## Estructura

```
index.html        Interfaz
css/style.css     Estilos
js/catalog.js     Catálogo de componentes
js/board.js       Geometría de la protoboard
js/draw2d.js      Dibujo SVG de cada componente
js/editor2d.js    Editor 2D
js/view3d.js      Vista 3D (Three.js)
js/app.js         Estado, guardado, paneles
js/ai.js          Enlace con agentes de IA
bridge/           Puente MCP local (Node.js)
vendor/           Three.js r160
```
