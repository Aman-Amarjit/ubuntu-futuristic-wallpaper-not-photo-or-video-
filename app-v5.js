// Web Audio API synthesizer for native sci-fi sound effects
let audioCtx = null;
let ambientHumNode = null;
let isHumPlaying = false;

function initAudio() {
  if (audioCtx) return;
  // Initialize context
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();
}

function playHum() {
  if (!audioCtx) initAudio();
  if (isHumPlaying) return;

  try {
    // Create a low oscillator for ambient reactor hum
    const osc = audioCtx.createOscillator();
    const filter = audioCtx.createBiquadFilter();
    const gain = audioCtx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(55, audioCtx.currentTime); // Low A (55 Hz)

    // Add a second low harmonic oscillator for depth
    const subOsc = audioCtx.createOscillator();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(110, audioCtx.currentTime);

    // Filter out high buzzing frequencies
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(120, audioCtx.currentTime);
    filter.Q.setValueAtTime(5, audioCtx.currentTime);

    // Keep it quiet in the background
    gain.gain.setValueAtTime(0.06, audioCtx.currentTime);

    // Connect nodes
    osc.connect(filter);
    subOsc.connect(filter);
    filter.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    subOsc.start();

    // Store references to stop later
    ambientHumNode = {
      stop: () => {
        osc.stop();
        subOsc.stop();
        osc.disconnect();
        subOsc.disconnect();
        filter.disconnect();
        gain.disconnect();
      }
    };
    isHumPlaying = true;
  } catch (e) {
    console.error("Failed to start ambient hum:", e);
  }
}

function stopHum() {
  if (ambientHumNode) {
    ambientHumNode.stop();
    ambientHumNode = null;
    isHumPlaying = false;
  }
  if (audioCtx && audioCtx.state === 'running') {
    audioCtx.suspend();
  }
}

// Quick click/keystroke chirp
function playChirp(type = 'click') {
  if (!audioCtx) return;
  if (audioCtx.state === 'suspended') return;

  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  const now = audioCtx.currentTime;

  if (type === 'click') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.05);
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.05);
    osc.start(now);
    osc.stop(now + 0.05);
  } else if (type === 'beep') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(880, now);
    gain.gain.setValueAtTime(0.04, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.15);
    osc.start(now);
    osc.stop(now + 0.15);
  } else if (type === 'sweep') {
    osc.type = 'sine';
    osc.frequency.setValueAtTime(200, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.4);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.4);
    osc.start(now);
    osc.stop(now + 0.4);
  } else if (type === 'glitch') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, now);
    osc.frequency.linearRampToValueAtTime(10, now + 0.25);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.setValueAtTime(0.02, now + 0.05);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.25);
    osc.start(now);
    osc.stop(now + 0.25);
  }
}

// -------------------------------------------------------------
// Interactive Clock Display
// -------------------------------------------------------------
function updateClock() {
  const timeDisplay = document.getElementById('time-display');
  const now = new Date();
  const timeStr = now.toTimeString().split(' ')[0];
  timeDisplay.textContent = timeStr;
}
let clockInterval = setInterval(updateClock, 1000);
updateClock();

// -------------------------------------------------------------
// Simulated Hardware Resource Stats & Sparkline Canvas
// -------------------------------------------------------------
let cpuVal = 34;
let ramVal = 58;
let gpuVal = 12;
let isApiOnline = false;
let userPowerOverride = false;
let lastIsDischarging = null;

// Compositor state for fullscreen/maximized obscuration check
let lastRafTime = Date.now();
let wasObscured = false;

// DOM Caching System to optimize rendering loops and minimize query overhead
const domCache = {};
function getCachedEl(id) {
  if (!domCache[id]) {
    domCache[id] = document.getElementById(id);
  }
  return domCache[id];
}

// Optimization: Check and only update DOM properties if they changed to reduce reflows/repaints
function setDOMTextIfChanged(id, value) {
  const el = getCachedEl(id);
  if (el && el.textContent !== value) {
    el.textContent = value;
  }
}

function setDOMWidthIfChanged(id, value) {
  const el = getCachedEl(id);
  if (el && el.style.width !== value) {
    el.style.width = value;
  }
}

function setDOMClassIfChanged(id, value) {
  const el = getCachedEl(id);
  if (el && el.className !== value) {
    el.className = value;
  }
}

const sparklineCanvas = document.getElementById('sparkline-canvas');
const sparklineCtx = sparklineCanvas.getContext('2d');
const netHistory = Array(60).fill(0); // Stores historical network speeds (Down+Up)
let firstLoad = true;

function resizeSparkline() {
  const rect = sparklineCanvas.getBoundingClientRect();
  sparklineCanvas.width = rect.width * window.devicePixelRatio;
  sparklineCanvas.height = rect.height * window.devicePixelRatio;
  sparklineCtx.scale(window.devicePixelRatio, window.devicePixelRatio);
}
let resizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimeout);
  resizeTimeout = setTimeout(() => {
    resizeSparkline();
    drawSparkline();
  }, 100);
});
resizeSparkline();

function formatSpeed(bytesPerSec) {
  if (bytesPerSec >= 1024 * 1024) return (bytesPerSec / (1024 * 1024)).toFixed(1) + " MB/s";
  if (bytesPerSec >= 1024) return (bytesPerSec / 1024).toFixed(1) + " KB/s";
  return bytesPerSec + " B/s";
}

