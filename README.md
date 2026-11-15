# ProtoLab

Editor de protoboards en el navegador: diseña en 2D, mira el resultado en 3D y guarda todo localmente.

**Demo:** https://ravexcode.github.io/protolab/

## Funciones

- **Editor 2D** (SVG): coloca, mueve, edita y borra componentes. Zoom con la rueda, arrastra el fondo para desplazarte.
- **Vista 3D** (Three.js): la misma protoboard renderizada en 3D, con órbita, zoom y sombras. Se puede ver sola o junto al editor.
- **Tamaño a elección**: Mini (170), Media (400), Completa (830), Doble (1660) o personalizado de 5 a 150 columnas, con rieles de alimentación en ambos lados, solo arriba o sin rieles, y varios colores.
- **Más de 90 componentes**: cables, resistencias (con código de colores según el valor), condensadores, LEDs, diodos, transistores, reguladores, circuitos integrados DIP, pulsadores, displays, sensores, y placas como Arduino Nano, ESP32, NodeMCU y Raspberry Pi Pico.
- **Varias protoboards**: crea, duplica, renombra y elimina. Exporta e importa en JSON.
- **Guardado local**: todo se guarda en `localStorage` del navegador. No hay servidor ni cuentas.
- Deshacer / rehacer y lista de materiales automática.

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
vendor/           Three.js r160
```
