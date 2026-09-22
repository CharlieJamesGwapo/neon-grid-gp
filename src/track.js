import * as THREE from 'three';

const ROAD_HALF = 11;
const SAMPLES = 900;
const GATES = 10;

function canvasTexture(size, draw) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  draw(c.getContext('2d'), size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function buildRoad(curve, samples) {
  const n = samples.length;
  const pos = new Float32Array(n * 2 * 3);
  const uv = new Float32Array(n * 2 * 2);
  const col = new Float32Array(n * 2 * 3);
  const idx = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const s = samples[i];
    const l = v.copy(s.pos).addScaledVector(s.normal, -ROAD_HALF);
    pos.set([l.x, 0, l.z], i * 6);
    const r = v.copy(s.pos).addScaledVector(s.normal, ROAD_HALF);
    pos.set([r.x, 0, r.z], i * 6 + 3);
    const t = i / n * 220;
    uv.set([-0.5, t], i * 4); uv.set([0.5, t], i * 4 + 2);
    col.set([1, 1, 1], i * 6); col.set([1, 1, 1], i * 6 + 3);
    const a = i * 2, b = i * 2 + 1, c = (i * 2 + 2) % (n * 2), d = (i * 2 + 3) % (n * 2);
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();

  const map = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#0b0716'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(120,80,255,0.13)'; ctx.lineWidth = 1;
    for (let i = 0; i <= s; i += 32) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
  });
  map.colorSpace = THREE.SRGBColorSpace;

  const glow = canvasTexture(256, (ctx, s) => {
    ctx.fillStyle = '#000'; ctx.fillRect(0, 0, s, s);
    // center dashes
    ctx.fillStyle = 'rgba(60,220,255,0.55)';
    for (let y = 0; y < s; y += 64) ctx.fillRect(s / 2 - 2, y, 4, 34);
    // edge strips
    ctx.fillStyle = 'rgba(255,70,220,0.5)';
    ctx.fillRect(6, 0, 4, s); ctx.fillRect(s - 10, 0, 4, s);
  });
  glow.colorSpace = THREE.SRGBColorSpace;

  const mat = new THREE.MeshStandardMaterial({
    map, emissiveMap: glow, emissive: 0xffffff, emissiveIntensity: 1.4,
    roughness: 0.55, metalness: 0.5, vertexColors: true,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.receiveShadow = false;
  return mesh;
}

function buildRails(samples) {
  const n = samples.length;
  const group = new THREE.Group();
  const cA = new THREE.Color(0x22e6ff), cB = new THREE.Color(0xff3df0), c = new THREE.Color();
  const v = new THREE.Vector3(), w = new THREE.Vector3();
  for (const side of [-1, 1]) {
    const pos = new Float32Array(n * 4 * 3);
    const col = new Float32Array(n * 4 * 3);
    const idx = [];
    for (let i = 0; i < n; i++) {
      const s = samples[i];
      const edge = v.copy(s.pos).addScaledVector(s.normal, side * (ROAD_HALF + 0.6));
      const curb = w.copy(s.pos).addScaledVector(s.normal, side * (ROAD_HALF - 0.35));
      c.lerpColors(cA, cB, (Math.sin(i / n * Math.PI * 6) + 1) / 2);
      const o = i * 12;
      pos.set([edge.x, 0, edge.z], o);
      pos.set([edge.x, 0.9, edge.z], o + 3);
      pos.set([curb.x, 0.02, curb.z], o + 6);
      pos.set([curb.x, 0.3, curb.z], o + 9);
      col.set([c.r * 0.4, c.g * 0.4, c.b * 0.4], o);
      col.set([c.r, c.g, c.b], o + 3);
      col.set([c.r * 0.15, c.g * 0.15, c.b * 0.15], o + 6);
      col.set([c.r * 0.9, c.g * 0.9, c.b * 0.9], o + 9);
      for (const [a, b] of [[0, 1], [2, 3]]) {
        const p = i * 4, p2 = ((i + 1) % n) * 4;
        idx.push(p + a, p + b, p2 + a, p + b, p2 + b, p2 + a);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx);
    const mat = new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide });
    group.add(new THREE.Mesh(g, mat));
  }
  return group;
}