async function updateResources() {
  try {
    const res = await fetch('http://localhost:8000/api/stats');
    if (!res.ok) throw new Error('API server down');
    const data = await res.json();
    
    isApiOnline = true;
    cpuVal = data.cpu;
    ramVal = data.ram;
    gpuVal = data.disk; // Use disk storage for GPU meter fallback

    // Update DOM readouts
    setDOMTextIfChanged('cpu-val', cpuVal.toString().padStart(2, '0') + '%');
    setDOMTextIfChanged('ram-val', ramVal.toString().padStart(2, '0') + '%');
    setDOMTextIfChanged('gpu-val', gpuVal.toString().padStart(2, '0') + '%');

    // Update progress bar widths
    setDOMWidthIfChanged('cpu-bar', cpuVal + '%');
    setDOMWidthIfChanged('ram-bar', ramVal + '%');
    setDOMWidthIfChanged('gpu-bar', gpuVal + '%');

    // Update used/total labels
    setDOMTextIfChanged('ram-sub', `Used: ${data.ram_used} GB / ${data.ram_total} GB`);
    setDOMTextIfChanged('gpu-sub', `Used: ${data.disk_used} GB / ${data.disk_total} GB`);

    // Update system details
    setDOMTextIfChanged('sys-hostname', data.hostname);
    setDOMTextIfChanged('sys-kernel', data.kernel);
    setDOMTextIfChanged('sys-ip', data.ip);

    // Update bandwidth stats
    setDOMTextIfChanged('net-flux-label', `BANDWIDTH: D: ${formatSpeed(data.net_down)} | U: ${formatSpeed(data.net_up)}`);

    // Update numeric HUD overlays on central HUD
    setDOMTextIfChanged('hud-cpu-avg', cpuVal + '%');
    setDOMTextIfChanged('hud-mem-avg', ramVal + '%');
    
    // Parse core counts to pure numbers
    const coreText = data.cpu_model.split('(').pop().replace(')', '').trim();
    const coreCount = parseInt(coreText);
    setDOMTextIfChanged('hud-cores', isNaN(coreCount) ? coreText : coreCount);

    // Temperature readout & alerting (calibrated to flag red only at critical temperatures > 85°C)
    const tempVal = parseFloat(data.temp);
    setDOMTextIfChanged('hud-temp', data.temp + " °C");
    if (tempVal >= 85) {
      setDOMClassIfChanged('hud-temp', 'calc-val text-alert'); // Red alert (overheat)
    } else if (tempVal >= 75) {
      setDOMClassIfChanged('hud-temp', 'calc-val text-warn'); // Amber warning
    } else {
      setDOMClassIfChanged('hud-temp', 'calc-val');
    }

    setDOMTextIfChanged('hud-uptime', data.uptime);
    
    // Update battery readout & auto-engage Eco Mode on discharge
    if (data.battery) {
      const batLevel = data.battery.level;
      const batStatus = data.battery.status;
      const batStatusUpper = batStatus.toUpperCase();
      setDOMTextIfChanged('hud-battery', `${batLevel}% [${batStatusUpper}]`);

      const isDischarging = batStatus.toLowerCase().includes('disch') || batStatus.toLowerCase().includes('bat');
      
      // Battery warning colors
      if (isDischarging) {
        if (batLevel <= 25) {
          setDOMClassIfChanged('hud-battery', 'calc-val text-alert'); // Red Alert
        } else if (batLevel <= 40) {
          setDOMClassIfChanged('hud-battery', 'calc-val text-warn'); // Amber warning
        } else {
          setDOMClassIfChanged('hud-battery', 'calc-val');
        }
      } else {
        if (batStatus.toLowerCase().includes('full')) {
          setDOMClassIfChanged('hud-battery', 'calc-val text-success'); // Green Full
        } else {
          setDOMClassIfChanged('hud-battery', 'calc-val'); // Charging or normal
        }
      }

      const hasEcoClass = document.body.classList.contains('eco-mode');

      if (lastIsDischarging !== null && lastIsDischarging !== isDischarging) {
        userPowerOverride = false;
      }
      lastIsDischarging = isDischarging;

      if (!userPowerOverride) {
        if (isDischarging && !hasEcoClass) {
          toggleEcoMode(true, true);
          addStatusLine("BATTERY RUNNING: AUTO-ENGAGING ECO POWER MODE", "warn");
        } else if (!isDischarging && hasEcoClass) {
          toggleEcoMode(false, true);
          addStatusLine("CHARGER CONNECTED: RETURNING TO PERFORMANCE MODE", "success");
        }
      }
    } else {
      setDOMTextIfChanged('hud-battery', 'N/A');
      setDOMClassIfChanged('hud-battery', 'calc-val');
      const batBarEl = getCachedEl('hud-battery-bar');
      if (batBarEl && batBarEl.style.width !== '0%') {
        batBarEl.style.width = '0%';
      }
    }

    // Update VPN indicator
    setDOMTextIfChanged('hud-vpn', data.vpn_active ? 'ACTIVE' : 'INACTIVE');
    setDOMClassIfChanged('hud-vpn', data.vpn_active ? 'calc-val text-success' : 'calc-val text-alert');

    // Add logging lines on first run or on change
    if (firstLoad) {
      addStatusLine(`SYSTEM INITIALIZED: Host ${data.hostname} online`, "success");
      addStatusLine(`PROCESSOR: ${data.cpu_model.split('(')[0].trim()}`, "info");
      addStatusLine(`GATEWAY IDENTIFIED: Local IP ${data.ip}`, "info");
      addStatusLine(`PUBLIC IP ENTRANCE: ${data.public_ip}`, "info");
      if (data.vpn_active) addStatusLine("SECURE VPN TUNNEL INTERFACE ACTIVE", "success");
      firstLoad = false;
    }

    // Update Top CPU processes table
    const cpuTbody = getCachedEl('cpu-processes-tbody');
    cpuTbody.innerHTML = '';
    if (data.top_cpu && data.top_cpu.length > 0) {
      data.top_cpu.forEach(p => {
        const row = document.createElement('tr');
        row.className = 'target-row';
        row.innerHTML = `
          <td>${p.pid}</td>
          <td>${p.name}</td>
          <td style="color: var(--color-accent); font-weight: bold;">${p.val}%</td>
        `;
        cpuTbody.appendChild(row);
      });
    } else {
      cpuTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No active CPU processes</td></tr>';
    }

    // Update Top Memory processes table
    const memTbody = getCachedEl('mem-processes-tbody');
    memTbody.innerHTML = '';
    if (data.top_mem && data.top_mem.length > 0) {
      data.top_mem.forEach(p => {
        const row = document.createElement('tr');
        row.className = 'target-row';
        row.innerHTML = `
          <td>${p.pid}</td>
          <td>${p.name}</td>
          <td style="color: var(--color-accent); font-weight: bold;">${p.val}%</td>
        `;
        memTbody.appendChild(row);
      });
    } else {
      memTbody.innerHTML = '<tr><td colspan="3" style="text-align: center;">No active MEM processes</td></tr>';
    }

    // Append new net history node
    netHistory.push(data.net_down + data.net_up);
    netHistory.shift();

    drawSparkline();
    updateScales();
  } catch (error) {
    isApiOnline = false;
    // Fallback simulation mode
    cpuVal = Math.min(100, Math.max(5, cpuVal + Math.floor(Math.random() * 15) - 7));
    ramVal = Math.min(100, Math.max(30, ramVal + Math.floor(Math.random() * 3) - 1));
    gpuVal = Math.min(100, Math.max(0, gpuVal + Math.floor(Math.random() * 9) - 4));

    setDOMTextIfChanged('cpu-val', cpuVal.toString().padStart(2, '0') + '%');
    setDOMTextIfChanged('ram-val', ramVal.toString().padStart(2, '0') + '%');
    setDOMTextIfChanged('gpu-val', gpuVal.toString().padStart(2, '0') + '%');

    setDOMWidthIfChanged('cpu-bar', cpuVal + '%');
    setDOMWidthIfChanged('ram-bar', ramVal + '%');
    setDOMWidthIfChanged('gpu-bar', gpuVal + '%');

    setDOMTextIfChanged('ram-sub', 'Used: -- GB / -- GB');
    setDOMTextIfChanged('gpu-sub', 'Used: -- GB / -- GB');

    setDOMTextIfChanged('sys-hostname', '--');
    setDOMTextIfChanged('sys-kernel', '--');
    setDOMTextIfChanged('sys-ip', '--');

    setDOMTextIfChanged('hud-cpu-avg', cpuVal + '%');
    setDOMTextIfChanged('hud-mem-avg', ramVal + '%');
    setDOMTextIfChanged('hud-cores', '--');
    setDOMTextIfChanged('hud-temp', '-- °C');
    setDOMTextIfChanged('hud-uptime', '--');
    setDOMTextIfChanged('hud-battery', 'N/A');

    setDOMTextIfChanged('hud-vpn', 'INACTIVE');
    setDOMClassIfChanged('hud-vpn', 'calc-val text-alert');

    netHistory.push(0);
    netHistory.shift();

    drawSparkline();
    updateScales();
  }
}

