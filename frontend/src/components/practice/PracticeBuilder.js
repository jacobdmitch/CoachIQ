import React, { useState, useEffect } from 'react';
import api from '../../config/api.js';
import DrillCard from './DrillCard.js';

function formatTag(tag) {
  return tag.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

const PracticeBuilder = ({ session, teamId, onSave, onCancel }) => {
  // Form state
  const [practiceDate, setPracticeDate] = useState(session?.practiceDate || '');
  const [practiceTime, setPracticeTime] = useState(session?.startTime || '');
  const [notes, setNotes] = useState(session?.notes || '');
  const [drillBlocks, setDrillBlocks] = useState(session?.drillBlocks || []);
  const [drillLibrary, setDrillLibrary] = useState([]);
  const [loadingDrills, setLoadingDrills] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  // Drill picker state
  const [showDrillPicker, setShowDrillPicker] = useState(false);
  const [drillSearch, setDrillSearch] = useState('');
  const [drillCategory, setDrillCategory] = useState('all');

  // Load drill library on mount
  useEffect(() => {
    const loadDrills = async () => {
      setLoadingDrills(true);
      try {
        const response = await api.get('/practice/drills/library');
        setDrillLibrary(response.data.drills || []);
      } catch (err) {
        console.error('Error loading drill library:', err);
        setError('Failed to load drill library');
      } finally {
        setLoadingDrills(false);
      }
    };

    loadDrills();
  }, []);

  // Calculate totals
  const totalMinutes = drillBlocks.reduce((sum, block) => sum + (block.duration_minutes || 0), 0);
  const totalHours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  const durationDisplay = totalHours > 0 ? `${totalHours}h ${remainingMinutes}m` : `${remainingMinutes}m`;

  // Extract union of all skill tags
  const allFocusTags = Array.from(
    new Set(
      drillBlocks.flatMap((block) => block.skill_tags || [])
    )
  );

  // Filter drills for picker
  const filteredDrills = drillLibrary.filter((drill) => {
    const matchesSearch =
      !drillSearch ||
      drill.name.toLowerCase().includes(drillSearch.toLowerCase()) ||
      (drill.skill_tags || []).some((tag) =>
        tag.toLowerCase().includes(drillSearch.toLowerCase())
      );

    const matchesCategory =
      drillCategory === 'all' || drill.category === drillCategory;

    return matchesSearch && matchesCategory;
  });

  // Add a drill from the library
  const handleAddDrill = (drill) => {
    const newBlock = {
      id: `block_${Date.now()}`,
      drill_id: drill.id,
      drill_name: drill.name,
      duration_minutes: drill.duration_minutes,
      notes: '',
      skill_tags: drill.skill_tags || [],
      order: drillBlocks.length + 1,
    };

    setDrillBlocks([...drillBlocks, newBlock]);
    setShowDrillPicker(false);
    setDrillSearch('');
  };

  // Add a custom block
  const handleAddCustomBlock = () => {
    const newBlock = {
      id: `block_${Date.now()}`,
      drill_id: null,
      drill_name: 'Custom Drill',
      duration_minutes: 10,
      notes: '',
      skill_tags: [],
      order: drillBlocks.length + 1,
    };

    setDrillBlocks([...drillBlocks, newBlock]);
  };

  // Update a block
  const handleUpdateBlock = (blockId, updates) => {
    setDrillBlocks(
      drillBlocks.map((block) =>
        block.id === blockId ? { ...block, ...updates } : block
      )
    );
  };

  // Remove a block
  const handleRemoveBlock = (blockId) => {
    setDrillBlocks(drillBlocks.filter((block) => block.id !== blockId));
  };

  // Move block up
  const handleMoveBlockUp = (blockId) => {
    const idx = drillBlocks.findIndex((b) => b.id === blockId);
    if (idx === 0) return;

    const newBlocks = [...drillBlocks];
    [newBlocks[idx - 1], newBlocks[idx]] = [newBlocks[idx], newBlocks[idx - 1]];
    setDrillBlocks(newBlocks);
  };

  // Move block down
  const handleMoveBlockDown = (blockId) => {
    const idx = drillBlocks.findIndex((b) => b.id === blockId);
    if (idx === drillBlocks.length - 1) return;

    const newBlocks = [...drillBlocks];
    [newBlocks[idx], newBlocks[idx + 1]] = [newBlocks[idx + 1], newBlocks[idx]];
    setDrillBlocks(newBlocks);
  };

  // Save practice session
  const handleSave = async () => {
    if (!practiceDate) {
      setError('Practice date is required');
      return;
    }

    if (drillBlocks.length === 0) {
      setError('Add at least one drill to the practice');
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const payload = {
        team_id: teamId,
        practice_date: practiceDate,
        start_time: practiceTime || null,
        drill_blocks: drillBlocks,
        focus_tags: allFocusTags,
        notes: notes,
      };

      if (session && session.id) {
        // Update existing
        await api.put(`/practice/${session.id}`, payload);
      } else {
        // Create new
        await api.post('/practice', payload);
      }

      onSave && onSave();
    } catch (err) {
      console.error('Error saving practice session:', err);
      setError('Failed to save practice session');
    } finally {
      setSaving(false);
    }
  };

  const styles = {
    container: {
      padding: '16px',
      maxWidth: '900px',
      margin: '0 auto',
    },
    header: {
      fontSize: '24px',
      fontWeight: 'bold',
      marginBottom: '24px',
      color: '#333',
    },
    formSection: {
      marginBottom: '24px',
      backgroundColor: '#fff',
      padding: '16px',
      borderRadius: '8px',
      border: '1px solid #ddd',
    },
    label: {
      display: 'block',
      fontSize: '14px',
      fontWeight: '600',
      marginBottom: '8px',
      color: '#333',
    },
    input: {
      width: '100%',
      padding: '10px',
      fontSize: '14px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
    },
    textarea: {
      width: '100%',
      padding: '10px',
      fontSize: '14px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      minHeight: '80px',
      resize: 'vertical',
    },
    statsBar: {
      display: 'flex',
      gap: '24px',
      padding: '12px',
      backgroundColor: '#F5F5F5',
      borderRadius: '4px',
      fontSize: '14px',
      marginBottom: '16px',
    },
    stat: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
    },
    statLabel: {
      fontSize: '12px',
      color: '#999',
      fontWeight: '600',
    },
    statValue: {
      fontSize: '18px',
      fontWeight: 'bold',
      color: '#1976D2',
    },
    drillBlocksSection: {
      marginBottom: '24px',
    },
    drillBlocksTitle: {
      fontSize: '16px',
      fontWeight: '600',
      marginBottom: '12px',
      color: '#333',
    },
    drillBlock: {
      display: 'flex',
      gap: '12px',
      padding: '12px',
      backgroundColor: '#f9f9f9',
      borderRadius: '4px',
      marginBottom: '12px',
      alignItems: 'flex-start',
      border: '1px solid #ddd',
    },
    drillBlockControls: {
      display: 'flex',
      flexDirection: 'column',
      gap: '4px',
      minWidth: '40px',
    },
    controlButton: {
      padding: '4px 8px',
      fontSize: '12px',
      backgroundColor: '#f0f0f0',
      border: '1px solid #ccc',
      borderRadius: '2px',
      cursor: 'pointer',
      fontWeight: '500',
    },
    drillBlockContent: {
      flex: 1,
    },
    drillBlockHeader: {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: '8px',
      gap: '12px',
    },
    drillBlockName: {
      fontSize: '15px',
      fontWeight: '600',
      color: '#333',
      flex: 1,
    },
    drillBlockMeta: {
      display: 'flex',
      gap: '12px',
      fontSize: '12px',
      color: '#666',
      marginBottom: '8px',
    },
    durationInput: {
      width: '60px',
      padding: '4px',
      fontSize: '12px',
      border: '1px solid #ddd',
      borderRadius: '2px',
    },
    notesInput: {
      width: '100%',
      padding: '6px',
      fontSize: '12px',
      border: '1px solid #ddd',
      borderRadius: '2px',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
      minHeight: '40px',
      resize: 'vertical',
    },
    removeButton: {
      padding: '4px 8px',
      fontSize: '12px',
      backgroundColor: '#FFEBEE',
      color: '#C62828',
      border: '1px solid #EF5350',
      borderRadius: '2px',
      cursor: 'pointer',
      fontWeight: '500',
    },
    buttonGroup: {
      display: 'flex',
      gap: '12px',
      flexWrap: 'wrap',
      marginBottom: '16px',
    },
    button: {
      padding: '10px 16px',
      borderRadius: '4px',
      border: 'none',
      fontSize: '14px',
      fontWeight: '600',
      cursor: 'pointer',
    },
    primaryButton: {
      backgroundColor: '#1976D2',
      color: '#fff',
    },
    secondaryButton: {
      backgroundColor: '#f5f5f5',
      color: '#333',
      border: '1px solid #ddd',
    },
    dangerButton: {
      backgroundColor: '#F44336',
      color: '#fff',
    },
    drillPickerOverlay: {
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'flex-end',
      zIndex: 1000,
    },
    drillPickerPanel: {
      width: '100%',
      maxHeight: '90vh',
      backgroundColor: '#fff',
      borderRadius: '12px 12px 0 0',
      padding: '16px',
      overflow: 'auto',
    },
    drillPickerHeader: {
      fontSize: '18px',
      fontWeight: 'bold',
      marginBottom: '16px',
      color: '#333',
      position: 'sticky',
      top: 0,
      backgroundColor: '#fff',
      paddingBottom: '12px',
      borderBottom: '1px solid #ddd',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    searchInput: {
      width: '100%',
      padding: '10px',
      fontSize: '14px',
      border: '1px solid #ddd',
      borderRadius: '4px',
      marginBottom: '12px',
      boxSizing: 'border-box',
      fontFamily: 'inherit',
    },
    filterGroup: {
      display: 'flex',
      gap: '8px',
      marginBottom: '16px',
      flexWrap: 'wrap',
    },
    filterButton: {
      padding: '8px 12px',
      fontSize: '13px',
      border: '1px solid #ddd',
      borderRadius: '20px',
      backgroundColor: '#fff',
      cursor: 'pointer',
      transition: 'all 0.2s',
      fontWeight: '500',
    },
    filterButtonActive: {
      backgroundColor: '#1976D2',
      color: '#fff',
      borderColor: '#1976D2',
    },
    error: {
      backgroundColor: '#FFEBEE',
      color: '#C62828',
      padding: '12px',
      borderRadius: '4px',
      marginBottom: '16px',
      fontSize: '14px',
    },
    emptyState: {
      textAlign: 'center',
      padding: '32px 16px',
      color: '#999',
      fontSize: '14px',
    },
    focusTags: {
      display: 'flex',
      gap: '6px',
      flexWrap: 'wrap',
      marginTop: '8px',
    },
    focusTag: {
      display: 'inline-block',
      backgroundColor: '#E3F2FD',
      color: '#1976D2',
      padding: '4px 8px',
      borderRadius: '4px',
      fontSize: '12px',
    },
  };

  // Get unique categories from drill library
  const categories = Array.from(
    new Set(['all', ...drillLibrary.map((d) => d.category)])
  );

  return (
    <div style={styles.container}>
      <h1 style={styles.header}>
        {session ? 'Edit Practice Session' : 'Create New Practice Session'}
      </h1>

      {error && <div style={styles.error}>{error}</div>}

      {/* Date and Metadata */}
      <div style={styles.formSection}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 160px', gap: '12px', marginBottom: '0' }}>
          <div>
            <label style={styles.label}>Practice Date *</label>
            <input
              type="date"
              style={styles.input}
              value={practiceDate}
              onChange={(e) => setPracticeDate(e.target.value)}
            />
          </div>
          <div>
            <label style={styles.label}>Start Time <span style={{ fontWeight: 400, color: '#999' }}>(opt.)</span></label>
            <input
              type="time"
              style={styles.input}
              value={practiceTime}
              onChange={(e) => setPracticeTime(e.target.value)}
            />
          </div>
        </div>

        <label style={{ ...styles.label, marginTop: '16px' }}>Notes</label>
        <textarea
          style={styles.textarea}
          placeholder="Coaching notes, focus areas, observations..."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </div>

      {/* Stats Bar */}
      <div style={styles.statsBar}>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Total Duration</span>
          <span style={styles.statValue}>{durationDisplay}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Drill Blocks</span>
          <span style={styles.statValue}>{drillBlocks.length}</span>
        </div>
        <div style={styles.stat}>
          <span style={styles.statLabel}>Focus Skills</span>
          <span style={styles.statValue}>{allFocusTags.length}</span>
        </div>
      </div>

      {/* Focus Tags Display */}
      {allFocusTags.length > 0 && (
        <div style={styles.formSection}>
          <label style={styles.label}>Auto-Computed Focus Tags</label>
          <div style={styles.focusTags}>
            {allFocusTags.map((tag) => (
              <span key={tag} style={styles.focusTag}>
                {formatTag(tag)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Drill Blocks */}
      <div style={styles.drillBlocksSection}>
        <h2 style={styles.drillBlocksTitle}>Practice Drills</h2>

        {drillBlocks.length === 0 && (
          <div style={styles.emptyState}>
            No drills added yet. Click "Add Drill" to get started.
          </div>
        )}

        {drillBlocks.map((block, idx) => (
          <div key={block.id} style={styles.drillBlock}>
            <div style={styles.drillBlockControls}>
              <button
                style={styles.controlButton}
                onClick={() => handleMoveBlockUp(block.id)}
                disabled={idx === 0}
                title="Move up"
              >
                ↑
              </button>
              <button
                style={styles.controlButton}
                onClick={() => handleMoveBlockDown(block.id)}
                disabled={idx === drillBlocks.length - 1}
                title="Move down"
              >
                ↓
              </button>
            </div>

            <div style={styles.drillBlockContent}>
              <div style={styles.drillBlockHeader}>
                <div style={styles.drillBlockName}>{block.drill_name || block.name || 'Unnamed Drill'}</div>
                <button
                  style={styles.removeButton}
                  onClick={() => handleRemoveBlock(block.id)}
                  title="Remove drill"
                >
                  Remove
                </button>
              </div>

              <div style={styles.drillBlockMeta}>
                <span>
                  Duration:
                  <input
                    type="number"
                    style={styles.durationInput}
                    min="1"
                    max="120"
                    value={block.duration_minutes}
                    onChange={(e) =>
                      handleUpdateBlock(block.id, {
                        duration_minutes: parseInt(e.target.value) || 0,
                      })
                    }
                  />
                  min
                </span>
              </div>

              {(block.skill_tags || []).length > 0 && (
                <div style={styles.focusTags}>
                  {block.skill_tags.map((tag) => (
                    <span key={tag} style={styles.focusTag}>
                      {formatTag(tag)}
                    </span>
                  ))}
                </div>
              )}

              <textarea
                style={styles.notesInput}
                placeholder="Notes for this drill..."
                value={block.notes}
                onChange={(e) =>
                  handleUpdateBlock(block.id, { notes: e.target.value })
                }
              />
            </div>
          </div>
        ))}
      </div>

      {/* Add Drill Buttons */}
      <div style={styles.buttonGroup}>
        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={() => setShowDrillPicker(true)}
          disabled={loadingDrills}
        >
          + Add Drill from Library
        </button>
        <button
          style={{ ...styles.button, ...styles.secondaryButton }}
          onClick={handleAddCustomBlock}
        >
          + Add Custom Block
        </button>
      </div>

      {/* Save/Cancel */}
      <div style={styles.buttonGroup}>
        <button
          style={{ ...styles.button, ...styles.primaryButton }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Practice'}
        </button>
        <button
          style={{ ...styles.button, ...styles.secondaryButton }}
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>

      {/* Drill Picker Modal */}
      {showDrillPicker && (
        <div style={styles.drillPickerOverlay} onClick={() => setShowDrillPicker(false)}>
          <div
            style={styles.drillPickerPanel}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.drillPickerHeader}>
              <span>Add Drill from Library</span>
              <button
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer',
                  padding: 0,
                }}
                onClick={() => setShowDrillPicker(false)}
              >
                ×
              </button>
            </div>

            <input
              type="text"
              style={styles.searchInput}
              placeholder="Search drills by name or skill..."
              value={drillSearch}
              onChange={(e) => setDrillSearch(e.target.value)}
            />

            <div style={styles.filterGroup}>
              {categories.map((cat) => (
                <button
                  key={cat}
                  style={{
                    ...styles.filterButton,
                    ...(drillCategory === cat ? styles.filterButtonActive : {}),
                  }}
                  onClick={() => setDrillCategory(cat)}
                >
                  {cat === 'all'
                    ? 'All Categories'
                    : cat.charAt(0).toUpperCase() + cat.slice(1)}
                </button>
              ))}
            </div>

            {filteredDrills.length === 0 ? (
              <div style={styles.emptyState}>No drills match your search.</div>
            ) : (
              <div>
                {filteredDrills.map((drill) => (
                  <DrillCard
                    key={drill.id}
                    drill={drill}
                    onAddToPractice={handleAddDrill}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default PracticeBuilder;
