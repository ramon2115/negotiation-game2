import { state } from "./datastore.js";
import { uid } from "./utils.js";

const ROLE_BLOCK = 5;         // flip roles after 5 rounds
const TOTAL_ROUNDS = 10;

export function ensureRoom(roomId) {
  if (!state.rooms.has(roomId)) {
    state.rooms.set(roomId, {
      id: roomId,
      name: roomId,
      items: [],
      roundNumber: 0,
      users: new Set(),
      waitingQueue: [],
      activePairs: new Set()
    });
  }
}

export function bootstrapRooms(roomDefs) {
  roomDefs.forEach(({ id, name, items }) => {
    state.rooms.set(id, {
      id, name,
      items: items.map((n, idx) => ({ round: idx + 1, itemId: `${id}-${idx+1}`, name: n })),
      roundNumber: 0,
      users: new Set(),
      waitingQueue: [],
      activePairs: new Set()
    });
  });
}

export function addUserToRoom(userId, roomId) {
  ensureRoom(roomId);
  state.rooms.get(roomId).users.add(userId);
}

export function markUserReady(userId) {
  const user = state.users.get(userId);
  if (!user) return;
  const room = state.rooms.get(user.roomId);
  if (!room) return;
  if (!room.waitingQueue.includes(userId)) {
    room.waitingQueue.push(userId);
    user.status = "waiting";
  }
}

export function getRoomState(roomId) {
  return state.rooms.get(roomId);
}

export function getCurrentItem(roomId) {
  const room = state.rooms.get(roomId);
  const idx = room.roundNumber - 1;
  return room.items[idx] || null;
}

export function resetPairs(roomId) {
  const room = state.rooms.get(roomId);
  room.activePairs.forEach((pairId) => state.pairs.delete(pairId));
  room.activePairs.clear();
}

export function createPair(userA, userB, roomId, roundNumber, item) {
  const pairId = uid();
  const pair = {
    pairId,
    roomId,
    users: [userA.id, userB.id],
    roundNumber,
    item,
    offers: [],
    latestOffers: { A: null, B: null },
    finalDeal: null,
    confirmedBy: new Set()
  };
  state.pairs.set(pairId, pair);
  state.rooms.get(roomId).activePairs.add(pairId);

  // link users
  userA.partnerId = userB.id;
  userB.partnerId = userA.id;
  userA.status = "paired";
  userB.status = "paired";
  userA.previousPartners.add(userB.id);
  userB.previousPartners.add(userA.id);

  return pair;
}

export function getPairByUser(userId) {
  // O(number of pairs in room) which is fine for MVP; can index later
  for (const pair of state.pairs.values()) {
    if (pair.users.includes(userId)) return pair;
  }
  return null;
}

export function appendOffer(pairId, parsed) {
  const pair = state.pairs.get(pairId);
  if (!pair) return;
  pair.offers.push(parsed);
  if (parsed.offer != null) {
    pair.latestOffers[parsed.role] = parsed.offer;
  }
}

export function confirmDeal(pairId, userId, price) {
  const pair = state.pairs.get(pairId);
  if (!pair) return { changed: false };
  pair.confirmedBy.add(userId);

  const okPrice =
    typeof price === "number" ? price :
    pair.latestOffers.A ?? pair.latestOffers.B ?? null;

  if (pair.confirmedBy.size === 2 && okPrice != null) {
    pair.finalDeal = { price: okPrice, success: true };
    return { changed: true, locked: true, price: okPrice };
  }
  return { changed: true, locked: false };
}

export function handleDisconnect(userId) {
  const user = state.users.get(userId);
  if (!user) return;
  const room = state.rooms.get(user.roomId);
  if (!room) return;

  // If paired, free partner back to queue
  const pair = getPairByUser(userId);
  if (pair) {
    const otherId = pair.users.find((u) => u !== userId);
    if (otherId) {
      const other = state.users.get(otherId);
      if (other) {
        other.partnerId = null;
        other.status = "waiting";
        if (!room.waitingQueue.includes(other.id)) room.waitingQueue.push(other.id);
      }
    }
    state.pairs.delete(pair.pairId);
    room.activePairs.delete(pair.pairId);
  }

  // Remove from waiting queue/users
  room.waitingQueue = room.waitingQueue.filter((id) => id !== userId);
  room.users.delete(userId);
}

export const constants = { ROLE_BLOCK, TOTAL_ROUNDS };
