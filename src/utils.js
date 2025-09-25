import { v4 as uuidv4 } from "uuid";

export const uid = () => uuidv4();
export const nowISO = () => new Date().toISOString();

export const shuffle = (arr) => {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