function drawSparkline() {
  const width = sparklineCanvas.width / window.devicePixelRatio;
  const height = sparklineCanvas.height / window.devicePixelRatio;
  
  sparklineCtx.clearRect(0, 0, width, height);

  const computedStyle = getComputedStyle(document.body);
  const strokeColor = computedStyle.getPropertyValue('--color-primary').trim();
  const glowColor = computedStyle.getPropertyValue('--color-primary-glow').trim();

  // Draw grid helper lines
  sparklineCtx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  sparklineCtx.lineWidth = 1;
  for (let i = 0; i < height; i += 15) {
    sparklineCtx.beginPath();
    sparklineCtx.moveTo(0, i);
    sparklineCtx.lineTo(width, i);
    sparklineCtx.stroke();
  }

  // Draw sparkline curve based on network history
  sparklineCtx.beginPath();
  const step = width / (netHistory.length - 1);
  // Auto-scale y scale based on maximum historical net speed (min 10KB/s)
  const maxVal = Math.max(...netHistory, 10240); 
  
  for (let i = 0; i < netHistory.length; i++) {
    const x = i * step;
    const y = height - (netHistory[i] / maxVal * (height - 10)) - 5;
    if (i === 0) {
      sparklineCtx.moveTo(x, y);
    } else {
      sparklineCtx.lineTo(x, y);
    }
  }

  // Stroke line (glow shadow disabled for 1% CPU utilization optimization)
  sparklineCtx.strokeStyle = strokeColor;
  sparklineCtx.lineWidth = 1.5;
  sparklineCtx.stroke();

  // Area fill below chart
  sparklineCtx.lineTo(width, height);
  sparklineCtx.lineTo(0, height);
  sparklineCtx.closePath();
  sparklineCtx.fillStyle = glowColor;
  sparklineCtx.fill();
}

