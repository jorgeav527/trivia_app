const socket = io();

let roomCode = null;
let timerInterval = null;
let timeLimit = 20;

const screens = {
  setup: document.getElementById('setupScreen'),
  lobby: document.getElementById('lobbyScreen'),
  question: document.getElementById('questionScreen'),
  reveal: document.getElementById('revealScreen'),
  finished: document.getElementById('finishedScreen'),
};

function showScreen(name) {
  Object.values(screens).forEach(s => s.style.display = 'none');
  screens[name].style.display = 'block';
}

// ---------- Crear sala ----------
document.getElementById('createRoomBtn').addEventListener('click', async () => {
  const res = await fetch('/api/create_room', { method: 'POST' });
  const data = await res.json();
  roomCode = data.room_code;

  document.getElementById('quizTitle').textContent = data.title;
  document.getElementById('roomCodeDisplay').textContent = roomCode;
  document.getElementById('hostUrlText').textContent = window.location.origin + '/';

  socket.emit('join_as_host', { room_code: roomCode });
  showScreen('lobby');
});

document.getElementById('startGameBtn').addEventListener('click', () => {
  socket.emit('start_question', { room_code: roomCode });
});

document.getElementById('closeNowBtn').addEventListener('click', () => {
  socket.emit('close_question_now', { room_code: roomCode });
});

document.getElementById('nextQuestionBtn').addEventListener('click', () => {
  socket.emit('start_question', { room_code: roomCode });
});

// ---------- Eventos del servidor ----------
socket.on('players_update', (data) => {
  document.getElementById('playerCount').textContent = data.count;
  const list = document.getElementById('playersList');
  list.innerHTML = '';
  data.players.forEach(name => {
    const chip = document.createElement('div');
    chip.className = 'player-chip';
    chip.textContent = name;
    list.appendChild(chip);
  });
});

const OPT_CLASSES = ['opt-0', 'opt-1', 'opt-2', 'opt-3'];

socket.on('new_question', (q) => {
  showScreen('question');
  timeLimit = q.time_limit;

  document.getElementById('qIndex').textContent = q.index + 1;
  document.getElementById('qTotal').textContent = q.total;
  document.getElementById('questionText').textContent = q.question;
  document.getElementById('answeredCount').textContent = 0;
  document.getElementById('totalPlayers').textContent =
    document.getElementById('playerCount').textContent;

  const grid = document.getElementById('optionsGrid');
  grid.innerHTML = '';
  q.options.forEach((opt, i) => {
    const div = document.createElement('div');
    div.className = `opt-btn ${OPT_CLASSES[i]}`;
    div.textContent = opt;
    grid.appendChild(div);
  });

  document.getElementById('liveCounts').innerHTML = '';

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

socket.on('live_answers_update', (data) => {
  document.getElementById('answeredCount').textContent = data.answered_count;
  document.getElementById('totalPlayers').textContent = data.total_players;
  renderCounts('liveCounts', data.counts);
});

function renderCounts(containerId, counts) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  const max = Math.max(1, ...counts);
  counts.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <div class="bar-label">Opción ${i + 1}</div>
      <div class="bar-outer"><div class="bar-inner" style="width:${(c / max) * 100}%"></div></div>
      <div>${c}</div>
    `;
    container.appendChild(row);
  });
}

socket.on('reveal_answer', (data) => {
  clearInterval(timerInterval);
  showScreen('reveal');

  const optionsGrid = document.getElementById('optionsGrid');
  const revealGrid = document.getElementById('revealOptionsGrid');
  revealGrid.innerHTML = optionsGrid.innerHTML;

  const opts = revealGrid.querySelectorAll('.opt-btn');
  opts.forEach((el, i) => {
    el.classList.add(i === data.correct_option ? 'correct' : 'incorrect');
  });

  renderLeaderboard('leaderboardDiv', data.leaderboard);
});

socket.on('game_finished', (data) => {
  clearInterval(timerInterval);
  showScreen('finished');
  renderLeaderboard('finalLeaderboardDiv', data.leaderboard);
});

function renderLeaderboard(containerId, leaderboard) {
  const container = document.getElementById(containerId);
  container.innerHTML = '';
  leaderboard.forEach((p, i) => {
    const item = document.createElement('div');
    item.className = 'leaderboard-item';
    item.innerHTML = `<span>${i + 1}. ${p.name}</span><span>${p.score} pts</span>`;
    container.appendChild(item);
  });
}

socket.on('error_message', (data) => alert(data.message));
