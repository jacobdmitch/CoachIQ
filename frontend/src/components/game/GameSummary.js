import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import apiClient from '../../config/api';
import StatCard from '../common/StatCard';
import Badge from '../common/Badge';
import { formatDateTime } from '../../utils/formatters';

const POS_VARIANT = { Attack: 'red', Midfield: 'gold', Defense: 'blue', Goalie: 'green', FOGO: 'amber' };

const GAME_DATE_OPTS = { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' };


function minutesLabel(min) {
  const m = Number(min) || 0;
  return m > 0 ? `${m}m` : '—';
}

export default function GameSummary() {
  const { gameId } = useParams();
  const navigate   = useNavigate();

  const [game,    setGame]    = useState(null);
  const [stats,   setStats]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [gameRes, statsRes] = await Promise.all([
          apiClient.get(`/games/${gameId}`),
          apiClient.get(`/stats/game/${gameId}`),
        ]);
        if (cancelled) return;
        setGame(gameRes.data.game);
        setStats(statsRes.data);
      } catch (err) {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load game summary.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [gameId]);

  if (loading) {
    return (
      <div className="page-content">
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>Loading…</p>
      </div>
    );
  }

  if (error || !game || !stats) {
    return (
      <div className="page-content">
        <Link to="/dashboard" style={backLinkStyle}>← Dashboard</Link>
        <p style={{ color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>{error || 'Game not found.'}</p>
      </div>
    );
  }

  const { athletes = [], totals = {} } = stats;
  const scored    = athletes.filter(a => Number(a.goals) + Number(a.assists) > 0);
  const allOthers = athletes.filter(a => Number(a.goals) + Number(a.assists) === 0 && Number(a.minutes_played) > 0);

  const resultLabel = (() => {
    if (game.score_home == null) return null;
    if (game.score_home > game.score_away) return { text: 'W', color: 'var(--color-blue)' };
    if (game.score_home < game.score_away) return { text: 'L', color: 'var(--color-red)' };
    return { text: 'T', color: 'var(--color-text-muted)' };
  })();

  return (
    <div className="page-content">

      <Link to="/dashboard" style={backLinkStyle}>← Dashboard</Link>

      {/* Header */}
      <div className="page-header" style={{ marginBottom: 'var(--sp-8)' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-3)', marginBottom: 'var(--sp-2)', flexWrap: 'wrap' }}>
            <h1 className="page-title">vs {game.opponent}</h1>
            {resultLabel && (
              <span style={{
                fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', fontWeight: 700,
                color: resultLabel.color, minWidth: 24, textAlign: 'center',
              }}>{resultLabel.text}</span>
            )}
          </div>
          <p className="page-subtitle">
            {formatDateTime(game.game_date, game.start_time, GAME_DATE_OPTS)}
            {game.location ? ` · ${game.location}` : ''}
            {game.format === '6s' ? ' · 6-Man' : ''}
          </p>
        </div>
        <button
          onClick={() => navigate(`/game/${gameId}`)}
          style={{
            background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
            borderRadius: 'var(--radius-sm)', padding: '8px 16px',
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
            letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-secondary)',
            cursor: 'pointer',
          }}
        >
          View Game Log
        </button>
      </div>

      {/* Score card */}
      {game.score_home != null && (
        <>
          <p className="section-heading">Final Score</p>
          <div className="grid-2" style={{ marginBottom: 'var(--sp-8)' }}>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)' }}>
                Us
              </p>
              <p style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-3xl)', color: 'var(--color-text-primary)', lineHeight: 1 }}>
                {game.score_home}
              </p>
            </div>
            <div className="card" style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)', letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 'var(--sp-2)' }}>
                {game.opponent}
              </p>
              <p style={{ fontFamily: 'var(--font-stats)', fontSize: 'var(--text-3xl)', color: 'var(--color-text-primary)', lineHeight: 1 }}>
                {game.score_away}
              </p>
            </div>
          </div>
        </>
      )}

      {/* Team totals */}
      <p className="section-heading">Team Stats</p>
      <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
        <StatCard label="Goals"        value={totals.goals        ?? 0} />
        <StatCard label="Assists"      value={totals.assists      ?? 0} />
        <StatCard label="Shots"        value={totals.shots        ?? 0} />
        <StatCard label="Ground Balls" value={totals.ground_balls ?? 0} />
      </div>
      {(Number(totals.faceoff_wins) + Number(totals.faceoff_losses) > 0) && (
        <div className="grid-4" style={{ marginBottom: 'var(--sp-8)' }}>
          <StatCard label="Faceoff Wins"   value={totals.faceoff_wins   ?? 0} />
          <StatCard label="Faceoff Losses" value={totals.faceoff_losses ?? 0} />
          <StatCard label="Turnovers"      value={totals.turnovers      ?? 0} />
          <div />
        </div>
      )}

      {/* Scoring leaders */}
      {scored.length > 0 && (
        <>
          <p className="section-heading">Scoring</p>
          <div className="card" style={{ marginBottom: 'var(--sp-8)', padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  {['Player', 'Pos', 'G', 'A', 'Pts', 'Shots', 'Min'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scored.map((a, i) => (
                  <tr key={a.athlete_id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-1)' }}>
                    <td style={tdStyle}>
                      <Link to={`/roster/${a.athlete_id}`} style={{ color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                        {a.jersey_number != null ? `#${a.jersey_number} ` : ''}{a.first_name} {a.last_name}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      {a.primary_position && (
                        <Badge variant={POS_VARIANT[a.primary_position] || 'gray'} size="xs">
                          {a.primary_position.slice(0, 3)}
                        </Badge>
                      )}
                    </td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)', textAlign: 'center' }}>{a.goals}</td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', color: 'var(--color-text-primary)', textAlign: 'center' }}>{a.assists}</td>
                    <td style={{ ...tdStyle, fontFamily: 'var(--font-stats)', fontSize: 'var(--text-lg)', color: 'var(--color-gold)', textAlign: 'center', fontWeight: 700 }}>{Number(a.goals) + Number(a.assists)}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary)' }}>{a.shots}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{minutesLabel(a.minutes_played)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* All other players with playing time */}
      {allOthers.length > 0 && (
        <>
          <p className="section-heading">All Players</p>
          <div className="card" style={{ marginBottom: 'var(--sp-8)', padding: 0, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--color-surface-2)' }}>
                  {['Player', 'Pos', 'GB', 'TO', 'Saves', 'Min'].map(h => (
                    <th key={h} style={thStyle}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allOthers.map((a, i) => (
                  <tr key={a.athlete_id} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--color-surface-1)' }}>
                    <td style={tdStyle}>
                      <Link to={`/roster/${a.athlete_id}`} style={{ color: 'var(--color-text-primary)', textDecoration: 'none', fontWeight: 600 }}>
                        {a.jersey_number != null ? `#${a.jersey_number} ` : ''}{a.first_name} {a.last_name}
                      </Link>
                    </td>
                    <td style={tdStyle}>
                      {a.primary_position && (
                        <Badge variant={POS_VARIANT[a.primary_position] || 'gray'} size="xs">
                          {a.primary_position.slice(0, 3)}
                        </Badge>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary)' }}>{a.ground_balls}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary)' }}>{a.turnovers}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-secondary)' }}>{a.saves}</td>
                    <td style={{ ...tdStyle, textAlign: 'center', color: 'var(--color-text-muted)', fontSize: 'var(--text-xs)' }}>{minutesLabel(a.minutes_played)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

    </div>
  );
}

const backLinkStyle = {
  display: 'inline-flex', alignItems: 'center', gap: 'var(--sp-2)',
  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
  letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)',
  textDecoration: 'none', marginBottom: 'var(--sp-6)', transition: 'color var(--ease-base)',
};

const thStyle = {
  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
  letterSpacing: '1px', textTransform: 'uppercase', color: 'var(--color-text-muted)',
  padding: '10px 16px', textAlign: 'left',
};

const tdStyle = {
  fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', color: 'var(--color-text-secondary)',
  padding: '10px 16px', borderTop: '1px solid var(--color-border)',
};
