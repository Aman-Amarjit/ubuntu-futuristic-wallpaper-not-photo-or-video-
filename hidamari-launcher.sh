#!/bin/bash

# A.G.Y. Cybernetic HUD System - Hidamari Launcher
# Installs and launches Hidamari live wallpaper manager under current user scope.

echo "============================================="
echo "   ANTIGRAVITY OS Live HUD Wallpaper Installer"
echo "============================================="
echo ""

# Check if flatpak is installed
if ! command -v flatpak &> /dev/null; then
    echo "ERROR: Flatpak is not installed on this system."
    echo "Please install Flatpak first (e.g., sudo apt install flatpak) and run this script again."
    exit 1
fi

echo "[1/3] Adding Flathub remote repository under user scope..."
flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo

echo "[2/3] Installing Hidamari Live Wallpaper application locally..."
echo "This will download and install the Web rendering background engine (~90MB)..."
flatpak install -y --user flathub io.github.jeffshee.Hidamari

if [ $? -eq 0 ]; then
    echo ""
    echo "SUCCESS: Hidamari installed successfully!"
    echo ""
    echo "[3/3] Copying HUD files to Hidamari sandbox folder (~/Videos/Hidamari)..."
    mkdir -p "$HOME/Videos/Hidamari"
    rm -f "$HOME/Videos/Hidamari/style-v4.css" "$HOME/Videos/Hidamari/app-v4.js" "$HOME/Videos/Hidamari/b6ce399ac108494e8e845e4633b81285.webm" "$HOME/Videos/Hidamari/b6ce399ac108494e8e845e4633b81285.mp4" "$HOME/Videos/Hidamari/Colorful Skincare Routine Ideas for a Cozy Vibe.mp4"
    cp -f "$HOME/Desktop/screen/index.html" "$HOME/Desktop/screen/style-v5.css" "$HOME/Desktop/screen/app-v5.js" "$HOME/Desktop/screen/cozy_vibe.mp4" "$HOME/Videos/Hidamari/"
    
    echo "Configuring automatic startup on login..."
    mkdir -p "$HOME/.config/autostart"
    cat <<EOF > "$HOME/.config/autostart/hud-wallpaper.desktop"
[Desktop Entry]
Type=Application
Exec=$HOME/Desktop/screen/start-hud.sh
Hidden=false
NoDisplay=false
X-GNOME-Autostart-enabled=true
Name=HUD Live Wallpaper
Comment=Launch Stats Server and Hidamari Wallpaper
Icon=io.github.jeffshee.Hidamari
EOF

    echo "Launching HUD (backend + frontend wallpaper)..."
    echo ""
    echo "============================================="
    echo "INSTRUCTIONS TO SET UP YOUR LIVE HUD WALLPAPER:"
    echo "1. The Hidamari application will open in a few moments."
    echo "2. Click on the '+' button or 'Add Wallpaper' option."
    echo "3. Choose the 'Web Page' or 'HTML File' option."
    echo "4. Point it to this local HTML file (required for Flatpak sandbox access):"
    echo "   $HOME/Videos/Hidamari/index.html"
    echo "5. Click 'Apply' to set it as your desktop background!"
    echo "============================================="
    echo ""
    
    # Launch HUD wallpaper via start-hud script
    "$HOME/Desktop/screen/start-hud.sh" &
else
    echo "ERROR: Hidamari installation failed. Please check your internet connection and try again."
    exit 1
fi

