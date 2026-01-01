const SECTIONS = [
  {
    id: 'real', table: 'table1', index: '01', title: 'Real recordings',
    text: 'URMP and PHENICX-Anechoic recordings separated by systems trained on SynthSOD plus a small set of real recordings (Table 1 in the paper). URMP Jerusalem (the only URMP piece with all four string parts) and PHENICX-Anechoic Bruckner were part of this fine-tuning data, so their numbers are measured on training recordings; the others are held out.',
    metric: 'Numbers under each system are its museval SDR on this recording, averaged over the string parts it contains. ▲ marks the highest.'
  },
  {
    id: 'synthetic', table: 'table2', index: '02', title: 'Synthetic orchestra',
    text: 'Full-orchestra SynthSOD test pieces. Every system is trained on SynthSOD only (Table 2). Shown: the pieces with the highest mean SDR across the seven systems, among those with all four string parts.',
    metric: 'Numbers under each system are its museval SDR on this piece, averaged over the four string parts. ▲ marks the highest.'
  },
  {
    id: 'zeroshot', table: 'zeroshot', index: '03', title: 'Zero-shot real recordings',
    text: 'The same SynthSOD-only systems applied to URMP and PHENICX-Anechoic recordings they never saw during training (Table 2), including URMP Jerusalem, the only URMP piece with all four string parts, and PHENICX-Anechoic Bruckner.',
    metric: 'Numbers under each system are its museval SDR on this recording, averaged over the string parts it contains. ▲ marks the highest.'
  },
  {
    id: 'corruption', table: 'table3', index: '04', title: 'Score corruption',
    text: 'One SynthSOD test piece, separated with a clean score, eleven corrupted scores, and no score (Table 3). The mixture is identical in every condition. The audio-only controls never read the score, so their outputs stay the same. Shown: the piece with the highest mean clean-score SDR across the three score-based systems.',
    metric: 'Numbers under each system are its whole-piece SDR for the selected condition, averaged over the four string parts. ▲ marks the highest.'
  }
];

