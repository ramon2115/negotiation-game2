import express from "express";
import http from "http";
import { Server } from "socket.io";
import dotenv from "dotenv";
import { v4 as uuidv4 } from "uuid";
import { pairUsers, assignRoles } from "./src/pairing.js";
import path from "path";
import { fileURLToPath } from "url";

dotenv.config();

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// --- Serve static files ---
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.use(express.static(path.join(__dirname, "public")));

// Redirect root → test-client.html
app.get("/", (req, res) => {
  res.redirect("/test-client.html");
});

// In-memory room store
const rooms = {}; // { roomId: { users: [], pairs: [] } }

// --- Regex extractor with series/model penalty ---
function extractNumbersWithRegex(text, role) {
  const regex = /\$?\d+/g;
  const matches = text.match(regex) || [];

  const lowered = text.toLowerCase();
  const penaltyWords = ["iphone", "galaxy", "series", "model", "version", "mark"];

  const numbers = matches.map((m) => {
    const value = parseFloat(m.replace("$", ""));
    let confidence = 0.5;

    // Penalize small "series/model numbers"
    if (value < 50) {
      for (const w of penaltyWords) {
        if (lowered.includes(w) && text.includes(m)) {
          confidence = 0.05;
          console.log(`⚠️ Penalized ${value} (likely a model/series number)`);
        }
      }
    }
    return { value, context: "neutral", confidence };
  });

  let offer = null;
  if (numbers.length) {
    if (role === "A") {
      offer = Math.max(...numbers.map((n) => n.value)); // Seller bias high
    } else if (role === "B") {
      offer = Math.min(...numbers.map((n) => n.value)); // Buyer bias low
    } else {
      offer = numbers[0].value;
    }
  }

  return { numbersFound: numbers, offer, rawModelOutput: null, errorCause: "regex_only" };
}

// Always use regex now
async function extractOffer(message, role) {
  return extractNumbersWithRegex(message, role);
}

// --- Socket.io handlers ---
io.on("connection", (socket) => {
  console.log("✅ A user connected:", socket.id);

  socket.on("register", ({ roomId, name }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { users: [], pairs: [] };
    }

    const user = { id: socket.id, name, role: null, roundsCompleted: 0 };
    rooms[roomId].users.push(user);
    socket.join(roomId);

    io.to(socket.id).emit("needPreSurvey", { roomId });
    console.log(`ℹ️ User registered to ${roomId}`, user);
  });

  socket.on("chatMessage", async ({ message }) => {
    const roomId = [...socket.rooms][1]; // second entry is the room
    if (!roomId || !rooms[roomId]) return;

    const user = rooms[roomId].users.find((u) => u.id === socket.id);
    const role = user?.role || null;

    const offerData = await extractOffer(message, role);

    const payload = {
      userId: socket.id,
      role,
      message,
      ...offerData,
      timestamp: new Date().toISOString(),
    };

    io.to(roomId).emit("chatLog", payload);
    socket.emit("chatMessageAck", {
      ok: true,
      sent: message,
      extractedOffer: offerData.offer,
      errorCause: offerData.errorCause,
    });
  });

  socket.on("moderator:startRound", ({ roomId }) => {
    if (!rooms[roomId]) return;
    const room = rooms[roomId];

    // Pair users + assign roles
    const pairs = pairUsers(room.users);
    assignRoles(pairs);
    room.pairs = pairs;

    const item = { round: 1, itemId: `${roomId}-1`, name: "Laptop" };

    io.to(roomId).emit("roundStart", { roomId, roundNumber: 1, item });
    io.to(roomId).emit("roomUpdate", {
      roomId,
      roomName: "Electronics",
      roundNumber: 1,
      usersCount: room.users.length,
      waitingCount: 0,
      preSurveyComplete: 2,
      postSurveyComplete: 0,
      activePairs: pairs.map(([a, b]) => ({
        pairId: uuidv4(),
        users: [a, b],
        item,
        latestOffers: { A: null, B: null },
        finalDeal: null,
      })),
    });
  });

  socket.on("disconnect", () => {
    console.log("❌ User disconnected:", socket.id);
    for (const roomId in rooms) {
      rooms[roomId].users = rooms[roomId].users.filter((u) => u.id !== socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
