const express = require('express');
const { WebSocketServer } = require('ws');
const cors = require('cors');
require('dotenv').config();

// Prevent unhandled errors from crashing the server
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled rejection:', reason?.message || reason);
});

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ==================== STATE MANAGEMENT ====================
let esp32Socket = null;  // The connected ESP32 WebSocket (shutters)
let esp32IrrigationSocket = null;  // The connected ESP32 Irrigation WebSocket
let shuttersState = {
    s1: { pos: 0, dir: 0 },
    s2: { pos: 0, dir: 0 },
    s3: { pos: 0, dir: 0 },
    s4: { pos: 0, dir: 0 },
    lastUpdate: null
};

let irrigationState = {
    active: false,
    duration: 0,
    elapsed: 0,
    completion: 0,
    lastUpdate: null
};

let robotsState = {
    roomba_j7: { battery: 0, phase: 'unknown', connected: false, lastUpdate: null },
    braava_jet: { battery: 0, phase: 'unknown', connected: false, lastUpdate: null }
};

// Simple authentication (can be enhanced later)
const ESP32_SECRET = process.env.ESP32_SECRET || 'your-esp32-secret-key';
const ESP32_IRRIGATION_SECRET = process.env.ESP32_IRRIGATION_SECRET || 'my-super-secret-irrigation-key-54321';
const APP_SECRET = process.env.APP_SECRET || 'your-app-secret-key';

// ==================== HTTP API (for Mobile App) ====================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        esp32Connected: esp32Socket !== null && esp32Socket.readyState === 1,
        lastUpdate: shuttersState.lastUpdate
    });
});

// Get current shutter state
app.get('/api/state', (req, res) => {
    res.json(shuttersState);
});

// Send command to ESP32
app.post('/api/command', (req, res) => {
    const { token, action, channel, value } = req.body;

    // Simple auth check
    if (token !== APP_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate ESP32 connection
    if (!esp32Socket || esp32Socket.readyState !== 1) {
        return res.status(503).json({ error: 'ESP32 not connected' });
    }

    // Build command message
    const command = {
        type: 'COMMAND',
        action,    // 'OPEN', 'CLOSE', 'STOP', 'SET_LEVEL'
        channel,   // 1, 2, 3, 4, or 0 for all
        value      // for SET_LEVEL (0-100)
    };

    // Send to ESP32
    try {
        esp32Socket.send(JSON.stringify(command));
        res.json({ success: true, command });
    } catch (error) {
        console.error('Error sending command to ESP32:', error);
        res.status(500).json({ error: 'Failed to send command' });
    }
});

// Get schedules (proxy to ESP32)
app.get('/api/schedules', (req, res) => {
    if (!esp32Socket || esp32Socket.readyState !== 1) {
        return res.status(503).json({ error: 'ESP32 not connected' });
    }

    // Request schedules from ESP32
    const request = { type: 'GET_SCHEDULES' };
    esp32Socket.send(JSON.stringify(request));

    // Note: In production, you'd want to implement a request/response pattern
    // For now, return current state
    res.json({ message: 'Schedules request sent to ESP32' });
});

// ==================== ROBOT API ====================

// Get all robots status
app.get('/api/robots', (req, res) => {
    res.json(robotsState);
});

// Get specific robot status
app.get('/api/robots/:id', (req, res) => {
    const robotId = req.params.id;
    if (robotsState[robotId]) {
        res.json(robotsState[robotId]);
    } else {
        res.status(404).json({ error: 'Robot not found' });
    }
});

// Send command to robot (forwarded to ESP32 bridge)
app.post('/api/robots/:id/command', (req, res) => {
    const { token, command } = req.body;
    const robotId = req.params.id;

    if (token !== APP_SECRET) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!robotsState[robotId]) {
        return res.status(404).json({ error: 'Robot not found' });
    }

    if (!esp32Socket || esp32Socket.readyState !== 1) {
        return res.status(503).json({ error: 'ESP32 bridge not connected' });
    }

    // Forward command to ESP32 Roomba bridge
    esp32Socket.send(JSON.stringify({
        type: 'ROBOT_FORWARD_COMMAND',
        robotId,
        command
    }));

    res.json({ success: true, message: 'Command forwarded to ESP32 bridge' });
});

