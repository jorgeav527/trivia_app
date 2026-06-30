"""
App de trivia en tiempo real (estilo Kahoot / Mentimeter)
----------------------------------------------------------
- El "host" crea una sala y controla el avance de las preguntas.
- Los "jugadores" se unen con un código de sala desde su celular/PC.
- Las respuestas, tiempos y el ranking se actualizan en tiempo real
  vía WebSockets (Flask-SocketIO) para todos los conectados.

Cómo correrlo:
    pip install -r requirements.txt
    python app.py

Luego abre:
    http://localhost:5000/host      -> pantalla del organizador (proyectar)
    http://localhost:5000/          -> pantalla para que los jugadores se unan
"""

import json
import random
import string
import time
from pathlib import Path

from flask import Flask, render_template, request, jsonify
from flask_socketio import SocketIO, join_room, emit

BASE_DIR = Path(__file__).resolve().parent

app = Flask(__name__)
app.config["SECRET_KEY"] = "cambia-esto-por-algo-secreto"
socketio = SocketIO(app, cors_allowed_origins="*")

# ----------------------------------------------------------------------
# Estado del juego en memoria (suficiente para una sola sala o varias
# salas concurrentes, identificadas por un código de 6 caracteres).
# ----------------------------------------------------------------------

GAMES = {}  # { room_code: GameState }


def cargar_preguntas():
    with open(BASE_DIR / "data" / "preguntas.json", encoding="utf-8") as f:
        return json.load(f)


class GameState:
    def __init__(self, room_code, quiz_data):
        self.room_code = room_code
        self.title = quiz_data["title"]
        self.time_per_question = quiz_data.get("time_per_question", 20)
        self.questions = quiz_data["questions"]
        self.current_index = -1          # -1 = aún no empezó
        self.question_start_time = None
        self.players = {}                # sid -> {"name": str, "score": int}
        self.answers = {}                # sid -> {"option": int, "time_taken": float}
        self.status = "lobby"            # lobby | question | reveal | finished

    # -------- helpers --------
    def current_question(self):
        if 0 <= self.current_index < len(self.questions):
            return self.questions[self.current_index]
        return None

    def public_question_payload(self):
        q = self.current_question()
        if not q:
            return None
        return {
            "index": self.current_index,
            "total": len(self.questions),
            "question": q["question"],
            "options": q["options"],
            "time_limit": self.time_per_question,
        }

    def leaderboard(self):
        ranking = sorted(
            self.players.values(), key=lambda p: p["score"], reverse=True
        )
        return [{"name": p["name"], "score": p["score"]} for p in ranking]

    def answer_stats(self):
        """Conteo de respuestas por opción para la pregunta actual."""
        q = self.current_question()
        if not q:
            return []
        counts = [0] * len(q["options"])
        for a in self.answers.values():
            if 0 <= a["option"] < len(counts):
                counts[a["option"]] += 1
        return counts


def generar_codigo_sala():
    while True:
        code = "".join(random.choices(string.ascii_uppercase + string.digits, k=6))
        if code not in GAMES:
            return code


# ----------------------------------------------------------------------
# Rutas HTTP
# ----------------------------------------------------------------------

@app.route("/")
def index():
    """Pantalla donde el jugador ingresa el código de sala y su nombre."""
    return render_template("index.html")


@app.route("/host")
def host():
    """Pantalla del organizador: crea la sala y controla el avance."""
    return render_template("host.html")


@app.route("/play/<room_code>")
def play(room_code):
    """Pantalla del jugador ya dentro de una sala."""
    return render_template("player.html", room_code=room_code.upper())


@app.route("/api/create_room", methods=["POST"])
def api_create_room():
    quiz_data = cargar_preguntas()
    room_code = generar_codigo_sala()
    GAMES[room_code] = GameState(room_code, quiz_data)
    return jsonify({"room_code": room_code, "title": quiz_data["title"]})


@app.route("/api/check_room/<room_code>")
def api_check_room(room_code):
    room_code = room_code.upper()
    exists = room_code in GAMES
    return jsonify({"exists": exists})


# ----------------------------------------------------------------------
# Eventos de Socket.IO
# ----------------------------------------------------------------------

@socketio.on("join_as_player")
def on_join_as_player(data):
    room_code = data.get("room_code", "").upper().strip()
    name = data.get("name", "").strip()[:20] or "Jugador"

    game = GAMES.get(room_code)
    if not game:
        emit("error_message", {"message": "La sala no existe."})
        return

    join_room(room_code)
    game.players[request.sid] = {"name": name, "score": 0}

    emit("joined_ok", {"room_code": room_code, "title": game.title})

    # Avisar al host y a todos en la sala cuántos jugadores hay ahora
    emit(
        "players_update",
        {"players": [p["name"] for p in game.players.values()], "count": len(game.players)},
        room=room_code,
    )


