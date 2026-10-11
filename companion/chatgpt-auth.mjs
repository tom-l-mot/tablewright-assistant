import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { boundedJSON } from './http-json.mjs';
import { AssistantError, fail } from '../module/lib/validation.mjs';
import { chatgptError } from './provider.mjs';

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES = 'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const TOKEN_URL = `${ISSUER}/api/accounts/oauth/token`;
const REVOKE_URL = `${ISSUER}/api/accounts/oauth/revoke`;
const JWKS = createRemoteJWKSet(new URL(`${ISSUER}/.well-known/jwks.json`));
const DEFAULT_MODEL = 'gpt-5.6-luna';
const DISABLED_MESSAGE = 'ChatGPT is signed in, but plan usage is disabled. Enable app access in ChatGPT settings and sign in again.';
const unusableRefresh = new Set(['invalid_grant', 'invalid_refresh_token', 'token_expired', 'refresh_token_expired', 'refresh_token_invalidated', 'refresh_token_reused']);

const random = () => randomBytes(32).toString('base64url');
const same = (a, b) => typeof a === 'string' && typeof b === 'string' && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export async function verifyChatGPTIdToken(token, clientId, nonce, keys = JWKS) {
  const { payload } = await jwtVerify(token, keys, { issuer: ISSUER, audience: clientId, algorithms: ['RS256'], requiredClaims: ['exp'] });
  if (!same(payload.nonce, nonce) || typeof payload.sub !== 'string' || !payload.sub) fail('CHATGPT_AUTH', 'ChatGPT returned an invalid account identity.');
  return { subject: payload.sub, email: typeof payload.email === 'string' ? payload.email : '' };
}

function credentials(value) {
  if (!value || typeof value.access_token !== 'string' || !value.access_token || typeof value.id_token !== 'string' || !value.id_token || value.token_type !== 'Bearer' || !Number.isInteger(value.expires_in) || value.expires_in <= 0 || typeof value.scope !== 'string') fail('CHATGPT_AUTH', 'ChatGPT returned incomplete credentials.');
  const scopes = value.scope.split(/\s+/).filter(Boolean);
  if (scopes.includes('chatgpt.tokens.use.direct') && (typeof value.refresh_token !== 'string' || !value.refresh_token)) fail('CHATGPT_AUTH', 'ChatGPT returned incomplete renewable credentials.');
  return { accessToken: value.access_token, refreshToken: typeof value.refresh_token === 'string' ? value.refresh_token : '', idToken: value.id_token, scopes, expiresAt: Date.now() + value.expires_in * 1000 };
}

export class ChatGPTAuth {
  constructor({ store, fetchImpl = fetch, verifyIdToken = verifyChatGPTIdToken } = {}) {
    this.store = store;
    this.fetchImpl = fetchImpl;
    this.verifyIdToken = verifyIdToken;
    this.record = null;
    this.pending = null;
    this.authEpoch = 0;
    this.completing = null;
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
    const signedIn = Boolean(account?.accessToken && account?.idToken);
    const permitted = account?.scopes?.includes('chatgpt.tokens.use.direct');
    const model = account?.model ?? '';
    const listed = account?.models?.some(item => item.slug === model);
    const accessState = !signedIn ? 'signed_out' : !permitted ? 'disabled' : account.accessState ?? (listed ? 'ready' : 'unavailable');
    const message = !signedIn ? account?.message ?? 'Sign in with ChatGPT to connect your account.' : !permitted ? DISABLED_MESSAGE : account.message ?? (!listed ? 'Choose a model listed for this ChatGPT account.' : '');
    return { signedIn, email: account?.email ?? '', models: account?.models ?? [], model, accessState, message: message.slice(0, 200), reasoningEffort: model === DEFAULT_MODEL ? 'high' : '' };
  }

