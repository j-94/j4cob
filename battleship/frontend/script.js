// DOM Elements
const createGameBtn = document.getElementById('create-game-btn');
const joinGameBtn = document.getElementById('join-game-btn');
const gameIdInput = document.getElementById('game-id-input');
const playerIdDisplay = document.getElementById('player-id-display');
const gameIdDisplay = document.getElementById('game-id-display');
const statusMessage = document.getElementById('status-message');
const shipPlacementUI = document.getElementById('ship-placement-ui');
const readyBtn = document.getElementById('ready-btn'); // Placeholder for ship placement readiness
const gridsContainer = document.getElementById('grids-container');
const playerGrid = document.getElementById('player-grid');
const opponentGrid = document.getElementById('opponent-grid');
const gameSetupDiv = document.getElementById('game-setup');

// Game State Variables
let ws = null;
let localPlayerId = null;
let localGameId = null;
let myBoard = Array(10).fill(null).map(() => Array(10).fill(0)); // 0: empty, 1: ship, 2: hit, 3: miss
let opponentBoardView = Array(10).fill(null).map(() => Array(10).fill(0)); // For opponent's grid: 0: unknown, 2: hit, 3: miss
let currentTurnPlayerId = null;
let gamePhase = 'SETUP'; // SETUP, PLACEMENT, BATTLE, GAMEOVER

// --- WebSocket Base URL ---
// IMPORTANT: Replace with your actual Cloudflare Worker URL
// If running locally with wrangler dev, it's usually http://localhost:8787
// For WebSockets, use ws:// or wss://
// const WEBSOCKET_BASE_URL = 'ws://localhost:8787'; // For local testing
const WEBSOCKET_BASE_URL = `wss://${location.hostname}/api/game`; // Assumes worker is on same domain, or specify full domain


// --- Event Listeners ---
createGameBtn.addEventListener('click', handleCreateGame);
joinGameBtn.addEventListener('click', handleJoinGame);
readyBtn.addEventListener('click', handleReadyClick); // Placeholder


// --- Core Functions ---
async function handleCreateGame() {
    statusMessage.textContent = 'Creating game...';
    try {
        // The worker's POST /api/game route should return the gameId
        const response = await fetch(`/api/game`, { method: 'POST' }); // Adjust URL if worker is elsewhere
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        if (data.gameId) {
            localGameId = data.gameId;
            statusMessage.textContent = `Game created! ID: ${localGameId}. Waiting for opponent...`;
            gameIdDisplay.textContent = localGameId;
            connectToGame(localGameId);
        } else {
            throw new Error('Failed to get gameId from server.');
        }
    } catch (error) {
        console.error('Error creating game:', error);
        statusMessage.textContent = `Error creating game: ${error.message}`;
    }
}

function handleJoinGame() {
    const gameIdToJoin = gameIdInput.value.trim();
    if (!gameIdToJoin) {
        statusMessage.textContent = 'Please enter a Game ID to join.';
        return;
    }
    localGameId = gameIdToJoin;
    statusMessage.textContent = `Joining game ${localGameId}...`;
    gameIdDisplay.textContent = localGameId;
    connectToGame(localGameId);
}

function connectToGame(gameId) {
    if (ws) {
        ws.close();
    }
    
    const wsUrl = `${WEBSOCKET_BASE_URL}/${gameId}`;
    console.log(`Connecting to WebSocket: ${wsUrl}`);
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        console.log('WebSocket connection established.');
        statusMessage.textContent = 'Connected! Sending join game message...';
        // The DO's fetch handler will assign player ID on connection.
        // We send a JOIN_GAME message for the DO to confirm and process the new client.
        sendMessage({ type: "JOIN_GAME" }); 
        gameSetupDiv.style.display = 'none'; // Hide setup buttons
    };

    ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log('Message from server:', message);
        handleServerMessage(message);
    };

    ws.onclose = (event) => {
        console.log('WebSocket connection closed:', event.code, event.reason);
        statusMessage.textContent = `Disconnected: ${event.reason || 'Connection closed'}. Refresh to reconnect.`;
        ws = null;
        // Optionally show game setup again or a reconnect button
        // gameSetupDiv.style.display = 'block';
        // gridsContainer.style.display = 'none';
        // shipPlacementUI.style.display = 'none';
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        statusMessage.textContent = 'Connection error. See console for details.';
    };
}

