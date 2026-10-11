import { app, dialog, Menu, nativeImage, safeStorage, shell, Tray } from 'electron';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chatgptStore } from '../companion/chatgpt-store.mjs';
import { startCompanion } from '../companion/server.mjs';
import { safeError } from '../module/lib/validation.mjs';
import { parsePairing } from './pairing.mjs';

const checkIndex = process.argv.indexOf('--self-check');
app.setName(checkIndex === -1 ? 'Tablewright Connector' : 'Tablewright Connector Verification');
app.setAppUserModelId('com.tablewright.connector');
if (checkIndex !== -1) app.setPath('userData', process.argv[checkIndex + 1]);
const locked = app.requestSingleInstanceLock();
if (!locked) {
  if (process.argv.includes('--live-check')) { process.stderr.write('Quit Tablewright Connector before running the live account check.\n'); app.exit(1); }
  if (process.argv.includes('--lock-probe')) process.stdout.write('duplicate-blocked\n');
  app.quit();
} else {
  let companion;
  let tray;
  let pairingBusy = false;
  let exiting = false;
  let bootError = '';
  let startup = false;
  const initialLink = process.argv.find(value => value.startsWith('tablewright:'));
  let queuedLink = initialLink;
  const startupSettings = openAtLogin => ({ openAtLogin, path: process.execPath, args: ['--background'] });
  const notifyError = error => dialog.showMessageBox({ type: 'error', title: 'Tablewright Connector', message: error?.code === 'EADDRINUSE' ? 'The connector port is busy. Quit another Tablewright Connector or local companion, then start again.' : safeError(error).message });
  const showStatus = async () => {
    const state = companion?.status();
    const account = state?.chatgpt;
    const result = await dialog.showMessageBox({ type: 'info', title: 'Tablewright Connector', message: bootError || (state?.connected ? 'Foundry is connected.' : 'Ready to pair with Foundry.'), detail: `${account?.signedIn ? `ChatGPT account ${account.email || 'connected'}.\nModel ${account.model || 'not selected'}.\nPlan access ${account.accessState}.\n${account.message || ''}\n` : 'ChatGPT is signed out.\n'}Start at Windows login ${startup ? 'On' : 'Off'}.\nOpen Tablewright in Foundry and click Pair desktop. Match its code before approving.\nRight-click the tray icon to change startup, reconnect, sign out, or quit.`, buttons: ['Close', 'Continue with ChatGPT'], defaultId: 0, cancelId: 0 });
    if (result.response === 1 && companion) await companion.signIn().catch(notifyError);
  };
  const updateTray = () => {
    if (!tray) return;
    const state = companion?.status();
    const label = bootError ? 'Connector needs attention' : state?.connected ? 'Foundry connected' : 'Ready to pair';
    tray.setToolTip(`Tablewright Connector - ${label}`);
    tray.setContextMenu(Menu.buildFromTemplate([
      { label, enabled: false },
      { label: 'Show status', click: () => void showStatus() },
      { label: 'Start at Windows login', type: 'checkbox', checked: startup, click: item => { app.setLoginItemSettings(startupSettings(item.checked)); startup = app.getLoginItemSettings(startupSettings(item.checked)).openAtLogin; updateTray(); } },
      { type: 'separator' },
      { label: 'Reconnect Foundry', enabled: Boolean(companion), click: () => { companion.disconnect(); void dialog.showMessageBox({ title: 'Tablewright Connector', message: 'Return to Foundry. Click Pair desktop and Connect desktop again. Pending proposals stay in that tab.' }); } },
      { label: 'Continue with ChatGPT', enabled: Boolean(companion), click: () => void companion.signIn().catch(notifyError) },
      { label: 'Sign out of ChatGPT', enabled: Boolean(state?.chatgpt.signedIn), click: () => void companion.signOut().then(result => dialog.showMessageBox({ title: 'Tablewright Connector', message: result.revoked ? 'Signed out of ChatGPT.' : 'Signed out locally. Disconnect Tablewright in ChatGPT Settings to confirm remote revocation.' })).catch(notifyError) },
      { type: 'separator' },
      { label: 'Quit', click: () => app.quit() }
    ]));
  };
  const pair = async value => {
    if (!companion) { queuedLink = value; return; }
    if (pairingBusy) return;
    pairingBusy = true;
    try {
      const request = parsePairing(value);
      if (companion.status().connected) throw new Error('Disconnect the current Foundry session before pairing another.');
      const result = await dialog.showMessageBox({ type: 'question', title: 'Pair Foundry with Tablewright', message: `Allow ${request.origin}?`, detail: `Pairing code ${request.challenge.slice(0, 8)}\nWorld ${request.worldId}\nUser ${request.userId}\n\nApprove only if this exact site and code match the Foundry tab where you clicked Pair desktop. The world and user names are supplied by that page. Pairing permits AI requests and proposal reads. World creation still requires your approval in Foundry.`, buttons: ['Reject', 'Pair this Foundry session'], defaultId: 0, cancelId: 0, noLink: true });
      if (result.response === 1) companion.approvePairing(request);
    } catch { await dialog.showMessageBox({ type: 'error', title: 'Tablewright Connector', message: 'Pairing was rejected. Disconnect any current session, then start a fresh pairing from Foundry.' }); }
    finally { pairingBusy = false; }
  };
  app.on('second-instance', (_event, args) => {
    const link = args.find(value => value.startsWith('tablewright:'));
    if (link) void pair(link);
    else if (!args.includes('--lock-probe') && !args.includes('--live-check')) void showStatus();
  });
  app.on('open-url', (event, url) => { event.preventDefault(); void pair(url); });
  app.on('window-all-closed', () => {});
  app.on('before-quit', event => {
    if (!companion || exiting) return;
    event.preventDefault();
    exiting = true;
    void companion.close().finally(() => app.quit());
  });
  void app.whenReady().then(async () => {
  if (checkIndex !== -1) {
    const { selfCheck } = await import('./self-check.mjs');
    try { await selfCheck({ app, safeStorage, startupSettings }); }
    catch (error) { process.stderr.write(`Self-check failed: ${error.message}\n`); process.exitCode = 1; }
    app.quit();
  } else if (process.argv.includes('--live-check')) {
    const { liveCheck } = await import('./live-check.mjs');
    try { process.stdout.write(`Live account check ${JSON.stringify(await liveCheck({ store: chatgptStore(app.getPath('userData'), safeStorage) }))}\n`); }
    catch (error) { process.stderr.write(`Live check failed: ${safeError(error).message}\n`); process.exitCode = 1; }
    app.quit();
  } else {
    if (process.platform !== 'win32') throw new Error('This prerelease supports Windows only.');
    startup = app.getLoginItemSettings(startupSettings(false)).openAtLogin;
    if (app.isPackaged) app.setAsDefaultProtocolClient('tablewright');
    else app.setAsDefaultProtocolClient('tablewright', process.execPath, [fileURLToPath(new URL('../', import.meta.url))]);
    const pixels = Buffer.alloc(32 * 32 * 4);
    for (let y = 0; y < 32; y++) for (let x = 0; x < 32; x++) {
      const white = y >= 7 && y < 12 && x >= 5 && x < 27 || x >= 13 && x < 19 && y >= 7 && y < 27;
      const offset = (y * 32 + x) * 4;
      pixels.set(white ? [255, 255, 255, 255] : [126, 76, 34, 255], offset);
    }
    tray = new Tray(nativeImage.createFromBitmap(pixels, { width: 32, height: 32 }));
    tray.on('double-click', () => void showStatus());
    try {
      companion = await startCompanion({ token: randomBytes(32).toString('base64url'), port: 33333, apiKey: '', model: '', endpoint: 'https://api.openai.com/v1/responses' }, {
        credentialStore: chatgptStore(app.getPath('userData'), safeStorage), desktopPairing: true,
        openAuthorization: async url => {
          const auth = new URL(url);
          if (auth.origin !== 'https://auth.openai.com' || auth.pathname !== '/api/accounts/authorize') throw new Error('Invalid OpenAI sign-in destination.');
          await shell.openExternal(url);
        },
        onStatus: () => { updateTray(); process.stdout.write(`Tablewright state ${JSON.stringify({ connected: companion?.status().connected, accessState: companion?.status().chatgpt.accessState, model: companion?.status().chatgpt.model })}\n`); }
      });
    } catch (error) { bootError = 'The connector could not start. Check whether another connector is running or credential protection is unavailable.'; void notifyError(error); }
    updateTray();
    if (queuedLink) void pair(queuedLink);
    else if (process.argv.includes('--sign-in')) void companion?.signIn().catch(notifyError);
    else if (!process.argv.includes('--background')) void showStatus();
  }
  }).catch(error => { process.stderr.write(`Connector startup failed: ${safeError(error).message}\n`); app.exit(1); });
}
