const express = require('express');
const http = require('http');
const path = require('path');
const WebSocket = require('ws');
const { randomUUID } = require('crypto');

const { WebSocketServer } = WebSocket;

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const games = new Map();

function generateGameCode() {
  let code;
  do {
    code = Math.floor(100000 + Math.random() * 900000).toString();
  } while (games.has(code));
  return code;
}

function send(socket, payload) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(payload));
  }
}

function broadcastToPlayers(game, payload) {
  game.players.forEach((player) => {
    send(player.socket, payload);
  });
}

function serializePlayers(game) {
  return Array.from(game.players.values()).map((player) => ({
    id: player.id,
    name: player.name,
    hasVoted: player.hasVoted,
  }));
}

function countVotes(game) {
  const counts = game.options.map(() => 0);
  game.players.forEach((player) => {
    if (typeof player.choiceIndex === 'number') {
      counts[player.choiceIndex] += 1;
    }
  });
  return counts;
}

function destroyGame(code) {
  const game = games.get(code);
  if (!game) {
    return;
  }
  broadcastToPlayers(game, {
    type: 'game:ended',
    message: 'The host has disconnected. The poll has ended.',
  });
  games.delete(code);
}

wss.on('connection', (socket) => {
  const clientId = randomUUID();
  let role = null;
  let currentGameCode = null;
  let playerId = null;

  socket.on('message', (rawMessage) => {
    let message;
    try {
      message = JSON.parse(rawMessage.toString());
    } catch (error) {
      send(socket, {
        type: 'error',
        message: 'Invalid JSON payload received.',
      });
      return;
    }

    switch (message.type) {
      case 'identify': {
        if (!['host', 'player'].includes(message.role)) {
          send(socket, { type: 'error', message: 'Unknown role specified.' });
          return;
        }
        role = message.role;
        send(socket, { type: 'identified', role });
        break;
      }
      case 'host:create_game': {
        if (role !== 'host') {
          send(socket, { type: 'error', message: 'Only hosts can create games.' });
          return;
        }
        const { question, options } = message;
        if (!question || !Array.isArray(options) || options.length < 2) {
          send(socket, {
            type: 'error',
            message: 'A question and at least two options are required to start a poll.',
          });
          return;
        }
        const trimmedOptions = options.map((option) => option.trim()).filter(Boolean);
        if (trimmedOptions.length < 2) {
          send(socket, {
            type: 'error',
            message: 'Provide at least two non-empty answer options.',
          });
          return;
        }
        const code = generateGameCode();
        const game = {
          code,
          hostId: clientId,
          hostSocket: socket,
          question: question.trim(),
          options: trimmedOptions,
          players: new Map(),
          state: 'lobby',
        };
        games.set(code, game);
        currentGameCode = code;
        send(socket, {
          type: 'host:game_created',
          code,
          question: game.question,
          options: game.options,
        });
        break;
      }
      case 'host:update_poll': {
        if (role !== 'host') {
          send(socket, { type: 'error', message: 'Only hosts can update polls.' });
          return;
        }
        if (!currentGameCode || !games.has(currentGameCode)) {
          send(socket, {
            type: 'error',
            message: 'Create a game before updating the poll.',
          });
          return;
        }
        const { question, options } = message;
        if (!question || !Array.isArray(options) || options.length < 2) {
          send(socket, {
            type: 'error',
            message: 'A question and at least two options are required.',
          });
          return;
        }
        const trimmedOptions = options.map((option) => option.trim()).filter(Boolean);
        if (trimmedOptions.length < 2) {
          send(socket, {
            type: 'error',
            message: 'Provide at least two non-empty answer options.',
          });
          return;
        }
        const game = games.get(currentGameCode);
        game.question = question.trim();
        game.options = trimmedOptions;
        game.state = 'lobby';
        game.players.forEach((player) => {
          player.hasVoted = false;
          player.choiceIndex = undefined;
        });
        send(socket, {
          type: 'host:poll_updated',
          question: game.question,
          options: game.options,
        });
        send(socket, {
          type: 'host:players_updated',
          players: serializePlayers(game),
        });
        broadcastToPlayers(game, {
          type: 'poll:reset',
          message: 'The host is preparing a new poll. Please wait for the next question.',
        });
        break;
      }
      case 'host:start_poll': {
        if (role !== 'host') {
          send(socket, { type: 'error', message: 'Only hosts can start polls.' });
          return;
        }
        if (!currentGameCode || !games.has(currentGameCode)) {
          send(socket, {
            type: 'error',
            message: 'Create a game before starting the poll.',
          });
          return;
        }
        const game = games.get(currentGameCode);
        if (game.state === 'active') {
          send(socket, {
            type: 'error',
            message: 'A poll is already in progress.',
          });
          return;
        }
        game.state = 'active';
        game.players.forEach((player) => {
          player.hasVoted = false;
          player.choiceIndex = undefined;
        });
        send(socket, {
          type: 'host:players_updated',
          players: serializePlayers(game),
        });
        broadcastToPlayers(game, {
          type: 'poll:start',
          question: game.question,
          options: game.options,
        });
        send(socket, {
          type: 'host:poll_started',
        });
        break;
      }
      case 'host:end_poll': {
        if (role !== 'host') {
          send(socket, { type: 'error', message: 'Only hosts can end polls.' });
          return;
        }
        if (!currentGameCode || !games.has(currentGameCode)) {
          send(socket, {
            type: 'error',
            message: 'Create a game before ending the poll.',
          });
          return;
        }
        const game = games.get(currentGameCode);
        if (game.state !== 'active') {
          send(socket, {
            type: 'error',
            message: 'The poll is not currently running.',
          });
          return;
        }
        game.state = 'ended';
        const results = countVotes(game);
        send(socket, {
          type: 'host:poll_results',
          results,
        });
        broadcastToPlayers(game, {
          type: 'poll:results',
          question: game.question,
          options: game.options,
          results,
        });
        break;
      }
      case 'player:join': {
        if (role !== 'player') {
          send(socket, { type: 'error', message: 'Only players can join games.' });
          return;
        }
        const { code, name } = message;
        if (!code || !name) {
          send(socket, {
            type: 'error',
            message: 'A game code and display name are required.',
          });
          return;
        }
        const game = games.get(code);
        if (!game) {
          send(socket, {
            type: 'error',
            message: 'No game found with that code.',
          });
          return;
        }
        playerId = randomUUID();
        currentGameCode = code;
        const player = {
          id: playerId,
          name: name.trim().slice(0, 40),
          socket,
          hasVoted: false,
          choiceIndex: undefined,
        };
        game.players.set(playerId, player);
        send(socket, {
          type: 'player:joined',
          code,
          question: game.state === 'active' ? game.question : null,
          options: game.state === 'active' ? game.options : null,
        });
        send(game.hostSocket, {
          type: 'host:players_updated',
          players: serializePlayers(game),
        });
        if (game.state === 'active') {
          send(socket, {
            type: 'poll:start',
            question: game.question,
            options: game.options,
          });
        }
        break;
      }
      case 'player:vote': {
        if (role !== 'player') {
          send(socket, { type: 'error', message: 'Only players can vote.' });
          return;
        }
        if (!currentGameCode || !games.has(currentGameCode)) {
          send(socket, {
            type: 'error',
            message: 'Join a game before voting.',
          });
          return;
        }
        const game = games.get(currentGameCode);
        if (game.state !== 'active') {
          send(socket, {
            type: 'error',
            message: 'Voting is not open at the moment.',
          });
          return;
        }
        const player = game.players.get(playerId);
        if (!player) {
          send(socket, {
            type: 'error',
            message: 'You are not part of this game.',
          });
          return;
        }
        if (player.hasVoted) {
          send(socket, {
            type: 'error',
            message: 'You have already voted in this poll.',
          });
          return;
        }
        const { choiceIndex } = message;
        if (typeof choiceIndex !== 'number' || choiceIndex < 0 || choiceIndex >= game.options.length) {
          send(socket, {
            type: 'error',
            message: 'Please select a valid option.',
          });
          return;
        }
        player.hasVoted = true;
        player.choiceIndex = choiceIndex;
        send(socket, {
          type: 'player:voted',
          choiceIndex,
        });
        send(game.hostSocket, {
          type: 'host:players_updated',
          players: serializePlayers(game),
        });
        const results = countVotes(game);
        send(game.hostSocket, {
          type: 'host:poll_progress',
          results,
        });
        break;
      }
      default:
        send(socket, { type: 'error', message: 'Unknown message type received.' });
    }
  });

  socket.on('close', () => {
    if (role === 'host' && currentGameCode) {
      destroyGame(currentGameCode);
    }
    if (role === 'player' && currentGameCode && games.has(currentGameCode) && playerId) {
      const game = games.get(currentGameCode);
      game.players.delete(playerId);
      send(game.hostSocket, {
        type: 'host:players_updated',
        players: serializePlayers(game),
      });
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});
