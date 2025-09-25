import { state } from "./datastore.js";

export function submitPreSurvey(userId, responses) {
  const u = state.users.get(userId);
  if (!u) return;
  u.preSurvey = { completed: true, responses: responses || {} };
}

export function submitPostSurvey(userId, responses) {
  const u = state.users.get(userId);
  if (!u) return;
  u.postSurvey = { completed: true, responses: responses || {} };
}

export const hasCompletedPreSurvey = (userId) => {
  const u = state.users.get(userId);
  return !!(u && u.preSurvey.completed);
};
