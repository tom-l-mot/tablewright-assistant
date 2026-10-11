# Contributing to Tablewright

Tablewright is an open-source alpha under the MIT license. Contributions are welcome.

## Start with an issue

Search the [existing issues](https://github.com/tom-l-mot/tablewright-assistant/issues) before opening one. Use an issue to report a bug or propose a feature. For a large change, open an issue first so we can agree on the problem and scope before you spend time on a pull request.

For setup questions, use the [installation help checklist](https://github.com/tom-l-mot/tablewright-assistant/blob/main/docs/install.md#ask-for-help). Do not include `.env` files, API keys, pairing tokens, or settings files. Remove private campaign and player information from issues, pull requests, logs, and screenshots.

## Set up and check your changes

Use Node.js 22 or later. Run these commands from the repository root:

```sh
npm ci --ignore-scripts
npm test
npm run package
```

Include the checks you ran in your pull request. Add or update tests when a code change affects behavior. Update the relevant documentation when a change affects setup or use.

## Keep pull requests focused

Explain the problem and the change. Link the issue when one exists. Keep each pull request focused on one problem, and call out any behavior you could not verify.

Live Foundry behavior and paid-provider behavior remain unverified. Tests in this repository do not confirm behavior in a live Foundry world or with a paid provider.