let resourceUpdateTimeout = null;

async function scheduleNextResourceUpdate() {
  if (resourceUpdateTimeout) {
    clearTimeout(resourceUpdateTimeout);
    resourceUpdateTimeout = null;
  }

  const isObscured = (Date.now() - lastRafTime) > 2000;
  if (document.hidden || isObscured) {
    return; // Pause updates completely when window is hidden or obscured
  }

  const isEco = document.body.classList.contains('eco-mode');
  const delay = isEco ? 12000 : 4000;

  resourceUpdateTimeout = setTimeout(async () => {
    await updateResources();
    scheduleNextResourceUpdate();
  }, delay);
}

// Centralized Video State Manager
function updateVideoState() {
  const video = document.querySelector('.hud-video');
  if (!video) return;

  const isEco = document.body.classList.contains('eco-mode');
  const isHidden = document.hidden;
  const isObscured = (Date.now() - lastRafTime) > 2000;
  const shouldPause = isEco || isHidden || isObscured;

  if (shouldPause) {
    // Freeze all CSS animations to drop CPU to near-zero when covered
    document.body.classList.add('window-obscured');
    if (!video.paused) {
      video.pause();
      if (isObscured && !isHidden && !isEco) {
        wasObscured = true;
        addStatusLine("WALLPAPER COVERED: PAUSING DECODER", "info");
      }
    }
  } else {
    // Resume CSS animations
    document.body.classList.remove('window-obscured');
    if (video.paused) {
      // Only log the resume message when we're actually resuming from pause
      video.play().catch(err => {
        console.warn("Failed to play primary video:", err);
      });
      addStatusLine("VIDEO DECODER ACTIVE: RESUMED", "success");
    }
  }
}

// -------------------------------------------------------------
// Global Suspend / Resume System
// Halts ALL JS activity when wallpaper is hidden (fullscreen window
// on top). Restarts everything cleanly when wallpaper is revealed.
// -------------------------------------------------------------
let isSuspended = false;
let rafLoopHandle = null;

function suspendAllJS() {
  if (isSuspended) return;
  isSuspended = true;

  // Stop the clock interval (DOM write every second)
  clearInterval(clockInterval);
  clockInterval = null;

  // Stop resource polling
  if (resourceUpdateTimeout) {
    clearTimeout(resourceUpdateTimeout);
    resourceUpdateTimeout = null;
  }

  // Freeze all CSS animations & remove backdrop-filter cost
  document.body.classList.add('window-obscured');

  // Pause video decoder
  const video = document.querySelector('.hud-video');
  if (video && !video.paused) {
    video.pause();
  }
}

function resumeAllJS() {
  if (!isSuspended) return;
  isSuspended = false;

  // Restart clock
  if (!clockInterval) {
    updateClock();
    clockInterval = setInterval(updateClock, 1000);
  }

  // Resume CSS animations
  document.body.classList.remove('window-obscured');

  // Resume video
  const video = document.querySelector('.hud-video');
  if (video && video.paused) {
    video.play().catch(err => console.warn('Resume play failed:', err));
    addStatusLine('WALLPAPER UNCOVERED: RESUMING HUD', 'success');
  }

  // Restart resource polling
  updateResources();
  scheduleNextResourceUpdate();
}

// Start scheduling
scheduleNextResourceUpdate();

// -------------------------------------------------------------
// Live Log Status Feed System
// -------------------------------------------------------------
const logFeed = document.getElementById('feed-log');

function addStatusLine(text, type = "info") {
  const line = document.createElement('div');
  line.className = `feed-line ${type}`;
  const timestamp = new Date().toLocaleTimeString().split(' ')[0];
  line.textContent = `[${timestamp}] ${text}`;
  
  logFeed.appendChild(line);
  
  // Keep scrolling to the bottom
  logFeed.scrollTop = logFeed.scrollHeight;

  // Cap logs count
  while (logFeed.children.length > 25) {
    logFeed.removeChild(logFeed.firstChild);
  }
}

// -------------------------------------------------------------
// Live News Feed System
// -------------------------------------------------------------
const newsBox = document.getElementById('news-box');

async function updateNewsFeed() {
  try {
    const res = await fetch('http://localhost:8000/api/news');
    if (!res.ok) throw new Error('API server down');
    const newsData = await res.json();
    renderNews(newsData);
  } catch (error) {
    console.error("Failed to fetch news:", error);
    // Offline simulation fallback
    const offlineNews = [
      { title: "Global Cyber Defense Grid Initialized", link: "#", source: "SYS_HQ", date: "Just now" },
      { title: "Autonomous humanoid robots deployed in logistics centers", link: "#", source: "ROBO_DEV", date: "10m ago" },
      { title: "Next-gen AI reasoning model outperforms humans in diagnostics", link: "#", source: "AI_LABS", date: "1h ago" },
      { title: "Critical zero-day vulnerability patched in infrastructure firewall", link: "#", source: "CYBER_SEC", date: "2h ago" },
      { title: "Matrix News Link Interface Offline (CORS or server error)", link: "#", source: "ERR", date: "Now" }
    ];
    renderNews(offlineNews);
  }
}

