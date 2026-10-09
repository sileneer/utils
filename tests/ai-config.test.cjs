/* eslint-disable @typescript-eslint/no-require-imports */
require('./register.cjs');
const test = require('node:test'), assert = require('node:assert/strict'), { randomUUID } = require('node:crypto');
const configureAI = require('./ai-fixture.cjs');
const { aiConfiguration, publicModelConfig } = require('../src/lib/agent/config.ts');
const { selectAgentModel } = require('../src/lib/agent/models.ts');
const { agentEnvironment } = require('../src/lib/agent/book-tools.ts');
test.beforeEach(configureAI);

test('runtime models/default are public allowlisted metadata; custom model has no compiled catalog dependency', () => {
  process.env.ANTHROPIC_MODEL = 'custom/model-v2';
  process.env.AI_MODELS = JSON.stringify([{id:'custom/model-v2',name:'Custom default',apiKey:'must-not-forward'},{id:'other-model',name:'Other'}]);
  const config=publicModelConfig();
  assert.deepEqual(config,{defaultModel:'custom/model-v2',models:[{id:'custom/model-v2',name:'Custom default'},{id:'other-model',name:'Other'}]});
  assert.equal(selectAgentModel('other-model',config),'other-model');
  assert.equal(selectAgentModel('removed-preference',config),'custom/model-v2');
  assert.doesNotMatch(JSON.stringify(config),/must-not-forward|127\.0\.0\.1|apiKey|baseUrl/);
  assert.ok(!JSON.stringify(config).includes(process.env.SENSENOVA_API_KEY));
});

test('generic key takes priority; blank/missing names retain SDK and legacy aliases', () => {
  const canonical=randomUUID(),sdkAlias=randomUUID(),legacy=process.env.SENSENOVA_API_KEY;
  process.env.AI_API_KEY=' '+canonical+' ';
  process.env.ANTHROPIC_AUTH_TOKEN=sdkAlias;
  assert.equal(aiConfiguration().apiKey,canonical);
  assert.ok(!JSON.stringify(publicModelConfig()).includes(canonical));
  process.env.AI_API_KEY='   ';
  assert.equal(aiConfiguration().apiKey,sdkAlias);
  delete process.env.AI_API_KEY;
  assert.equal(aiConfiguration().apiKey,sdkAlias);
  process.env.ANTHROPIC_AUTH_TOKEN='   ';
  assert.equal(aiConfiguration().apiKey,legacy);
  delete process.env.ANTHROPIC_AUTH_TOKEN;
  assert.equal(aiConfiguration().apiKey,legacy);
  delete process.env.SENSENOVA_API_KEY;
  assert.equal(aiConfiguration(),undefined);
});

test('no catalog defaults to exactly configured model; missing values never fall back to provider defaults', () => {
  delete process.env.AI_MODELS;
  assert.deepEqual(publicModelConfig(),{defaultModel:'deepseek-flash',models:[{id:'deepseek-flash',name:'deepseek-flash'}]});
  for(const key of ['ANTHROPIC_MODEL','ANTHROPIC_BASE_URL','SENSENOVA_API_KEY']){
    configureAI();delete process.env[key];
    assert.equal(aiConfiguration(),undefined);
    assert.deepEqual(publicModelConfig(),{defaultModel:'',models:[]});
  }
});

test('invalid URLs/catalogs/default membership/auxiliary IDs fail closed', () => {
  for(const base of ['ftp://example.test','https://user:pass@example.test','https://example.test/v1/','https://example.test?key=value','https://example.test/#token','not-a-url']){
    configureAI();process.env.ANTHROPIC_BASE_URL=base;assert.equal(aiConfiguration(),undefined);
  }
  for(const value of ['not JSON','[]','{}',JSON.stringify([{id:'unlisted',name:'Missing default'}]),JSON.stringify([{id:'deepseek-flash',name:''}]),JSON.stringify([{id:'deepseek-flash',name:'x\n'}]),JSON.stringify([{id:'deepseek-flash',name:'One'},{id:'deepseek-flash',name:'Two'}]),JSON.stringify(Array.from({length:21},(_,i)=>({id:'m'+i,name:'Model'}))), ' '.repeat(8192)+'x']){
    configureAI();process.env.AI_MODELS=value;assert.equal(aiConfiguration(),undefined);
  }
  configureAI();process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL='invalid model';assert.equal(aiConfiguration(),undefined);
});

