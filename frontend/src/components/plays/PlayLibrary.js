import React, { useState, useEffect } from 'react';
import api from '../../config/api.js';
import PlayCard from './PlayCard.js';
import PlayEditor from './PlayEditor.js';

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
export default function PlayLibrary({ teamId }) {
  const [plays, setPlays] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [editingPlay, setEditingPlay] = useState(null);
  const [isCreating, setIsCreating] = useState(false);

  // Load plays
  useEffect(() => {
    loadPlays();
  }, [teamId, filter]);

  const loadPlays = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (teamId) params.append('teamId', teamId);
      if (filter) params.append('situationTag', filter);

      const response = await api.get(`/plays?${params.toString()}`);
      setPlays(response.data.data || []);
    } catch (err) {
      console.error('Failed to load plays:', err);
      alert('Failed to load plays');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlay = async (playData) => {
    try {
      if (editingPlay) {
        // Update existing
        await api.put(`/plays/${editingPlay.id}`, playData);
        alert('Play updated successfully');
      } else {
        // Create new
        await api.post('/plays', playData);
        alert('Play created successfully');
      }
      setEditingPlay(null);
      setIsCreating(false);
      await loadPlays();
    } catch (err) {
      console.error('Failed to save play:', err);
      alert('Failed to save play');
    }
  };

  const handleDeletePlay = async (play) => {
    if (!window.confirm(`Delete play "${play.title}"?`)) return;

    try {
      await api.delete(`/plays/${play.id}`);
      alert('Play deleted');
      await loadPlays();
    } catch (err) {
      console.error('Failed to delete play:', err);
      alert('Failed to delete play');
    }
  };

  const handleDuplicatePlay = async (play) => {
    const newTitle = prompt(`Duplicate as:`, `${play.title} (Copy)`);
    if (!newTitle) return;

    try {
      await api.post(`/plays/${play.id}/duplicate`, { newTitle });
      alert('Play duplicated');
      await loadPlays();
    } catch (err) {
      console.error('Failed to duplicate play:', err);
      alert('Failed to duplicate play');
    }
  };

  // Show editor if creating/editing
  if (isCreating || editingPlay) {
    return (
      <PlayEditor
        play={editingPlay || null}
        teamId={teamId}
        onSave={handleSavePlay}
        onCancel={() => {
          setEditingPlay(null);
          setIsCreating(false);
        }}
      />
    );
  }

  // Library view
  return (
    <div style={{ padding: '16px', backgroundColor: '#f9f9f9', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: '0', fontSize: '24px', fontWeight: '700' }}>Play Library</h1>
        <button
          onClick={() => setIsCreating(true)}
          style={{
            padding: '10px 20px',
            backgroundColor: '#3b82f6',
            color: '#fff',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '600',
            minHeight: '44px',
          }}
        >
          + New Play
        </button>
      </div>

      {/* Filter bar */}
      <div style={{ marginBottom: '24px', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        {['', 'emo', 'man_down', 'settled', 'transition', 'faceoff', 'clear', '6s_set', '6s_fast_break'].map((tag) => (
          <button
            key={tag}
            onClick={() => setFilter(tag)}
            style={{
              padding: '6px 12px',
              backgroundColor: filter === tag ? (SITUATION_COLORS[tag] || '#333') : '#fff',
              color: filter === tag ? '#fff' : '#000',
              border: filter === tag ? 'none' : '1px solid #ddd',
              borderRadius: '20px',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: '600',
              minHeight: '44px',
            }}
          >
            {tag ? SITUATION_LABELS[tag] : 'All'}
          </button>
        ))}
      </div>

      {/* Empty state */}
      {plays.length === 0 && !loading && (
        <div style={{ textAlign: 'center', padding: '48px 24px' }}>
          <p style={{ fontSize: '16px', color: '#666', marginBottom: '16px' }}>
            No plays yet. Create your first play to get started!
          </p>
          <button
            onClick={() => setIsCreating(true)}
            style={{
              padding: '10px 20px',
              backgroundColor: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '600',
              minHeight: '44px',
            }}
          >
            Create First Play
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ textAlign: 'center', padding: '24px' }}>
          <p>Loading plays...</p>
        </div>
      )}

      {/* Play cards grid */}
      {plays.length > 0 && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
            gap: '16px',
          }}
        >
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
  );
}

export default PlayLibrary;
