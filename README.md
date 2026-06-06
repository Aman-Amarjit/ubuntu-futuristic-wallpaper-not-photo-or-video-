# AAJ Cybernetic HUD — Live Wallpaper System

> ⚠️ **Linux only** — Tested on **Ubuntu 22.04 / 24.04** with GNOME on Wayland. Does **not** work on Windows, macOS, or X11.

A sci-fi cyberpunk heads-up display rendered as an interactive **live desktop wallpaper** on GNOME/Wayland. Built with vanilla HTML, CSS, and JavaScript — powered by [Hidamari](https://github.com/jeffshee/hidamari) and a local Python stats server.

---

## ✨ Features

- 🎬 **Live video feed** in the center HUD panel (looping `.mp4` playback)
- 📊 **Real-time system stats** — CPU, RAM, Disk usage with animated progress bars
- 🌡️ **Hardware telemetry** — CPU temperature, battery level, uptime, hostname, kernel, local IP
- 📡 **Live news feed** — fetched and displayed with relative timestamps
- 🗂️ **Desktop file explorer** — browse and launch files directly from the wallpaper
- ⚡ **CPU/RAM scale tapes** — aviation-style left (CPU) and right (RAM) pointers
- 🎨 **4 color themes** — Cyan (Aero), Green (Matrix), Red (Cyberpunk), Amber (Solar)
- 🔊 **Web Audio synthesizer** — ambient reactor hum + UI chirp sounds
- 📺 **CRT scanline filter** — optional retro overlay
- 🌿 **Eco Power Mode** — reduces polling on battery, disables animations
- 🛸 **Clean Mode** — hides all panels for a minimal fullscreen video wallpaper
- 💤 **Auto-suspend** — pauses all JS and CSS animations when another window goes fullscreen

---

## 🖥️ System Requirements

| Requirement | Details |
|---|---|
| **OS** | Ubuntu 22.04 LTS / 24.04 LTS (or any GNOME-based distro) |
| **Display server** | **Wayland only** — does not work on X11 |
| **Desktop** | GNOME Shell (tested on GNOME 42–46) |
| **Flatpak** | Required to install Hidamari |
| **Python** | Python 3.10+ |
| **Python packages** | `psutil`, `requests` |

> 💡 To check if you're on Wayland, run: `echo $XDG_SESSION_TYPE` — it should print `wayland`.
> If it prints `x11`, log out and select **GNOME (Wayland)** at the login screen.

---

## 🛠️ Full Setup Guide

Follow these steps in order on a fresh Ubuntu install.

---

### Step 1 — Check Wayland Session

```bash
echo $XDG_SESSION_TYPE
```

Output must be `wayland`. If it says `x11`:
1. Log out of your session
2. At the login screen, click the ⚙️ gear icon (bottom-right)
3. Select **GNOME (Wayland)**
4. Log back in

---

### Step 2 — Install Flatpak

```bash
# Install flatpak if not already present
sudo apt update
sudo apt install -y flatpak

# Add Flathub repository
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

# Verify installation
flatpak --version
```

> On Ubuntu 22.04+, Flatpak is usually pre-installed. Skip `apt install` if `flatpak --version` already works.

---

### Step 3 — Install Python Dependencies

```bash
# Install required Python packages
pip3 install psutil requests

# Verify
python3 -c "import psutil, requests; print('OK')"
```

---

### Step 4 — Place the Project Folder

The project **must** be located at `~/Desktop/screen`:

```bash
# If cloning / copying manually:
cp -r /path/to/project ~/Desktop/screen

# Verify all files are present
ls ~/Desktop/screen
# Expected output:
# app-v5.js  cozy_vibe.mp4  hidamari-launcher.sh  index.html
# README.md  server.py  start-hud.sh  style-v5.css
```

---

### Step 5 — Create the systemd Stats Server Service

The stats server runs as a background systemd service so it auto-restarts on crash and survives reboots.

```bash
# Create the systemd user service directory if it doesn't exist
mkdir -p ~/.config/systemd/user

# Create the service file
cat > ~/.config/systemd/user/hud-stats-server.service << 'EOF'
[Unit]
Description=HUD Stats Server
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/python3 /home/$USER/Desktop/screen/server.py
WorkingDirectory=/home/$USER/Desktop/screen
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
EOF

# Reload systemd and enable the service
systemctl --user daemon-reload
systemctl --user enable hud-stats-server.service
systemctl --user start hud-stats-server.service

# Verify it's running
systemctl --user status hud-stats-server.service
```

You should see `Active: active (running)`. Test the API:

```bash
curl http://localhost:8000/api/stats
# Should return a JSON object with cpu, ram, disk, temp, etc.
```

---

### Step 6 — Install Hidamari & Launch the HUD

Run the all-in-one installer script:

```bash
chmod +x ~/Desktop/screen/hidamari-launcher.sh
~/Desktop/screen/hidamari-launcher.sh
```

This script will:
1. ✅ Install **Hidamari** from Flathub (no sudo needed, user scope)
2. ✅ Copy HUD files to `~/Videos/Hidamari/` (Flatpak sandbox folder)
3. ✅ Register the autostart `.desktop` entry (auto-launch on login)
4. ✅ Start the stats server and launch Hidamari

---

### Step 7 — Configure Hidamari

When the Hidamari window opens:

1. Click the **+** button (Add wallpaper)
2. Select **Web Page**
3. Enter this URL:
   ```
   http://localhost:8000/index.html
   ```
4. Click **Apply**

Your live HUD wallpaper is now active! ✅

---

### Step 8 — Enable Pause on Fullscreen (Recommended)

In Hidamari settings, enable this option to save CPU/GPU when other windows are fullscreen:

1. Open Hidamari → **Settings** (gear icon)
2. Enable **"Pause when maximized"**
3. Close settings

This works together with the HUD's built-in auto-suspend system to drop CPU to ~0% when the wallpaper is hidden.

---

### Step 9 — Verify Autostart on Login

The installer creates an autostart entry at `~/.config/autostart/hud-wallpaper.desktop`.

To verify:

```bash
cat ~/.config/autostart/hud-wallpaper.desktop
```

You should see:

```ini
[Desktop Entry]
Type=Application
Exec=/home/<your-user>/Desktop/screen/start-hud.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=HUD Live Wallpaper
Comment=Launch Stats Server and Hidamari Wallpaper
```

The wallpaper will now **auto-launch every time you log in**.

---

## 🔄 Reloading After Edits

After editing any source file, apply changes instantly:

```bash
~/Desktop/screen/start-hud.sh
```

This script:
1. Kills existing stats server and Hidamari instances
2. Syncs updated files to `~/Videos/Hidamari/`
3. Restarts the `hud-stats-server` systemd user service
4. Relaunches Hidamari

---

## 📁 File Structure

```
~/Desktop/screen/
├── index.html            # Main HUD layout (HTML structure)
├── style-v5.css          # All styling — themes, animations, layout
├── app-v5.js             # All logic — stats, clock, video, explorer, audio
├── server.py             # Python HTTP API server (port 8000)
├── cozy_vibe.mp4         # Center panel looping video
├── start-hud.sh          # Reload/restart script (run after any edits)
├── hidamari-launcher.sh  # First-time installer script
└── README.md             # This file
```

---

## 🌐 API Endpoints (`server.py` on port 8000)

| Endpoint | Description |
|---|---|
| `GET /` | Serves `index.html` |
| `GET /api/stats` | CPU, RAM, disk, temp, battery, net I/O, top processes |
| `GET /api/news` | Fetches latest tech headlines via RSS |
| `GET /api/desktop-files?path=.` | Lists files/folders on the Desktop |
| `GET /api/open?url=<url>` | Opens a URL in the default browser |
| `GET /api/open-desktop-item?path=<path>` | Launches a file/folder via `xdg-open` |

---

## ⚡ Performance & Power

| Optimization | Detail |
|---|---|
| **Auto-suspend on fullscreen** | All JS intervals stop, CSS animations freeze, video pauses → ~0% CPU |
| **Throttled RAF loop** | Compositor frame check runs at 1 Hz instead of 60 Hz |
| **No `backdrop-filter`** | Blur effects removed from panels — saves ~25% GPU |
| **No video CSS filter** | `brightness/contrast` filter removed — saves ~5% GPU |
| **Eco Mode** | On battery discharge, polling drops to 12s intervals and animations stop |
| **DOM caching** | All `getElementById` calls cached — no repeated DOM queries |

---

## ⌨️ Keyboard & Mouse Shortcuts

| Action | Trigger |
|---|---|
| Toggle Clean Mode (hide panels) | Press `Esc` or double-click desktop background |
| Toggle Clean Mode | Click the 🛸 floating button (bottom-right) |
| Toggle CRT scanline filter | Click **CRT FILTER** button |
| Trigger glitch effect | Click **INDUCT GLITCH** button |
| Toggle ambient reactor hum | Click **AMBIENT HUM** button |
| Toggle Eco Power Mode | Click **ECO POWER MODE** button |
| Switch color theme | Click any color dot in **HUD COLOR WAVELENGTH** |

---

## 🎨 Color Themes

| Theme | Colors |
|---|---|
| **Cyan** (default) | Hologram blue-cyan |
| **Green** | Matrix terminal green |
| **Red** | Cyberpunk red |
| **Amber** | Solar retro amber |

---

## 🛠️ Troubleshooting

**Wallpaper not showing / blank screen**
```bash
# Check if stats server is running
systemctl --user status hud-stats-server.service

# Restart everything
~/Desktop/screen/start-hud.sh
```

**"Wayland not detected" / no wallpaper transparency**
```bash
echo $XDG_SESSION_TYPE   # must print: wayland
# If x11 → log out → select "GNOME (Wayland)" at login screen
```

**Python packages missing**
```bash
pip3 install psutil requests
```

**Hidamari not installed / removed**
```bash
flatpak install -y --user flathub io.github.jeffshee.Hidamari
```

**Port 8000 already in use**
```bash
sudo lsof -i :8000      # find what's using the port
kill -9 <PID>           # kill it
~/Desktop/screen/start-hud.sh
```

**Stats server keeps crashing**
```bash
# View live logs
journalctl --user -u hud-stats-server.service -f
```

**Autostart not working on login**
```bash
# Re-create the autostart entry
mkdir -p ~/.config/autostart
cat > ~/.config/autostart/hud-wallpaper.desktop << 'EOF'
[Desktop Entry]
Type=Application
Exec=/home/$USER/Desktop/screen/start-hud.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=HUD Live Wallpaper
Comment=Launch Stats Server and Hidamari Wallpaper
Icon=io.github.jeffshee.Hidamari
EOF
```

---

## 📝 License

Personal project. Not licensed for redistribution.
