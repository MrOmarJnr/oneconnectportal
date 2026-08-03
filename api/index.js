// Vercel serverless entry for the PORTAL project (root directory = uiogf_portal).
//
// Vercel routes every request here (see vercel.json). This exports the whole
// Express app — the One Connect admin portal plus the public /api/submit/*
// form endpoints that the website proxies to. @vercel/node adapts the Express
// app to the serverless request/response.
module.exports = require('../server');
