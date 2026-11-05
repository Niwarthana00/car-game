// public/js/game.js - Top-Down Multiplayer Racing Client Engine
(function() {
  const socket = io();

  // DOM Elements
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const lobbyScreen = document.getElementById('lobby-screen');
  const waitingOverlay = document.getElementById('waiting-overlay');
  const hud = document.getElementById('hud');
  const posValue = document.getElementById('pos-value');
  const lapValue = document.getElementById('lap-value');
  const speedValue = document.getElementById('speed-value');
  const countdownOverlay = document.getElementById('countdown-overlay');
  const winnerModal = document.getElementById('winner-modal');
  const winnerNameEl = document.getElementById('winner-name');
  const shareLinkInput = document.getElementById('share-link');
  const copyShareBtn = document.getElementById('copy-share-btn');
  const muteBtn = document.getElementById('mute-btn');
  const cameraBtn = document.getElementById('camera-btn');
  const restartBtn = document.getElementById('restart-btn');
  const boostBar = document.getElementById('boost-bar');

  // Input states
  const inputs = { up: false, down: false, left: false, right: false, drift: false, boost: false };

  // Game state
  let myId = null;
  let currentRoom = null;
  let lapsToWin = 3;
  let gameState = 'lobby'; // lobby, waiting, countdown, racing, finished
  let players = {};
  let targetPlayers = {}; // For interpolation
  let myPosition = 1;

  // Camera settings
  const camera = {
    x: 500,
    y: 1500,
    angle: 0,
    targetAngle: 0,
    zoom: 1.0,
    mode: 'rotate' // 'rotate' (driver view, car faces up) or 'fixed' (top-down static)
  };

  // Particles & Visual effects
  const particles = [];
  const sparks = [];
  const flames = [];
  const confetti = [];

  // Skidmark persistent layer canvas
  const skidCanvas = document.createElement('canvas');
  skidCanvas.width = GameTrack.WORLD_WIDTH;
  skidCanvas.height = GameTrack.WORLD_HEIGHT;
  const skidCtx = skidCanvas.getContext('2d');

  // Responsive canvas resizing
  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  // Handle Tab Blur / Focus (Prevents stuck keys and frozen background tabs!)
  window.addEventListener('blur', () => {
    Object.keys(inputs).forEach(k => inputs[k] = false);
    sendInputs();
  });

  window.addEventListener('focus', () => {
    lastTime = performance.now();
    if (players[myId]) {
      camera.x = players[myId].x;
      camera.y = players[myId].y;
      camera.angle = players[myId].angle;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) {
      lastTime = performance.now();
      if (players[myId]) {
        camera.x = players[myId].x;
        camera.y = players[myId].y;
        camera.angle = players[myId].angle;
      }
    }
  });

  // URL Query param check for quick room join (?room=XYZ)
  const urlParams = new URLSearchParams(window.location.search);
  const roomParam = urlParams.get('room');
  if (roomParam) {
    const roomInput = document.getElementById('room-id');
    if (roomInput) roomInput.value = roomParam;
  }

  // Handle Join Form
  document.getElementById('join-form').addEventListener('submit', (e) => {
    e.preventDefault();
    soundFX.init();

    const playerName = document.getElementById('player-name').value.trim() || 'Racer';
    const roomId = document.getElementById('room-id').value.trim().toUpperCase() || 'RACE-1';

    currentRoom = roomId;
    socket.emit('joinRoom', { roomId, playerName });

    lobbyScreen.style.display = 'none';
    hud.style.display = 'block';

    // Setup shareable link
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${roomId}`;
    shareLinkInput.value = shareUrl;
  });

  // Copy share link button
  copyShareBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(shareLinkInput.value).then(() => {
      copyShareBtn.textContent = 'COPIED! ✅';
      setTimeout(() => { copyShareBtn.textContent = 'COPY LINK'; }, 2000);
    }).catch(() => {
      shareLinkInput.select();
      document.execCommand('copy');
      copyShareBtn.textContent = 'COPIED! ✅';
      setTimeout(() => { copyShareBtn.textContent = 'COPY LINK'; }, 2000);
    });
  });

  // Mute button
  muteBtn.addEventListener('click', () => {
    soundFX.init();
    const isMuted = soundFX.toggleMute();
    muteBtn.textContent = isMuted ? '🔇 MUTED' : '🔊 SOUND ON';
  });

  // Camera toggle button (Driver view vs Fixed view)
  if (cameraBtn) {
    cameraBtn.addEventListener('click', () => {
      camera.mode = (camera.mode === 'rotate') ? 'fixed' : 'rotate';
      cameraBtn.textContent = (camera.mode === 'rotate') ? '🎥 VIEW: DRIVER' : '🎥 VIEW: FIXED';
    });
  }

  // Rematch / Restart button
  restartBtn.addEventListener('click', () => {
    winnerModal.style.display = 'none';
    socket.emit('restartRace');
  });

  // Keyboard controls
  const keyMap = {
    'KeyW': 'up', 'ArrowUp': 'up',
    'KeyS': 'down', 'ArrowDown': 'down',
    'KeyA': 'left', 'ArrowLeft': 'left',
    'KeyD': 'right', 'ArrowRight': 'right',
    'Space': 'drift',
    'ShiftLeft': 'boost', 'ShiftRight': 'boost', 'KeyN': 'boost', 'KeyX': 'boost',
    'KeyE': 'spinOpponent'
  };

  function sendInputs() {
    socket.emit('playerInput', inputs);
  }

  window.addEventListener('keydown', (e) => {
    if (keyMap[e.code] !== undefined) {
      inputs[keyMap[e.code]] = true;
      sendInputs();
      if (['Space', 'ShiftLeft', 'ShiftRight', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (keyMap[e.code] !== undefined) {
      inputs[keyMap[e.code]] = false;
      sendInputs();
    }
  });

  // Touch controls for mobile
  function setupTouchBtn(elementId, action) {
    const el = document.getElementById(elementId);
    if (!el) return;

    const start = (e) => {
      e.preventDefault();
      soundFX.init();
      inputs[action] = true;
      el.classList.add('pressed');
      sendInputs();
    };
    const end = (e) => {
      e.preventDefault();
      inputs[action] = false;
      el.classList.remove('pressed');
      sendInputs();
    };

    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
  }

  setupTouchBtn('touch-gas', 'up');
  setupTouchBtn('touch-brake', 'down');
  setupTouchBtn('touch-left', 'left');
  setupTouchBtn('touch-right', 'right');
  setupTouchBtn('touch-boost', 'boost');

  // Socket Events
  socket.on('roomState', (data) => {
    myId = data.myId;
    lapsToWin = data.lapsToWin;
    targetPlayers = data.players;
    players = JSON.parse(JSON.stringify(data.players));
    updateWaitingState();
  });

  socket.on('playerLeft', (data) => {
    targetPlayers = data.players;
    delete players[data.id];
    updateWaitingState();
  });

  socket.on('countdownTick', (data) => {
    waitingOverlay.style.display = 'none';
    countdownOverlay.textContent = data.count;
    countdownOverlay.classList.remove('show');
    void countdownOverlay.offsetWidth; // trigger reflow
    countdownOverlay.classList.add('show');

    const isGo = data.count === 'GO';
    soundFX.playCountdownBeep(isGo);

    if (isGo) {
      setTimeout(() => {
        countdownOverlay.classList.remove('show');
      }, 1000);
    }
  });

  socket.on('checkpointHit', () => {
    soundFX.playCheckpoint();
  });

  socket.on('lapComplete', (data) => {
    if (data.playerId === myId) {
      soundFX.playCheckpoint();
    }
  });

  socket.on('carCollision', (data) => {
    soundFX.playCrash(data.intensity);
    spawnSparks(data.x, data.y, 18);
  });

  socket.on('collisionSound', (data) => {
    soundFX.playCrash(data.intensity);
  });

  socket.on('raceFinished', (data) => {
    gameState = 'finished';
    winnerModal.style.display = 'flex';

    const w = data.winner;
    const isMeWinner = (w.id === myId);

    // Troll alert container if 3 losses in a row
    const trollBox = document.getElementById('troll-alert');
    if (w.isTroll) {
      if (trollBox) {
        trollBox.style.display = 'block';
        trollBox.innerHTML = `
          <div class="troll-banner">
            <div style="font-size: 2.8rem; margin-bottom: 4px;">🐔💨 🤣 💨🐔</div>
            <div style="font-family: 'Orbitron', sans-serif; font-size: 1.3rem; color: #ff3344; font-weight: 900; line-height: 1.4;">
              ${w.trollMessage}
            </div>
            <div style="font-size: 0.95rem; color: #ffd166; margin-top: 6px;">
              (පරාජයන් ${w.consecutiveLosses}ක් එක දිගට! තව පුරුදු වෙලා එන්න මල්ලී! 😂)
            </div>
          </div>
        `;
      }
      soundFX.playTrollSound();
    } else {
      if (trollBox) trollBox.style.display = 'none';
      soundFX.playWinFanfare();
    }

    if (w.name && w.name.trim().toLowerCase() === 'niwa') {
      if (isMeWinner) {
        winnerNameEl.textContent = `👑 CHAMPION NIWA WINS! 🏆`;
      } else {
        winnerNameEl.textContent = `NIWA WINS! 🏆`;
      }
    } else {
      winnerNameEl.textContent = `${w.name} WINS! 🏆`;
    }

    winnerNameEl.style.color = w.color || '#ffd166';
    spawnConfetti();
  });

  socket.on('gameUpdate', (snapshot) => {
    gameState = snapshot.state;
    targetPlayers = snapshot.players;

    if (snapshot.positions && snapshot.positions[myId]) {
      myPosition = snapshot.positions[myId];
    }

    updateWaitingState();
  });

  function updateWaitingState() {
    const playerCount = Object.keys(targetPlayers).length;
    if (playerCount < 2 && gameState === 'waiting') {
      waitingOverlay.style.display = 'flex';
    } else {
      waitingOverlay.style.display = 'none';
    }
  }

  // Particle systems
  function spawnSmoke(x, y) {
    particles.push({
      x: x + (Math.random() - 0.5) * 6,
      y: y + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 0.8,
      vy: (Math.random() - 0.5) * 0.8,
      size: 4 + Math.random() * 4,
      alpha: 0.45,
      decay: 0.02
    });
  }

  function spawnSparks(x, y, count = 14) {
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 6;
      sparks.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.04 + Math.random() * 0.04,
        color: Math.random() > 0.5 ? '#ffd166' : '#ff9f1c'
      });
    }
  }

  // Boost Nitro Flame Exhaust Particles
  function spawnBoostFlames(p) {
    const rearX = p.x - Math.cos(p.angle) * 24;
    const rearY = p.y - Math.sin(p.angle) * 24;
    const rightX = -Math.sin(p.angle);
    const rightY = Math.cos(p.angle);

    [-6, 6].forEach(offset => {
      const fx = rearX + rightX * offset;
      const fy = rearY + rightY * offset;
      const speed = 3.5 + Math.random() * 3.5;
      const spread = (Math.random() - 0.5) * 0.4;
      const flameAngle = p.angle + Math.PI + spread;

      flames.push({
        x: fx,
        y: fy,
        vx: Math.cos(flameAngle) * speed + p.vx * 0.2,
        vy: Math.sin(flameAngle) * speed + p.vy * 0.2,
        size: 5 + Math.random() * 5,
        alpha: 0.9,
        decay: 0.08,
        color: Math.random() > 0.4 ? '#00e5ff' : '#0077b6' // Neon cyan/blue NOS flame
      });
    });
  }

  function spawnConfetti() {
    const colors = ['#ff3344', '#00b4d8', '#ffd166', '#2ec4b6', '#ffffff', '#ff9f1c'];
    for (let i = 0; i < 150; i++) {
      confetti.push({
        x: Math.random() * canvas.width,
        y: -20 - Math.random() * 100,
        vx: (Math.random() - 0.5) * 3,
        vy: 2 + Math.random() * 4,
        rot: Math.random() * Math.PI * 2,
        rotSpeed: (Math.random() - 0.5) * 0.2,
        size: 8 + Math.random() * 6,
        color: colors[Math.floor(Math.random() * colors.length)]
      });
    }
  }

  // Add skid mark to persistent skid layer
  function addSkid(x1, y1, x2, y2, alpha = 0.25) {
    skidCtx.strokeStyle = `rgba(18, 18, 20, ${alpha})`;
    skidCtx.lineWidth = 4;
    skidCtx.lineCap = 'round';
    skidCtx.beginPath();
    skidCtx.moveTo(x1, y1);
    skidCtx.lineTo(x2, y2);
    skidCtx.stroke();
  }

  // ==========================================
  // RENDERING ENGINE
  // ==========================================

  // 1. Draw Asphalt Track with Curbs & Finish Line
  function drawTrack() {
    const pts = GameTrack.centerPoints;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Kerbs (Red & White alternating curbs along outer edge)
    ctx.lineWidth = GameTrack.ROAD_WIDTH + 34;
    for (let i = 0; i < pts.length; i++) {
      const next = (i + 1) % pts.length;
      ctx.strokeStyle = (Math.floor(i / 3) % 2 === 0) ? '#e63946' : '#f1faee';
      ctx.beginPath();
      ctx.moveTo(pts[i].x, pts[i].y);
      ctx.lineTo(pts[next].x, pts[next].y);
      ctx.stroke();
    }

    // Asphalt Main Road
    ctx.lineWidth = GameTrack.ROAD_WIDTH;
    ctx.strokeStyle = '#1e232a';
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
      ctx.lineTo(pts[i].x, pts[i].y);
    }
    ctx.closePath();
    ctx.stroke();

    // Center white dashed racing line
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.setLineDash([16, 20]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw Persistent Skidmarks
    ctx.drawImage(skidCanvas, 0, 0);

    // Draw Checkered Start / Finish Line
    const cp0 = GameTrack.checkpoints[0];
    const norm = GameTrack.trackNormals[0];
    const checkerCols = 8;
    const checkerRows = 2;
    const blockW = 12;
    const blockH = GameTrack.ROAD_WIDTH / checkerCols;

    ctx.save();
    ctx.translate(cp0.center.x, cp0.center.y);
    ctx.rotate(Math.atan2(norm.ty, norm.tx));

    for (let r = 0; r < checkerRows; r++) {
      for (let c = 0; c < checkerCols; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? '#ffffff' : '#111111';
        ctx.fillRect(
          (r - 1) * blockW,
          (c - checkerCols / 2) * blockH,
          blockW,
          blockH
        );
      }
    }
    ctx.restore();

    // Draw Tire Barriers
    drawBarriers();
  }

  function drawBarriers() {
    const barrierLocs = [
      { x: 2360, y: 1040, count: 8 },
      { x: 260,  y: 740,  count: 8 },
      { x: 1350, y: 840,  count: 6 }
    ];

    barrierLocs.forEach(b => {
      for (let i = 0; i < b.count; i++) {
        ctx.fillStyle = (i % 2 === 0) ? '#ff3344' : '#ffffff';
        ctx.beginPath();
        ctx.arc(b.x + (i - b.count / 2) * 14, b.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#111';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
  }

  // 2. Draw Sleek Top-Down Race Car
  function drawCar(p) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);

    const length = 44;
    const width = 24;

    // Car Drop Shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.beginPath();
    ctx.roundRect(-length / 2 + 3, -width / 2 + 4, length, width, 6);
    ctx.fill();

    // Headlight Beams (Front)
    if (gameState === 'racing' || gameState === 'countdown') {
      const grad = ctx.createRadialGradient(length / 2, 0, 5, length / 2 + 50, 0, 60);
      grad.addColorStop(0, 'rgba(255, 255, 220, 0.35)');
      grad.addColorStop(1, 'rgba(255, 255, 220, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(length / 2, -width / 2 + 2);
      ctx.lineTo(length / 2 + 70, -width - 15);
      ctx.lineTo(length / 2 + 70, width + 15);
      ctx.lineTo(length / 2, width / 2 - 2);
      ctx.closePath();
      ctx.fill();
    }

    // Wheels
    const steerAngle = p.inputs ? (p.inputs.left ? -0.38 : p.inputs.right ? 0.38 : 0) : 0;
    drawWheel(length * 0.28, -width * 0.52, steerAngle);
    drawWheel(length * 0.28,  width * 0.52, steerAngle);
    drawWheel(-length * 0.30, -width * 0.52, 0);
    drawWheel(-length * 0.30,  width * 0.52, 0);

    // Car Body
    ctx.fillStyle = p.color || '#ff3344';
    ctx.beginPath();
    ctx.roundRect(-length / 2, -width / 2, length, width, 7);
    ctx.fill();

    // Racing Stripe
    ctx.fillStyle = p.secondaryColor || '#ffffff';
    ctx.fillRect(-length / 2 + 6, -3, length - 12, 6);

    // Windshield
    ctx.fillStyle = '#141820';
    ctx.beginPath();
    ctx.roundRect(-length * 0.15, -width * 0.32, length * 0.40, width * 0.64, 4);
    ctx.fill();

    // Windshield Highlight
    ctx.fillStyle = 'rgba(88, 166, 255, 0.4)';
    ctx.beginPath();
    ctx.roundRect(length * 0.05, -width * 0.28, length * 0.16, width * 0.56, 3);
    ctx.fill();

    // Rear Spoiler
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(-length / 2 - 2, -width / 2 - 1, 5, width + 2);

    // Headlight LEDs
    ctx.fillStyle = '#fffdd0';
    ctx.fillRect(length / 2 - 3, -width / 2 + 2, 3, 5);
    ctx.fillRect(length / 2 - 3,  width / 2 - 7, 3, 5);

    // Brake Lights (glowing bright when braking/reversing)
    const isBraking = p.inputs && (p.inputs.down || p.speed < 0);
    ctx.fillStyle = isBraking ? '#ff0033' : '#660011';
    if (isBraking) {
      ctx.shadowColor = '#ff0033';
      ctx.shadowBlur = 12;
    }
    ctx.fillRect(-length / 2 - 1, -width / 2 + 2, 3, 4);
    ctx.fillRect(-length / 2 - 1,  width / 2 - 6, 3, 4);
    ctx.shadowBlur = 0;

    // Boost glow around car when Nitro active!
    if (p.isBoosting) {
      ctx.strokeStyle = '#00e5ff';
      ctx.lineWidth = 2.5;
      ctx.shadowColor = '#00e5ff';
      ctx.shadowBlur = 15;
      ctx.strokeRect(-length / 2 - 2, -width / 2 - 2, length + 4, width + 4);
      ctx.shadowBlur = 0;
    }

    ctx.restore();

    // Player Name Badge above car
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 20, 0.75)';
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    const nameText = p.id === myId ? `YOU (${p.name})` : p.name;
    ctx.font = 'bold 12px Rajdhani, sans-serif';
    const textW = ctx.measureText(nameText).width;

    ctx.beginPath();
    ctx.roundRect(p.x - textW / 2 - 6, p.y - 36, textW + 12, 18, 4);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameText, p.x, p.y - 27);
    ctx.restore();
  }

  function drawWheel(x, y, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillStyle = '#111';
    ctx.beginPath();
    ctx.roundRect(-6, -3, 12, 6, 2);
    ctx.fill();
    ctx.fillStyle = '#888';
    ctx.fillRect(-2, -1, 4, 2);
    ctx.restore();
  }

  // 3. Mini-Map in Top Right Corner
  function drawMiniMap() {
    const mapW = 190;
    const mapH = 130;
    const mapX = canvas.width - mapW - 20;
    const mapY = 75;

    ctx.save();
    ctx.fillStyle = 'rgba(13, 17, 23, 0.85)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(mapX, mapY, mapW, mapH, 10);
    ctx.fill();
    ctx.stroke();

    const scaleX = (mapW - 24) / GameTrack.WORLD_WIDTH;
    const scaleY = (mapH - 24) / GameTrack.WORLD_HEIGHT;

    const pts = GameTrack.centerPoints;
    ctx.strokeStyle = '#484f58';
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.moveTo(mapX + 12 + pts[0].x * scaleX, mapY + 12 + pts[0].y * scaleY);
    for (let i = 1; i < pts.length; i += 2) {
      ctx.lineTo(mapX + 12 + pts[i].x * scaleX, mapY + 12 + pts[i].y * scaleY);
    }
    ctx.closePath();
    ctx.stroke();

    // Start line
    const cp0 = GameTrack.checkpoints[0].center;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(mapX + 10 + cp0.x * scaleX, mapY + 10 + cp0.y * scaleY, 4, 4);

    // Racer Blips
    Object.values(players).forEach(p => {
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(
        mapX + 12 + p.x * scaleX,
        mapY + 12 + p.y * scaleY,
        p.id === myId ? 4.5 : 3.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1;
      ctx.stroke();
    });

    ctx.restore();
  }

  // ==========================================
  // MAIN GAME LOOP (60 FPS)
  // ==========================================
  let lastTime = performance.now();

  function gameLoop(time) {
    const dt = Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;

    // 1. Interpolate Player Positions
    Object.keys(targetPlayers).forEach(id => {
      const target = targetPlayers[id];
      if (!players[id]) {
        players[id] = { ...target };
      } else {
        const p = players[id];
        p.x += (target.x - p.x) * 0.45;
        p.y += (target.y - p.y) * 0.45;

        let diff = target.angle - p.angle;
        while (diff < -Math.PI) diff += Math.PI * 2;
        while (diff > Math.PI) diff -= Math.PI * 2;
        p.angle += diff * 0.45;

        p.speed = target.speed;
        p.vx = target.vx;
        p.vy = target.vy;
        p.lap = target.lap;
        p.nextCheckpoint = target.nextCheckpoint;
        p.isSkidding = target.isSkidding;
        p.isBoosting = target.isBoosting;
        p.boostFuel = target.boostFuel;
        p.color = target.color;
        p.secondaryColor = target.secondaryColor;
        p.name = target.name;

        // Boost flames
        if (p.isBoosting) {
          spawnBoostFlames(p);
        }

        // Skidmarks & Smoke
        if (target.isSkidding) {
          const rearX = p.x - Math.cos(p.angle) * 16;
          const rearY = p.y - Math.sin(p.angle) * 16;
          const leftWheelX = rearX - Math.sin(p.angle) * 10;
          const leftWheelY = rearY + Math.cos(p.angle) * 10;
          const rightWheelX = rearX + Math.sin(p.angle) * 10;
          const rightWheelY = rearY - Math.cos(p.angle) * 10;

          if (p.prevSkid) {
            addSkid(p.prevSkid.leftX, p.prevSkid.leftY, leftWheelX, leftWheelY);
            addSkid(p.prevSkid.rightX, p.prevSkid.rightY, rightWheelX, rightWheelY);
          }
          p.prevSkid = { leftX: leftWheelX, leftY: leftWheelY, rightX: rightWheelX, rightY: rightWheelY };

          spawnSmoke(leftWheelX, leftWheelY);
          spawnSmoke(rightWheelX, rightWheelY);
        } else {
          p.prevSkid = null;
        }
      }
    });

    // 2. Camera follow & Rotation
    const me = players[myId];
    if (me) {
      camera.x += (me.x - camera.x) * 0.15;
      camera.y += (me.y - camera.y) * 0.15;

      // Smooth camera angle interpolation for Driver/Rotating view
      if (camera.mode === 'rotate') {
        let angleDiff = me.angle - camera.angle;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        camera.angle += angleDiff * 0.12;
      } else {
        camera.angle = 0;
      }

      // Dynamic FOV Zoom when boosting
      const targetZoom = me.isBoosting ? 0.92 : 1.0;
      camera.zoom += (targetZoom - camera.zoom) * 0.1;

      // Audio update
      const isDriving = inputs.up || inputs.down;
      soundFX.updateEngine(me.speed, 8.8, isDriving);
      soundFX.setSkid(me.isSkidding);
      soundFX.setNitro(me.isBoosting);

      // HUD update
      const speedKmH = Math.round(Math.abs(me.speed) * 23);
      speedValue.textContent = speedKmH;
      lapValue.textContent = `${Math.min(me.lap, lapsToWin)} / ${lapsToWin}`;

      posValue.textContent = myPosition === 1 ? '1ST' : '2ND';
      posValue.className = `pos-badge pos-${myPosition}`;

      // Boost Fuel Bar
      if (boostBar) {
        boostBar.style.width = `${me.boostFuel || 0}%`;
      }
    }

    // 3. Clear Screen & Draw
    ctx.fillStyle = '#0f1712';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.save();
    // Center camera on screen
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.scale(camera.zoom, camera.zoom);

    // Apply Camera Rotation if in Driver View (Car always points UP!)
    if (camera.mode === 'rotate') {
      ctx.rotate(-camera.angle - Math.PI / 2);
    }

    ctx.translate(-camera.x, -camera.y);

    // Draw Track
    drawTrack();

    // Draw Skid Smoke Particles
    for (let i = particles.length - 1; i >= 0; i--) {
      const pt = particles[i];
      pt.x += pt.vx;
      pt.y += pt.vy;
      pt.size += 0.2;
      pt.alpha -= pt.decay;

      if (pt.alpha <= 0) {
        particles.splice(i, 1);
      } else {
        ctx.fillStyle = `rgba(200, 205, 215, ${pt.alpha})`;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Sparks
    for (let i = sparks.length - 1; i >= 0; i--) {
      const sp = sparks[i];
      sp.x += sp.vx;
      sp.y += sp.vy;
      sp.life -= sp.decay;

      if (sp.life <= 0) {
        sparks.splice(i, 1);
      } else {
        ctx.fillStyle = sp.color;
        ctx.beginPath();
        ctx.arc(sp.x, sp.y, 2.5 * sp.life, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw Nitro Flames
    for (let i = flames.length - 1; i >= 0; i--) {
      const fl = flames[i];
      fl.x += fl.vx;
      fl.y += fl.vy;
      fl.size *= 0.94;
      fl.alpha -= fl.decay;

      if (fl.alpha <= 0) {
        flames.splice(i, 1);
      } else {
        ctx.fillStyle = fl.color;
        ctx.beginPath();
        ctx.arc(fl.x, fl.y, fl.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Draw All Cars
    Object.values(players).forEach(p => {
      drawCar(p);
    });

    ctx.restore();

    // 4. Overlays (Minimap, Confetti)
    if (gameState === 'racing' || gameState === 'countdown') {
      drawMiniMap();
    }

    // Winner Confetti
    if (gameState === 'finished' && confetti.length > 0) {
      for (let i = confetti.length - 1; i >= 0; i--) {
        const c = confetti[i];
        c.x += c.vx;
        c.y += c.vy;
        c.rot += c.rotSpeed;

        ctx.save();
        ctx.translate(c.x, c.y);
        ctx.rotate(c.rot);
        ctx.fillStyle = c.color;
        ctx.fillRect(-c.size / 2, -c.size / 2, c.size, c.size * 0.5);
        ctx.restore();

        if (c.y > canvas.height + 20) {
          c.y = -20;
          c.x = Math.random() * canvas.width;
        }
      }
    }

    requestAnimationFrame(gameLoop);
  }

  requestAnimationFrame(gameLoop);
})();