const MODEL_ORDER = ['a2_frame', 'b2_no_score', 'htdemucs', 'bs_roformer', 'score_mss_noscore', 'score_mss_input_concat', 'score_mss_noaudio'];
const MODEL_INFO = {
  a2_frame: { name: 'SCISSOR', note: 'ours', tag: 'score + audio', score: true },
  b2_no_score: { name: 'SCISSOR', note: 'no score', tag: 'audio only' },
  htdemucs: { name: 'HTDemucs', tag: 'audio only' },
  bs_roformer: { name: 'BS-RoFormer', tag: 'audio only' },
  score_mss_noscore: { name: 'Tunturi et al.', note: 'baseline', tag: 'audio only' },
  score_mss_input_concat: { name: 'Tunturi et al.', note: 'score-informed', tag: 'score + audio', score: true },
  score_mss_noaudio: { name: 'Tunturi et al.', note: 'score-only', tag: 'score only', score: true }
};
const STEMS = [['violin', 'Violin'], ['viola', 'Viola'], ['cello', 'Cello'], ['bass', 'Double bass']];
const PARTS = { vn: 'violin', va: 'viola', vc: 'cello', db: 'double bass', fl: 'flute', cl: 'clarinet', ob: 'oboe', bn: 'bassoon', tpt: 'trumpet', hn: 'horn', tbn: 'trombone', tba: 'tuba', sax: 'saxophone' };

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function clock(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function titleCase(words) {
  return words.map(word => word.charAt(0).toUpperCase() + word.slice(1));
}

function pieceInfo(demo) {
  const urmp = demo.piece.match(/^(\d+)_([A-Za-z0-9]+)_(.+)$/);
  if (demo.corpus === 'URMP' && urmp) {
    return { title: urmp[2], sub: `URMP No. ${Number(urmp[1])} · ${urmp[3].split('_').map(part => PARTS[part] || part).join(', ')}` };
  }
  if (demo.piece.startsWith('phenicx_')) {
    return { title: titleCase([demo.piece.slice(8)])[0], sub: 'PHENICX-Anechoic · symphony orchestra' };
  }
  const words = demo.piece.replace(/_orch$/, '').split('_');
  const names = titleCase(words.filter(word => !/^\d+$/.test(word))).join(' ');
  const numbers = words.filter(word => /^\d+$/.test(word)).join(' · ');
  return { title: `${names} ${numbers}`.trim(), sub: `SynthSOD test · ${demo.piece}` };
}

const engine = (() => {
  const audio = new Audio();
  audio.preload = 'none';
  let current = null;

  function paint() {
    if (!current) return;
    const duration = Number.isFinite(audio.duration) ? audio.duration : current.duration;
    current.fill.style.width = `${Math.min(100, (audio.currentTime / duration) * 100 || 0)}%`;
    current.time.textContent = `${clock(audio.currentTime)} / ${clock(duration)}`;
    current.seek.setAttribute('aria-valuenow', String(Math.round(audio.currentTime)));
  }

  function loop() {
    paint();
    if (!audio.paused) requestAnimationFrame(loop);
  }

  function state(name, on) {
    if (current) current.root.classList.toggle(name, on);
  }

  audio.addEventListener('play', () => { state('playing', true); requestAnimationFrame(loop); });
  audio.addEventListener('pause', () => { state('playing', false); paint(); });
  audio.addEventListener('ended', () => state('playing', false));
  audio.addEventListener('waiting', () => state('loading', true));
  audio.addEventListener('playing', () => state('loading', false));
  audio.addEventListener('timeupdate', paint);

  let loads = 0;
  function load(player, time, play) {
    const token = ++loads;
    audio.src = player.src;
    if (time > 0) {
      audio.addEventListener('loadedmetadata', () => {
        if (token === loads) audio.currentTime = Math.min(time, audio.duration - 0.05);
      }, { once: true });
    }
    if (play) audio.play().catch(() => state('playing', false));
    else paint();
  }

  function activate(player, time, play) {
    if (current && current !== player) {
      current.root.classList.remove('active', 'playing', 'loading');
      current.fill.style.width = '0%';
      current.time.textContent = clock(current.duration);
    }
    current = player;
    player.root.classList.add('active');
    load(player, time, play);
  }

  return {
    toggle(player) {
      if (current === player) {
        if (audio.paused) audio.play().catch(() => {});
        else audio.pause();
        return;
      }
      const time = current && current.group === player.group ? audio.currentTime : 0;
      activate(player, time, true);
    },
    seek(player, fraction) {
      if (current === player && Number.isFinite(audio.duration)) {
        audio.currentTime = fraction * audio.duration;
        paint();
      } else {
        activate(player, fraction * player.duration, true);
      }
    },
    nudge(player, seconds) {
      const base = current === player ? audio.currentTime : 0;
      const limit = Number.isFinite(audio.duration) ? audio.duration : player.duration;
      this.seek(player, Math.min(limit, Math.max(0, base + seconds)) / limit);
    },
    replace(player, src) {
      player.src = src;
      if (current !== player) return;
      const playing = !audio.paused;
      load(player, audio.currentTime, playing);
    }
  };
})();

const ICONS = '<svg class="icon-play" viewBox="0 0 12 12" aria-hidden="true"><path d="M2.5 1.2v9.6L10.6 6z"/></svg><svg class="icon-pause" viewBox="0 0 12 12" aria-hidden="true"><path d="M2 1h3v10H2zM7 1h3v10H7z"/></svg>';

function createPlayer(src, label, group, duration, extraClass) {
  const root = element('div', `player ${extraClass}`);
  const button = element('button', 'play');
  button.type = 'button';
  button.innerHTML = ICONS;
  button.setAttribute('aria-label', `Play or pause ${label}`);
  const seek = element('div', 'seek');
  seek.tabIndex = 0;
  seek.setAttribute('role', 'slider');
  seek.setAttribute('aria-label', `Seek ${label}`);
  seek.setAttribute('aria-valuemin', '0');
  seek.setAttribute('aria-valuemax', String(Math.round(duration)));
  seek.setAttribute('aria-valuenow', '0');
  const fill = element('span', 'seek-fill');
  seek.append(fill);
  const time = element('span', 'time', clock(duration));
  root.append(button, seek, time);
  const player = { root, seek, fill, time, src: `assets/audio/${src}`, group, duration };
  button.addEventListener('click', () => engine.toggle(player));
  seek.addEventListener('click', event => {
    const box = seek.getBoundingClientRect();
    engine.seek(player, Math.min(1, Math.max(0, (event.clientX - box.left) / box.width)));
  });
  seek.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
      event.preventDefault();
      engine.nudge(player, event.key === 'ArrowRight' ? 5 : -5);
    }
  });
  return player;
}

function modelHeader(key, sdr, best, control) {
  const info = MODEL_INFO[key];
  const th = element('th', key === 'a2_frame' ? 'ours' : '');
  th.scope = 'col';
  const name = element('span', 'model-name', info.name);
  if (info.note) name.append(element('span', 'model-note', info.note));
  const tag = element('span', `model-tag${info.score ? ' score' : ''}`, control ? `${info.tag} · control` : info.tag);
  const score = element('span', `model-sdr${best ? ' best' : ''}`);
  if (sdr === null || sdr === undefined) score.append(element('b', '', '—'));
  else score.append(element('b', '', sdr.toFixed(2)), ' dB');
  th.append(name, tag, score);
  return th;
}

