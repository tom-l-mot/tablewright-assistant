# Tablewright Assistant

Describe an NPC, merchant, or encounter in Foundry VTT. Review the proposed sources and documents. Click **Approve creations** when the plan is right.

Tablewright has two parts. **Tablewright Assistant** is a Foundry module. **Tablewright Connector** is a small Windows app that runs on the GM's computer and connects the module to ChatGPT. The Foundry server can be on another computer; that server does not need the desktop app.

## Try the Windows test prerelease

Version **0.2.0-alpha.1** is an unsigned test build. The intended [v0.2.0-alpha.1 release](https://github.com/tom-l-mot/tablewright-assistant/releases/tag/v0.2.0-alpha.1), installer, and module download are pending publication and download verification. A link here is not evidence that its asset is available yet.

[Follow the beginner installation guide](docs/install.md). The normal workflow uses an installer and Foundry's **Install Module** screen. You do not need Node.js, a terminal, an API key, or a manually copied pairing token.

Live installation and use in Foundry are still pending. The user has deferred those checks until the Leng test world is ready. The initial target is Foundry 14 with PF2e 8.5.1. The manifest permits Foundry 13 through 14 without claiming verified compatibility. Local HTTP and remote HTTPS connectivity are implemented; actual remote Foundry connectivity remains unverified. See the [evidence table](docs/verification.md).

## What the assistant creates

- An existing compendium NPC with your chosen name and background.
- A merchant sheet stocked with existing physical items.
- An encounter's NPC actors and a journal roster, with XP calculated in Foundry.

A compendium is Foundry's library of creatures or items. Tablewright uses installed entries and retains their statistics. It does not generate original statistics, place tokens, create scenes, or start combat.

The assistant can propose a plan without creating anything. Only the GM's approval click in Foundry creates documents. Review each source and quantity before approving.

## ChatGPT access

The documented open-source Sign in with ChatGPT flow currently supports eligible **Plus and Pro** users. The requested ChatGPT Free experience is not met. Signing in alone does not prove that plan usage is available. [OpenAI quickstart](https://developers.openai.com/siwc/quickstart)

Tablewright reads the account's model list. It selects **GPT-5.6 Luna** only when that model is listed and no model has already been selected. That model uses **High** reasoning with **Standard** mode. If it is unavailable, choose a listed model yourself. Tablewright does not silently choose the first model, switch billing, or use a private endpoint.

Requests share your ChatGPT plan limits. [ChatGPT usage settings](https://chatgpt.com/settings/usage) controls account usage and any optional credits. Real account authorization, model availability, and inference for this build are still pending verification.

## Privacy and recovery

ChatGPT credentials remain in Windows-protected storage in the desktop app. Foundry receives account status and model choices, not account tokens. A request sends your prompt and limited world and compendium metadata to OpenAI. Source stat blocks, artwork, full documents, and existing journal contents stay in Foundry. [Data-flow details](docs/technical-reference.md#understand-the-data-flow)

If creation stops partway through, completed imports stay in the world. Keep the Foundry tab open and review **Retry missing creations**. Refreshing loses the session's pending plans and receipts. There is no automatic rollback or automatic world retry.

## Project details

Tablewright's code uses the MIT license. It has no module charge; Foundry and eligible AI access remain separate prerequisites. Optional donations are intended, but no donation page is available. No official Foundry directory listing is claimed.

- [Installation, everyday use, and troubleshooting](docs/install.md).
- [Developer setup and the advanced MCP interface](docs/technical-reference.md).
- [Architecture and security boundaries](docs/architecture.md).
- [Verification results and pending live checks](docs/verification.md).
- [Source credits and third-party notices](docs/provenance.md).
