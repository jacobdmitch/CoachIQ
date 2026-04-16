import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import apiClient from '../../config/api';

/**
 * PlayerShareView — public, unauthenticated season stats page for a single
 * athlete. Accessed at /share/player/:token. The token is time-limited and
 * coach-revocable. No coach notes, email, or opponent scouting data is
 * rendered — parents and players only see the counting stats and per-game
 * contributions the athlete produced.
 */
export default function PlayerShareView() {
  const { token } = useParams();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(null);

  useEffect(() => {
    let cancelled = false;
    apiClient.get(`/public/player/${encodeURIComponent(token)}`)
      .then(res => { if (!cancelled) setData(res.data); })
      .catch(err => {
        if (cancelled) return;
        const code = err.response?.status;
        const msg  = err.response?.data?.error
          || (code === 410 ? 'This link is no longer active.'
            : code === 404 ? 'This link was not found.'
            : 'Unable to load stats.');
        setError(msg);
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  if (loading) return <Shell><p style={muted}>Loading…</p></Shell>;
  if (error)   return <Shell><p style={{ ...muted, color: 'var(--color-red)' }}>{error}</p></Shell>;
  if (!data)   return null;

  const { athlete, season, games } = data;
  const shotPct = season.shots > 0 ? Math.round((season.goals / season.shots) * 100) : 0;
  const foWins = season.faceoffWins;
  const foAll  = foWins + season.faceoffLosses;
  const foPct  = foAll > 0 ? Math.round((foWins / foAll) * 100) : null;

  return (
    <Shell>
      <header style={{ marginBottom: 'var(--sp-8)' }}>
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
          letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)',
          marginBottom: 'var(--sp-2)',
        }}>
          {athlete.teamName || 'Season Stats'}
        </p>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontSize: 'var(--text-3xl)',
          color: 'var(--color-text-primary)', margin: 0, marginBottom: 'var(--sp-2)',
        }}>
          {athlete.firstName} {athlete.lastName}
          {athlete.jerseyNumber != null && (
            <span style={{ color: 'var(--color-gold)', marginLeft: 12 }}>
              #{athlete.jerseyNumber}
            </span>
          )}
        </h1>
        <p style={{
          fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)', margin: 0,
        }}>
          {athlete.primaryPosition || '—'}
          {athlete.secondaryPosition ? ` · ${athlete.secondaryPosition}` : ''}
          {athlete.graduationYear ? ` · Class of ${athlete.graduationYear}` : ''}
        </p>
      </header>

      <section style={{ marginBottom: 'var(--sp-8)' }}>
        <SectionTitle>Season Totals</SectionTitle>
        <div style={grid4}>
          <Stat label="Games"   value={season.gamesPlayed} />
          <Stat label="Goals"   value={season.goals} />
          <Stat label="Assists" value={season.assists} />
          <Stat label="Points"  value={season.points} />
        </div>
        <div style={{ ...grid4, marginTop: 'var(--sp-3)' }}>
          <Stat label="Shots"          value={season.shots} />
          <Stat label="Shot %"         value={shotPct} unit="%" />
          <Stat label="Ground Balls"   value={season.groundBalls} />
          <Stat label="Caused TOs"     value={season.causedTurnovers} />
        </div>
        {(season.saves > 0 || foAll > 0) && (
          <div style={{ ...grid4, marginTop: 'var(--sp-3)' }}>
            {season.saves > 0 && <Stat label="Saves" value={season.saves} />}
            {foAll > 0 && <Stat label="FO Win %" value={foPct ?? 0} unit="%" />}
          </div>
        )}
      </section>

      {games.length > 0 && (
        <section>
          <SectionTitle>Games ({games.length})</SectionTitle>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)' }}>
            {games.map(g => <GameRow key={g.id} game={g} />)}
          </div>
        </section>
      )}

      <footer style={{
        marginTop: 'var(--sp-10)', paddingTop: 'var(--sp-5)',
        borderTop: '1px solid var(--color-surface-3)',
        fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
        color: 'var(--color-text-subtle)', textAlign: 'center',
      }}>
        Shared by your coach via CoachIQ.
      </footer>
    </Shell>
  );
}

function Shell({ children }) {
  return (
    <div style={{
      minHeight: '100dvh', background: 'var(--color-bg, #0A1018)',
      padding: 'var(--sp-6) var(--sp-5)',
    }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {children}
      </div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <p style={{
      fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
      letterSpacing: '1.5px', textTransform: 'uppercase',
      color: 'var(--color-text-muted)', marginBottom: 'var(--sp-3)',
    }}>
      {children}
    </p>
  );
}

function Stat({ label, value, unit = '' }) {
  return (
    <div className="card" style={{
      padding: 'var(--sp-4)',
      textAlign: 'left',
    }}>
      <p style={{
        fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '10px',
        letterSpacing: '1.5px', textTransform: 'uppercase',
        color: 'var(--color-text-muted)', margin: 0, marginBottom: 6,
      }}>
        {label}
      </p>
      <p style={{
        fontFamily: 'var(--font-stats)', fontSize: 'var(--text-2xl)',
        color: 'var(--color-text-primary)', margin: 0, letterSpacing: 1,
      }}>
        {value}{unit && <span style={{ fontSize: 'var(--text-base)', color: 'var(--color-text-muted)' }}>{unit}</span>}
      </p>
    </div>
  );
}

function GameRow({ game }) {
  const d = game.gameDate ? new Date(game.gameDate) : null;
  const dateStr = d && !Number.isNaN(d.valueOf())
    ? d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
    : '';
  const hasScore = game.homeScore != null && game.awayScore != null;
  return (
    <div className="card" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
      padding: 'var(--sp-3) var(--sp-4)', flexWrap: 'wrap',
    }}>
      <div style={{ flex: '0 0 80px' }}>
        <p style={{
          margin: 0, fontFamily: 'var(--font-body)', fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: 1,
        }}>
          {dateStr}
        </p>
      </div>
      <div style={{ flex: '1 1 120px', minWidth: 0 }}>
        <p style={{
          margin: 0, fontFamily: 'var(--font-body)', fontWeight: 700,
          fontSize: 'var(--text-sm)', color: 'var(--color-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          vs {game.opponent}
        </p>
        {hasScore && (
          <p style={{
            margin: '2px 0 0', fontFamily: 'var(--font-stats)', fontSize: 'var(--text-xs)',
            color: 'var(--color-text-muted)',
          }}>
            {game.homeScore}–{game.awayScore}
          </p>
        )}
      </div>
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginLeft: 'auto' }}>
        {game.goals       > 0 && <MicroStat label="G"  value={game.goals} />}
        {game.assists     > 0 && <MicroStat label="A"  value={game.assists} />}
        {game.shots       > 0 && <MicroStat label="Sh" value={game.shots} />}
        {game.groundBalls > 0 && <MicroStat label="GB" value={game.groundBalls} />}
        {game.causedTurnovers > 0 && <MicroStat label="CT" value={game.causedTurnovers} />}
        {game.saves       > 0 && <MicroStat label="Sv" value={game.saves} />}
      </div>
    </div>
  );
}

function MicroStat({ label, value }) {
  return (
    <span style={{
      fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)',
      color: 'var(--color-text-primary)', letterSpacing: 1,
    }}>
      <span style={{ color: 'var(--color-text-muted)', marginRight: 4 }}>{label}</span>
      {value}
    </span>
  );
}

const muted = {
  fontFamily: 'var(--font-body)', fontWeight: 300,
  color: 'var(--color-text-muted)', textAlign: 'center',
  marginTop: '20vh',
};

const grid4 = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
  gap: 'var(--sp-3)',
};
