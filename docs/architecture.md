# Desktop architecture

Version **0.2.0-alpha.1** packages the existing Node companion inside a Windows Electron tray app. Foundry remains responsible for previews, permission checks, and document creation. Live Foundry verification is pending.

## User workflow and ownership

A GM opens Tablewright from Foundry chat, pairs the exact browser session through a native dialog, and connects ChatGPT. The model searches permitted metadata and proposes an NPC, merchant, or encounter. Only a trusted GM click in Foundry applies a plan.

| Component | Owns |
| --- | --- |
| Foundry module | Chat command, assistant window, source resolution, previews, approval, creation receipts. |
| BrowserConnection | Pairing challenge, local socket, message validation, bounded browser-tool calls. |
| Desktop main process | Single instance, native origin confirmation, tray, startup setting, external authorization browser, protected credential store. |
| Companion server | Loopback listener, one selected session, provider/account operations, pending requests, cancellation. |
| ChatGPTAuth and provider | OAuth validation, account catalog/status, selected model, bounded public Responses tool loop. |
| Advanced MCP entry point | Stdio read/proposal proxy to the standalone developer companion. |

Electron reuses the existing Node implementation. A separate native runtime or sidecar would add another process boundary. The app has no general remote renderer or embedded Foundry browser.

The desktop API-key fields are empty, and its RPC token is generated privately. The normal UI does not expose that token. The older standalone companion/MCP integration remains a developer path with explicit credentials and a developer browser client.

## Trust boundaries

Pairing begins with an untrusted `tablewright://pair` request. Strict parsing rejects unexpected fields and malformed values. The native confirmation shows the exact origin and matching code. World/user labels are page-supplied. Approval permits one matching session for two minutes; successful authentication consumes it.

The server binds to IPv4 loopback, checks the exact Host and approved Origin, and accepts only the expected socket route. Pairing challenges and provider credentials are separate. One active browser owns the connection. Disconnecting stops model work and rejects pending browser requests.

HTTPS connections use the browser's documented loopback target-address-space mechanism. Ordinary WebSocket construction remains the compatibility attempt when that option is unsupported. No browser security bypass, wildcard Origin, local certificate exception, or remote relay is configured. Actual hosted Foundry behavior still needs a real-browser test.

Account credentials remain in Electron safeStorage-backed files in the desktop user-data directory. Atomic replacement avoids partial credential writes. Single-instance locking prevents a second desktop process from opening the same bridge. Protection is scoped to the Windows user; it is not a defense against all same-user local software.

## Plans and creation

The browser owns each plan's progression through pending, applying, complete, partial, or rejected. It resolves canonical UUIDs before presenting a preview. Approval rechecks the GM, source snapshots, permitted packs, and supported PF2e rules.

NPC and merchant imports preserve canonical data. Encounters compute XP in Foundry and create actors plus a roster journal. Source descriptions and raw statistics stay inside Foundry. The provider and MCP receive narrow metadata and have no apply/import tool.

Partial creation stops. Completed steps keep their planned IDs and provenance. A later trusted retry creates missing steps after reconciliation. No automatic rollback deletes documents. Refresh loses in-memory plans and receipts; cross-refresh recovery is not implemented.

## Account and model policy

ChatGPT sign-in, plan authorization, catalog availability, and successful inference are distinct states. The app displays disabled, ineligible, limited, unavailable, and ready states instead of assuming every signed-in account can run a model.

GPT-5.6 Luna is the preferred default only when present in the account catalog and no model is already selected. It requests High reasoning in Standard mode. Missing models require an explicit choice. Other models use their defaults. No first-entry selection, private endpoint, or automatic API billing fallback is allowed.

The documented open-source flow currently covers eligible Plus and Pro users. Free support remains unmet. [OpenAI quickstart](https://developers.openai.com/siwc/quickstart)

## Bounded work

The existing protocol limits JSON bodies to 32 KiB and socket frames to 256 KiB. It permits eight pending browser calls and eight local RPC requests. Browser-call deadlines, authentication expiry, one prompt at a time, and bounded provider turns/tool calls prevent unlimited queued work. Provider errors are sanitized and secrets are redacted before browser output.

No generic plugin system, arbitrary command router, source-statistics generator, token placement, or automatic combat setup was added.

## Verification boundary

Automated fixtures exercise protocol, model policy, plans, package contents, and cancellation. The installed Windows executable passed synthetic credential, single-instance, and startup-registration checks. A Brave Chromium 154 HTTP fixture exercised the actual browser client's connection and disconnection. Neither check verifies real Foundry or completed ChatGPT authorization. The [verification table](verification.md) records these limits; release notes record published-artifact checks.

The user has deferred installation and live-world checks until a disposable test world is ready. This does not turn those checks into passes.
