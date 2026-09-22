import * as THREE from 'three';

const TOP = 60, TOP_BOOST = 82, REVERSE_TOP = -22;
const ACCEL = 42, BRAKE = 60, DRAG = 0.55, ROLL_FRICTION = 3.2;
const TURN = 2.7, GRIP = 7.0;
const CAR_RADIUS = 1.9;

function hullGeometry() {
  const s = new THREE.Shape();
  s.moveTo(0, 1.9);
  s.lineTo(0.62, 1.15);
  s.lineTo(0.85, 0.1);
  s.lineTo(0.78, -1.35);
  s.lineTo(0.45, -1.75);
  s.lineTo(-0.45, -1.75);
  s.lineTo(-0.78, -1.35);
  s.lineTo(-0.85, 0.1);
  s.lineTo(-0.62, 1.15);
  s.closePath();
  const g = new THREE.ExtrudeGeometry(s, { depth: 0.32, bevelEnabled: true, bevelThickness: 0.1, bevelSize: 0.08, bevelSegments: 2 });
  g.rotateX(Math.PI / 2);
  g.translate(0, 0.42, -0.05);
  return g;
}

function glowSprite(colorHex) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d');
  const col = new THREE.Color(colorHex);
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, `rgba(${col.r * 255 | 0},${col.g * 255 | 0},${col.b * 255 | 0},0.9)`);
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Car {
  constructor(colorHex, name) {
    this.color = new THREE.Color(colorHex);
    this.name = name;
    this.group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x14101f, metalness: 0.85, roughness: 0.32,
      emissive: this.color, emissiveIntensity: 0.06,
    });
    const hull = new THREE.Mesh(hullGeometry(), bodyMat);
    this.group.add(hull);

    const canopy = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 20, 14),
      new THREE.MeshStandardMaterial({ color: 0x0a0a14, metalness: 0.9, roughness: 0.1, emissive: this.color, emissiveIntensity: 0.25 })
    );
    canopy.scale.set(0.8, 0.42, 1.15);
    canopy.position.set(0, 0.62, -0.15);
    this.group.add(canopy);

    const stripMat = new THREE.MeshBasicMaterial({ color: colorHex });
    for (const side of [-1, 1]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 2.6), stripMat);
      strip.position.set(side * 0.72, 0.45, -0.15);
      this.group.add(strip);
      const pod = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.22, 1.5), bodyMat);
      pod.position.set(side * 0.95, 0.3, -0.9);
      this.group.add(pod);
    }

    const wing = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.08, 0.5), bodyMat);
    wing.position.set(0, 0.85, -1.72);
    this.group.add(wing);
    const wingGlow = new THREE.Mesh(new THREE.BoxGeometry(1.94, 0.05, 0.12), stripMat);
    wingGlow.position.set(0, 0.86, -1.95);
    this.group.add(wingGlow);
    for (const side of [-1, 1]) {
      const strut = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.4, 0.12), bodyMat);
      strut.position.set(side * 0.7, 0.62, -1.72);
      this.group.add(strut);
      const plate = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.34, 0.55), stripMat);
      plate.position.set(side * 0.96, 0.85, -1.72);
      this.group.add(plate);
    }

    // engine glow block at rear
    this.engineGlow = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.22, 0.1),
      new THREE.MeshBasicMaterial({ color: colorHex })
    );
    this.engineGlow.position.set(0, 0.4, -1.83);
    this.group.add(this.engineGlow);

    // underglow
    const glowTex = glowSprite(colorHex);
    const under = new THREE.Mesh(
      new THREE.PlaneGeometry(4.6, 6.4),
      new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending })
    );
    under.rotation.x = -Math.PI / 2;
    under.position.y = -0.28;
    this.group.add(under);

    // headlights
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.08, 0.06), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    head.position.set(0, 0.38, 1.88);
    this.group.add(head);

    // state
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.heading = 0;
    this.speed = 0;
    this.steerVis = 0;
    this.input = { up: false, down: false, left: false, right: false, boost: false };
    this.boost = 100;
    this.boosting = false;
    this.bobPhase = Math.random() * 6;
    this.scrapeCd = 0;
    this._fwd = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
  }

  reset(pos, heading) {
    this.pos.copy(pos);
    this.vel.set(0, 0, 0);
    this.heading = heading;
    this.speed = 0;
    this.boost = 100;
    this.boosting = false;
    this.group.position.copy(pos);
    this.group.rotation.set(0, heading, 0);
  }

  forward() {
    return this._fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }

  exhaust() {
    return this._tmp.copy(this.pos).addScaledVector(this.forward(), -1.9).setY(0.45);
  }

  update(dt, track, events) {
    const inp = this.input;

    // steering authority grows with speed, caps, and inverts in reverse
    const spdAbs = Math.abs(this.speed);
    const authority = Math.min(spdAbs / 14, 1) * (1 - Math.min(spdAbs / 200, 0.3));
    let steer = 0;
    if (inp.left) steer += 1;
    if (inp.right) steer -= 1;
    this.heading += steer * TURN * authority * Math.sign(this.speed || 1) * dt;
    this.steerVis += (steer - this.steerVis) * Math.min(dt * 10, 1);

    // boost
    this.boosting = inp.boost && this.boost > 0.5 && this.speed > 2;
    if (this.boosting) this.boost = Math.max(0, this.boost - 30 * dt);
    else this.boost = Math.min(100, this.boost + 11 * dt);

    const top = this.boosting ? TOP_BOOST : TOP;

    if (inp.up) this.speed += ACCEL * (this.boosting ? 1.55 : 1) * dt;
    if (inp.down) this.speed -= (this.speed > 0 ? BRAKE : ACCEL * 0.7) * dt;
    if (!inp.up && !inp.down) {
      this.speed -= Math.sign(this.speed) * Math.min(Math.abs(this.speed), ROLL_FRICTION * dt * Math.max(1, spdAbs * 0.06));
    }
    this.speed -= this.speed * DRAG * dt * 0.16;
    this.speed = THREE.MathUtils.clamp(this.speed, REVERSE_TOP, top);

    // velocity approaches heading direction with grip -> drift feel
    const fwd = this.forward();
    const target = this._tmp.copy(fwd).multiplyScalar(this.speed);
    this.vel.lerp(target, Math.min(GRIP * dt, 1));
    this.pos.addScaledVector(this.vel, dt);

    // lateral slide detection for sparks
    const slide = this.vel.clone().sub(target).length();

    // road constraint
    const ni = track.nearest(this.pos, this._lastNi ?? -1);
    this._lastNi = ni;
    const s = track.samples[ni];
    this._tmp.copy(this.pos).sub(s.pos);
    const lat = this._tmp.dot(s.normal);
    const lim = track.roadHalf - 1.3;
    if (Math.abs(lat) > lim) {
      const over = Math.abs(lat) - lim;
      this.pos.addScaledVector(s.normal, -Math.sign(lat) * over);
      const vLat = this.vel.dot(s.normal);
      if (Math.sign(vLat) === Math.sign(lat)) {
        this.vel.addScaledVector(s.normal, -vLat * 1.4);
        const impact = Math.abs(vLat);
        if (impact > 6) {
          events.push({ type: 'wall', car: this, impact, pos: this.pos.clone() });
          this.speed *= Math.max(0.4, 1 - impact * 0.02);
        }
      }
      if (spdAbs > 18 && this.scrapeCd <= 0) {
        events.push({ type: 'scrape', car: this, pos: this.pos.clone(), normal: s.normal.clone().multiplyScalar(-Math.sign(lat)) });
        this.scrapeCd = 0.09;
        this.speed *= 0.995;
      }
    }
    this.scrapeCd -= dt;
    this.nearestIdx = ni;
    this.slide = slide;

    // hover pose
    this.bobPhase += dt * (2.4 + spdAbs * 0.05);
    this.group.position.set(this.pos.x, 0.34 + Math.sin(this.bobPhase) * 0.05, this.pos.z);
    this.group.rotation.set(
      THREE.MathUtils.clamp(-this.speed * 0.0009, -0.05, 0.05) + (this.input.up ? -0.02 : 0.012),
      this.heading,
      THREE.MathUtils.clamp(-this.steerVis * authority * 0.32, -0.4, 0.4)
    );
    const glow = 0.8 + (this.boosting ? 1.6 : 0) + spdAbs * 0.008;
    this.engineGlow.scale.setScalar(glow);
  }

  collideWith(other, events) {
    const d = this._tmp.copy(this.pos).sub(other.pos);
    d.y = 0;
    const dist = d.length();
    const min = CAR_RADIUS * 2;
    if (dist < min && dist > 0.0001) {
      const push = (min - dist) / 2;
      d.normalize();
      this.pos.addScaledVector(d, push);
      other.pos.addScaledVector(d, -push);
      const rel = this.vel.dot(d) - other.vel.dot(d);
      if (rel < 0) {
        const imp = rel * 0.55;
        this.vel.addScaledVector(d, -imp);
        other.vel.addScaledVector(d, imp);
        if (-rel > 8) events.push({ type: 'bump', pos: this.pos.clone().add(other.pos).multiplyScalar(0.5), impact: -rel });
      }
      this.speed *= 0.96;
      other.speed *= 0.96;
    }
  }
}
