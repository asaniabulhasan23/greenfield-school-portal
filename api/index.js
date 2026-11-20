'use strict';

/* Vercel serverless entry point. The portal's real HTTP handler is shared
   with the local Node server so both environments behave identically. */
const { handleRequest } = require('../server/index');

module.exports = (req, res) => handleRequest(req, res);
