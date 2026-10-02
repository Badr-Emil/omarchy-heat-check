# Heat Check for Omarchy

Bar widget that answers one question: why are my fans so loud?

![Heat Check panel](preview.png)

- **Temperatures** of the processor, the graphics card and the drive
- **Why the fans are working**, in plain sentences: which program keeps how many processor cores busy, what the graphics card draws, and whether the Performance profile is on
- **Busiest programs**, measured over the last second rather than averaged since they started. Helper processes are named for what they do: a browser tab, the browser's graphics process, something inside a container
- **End**: ask one of your own programs to quit, with a second press to confirm
- **Power profile**: switch between Quiet, Balanced and Performance

The bar icon turns to the alert colour while the processor is hot.

Keyboard: `↑` `↓` (or `j` `k`) choose a program, `x` ends it (press twice), `←` `→` (or `h` `l`) change the power profile.

## Install

```bash
omarchy plugin add https://github.com/Badr-Emil/omarchy-heat-check --enable
```

Uses `jq` and `powerprofilesctl`, both shipped with Omarchy. With an NVIDIA card, `nvidia-smi` adds its temperature, load and power draw; the card is only asked while it is already running, so the panel never wakes a sleeping graphics card. Without `powerprofilesctl` the profile switch is hidden.

Fan speed is not shown: most laptops do not expose it to Linux.

## What it can and cannot end

**End** sends the ordinary request to quit (SIGTERM) to a single process of your own user. It never forces a kill and never touches processes of other users, so system services and anything inside a Docker container show a greyed-out button. Ending a browser tab's process closes that tab's page ("Aw, Snap"), not the browser.

## Settings

- `hotAt` (default 85): processor temperature in °C from which the machine counts as hot
- `refreshIntervalSec` (default 10): how often the bar icon reads the temperature while the panel is closed
- `hideWhenCool` (default false): only show the icon while the processor is hot

## Privileges

Everything runs as your user. `scripts/heat-status` reads `/proc` and `/sys` and calls `powerprofilesctl get` and, for an awake NVIDIA card, `nvidia-smi`. The panel calls `powerprofilesctl set` and `scripts/heat-end`. Nothing runs as root, nothing is written to disk, nothing is downloaded, and no service is installed.

## Development

```bash
node --test tests/
```

## Remove

```bash
omarchy plugin remove io.github.badr-emil.heat-check
```
