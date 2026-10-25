# vesktop-client

My own Vencord plugins, running in a normal Vesktop install.

- `plugins/` holds the plugins, one folder each, with an `index.ts` or `index.tsx`.
- `vencord/` is an untouched clone of upstream Vencord. It is not committed. `update.ps1` creates it.
- `vencord/src/userplugins` is a junction to `plugins/`, so Vencord builds them in.
- `tsconfig.json` lets the plugins use Vencord's import aliases (`@utils/*`, `@api/*`, `@webpack/common`, ...).

Needs git and Node 22 or newer. pnpm runs through corepack, so it doesn't need a separate install.

## Setup

1. Run `.\update.ps1`. It clones Vencord, links `plugins/`, installs dependencies and builds.
2. In Vesktop, open Settings > Vesktop (under Vencord Settings), scroll to Developer Options and click Open Developer Settings. Under Vencord Location, click Change and pick the `vencord\dist` folder the script printed. Quit Vesktop from the tray and start it again.
3. Turn the plugins on in Settings > Vencord > Plugins.

## Writing a plugin

1. Copy `plugins/myPlugin` to a new folder and rename it.
2. Run `corepack pnpm watch` inside `vencord/`. It rebuilds on every save.
3. Press Ctrl+R in Vesktop to reload.

Stop the watcher when you're done.

## Updates

- Vesktop updates itself as usual. The custom Vencord Location doesn't change that.
- Vencord updates through its own updater in Settings > Vencord > Updater. On this kind of build, the updater runs `git pull` and rebuilds, and it does this automatically on start when automatic updates are on. `src/userplugins` is gitignored upstream, so updates never touch `plugins/`.
- The in-app updater does not install dependencies. If an update fails to build, run `.\update.ps1`.
- Never edit files inside `vencord/`. Pulls must stay fast-forward.
