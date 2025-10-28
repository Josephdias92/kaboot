const { useState, useEffect, useRef, useCallback } = React;

function useKabootSocket(role, onMessage) {
  const socketRef = useRef(null);
  const messageHandlerRef = useRef(onMessage);
  const [connectionState, setConnectionState] = useState('connecting');

  useEffect(() => {
    messageHandlerRef.current = onMessage;
  }, [onMessage]);

  useEffect(() => {
    setConnectionState('connecting');
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const socket = new WebSocket(`${protocol}://${window.location.host}/ws`);
    socketRef.current = socket;

    const handleOpen = () => {
      setConnectionState('open');
      socket.send(
        JSON.stringify({
          type: 'identify',
          role,
        })
      );
    };

    const handleMessage = (event) => {
      try {
        const payload = JSON.parse(event.data);
        if (messageHandlerRef.current) {
          messageHandlerRef.current(payload);
        }
      } catch (error) {
        console.error('Invalid message received', error);
      }
    };

    const handleClose = () => {
      setConnectionState('closed');
    };

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', handleClose);

    return () => {
      socket.removeEventListener('open', handleOpen);
      socket.removeEventListener('message', handleMessage);
      socket.removeEventListener('close', handleClose);
      socket.close();
    };
  }, [role]);

  const sendMessage = useCallback((payload) => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(payload));
    }
  }, []);

  return { sendMessage, connectionState };
}

