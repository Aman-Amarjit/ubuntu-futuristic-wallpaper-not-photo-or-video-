import gi
gi.require_version('Gtk', '3.0')
gi.require_version('WebKit2', '4.1')
from gi.repository import Gtk, WebKit2, GLib
import cairo
import sys

# Initialize GTK
Gtk.init()

# Create offscreen window
win = Gtk.OffscreenWindow()
win.set_default_size(1920, 1080)

# Create WebKit WebView
web_view = WebKit2.WebView()
win.add(web_view)
win.show_all()

# Load URL
web_view.load_uri("http://localhost:8000/index.html")

def on_load_changed(web_view, load_event):
    if load_event == WebKit2.LoadEvent.FINISHED:
        print("Page loaded, waiting for render...")
        # Wait 3 seconds for page and video to settle
        GLib.timeout_add(3000, take_screenshot)

def take_screenshot():
    print("Drawing webview to surface...")
    surface = cairo.ImageSurface(cairo.Format.ARGB32, 1920, 1080)
    context = cairo.Context(surface)
    
    # Draw offscreen window to cairo context
    win.draw(context)
    
    # Write to file
    surface.write_to_png("offscreen_screenshot.png")
    print("Screenshot saved to offscreen_screenshot.png")
    Gtk.main_quit()
    return False

web_view.connect("load-changed", on_load_changed)

# Fallback timeout of 12 seconds
GLib.timeout_add(12000, lambda: (print("Timeout reached!"), Gtk.main_quit())[1])

Gtk.main()
