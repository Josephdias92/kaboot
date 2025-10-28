# Kaboot Live Polling App

Kaboot is a lightweight real-time polling experience inspired by classroom quiz tools such as Kahoot. It lets a host create a multiple-choice poll, invite participants with a six-digit game code, and view live results as answers arrive.

## Features

- Host dashboard with poll builder, lobby management, and live results
- Player console with simple join flow and one-tap voting
- WebSocket-powered updates so results appear instantly for the host and players
- Responsive design that works on desktops, tablets, and phones

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the development server:

   ```bash
   npm start
   ```

3. Open the host dashboard at [http://localhost:3000/host.html](http://localhost:3000/host.html) to create a poll and share the auto-generated code.
4. Participants can join from [http://localhost:3000/player.html](http://localhost:3000/player.html) using the shared code and their name.

## Tech stack

- [Express](https://expressjs.com/) serves the static frontend assets
- [ws](https://github.com/websockets/ws) handles the WebSocket signalling between host, players, and server
- Vanilla HTML, CSS, and JavaScript keep the client lightweight and dependency-free

## Project structure

```
.
├── public
│   ├── css
│   │   └── styles.css        # Shared styling for all screens
│   ├── host.html             # Host dashboard UI
│   ├── index.html            # Landing page with instructions
│   ├── js
│   │   ├── host.js          # Host-side WebSocket + UI logic
│   │   └── player.js        # Player-side WebSocket + UI logic
│   └── player.html          # Player console
├── server.js                 # Express + WebSocket game server
├── package.json
└── README.md
```

## Notes

- Games are stored in-memory; restart the server to clear sessions.
- Each game code is unique for the life of the process and removed when the host disconnects.
- The demo is best suited for small groups and classroom icebreakers.
