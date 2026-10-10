# Verification evidence

These are local alpha checks. The initial 0.1.0 evidence below remains historical. The Tablewright 0.1.1 rename checks have their own section at the end. No live Foundry/PF2e world, private world files, or paid API call was used. Foundry import behavior uses fixtures plus inspected public APIs and installed PF2e system source. Node 26.4.0 and Windows PowerShell ran the commands.

## Initial 0.1.0 focused checks

| Command | Actual result |
| --- | --- |
| `node --test test/domain.test.mjs` | First domain unit passed 4 tests. |
| `node --test test/domain.test.mjs test/plans.test.mjs` | Browser planning/import unit passed 14 tests after the XP classification correction. |
| `node --input-type=module -e "import {Server} from '@modelcontextprotocol/sdk/server/index.js'; import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js'; import {Client} from '@modelcontextprotocol/sdk/client/index.js'; import {StdioClientTransport} from '@modelcontextprotocol/sdk/client/stdio.js'; import {WebSocketServer} from 'ws'; if (![Server,StdioServerTransport,Client,StdioClientTransport,WebSocketServer].every(x=>typeof x==='function')) throw Error('Missing official exports'); console.log('SDK client/server stdio and ws exports loaded');"` | Real SDK client/server/stdio and ws exports loaded. |
| `node --test test/transport.test.mjs test/provider.test.mjs test/mcp.test.mjs` | Companion/provider/SDK unit passed 11 tests. |
| `node --test test/domain.test.mjs test/plans.test.mjs test/transport.test.mjs test/provider.test.mjs test/mcp.test.mjs test/browser.test.mjs` | Pre-package focused suite passed 35 tests before subsequent regressions. |

The focused suite proves strict request rejection, default and configured pack policy, flat/nested indexes, corrected encounter budgets and interval labels, zero world writes before approval, NPC/stock/roster payloads, canonical embedded IDs, merchant container links, single-flight approval, source drift, GM and proficiency rechecks, partial retry reconciliation after a lost create response, and rejection/conflict behavior.

Actual network checks cover wrong token, Host, Origin, route/query, body/frame size, first-message authentication, authentication expiry, competing browser rejection, clean reconnect, malformed browser error handling, and disconnect during an outstanding read. Browser checks exercise the real browser client against the actual companion, chat command parsing, escaped markup, labels, and status markup. Approval tests use plain objects with isTrusted values. Genuine browser events, ApplicationV2 DOM rendering, and actual focus behavior have not been exercised.

The fake Responses server drives actual HTTP tool calls through the companion and browser adapter. It checks reasoning item preservation, matching function_call_output, explicit model, no provider storage request, metadata-only tools, bounded turn repetition, unauthorized tool refusal, explicit GM party enforcement, safe provider errors, and nested escaped-key redaction. The SDK client initializes the real stdio process, discovers all six tools, reads status/context, proposes, reads the plan, and confirms there is no approval method.

The 25-second pending-call timeout and 30/120-second provider deadlines are configured but were not waited out. A controlled abort test proves cancellation during a tool wait stops the current provider turn and prevents later tool dispatch. An already-aborted signal dispatches no tool. Authentication timeout was exercised with a shorter test timeout. A disconnect test proves pending requests are rejected when the paired browser closes.

## Environmental failures and corrections

`npm install --ignore-scripts` failed in the Google Drive worktree with repeated TAR_ENTRY_ERROR and an EBADF close error. It could not clean some ignored dependency folders. The implementation moved to an authorized physical-disk worktree without deleting those files. Dependency installation there exited successfully after npm refreshed corrupted cached tarball warnings.

The first Host assertion used Fetch, which did not transmit its overridden Host header. It observed HTTP 200 and failed. The test now uses `node:http` to send the actual hostile Host and observes HTTP 403. A markup test contained an unrelated substring assertion and failed because the UI correctly used the word "keeps". That assertion was removed; escaping and accessibility assertions remain.

A whitespace check caught a trailing blank line before one commit. It was removed before committing. Git warned about LF to CRLF conversion on this Windows checkout. No secrets were written to tracked files.

## Live checklist still required

Use a disposable PF2e 8.5.1 world on Foundry 14 and HTTP.

