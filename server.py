import http.server
import socketserver
import json
import subprocess
import shutil
import time
import os
import urllib.parse
import platform
import socket
import urllib.request
import html
import xml.etree.ElementTree as ET
import threading

PORT = 8000
DIRECTORY = "/home/aman-amarjit/Desktop/screen"

# Global states for delta calculations
last_cpu_ticks = None
last_cpu_time = 0

last_net_bytes = None
last_net_time = 0

last_public_ip = "Loading..."
last_public_ip_time = 0

def update_public_ip_background():
    global last_public_ip, last_public_ip_time
    while True:
        # Fetch public IP via fallback urls
        for url in ["https://api.ipify.org", "https://ifconfig.me/ip"]:
            try:
                req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
                with urllib.request.urlopen(req, timeout=5.0) as response:
                    last_public_ip = response.read().decode('utf-8').strip()
                    last_public_ip_time = time.time()
                    break
            except Exception:
                pass
        # Sleep for 15 minutes before checking again
        time.sleep(900)

last_news_cache = None
last_news_time = 0

# Stats caching for subprocesses and file IO to optimize CPU usage to <1%
stats_cache = {
    "top_cpu": None,
    "top_cpu_time": 0,
    "top_mem": None,
    "top_mem_time": 0,
    "connections": None,
    "connections_time": 0,
    "cpu_temp": None,
    "cpu_temp_time": 0,
    "ram": None,
    "ram_time": 0,
    "uptime": None,
    "uptime_time": 0,
    "local_ip": None,
    "local_ip_time": 0,
}

class HUDRequestHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Only apply aggressive no-cache to API endpoints
        if self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def do_GET(self):
        parsed_url = urllib.parse.urlparse(self.path)
        clean_path = urllib.parse.unquote(parsed_url.path)
        
        # Intercept and serve video files with Range request support (206 Partial Content)
        if clean_path.endswith(".mp4"):
            filepath = os.path.join(DIRECTORY, clean_path.lstrip("/"))
            if os.path.exists(filepath):
                self.handle_static_range(filepath, "video/mp4")
                return
        elif clean_path.endswith(".webm"):
            filepath = os.path.join(DIRECTORY, clean_path.lstrip("/"))
            if os.path.exists(filepath):
                self.handle_static_range(filepath, "video/webm")
                return
                
        if parsed_url.path == "/api/stats":
            self.handle_api_stats()
        elif parsed_url.path == "/api/news":
            self.handle_api_news()
        elif parsed_url.path == "/api/open":
            self.handle_api_open(parsed_url.query)
        elif parsed_url.path == "/api/desktop-files":
            self.handle_api_desktop_files(parsed_url.query)
        elif parsed_url.path == "/api/open-desktop-item":
            self.handle_api_open_desktop_item(parsed_url.query)
        else:
            super().do_GET()

    def handle_static_range(self, filepath, mime_type):
        try:
            file_size = os.path.getsize(filepath)
            start = 0
            end = file_size - 1
            
            range_header = self.headers.get("Range")
            is_partial = False
            
            if range_header:
                try:
                    # Format: bytes=start-end
                    range_value = range_header.strip().split("=")[-1]
                    parts = range_value.split("-")
                    if parts[0]:
                        start = int(parts[0])
                    if len(parts) > 1 and parts[1]:
                        end = int(parts[1])
                    is_partial = True
                except Exception as e:
                    print(f"Error parsing range header: {e}")
            
            # Ensure bounds are valid
            if start < 0:
                start = 0
            if end >= file_size:
                end = file_size - 1
            if start > end:
                start = end
                
            chunk_size = end - start + 1
            
            if is_partial:
                self.send_response(206)
                self.send_header("Content-Range", f"bytes {start}-{end}/{file_size}")
            else:
                self.send_response(200)
                
            self.send_header("Content-Type", mime_type)
            self.send_header("Content-Length", str(chunk_size))
            self.send_header("Accept-Ranges", "bytes")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            
            with open(filepath, "rb") as f:
                f.seek(start)
                remaining = chunk_size
                buffer_size = 64 * 1024 # 64KB buffer chunks
                while remaining > 0:
                    chunk = f.read(min(buffer_size, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)
        except Exception as e:
            try:
                self.send_error(500, f"Error serving file: {str(e)}")
            except:
                pass

    def handle_api_open(self, query):
        try:
            params = urllib.parse.parse_qs(query)
            url = params.get("url", [""])[0]
            if url:
                import webbrowser
                success = webbrowser.open(url)
                self.send_json_response(200, {"success": success})
            else:
                self.send_json_response(400, {"error": "No url provided"})
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

    def handle_api_desktop_files(self, query):
        try:
            params = urllib.parse.parse_qs(query)
            rel_path = params.get("path", ["."])[0]
            
            # Clean path to prevent directory traversal
            base_dir = "/home/aman-amarjit/Desktop"
            target_path = os.path.abspath(os.path.join(base_dir, rel_path))
            
            # Enforce safety boundaries
            if target_path != base_dir and not target_path.startswith(base_dir + os.sep):
                self.send_json_response(403, {"error": "Access Denied: Path is outside Desktop."})
                return
                
            if not os.path.exists(target_path):
                self.send_json_response(404, {"error": "Path not found."})
                return
                
            if not os.path.isdir(target_path):
                self.send_json_response(400, {"error": "Target path is not a directory."})
                return
                
            # List directory
            items = []
            try:
                raw_items = os.listdir(target_path)
            except PermissionError:
                self.send_json_response(403, {"error": "Access Denied: Permission error reading directory."})
                return
                
            for name in raw_items:
                if name.startswith('.'):
                    continue # Skip hidden files
                    
                item_abs_path = os.path.join(target_path, name)
                is_dir = os.path.isdir(item_abs_path)
                mtime = os.path.getmtime(item_abs_path)
                
                size_formatted = "--"
                ext = ""
                if is_dir:
                    try:
                        # Count visible items in directory
                        sub_items = [x for x in os.listdir(item_abs_path) if not x.startswith('.')]
                        item_count = len(sub_items)
                        size_formatted = f"{item_count} items" if item_count != 1 else "1 item"
                    except:
                        size_formatted = "Folder"
                else:
                    try:
                        size_bytes = os.path.getsize(item_abs_path)
                        # Format size nicely
                        if size_bytes >= 1024 * 1024 * 1024:
                            size_formatted = f"{size_bytes / (1024**3):.1f} GB"
                        elif size_bytes >= 1024 * 1024:
                            size_formatted = f"{size_bytes / (1024**2):.1f} MB"
                        elif size_bytes >= 1024:
                            size_formatted = f"{size_bytes / 1024:.1f} KB"
                        else:
                            size_formatted = f"{size_bytes} B"
                    except:
                        size_formatted = "Unknown"
                        
                    _, file_ext = os.path.splitext(name)
                    ext = file_ext[1:].lower() if file_ext else ""
                
                items.append({
                    "name": name,
                    "is_dir": is_dir,
                    "size": size_formatted,
                    "ext": ext,
                    "mtime": mtime
                })
                
            # Sort: directories first (name), then files (name)
            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            
            # Generate breadcrumbs relative to base_dir
            norm_rel_path = os.path.relpath(target_path, base_dir)
            breadcrumbs = [{"name": "Desktop", "path": "."}]
            if norm_rel_path != ".":
                parts = norm_rel_path.split(os.sep)
                accum_path = []
                for p in parts:
                    if p:
                        accum_path.append(p)
                        breadcrumbs.append({
                            "name": p,
                            "path": "/".join(accum_path)
                        })
                        
            self.send_json_response(200, {
                "current_path": norm_rel_path,
                "breadcrumbs": breadcrumbs,
                "items": items
            })
            
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

    def handle_api_open_desktop_item(self, query):
        try:
            params = urllib.parse.parse_qs(query)
            rel_path = params.get("path", [""])[0]
            if not rel_path:
                self.send_json_response(400, {"error": "No path provided"})
                return
                
            base_dir = "/home/aman-amarjit/Desktop"
            target_path = os.path.abspath(os.path.join(base_dir, rel_path))
            
            # Safety Check
            if target_path != base_dir and not target_path.startswith(base_dir + os.sep):
                self.send_json_response(403, {"error": "Access Denied: Path is outside Desktop."})
                return
                
            if not os.path.exists(target_path):
                self.send_json_response(404, {"error": "Path not found."})
                return
                
            # Open via xdg-open on Linux
            proc = subprocess.Popen(
                ["xdg-open", target_path],
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE
            )
            self.send_json_response(200, {"success": True})
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})


    def do_POST(self):
        parsed_url = urllib.parse.urlparse(self.path)
        if parsed_url.path == "/api/cmd":
            self.handle_api_cmd()
        else:
            self.send_error(404, "Endpoint not found")

    def handle_api_stats(self):
        try:
            # 1. CPU usage %
            cpu_percent = self.get_cpu_usage()

            # 2. RAM details
            ram_percent, ram_used_gb, ram_total_gb = self.get_ram_details()

            # 3. Disk details
            total, used, free = shutil.disk_usage("/")
            disk_percent = int((used / total) * 100)
            disk_used_gb = round(used / (1024**3), 1)
            disk_total_gb = round(total / (1024**3), 1)

            # 4. Temperature
            cpu_temp = self.get_cpu_temp()

            # 5. Network speeds (Download & Upload in bytes/sec)
            down_speed, up_speed = self.get_network_speeds()

            # 6. Active network connections and VPN state
            local_ip = self.get_local_ip()
            vpn_active = self.get_vpn_status()
            public_ip = self.get_public_ip()

            # 7. CPU Model Details
            cpu_model = self.get_cpu_model()
            cpu_cores = os.cpu_count() or 4

            # 8. Top CPU and Memory Processes
            top_cpu_procs = self.get_top_cpu_processes()
            top_mem_procs = self.get_top_mem_processes()

            # 9. Battery percentage (fallback to -1 if desktop/no battery)
            battery = self.get_battery_status()

            # 10. Active network connections (for radar mapping)
            active_connections = self.get_active_connections()

            response_data = {
                "cpu": cpu_percent,
                "ram": ram_percent,
                "ram_used": ram_used_gb,
                "ram_total": ram_total_gb,
                "disk": disk_percent,
                "disk_used": disk_used_gb,
                "disk_total": disk_total_gb,
                "temp": cpu_temp,
                "uptime": self.get_uptime(),
                "hostname": platform.node(),
                "kernel": platform.release(),
                "cpu_model": f"{cpu_model} ({cpu_cores} Cores)",
                "ip": local_ip,
                "public_ip": public_ip,
                "vpn_active": vpn_active,
                "net_down": down_speed,
                "net_up": up_speed,
                "top_cpu": top_cpu_procs,
                "top_mem": top_mem_procs,
                "battery": battery,
                "connections": active_connections
            }

            self.send_json_response(200, response_data)
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

    def handle_api_news(self):
        global last_news_cache, last_news_time
        try:
            now = time.time()
            if last_news_cache is not None and (now - last_news_time) < 600:
                self.send_json_response(200, last_news_cache)
                return

            query = 'robotics OR "artificial intelligence" OR AI OR cybersecurity OR "cyber security"'
            url = f"https://news.google.com/rss/search?q={urllib.parse.quote(query)}&hl=en-US&gl=US&ceid=US:en"
            req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=3.0) as response:
                xml_data = response.read()

            root = ET.fromstring(xml_data)
            news_items = []
            for item in root.findall(".//item")[:12]:
                raw_title = item.find("title").text or ""
                link = item.find("link").text or "#"
                pub_date = item.find("pubDate").text or ""

                title = html.unescape(raw_title)
                source = "News"
                if " - " in title:
                    parts = title.rsplit(" - ", 1)
                    title = parts[0]
                    source = parts[1]

                news_items.append({
                    "title": title.strip(),
                    "link": link.strip(),
                    "source": source.strip(),
                    "date": pub_date.strip()
                })

            last_news_cache = news_items
            last_news_time = now
            self.send_json_response(200, news_items)
        except Exception as e:
            fallback_news = [
                {"title": "Global Cyber Defense Grid Initialized", "link": "#", "source": "SYS_HQ", "date": "Just now"},
                {"title": "Autonomous humanoid robots deployed in logistics centers", "link": "#", "source": "ROBO_DEV", "date": "10m ago"},
                {"title": "Next-gen AI reasoning model outperforms humans in diagnostics", "link": "#", "source": "AI_LABS", "date": "1h ago"},
                {"title": "Critical zero-day vulnerability patched in infrastructure firewall", "link": "#", "source": "CYBER_SEC", "date": "2h ago"},
                {"title": "API server failed to contact news feed (Offline Fallback)", "link": "#", "source": "ERR", "date": "Now"}
            ]
            self.send_json_response(200, fallback_news)

    def handle_api_cmd(self):
        try:
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length).decode('utf-8')
            req_body = json.loads(post_data)
            command = req_body.get("command", "").strip()

            if not command:
                self.send_json_response(400, {"error": "No command provided"})
                return

            blacklisted_tokens = ["rm ", "dd ", "mkfs", "sudo ", ":(){ :|:& };:"]
            if any(token in command for token in blacklisted_tokens):
                self.send_json_response(200, {
                    "stdout": "",
                    "stderr": "Access Denied: Dangerous command blocked.",
                    "code": 1
                })
                return

            proc = subprocess.run(
                command,
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=5
            )

            self.send_json_response(200, {
                "stdout": proc.stdout,
                "stderr": proc.stderr,
                "code": proc.returncode
            })
        except subprocess.TimeoutExpired:
            self.send_json_response(200, {
                "stdout": "",
                "stderr": "Command execution timed out (5s limit).",
                "code": 124
            })
        except Exception as e:
            self.send_json_response(500, {"error": str(e)})

    def send_json_response(self, status_code, data):
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode('utf-8'))

    def get_cpu_usage(self):
        global last_cpu_ticks, last_cpu_time
        try:
            with open("/proc/stat", "r") as f:
                line = f.readline().split()
            
            ticks = [float(x) for x in line[1:8]]
            now = time.time()
            
            prev_ticks = last_cpu_ticks
            prev_time = last_cpu_time
            
            last_cpu_ticks = ticks
            last_cpu_time = now
            
            if prev_ticks is None or (now - prev_time) < 0.2:
                return 5
                
            total_diff = sum(ticks) - sum(prev_ticks)
            idle_diff = (ticks[3] + ticks[4]) - (prev_ticks[3] + prev_ticks[4])
            
            if total_diff == 0:
                return 5
                
            return max(0, min(100, int(((total_diff - idle_diff) / total_diff) * 100)))
        except:
            return 10

    def get_ram_details(self):
        global stats_cache
        now = time.time()
        if stats_cache["ram"] is not None and (now - stats_cache["ram_time"]) < 5.0:
            return stats_cache["ram"]
        try:
            mem_info = {}
            with open("/proc/meminfo", "r") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 2:
                        key = parts[0].rstrip(":")
                        mem_info[key] = int(parts[1])

            total_kb = mem_info.get("MemTotal", 1)
            available_kb = mem_info.get("MemAvailable", mem_info.get("MemFree", 0) + mem_info.get("Buffers", 0) + mem_info.get("Cached", 0))
            
            used_kb = total_kb - available_kb
            ram_percent = int((used_kb / total_kb) * 100)
            
            used_gb = round(used_kb / (1024 * 1024), 1)
            total_gb = round(total_kb / (1024 * 1024), 1)
            
            res = (ram_percent, used_gb, total_gb)
            stats_cache["ram"] = res
            stats_cache["ram_time"] = now
            return res
        except:
            res = (25, 4.0, 16.0)
            stats_cache["ram"] = res
            stats_cache["ram_time"] = now
            return res

    def get_cpu_temp(self):
        global stats_cache
        now = time.time()
        if stats_cache["cpu_temp"] is not None and (now - stats_cache["cpu_temp_time"]) < 5.0:
            return stats_cache["cpu_temp"]
        for zone in ["thermal_zone0", "thermal_zone1", "thermal_zone2"]:
            path = f"/sys/class/thermal/{zone}/temp"
            if os.path.exists(path):
                try:
                    with open(path, "r") as f:
                        temp_raw = int(f.read().strip())
                        res = round(temp_raw / 1000.0, 1)
                        stats_cache["cpu_temp"] = res
                        stats_cache["cpu_temp_time"] = now
                        return res
                except:
                    pass
        stats_cache["cpu_temp"] = 42.0
        stats_cache["cpu_temp_time"] = now
        return 42.0

    def get_uptime(self):
        global stats_cache
        now = time.time()
        if stats_cache["uptime"] is not None and (now - stats_cache["uptime_time"]) < 10.0:
            return stats_cache["uptime"]
        try:
            with open("/proc/uptime", "r") as f:
                uptime_seconds = float(f.readline().split()[0])
            hours = int(uptime_seconds // 3600)
            minutes = int((uptime_seconds % 3600) // 60)
            res = f"{hours}h {minutes}m"
            stats_cache["uptime"] = res
            stats_cache["uptime_time"] = now
            return res
        except:
            return "N/A"

    def get_local_ip(self):
        global stats_cache
        now = time.time()
        if stats_cache["local_ip"] is not None and (now - stats_cache["local_ip_time"]) < 60.0:
            return stats_cache["local_ip"]
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            stats_cache["local_ip"] = ip
            stats_cache["local_ip_time"] = now
            return ip
        except:
            return "127.0.0.1"

    def get_public_ip(self):
        global last_public_ip
        return last_public_ip or "Offline"

    def get_network_speeds(self):
        global last_net_bytes, last_net_time
        try:
            now = time.time()
            recv = 0
            sent = 0
            with open("/proc/net/dev", "r") as f:
                lines = f.readlines()[2:] # Skip headers
                for line in lines:
                    parts = line.split()
                    if len(parts) >= 10:
                        if parts[0] != "lo:":
                            recv += int(parts[1])
                            sent += int(parts[9])
            
            prev_recv, prev_sent = (0, 0)
            prev_time = 0
            
            if last_net_bytes is not None:
                prev_recv, prev_sent = last_net_bytes
                prev_time = last_net_time
                
            last_net_bytes = (recv, sent)
            last_net_time = now

            if prev_time == 0:
                return 0, 0

            dt = now - prev_time
            if dt <= 0:
                return 0, 0
                
            down_speed = int((recv - prev_recv) / dt)
            up_speed = int((sent - prev_sent) / dt)
            
            return max(0, down_speed), max(0, up_speed)
        except:
            return 0, 0

    def get_vpn_status(self):
        try:
            # Check for tunnel interfaces
            interfaces = [x[1] for x in socket.if_nameindex()]
            vpn_patterns = ["tun", "wg", "tap", "vpn", "nord", "proton"]
            return any(any(pat in interface.lower() for pat in vpn_patterns) for interface in interfaces)
        except:
            return False

    def get_cpu_model(self):
        try:
            with open("/proc/cpuinfo", "r") as f:
                for line in f:
                    if "model name" in line:
                        model = line.split(":")[1].strip()
                        # Shorten for screen width if necessary
                        if len(model) > 30:
                            model = model[:27] + "..."
                        return model
        except:
            pass
        return platform.processor() or "Generic CPU"

    def get_top_cpu_processes(self):
        global stats_cache
        now = time.time()
        if stats_cache["top_cpu"] is not None and (now - stats_cache["top_cpu_time"]) < 8.0:
            return stats_cache["top_cpu"]
        try:
            proc = subprocess.run(
                "ps -eo pid,%cpu,comm --sort=-%cpu | head -n 6",
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            if proc.returncode != 0:
                return []
            
            lines = proc.stdout.strip().split('\n')[1:]
            processes = []
            for line in lines:
                parts = line.split()
                if len(parts) >= 3:
                    processes.append({
                        "pid": parts[0],
                        "name": " ".join(parts[2:]),
                        "val": parts[1] # holds cpu %
                    })
            stats_cache["top_cpu"] = processes
            stats_cache["top_cpu_time"] = now
            return processes
        except:
            return []

    def get_top_mem_processes(self):
        global stats_cache
        now = time.time()
        if stats_cache["top_mem"] is not None and (now - stats_cache["top_mem_time"]) < 8.0:
            return stats_cache["top_mem"]
        try:
            proc = subprocess.run(
                "ps -eo pid,%mem,comm --sort=-%mem | head -n 6",
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True
            )
            if proc.returncode != 0:
                return []
            
            lines = proc.stdout.strip().split('\n')[1:]
            processes = []
            for line in lines:
                parts = line.split()
                if len(parts) >= 3:
                    processes.append({
                        "pid": parts[0],
                        "name": " ".join(parts[2:]),
                        "val": parts[1] # holds mem %
                    })
            stats_cache["top_mem"] = processes
            stats_cache["top_mem_time"] = now
            return processes
        except:
            return []

    def get_active_connections(self):
        global stats_cache
        now = time.time()
        if stats_cache["connections"] is not None and (now - stats_cache["connections_time"]) < 8.0:
            return stats_cache["connections"]
        try:
            proc = subprocess.run(
                "ss -tun state established",
                shell=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                timeout=1
            )
            if proc.returncode != 0:
                return []
            
            lines = proc.stdout.strip().split('\n')[1:]
            connections = []
            for line in lines:
                parts = line.split()
                if len(parts) >= 6:
                    peer = parts[5]
                    # Separate IP and Port
                    if "]" in peer:  # IPv6
                        peer_ip = peer.split("]")[0] + "]"
                        peer_port = peer.split(":")[-1]
                    else:  # IPv4
                        peer_ip = peer.split(":")[0]
                        peer_port = peer.split(":")[-1]
                    
                    # Filter out loopback
                    if peer_ip.startswith("127.") or peer_ip == "::1" or peer_ip == "[::1]" or peer_ip == "*":
                        continue
                        
                    connections.append({
                        "ip": peer_ip,
                        "port": peer_port,
                        "proto": parts[0].upper()
                    })
            # Limit to top 8 connections to avoid cluttering HUD
            result = connections[:8]
            stats_cache["connections"] = result
            stats_cache["connections_time"] = now
            return result
        except:
            return []

    def get_battery_status(self):
        # Reads battery capacity on laptop
        power_path = "/sys/class/power_supply/"
        if os.path.exists(power_path):
            try:
                supplies = os.listdir(power_path)
                for supply in supplies:
                    if supply.startswith("BAT"):
                        with open(os.path.join(power_path, supply, "capacity"), "r") as f:
                            cap = int(f.read().strip())
                        with open(os.path.join(power_path, supply, "status"), "r") as f:
                            status = f.read().strip().lower()
                        return {"level": cap, "status": status}
            except:
                pass
        return None

if __name__ == "__main__":
    # Start background thread to fetch public IP
    t = threading.Thread(target=update_public_ip_background, daemon=True)
    t.start()

    # Use multi-threaded TCP server
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.ThreadingTCPServer(("", PORT), HUDRequestHandler) as httpd:
        print(f"HUD API Server serving on port {PORT}")
        httpd.serve_forever()