function renderNews(newsItems) {
  if (!newsBox) return;
  newsBox.innerHTML = '';

  if (!newsItems || newsItems.length === 0) {
    newsBox.innerHTML = '<div class="news-empty">NO NEWS DATA SECURED</div>';
    return;
  }

  newsItems.forEach((item, index) => {
    const idxStr = (index + 1).toString().padStart(2, '0');
    const newsEntry = document.createElement('div');
    newsEntry.className = 'news-item';
    
    // Create elements
    const marker = document.createElement('span');
    marker.className = 'news-marker';
    marker.textContent = `>> ${idxStr}`;

    const link = document.createElement('a');
    link.className = 'news-title-link';
    if (item.link && item.link !== '#') {
      link.href = item.link;
      link.target = '_blank';
      link.addEventListener('click', (e) => {
        e.preventDefault();
        fetch(`http://localhost:8000/api/open?url=${encodeURIComponent(item.link)}`)
          .then(res => {
            if (!res.ok) throw new Error('API server returned error status');
            return res.json();
          })
          .then(data => {
            if (!data.success) throw new Error('API server failed to open link');
          })
          .catch(err => {
            console.error("Failed to open link via API, falling back to window.open:", err);
            window.open(item.link, '_blank');
          });
      });
    } else {
      link.style.cursor = 'default';
      link.style.pointerEvents = 'none';
    }
    link.textContent = item.title;

    const meta = document.createElement('div');
    meta.className = 'news-meta';
    
    const source = document.createElement('span');
    source.className = 'news-source';
    source.textContent = `[${item.source}]`;

    const date = document.createElement('span');
    date.className = 'news-date';
    date.textContent = formatNewsDate(item.date);

    meta.appendChild(source);
    meta.appendChild(date);

    newsEntry.appendChild(marker);
    newsEntry.appendChild(link);
    newsEntry.appendChild(meta);

    newsBox.appendChild(newsEntry);
  });
}

function formatNewsDate(dateStr) {
  if (!dateStr) return '';
  if (dateStr.includes('ago') || dateStr.includes('now') || dateStr.includes('Now')) {
    return dateStr;
  }
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const now = new Date();
    const diffMs = now - d;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch (e) {
    return dateStr;
  }
}

// Initial load
updateNewsFeed();

// Poll every 5 minutes
setInterval(updateNewsFeed, 300000);

// -------------------------------------------------------------
// Desktop File Explorer Controller
// -------------------------------------------------------------
let currentRelativePath = '.';
let selectedItem = null;
let filesCache = [];

const explorerBody = document.getElementById('explorer-body');
const explorerBreadcrumbs = document.getElementById('explorer-breadcrumbs');
const explorerSearchInput = document.getElementById('explorer-search-input');
const explorerBackBtn = document.getElementById('explorer-back-btn');
const explorerRefreshBtn = document.getElementById('explorer-refresh-btn');
const explorerOpenOsBtn = document.getElementById('explorer-open-os-btn');
const explorerStatus = document.getElementById('explorer-status');
const explorerSelectionDetail = document.getElementById('explorer-selection-detail');

// Fetch files from the desktop API
async function loadDesktopFiles(relPath = '.') {
  currentRelativePath = relPath;
  
  // Set UP button state (disabled if at Desktop root)
  if (explorerBackBtn) {
    explorerBackBtn.disabled = (relPath === '.');
  }

  if (explorerBody) {
    explorerBody.innerHTML = '<div class="explorer-loading">SCANNING DESKTOP STORAGE MATRIX...</div>';
  }

  try {
    const response = await fetch(`http://localhost:8000/api/desktop-files?path=${encodeURIComponent(relPath)}`);
    if (!response.ok) {
      throw new Error(`Server returned status ${response.status}`);
    }
    const data = await response.json();
    
    filesCache = data.items;
    selectedItem = null;
    if (explorerSelectionDetail) {
      explorerSelectionDetail.textContent = 'SELECTED: NONE';
    }

    renderBreadcrumbs(data.breadcrumbs);
    renderFilesGrid(data.items);
  } catch (error) {
    console.error("Failed to load desktop files:", error);
    if (explorerBody) {
      explorerBody.innerHTML = `<div class="explorer-error">SCAN FAILED: ${error.message.toUpperCase()}</div>`;
    }
    if (explorerStatus) {
      explorerStatus.textContent = 'ERROR IDENTIFIED';
    }
  }
}

// Render path navigation breadcrumbs
function renderBreadcrumbs(breadcrumbs) {
  if (!explorerBreadcrumbs) return;
  explorerBreadcrumbs.innerHTML = '';

  breadcrumbs.forEach((crumb, index) => {
    const crumbSpan = document.createElement('span');
    crumbSpan.className = 'crumb-item';
    crumbSpan.textContent = crumb.name.toUpperCase();

    if (index === breadcrumbs.length - 1) {
      crumbSpan.classList.add('active');
    } else {
      crumbSpan.addEventListener('click', () => {
        playChirp('click');
        loadDesktopFiles(crumb.path);
      });
    }

    explorerBreadcrumbs.appendChild(crumbSpan);

    // Add separator
    if (index < breadcrumbs.length - 1) {
      const separator = document.createElement('span');
      separator.className = 'crumb-separator';
      separator.textContent = ' / ';
      explorerBreadcrumbs.appendChild(separator);
    }
  });
}

