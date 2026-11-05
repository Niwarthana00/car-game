# 🏎️ TURBO DRIFT - Online Multiplayer 2D Car Racing

A real-time, browser-based 2D multiplayer racing game built with **Node.js, Express, Socket.io, HTML5 Canvas**, and the **Web Audio API**.

---

## ✨ Features

- **Real-Time Online Multiplayer**: Play with friends via Room Codes (`RACE-1`, `TURBO-7`) or direct links.
- **Car-to-Car Bumping & Collisions**: Cars bump and push each other off the track with realistic elastic collision physics, collision torque, spark particles, and metal crunch sounds!
- **Lap Tracking & Fair Checkpoint System**: 8-checkpoint circuit system to prevent track cutting; first to complete **3 laps** wins with victory fanfare and confetti!
- **Smooth Drifting Physics**: Tarmac grip and grass deceleration, with active tire skidmark trails and smoke particles.
- **Pure Web Audio API Sound Synthesizer**: Engine revs, tire screeches, crash crunches, F1 countdown beeps, and victory fanfare without needing external audio file downloads!
- **Mini-Map Radar**: Real-time track overview showing opponent position.
- **Cross-Platform Controls**: Keyboard (`WASD` / `Arrow Keys` + `Space` for drift) and on-screen **touch controls** for mobile/tablet browsers.

---

## 🚀 How to Run the Game

### 1. Start the Server
Open PowerShell in the project directory and run:
```bash
npm start
```
You will see:
```text
🏎️  TURBO DRIFT MULTIPLAYER RACING SERVER READY!
👉 Local:   http://localhost:3000
👉 Network: http://192.168.x.x:3000
```

---

## 🎮 How to Play with a Friend

### Option A: On the Same Computer (Testing / Split Screen)
1. Open [http://localhost:3000](http://localhost:3000) in **Tab 1** (Enter Name: `Racer 1`, Room: `RACE-1`).
2. Open [http://localhost:3000](http://localhost:3000) in **Tab 2** or an Incognito window (Enter Name: `Racer 2`, Room: `RACE-1`).
3. As soon as both enter the room, the **3... 2... 1... GO!** countdown begins automatically!

### Option B: On the Same Wi-Fi / Hotspot (Phone or Laptop)
1. Check the **Network URL** shown in the terminal (e.g. `http://192.168.1.50:3000`).
2. Give that link to your friend on their phone or laptop.
3. They join the same Room Code, and you're racing immediately!

### Option C: Over the Internet (Play from Anywhere)
You can expose your local server for free in seconds using [ngrok](https://ngrok.com) or [Cloudflare Tunnel](https://developers.cloudflare.com/pages/):
```bash
npx ngrok http 3000
```
Send the resulting `https://xxxx.ngrok-free.app` link to your friend anywhere in the world!

---

## ⌨️ Controls

| Action | Keyboard | Mobile / Touch |
| :--- | :--- | :--- |
| **Accelerate** | `W` or `↑ Arrow` | `▲` Button |
| **Brake / Reverse** | `S` or `↓ Arrow` | `▼` Button |
| **Steer Left** | `A` or `← Arrow` | `◀` Button |
| **Steer Right** | `D` or `→ Arrow` | `▶` Button |
| **Handbrake / Drift** | `Spacebar` | Automatic in sharp turns |

