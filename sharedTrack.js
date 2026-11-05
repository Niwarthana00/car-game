// sharedTrack.js - High-Speed Super Speedway Circuit (Gentle curves, huge straights!)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameTrack = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const WORLD_WIDTH = 2600;
  const WORLD_HEIGHT = 1500;
  const ROAD_WIDTH = 220; // Extra wide road for easy driving, bumping, and overtaking!
  const HALF_ROAD = ROAD_WIDTH / 2;

  // Super Speedway Track Layout:
  // Huge main straight + gentle wide sweeping right turn + long back straight + gentle wide left turn!
  const waypoints = [
    { x: 600,  y: 1150 }, // 0: Start / Finish Line
    { x: 1100, y: 1150 }, // 1: Main straight fast
    { x: 1650, y: 1150 }, // 2: Main straight exit
    { x: 2100, y: 1080 }, // 3: Turn 1 gentle entry
    { x: 2360, y: 880  }, // 4: Turn 1-2 wide apex
    { x: 2360, y: 620  }, // 5: Turn 2 exit
    { x: 2100, y: 420  }, // 6: Onto back straight
    { x: 1650, y: 350  }, // 7: Back straight fast
    { x: 1100, y: 350  }, // 8: Back straight speed zone
    { x: 600,  y: 350  }, // 9: Back straight braking zone
    { x: 300,  y: 450  }, // 10: Turn 3 gentle entry
    { x: 140,  y: 750  }, // 11: Turn 3-4 wide apex
    { x: 280,  y: 1050 }  // 12: Turn 4 exit to main straight
  ];

  // Catmull-Rom spline interpolation
  function catmullRom(p0, p1, p2, p3, t) {
    const v0 = (p2 - p0) * 0.5;
    const v1 = (p3 - p1) * 0.5;
    const t2 = t * t;
    const t3 = t * t2;
    return (2 * p1 - 2 * p2 + v0 + v1) * t3 +
           (-3 * p1 + 3 * p2 - 2 * v0 - v1) * t2 +
           v0 * t + p1;
  }

  // Generate smooth high-res centerline points
  const SAMPLES_PER_SEGMENT = 28;
  const centerPoints = [];

  for (let i = 0; i < waypoints.length; i++) {
    const p0 = waypoints[(i - 1 + waypoints.length) % waypoints.length];
    const p1 = waypoints[i];
    const p2 = waypoints[(i + 1) % waypoints.length];
    const p3 = waypoints[(i + 2) % waypoints.length];

    for (let s = 0; s < SAMPLES_PER_SEGMENT; s++) {
      const t = s / SAMPLES_PER_SEGMENT;
      const x = catmullRom(p0.x, p1.x, p2.x, p3.x, t);
      const y = catmullRom(p0.y, p1.y, p2.y, p3.y, t);
      centerPoints.push({ x, y });
    }
  }

  // Compute normals and track boundaries
  const leftEdge = [];
  const rightEdge = [];
  const trackNormals = [];

  for (let i = 0; i < centerPoints.length; i++) {
    const curr = centerPoints[i];
    const next = centerPoints[(i + 1) % centerPoints.length];
    const prev = centerPoints[(i - 1 + centerPoints.length) % centerPoints.length];

    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;

    const nx = -ty;
    const ny = tx;
    trackNormals.push({ nx, ny, tx, ty });

    leftEdge.push({
      x: curr.x - nx * HALF_ROAD,
      y: curr.y - ny * HALF_ROAD
    });
    rightEdge.push({
      x: curr.x + nx * HALF_ROAD,
      y: curr.y + ny * HALF_ROAD
    });
  }

  // Checkpoints: 6 checkpoints evenly placed around this high-speed speedway
  const NUM_CHECKPOINTS = 6;
  const checkpoints = [];
  const step = Math.floor(centerPoints.length / NUM_CHECKPOINTS);

  for (let c = 0; c < NUM_CHECKPOINTS; c++) {
    const idx = (c * step) % centerPoints.length;
    const pt = centerPoints[idx];
    const norm = trackNormals[idx];
    checkpoints.push({
      id: c,
      name: c === 0 ? 'START/FINISH' : `CP ${c}`,
      center: pt,
      idx: idx,
      x1: pt.x - norm.nx * (HALF_ROAD + 30),
      y1: pt.y - norm.ny * (HALF_ROAD + 30),
      x2: pt.x + norm.nx * (HALF_ROAD + 30),
      y2: pt.y + norm.ny * (HALF_ROAD + 30),
      tx: norm.tx,
      ty: norm.ty,
      radius: HALF_ROAD + 40
    });
  }

  // Starting grid positions (Behind Start/Finish line)
  const startNorm = trackNormals[0];
  const startDir = { x: startNorm.tx, y: startNorm.ty };
  const cp0 = checkpoints[0].center;

  const startPositions = [
    {
      x: cp0.x - startDir.x * 120 - startNorm.nx * 45,
      y: cp0.y - startDir.y * 120 - startNorm.ny * 45,
      angle: Math.atan2(startDir.y, startDir.x)
    },
    {
      x: cp0.x - startDir.x * 190 + startNorm.nx * 45,
      y: cp0.y - startDir.y * 190 + startNorm.ny * 45,
      angle: Math.atan2(startDir.y, startDir.x)
    }
  ];

  function checkTrackSurface(px, py) {
    let minDistSq = Infinity;
    let nearestIdx = 0;

    for (let i = 0; i < centerPoints.length; i += 2) {
      const p = centerPoints[i];
      const dSq = (px - p.x) * (px - p.x) + (py - p.y) * (py - p.y);
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearestIdx = i;
      }
    }

    const dist = Math.sqrt(minDistSq);
    return {
      onTrack: dist <= HALF_ROAD,
      distanceToCenter: dist,
      nearestIdx: nearestIdx
    };
  }

  return {
    WORLD_WIDTH,
    WORLD_HEIGHT,
    ROAD_WIDTH,
    HALF_ROAD,
    waypoints,
    centerPoints,
    leftEdge,
    rightEdge,
    trackNormals,
    checkpoints,
    startPositions,
    checkTrackSurface
  };
}));
