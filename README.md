# Spaces for bb

Arc-style spaces for the [bb](https://github.com/get-bb/bb) sidebar. Put your projects into spaces such as **Work** and **Personal**, then switch from the sidebar header: the thread list shows only the current space's projects and their threads.

## Install

```sh
bb plugin install git:https://github.com/tarasenko-by/bb-plugin-spaces.git@^0.3.0
```

Or find **Spaces** in bb's plugin marketplace. If another navigation plugin is active, pick **Rail with Spaces** under Settings → Appearance → Navigation.

On first run Spaces creates two empty spaces, Work and Personal, and changes nothing until you choose one. Open the space menu in the sidebar header → **Edit Spaces…** to add projects.

## Use

| Where | What |
| --- | --- |
| Sidebar header | Space button with its icon; click for the menu |
| Menu | Spaces (Ctrl + Alt + 1…9 on Windows and Linux, ⌃ ⌥ 1…9 on macOS), **All projects**, **Edit Spaces…** |
| Edit Spaces | Name, icon, order and projects of each space; drag folders in to add projects; the More setting |
| Command palette | Switch to space N, Next space, Previous space, Show all projects, Edit Spaces… |
| CLI | `bb space list`, `bb space <name\|number>`, `bb space off`, `bb space add [--space <name>] <folder>...` |

A project in no space shows in every space. bb's built-in personal project (threads without a project) is listed under **Threads** and is always visible.

## Folders to projects

Open **Edit Spaces…**, select a space and drag one or several folders from Explorer or Finder onto **Drag folders here** above its project list. Each folder becomes a bb project, checked in that space; **Save** keeps the change. A folder that is already a project is reused, not duplicated.

bb does not give plugins the full path of a dropped folder, only its name, so Spaces finds the folder on the machine: among git repositories bb discovers, next to the other dropped folders it already found, then in a bounded walk (four levels) of your home folder and drives, skipping hidden folders, `node_modules`, `AppData` and system folders. If two folders share a name, the most recently active git repository wins. If one is not found, add it with **New project** or pass its path to `bb space add`.

## How it works

- Switching calls the bundled Thread list plugin's `setPreference` RPC to update `hiddenGroups`. Spaces adds and removes only its own `project:<id>` keys, so groups you hid yourself stay hidden.
- Project groups exist only when the list is organized by project, so an active space sets `organizationMode` to `project`. **All projects** (or `bb space off`) removes Spaces' keys and restores your previous grouping.
- The navigation is bb's Rail, forked from the bundled Navigation plugin, with the space switcher as its header.

## Limits

bb has no plugin API yet for a row below the sidebar header or for hiding groups without a **More** row (requested in [get-bb/bb#7452](https://github.com/get-bb/bb/issues/7452)). Until then:

- the New thread row is inserted after bb's header row (`[data-testid="app-sidebar-top-reserve-row"]`);
- the More row is hidden with a stylesheet while it holds only other spaces' projects (turn this off in Edit Spaces).

If a bb update changes that markup, New thread falls back into the header and More shows again. Nothing is lost.

**Before uninstalling**, choose **All projects** (or run `bb space off`) so every project shows again and your grouping is restored.

## Develop

```sh
npm install
bb plugin install .
bb plugin dev        # rebuild and reload on save
npx tsc -p .         # type check
bb plugin build
```

## License

MIT