  async begin(redirectUri, newAccount = false, enableUsage = false) {
    await this.init();
    if (!this.store) fail('CHATGPT_STORE', 'ChatGPT sign-in requires protected local credential storage. Start the desktop connector.');
    if (this.completing || (this.pending && Date.now() - this.pending.startedAt < 300000)) fail('BUSY', 'A ChatGPT sign-in is already in progress.');
    const state = random();
    const nonce = random();
    const verifier = random();
    if (newAccount && this.status().signedIn) fail('CHATGPT_AUTH', 'Sign out of the current ChatGPT account first.');
    // shortcut: one saved ChatGPT account per companion; add an account picker when switching without sign-out is needed.
    const clientId = newAccount ? (this.record.pendingClientId ?? null) : (this.record.account?.clientId ?? this.record.pendingClientId ?? null);
    this.pending = { state, nonce, verifier, redirectUri, clientId, newAccount, startedAt: Date.now() };
    const url = new URL(`${ISSUER}/api/accounts/authorize`);
    const params = { client_id: clientId ?? 'dynamic_agent_client', ext_agent_host_id: this.record.hostId, response_type: 'code', redirect_uri: redirectUri, scope: SCOPES, resource: RESOURCE, state, nonce, code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') };
    if (!clientId) params.agent_name_hint = 'Tablewright Assistant';
    if (clientId && this.record.account?.email && !newAccount) params.login_hint = this.record.account.email;
    if (enableUsage) params.prompt = 'consent';
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.href;
  }

  async #token(params) {
    let response;
    const fallbackMessage = params.grant_type === 'refresh_token' ? 'ChatGPT renewal failed. Your connection is retained. Try again later.' : 'ChatGPT sign-in or renewal failed. Try signing in again.';
    try {
      response = await this.fetchImpl(TOKEN_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params) });
      if (!response.ok) {
        let body;
        try { body = await boundedJSON(response.body, 32768); } catch { body = null; }
        throw chatgptError(body, { status: response.status, requestId: response.headers.get('x-request-id'), fallbackCode: 'CHATGPT_AUTH', fallbackMessage });
      }
      return await boundedJSON(response.body, 32768);
    } catch (error) {
      if (error instanceof AssistantError && error.code !== 'JSON' && error.code !== 'PAYLOAD') throw error;
      fail('CHATGPT_AUTH', fallbackMessage);
    }
  }

  async callback(url) {
    if (this.completing) fail('CHATGPT_AUTH', 'A ChatGPT sign-in is already finishing.');
    const task = this.#finishCallback(url);
    this.completing = task;
    try { return await task; }
    finally { if (this.completing === task) this.completing = null; }
  }

  async #finishCallback(url) {
    const pending = this.pending;
    if (!pending || Date.now() - pending.startedAt > 300000 || url.searchParams.getAll('state').length !== 1 || !same(url.searchParams.get('state'), pending.state)) fail('CHATGPT_AUTH', 'This ChatGPT sign-in link expired or did not match. Start again from Foundry.');
    this.pending = null;
    const epoch = this.authEpoch;
    if (url.searchParams.has('error')) fail('CHATGPT_AUTH', 'ChatGPT sign-in was cancelled or not authorized.');
    if (url.searchParams.getAll('code').length !== 1 || !url.searchParams.get('code') || url.searchParams.getAll('client_id').length > 1) fail('CHATGPT_AUTH', 'ChatGPT returned an invalid authorization result.');
    const returnedId = url.searchParams.get('client_id');
    const clientId = pending.clientId ?? returnedId;
    if (!clientId || clientId === 'dynamic_agent_client' || (pending.clientId && returnedId && returnedId !== pending.clientId)) fail('CHATGPT_AUTH', 'ChatGPT returned an unexpected client registration.');
    if (!pending.clientId) {
      this.record = { ...this.record, pendingClientId: clientId };
      await this.store.save(this.record);
    }
    const tokens = credentials(await this.#token({ grant_type: 'authorization_code', client_id: clientId, code: url.searchParams.get('code'), code_verifier: pending.verifier, redirect_uri: pending.redirectUri, resource: RESOURCE }));
    let identity;
    try { identity = await this.verifyIdToken(tokens.idToken, clientId, pending.nonce); }
    catch { fail('CHATGPT_AUTH', 'ChatGPT returned an invalid account identity.'); }
    if (epoch !== this.authEpoch) {
      await this.#revoke(tokens.refreshToken, clientId);
      fail('CHATGPT_AUTH', 'This ChatGPT sign-in was cancelled.');
    }
    if (pending.clientId && !pending.newAccount && this.record.account && identity.subject !== this.record.account.subject) {
      await this.#revoke(tokens.refreshToken, clientId);
      fail('CHATGPT_AUTH', 'ChatGPT returned a different account.');
    }
    const retainedModel = pending.clientId && !pending.newAccount ? this.record.account?.model ?? '' : '';
    const previousAccount = this.record.account;
    const candidate = { clientId, ...identity, ...tokens, models: [], model: retainedModel };
    try {
      this.record = { ...this.record, account: candidate, pendingClientId: null };
      await this.store.save(this.record);
      if (epoch !== this.authEpoch) fail('CHATGPT_AUTH', 'This ChatGPT sign-in was cancelled.');
      if (tokens.scopes.includes('chatgpt.tokens.use.direct')) await this.loadModels();
      if (epoch !== this.authEpoch) fail('CHATGPT_AUTH', 'This ChatGPT sign-in was cancelled.');
      return this.status();
    } finally {
      if (epoch !== this.authEpoch) {
        await this.#revoke(tokens.refreshToken, clientId);
        this.record = { ...this.record, account: previousAccount };
        await this.store.save(this.record);
      }
    }
  }

  async accessToken() {
    await this.init();
    const account = this.record.account;
    if (!this.status().signedIn) fail('CHATGPT_AUTH', 'Sign in with ChatGPT to use your plan.');
    if (!account.scopes?.includes('chatgpt.tokens.use.direct')) fail('CHATGPT_SCOPE', DISABLED_MESSAGE);
    if (account.expiresAt > Date.now() + 60000) return account.accessToken;
    const epoch = this.authEpoch;
    if (!this.refreshing) this.refreshing = (async () => {
      let token;
      try { token = await this.#token({ grant_type: 'refresh_token', client_id: account.clientId, refresh_token: account.refreshToken, resource: RESOURCE }); }
      catch (error) {
        if (unusableRefresh.has(error.code) && this.record.account === account && epoch === this.authEpoch) {
          this.record = { ...this.record, account: { clientId: account.clientId, subject: account.subject, email: account.email, models: [], model: '', message: 'The ChatGPT session expired or was disconnected. Sign in again to reconnect.' } };
          await this.store.save(this.record);
        }
        throw error;
      }
      const replacement = credentials({ ...token, scope: token.scope ?? account.scopes.join(' '), id_token: account.idToken });
      const current = this.record.account;
      if (current !== account || epoch !== this.authEpoch) {
        await this.#revoke(replacement.refreshToken, account.clientId);
        fail('CHATGPT_AUTH', 'The ChatGPT account changed during renewal.');
      }
      this.record = { ...this.record, account: { ...account, ...replacement } };
      await this.store.save(this.record);
      if (!replacement.scopes.includes('chatgpt.tokens.use.direct')) fail('CHATGPT_SCOPE', DISABLED_MESSAGE);
      return replacement.accessToken;
    })().finally(() => { this.refreshing = null; });
    return this.refreshing;
  }

  async loadModels() {
    const token = await this.accessToken();
    const account = this.record.account;
    const epoch = this.authEpoch;
    let response;
    let body;
    try {
      response = await this.fetchImpl(`${RESOURCE}/models`, { redirect: 'error', signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}` } });
      if (!response.ok) {
        let errorBody;
        try { errorBody = await boundedJSON(response.body, 32768); } catch { errorBody = null; }
        throw chatgptError(errorBody, { status: response.status, requestId: response.headers.get('x-request-id'), fallbackCode: 'CHATGPT_MODELS', fallbackMessage: 'Could not load models for this ChatGPT account. Try again later.' });
      }
      body = await boundedJSON(response.body, 131072);
    } catch (error) {
      const safe = error instanceof AssistantError && error.code !== 'JSON' && error.code !== 'PAYLOAD' ? error : new AssistantError('CHATGPT_MODELS', 'Could not load models for this ChatGPT account. Try again later.');
      if (this.record.account === account && epoch === this.authEpoch) await this.recordError(safe);
      throw safe;
    }
    const models = Array.isArray(body.models) ? body.models.filter(item => item?.visibility === 'list' && typeof item.slug === 'string' && /^[A-Za-z0-9._-]{1,100}$/.test(item.slug) && typeof item.display_name === 'string').slice(0, 100).map(item => ({ slug: item.slug, name: item.display_name.slice(0, 100) })) : [];
    if (this.record.account !== account || epoch !== this.authEpoch) fail('CHATGPT_AUTH', 'The ChatGPT account changed while loading models.');
    const model = account.model || (models.some(item => item.slug === DEFAULT_MODEL) ? DEFAULT_MODEL : '');
    const listed = models.some(item => item.slug === model);
    const message = !models.length ? 'No models are listed for this ChatGPT account. Refresh the catalog later.' : model && !listed ? 'The selected model is unavailable for this ChatGPT account. Choose a listed model. No replacement was selected.' : !model ? 'GPT-5.6 Luna is unavailable. Choose a listed model. High reasoning support for other models has not been verified.' : model !== DEFAULT_MODEL ? 'High reasoning support for this model has not been verified. The model default will be used.' : '';
    this.record = { ...this.record, account: { ...account, models, model, accessState: listed ? 'ready' : 'unavailable', message } };
    await this.store.save(this.record);
    return this.status();
  }

  async selectModel(slug) {
    if (!this.record?.account?.models.some(model => model.slug === slug)) fail('CHATGPT_MODELS', 'Choose a model listed for this ChatGPT account.');
    const restricted = ['ineligible', 'usage_limited', 'disabled'].includes(this.status().accessState);
    this.record = { ...this.record, account: { ...this.record.account, model: slug, ...(!restricted ? { accessState: 'ready', message: slug === DEFAULT_MODEL ? '' : 'High reasoning support for this model has not been verified. The model default will be used.' } : {}) } };
    await this.store.save(this.record);
    return this.status();
  }

  async recordError(error, registration = this.record?.account) {
    const account = this.record?.account;
    if (!this.status().signedIn || account !== registration) return this.status();
    const safe = error instanceof AssistantError ? error : new AssistantError('PROVIDER', 'The ChatGPT request failed. Check the connection and try again later.');
    this.record = { ...this.record, account: { ...account, accessState: safe.accessState ?? 'unavailable', message: safe.message.slice(0, 200) } };
    await this.store.save(this.record);
    return this.status();
  }

  async cancel() {
    if (!this.pending && !this.completing) return this.status();
    this.pending = null;
    this.authEpoch++;
    if (this.completing) await this.completing.catch(() => {});
    return this.status();
  }

  async signOut() {
    this.pending = null;
    this.authEpoch++;
    await this.init();
    if (this.completing) await this.completing.catch(() => {});
    if (this.refreshing) await this.refreshing.catch(() => {});
    const account = this.record.account;
    if (!account?.accessToken && !account?.idToken && !account?.refreshToken) return { ...this.status(), revoked: true };
    const revoked = account.refreshToken ? await this.#revoke(account.refreshToken, account.clientId) : true;
    this.record = { ...this.record, account: { clientId: account.clientId, subject: account.subject, email: account.email, models: [], model: '' } };
    await this.store.save(this.record);
    return { ...this.status(), revoked };
  }

  async #revoke(token, clientId) {
    try {
      const response = await this.fetchImpl(REVOKE_URL, { method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token, token_type_hint: 'refresh_token', client_id: clientId }) });
      return response.ok;
    } catch { return false; }
    return false;
  }
}
