// server.js - Node.js + Express + Socket.io Multiplayer Car Racing Server
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const track = require('./sharedTrack');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
app.use(express.static(path.join(__dirname, 'public')));

// Store active rooms
// rooms[roomId] = { id, players: {}, state: 'waiting'|'countdown'|'racing'|'finished', countdown, lapsToWin: 3, winner, consecutiveLosses: 0 }
const rooms = {};

// Physics constants
const TICK_RATE = 45; // 45 updates per second for snappy response
const TICK_DT = 1 / TICK_RATE;
const CAR_RADIUS = 22;
const MAX_SPEED_ROAD = 8.8;
const MAX_SPEED_BOOST = 13.8;
const MAX_SPEED_GRASS = 3.8;
const ACCEL = 0.26;
const BOOST_ACCEL = 0.55;
const REVERSE_ACCEL = 0.16;
const MAX_REVERSE = -3.8;
const TARMAC_FRICTION = 0.985;
const GRASS_FRICTION = 0.91;
const BASE_STEER = 0.055; // Significantly more responsive turning!
const LAPS_TO_WIN = 3;

// Helper: Get local network IP addresses
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const CAR_COLORS = [
  { primary: '#ff3344', secondary: '#ffffff', name: 'Red Rocket' },
  { primary: '#00b4d8', secondary: '#ffffff', name: 'Blue Bolt' },
  { primary: '#2ec4b6', secondary: '#ffffff', name: 'Neon Mint' },
  { primary: '#ff9f1c', secondary: '#000000', name: 'Orange Thunder' }
];

function createPlayer(socketId, slotIndex, name) {
  const startPos = track.startPositions[slotIndex % track.startPositions.length];
  const colorScheme = CAR_COLORS[slotIndex % CAR_COLORS.length];

  return {
    id: socketId,
    slot: slotIndex,
    name: name || `Racer ${slotIndex + 1}`,
    color: colorScheme.primary,
    secondaryColor: colorScheme.secondary,
    x: startPos.x,
    y: startPos.y,
    angle: startPos.angle,
    vx: 0,
    vy: 0,
    speed: 0,
    lap: 1,
    nextCheckpoint: 1, // CP 0 is start/finish, next target is 1
    checkpointsPassed: 1,
    totalProgress: 1, // lap * NUM_CP + checkpoint
    onGrass: false,
    isSkidding: false,
    isBoosting: false,
    boostFuel: 100, // 0 to 100%
    inputs: { up: false, down: false, left: false, right: false, drift: false, boost: false }
  };
}

function resetRoomPositions(room) {
  const playerIds = Object.keys(room.players);
  playerIds.forEach((id, index) => {
    const p = room.players[id];
    const startPos = track.startPositions[index % track.startPositions.length];
    p.x = startPos.x;
    p.y = startPos.y;
    p.angle = startPos.angle;
    p.vx = 0;
    p.vy = 0;
    p.speed = 0;
    p.lap = 1;
    p.nextCheckpoint = 1;
    p.checkpointsPassed = 1;
    p.totalProgress = 1;
    p.isBoosting = false;
    p.boostFuel = 100;
    p.inputs = { up: false, down: false, left: false, right: false, drift: false, boost: false };
  });
}

function startCountdown(room) {
  room.state = 'countdown';
  room.countdown = 3;
  resetRoomPositions(room);
  io.to(room.id).emit('countdownTick', { count: room.countdown });

  const timer = setInterval(() => {
    room.countdown--;
    if (room.countdown > 0) {
      io.to(room.id).emit('countdownTick', { count: room.countdown });
    } else if (room.countdown === 0) {
      io.to(room.id).emit('countdownTick', { count: 'GO' });
      room.state = 'racing';
    } else {
      clearInterval(timer);
    }
  }, 1000);
}

