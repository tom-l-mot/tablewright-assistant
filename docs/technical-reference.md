# Technical setup and reference

Normal installation uses the Windows app and Foundry's manifest installer. Start with the [beginner guide](install.md). This page describes development and the interfaces retained for advanced integrations in **0.2.0-alpha.1**.

## Run or build the desktop app from source

Use a physical-disk checkout and Node.js 22 or newer. Dependency extraction previously failed in a Google Drive checkout. Packaging currently uses Windows PowerShell.

Run these commands in the repository root. The dependency install downloads Electron; review the repository and lockfile first.

```powershell
npm.cmd ci
npm.cmd run desktop
```

The app starts its own companion on `127.0.0.1:33333`. Do not run `npm.cmd start` alongside it. The normal desktop app does not read `.env` for a provider key or Foundry origin. Pairing supplies the exact origin through native approval.

Build both deliverables with:

```powershell
npm.cmd run package
npm.cmd run build:windows
```

The expected files are `dist/tablewright-assistant-0.2.0-alpha.1.zip` and `dist/windows/Tablewright-Connector-0.2.0-alpha.1-win-x64.exe`. The Windows build is unsigned. These commands build locally and do not publish.

The manifest in `module/module.json` points to the planned GitHub prerelease asset and the raw manifest on branch `codex/tablewright-desktop`. Publication, fresh-download verification, and real Foundry install/update checks are separate gates. The manifest permits Foundry 13 through 14 but does not set `compatibility.verified`.

## Desktop pairing and account storage

The Foundry module generates a random one-use challenge and opens a `tablewright://pair` link. The native dialog shows the exact origin and the first eight characters as a matching code. Its world and user labels are supplied by the page; they are not independent identity proof.

Native approval grants that origin, challenge, world, user, and PF2e system a two-minute pairing window. The browser opens `ws://127.0.0.1:33333/browser` and authenticates in its first message. The server consumes the grant after successful authentication. One browser session is allowed. No long-lived account token enters the pairing link.

For HTTPS pages, the client requests a WebSocket with `targetAddressSpace: 'loopback'`. If that constructor form is unsupported, it tries the ordinary constructor without disabling browser security. Browser policy still decides whether a connection is allowed. Chrome 154 is the current target; real remote Foundry remains unverified. Broad Origin acceptance, certificate exceptions, and browser security flags are not part of the design.

Electron owns the single-instance lock, tray, startup preference, and credential protection. The account file is `chatgpt-credentials.electron` under Electron's `userData` directory for Tablewright Connector. `safeStorage` encrypts it for the Windows user, and writes use a temporary file followed by rename. This does not protect against every process running as that same Windows user.

The older `chatgpt-credentials.dpapi` file is not the new desktop store. No automatic migration is implemented. Sign in through the desktop workflow. The standalone Node entry point does not inject a protected credential store and cannot provide the desktop ChatGPT sign-in experience.

## ChatGPT provider behavior

