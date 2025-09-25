-- PostgreSQL Schema for Negotiation Game
-- Run this to create the database structure

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    survey_responses JSONB,
    survey_completed BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    current_round INTEGER DEFAULT 0,
    completed_rounds INTEGER DEFAULT 0,
    completed_deals INTEGER DEFAULT 0,
    previous_partners UUID[] DEFAULT '{}',
    role_history CHAR(1)[] DEFAULT '{}', -- 'A' for seller, 'B' for buyer
    room_id VARCHAR(100),
    socket_id VARCHAR(100),
    role CHAR(1),
    pair_id UUID,
    is_moderator BOOLEAN DEFAULT FALSE,
    last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table
CREATE TABLE rooms (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    image_url VARCHAR(500),
    products JSONB, -- Array of product objects
    current_round INTEGER DEFAULT 0,
    status VARCHAR(50) DEFAULT 'waiting', -- 'waiting', 'active', 'paused'
    max_players INTEGER DEFAULT 20,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    config JSONB -- Room-specific configuration
);

-- Pairs table (game sessions)
CREATE TABLE pairs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id VARCHAR(100) REFERENCES rooms(id),
    user_a_id UUID REFERENCES users(id),
    user_b_id UUID REFERENCES users(id),
    round_number INTEGER NOT NULL,
    product JSONB, -- Product being negotiated
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP,
    final_deal JSONB, -- {price, confirmed_at, success}
    latest_offers JSONB DEFAULT '{"A": null, "B": null}',
    status VARCHAR(50) DEFAULT 'active' -- 'active', 'completed', 'abandoned'
);

-- Messages table (chat history)
CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    pair_id UUID REFERENCES pairs(id),
    user_id UUID REFERENCES users(id),
    user_name VARCHAR(255) NOT NULL,
    role CHAR(1) NOT NULL, -- 'A' or 'B'
    message TEXT NOT NULL,
    extracted_offer DECIMAL(10,2),
    offer_confidence DECIMAL(3,2),
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB -- Store extraction details, context, etc.
);

-- Game configuration table
CREATE TABLE game_config (
    id VARCHAR(50) PRIMARY KEY,
    config JSONB NOT NULL,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(255)
);

-- Indexes for performance
CREATE INDEX idx_users_room_id ON users(room_id);
CREATE INDEX idx_users_socket_id ON users(socket_id);
CREATE INDEX idx_pairs_room_id ON pairs(room_id);
CREATE INDEX idx_pairs_users ON pairs(user_a_id, user_b_id);
CREATE INDEX idx_messages_pair_id ON messages(pair_id);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);

-- Insert default game configuration
INSERT INTO game_config (id, config) VALUES (
    'main',
    '{
        "survey": {
            "questions": [
                {"id": 1, "type": "text", "question": "What is your name?", "required": true},
                {"id": 2, "type": "number", "question": "What is your age?", "required": true, "min": 13, "max": 120},
                {"id": 3, "type": "select", "question": "How much experience do you have with online negotiations?", "required": true, "options": ["None", "Some", "Moderate", "Extensive"]},
                {"id": 4, "type": "textarea", "question": "What do you hope to learn from this negotiation game?", "required": false}
            ]
        },
        "rooms": [
            {
                "id": "electronics",
                "name": "Electronics", 
                "description": "Smartphones, Laptops, Gaming Devices",
                "image": "https://images.unsplash.com/photo-1498049794561-7780e7231661?w=300&h=200&fit=crop",
                "products": [
                    {"name": "iPhone 14 Pro", "sellerInfo": "Brand new, unopened box", "buyerInfo": "Great camera, latest features"},
                    {"name": "MacBook Air M2", "sellerInfo": "Perfect for students", "buyerInfo": "Lightweight and powerful"},
                    {"name": "PlayStation 5", "sellerInfo": "Gaming console in high demand", "buyerInfo": "Latest games available"}
                ]
            }
        ],
        "gameSettings": {
            "totalRounds": 10,
            "buyerRounds": 5,
            "sellerRounds": 5,
            "maxPlayersPerRoom": 20
        }
    }'
);
