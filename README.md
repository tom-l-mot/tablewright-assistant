# Tablewright Assistant

Follow the [numbered installation guide](docs/install.md) to set up the private local alpha. The repository is [tom-l-mot/tablewright-assistant](https://github.com/tom-l-mot/tablewright-assistant).

The GM uses a Foundry window to review canonical NPC, merchant, and encounter plans. Only a GM click in that window creates documents. Local Codex or Claude MCP clients can search and propose without a provider key.

The first live target is Foundry 14 with PF2e 8.5.1. Installed PF2e metadata and source fields were inspected. Live Foundry rendering and real PF2e imports have not been tested. The manifest allows intended Foundry versions 13 through 14 without a verified-version claim. Start with a disposable world on 14.

## Prepare the companion

Use Node 22 or newer and a physical-disk checkout of this repository. Verification ran on Windows with Node 26.4.0. Google Drive dependency extraction failed during this build. Windows PowerShell supplies ZIP packaging.

Run these commands in the source checkout.

```powershell
npm ci --ignore-scripts
```

If `.env` does not exist, copy the example.

```powershell
Copy-Item -LiteralPath '.env.example' -Destination '.env'
npm run token
```

Copy the generated token line into `ASSISTANT_TOKEN` in `.env`. Keep that token separate from the provider key. Configure the exact HTTP origin shown in the Foundry browser address bar. Include the port and omit a trailing slash or world path.

```dotenv
ASSISTANT_TOKEN=<generated-companion-token>
ASSISTANT_PORT=33333
FOUNDRY_ORIGIN=http://localhost:30000
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_RESPONSES_URL=https://api.openai.com/v1/responses
```

Leave the provider fields blank for MCP planning. To use the window's model button, set your key and an explicit API model ID available to that key. The companion uses the OpenAI Responses API. It preserves reasoning output and matching `function_call_output` items between tool calls. The endpoint must use HTTPS. See the [official function calling guide](https://developers.openai.com/api/docs/guides/function-calling).

The `.env` file is ignored by Git. The provider key stays in the companion process and its outbound provider Authorization header. Do not paste it into Foundry, MCP settings, a prompt, or chat. The pairing token is a separate secret that the browser sends as its first WebSocket message.

## Install the module

Build the archive.

```powershell
npm run package
```

The result is `dist/tablewright-assistant-0.1.1.zip`. It contains the complete browser module, installation guide, README, license, provenance, and MIT third-party notice. It contains no companion dependencies or compendium content.

Stop Foundry before installing the module. Extract into your Foundry data `modules` directory. This machine's observed data path is `D:\FoundryVTT`.

```powershell
Expand-Archive -LiteralPath '.\dist\tablewright-assistant-0.1.1.zip' -DestinationPath 'D:\FoundryVTT\Data\modules'
```

Replace the destination if your data path differs. If that module directory already exists, preserve it before replacing it. The extracted layout must be `Data/modules/tablewright-assistant/module.json`.

Start Foundry and enable **Tablewright Assistant** in a disposable PF2e world. In **Configure Settings**, optionally enter comma-separated exact module pack IDs in **Additional permitted module compendiums**. PF2e system Actor and Item packs are permitted by default. World packs and Macro, Journal, and other document types are rejected.

Enabling a pack does not establish rights to share its metadata with a model. This is a private local alpha. Public release, official Foundry package listing, and content-rights review remain pending under [Foundry's AI policy](https://foundryvtt.com/article/ai-policy/).

## Connect the GM browser

Start the companion from the repository.

```powershell
npm start
```

npm start reads the configured .env file. To use only process environment variables, run node companion/main.mjs instead. Its stderr reports `Tablewright Assistant companion listening on 127.0.0.1:33333.` The port changes if you configured another value.

1. Open Foundry on HTTP in a browser on the companion machine.
2. Type `@assistant` in Foundry chat. Add a request after the prefix to prefill the window.
3. Enter `ws://127.0.0.1:33333/browser` and the pairing token.
4. Click **Connect**.
5. Enter the party level, size, and threat explicitly. Current window requests require those fields for NPCs and shops as well as encounters.
6. Click **Send to configured model** when a provider is configured, or use an MCP client to propose a plan.
7. Review the canonical source UUIDs, quantities, levels, XP, and every planned document.
8. Click **Approve creations** or **Reject plan**.

`@assistant` opens and prefills the window. It does not automatically send to a model. Normal chat and roll commands use the existing Foundry path. The chat interception applies only to the GM.

The companion accepts one authenticated GM browser and world at a time. A second connection is rejected. To select another browser or world, disconnect the first one. Closing the assistant window keeps its paired connection and session plans. Browser refresh discards session plans.

HTTPS Foundry is rejected by this alpha. A localhost plain WebSocket has not been verified with HTTPS or hosted Foundry. Remote ChatGPT web connectors and secure deployment need a separately verified transport. Native Claude API requests are deferred.

## Configure a local MCP client

Keep the companion running and the GM browser paired. The MCP process proxies to it using the official SDK over stdio. MCP stdout contains only protocol messages. It never starts another browser bridge.

For Claude Desktop or another client that uses JSON MCP configuration, replace the source path and token below.

```json
{
  "mcpServers": {
    "tablewright-assistant": {
      "command": "node",
      "args": ["C:\\path\\to\\checkout\\mcp\\main.mjs"],
      "env": {
        "ASSISTANT_TOKEN": "<generated-companion-token>",
        "ASSISTANT_PORT": "33333"
      }
    }
  }
}
```

For Codex CLI, the verified command form is shown below. Replace both placeholders before running it. This writes your local MCP configuration.

```powershell
codex mcp add tablewright-assistant --env 'ASSISTANT_TOKEN=<generated-companion-token>' --env 'ASSISTANT_PORT=33333' -- node 'C:\path\to\checkout\mcp\main.mjs'
```
For a TOML client configuration, use the same process and environment.

```toml
[mcp_servers.tablewright_assistant]
command = "node"
args = ["C:\\path\\to\\checkout\\mcp\\main.mjs"]

[mcp_servers.tablewright_assistant.env]
ASSISTANT_TOKEN = "<generated-companion-token>"
ASSISTANT_PORT = "33333"
```

The MCP command does not load the companion .env file. Supply its token and port through the client environment. The client needs no `OPENAI_API_KEY`. Its own agent can select canonical UUIDs and call `propose_creation` directly. Keep the token in local configuration, outside version control.

The six tools are listed here.

| Tool | Accepted input and result |
| --- | --- |
| `connection_status` | Empty object. Returns pairing status, world/user IDs, and whether a provider is configured. |
| `world_context` | Empty object. Returns bounded world, party, version, and permitted-pack metadata. |
| `search_compendium` | `query`, `documentName` as `Actor`, `Item`, or `any`, and `limit` from 1 through 30. Searches names in permitted indexes. |
| `read_source` | One canonical compendium `uuid`. Returns metadata for an NPC or physical item. |
| `propose_creation` | A `request` with `kind`, `name`, `background`, `entries`, and `party`. Returns a resolved browser preview. |
| `get_plan` | The returned plan `id`. Returns the current preview, state, and receipts. |

Each entry contains `uuid` and `quantity`. Use actual UUIDs returned by search. Their form is `Compendium.package.pack.Actor.ID` or `Compendium.package.pack.Item.ID`, with a 16-character document ID. NPC plans need one NPC and one copy. Shops need physical Item sources. Encounters need NPC Actor sources and explicit `party` with integer `level`, integer `size`, and `threat`. Use `party: null` for NPC and shop requests. Unknown fields, duplicate UUIDs, arbitrary document data, updates, macros, and executable input are rejected.

## Review creations and recover partial imports

NPC imports use native `fromCompendium` normalization, retain canonical statistics and embedded IDs, and append escaped custom background to private notes. Shops create a PF2e `loot` actor with `lootSheetType: "Merchant"` and canonical stock. Stock quantities come from the plan. Container references require their selected container and use stable planned IDs. Actors initially have GM-only ownership.

Encounters create the selected NPC copies and then a GM-only journal roster. The roster records canonical sources, quantities, actual XP, the explicit party inputs, and imported actor IDs. The alpha does not place tokens, activate combat, or create scenes.

XP uses actual resolved creature levels, not model arithmetic. Creature differences outside -4 through +4 and proficiency without level are rejected. Four-PC budgets are 40, 60, 80, 120, and 160 XP. Per-PC adjustments are 10, 20, 20, 30, and 40 XP. Nonmatching totals identify the interval between budgets. See [GM Core combat threats](https://2e.aonprd.com/Rules.aspx?ID=2716).

Approval rechecks GM permission, permitted sources, source snapshots, and the proficiency variant. Only one approval runs at a time. Stable document IDs and `flags.tablewright-assistant` provenance identify completed steps.

If a creation fails, the plan becomes partial and stops. Completed imports remain. Click **Retry missing creations** to reconcile existing planned IDs and create only missing steps. There is no automatic world retry or rollback deletion. A changed source requires rejecting the plan and proposing a fresh one. A conflicting ID or a removed completed document stops retry.

Do not refresh while recovering a partial plan. Pending plans, captured sources, and receipts are browser-session memory. Refresh loses them. Imported documents keep their provenance flags, but the alpha cannot reconstruct a lost plan or resume it across refresh. Review leftovers manually before making a replacement plan.

## Understand the data flow

The browser keeps raw selected source snapshots and normalized document data for preview validation and import. Neither leaves Foundry. External tools receive only these bounded values.

- World ID/title, system and Foundry versions, and whether proficiency without level is enabled.
- The first 20 character names and levels, and up to 64 permitted pack IDs, labels, and document types.
- Source UUID, name, document type, PF2e type, integer level, and up to 12 trait names. Search returns at most 30 matches.
- The entered prompt, custom name/background, explicit party inputs, creation plan metadata, computed XP, and receipt IDs/names/UUIDs.

No source descriptions, stat blocks, art, assets, raw documents, existing journal contents, or full world export go to MCP or the model. Read/proposal MCP traffic stays on the companion machine. Clicking the model button sends the prompt and tool metadata to the configured provider endpoint. Provider output returns as escaped text and browser-validated proposals. A model cannot approve them.

The companion binds to `127.0.0.1`. HTTP proxy requests require the exact `127.0.0.1:PORT` Host, no Origin header, and Bearer token. Browser WebSockets require the exact configured Foundry Origin, the same Host, the `/browser` path without a query, and first-message token authentication.

## Verify before using a campaign

Run the repeatable local checks.

```powershell
npm test
npm run package
```

The automated checks run the actual companion, SDK stdio client, and local fake Responses service. Foundry document APIs are fixtures. No provider key or paid inference is required. Read [verification evidence and the live checklist](docs/verification.md) before using the alpha in a campaign. Approval unit tests pass plain objects with isTrusted values. They do not exercise genuine DOM events. ApplicationV2 DOM rendering and real GM clicks remain unverified. These checks do not certify Foundry 13 or 14, PF2e migrations, actual sheet rendering, native Claude API, or paid model behavior.

The shared implementation, trust boundaries, and accepted omissions are described in [architecture](docs/architecture.md). The copied field reader and its full MIT notice are recorded in [provenance](docs/provenance.md) and `THIRD_PARTY_NOTICES`.
