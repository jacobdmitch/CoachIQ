import React, { useEffect, useMemo, useState } from 'react';
import apiClient from '../../config/api';
import { useAuth } from '../../context/AuthContext';
import { useLines } from '../../hooks/useLines';
import Badge from '../common/Badge';
import Button from '../common/Button';

const POS_VARIANT = { Attack: 'red', Midfield: 'gold', Defense: 'blue', Goalie: 'green', FOGO: 'amber' };

/**
 * LinesPage — trait-weighted line suggestions + saved lines.
 *
 * Flow: pick a format (Standard / 6s) → pick a role (1st Midi, Man-Up, …) →
 * server returns the top N players scored against role-specific weights, with
 * a one-line "why" per pick (e.g. "Shooting 9, Field IQ 8"). Coach can save
 * the suggested set as a named line for later reuse.
 *
 * Ratings come from the athlete profile. Players with no ratings fall to the
 * bottom with a prompt to add them — unrated players don't break the
 * suggestion, they just don't rank.
 */
export default function LinesPage() {
  const { team } = useAuth();
  const [format, setFormat]         = useState('standard');
  const [roles, setRoles]           = useState([]);
  const [roleKey, setRoleKey]       = useState(null);
  const [loadingRoles, setLoadingRoles]       = useState(true);
  const [loadingSuggestion, setLoadingSuggestion] = useState(false);
  const [suggestion, setSuggestion] = useState(null);
  const [error, setError]           = useState(null);
  const [savingName, setSavingName] = useState('');
  const [saveMsg, setSaveMsg]       = useState(null);

  const { lines, createLine } = useLines(team?.id);

  // Load roles whenever format changes (free call, backend reads from constant)
  useEffect(() => {
    let cancelled = false;
    setLoadingRoles(true);
    apiClient.get('/lines/roles', { params: { format } })
      .then(res => {
        if (cancelled) return;
        const list = res.data.roles || [];
        setRoles(list);
        if (list.length && !list.some(r => r.key === roleKey)) {
          setRoleKey(list[0].key);
        }
      })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to load roles');
      })
      .finally(() => { if (!cancelled) setLoadingRoles(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [format]);

  // Fetch suggestion when team or role changes
  useEffect(() => {
    if (!team?.id || !roleKey) return;
    let cancelled = false;
    setLoadingSuggestion(true);
    setError(null);
    setSaveMsg(null);
    apiClient.get('/lines/suggestions', { params: { teamId: team.id, role: roleKey } })
      .then(res => { if (!cancelled) setSuggestion(res.data); })
      .catch(err => {
        if (!cancelled) setError(err.response?.data?.error || 'Failed to build suggestion');
      })
      .finally(() => { if (!cancelled) setLoadingSuggestion(false); });
    return () => { cancelled = true; };
  }, [team?.id, roleKey]);

  const currentRole = useMemo(
    () => roles.find(r => r.key === roleKey) || suggestion?.role || null,
    [roles, roleKey, suggestion]
  );

  async function handleSave() {
    if (!suggestion?.starters?.length) return;
    const name = savingName.trim() || currentRole?.label || 'Line';
    const positionGroup = (currentRole?.positions && currentRole.positions[0]) || 'Midfield';
    try {
      await createLine({
        name,
        positionGroup,
        playerIds: suggestion.starters.map(s => s.athleteId),
      });
      setSaveMsg(`Saved "${name}"`);
      setSavingName('');
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed');
    }
  }

  return (
    <div className="page-content">
      <div className="page-header">
        <div>
          <h1 className="page-title">Lines</h1>
          <p className="page-subtitle">
            Trait-weighted suggestions by role — pick a role and we'll rank your roster for it.
          </p>
        </div>
      </div>

      {/* Format switch */}
      <div style={{ display: 'flex', gap: 'var(--sp-3)', marginBottom: 'var(--sp-5)' }}>
        {['standard', '6s'].map(f => (
          <button
            key={f}
            onClick={() => setFormat(f)}
            style={{
              padding: 'var(--sp-2) var(--sp-4)', minHeight: 36,
              borderRadius: 'var(--radius-full)',
              background: format === f ? 'var(--color-gold-muted)' : 'transparent',
              border: `1px solid ${format === f ? 'var(--color-gold)' : 'var(--color-surface-3)'}`,
              color: format === f ? 'var(--color-gold)' : 'var(--color-text-muted)',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
              letterSpacing: '1.5px', textTransform: 'uppercase', cursor: 'pointer',
            }}
          >
            {f === '6s' ? '6s' : 'Standard'}
          </button>
        ))}
      </div>

      {/* Role picker */}
      <p className="section-heading">Role</p>
      {loadingRoles ? (
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>Loading roles…</p>
      ) : (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
          {roles.map(r => (
            <button
              key={r.key}
              onClick={() => setRoleKey(r.key)}
              style={{
                padding: 'var(--sp-2) var(--sp-4)', minHeight: 36,
                borderRadius: 'var(--radius-full)',
                background: roleKey === r.key ? 'var(--color-gold-muted)' : 'var(--color-surface-1)',
                border: `1px solid ${roleKey === r.key ? 'var(--color-gold)' : 'var(--color-surface-3)'}`,
                color: roleKey === r.key ? 'var(--color-gold)' : 'var(--color-text-secondary)',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: '11px',
                letterSpacing: '0.5px', cursor: 'pointer',
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      )}

      {currentRole && (
        <p style={{
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-sm)',
          color: 'var(--color-text-muted)', marginBottom: 'var(--sp-4)', fontStyle: 'italic',
        }}>
          {currentRole.hint} <span style={{ color: 'var(--color-text-subtle)' }}>({currentRole.size}-player line)</span>
        </p>
      )}

      {/* Suggestion */}
      {error && (
        <div className="card" style={{ marginBottom: 'var(--sp-6)', borderColor: 'var(--color-red-border)' }}>
          <p style={{ color: 'var(--color-red)', fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)', margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {loadingSuggestion ? (
        <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300 }}>Ranking roster…</p>
      ) : suggestion ? (
        <>
          <p className="section-heading">Suggested Starters</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
            {suggestion.starters.length === 0 ? (
              <p style={{ color: 'var(--color-text-muted)', fontFamily: 'var(--font-body)', fontWeight: 300, fontStyle: 'italic' }}>
                No eligible active players for this role. Check primary/secondary positions on roster.
              </p>
            ) : suggestion.starters.map((p, i) => (
              <SuggestedPlayer key={p.athleteId} player={p} rank={i + 1} />
            ))}
          </div>

          {suggestion.alternates?.length > 0 && (
            <>
              <p className="section-heading">Alternates</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-5)' }}>
                {suggestion.alternates.map((p, i) => (
                  <SuggestedPlayer key={p.athleteId} player={p} rank={suggestion.starters.length + i + 1} muted />
                ))}
              </div>
            </>
          )}

          {/* Save-as-line */}
          {suggestion.starters.length > 0 && (
            <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
              <p style={{
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-xs)',
                letterSpacing: '1.5px', textTransform: 'uppercase', color: 'var(--color-text-muted)',
                marginBottom: 'var(--sp-3)',
              }}>
                Save this line
              </p>
              <div style={{ display: 'flex', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={savingName}
                  onChange={e => setSavingName(e.target.value)}
                  placeholder={currentRole?.label || 'Line name'}
                  style={{
                    flex: '1 1 160px', minWidth: 160,
                    background: 'var(--color-surface-2)', border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-sm)', padding: '10px 12px',
                    fontFamily: 'var(--font-body)', fontSize: 'var(--text-sm)',
                    color: 'var(--color-text-primary)', outline: 'none',
                  }}
                />
                <Button variant="primary" size="sm" onClick={handleSave}>
                  Save Line
                </Button>
              </div>
              {saveMsg && (
                <p style={{
                  marginTop: 'var(--sp-2)', fontFamily: 'var(--font-body)',
                  fontSize: 'var(--text-xs)', color: 'var(--color-green)',
                }}>
                  {saveMsg}
                </p>
              )}
            </div>
          )}
        </>
      ) : null}

      {/* Saved lines list */}
      {lines.length > 0 && (
        <>
          <p className="section-heading">Saved Lines</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-2)', marginBottom: 'var(--sp-6)' }}>
            {lines.map(l => (
              <div key={l.id} className="card" style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: 'var(--sp-3) var(--sp-4)', gap: 'var(--sp-3)',
              }}>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
                  color: 'var(--color-text-primary)',
                }}>
                  {l.name}
                </span>
                <Badge variant={POS_VARIANT[l.position_group] || 'gray'}>
                  {l.position_group}
                </Badge>
                <span style={{
                  fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
                  color: 'var(--color-text-muted)', marginLeft: 'auto',
                }}>
                  {(l.player_ids || []).length} players
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function SuggestedPlayer({ player, rank, muted = false }) {
  return (
    <div className="card" style={{
      display: 'flex', alignItems: 'center', gap: 'var(--sp-3)',
      padding: 'var(--sp-3) var(--sp-4)', opacity: muted ? 0.75 : 1,
    }}>
      <span style={{
        width: 24, textAlign: 'center',
        fontFamily: 'var(--font-stats)', fontSize: 'var(--text-sm)',
        color: 'var(--color-text-muted)',
      }}>
        {rank}
      </span>
      <span style={{
        width: 40, textAlign: 'center',
        fontFamily: 'var(--font-stats)', fontSize: 'var(--text-base)',
        color: 'var(--color-gold)',
      }}>
        #{player.jersey_number ?? '–'}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-2)', flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 'var(--text-sm)',
            color: 'var(--color-text-primary)',
          }}>
            {player.first_name} {player.last_name}
          </span>
          {player.primary_position && (
            <Badge variant={POS_VARIANT[player.primary_position] || 'gray'}>
              {player.primary_position}
            </Badge>
          )}
          {player.offPosition && (
            <Badge variant="amber">Off-position</Badge>
          )}
        </div>
        <p style={{
          margin: '4px 0 0',
          fontFamily: 'var(--font-body)', fontWeight: 300, fontSize: 'var(--text-xs)',
          color: 'var(--color-text-muted)',
        }}>
          {player.why}
        </p>
      </div>
      <span style={{
        fontFamily: 'var(--font-stats)', fontSize: 'var(--text-base)',
        color: 'var(--color-text-primary)', letterSpacing: 1,
      }}>
        {player.score.toFixed(1)}
      </span>
    </div>
  );
}