// Map file types to beautiful icons
function getNodeIcon(isDir, ext) {
  if (isDir) return '📁';
  
  const archives = ['zip', 'tar', 'gz', 'rar', '7z', 'bz2'];
  const media = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'mp4', 'mp3', 'wav', 'pdf'];
  const code = ['js', 'ts', 'py', 'sh', 'bash', 'html', 'css', 'json', 'yml', 'yaml', 'c', 'cpp', 'rs', 'go'];
  
  if (archives.includes(ext)) return '📦';
  if (media.includes(ext)) return '🖼️';
  if (code.includes(ext)) return '⚙️';
  return '📄';
}

// Render nodes in a clean, scrollable grid view
function renderFilesGrid(items, filterText = '') {
  if (!explorerBody) return;
  explorerBody.innerHTML = '';

  const filteredItems = items.filter(item => 
    item.name.toLowerCase().includes(filterText.toLowerCase())
  );

  if (filteredItems.length === 0) {
    explorerBody.innerHTML = '<div class="explorer-empty">NO NODES RESOLVED</div>';
    if (explorerStatus) {
      explorerStatus.textContent = '0 NODES MATCHED';
    }
    return;
  }

  filteredItems.forEach(item => {
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'explorer-node';
    if (selectedItem === item.name) {
      nodeDiv.classList.add('selected');
    }

    // Add type classifications for sleek file type colors
    if (item.is_dir) {
      nodeDiv.classList.add('node-dir');
    } else {
      const archives = ['zip', 'tar', 'gz', 'rar', '7z', 'bz2'];
      const media = ['png', 'jpg', 'jpeg', 'gif', 'svg', 'mp4', 'mp3', 'wav', 'pdf'];
      const code = ['js', 'ts', 'py', 'sh', 'bash', 'html', 'css', 'json', 'yml', 'yaml', 'c', 'cpp', 'rs', 'go'];
      
      if (archives.includes(item.ext)) {
        nodeDiv.classList.add('node-archive');
      } else if (media.includes(item.ext)) {
        nodeDiv.classList.add('node-media');
      } else if (code.includes(item.ext)) {
        nodeDiv.classList.add('node-code');
      } else {
        nodeDiv.classList.add('node-file');
      }
    }

    const typeLabel = item.is_dir ? 'DIR' : (item.ext || 'FILE');
    const icon = getNodeIcon(item.is_dir, item.ext);

    nodeDiv.innerHTML = `
      <div class="node-icon-wrapper">
        <span class="node-icon">${icon}</span>
        <span class="node-type-badge">${typeLabel}</span>
      </div>
      <div class="node-name" title="${item.name}">${item.name}</div>
      <div class="node-info-row">
        <span class="node-size">${item.size}</span>
      </div>
    `;

    // Click selection
    nodeDiv.addEventListener('click', (e) => {
      e.stopPropagation();
      playChirp('click');
      
      // Clear previous selection
      document.querySelectorAll('.explorer-node').forEach(el => el.classList.remove('selected'));
      
      selectedItem = item.name;
      nodeDiv.classList.add('selected');
      
      if (explorerSelectionDetail) {
        explorerSelectionDetail.textContent = `SELECTED: ${item.name.toUpperCase()}`;
        explorerSelectionDetail.title = item.name;
      }
    });

    // Double click to enter folder or launch file
    nodeDiv.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (item.is_dir) {
        playChirp('sweep');
        const nextPath = currentRelativePath === '.' ? item.name : `${currentRelativePath}/${item.name}`;
        loadDesktopFiles(nextPath);
      } else {
        playChirp('beep');
        launchDesktopFile(item.name);
      }
    });

    explorerBody.appendChild(nodeDiv);
  });

  if (explorerStatus) {
    const dirCount = filteredItems.filter(i => i.is_dir).length;
    const fileCount = filteredItems.length - dirCount;
    explorerStatus.textContent = `${dirCount} DIRS | ${fileCount} FILES`;
  }
}

// Request the backend to execute/open a file or folder
async function launchDesktopFile(filename) {
  const filePath = currentRelativePath === '.' ? filename : `${currentRelativePath}/${filename}`;
  openRelativePath(filePath, filename);
}

// Low-level relative path opening helper
async function openRelativePath(filePath, displayName) {
  const label = displayName || filePath;
  addStatusLine(`LAUNCHING NODE: ${label.toUpperCase()}...`, "warn");

  try {
    const response = await fetch(`http://localhost:8000/api/open-desktop-item?path=${encodeURIComponent(filePath)}`);
    if (!response.ok) {
      throw new Error(`Open failed with status ${response.status}`);
    }
    addStatusLine(`NODE LAUNCHED: ${label.toUpperCase()}`, "success");
  } catch (err) {
    console.error("Failed to launch file:", err);
    addStatusLine(`LAUNCH FAILED: ${err.message.toUpperCase()}`, "alert");
  }
}

