import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_BODY, MAX_FRAME, validateTool } from '../module/lib/protocol.mjs';
import { AssistantError, fail, object, safeError, text } from '../module/lib/validation.mjs';
import { validateParty } from '../module/lib/encounter.mjs';
import { boundedJSON } from './http-json.mjs';
import { runProvider } from './provider.mjs';
import { ChatGPTAuth } from './chatgpt-auth.mjs';
import { parsePairing } from '../desktop/pairing.mjs';

function tokenMatches(value, expected) {
  return typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export async function startCompanion(config, { fetchImpl = fetch, authTimeout = 10000, credentialStore = null, verifyIdToken, desktopPairing = false, openAuthorization, onStatus = () => {} } = {}) {
  const releaseCredentials = await credentialStore?.lock?.();
  const chatgpt = new ChatGPTAuth({ store: credentialStore, fetchImpl, verifyIdToken });
  try { await chatgpt.init(); }
  catch (error) { await releaseCredentials?.(); throw error; }
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
  const pending = new Map();
  let browser = null;
  let port = config.port;
  let httpCalls = 0;
  let pairing = null;
  const redact = value => {
    const serialized = JSON.stringify(value);
    return [config.apiKey, chatgpt.record?.account?.accessToken, chatgpt.record?.account?.refreshToken, chatgpt.record?.account?.idToken]
      .filter(Boolean).reduce((data, secret) => data.replaceAll(JSON.stringify(secret).slice(1, -1), '[redacted]'), serialized);
  };
  const send = (ws, value) => {
    const data = redact(value);
    if (Buffer.byteLength(data) > MAX_FRAME) fail('PAYLOAD', 'The response exceeded its size limit.');
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  };
  const providerConfigured = () => Boolean(config.apiKey && config.model) || Boolean(chatgpt.status().signedIn && chatgpt.status().model && (!chatgpt.status().accessState || chatgpt.status().accessState === 'ready'));
  const status = () => ({ connected: Boolean(browser?.authenticated), worldId: browser?.authenticated ? browser.worldId : null, userId: browser?.authenticated ? browser.userId : null, providerConfigured: providerConfigured() });
  const chatgptStatus = () => ({ type: 'chatgpt_status', status: chatgpt.status(), providerConfigured: providerConfigured() });
  const callBrowser = async (method, input) => {
    const args = validateTool(method, input);
    if (method === 'connection_status') return status();
    if (!browser?.authenticated) fail('DISCONNECTED', 'Connect a GM Foundry browser to the local companion first.');
    if (pending.size >= 8) fail('BUSY', 'The browser has too many pending requests.');
    const id = randomBytes(8).toString('hex');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(id); reject(new AssistantError('TIMEOUT', 'The Foundry browser did not reply in time.')); }, 25000);
      pending.set(id, { resolve, reject, timer });
      try { send(browser.ws, { type: 'call', id, method, args }); }
      catch (error) { clearTimeout(timer); pending.delete(id); reject(error); }
    });
  };
  const respond = (res, statusCode, value) => {
    let data = redact(value);
    if (Buffer.byteLength(data) > MAX_FRAME) { statusCode = 413; data = JSON.stringify({ error: { code: 'PAYLOAD', message: 'The response exceeded its size limit.' } }); }
    res.writeHead(statusCode, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  };
  const server = http.createServer({ maxHeaderSize: 8192, requestTimeout: 10000, headersTimeout: 5000 }, async (req, res) => {
    if (req.headers.host !== `127.0.0.1:${port}` || req.headers.origin !== undefined) return respond(res, 403, { error: { code: 'ORIGIN', message: 'The request Host or Origin is not permitted.' } });
    if (req.method === 'GET' && req.url?.startsWith('/auth/callback?') && req.url.length <= 4096) {
      try {
        await chatgpt.callback(new URL(req.url, `http://127.0.0.1:${port}`));
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
        res.end('<!doctype html><title>Tablewright Assistant</title><main><h1>ChatGPT connected</h1><p>Return to Foundry to choose a model and continue.</p></main>');
      } catch (error) {
        if (browser?.authenticated) { send(browser.ws, chatgptStatus()); send(browser.ws, { type: 'chatgpt_error', error: safeError(error) }); }
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox" });
        res.end('<!doctype html><title>Tablewright Assistant</title><main><h1>ChatGPT sign-in did not finish</h1><p>Return to Foundry and try again.</p></main>');
        onStatus(status());
        return;
      }
      if (browser?.authenticated) send(browser.ws, chatgptStatus());
      onStatus(status());
      return;
    }
    if (req.method !== 'POST' || req.url !== '/rpc') return respond(res, 404, { error: { code: 'ROUTE', message: 'This route is not available.' } });
    if (!tokenMatches(req.headers.authorization?.replace(/^Bearer /, ''), config.token) || !req.headers.authorization?.startsWith('Bearer ')) return respond(res, 401, { error: { code: 'AUTH', message: 'Authentication failed.' } });
    if (!/^application\/json(?:;\s*charset=utf-8)?$/i.test(req.headers['content-type'] ?? '')) return respond(res, 415, { error: { code: 'CONTENT', message: 'Use application/json.' } });
    if (Number(req.headers['content-length']) > MAX_BODY) return respond(res, 413, { error: { code: 'PAYLOAD', message: 'The request exceeded its size limit.' } });
    if (httpCalls >= 8) return respond(res, 429, { error: { code: 'BUSY', message: 'Too many local requests are pending.' } });
    httpCalls++;
    try {
      const request = await boundedJSON(req, MAX_BODY);
      object(request, ['method', 'args']);
      const result = await callBrowser(request.method, request.args);
      respond(res, 200, { result });
    } catch (error) {
      req.resume();
      respond(res, error instanceof AssistantError && error.code === 'PAYLOAD' ? 413 : 400, { error: safeError(error) });
    } finally {
      httpCalls--;
    }
  });
  server.maxConnections = 16;
  server.on('upgrade', (req, socket, head) => {
    const allowedOrigin = desktopPairing ? pairing && Date.now() < pairing.expiresAt ? pairing.origin : null : config.origin;
    const denied = req.headers.host !== `127.0.0.1:${port}` || req.headers.origin !== allowedOrigin || req.url !== '/browser';
    if (denied || browser) {
      socket.end(`HTTP/1.1 ${browser && !denied ? '409 Conflict' : '403 Forbidden'}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws));
  });
  wss.on('connection', ws => {
    const connection = { ws, authenticated: false, promptController: null };
    browser = connection;
    const timer = setTimeout(() => ws.close(1008, 'Authentication timeout'), authTimeout);
    ws.on('error', () => ws.close());
    ws.on('close', () => {
      clearTimeout(timer);
      connection.promptController?.abort();
      if (browser !== connection) return;
      browser = null;
      onStatus(status());
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new AssistantError('DISCONNECTED', 'The paired Foundry browser disconnected.')); }
      pending.clear();
    });
    ws.on('message', async (raw, binary) => {
      try {
        if (binary || raw.length > MAX_FRAME) fail('PAYLOAD', 'Invalid browser payload.');
        const message = JSON.parse(raw.toString());
        if (!connection.authenticated) {
          object(message, ['type', 'token', 'worldId', 'userId', 'systemId']);
          const approved = desktopPairing ? pairing && Date.now() < pairing.expiresAt && tokenMatches(message.token, pairing.challenge) && message.worldId === pairing.worldId && message.userId === pairing.userId && message.systemId === pairing.systemId : tokenMatches(message.token, config.token);
          if (message.type !== 'auth' || message.systemId !== 'pf2e' || !approved) fail('AUTH', 'Authentication failed.');
          text(message.worldId, 1, 100);
          text(message.userId, 1, 100);
          Object.assign(connection, { authenticated: true, worldId: message.worldId, userId: message.userId });
          if (desktopPairing) pairing = null;
          clearTimeout(timer);
          send(ws, { type: 'paired', ...status(), chatgpt: chatgpt.status(), apiKeyConfigured: Boolean(config.apiKey && config.model) });
          onStatus(status());
        } else if (message.type === 'result') {
          object(message, ['type', 'id', 'result', 'error'], ['type', 'id']);
          if (Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')) fail('INVALID', 'Invalid browser result.');
          text(message.id, 1, 100);
          if (Object.hasOwn(message, 'error')) {
            object(message.error, ['code', 'message']);
            text(message.error.code, 1, 40);
            text(message.error.message, 1, 200);
          } else if (!message.result || typeof message.result !== 'object' || Array.isArray(message.result)) fail('INVALID', 'Invalid browser result.');
          const task = pending.get(message.id);
          if (!task) return;
          clearTimeout(task.timer);
          pending.delete(message.id);
          if (message.error) task.reject(new AssistantError(message.error.code, message.error.message));
          else task.resolve(message.result);
        } else if (message.type === 'chatgpt') {
          object(message, ['type', 'id', 'action', 'model'], ['type', 'id', 'action']);
          text(message.id, 1, 100);
          let result;
          try {
            if (message.action === 'begin') result = { url: await chatgpt.begin(`http://127.0.0.1:${port}/auth/callback`) };
            else if (message.action === 'enable') result = { url: await chatgpt.begin(`http://127.0.0.1:${port}/auth/callback`, false, true) };
            else if (message.action === 'new') result = { url: await chatgpt.begin(`http://127.0.0.1:${port}/auth/callback`, true) };
            else if (message.action === 'model') result = { status: await chatgpt.selectModel(message.model) };
            else if (message.action === 'models') result = { status: await chatgpt.loadModels() };
            else if (message.action === 'cancel') result = { status: await chatgpt.cancel() };
            else if (message.action === 'signout') {
              connection.promptController?.abort();
              const { revoked, ...account } = await chatgpt.signOut();
              result = { status: account, revoked };
            }
            else fail('METHOD', 'This ChatGPT operation is not permitted.');
            if (result.url && openAuthorization) { await openAuthorization(result.url); delete result.url; }
            if (result.status) result.providerConfigured = providerConfigured();
            send(ws, { type: 'chatgpt_result', id: message.id, result });
            onStatus(status());
          } catch (error) { send(ws, { type: 'chatgpt_result', id: message.id, error: safeError(error) }); }
        } else if (message.type === 'prompt') {
          object(message, ['type', 'id', 'prompt', 'party', 'provider']);
          text(message.id, 1, 100);
          text(message.prompt, 1, 4000);
          const party = validateParty(message.party);
          if (connection.promptController) { send(ws, { type: 'prompt_result', id: message.id, error: { code: 'BUSY', message: 'A model request is already running.' } }); return; }
          connection.promptController = new AbortController();
          let registration = chatgpt.record?.account;
          try {
            let provider;
            if (message.provider === 'chatgpt') {
              if (!chatgpt.status().signedIn || !chatgpt.status().model || (chatgpt.status().accessState && chatgpt.status().accessState !== 'ready')) fail('PROVIDER_CONFIG', chatgpt.status().message || 'Sign in with ChatGPT and choose a model before sending a request.');
              provider = { ...config, apiKey: '', chatgptToken: await chatgpt.accessToken(), model: chatgpt.status().model, endpoint: 'https://api.openai.com/v1/responses' };
              registration = chatgpt.record.account;
            } else if (message.provider === 'api_key') {
              if (!config.apiKey || !config.model) fail('PROVIDER_CONFIG', 'Configure an API key and model before choosing separate API billing.');
              provider = config;
            } else fail('PROVIDER_CONFIG', 'Choose ChatGPT plan usage or separate API billing in Foundry.');
            const result = await runProvider(provider, message.prompt, party, callBrowser, { fetchImpl, signal: connection.promptController.signal });
            send(ws, { type: 'prompt_result', id: message.id, result });
          } catch (error) {
            send(ws, { type: 'prompt_result', id: message.id, error: safeError(error) });
            if (message.provider === 'chatgpt' && chatgpt.recordError) { await chatgpt.recordError(error, registration); send(ws, chatgptStatus()); onStatus(status()); }
          } finally { connection.promptController = null; }
        } else fail('METHOD', 'Invalid browser operation.');
      } catch {
        ws.close(1008, 'Invalid or unauthorized message');
      }
    });
  });
  try { await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve); }); }
  catch (error) { await releaseCredentials?.(); throw error; }
  port = server.address().port;
  return {
    port,
    status: () => ({ ...status(), chatgpt: chatgpt.status() }),
    approvePairing(request) {
      if (!desktopPairing || browser) fail('BUSY', 'Disconnect the current Foundry session before pairing another.');
      const url = new URL('tablewright://pair');
      for (const [key, value] of Object.entries(request)) url.searchParams.set(key, value);
      pairing = { ...parsePairing(url.href), expiresAt: Date.now() + 120000 };
    },
    disconnect() { pairing = null; browser?.ws.close(1000, 'Reconnect from Foundry'); },
    async signIn() {
      if (!openAuthorization) fail('CHATGPT_AUTH', 'Start sign-in from Foundry.');
      await openAuthorization(await chatgpt.begin(`http://127.0.0.1:${port}/auth/callback`));
    },
    async signOut() {
      browser?.promptController?.abort();
      const result = await chatgpt.signOut();
      if (browser?.authenticated) send(browser.ws, chatgptStatus());
      onStatus(status());
      return result;
    },
    async close() {
      for (const ws of wss.clients) ws.terminate();
      await new Promise(resolve => wss.close(resolve));
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      await releaseCredentials?.();
    }
  };
}
