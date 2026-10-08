/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit loopback QA launcher. No import from application/Docker runtime.
// Fake secrets and an in-memory outbox, never production mail or AI calls.
const { randomUUID } = require('node:crypto');
const path = require('node:path');
const http = require('node:http');
process.env.APP_URL = 'http://127.0.0.1:3001';
process.env.DATABASE_PATH = path.join(process.cwd(), 'data', 'auth-preview', 'utils.sqlite');
process.env.BETTER_AUTH_SECRET = randomUUID() + randomUUID();
process.env.BREVO_API_KEY = 'local-ui-fixture';
process.env.MAIL_FROM = 'noreply@example.test';
process.env.TURNSTILE_SITE_KEY = '1x00000000000000000000AA';
process.env.TURNSTILE_SECRET_KEY = '1x0000000000000000000000000000000AA';
process.env.TRUST_CLOUDFLARE_IP = '0';
process.env.AI_ENABLED = '0';
process.env.SENSENOVA_API_KEY = '';
const outbox = [], fetch = global.fetch;
global.fetch = async (url, options) => {
  if (String(url).startsWith('https://api.brevo.com/')) {
    const body = JSON.parse(options.body);
    outbox.push({ email: body.to[0].email, code: body.textContent.match(/Verification code: (\d{6})/)[1] });
    return Response.json({ messageId: randomUUID() }, { status: 201 });
  }
  if (String(url).startsWith('https://challenges.cloudflare.com/turnstile/v0/siteverify'))
    return Response.json({ success: true, hostname: '127.0.0.1' });
  return fetch(url, options);
};
require('../scripts/database.cjs').migrate().then(db => {
  db.close();
  // Inspection endpoint is a separate fixture process surface, not an app API.
  http.createServer((req, res) => {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(outbox));
  }).listen(3002, '127.0.0.1');
  process.argv = [process.argv[0], require.resolve('next/dist/bin/next'), 'start', '-H', '127.0.0.1', '-p', '3001'];
  require('next/dist/bin/next');
});
