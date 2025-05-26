export class BattleshipGameDO {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.websockets = []; // Store connected WebSocket clients
    this.player1Id = null;
    this.player2Id = null;
    this.player1Board = [];
    this.player2Board = [];
    this.player1Ships = [];
    this.player2Ships = [];
    this.currentPlayerId = null; // Can be player1Id or player2Id
    this.gameStatus = 'AWAITING_OPPONENT'; // Possible statuses: AWAITING_OPPONENT, SHIP_PLACEMENT, PLAYER_1_TURN, PLAYER_2_TURN, GAME_OVER_P1_WINS, GAME_OVER_P2_WINS

    // Initialize boards (10x10 grid, 0 = empty, 1 = ship, 2 = hit, 3 = miss)
    this.player1Board = Array(10).fill(null).map(() => Array(10).fill(0));
    this.player2Board = Array(10).fill(null).map(() => Array(10).fill(0));

    // Example ship definitions (can be expanded)
    // [{id: 'carrier', length: 5, hits: 0, sunk: false, positions: [[x,y],...]}, ...]
    this.player1Ships = [];
    this.player2Ships = [];
  }

  // Handle HTTP requests, primarily for WebSocket upgrades
  async fetch(request) {
    const url = new URL(request.url);
    // Expected path for WebSocket connection: /api/game/:gameId (handled by worker, then request forwarded here)
    // Or the worker might directly call a method like `handleWebSocket(request)` if using a different pattern.

    // Create a new WebSocket pair
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);

    // Store the server-side socket
    server.accept();
    this.websockets.push(server);

    // Assign player ID upon connection and manage game start
    // This is a simplified initial assignment. Robust assignment needs to consider existing connections.
    let assignedPlayerId = null;
    if (!this.player1Id) {
        this.player1Id = "player1_" + crypto.randomUUID(); // Generate a unique ID
        assignedPlayerId = this.player1Id;
        server.playerId = this.player1Id; // Associate ID with the socket
        console.log(\`Player 1 connected: \${this.player1Id}\`);
    } else if (!this.player2Id) {
        this.player2Id = "player2_" + crypto.randomUUID();
        assignedPlayerId = this.player2Id;
        server.playerId = this.player2Id;
        console.log(\`Player 2 connected: \${this.player2Id}\`);
        this.gameStatus = 'SHIP_PLACEMENT'; // Or AWAITING_READY
        this.broadcast({ type: "GAME_UPDATE", payload: { gameStatus: this.gameStatus, message: "Both players connected. Begin ship placement." } });
    } else {
        // Game is full, reject connection or handle as spectator
        server.send(JSON.stringify({ type: "ERROR", payload: { message: "Game is full." } }));
        server.close(1000, "Game is full");
        return new Response(null, { status: 403, statusText: "Game is full" });
    }
    
    server.send(JSON.stringify({ type: "PLAYER_ASSIGNED", payload: { playerId: assignedPlayerId, gameStatus: this.gameStatus } }));


    // Setup WebSocket event handlers
    server.addEventListener('message', event => {
      this.webSocketMessage(server, event.data);
    });

    server.addEventListener('close', event => {
      this.webSocketClose(server, event.code, event.reason, event.wasClean);
    });

    server.addEventListener('error', event => {
      this.webSocketError(server, event.error);
    });

    // Return the client-side socket to the client
    return new Response(null, { status: 101, webSocket: client });
  }

  // Handle incoming WebSocket messages
  async webSocketMessage(ws, message) {
    try {
      const msg = JSON.parse(message);
      console.log(\`Received message from \${ws.playerId}: \`, msg);

      switch (msg.type) {
        case 'JOIN_GAME':
          // Initial join logic is now partly in fetch(), this confirms and sends initial state
          ws.send(JSON.stringify({ 
            type: "GAME_UPDATE", 
            payload: { 
              gameStatus: this.gameStatus, 
              playerId: ws.playerId,
              message: \`Welcome \${ws.playerId}\`
            } 
          }));
          // If both players are now confirmed and were waiting for ship placement
          if (this.player1Id && this.player2Id && this.gameStatus === 'AWAITING_OPPONENT') {
             this.gameStatus = 'SHIP_PLACEMENT';
             this.broadcast({ type: "GAME_UPDATE", payload: { gameStatus: this.gameStatus, message: "Both players connected. Begin ship placement." }});
          } else if (this.gameStatus === 'AWAITING_OPPONENT' && (this.player1Id || this.player2Id)) {
             ws.send(JSON.stringify({ type: "GAME_UPDATE", payload: { gameStatus: this.gameStatus, message: "Waiting for opponent." }}));
          }
          break;
        // --- STUBS FOR GAME LOGIC ---
        case 'PLACE_SHIPS':
          // Placeholder: Validate and store ship positions
          // Example: ws.playerId, msg.payload.ships
          console.log(\`PLACE_SHIPS from \${ws.playerId}: \`, msg.payload);
          // After both players place ships, change gameStatus to PLAYER_1_TURN (or determine who goes first)
          // this.gameStatus = 'PLAYER_1_TURN';
          // this.currentPlayerId = this.player1Id;
          // this.broadcast({ type: "GAME_UPDATE", payload: { gameStatus: this.gameStatus, currentPlayerId: this.currentPlayerId } });
          ws.send(JSON.stringify({ type: "INFO", payload: { message: "Ship placement received (logic not fully implemented)." } }));
          break;

        case 'FIRE_SHOT':
          // Placeholder: Validate turn, coordinates. Update board, check hit/miss/sunk. Check win. Change turn. Broadcast.
          // Example: ws.playerId, msg.payload.x, msg.payload.y
          console.log(\`FIRE_SHOT from \${ws.playerId}: \`, msg.payload);
          // this.broadcast({ type: "MOVE_RESULT", payload: { ... } });
          ws.send(JSON.stringify({ type: "INFO", payload: { message: "Fire shot received (logic not fully implemented)." } }));
          break;

        default:
          console.log(\`Unknown message type from \${ws.playerId}: \`, msg.type);
          ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Unknown message type." } }));
      }
    } catch (err) {
      console.error(\`Failed to parse message or handle event: \${err}\`, message);
      ws.send(JSON.stringify({ type: "ERROR", payload: { message: "Invalid message format." } }));
    }
  }

  // Handle WebSocket client disconnection
  webSocketClose(ws, code, reason, wasClean) {
    console.log(\`Client \${ws.playerId} disconnected. Code: \${code}, Reason: \${reason}, Clean: \${wasClean}\`);
    this.websockets = this.websockets.filter(socket => socket !== ws);
    
    const disconnectedPlayerId = ws.playerId;
    let remainingPlayerId = null;

    if (disconnectedPlayerId === this.player1Id) {
        this.player1Id = null; // Clear player slot
        remainingPlayerId = this.player2Id;
    } else if (disconnectedPlayerId === this.player2Id) {
        this.player2Id = null; // Clear player slot
        remainingPlayerId = this.player1Id;
    }

    // If game was in progress, notify the other player
    if (this.gameStatus !== 'AWAITING_OPPONENT' && this.gameStatus !== 'GAME_OVER_P1_WINS' && this.gameStatus !== 'GAME_OVER_P2_WINS') {
        if (remainingPlayerId) {
            this.gameStatus = 'AWAITING_OPPONENT'; // Or a specific "OPPONENT_DISCONNECTED_STATE"
            this.broadcast({ 
                type: "OPPONENT_DISCONNECTED", 
                payload: { 
                    message: \`Player \${disconnectedPlayerId} disconnected. Waiting for a new opponent.`,
                    gameStatus: this.gameStatus 
                } 
            });
        }
    } else if (!this.player1Id && !this.player2Id) {
        // Reset if both players disconnect
        this.gameStatus = 'AWAITING_OPPONENT';
        // Potentially clear boards and ships if game didn't conclude
    }
     console.log(\`Remaining players: P1: \${this.player1Id}, P2: \${this.player2Id}. Status: \${this.gameStatus}\`);
  }

  // Handle WebSocket errors
  webSocketError(ws, error) {
    console.error(\`WebSocket error for client \${ws.playerId}: \`, error);
    // Potentially treat as a close event
    // this.webSocketClose(ws, 1011, "WebSocket error"); // 1011 indicates server error
  }

  // Helper to broadcast a message to all connected clients (or a specific one)
  broadcast(message, specificWs = null) {
    const serializedMessage = JSON.stringify(message);
    if (specificWs) {
      try {
        specificWs.send(serializedMessage);
      } catch (e) {
        console.error(\`Failed to send to specific WS (\${specificWs.playerId}): \`, e);
        this.webSocketClose(specificWs, 1011, "Send error");
      }
    } else {
      this.websockets.forEach(ws => {
        try {
          console.log(\`Broadcasting to \${ws.playerId}: \`, message);
          ws.send(serializedMessage);
        } catch (e) {
          console.error(\`Failed to broadcast to WS (\${ws.playerId}): \`, e);
          // Handle failed send, possibly by removing the socket
          this.webSocketClose(ws, 1011, "Send error");
        }
      });
    }
  }

  // (Not yet used, but planned)
  // updateAndBroadcastGameState() {
  //   // Construct state for player 1
  //   // Construct state for player 2 (e.g., opponent's board has hidden ships)
  //   // this.broadcast(...)
  // }
}
