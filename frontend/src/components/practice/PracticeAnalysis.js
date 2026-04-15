import React, { useState, useEffect } from 'react';
import api from '../../config/api.js';

const PracticeAnalysis = ({ teamId, onCreatePractice }) => {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!teamId) return;

    const fetchAnalysis = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await api.get(`/practice/analysis/${teamId}`);
        setAnalysis(response.data);
      } catch (err) {
        console.error('Error fetching practice analysis:', err);
        setError('Failed to load practice analysis');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalysis();
  }, [teamId]);

  const styles = {
    container: {
      padding: '16px',
      backgroundColor: '#f9f9f9',
      borderRadius: '8px',
    },
    header: {
      fontSize: '20px',
      fontWeight: 'bold',
      marginBottom: '16px',
      color: '#333',
    },
    loading: {
      textAlign: 'center',
      padding: '32px',
      color: '#666',
      fontSize: '16px',
    },
    error: {
      backgroundColor: '#FFEBEE',
      color: '#C62828',
      padding: '16px',
      borderRadius: '4px',
      marginBottom: '16px',
    },
    section: {
      marginBottom: '24px',
    },
    sectionTitle: {
      fontSize: '16px',
      fontWeight: '600',
      marginBottom: '12px',
      color: '#333',
      paddingBottom: '8px',
      borderBottom: '2px solid #1976D2',
      display: 'inline-block',
    },
    chipContainer: {
      display: 'flex',
      gap: '8px',
      flexWrap: 'wrap',
      marginBottom: '12px',
    },
    chip: {
      display: 'inline-block',
      padding: '8px 12px',
      borderRadius: '20px',
      fontSize: '14px',
      fontWeight: '500',
    },
    recentChip: {
      backgroundColor: '#C8E6C9',
      color: '#1B5E20',
    },
    stalledChip: {
      backgroundColor: '#FFF9C4',
      color: '#F57F17',
    },
    neverDrilledChip: {
      backgroundColor: '#FFCCBC',
      color: '#E65100',
    },
    emptyState: {
      textAlign: 'center',
      padding: '24px',
      color: '#999',
      fontSize: '14px',
      backgroundColor: '#fff',
      borderRadius: '4px',
      border: '1px dashed #ddd',
    },
    recommendationsGrid: {
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
      gap: '16px',
      marginTop: '12px',
    },
    timestamp: {
      fontSize: '12px',
      color: '#999',
      marginTop: '16px',
      fontStyle: 'italic',
    },
  };

  if (loading) {
    return <div style={styles.loading}>Loading practice analysis...</div>;
  }

  if (error) {
    return <div style={styles.error}>{error}</div>;
  }

  if (!analysis) {
    return <div style={styles.emptyState}>No analysis available</div>;
  }

  const {
    stalledSkills,
    neverDrilledSkills,
    recentlyPracticedSkills,
    recommendations,
    lastAnalyzedAt,
  } = analysis;

  // Format timestamp
  const analyzedDate = new Date(lastAnalyzedAt);
  const formattedDate = analyzedDate.toLocaleDateString() + ' ' + analyzedDate.toLocaleTimeString();

  return (
    <div style={styles.container}>
      <h2 style={styles.header}>Practice Gap Analysis</h2>

      {/* Recently Practiced Skills */}
      {recentlyPracticedSkills && recentlyPracticedSkills.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            Practiced in Last 14 Days ({recentlyPracticedSkills.length})
          </h3>
          <div style={styles.chipContainer}>
            {recentlyPracticedSkills.map((skill) => (
              <span key={skill} style={{ ...styles.chip, ...styles.recentChip }}>
                {skill.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Stalled Skills */}
      {stalledSkills && stalledSkills.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            Skills Needing Attention ({stalledSkills.length})
          </h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>
            These skills were drilled 14+ days ago but haven't been practiced recently.
          </p>
          <div style={styles.chipContainer}>
            {stalledSkills.map((skill) => (
              <span key={skill} style={{ ...styles.chip, ...styles.stalledChip }}>
                {skill.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Never Drilled Skills */}
      {neverDrilledSkills && neverDrilledSkills.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>
            Not Yet Drilled ({neverDrilledSkills.length})
          </h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>
            These core skills haven't been included in practices in the last 30 days.
          </p>
          <div style={styles.chipContainer}>
            {neverDrilledSkills.map((skill) => (
              <span key={skill} style={{ ...styles.chip, ...styles.neverDrilledChip }}>
                {skill.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div style={styles.section}>
          <h3 style={styles.sectionTitle}>Recommended Drills</h3>
          <p style={{ color: '#666', fontSize: '14px', marginBottom: '12px' }}>
            Add these drills to your next practice to address skill gaps:
          </p>
          <div style={styles.recommendationsGrid}>
            {recommendations.map((rec, idx) => (
              <div key={idx} style={{ backgroundColor: '#fff', padding: '12px', borderRadius: '4px', border: '1px solid #ddd' }}>
                <div style={{ fontSize: '14px', fontWeight: '600', marginBottom: '8px' }}>
                  {rec.drillName}
                </div>
                <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                  <div>Skill: {rec.skill.replace(/_/g, ' ')}</div>
                  <div>Duration: {rec.durationMinutes} min</div>
                  <div>Difficulty: {rec.difficulty}</div>
                </div>
                <div style={{ fontSize: '12px', color: '#FF9800', fontStyle: 'italic', marginBottom: '12px' }}>
                  {rec.reason}
                </div>
                <button
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: '#1976D2',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                  onClick={() => onCreatePractice && onCreatePractice([rec.drillId])}
                >
                  Add to Practice
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* No Gaps */}
      {(!stalledSkills || stalledSkills.length === 0) &&
        (!neverDrilledSkills || neverDrilledSkills.length === 0) && (
          <div style={styles.emptyState}>
            Great job! Your team has been practicing all core skills regularly.
          </div>
        )}

      <div style={styles.timestamp}>Last analyzed: {formattedDate}</div>
    </div>
  );
};

export default PracticeAnalysis;
