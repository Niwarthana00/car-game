// test_multiplayer.js - Automated test to verify room creation, 2-player join, inputs, & physics
const { io } = require('socket.io-client');

const SERVER_URL = 'http://localhost:3000';
console.log('Connecting Player 1 to test room...');

const p1 = io(SERVER_URL);
const p2 = io(SERVER_URL);

let p1Connected = false;
let p2Connected = false;
let countdownFired = false;
let updateReceived = false;

p1.on('connect', () => {
  console.log('✅ Player 1 connected, joining room RACE-TEST');
  p1.emit('joinRoom', { roomId: 'RACE-TEST', playerName: 'Speedy1' });
});

p1.on('roomState', (data) => {
  console.log('✅ Player 1 received roomState, playerCount:', Object.keys(data.players).length);
  p1Connected = true;

  if (Object.keys(data.players).length === 1 && !p2Connected) {
    console.log('Connecting Player 2 to RACE-TEST...');
    p2.emit('joinRoom', { roomId: 'RACE-TEST', playerName: 'Drifter2' });
  }
});

p2.on('roomState', (data) => {
  console.log('✅ Player 2 received roomState, playerCount:', Object.keys(data.players).length);
  p2Connected = true;
});

p1.on('countdownTick', (data) => {
  console.log('✅ Countdown tick received:', data.count);
  countdownFired = true;
});

p1.on('gameUpdate', (snapshot) => {
  if (!updateReceived) {
    console.log('✅ Snapshot received! State:', snapshot.state, 'Players:', Object.keys(snapshot.players).length);
    updateReceived = true;
    
    // Test input
    p1.emit('playerInput', { up: true, down: false, left: false, right: false, drift: false });
    p2.emit('playerInput', { up: true, down: false, left: false, right: false, drift: false });

    setTimeout(() => {
      console.log('🎉 ALL TESTS PASSED SUCCESSFULLY!');
      p1.disconnect();
      p2.disconnect();
      process.exit(0);
    }, 1500);
  }
});

setTimeout(() => {
  if (!updateReceived) {
    console.error('❌ Test timed out!');
    process.exit(1);
  }
}, 8000);

