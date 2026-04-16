import React, { useState, useEffect } from 'react';
import api from '../../config/api.js';
import { useAuth } from '../../context/AuthContext.js';
import PracticeBuilder from './PracticeBuilder.js';
import PracticeAnalysis from './PracticeAnalysis.js';
import { formatDateTime, formatTag } from '../../utils/formatters.js';

const PRACTICE_DATE_OPTS = { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' };

const PracticeCalendar = () => {
  const { team } = useAuth();
  const teamId = team?.id;
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [view, setView] = useState('list'); // 'list', 'builder', 'analysis', 'detail'
  const [selectedSession, setSelectedSession] = useState(null);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Load practice sessions
  useEffect(() => {
    if (!teamId) {
      setLoading(false);
      return;
    }

    const loadSessions = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get('/practice', {
          params: {
            team_id: teamId,
            limit: 20,
            offset: 0,
          },
        });
        setSessions(response.data.sessions || []);
        setHasMore(response.data.hasMore || false);
        setOffset(0);
      } catch (err) {
        console.error('Error loading practice sessions:', err);
        setError('Failed to load practice sessions');
      } finally {
        setLoading(false);
      }
    };

    loadSessions();
  }, [teamId]);

  // Handle new/edit practice
  const handleCreateNew = () => {
    setSelectedSession(null);
    setView('builder');
  };

  const handleEditSession = (session) => {
    setSelectedSession(session);
    setView('builder');
  };

  const handleSavePractice = async () => {
    // Refresh the list after save
    setView('list');
    if (teamId) {
      try {
        const response = await api.get('/practice', {
          params: {
            team_id: teamId,
            limit: 20,
            offset: 0,
          },
        });
        setSessions(response.data.sessions || []);
        setHasMore(response.data.hasMore || false);
        setOffset(0);
      } catch (err) {
        console.error('Error refreshing sessions:', err);
      }
    }
  };

  const handleCancelPractice = () => {
    setView('list');
    setSelectedSession(null);
  };

  const handleViewDetails = (session) => {
    setSelectedSession(session);
    setView('detail');
  };

  const handleCreateFromAnalysis = (drillIds) => {
    const newSession = {
      practiceDate: new Date().toISOString().split('T')[0],
      drillBlocks: drillIds.map((drillId, idx) => ({
        id: `block_${Date.now()}_${idx}`,
        drill_id: drillId,
        drill_name: '', // Will be populated by builder
        duration_minutes: 10,
        notes: 'Added from gap analysis',
        skill_tags: [],
        order: idx + 1,
      })),
      notes: 'Practice session created from gap analysis recommendations',
      focusTags: [],
    };
    setSelectedSession(newSession);
    setView('builder');
  };

  const handleLoadMore = async () => {
    if (!hasMore || !teamId) return;

    try {
      const newOffset = offset + 20;
      const response = await api.get('/practice', {
        params: {
          team_id: teamId,
          limit: 20,
          offset: newOffset,
        },
      });
      setSessions([...sessions, ...(response.data.sessions || [])]);
      setHasMore(response.data.hasMore || false);
      setOffset(newOffset);
    } catch (err) {
      console.error('Error loading more sessions:', err);
    }
  };

  const styles = {
    container: {
      padding: '16px',
      maxWidth: '1200px',
      margin: '0 auto',
      minHeight: '100vh',
      backgroundColor: 'var(--color-surface-0)',
      color: 'var(--color-text-primary)',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: '24px',
      flexWrap: 'wrap',
      gap: '16px',
    },
    title: {
      fontSize: '28px',
      fontWeight: 'bold',
      color: 'var(--color-text-primary)',
      margin: 0,
    },
    buttonGroup: {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
    },
    button: {
      padding: '10px 16px',
      borderRadius: '4px',
      border: 'none',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    primaryButton: {
      backgroundColor: 'var(--color-gold)',
      color: 'var(--color-surface-0)',
    },
    secondaryButton: {
      backgroundColor: 'var(--color-surface-2)',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--color-border)',
    },
    loading: {
      textAlign: 'center',
      padding: '32px',
      color: 'var(--color-text-muted)',
      fontSize: '16px',
    },
    error: {
      backgroundColor: 'rgba(239,68,68,0.1)',
      color: 'var(--color-red)',
      padding: '16px',
      borderRadius: '4px',
      marginBottom: '16px',
      fontSize: '14px',
      border: '1px solid rgba(239,68,68,0.3)',
    },
    sessionsList: {
      display: 'grid',
      gap: '12px',
    },
    sessionCard: {
      backgroundColor: 'var(--color-surface-1)',
      border: '1px solid var(--color-border)',
      borderRadius: '8px',
      padding: '16px',
      cursor: 'pointer',
      transition: 'border-color 0.2s, transform 0.2s',
    },
    sessionCardHover: {
      borderColor: 'var(--color-gold-border)',
      transform: 'translateY(-2px)',
    },
    sessionDate: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: 'var(--color-text-primary)',
      marginBottom: '8px',
    },
    sessionMeta: {
      display: 'flex',
      gap: '16px',
      fontSize: '14px',
      color: 'var(--color-text-muted)',
      marginBottom: '12px',
      flexWrap: 'wrap',
    },
    metaItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    chipContainer: {
      display: 'flex',
      gap: '6px',
      flexWrap: 'wrap',
      marginBottom: '12px',
    },
    chip: {
      display: 'inline-block',
      backgroundColor: 'var(--color-surface-2)',
      color: 'var(--color-text-secondary)',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500',
      border: '1px solid var(--color-border)',
    },
    sessionActions: {
      display: 'flex',
      gap: '8px',
      marginTop: '12px',
      borderTop: '1px solid var(--color-border)',
      paddingTop: '12px',
    },
    actionButton: {
      padding: '6px 12px',
      fontSize: '13px',
      border: 'none',
      borderRadius: '4px',
      cursor: 'pointer',
      fontWeight: '500',
    },
    viewButton: {
      backgroundColor: 'var(--color-surface-2)',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--color-border)',
    },
    editButton: {
      backgroundColor: 'var(--color-gold-muted)',
      color: 'var(--color-gold)',
      border: '1px solid var(--color-gold-border)',
    },
    emptyState: {
      textAlign: 'center',
      padding: '48px 16px',
      backgroundColor: 'var(--color-surface-1)',
      borderRadius: '8px',
      border: '1px dashed var(--color-border)',
    },
    emptyStateIcon: {
      fontSize: '48px',
      marginBottom: '16px',
      opacity: 0.5,
    },
    emptyStateTitle: {
      fontSize: '18px',
      fontWeight: '600',
      color: 'var(--color-text-muted)',
      marginBottom: '8px',
    },
    emptyStateText: {
      fontSize: '14px',
      color: 'var(--color-text-subtle)',
      marginBottom: '16px',
    },
    loadMoreButton: {
      display: 'block',
      margin: '32px auto 16px',
      padding: '12px 24px',
      backgroundColor: 'var(--color-gold)',
      color: 'var(--color-surface-0)',
      border: 'none',
      borderRadius: '4px',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
    },
  };

  // Show builder view
  if (view === 'builder') {
    return (
      <PracticeBuilder
        session={selectedSession}
        teamId={teamId}
        onSave={handleSavePractice}
        onCancel={handleCancelPractice}
      />
    );
  }

  // Show analysis view
  if (view === 'analysis') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>Practice Analysis</h1>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => setView('list')}
          >
            Back to Calendar
          </button>
        </div>
        <PracticeAnalysis
          teamId={teamId}
          onCreatePractice={handleCreateFromAnalysis}
        />
      </div>
    );
  }

  // Show detail view
  if (view === 'detail' && selectedSession) {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <h1 style={styles.title}>
            Practice Session — {formatDateTime(selectedSession.practiceDate, selectedSession.startTime, PRACTICE_DATE_OPTS)}
          </h1>
          <div style={styles.buttonGroup}>
            <button
              style={{ ...styles.button, ...styles.primaryButton }}
              onClick={() => handleEditSession(selectedSession)}
            >
              Edit
            </button>
            <button
              style={{ ...styles.button, ...styles.secondaryButton }}
              onClick={() => setView('list')}
            >
              Back
            </button>
          </div>
        </div>

        {/* Session Details */}
        <div style={{ backgroundColor: 'var(--color-surface-1)', padding: '16px', borderRadius: '8px', marginBottom: '16px', border: '1px solid var(--color-border)' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '12px', color: 'var(--color-text-primary)' }}>
            Drills ({selectedSession.drillBlocks.length})
          </h2>

          {selectedSession.drillBlocks.map((block, idx) => (
            <div
              key={block.id}
              style={{
                padding: '12px',
                backgroundColor: 'var(--color-surface-2)',
                borderRadius: '4px',
                marginBottom: '8px',
                border: '1px solid var(--color-border)',
              }}
            >
              <div style={{ fontWeight: '600', marginBottom: '4px', color: 'var(--color-text-primary)' }}>
                {idx + 1}. {block.drill_name || block.name || '—'}
              </div>
              <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginBottom: '4px' }}>
                Duration: {block.duration_minutes} min
              </div>
              {block.skill_tags && block.skill_tags.length > 0 && (
                <div style={styles.chipContainer}>
                  {block.skill_tags.map((tag) => (
                    <span key={tag} style={styles.chip}>
                      {formatTag(tag)}
                    </span>
                  ))}
                </div>
              )}
              {block.notes && (
                <div style={{ fontSize: '13px', color: 'var(--color-text-muted)', marginTop: '6px', fontStyle: 'italic' }}>
                  Notes: {block.notes}
                </div>
              )}
            </div>
          ))}

          {selectedSession.notes && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                Session Notes
              </h3>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '14px', lineHeight: '1.5', whiteSpace: 'pre-wrap' }}>
                {selectedSession.notes}
              </p>
            </div>
          )}

          {selectedSession.focusTags && selectedSession.focusTags.length > 0 && (
            <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid var(--color-border)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px', color: 'var(--color-text-primary)' }}>
                Focus Tags
              </h3>
              <div style={styles.chipContainer}>
                {selectedSession.focusTags.map((tag) => (
                  <span key={tag} style={styles.chip}>
                    {formatTag(tag)}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show list view
  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h1 style={styles.title}>Practice Calendar</h1>
        <div style={styles.buttonGroup}>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={handleCreateNew}
          >
            + New Practice
          </button>
          <button
            style={{ ...styles.button, ...styles.secondaryButton }}
            onClick={() => setView('analysis')}
          >
            Practice Analysis
          </button>
        </div>
      </div>

      {error && <div style={styles.error}>{error}</div>}

      {loading ? (
        <div style={styles.loading}>Loading practice sessions...</div>
      ) : sessions.length === 0 ? (
        <div style={styles.emptyState}>
          <div style={styles.emptyStateIcon}>📅</div>
          <h2 style={styles.emptyStateTitle}>No practices yet</h2>
          <p style={styles.emptyStateText}>
            Start by creating your first practice session.
          </p>
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={handleCreateNew}
          >
            Create First Practice
          </button>
        </div>
      ) : (
        <>
          <div style={styles.sessionsList}>
            {sessions.map((session) => (
              <div
                key={session.id}
                style={styles.sessionCard}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
                  e.currentTarget.style.transform = 'translateY(-2px)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                  e.currentTarget.style.transform = 'translateY(0)';
                }}
              >
                <div style={styles.sessionDate}>
                  {formatDateTime(session.practiceDate, session.startTime, PRACTICE_DATE_OPTS)}
                </div>

                <div style={styles.sessionMeta}>
                  <div style={styles.metaItem}>
                    <span>
                      {session.drillBlocks.length} drill
                      {session.drillBlocks.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div style={styles.metaItem}>
                    <span>
                      {session.drillBlocks.reduce(
                        (sum, block) => sum + (block.duration_minutes || 0),
                        0
                      )}{' '}
                      minutes
                    </span>
                  </div>
                </div>

                {session.focusTags && session.focusTags.length > 0 && (
                  <div style={styles.chipContainer}>
                    {session.focusTags.slice(0, 5).map((tag) => (
                      <span key={tag} style={styles.chip}>
                        {formatTag(tag)}
                      </span>
                    ))}
                    {session.focusTags.length > 5 && (
                      <span style={styles.chip}>
                        +{session.focusTags.length - 5} more
                      </span>
                    )}
                  </div>
                )}

                {session.notes && (
                  <div style={{ fontSize: '13px', color: '#666', marginTop: '8px' }}>
                    {session.notes.substring(0, 100)}
                    {session.notes.length > 100 ? '...' : ''}
                  </div>
                )}

                <div style={styles.sessionActions}>
                  <button
                    style={{ ...styles.actionButton, ...styles.viewButton }}
                    onClick={() => handleViewDetails(session)}
                  >
                    View
                  </button>
                  <button
                    style={{ ...styles.actionButton, ...styles.editButton }}
                    onClick={() => handleEditSession(session)}
                  >
                    Edit
                  </button>
                </div>
              </div>
            ))}
          </div>

          {hasMore && (
            <button style={styles.loadMoreButton} onClick={handleLoadMore}>
              Load More
            </button>
          )}
        </>
      )}
    </div>
  );
};

export default PracticeCalendar;
