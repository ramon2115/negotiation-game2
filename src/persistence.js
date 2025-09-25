import Database from './database.js';

/**
 * Persistence layer that bridges in-memory objects with database
 * Maintains backward compatibility with existing server.js code
 */

export class PersistenceManager {
    constructor() {
        this.cache = {
            users: new Map(),
            rooms: new Map(),
            pairs: new Map(),
            config: null
        };
        this.initialized = false;
    }

    async initialize() {
        if (this.initialized) return;
        
        console.log('🔄 Initializing persistence layer...');
        
        // Load game configuration
        this.cache.config = await Database.getGameConfig();
        if (!this.cache.config) {
            console.log('⚠️ No game config found in database, using defaults');
        }
        
        // Load active rooms
        const rooms = await Database.getAllRooms();
        rooms.forEach(room => {
            this.cache.rooms.set(room.id, this.transformDbRoom(room));
        });
        
        // Load active users (connected in last 24 hours)
        // We'll load them on-demand as they connect
        
        console.log(`✅ Loaded ${rooms.length} rooms from database`);
        this.initialized = true;
    }

    // Transform database objects to match in-memory format
    transformDbRoom(dbRoom) {
        return {
            id: dbRoom.id,
            name: dbRoom.name,
            description: dbRoom.description,
            image: dbRoom.image_url,
            products: dbRoom.products || [],
            currentRound: dbRoom.current_round || 0,
            status: dbRoom.status || 'waiting',
            users: [], // Will be populated from active connections
            pairs: []  // Will be populated from active pairs
        };
    }

    transformDbUser(dbUser) {
        return {
            id: dbUser.id,
            name: dbUser.name,
            surveyResponses: dbUser.survey_responses,
            surveyCompleted: dbUser.survey_completed,
            createdAt: dbUser.created_at,
            currentRound: dbUser.current_round || 0,
            completedRounds: dbUser.completed_rounds || 0,
            completedDeals: dbUser.completed_deals || 0,
            previousPartners: dbUser.previous_partners || [],
            roleHistory: dbUser.role_history || [],
            roomId: dbUser.room_id,
            socketId: null, // Always null on load, set when connecting
            role: dbUser.role,
            pairId: dbUser.pair_id
        };
    }

    // User management with persistence
    async createUser(userData) {
        const dbUser = await Database.createUser(userData);
        const user = this.transformDbUser(dbUser);
        this.cache.users.set(user.id, user);
        return user;
    }

    async getUser(userId) {
        // Check cache first
        if (this.cache.users.has(userId)) {
            return this.cache.users.get(userId);
        }
        
        // Load from database
        const dbUser = await Database.getUserById(userId);
        if (dbUser) {
            const user = this.transformDbUser(dbUser);
            this.cache.users.set(userId, user);
            return user;
        }
        
        return null;
    }

    async updateUser(userId, updates) {
        // Update database
        const dbUpdates = this.transformUpdatesForDb(updates, 'user');
        await Database.updateUser(userId, dbUpdates);
        
        // Update cache
        const user = this.cache.users.get(userId);
        if (user) {
            Object.assign(user, updates);
        }
        
        return user;
    }

    // Room management with persistence
    async ensureRoom(roomId) {
        if (!this.cache.rooms.has(roomId)) {
            // Check if room exists in database
            let dbRoom = await Database.getRoomById(roomId);
            
            if (!dbRoom) {
                // Create default room
                dbRoom = await Database.createRoom({
                    id: roomId,
                    name: roomId,
                    description: 'Auto-created room',
                    products: []
                });
            }
            
            const room = this.transformDbRoom(dbRoom);
            this.cache.rooms.set(roomId, room);
        }
        
        return this.cache.rooms.get(roomId);
    }

    async updateRoom(roomId, updates) {
        const dbUpdates = this.transformUpdatesForDb(updates, 'room');
        await Database.updateRoom(roomId, dbUpdates);
        
        const room = this.cache.rooms.get(roomId);
        if (room) {
            Object.assign(room, updates);
        }
        
        return room;
    }

    // Pair management with persistence
    async createPair(pairData) {
        const { roomId, userA, userB, product, roundNumber } = pairData;
        
        // Save to database
        const dbPair = await Database.createPair({
            roomId,
            userAId: userA.id,
            userBId: userB.id,
            roundNumber,
            product
        });
        
        // Create in-memory version
        const pair = {
            id: dbPair.id,
            roomId,
            userA,
            userB,
            messages: [],
            product,
            latestOffers: { A: null, B: null },
            finalDeal: null,
            startedAt: dbPair.started_at
        };
        
        this.cache.pairs.set(pair.id, pair);
        return pair;
    }

