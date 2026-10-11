# Verification evidence

Version **0.2.0-alpha.1** is a Windows test prerelease. This page separates implemented behavior, automated checks, native/browser checks, and real Foundry evidence. An intended behavior is not a passed check.

## Current evidence

| Area | Evidence and status |
| --- | --- |
| Automated suite | `npm.cmd test` passed 68/68 after the serialized credential-persistence fix. The final reviewed commit is recorded in the release notes. Artifact rebuild and packaged-source checks are separate release gates. |
| Runtime dependency audit | `npm.cmd audit --omit=dev` reported zero vulnerabilities. |
| Full dependency audit | Eight moderate build-dependency findings remain, rooted in sprintf-js precision denial of service, GHSA-hp3w-g68c-fv3c, and propagated through the Electron build/download dependency chain. The registry's latest sprintf-js version was 1.1.3 with no patched version available. No forced builder downgrade was applied. This is separate from the zero-finding runtime audit. |
| Earlier transport/UI baseline | At revision 83df9f4, `node --test test/transport.test.mjs test/browser.test.mjs test/window.test.mjs` passed 15/15. This predates the desktop changes and includes the former HTTPS-rejection test. |
| Source-grounded documentation | Current desktop main, module UI/window/connection, config, store, provider/account policy, package configuration, and manifest inspected. This is not a live installation. |
| Native tray and status dialog | Implemented. Live packaged-app result pending. |
| Installed executable | Silent per-user installation into `%TEMP%/Tablewright-Install-Verify` passed. The installed executable's self-check passed from its installed working directory with PATH restricted to Windows System32. It reported `packaged: true`, Electron 44.7.0, and bundled Node 24.21. This was not a clean VM or human installer walkthrough. |
| safeStorage persistence and restart | Synthetic write, rotation, load, and separate-process restart checks passed in the installed runtime. Real account credential persistence is a separate check. |
| Single instance and startup setting | Duplicate-instance rejection and startup register/disable checks passed in the installed runtime. Actual launch after Windows sign-in remains pending. |
| Native protocol pairing | Exact site/code confirmation and expiring grant implemented. Installed protocol registration and actual browser-to-app flow remain pending. |
| Local HTTP browser connection | The actual browser client connected and disconnected in an HTTP fixture using Brave with Chromium 154. A screenshot was captured. This did not test Foundry, the native pairing approval dialog, or remote HTTPS. |
| Remote HTTPS browser connection | Loopback targetAddressSpace support implemented for the Chrome 154 target. Real remote Foundry, host policy, and permission flow remain pending. |
| Real ChatGPT authorization | The real OpenAI consent screen was reached with the selected account. The user's Continue action and completed authorization remain pending. Mock OAuth tests do not prove account authorization. |
| Actual account model catalog | Pending. Luna is selected only if listed; mock catalog tests do not establish live availability. |
| Real provider inference and account usage | Pending. No actual successful response or billing/allowance result is claimed here. |
| Installer and module publication | Release gates are recorded in the external v0.2.0-alpha.1 release notes, including reviewed source, checksums, packaged-source comparison, and fresh-download results. This document does not record a publication or download pass. |
| Final installer artifact | The initial unsigned Windows x64 build and silent install passed. Rebuild from the final reviewed runtime and packaged-source comparison remain to be completed before publication. |
| Installer update/uninstall | Human installer UI, update, and uninstall checks remain pending. Local account-data deletion is not requested on uninstall. |
| Foundry manifest installation/update | Manifest and release asset paths configured. Live installation and update pending. |
| ApplicationV2 and real PF2e imports | Pending until a disposable test world is ready, as requested by the user. |
| Foundry 13 compatibility | Manifest permits it without a verified flag. No live pass claimed. |

The observed native and browser checks used the existing Windows development machine. Restricting PATH demonstrates that the installed self-check did not need a separately installed Node executable; it does not establish clean-machine compatibility. Release notes are the record for published-artifact verification. Only the checks explicitly marked passed above have passed.

## What automated checks establish

The suite uses the actual companion HTTP/WebSocket server, official SDK stdio process, and mock provider services. Foundry document APIs and the ApplicationV2 environment are fixtures.

Checks cover strict Host/Origin/authentication handling, bounded payloads, competing sessions, pairing expiry and identity matching, metadata-only tools, account error states, catalog selection, explicit billing choice, source validation, encounter XP, zero writes before approval, and partial-plan reconciliation. They also check package contents and input retention across asynchronous UI updates.

Approval fixtures set an isTrusted property. They do not exercise a genuine browser click or prove live focus behavior. Mock account responses do not prove ChatGPT Free/Plus/Pro eligibility, usage accounting, or a real model's reasoning support.

The protected-store self-check uses synthetic credentials. It must not be described as a real sign-in. Startup registration is distinct from launching after Windows sign-in. The HTTP browser fixture pass does not establish that an actual remote HTTPS Foundry host allows the connection.

## Repeatable commands

Run in the source checkout:

```powershell
npm.cmd test
npm.cmd run package
npm.cmd run build:windows
```

The first command is the automated suite. Package generation inspects the browser module archive through the package tests. The Windows build creates an unsigned installer and never publishes automatically.

Record the command, revision, date, count/result, and relevant errors for each new candidate. The final 68-test result includes the independent review fixes. It does not certify an installer until its packaged source is compared with the reviewed source.

## Deferred live checklist

Do not begin these checks until a disposable test world is ready and the user resumes live testing.

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
