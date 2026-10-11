import { MAX_FRAME, browserTool } from '../lib/protocol.mjs';
import { AssistantError, fail, object, safeError, text } from '../lib/validation.mjs';
import { validateParty } from '../lib/encounter.mjs';

export class BrowserConnection {
  #requests = new Map();
  #chatgptRequests = new Map();
  #activeCalls = 0;

  constructor(adapter, plans, onChange, { WebSocketClass = globalThis.WebSocket, pageProtocol = globalThis.location?.protocol ?? 'http:' } = {}) {
    this.adapter = adapter;
    this.plans = plans;
    this.onChange = onChange;
    this.WebSocketClass = WebSocketClass;
    this.pageProtocol = pageProtocol;
    this.state = 'disconnected';
    this.providerConfigured = false;
    this.apiKeyConfigured = false;
    this.chatgpt = { signedIn: false, email: '', models: [], model: '' };
    this.authError = '';
    this.ws = null;
  }

  get connected() { return this.state === 'connected'; }

  async connect(endpoint, token) {
    this.adapter.requireGM();
    if (this.state !== 'disconnected') fail('BUSY', 'Disconnect the current browser connection first.');
    if (this.pageProtocol !== 'http:') fail('TRANSPORT', 'This alpha supports HTTP Foundry only. Secure WebSocket transport is not verified.');
    let url;
    try { url = new URL(endpoint); } catch { fail('CONFIG', 'Enter the local WebSocket URL.'); }
    if (url.protocol !== 'ws:' || url.hostname !== '127.0.0.1' || !url.port || url.pathname !== '/browser' || url.search || url.hash || url.username || url.password) fail('CONFIG', 'Use ws://127.0.0.1:PORT/browser without credentials or query parameters.');
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{32,256}$/.test(token)) fail('AUTH', 'Enter the separate companion pairing token.');
    this.state = 'connecting';
    this.onChange();
    let ws;
    try { ws = new this.WebSocketClass(url.href); }
    catch { this.state = 'disconnected'; this.onChange(); fail('CONNECTION', 'The browser could not open the local companion connection.'); }
    this.ws = ws;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { reject(new AssistantError('TIMEOUT', 'The local companion did not pair in time.')); ws.close(); }, 12000);
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'auth', token, worldId: this.adapter.game.world.id, userId: this.adapter.game.user.id, systemId: this.adapter.game.system.id }));
        ws.onopen = null;
      };
      ws.onerror = () => reject(new AssistantError('CONNECTION', 'The local companion connection failed. Check its process, port, and configured Foundry origin.'));
      ws.onclose = () => {
        clearTimeout(timer);
        reject(new AssistantError('DISCONNECTED', 'The local companion disconnected.'));
        if (this.ws !== ws) return;
        this.ws = null;
        this.state = 'disconnected';
        this.providerConfigured = false;
        this.apiKeyConfigured = false;
        this.chatgpt = { signedIn: false, email: '', models: [], model: '' };
        this.authError = '';
        for (const request of this.#requests.values()) { clearTimeout(request.timer); request.reject(new AssistantError('DISCONNECTED', 'The local companion disconnected.')); }
        this.#requests.clear();
        for (const request of this.#chatgptRequests.values()) { clearTimeout(request.timer); request.reject(new AssistantError('DISCONNECTED', 'The local companion disconnected.')); }
        this.#chatgptRequests.clear();
        this.onChange();
      };
      ws.onmessage = async event => {
        try {
          if (typeof event.data !== 'string' || new TextEncoder().encode(event.data).length > MAX_FRAME) fail('PAYLOAD', 'The companion response is invalid or too large.');
          const message = JSON.parse(event.data);
          if (message.type === 'paired') {
            object(message, ['type', 'connected', 'worldId', 'userId', 'providerConfigured', 'chatgpt', 'apiKeyConfigured']);
            this.adapter.requireGM();
            if (this.state !== 'connecting' || message.connected !== true || message.worldId !== this.adapter.game.world.id || message.userId !== this.adapter.game.user.id || typeof message.providerConfigured !== 'boolean' || typeof message.apiKeyConfigured !== 'boolean') fail('AUTH', 'The companion paired a different browser or world.');
            clearTimeout(timer);
            this.state = 'connected';
            this.providerConfigured = message.providerConfigured;
            this.apiKeyConfigured = message.apiKeyConfigured;
            this.chatgpt = this.#chatgptStatus(message.chatgpt);
            this.onChange();
            resolve();
          } else if (message.type === 'chatgpt_status') {
            object(message, ['type', 'status', 'providerConfigured']);
            if (!this.connected || typeof message.providerConfigured !== 'boolean') fail('INVALID', 'The ChatGPT status is invalid.');
            this.chatgpt = this.#chatgptStatus(message.status);
            this.providerConfigured = message.providerConfigured;
            this.authError = '';
            this.onChange();
          } else if (message.type === 'chatgpt_error') {
            object(message, ['type', 'error']);
            object(message.error, ['code', 'message']);
            this.authError = text(message.error.message, 1, 200);
            this.onChange();
          } else if (message.type === 'chatgpt_result') {
            object(message, ['type', 'id', 'result', 'error'], ['type', 'id']);
            if (Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')) fail('INVALID', 'The ChatGPT result is invalid.');
            const request = this.#chatgptRequests.get(message.id);
            if (!request) return;
            if (message.error) { object(message.error, ['code', 'message']); text(message.error.code, 1, 40); text(message.error.message, 1, 200); }
            else {
              object(message.result, ['url', 'status', 'revoked', 'providerConfigured'], []);
              if (message.result.url && (!message.result.url.startsWith('https://auth.openai.com/api/accounts/authorize?') || message.result.url.length > 4096)) fail('INVALID', 'The ChatGPT sign-in URL is invalid.');
              if (message.result.status) {
                if (typeof message.result.providerConfigured !== 'boolean') fail('INVALID', 'The ChatGPT provider status is invalid.');
                this.chatgpt = this.#chatgptStatus(message.result.status);
                this.providerConfigured = message.result.providerConfigured;
                this.authError = '';
                this.onChange();
              }
              if (Object.hasOwn(message.result, 'revoked') && typeof message.result.revoked !== 'boolean') fail('INVALID', 'The ChatGPT sign-out result is invalid.');
            }
            clearTimeout(request.timer);
            this.#chatgptRequests.delete(message.id);
            if (message.error) request.reject(new AssistantError(message.error.code, message.error.message));
            else request.resolve(message.result);
          } else if (message.type === 'call') {
            object(message, ['type', 'id', 'method', 'args']);
            if (!this.connected || typeof message.id !== 'string' || !/^[a-f0-9]{16}$/.test(message.id)) fail('INVALID', 'The companion call is invalid.');
            let response;
            try {
              this.#activeCalls++;
              if (this.#activeCalls > 8) fail('BUSY', 'Too many browser reads are running.');
              const result = await browserTool(this.adapter, this.plans, message.method, message.args);
              response = { type: 'result', id: message.id, result };
            } catch (error) {
              response = { type: 'result', id: message.id, error: safeError(error) };
            } finally { this.#activeCalls--; }
            const serialized = JSON.stringify(response);
            if (new TextEncoder().encode(serialized).length > MAX_FRAME) response = { type: 'result', id: message.id, error: { code: 'PAYLOAD', message: 'The browser result exceeded its size limit.' } };
            if (this.ws === ws && this.connected) ws.send(JSON.stringify(response));
          } else if (message.type === 'prompt_result') {
            object(message, ['type', 'id', 'result', 'error'], ['type', 'id']);
            if (Object.hasOwn(message, 'result') === Object.hasOwn(message, 'error')) fail('INVALID', 'The companion prompt result is invalid.');
            const request = this.#requests.get(message.id);
            if (!request) return;
            if (message.error) {
              object(message.error, ['code', 'message']);
              text(message.error.code, 1, 40);
              text(message.error.message, 1, 200);
            } else {
              object(message.result, ['text', 'planIds']);
              text(message.result.text, 0, 8000);
              if (!Array.isArray(message.result.planIds) || message.result.planIds.length > 12 || message.result.planIds.some(id => typeof id !== 'string' || !/^[A-Za-z0-9]{16}$/.test(id))) fail('INVALID', 'The companion returned invalid plan IDs.');
            }
            clearTimeout(request.timer);
            this.#requests.delete(message.id);
            if (message.error) request.reject(new AssistantError(message.error.code, message.error.message));
            else request.resolve(message.result);
          } else fail('METHOD', 'This companion operation is not permitted.');
        } catch {
          ws.close(1008, 'Invalid companion message');
        }
      };
    });
  }

  #chatgptStatus(value) {
    object(value, ['signedIn', 'email', 'models', 'model']);
    if (typeof value.signedIn !== 'boolean' || !Array.isArray(value.models) || value.models.length > 100) fail('INVALID', 'The ChatGPT account status is invalid.');
    text(value.email, 0, 320);
    text(value.model, 0, 100);
    for (const model of value.models) {
      object(model, ['slug', 'name']);
      text(model.slug, 1, 100);
      text(model.name, 1, 100);
    }
    return value;
  }

  #chatgptRequest(action, model) {
    this.adapter.requireGM();
    if (!this.connected) fail('DISCONNECTED', 'Connect the local companion first.');
    if (this.#chatgptRequests.size) fail('BUSY', 'A ChatGPT account operation is already running.');
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
    const id = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#chatgptRequests.delete(id); reject(new AssistantError('TIMEOUT', 'The ChatGPT account operation timed out.')); }, 30000);
      this.#chatgptRequests.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ type: 'chatgpt', id, action, ...(model ? { model } : {}) })); }
      catch { clearTimeout(timer); this.#chatgptRequests.delete(id); reject(new AssistantError('CONNECTION', 'The browser could not send the ChatGPT account operation.')); }
    });
  }

  async beginChatGPT() { return (await this.#chatgptRequest('begin')).url; }
  async beginOtherChatGPT() { return (await this.#chatgptRequest('new')).url; }
  async loadChatGPTModels() { return this.#chatgptRequest('models'); }
  async selectChatGPTModel(model) { return this.#chatgptRequest('model', model); }
  async signOutChatGPT() { return this.#chatgptRequest('signout'); }

  disconnect() {
    if (!this.ws) return;
    this.state = 'closing';
    this.onChange();
    this.ws.close();
  }

  async prompt(prompt, party, provider) {
    this.adapter.requireGM();
    text(prompt, 1, 4000);
    validateParty(party);
    if (!this.connected) fail('DISCONNECTED', 'Connect the local companion first.');
    if (provider === 'chatgpt' ? !this.chatgpt.signedIn || !this.chatgpt.model : provider === 'api_key' ? !this.apiKeyConfigured : true) fail('PROVIDER_CONFIG', 'Choose a configured model access option before sending a request.');
    if (this.#requests.size) fail('BUSY', 'A model request is already running.');
    const bytes = globalThis.crypto.getRandomValues(new Uint8Array(8));
    const id = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.#requests.delete(id); reject(new AssistantError('TIMEOUT', 'The model request timed out. Review any pending plans before trying again.')); }, 125000);
      this.#requests.set(id, { resolve, reject, timer });
      try { this.ws.send(JSON.stringify({ type: 'prompt', id, prompt, party, provider })); }
      catch { clearTimeout(timer); this.#requests.delete(id); reject(new AssistantError('CONNECTION', 'The browser could not send the model request.')); }
    });
  }
}
