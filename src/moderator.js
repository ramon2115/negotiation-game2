import { state } from "./datastore.js";

export function getRoomOverview(roomId) {
  const room = state.rooms.get(roomId);
  if (!room) return { roomId, missing: true };

  const pairs = [];
  room.activePairs.forEach((pairId) => {
    const pair = state.pairs.get(pairId);
    if (!pair) return;
    const [u1, u2] = pair.users.map((id) => state.users.get(id));
    pairs.push({
      pairId,
      users: [
        { id: u1?.id, role: u1?.role, roundsCompleted: u1?.roundsCompleted },
        { id: u2?.id, role: u2?.role, roundsCompleted: u2?.roundsCompleted }
      ],
      item: pair.item,
      latestOffers: pair.latestOffers,
      finalDeal: pair.finalDeal
    });
  });

  // survey tallies
  let pre = 0, post = 0;
  room.users.forEach((uid) => {
    const u = state.users.get(uid);
    if (u?.preSurvey?.completed) pre += 1;
    if (u?.postSurvey?.completed) post += 1;
  });

  return {
    roomId: room.id,
    roomName: room.name,
    roundNumber: room.roundNumber,
    usersCount: room.users.size,
    waitingCount: room.waitingQueue.length,
    preSurveyComplete: pre,
    postSurveyComplete: post,
    activePairs: pairs
  };
}

export function getAllRoomsOverview() {
  return Array.from(state.rooms.keys()).map((rid) => getRoomOverview(rid));
}