test('SDK receives configured endpoint/token and selected main/auxiliary models, excluding auth/mail secrets', () => {
  const canonical=randomUUID();process.env.AI_API_KEY=canonical;process.env.ANTHROPIC_AUTH_TOKEN=randomUUID();
  process.env.ANTHROPIC_BASE_URL='http://127.0.0.1:9/';
  process.env.BETTER_AUTH_SECRET=randomUUID();process.env.BREVO_API_KEY=randomUUID();process.env.TURNSTILE_SECRET_KEY=randomUUID();
  let env=agentEnvironment('qa-alternative');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN,canonical);
  assert.equal(env.ANTHROPIC_BASE_URL,'http://127.0.0.1:9');
  assert.equal(env.ANTHROPIC_MODEL,'qa-alternative');
  for(const slot of ['SONNET','HAIKU','OPUS']) assert.equal(env['ANTHROPIC_DEFAULT_'+slot+'_MODEL'],'qa-alternative');
  for(const key of ['BETTER_AUTH_SECRET','BREVO_API_KEY','TURNSTILE_SECRET_KEY','AI_API_KEY','SENSENOVA_API_KEY','AI_MODELS','DATABASE_PATH'])assert.equal(key in env,false);
  process.env.ANTHROPIC_DEFAULT_HAIKU_MODEL='aux-model';env=agentEnvironment('qa-alternative');assert.equal(env.ANTHROPIC_DEFAULT_HAIKU_MODEL,'aux-model');
  assert.throws(()=>agentEnvironment('unlisted'),/ai_configuration_missing/);
});

test('a real disposable .env loads the quoted JSON catalog and canonical token at runtime', async () => {
  const fs=require('node:fs/promises'),path=require('node:path'),{execFileSync}=require('node:child_process');
  const directory=path.join(process.cwd(),'data','env-config-'+randomUUID());
  await fs.mkdir(directory,{recursive:true});
  try {
    const catalog=[{id:'dotenv-custom',name:'Model from .env'}];
    await fs.writeFile(path.join(directory,'.env'),['ANTHROPIC_BASE_URL=http://127.0.0.1:9','AI_API_KEY='+randomUUID(),'ANTHROPIC_MODEL=dotenv-custom',"AI_MODELS='"+JSON.stringify(catalog)+"'"].join('\n'));
    const child="require('./tests/register.cjs');for(const key of ['ANTHROPIC_BASE_URL','AI_API_KEY','ANTHROPIC_AUTH_TOKEN','SENSENOVA_API_KEY','ANTHROPIC_MODEL','AI_MODELS','ANTHROPIC_DEFAULT_SONNET_MODEL','ANTHROPIC_DEFAULT_HAIKU_MODEL','ANTHROPIC_DEFAULT_OPUS_MODEL'])delete process.env[key];require('@next/env').loadEnvConfig(process.argv[1],false,{info(){},error(){}});const c=require('./src/lib/agent/config.ts');console.log(JSON.stringify({ready:Boolean(c.aiConfiguration()),public:c.publicModelConfig()}));";
    const output=execFileSync(process.execPath,['-e',child,directory],{encoding:'utf8'});
    assert.deepEqual(JSON.parse(output),{ready:true,public:{defaultModel:'dotenv-custom',models:catalog}});
  } finally {await fs.rm(directory,{recursive:true,force:true});}
});
