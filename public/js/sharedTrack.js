// sharedTrack.js - High-Speed Pure Straightaway Circuit (Long flat straights, easy rounded corners)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.GameTrack = factory();
  }
}(typeof self !== 'undefined' ? self : this, function () {

  const WORLD_WIDTH = 2600;
  const WORLD_HEIGHT = 1500;
  const ROAD_WIDTH = 230; // Extra wide road for super easy driving!
  const HALF_ROAD = ROAD_WIDTH / 2;

  // Pure Straightaway Speedway Layout:
  // - Bottom is a 100% horizontal flat straight (y = 1100)
  // - Top is a 100% horizontal flat straight (y = 400)
  // - Left & Right are smooth, gentle rounded 180 corners!
  const waypoints = [
    { x: 1300, y: 1100 }, // 0: Start / Finish Line (Dead-center of the flat bottom straight!)
    { x: 1750, y: 1100 }, // 1: Flat straight continuing east
    { x: 2150, y: 1100 }, // 2: Approaching gentle turn
    { x: 2380, y: 1000 }, // 3: Turn 1 gentle right entry
    { x: 2470, y: 750  }, // 4: Turn 1-2 smooth apex
    { x: 2380, y: 500  }, // 5: Turn 2 gentle right exit
    { x: 2150, y: 400  }, // 6: Onto flat top straight
    { x: 1300, y: 400  }, // 7: Dead-center of flat top straight
    { x: 450,  y: 400  }, // 8: Approaching gentle left turn
    { x: 220,  y: 500  }, // 9: Turn 3 gentle entry
    { x: 130,  y: 750  }, // 10: Turn 3-4 smooth apex
    { x: 220,  y: 1000 }, // 11: Turn 4 gentle exit
    { x: 450,  y: 1100 }  // 12: Back onto flat bottom straight!
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
  const SAMPLES_PER_SEGMENT = 30;
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

  // Checkpoints: 6 checkpoints (Start/Finish is dead-center of bottom straight)
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
      x1: pt.x - norm.nx * (HALF_ROAD + 35),
      y1: pt.y - norm.ny * (HALF_ROAD + 35),
      x2: pt.x + norm.nx * (HALF_ROAD + 35),
      y2: pt.y + norm.ny * (HALF_ROAD + 35),
      tx: norm.tx,
      ty: norm.ty,
      radius: HALF_ROAD + 45
    });
  }

  // Starting grid positions (Placed behind Start/Finish on the flat bottom straight)
  // Facing exactly East (angle = 0)
  const cp0 = checkpoints[0].center; // around (1300, 1100)

  const startPositions = [
    {
      x: cp0.x - 140,
      y: cp0.y - 45,
      angle: 0
    },
    {
      x: cp0.x - 220,
      y: cp0.y + 45,
      angle: 0
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
