# Three Finger Show Desktop

GNOME Shell extension for **GNOME 50** (Wayland). Adds a touchpad gesture that GNOME does not provide by default:

| Gesture | Action |
| --- | --- |
| **3 fingers, swipe down** (on the desktop) | Show desktop (minimize all windows on the current workspace) |
| **3 fingers, swipe down** again | Restore the windows that were minimized |

**3-finger swipe up** is unchanged and still opens the overview, as in stock GNOME. The extension only observes touchpad events and never blocks GNOME’s built-in gestures.

The extension is **invisible**: no top-bar icon and no Quick Settings toggle.

**Homepage:** https://github.com/theDavidCoen/three-finger-show-desktop

## Requirements

- GNOME Shell 50 (Wayland)
- Touchpad with multi-touch gestures (libinput)

## Install from Git

```bash
git clone https://github.com/theDavidCoen/three-finger-show-desktop.git
cd three-finger-show-desktop
chmod +x install.sh
./install.sh
```

Then **log out and log back in** (recommended on Wayland), and enable:

```bash
gnome-extensions enable three-finger-show-desktop@theDavidCoen.github.io
```

Or use **Extension Manager** and turn on **Three Finger Show Desktop**.

## Install from extensions.gnome.org

Search for **Three Finger Show Desktop** on https://extensions.gnome.org/ (after review approval).

## How it works

The extension **only observes** touchpad events and never blocks GNOME’s built-in gestures. A **3-finger swipe up** still opens the overview and app grid as usual.

A **3-finger swipe down** on the desktop animates windows toward the screen edges in sync with your fingers (similar to GNOME’s overview gesture). Release before finishing to cancel; complete the swipe to show the desktop. Another downward swipe restores the windows.

## Uninstall

```bash
gnome-extensions disable three-finger-show-desktop@theDavidCoen.github.io
rm -rf ~/.local/share/gnome-shell/extensions/three-finger-show-desktop@theDavidCoen.github.io
```

Log out and back in.

## Pack for extensions.gnome.org

```bash
./pack.sh
```

Upload the generated `dist/*.zip` at https://extensions.gnome.org/upload/

Optional static check before upload:

```bash
python -m venv .venv
. .venv/bin/activate
pip install -U shexli
shexli dist/*.zip
```

## License

GPL-3.0-or-later — see [LICENSE](LICENSE).