function buildGround() {
  const grid = canvasTexture(512, (ctx, s) => {
    ctx.fillStyle = '#04010c'; ctx.fillRect(0, 0, s, s);
    ctx.strokeStyle = 'rgba(60,190,255,0.34)'; ctx.lineWidth = 2;
    for (let i = 0; i <= s; i += 64) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
    ctx.strokeStyle = 'rgba(255,60,220,0.10)'; ctx.lineWidth = 1;
    for (let i = 0; i <= s; i += 16) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(s, i); ctx.stroke();
    }
  });
  grid.colorSpace = THREE.SRGBColorSpace;
  grid.repeat.set(90, 90);
  const mat = new THREE.MeshStandardMaterial({
    map: grid, emissiveMap: grid, emissive: 0xffffff, emissiveIntensity: 0.75,
    roughness: 0.9, metalness: 0.2,
  });
  const m = new THREE.Mesh(new THREE.CircleGeometry(1600, 64), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = -0.06;
  return m;
}

function buildSun() {
  const tex = canvasTexture(512, (ctx, s) => {
    const g = ctx.createLinearGradient(0, 40, 0, s - 40);
    g.addColorStop(0, '#ffe95a');
    g.addColorStop(0.45, '#ff9a3d');
    g.addColorStop(1, '#ff3df0');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(s / 2, s / 2, 200, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#04010c';
    let y = s / 2 + 18, h = 4;
    while (y < s / 2 + 200) { ctx.fillRect(0, y, s, h); y += h + 16; h += 3; }
  });
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(430, 430),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false })
  );
  m.position.set(0, 150, -1250);
  return m;
}

function buildStars() {
  const n = 1400, pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const r = 1000 + Math.random() * 300;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(Math.random() * 0.85);
    pos.set([r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph) + 20, r * Math.sin(ph) * Math.sin(th)], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  return new THREE.Points(g, new THREE.PointsMaterial({
    color: 0xbfd9ff, size: 2.2, sizeAttenuation: false, fog: false,
    transparent: true, opacity: 0.8,
  }));
}

function buildMountains() {
  const group = new THREE.Group();
  const geo = new THREE.ConeGeometry(1, 1, 5);
  const mat = new THREE.MeshBasicMaterial({ color: 0x0c0620 });
  const inst = new THREE.InstancedMesh(geo, mat, 90);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3();
  for (let i = 0; i < 90; i++) {
    const a = (i / 90) * Math.PI * 2 + Math.random() * 0.06;
    const r = 900 + Math.random() * 260;
    const h = 90 + Math.random() * 160;
    sc.set(80 + Math.random() * 130, h, 80 + Math.random() * 130);
    p.set(Math.cos(a) * r, h / 2 - 4, Math.sin(a) * r);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.random() * Math.PI);
    m.compose(p, q, sc);
    inst.setMatrixAt(i, m);
  }
  group.add(inst);
  return group;
}

function buildRings() {
  const group = new THREE.Group();
  const colors = [0x22e6ff, 0xff3df0, 0xffd76a, 0x8a5bff];
  for (let i = 0; i < 7; i++) {
    const r = 14 + Math.random() * 26;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(r, 0.35, 8, 80),
      new THREE.MeshBasicMaterial({ color: colors[i % 4], transparent: true, opacity: 0.55 })
    );
    const a = Math.random() * Math.PI * 2;
    const d = 380 + Math.random() * 420;
    ring.position.set(Math.cos(a) * d, 60 + Math.random() * 160, Math.sin(a) * d);
    ring.rotation.set(Math.random(), Math.random(), Math.random());
    ring.userData.spin = 0.05 + Math.random() * 0.15;
    group.add(ring);
  }
  return group;
}

