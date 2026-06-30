# Trivia en Vivo (estilo Kahoot / Mentimeter)

Proyecto en **Python (Flask + Flask-SocketIO)** para crear una app de trivias con
respuestas y resultados en tiempo real, pensada para abrir en VS Code.

## Estructura del proyecto

```
trivia_app/
├── app.py                  # Servidor Flask + lógica del juego (Socket.IO)
├── requirements.txt
├── data/
│   └── preguntas.json      # Banco de preguntas (edítalo para tu propia trivia)
├── templates/
│   ├── index.html          # Pantalla de ingreso del jugador (código + nombre)
│   ├── host.html            # Panel del organizador (proyectar en pantalla grande)
│   └── player.html          # Pantalla del jugador durante la partida
└── static/
    ├── css/style.css
    └── js/
        ├── host.js
        └── player.js
```

## Cómo abrirlo en VS Code

1. Descomprime/copia la carpeta `trivia_app` en tu PC y ábrela en VS Code
   (`Archivo > Abrir carpeta...`).
2. Abre una terminal integrada en VS Code (`Ctrl + ñ` o `Terminal > Nueva terminal`).
3. (Opcional pero recomendado) Crea un entorno virtual:
   ```bash
   python -m venv venv
   venv\Scripts\activate        # Windows
   source venv/bin/activate     # Mac/Linux
   ```
4. Instala las dependencias:
   ```bash
   pip install -r requirements.txt
   ```
5. Ejecuta el servidor:
   ```bash
   python app.py
   ```
6. Verás en la terminal algo como:
   ```
   Servidor corriendo en http://localhost:5000
   Host (proyectar):   http://localhost:5000/host
   Jugadores entran:   http://localhost:5000/
   ```

## Cómo jugar

1. Abre `http://localhost:5000/host` en la PC que vas a proyectar y haz clic en
   **"Crear sala nueva"**. Aparecerá un código de 6 caracteres.
2. Los jugadores (desde su celular o PC, en la misma red) abren
   `http://localhost:5000/` y entran con ese código + su nombre.
   - Si quieres que se conecten desde otros celulares en la misma WiFi, usa la IP
     de tu PC en vez de `localhost`, por ejemplo `http://192.168.1.50:5000/`
     (puedes ver tu IP con `ipconfig` en Windows o `ifconfig`/`ip a` en Mac/Linux).
3. En el panel del host, verás la lista de jugadores conectados en vivo. Cuando
   estén listos, haz clic en **"Iniciar trivia"**.
4. Cada pregunta tiene un temporizador (20s por defecto). En el panel del host
   verás **en tiempo real**: cuántos ya respondieron y el conteo de respuestas
   por opción, sin mostrar aún cuál es la correcta (igual que Kahoot).
5. Al terminar el tiempo (o si el host pulsa "Cerrar pregunta ahora"), se revela
   la respuesta correcta, el tiempo que tardó cada jugador y el ranking
   actualizado, tanto en la pantalla del host como en la de cada jugador.
6. El host pulsa **"Siguiente pregunta"** hasta terminar el cuestionario; al
   final se muestra el ranking final (podio).

## Cómo personalizar las preguntas

Edita `data/preguntas.json`. Estructura de cada pregunta:

```json
{
  "question": "¿Cuál es la capital de Perú?",
  "options": ["Lima", "Cusco", "Arequipa", "Trujillo"],
  "correct": 0
}
```

`correct` es el índice (empezando en 0) de la opción correcta dentro del arreglo
`options`. También puedes ajustar `time_per_question` (segundos por pregunta) y
`title` (nombre de la trivia) en el mismo archivo.

## Cómo funciona el puntaje

Cada respuesta correcta otorga hasta **1000 puntos**, escalados según qué tan
rápido respondiste dentro del tiempo límite (responder rápido = más puntos),
igual que en Kahoot. Las respuestas incorrectas valen 0 puntos.

## Notas técnicas

- La comunicación en tiempo real (preguntas, conteos, ranking) se hace con
  **WebSockets** vía `Flask-SocketIO`, así que todos los clientes conectados
  ven los cambios instantáneamente sin recargar la página.
- El estado del juego vive en memoria (`GAMES` en `app.py`). Si reinicias el
  servidor, las salas activas se pierden — es un proyecto pensado para correr
  una sesión en vivo, no para producción con miles de usuarios.
- Puedes tener **varias salas simultáneas**: cada vez que el host crea una
  sala nueva, se genera un código distinto y el estado es independiente.

## Posibles mejoras (ideas para seguir construyendo)

- Guardar resultados históricos en una base de datos (SQLite).
- Subir preguntas desde una interfaz web en vez de editar el JSON a mano.
- Soportar imágenes en las preguntas.
- Exportar resultados a Excel/CSV al finalizar.
- Autenticación para que solo tú puedas crear salas como host.
