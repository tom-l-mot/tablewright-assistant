# Install Tablewright Assistant on Windows

The goal is to connect Tablewright to your GM browser, ask for a proposal, and approve the result inside Foundry.

This guide describes **0.2.0-alpha.2**, an unsigned Windows x64 test build. A silent per-user installer check passed, but the human installer screens and complete Foundry workflow have not been verified. Testing in a disposable world is deferred until that world is ready. The release notes identify the reviewed commit, checksums, and download-verification results for the files offered there.

## Before you start

You need a Windows x64 computer for the GM, a browser, access to Foundry's setup screen, and GM access to a PF2e test world. The first target is Foundry 14 with PF2e 8.5.1. Keep the first trial separate from a campaign.

The connector belongs on the computer where you browse Foundry. Install only the module on the Foundry server. A remote host does not need Node.js or Tablewright Connector.

Eligible ChatGPT Plus or Pro access is the documented requirement for this open-source plan-usage flow. ChatGPT Free support is not met. No API key is required. [OpenAI quickstart](https://developers.openai.com/siwc/quickstart)

The connector supports pairing with exact HTTP or HTTPS Foundry addresses. The HTTPS path uses the browser's loopback-network permission mechanism. Chrome 154 is the current verification target. Real remote Foundry remains unverified; do not disable browser security or accept invalid certificates to make it connect.

## 1. Install the desktop app

1. Open the [v0.2.0-alpha.2 release page](https://github.com/tom-l-mot/tablewright-assistant/releases/tag/v0.2.0-alpha.2).
2. Under its assets, find **Tablewright-Connector-0.2.0-alpha.2-win-x64.exe**. If the release or file is absent, stop here. The repository's source ZIP is not the installer.
3. Download and open that file. This build is unsigned, so Windows may show an unknown-publisher warning. Check the repository and filename before deciding whether to run this test build. Do not disable Windows protection globally.
4. Follow the installer for your Windows user account.
5. Open **Tablewright Connector** from the Start menu or desktop shortcut.

The expected result is a status dialog and a Tablewright icon in the Windows notification area. The icon may be inside the hidden-icons menu near the clock. **Show status** should say **Ready to pair with Foundry.** This is an expected checkpoint, not a recorded live-install result.

You do not need to keep a terminal open. The app continues in the notification area.

## 2. Install the Foundry module

This uses Foundry's standard manifest installation. [Foundry module instructions](https://foundryvtt.com/article/modules/)

1. Open Foundry's setup screen.
2. Open **Add-on Modules**.
3. Click **Install Module**.
4. Paste this exact address into **Manifest URL**.

   ```text
   https://raw.githubusercontent.com/tom-l-mot/tablewright-assistant/codex/tablewright-desktop/module/module.json
   ```

5. Click **Install** and wait for Foundry's result.
6. Confirm **Tablewright Assistant**, version **0.2.0-alpha.2**, appears in the module list.

The manifest points to **tablewright-assistant-0.2.0-alpha.2.zip** in the same prerelease. If Foundry cannot fetch the manifest or archive, stop and check the release notes and download links. There is no claimed official-directory listing.

## 3. Enable Tablewright in your test world

1. Launch the PF2e test world and sign in as a GM.
2. Open Foundry's settings sidebar and click **Manage Modules**.
3. Check **Tablewright Assistant**.
4. Click **Save Module Settings** and allow the reload.
5. In Foundry chat, send `@assistant`.

The expected result is the **Tablewright Assistant** window. Adding a request after `@assistant` fills the Request box. It does not send an AI request automatically.

## 4. Pair the GM browser

1. Keep Tablewright Connector running on this computer.
2. In the Foundry assistant window, click **Pair desktop**.
3. If the browser asks to open Tablewright Connector, allow the app you just installed to open.
4. Compare the Foundry address and pairing code in the native **Pair Foundry with Tablewright** dialog with your Foundry tab. Reject an unexpected site or mismatched code.
5. Click **Pair this Foundry session** in that native dialog.
6. Return to Foundry and click **Connect desktop** within two minutes.
7. If the browser asks for local or loopback network access, allow it for this Foundry site.

The expected result is a connected status. Pairing approves one exact site, world, and user session. It does not approve world creations. You never need to copy an account credential or manually type a token.

Only one GM tab connects at a time. To change tabs or worlds, use **Disconnect**, then repeat pairing in the intended tab.

## 5. Connect ChatGPT

1. In Foundry, click **Continue with ChatGPT**.
2. Complete the OpenAI sign-in and authorization in the browser page opened by Tablewright Connector. If it does not open, check the connector's visible error, cancel the pending sign-in, and retry.
3. Return to Foundry.
4. Read **Plan access**. If it is disabled and you want to allow plan usage, click **Enable ChatGPT plan usage** and finish the OpenAI authorization.
5. Check the **Model** selection. GPT-5.6 Luna is selected by default only when your account lists it. If it is absent, select an available listed model yourself.
6. Leave **Model access and billing** set to **ChatGPT plan (shared limits)**.

For GPT-5.6 Luna, the window shows **Reasoning effort High. Reasoning mode Standard.** Other listed models use their model defaults; High reasoning support for those models has not been verified. A missing model never triggers a silent replacement.

The expected result is plan access ready and an enabled **Send to model** button after the required request fields are filled. Actual account access and inference are not yet verified for this build. If authorization stalls, use **Cancel sign-in**, then try again.

## 6. Request and review an NPC

Sending a request uses your ChatGPT allowance. A proposal does not create an actor.

1. Enter **Party level** `1`.
2. Enter **Party size** `4`.
3. Leave **Threat** at `moderate`. These fields are currently required for NPC and shop requests too.
4. Enter this in **Request**.

   ```text
   Find an installed goblin NPC. Propose one copy named Rook.
   Give Rook a short background as a suspicious sewer guide.
   Keep the source creature's statistics.
   ```

5. Click **Send to model**.
6. Read **Assistant response** and the plan under **Review and approval**.
7. Check the source creature, name, background, quantities, and planned documents.
8. Click **Reject plan** if the proposal is wrong.
9. Click **Approve creations** only when the preview is right.
10. Open the created actor and inspect its statistics, private background, and items.

The intended result is one renamed copy of the selected canonical NPC. Original statistics are not generated. For encounters, the result is actors and a journal roster; you place any tokens yourself.

If a creation fails, the plan stops. Completed imports remain. Keep this tab open, inspect the receipts, and use **Retry missing creations** only after reviewing the error. A changed source or conflicting document requires attention instead of a forced retry. Rejecting a partial plan keeps completed imports. Refreshing discards pending plans and receipts, so do not refresh during recovery.

## Start and stop next time

1. Open **Tablewright Connector** if it is not already running.
2. Open your GM Foundry tab and send `@assistant`.
3. Repeat **Pair desktop**, native confirmation, and **Connect desktop** for the new session.
4. Check the saved account and model status before sending a request.

To launch the connector when you sign in to Windows, right-click its notification-area icon and check **Start at Windows login**. Uncheck it to stop automatic startup. Actual startup after Windows sign-in remains a live verification item.

Closing a status dialog does not quit the app. Use the tray menu's **Quit** to stop it. Resolve partial plans before closing or refreshing the Foundry tab.

## Update or uninstall

A silent test installation passed. Interactive installation, updates, and uninstall behavior have not yet been verified.

For a future update, finish pending plans and back up the test world first. Read the release notes, quit the connector, and install the matching desktop version. In Foundry setup, use the module's **Update** control. The manifest URL tracks the development branch, not a guaranteed stable release channel. Do not update a campaign automatically from it.

To remove the desktop app:

1. Click **Sign out of ChatGPT** in Foundry or the tray menu.
2. If the app reports only a local sign-out, disconnect Tablewright in ChatGPT settings to confirm remote revocation.
3. Uncheck **Start at Windows login** in the tray menu.
4. Choose **Quit**.
5. Uninstall **Tablewright Connector** through Windows' installed-apps settings.

The installer does not request deletion of local account data on uninstall. Sign out first. Actual uninstall behavior remains unverified. Removing local files alone does not revoke a remote ChatGPT session.

Disable Tablewright through **Manage Modules** before removing the module from Foundry setup. Module removal does not undo actors or journals already created in a world.

## If something goes wrong

| What you see | What to do |
| --- | --- |
| Release, installer, or module download is missing | Stop and check the release notes or report the missing asset. Do not substitute the source ZIP for the installer. |
| Pair desktop does not open the app | Start Tablewright Connector, then retry. The installed protocol registration is still a verification item. |
| Pairing fails or expires | Use Pair desktop again, compare the new code, approve it, and connect within two minutes. |
| Another session is connected | Disconnect that tab, or choose Reconnect Foundry from the tray menu, then pair the intended tab. |
| Local-network permission was denied | Open this Foundry site's browser permissions and allow local or loopback access, then reconnect. Do not disable security globally. |
| HTTPS still cannot connect | Record the browser version and Foundry URL type. Real remote Foundry and other browsers remain unverified. |
| Connector port is busy | Quit another connector or the developer companion, then restart. |
| Account is signed in but plan access is unavailable | Read the displayed message. Plus/Pro eligibility, authorization, account limits, and listed models are separate checks. |
| Luna is missing | Choose a listed model deliberately, or wait and retry the catalog. No substitute is chosen automatically. |
| A usage limit is reached | Check ChatGPT usage settings and return later. Tablewright does not switch to API billing. |
| Older build says ChatGPT sign-in did not finish | Install 0.2.0-alpha.2. It fixes the model-catalog limit and discarded streamed replies. Keep the existing protected account; repeated consent is unnecessary when access is already ready. |
| Account session expired | Use Reconnect ChatGPT. Cancel sign-in first if an earlier attempt is still pending. |
| Partial creations are shown | Keep the Foundry tab open. Review receipts and use Retry missing creations. Do not expect rollback. |
| Nothing opens for @assistant | Confirm a PF2e world, GM login, and enabled module. Live Foundry behavior is still pending. |

## Ask for help

Include the Tablewright, Windows, browser, Foundry, and PF2e versions; the step that failed; and the visible error. Say whether Foundry is local HTTP or remote HTTPS.

Do not send account tokens, pairing links or codes, credential files, private world content, or full network logs. Real screenshots for this version are pending; none in this guide are generated stand-ins.
