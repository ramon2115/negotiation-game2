import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { pairUsers, assignRoles } from "./src/pairing.js";
import { persistence } from "./src/persistence.js";
import { GameAnalytics } from "./src/analytics.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ["http://localhost:3000"],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

const PORT = process.env.PORT || 3000;
const MODERATOR_TOKEN = process.env.MODERATOR_TOKEN || "admin123";

// --- Serve static files ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Redirect root → new welcome page
app.get("/", (req, res) => {
  res.redirect("/index.html");
});

// Moderator authentication routes
app.use(express.json());

app.post("/moderator/auth", (req, res) => {
  const { token } = req.body;
  if (token === MODERATOR_TOKEN) {
    res.json({ success: true, message: "Authentication successful" });
  } else {
    res.status(401).json({ success: false, message: "Invalid moderator token" });
  }
});

app.post("/moderator/verify", (req, res) => {
  const { token } = req.body;
  if (token === MODERATOR_TOKEN) {
    res.json({ success: true, valid: true });
  } else {
    res.status(401).json({ success: false, valid: false });
  }
});

// Survey and game config API routes
app.get("/api/survey", async (req, res) => {
  try {
    const config = await persistence.getGameConfig();
    res.json(config?.survey || gameConfig.survey);
  } catch (error) {
    console.error('❌ Error getting survey config:', error);
    res.json(gameConfig.survey);
  }
});

