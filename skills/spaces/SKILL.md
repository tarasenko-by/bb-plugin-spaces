---
name: spaces
description: List or switch the user's Arc-style sidebar spaces (Work, Personal, …), or turn folders into projects in a space, with the `bb space` command.
---

# Spaces

Spaces groups bb projects into named spaces. The active space decides which
project groups the sidebar thread list shows. A project in no space shows in
every space.

- `bb space list [--json]`: list spaces; `*` marks the active one, or
  "All projects" when no space is active.
- `bb space <name|number>`: switch, e.g. `bb space Work` or `bb space 2`.
- `bb space off`: leave spaces, show all projects and restore the thread
  list's previous grouping.
- `bb space add [--space <name|number>] <folder>...`: make each folder a bb
  project (or reuse the project that already points at it) and put it in the
  space; without `--space` the active space is used, and with no active space
  the projects are only created. A folder is a path, or a bare name that
  Spaces looks up among git repos, next to folders already found, and in a
  bounded walk of the home folder and drives. Exit code 1 when a folder was
  not found or could not be added.

Switching writes the Thread list plugin's `hiddenGroups` (only the
`project:<id>` keys Spaces added; groups the user hid by hand are kept) and
sets `organizationMode` to `project`. Spaces themselves are edited in the app:
space button in the sidebar header → **Edit Spaces…**. In the app, folders
dragged from the file manager onto the drop zone under Projects in Edit Spaces
become projects the same way. Do not switch spaces
unless the user asks; it changes what they see in the sidebar.
