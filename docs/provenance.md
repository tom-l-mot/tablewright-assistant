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

The project pins the SDK and runtime versions in package.json and package-lock.json. Desktop packaging adds Electron and electron-builder. Their dependencies are distinct from the small Foundry module archive.

Implemented reuse: module/lib/index-fields.mjs adapts only getNestedValue from the bridge. THIRD_PARTY_NOTICES carries its complete MIT notice and ships in the module archive. Other implementation code is original under LICENSE.

## Installed-system grounding

Read-only source inspection found PF2e 8.5.1 at D:/FoundryVTT/Data/systems/pf2e. Its manifest requires Foundry 14. Its compiled loot schema has Merchant/Loot values with that capitalization. Its proficiencyVariant is Boolean, with migration from the earlier ProficiencyWithoutLevel string. No private world or commercial compendium data was read or bundled. No installed-system code was copied.

Native normalization uses world collections fromCompendium. Creation explicitly sets both keepId and keepEmbeddedIds. Those separate options are documented in the [Foundry DatabaseCreateOperation API](https://foundryvtt.com/api/interfaces/foundry.abstract.types.DatabaseCreateOperation.html). Actual live imports still require the verification checklist.

## Release boundary

Version 0.2.0-alpha.1 is intended as an unsigned Windows test prerelease in the public [Tablewright repository](https://github.com/tom-l-mot/tablewright-assistant). Publication of the v0.2.0-alpha.1 installer and module assets, fresh-download checks, and live Foundry verification remain pending. No official Foundry directory listing is claimed.

The model/MCP receive bounded metadata, not full source descriptions, document JSON, art, or assets. A permitted-pack setting does not establish model-use rights. Official listing and content-rights review remain separate matters under [Foundry's AI policy](https://foundryvtt.com/article/ai-policy/).

## Desktop and account references

The desktop lifecycle uses Electron's documented [app API](https://www.electronjs.org/docs/latest/api/app), [Tray API](https://www.electronjs.org/docs/latest/api/tray), [deep-link handling](https://www.electronjs.org/docs/latest/tutorial/launch-app-from-url-in-another-app), and [safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage). The credential-store implementation is original code against those APIs.

The account flow follows OpenAI's [open-source Sign in with ChatGPT guide](https://developers.openai.com/siwc/token-sharing-open-source). Its [quickstart](https://developers.openai.com/siwc/quickstart) currently lists eligible Plus and Pro users for this integration. Free support is not established. Documentation access does not prove a real Tablewright account sign-in or successful inference.

Browser transport follows the current [GoogleChrome local-network guidance](https://github.com/GoogleChrome/modern-web-guidance/blob/main/skills/modern-web-guidance/guides/security/local-network-access.md) and [Local Network Access specification](https://wicg.github.io/local-network-access/). Chrome 154 loopback WebSocket support is the implementation target. Actual remote Foundry behavior still requires live verification.

The beginner module procedure uses Foundry's documented [manifest installation](https://foundryvtt.com/article/modules/). No generated screenshots or mock screens are used as evidence of a successful installation.
