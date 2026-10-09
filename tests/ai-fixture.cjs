/* eslint-disable @typescript-eslint/no-require-imports */
// Disposable offline provider fixture; never queries an external service.
module.exports = function configureAI() {
  delete process.env.AI_API_KEY;
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  for (const slot of ['SONNET', 'HAIKU', 'OPUS']) delete process.env['ANTHROPIC_DEFAULT_' + slot + '_MODEL'];
  process.env.SENSENOVA_API_KEY = require('node:crypto').randomUUID();
  process.env.ANTHROPIC_BASE_URL = 'http://127.0.0.1:9';
  process.env.ANTHROPIC_MODEL = 'deepseek-flash';
  process.env.AI_MODELS = JSON.stringify([{ id: 'deepseek-flash', name: 'Fixture default' }, { id: 'qa-alternative', name: 'Fixture alternative' }]);
};
