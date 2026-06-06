#!/bin/bash

# A.G.Y. Cybernetic HUD System - Autostart Wrapper
# Kills existing server instances and launches stats server + Hidamari wallpaper

echo "Stopping any existing stats server instances..."
pkill -f "python3.*server.py"
if command -v lsof >/dev/null 2>&1; then
    PID_8000=$(lsof -t -i:8000)
    if [ -n "$PID_8000" ]; then
        echo "Killing process $PID_8000 using port 8000..."
        kill -9 $PID_8000 2>/dev/null
        sleep 0.5
    fi
fi

echo "Stopping any existing Hidamari instances..."
pkill -f -i hidamari
pkill -f io.github.jeffshee.Hidamari
sleep 0.5

echo "Syncing HUD files to Hidamari sandbox folder..."
mkdir -p "$HOME/Videos/Hidamari"
rm -f "$HOME/Videos/Hidamari/style-v4.css" "$HOME/Videos/Hidamari/app-v4.js" "$HOME/Videos/Hidamari/b6ce399ac108494e8e845e4633b81285.webm" "$HOME/Videos/Hidamari/b6ce399ac108494e8e845e4633b81285.mp4" "$HOME/Videos/Hidamari/Colorful Skincare Routine Ideas for a Cozy Vibe.mp4"
cp -f "$HOME/Desktop/screen/index.html" "$HOME/Desktop/screen/style-v5.css" "$HOME/Desktop/screen/app-v5.js" "$HOME/Desktop/screen/cozy_vibe.mp4" "$HOME/Videos/Hidamari/"

echo "Starting HUD Stats Server via systemd..."
systemctl --user daemon-reload
systemctl --user enable hud-stats-server.service
systemctl --user restart hud-stats-server.service

# Give the server a second to bind to port 8000
sleep 1.5

echo "Starting Hidamari Live Wallpaper..."
flatpak run io.github.jeffshee.Hidamari &