// Setup Event Listeners for Explorer
document.addEventListener('DOMContentLoaded', () => {
  if (explorerBackBtn) {
    explorerBackBtn.addEventListener('click', () => {
      if (currentRelativePath === '.' || currentRelativePath === '') return;
      playChirp('sweep');
      
      // Go up one level
      const parts = currentRelativePath.split('/');
      parts.pop();
      const parentPath = parts.join('/') || '.';
      loadDesktopFiles(parentPath);
    });
  }

  if (explorerRefreshBtn) {
    explorerRefreshBtn.addEventListener('click', () => {
      playChirp('sweep');
      loadDesktopFiles(currentRelativePath);
    });
  }

  if (explorerOpenOsBtn) {
    explorerOpenOsBtn.addEventListener('click', () => {
      playChirp('beep');
      openRelativePath(currentRelativePath, currentRelativePath === '.' ? 'DESKTOP' : currentRelativePath);
    });
  }

  if (explorerSearchInput) {
    explorerSearchInput.addEventListener('input', (e) => {
      renderFilesGrid(filesCache, e.target.value);
    });
  }

  // Load initial Desktop files
  loadDesktopFiles('.');
});

// -------------------------------------------------------------
// Interactive Controls & Actions
// -------------------------------------------------------------

// Theme switching function
function changeTheme(themeName) {
  // Update body class
  document.body.className = '';
  document.body.classList.add(themeName);

  // Update theme buttons visual state
  document.querySelectorAll('.theme-btn').forEach(btn => {
    if (btn.getAttribute('data-theme') === themeName) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });

  // Re-draw sparkline graph with new color
  drawSparkline();
}

// Color picker buttons
document.querySelectorAll('.theme-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const selectedTheme = btn.getAttribute('data-theme');
    changeTheme(selectedTheme);
    playChirp('click');
  });
});

// Sound Toggle (Ambient Hum)
const soundBtn = document.getElementById('sound-toggle-btn');
soundBtn.addEventListener('click', () => {
  initAudio();
  if (isHumPlaying) {
    stopHum();
    soundBtn.classList.remove('active');
    soundBtn.querySelector('.btn-icon').textContent = "🔇";
  } else {
    // Resume context if suspended (browser security)
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    playHum();
    soundBtn.classList.add('active');
    soundBtn.querySelector('.btn-icon').textContent = "🔊";
    playChirp('beep');
  }
});

// Scan trigger button
const scanBtn = document.getElementById('scan-trigger-btn');
scanBtn.addEventListener('click', () => {
  playChirp('sweep');
  addStatusLine("NEWS MATRIX SYNC SEQUENCES INITIATED", "warn");
  
  // Visual flare in news box
  let flashCount = 0;
  const interval = setInterval(() => {
    if (newsBox) newsBox.style.opacity = flashCount % 2 === 0 ? '0.2' : '1.0';
    flashCount++;
    if (flashCount > 5) {
      clearInterval(interval);
      if (newsBox) newsBox.style.opacity = '1.0';
      updateNewsFeed();
      addStatusLine("NEWS FEED SYNCED: ALL STORIES CACHED", "success");
    }
  }, 100);
  playChirp('click');
});

// CRT scanline filter toggle
const crtBtn = document.getElementById('crt-toggle-btn');
const crtOverlay = document.querySelector('.crt-overlay');
// crtBtn.classList.add('active'); // inactive by default

crtBtn.addEventListener('click', () => {
  if (crtOverlay.classList.contains('disabled')) {
    crtOverlay.classList.remove('disabled');
    crtBtn.classList.add('active');
  } else {
    crtOverlay.classList.add('disabled');
    crtBtn.classList.remove('active');
  }
  playChirp('click');
});

// Glitch trigger button
const glitchBtn = document.getElementById('glitch-trigger-btn');
glitchBtn.addEventListener('click', () => {
  triggerGlitch();
  playChirp('click');
});

function triggerGlitch() {
  const glitch = document.querySelector('.glitch-screen');
  glitch.classList.add('glitch-active');
  playChirp('glitch');

  setTimeout(() => {
    glitch.classList.remove('glitch-active');
  }, 350);
}

// -------------------------------------------------------------
// Interactive Speed & Altitude Tapes Scale Pointers
// -------------------------------------------------------------
function updateScales() {
  // Left Pointer: CPU utilization (0% = y=600, 100% = y=200)
  const leftPointer = getCachedEl('left-pointer');
  if (leftPointer) {
    const leftY = 600 - (cpuVal / 100) * 400;
    leftPointer.setAttribute('transform', `translate(0, ${leftY - 400})`);
  }

  // Right Pointer: Memory utilization mapped to MEM_LOAD scale (y=600 to y=200)
  const rightPointer = getCachedEl('right-pointer');
  if (rightPointer) {
    const rightY = 600 - (ramVal / 100) * 400;
    rightPointer.setAttribute('transform', `translate(0, ${rightY - 400})`);
  }
}

// -------------------------------------------------------------
// Interface Presentation Mode Toggle
// -------------------------------------------------------------
function toggleCleanMode() {
  const isClean = document.body.classList.toggle('mode-clean');
  playChirp('sweep');
  
  // Re-draw sparkline graph since canvas layout boundaries changed
  setTimeout(() => {
    resizeSparkline();
    drawSparkline();
  }, 150);
}

