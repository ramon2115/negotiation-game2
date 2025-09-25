import { state } from "./datastore.js";

export function addUser(userId, roomId, name) {
  const user = {
    id: userId,
    name,
    roomId,
    partnerId: null,
    role: null,                // "A" | "B"
    roundsCompleted: 0,
    previousPartners: new Set(),
    status: "new",             // new | waiting | paired | disconnected
    preSurvey: { completed: false, responses: {} },
    postSurvey: { completed: false, responses: {} },
    confirmPrice: null         // last price user confirmed this round (for locking)
  };
  state.users.set(userId, user);
  return user;
}

export const getUser = (id) => state.users.get(id);

export function updateUser(id, updates) {
  const u = state.users.get(id);
  if (!u) return;
  Object.assign(u, updates);
}

export function removeUser(id) {
  state.users.delete(id);
}