function useHashRoute() {
  const getRoute = () => {
    const hash = window.location.hash.replace(/^#\/?/, '');
    if (hash.startsWith('host')) {
      return 'host';
    }
    if (hash.startsWith('player')) {
      return 'player';
    }
    return 'landing';
  };

  const [route, setRoute] = useState(getRoute);

  useEffect(() => {
    const handleHashChange = () => setRoute(getRoute());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  return route;
}

function LandingPage() {
  return (
    <>
      <header className="hero">
        <h1>Kaboot</h1>
        <p>Create live multiple-choice polls and see results in real time.</p>
        <div className="hero-actions">
          <a className="button" href="/#/host">Host a poll</a>
          <a className="button button-secondary" href="/#/player">Join a poll</a>
        </div>
      </header>
      <main className="content">
        <section>
          <h2>How it works</h2>
          <ol>
            <li>Host creates a poll question and shares the game code.</li>
            <li>Players join from any device using the code and their display name.</li>
            <li>Start the poll and watch the results update live.</li>
          </ol>
        </section>
        <section>
          <h2>Why Kaboot?</h2>
          <p>
            Kaboot is a lightweight alternative to complex quiz platforms. It is designed for
            quick classroom check-ins, icebreakers, and remote team meetings. No accounts or
            downloads required—just share the code and start polling instantly.
          </p>
        </section>
      </main>
      <footer className="footer">Built with ❤️ using React, Node.js, and WebSockets.</footer>
    </>
  );
}

function ResultsList({ options, counts }) {
  if (!Array.isArray(counts) || counts.length === 0) {
    return null;
  }

  const total = counts.reduce((sum, value) => sum + value, 0);
  return (
    <div className="results">
      {counts.map((count, index) => {
        const label = options[index] || `Option ${index + 1}`;
        const percent = total === 0 ? 0 : Math.round((count / total) * 100);
        return (
          <div className="result-row" key={index}>
            <div className="result-header">
              <strong>{label}</strong>
              <span className="count">
                {count} vote{count === 1 ? '' : 's'} ({percent}%)
              </span>
            </div>
            <div className="progress">
              <div className="progress-bar" style={{ width: `${percent}%` }}></div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HostDashboard() {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [gameCode, setGameCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('Create a poll to get started.');
  const [players, setPlayers] = useState([]);
  const [results, setResults] = useState([]);
  const [pollCreated, setPollCreated] = useState(false);
  const [pollActive, setPollActive] = useState(false);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'identified':
        break;
      case 'host:game_created':
        setPollCreated(true);
        setPollActive(false);
        setGameCode(message.code || '');
        setQuestion(message.question || '');
        setOptions(Array.isArray(message.options) ? message.options : []);
        setStatusMessage('Share the code with players and press start when you are ready.');
        setResults([]);
        setHasPendingChanges(false);
        break;
      case 'host:poll_updated':
        setStatusMessage('Poll updated. Players will see the new question when you start.');
        setQuestion(message.question || '');
        setOptions(Array.isArray(message.options) ? message.options : []);
        setPollActive(false);
        setResults([]);
        setHasPendingChanges(false);
        break;
      case 'host:poll_started':
        setStatusMessage('Poll is live! Responses will update in real time.');
        setPollActive(true);
        setResults(options.map(() => 0));
        break;
      case 'host:poll_progress':
        if (Array.isArray(message.results)) {
          setResults(message.results);
        }
        break;
      case 'host:poll_results':
        setPollActive(false);
        if (Array.isArray(message.results)) {
          setResults(message.results);
        }
        setStatusMessage('Poll ended. You can update the question and run it again.');
        break;
      case 'host:players_updated':
        setPlayers(Array.isArray(message.players) ? message.players : []);
        break;
      case 'error':
        setStatusMessage(message.message || 'An error occurred. Please try again.');
        break;
      default:
        break;
    }
  }, [options]);

  const { sendMessage, connectionState } = useKabootSocket('host', handleMessage);

  useEffect(() => {
    if (connectionState === 'closed') {
      setStatusMessage('Connection lost. Refresh the page to reconnect.');
    }
  }, [connectionState]);

  const handleAddOption = () => {
    setOptions((current) => {
      if (current.length >= 6) {
        return current;
      }
      const next = [...current, ''];
      if (pollCreated) {
        setHasPendingChanges(true);
      }
      return next;
    });
  };

  const handleRemoveOption = (index) => {
    setOptions((current) => {
      if (current.length <= 2) {
        return current;
      }
      const next = current.filter((_, optionIndex) => optionIndex !== index);
      if (pollCreated) {
        setHasPendingChanges(true);
      }
      return next;
    });
  };

  const handleOptionChange = (index, value) => {
    setOptions((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    if (pollCreated) {
      setHasPendingChanges(true);
    }
  };

  const handleQuestionChange = (event) => {
    setQuestion(event.target.value);
    if (pollCreated) {
      setHasPendingChanges(true);
    }
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmedQuestion = question.trim();
    const trimmedOptions = options.map((option) => option.trim()).filter(Boolean);

    if (!trimmedQuestion) {
      setStatusMessage('Enter a question to create your poll.');
      return;
    }

    if (trimmedOptions.length < 2) {
      setStatusMessage('Please add at least two answer options.');
      return;
    }

    sendMessage({
      type: pollCreated ? 'host:update_poll' : 'host:create_game',
      question: trimmedQuestion,
      options: trimmedOptions,
    });
  };

  const handleStart = () => {
    sendMessage({ type: 'host:start_poll' });
  };

  const handleEnd = () => {
    sendMessage({ type: 'host:end_poll' });
  };

  const canAddOption = options.length < 6;
  const canRemoveOption = options.length > 2;
  const canStartPoll = pollCreated && !pollActive && connectionState === 'open';
  const canEndPoll = pollActive && connectionState === 'open';

  return (
    <div className="app host-view">
      <header className="top-bar">
        <a href="/#" className="brand">
          Kaboot
        </a>
        <span className="role-label">Host dashboard</span>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Poll setup</h2>
          <form className="stack" onSubmit={handleSubmit} autoComplete="off">
            <label className="stack">
              <span>Question</span>
              <textarea
                rows="3"
                placeholder="What should we ask?"
                value={question}
                onChange={handleQuestionChange}
                required
              ></textarea>
            </label>

            <div className="options">
              {options.map((option, index) => (
                <div className="option-row" key={index}>
                  <input
                    type="text"
                    value={option}
                    maxLength={80}
                    placeholder={`Option ${index + 1}`}
                    onChange={(event) => handleOptionChange(index, event.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="remove-button"
                    onClick={() => handleRemoveOption(index)}
                    disabled={!canRemoveOption}
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>

            <button type="button" className="button button-secondary" onClick={handleAddOption} disabled={!canAddOption}>
              Add option
            </button>

            <div className="form-actions">
              {!pollCreated ? (
                <button type="submit" className="button" disabled={connectionState !== 'open'}>
                  Create poll
                </button>
              ) : (
                <button type="submit" className="button" disabled={!hasPendingChanges || connectionState !== 'open'}>
                  Save changes
                </button>
              )}
            </div>
          </form>
          <p className="hint">Add between 2 and 6 options. Each option can have up to 80 characters.</p>
        </section>

        <section className="card">
          <h2>Game lobby</h2>
          <p className="game-code">{gameCode || 'Waiting for poll…'}</p>
          <div className="status">{statusMessage}</div>
          <h3>Players</h3>
          <ul className="player-list">
            {players.length === 0 ? (
              <li>No players yet. Share the code!</li>
            ) : (
              players.map((player) => (
                <li key={player.id}>
                  <span>{player.name}</span>
                  <span className="badge">{player.hasVoted ? 'Voted' : 'Waiting'}</span>
                </li>
              ))
            )}
          </ul>
        </section>

        <section className="card">
          <h2>Controls</h2>
          <div className="stack">
            <button className="button" onClick={handleStart} disabled={!canStartPoll}>
              Start poll
            </button>
            <button className="button button-secondary" onClick={handleEnd} disabled={!canEndPoll}>
              End poll
            </button>
          </div>
          {results.length > 0 ? (
            <ResultsList options={options} counts={results} />
          ) : (
            <p className="hint">Results will appear here once the poll is running.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function PlayerLobby() {
  const [joinCode, setJoinCode] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [statusMessage, setStatusMessage] = useState('Enter a game code and display name to join.');
  const [joined, setJoined] = useState(false);
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [results, setResults] = useState(null);

  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'identified':
        break;
      case 'player:joined':
        setJoined(true);
        setStatusMessage('You joined the lobby. Waiting for the host to start the poll.');
        if (message.question && Array.isArray(message.options)) {
          setQuestion(message.question);
          setOptions(message.options);
        }
        break;
      case 'poll:start':
        setQuestion(message.question || '');
        setOptions(Array.isArray(message.options) ? message.options : []);
        setHasVoted(false);
        setSelectedChoice(null);
        setResults(null);
        setStatusMessage('Pick your answer! You can only vote once.');
        break;
      case 'player:voted':
        setHasVoted(true);
        setSelectedChoice(message.choiceIndex);
        setStatusMessage('Thanks for voting! Waiting for results…');
        break;
      case 'poll:results':
        setQuestion(message.question || '');
        setOptions(Array.isArray(message.options) ? message.options : []);
        setResults(Array.isArray(message.results) ? message.results : []);
        setHasVoted(false);
        setSelectedChoice(null);
        setStatusMessage('Results are in! Stay tuned for the next poll.');
        break;
      case 'poll:reset':
        setQuestion('');
        setOptions([]);
        setResults(null);
        setHasVoted(false);
        setSelectedChoice(null);
        setStatusMessage(message.message || 'Waiting for the next question…');
        break;
      case 'game:ended':
        setStatusMessage(message.message || 'The host has ended the session.');
        setJoined(false);
        setQuestion('');
        setOptions([]);
        setResults(null);
        setHasVoted(false);
        setSelectedChoice(null);
        break;
      case 'error':
        setStatusMessage(message.message || 'Something went wrong. Please try again.');
        break;
      default:
        break;
    }
  }, []);

  const { sendMessage, connectionState } = useKabootSocket('player', handleMessage);

  useEffect(() => {
    if (connectionState === 'closed') {
      setStatusMessage('Connection lost. Refresh the page to reconnect.');
    }
  }, [connectionState]);

  const handleJoin = (event) => {
    event.preventDefault();
    if (joined || connectionState !== 'open') {
      return;
    }
    const code = joinCode.trim();
    const name = displayName.trim();
    if (!code || !name) {
      setStatusMessage('Enter a game code and display name to join.');
      return;
    }
    sendMessage({
      type: 'player:join',
      code,
      name,
    });
  };

  const handleVote = (index) => {
    if (hasVoted || connectionState !== 'open') {
      return;
    }
    sendMessage({
      type: 'player:vote',
      choiceIndex: index,
    });
  };

  return (
    <div className="app player-view">
      <header className="top-bar">
        <a href="/#" className="brand">
          Kaboot
        </a>
        <span className="role-label">Join a poll</span>
      </header>

      <main className="grid player-grid">
        <section className="card">
          <h2>Join a game</h2>
          <form className="stack" onSubmit={handleJoin} autoComplete="off">
            <label className="stack">
              <span>Game code</span>
              <input
                type="text"
                value={joinCode}
                onChange={(event) => setJoinCode(event.target.value)}
                placeholder="123456"
                maxLength={6}
                required
                disabled={joined}
              />
            </label>
            <label className="stack">
              <span>Display name</span>
              <input
                type="text"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Alex"
                maxLength={40}
                required
                disabled={joined}
              />
            </label>
            <button className="button" type="submit" disabled={joined || connectionState !== 'open'}>
              {joined ? 'Joined' : 'Join game'}
            </button>
          </form>
          <div className="status player-status">{statusMessage}</div>
        </section>

        <section className="card">
          <h2>Current poll</h2>
          {question ? (
            <>
              <p className="question-text">{question}</p>
              <div className="answers">
                {options.map((option, index) => (
                  <button
                    key={index}
                    type="button"
                    className={`answer-button ${selectedChoice === index ? 'selected' : ''}`}
                    onClick={() => handleVote(index)}
                    disabled={hasVoted || connectionState !== 'open'}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <p className="hint">Waiting for the host to start the next poll.</p>
          )}

          {Array.isArray(results) && results.length > 0 && (
            <div className="results-container">
              <h3>Results</h3>
              <ResultsList options={options} counts={results} />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function App() {
  const route = useHashRoute();

  if (route === 'host') {
    return <HostDashboard />;
  }

  if (route === 'player') {
    return <PlayerLobby />;
  }

  return <LandingPage />;
}

const container = document.getElementById('root');
const root = ReactDOM.createRoot(container);
root.render(<App />);