function sendMessage(message) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
    } else {
        console.error('WebSocket is not open. Cannot send message:', message);
        statusMessage.textContent = 'Not connected to server. Cannot send message.';
    }
}

function handleServerMessage(message) {
    statusMessage.textContent = message.payload?.message || message.type;

    switch (message.type) {
        case 'PLAYER_ASSIGNED':
            localPlayerId = message.payload.playerId;
            playerIdDisplay.textContent = localPlayerId;
            statusMessage.textContent = `You are ${localPlayerId}. Game status: ${message.payload.gameStatus}`;
            if (message.payload.gameStatus === 'SHIP_PLACEMENT') {
                gamePhase = 'PLACEMENT';
                shipPlacementUI.style.display = 'block';
                gridsContainer.style.display = 'flex'; // Show grids for placement
                renderGrids(); // Initial render for placement
            } else if (message.payload.gameStatus === 'AWAITING_OPPONENT') {
                statusMessage.textContent = "Waiting for opponent to connect...";
            }
            break;

        case 'GAME_UPDATE':
            // This can be a more generic update
            if(message.payload.gameStatus) {
                gamePhase = message.payload.gameStatus; // Assuming server gameStatus matches client gamePhase values
                statusMessage.textContent = `Game status: ${message.payload.gameStatus}. ${message.payload.message || ''}`;
                 if (message.payload.currentPlayerId) {
                    currentTurnPlayerId = message.payload.currentPlayerId;
                    if (currentTurnPlayerId === localPlayerId) {
                        statusMessage.textContent += " It's YOUR turn!";
                    } else {
                        statusMessage.textContent += ` Waiting for ${currentTurnPlayerId}.`;
                    }
                }
            }
            if (message.payload.yourBoard) { // Server might send specific board updates
                myBoard = message.payload.yourBoard;
            }
            if (message.payload.opponentBoardView) { // Server might send specific board updates
                opponentBoardView = message.payload.opponentBoardView;
            }

            if (gamePhase === 'SHIP_PLACEMENT' && !shipPlacementUI.style.display !== 'none') {
                 shipPlacementUI.style.display = 'block';
                 gridsContainer.style.display = 'flex';
            } else if (gamePhase.includes("TURN") || gamePhase.includes("BATTLE")) { // e.g. PLAYER_1_TURN
                shipPlacementUI.style.display = 'none';
                gridsContainer.style.display = 'flex';
                gamePhase = 'BATTLE'; // Generic battle phase for UI
            } else if (gamePhase === 'GAME_OVER') {
                shipPlacementUI.style.display = 'none';
                gridsContainer.style.display = 'flex';
                // display winner, etc.
            }
            renderGrids();
            break;
        
        case 'MOVE_RESULT':
            // Payload: { x, y, result: 'HIT'/'MISS'/'SUNK', shipSunk: 'destroyer' (optional), nextTurn: 'playerId', boardOwner: 'playerId' }
            const { x, y, result, shipSunk, nextTurn, boardOwner } = message.payload;
            const targetBoard = (boardOwner === localPlayerId) ? myBoard : opponentBoardView;
            targetBoard[x][y] = (result === 'HIT' || result === 'SUNK') ? 2 : 3; // 2 for hit, 3 for miss
            
            renderGrids(); // Re-render to show the hit/miss

            let turnMsg = "";
            currentTurnPlayerId = nextTurn;
            if (currentTurnPlayerId === localPlayerId) {
                turnMsg = "It's YOUR turn!";
            } else {
                turnMsg = `Waiting for opponent.`;
            }
            statusMessage.textContent = `Shot at (${x},${y}) was a ${result}! ${shipSunk ? 'Sunk ' + shipSunk + '! ' : ''}${turnMsg}`;
            break;

        case 'OPPONENT_DISCONNECTED':
            statusMessage.textContent = `Opponent disconnected. ${message.payload.message || 'Game may reset or await new player.'}`;
            gamePhase = message.payload.gameStatus || 'SETUP'; // Reset to setup or specific status
            if(gamePhase === 'AWAITING_OPPONENT'){
                // Potentially hide grids, show setup again if game effectively resets.
                // gridsContainer.style.display = 'none';
                // shipPlacementUI.style.display = 'none';
            }
            break;

        case 'GAME_OVER':
            gamePhase = 'GAMEOVER';
            statusMessage.textContent = `GAME OVER! Winner: ${message.payload.winnerId}. ${message.payload.message || ''}`;
            // Disable grids or further actions
            opponentGrid.removeEventListener('click', handleOpponentGridClick); // Example of disabling
            break;

        case 'ERROR':
            console.error('Server error:', message.payload.message);
            statusMessage.textContent = `Error: ${message.payload.message}`;
            break;
        
        case 'INFO': // Generic info message from server
             statusMessage.textContent = `Info: ${message.payload.message}`;
             break;

        default:
            console.warn('Unknown message type from server:', message.type);
    }
}