function renderPiece(demo) {
  const info = pieceInfo(demo);
  const group = `${demo.table}/${demo.piece}`;
  const [minutes, seconds] = demo.duration.split(':').map(Number);
  const duration = minutes * 60 + seconds;
  const card = element('article', 'panel piece');

  const head = element('div', 'piece-head');
  const titles = element('div');
  titles.append(element('h3', 'piece-title', info.title), element('p', 'piece-sub', info.sub));
  const badges = element('div', 'badges');
  badges.append(element('span', 'badge accent', demo.corpus), element('span', 'badge', `${demo.duration} · full recording`));
  head.append(titles, badges);
  card.append(head);

  const corruption = Boolean(demo.conditions);
  let condition = corruption ? demo.conditions[0] : null;
  const modelsFor = () => (corruption ? { ...condition.models, ...demo.controls } : demo.models);
  const columns = MODEL_ORDER.filter(key => key in modelsFor());

  let conditionBar = null;
  if (corruption) {
    conditionBar = element('div', 'conditions');
    conditionBar.setAttribute('role', 'group');
    conditionBar.setAttribute('aria-label', 'Score condition');
    card.append(conditionBar);
  }

  const scroll = element('div', 'matrix-scroll');
  const table = element('table', 'matrix');
  const colgroup = element('colgroup');
  colgroup.append(element('col', 'label-col'));
  columns.forEach(() => colgroup.append(element('col')));
  const thead = element('thead');
  const headRow = element('tr');
  thead.append(headRow);
  const tbody = element('tbody');

  const mixRow = element('tr', 'mixture-row');
  const mixLabel = element('th', 'row-label', 'Mixture');
  mixLabel.scope = 'row';
  const mixCell = element('td');
  mixCell.colSpan = columns.length;
  mixCell.append(createPlayer(demo.mixture, `${info.title} mixture`, group, duration, 'mixture-player').root);
  mixRow.append(mixLabel, mixCell);
  tbody.append(mixRow);

  const cells = {};
  STEMS.forEach(([stem, label], index) => {
    const absent = demo.present && !demo.present[index];
    const row = element('tr', absent ? 'absent-row' : '');
    const th = element('th', 'row-label', label);
    th.scope = 'row';
    if (absent) th.append(element('span', 'absent', 'not in recording'));
    row.append(th);
    columns.forEach(key => {
      const td = element('td', key === 'a2_frame' ? 'ours' : '');
      const model = modelsFor()[key];
      const player = createPlayer(model.tracks[stem], `${MODEL_INFO[key].name} ${MODEL_INFO[key].note || ''} ${label}`, group, duration, 'compact');
      cells[`${key}/${stem}`] = player;
      td.append(player.root);
      row.append(td);
    });
    tbody.append(row);
  });

  function renderHeader() {
    const models = modelsFor();
    const best = Math.max(...columns.map(key => models[key].sdr).filter(Number.isFinite));
    const corner = element('th', 'row-label');
    corner.setAttribute('aria-hidden', 'true');
    headRow.replaceChildren(corner, ...columns.map(key => modelHeader(key, models[key].sdr, Number.isFinite(models[key].sdr) && models[key].sdr === best, corruption && key in demo.controls)));
  }

  function renderConditions() {
    conditionBar.replaceChildren(...demo.conditions.map(item => {
      const button = element('button', 'condition', item.label);
      button.type = 'button';
      button.setAttribute('aria-pressed', String(item === condition));
      button.addEventListener('click', () => {
        condition = item;
        const models = modelsFor();
        for (const [key, player] of Object.entries(cells)) {
          const [model, stem] = key.split('/');
          engine.replace(player, `assets/audio/${models[model].tracks[stem]}`);
        }
        renderConditions();
        renderHeader();
      });
      return button;
    }));
  }

  renderHeader();
  if (corruption) renderConditions();
  table.append(colgroup, thead, tbody);
  scroll.append(table);
  card.append(scroll);
  return card;
}

async function loadDemos() {
  const root = document.querySelector('#demo-sections');
  try {
    const response = await fetch('assets/audio/demos.json');
    if (!response.ok) throw new Error('audio manifest unavailable');
    const { demos } = await response.json();
    for (const section of SECTIONS) {
      const items = demos.filter(item => item.table === section.table);
      if (!items.length) continue;
      const node = element('section', 'demo-section shell');
      node.id = section.id;
      const head = element('div', 'section-head');
      const text = element('div');
      text.append(element('h2', '', section.title), element('p', '', section.text), element('p', 'metric-note', section.metric));
      head.append(element('span', 'section-index', section.index), text);
      node.append(head, ...items.map(renderPiece));
      root.append(node);
    }
  } catch (error) {
    root.append(element('p', 'shell notice', `Audio could not be loaded: ${error.message}`));
  }
}

document.querySelector('#year').textContent = new Date().getFullYear();
loadDemos();