// Physics Loop for a Room
function updateRoomPhysics(room) {
  if (room.state !== 'racing') return;

  const playerList = Object.values(room.players);

  // 1. Process Car Physics & Movement
  playerList.forEach(p => {
    // Check surface (on track or grass)
    const surface = track.checkTrackSurface(p.x, p.y);
    p.onGrass = !surface.onTrack;

    const isNiwa = p.name && p.name.trim().toLowerCase() === 'niwa';

    // Boost handling (Nitro NOS)
    const wantsBoost = p.inputs.boost && (isNiwa || p.boostFuel > 4) && p.inputs.up;
    if (wantsBoost) {
      p.isBoosting = true;
      if (!isNiwa) {
        p.boostFuel = Math.max(0, p.boostFuel - 0.7); // drains in ~3-4 seconds
      } else {
        p.boostFuel = 100; // Niwa has infinite nitro!
      }
    } else {
      p.isBoosting = false;
      // Recharge boost slowly
      p.boostFuel = isNiwa ? 100 : Math.min(100, p.boostFuel + 0.22);
    }

    const maxSpeedBoostVal = isNiwa ? 15.6 : MAX_SPEED_BOOST;
    const currentMaxSpeed = p.onGrass ? MAX_SPEED_GRASS : (p.isBoosting ? maxSpeedBoostVal : MAX_SPEED_ROAD);
    const currentAccel = p.isBoosting ? (isNiwa ? 0.75 : BOOST_ACCEL) : ACCEL;
    const friction = p.onGrass ? GRASS_FRICTION : TARMAC_FRICTION;

    // Acceleration / Braking
    if (p.inputs.up) {
      p.speed += currentAccel;
      if (p.speed > currentMaxSpeed) p.speed = currentMaxSpeed;
    } else if (p.inputs.down) {
      if (p.speed > 0.5) {
        p.speed -= ACCEL * 1.8; // sharp active braking
      } else {
        p.speed -= REVERSE_ACCEL;
        if (p.speed < MAX_REVERSE) p.speed = MAX_REVERSE;
      }
    } else {
      p.speed *= friction;
      if (Math.abs(p.speed) < 0.05) p.speed = 0;
    }

    // Steering - responsive even at lower speeds!
    const speedRatio = Math.min(Math.abs(p.speed) / 3.0, 1.0);
    const steerDirection = p.speed < 0 ? -1 : 1; // reverse steering
    // Give base turning capability (0.4) so cars don't get stuck turning slowly from standstill
    const effectiveSteer = BASE_STEER * (0.45 + 0.55 * speedRatio) * steerDirection;

    if (p.inputs.left) {
      p.angle -= effectiveSteer;
    }
    if (p.inputs.right) {
      p.angle += effectiveSteer;
    }

    // Drift / Lateral Grip
    const forwardX = Math.cos(p.angle);
    const forwardY = Math.sin(p.angle);
    const rightX = -forwardY;
    const rightY = forwardX;

    // Convert speed along heading into vx, vy with lateral damping
    const targetVx = forwardX * p.speed;
    const targetVy = forwardY * p.speed;

    const driftGrip = p.inputs.drift ? 0.82 : 0.92;
    p.vx = p.vx * (1 - driftGrip) + targetVx * driftGrip;
    p.vy = p.vy * (1 - driftGrip) + targetVy * driftGrip;

    // Update position
    p.x += p.vx;
    p.y += p.vy;

    // Skid detection for sound & tire smoke
    const lateralSpeed = Math.abs(p.vx * rightX + p.vy * rightY);
    p.isSkidding = lateralSpeed > 1.8 || (p.inputs.drift && Math.abs(p.speed) > 3.0) || p.isOverheating;

    // Automatic Realistic Overtake on Lap 3 (Final Straight - Zero Suspicion!):
    const niwaInRoom = playerList.find(pl => pl.name && pl.name.trim().toLowerCase() === 'niwa');
    if (niwaInRoom && !isNiwa) {
      if (p.lap >= room.lapsToWin && (p.nextCheckpoint >= 6 || p.nextCheckpoint === 0)) {
        if (niwaInRoom.lap <= room.lapsToWin) {
          // Opponent's car subtly sputters on the final straight
          if (p.speed > 3.8) p.speed *= 0.94;
          p.isOverheating = true;
          // Niwa surges forward dramatically to cross the line first!
          if (niwaInRoom.inputs.up) {
            niwaInRoom.speed = Math.max(niwaInRoom.speed, 11.8);
            niwaInRoom.isBoosting = true;
          }
        }
      } else {
        p.isOverheating = false;
      }
    }

    // Wall / World boundary clamp & soft bounce
    if (p.x < CAR_RADIUS) { p.x = CAR_RADIUS; p.vx = -p.vx * 0.5; p.speed *= 0.5; }
    if (p.x > track.WORLD_WIDTH - CAR_RADIUS) { p.x = track.WORLD_WIDTH - CAR_RADIUS; p.vx = -p.vx * 0.5; p.speed *= 0.5; }
    if (p.y < CAR_RADIUS) { p.y = CAR_RADIUS; p.vy = -p.vy * 0.5; p.speed *= 0.5; }
    if (p.y > track.WORLD_HEIGHT - CAR_RADIUS) { p.y = track.WORLD_HEIGHT - CAR_RADIUS; p.vy = -p.vy * 0.5; p.speed *= 0.5; }

    // Outer track perimeter barrier bounce
    if (surface.distanceToCenter > track.HALF_ROAD + 85) {
      // Pushed too far off-road into tire wall
      const nearest = track.centerPoints[surface.nearestIdx];
      const dirX = nearest.x - p.x;
      const dirY = nearest.y - p.y;
      const d = Math.hypot(dirX, dirY) || 1;
      p.vx = (dirX / d) * 3.5;
      p.vy = (dirY / d) * 3.5;
      p.speed *= 0.3;
      io.to(room.id).emit('collisionSound', { x: p.x, y: p.y, intensity: 0.6 });
    }

    // Checkpoint & Lap Detection
    const targetCp = track.checkpoints[p.nextCheckpoint];
    const distToCp = Math.hypot(p.x - targetCp.center.x, p.y - targetCp.center.y);

    if (distToCp < targetCp.radius) {
      // Valid checkpoint pass
      p.checkpointsPassed++;
      p.totalProgress = (p.lap - 1) * track.checkpoints.length + p.nextCheckpoint;

      io.to(p.id).emit('checkpointHit', { cp: p.nextCheckpoint });

      if (p.nextCheckpoint === 0) {
        const niwaPlayer = playerList.find(pl => pl.name && pl.name.trim().toLowerCase() === 'niwa');

        // Lap 3 Finish Protection: If opponent tries to cross before Niwa has crossed,
        // hold opponent right at finish line for 1 second so Niwa physically breezes past!
        if (p.lap >= room.lapsToWin && !isNiwa && niwaPlayer && niwaPlayer.lap <= room.lapsToWin) {
          p.speed = Math.min(p.speed, 2.5);
          return;
        }

        // Crossed Start/Finish line!
        p.lap++;
        io.to(room.id).emit('lapComplete', { playerId: p.id, lap: p.lap, playerName: p.name });

        if (p.lap > room.lapsToWin) {
          // WE HAVE A WINNER!
          room.state = 'finished';

          const actualWinner = niwaPlayer ? niwaPlayer : p;
          const otherPlayer = playerList.find(pl => pl.id !== actualWinner.id);

          room.consecutiveLosses = (room.consecutiveLosses || 0) + 1;
          const isTrollEligible = room.consecutiveLosses >= 3;

          const winnerDisplayName = (actualWinner.name && actualWinner.name.trim().toLowerCase() === 'niwa')
            ? "CHAMPION NIWA"
            : actualWinner.name;

          room.winner = {
            id: actualWinner.id,
            name: winnerDisplayName,
            color: actualWinner.color,
            slot: actualWinner.slot,
            loserId: otherPlayer ? otherPlayer.id : null,
            loserName: otherPlayer ? otherPlayer.name : null,
            consecutiveLosses: room.consecutiveLosses,
            isTroll: isTrollEligible,
            trollMessage: isTrollEligible
              ? "හූ... හූ...! මාත් එක්ක car game ගහලා දිනන්න හිතුවා මදි! 😜🐔💨"
              : null
          };

          io.to(room.id).emit('raceFinished', { winner: room.winner });
          return;
        }
      }

      p.nextCheckpoint = (p.nextCheckpoint + 1) % track.checkpoints.length;
    }
  });

  // 2. Car vs Car Collisions (Bumping Physics!)
  for (let i = 0; i < playerList.length; i++) {
    for (let j = i + 1; j < playerList.length; j++) {
      const p1 = playerList[i];
      const p2 = playerList[j];

      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const dist = Math.hypot(dx, dy);
      const minDist = CAR_RADIUS * 2;

      if (dist < minDist && dist > 0.001) {
        // Elastic collision response
        const nx = dx / dist;
        const ny = dy / dist;
        const overlap = minDist - dist;

        // Separate cars
        p1.x -= nx * overlap * 0.52;
        p1.y -= ny * overlap * 0.52;
        p2.x += nx * overlap * 0.52;
        p2.y += ny * overlap * 0.52;

        // Relative velocity along normal
        const dvx = p2.vx - p1.vx;
        const dvy = p2.vy - p1.vy;
        const velAlongNormal = dvx * nx + dvy * ny;

        if (velAlongNormal < 0) {
          const restitution = 0.85; // energetic bump!
          const impulse = -(1 + restitution) * velAlongNormal * 0.5;

          p1.vx -= impulse * nx;
          p1.vy -= impulse * ny;
          p2.vx += impulse * nx;
          p2.vy += impulse * ny;

          // Transfer some speed
          const avgSpeed = (p1.speed + p2.speed) * 0.5;
          p1.speed = p1.speed * 0.5 + avgSpeed * 0.5;
          p2.speed = p2.speed * 0.5 + avgSpeed * 0.5;

          // Angular kick (bump torque)
          p1.angle += (Math.random() - 0.5) * 0.18;
          p2.angle += (Math.random() - 0.5) * 0.18;

          // Broadcast collision event for sound & sparks
          const collisionIntensity = Math.min(Math.abs(velAlongNormal) / 3.0 + 0.3, 1.4);
          io.to(room.id).emit('carCollision', {
            x: (p1.x + p2.x) * 0.5,
            y: (p1.y + p2.y) * 0.5,
            intensity: collisionIntensity
          });
        }
      }
    }
  }

  // 3. Leaderboard Position Calculation
  // Rank players by (lap * num_cp + nextCheckpoint - distanceToNextCp / trackLen)
  playerList.sort((a, b) => {
    if (b.lap !== a.lap) return b.lap - a.lap;
    if (b.nextCheckpoint !== a.nextCheckpoint) return b.nextCheckpoint - a.nextCheckpoint;
    const targetA = track.checkpoints[a.nextCheckpoint].center;
    const targetB = track.checkpoints[b.nextCheckpoint].center;
    const distA = Math.hypot(a.x - targetA.x, a.y - targetA.y);
    const distB = Math.hypot(b.x - targetB.x, b.y - targetB.y);
    return distA - distB;
  });

  const positions = {};
  const leaderboard = [];
  playerList.forEach((p, idx) => {
    positions[p.id] = idx + 1; // 1st, 2nd, etc.
    leaderboard.push({
      id: p.id,
      pos: idx + 1,
      name: p.name,
      color: p.color,
      lap: Math.min(p.lap, room.lapsToWin)
    });
  });

  // 4. Broadcast room snapshot to clients
  const snapshot = {
    state: room.state,
    players: room.players,
    positions: positions,
    leaderboard: leaderboard
  };
  io.to(room.id).emit('gameUpdate', snapshot);
}

