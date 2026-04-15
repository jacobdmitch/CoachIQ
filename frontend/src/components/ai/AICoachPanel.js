import React, { useState, useRef, useEffect, useCallback } from 'react';
import apiClient from '../../config/api';
import './AICoachPanel.css';

/* ─── Inline SVG icons ─────────────────────────────────────────────────────── */

function BrainIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.46 2.5 2.5 0 0 1-1.98-3 2.5 2.5 0 0 1-1.32-4.24 3 3 0 0 1 .34-5.58 2.5 2.5 0 0 1 1.96-3.1A2.5 2.5 0 0 1 9.5 2Z" />
      <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.46 2.5 2.5 0 0 0 1.98-3 2.5 2.5 0 0 0 1.32-4.24 3 3 0 0 0-.34-5.58 2.5 2.5 0 0 0-1.96-3.1A2.5 2.5 0 0 0 14.5 2Z" />
    </svg>
  );
}

function SendIcon({ className }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 2L11 13" />
      <path d="M22 2L15 22 11 13 2 9l20-7z" />
    </svg>
  );
}

/* ─── Quick prompt suggestions ────────────────────────────────────────────── */

const GAME_PROMPTS = [
  'Who should sub in?',
  'Assess my lineup',
  'Playtime equity check',
  'Tactical adjustment',
];

const GENERAL_PROMPTS = [
  'Analyze my roster',
  'Preparation tips',
  'Drill recommendations',
  'Position analysis',
];

/* ─── Message renderer ─────────────────────────────────────────────────────── */

function Message({ role, text, suggestions = [] }) {
  return (
    <div className="ai-message">
      <span className={`ai-message-role ${role}`}>
        {role === 'ai' ? 'Line Coach AI' : 'You'}
      </span>
      {text && <p className="ai-message-body">{text}</p>}
      {suggestions.map((s, i) => (
        <div key={i} className="ai-suggestion">
          <p className="ai-suggestion-title">{s.type?.replace(/_/g, ' ') || 'Suggestion'}</p>
          <p className="ai-suggestion-body">{s.description || s.reasoning || JSON.stringify(s)}</p>
        </div>
      ))}
    </div>
  );
}

/* ─── Main component ───────────────────────────────────────────────────────── */

/**
 * AICoachPanel
 *
 * @param {string}   gameId    — if provided, fetches game-specific recommendations
 * @param {string}   context   — short description shown in the context bar (e.g. "vs Falcons · Q2")
 * @param {boolean}  forceOpen — when true, opens the panel (controlled from parent)
 * @param {Function} onClose   — called when the panel is dismissed
 */
