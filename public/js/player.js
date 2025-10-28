const joinForm = document.getElementById('join-form');
const joinCodeInput = document.getElementById('join-code');
const displayNameInput = document.getElementById('display-name');
const statusEl = document.getElementById('player-status');
const questionContainer = document.getElementById('question-container');
const questionEl = document.getElementById('current-question');
const answersEl = document.getElementById('answer-options');
const resultsEl = document.getElementById('results');

let joined = false;
let hasVoted = false;
let currentOptions = [];
let selectedChoice = null;

const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProtocol}://${window.location.host}/ws`);

ws.addEventListener('open', () => {
  ws.send(JSON.stringify({ type: 'identify', role: 'player' }));
});

ws.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  switch (message.type) {
    case 'identified':
      break;
    case 'player:joined':
      joined = true;
      statusEl.textContent = 'You joined the lobby. Waiting for the host to start the poll.';
      joinForm.classList.add('hidden');
      if (message.question && Array.isArray(message.options)) {
        showQuestion(message.question, message.options);
      }
      break;
    case 'poll:start':
      showQuestion(message.question, message.options || []);
      statusEl.textContent = 'Pick your answer! You can only vote once.';
      break;
    case 'player:voted':
      hasVoted = true;
      selectedChoice = message.choiceIndex;
      highlightSelection();
      disableAnswerButtons();
      statusEl.textContent = 'Thanks for voting! Waiting for results…';
      break;
    case 'poll:results':
      showResults(message.question, message.options, message.results);
      hasVoted = false;
      selectedChoice = null;
      break;
    case 'poll:reset':
      resetPoll(message.message);
      break;
    case 'error':
      statusEl.textContent = message.message || 'Something went wrong. Please try again.';
      break;
    case 'game:ended':
      statusEl.textContent = message.message || 'The host has ended the session.';
      questionContainer.classList.add('hidden');
      resultsEl.innerHTML = '';
      break;
    default:
      break;
  }
});

ws.addEventListener('close', () => {
  statusEl.textContent = 'Connection lost. Refresh the page to reconnect.';
});

joinForm.addEventListener('submit', (event) => {
  event.preventDefault();
  if (joined) {
    return;
  }
  const code = joinCodeInput.value.trim();
  const name = displayNameInput.value.trim();
  if (!code || !name) {
    statusEl.textContent = 'Enter a game code and display name to join.';
    return;
  }
  ws.send(
    JSON.stringify({
      type: 'player:join',
      code,
      name,
    })
  );
});

function showQuestion(question, options) {
  if (!question || !Array.isArray(options)) {
    return;
  }
  questionEl.textContent = question;
  currentOptions = options;
  hasVoted = false;
  selectedChoice = null;
  renderAnswerButtons();
  questionContainer.classList.remove('hidden');
  resultsEl.innerHTML = '';
}

function renderAnswerButtons() {
  answersEl.innerHTML = '';
  currentOptions.forEach((option, index) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'answer-button';
    button.textContent = option;
    button.addEventListener('click', () => {
      if (hasVoted) {
        return;
      }
      ws.send(
        JSON.stringify({
          type: 'player:vote',
          choiceIndex: index,
        })
      );
    });
    answersEl.append(button);
  });
}

function highlightSelection() {
  const buttons = answersEl.querySelectorAll('button');
  buttons.forEach((button, index) => {
    if (index === selectedChoice) {
      button.classList.add('selected');
    } else {
      button.classList.remove('selected');
    }
  });
}

function disableAnswerButtons() {
  const buttons = answersEl.querySelectorAll('button');
  buttons.forEach((button) => {
    button.disabled = true;
  });
}

function showResults(question, options = [], results = []) {
  questionEl.textContent = question || questionEl.textContent;
  questionContainer.classList.remove('hidden');
  const counts = Array.isArray(results) ? results : [];
  const total = counts.reduce((sum, value) => sum + value, 0);
  resultsEl.innerHTML = counts
    .map((count, index) => {
      const label = options[index] || `Option ${index + 1}`;
      const percent = total === 0 ? 0 : Math.round((count / total) * 100);
      return `
        <div class="result-row">
          <div class="result-header">
            <strong>${label}</strong>
            <span class="count">${count} vote${count === 1 ? '' : 's'} (${percent}%)</span>
          </div>
          <div class="progress">
            <div class="progress-bar" style="width: ${percent}%;"></div>
          </div>
        </div>
      `;
    })
    .join('');
  answersEl.innerHTML = '';
  statusEl.textContent = 'Results are in! Stay tuned for the next poll.';
}

function resetPoll(message) {
  hasVoted = false;
  selectedChoice = null;
  answersEl.innerHTML = '';
  if (message) {
    statusEl.textContent = message;
  } else {
    statusEl.textContent = 'Waiting for the next question…';
  }
  questionContainer.classList.add('hidden');
  resultsEl.innerHTML = '';
}
