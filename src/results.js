import { state } from "./datastore.js";

export function compileRoundResults(roomId, roundNumber) {
  const room = state.rooms.get(roomId);
  if (!room) return { roomId, roundNumber, pairResults: [], stats: {} };

  const pairResults = [];
  let prices = [];

  room.activePairs.forEach((pairId) => {
    const pair = state.pairs.get(pairId);
    if (!pair) return;
    if (pair.finalDeal && pair.finalDeal.success) {
      pairResults.push({ pairId, finalPrice: pair.finalDeal.price, success: true });
      prices.push(pair.finalDeal.price);
    } else {
      pairResults.push({ pairId, finalPrice: null, success: false });
    }
  });

  const avg = prices.length ? (prices.reduce((a,b)=>a+b,0) / prices.length) : null;
  const stats = {
    avgDealPrice: avg,
    minPrice: prices.length ? Math.min(...prices) : null,
    maxPrice: prices.length ? Math.max(...prices) : null,
    dealRate: room.activePairs.size ? Math.round(100 * (prices.length / room.activePairs.size)) : 0
  };

  return {
    event: "roundResults",
    roomId,
    roundNumber,
    item: room.items[roundNumber - 1] || null,
    pairResults,
    stats
  };
}
