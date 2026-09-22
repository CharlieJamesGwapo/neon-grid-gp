import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { Pass } from 'three/addons/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { buildWorld } from './track.js';
import { Car } from './car.js';
import { Particles } from './effects.js';
import { Sound } from './audio.js';
import { HUD } from './hud.js';

const P1 = 0x22e6ff, P2 = 0xff3df0;
const TOTAL_LAPS = 3;
const GATE_TOL = 4;

// ---------- renderer / scene ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const track = buildWorld(scene);

const cams = [0, 1].map(() => new THREE.PerspectiveCamera(68, (innerWidth / 2) / innerHeight, 0.1, 4000));
const camState = [0, 1].map(() => ({ look: new THREE.Vector3(), shake: 0 }));

class SplitViewPass extends Pass {
  constructor(scene, cams) {
    super();
    this.scene = scene; this.cams = cams;
    this.needsSwap = false;
    this._size = new THREE.Vector2();
  }
  render(renderer, writeBuffer, readBuffer) {
    renderer.getSize(this._size);
    const w = this._size.x, h = this._size.y;
    renderer.setRenderTarget(readBuffer);
    renderer.setScissorTest(false);
    renderer.clear();
    renderer.setScissorTest(true);
    for (let i = 0; i < 2; i++) {
      renderer.setViewport(i * w / 2, 0, w / 2, h);
      renderer.setScissor(i * w / 2, 0, w / 2, h);
      renderer.render(this.scene, this.cams[i]);
    }
    renderer.setScissorTest(false);
    renderer.setViewport(0, 0, w, h);
  }
}

const composer = new EffectComposer(renderer);
composer.addPass(new SplitViewPass(scene, cams));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.55, 0.4, 0.5);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
  for (const c of cams) { c.aspect = (innerWidth / 2) / innerHeight; c.updateProjectionMatrix(); }
});

// ---------- entities ----------
const cars = [new Car(P1, 'P1'), new Car(P2, 'P2')];
cars.forEach(c => scene.add(c.group));
const particles = new Particles(scene);
const sound = new Sound();
const hud = new HUD(track);

