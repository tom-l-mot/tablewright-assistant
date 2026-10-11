# Verification evidence

Version **0.2.0-alpha.1** is a Windows test prerelease. This page separates implemented behavior, automated checks, native/browser checks, and real Foundry evidence. An intended behavior is not a passed check.

## Current evidence

| Area | Evidence and status |
| --- | --- |
| Automated development baseline | The implementation coordinator reported 49 passing checks before final documentation and release verification. Final suite count and immutable revision still need to be recorded. |
| Earlier transport/UI baseline | At revision 83df9f4, `node --test test/transport.test.mjs test/browser.test.mjs test/window.test.mjs` passed 15/15. This predates the desktop changes and includes the former HTTPS-rejection test. |
| Source-grounded documentation | Current desktop main, module UI/window/connection, config, store, provider/account policy, package configuration, and manifest inspected. This is not a live installation. |
| Native tray and status dialog | Implemented. Live packaged-app result pending. |
| safeStorage persistence and restart | Coordinator-observed synthetic self-check and separate-process restart passed with Electron 44.7.0 and bundled Node 24.21. Real account credential persistence is a separate check. |
| Single instance and startup setting | Coordinator-observed duplicate-instance rejection and startup register/disable checks passed in that runtime. Actual launch after Windows sign-in remains pending. |
| Native protocol pairing | Exact site/code confirmation and expiring grant implemented. Installed protocol registration and actual browser-to-app flow remain pending. |
| Local HTTP browser connection | Implemented. Real Foundry connection remains pending. |
| Remote HTTPS browser connection | Loopback targetAddressSpace support implemented for the Chrome 154 target. Real remote Foundry, host policy, and permission flow remain pending. |
| Real ChatGPT authorization | The real OpenAI consent screen was reached with the selected account. The user's Continue action and completed authorization remain pending. Mock OAuth tests do not prove account authorization. |
| Actual account model catalog | Pending. Luna is selected only if listed; mock catalog tests do not establish live availability. |
| Real provider inference and account usage | Pending. No actual successful response or billing/allowance result is claimed here. |
| Installer and module publication | Planned v0.2.0-alpha.1 assets. Publication and fresh-download checks pending. |
| Installer install/update/uninstall | Initial unsigned Windows x64 installer build passed. Rebuild after final changes and actual install/update/uninstall checks remain pending. Local account-data deletion is not requested on uninstall. |
| Foundry manifest installation/update | Manifest and release asset paths configured. Live installation and update pending. |
| ApplicationV2 and real PF2e imports | Pending until the Leng test world is ready, as requested by the user. |
| Foundry 13 compatibility | Manifest permits it without a verified flag. No live pass claimed. |

The coordinator should replace pending native, browser, account, release, and final-suite entries only with observed results from this build. Keep failed or deferred cases explicit.

## What automated checks establish

The suite uses the actual companion HTTP/WebSocket server, official SDK stdio process, and mock provider services. Foundry document APIs and the ApplicationV2 environment are fixtures.

Checks cover strict Host/Origin/authentication handling, bounded payloads, competing sessions, pairing expiry and identity matching, metadata-only tools, account error states, catalog selection, explicit billing choice, source validation, encounter XP, zero writes before approval, and partial-plan reconciliation. They also check package contents and input retention across asynchronous UI updates.

Approval fixtures set an isTrusted property. They do not exercise a genuine browser click or prove live focus behavior. Mock account responses do not prove ChatGPT Free/Plus/Pro eligibility, usage accounting, or a real model's reasoning support.

The protected-store self-check uses synthetic credentials. It must not be described as a real sign-in. Startup registration is distinct from launching after Windows sign-in. A generic HTTPS page reaching loopback is distinct from the actual remote Foundry host allowing it.

## Repeatable commands

Run in the source checkout:

```powershell
npm.cmd test
npm.cmd run package
npm.cmd run build:windows
```

The first command is the automated suite. Package generation inspects the browser module archive through the package tests. The Windows build creates an unsigned installer and never publishes automatically.

Record the command, revision, date, count/result, and relevant errors for the final candidate. Do not reuse the 49-test development count after more tests or source changes without a fresh result.

## Deferred live checklist

Do not begin these checks until the Leng test world is ready and the user resumes live testing.

1. Download the actual release installer and install it for the current Windows user. Confirm the tray icon, Show status, duplicate-launch behavior, and native protocol registration.
2. Toggle Start at Windows login. Confirm both enabled and disabled behavior after a real Windows sign-in. Verify uninstall cleanup later in a separate lifecycle check.
3. In Foundry setup, install through the exact manifest URL. Confirm version 0.2.0-alpha.1 and enable the module in the test world.
4. Open the GM browser and use @assistant. Check normal chat/rolls, keyboard navigation, labels, focus, and input retention.
5. Use Pair desktop, match the native site/code, and Connect desktop. Reject a mismatch, an expired attempt, and a second active session.
6. Repeat connectivity for local HTTP and actual remote HTTPS. Record browser versions, permission grants/denials, and any host CSP restriction. Do not weaken browser security.
7. Complete real ChatGPT authorization. Check disabled plan usage, explicit enable, cancellation, reconnect, sign-out, and account catalog. Confirm the selected model and displayed reasoning settings.
8. Make an intentional model request only after account access is ready. Record the actual result and verify account usage separately. Confirm no automatic model or API-billing fallback.
9. Propose an NPC. Inspect the preview and confirm no actor exists before approval. Reject one proposal; approve another with a genuine GM click. Inspect the real PF2e sheet, statistics, embedded items, spellcasting, and private background.
10. Create a merchant and inspect Merchant mode, stock, quantities, prices, and containers. Create an encounter and inspect actors, roster journal, computed XP, ownership, and receipt IDs.
11. Check non-GM rejection and GM-only ownership. Double-click approval and confirm no duplicate. Use a controlled failure to exercise Retry missing creations without refreshing.
12. Verify module update, matching desktop update, sign-out, startup removal, and uninstall. Inspect remaining world creations rather than assuming rollback.

## Known limits

Generated statistics, scene/token placement, automatic combat setup, cross-refresh plan recovery, native Claude inference, and a normal desktop MCP setup are not implemented.

The requested ChatGPT Free flow remains unmet under the currently documented open-source Plus/Pro eligibility. Real Foundry compatibility and successful live inference remain unverified until their rows contain actual evidence.
