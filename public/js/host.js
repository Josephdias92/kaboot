const optionsContainer = document.getElementById('options');
const addOptionButton = document.getElementById('add-option');
const pollForm = document.getElementById('poll-form');
const createButton = document.getElementById('create-button');
const updateButton = document.getElementById('update-button');
const startButton = document.getElementById('start-button');
const endButton = document.getElementById('end-button');
const gameCodeEl = document.getElementById('game-code');
const statusEl = document.getElementById('status');
const playerListEl = document.getElementById('player-list');
const resultsEl = document.getElementById('results');

let pollCreated = false;
let currentGameCode = null;
let currentOptions = [];
let pollActive = false;

const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws`);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'identify', role: 'host' }));
});

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case 'identified':
      break;
    case 'host:game_created':
      pollCreated = true;
      pollActive = false;
      currentGameCode = message.code;
      currentOptions = message.options;
      updateButton.disabled = true;
      startButton.disabled = false;
      endButton.disabled = true;
      createButton.disabled = true;
      gameCodeEl.textContent = message.code;
      statusEl.textContent = 'Share the code with players and press start when you are ready.';
      resultsEl.innerHTML = '';
      break;
    case 'host:poll_updated':
      statusEl.textContent = 'Poll updated. Players will see the new question when you start.';
      currentOptions = message.options;
      pollActive = false;
      startButton.disabled = false;
      endButton.disabled = true;
      updateButton.disabled = true;
      resultsEl.innerHTML = '';
      break;
    case 'host:poll_started':
      statusEl.textContent = 'Poll is live! Responses will update in real time.';
      pollActive = true;
      startButton.disabled = true;
      endButton.disabled = false;
      resultsEl.innerHTML = renderResults(currentOptions.map(() => 0));
      break;
    case 'host:poll_progress':
      if (Array.isArray(message.results)) {
        resultsEl.innerHTML = renderResults(message.results);
      }
      break;
    case 'host:poll_results':
      pollActive = false;
      startButton.disabled = false;
      endButton.disabled = true;
      if (Array.isArray(message.results)) {
        resultsEl.innerHTML = renderResults(message.results);
      }
      statusEl.textContent = 'Poll ended. You can update the question and run it again.';
      break;
    case 'host:players_updated':
      renderPlayers(message.players || []);
      break;
    case 'error':
      statusEl.textContent = message.message || 'An error occurred. Please try again.';
      break;
    default:
      break;
  }
});

ws.addEventListener('close', () => {
  statusEl.textContent = 'Connection lost. Refresh the page to reconnect.';
  startButton.disabled = true;
  endButton.disabled = true;
  createButton.disabled = true;
  updateButton.disabled = true;
});

function addOptionField(value = '') {
  if (optionsContainer.children.length >= 6) {
    return;
  }
  const row = document.createElement('div');
  row.className = 'option-row';
  const input = document.createElement('input');
  input.type = 'text';
  input.maxLength = 80;
  input.placeholder = `Option ${optionsContainer.children.length + 1}`;
  input.value = value;
  input.required = true;
  const removeButton = document.createElement('button');
  removeButton.type = 'button';
  removeButton.className = 'remove-button';
  removeButton.textContent = 'Remove';
  removeButton.addEventListener('click', () => {
    if (optionsContainer.children.length > 2) {
      optionsContainer.removeChild(row);
    }
    toggleRemoveButtons();
  });
  input.addEventListener('input', () => {
    if (pollCreated) {
      updateButton.disabled = false;
    }
  });
  row.append(input, removeButton);
  optionsContainer.append(row);
  toggleRemoveButtons();
}

function toggleRemoveButtons() {
  const rows = Array.from(optionsContainer.children);
  rows.forEach((row) => {
    const button = row.querySelector('button');
    if (button) {
      button.disabled = rows.length <= 2;
    }
  });
}

function getFormData() {
  const question = document.getElementById('question').value.trim();
  const options = Array.from(optionsContainer.querySelectorAll('input'))
    .map((input) => input.value.trim())
    .filter((value) => value.length > 0);
  return { question, options };
}

function renderPlayers(players) {
  playerListEl.innerHTML = '';
  if (!players.length) {
    playerListEl.innerHTML = '<li>No players yet. Share the code!</li>';
    return;
  }
  players.forEach((player) => {
    const li = document.createElement('li');
    const nameSpan = document.createElement('span');
    nameSpan.textContent = player.name;
    const badge = document.createElement('span');
    badge.className = 'badge';
    badge.textContent = player.hasVoted ? 'Voted' : 'Waiting';
    li.append(nameSpan, badge);
    playerListEl.append(li);
  });
}

function renderResults(counts) {
  const total = counts.reduce((sum, value) => sum + value, 0);
  return counts
    .map((count, index) => {
      const option = currentOptions[index] || `Option ${index + 1}`;
      const percent = total === 0 ? 0 : Math.round((count / total) * 100);
      return `
        <div class="result-row">
          <div class="result-header">
            <strong>${option}</strong>
            <span class="count">${count} vote${count === 1 ? '' : 's'} (${percent}%)</span>
          </div>
          <div class="progress">
            <div class="progress-bar" style="width: ${percent}%;"></div>
          </div>
        </div>
      `;
    })
    .join('');
}

addOptionButton.addEventListener('click', () => {
  addOptionField();
  if (pollCreated) {
    updateButton.disabled = false;
  }
});

pollForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const { question, options } = getFormData();
  if (options.length < 2) {
    statusEl.textContent = 'Please add at least two answer options.';
    return;
  }
  const payload = {
    type: pollCreated ? 'host:update_poll' : 'host:create_game',
    question,
    options,
  };
  ws.send(JSON.stringify(payload));
});

updateButton.addEventListener('click', () => {
  const { question, options } = getFormData();
  if (!pollCreated) {
    statusEl.textContent = 'Create a poll before saving changes.';
    return;
  }
  if (options.length < 2) {
    statusEl.textContent = 'Please add at least two answer options.';
    return;
  }
  ws.send(
    JSON.stringify({
      type: 'host:update_poll',
      question,
      options,
    })
  );
});

startButton.addEventListener('click', () => {
  if (!pollCreated) {
    statusEl.textContent = 'Create a poll before starting.';
    return;
  }
  ws.send(JSON.stringify({ type: 'host:start_poll' }));
});

endButton.addEventListener('click', () => {
  if (!pollActive) {
    statusEl.textContent = 'The poll is not currently running.';
    return;
  }
  ws.send(JSON.stringify({ type: 'host:end_poll' }));
});

['question', 'options'].forEach((field) => {
  if (field === 'question') {
    document.getElementById('question').addEventListener('input', () => {
      if (pollCreated) {
        updateButton.disabled = false;
      }
    });
  }
});

addOptionField();
addOptionField();
renderPlayers([]);