// ---------- input ----------
const keys = {};
const KEYMAP = [
  { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', boost: 'ShiftLeft' },
  { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', boost: 'Enter' },
];
addEventListener('keydown', e => {
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Enter'].includes(e.code)) e.preventDefault();
  sound.ensure();
  if (!keys[e.code]) onKeyPress(e.code);
  keys[e.code] = true;
});
addEventListener('keyup', e => { keys[e.code] = false; });

function pollInputs() {
  for (let i = 0; i < 2; i++) {
    const m = KEYMAP[i], inp = cars[i].input;
    inp.up = !!keys[m.up]; inp.down = !!keys[m.down];
    inp.left = !!keys[m.left]; inp.right = !!keys[m.right];
    inp.boost = !!keys[m.boost];
  }
}

// ---------- race state ----------
const S = track.numSamples;
function newRaceState() {
  return { lap: 0, nextGate: 1, finished: false, finishTime: 0, finishRank: 0,
    lastLap: null, bestLap: null, lapStart: 0, wrongWay: false,
    lastIdx: 0, progVel: 0, totalLaps: TOTAL_LAPS };
}
let race = [newRaceState(), newRaceState()];
let state = 'title';          // title | countdown | race | finished
let ready = [false, false];
let countT = 0, countStep = -1, raceTime = 0, finishOrder = 0, confettiT = 0;
let paused = false;

const spawnIdx = S - 14;
function placeOnGrid() {
  for (let i = 0; i < 2; i++) {
    const s = track.samples[spawnIdx];
    const p = s.pos.clone().addScaledVector(s.normal, i === 0 ? -4 : 4);
    cars[i].reset(p, Math.atan2(s.tangent.x, s.tangent.z));
    cars[i]._lastNi = spawnIdx;
  }
}
placeOnGrid();

function onKeyPress(code) {
  if (code === 'KeyR' && state !== 'title') { startCountdown(); return; }
  if (code === 'Escape' && state === 'race') { paused = !paused; hud.setStatus(paused ? 'PAUSED — ESC TO RESUME' : ''); return; }
  if (state !== 'title') return;
  if (code === KEYMAP[0].up && !ready[0]) { ready[0] = true; hud.setReady(0, true); sound.ready(); }
  if (code === KEYMAP[1].up && !ready[1]) { ready[1] = true; hud.setReady(1, true); sound.ready(); }
  if (ready[0] && ready[1]) startCountdown();
}

function startCountdown() {
  race = [newRaceState(), newRaceState()];
  placeOnGrid();
  state = 'countdown';
  countT = 0; countStep = -1; raceTime = 0; finishOrder = 0;
  hud.hideOverlay();
  hud.setStatus('');
}

function autopilot(car, i) {
  const look = track.samples[(car._lastNi + 26 + i * 4) % S];
  const dx = look.pos.x - car.pos.x, dz = look.pos.z - car.pos.z;
  const want = Math.atan2(dx, dz);
  let d = want - car.heading;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  car.input.up = true;
  car.input.down = false;
  car.input.left = d > 0.06;
  car.input.right = d < -0.06;
  car.input.boost = false;
}

function updateRace(i, dt) {
  const car = cars[i], r = race[i];
  const ni = car.nearestIdx;

  // direction / wrong-way detection
  let dni = ni - r.lastIdx;
  if (dni > S / 2) dni -= S;
  if (dni < -S / 2) dni += S;
  r.lastIdx = ni;
  r.progVel += ((dni / Math.max(dt, 1e-4)) - r.progVel) * Math.min(dt * 4, 1);
  r.wrongWay = r.progVel < -12 && Math.abs(car.speed) > 6;

  // gates in strict sequence
  const g = track.gates[r.nextGate];
  let gd = Math.abs(ni - g.index);
  gd = Math.min(gd, S - gd);
  if (gd <= GATE_TOL) {
    r.nextGate = (r.nextGate + 1) % track.numGates;
    if (r.nextGate === 0) {
      // completed a full gate cycle -> lap
      r.lap++;
      const lapTime = raceTime - r.lapStart;
      r.lapStart = raceTime;
      r.lastLap = lapTime;
      r.bestLap = r.bestLap == null ? lapTime : Math.min(r.bestLap, lapTime);
      particles.burst(car.pos, 60, i === 0 ? P1 : P2, 14, 1.4, 1.4, 6, -5);
      if (r.lap >= TOTAL_LAPS && !r.finished) {
        r.finished = true;
        r.finishRank = ++finishOrder;
        onFinish(i);
      } else if (r.lap === TOTAL_LAPS - 1) {
        sound.finalLap();
        hud.setStatus(`PLAYER ${i + 1} — FINAL LAP`);
        statusT = 2.5;
      } else {
        sound.lap();
      }
    } else {
      sound.checkpoint();
      particles.burst(g.pos, 40, 0xffd76a, 10, 1.0, 1.0, 5, -4);
    }
  }
}

function onFinish(winnerIdx) {
  state = 'finished';
  const w = winnerIdx === 0 ? 'P1' : 'P2';
  const col = winnerIdx === 0 ? '#22e6ff' : '#ff3df0';
  sound.finish(winnerIdx === 0);
  const sub = `P1 BEST ${hud.fmt(race[0].bestLap)}  ·  P2 BEST ${hud.fmt(race[1].bestLap)}  ·  ${race[winnerIdx].lap} LAPS IN ${hud.fmt(raceTime)}`;
  setTimeout(() => hud.showWinner(w, col, sub), 900);
  particles.burst(cars[winnerIdx].pos, 200, 0xffd76a, 20, 2.2, 1.6, 10, -6);
}

let statusT = 0;
const clock = new THREE.Clock();
const _v = new THREE.Vector3(), _l = new THREE.Vector3();

function updateCameras(dt) {
  for (let i = 0; i < 2; i++) {
    const car = cars[i], cam = cams[i], cs = camState[i];
    const fwd = car.forward();
    const speed01 = Math.min(Math.abs(car.speed) / 82, 1);
    _v.copy(car.pos).addScaledVector(fwd, -7.2 - speed01 * 1.6);
    _v.y = 3.0 + speed01 * 0.7;
    cam.position.lerp(_v, Math.min(dt * 6.5, 1));
    _l.copy(car.pos).addScaledVector(fwd, 10);
    _l.y = 1.4;
    cs.look.lerp(_l, Math.min(dt * 9, 1));
    if (cs.shake > 0.001) {
      cam.position.x += (Math.random() - 0.5) * cs.shake;
      cam.position.y += (Math.random() - 0.5) * cs.shake;
      cam.position.z += (Math.random() - 0.5) * cs.shake;
      cs.shake *= Math.exp(-6 * dt);
    }
    cam.lookAt(cs.look);
    const targetFov = 66 + speed01 * 16 + (car.boosting ? 6 : 0);
    if (Math.abs(cam.fov - targetFov) > 0.05) {
      cam.fov += (targetFov - cam.fov) * Math.min(dt * 5, 1);
      cam.updateProjectionMatrix();
    }
  }
}

function tick() {
  requestAnimationFrame(tick);
  window.__dbg.frames++;
  const dt = Math.min(clock.getDelta(), 0.05);
  const events = [];

  if (state === 'countdown') {
    countT += dt;
    const step = Math.floor(countT);
    if (step !== countStep) {
      countStep = step;
      if (step < 3) { hud.big(String(3 - step)); sound.count(false); }
      else { hud.big('GO!'); sound.count(true); setTimeout(() => hud.big('', false), 700); state = 'race'; raceTime = 0; race.forEach(r => r.lapStart = 0); }
    }
    cars.forEach(c => { Object.keys(c.input).forEach(k => c.input[k] = false); c.update(dt, track, events); });
  } else if (state === 'race' && !paused) {
    raceTime += dt;
    pollInputs();
    const bots = window.__bots;
    if (bots) for (let i = 0; i < 2; i++) if (bots[i]) autopilot(cars[i], i);
    for (let i = 0; i < 2; i++) {
      cars[i].update(dt, track, events);
      updateRace(i, dt);
      if (cars[i].boosting) {
        const f = cars[i].forward().clone().negate();
        for (let k = 0; k < 3; k++) particles.flame(cars[i].exhaust(), f, i === 0 ? P1 : P2);
      }
      if (cars[i].slide > 8 && Math.abs(cars[i].speed) > 25) {
        particles.sparks(cars[i].pos, cars[i].forward());
      }
      sound.engine(i, Math.abs(cars[i].speed) / 82, cars[i].boosting, true);
    }
    cars[0].collideWith(cars[1], events);
    statusT -= dt;
    if (statusT <= 0) {
      const lead = leader();
      hud.setStatus(lead === -1 ? '' : `P${lead + 1} LEADS — LAP ${Math.min(race[lead].lap + 1, TOTAL_LAPS)}/${TOTAL_LAPS}`);
    }
  } else if (state === 'title' || state === 'finished') {
    for (let i = 0; i < 2; i++) {
      if (state === 'title' && !ready[i]) autopilot(cars[i], i);
      else if (state === 'title') { cars[i].input.up = false; cars[i].input.left = cars[i].input.right = false; }
      cars[i].update(dt, track, events);
      sound.engine(i, Math.abs(cars[i].speed) / 82, cars[i].boosting, true);
    }
    cars[0].collideWith(cars[1], events);
    if (state === 'finished') {
      confettiT -= dt;
      if (confettiT <= 0) {
        confettiT = 0.5;
        const w = cars[race[0].finishRank === 1 ? 0 : 1];
        particles.burst(w.pos, 80, [P1, P2, 0xffd76a, 0xffffff][Math.floor(Math.random() * 4)], 16, 1.8, 1.3, 11, -7);
      }
    }
  } else if (paused) {
    sound.engine(0, 0, false, false); sound.engine(1, 0, false, false);
  }

  for (const e of events) {
    const i = cars.indexOf(e.car);
    if (e.type === 'wall') {
      camState[i].shake = Math.min(0.6, e.impact * 0.03);
      sound.crash(Math.min(1, e.impact / 30));
      particles.sparks(e.pos, cars[i].forward().negate());
    } else if (e.type === 'scrape') {
      particles.sparks(e.pos, e.normal);
      sound.scrape();
    } else if (e.type === 'bump') {
      camState[0].shake = camState[1].shake = Math.min(0.5, e.impact * 0.03);
      sound.bump();
      particles.burst(e.pos, 25, 0xffffff, 8, 0.5, 0.8, 3, -6);
    }
  }

  track.rings.children.forEach(r => {
    r.rotation.x += r.userData.spin * dt;
    r.rotation.y += r.userData.spin * 0.7 * dt;
  });

  particles.update(dt);
  updateCameras(dt);

  if (state !== 'title') {
    for (let i = 0; i < 2; i++) hud.update(i, cars[i], race[i], rankOf(i));
  }
  hud.minimap(cars, cars.map(c => c.nearestIdx));

  composer.render();
}

function progress(i) {
  return race[i].lap * S + (cars[i].nearestIdx ?? 0);
}
function rankOf(i) {
  if (race[i].finished) return race[i].finishRank;
  const p0 = race[0].finished ? -1 : progress(0);
  const p1 = race[1].finished ? -1 : progress(1);
  return i === 0 ? (p0 >= p1 ? 1 : 2) : (p1 > p0 ? 1 : 2);
}
function leader() {
  if (race[0].finished) return 0;
  if (race[1].finished) return 1;
  return progress(0) === progress(1) ? -1 : (progress(0) > progress(1) ? 0 : 1);
}

window.__dbg = {
  cars, cams, renderer, scene, composer, track,
  get race() { return race; }, get state() { return state; }, frames: 0,
};

hud.showTitle();
tick();
