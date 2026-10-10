import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { WebSocket, WebSocketServer } from 'ws';
import { MAX_BODY, MAX_FRAME, validateTool } from '../module/lib/protocol.mjs';
import { AssistantError, fail, object, safeError, text } from '../module/lib/validation.mjs';
import { validateParty } from '../module/lib/encounter.mjs';
import { boundedJSON } from './http-json.mjs';
import { runProvider } from './provider.mjs';

function tokenMatches(value, expected) {
  return typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(expected)
    && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}

export async function startCompanion(config, { fetchImpl = fetch, authTimeout = 10000 } = {}) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_FRAME, perMessageDeflate: false });
  const pending = new Map();
  let browser = null;
  let port = config.port;
  let httpCalls = 0;
  const redact = value => {
    const serialized = JSON.stringify(value);
    return config.apiKey ? serialized.replaceAll(JSON.stringify(config.apiKey).slice(1, -1), '[redacted]') : serialized;
  };
  const send = (ws, value) => {
    const data = redact(value);
    if (Buffer.byteLength(data) > MAX_FRAME) fail('PAYLOAD', 'The response exceeded its size limit.');
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  };
  const status = () => ({ connected: Boolean(browser?.authenticated), worldId: browser?.authenticated ? browser.worldId : null, userId: browser?.authenticated ? browser.userId : null, providerConfigured: Boolean(config.apiKey && config.model) });
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
    const denied = req.headers.host !== `127.0.0.1:${port}` || req.headers.origin !== config.origin || req.url !== '/browser';
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
      for (const task of pending.values()) { clearTimeout(task.timer); task.reject(new AssistantError('DISCONNECTED', 'The paired Foundry browser disconnected.')); }
      pending.clear();
    });
    ws.on('message', async (raw, binary) => {
      try {
        if (binary || raw.length > MAX_FRAME) fail('PAYLOAD', 'Invalid browser payload.');
        const message = JSON.parse(raw.toString());
        if (!connection.authenticated) {
          object(message, ['type', 'token', 'worldId', 'userId', 'systemId']);
          if (message.type !== 'auth' || message.systemId !== 'pf2e' || !tokenMatches(message.token, config.token)) fail('AUTH', 'Authentication failed.');
          text(message.worldId, 1, 100);
          text(message.userId, 1, 100);
          Object.assign(connection, { authenticated: true, worldId: message.worldId, userId: message.userId });
          clearTimeout(timer);
          send(ws, { type: 'paired', ...status() });
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
        } else if (message.type === 'prompt') {
          object(message, ['type', 'id', 'prompt', 'party']);
          text(message.id, 1, 100);
          text(message.prompt, 1, 4000);
          const party = validateParty(message.party);
          if (connection.promptController) { send(ws, { type: 'prompt_result', id: message.id, error: { code: 'BUSY', message: 'A model request is already running.' } }); return; }
          connection.promptController = new AbortController();
          try {
            const result = await runProvider(config, message.prompt, party, callBrowser, { fetchImpl, signal: connection.promptController.signal });
            send(ws, { type: 'prompt_result', id: message.id, result });
          } catch (error) {
            send(ws, { type: 'prompt_result', id: message.id, error: safeError(error) });
          } finally { connection.promptController = null; }
        } else fail('METHOD', 'Invalid browser operation.');
      } catch {
        ws.close(1008, 'Invalid or unauthorized message');
      }
    });
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(config.port, '127.0.0.1', resolve); });
  port = server.address().port;
  return {
    port,
    async close() {
      for (const ws of wss.clients) ws.terminate();
      await new Promise(resolve => wss.close(resolve));
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
    }
  };
}