@socketio.on("join_as_host")
def on_join_as_host(data):
    room_code = data.get("room_code", "").upper().strip()
    game = GAMES.get(room_code)
    if not game:
        emit("error_message", {"message": "La sala no existe."})
        return
    join_room(room_code)
    emit(
        "players_update",
        {"players": [p["name"] for p in game.players.values()], "count": len(game.players)},
    )


@socketio.on("start_question")
def on_start_question(data):
    """El host pide avanzar a la siguiente pregunta."""
    room_code = data.get("room_code", "").upper().strip()
    game = GAMES.get(room_code)
    if not game:
        return

    game.current_index += 1
    game.answers = {}

    q = game.current_question()
    if q is None:
        # No hay más preguntas -> fin del juego
        game.status = "finished"
        emit("game_finished", {"leaderboard": game.leaderboard()}, room=room_code)
        return

    game.status = "question"
    game.question_start_time = time.time()

    emit("new_question", game.public_question_payload(), room=room_code)

    # Disparamos el cierre automático de la pregunta cuando se acaba el tiempo
    socketio.start_background_task(auto_close_question, room_code, game.current_index)


def auto_close_question(room_code, index_at_start):
    game = GAMES.get(room_code)
    if not game:
        return
    socketio.sleep(game.time_per_question)
    # Solo cerrar si seguimos en la misma pregunta (el host no la cerró ya)
    if game.current_index == index_at_start and game.status == "question":
        close_question(room_code)


@socketio.on("submit_answer")
def on_submit_answer(data):
    room_code = data.get("room_code", "").upper().strip()
    option = data.get("option")

    game = GAMES.get(room_code)
    if not game or game.status != "question":
        return

    sid = request.sid
    if sid not in game.players or sid in game.answers:
        return  # jugador no registrado o ya respondió

    elapsed = time.time() - game.question_start_time
    time_left_ratio = max(0.0, 1 - (elapsed / game.time_per_question))

    game.answers[sid] = {"option": option, "time_taken": round(elapsed, 2)}

    # Puntaje: 1000 puntos máximo, escalado por velocidad; 0 si falla
    q = game.current_question()
    is_correct = option == q["correct"]
    points = int(1000 * time_left_ratio) if is_correct else 0
    game.players[sid]["score"] += points

    emit("answer_received", {"option": option})  # confirmación al jugador

    # Actualizar al host en vivo: cuántos han respondido y el conteo por opción
    emit(
        "live_answers_update",
        {
            "answered_count": len(game.answers),
            "total_players": len(game.players),
            "counts": game.answer_stats(),
        },
        room=room_code,
    )


@socketio.on("close_question_now")
def on_close_question_now(data):
    """El host fuerza el cierre de la pregunta antes de que acabe el tiempo."""
    room_code = data.get("room_code", "").upper().strip()
    close_question(room_code)


def close_question(room_code):
    game = GAMES.get(room_code)
    if not game or game.status != "question":
        return
    game.status = "reveal"

    q = game.current_question()
    results_per_player = []
    for sid, ans in game.answers.items():
        results_per_player.append(
            {
                "name": game.players[sid]["name"],
                "option": ans["option"],
                "time_taken": ans["time_taken"],
                "correct": ans["option"] == q["correct"],
            }
        )

    socketio.emit(
        "reveal_answer",
        {
            "correct_option": q["correct"],
            "counts": game.answer_stats(),
            "results_per_player": results_per_player,
            "leaderboard": game.leaderboard(),
        },
        room=room_code,
    )

    # Mandar a cada jugador su puntaje individual actualizado
    for sid in game.players:
        socketio.emit(
            "your_score_update",
            {"score": game.players[sid]["score"]},
            room=sid,
        )


@socketio.on("disconnect")
def on_disconnect():
    sid = request.sid
    for game in GAMES.values():
        if sid in game.players:
            del game.players[sid]
            emit(
                "players_update",
                {
                    "players": [p["name"] for p in game.players.values()],
                    "count": len(game.players),
                },
                room=game.room_code,
            )
            break


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_DEBUG", "1") == "1"
    print(f"Servidor corriendo en http://localhost:{port}")
    print(f"Host (proyectar):   http://localhost:{port}/host")
    print(f"Jugadores entran:   http://localhost:{port}/")
    socketio.run(app, host="0.0.0.0", port=port, debug=debug)
