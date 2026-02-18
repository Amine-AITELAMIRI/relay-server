// iRobot devices use self-signed TLS certificates - must disable rejection
// before loading dorita980 to prevent Node.js from crashing on connection
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const dorita980 = require('dorita980');
const EventEmitter = require('events');

/**
 * RoombaController - Manages iRobot Roomba and Braava devices
 * Uses dorita980 for local network control via MQTT
 */
class RoombaController extends EventEmitter {
    constructor(config) {
        super();
        this.robots = new Map();
        this.config = config;
        this.pollingInterval = null;

        // Initialize robots from config
        this.initializeRobots();
    }

    /**
     * Initialize robot connections
     */
    initializeRobots() {
        // Initialize Roomba j7
        if (this.config.roomba_j7?.ip && this.config.roomba_j7?.blid && this.config.roomba_j7?.password) {
            this._initRobot('roomba_j7', this.config.roomba_j7, 'vacuum', 'Roomba j7');
        } else {
            console.warn('⚠️ Roomba j7 credentials not configured');
        }

        // Initialize Braava Jet
        if (this.config.braava_jet?.ip && this.config.braava_jet?.blid && this.config.braava_jet?.password) {
            this._initRobot('braava_jet', this.config.braava_jet, 'mop', 'Braava Jet');
        } else {
            console.warn('⚠️ Braava Jet credentials not configured');
        }
    }

    /**
     * Initialize a single robot with proper error handling
     */
    _initRobot(robotId, config, type, name) {
        try {
            const client = new dorita980.Local(
                config.blid,
                config.password,
                config.ip
            );

            // Override dorita980's built-in error handler that throws
            // We need to remove all existing 'error' listeners first
            client.removeAllListeners('error');

            client.on('error', (err) => {
                console.error(`❌ ${name} MQTT error:`, err.message);
                const robot = this.robots.get(robotId);
                if (robot) robot.connected = false;
            });

            client.on('connect', () => {
                console.log(`🟢 ${name} MQTT connected!`);
                const robot = this.robots.get(robotId);
                if (robot) robot.connected = true;
            });

            client.on('close', () => {
                console.warn(`⚠️ ${name} connection closed`);
                const robot = this.robots.get(robotId);
                if (robot) robot.connected = false;
            });

            client.on('offline', () => {
                console.warn(`📴 ${name} went offline`);
                const robot = this.robots.get(robotId);
                if (robot) robot.connected = false;
            });

            // Listen for state updates from the robot
            client.on('state', (state) => {
                const robot = this.robots.get(robotId);
                if (robot) {
                    robot.lastState = state;
                    robot.connected = true;
                }
            });

            this.robots.set(robotId, {
                client,
                type,
                name,
                connected: false,
                lastState: null
            });

            console.log(`✅ ${name} initialized (connecting to ${config.ip}...)`);
        } catch (error) {
            console.error(`❌ Failed to initialize ${name}:`, error.message);
        }
    }

