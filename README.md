# Tetris

Implementación del clásico **Tetris** en JavaScript vanilla, usando HTML5 Canvas y CSS. Sin dependencias externas, sin frameworks, sin proceso de build: solo abrir y jugar.

![Tech](https://img.shields.io/badge/HTML5-Canvas-orange)
![Tech](https://img.shields.io/badge/CSS3-blueviolet)
![Tech](https://img.shields.io/badge/JavaScript-Vanilla-yellow)

---

## Tabla de contenidos

- [Tetris](#tetris)
  - [Tabla de contenidos](#tabla-de-contenidos)
  - [Qué hace el proyecto](#qué-hace-el-proyecto)
  - [Cómo ejecutar el juego](#cómo-ejecutar-el-juego)
    - [Opción 1: abrir el archivo directamente](#opción-1-abrir-el-archivo-directamente)
    - [Opción 2: servidor local (recomendado)](#opción-2-servidor-local-recomendado)
  - [Controles](#controles)
  - [Cómo funciona](#cómo-funciona)
    - [1. `index.html`](#1-indexhtml)
    - [2. `style.css`](#2-stylecss)
    - [3. `game.js`](#3-gamejs)
    - [Flujo del juego](#flujo-del-juego)
  - [Tecnologías](#tecnologías)
  - [Estructura del proyecto](#estructura-del-proyecto)
  - [Personalización](#personalización)
  - [Licencia](#licencia)

---

## Qué hace el proyecto

Es una versión jugable del Tetris clásico con todas las mecánicas que esperarías:

- Tablero de **10 × 20** celdas.
- Las **7 piezas estándar** (I, O, T, S, Z, J, L) con colores diferenciados.
- Piezas **no estándar** que aparecen ocasionalmente (10 % de las veces):
  - **Tuerca** (N): bloque 3×3 con el centro vacío. Al fijarse deja un hueco encerrado que no se puede rellenar hasta limpiar la fila superior.
  - Pentominós **`+`**, **`U`** e **`Y`** (5 bloques).
- **Combos y bonus**:
  - Limpiar líneas en fijados consecutivos multiplica los puntos (x2, x3, x4…).
  - **T-spin** (regla de las 3 esquinas): 400/800/1200/1600 puntos por 0/1/2/3 líneas.
  - **Back-to-Back**: dos limpiezas "difíciles" seguidas (Tetris o T-spin) dan ×1.5.
  - **Perfect Clear**: dejar el tablero vacío suma 3000 × nivel.
  - Textos flotantes, destello y sonidos (Web Audio) al encadenar. `M` silencia.
- **Power-ups**: cada 5 líneas aparece en NEXT un bloque 1×1 especial. Al fijarse no se queda en el tablero, aplica su efecto donde cae:
  - 💣 **Bomba**: destruye el área 3×3 alrededor.
  - ⚡ **Rayo**: limpia su fila y su columna completas.
  - 🎨 **Tinte**: todos los bloques del color sobre el que cae se vuelven comodines (arcoíris); en la siguiente limpieza de líneas desaparecen todos con bonus.
  - 🧲 **Gravedad**: compacta los huecos del tablero (cada bloque cae hasta el fondo de su columna).
  - ❄️ **Congelar**: la caída automática se detiene 5 s.
- **Habilidades cargables**: cada línea limpiada llena un 25 % de la barra de **energía**. Llena, `E` pausa y abre un menú (teclas `1`–`5` o clic):
  1. 👁️ **Ver siguientes 5 piezas** durante 20 s.
  2. 🔄 **Intercambiar** la pieza actual por otra al azar.
  3. 🐢 **Ralentizar** la caída ×2.5 durante 10 s.
  4. ↩️ **Deshacer** la última colocación (tablero, puntos, cola y hold).
  5. 📥 **Hold extra**: reactiva el hold si ya se usó en este turno.
- **Modos de juego** (menú al iniciar, botón *Cambiar modo* al terminar):
  - **Maratón**: el clásico sin fin.
  - **Sprint 40**: limpia 40 líneas en 2 minutos.
  - **Basura**: sobrevive 2 minutos; cada 10 s sube una fila de basura (con un hueco) desde abajo.
  - **Bloques fijos**: el tablero empieza con 6 filas pre-colocadas; elimínalas todas.
  - **Invisible**: limpia 20 líneas; las piezas desaparecen al tocar suelo (se revelan al terminar).
  - **Rotación inversa**: limpia 30 líneas; desde el nivel 3 la rotación pasa a antihoraria.
- Pieza **1×1** como recompensa: tras un Tetris (4 líneas) la siguiente pieza es un bloque suelto para tapar huecos.
- **Rotación** con _wall kicks_ básicos (pequeños desplazamientos para que la pieza pueda rotar pegada a la pared).
- **Soft drop** (bajada acelerada) y **hard drop** (caída instantánea).
- **Pieza fantasma** (_ghost piece_): muestra dónde aterrizará la pieza actual.
- **Vista previa** de la siguiente pieza.
- **Hold** (`C` o `Shift`): reserva la pieza actual o la intercambia con la guardada. Solo una vez por pieza; el slot se atenúa mientras está bloqueado.
- **Sistema de puntuación** clásico de Tetris (100 / 300 / 500 / 800 multiplicado por nivel).
- **Niveles** que aumentan cada 10 líneas y aceleran la caída.
- **Menú de pausa** (`P` o `Esc`) con opciones reales:
  - **Reanudar** la partida.
  - **Reiniciar** una partida nueva en el mismo modo, sin recargar la página.
  - **Ver controles**: lista de teclas desplegable dentro del menú.
  - **Nivel inicial** (1–15): se guarda en `localStorage` y se aplica a la próxima partida (en cualquier modo; en *Rotación inversa* un nivel ≥ 3 invierte la rotación desde el principio).
  - Mientras el menú está abierto se bloquean las teclas del juego (solo `P`/`Esc` y `M` siguen activas); al reanudar se ignoran las teclas que se quedaron pulsadas y hay un pequeño margen (150 ms) para evitar movimientos accidentales.
- **Game Over** con opción de reinicio o cambio de modo.

---

## Cómo ejecutar el juego

No hay nada que instalar ni compilar. Tienes dos opciones:

### Opción 1: abrir el archivo directamente

```bash
open index.html        # macOS
xdg-open index.html    # Linux
start index.html       # Windows
```

### Opción 2: servidor local (recomendado)

Cualquier servidor estático funciona. Algunos ejemplos:

```bash
# Con Python 3
python3 -m http.server 8000

# Con Node.js (npx)
npx serve .

# Con PHP
php -S localhost:8000
```

Después abre `http://localhost:8000` en el navegador.

---

## Controles

| Tecla     | Acción                            |
| --------- | --------------------------------- |
| `←` / `→` | Mover la pieza horizontalmente    |
| `↑` o `X` | Rotar la pieza en sentido horario |
| `↓`       | Soft drop (bajar más rápido)      |
| `Espacio` | Hard drop (caída instantánea)     |
| `C` / `Shift` | Reservar pieza (hold)        |
| `P` / `Esc` | Abrir / cerrar el menú de pausa |
| `M`       | Silenciar / activar sonido        |
| `E`       | Usar habilidad (energía llena)    |

---

## Cómo funciona

El juego se compone de tres archivos que cooperan:

### 1. `index.html`

Define la estructura visual:

- Un `<canvas id="board">` de **300 × 600** píxeles donde se renderiza el tablero.
- Un panel lateral con `SCORE`, `LINES`, `LEVEL`, vista de la siguiente pieza y la lista de controles.
- Un overlay de **pausa** (`#pause-menu`) con sus opciones y otro para **GAME OVER** (`#overlay`).

### 2. `style.css`

Aporta el aspecto visual con estética _dark / retro arcade_: fondo oscuro, tipografía monoespaciada para los marcadores y _backdrop blur_ en los overlays.

### 3. `game.js`

Contiene toda la lógica del juego. A grandes rasgos:

- **Modelo del tablero**: una matriz `ROWS × COLS` donde cada celda guarda `0` (vacía) o un índice de color (1–12) que identifica la pieza.
- **Piezas**: definidas como matrices cuadradas. Para rotar se calcula la transposición + reverso de filas (`rotateCW`).
- **Detección de colisiones** (`collide`): comprueba que ninguna celda de la pieza salga del tablero ni se solape con bloques ya fijados.
- **Wall kicks** (`tryRotate`): si la rotación choca, intenta desplazar la pieza ±1 y ±2 columnas antes de descartar el giro.
- **Game loop** (`loop`): basado en `requestAnimationFrame`, acumula el tiempo transcurrido y baja la pieza una fila cuando se supera `dropInterval`.
- **Limpieza de líneas** (`clearLines`): recorre el tablero de abajo hacia arriba; cada fila completa se elimina y se inserta una vacía en la cima.
- **Puntuación**: usa la tabla clásica `[0, 100, 300, 500, 800]` multiplicada por el nivel actual; el hard drop suma 2 puntos por celda recorrida y el soft drop 1 punto por fila.
- **Nivel y velocidad**: el nivel se calcula como `nivelInicial + floor(lines / 10)` (el nivel inicial se elige en el menú de pausa); la velocidad de caída es `max(100, 1000 − (level − 1) × 90)` milisegundos (`speedForLevel`).
- **Ghost piece** (`ghostY`): proyecta la posición final de la pieza actual hacia abajo y la dibuja con `globalAlpha = 0.2`.

### Flujo del juego

```
init()
  ├─ createBoard()                  → matriz vacía
  ├─ queue = [...]  (fillQueue)
  ├─ spawn()                        → saca la primera pieza de queue y la rellena
  └─ requestAnimationFrame(loop)
        ↓
   loop(timestamp)
     ├─ acumula dt
     ├─ si dt ≥ dropInterval → baja la pieza o llama a lockPiece()
     ├─ draw()  (grid + tablero + ghost + pieza actual)
     └─ requestAnimationFrame(loop)

   keydown → mover / rotar / soft-drop / hard-drop / menú de pausa
```

Cuando una pieza recién generada ya colisiona al aparecer (`spawn`), se dispara `endGame()` y se muestra el overlay de **Game Over**.

---

## Tecnologías

- **HTML5** — marcado y dos elementos `<canvas>` (tablero y vista previa).
- **CSS3** — _flexbox_, variables de color, `backdrop-filter` y `box-shadow`.
- **JavaScript (ES6+) vanilla** — `const`/`let`, _arrow functions_, _spread operator_, `Array.from`, _template literals_…
- **Canvas 2D API** — para todo el renderizado del juego.
- **`requestAnimationFrame`** — para el bucle de juego sincronizado con el navegador.

**Sin dependencias.** No hay `package.json`, ni bundler, ni transpilador.

---

## Estructura del proyecto

```
03-tetris/
├── index.html      # Estructura del DOM y canvas
├── style.css       # Estilos del juego (dark theme)
├── game.js         # Toda la lógica del Tetris (~300 líneas)
└── README.md
```

---

## Personalización

Algunos parámetros fáciles de tunear en `game.js`:

| Constante      | Significado                              | Por defecto           |
| -------------- | ---------------------------------------- | --------------------- |
| `COLS`         | Columnas del tablero                     | `10`                  |
| `ROWS`         | Filas del tablero                        | `20`                  |
| `BLOCK`        | Tamaño en píxeles de cada celda          | `30`                  |
| `COLORS`       | Paleta de colores por tipo de pieza      | 12 colores            |
| `LINE_SCORES`  | Puntos por 1, 2, 3 o 4 líneas eliminadas | `[0,100,300,500,800]` |
| `dropInterval` | Velocidad inicial de caída en ms         | `1000`                |
| `SPECIAL_CHANCE` | Probabilidad de pieza no estándar      | `0.1`                 |

> Si cambias `COLS`, `ROWS` o `BLOCK`, recuerda ajustar también `width` y `height` del `<canvas id="board">` en `index.html` para que coincida (`COLS × BLOCK` × `ROWS × BLOCK`).

---

## Licencia

Proyecto de uso libre con fines educativos y de práctica.
