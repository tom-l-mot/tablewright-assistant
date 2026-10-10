# Install Tablewright Assistant on this Windows PC

Use this guide to connect Tablewright Assistant to a disposable Pathfinder Second Edition world. At the end, you can review an NPC proposal and approve its creation in Foundry.

This guide is for version 0.1.1. The current alpha imports existing compendium entries and adds custom names or backgrounds. Creating entirely new stat blocks is a later phase.

## Before you start

You need these items.

- Foundry 14 with the PF2e system. PF2e 8.5.1 is the first target.
- A disposable world for the first trial. Keep your campaign backup separate.
- Node.js 22 or newer. The local build checks used Node 26.4.0.
- GitHub CLI, called `gh`, signed in to an account with access to the private repository.
- A browser on this PC. Open Foundry with an `http://` address. This alpha rejects HTTPS and hosted connections.
- Either your OpenAI API key and exact API model ID, or a local Codex or Claude MCP client.

The module is the part inside Foundry. The companion is a small program that runs in PowerShell and connects Foundry to your AI. Keep that PowerShell window open while using the assistant.

Live Foundry rendering and document imports have not yet passed the real-world checklist. Follow this guide in the disposable world first.

## Get the source files

1. Open **PowerShell** from the Windows Start menu.

2. Check Node.js.

   ```powershell
   node --version
   ```

   The number must start with `v22` or higher. If PowerShell cannot find `node`, install Node.js before continuing.

3. Check your GitHub sign-in.

   ```powershell
   gh auth status
   ```

   If you are not signed in, run `gh auth login` and follow its prompts. Your account must have access to `tom-l-mot/tablewright-assistant`.

4. Create a folder for the source files.

   ```powershell
   New-Item -ItemType Directory -Path 'C:\Users\Tom\Projects' -Force
   ```

   Use a folder on the local disk. Dependency installation failed in Google Drive during the initial build.

5. Download the private repository.

   ```powershell
   gh repo clone tom-l-mot/tablewright-assistant 'C:\Users\Tom\Projects\Tablewright-Assistant'
   ```

   If that destination already exists, stop and inspect it. Use another empty local folder instead of replacing existing files. Adjust the following paths to match.

6. Open the downloaded folder in PowerShell.

   ```powershell
   Set-Location -LiteralPath 'C:\Users\Tom\Projects\Tablewright-Assistant'
   ```

   Use this folder for every command below unless a step says otherwise.

7. Install the companion's required libraries.

   ```powershell
   npm ci --ignore-scripts
   ```

   Wait for the command to finish without an error.

## Set up the connection

8. Create your settings file.

   ```powershell
   Copy-Item -LiteralPath '.env.example' -Destination '.env'
   ```

   If `.env` already exists, skip this command and keep your existing settings.

9. Generate a pairing token.

   ```powershell
   npm run token
   ```

   Copy the long final line. This token connects Foundry to the companion. It is different from your AI provider key.

10. Open the settings file.

    ```powershell
    notepad .env
    ```

11. Paste the token after `ASSISTANT_TOKEN=`.

    The line must look like the example below, with your real generated token in place of the placeholder.

    ```dotenv
    ASSISTANT_TOKEN=PASTE_YOUR_GENERATED_TOKEN_HERE
    ```

12. Set the Foundry address.

    For the default local browser address, keep these lines.

    ```dotenv
    ASSISTANT_PORT=33333
    FOUNDRY_ORIGIN=http://localhost:30000
    ```

    If you use another address, copy its protocol, host, and port into `FOUNDRY_ORIGIN`. Do not add a world path or trailing slash. `localhost` and `127.0.0.1` must match the browser address exactly.

13. Choose how to send requests to AI.

    To use the button inside Foundry, fill these two settings with your own values.

    ```dotenv
    OPENAI_API_KEY=PASTE_YOUR_PROVIDER_KEY_HERE
    OPENAI_MODEL=PASTE_YOUR_EXACT_API_MODEL_ID_HERE
    OPENAI_RESPONSES_URL=https://api.openai.com/v1/responses
    ```

    Use an API model ID available to your key. Provider requests may cost money. Keep the provider key in `.env`; do not paste it into Foundry or a chat.

    If you prefer local Codex or Claude through MCP, leave `OPENAI_API_KEY` and `OPENAI_MODEL` empty. Follow the optional MCP steps after connecting Foundry.

14. Save `.env` in Notepad.

## Install the Foundry module

15. Build the module ZIP.

    ```powershell
    npm run package
    ```

    The output names `dist\tablewright-assistant-0.1.1.zip`.

16. Close Foundry before extracting the ZIP.

    If you installed the earlier **PF2e Foundry Assistant**, disable it in your test world before closing Foundry. Keep its files and created documents until you have checked the renamed module. The new module uses separate settings and provenance flags; it does not migrate old imports.

17. Extract the new module into Foundry's modules folder.

    This PC's observed Foundry data folder is `D:\FoundryVTT`. Use the command below only if that is still your data folder.

    ```powershell
    Expand-Archive -LiteralPath '.\dist\tablewright-assistant-0.1.1.zip' -DestinationPath 'D:\FoundryVTT\Data\modules'
    ```

    If your data folder differs, change the destination before running the command. If `tablewright-assistant` already exists there, preserve it before replacing it. Do not use `-Force` over an existing installation.

