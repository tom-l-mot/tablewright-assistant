import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { boundedJSON } from './http-json.mjs';
import { fail } from '../module/lib/validation.mjs';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const REVOKE_URL = `${ISSUER}/api/accounts/oauth/revoke`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));

const random = () => randomBytes(32).toString('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

async function verify(token, clientId, nonce) {
  const { payload } = await jwtVerify(token, JWKS, { issuer: ISSUER, audience: clientId });
  if (!same(payload.nonce, nonce) || typeof payload.sub !== 'string' || !payload.sub) fail('CHATGPT_AUTH', 'ChatGPT returned an invalid account identity.');
  return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
}

function credentials(value) {
  if (!value || typeof value.access_token !== 'string' || !value.access_token || typeof value.refresh_token !== 'string' || !value.refresh_token || typeof value.id_token !== 'string' || !value.id_token || value.token_type !== 'Bearer' || !Number.isInteger(value.expires_in) || value.expires_in <= 0 || typeof value.scope !== 'string') fail('CHATGPT_AUTH', 'ChatGPT returned incomplete credentials.');
  if (!value.scope.split(/\s+/).includes('chatgpt.tokens.use.direct')) fail('CHATGPT_SCOPE', 'ChatGPT plan usage was not authorized for this app. Allow it in ChatGPT and try again.');
  return { accessToken: value.access_token, refreshToken: value.refresh_token, idToken: value.id_token, scopes: value.scope.split(/\s+/), expiresAt: Date.now() + value.expires_in * 1000 };
}

export class ChatGPTAuth {
  constructor({ store, fetchImpl = fetch, verifyIdToken = verify } = {}) {
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.verifyIdToken = verifyIdToken;
    this.record = null;
    this.pending = null;
    this.refreshing = null;
  }

  async init() {
    if (this.record) return;
    if (!this.store) { this.record = { hostId: '', account: null }; return; }
    const record = await this.store.load();
    if (record && (typeof record.hostId !== 'string' || !record.hostId.startsWith('urn:uuid:') || (record.account !== null && (typeof record.account?.clientId !== 'string' || typeof record.account?.subject !== 'string')))) fail('CHATGPT_STORE', 'The saved ChatGPT account could not be read.');
    this.record = record ?? { hostId: `urn:uuid:${randomUUID()}`, account: null };
    if (!record) await this.store.save(this.record);
  }

  status() {
    const account = this.record?.account;
    return { signedIn: Boolean(account?.refreshToken), email: account?.email ?? '', models: account?.models ?? [], model: account?.model ?? '' };
  }

  async begin(redirectUri, newAccount = false) {
    await this.init();
    if (!this.store) fail('CHATGPT_STORE', 'ChatGPT sign-in currently requires Windows local credential storage.');
    if (this.pending && Date.now() - this.pending.startedAt < 300000) fail('BUSY', 'A ChatGPT sign-in is already in progress.');
    const state = random();
    const nonce = random();
    const verifier = random();
    if (newAccount && this.record.account?.refreshToken) fail('CHATGPT_AUTH', 'Sign out of the current ChatGPT account first.');
    // shortcut: one saved ChatGPT account per companion; add an account picker when switching without sign-out is needed.
    const clientId = newAccount ? null : this.record.account?.clientId ?? null;
    this.pending = { state, nonce, verifier, redirectUri, clientId, startedAt: Date.now() };
    const url = new URL(`${ISSUER}/api/accounts/authorize`);
    const params = { client_id: clientId ?? 'dynamic_agent_client', ext_agent_host_id: this.record.hostId, response_type: 'code', redirect_uri: redirectUri, scope: SCOPES, resource: RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') };
    if (!clientId) params.agent_name_hint = 'Tablewright Assistant';
    if (clientId && this.record.account.email) params.login_hint = this.record.account.email;
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.href;
  }

  async #token(params) {
    let response;
    try {
      response = await this.fetchImpl(TOKEN_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
      if (!response.ok) throw new Error('token exchange failed');
      return await boundedJSON(response.body, 32768);
    } catch { fail('CHATGPT_AUTH', 'ChatGPT sign-in or renewal failed. Try signing in again.'); }
  }

  async callback(url) {
    const pending = this.pending;
    if (!pending || Date.now() - pending.startedAt > 300000 || url.searchParams.getAll('state').length !== 1 || !same(url.searchParams.get('state'), pending.state)) fail('CHATGPT_AUTH', 'This ChatGPT sign-in link expired or did not match. Start again from Foundry.');
    this.pending = null;
    if (url.searchParams.has('error')) fail('CHATGPT_AUTH', 'ChatGPT sign-in was cancelled or not authorized.');
    if (url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code') || url.searchParams.getAll('client_id').length > 1) fail('CHATGPT_AUTH', 'ChatGPT returned an invalid authorization result.');
    const returnedId = url.searchParams.get('client_id');
    const clientId = pending.clientId ?? returnedId;
    if (!clientId || clientId === 'dynamic_agent_client' || (pending.clientId && returnedId && returnedId !== pending.clientId)) fail('CHATGPT_AUTH', 'ChatGPT returned an unexpected client registration.');
    const tokens = credentials(await this.#token({ grant_type: 'authorization_code', client_id: clientId, code: url.searchParams.get('code'), code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE }));
    let identity;
    try { identity = await this.verifyIdToken(tokens.idToken, clientId, pending.nonce); }
    catch { fail('CHATGPT_AUTH', 'ChatGPT returned an invalid account identity.'); }
    if (pending.clientId && identity.subject !== this.record.account.subject) fail('CHATGPT_AUTH', 'ChatGPT returned a different account.');
    const candidate = { clientId, ...identity, ...tokens, models: [], model: '' };
    this.record = { ...this.record, account: candidate };
    await this.store.save(this.record);
    await this.loadModels();
    return this.status();
  }

  async accessToken() {
    await this.init();
    const account = this.record.account;
    if (!account?.refreshToken) fail('CHATGPT_AUTH', 'Sign in with ChatGPT to use your plan.');
    if (account.expiresAt > Date.now() + 60000) return account.accessToken;
    if (!this.refreshing) this.refreshing = (async () => {
      const token = await this.#token({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.refreshToken, resource: RESOURCE });
      const replacement = credentials({ ...token, id_token: account.idToken });
      const current = this.record.account;
      if (current !== account) fail('CHATGPT_AUTH', 'The ChatGPT account changed during renewal.');
      this.record = { ...this.record, account: { ...account, ...replacement } };
      await this.store.save(this.record);
      return replacement.accessToken;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async loadModels() {
    const token = await this.accessToken();
    let response;
    let body;
    try {
      response = await this.fetchImpl(`${RESOURCE}/models`, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) throw new Error('model catalog failed');
      body = await boundedJSON(response.body, 131072);
    } catch { fail('CHATGPT_MODELS', 'Could not load models for this ChatGPT account. Try signing in again.'); }
    const models = Array.isArray(body.models) ? body.models.filter(item => item?.visibility === 'list' && typeof item.slug === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(item.slug) && typeof item.display_name === 'string').slice(0, 100).map(item => ({ slug: item.slug, name: item.display_name.slice(0, 100) })) : [];
    if (!models.length) fail('CHATGPT_MODELS', 'No supported models are available to this ChatGPT account.');
    const account = this.record.account;
    const model = models.some(item => item.slug === account.model) ? account.model : models[0].slug;
    this.record = { ...this.record, account: { ...account, models, model } };
    await this.store.save(this.record);
    return this.status();
  }

  async selectModel(slug) {
    if (!this.record?.account?.models.some(model => model.slug === slug)) fail('CHATGPT_MODELS', 'Choose a model listed for this ChatGPT account.');
    this.record = { ...this.record, account: { ...this.record.account, model: slug } };
    await this.store.save(this.record);
    return this.status();
  }

  async signOut() {
    await this.init();
    if (this.refreshing) await this.refreshing.catch(() => {});
    const account = this.record.account;
    if (!account?.refreshToken) return { ...this.status(), revoked: true };
    let revoked = false;
    try {
      const response = await this.fetchImpl(REVOKE_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: account.refreshToken, token_type_hint: 'refresh_token', client_id: account.clientId }) });
      revoked = response.ok;
    } catch { /* Local sign-out still clears credentials. */ }
    this.record = { ...this.record, account: { clientId: account.clientId, subject: account.subject, email: account.email, models: [], model: '' } };
    await this.store.save(this.record);
    return { ...this.status(), revoked };
  }
}