export default function AICoachPanel({ gameId, context, forceOpen, onClose }) {
  const [open,     setOpen]     = useState(false);
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [hasNew,   setHasNew]   = useState(false);

  const messagesEndRef = useRef(null);
  const textareaRef    = useRef(null);

  // Auto-scroll to latest message
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Sync with external open control (e.g. "Ask AI" button in GameMode)
  useEffect(() => {
    if (forceOpen) setOpen(true);
  }, [forceOpen]);

  // Unified close — updates internal state and notifies parent
  const handleClose = useCallback(() => {
    setOpen(false);
    onClose?.();
  }, [onClose]);

  // Mark as no new suggestions when panel opens
  useEffect(() => {
    if (open) setHasNew(false);
  }, [open]);

  // ─── API calls ────────────────────────────────────────────────────────────

  const fetchRecommendations = useCallback(async (focusArea) => {
    if (!gameId) return null;
    const res = await apiClient.post('/ai-coach/recommendations', { gameId, focusArea });
    return res.data.recommendation;
  }, [gameId]);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || loading) return;

    const userMsg = { role: 'coach', text: text.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      let recommendation;

      if (gameId) {
        // In-game: use the recommendations endpoint with the user's text as focusArea
        recommendation = await fetchRecommendations(text.trim());
      } else {
        // Out-of-game: use a general coaching prompt via the same endpoint
        // Falls back to text analysis only
        recommendation = await fetchRecommendations(text.trim()).catch(() => null);
      }

      if (recommendation) {
        setMessages(prev => [...prev, {
          role:        'ai',
          text:        recommendation.textAnalysis || '',
          suggestions: recommendation.suggestions  || [],
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: 'ai',
          text: 'I need an active game to provide real-time recommendations. Start a game and I can analyze your lineup, substitutions, and tactics.',
        }]);
      }
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Unable to reach the AI coach. Check your connection.';
      setMessages(prev => [...prev, { role: 'ai', text: errMsg }]);
    } finally {
      setLoading(false);
    }
  }, [gameId, loading, fetchRecommendations]);

  // Quick prompt fires immediately
  const handleQuickPrompt = useCallback((prompt) => {
    sendMessage(prompt);
  }, [sendMessage]);

  // Submit on Enter (not Shift+Enter)
  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  }

  // Load initial recommendations when panel opens with a gameId
  useEffect(() => {
    if (!open || !gameId || messages.length > 0) return;

    setLoading(true);
    fetchRecommendations()
      .then(rec => {
        if (rec) {
          setMessages([{
            role:        'ai',
            text:        rec.textAnalysis || 'Here are my recommendations for the current game state.',
            suggestions: rec.suggestions  || [],
          }]);
        } else {
          setMessages([{
            role: 'ai',
            text: 'Game loaded. Ask me anything — substitution suggestions, lineup analysis, or tactical adjustments.',
          }]);
        }
      })
      .catch(() => {
        setMessages([{
          role: 'ai',
          text: 'Ask me anything about your team, lineup, or game strategy.',
        }]);
      })
      .finally(() => setLoading(false));
  }, [open, gameId]); // eslint-disable-line react-hooks/exhaustive-deps

  const prompts = gameId ? GAME_PROMPTS : GENERAL_PROMPTS;

  return (
    <>
      {/* Floating action button */}
      <button
        className={`ai-fab${hasNew ? ' has-suggestion' : ''}`}
        onClick={() => setOpen(true)}
        aria-label="Open AI Coach"
        title="AI Coach"
      >
        <BrainIcon className="ai-fab-icon" />
      </button>

      {/* Panel + overlay */}
      {open && (
        <>
          <div className="ai-overlay" onClick={handleClose} aria-hidden="true" />

          <aside className="ai-panel" aria-label="AI Coach panel">

            {/* Header */}
            <div className="ai-panel-header">
              <BrainIcon className="ai-fab-icon" style={{ color: 'var(--color-gold)', width: 20, height: 20, flexShrink: 0 }} />
              <h2 className="ai-panel-title">LINE <span>COACH</span></h2>
              <button className="ai-panel-close" onClick={handleClose} aria-label="Close panel">
                ✕
              </button>
            </div>

            {/* Context bar */}
            {(gameId || context) && (
              <div className="ai-context-bar">
                <span className="ai-context-label">Context</span>
                <span className="ai-context-value">
                  {context || (gameId ? `Game ${gameId.slice(0, 8)}…` : 'General')}
                </span>
              </div>
            )}

            {/* Messages */}
            <div className="ai-messages">
              {messages.length === 0 && !loading && (
                <div className="ai-message">
                  <span className="ai-message-role ai">Line Coach AI</span>
                  <p className="ai-message-body">
                    {gameId
                      ? 'Loading game analysis…'
                      : 'Ask me anything about your roster, strategy, or player development.'}
                  </p>
                </div>
              )}

              {messages.map((msg, i) => (
                <Message key={i} role={msg.role} text={msg.text} suggestions={msg.suggestions} />
              ))}

              {loading && (
                <div className="ai-typing" aria-label="AI is thinking">
                  <div className="ai-typing-dot" />
                  <div className="ai-typing-dot" />
                  <div className="ai-typing-dot" />
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Quick prompts */}
            <div className="ai-quick-prompts">
              {prompts.map(p => (
                <button key={p} className="ai-quick-btn" onClick={() => handleQuickPrompt(p)} disabled={loading}>
                  {p}
                </button>
              ))}
            </div>

            {/* Text input */}
            <div className="ai-input-area">
              <textarea
                ref={textareaRef}
                className="ai-text-input"
                placeholder="Ask the AI coach…"
                rows={1}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
              />
              <button
                className="ai-send-btn"
                onClick={() => sendMessage(input)}
                disabled={loading || !input.trim()}
                aria-label="Send message"
              >
                <SendIcon className="ai-send-icon" />
              </button>
            </div>

          </aside>
        </>
      )}
    </>
  );
}
