const socket = io();
const playerName = sessionStorage.getItem('playerName') || 'Jugador';

let timerInterval = null;
let hasAnswered = false;

const screens = {
  waiting: document.getElementById('waitingScreen'),
  question: document.getElementById('questionScreen'),
  result: document.getElementById('resultScreen'),
  finished: document.getElementById('finishedScreen'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.style.display = 'none');
  screens[name].style.display = 'block';
}

socket.on('connect', () => {
  socket.emit('join_as_player', { room_code: ROOM_CODE, name: playerName });
});

socket.on('joined_ok', (data) => {
  document.getElementById('waitingTitle').textContent = `¡Listo, ${playerName}! 🎯`;
  document.getElementById('scoreBadge').style.display = 'block';
});

socket.on('error_message', (data) => {
  alert(data.message);
  window.location.href = '/';
});

const OPT_CLASSES = ['opt-0', 'opt-1', 'opt-2', 'opt-3'];

socket.on('new_question', (q) => {
  hasAnswered = false;
  showScreen('question');

  document.getElementById('qIndex').textContent = q.index + 1;
  document.getElementById('qTotal').textContent = q.total;
  document.getElementById('questionText').textContent = q.question;
  document.getElementById('answeredMsg').style.display = 'none';

  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = '';
  q.options.forEach((opt, i) => {
    const btn = document.createElement('button');
    btn.className = `opt-btn ${OPT_CLASSES[i]}`;
    btn.textContent = opt;
    btn.style.width = '100%';
    btn.addEventListener('click', () => sendAnswer(i, grid));
    grid.appendChild(btn);
  });

  startTimerBar(q.time_limit);
});

function startTimerBar(seconds) {
  const bar = document.getElementById('timerBar');
  bar.style.width = '100%';
  clearInterval(timerInterval);

  const start = Date.now();
  timerInterval = setInterval(() => {
    const elapsed = (Date.now() - start) / 1000;
    const pct = Math.max(0, 100 * (1 - elapsed / seconds));
    bar.style.width = pct + '%';
    if (elapsed >= seconds) clearInterval(timerInterval);
  }, 100);
}

function sendAnswer(optionIndex, grid) {
  if (hasAnswered) return;
  hasAnswered = true;

  socket.emit('submit_answer', { room_code: ROOM_CODE, option: optionIndex });

  grid.querySelectorAll('.opt-btn').forEach(b => b.disabled = true);
  document.getElementById('answeredMsg').style.display = 'block';
}

function renderPersonalMessage(containerId, status) {
  const box = document.getElementById(containerId);
  if (!box || !status) return;

  if (status.in_top5) {
    box.className = 'personal-message podium';
    box.innerHTML = `🏆 ¡Estás en el podio! Puesto #${status.rank} con ${status.score} puntos`;
  } else {
    let msg = `Puesto actual: #${status.rank} de ${status.total_players} · ${status.score} puntos`;
    if (typeof status.points_to_next === 'number' && status.points_to_next > 0) {
      msg += ` · A ${status.points_to_next} puntos de superar al siguiente puesto`;
    }
    box.className = 'personal-message';
    box.innerHTML = msg;
  }
  box.style.display = 'block';
}

// Guarda el último estado personal recibido para poder pintarlo en
// cuanto la pantalla correspondiente (resultado o fin de juego) se muestre.
let lastStatus = null;

socket.on('your_status_update', (data) => {
  lastStatus = data;
  document.getElementById('scoreBadge').textContent = `${data.score} pts`;
  renderPersonalMessage('resultPersonalMsg', data);
  renderPersonalMessage('finalPersonalMsg', data);
});

socket.on('reveal_answer', (data) => {
  clearInterval(timerInterval);
  showScreen('result');

  const myResult = data.results_per_player.find(r => r.name === playerName);
  if (myResult) {
    document.getElementById('resultTitle').textContent = myResult.correct
      ? '✅ ¡Correcto!'
      : '❌ Incorrecto';
    document.getElementById('resultPoints').textContent =
      `Tiempo de respuesta: ${myResult.time_taken}s`;
  } else {
    document.getElementById('resultTitle').textContent = '⏱️ No respondiste a tiempo';
    document.getElementById('resultPoints').textContent = '';
  }

  const explanationBox = document.getElementById('explanationBox');
  if (data.explanation && data.explanation.trim()) {
    explanationBox.textContent = `💡 ${data.explanation}`;
    explanationBox.style.display = 'block';
  } else {
    explanationBox.style.display = 'none';
  }

  renderPersonalMessage('resultPersonalMsg', lastStatus);
  document.getElementById('leaderboardTitle').textContent =
    data.total_players > 5 ? '🏆 Top 5' : '🏆 Ranking';
  renderLeaderboard('leaderboardDiv', data.leaderboard);
});

socket.on('game_finished', (data) => {
  clearInterval(timerInterval);
  showScreen('finished');
  renderPersonalMessage('finalPersonalMsg', lastStatus);
  document.getElementById('finalLeaderboardTitle').textContent =
    data.total_players > 5 ? '🏆 Top 5 final' : '🏆 Ranking final';
  renderLeaderboard('finalLeaderboardDiv', data.leaderboard);
});

function renderLeaderboard(containerId, leaderboard) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  leaderboard.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    const mine = p.name === playerName ? ' (tú)' : '';
    item.innerHTML = `<span>${i + 1}. ${p.name}${mine}</span><span>${p.score} pts</span>`;
    container.appendChild(item);
  });
}