    async getPair(pairId) {
        if (this.cache.pairs.has(pairId)) {
            return this.cache.pairs.get(pairId);
        }
        
        // Load from database if needed
        const dbPair = await Database.getPairById(pairId);
        if (dbPair) {
            const pair = await this.reconstructPair(dbPair);
            this.cache.pairs.set(pairId, pair);
            return pair;
        }
        
        return null;
    }

    async updatePair(pairId, updates) {
        const dbUpdates = this.transformUpdatesForDb(updates, 'pair');
        await Database.updatePair(pairId, dbUpdates);
        
        const pair = this.cache.pairs.get(pairId);
        if (pair) {
            Object.assign(pair, updates);
        }
        
        return pair;
    }

    // Message handling
    async saveMessage(messageData) {
        const dbMessage = await Database.saveMessage(messageData);
        
        // Add to in-memory pair if cached
        const pair = this.cache.pairs.get(messageData.pairId);
        if (pair) {
            pair.messages.push({
                ...messageData,
                timestamp: dbMessage.timestamp
            });
        }
        
        return dbMessage;
    }

    // Game configuration
    async getGameConfig() {
        if (!this.cache.config) {
            this.cache.config = await Database.getGameConfig();
        }
        return this.cache.config;
    }

    async updateGameConfig(config) {
        await Database.updateGameConfig(config);
        this.cache.config = config;
        return config;
    }

    // Helper methods
    transformUpdatesForDb(updates, type) {
        const dbUpdates = {};
        
        // Copy all direct database column names first
        Object.keys(updates).forEach(key => {
            if (key.includes('_') || ['status', 'name', 'description'].includes(key)) {
                dbUpdates[key] = updates[key];
            }
        });
        
        if (type === 'user') {
            if (updates.surveyResponses !== undefined) dbUpdates.survey_responses = updates.surveyResponses;
            if (updates.surveyCompleted !== undefined) dbUpdates.survey_completed = updates.surveyCompleted;
            if (updates.currentRound !== undefined) dbUpdates.current_round = updates.currentRound;
            if (updates.completedRounds !== undefined) dbUpdates.completed_rounds = updates.completedRounds;
            if (updates.completedDeals !== undefined) dbUpdates.completed_deals = updates.completedDeals;
            if (updates.previousPartners !== undefined) dbUpdates.previous_partners = updates.previousPartners;
            if (updates.roleHistory !== undefined) dbUpdates.role_history = updates.roleHistory;
            if (updates.roomId !== undefined) dbUpdates.room_id = updates.roomId;
            if (updates.socketId !== undefined) dbUpdates.socket_id = updates.socketId;
            if (updates.pairId !== undefined) dbUpdates.pair_id = updates.pairId;
        }
        
        if (type === 'room') {
            if (updates.currentRound !== undefined) dbUpdates.current_round = updates.currentRound;
            if (updates.imageUrl !== undefined) dbUpdates.image_url = updates.imageUrl;
        }
        
        if (type === 'pair') {
            if (updates.finalDeal !== undefined) dbUpdates.final_deal = updates.finalDeal;
            if (updates.latestOffers !== undefined) dbUpdates.latest_offers = updates.latestOffers;
        }
        
        return dbUpdates;
    }

    async reconstructPair(dbPair) {
        // Load users for this pair
        const userA = await this.getUser(dbPair.user_a_id);
        const userB = await this.getUser(dbPair.user_b_id);
        
        // Load messages
        const messages = await Database.getMessagesByPair(dbPair.id);
        
        return {
            id: dbPair.id,
            roomId: dbPair.room_id,
            userA,
            userB,
            messages: messages.map(msg => ({
                userId: msg.user_id,
                userName: msg.user_name,
                role: msg.role,
                message: msg.message,
                offer: msg.extracted_offer,
                timestamp: msg.timestamp,
                ...msg.metadata
            })),
            product: dbPair.product,
            latestOffers: dbPair.latest_offers || { A: null, B: null },
            finalDeal: dbPair.final_deal,
            startedAt: dbPair.started_at
        };
    }

    // Maintenance
    async cleanup() {
        console.log('🧹 Running database cleanup...');
        const cleaned = await Database.cleanupInactiveUsers(24);
        console.log(`✅ Cleaned up ${cleaned} inactive users`);
    }

    async close() {
        await Database.close();
    }
}

// Global instance
export const persistence = new PersistenceManager();
