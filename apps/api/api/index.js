// Shim plano (sin TS) para que Vercel no intente bundlear este archivo con esbuild.
// La lógica real vive en src/serverless.ts, compilada por `nest build` (tsc) a dist/serverless.js.
module.exports = require('../dist/serverless').default;
