---
name: spaces
description: List or switch the user's Arc-style sidebar spaces (Work, Personal, …) with the `bb space` command.
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

Switching writes the Thread list plugin's `hiddenGroups` (only the
`project:<id>` keys Spaces added; groups the user hid by hand are kept) and
sets `organizationMode` to `project`. Spaces themselves are edited in the app:
space button in the sidebar header → **Edit Spaces…**. Do not switch spaces
unless the user asks; it changes what they see in the sidebar.
