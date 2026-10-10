# Source provenance

Only permissively licensed sources are eligible for code reuse. Reference checkouts are ignored under `work/` or kept in temporary storage and are not bundled.

| Reference | Inspected commit | License | Actual use |
| --- | --- | --- | --- |
| [Foundry API Bridge](https://github.com/alexivenkov/foundry-api-bridge-module) | de8887eaa4d6c48d872a2642765b8bfe4c011482 | MIT, copyright 2025 AI DM Project | getNestedValue adapted into module/lib/index-fields.mjs only |
| [Simulacrum](https://github.com/Daxiongmao87/simulacrum-foundry) | 91922c835dc6d269a35c2475a8f4de4a385aa616 | MIT, copyright 2026 Daxiongmao87 | Design reference for assistant UI and tool separation; no code copied |

The bridge getNestedValue field reader is adapted into module/lib/index-fields.mjs. THIRD_PARTY_NOTICES retains its full MIT notice and ships in the module ZIP. Its broad macro/delete/write router and hosted defaults were not copied. The assistant is independently implemented around a narrow creation plan.

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

## Installed-system grounding

Read-only source inspection found PF2e 8.5.1 at D:/FoundryVTT/Data/systems/pf2e. Its manifest requires Foundry 14. Its compiled loot schema has Merchant/Loot values with that capitalization. Its proficiencyVariant is Boolean, with migration from the earlier ProficiencyWithoutLevel string. No private world or commercial compendium data was read or bundled. No installed-system code was copied.

Native normalization uses world collections fromCompendium. Creation explicitly sets both keepId and keepEmbeddedIds. Those separate options are documented in the [Foundry DatabaseCreateOperation API](https://foundryvtt.com/api/interfaces/foundry.abstract.types.DatabaseCreateOperation.html). Actual live imports still require the verification checklist.

## Release boundary

This repository and artifact are a private local alpha. The model/MCP receive bounded metadata, not full source descriptions, document JSON, art, or assets. A permitted-pack setting does not establish model-use rights. Public release and official listing review remain pending under [Foundry's AI policy](https://foundryvtt.com/article/ai-policy/).
