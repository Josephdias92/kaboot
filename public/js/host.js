const { useCallback, useEffect, useMemo, useRef, useState } = React;

const MAX_OPTIONS = 6;

function sanitizeOptions(options) {
  if (!Array.isArray(options)) {
    return [];
  }
  return options
    .map((option) => option.trim())
    .filter((option) => option.length > 0)
    .slice(0, MAX_OPTIONS);
}

function ensureOptionInputs(options) {
  const normalized = Array.isArray(options) ? [...options] : [];
  while (normalized.length < 2) {
    normalized.push('');
  }
  return normalized.slice(0, MAX_OPTIONS);
}

function ResultRows({ options, counts }) {
  if (!Array.isArray(counts) || counts.length === 0) {
    return null;
  }

  const totalVotes = counts.reduce((sum, value) => sum + value, 0);

  return counts.map((count, index) => {
    const label = options[index] || `Option ${index + 1}`;
    const percent = totalVotes === 0 ? 0 : Math.round((count / totalVotes) * 100);
    return (
      <div key={`${label}-${index}`} className="result-row">
        <div className="result-header">
          <strong>{label}</strong>
          <span className="count">
            {count} vote{count === 1 ? '' : 's'} ({percent}%)
          </span>
        </div>
        <div className="progress">
          <div className="progress-bar" style={{ width: `${percent}%` }} />
        </div>
      </div>
    );
  });
}

function PlayerList({ players }) {
  if (!Array.isArray(players) || players.length === 0) {
    return <li>No players yet. Share the code!</li>;
  }

  return players.map((player) => (
    <li key={player.id}>
      <span>{player.name}</span>
      <span className="badge">{player.hasVoted ? 'Voted' : 'Waiting'}</span>
    </li>
  ));
}

function OptionRow({ index, value, canRemove, onChange, onRemove }) {
  return (
    <div className="option-row">
      <input
        type="text"
        value={value}
        maxLength={80}
        placeholder={`Option ${index + 1}`}
        onChange={(event) => onChange(event.target.value)}
      />
      <button
        type="button"
        className="remove-button"
        onClick={onRemove}
        disabled={!canRemove}
      >
        Remove
      </button>
    </div>
  );
}