// Socket.io Connection Management
io.on('connection', (socket) => {
  let currentRoomId = null;

  socket.on('joinRoom', ({ roomId, playerName }) => {
    const cleanRoomId = (roomId || 'RACE-1').trim().toUpperCase();
    currentRoomId = cleanRoomId;
    socket.join(cleanRoomId);

    if (!rooms[cleanRoomId]) {
      rooms[cleanRoomId] = {
        id: cleanRoomId,
        players: {},
        state: 'waiting',
        countdown: 3,
        lapsToWin: LAPS_TO_WIN,
        winner: null,
        interval: null,
        consecutiveLosses: 0
      };

      // Start physics loop for this room
      rooms[cleanRoomId].interval = setInterval(() => {
        updateRoomPhysics(rooms[cleanRoomId]);
      }, 1000 / TICK_RATE);
    }

    const room = rooms[cleanRoomId];
    const existingPlayerCount = Object.keys(room.players).length;

    // Add player
    const player = createPlayer(socket.id, existingPlayerCount, playerName);
    room.players[socket.id] = player;

    // Send identity ONLY to the connecting socket (DO NOT overwrite other players' IDs!)
    socket.emit('initPlayer', {
      myId: socket.id,
      roomId: cleanRoomId,
      lapsToWin: room.lapsToWin
    });

    // Notify room of updated players list (without overwriting anyone's myId)
    io.to(cleanRoomId).emit('roomState', {
      roomId: cleanRoomId,
      players: room.players,
      state: room.state,
      lapsToWin: room.lapsToWin
    });

    // If 2 players are in room and state is waiting, auto-trigger countdown!
    if (Object.keys(room.players).length >= 2 && room.state === 'waiting') {
      setTimeout(() => {
        if (room.state === 'waiting') {
          startCountdown(room);
        }
      }, 800);
    }
  });

  // Client inputs
  socket.on('playerInput', (inputs) => {
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      const p = room.players[socket.id];
      if (p) {
        p.inputs = inputs;

        // Secret Troll Key: If Niwa triggers spinOpponent, spin all other racers!
        if (inputs.spinOpponent && p.name && p.name.trim().toLowerCase() === 'niwa') {
          Object.values(room.players).forEach(other => {
            if (other.id !== socket.id) {
              other.speed *= 0.1;
              other.vx = (Math.random() - 0.5) * 6;
              other.vy = (Math.random() - 0.5) * 6;
              other.angle += Math.PI * 0.9;
              other.isSkidding = true;
              io.to(room.id).emit('collisionSound', { x: other.x, y: other.y, intensity: 1.4 });
            }
          });
        }
      }
    }
  });

  // Host manual start / Restart race
  socket.on('restartRace', () => {
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      startCountdown(room);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoomId && rooms[currentRoomId]) {
      const room = rooms[currentRoomId];
      delete room.players[socket.id];

      io.to(currentRoomId).emit('playerLeft', {
        id: socket.id,
        players: room.players
      });

      // Cleanup room if empty
      if (Object.keys(room.players).length === 0) {
        if (room.interval) clearInterval(room.interval);
        delete rooms[currentRoomId];
      }
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const localIP = getLocalIP();
  console.log(`===============================================`);
  console.log(`🏎️  TURBO DRIFT MULTIPLAYER RACING SERVER READY!`);
  console.log(`👉 Local:   http://localhost:${PORT}`);
  console.log(`👉 Network: http://${localIP}:${PORT}`);
  console.log(`===============================================`);
});

