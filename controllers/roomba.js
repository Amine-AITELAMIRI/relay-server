const dorita980 = require('dorita980');
const EventEmitter = require('events');

/**
 * RoombaController - Manages iRobot Roomba and Braava devices
 * Uses dorita980 for local network control
 */
class RoombaController extends EventEmitter {
    constructor(config) {
        super();
        this.robots = new Map();
        this.config = config;
        this.pollingInterval = null;
        this.reconnectAttempts = new Map();
        
        // Initialize robots from config
        this.initializeRobots();
    }

    /**
     * Initialize robot connections
     */
    initializeRobots() {
        // Initialize Roomba j7
        if (this.config.roomba_j7?.ip && this.config.roomba_j7?.blid && this.config.roomba_j7?.password) {
            try {
                this.robots.set('roomba_j7', {
                    client: new dorita980.Local(
                        this.config.roomba_j7.blid,
                        this.config.roomba_j7.password,
                        this.config.roomba_j7.ip
                    ),
                    type: 'vacuum',
                    name: 'Roomba j7',
                    connected: false,
                    lastState: null
                });
                console.log('✅ Roomba j7 initialized');
            } catch (error) {
                console.error('❌ Failed to initialize Roomba j7:', error.message);
            }
        } else {
            console.warn('⚠️ Roomba j7 credentials not configured');
        }

        // Initialize Braava Jet
        if (this.config.braava_jet?.ip && this.config.braava_jet?.blid && this.config.braava_jet?.password) {
            try {
                this.robots.set('braava_jet', {
                    client: new dorita980.Local(
                        this.config.braava_jet.blid,
                        this.config.braava_jet.password,
                        this.config.braava_jet.ip
                    ),
                    type: 'mop',
                    name: 'Braava Jet',
                    connected: false,
                    lastState: null
                });
                console.log('✅ Braava Jet initialized');
            } catch (error) {
                console.error('❌ Failed to initialize Braava Jet:', error.message);
            }
        } else {
            console.warn('⚠️ Braava Jet credentials not configured');
        }
    }

    /**
     * Start a robot
     */
    async start(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot) {
            throw new Error(`Robot ${robotId} not found`);
        }

        try {
            await robot.client.start();
            console.log(`🤖 ${robot.name} started`);
            this.emit('command', { robotId, command: 'start', success: true });
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
        const robot = this.robots.get(robotId);
        if (!robot) {
            throw new Error(`Robot ${robotId} not found`);
        }

        try {
            await robot.client.pause();
            console.log(`⏸️ ${robot.name} paused`);
            this.emit('command', { robotId, command: 'pause', success: true });
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
        const robot = this.robots.get(robotId);
        if (!robot) {
            throw new Error(`Robot ${robotId} not found`);
        }

        try {
            await robot.client.stop();
            console.log(`⏹️ ${robot.name} stopped`);
            this.emit('command', { robotId, command: 'stop', success: true });
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
        const robot = this.robots.get(robotId);
        if (!robot) {
            throw new Error(`Robot ${robotId} not found`);
        }

        try {
            await robot.client.dock();
            console.log(`🏠 ${robot.name} returning to dock`);
            this.emit('command', { robotId, command: 'dock', success: true });
            return { status: 'docking', robot: robotId };
        } catch (error) {
            console.error(`❌ Failed to dock ${robot.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Get robot status
     */
    async getStatus(robotId) {
        const robot = this.robots.get(robotId);
        if (!robot) {
            throw new Error(`Robot ${robotId} not found`);
        }

        try {
            // Request state fields from robot
            const stateFields = ['cleanMissionStatus', 'batPct', 'bin', 'name', 'pose'];
            const state = await robot.client.getRobotState(stateFields);
            
            robot.connected = true;
            robot.lastState = state;

            const status = {
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

            return status;
        } catch (error) {
            console.error(`❌ Failed to get status for ${robot.name}:`, error.message);
            robot.connected = false;
            
            // Return disconnected status
            return {
                robot: robotId,
                name: robot.name,
                type: robot.type,
                connected: false,
                battery: 0,
                phase: 'disconnected',
                error: error.message,
                lastUpdate: new Date().toISOString()
            };
        }
    }

    /**
     * Clean specific room (Roomba j7 only)
     */
    async cleanRoom(robotId, roomId) {
        const robot = this.robots.get(robotId);
        if (!robot) {
            throw new Error(`Robot ${robotId} not found`);
        }

        if (robot.type !== 'vacuum') {
            throw new Error('Room cleaning only available for vacuum robots');
        }

        try {
            // Get current map ID
            const state = await robot.client.getRobotState(['pmaps']);
            const mapId = state.pmaps?.[0]?.id || '';

            await robot.client.cleanRoom({
                ordered: 1,
                pmap_id: mapId,
                regions: [{ region_id: roomId, type: 'rid' }]
            });

            console.log(`🤖 ${robot.name} cleaning room ${roomId}`);
            this.emit('command', { robotId, command: 'cleanRoom', roomId, success: true });
            return { status: 'cleaning_room', robot: robotId, room: roomId };
        } catch (error) {
            console.error(`❌ Failed to clean room for ${robot.name}:`, error.message);
            throw error;
        }
    }

    /**
     * Get all robots status
     */
    async getAllStatus() {
        const statuses = {};
        
        for (const [robotId] of this.robots) {
            try {
                statuses[robotId] = await this.getStatus(robotId);
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
        
        this.pollingInterval = setInterval(async () => {
            try {
                const statuses = await this.getAllStatus();
                this.emit('statusUpdate', statuses);
            } catch (error) {
                console.error('❌ Error during status polling:', error.message);
            }
        }, intervalMs);

        // Get initial status immediately
        this.getAllStatus()
            .then(statuses => this.emit('statusUpdate', statuses))
            .catch(error => console.error('❌ Error getting initial status:', error.message));
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
    async disconnect() {
        this.stopPolling();
        
        for (const [robotId, robot] of this.robots) {
            try {
                // dorita980 doesn't have explicit disconnect
                console.log(`👋 Disconnecting ${robot.name}`);
                robot.connected = false;
            } catch (error) {
                console.error(`❌ Error disconnecting ${robot.name}:`, error.message);
            }
        }
    }
}

module.exports = RoombaController;
