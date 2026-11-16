# ProtoLab

[![CI/CD](https://github.com/ravexcode/protolab/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/ravexcode/protolab/actions/workflows/ci-cd.yml)

Editor de protoboards en el navegador: diseña en 2D, mira el resultado en 3D y guarda todo localmente.

**Demo:** https://ravexcode.github.io/protolab/

## Funciones

- **Editor 2D** (SVG): coloca, mueve, edita y borra componentes. Zoom con la rueda, arrastra el fondo para desplazarte.
- **Vista 3D** (Three.js): la misma protoboard renderizada en 3D, con órbita, zoom y sombras. Se puede ver sola o junto al editor.
- **Tamaño a elección**: Mini (170), Media (400), Completa (830), Doble (1660) o personalizado de 5 a 150 columnas, con rieles de alimentación en ambos lados, solo arriba o sin rieles, y varios colores.
- **91 componentes**: cables, baterías (con broche tipo HW o directas), resistencias (con código de colores según el valor), condensadores, LEDs (con el ánodo marcado), diodos, transistores, reguladores, circuitos integrados DIP, pulsadores, displays, sensores, y placas como Arduino Nano, ESP32, NodeMCU y Raspberry Pi Pico.
- **Varias protoboards**: crea, duplica, renombra y elimina. Exporta e importa en JSON.
- **Guardado local**: todo se guarda en `localStorage` del navegador. No hay servidor ni cuentas.
- **Probar el circuito**: conecta la batería y busca fallos (cortocircuitos, LED sin resistencia o al revés, resistencias que se calientan…). Los pulsadores se pulsan y se sueltan tocándolos (en 2D o en 3D). Los LED encendidos brillan, los fallos se listan en el botón del bicho y un corto acaba en una explosión exagerada a propósito.
- Deshacer / rehacer y lista de materiales automática.
- **Móvil y escritorio**: en el teléfono los paneles pasan a hojas inferiores, con zoom de pellizco. Tema claro y oscuro según el sistema.

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

3. En la web pulsa el botón **MCP** (icono de enchufe) y luego **Conectar**, y pídele algo al agente, por ejemplo: «Monta en ProtoLab un LED rojo con una resistencia de 220 Ω entre los rieles».

El agente dispone de estas herramientas: `list_components`, `list_boards`, `get_board`, `create_board`, `select_board`, `update_board`, `add_parts`, `update_part` y `remove_parts`. Cada cambio se puede deshacer con `Ctrl+Z`.

Seguridad: el puente solo escucha en `127.0.0.1`, solo acepta la página de ProtoLab (y páginas servidas desde `localhost`) y rechaza peticiones de navegador a su punto de acceso MCP. Si alojas tu propia copia, añade `--origin https://tu-dominio`. Opciones: `--port <n>`.

Navegadores: Chrome, Edge y Firefox. Si el navegador pide permiso para acceder a la red local, acéptalo. Safari bloquea la conexión a `127.0.0.1` desde una página HTTPS.

## Atajos

| Tecla | Acción |
| --- | --- |
| `V` | Seleccionar |
| `E` | Borrar |
| `W` / `R` / `L` | Cable / Resistencia / LED |
| `P` | Probar el circuito |
| `Espacio` | Pulsar o soltar el pulsador elegido |
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

## Pruebas y despliegue

```bash
npm test
```

Cada push y cada pull request ejecuta las pruebas en Node 18, 20 y 22 con GitHub Actions. Si pasan en `main`, el sitio se publica en GitHub Pages.

## Estructura

```
index.html        Interfaz
css/style.css     Estilos
js/catalog.js     Catálogo de componentes
js/board.js       Geometría de la protoboard
js/draw2d.js      Dibujo SVG de cada componente
js/editor2d.js    Editor 2D
js/sim.js         Prueba del circuito en continua
js/view3d.js      Vista 3D (Three.js)
js/app.js         Estado, guardado, paneles
js/ai.js          Enlace con agentes de IA
bridge/           Puente MCP local (Node.js)
tests/            Pruebas (node:test)
.github/          Integración y despliegue continuos
AGENTS.md         Guía del proyecto para agentes de IA (CLAUDE.md la importa)
.claude/ .agents/ Skills de diseño instaladas en el proyecto
vendor/           Three.js r160
```

## Contribuir

Las contribuciones son bienvenidas: lee [CONTRIBUTING.md](CONTRIBUTING.md). Si trabajas con un agente de IA, [AGENTS.md](AGENTS.md) recoge las reglas del proyecto y su sistema de diseño.

Gracias a [todas las personas que han contribuido](https://github.com/ravexcode/protolab/graphs/contributors).

## Licencia

[MIT con la condición Commons Clause](LICENSE). Puedes usar, copiar, modificar, hacer forks y redistribuir ProtoLab libremente, también dentro de proyectos comerciales. Lo único que no permite es vender ProtoLab en sí: ofrecer de pago un producto o servicio cuyo valor provenga total o sustancialmente de este software.

Three.js, las fuentes Barlow y las skills instaladas conservan sus propias licencias (MIT, OFL 1.1, Apache 2.0); el detalle está al final de `LICENSE`.