// Event listeners for toggle gestures
document.addEventListener('DOMContentLoaded', () => {
  // Guarantee local video playback to bypass browser autoplay policies
  const video = document.querySelector('.hud-video');
  if (video) {
    video.loop = true;

    const playVideo = () => {
      video.play().catch(err => {
        console.warn("Autoplay primary play trigger failed:", err);
      });
    };
    playVideo();
    // Fallback trigger play on interaction
    document.addEventListener('click', playVideo, { once: true });
    document.addEventListener('keydown', playVideo, { once: true });

    // Force loop repeat playback on video completion (WebKitGTK loop bug fallback)
    video.addEventListener('ended', () => {
      video.currentTime = 0;
      video.play().catch(err => {
        console.warn("Manual loop repetition failed:", err);
      });
    });

    // Handle system wake/sleep and wallpaper visibility changes
    // Hidamari fires visibilitychange when is_pause_when_maximized triggers.
    // We use our global suspend/resume to halt ALL JS activity.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        suspendAllJS();
      } else {
        resumeAllJS();
      }
    });

    // Reload and play if media playback crashes or hits a codec error
    video.addEventListener('error', () => {
      console.warn("Video playback error detected. Reloading video...");
      video.load();
      if (!isSuspended) updateVideoState();
    });

    // Initial state setup
    updateVideoState();
  }

  const floatingToggle = document.getElementById('floating-toggle');
  if (floatingToggle) {
    floatingToggle.addEventListener('click', toggleCleanMode);
  }

  // Double click on the background to toggle (excluding panels or interactive items)
  document.body.addEventListener('dblclick', (e) => {
    // Only toggle if the target is the background body/container/main
    if (
      e.target === document.body || 
      e.target.classList.contains('hud-container') || 
      e.target.classList.contains('hud-main') || 
      e.target.classList.contains('hud-center') ||
      e.target.tagName.toLowerCase() === 'svg'
    ) {
      toggleCleanMode();
    }
  });

  // Esc key shortcut to toggle (when not typing in search box)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (document.activeElement !== document.getElementById('explorer-search-input')) {
        toggleCleanMode();
      }
    }
  });

  // Process Tabs control logic
  const cpuTabBtn = document.getElementById('process-tab-cpu-btn');
  const memTabBtn = document.getElementById('process-tab-mem-btn');
  const cpuTab = document.getElementById('process-tab-cpu');
  const memTab = document.getElementById('process-tab-mem');

  if (cpuTabBtn && memTabBtn && cpuTab && memTab) {
    cpuTabBtn.addEventListener('click', () => {
      cpuTabBtn.classList.add('active');
      memTabBtn.classList.remove('active');
      cpuTab.style.display = 'block';
      memTab.style.display = 'none';
      playChirp('click');
    });

    memTabBtn.addEventListener('click', () => {
      memTabBtn.classList.add('active');
      cpuTabBtn.classList.remove('active');
      memTab.style.display = 'block';
      cpuTab.style.display = 'none';
      playChirp('click');
    });
  }

  // Translate vertical scroll to horizontal scroll for explorer grid
  if (explorerBody) {
    explorerBody.addEventListener('wheel', (e) => {
      if (e.deltaY !== 0) {
        e.preventDefault();
        explorerBody.scrollLeft += e.deltaY;
      }
    }, { passive: false });
  }

  // Call initial scale updates
  setTimeout(updateScales, 500);

  // Eco toggle button listener
  const ecoToggle = document.getElementById('eco-toggle-btn');
  if (ecoToggle) {
    ecoToggle.addEventListener('click', () => toggleEcoMode());
  }
});

// -------------------------------------------------------------
// Power Saving Eco Mode Controller
// -------------------------------------------------------------
function toggleEcoMode(enable = null, isAuto = false) {
  const btn = document.getElementById('eco-toggle-btn');
  if (!isAuto) {
    userPowerOverride = true;
  }
  let isEco;
  if (enable !== null) {
    isEco = enable;
    if (isEco) {
      document.body.classList.add('eco-mode');
      if (btn) btn.classList.add('active');
    } else {
      document.body.classList.remove('eco-mode');
      if (btn) btn.classList.remove('active');
    }
  } else {
    isEco = document.body.classList.toggle('eco-mode');
    if (btn) btn.classList.toggle('active');
  }
  playChirp('sweep');
  addStatusLine(`POWER STATE: ${isEco ? 'ECO_POWER_SAVING' : 'PERFORMANCE_MAX'} MODE ENGAGED`, isEco ? "success" : "warn");
  
  // Update video state and polling schedule
  updateVideoState();
  scheduleNextResourceUpdate();
}

// requestAnimationFrame loop that updates lastRafTime and resumes when revealed
function updateRafTime() {
  lastRafTime = Date.now();

  // If previously obscured (RAF stopped) and now resumed (RAF restarted)
  if (wasObscured) {
    wasObscured = false;
    resumeAllJS();
  }

  requestAnimationFrame(updateRafTime);
}
requestAnimationFrame(updateRafTime);

// Independent watchdog timer running every second to detect when RAF has stopped (obscured)
setInterval(() => {
  const isObscured = (Date.now() - lastRafTime) > 2000;
  if (isObscured && !isSuspended) {
    wasObscured = true;
    suspendAllJS();
    addStatusLine('WALLPAPER COVERED: SUSPENDING HUD', 'info');
  }
}, 1000);