// ==================== WEBSOCKET SERVER (for ESP32 & App) ====================

const wss = new WebSocketServer({ noServer: true });

wss.on('connection', (ws, request) => {
    const clientType = request.url;

    if (clientType === '/esp32') {
        handleESP32Connection(ws);
    } else if (clientType === '/esp32-irrigation') {
        handleESP32IrrigationConnection(ws);
    } else if (clientType === '/app') {
        handleAppConnection(ws);
    } else {
        ws.close();
    }
});

// Handle ESP32 WebSocket connection
function handleESP32Connection(ws) {
    console.log('🔌 ESP32 connected');

    // Authenticate ESP32 (simple token in first message)
    let authenticated = false;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            // First message should be authentication
            if (!authenticated) {
                if (message.type === 'AUTH' && message.secret === ESP32_SECRET) {
                    authenticated = true;
                    esp32Socket = ws;
                    ws.send(JSON.stringify({ type: 'AUTH_OK' }));
                    console.log('✅ ESP32 authenticated');

                    // Request initial state
                    ws.send(JSON.stringify({ type: 'REQUEST_STATE' }));
                } else {
                    ws.send(JSON.stringify({ type: 'AUTH_FAILED' }));
                    ws.close();
                }
                return;
            }

            // Handle state updates from ESP32
            if (message.type === 'STATE') {
                shuttersState = {
                    ...message.data,
                    lastUpdate: new Date().toISOString()
                };
                console.log('📊 State updated:', shuttersState);

                // Broadcast to all connected apps
                broadcastToApps({
                    type: 'STATE_UPDATE',
                    data: shuttersState
                });
            }

            // Handle other ESP32 messages
            if (message.type === 'ACK') {
                console.log('✓ ESP32 acknowledged command');
            }

            // Handle robot state updates from ESP32 Roomba bridge
            if (message.type === 'ROBOT_STATE') {
                robotsState = {
                    ...message.data,
                    lastUpdate: new Date().toISOString()
                };
                console.log('🤖 Robot state updated from ESP32');

                broadcastToApps({
                    type: 'ROBOT_STATE_UPDATE',
                    data: robotsState
                });
            }

            // Handle robot command response from ESP32
            if (message.type === 'ROBOT_RESPONSE') {
                console.log('🤖 Robot command response:', message);
                broadcastToApps(message);
            }

        } catch (error) {
            console.error('Error parsing ESP32 message:', error);
        }
    });

    ws.on('close', () => {
        console.log('❌ ESP32 disconnected');
        if (esp32Socket === ws) {
            esp32Socket = null;

            // Mark robots as disconnected when ESP32 bridge goes offline
            for (const robotId of Object.keys(robotsState)) {
                if (robotsState[robotId] && typeof robotsState[robotId] === 'object') {
                    robotsState[robotId].connected = false;
                }
            }
            broadcastToApps({
                type: 'ROBOT_STATE_UPDATE',
                data: robotsState
            });
        }
    });

    ws.on('error', (error) => {
        console.error('ESP32 WebSocket error:', error);
    });
}

