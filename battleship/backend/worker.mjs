// Import the Durable Object class
import { BattleshipGameDO } from './battleship-do.mjs';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathSegments = url.pathname.split('/').filter(segment => segment); // e.g., ['', 'api', 'game', ':gameId'] -> ['api', 'game', ':gameId']

    // Route for creating a new game or connecting to an existing one via WebSocket
    // Example path: /api/game/:gameId? or /api/game (for creation)
    if (pathSegments.length >= 2 && pathSegments[0] === 'api' && pathSegments[1] === 'game') {
      let gameId;
      if (request.method === 'POST' && pathSegments.length === 2) { // POST /api/game to create
        // Generate a new unique game ID for the Durable Object instance
        gameId = env.BATTLESHIP_GAME.newUniqueId().toString();
        console.log(\`New game created with ID: \${gameId}\`);
        // Construct a new URL for the DO, including the gameId, so the client can use it.
        // The client will then make a WebSocket request to this new URL.
        // Or, more commonly, the client would be returned the gameId, and then make a GET request to /api/game/${gameId} for the WebSocket.
        // For simplicity in this step, let's assume the client is given the gameId and makes a new request.
        // We will return the gameId so the client can then establish a WebSocket connection.
         return new Response(JSON.stringify({ gameId: gameId }), {
          headers: { 'Content-Type': 'application/json' },
        });

      } else if (request.method === 'GET' && pathSegments.length === 3) { // GET /api/game/:gameId to connect
        gameId = pathSegments[2];
      } else {
        return new Response('Not found or invalid request method for /api/game', { status: 404 });
      }

      if (!gameId) {
         return new Response('Game ID is required.', { status: 400 });
      }

      // Get the Durable Object stub.
      // The ID is derived from the gameId string.
      const doId = env.BATTLESHIP_GAME.idFromString(gameId);
      const stub = env.BATTLESHIP_GAME.get(doId);

      // Forward the request to the Durable Object instance.
      // This will handle the WebSocket upgrade if headers are present.
      console.log(\`Forwarding request for game \${gameId} (DO ID: \${doId}) to Durable Object\`);
      return stub.fetch(request);

    }

    return new Response('Not found. Try /api/game/:gameId or POST to /api/game', { status: 404 });
  },
};

// Export the Durable Object class for the Cloudflare runtime
export { BattleshipGameDO };