app.post("/api/survey/submit", async (req, res) => {
  try {
    const { responses } = req.body;
    const playerName = responses.find(r => r.questionId === 1)?.answer || 'Anonymous';
    
    const newUser = await persistence.createUser({
      name: playerName,
      surveyResponses: responses,
      surveyCompleted: true
    });
    
    // Also store in legacy format for compatibility
    users[newUser.id] = {
      ...newUser,
      previousPartners: [],
      roleHistory: [],
      socketId: null
    };
    
    res.json({ 
      success: true, 
      userId: newUser.id,
      playerName: playerName,
      message: "Survey completed successfully" 
    });
  } catch (error) {
    console.error('❌ Error creating user:', error);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get("/api/rooms", (req, res) => {
  // Add player counts to each room
  const roomsWithCounts = gameConfig.rooms.map(room => {
    const playersInRoom = Object.values(users).filter(user => user.roomId === room.id).length;
    return {
      ...room,
      playerCount: playersInRoom
    };
  });
  
  res.json(roomsWithCounts);
});

// Moderator configuration endpoints
app.post("/moderator/updateSurvey", (req, res) => {
  const { token, survey } = req.body;
  
  if (token !== MODERATOR_TOKEN) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  
  gameConfig.survey = survey;
  res.json({ success: true, message: "Survey updated successfully" });
});

app.post("/moderator/updateRooms", (req, res) => {
  const { token, rooms } = req.body;
  
  if (token !== MODERATOR_TOKEN) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  
  gameConfig.rooms = rooms;
  res.json({ success: true, message: "Rooms updated successfully" });
});

app.get("/moderator/config", (req, res) => {
  const { token } = req.query;
  
  if (token !== MODERATOR_TOKEN) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  
  res.json({
    success: true,
    config: gameConfig
  });
});

// Analytics endpoints
app.get("/moderator/analytics/deals", async (req, res) => {
  const { token } = req.query;
  
  if (token !== MODERATOR_TOKEN) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  
  try {
    const [stats, deals, patterns, initialOffers, offerPatterns] = await Promise.all([
      GameAnalytics.getDealStats(),
      GameAnalytics.getDealsWithDuration(),
      GameAnalytics.getNegotiationPatterns(),
      GameAnalytics.getInitialOffers(),
      GameAnalytics.getOfferPatterns()
    ]);
    
    res.json({
      success: true,
      data: { stats, deals, patterns, initialOffers, offerPatterns }
    });
  } catch (error) {
    console.error('❌ Analytics error:', error);
    res.status(500).json({ success: false, message: "Analytics error" });
  }
});

app.get("/moderator/analytics/timeline", async (req, res) => {
  const { token } = req.query;
  
  if (token !== MODERATOR_TOKEN) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  
  try {
    const timeline = await GameAnalytics.getDealTimeline();
    res.json({ success: true, data: timeline });
  } catch (error) {
    console.error('❌ Timeline analytics error:', error);
    res.status(500).json({ success: false, message: "Timeline error" });
  }
});

// In-memory stores
const rooms = {}; // { roomId: { users: [], pairs: [] } }
const users = {}; // { userId: { id, name, socketId, roomId, role, pairId } }
const pairs = {}; // { pairId: { id, roomId, userA, userB, messages: [] } }

// Game configuration (moderator configurable)
const gameConfig = {
  survey: {
    questions: [
      {
        id: 1,
        type: 'text',
        question: 'What is your name?',
        required: true
      },
      {
        id: 2,
        type: 'number',
        question: 'What is your age?',
        required: true,
        min: 13,
        max: 120
      },
      {
        id: 3,
        type: 'select',
        question: 'How much experience do you have with online negotiations?',
        required: true,
        options: ['None', 'Some', 'Moderate', 'Extensive']
      },
      {
        id: 4,
        type: 'textarea',
        question: 'What do you hope to learn from this negotiation game?',
        required: false
      }
    ]
  },
  rooms: [
    {
      id: 'electronics',
      name: 'Electronics',
      description: 'Smartphones, Laptops, Gaming Devices',
      image: 'https://images.unsplash.com/photo-1498049794561-7780e7231661?w=300&h=200&fit=crop',
      products: [
        { name: 'iPhone 14 Pro', sellerInfo: 'Brand new, unopened box', buyerInfo: 'Great camera, latest features' },
        { name: 'MacBook Air M2', sellerInfo: 'Perfect for students', buyerInfo: 'Lightweight and powerful' },
        { name: 'PlayStation 5', sellerInfo: 'Gaming console in high demand', buyerInfo: 'Latest games available' }
      ]
    },
    {
      id: 'home',
      name: 'Home & Garden',
      description: 'Furniture, Appliances, Decor',
      image: 'https://images.unsplash.com/photo-1586023492125-27b2c045efd7?w=300&h=200&fit=crop',
      products: [
        { name: 'Coffee Table', sellerInfo: 'Solid wood construction', buyerInfo: 'Perfect for living room' },
        { name: 'Stand Mixer', sellerInfo: 'Professional grade', buyerInfo: 'Great for baking enthusiasts' },
        { name: 'Garden Tools Set', sellerInfo: 'Durable steel tools', buyerInfo: 'Essential for gardening' }
      ]
    },
    {
      id: 'fashion',
      name: 'Fashion',
      description: 'Clothing, Shoes, Accessories',
      image: 'https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=300&h=200&fit=crop',
      products: [
        { name: 'Designer Handbag', sellerInfo: 'Authentic luxury brand', buyerInfo: 'Timeless style piece' },
        { name: 'Running Shoes', sellerInfo: 'Limited edition colorway', buyerInfo: 'Comfortable for daily wear' },
        { name: 'Leather Jacket', sellerInfo: 'Genuine leather, well-maintained', buyerInfo: 'Classic style statement' }
      ]
    }
  ],
  gameSettings: {
    totalRounds: 10,
    buyerRounds: 5,
    sellerRounds: 5,
    maxPlayersPerRoom: 20
  }
};

// --- Improved offer extraction with contextual analysis ---
function extractNumbersWithRegex(text, role) {
  const regex = /\$?\d+/g;
  const matches = text.match(regex) || [];
  const lowered = text.toLowerCase();

  // Product/model indicators
  const productWords = ["iphone", "galaxy", "series", "model", "version", "mark", "pro", "max", "mini", "plus"];
  
  // Offer context indicators (strong signals for actual offers)
  const offerPhrases = [
    "i can offer", "i offer", "offer you", "willing to pay", "i'll pay", "i can pay",
    "thinking more like", "how about", "what about", "i was thinking",
    "the least i can take", "i can take", "lowest i'll go", "minimum is",
    "my final offer", "best i can do", "i'll accept", "deal at",
    "counter offer", "counteroffer", "i propose"
  ];

  // Rejection context indicators
  const rejectionPhrases = [
    "too high", "too expensive", "too much", "can't afford", "way too",
    "below asking", "far below", "not enough", "too low"
  ];

  const numbers = matches.map((match, index) => {
    const value = parseFloat(match.replace("$", ""));
    let confidence = 0.3; // Base confidence
    let context = "neutral";

    // Get surrounding text (30 chars before and after)
    const matchIndex = text.indexOf(match);
    const before = text.substring(Math.max(0, matchIndex - 30), matchIndex).toLowerCase();
    const after = text.substring(matchIndex + match.length, matchIndex + match.length + 30).toLowerCase();
    const surrounding = before + " " + match.toLowerCase() + " " + after;

    // Check if it's likely a model number
    let isLikelyModel = false;
    for (const product of productWords) {
      // Check if product word appears right before the number
      if (before.endsWith(product + " ") || before.includes(product + " " + match.toLowerCase())) {
        isLikelyModel = true;
        confidence = 0.05;
        context = "model_number";
        console.log(`⚠️ Detected model number: ${value} (near "${product}")`);
        break;
      }
    }

    if (!isLikelyModel) {
      // Check for strong offer context
      for (const phrase of offerPhrases) {
        if (surrounding.includes(phrase)) {
          confidence = 0.9;
          context = "offer_phrase";
          console.log(`✅ Strong offer context: ${value} (phrase: "${phrase}")`);
          break;
        }
      }

      // Check for rejection context (still might be a reference price)
      if (confidence < 0.9) {
        for (const phrase of rejectionPhrases) {
          if (surrounding.includes(phrase)) {
            // If it's in rejection context, lower confidence but don't eliminate
            confidence = Math.max(confidence * 0.7, 0.2);
            context = "rejection_context";
            console.log(`⚠️ Rejection context: ${value} (phrase: "${phrase}")`);
            break;
          }
        }
      }

      // Boost confidence for dollar signs
      if (match.startsWith("$")) {
        confidence *= 1.3;
        console.log(`💰 Dollar sign boost: ${value}`);
      }

      // Reasonable price range check
      if (value >= 50 && value <= 10000) {
        confidence *= 1.2;
      } else if (value < 10) {
        confidence *= 0.3; // Very low numbers are unlikely to be prices
      } else if (value > 10000) {
        confidence *= 0.7; // Very high numbers might be less likely
      }
    }

    return { value, context, confidence, surrounding: surrounding.trim() };
  });

  // Find the best offer based on confidence and context
  let offer = null;
  if (numbers.length) {
    // Sort by confidence, then by contextual relevance
    const validNumbers = numbers.filter(n => n.confidence > 0.1);
    
    if (validNumbers.length > 0) {
      // First, try to find numbers with strong offer context
      const strongOffers = validNumbers.filter(n => n.context === "offer_phrase");
      
      if (strongOffers.length > 0) {
        // Use the offer with highest confidence from strong offers
        offer = strongOffers.reduce((best, current) => 
          current.confidence > best.confidence ? current : best
        ).value;
      } else {
        // No strong offers, use role-based logic with confidence weighting
        const sortedByConfidence = validNumbers.sort((a, b) => b.confidence - a.confidence);
        
        if (role === "A") {
          // Seller: prefer higher values among confident ones
          const topConfident = sortedByConfidence.filter(n => n.confidence >= sortedByConfidence[0].confidence * 0.8);
          offer = Math.max(...topConfident.map(n => n.value));
        } else if (role === "B") {
          // Buyer: prefer lower values among confident ones
          const topConfident = sortedByConfidence.filter(n => n.confidence >= sortedByConfidence[0].confidence * 0.8);
          offer = Math.min(...topConfident.map(n => n.value));
        } else {
          // No role: use most confident
          offer = sortedByConfidence[0].value;
        }
      }
      
      console.log(`🎯 Final offer: ${offer} (from ${validNumbers.length} candidates)`);
    }
  }

  return { numbersFound: numbers, offer, rawModelOutput: null, errorCause: "regex_only" };
}

// Always use regex now
async function extractOffer(message, role) {
  return extractNumbersWithRegex(message, role);
}

// --- Helper functions ---
function findUserBySocketId(socketId) {
  return Object.values(users).find(user => user.socketId === socketId);
}

function getUserPair(userId) {
  const user = users[userId];
  return user?.pairId ? pairs[user.pairId] : null;
}

function getGameStats() {
  const totalUsers = Object.keys(users).length;
  const activeRooms = Object.keys(rooms).filter(roomId => rooms[roomId] && rooms[roomId].users.length > 0).length;
  const activePairs = Object.keys(pairs).length;
  const completedDeals = Object.values(pairs).filter(pair => pair.finalDeal).length;
  
  return { totalUsers, activeRooms, activePairs, completedDeals };
}

function getRoomDetails(roomId) {
  if (!rooms[roomId]) {
    return { roomId, users: [], waitingUsers: [], pairedUsers: [], pairs: [] };
  }

  const room = rooms[roomId];
  const waitingUsers = room.users.filter(user => !user.pairId && user.socketId);
  const pairedUsers = room.users.filter(user => user.pairId);
  const roomPairs = Object.values(pairs).filter(pair => pair.roomId === roomId);

  return {
    roomId,
    totalUsers: room.users.length,
    users: room.users.map(u => ({
      id: u.id,
      name: u.name,
      status: u.pairId ? 'paired' : 'waiting',
      pairId: u.pairId,
      role: u.role,
      online: !!u.socketId
    })),
    waitingUsers: waitingUsers.map(u => ({
      id: u.id,
      name: u.name,
      joinedAt: u.joinedAt || 'unknown'
    })),
    pairedUsers: pairedUsers.map(u => ({
      id: u.id,
      name: u.name,
      pairId: u.pairId,
      role: u.role
    })),
    pairs: roomPairs.map(pair => ({
      id: pair.id,
      userA: { name: pair.userA.name, role: pair.userA.role },
      userB: { name: pair.userB.name, role: pair.userB.role },
      product: pair.product?.name,
      startedAt: pair.startedAt,
      finalDeal: pair.finalDeal
    }))
  };
}

function shouldPlayerBeBuyer(user) {
  // Count how many times this user has been buyer vs seller
  const buyerCount = user.roleHistory?.filter(role => role === 'B').length || 0;
  const sellerCount = user.roleHistory?.filter(role => role === 'A').length || 0;
  const totalGames = buyerCount + sellerCount;
  
  // For first-time players, completely random
  if (totalGames === 0) {
    return Math.random() < 0.5;
  }
  
  // For experienced players, balance their roles
  if (buyerCount < sellerCount) {
    return true; // Prefer buyer to balance
  } else if (sellerCount < buyerCount) {
    return false; // Prefer seller to balance
  }
  
  // If perfectly balanced, random
  return Math.random() < 0.5;
}

function findOptimalPartner(user, availableUsers) {
  // Find users who haven't been paired with this user before
  const eligibleUsers = availableUsers.filter(other => 
    other.id !== user.id && 
    !user.previousPartners.includes(other.id) &&
    !other.previousPartners.includes(user.id)
  );
  
  if (eligibleUsers.length === 0) {
    // If no new partners available, allow re-pairing
    console.log(`⚠️ No new partners for ${user.name}, allowing re-pairing`);
    return availableUsers.find(other => other.id !== user.id);
  }
  
  // Return random eligible user
  return eligibleUsers[Math.floor(Math.random() * eligibleUsers.length)];
}

function createGamePairs(roomUsers) {
  console.log(`🎯 createGamePairs called with ${roomUsers.length} users:`, roomUsers.map(u => u.name));
  
  const availableUsers = [...roomUsers];
  const pairs = [];
  
  // Initialize role history for new users
  availableUsers.forEach(user => {
    if (!user.roleHistory) {
      user.roleHistory = [];
    }
  });
  
  // Shuffle users for random pairing
  for (let i = availableUsers.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableUsers[i], availableUsers[j]] = [availableUsers[j], availableUsers[i]];
  }
  
  console.log(`🔀 Shuffled users:`, availableUsers.map(u => u.name));
  
  while (availableUsers.length >= 2) {
    const userA = availableUsers.pop();
    const userB = findOptimalPartner(userA, availableUsers) || availableUsers.pop();
    
    if (userB) {
      // Remove userB from available users
      const index = availableUsers.indexOf(userB);
      if (index > -1) {
        availableUsers.splice(index, 1);
      }
      
      // Smart role assignment - ensure one buyer, one seller per pair
      const userA_ShouldBeBuyer = shouldPlayerBeBuyer(userA);
      const userB_ShouldBeBuyer = shouldPlayerBeBuyer(userB);
      
      console.log(`🎲 Role assignment: ${userA.name} prefers ${userA_ShouldBeBuyer ? 'BUYER' : 'SELLER'}, ${userB.name} prefers ${userB_ShouldBeBuyer ? 'BUYER' : 'SELLER'}`);
      console.log(`📊 ${userA.name} history: ${userA.roleHistory.length} games, ${userB.name} history: ${userB.roleHistory.length} games`);
      
      // If both want same role, assign based on who needs it more
      if (userA_ShouldBeBuyer === userB_ShouldBeBuyer) {
        const userA_BuyerCount = userA.roleHistory.filter(role => role === 'B').length;
        const userB_BuyerCount = userB.roleHistory.filter(role => role === 'B').length;
        
        console.log(`⚖️ Same preference conflict - using buyer counts: ${userA.name}=${userA_BuyerCount}, ${userB.name}=${userB_BuyerCount}`);
        
        if (userA_BuyerCount <= userB_BuyerCount) {
          userA.role = 'B'; // Buyer
          userB.role = 'A'; // Seller
        } else {
          userA.role = 'A'; // Seller
          userB.role = 'B'; // Buyer
        }
      } else {
        // Different preferences - assign accordingly
        userA.role = userA_ShouldBeBuyer ? 'B' : 'A';
        userB.role = userB_ShouldBeBuyer ? 'B' : 'A';
        console.log(`✅ Different preferences - assigning as preferred`);
      }
      
      // Record role history
      userA.roleHistory.push(userA.role);
      userB.roleHistory.push(userB.role);
      
      // Update previous partners
      userA.previousPartners.push(userB.id);
      userB.previousPartners.push(userA.id);
      
      pairs.push([userA, userB]);
      
      console.log(`👥 Paired: ${userA.name} (${userA.role === 'A' ? 'SELLER' : 'BUYER'}) with ${userB.name} (${userB.role === 'A' ? 'SELLER' : 'BUYER'})`);
    }
  }
  
  return pairs;
}

function getActivePairs() {
  return Object.values(pairs).map(pair => {
    // Find latest offer from messages
    const latestMessage = pair.messages
      .filter(msg => msg.offer !== null && msg.offer !== undefined)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];
    
    return {
      id: pair.id,
      roomId: pair.roomId,
      userA: { id: pair.userA.id, name: pair.userA.name },
      userB: { id: pair.userB.id, name: pair.userB.name },
      item: pair.roomId, // Use room as item for now
      latestOffer: latestMessage ? {
        amount: latestMessage.offer,
        role: latestMessage.role,
        timestamp: latestMessage.timestamp
      } : null,
      finalDeal: pair.finalDeal
    };
  });
}

function broadcastToModerators(event, data) {
  // Send to all authenticated moderators
  io.sockets.sockets.forEach(socket => {
    if (socket.data?.isModerator && socket.data?.authenticated) {
      socket.emit(event, data);
    }
  });
}

// --- Socket.io handlers ---
io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);

  // New room joining system
  socket.on("joinRoom", ({ userId, roomId, playerName }) => {
    if (!users[userId]) {
      socket.emit("error", { message: "User not found. Please complete survey first." });
      return;
    }

    const user = users[userId];
    
    // Initialize room if doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = { 
        id: roomId,
        users: [], 
        pairs: [], 
        currentRound: 0,
        status: 'waiting' // waiting, active, completed
      };
    }

    // Update user info
    user.socketId = socket.id;
    user.roomId = roomId;
    user.status = 'ready';

    // Add user to room if not already there
    const roomUsers = rooms[roomId].users;
    if (!roomUsers.find(u => u.id === userId)) {
      roomUsers.push(user);
      console.log(`➕ Added ${user.name} to room ${roomId} (now ${roomUsers.length} users)`);
    } else {
      console.log(`♻️ ${user.name} already in room ${roomId}`);
    }

    // Store user data in socket
    socket.data = { userId, roomId };
    socket.join(roomId);

    // Get all players in room
    const playersInRoom = roomUsers.map(u => ({
      id: u.id,
      name: u.name,
      status: u.status || 'ready',
      currentRound: u.currentRound || 0,
      completedDeals: u.completedDeals || 0
    }));

    socket.emit("roomJoined", { 
      user: {
        ...user
        // Remove nextRole - roles are only assigned during pairing
      }, 
      players: playersInRoom 
    });

    // Notify others that player joined
    socket.to(roomId).emit("playerJoined", { 
      newPlayer: { id: user.id, name: user.name }, 
      players: playersInRoom 
    });

    console.log(`👥 ${user.name} joined room ${roomId} (${playersInRoom.length} players total)`);
    
    // Auto-pair players if possible (with slight delay to ensure all updates are complete)
    setTimeout(() => {
      checkForAutoPairing(roomId);
    }, 100);
  });

  function checkForAutoPairing(roomId) {
    if (!rooms[roomId]) {
      console.log(`❌ Room ${roomId} not found for auto-pairing`);
      return;
    }
    
    const room = rooms[roomId];
    console.log(`🏪 Room ${roomId} has ${room.users.length} total users`);
    
    const availablePlayers = room.users.filter(user => {
      const isAvailable = !user.pairId && user.socketId;
      console.log(`👤 ${user.name}: pairId=${user.pairId}, socketId=${user.socketId ? 'connected' : 'disconnected'}, available=${isAvailable}`);
      return isAvailable;
    });
    
    console.log(`🔍 Auto-pairing check for ${roomId}: ${availablePlayers.length} available players out of ${room.users.length} total`);
    
    // Need at least 2 players to create a pair
    if (availablePlayers.length >= 2) {
      console.log(`✅ Attempting to create pairs from ${availablePlayers.length} available players`);
      
      // Create pairs automatically
      const userPairs = createGamePairs(availablePlayers);
      
      console.log(`📋 Created ${userPairs.length} pairs`);
      
      if (userPairs.length > 0) {
        // Get current product for this room
        const roomConfig = gameConfig.rooms.find(r => r.id === roomId);
        const products = roomConfig?.products || [{ name: 'Generic Item', sellerInfo: '', buyerInfo: '' }];
        const currentProduct = products[0]; // Use first product for auto-pairing
        
        userPairs.forEach(([userA, userB]) => {
          const pairId = uuidv4();
          
          // Update user objects with pair info
          userA.pairId = pairId;
          userB.pairId = pairId;
          
          // Create pair object
          const pair = {
            id: pairId,
            roomId,
            userA,
            userB,
            messages: [],
            product: {
              ...currentProduct,
              round: 1,
              itemId: `${roomId}-auto-1`,
            },
            latestOffers: { A: null, B: null },
            finalDeal: null,
            startedAt: new Date().toISOString(),
            isAutoPair: true
          };
          pairs[pairId] = pair;

          // Join pair-specific rooms
          const socketA = io.sockets.sockets.get(userA.socketId);
          const socketB = io.sockets.sockets.get(userB.socketId);
          if (socketA) socketA.join(`pair:${pairId}`);
          if (socketB) socketB.join(`pair:${pairId}`);

          // Send pair assignments to players
          if (socketA) {
            socketA.emit('autoPairAssigned', {
              myRole: userA.role,
              partner: { id: userB.id, name: userB.name, role: userB.role },
              product: pair.product,
              message: 'You\'ve been automatically paired! Negotiation can begin.'
            });
          }
          
          if (socketB) {
            socketB.emit('autoPairAssigned', {
              myRole: userB.role,
              partner: { id: userA.id, name: userA.name, role: userA.role },
              product: pair.product,
              message: 'You\'ve been automatically paired! Negotiation can begin.'
            });
          }

          console.log(`🤖 Auto-paired: ${userA.name} (${userA.role === 'A' ? 'SELLER' : 'BUYER'}) with ${userB.name} (${userB.role === 'A' ? 'SELLER' : 'BUYER'})`);
        });
        
        // Broadcast to moderators
        broadcastToModerators('moderator:activity', {
          message: `🤖 Auto-paired ${userPairs.length} pairs in ${roomId}`,
          type: 'success'
        });
        
        broadcastToModerators('moderator:gameData', {
          stats: getGameStats(),
          pairs: getActivePairs()
        });
      } else {
        console.log(`❌ No pairs were created despite having ${availablePlayers.length} available players`);
      }
    } else {
      console.log(`⏳ Not enough players for pairing: ${availablePlayers.length}/2 needed`);
      if (availablePlayers.length === 1) {
        console.log(`👤 ${availablePlayers[0].name} is waiting for another player`);
      }
    }
  }

  socket.on("leaveRoom", ({ roomId }) => {
    if (!socket.data?.userId) return;
    
    const user = users[socket.data.userId];
    if (!user || !rooms[roomId]) return;

    // Remove user from room
    rooms[roomId].users = rooms[roomId].users.filter(u => u.id !== user.id);
    user.roomId = null;
    user.socketId = null;

    const remainingPlayers = rooms[roomId].users.map(u => ({
      id: u.id,
      name: u.name,
      status: u.status || 'ready'
    }));

    // Notify others
    socket.to(roomId).emit("playerLeft", { 
      leftPlayer: { id: user.id, name: user.name }, 
      players: remainingPlayers 
    });

    socket.leave(roomId);
    console.log(`👋 ${user.name} left room ${roomId}`);
  });

  // Legacy register handler for backwards compatibility
  socket.on("register", ({ roomId, name, userId: existingUserId, moderatorToken }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { users: [], pairs: [] };
    }

    // Create or restore user identity
    let userId = existingUserId;
    let user = userId ? users[userId] : null;
    
    if (!user) {
      userId = uuidv4();
      user = { 
        id: userId, 
        name: name || "Anonymous", 
        socketId: socket.id, 
        roomId, 
        role: null, 
        pairId: null,
        currentRound: 0,
        completedRounds: 0,
        completedDeals: 0,
        previousPartners: [],
        roleHistory: [],
        isModerator: moderatorToken === MODERATOR_TOKEN
      };
      users[userId] = user;
      rooms[roomId].users.push(user);
    } else {
      // User reconnecting - update socket
      user.socketId = socket.id;
      user.isModerator = moderatorToken === MODERATOR_TOKEN;
    }

    // Store user data in socket for quick access
    socket.data = { userId, roomId, isModerator: user.isModerator };
    socket.join(roomId);

    // Rejoin pair room if already paired
    if (user.pairId) {
      socket.join(`pair:${user.pairId}`);
    }

    socket.emit("registered", { userId, roomId, isModerator: user.isModerator });
    console.log(`ℹ️ User ${user.isModerator ? '(MODERATOR)' : ''} registered to ${roomId}:`, user);
  });

  socket.on("chatMessage", async ({ message }) => {
    if (!socket.data?.userId) {
      socket.emit("error", { message: "Not registered" });
      return;
    }

    const user = users[socket.data.userId];
    if (!user || !user.pairId) {
      socket.emit("error", { message: "Not in a pair" });
      return;
    }

    const pair = pairs[user.pairId];
    if (!pair) {
      socket.emit("error", { message: "Pair not found" });
      return;
    }

    const role = user.role;
    const offerData = await extractOffer(message, role);

    const payload = {
      userId: user.id,
      userName: user.name,
      role,
      message,
      ...offerData,
      timestamp: new Date().toISOString(),
    };

    // Store message in pair
    pair.messages.push(payload);

    // Update latest offers if an offer was extracted
    if (offerData.offer !== null) {
      pair.latestOffers[role] = offerData.offer;
      
      // 💾 Update pair's latest offers in database
      try {
        await persistence.updatePair(user.pairId, { 
          latestOffers: pair.latestOffers 
        });
        console.log(`💰 Updated latest offers for pair ${user.pairId}: ${role} = $${offerData.offer}`);
      } catch (error) {
        console.error('❌ Failed to update latest offers:', error);
      }
    }

    // 💾 Save message to database
    try {
      await persistence.saveMessage({
        pairId: user.pairId,
        userId: user.id,
        userName: user.name,
        role,
        message,
        extractedOffer: offerData.offer,
        offerConfidence: offerData.confidence || null,
        metadata: {
          numbersFound: offerData.numbersFound,
          errorCause: offerData.errorCause,
          rawModelOutput: offerData.rawModelOutput
        }
      });
      console.log(`💾 Message saved to database: ${user.name} in pair ${user.pairId}`);
    } catch (error) {
      console.error('❌ Failed to save message to database:', error);
    }

    // Send only to the pair participants
    io.to(`pair:${user.pairId}`).emit("chatLog", payload);
    
    socket.emit("chatMessageAck", {
      ok: true,
      sent: message,
      extractedOffer: offerData.offer,
      errorCause: offerData.errorCause,
    });

    console.log(`💬 Message in pair ${user.pairId}: ${user.name} (${role}): ${message}`);
    
    // Broadcast activity to moderators
    broadcastToModerators('moderator:activity', {
      message: `💬 ${user.name} (${role === "A" ? "SELLER" : "BUYER"}) in ${pair.roomId}: ${message.substring(0, 50)}${message.length > 50 ? '...' : ''}`,
      type: 'chat'
    });
    
    // Send updated game data to moderators if there was an offer
    if (offerData.offer !== null) {
      broadcastToModerators('moderator:gameData', {
        stats: getGameStats(),
        pairs: getActivePairs()
      });
    }
  });

  socket.on("moderator:startRound", async ({ roomId }) => {
    // Check moderator authorization
    if (!socket.data?.isModerator) {
      socket.emit("error", { message: "Unauthorized - moderator access required" });
      return;
    }

    if (!rooms[roomId]) return;
    const room = rooms[roomId];

    if (room.users.length < 2) {
      socket.emit("error", { message: "Need at least 2 players to start a round" });
      return;
    }

    // Update room status
    room.status = 'active';
    room.currentRound = (room.currentRound || 0) + 1;

    // 💾 Update room in database
    try {
      await persistence.updateRoom(roomId, {
        status: 'active',
        currentRound: room.currentRound
      });
    } catch (error) {
      console.error('❌ Failed to update room in database:', error);
    }

    // Create pairs using new algorithm
    const userPairs = createGamePairs(room.users);

    // Get current product for this room and round
    const roomConfig = gameConfig.rooms.find(r => r.id === roomId);
    const products = roomConfig?.products || [{ name: 'Generic Item', sellerInfo: '', buyerInfo: '' }];
    const currentProduct = products[(room.currentRound - 1) % products.length];

    // Create pair objects and join pair rooms
    const activePairs = [];
    for (const [userA, userB] of userPairs) {
      const pairId = uuidv4();
      
      // Update user objects with pair and round info
      userA.pairId = pairId;
      userB.pairId = pairId;
      userA.currentRound = room.currentRound;
      userB.currentRound = room.currentRound;
      
      const productData = {
        ...currentProduct,
        round: room.currentRound,
        itemId: `${roomId}-${room.currentRound}`,
      };
      
      // Create pair object with product info
      const pair = {
        id: pairId,
        roomId,
        userA,
        userB,
        messages: [],
        product: productData,
        latestOffers: { A: null, B: null },
        finalDeal: null,
        startedAt: new Date().toISOString()
      };
      pairs[pairId] = pair;

      // 💾 Save pair to database
      try {
        await persistence.createPair({
          roomId,
          userA,
          userB,
          product: productData,
          roundNumber: room.currentRound
        });
        console.log(`💾 Pair ${pairId} saved to database`);
      } catch (error) {
        console.error('❌ Failed to save pair to database:', error);
      }

      // Join pair-specific rooms
      const socketA = io.sockets.sockets.get(userA.socketId);
      const socketB = io.sockets.sockets.get(userB.socketId);
      if (socketA) socketA.join(`pair:${pairId}`);
      if (socketB) socketB.join(`pair:${pairId}`);

      activePairs.push({
        pairId,
        users: [userA, userB],
        product: pair.product,
        latestOffers: { A: null, B: null },
        finalDeal: null,
      });
    }

    room.pairs = activePairs;

    // Emit round start with product and role info
    io.to(roomId).emit("roundStart", { 
      roomId, 
      roundNumber: room.currentRound, 
      product: currentProduct,
      totalRounds: gameConfig.gameSettings.totalRounds
    });

    // Send pair assignments to individual players
    activePairs.forEach(({ users: [userA, userB], product }) => {
      const socketA = io.sockets.sockets.get(userA.socketId);
      const socketB = io.sockets.sockets.get(userB.socketId);
      
      if (socketA) {
        socketA.emit('pairAssigned', {
          myRole: userA.role,
          partner: { id: userB.id, name: userB.name, role: userB.role },
          product: product,
          roundNumber: room.currentRound
        });
      }
      
      if (socketB) {
        socketB.emit('pairAssigned', {
          myRole: userB.role,
          partner: { id: userA.id, name: userA.name, role: userA.role },
          product: product,
          roundNumber: room.currentRound
        });
      }
    });

    console.log(`🎮 Round ${room.currentRound} started by moderator in ${roomId} with ${activePairs.length} pairs`);
    
    // Broadcast activity to moderators
    broadcastToModerators('moderator:activity', {
      message: `🎮 Round ${room.currentRound} started in ${roomId} with ${activePairs.length} pairs`,
      type: 'success'
    });
    
    // Send updated game data to moderators
    broadcastToModerators('moderator:gameData', {
      stats: getGameStats(),
      pairs: getActivePairs()
    });
  });

  // Game interface connection
  socket.on("joinGameInterface", ({ userId }) => {
    if (!users[userId]) {
      socket.emit("error", { message: "User not found. Please rejoin the room." });
      return;
    }

    const user = users[userId];
    user.socketId = socket.id; // Update socket ID
    socket.data = { userId, roomId: user.roomId };
    
    // Join the user's room and pair room if they have one
    if (user.roomId) {
      socket.join(user.roomId);
    }
    if (user.pairId) {
      socket.join(`pair:${user.pairId}`);
    }
    
    console.log(`🎮 ${user.name} connected to game interface`);
  });

  // Game interface pairing status request
  socket.on("requestPairingStatus", () => {
    if (!socket.data?.userId) {
      socket.emit("error", { message: "Not registered" });
      return;
    }

    const user = users[socket.data.userId];
    if (!user) {
      socket.emit("error", { message: "User not found" });
      return;
    }

    console.log(`🔍 ${user.name} requesting pairing status: pairId=${user.pairId}, role=${user.role}`);

    if (user.pairId && pairs[user.pairId]) {
      const pair = pairs[user.pairId];
      const partner = pair.userA.id === user.id ? pair.userB : pair.userA;
      
      console.log(`✅ Found pairing for ${user.name}: paired with ${partner.name}, user role=${user.role}, partner role=${partner.role}`);
      
      socket.emit("pairingStatus", {
        paired: true,
        myRole: user.role,
        partner: {
          id: partner.id,
          name: partner.name,
          role: partner.role
        },
        product: pair.product,
        roundNumber: pair.product?.round || 1
      });
    } else {
      console.log(`❌ No pairing found for ${user.name}`);
      socket.emit("pairingStatus", {
        paired: false,
        message: "Not currently paired"
      });
    }
  });

  // Missing handlers implementation
  socket.on("submitPreSurvey", ({ responses }) => {
    if (!socket.data?.userId) {
      socket.emit("error", { message: "Not registered" });
      return;
    }

    const user = users[socket.data.userId];
    if (!user) return;

    user.preSurvey = { completed: true, responses, timestamp: new Date().toISOString() };
    socket.emit("preSurveyAck", { ok: true, userId: user.id });
    console.log(`📝 Pre-survey submitted by ${user.name}`);
  });

  socket.on("submitPostSurvey", ({ responses }) => {
    if (!socket.data?.userId) {
      socket.emit("error", { message: "Not registered" });
      return;
    }

    const user = users[socket.data.userId];
    if (!user) return;

    user.postSurvey = { completed: true, responses, timestamp: new Date().toISOString() };
    socket.emit("postSurveyAck", { ok: true, userId: user.id });
    console.log(`📝 Post-survey submitted by ${user.name}`);
  });

  socket.on("confirmDeal", async ({ price }) => {
    if (!socket.data?.userId) {
      socket.emit("error", { message: "Not registered" });
      return;
    }

    const user = users[socket.data.userId];
    if (!user || !user.pairId) {
      socket.emit("error", { message: "Not in a pair" });
      return;
    }

    const pair = pairs[user.pairId];
    if (!pair) {
      socket.emit("error", { message: "Pair not found" });
      return;
    }

    // Store the user's confirmation
    user.confirmPrice = price;
    
    // Check if both users have confirmed the same price
    const otherUser = pair.userA.id === user.id ? pair.userB : pair.userA;
    
    if (otherUser.confirmPrice === price) {
      // Both agreed on same price - deal confirmed!
      const dealData = GameAnalytics.createDealData(pair, price);
      
      pair.finalDeal = dealData;

      // 💾 Save deal to database
      try {
        await persistence.updatePair(user.pairId, { 
          finalDeal: dealData,
          status: 'completed'
        });
        console.log(`💾 Deal saved to database: pair ${pair.id} at $${price}`);
      } catch (error) {
        console.error(`❌ Failed to save deal to database:`, error);
      }

      io.to(`pair:${user.pairId}`).emit("dealConfirmed", {
        price,
        pairId: pair.id,
        duration: dealData.durationFormatted,
        durationSeconds: dealData.durationSeconds,
        message: `Deal confirmed at $${price}! (took ${dealData.durationFormatted})`
      });

      console.log(`🤝 Deal confirmed in pair ${pair.id} at $${price} (duration: ${dealData.durationFormatted})`);
    } else {
      socket.emit("dealPending", {
        yourPrice: price,
        waitingFor: otherUser.name,
        message: `Waiting for ${otherUser.name} to confirm $${price}`
      });

      // Notify the other user about the confirmation attempt
      const otherSocket = io.sockets.sockets.get(otherUser.socketId);
      if (otherSocket) {
        otherSocket.emit("partnerConfirming", {
          partnerName: user.name,
          price,
          message: `${user.name} wants to confirm a deal at $${price}`
        });
      }

      console.log(`⏳ ${user.name} confirmed $${price}, waiting for ${otherUser.name}`);
    }
    
    // Broadcast updated pair data to moderators
    broadcastToModerators('moderator:gameData', {
      stats: getGameStats(),
      pairs: getActivePairs()
    });
  });

  // Moderator-specific handlers
  socket.on("moderator:authenticate", ({ token }) => {
    if (token === MODERATOR_TOKEN) {
      socket.data.isModerator = true;
      socket.data.authenticated = true;
      socket.emit("moderator:authenticated");
      console.log(`🛡️ Moderator authenticated: ${socket.id}`);
    } else {
      socket.emit("error", { message: "Invalid moderator token" });
    }
  });

  socket.on("moderator:requestData", () => {
    if (!socket.data?.isModerator || !socket.data?.authenticated) {
      socket.emit("error", { message: "Unauthorized" });
      return;
    }

    socket.emit("moderator:gameData", {
      stats: getGameStats(),
      pairs: getActivePairs()
    });
  });

  socket.on("moderator:getRoomDetails", ({ roomId }) => {
    if (!socket.data?.isModerator || !socket.data?.authenticated) {
      socket.emit("error", { message: "Unauthorized" });
      return;
    }

    const roomDetails = getRoomDetails(roomId);
    socket.emit("moderator:roomDetails", roomDetails);
  });

  socket.on("moderator:endRound", ({ roomId }) => {
    if (!socket.data?.isModerator || !socket.data?.authenticated) {
      socket.emit("error", { message: "Unauthorized - moderator access required" });
      return;
    }

    if (!rooms[roomId]) return;

    // End all active pairs in the room
    Object.values(pairs).forEach(pair => {
      if (pair.roomId === roomId && !pair.finalDeal) {
        pair.endedAt = new Date().toISOString();
        pair.ended = true;
      }
    });

    io.to(roomId).emit("roundEnd", { roomId });
    
    broadcastToModerators('moderator:activity', {
      message: `🛑 Round ended in ${roomId}`,
      type: 'info'
    });

    broadcastToModerators('moderator:gameData', {
      stats: getGameStats(),
      pairs: getActivePairs()
    });
  });

  socket.on("moderator:resetRoom", ({ roomId }) => {
    if (!socket.data?.isModerator || !socket.data?.authenticated) {
      socket.emit("error", { message: "Unauthorized - moderator access required" });
      return;
    }

    if (!rooms[roomId]) return;

    // Remove all users from room
    rooms[roomId].users.forEach(user => {
      if (users[user.id]) {
        delete users[user.id];
      }
    });

    // Remove all pairs from room
    Object.keys(pairs).forEach(pairId => {
      if (pairs[pairId].roomId === roomId) {
        delete pairs[pairId];
      }
    });

    // Reset room
    rooms[roomId] = { users: [], pairs: [] };

    // Disconnect all sockets in the room
    io.to(roomId).emit("roomReset", { roomId });
    
    broadcastToModerators('moderator:activity', {
      message: `🔄 Room ${roomId} has been reset`,
      type: 'warning'
    });

    broadcastToModerators('moderator:gameData', {
      stats: getGameStats(),
      pairs: getActivePairs()
    });
  });

  socket.on("disconnect", () => {
    if (socket.data?.userId) {
      const user = users[socket.data.userId];
      if (user) {
        console.log(`❌ User disconnected: ${user.name} (${user.id})`);
        // Don't delete user - they can reconnect
        // Just clear the socketId so we know they're offline
        user.socketId = null;
      }
    } else {
      console.log("❌ Unknown user disconnected:", socket.id);
    }
  });
});

// Initialize persistence layer and start server
async function startServer() {
  try {
    console.log('🔄 Initializing database connection...');
    await persistence.initialize();
    
    // Load game configuration from database
    const config = await persistence.getGameConfig();
    if (config) {
      Object.assign(gameConfig, config);
      console.log('✅ Loaded game configuration from database');
    }
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`💾 Database persistence: ENABLED`);
    });
  } catch (error) {
    console.error('❌ Failed to initialize server:', error);
    console.log('🔄 Starting in memory-only mode...');
    
    server.listen(PORT, () => {
      console.log(`🚀 Server running on http://localhost:${PORT}`);
      console.log(`⚠️ Database persistence: DISABLED (using memory only)`);
    });
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down server...');
  try {
    await persistence.close();
    console.log('💾 Database connection closed');
  } catch (error) {
    console.error('❌ Error closing database:', error);
  }
  process.exit(0);
});

startServer();