function buildGates(samples) {
  const group = new THREE.Group();
  const gates = [];
  const step = Math.floor(samples.length / GATES);
  const curtainTex = canvasTexture(128, (ctx, s) => {
    const g = ctx.createLinearGradient(0, s, 0, 0);
    g.addColorStop(0, 'rgba(255,215,106,0.9)');
    g.addColorStop(1, 'rgba(255,215,106,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  });
  curtainTex.colorSpace = THREE.SRGBColorSpace;
  const postGeo = new THREE.CylinderGeometry(0.35, 0.5, 5.4, 8);
  const postMat = new THREE.MeshBasicMaterial({ color: 0xffd76a });
  for (let i = 0; i < GATES; i++) {
    const si = i * step;
    const s = samples[si];
    const gg = new THREE.Group();
    gg.position.copy(s.pos);
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    gg.rotation.y = yaw;
    const curtain = new THREE.Mesh(
      new THREE.PlaneGeometry(ROAD_HALF * 2, 5.4),
      new THREE.MeshBasicMaterial({ map: curtainTex, transparent: true, opacity: i === 0 ? 0.3 : 0.13, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    curtain.position.y = 2.7;
    gg.add(curtain);
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, i === 0 ? new THREE.MeshBasicMaterial({ color: 0xffffff }) : postMat);
      post.position.set(side * (ROAD_HALF + 0.6), 2.7, 0);
      gg.add(post);
    }
    if (i === 0) {
      // start arch beam
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(ROAD_HALF * 2 + 3, 0.7, 0.7),
        new THREE.MeshBasicMaterial({ color: 0xffffff })
      );
      beam.position.y = 6.2;
      gg.add(beam);
      const line = new THREE.Mesh(
        new THREE.PlaneGeometry(ROAD_HALF * 2, 3),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 })
      );
      line.rotation.x = -Math.PI / 2;
      line.position.y = 0.03;
      gg.add(line);
    }
    group.add(gg);
    gates.push({ index: si, pos: s.pos.clone(), curtain });
  }
  return { group, gates };
}

export function buildWorld(scene) {
  scene.fog = new THREE.FogExp2(0x070214, 0.00135);
  scene.background = new THREE.Color(0x04010c);

  const ctrl = [
    [0, -170], [120, -170], [195, -125], [215, -45],
    [175, 30], [205, 95], [160, 155], [60, 185],
    [-25, 145], [-45, 60], [-125, 40],
    [-195, 95], [-225, 10], [-195, -65],
    [-140, -125], [-70, -160],
  ].map(([x, z]) => new THREE.Vector3(x, 0, z));

  const curve = new THREE.CatmullRomCurve3(ctrl, true, 'catmullrom', 0.5);

  const samples = [];
  const pt = new THREE.Vector3(), tan = new THREE.Vector3();
  for (let i = 0; i < SAMPLES; i++) {
    const t = i / SAMPLES;
    curve.getPointAt(t, pt);
    curve.getTangentAt(t, tan);
    tan.y = 0; tan.normalize();
    samples.push({
      pos: pt.clone(),
      tangent: tan.clone(),
      normal: new THREE.Vector3(-tan.z, 0, tan.x),
      index: i,
    });
  }

  scene.add(buildGround());
  scene.add(buildRoad(curve, samples));
  scene.add(buildRails(samples));
  scene.add(buildSun());
  scene.add(buildStars());
  scene.add(buildMountains());
  const rings = buildRings();
  scene.add(rings);
  const { group: gateGroup, gates } = buildGates(samples);
  scene.add(gateGroup);

  const amb = new THREE.AmbientLight(0x3b2a6e, 1.6);
  scene.add(amb);
  const dir = new THREE.DirectionalLight(0x7a5cff, 0.7);
  dir.position.set(-200, 300, -400);
  scene.add(dir);
  const under = new THREE.PointLight(0xff3df0, 400, 500, 1.8);
  under.position.set(0, 60, 100);
  scene.add(under);

  const trackLength = curve.getLength();

  return {
    curve, samples, gates, rings, trackLength,
    roadHalf: ROAD_HALF, numSamples: SAMPLES, numGates: GATES,

    nearest(pos, hint = -1) {
      let best = 0, bd = Infinity;
      if (hint >= 0) {
        for (let k = -40; k <= 40; k++) {
          const i = (hint + k + SAMPLES) % SAMPLES;
          const d = pos.distanceToSquared(samples[i].pos);
          if (d < bd) { bd = d; best = i; }
        }
        if (bd < 30 * 30) return best;
      }
      for (let i = 0; i < SAMPLES; i++) {
        const d = pos.distanceToSquared(samples[i].pos);
        if (d < bd) { bd = d; best = i; }
      }
      return best;
    },
  };
}
