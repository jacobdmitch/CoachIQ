import React from 'react';

const DrillCard = ({ drill, onAddToPractice, actionButton }) => {
  // Color map for difficulty badges
  const difficultyColors = {
    Beginner: '#4CAF50',
    Intermediate: '#FFC107',
    Advanced: '#F44336',
  };

  const styles = {
    card: {
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '16px',
      marginBottom: '12px',
      backgroundColor: '#fff',
      boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    },
    header: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '12px',
    },
    title: {
      fontSize: '18px',
      fontWeight: 'bold',
      margin: 0,
      color: '#333',
      flex: 1,
    },
    difficultyBadge: {
      display: 'inline-block',
      backgroundColor: difficultyColors[drill.difficulty] || '#999',
      color: '#fff',
      padding: '4px 12px',
      borderRadius: '20px',
      fontSize: '12px',
      fontWeight: 'bold',
      marginLeft: '8px',
      whiteSpace: 'nowrap',
    },
    meta: {
      display: 'flex',
      gap: '16px',
      fontSize: '14px',
      color: '#666',
      marginBottom: '12px',
      flexWrap: 'wrap',
    },
    metaItem: {
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
    },
    categoryBadge: {
      display: 'inline-block',
      backgroundColor: '#E3F2FD',
      color: '#1976D2',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
      fontWeight: '500',
    },
    skillTags: {
      display: 'flex',
      gap: '6px',
      flexWrap: 'wrap',
      marginBottom: '12px',
    },
    skillTag: {
      display: 'inline-block',
      backgroundColor: '#F5F5F5',
      color: '#666',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
    },
    description: {
      fontSize: '14px',
      color: '#555',
      lineHeight: '1.5',
      marginBottom: '12px',
    },
    footer: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: '12px',
      paddingTop: '12px',
      borderTop: '1px solid #eee',
    },
    button: {
      padding: '8px 16px',
      borderRadius: '4px',
      border: 'none',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
      whiteSpace: 'nowrap',
    },
    primaryButton: {
      backgroundColor: '#1976D2',
      color: '#fff',
    },
    secondaryButton: {
      backgroundColor: '#f5f5f5',
      color: '#333',
    },
  };

  return (
    <div style={styles.card}>
      <div style={styles.header}>
        <h3 style={styles.title}>{drill.name}</h3>
        <span style={styles.difficultyBadge}>{drill.difficulty}</span>
      </div>

      <div style={styles.meta}>
        <div style={styles.metaItem}>
          <span style={styles.categoryBadge}>
            {drill.category.charAt(0).toUpperCase() + drill.category.slice(1)}
          </span>
        </div>
        <div style={styles.metaItem}>
          <span>{drill.duration_minutes} min</span>
        </div>
        <div style={styles.metaItem}>
          <span>
            {drill.min_players} - {drill.optimal_players} players
          </span>
        </div>
      </div>

      {drill.skill_tags && drill.skill_tags.length > 0 && (
        <div style={styles.skillTags}>
          {drill.skill_tags.map((tag, idx) => (
            <span key={idx} style={styles.skillTag}>
              {tag}
            </span>
          ))}
        </div>
      )}

      <p style={styles.description}>{drill.description}</p>

      <div style={styles.footer}>
        {actionButton || (
          <button
            style={{ ...styles.button, ...styles.primaryButton }}
            onClick={() => onAddToPractice && onAddToPractice(drill)}
          >
            Add to Practice
          </button>
        )}
      </div>
    </div>
  );
};

export default DrillCard;
