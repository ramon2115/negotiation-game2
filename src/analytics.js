import Database from './database.js';

/**
 * Analytics helper functions for deal tracking and game metrics
 */

export class GameAnalytics {
    
    /**
     * Calculate deal duration in seconds
     */
    static calculateDealDuration(startedAt, confirmedAt) {
        const start = new Date(startedAt);
        const end = new Date(confirmedAt);
        return Math.round((end - start) / 1000); // seconds
    }

    /**
     * Get comprehensive deal statistics
     */
    static async getDealStats() {
        const query = `
            SELECT 
                COUNT(*) as total_deals,
                AVG(EXTRACT(EPOCH FROM (final_deal->>'confirmedAt')::timestamp - started_at))::int as avg_duration_seconds,
                MIN(EXTRACT(EPOCH FROM (final_deal->>'confirmedAt')::timestamp - started_at))::int as min_duration_seconds,
                MAX(EXTRACT(EPOCH FROM (final_deal->>'confirmedAt')::timestamp - started_at))::int as max_duration_seconds,
                AVG((final_deal->>'price')::numeric) as avg_price,
                MIN((final_deal->>'price')::numeric) as min_price,
                MAX((final_deal->>'price')::numeric) as max_price,
                COUNT(DISTINCT room_id) as rooms_with_deals,
                COUNT(DISTINCT user_a_id) + COUNT(DISTINCT user_b_id) as unique_players
            FROM pairs 
            WHERE final_deal IS NOT NULL
        `;
        
        const result = await Database.query(query);
        return result.rows[0];
    }

    /**
     * Get deal details with calculated durations
     */
    static async getDealsWithDuration() {
        const query = `
            SELECT 
                p.id,
                p.room_id,
                p.started_at,
                p.final_deal->>'confirmedAt' as confirmed_at,
                p.final_deal->>'price' as price,
                EXTRACT(EPOCH FROM (p.final_deal->>'confirmedAt')::timestamp - p.started_at)::int as duration_seconds,
                ua.name as user_a_name,
                ub.name as user_b_name,
                p.product->>'name' as product_name
            FROM pairs p
            JOIN users ua ON p.user_a_id = ua.id
            JOIN users ub ON p.user_b_id = ub.id
            WHERE p.final_deal IS NOT NULL
            ORDER BY p.started_at DESC
        `;
        
        const result = await Database.query(query);
        return result.rows.map(row => ({
            ...row,
            duration_formatted: this.formatDuration(row.duration_seconds)
        }));
    }

    /**
     * Get room-specific deal statistics
     */
    static async getRoomDealStats(roomId) {
        const query = `
            SELECT 
                room_id,
                COUNT(*) as total_deals,
                AVG(EXTRACT(EPOCH FROM (final_deal->>'confirmedAt')::timestamp - started_at))::int as avg_duration_seconds,
                AVG((final_deal->>'price')::numeric) as avg_price,
                COUNT(DISTINCT round_number) as rounds_with_deals
            FROM pairs 
            WHERE final_deal IS NOT NULL AND room_id = $1
            GROUP BY room_id
        `;
        
        const result = await Database.query(query, [roomId]);
        return result.rows[0];
    }

    /**
     * Get deal timeline for analysis
     */
    static async getDealTimeline() {
        const query = `
            SELECT 
                DATE_TRUNC('hour', started_at) as hour,
                COUNT(*) as deals_started,
                COUNT(final_deal) as deals_completed,
                AVG(CASE 
                    WHEN final_deal IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (final_deal->>'confirmedAt')::timestamp - started_at)
                    ELSE NULL 
                END)::int as avg_duration_seconds
            FROM pairs
            GROUP BY DATE_TRUNC('hour', started_at)
            ORDER BY hour DESC
            LIMIT 24
        `;
        
        const result = await Database.query(query);
        return result.rows;
    }

    /**
     * Format duration in human-readable format
     */
    static formatDuration(seconds) {
        if (seconds < 60) {
            return `${seconds}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;
            return `${minutes}m ${secs}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = seconds % 60;
            return `${hours}h ${minutes}m ${secs}s`;
        }
    }

