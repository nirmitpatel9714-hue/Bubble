# Security and privacy

## Mods have your access

A mod is trusted JavaScript running inside Bubble. It can run programs with your environment, fetch URLs and read files.
The built-in file API limits writes to the app home, but a mod can run a program to write elsewhere. That is not a security boundary.
Mods can also run programs on connected machines.

There is no permission prompt for each program or network request. Read a mod before installing it, and treat it like a shell script you would run yourself.
Layouts can load mods. Check those references too.

## What stays on disk

The default app home is `~/.config/bubble`, including on macOS and Windows (under your user home).
`XDG_CONFIG_HOME` changes the config root. `BUBBLE_APP_HOME` selects an app home directly and takes precedence.

This folder holds your settings, keys, layouts, mods, generated agent guide and API types.
It also holds mod data, shared state, window positions, this screen's focus and zoom, update notes and cached media, and telemetry while enabled.
Mods may store sensitive data here. Bubble does not encrypt this folder.
The [installed guide's file map](../defaults/AGENTS.md#the-files) explains the files.

Spaces, tabs and splits are stored in each machine's core document, not in the app home.
Terminals and their output belong to Bubble Core (`herdr-core`, upstream at
[github.com/herdrdev/herdr-core](https://github.com/herdrdev/herdr-core)).
Removing the app home does not stop the core or erase its data.

The app exposes a local control socket in its home so agents can inspect and drive the window.
Treat access to that home as access to the window and its commands.
Remote connections use SSH through the core.

## Updates and signing

This fork has no app update channel: update Bubble by rebuilding from source.
There is no downloaded app artifact to checksum or sign.
Core updates are handled separately by the core's updater, and only when
`BUBBLE_RELEASES_URL` points at a release server.

The release pipeline supports Apple Developer ID signing on macOS and Azure artifact signing on Windows when their credentials are configured.
Without them, packages can be unsigned or ad hoc signed.
Do not assume every build is notarized or signed.

## Telemetry

Telemetry is **local-only** in this fork. Bubble collects the same anonymous
counters locally when enabled, but sends nothing unless you set
`BUBBLE_TELEMETRY_URL` to your own collector.

The local report includes app and core versions, OS and architecture, bucketed
usage time and counts, known agent names, built-in layout names, mod counts,
app command names, and fixed event counters.
Custom layout names become `custom`; custom mod names are not sent.
Terminal text, prompts, file contents, folder paths and free-text names are not included.

Turn collection off in **Settings → Privacy**. That page also lets you inspect
the report.
Or set this field in your existing `settings.json`:

```json
{
  "telemetry": false
}
```

Turning it off deletes the local install ID and unsent reports.

For one run, set `DO_NOT_TRACK=1` or `BUBBLE_TELEMETRY=0`. CI environments
disable collection too.

Feedback is drafted for you to review and send, not sent silently. This fork
has no feedback endpoint: the action stays unavailable unless
`BUBBLE_FEEDBACK_URL` is set.

[Back to Bubble](../README.md)
