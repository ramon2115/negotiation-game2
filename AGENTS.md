# Agent Instructions

## Commands
- Start dev server: `npm run dev` (kills port 3000, starts with NODE_ENV=development)
- Start production: `npm start` (kills port 3000, starts server)
- No test framework configured - add tests with npm test script if needed

## Architecture
- Node.js/Express server with Socket.IO for real-time negotiation game
- Entry point: `server.js` - Express app serving static files from `public/`
- Modules in `src/`: datastore (in-memory state), users, rooms, pairing, surveys, results, utils
- Frontend: Single HTML file at `public/test-client.html`
- No database - uses in-memory Maps for users, rooms, pairs in datastore.js

## Code Style
- ES6 modules (`import`/`export`) with `"type": "module"` in package.json
- Function naming: camelCase (`extractOffer`, `pairUsers`)
- Destructuring in function params and variables
- Template literals for strings with variables
- Arrow functions for short callbacks, regular functions for main exports
- Comments: `// ---` for sections, `//` for inline explanations
- Console logging with emoji prefixes (`✅`, `❌`, `ℹ️`, `⚠️`)
- No TypeScript - plain JavaScript with JSDoc comments for complex functions
