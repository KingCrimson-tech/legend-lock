import { useEffect, useMemo, useState } from 'react';
import { TEAMS, SLOTS } from './data.js';

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Multi-position maps: players can appear in any bucket they played
const MULTIPOS = {
  'Lionel Messi': ['RW', 'LW', 'ST'],
  'Cristiano Ronaldo': ['LW', 'ST', 'RW'],
  'Thierry Henry': ['ST', 'LW'],
  'Neymar Jr': ['LW', 'RW'],
  'Luis Suarez': ['ST', 'RW'],
  'Mohamed Salah': ['RW', 'ST'],
  'Kylian Mbappe': ['ST', 'RW', 'LW'],
  'Wayne Rooney': ['ST', 'CM'],
  'Ronaldinho': ['LW', 'CM', 'RW'],
  'Gareth Bale': ['RW', 'LW', 'ST'],
  'Luis Figo': ['RW', 'LW'],
  'Zinedine Zidane': ['CM', 'CDM'],
  'Luka Modric': ['CM', 'CDM'],
  'Xabi Alonso': ['CDM', 'CM'],
  'Frenkie de Jong': ['CDM', 'CM'],
  'Fernando Torres': ['ST', 'LW'],
  'Robbie Fowler': ['ST', 'LW'],
  'Steven Gerrard': ['CM', 'RW'],
  'Paul Scholes': ['CM', 'CDM'],
  'Michael Carrick': ['CDM', 'CM'],
  'N\'Golo Kante': ['CDM', 'CM'],
  'Sergio Busquets': ['CDM', 'CM'],
  'Vinicius Junior': ['LW', 'RW', 'ST'],
  'Raphinha': ['RW', 'LW', 'ST'],
  'Angel Di Maria': ['RW', 'LW', 'CM'],
  'Pierre-Emerick Aubameyang': ['ST', 'LW'],
  'Marcus Rashford': ['LW', 'ST'],
  'Bukayo Saka': ['RW', 'LW'],
  'Dennis Bergkamp': ['ST', 'CM'],
  'Didier Drogba': ['ST'],
  'Andres Iniesta': ['CM', 'LW'],
  'Anthony Griezmann': ['ST', 'RW', 'LW'],
  'Antoine Griezmann': ['ST', 'RW', 'LW'],
  'Thomas Muller': ['ST', 'CM'],
};

// Wikipedia live season pages (2025–26) for dynamic current squads
const LIVE_PAGES = {
  arsenal: '2025–26 Arsenal F.C. season',
  barcelona: '2025–26 FC Barcelona season',
  'real-madrid': '2025–26 Real Madrid CF season',
  'man-united': '2025–26 Manchester United F.C. season',
  liverpool: '2025–26 Liverpool F.C. season',
};

const POS_TO_BUCKETS = {
  GK: ['GK'],
  DF: ['LB', 'CB', 'RB'],
  MF: ['CDM', 'CM'],
  FW: ['LW', 'ST', 'RW'],
};

function parseLiveSquad(html) {
  try {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const out = [];
    const seen = new Set();
    doc.querySelectorAll('table').forEach((table) => {
      if (!/goalkeeper|defender|midfielder|attacker/i.test(table.textContent)) return;
      table.querySelectorAll('tr').forEach((row) => {
        const cells = Array.from(row.querySelectorAll('td, th'));
        if (!cells.length) return;
        const texts = cells.map((c) => c.textContent.replace(/\s+/g, ' ').trim());
        let posIdx = -1;
        let pos = null;
        texts.forEach((t, i) => {
          if (!pos && (t === 'GK' || t === 'DF' || t === 'MF' || t === 'FW')) { pos = t; posIdx = i; }
        });
        if (!pos) return;
        // name link after position cell
        let name = null;
        const links = Array.from(row.querySelectorAll('a[href^="/wiki/"]'));
        for (const a of links) {
          const txt = a.textContent.trim();
          if (txt && !/squad|season|player/i.test(txt)) { name = txt; break; }
        }
        if (!name || seen.has(name)) return;
        // shirt number: first purely numeric text after pos cell
        let num = '';
        for (let i = posIdx + 1; i < texts.length; i++) {
          if (/^\d+$/.test(texts[i])) { num = texts[i]; break; }
        }
        seen.add(name);
        out.push({ n: name, num: num || '?', era: 'Live 25/26', buckets: POS_TO_BUCKETS[pos] });
      });
    });
    return out;
  } catch {
    return [];
  }
}