    /**
     * Enhanced deal confirmation data with duration
     */
    static createDealData(pair, price) {
        const startTime = new Date(pair.startedAt);
        const endTime = new Date();
        const durationSeconds = Math.round((endTime - startTime) / 1000);
        
        return {
            price,
            confirmedAt: endTime.toISOString(),
            startedAt: pair.startedAt,
            durationSeconds,
            durationFormatted: this.formatDuration(durationSeconds),
            userA: pair.userA.id,
            userB: pair.userB.id,
            success: true
        };
    }

    /**
     * Get initial offers analysis (first offer by each role in each pair)
     */
    static async getInitialOffers() {
        const query = `
            WITH first_offers AS (
                SELECT DISTINCT ON (pair_id, role)
                    pair_id,
                    role,
                    extracted_offer,
                    timestamp,
                    user_name,
                    message
                FROM messages 
                WHERE extracted_offer IS NOT NULL
                ORDER BY pair_id, role, timestamp ASC
            )
            SELECT 
                p.room_id,
                p.product->>'name' as product_name,
                fo.pair_id,
                fo.role,
                fo.extracted_offer,
                fo.user_name,
                fo.timestamp,
                p.final_deal->>'price' as final_price,
                CASE WHEN p.final_deal IS NOT NULL THEN true ELSE false END as deal_completed
            FROM first_offers fo
            JOIN pairs p ON fo.pair_id = p.id
            ORDER BY fo.timestamp DESC
        `;
        
        const result = await Database.query(query);
        return result.rows;
    }

    /**
     * Get offer patterns and trends
     */
    static async getOfferPatterns() {
        const query = `
            WITH offer_analysis AS (
                SELECT 
                    pair_id,
                    role,
                    extracted_offer,
                    timestamp,
                    ROW_NUMBER() OVER (PARTITION BY pair_id, role ORDER BY timestamp) as offer_sequence
                FROM messages 
                WHERE extracted_offer IS NOT NULL
            ),
            first_offers AS (
                SELECT * FROM offer_analysis WHERE offer_sequence = 1
            ),
            final_prices AS (
                SELECT 
                    id as pair_id,
                    (final_deal->>'price')::numeric as final_price
                FROM pairs 
                WHERE final_deal IS NOT NULL
            )
            SELECT 
                fo_a.pair_id,
                fo_a.extracted_offer as seller_first_offer,
                fo_b.extracted_offer as buyer_first_offer,
                fp.final_price,
                CASE 
                    WHEN fp.final_price IS NOT NULL THEN 
                        ROUND(((fp.final_price - fo_b.extracted_offer) / (fo_a.extracted_offer - fo_b.extracted_offer)) * 100, 2)
                    ELSE NULL 
                END as seller_advantage_percentage
            FROM first_offers fo_a
            LEFT JOIN first_offers fo_b ON fo_a.pair_id = fo_b.pair_id AND fo_b.role = 'B'
            LEFT JOIN final_prices fp ON fo_a.pair_id = fp.pair_id
            WHERE fo_a.role = 'A'
                AND fo_a.extracted_offer IS NOT NULL 
                AND fo_b.extracted_offer IS NOT NULL
        `;
        
        const result = await Database.query(query);
        return result.rows;
    }

    /**
     * Get negotiation patterns analysis
     */
    static async getNegotiationPatterns() {
        const query = `
            SELECT 
                room_id,
                product->>'name' as product_name,
                COUNT(*) as total_negotiations,
                COUNT(final_deal) as successful_deals,
                ROUND(COUNT(final_deal)::numeric / COUNT(*)::numeric * 100, 2) as success_rate,
                AVG(CASE WHEN final_deal IS NOT NULL 
                    THEN EXTRACT(EPOCH FROM (final_deal->>'confirmedAt')::timestamp - started_at)
                    ELSE NULL END)::int as avg_deal_duration_seconds,
                AVG((final_deal->>'price')::numeric) as avg_final_price
            FROM pairs
            GROUP BY room_id, product->>'name'
            ORDER BY success_rate DESC
        `;
        
        const result = await Database.query(query);
        return result.rows.map(row => ({
            ...row,
            avg_deal_duration_formatted: row.avg_deal_duration_seconds ? 
                this.formatDuration(row.avg_deal_duration_seconds) : null
        }));
    }
}

export default GameAnalytics;