18. Check that this file exists.

    ```text
    D:\FoundryVTT\Data\modules\tablewright-assistant\module.json
    ```

    There must be exactly one `tablewright-assistant` folder between `modules` and `module.json`.

19. Start Foundry and open your disposable PF2e world as the GM.

20. Enable **Tablewright Assistant** in the world's module-management screen.

    Save the module selection. If Foundry asks for a reload, allow it.

    If you configured additional permitted packs in the earlier module, enter those exact pack IDs again in Tablewright's settings. Existing created actors remain in the world.

## Start the companion and connect Foundry

21. Start the companion in the PowerShell window you used above.

    ```powershell
    npm start
    ```

    Look for this message.

    ```text
    Tablewright Assistant companion listening on 127.0.0.1:33333.
    ```

    Keep this window open. To stop the companion later, press **Ctrl+C** in this window.

22. Open Foundry in a browser on this PC.

    For the default settings, use `http://localhost:30000`. Sign in as the GM. The browser address must match `FOUNDRY_ORIGIN`.

23. Type this into Foundry chat and send it.

    ```text
    @assistant
    ```

    A **Tablewright Assistant** window is expected to open. This command opens the window; it does not send an AI request yet.

24. Enter the **WebSocket URL**.

    ```text
    ws://127.0.0.1:33333/browser
    ```

25. Paste your generated token into **Pairing token**.

    Use the token from `ASSISTANT_TOKEN`, not `OPENAI_API_KEY`.

26. Click **Connect**.

    The expected status is `Connected. MCP can propose plans. Review and approve them here.` Only one GM browser can connect at a time.

## Try one NPC proposal

27. Enter **1** in **Party level**.

28. Enter **4** in **Party size**.

29. Select **moderate** in **Threat**.

    The current window requires these fields even for NPC and shop requests.

30. Enter this in **Request**.

    ```text
    Find an installed goblin NPC. Propose one copy named Rook. Give Rook a short background as a suspicious sewer guide. Keep the source creature's statistics.
    ```

31. Click **Send to configured model**.

    If you chose MCP instead, follow the optional MCP steps below and give this request to that client. The Foundry button stays disabled when no provider is configured.

32. Review the plan shown under **Review and approval**.

    Check the selected source, name, background, and number of planned documents. No actor should exist from this proposal before approval.

33. Click **Approve creations** if the preview is correct.

    To discard the proposal instead, click **Reject plan**.

34. Open the created actor in Foundry's actor directory.

    Check the name, private background, statistics, and embedded items. Record any error from this disposable-world trial before trying your campaign.

## Optional: connect local Codex through MCP

MCP lets your local AI client use Tablewright's search and proposal tools. Foundry still shows the plan and requires your approval click.

1. Keep the companion running and Foundry connected.

2. Open a second PowerShell window.

3. Replace the token placeholder in the command below, then run it.

   This command adds a Tablewright entry to your local Codex MCP settings. It needs the pairing token, not your provider key.

   ```powershell
   codex mcp add tablewright-assistant --env 'ASSISTANT_TOKEN=PASTE_YOUR_GENERATED_TOKEN_HERE' --env 'ASSISTANT_PORT=33333' -- node 'C:\Users\Tom\Projects\Tablewright-Assistant\mcp\main.mjs'
   ```

   If you previously registered `pf2e-foundry-assistant`, keep it until the new entry works. Avoid using both entries for the same request.

4. Reopen your Codex session so it loads the new MCP entry.

5. Ask Codex to use `tablewright-assistant` to check the connection and propose the example NPC above.

6. Return to the Foundry window to review and approve the plan.

For Claude's local JSON configuration, use the [MCP configuration example in README](../README.md#configure-a-local-mcp-client). Use the same source folder and pairing token.

## If something goes wrong

- **The module does not appear.** Check the extracted `module.json` path, then restart Foundry.
- **The companion will not start.** Check `.env`, the token, the exact HTTP origin, and the model ID if a provider key is set.
- **The port is already in use.** Stop the earlier companion with Ctrl+C. If you deliberately change the port, change `.env`, the Foundry WebSocket URL, and the MCP port together.
- **Connect fails.** Keep the companion running. Check the pairing token and exact Foundry browser origin. Disconnect any other GM browser first.
- **Send is disabled.** Connect first. For the in-window button, set both provider fields and restart the companion. For MCP use, a disabled button is expected.
- **The model cannot find a source.** Try a creature name present in an installed PF2e compendium. Additional module packs need exact permitted pack IDs in the module settings.
- **An import stops partway.** Keep the browser session open. Read the error, then use **Retry missing creations** after correcting the cause. Refreshing loses pending plans and receipts. Retry does not delete completed imports.

## You're done when

- Tablewright Assistant appears in your module list.
- The companion prints its listening message.
- The Foundry window shows a connected status.
- Your AI client produces a plan with an installed compendium source.
- A real GM approval click creates the expected actor in the disposable world.

These are your live installation checks. Local package checks are recorded separately in [verification evidence](verification.md).