// --- Photos: Wikipedia thumbnail via MediaWiki API, cached per name ---
const photoCache = new Map();
function PlayerPhoto({ name }) {
  const [url, setUrl] = useState(() => photoCache.get(name) || null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (photoCache.has(name)) {
      const v = photoCache.get(name);
      if (v) setUrl(v); else setFailed(true);
      return;
    }
    const title = encodeURIComponent(name);
    fetch(`https://en.wikipedia.org/w/api.php?action=query&prop=pageimages&format=json&pithumbsize=200&titles=${title}&origin=*`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        const pages = d?.query?.pages || {};
        const thumb = pages[Object.keys(pages)[0]]?.thumbnail?.source || null;
        photoCache.set(name, thumb || false);
        if (thumb) setUrl(thumb);
        else setFailed(true);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [name]);

  if (url && !failed) {
    return <img className="photo" src={url} alt={name} loading="lazy" onError={() => setFailed(true)} />;
  }
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <div className="photo-fallback" title={name}>{initials}</div>;
}

function SlotCard({ player, locked = false, candidate = false, onLock = null }) {
  const inner = (
    <>
      <div className="photo-wrap"><PlayerPhoto name={player.n} /></div>
      <div className="slot-name">{player.n}</div>
      <div className="slot-pos">{player.pos}</div>
    </>
  );
  if (candidate) {
    return (
      <button type="button" className={`slot-card candidate ${locked ? 'locked' : ''}`} onClick={() => onLock?.(player)} title={`Lock ${player.n} (${player.pos})`}>
        {inner}
      </button>
    );
  }
  return <div className={`slot-card ${locked ? 'locked' : ''}`}>{inner}</div>;
}

export default function App() {
  const [team, setTeam] = useState(null);
  const [locked, setLocked] = useState({});
  const [candidates, setCandidates] = useState({});
  const [spinning, setSpinning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [spinCount, setSpinCount] = useState(0);
  const [livePlayers, setLivePlayers] = useState([]);
  const [liveStatus, setLiveStatus] = useState('');

  const lockedPlayers = useMemo(
    () => SLOTS.map((s) => ({ slot: s, player: locked[s.id] })).filter((x) => x.player),
    [locked]
  );
  const emptySlots = useMemo(() => SLOTS.filter((s) => !locked[s.id]), [locked]);
  const done = emptySlots.length === 0;
  const hasCandidates = Object.keys(candidates).length > 0;

  const allPlayers = useMemo(() => {
    if (!team) return [];
    const flat = [];
    Object.values(team.players).forEach((arr) => arr.forEach((p) => flat.push(p)));
    return flat;
  }, [team]);

  function startGame(t) {
    setTeam(t);
    setLocked({});
    setCandidates({});
    setCopied(false);
    setSpinCount(0);
    setLivePlayers([]);
    setLiveStatus('');

    const season = LIVE_PAGES[t.id];
    if (season) {
      setLiveStatus('Live — fetching 25/26 squad from Wikipedia…');
      fetch(`https://en.wikipedia.org/w/api.php?action=parse&page=${encodeURIComponent(season)}&prop=text&format=json&formatversion=2&origin=*`)
        .then((r) => r.json())
        .then((d) => {
          const html = d?.parse?.text || '';
          const squad = parseLiveSquad(html);
          if (squad.length) {
            setLivePlayers(squad);
            setLiveStatus(`Live — ${squad.length} current ${t.name} players merged (25/26)`);
          } else {
            setLiveStatus('');
          }
        })
        .catch(() => setLiveStatus(''));
    } else {
      setLiveStatus('All-time legends pool — no live squad for this team');
    }
  }

  function poolFor(bucket, lockedNames, usedNames) {
    const pool = [];
    const seen = new Set();
    const push = ([n, num, era]) => {
      if (lockedNames.has(n) || usedNames.has(n) || seen.has(n)) return;
      seen.add(n);
      pool.push([n, num, era]);
    };
    // primary bucket
    (team.players[bucket] || []).forEach(push);
    // multi-position cross-bucket players (e.g. Messi ST -> RW/LW)
    Object.values(team.players).flat().forEach((p) => {
      if ((MULTIPOS[p[0]] || []).includes(bucket)) push(p);
    });
    // live dynamic squad
    livePlayers.filter((lp) => lp.buckets.includes(bucket)).forEach((lp) => push([lp.n, lp.num, lp.era]));
    return pool;
  }

  function spin() {
    if (!team || done) return;
    setSpinning(true);
    setCandidates({});

    setTimeout(() => {
      const lockedNames = new Set(Object.values(locked).map((p) => p.n));
      const usedNames = new Set(lockedNames);
      const byBucket = {};
      emptySlots.forEach((s) => { (byBucket[s.bucket] ||= []).push(s); });

      const next = {};
      Object.entries(byBucket).forEach(([bucket, slots]) => {
        const pool = poolFor(bucket, lockedNames, usedNames);
        shuffle(pool).slice(0, slots.length).forEach(([n, num, era], i) => {
          usedNames.add(n);
          next[slots[i].id] = { n, num, era, pos: slots[i].label, slotId: slots[i].id };
        });
      });

      setCandidates(next);
      setSpinning(false);
      setSpinCount((c) => c + 1);
    }, 900);
  }

  function lockOnPitch(player) {
    setLocked((prev) => ({ ...prev, [player.slotId]: player }));
    setCandidates({});
  }

  function copyResult() {
    if (!team) return;
    const line = `${team.name} 4-3-3 XI (spun in ${spinCount} spins): ${lockedPlayers
      .map((x) => `${x.slot.label} ${x.player.n}`)
      .join(' · ')}`;
    navigator.clipboard?.writeText(line).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (!team) {
    return (
      <div className="wrap">
        <header className="hero">
          <div className="badge">4-3-3 · ALL-TIME + LIVE SQUAD · CLICK ON PITCH</div>
          <h1>
            Legends <span>Lock</span>
          </h1>
          <p>
            Pick a club or country. <b>Spin</b> and name + photo pop up <b>on the formation itself</b> —
            one for every position. <b>Click one player on the pitch</b> to keep him. Everyone else vanishes.
            Spin again. Repeat until all 11 are locked.
          </p>
          <p className="dyn-note">
            Players are now <b>dynamic</b>: legends use multi-position pools (Messi can show wide at RW/LW + ST), and
            clubs also pull the <b>live 25/26 squad</b> from Wikipedia each game, so the list never goes stale.
          </p>
        </header>

        <section className="how">
          <div><b>1</b> Pick Team</div>
          <div><b>2</b> Spin → pitch fills</div>
          <div><b>3</b> Click 1 player</div>
          <div><b>4</b> He stays → re-spin</div>
        </section>

        <h2 className="section-title">Choose your squad</h2>
        <main className="team-grid">
          {TEAMS.map((t) => {
            const count = Object.values(t.players).flat().length;
            return (
              <button key={t.id} className="team-card" onClick={() => startGame(t)} style={{ '--c1': t.color, '--c2': t.color2 }}>
                <div className="team-top">
                  <span className="team-short">{t.short}</span>
                  <span className="team-type">{t.type}</span>
                </div>
                <div className="team-name">{t.name}</div>
                <div className="team-motto">{t.motto}</div>
                <div className="team-meta">{count} legends · {LIVE_PAGES[t.id] ? 'live 25/26 squad' : 'all-time pool'}</div>
                <span className="team-cta">Play →</span>
              </button>
            );
          })}
        </main>
        <footer className="foot">Live squads + photos load from Wikipedia where available — otherwise an initial disc. Pure luck, one click per spin.</footer>
      </div>
    );
  }

  if (done) {
    return (
      <div className="wrap">
        <button className="ghost" onClick={() => setTeam(null)}>← Change team</button>
        <header className="result-head">
          <div className="badge">{team.name} · 4-3-3 · FINAL · {spinCount} SPINS</div>
          <h1>Your XI is set</h1>
          <p>11 locks. No re-picks. Whatever the spin gave you.</p>
        </header>

        <section className="pitch result">
          <div className="pitch-lines" />
          {SLOTS.map((s) => {
            const p = locked[s.id];
            return (
              <div key={s.id} className="slot" style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                <SlotCard player={p} locked />
              </div>
            );
          })}
        </section>

        <section className="card-list">
          {lockedPlayers.map(({ slot, player }) => (
            <div key={slot.id} className="row">
              <span className="row-pos">{slot.label}</span>
              <span className="row-name">{player.n}</span>
            </div>
          ))}
        </section>

        <footer className="actions">
          <button onClick={copyResult}>{copied ? 'Copied ✓' : 'Copy result'}</button>
          <button onClick={() => startGame(team)}>Play again (same team)</button>
          <button className="ghost-btn" onClick={() => setTeam(null)}>New team</button>
        </footer>
      </div>
    );
  }

  return (
    <div className="wrap game">
      <div className="game-top">
        <button className="ghost" onClick={() => setTeam(null)}>← Teams</button>
        <div className="game-team" style={{ '--c1': team.color }}>
          <b>{team.name}</b> · 4-3-3
        </div>
        <div className="progress">{lockedPlayers.length} / 11 locked · Spin {spinCount}</div>
      </div>
      <div className="bar"><i style={{ width: `${(lockedPlayers.length / 11) * 100}%` }} /></div>
      {liveStatus && <div className="live-status">{liveStatus}</div>}

      <div className="game-grid">
        <section className="pitch">
          <div className="pitch-lines" />
          {SLOTS.map((s) => {
            const pLocked = locked[s.id];
            const pCand = candidates[s.id];
            return (
              <div key={s.id} className={`slot ${pLocked ? 'filled' : ''} ${pCand ? 'candidate' : ''}`}
                   style={{ left: `${s.x}%`, top: `${s.y}%` }}>
                {pLocked ? (
                  <SlotCard player={pLocked} locked />
                ) : pCand ? (
                  <SlotCard player={pCand} candidate onLock={lockOnPitch} />
                ) : (
                  <div className="slot-empty"><span>{s.label}</span></div>
                )}
              </div>
            );
          })}
        </section>

        <aside className="panel">
          <div className="panel-label">Spin</div>
          <div className="now-pos">{emptySlots.length} slots open</div>
          <div className="now-hint">
            {hasCandidates
              ? 'Photos are on the pitch. Click the ONE you want to keep. The other 10 vanish.'
              : 'Hit spin — one name + photo per open position appears on the formation.'}
          </div>

          <button className="spin-btn" onClick={spin} disabled={spinning}>
            {spinning ? 'Spinning…' : hasCandidates ? '↻ Re-spin board' : '🎰 Spin all positions'}
          </button>
          {hasCandidates && (
            <p className="tip">Tip: you can re-spin before clicking to refresh the board.</p>
          )}

          <div className="mini-xi">
            <div className="panel-label">Kept on pitch</div>
            {lockedPlayers.length === 0 && <p className="muted">None yet — click a player on the pitch.</p>}
            {lockedPlayers.map(({ slot, player }) => (
              <div key={slot.id} className="mini-row">
                <span>{slot.label}</span><span className="grow">{player.n}</span>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
