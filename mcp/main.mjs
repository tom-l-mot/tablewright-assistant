import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { TOOLS, validateTool, MAX_FRAME } from '../module/lib/protocol.mjs';
import { safeError, fail } from '../module/lib/validation.mjs';
import { proxyConfig } from '../companion/config.mjs';
import { boundedJSON } from '../companion/http-json.mjs';

try {
  const config = proxyConfig();
  const server = new Server({ name: 'pf2e-foundry-assistant', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: TOOLS }));
  server.setRequestHandler(CallToolRequestSchema, async request => {
    try {
      const args = validateTool(request.params.name, request.params.arguments ?? {});
      const response = await fetch(`http://127.0.0.1:${config.port}/rpc`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${config.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ method: request.params.name, args })
      });
      const value = await boundedJSON(response.body, MAX_FRAME);
      if (!response.ok || value.error) return { isError: true, structuredContent: { error: value.error ?? { code: 'PROXY', message: 'The local companion rejected the request.' } }, content: [{ type: 'text', text: JSON.stringify(value.error ?? {}) }] };
      if (!value.result || typeof value.result !== 'object') fail('PROXY', 'The local companion returned an invalid result.');
      return { structuredContent: value.result, content: [{ type: 'text', text: JSON.stringify(value.result) }] };
    } catch (error) {
      const result = { error: safeError(error) };
      return { isError: true, structuredContent: result, content: [{ type: 'text', text: JSON.stringify(result) }] };
    }
  });
  await server.connect(new StdioServerTransport());
} catch (error) {
  process.stderr.write(`${safeError(error).message}\n`);
  process.exitCode = 1;
}