1. Enable the module. Confirm `@assistant request` opens and prefills the ApplicationV2 window without sending a model request. Confirm ordinary chat and a roll still work.
2. Tab through the window, check labels and visible focus, connect with the separate token, and enter explicit party values. Confirm MCP planning works with no provider key.
3. Search installed sources and propose an NPC. Confirm no actor exists before approval. Reject one proposal. Approve another. Inspect its name, private background, canonical statistics, spellcasting references, and embedded items in the actual PF2e sheet.
4. Approve a merchant. Confirm Merchant mode, physical stock, quantities, prices, and container links in the actual loot sheet.
5. Approve an encounter. Confirm the expected NPC copies and GM-only journal, computed XP, party values, and roster IDs. Sign in as a non-GM to check visibility and operation rejection.
6. Click approval twice and confirm no duplicate. If a controlled import failure occurs in the disposable world, keep the browser session, retry missing steps, and inspect completed provenance. Do not refresh during partial recovery.
7. Configure a real supported Responses model and make an intentional request. Confirm its tools select installed canonical records and its proposal uses the selected party values. Check provider account usage separately. Native Claude API and HTTPS transport remain deferred.

No live rendering, real document normalization, PF2e sheet behavior, permission migration, paid Responses response, provider deadline expiry, or Foundry 13 compatibility has passed yet. Parent independent review is separate from this implementation owner's checks.

## Input-retention regression evidence

The independent review found that a final refresh replaced edits entered while a model request was running. A minimal ApplicationV2 stub models current input values and refresh replacement. It does not render the actual Foundry DOM.

The pre-fix fixture came from `git show 64cc699:module/scripts/window.mjs`. Only its relative import paths were rebased into the ignored `.audit/window-before.mjs` fixture.

```powershell
$env:ASSISTANT_TEST_WINDOW_MODULE = Join-Path (Get-Location) '.audit\window-before.mjs'
node --test test/window.test.mjs
Remove-Item -LiteralPath 'Env:\ASSISTANT_TEST_WINDOW_MODULE'
```

The pre-fix check failed with actual `Original request` and expected `Next request typed while waiting`. After adding `this.capture()` before the final refresh, `node --test test/window.test.mjs` passed 1 test. `node --test test/window.test.mjs test/provider.test.mjs test/mcp.test.mjs` passed 7 tests. The strengthened `node --test test/provider.test.mjs test/window.test.mjs` passed 6 tests, including later-dispatch and already-aborted cancellation checks.

`codex mcp add --help` exited successfully and confirmed the documented stdio command and repeatable `--env KEY=VALUE` option. No actual global MCP configuration was changed.

## Initial 0.1.0 final candidate checks

`npm test` passed all 39 behavior/package checks. Its command explicitly names the eight committed test files, so ignored upstream/work directories cannot add tests. An earlier default-discovery run reported 41 checks because it also loaded two fixture modules. `npm run package` created the actual module ZIP. `node --test test/package.test.mjs` checks its exact entries, module/import completeness, referenced documentation, unchanged runtime file content, MIT notice, exclusion of credentials/dependencies, browser syntax, and token format.

The initial archive contained 19 files beneath pf2e-foundry-assistant. Packaging uses Windows PowerShell. Package staging folders remain ignored under dist. No recursive cleanup or world deletion was performed.

`git diff --check` passed before the package commit. Read-only system inspection and local fixture checks are the evidence for fields and API usage. The live checklist remains open.

## Tablewright 0.1.1 rename checks

The rename updates the repository references, module ID, npm package, MCP server, window title, CSS scope, companion message, and ZIP identity. The runtime logic and dependencies remain the initial alpha's implementation. Module settings and import provenance now use `tablewright-assistant`; old imports and settings are not migrated. The [numbered install guide](install.md) covers disabling the earlier module, reentering settings, and trying a disposable world first.

Parent execution on Windows with Node 26.4.0 produced these results.

- `npm run package` succeeded and created `dist/tablewright-assistant-0.1.1.zip`.
- `inspectPackage` read the actual ZIP and returned 20 files, the expected module ID, title, and version, and the included `docs/install.md`.
- `node --test test/mcp.test.mjs` passed 1 test. The real SDK client initialized the renamed stdio process and used the companion's six read/proposal tools.

The earlier 39-test run is evidence for version 0.1.0, not a new full-suite result for this rename. The final archive and immutable commit checks are recorded in the rename's local task evidence. No installation into Foundry, global MCP registration, paid API request, or live-world import was performed during the rename.
