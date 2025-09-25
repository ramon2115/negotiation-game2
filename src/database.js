import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Database connection pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/negotiation_game',
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

// Test connection on startup
pool.on('connect', () => {
    console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
    console.error('❌ Database connection error:', err);
    process.exit(-1);
});

// Database helper functions
export class Database {
    static async query(text, params) {
        const start = Date.now();
        try {
            const res = await pool.query(text, params);
            const duration = Date.now() - start;
            console.log(`🗄️ Query executed in ${duration}ms: ${text.substring(0, 50)}...`);
            return res;
        } catch (error) {
            console.error('❌ Database query error:', error);
            throw error;
        }
    }

    // User operations
    static async createUser(userData) {
        const {
            name,
            surveyResponses = null,
            surveyCompleted = false,
            roomId = null
        } = userData;

        const query = `
            INSERT INTO users (name, survey_responses, survey_completed, room_id)
            VALUES ($1, $2, $3, $4)
            RETURNING *
        `;
        const result = await this.query(query, [name, surveyResponses, surveyCompleted, roomId]);
        return result.rows[0];
    }

    static async getUserById(userId) {
        const result = await this.query('SELECT * FROM users WHERE id = $1', [userId]);
        return result.rows[0];
    }

    static async updateUser(userId, updates) {
        const setClause = Object.keys(updates)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');
        
        const query = `UPDATE users SET ${setClause}, last_active = CURRENT_TIMESTAMP WHERE id = $1 RETURNING *`;
        const values = [userId, ...Object.values(updates)];
        
        const result = await this.query(query, values);
        return result.rows[0];
    }

    static async getUsersByRoom(roomId) {
        const result = await this.query('SELECT * FROM users WHERE room_id = $1', [roomId]);
        return result.rows;
    }

    // Room operations
    static async createRoom(roomData) {
        const { id, name, description, imageUrl, products, config = {} } = roomData;
        
        const query = `
            INSERT INTO rooms (id, name, description, image_url, products, config)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (id) DO UPDATE SET
                name = $2, description = $3, image_url = $4, products = $5, config = $6
            RETURNING *
        `;
        
        const result = await this.query(query, [id, name, description, imageUrl, products, config]);
        return result.rows[0];
    }

    static async getRoomById(roomId) {
        const result = await this.query('SELECT * FROM rooms WHERE id = $1', [roomId]);
        return result.rows[0];
    }

    static async getAllRooms() {
        const result = await this.query('SELECT * FROM rooms ORDER BY created_at');
        return result.rows;
    }

    static async updateRoom(roomId, updates) {
        const setClause = Object.keys(updates)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');
        
        const query = `UPDATE rooms SET ${setClause} WHERE id = $1 RETURNING *`;
        const values = [roomId, ...Object.values(updates)];
        
        const result = await this.query(query, values);
        return result.rows[0];
    }

    // Pair operations
    static async createPair(pairData) {
        const {
            roomId,
            userAId,
            userBId,
            roundNumber,
            product
        } = pairData;

        const query = `
            INSERT INTO pairs (room_id, user_a_id, user_b_id, round_number, product)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING *
        `;
        
        const result = await this.query(query, [roomId, userAId, userBId, roundNumber, product]);
        return result.rows[0];
    }

    static async getPairById(pairId) {
        const query = `
            SELECT p.*, 
                   ua.name as user_a_name, ua.role as user_a_role,
                   ub.name as user_b_name, ub.role as user_b_role
            FROM pairs p
            JOIN users ua ON p.user_a_id = ua.id
            JOIN users ub ON p.user_b_id = ub.id
            WHERE p.id = $1
        `;
        const result = await this.query(query, [pairId]);
        return result.rows[0];
    }

    static async getPairByUserId(userId) {
        const query = `
            SELECT p.*, 
                   ua.name as user_a_name, ua.role as user_a_role,
                   ub.name as user_b_name, ub.role as user_b_role
            FROM pairs p
            JOIN users ua ON p.user_a_id = ua.id
            JOIN users ub ON p.user_b_id = ub.id
            WHERE (p.user_a_id = $1 OR p.user_b_id = $1) AND p.status = 'active'
        `;
        const result = await this.query(query, [userId]);
        return result.rows[0];
    }

    static async updatePair(pairId, updates) {
        const setClause = Object.keys(updates)
            .map((key, index) => `${key} = $${index + 2}`)
            .join(', ');
        
        const query = `UPDATE pairs SET ${setClause} WHERE id = $1 RETURNING *`;
        const values = [pairId, ...Object.values(updates)];
        
        const result = await this.query(query, values);
        return result.rows[0];
    }

    // Message operations
    static async saveMessage(messageData) {
        const {
            pairId,
            userId,
            userName,
            role,
            message,
            extractedOffer = null,
            offerConfidence = null,
            metadata = {}
        } = messageData;

        const query = `
            INSERT INTO messages (pair_id, user_id, user_name, role, message, extracted_offer, offer_confidence, metadata)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING *
        `;
        
        const result = await this.query(query, [
            pairId, userId, userName, role, message, extractedOffer, offerConfidence, metadata
        ]);
        return result.rows[0];
    }

    static async getMessagesByPair(pairId) {
        const result = await this.query(
            'SELECT * FROM messages WHERE pair_id = $1 ORDER BY timestamp',
            [pairId]
        );
        return result.rows;
    }

    // Game configuration
    static async getGameConfig() {
        const result = await this.query('SELECT config FROM game_config WHERE id = $1', ['main']);
        return result.rows[0]?.config || null;
    }

    static async updateGameConfig(config, updatedBy = 'system') {
        const query = `
            UPDATE game_config 
            SET config = $1, updated_at = CURRENT_TIMESTAMP, updated_by = $2 
            WHERE id = 'main'
            RETURNING *
        `;
        const result = await this.query(query, [config, updatedBy]);
        return result.rows[0];
    }

    // Analytics & Stats
    static async getGameStats() {
        const result = await this.query(`
            SELECT 
                (SELECT COUNT(*) FROM users) as total_users,
                (SELECT COUNT(*) FROM rooms WHERE status = 'active') as active_rooms,
                (SELECT COUNT(*) FROM pairs WHERE status = 'active') as active_pairs,
                (SELECT COUNT(*) FROM pairs WHERE final_deal IS NOT NULL) as completed_deals
        `);
        return result.rows[0];
    }

    // Cleanup operations
    static async cleanupInactiveUsers(hoursOld = 24) {
        const query = `
            DELETE FROM users 
            WHERE last_active < NOW() - INTERVAL '${hoursOld} hours' 
            AND socket_id IS NULL
            RETURNING id
        `;
        const result = await this.query(query);
        console.log(`🧹 Cleaned up ${result.rowCount} inactive users`);
        return result.rowCount;
    }

    static async close() {
        await pool.end();
        console.log('🔌 Database connection pool closed');
    }
}

export default Database;
