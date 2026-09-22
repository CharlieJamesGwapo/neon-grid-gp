export class HUD {
  constructor(track) {
    this.el = id => document.getElementById(id);
    this.spd = [this.el('spd1'), this.el('spd2')];
    this.pos = [this.el('pos1'), this.el('pos2')];
    this.lap = [this.el('lap1'), this.el('lap2')];
    this.boost = [this.el('boost1'), this.el('boost2')];
    this.times = [this.el('times1'), this.el('times2')];
    this.warn = [this.el('warn1'), this.el('warn2')];
    this.status = this.el('status');
    this.bigno = this.el('bigno');
    this.overlay = this.el('overlay');
    this.ready = [this.el('ready1'), this.el('ready2')];
    this.title = this.el('title');
    this.subtitle = this.el('subtitle');
    this.startmsg = this.el('startmsg');
    this.cards = document.querySelector('.cards');
    this.winner = this.el('winner');
    this.wtitle = this.el('wtitle');
    this.wsub = this.el('wsub');

    // minimap
    this.mm = this.el('minimap').getContext('2d');
    const pts = track.samples.map(s => [s.pos.x, s.pos.z]);
    let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
    for (const [x, z] of pts) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    const pad = 14, W = 240, H = 170;
    const sc = Math.min((W - pad * 2) / (maxX - minX), (H - pad * 2) / (maxZ - minZ));
    this._mapPt = i => {
      const s = track.samples[i];
      return [pad + (s.pos.x - minX) * sc + (W - pad * 2 - (maxX - minX) * sc) / 2,
              pad + (s.pos.z - minZ) * sc + (H - pad * 2 - (maxZ - minZ) * sc) / 2];
    };
    this._trackPts = pts.map((_, i) => this._mapPt(i));
  }

  fmt(t) {
    if (t == null || !isFinite(t)) return '--:--.--';
    const m = Math.floor(t / 60), s = t - m * 60;
    return `${m}:${s.toFixed(2).padStart(5, '0')}`;
  }

  update(i, car, race, pos) {
    this.spd[i].textContent = Math.round(Math.abs(car.speed) * 4.2);
    this.pos[i].innerHTML = pos === 1 ? '1<small>st</small>' : '2<small>nd</small>';
    const shownLap = Math.min(race.lap + 1, race.totalLaps);
    this.lap[i].textContent = race.finished ? 'FINISHED' : `LAP ${shownLap}/${race.totalLaps}`;
    this.boost[i].style.width = `${car.boost}%`;
    this.times[i].innerHTML =
      `LAST&nbsp;${this.fmt(race.lastLap)}<br>BEST&nbsp;${this.fmt(race.bestLap)}`;
    this.warn[i].style.display = race.wrongWay ? 'block' : 'none';
  }

  minimap(cars, indices) {
    const ctx = this.mm;
    ctx.clearRect(0, 0, 240, 170);
    ctx.strokeStyle = 'rgba(140,120,255,0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    this._trackPts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y));
    ctx.closePath();
    ctx.stroke();
    const [sx, sy] = this._mapPt(0);
    ctx.fillStyle = '#fff';
    ctx.fillRect(sx - 2, sy - 2, 5, 5);
    const cols = ['#22e6ff', '#ff3df0'];
    cars.forEach((c, i) => {
      const [x, y] = this._mapPt(indices[i] ?? 0);
      ctx.fillStyle = cols[i];
      ctx.shadowColor = cols[i]; ctx.shadowBlur = 6;
      ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
    });
  }

  big(text, show = true) {
    this.bigno.textContent = text;
    this.bigno.style.display = show ? 'block' : 'none';
  }

  setStatus(t) { this.status.innerHTML = t; }

  setReady(i, on) {
    this.ready[i].textContent = on ? 'READY' : (i === 0 ? 'PRESS W TO READY' : 'PRESS ↑ TO READY');
    this.ready[i].classList.toggle('on', on);
  }

  showTitle() {
    this.overlay.classList.remove('hidden');
    this.title.style.display = '';
    this.subtitle.style.display = '';
    this.cards.style.display = '';
    this.startmsg.style.display = '';
    this.winner.style.display = 'none';
  }

  hideOverlay() { this.overlay.classList.add('hidden'); }

  showWinner(name, color, sub) {
    this.overlay.classList.remove('hidden');
    this.title.style.display = 'none';
    this.subtitle.style.display = 'none';
    this.cards.style.display = 'none';
    this.startmsg.style.display = 'none';
    this.winner.style.display = 'flex';
    this.wtitle.textContent = `${name} WINS`;
    this.wtitle.style.color = color;
    this.wtitle.style.textShadow = `0 0 30px ${color}`;
    this.wsub.textContent = sub;
  }
}