// --- Rendering Functions ---
function renderGrids() {
    renderGrid(playerGrid, myBoard, false); // Player's own board, show ships
    renderGrid(opponentGrid, opponentBoardView, true); // Opponent's board, hide ships, allow clicks
}

function renderGrid(gridElement, boardData, isOpponentGrid) {
    gridElement.innerHTML = ''; // Clear previous state
    for (let i = 0; i < 10; i++) {
        for (let j = 0; j < 10; j++) {
            const cell = document.createElement('div');
            cell.classList.add('grid-cell');
            cell.dataset.row = i;
            cell.dataset.col = j;

            // Cell states: 0: empty, 1: ship, 2: hit, 3: miss
            const cellState = boardData[i][j];
            if (isOpponentGrid) {
                if (cellState === 2) cell.classList.add('hit');      // Hit
                else if (cellState === 3) cell.classList.add('miss'); // Miss
                else cell.addEventListener('click', handleOpponentGridClick); // Only add listener to unknown cells
                if (cellState === 2 || cellState === 3) cell.classList.add('fired');
            } else { // Player's own grid
                if (cellState === 1) cell.classList.add('ship');    // Ship
                else if (cellState === 2) cell.classList.add('hit'); // Hit on own ship
                else if (cellState === 3) cell.classList.add('miss'); // Should not happen on player's own ships grid if logic is correct
            }
            gridElement.appendChild(cell);
        }
    }
}

// --- Action Handlers ---
function handleOpponentGridClick(event) {
    if (gamePhase !== 'BATTLE' || currentTurnPlayerId !== localPlayerId) {
        statusMessage.textContent = "Not your turn or game not in battle phase!";
        if(currentTurnPlayerId !== localPlayerId && gamePhase === 'BATTLE') statusMessage.textContent = `Wait for ${currentTurnPlayerId}`;
        return;
    }

    const cell = event.target;
    if (cell.classList.contains('hit') || cell.classList.contains('miss')) {
        statusMessage.textContent = 'Cell already targeted.';
        return;
    }

    const row = parseInt(cell.dataset.row);
    const col = parseInt(cell.dataset.col);

    sendMessage({
        type: 'FIRE_SHOT',
        payload: { x: row, y: col }
    });
    statusMessage.textContent = `Fired at (${row}, ${col}). Waiting for result...`;
}

function handleReadyClick() {
    // Simplified ship placement: client sends a default layout or indicates readiness
    // In a real game, this would collect ship positions from the UI.
    const defaultShips = [ /* Define some default ship objects if needed for auto-placement */ ];
    sendMessage({ type: 'PLACE_SHIPS', payload: { ships: defaultShips } }); // Or just a ready signal
    statusMessage.textContent = 'Sent ship placement. Waiting for opponent...';
    readyBtn.disabled = true; // Prevent multiple clicks
    // The server should then validate and confirm, then transition game state.
}


// --- Initial UI Setup ---
function initializeUI() {
    renderGrids(); // Render empty grids initially
    // Other UI setup as needed
}

// Initialize UI on load
initializeUI();
