import * as THREE from 'three';

const MAX = 3500;

export class Particles {
  constructor(scene) {
    this.pos = new Float32Array(MAX * 3);
    this.col = new Float32Array(MAX * 3);
    this.attr = new Float32Array(MAX * 2); // size, alpha
    this.vel = new Float32Array(MAX * 3);
    this.life = new Float32Array(MAX);
    this.maxLife = new Float32Array(MAX);
    this.grav = new Float32Array(MAX);
    this.baseSize = new Float32Array(MAX);
    this.cursor = 0;
    this.pos.fill(-9999);

    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 3));
    g.setAttribute('aSA', new THREE.BufferAttribute(this.attr, 2));

    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: `
        attribute vec3 aColor;
        attribute vec2 aSA;
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vColor = aColor;
          vAlpha = aSA.y;
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = aSA.x * (240.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        varying vec3 vColor;
        varying float vAlpha;
        void main() {
          vec2 d = gl_PointCoord - 0.5;
          float r = length(d);
          if (r > 0.5) discard;
          float a = smoothstep(0.5, 0.0, r) * vAlpha;
          gl_FragColor = vec4(vColor, a);
        }`,
    });
    this.points = new THREE.Points(g, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this._c = new THREE.Color();
  }

  spawn(x, y, z, vx, vy, vz, colorHex, size, life, grav = 0) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % MAX;
    this.pos.set([x, y, z], i * 3);
    this.vel.set([vx, vy, vz], i * 3);
    this._c.set(colorHex);
    this.col.set([this._c.r, this._c.g, this._c.b], i * 3);
    this.life[i] = life;
    this.maxLife[i] = life;
    this.baseSize[i] = size;
    this.grav[i] = grav;
    this.attr[i * 2 + 1] = 1;
  }

  burst(p, n, colorHex, speed, life, size, up = 1.5, grav = -4) {
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2;
      const r = Math.random();
      this.spawn(
        p.x, p.y + 0.2, p.z,
        Math.cos(a) * speed * r, up * (0.4 + Math.random()), Math.sin(a) * speed * r,
        colorHex, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), grav
      );
    }
  }

  flame(p, dir, colorHex) {
    this.spawn(
      p.x + (Math.random() - 0.5) * 0.5, p.y, p.z + (Math.random() - 0.5) * 0.5,
      dir.x * 14 + (Math.random() - 0.5) * 4, 1 + Math.random() * 2, dir.z * 14 + (Math.random() - 0.5) * 4,
      Math.random() < 0.6 ? colorHex : 0xffffff, 0.9 + Math.random() * 0.7, 0.3 + Math.random() * 0.15, 2
    );
  }

  sparks(p, normal) {
    for (let k = 0; k < 14; k++) {
      this.spawn(
        p.x, p.y + 0.3 + Math.random() * 0.4, p.z,
        normal.x * (4 + Math.random() * 10) + (Math.random() - 0.5) * 7,
        2 + Math.random() * 5,
        normal.z * (4 + Math.random() * 10) + (Math.random() - 0.5) * 7,
        Math.random() < 0.5 ? 0xffd76a : 0xfff2c0, 0.35 + Math.random() * 0.4,
        0.3 + Math.random() * 0.4, -14
      );
    }
  }

  update(dt) {
    for (let i = 0; i < MAX; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.pos[i * 3 + 1] = -9999;
        this.attr[i * 2 + 1] = 0;
        continue;
      }
      const o = i * 3;
      this.vel[o + 1] += this.grav[i] * dt;
      this.pos[o] += this.vel[o] * dt;
      this.pos[o + 1] += this.vel[o + 1] * dt;
      this.pos[o + 2] += this.vel[o + 2] * dt;
      const t = this.life[i] / this.maxLife[i];
      this.attr[i * 2] = this.baseSize[i] * (0.5 + t);
      this.attr[i * 2 + 1] = Math.min(1, t * 2.5);
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.aSA.needsUpdate = true;
    this.points.geometry.attributes.aColor.needsUpdate = true;
  }
}
