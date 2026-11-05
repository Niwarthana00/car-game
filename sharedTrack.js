// sharedTrack.js - Shared track definition between Server & Client
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameTrack = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const WORLD_WIDTH = 2600;
  const WORLD_HEIGHT = 1800;
  const ROAD_WIDTH = 180; // wide enough for bumping and overtaking
  const HALF_ROAD = ROAD_WIDTH / 2;

  // Master waypoints for the racing circuit (Clockwise)
  const waypoints = [
    { x: 500,  y: 1500 }, // 0: Start straight
    { x: 1000, y: 1500 }, // 1: Main straight fast
    { x: 1600, y: 1500 }, // 2: Approaching Turn 1
    { x: 2100, y: 1400 }, // 3: Turn 1 sweep
    { x: 2350, y: 1050 }, // 4: Turn 1 apex
    { x: 2150, y: 650 },  // 5: Turn 1 exit
    { x: 1650, y: 550 },  // 6: Chicane entry
    { x: 1350, y: 780 },  // 7: Chicane dip
    { x: 1050, y: 480 },  // 8: Chicane rise
    { x: 550,  y: 420 },  // 9: Back straight hairpin approach
    { x: 250,  y: 750 },  // 10: Hairpin bottom
    { x: 300,  y: 1100 }, // 11: Final sweeper
    { x: 250,  y: 1350 }  // 12: Heading to main straight
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
  const SAMPLES_PER_SEGMENT = 24;
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

  // Compute normals and track boundaries (inner and outer edges)
  const leftEdge = [];
  const rightEdge = [];
  const trackNormals = [];

  for (let i = 0; i < centerPoints.length; i++) {
    const curr = centerPoints[i];
    const next = centerPoints[(i + 1) % centerPoints.length];
    const prev = centerPoints[(i - 1 + centerPoints.length) % centerPoints.length];

    // Tangent direction
    const dx = next.x - prev.x;
    const dy = next.y - prev.y;
    const len = Math.hypot(dx, dy) || 1;
    const tx = dx / len;
    const ty = dy / len;

    // Normal (perpendicular)
    const nx = -ty;
    const ny = tx;
    trackNormals.push({ nx, ny, tx, ty });

    // Left is -normal, Right is +normal
    leftEdge.push({
      x: curr.x - nx * HALF_ROAD,
      y: curr.y - ny * HALF_ROAD
    });
    rightEdge.push({
      x: curr.x + nx * HALF_ROAD,
      y: curr.y + ny * HALF_ROAD
    });
  }

  // Define 8 checkpoints around the track
  // Checkpoint 0 is Start/Finish line
  const NUM_CHECKPOINTS = 8;
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
      // Segment from left boundary to right boundary
      x1: pt.x - norm.nx * (HALF_ROAD + 20),
      y1: pt.y - norm.ny * (HALF_ROAD + 20),
      x2: pt.x + norm.nx * (HALF_ROAD + 20),
      y2: pt.y + norm.ny * (HALF_ROAD + 20),
      // Direction car should be moving when crossing
      tx: norm.tx,
      ty: norm.ty,
      radius: HALF_ROAD + 20
    });
  }

  // Starting grid positions (behind checkpoint 0)
  // Checkpoint 0 is at centerPoints[0] (around x:500, y:1500)
  const startNorm = trackNormals[0];
  const startDir = { x: startNorm.tx, y: startNorm.ty };
  const cp0 = checkpoints[0].center;

  // Staggered grid 80px and 140px behind finish line
  const startPositions = [
    {
      x: cp0.x - startDir.x * 100 - startNorm.nx * 40,
      y: cp0.y - startDir.y * 100 - startNorm.ny * 40,
      angle: Math.atan2(startDir.y, startDir.x)
    },
    {
      x: cp0.x - startDir.x * 160 + startNorm.nx * 40,
      y: cp0.y - startDir.y * 160 + startNorm.ny * 40,
      angle: Math.atan2(startDir.y, startDir.x)
    }
  ];

  // Helper: check if point (px, py) is on the tarmac track
  // Returns { onTrack: boolean, distanceToCenter: number, nearestIndex: number }
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

