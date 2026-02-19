const { createClient } = require('@supabase/supabase-js');

class DatabaseService {
    constructor() {
        this.supabase = null;
        this.enabled = false;
    }

    initialize(url, key) {
        if (!url || !key) {
            console.warn('⚠️ Supabase credentials missing. Database logging disabled.');
            return;
        }

        try {
            this.supabase = createClient(url, key);
            this.enabled = true;
            console.log('✅ Supabase client initialized');
        } catch (error) {
            console.error('❌ Failed to initialize Supabase:', error);
        }
    }

    async logIrrigation(action, duration = 0, waterUsed = 0) {
        if (!this.enabled) return;

        try {
            const { error } = await this.supabase
                .from('irrigation_logs')
                .insert({
                    action,
                    duration,
                    water_used: waterUsed,
                    details: { timestamp: new Date().toISOString() }
                });

            if (error) throw error;
            console.log(`📝 Logged irrigation ${action}`);
        } catch (error) {
            console.error('❌ Failed to log irrigation:', error.message);
        }
    }

    async logRobotMission(robotId, action, status, details = {}) {
        if (!this.enabled) return;

        try {
            const { error } = await this.supabase
                .from('robot_logs')
                .insert({
                    robot_id: robotId,
                    action,
                    status,
                    details
                });

            if (error) throw error;
            console.log(`📝 Logged robot ${robotId} ${action}`);
        } catch (error) {
            console.error('❌ Failed to log robot mission:', error.message);
        }
    }

    async getIrrigationHistory(limit = 10) {
        if (!this.enabled) return [];

        try {
            const { data, error } = await this.supabase
                .from('irrigation_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('❌ Failed to fetch irrigation history:', error.message);
            return [];
        }
    }

    async getRobotHistory(limit = 10) {
        if (!this.enabled) return [];

        try {
            const { data, error } = await this.supabase
                .from('robot_logs')
                .select('*')
                .order('created_at', { ascending: false })
                .limit(limit);

            if (error) throw error;
            return data;
        } catch (error) {
            console.error('❌ Failed to fetch robot history:', error.message);
            return [];
        }
    }
}

module.exports = new DatabaseService();