// Handle ESP32 Irrigation WebSocket connection
function handleESP32IrrigationConnection(ws) {
    console.log('💧 ESP32 Irrigation connected');

    // Authenticate ESP32 (simple token in first message)
    let authenticated = false;

    ws.on('message', (data) => {
        try {
            const message = JSON.parse(data.toString());

            // First message should be authentication
            if (!authenticated) {
                if (message.type === 'AUTH' && message.secret === ESP32_IRRIGATION_SECRET) {
                    authenticated = true;
                    esp32IrrigationSocket = ws;
                    ws.send(JSON.stringify({ type: 'AUTH_OK' }));
                    console.log('✅ ESP32 Irrigation authenticated');

                    // Request initial state
                    ws.send(JSON.stringify({ type: 'REQUEST_STATE' }));
                } else {
                    ws.send(JSON.stringify({ type: 'AUTH_FAILED' }));
                    ws.close();
                }
                return;
            }

            // Handle state updates from ESP32 Irrigation
            if (message.type === 'IRRIGATION_STATE') {
                irrigationState = {
                    ...message.data,
                    lastUpdate: new Date().toISOString()
                };
                console.log('💧 Irrigation state updated:', irrigationState);

                // Broadcast to all connected apps
                broadcastToApps({
                    type: 'IRRIGATION_STATE',
                    data: irrigationState
                });
            }

            // Handle command completion from ESP32 Irrigation
            if (message.type === 'IRRIGATION_COMMAND_COMPLETE') {
                console.log('✓ Irrigation command completed');
                broadcastToApps(message);
            }

        } catch (error) {
            console.error('Error parsing ESP32 Irrigation message:', error);
        }
    });

    ws.on('close', () => {
        console.log('❌ ESP32 Irrigation disconnected');
        if (esp32IrrigationSocket === ws) {
            esp32IrrigationSocket = null;
        }
    });

    ws.on('error', (error) => {
        console.error('ESP32 Irrigation WebSocket error:', error);
    });
}

// Handle Mobile App WebSocket connection
function handleAppConnection(ws) {
    console.log('📱 Mobile app connected');

    // Send current state immediately
    ws.send(JSON.stringify({
        type: 'STATE_UPDATE',
        data: shuttersState
    }));

    ws.on('message', async (data) => {
        try {
            const message = JSON.parse(data.toString());

            // Apps can also send commands via WebSocket
            if (message.type === 'COMMAND' && message.token === APP_SECRET) {
                if (esp32Socket && esp32Socket.readyState === 1) {
                    esp32Socket.send(JSON.stringify({
                        type: 'COMMAND',
                        action: message.action,
                        channel: message.channel,
                        value: message.value
                    }));
                }
            }

            // Handle irrigation commands via WebSocket
            if (message.type === 'IRRIGATION_COMMAND' && message.token === APP_SECRET) {
                if (esp32IrrigationSocket && esp32IrrigationSocket.readyState === 1) {
                    esp32IrrigationSocket.send(JSON.stringify(message));
                    ws.send(JSON.stringify({
                        type: 'IRRIGATION_RESPONSE',
                        success: true
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type: 'IRRIGATION_RESPONSE',
                        success: false,
                        error: 'Irrigation ESP32 not connected'
                    }));
                }
            }

            // Handle robot commands via WebSocket — forward to ESP32 bridge
            if (message.type === 'ROBOT_COMMAND' && message.token === APP_SECRET) {
                const { robotId, command } = message;

                if (esp32Socket && esp32Socket.readyState === 1) {
                    esp32Socket.send(JSON.stringify({
                        type: 'ROBOT_FORWARD_COMMAND',
                        robotId,
                        command
                    }));
                    ws.send(JSON.stringify({
                        type: 'ROBOT_RESPONSE',
                        success: true
                    }));
                } else {
                    ws.send(JSON.stringify({
                        type: 'ROBOT_RESPONSE',
                        success: false,
                        error: 'ESP32 Roomba bridge not connected'
                    }));
                }
            }
        } catch (error) {
            console.error('Error parsing app message:', error);
        }
    });

    ws.on('close', () => {
        console.log('📱 Mobile app disconnected');
    });
}

// Broadcast state updates to all connected mobile apps
function broadcastToApps(message) {
    wss.clients.forEach((client) => {
        if (client.readyState === 1 && client !== esp32Socket) {
            client.send(JSON.stringify(message));
        }
    });
}

// ==================== ROBOT STATE (via ESP32 bridge) ====================

// ==================== HTTP SERVER SETUP ====================

const server = app.listen(PORT, () => {
    console.log(`🚀 Relay Server running on port ${PORT}`);
    console.log(`📡 WebSocket endpoints:`);
    console.log(`   - /esp32             (for ESP32 Shutters)`);
    console.log(`   - /esp32-irrigation  (for ESP32 Irrigation)`);
    console.log(`   - /app               (for dashboard/mobile apps)`);
});

// Upgrade HTTP connections to WebSocket
server.on('upgrade', (request, socket, head) => {
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, closing server...');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});