function HostApp() {
  const [question, setQuestion] = useState('');
  const [optionInputs, setOptionInputs] = useState(() => ensureOptionInputs(['', '']));
  const [players, setPlayers] = useState([]);
  const [statusMessage, setStatusMessage] = useState('Create a poll to get started.');
  const [gameCode, setGameCode] = useState(null);
  const [pollState, setPollState] = useState('idle');
  const [results, setResults] = useState([]);
  const [formDirty, setFormDirty] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const wsRef = useRef(null);
  const optionsRef = useRef(optionInputs);

  useEffect(() => {
    optionsRef.current = optionInputs;
  }, [optionInputs]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;

    const handleOpen = () => {
      setConnected(true);
      setConnectionError(null);
      ws.send(JSON.stringify({ type: 'identify', role: 'host' }));
    };

    const handleMessage = (event) => {
      let message;
      try {
        message = JSON.parse(event.data);
      } catch (error) {
        return;
      }

      switch (message.type) {
        case 'identified':
          break;
        case 'host:game_created':
          setGameCode(message.code || null);
          setQuestion(message.question || '');
          setOptionInputs(ensureOptionInputs(message.options));
          setPlayers([]);
          setPollState('lobby');
          setResults([]);
          setFormDirty(false);
          setStatusMessage('Share the code with players and press start when you are ready.');
          break;
        case 'host:poll_updated':
          setQuestion(message.question || '');
          setOptionInputs(ensureOptionInputs(message.options));
          setPollState('lobby');
          setResults([]);
          setFormDirty(false);
          setStatusMessage('Poll updated. Players will see the new question when you start.');
          break;
        case 'host:poll_started':
          setPollState('active');
          setStatusMessage('Poll is live! Responses will update in real time.');
          setResults(new Array(optionsRef.current.length).fill(0));
          break;
        case 'host:poll_progress':
          if (Array.isArray(message.results)) {
            setResults(message.results);
          }
          break;
        case 'host:poll_results':
          setPollState('ended');
          if (Array.isArray(message.results)) {
            setResults(message.results);
          }
          setStatusMessage('Poll ended. You can update the question and run it again.');
          break;
        case 'host:players_updated':
          setPlayers(Array.isArray(message.players) ? message.players : []);
          break;
        case 'error':
          if (message.message) {
            setStatusMessage(message.message);
          }
          break;
        default:
          break;
      }
    };

    const handleClose = () => {
      setConnected(false);
      setConnectionError('Connection lost. Refresh the page to reconnect.');
    };

    const handleError = () => {
      setConnected(false);
      setConnectionError('Unable to reach the server. Please try again.');
    };

    ws.addEventListener('open', handleOpen);
    ws.addEventListener('message', handleMessage);
    ws.addEventListener('close', handleClose);
    ws.addEventListener('error', handleError);

    return () => {
      ws.removeEventListener('open', handleOpen);
      ws.removeEventListener('message', handleMessage);
      ws.removeEventListener('close', handleClose);
      ws.removeEventListener('error', handleError);
      ws.close();
    };
  }, []);

  const sendMessage = useCallback((payload) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    setConnectionError('Connection lost. Refresh the page to reconnect.');
    return false;
  }, []);

  const pollCreated = Boolean(gameCode);
  const pollActive = pollState === 'active';

  const cleanedOptions = useMemo(() => sanitizeOptions(optionInputs), [optionInputs]);
  const questionValid = question.trim().length > 0;
  const hasEnoughOptions = cleanedOptions.length >= 2;
  const formIsValid = questionValid && hasEnoughOptions;
  const connectionReady = connected && !connectionError;

  const handleQuestionChange = (value) => {
    setQuestion(value);
    if (pollCreated) {
      setFormDirty(true);
    }
  };

  const handleOptionChange = (index, value) => {
    setOptionInputs((current) => {
      const next = [...current];
      next[index] = value;
      return next;
    });
    if (pollCreated) {
      setFormDirty(true);
    }
  };

  const handleAddOption = () => {
    setOptionInputs((current) => {
      if (current.length >= MAX_OPTIONS) {
        return current;
      }
      return [...current, ''];
    });
    if (pollCreated) {
      setFormDirty(true);
    }
  };

  const handleRemoveOption = (index) => {
    setOptionInputs((current) => {
      if (current.length <= 2) {
        return current;
      }
      const next = current.filter((_, optionIndex) => optionIndex !== index);
      return ensureOptionInputs(next);
    });
    if (pollCreated) {
      setFormDirty(true);
    }
  };

  const sendPollMutation = (type) => {
    if (!connectionReady) {
      setStatusMessage('Connection not ready. Please wait a moment and try again.');
      return false;
    }

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setStatusMessage('Please enter a poll question.');
      return false;
    }

    if (cleanedOptions.length < 2) {
      setStatusMessage('Please add at least two answer options.');
      return false;
    }

    const acknowledged = sendMessage({
      type,
      question: trimmedQuestion,
      options: cleanedOptions,
    });

    if (acknowledged && type === 'host:update_poll') {
      setFormDirty(false);
    }

    return acknowledged;
  };

  const handleFormSubmit = (event) => {
    event.preventDefault();
    if (pollCreated) {
      if (sendPollMutation('host:update_poll')) {
        setStatusMessage('Saving changes…');
      }
    } else if (sendPollMutation('host:create_game')) {
      setStatusMessage('Creating poll…');
    }
  };

  const handleUpdate = () => {
    if (!pollCreated) {
      setStatusMessage('Create a poll before saving changes.');
      return;
    }
    if (sendPollMutation('host:update_poll')) {
      setStatusMessage('Saving changes…');
    }
  };

  const handleStartPoll = () => {
    if (!pollCreated) {
      setStatusMessage('Create a poll before starting.');
      return;
    }
    if (!connectionReady) {
      setStatusMessage('Connection not ready. Please wait a moment and try again.');
      return;
    }
    sendMessage({ type: 'host:start_poll' });
  };

  const handleEndPoll = () => {
    if (!pollActive) {
      setStatusMessage('The poll is not currently running.');
      return;
    }
    if (!connectionReady) {
      setStatusMessage('Connection not ready. Please wait a moment and try again.');
      return;
    }
    sendMessage({ type: 'host:end_poll' });
  };

  const currentStatus = connectionError || statusMessage;

  return (
    <>
      <header className="top-bar">
        <a href="/" className="brand">
          Kaboot
        </a>
        <span className="role-label">Host dashboard</span>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Poll setup</h2>
          <form className="stack" autoComplete="off" onSubmit={handleFormSubmit}>
            <label className="stack">
              <span>Question</span>
              <textarea
                rows="3"
                placeholder="What should we ask?"
                value={question}
                onChange={(event) => handleQuestionChange(event.target.value)}
              />
            </label>

            <div className="options">
              {optionInputs.map((option, index) => (
                <OptionRow
                  key={index}
                  index={index}
                  value={option}
                  canRemove={optionInputs.length > 2}
                  onChange={(value) => handleOptionChange(index, value)}
                  onRemove={() => handleRemoveOption(index)}
                />
              ))}
            </div>

            <button
              type="button"
              className="button button-secondary"
              onClick={handleAddOption}
              disabled={optionInputs.length >= MAX_OPTIONS}
            >
              Add option
            </button>

            <div className="form-actions">
              <button
                type="submit"
                className="button"
                disabled={!connectionReady || pollCreated || !formIsValid}
              >
                Create poll
              </button>
              <button
                type="button"
                className="button button-secondary"
                onClick={handleUpdate}
                disabled={!connectionReady || !pollCreated || !formDirty || !formIsValid}
              >
                Save changes
              </button>
            </div>
          </form>
          <p className="hint">Add between 2 and 6 options. Each option can have up to 80 characters.</p>
        </section>

        <section className="card">
          <h2>Game lobby</h2>
          <p className="game-code">{gameCode || 'Waiting for poll…'}</p>
          <div className="status">{currentStatus}</div>
          <h3>Players</h3>
          <ul className="player-list">
            <PlayerList players={players} />
          </ul>
        </section>

        <section className="card">
          <h2>Controls</h2>
          <div className="stack">
            <button
              className="button"
              type="button"
              onClick={handleStartPoll}
              disabled={!connectionReady || !pollCreated || pollActive}
            >
              Start poll
            </button>
            <button
              className="button button-secondary"
              type="button"
              onClick={handleEndPoll}
              disabled={!connectionReady || !pollActive}
            >
              End poll
            </button>
          </div>
          <div className="results">
            <ResultRows options={optionInputs} counts={results} />
          </div>
        </section>
      </main>
    </>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<HostApp />);
}
