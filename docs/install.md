# Install Tablewright Assistant on Windows

Your goal is to ask for a goblin NPC, review its proposed name and background, and approve its creation in a test Foundry world.

This guide is for version 0.1.1. You do not need to write code or install Git. You do need to paste a few commands into PowerShell, Windows' command window.

This is a development alpha. The instructions have been checked against the source, but a complete live Foundry installation has not yet been verified. Keep your first trial separate from your campaign.

## Before you start

You need these items.

- A Windows PC that runs both Foundry and the assistant.
- Foundry 14 and Pathfinder Second Edition. PF2e 8.5.1 is the first target.
- A disposable PF2e world where mistakes will not affect a game.
- Internet access to download files and contact your AI provider.

This walkthrough uses OpenAI for the button inside Foundry. You need your own API key and API billing access. [API charges are separate from your ChatGPT subscription](https://help.openai.com/en/articles/9039756-managing-billing-settings-on-the-chatgpt-web-and-api-platform). Read the provider's costs before sending a request.

If you already use local Codex or Claude, you can use the [advanced MCP setup](technical-reference.md#configure-a-local-mcp-client) instead. That option uses your AI client's own access. Complete the guide through connecting Foundry, leave the two provider fields empty, then use that page to submit a proposal.

The alpha needs a local browser address beginning with `http://`. A hosted Foundry service or an address beginning with `https://` does not work with this version.

## Know which window to use

You use these windows during setup.

| Window | What you do there |
| --- | --- |
| Web browser | Download files, manage your API key, and later open Foundry. |
| File Explorer | Extract ZIP files and copy the module into Foundry's data folder. |
| PowerShell | Paste commands that prepare and start the companion. |
| Notepad | Fill in the companion's settings file. |
| Foundry | Enable the module, enter your prompt, and approve the result. |

The module is the part installed inside Foundry. The companion is the separate program that connects Foundry to your AI. Both must be installed.

Follow the sections in order. If a checkpoint fails, stop at that section and use [troubleshooting](#if-something-goes-wrong).

## 1. Install Node.js

Node.js runs the companion on your PC. Skip the download if you already have Node 22 or newer.

1. Open the [official Node.js download page](https://nodejs.org/en/download).
2. Select Windows and download its installer. The LTS option is the maintained release. Choose the installer for your PC's processor.
3. Open the downloaded installer and follow its prompts. Keep the standard installation options.
4. Open the Windows Start menu, search for `PowerShell`, and open it. If PowerShell was open before the installation, close and reopen it.
5. Paste the following command into PowerShell, then press **Enter**.

   ```powershell
   node --version
   ```

**Checkpoint.** PowerShell prints a version such as `v26.4.0`. The first number must be 22 or higher. The project's local checks used 26.4.0; other eligible versions have not been verified here.

When this guide shows a command, copy the text inside the box. Do not copy the word `powershell`, the box border, or a leading `PS C:\...` prompt.

## 2. Download and unpack the project

This is a first-install guide. If you already have a `Tablewright-Assistant` folder or an installed module, preserve it and follow [existing installations](#if-you-already-installed-an-earlier-version) before replacing files.

1. Open the public [Tablewright repository](https://github.com/tom-l-mot/tablewright-assistant) in your browser.
2. Above the file list, select **Code**.
3. Select **Download ZIP**.

   ![GitHub's example repository with the Code button outlined above the file list.](https://docs.github.com/assets/cb-13128/images/help/repository/code-button.png)

   This image is from [GitHub's illustrated download guide](https://docs.github.com/en/repositories/working-with-files/using-files/downloading-source-code-archives). It shows an example repository, not Tablewright.

4. Open **Downloads** in File Explorer. Right-click the downloaded ZIP, then choose **Extract All**. Complete the extraction.
5. Open the extracted folders until you see `package.json`, `.env.example`, `companion`, and `module` together. You may need to open an inner folder named `tablewright-assistant-main`.
6. Rename that folder to `Tablewright-Assistant`.
7. Copy that entire folder.
8. In File Explorer's address bar, enter `%USERPROFILE%` and press **Enter**. This opens your Windows user folder.
9. Paste the copied folder there. Do not replace an existing folder with that name.

**Checkpoint.** Enter `%USERPROFILE%\Tablewright-Assistant` in File Explorer's address bar. The folder contains `package.json` directly. It must not contain another project folder that you still need to open.

Keep this folder on your PC's local disk, outside Google Drive or another synced folder. Dependency extraction failed in Google Drive during the initial build.

GitHub's Download ZIP contains the project's source files. It is different from the Foundry module ZIP you build in section 5. The module ZIP alone cannot run the companion.

## 3. Prepare the companion

1. Return to PowerShell.
2. Paste this command, then press **Enter**.

   ```powershell
   Set-Location -LiteralPath "$env:USERPROFILE\Tablewright-Assistant"
   ```

   The command opens the folder downloaded in section 2. Keep using this PowerShell window for the following commands.

3. Install the companion's required libraries.

   ```powershell
   npm.cmd ci --ignore-scripts
   ```

   Wait until the command finishes and the PowerShell prompt returns. This downloads libraries from the internet. The `.cmd` spelling avoids the Windows PowerShell script-policy error that can affect `npm`.

4. Create the settings file.

   If `.env` already exists, skip this command. It would overwrite your existing settings.

   ```powershell
   Copy-Item -LiteralPath '.env.example' -Destination '.env'
   ```

5. Generate the pairing token.

   ```powershell
   npm.cmd run token
   ```

6. Copy the long final line of output somewhere private for the next section.

**Checkpoint.** The install command finished without an error. The token command printed a long line of letters, numbers, underscores, or hyphens.

The pairing token connects Foundry to your companion. Your API key connects the companion to OpenAI. They are different secrets.

## 4. Fill in the settings

Do not share the settings file or screenshots of its real values.

1. Open the settings file from the same PowerShell window.

   ```powershell
   notepad .env
   ```

2. Replace the empty `ASSISTANT_TOKEN=` line with `ASSISTANT_TOKEN=` followed by the pairing token you copied. Keep the token on one line. Do not add quotation marks.
3. Leave `ASSISTANT_PORT=33333` unchanged.
4. Set `FOUNDRY_ORIGIN` to your local Foundry browser address. For the normal local port, the line is:

   ```dotenv
   FOUNDRY_ORIGIN=http://localhost:30000
   ```

   The address must match the browser's protocol, host, and port exactly. If Foundry uses port 30001, use 30001 here too. Do not add a world path or a trailing slash. `localhost` and `127.0.0.1` count as different addresses.

5. Open the [OpenAI API keys page](https://platform.openai.com/api-keys) in your browser. Sign in and create a key for your own project. This page requires an account, and its controls may change.
6. Paste that key immediately after `OPENAI_API_KEY=` in Notepad.
7. Set `OPENAI_MODEL=` to an exact API model ID your account can use. Use a model that supports both the Responses API and function calling. Check the [official model catalog](https://developers.openai.com/api/docs/models) and your account's available models. A ChatGPT display name is not an API model ID.
8. Leave `OPENAI_RESPONSES_URL=https://api.openai.com/v1/responses` unchanged.
9. Save the file with **Ctrl+S**, then close Notepad.

**Checkpoint.** Your file has the following six settings, with your real values replacing the three examples below.

```dotenv
ASSISTANT_TOKEN=YOUR_GENERATED_PAIRING_TOKEN
ASSISTANT_PORT=33333
FOUNDRY_ORIGIN=http://localhost:30000
OPENAI_API_KEY=YOUR_OPENAI_API_KEY
OPENAI_MODEL=YOUR_AVAILABLE_API_MODEL_ID
OPENAI_RESPONSES_URL=https://api.openai.com/v1/responses
```

Do not paste this example over a completed file. The example values are not usable credentials. Keep your API key in this file, not in Foundry or chat.

If you chose MCP, leave `OPENAI_API_KEY=` and `OPENAI_MODEL=` empty. Keep the other settings.

## 5. Put the module into Foundry

Foundry has its own data folder. It is separate from the project folder downloaded above.

1. In the same PowerShell window, build the module ZIP.

   ```powershell
   npm.cmd run package
   ```

   The output names `dist\tablewright-assistant-0.1.1.zip`.

2. Find your Foundry user data path. It is shown in Foundry's setup configuration. Use [Foundry's configuration guide](https://foundryvtt.com/article/configuration/) if you cannot locate it. Record the existing path without changing it.
3. Close Foundry before copying module files.
4. In File Explorer, open that user data folder, then open `Data`, then `modules`.

   For example, if your user data path is `D:\FoundryVTT`, the destination is `D:\FoundryVTT\Data\modules`. This is an example. Your PC may use a different path.

5. In another File Explorer window, open `%USERPROFILE%\Tablewright-Assistant\dist`.
6. Right-click `tablewright-assistant-0.1.1.zip`, choose **Extract All**, and finish the extraction.
7. Open the extracted folder. Copy the inner `tablewright-assistant` folder that contains `module.json`.
8. Paste that folder into Foundry's `Data\modules` folder. If a folder with that name already exists, stop and preserve the old installation first.

**Checkpoint.** Foundry's modules folder contains this structure.

```text
modules
  tablewright-assistant
    module.json
    lib
    scripts
    styles
```

If you have `modules\tablewright-assistant\tablewright-assistant\module.json`, you copied an extra outer folder. Move the inner folder out of the mistaken destination before continuing. Do not delete unrelated modules.

## 6. Enable the module and connect

1. Start Foundry and launch your disposable PF2e world.
2. Open that world in a browser on this PC at the address saved as `FOUNDRY_ORIGIN`. Sign in as a Game Master.
3. Open the world's module-management screen and enable **Tablewright Assistant**. Save the selection and allow a reload if Foundry requests one.
4. Return to the PowerShell window in your project folder. Start the companion.

   ```powershell
   npm.cmd start
   ```

**Checkpoint.** PowerShell displays this message and stays running.

```text
Tablewright Assistant companion listening on 127.0.0.1:33333.
```

Keep that window open. The companion stops when you close it or press **Ctrl+C**.

5. In Foundry's chat box, type `@assistant` and send it. The Tablewright Assistant window is expected to open.
6. In **WebSocket URL**, enter:

   ```text
   ws://127.0.0.1:33333/browser
   ```

   This is the companion's address. It differs from Foundry's browser address on port 30000.

7. Paste the pairing token into **Pairing token**. Use the `ASSISTANT_TOKEN` value, not the API key.
8. Click **Connect**.

**Checkpoint.** The expected status is `Connected. MCP can propose plans. Review and approve them here.`

Only one GM browser can connect at a time. `@assistant` opens the window. It does not send an AI request by itself.

## 7. Create your first NPC

The next action contacts your configured AI provider and may incur API charges.

1. Enter `1` in **Party level**.
2. Enter `4` in **Party size**.
3. Select `moderate` in **Threat**.

   The current window requires these fields even when creating one NPC or a shop.

4. Paste this into **Request**.

   ```text
   Find an installed goblin NPC. Propose one copy named Rook. Give Rook a short background as a suspicious sewer guide. Keep the source creature's statistics.
   ```

5. Click **Send to configured model**.

   If you chose MCP, send the request through your configured AI client instead. The Foundry button stays disabled when no API provider is configured.

6. Wait for a proposal under **Review and approval**. The AI may choose different goblin entries on different attempts.

**Checkpoint.** The preview identifies an installed creature and the proposed documents. A proposal alone has not created an actor.

7. Read the source creature, proposed name, background, and number of copies. If the result is wrong, click **Reject plan** and make a clearer request.
8. If the preview is correct, click **Approve creations** in Foundry.
9. Open the created actor in Foundry's actor directory.

**Checkpoint.** Inspect the actor's name, background in private notes, creature statistics, and items. Rook uses the selected source creature's statistics. The alpha does not generate an original stat block.

You have finished your first trial when the module is enabled, the companion is running, the window is connected, and your approval creates the expected actor.

## 8. Start the assistant next time

You do not need to download, install libraries, generate another token, or rebuild for each session.

1. Start Foundry and open your world in the local browser.
2. Open PowerShell.
3. Open the companion folder.

   ```powershell
   Set-Location -LiteralPath "$env:USERPROFILE\Tablewright-Assistant"
   ```

4. Start the companion.

   ```powershell
   npm.cmd start
   ```

5. In Foundry chat, send `@assistant`.
6. Enter the companion address and your existing pairing token, then click **Connect**.

To finish a session, resolve any pending or partial plans first. Stop the companion with **Ctrl+C** in PowerShell. Refreshing the Foundry browser loses pending plans and their progress records.

## If you already installed an earlier version

This walkthrough does not perform an upgrade.

1. Preserve the existing project folder, settings file, and installed module folder before replacing anything.
2. If you used **PF2e Foundry Assistant**, disable that earlier module in the test world.
3. Install Tablewright into its own folder and test it in a disposable world.
4. Reenter any extra permitted compendium pack IDs in Tablewright's settings after confirming the new installation.

The renamed module uses separate settings and import tracking. It does not migrate those values. Actors created by the earlier module stay in your world.

For another Tablewright version, do not overwrite a running installation or assume these 0.1.1 instructions are an upgrade guide.

## If something goes wrong

| What you see | What to check |
| --- | --- |
| The repository page does not load | Check your internet connection and open the public [Tablewright repository](https://github.com/tom-l-mot/tablewright-assistant). |
| PowerShell cannot find node or npm.cmd | Finish installing Node.js, then close and reopen PowerShell. |
| Set-Location cannot find the folder | Open `%USERPROFILE%\Tablewright-Assistant` in File Explorer. Confirm that `package.json` is directly inside. |
| The library install fails | Check internet access and use a local folder outside cloud sync. Keep the error text for a help request. |
| Notepad opens an empty file | Stop before saving. Confirm you are in the project folder and copied `.env.example` to `.env`. |
| The module is absent in Foundry | Check `Data\modules\tablewright-assistant\module.json`, then restart Foundry. |
| The companion fails before its listening message | Check the settings file, token, HTTP Foundry address, and model ID. Do not share the file. |
| Port 33333 is already in use | Stop an earlier companion with Ctrl+C. Do not start another copy. |
| Connect fails | Keep the companion running. Check the token and exact Foundry browser address. Disconnect another GM browser if one is paired. |
| The Send button is disabled | Connect first. For OpenAI, set both provider fields and restart the companion. A disabled button is expected for MCP-only use. |
| An AI request reports an account or model error | Check API billing, key permissions, and the model ID with your provider. A ChatGPT subscription does not provide API credits. |
| No creature is found | Try a creature name present in your installed PF2e compendiums. Other modules' packs need permission in Tablewright's settings. |
| An import stops partway | Keep the browser open. Read the error. After fixing the cause, use **Retry missing creations**. Completed imports remain. Refreshing loses the plan and prevents that retry. |

Closing only the assistant window keeps its connection and plans in the current browser session. A browser refresh or restart loses them. Inspect existing actors before proposing replacements for a lost plan.

## Ask for help

If you need help with installation, [open an issue](https://github.com/tom-l-mot/tablewright-assistant/issues/new/choose) and include these details.

1. The section and step where you stopped.
2. The exact error text, with any secrets removed.
3. Your Windows, Node.js, Foundry, PF2e, and Tablewright versions.
4. Whether you used the in-window OpenAI button or an MCP client.
5. A cropped screenshot of the failing screen, with private information hidden.

Never attach `.env`. Hide API keys, pairing tokens, private campaign names, and player information. Do not crop away the error itself.

## About the screenshots

The download section uses GitHub's official example screenshot. Screenshots of Tablewright's actual Foundry setup, connected window, preview, and completed actor are still pending a live test-world run. [The capture checklist](technical-reference.md#screenshots-to-capture-before-a-public-release) records what needs to be added.

For current evidence and remaining checks, read [verification evidence](verification.md). This guide does not certify a successful installation on your PC.
