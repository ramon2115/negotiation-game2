// src/pairing.js

/**
 * Shuffle and pair users into negotiation pairs
 * @param {Array} users - list of user objects {id, name, role, roundsCompleted}
 * @returns {Array} pairs - each pair is [userA, userB]
 */
export function pairUsers(users) {
  const pairs = [];
  const shuffled = [...users].sort(() => Math.random() - 0.5);

  for (let i = 0; i < shuffled.length; i += 2) {
    if (shuffled[i + 1]) {
      pairs.push([shuffled[i], shuffled[i + 1]]);
    }
  }

  return pairs;
}

/**
 * Assign roles to paired users
 * A = Seller, B = Buyer
 * @param {Array} pairs - array of [userA, userB]
 * @returns {Array} pairsWithRoles
 */
export function assignRoles(pairs) {
  return pairs.map(([userA, userB]) => {
    userA.role = "A"; // Seller
    userB.role = "B"; // Buyer
    return [userA, userB];
  });
}