The implementation uses the documented [open-source Sign in with ChatGPT flow](https://developers.openai.com/siwc/token-sharing-open-source) with OAuth state, PKCE, nonce, ID-token verification, and a loopback callback. OpenAI's [quickstart](https://developers.openai.com/siwc/quickstart) lists eligible Plus and Pro users for open-source plan usage. Free support remains unmet.

The account's live model catalog is authoritative. The default is `gpt-5.6-luna` only when listed and there is no saved selection. A missing saved model is retained as unavailable; the app asks for an explicit selection. It never silently picks the first catalog entry. Luna requests use High reasoning and Standard mode. Other models use their defaults because their High reasoning support is not verified.

Account status distinguishes signed out, disabled plan usage, ineligibility, usage limits, unavailable models, and ready access. It is not enough for OAuth sign-in alone to succeed. Foundry offers Enable ChatGPT plan usage, Cancel sign-in, Check access again, and Sign out of ChatGPT as appropriate.

Requests go to the public Responses API with `store: false` and streaming enabled for the ChatGPT path. There is no hidden private endpoint or automatic API-key fallback. Real authorization and an account-funded response for this build remain verification gates.

## Advanced developer companion

The standalone command remains available for protocol development:

```powershell
npm.cmd run token
```

If `.env` does not already exist, copy `.env.example` to it. Set these values locally:

```dotenv
ASSISTANT_TOKEN=<separate-random-token>
ASSISTANT_PORT=33333
FOUNDRY_ORIGIN=http://localhost:30000
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_RESPONSES_URL=https://api.openai.com/v1/responses
```

The origin must exactly match the browser's protocol, host, and port, with no path or trailing slash. HTTP and HTTPS are accepted by configuration. A configured API key also requires an explicit API model. That is a separate billing path.

Start the developer companion with:

```powershell
npm.cmd start
```

This reads `.env`. Running `node companion/main.mjs` instead uses only process environment variables. The companion accepts a manually authenticated browser client through `BrowserConnection.connect(endpoint, token)`, which remains exercised by protocol tests.

The shipped Foundry window has no manual-token or endpoint fields. Its normal Pair desktop action targets the desktop app. Therefore the standalone companion plus MCP/API-key route is a developer integration, not a complete alternative installation walkthrough for the current UI. It needs a deliberately wired developer browser client. Do not run the normal desktop app on the same port or assume its private random RPC token is available to an MCP client.

## Configure a local MCP client

This configuration applies only to the advanced standalone companion with a matching manually authenticated developer browser client. It does not connect automatically to the normal desktop app.

```json
{
  "mcpServers": {
    "tablewright-assistant": {
      "command": "node",
      "args": ["C:\\path\\to\\checkout\\mcp\\main.mjs"],
      "env": {
        "ASSISTANT_TOKEN": "<same-developer-companion-token>",
        "ASSISTANT_PORT": "33333"
      }
    }
  }
}
```

The MCP process does not load `.env`. Supply the token and port through the client environment. It proxies to the running companion with the official SDK over stdio. It does not start another bridge or need the provider key. Its stdout is reserved for protocol traffic.

| Tool | Accepted input and result |
| --- | --- |
| `connection_status` | Empty object. Returns connection and provider status. |
| `world_context` | Empty object. Returns bounded world, party, version, and pack metadata. |
| `search_compendium` | Query, Actor/Item/any document type, and limit from 1 through 30. |
| `read_source` | One permitted canonical compendium UUID. Returns metadata. |
| `propose_creation` | A validated NPC, shop, or encounter request. Returns a resolved browser preview. |
| `get_plan` | Plan ID. Returns state, preview, and receipts. |

There is no approval, deletion, arbitrary-update, macro, or executable-code tool.

A creation request has `kind`, `name`, `background`, `entries`, and `party`. Each entry contains a canonical `uuid` and bounded `quantity`. Use actual search results. NPCs require one NPC and one copy. Shops require physical Item sources. Encounters require NPC Actor sources and explicit integer party level/size and threat. NPC and shop requests use `party: null`.

## Review creations and recover partial imports

NPC imports use native `fromCompendium` normalization, retain canonical statistics and embedded IDs, and append escaped background to private notes. Shops create a PF2e loot actor in Merchant mode with canonical stock and planned quantities. Container references require their selected containers. Actors begin with GM-only ownership.

Encounters create actors and then a GM-only journal roster. The roster records sources, quantities, actual XP, party inputs, and imported actor IDs. Tokens, scenes, and combat are not created.

Foundry computes XP from resolved creature levels. The implementation rejects creature level differences outside -4 through +4 and proficiency without level. [PF2e combat threats](https://2e.aonprd.com/Rules.aspx?ID=2716)

Approval rechecks GM permission, pack policy, source snapshots, and the proficiency variant. Stable planned IDs and `flags.tablewright-assistant` provenance identify completed steps. Only one approval runs at a time.

A failed creation stops the plan at partial. Completed imports remain. **Retry missing creations** reconciles planned IDs and creates missing steps. It does not delete successful work or automatically retry. Source changes, ID conflicts, and removed completed documents stop recovery. Keep the tab open; refresh loses the in-memory plan, snapshots, and receipts. The app cannot reconstruct that plan from document flags.

## Understand the data flow

The Foundry browser retains raw source snapshots and normalized document data. External tools receive bounded metadata:

- World ID/title, Foundry and system versions, and proficiency variant.
- Up to 20 character names/levels and 64 permitted pack IDs, labels, and types.
- Source UUID, name, document type, PF2e type, level, and up to 12 traits.
- Your prompt, proposed name/background, party inputs, computed XP, and receipt IDs/names/UUIDs.

Full descriptions, stat blocks, artwork, raw documents, and existing journal contents do not go to the model or MCP. Provider output is escaped and validated before preview. Model requests go to OpenAI from the GM's computer. Nothing requires installing the connector on a remote Foundry host.

PF2e system Actor and Item packs are permitted by default. **Additional permitted module compendiums** accepts exact module pack IDs. World packs and other document types are rejected. Enabling a pack does not establish rights to share its metadata with a model.

The server listens only on `127.0.0.1`. WebSockets require the exact approved Origin, exact Host and route, and first-message authentication. HTTP `/rpc` remains an originless local interface protected by a separate bearer credential. It does not offer CORS to websites. The OAuth callback checks its pending state. Closing the selected browser aborts model work and rejects pending browser calls.

## Verification

Run the suite and package checks in the checkout:

```powershell
npm.cmd test
npm.cmd run package
```

These use real local server/SDK processes and fake Foundry/provider fixtures. They do not establish real PF2e imports, real DOM approval events, or account eligibility. Read the [evidence table and live checklist](verification.md).

Screenshots must come from the actual documented build. Captures of the installer, native pairing, account state, Foundry preview, and created PF2e sheet remain pending. Do not use generated images as evidence.

