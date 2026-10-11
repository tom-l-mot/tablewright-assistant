import { MODULE_ID } from '../lib/creation.mjs';
import { PlanStore } from '../lib/plans.mjs';
import { FoundryAdapter } from './foundry-adapter.mjs';
import { BrowserConnection } from './connection.mjs';
import { createWindow } from './window.mjs';
import { assistantCommand } from './ui.mjs';
import { safeError } from '../lib/validation.mjs';

Hooks.once('init', () => {
  game.settings.register(MODULE_ID, 'additionalPacks', { name: 'Additional permitted module compendiums', hint: 'Comma-separated exact collection IDs, such as my-module.npcs. PF2e Actor/Item system packs are permitted by default. Enabling a pack does not establish rights to use its metadata with a model.', scope: 'world', config: true, type: String, default: '' });
});

Hooks.once('ready', () => {
  if (game.system.id !== 'pf2e' || !game.user.isGM) return;
  let app;
  const adapter = new FoundryAdapter(game, { Actor: CONFIG.Actor.documentClass, JournalEntry: CONFIG.JournalEntry.documentClass });
  const update = () => {
    app?.capture();
    if (app && connection.chatgpt.signedIn && !app.apiKeyChosen) { app.providerChoice = 'chatgpt'; app.authUrl = ''; }
    void app?.refresh();
  };
  const plans = new PlanStore(adapter, () => foundry.utils.randomID(16), update);
  const connection = new BrowserConnection(adapter, plans, () => {
    if (!app) return;
    app.status = connection.authError || (connection.chatgpt.signedIn ? 'ChatGPT connected. Choose a model and send a request.' : connection.connected ? 'Connected to the local companion. Continue with ChatGPT or use MCP planning.' : `Companion ${connection.state}.`);
    update();
  });
  app = createWindow(adapter, plans, connection);
  game.modules.get(MODULE_ID).api = Object.freeze({ open: () => app.show() });
  Hooks.on('chatMessage', (_chat, message) => {
    const command = assistantCommand(message, game.user.isGM);
    if (!command) return;
    void app.show(command.prompt).catch(error => ui.notifications.error(safeError(error).message));
    return false;
  });
});
