import React, { useState, useEffect, useCallback } from 'react';
import api from '../../config/api.js';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import PlayCard from './PlayCard.js';
import PlayEditor from './PlayEditor.js';
import styles from './PlayLibrary.module.css';

const SITUATION_COLORS = {
  emo: '#22c55e',
  man_down: '#ef4444',
  settled: '#3b82f6',
  transition: '#f59e0b',
  faceoff: '#8b5cf6',
  clear: '#06b6d4',
  '6s_set': '#ec4899',
  '6s_fast_break': '#f97316',
};

const SITUATION_LABELS = {
  emo: 'EMO',
  man_down: 'Man-Down',
  settled: 'Settled',
  transition: 'Transition',
  faceoff: 'Faceoff',
  clear: 'Clear',
  '6s_set': '6s Set',
  '6s_fast_break': '6s Fast Break',
};

/**
 * PlayLibrary - Play library list view with filtering
 */
export default function PlayLibrary() {
  const { team } = useAuth();
  const toast = useToast();
  const teamId = team?.id;
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [editingPlay, setEditingPlay] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  const loadPlays = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (teamId) params.append('teamId', teamId);
      if (filter) params.append('situationTag', filter);

      const response = await api.get(`/plays?${params.toString()}`);
      setPlays(response.data.data || []);
    } catch (err) {
      console.error('Failed to load plays:', err);
      toast.error('Failed to load plays');
    } finally {
      setLoading(false);
    }
  }, [teamId, filter, toast]);

  // Load plays
  useEffect(() => {
    loadPlays();
  }, [loadPlays]);

  const handleSavePlay = async (playData) => {
    try {
      if (editingPlay) {
        // Update existing
        await api.put(`/plays/${editingPlay.id}`, playData);
        toast.success('Play updated successfully');
      } else {
        // Create new
        await api.post('/plays', playData);
        toast.success('Play created successfully');
      }
      setEditingPlay(null);
      setIsCreating(false);
      await loadPlays();
    } catch (err) {
      console.error('Failed to save play:', err);
      toast.error('Failed to save play');
    }
  };

  const handleDeletePlay = async (play) => {
    if (!window.confirm(`Delete play "${play.title}"?`)) return;

    try {
      await api.delete(`/plays/${play.id}`);
      toast.success('Play deleted');
      await loadPlays();
    } catch (err) {
      console.error('Failed to delete play:', err);
      toast.error('Failed to delete play');
    }
  };

  const handleDuplicatePlay = async (play) => {
    const newTitle = prompt(`Duplicate as:`, `${play.title} (Copy)`);
    if (!newTitle) return;

    try {
      await api.post(`/plays/${play.id}/duplicate`, { newTitle });
      toast.success('Play duplicated');
      await loadPlays();
    } catch (err) {
      console.error('Failed to duplicate play:', err);
      toast.error('Failed to duplicate play');
    }
  };

  // Show editor if creating/editing
  // PlayEditor manages its own full-height layout — render outside page-content
  if (isCreating || editingPlay) {
    return (
      <div className="play-editor-page">
        <PlayEditor
          play={editingPlay || null}
          teamId={teamId}
          onSave={handleSavePlay}
          onCancel={() => {
            setEditingPlay(null);
            setIsCreating(false);
          }}
        />
      </div>
    );
  }

  // Library view
  return (
    <div className="page-content">
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.header}>
          <div>
            <h1 className={styles.title}>Play <span style={{ color: 'var(--color-gold)' }}>Library</span></h1>
            <p className={styles.subtitle}>{plays.length > 0 ? `${plays.length} plays` : 'Build your playbook'}</p>
          </div>
          <button onClick={() => setIsCreating(true)} className={styles.newPlayBtn}>
            + New Play
          </button>
        </div>

        {/* Filter bar */}
        <div className={styles.filterBar}>
          {['', 'emo', 'man_down', 'settled', 'transition', 'faceoff', 'clear', '6s_set', '6s_fast_break'].map((tag) => (
            <button
              key={tag}
              onClick={() => setFilter(tag)}
              className={filter === tag ? styles.filterBtnActive : styles.filterBtnInactive}
              style={filter === tag ? { backgroundColor: SITUATION_COLORS[tag] || 'var(--color-surface-4)' } : undefined}
            >
              {tag ? SITUATION_LABELS[tag] : 'All'}
            </button>
          ))}
        </div>

        {/* Loading state */}
        {loading && (
          <div className={styles.loadingState}>
            Loading plays…
          </div>
        )}

        {/* Empty state */}
        {plays.length === 0 && !loading && (
          <div className={styles.emptyState}>
            <p className={styles.emptyText}>
              No plays yet. Build your first play to get started.
            </p>
            <button onClick={() => setIsCreating(true)} className={styles.newPlayBtn}>
              Create First Play
            </button>
          </div>
        )}

        {/* Play cards grid */}
        {plays.length > 0 && (
          <div className={styles.playGrid}>
            {plays.map((play) => (
              <PlayCard
                key={play.id}
                play={play}
                onEdit={() => setEditingPlay(play)}
                onDuplicate={handleDuplicatePlay}
                onDelete={handleDeletePlay}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
