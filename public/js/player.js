const { useCallback, useEffect, useRef, useState } = React;

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

function PlayerApp() {
  const [gameCodeInput, setGameCodeInput] = useState('');
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [joined, setJoined] = useState(false);
  const [joinedCode, setJoinedCode] = useState('');
  const [statusMessage, setStatusMessage] = useState('Join a poll to get started.');
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState([]);
  const [results, setResults] = useState([]);
  const [hasVoted, setHasVoted] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState(null);
  const [pollVisible, setPollVisible] = useState(false);
  const [connected, setConnected] = useState(false);
  const [connectionError, setConnectionError] = useState(null);

  const wsRef = useRef(null);
  const latestOptionsRef = useRef(options);

  useEffect(() => {
    latestOptionsRef.current = options;
  }, [options]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${protocol}://${window.location.host}/ws`);
    wsRef.current = ws;

    const handleOpen = () => {
      setConnected(true);
      setConnectionError(null);
      ws.send(JSON.stringify({ type: 'identify', role: 'player' }));
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
        case 'player:joined':
          setJoined(true);
          setJoinedCode(message.code || '');
          setStatusMessage('You joined the lobby. Waiting for the host to start the poll.');
          if (message.question && Array.isArray(message.options)) {
            setQuestion(message.question);
            setOptions(message.options);
            setResults([]);
            setPollVisible(true);
          } else {
            setPollVisible(false);
          }
          break;
        case 'poll:start':
          if (message.question) {
            setQuestion(message.question);
          }
          if (Array.isArray(message.options)) {
            setOptions(message.options);
            setResults(new Array(message.options.length).fill(0));
          } else {
            const optionCount = latestOptionsRef.current.length;
            setResults(new Array(optionCount).fill(0));
          }
          setPollVisible(true);
          setHasVoted(false);
          setSelectedChoice(null);
          setStatusMessage('Pick your answer! You can only vote once.');
          break;
        case 'player:voted':
          setHasVoted(true);
          setSelectedChoice(message.choiceIndex);
          setStatusMessage('Thanks for voting! Waiting for results…');
          break;
        case 'poll:results':
          if (message.question) {
            setQuestion(message.question);
          }
          if (Array.isArray(message.options)) {
            setOptions(message.options);
          }
          if (Array.isArray(message.results)) {
            setResults(message.results);
          }
          setPollVisible(true);
          setHasVoted(false);
          setSelectedChoice(null);
          setStatusMessage('Results are in! Stay tuned for the next poll.');
          break;
        case 'poll:reset':
          setHasVoted(false);
          setSelectedChoice(null);
          setPollVisible(false);
          setResults([]);
          setStatusMessage(message.message || 'Waiting for the next question…');
          break;
        case 'game:ended':
          setStatusMessage(message.message || 'The host has ended the session.');
          setJoined(false);
          setJoinedCode('');
          setHasVoted(false);
          setSelectedChoice(null);
          setPollVisible(false);
          setResults([]);
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

  const connectionReady = connected && !connectionError;

  const handleJoinSubmit = (event) => {
    event.preventDefault();
    if (!connectionReady) {
      setStatusMessage('Connecting to the server. Please wait a moment.');
      return;
    }
    if (!gameCodeInput.trim() || !displayNameInput.trim()) {
      setStatusMessage('Enter a game code and display name to join.');
      return;
    }
    sendMessage({
      type: 'player:join',
      code: gameCodeInput.trim(),
      name: displayNameInput.trim(),
    });
  };

  const handleVote = (choiceIndex) => {
    if (hasVoted || !pollVisible) {
      return;
    }
    if (!connectionReady) {
      setStatusMessage('Connection not ready. Please wait a moment and try again.');
      return;
    }
    sendMessage({
      type: 'player:vote',
      choiceIndex,
    });
  };

  const answersDisabled = hasVoted || !pollVisible || !connectionReady;
  const currentStatus = connectionError || statusMessage;

  return (
    <>
      <header className="top-bar">
        <a href="/" className="brand">
          Kaboot
        </a>
        <span className="role-label">Player console</span>
      </header>

      <main className="grid">
        <section className="card">
          <h2>Join a poll</h2>
          {joined ? (
            <div className="status">
              {joinedCode ? `Joined game ${joinedCode}.` : 'You are currently in the lobby.'}
            </div>
          ) : (
            <form className="stack" autoComplete="off" onSubmit={handleJoinSubmit}>
              <label className="stack">
                <span>Game code</span>
                <input
                  type="text"
                  value={gameCodeInput}
                  maxLength={6}
                  placeholder="123456"
                  onChange={(event) => setGameCodeInput(event.target.value.replace(/[^0-9]/g, ''))}
                />
              </label>
              <label className="stack">
                <span>Display name</span>
                <input
                  type="text"
                  value={displayNameInput}
                  maxLength={40}
                  placeholder="Your name"
                  onChange={(event) => setDisplayNameInput(event.target.value)}
                />
              </label>
              <button type="submit" className="button" disabled={!connectionReady}>
                Join
              </button>
            </form>
          )}
          <p className="hint">The host will share a six-digit game code with everyone.</p>
        </section>

        <section className="card">
          <h2>Poll stage</h2>
          <div className="status">{currentStatus}</div>
          {pollVisible && (
            <div>
              <h3>{question}</h3>
              <div className="answers">
                {options.map((option, index) => {
                  const isSelected = selectedChoice === index;
                  return (
                    <button
                      key={`${option}-${index}`}
                      type="button"
                      className={`answer-button${isSelected ? ' selected' : ''}`}
                      onClick={() => handleVote(index)}
                      disabled={answersDisabled}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="results">
            <ResultRows options={options} counts={results} />
          </div>
        </section>
      </main>
    </>
  );
}

const rootElement = document.getElementById('root');
if (rootElement) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(<PlayerApp />);
}