    /**
     * Start a robot
     */
    async start(robotId) {
        const robot = this._getConnectedRobot(robotId);
        try {
            await robot.client.start();
            console.log(`🤖 ${robot.name} started`);
            return { status: 'started', robot: robotId };
        } catch (error) {
            console.error(`❌ Failed to start ${robot.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Pause a robot
     */
    async pause(robotId) {
        const robot = this._getConnectedRobot(robotId);
        try {
            await robot.client.pause();
            console.log(`⏸️ ${robot.name} paused`);
            return { status: 'paused', robot: robotId };
        } catch (error) {
            console.error(`❌ Failed to pause ${robot.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Stop a robot
     */
    async stop(robotId) {
        const robot = this._getConnectedRobot(robotId);
        try {
            await robot.client.stop();
            console.log(`⏹️ ${robot.name} stopped`);
            return { status: 'stopped', robot: robotId };
        } catch (error) {
            console.error(`❌ Failed to stop ${robot.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Send robot back to dock
     */
    async dock(robotId) {
        const robot = this._getConnectedRobot(robotId);
        try {
            await robot.client.dock();
            console.log(`🏠 ${robot.name} returning to dock`);
            return { status: 'docking', robot: robotId };
        } catch (error) {
            console.error(`❌ Failed to dock ${robot.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Get a robot and verify it exists
     */
    _getConnectedRobot(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot) {
            throw new Error(`Robot ${robotId} not found`);
        }
        return robot;
    }

    /**
     * Get robot status - uses cached state from MQTT stream instead of
     * calling getRobotState() which can hang if connection is not ready
     */
    getStatus(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot) {
            throw new Error(`Robot ${robotId} not found`);
        }

        const state = robot.lastState;

        if (!robot.connected || !state) {
            return {
                robot: robotId,
                name: robot.name,
                type: robot.type,
                connected: robot.connected,
                battery: 0,
                phase: robot.connected ? 'waiting' : 'disconnected',
                error: robot.connected ? null : 'Not connected to robot',
                lastUpdate: new Date().toISOString()
            };
        }

        return {
            robot: robotId,
            name: robot.name,
            type: robot.type,
            connected: true,
            battery: state.batPct || 0,
            phase: state.cleanMissionStatus?.phase || 'unknown',
            cycle: state.cleanMissionStatus?.cycle || 'none',
            binFull: state.bin?.full || false,
            error: state.cleanMissionStatus?.error || null,
            position: state.pose || null,
            lastUpdate: new Date().toISOString()
        };
    }

    /**
     * Clean specific room (Roomba j7 only)
     */
    async cleanRoom(robotId, roomId) {
        const robot = this._getConnectedRobot(robotId);

        if (robot.type !== 'vacuum') {
            throw new Error('Room cleaning only available for vacuum robots');
        }

        try {
            // Use cached state for map ID
            const mapId = robot.lastState?.pmaps?.[0]?.id || '';

            await robot.client.cleanRoom({
                ordered: 1,
                pmap_id: mapId,
                regions: [{ region_id: roomId, type: 'rid' }]
            });

            console.log(`🤖 ${robot.name} cleaning room ${roomId}`);
            return { status: 'cleaning_room', robot: robotId, room: roomId };
        } catch (error) {
            console.error(`❌ Failed to clean room for ${robot.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Get all robots status (synchronous - uses cached state)
     */
    getAllStatus() {
        const statuses = {};

        for (const [robotId] of this.robots) {
            try {
                statuses[robotId] = this.getStatus(robotId);
            } catch (error) {
                statuses[robotId] = {
                    robot: robotId,
                    connected: false,
                    error: error.message
                };
            }
        }

        return statuses;
    }

    /**
     * Start polling robot statuses
     */
    startPolling(intervalMs = 30000) {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
        }

        console.log(`🔄 Starting robot status polling (${intervalMs}ms interval)`);

        this.pollingInterval = setInterval(() => {
            try {
                const statuses = this.getAllStatus();
                this.emit('statusUpdate', statuses);
            } catch (error) {
                console.error('❌ Error during status polling:', error.message);
            }
        }, intervalMs);

        // Get initial status immediately
        try {
            const statuses = this.getAllStatus();
            this.emit('statusUpdate', statuses);
        } catch (error) {
            console.error('❌ Error getting initial status:', error.message);
        }
    }

    /**
     * Stop polling
     */
    stopPolling() {
        if (this.pollingInterval) {
            clearInterval(this.pollingInterval);
            this.pollingInterval = null;
            console.log('⏹️ Robot status polling stopped');
        }
    }

    /**
     * Get list of configured robots
     */
    getRobotList() {
        const list = [];
        for (const [robotId, robot] of this.robots) {
            list.push({
                id: robotId,
                name: robot.name,
                type: robot.type,
                connected: robot.connected
            });
        }
        return list;
    }

    /**
     * Cleanup and disconnect
     */
    disconnect() {
        this.stopPolling();

        for (const [robotId, robot] of this.robots) {
            try {
                console.log(`👋 Disconnecting ${robot.name}`);
                if (robot.client && typeof robot.client.end === 'function') {
                    robot.client.end();
                }
                robot.connected = false;
            } catch (error) {
                console.error(`❌ Error disconnecting ${robot.name}:`, error.message);
            }
        }
    }
}

module.exports = RoombaController;
