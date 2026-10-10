# Source provenance

Only permissively licensed sources are eligible for code reuse. Reference checkouts are ignored under `work/` or kept in temporary storage and are not bundled.

| Reference | Inspected commit | License | Planned use |
| --- | --- | --- | --- |
| [Foundry API Bridge](https://github.com/alexivenkov/foundry-api-bridge-module) | de8887eaa4d6c48d872a2642765b8bfe4c011482 | MIT, copyright 2025 AI DM Project | Small dotted/nested index field reader; source lookup patterns |
| [Simulacrum](https://github.com/Daxiongmao87/simulacrum-foundry) | 91922c835dc6d269a35c2475a8f4de4a385aa616 | MIT, copyright 2026 Daxiongmao87 | Design reference for assistant UI and tool separation; no copied code planned |

If the bridge field reader is adapted, retain its full MIT notice in the shipped third-party notices and record the resulting file. Do not inherit its broad macro/delete/write router or hosted defaults. The new assistant is independently implemented around a narrow creation plan.

Foundry and PF2e are installed prerequisites. Their content remains in the user's licensed installation. No rulebook text, commercial assets, compendium database, Archives of Nethys dump, or competitor's paid files are bundled. Published numerical encounter tables are implemented as functions with their primary-source links.

## API grounding

- [Foundry chatMessage hook](https://foundryvtt.com/api/functions/hookEvents.chatMessage.html)
- [Foundry ApplicationV2](https://foundryvtt.com/api/classes/foundry.applications.api.ApplicationV2.html)
- [PF2e source](https://github.com/foundryvtt/pf2e), specifically Actor loot data and physical items
- [PF2e Combat Threats](https://2e.aonprd.com/Rules.aspx?ID=2716)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling)
- [Official MCP TypeScript SDK stdio guide](https://github.com/modelcontextprotocol/typescript-sdk/blob/main/docs/serving/stdio.md)

Observed registry versions during setup: `@modelcontextprotocol/server` 2.3.1, legacy `@modelcontextprotocol/sdk` 1.32.1, `ws` 8.22.0. Pin the dependency actually used and verify its real exports during implementation.

Implemented reuse: module/lib/index-fields.mjs adapts only getNestedValue from the bridge. THIRD_PARTY_NOTICES carries its complete MIT notice and ships in the module archive. Other implementation code is original under LICENSE.
