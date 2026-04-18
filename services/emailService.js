/**
 * emailService.js
 * Sends post-game stat summary emails to athletes (and their parent contacts)
 * who have opted in via send_game_summary.
 *
 * Requires SMTP env vars: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
 * Uses ANTHROPIC_API_KEY for the optional AI-generated game narrative; falls back
 * to a simple template if the key is missing or the call fails. The email itself
 * always sends — narrative is additive, never blocking.
 */

import logger from './logger.js';

// Lazy-load nodemailer so the app still boots if the package isn't installed yet.
let nodemailer = null;
async function getMailer() {
  if (nodemailer) return nodemailer;
  try {
    nodemailer = await import('nodemailer');
    return nodemailer;
  } catch {
    return null;
  }
}

// Lazy-load Anthropic so missing deps / missing key don't break the email path.
let anthropicClient = null;
async function getAnthropic() {
  if (anthropicClient) return anthropicClient;
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const mod = await import('@anthropic-ai/sdk');
    const Anthropic = mod.default;
    anthropicClient = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    return anthropicClient;
  } catch {
    return null;
  }
}

function createTransport(nm) {
  return nm.default.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT || '587', 10),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

function isConfigured() {
  return !!(process.env.EMAIL_HOST && process.env.EMAIL_USER && process.env.EMAIL_PASS);
}

// ─── Team totals ────────────────────────────────────────────────────────────

/**
 * Aggregate per-athlete stat rows into team-wide totals. Accepts the same shape
 * that routes/games.js and routes/game-live.js pass to sendPostGameSummaries —
 * one row per athlete with numeric stat columns.
 */
export function computeTeamTotals(athletes) {
  const totals = {
    goals: 0, assists: 0, shots: 0, ground_balls: 0,
    saves: 0, turnovers: 0, faceoff_wins: 0, faceoff_losses: 0,
  };
  for (const a of athletes) {
    totals.goals          += Number(a.goals)          || 0;
    totals.assists        += Number(a.assists)        || 0;
    totals.shots          += Number(a.shots)          || 0;
    totals.ground_balls   += Number(a.ground_balls)   || 0;
    totals.saves          += Number(a.saves)          || 0;
    totals.turnovers      += Number(a.turnovers)      || 0;
    totals.faceoff_wins   += Number(a.faceoff_wins)   || 0;
    totals.faceoff_losses += Number(a.faceoff_losses) || 0;
  }
  return totals;
}

// ─── Narrative ──────────────────────────────────────────────────────────────

/**
 * Deterministic fallback narrative, used when the Anthropic call is unavailable
 * or fails. Short, factual, no hallucinated detail.
 */
function fallbackNarrative(game, teamName, totals) {
  const home = Number(game.score_home);
  const away = Number(game.score_away);
  let outcome = `${teamName} played ${game.opponent}`;
  if (Number.isFinite(home) && Number.isFinite(away)) {
    if (home > away)       outcome = `${teamName} defeated ${game.opponent} ${home}–${away}`;
    else if (home < away)  outcome = `${teamName} fell to ${game.opponent} ${home}–${away}`;
    else                   outcome = `${teamName} tied ${game.opponent} ${home}–${away}`;
  }
  const fo = totals.faceoff_wins + totals.faceoff_losses;
  const foPart = fo > 0 ? `, ${totals.faceoff_wins}–${totals.faceoff_losses} at the X` : '';
  return `${outcome}. The team recorded ${totals.goals} goal${totals.goals === 1 ? '' : 's'} ` +
         `on ${totals.shots} shot${totals.shots === 1 ? '' : 's'}, ${totals.ground_balls} ground ball${totals.ground_balls === 1 ? '' : 's'}${foPart}.`;
}

/**
 * Ask Claude for a short game narrative (2–3 sentences). Returns a string on
 * success, or null if the API is unavailable. Never throws — the caller is
 * expected to fall back.
 */
async function generateNarrative(game, teamName, totals) {
  const client = await getAnthropic();
  if (!client) return null;
  try {
    const prompt = [
      `Team: ${teamName}`,
      `Opponent: ${game.opponent}`,
      `Final score: ${teamName} ${game.score_home ?? '?'} – ${game.opponent} ${game.score_away ?? '?'}`,
      `Team totals — goals: ${totals.goals}, assists: ${totals.assists}, shots: ${totals.shots}, ` +
        `ground balls: ${totals.ground_balls}, saves: ${totals.saves}, turnovers: ${totals.turnovers}, ` +
        `faceoffs: ${totals.faceoff_wins}–${totals.faceoff_losses}`,
      '',
      'Write a 2–3 sentence recap of this lacrosse game. Mention the outcome and one or two notable team stats. ' +
      'Plain prose, no bullet points, no markdown, no headings. Do not invent player names or events not supported by the stats above.',
    ].join('\n');

    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 256,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content
      ?.filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();
    return text || null;
  } catch (err) {
    logger.warn(`emailService: narrative generation failed: ${err.message}`);
    return null;
  }
}

// ─── Recipients ─────────────────────────────────────────────────────────────

/**
 * Build a deduplicated recipient list for an athlete: athlete.email first, then
 * unique parent_contact emails. Case-insensitive dedupe; returns null if there
 * are no usable addresses.
 */
export function buildRecipients(player) {
  const out = [];
  const seen = new Set();
  const add = (raw) => {
    if (!raw) return;
    const e = String(raw).trim();
    if (!e) return;
    const key = e.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(e);
  };
  add(player.email);
  if (Array.isArray(player.parent_contacts)) {
    for (const c of player.parent_contacts) add(c?.email);
  }
  return out.length === 0 ? null : out;
}

// ─── Body rendering ─────────────────────────────────────────────────────────

function formatScore(game) {
  if (game.score_home != null && game.score_away != null) {
    return `${game.score_home}–${game.score_away}`;
  }
  return 'Final';
}

function buildTeamRows(totals) {
  // Only include categories with at least one event so short emails stay short.
  const fo = totals.faceoff_wins + totals.faceoff_losses;
  return [
    totals.goals        > 0 ? ['Team Goals',        String(totals.goals)]        : null,
    totals.assists      > 0 ? ['Team Assists',      String(totals.assists)]      : null,
    totals.shots        > 0 ? ['Team Shots',        String(totals.shots)]        : null,
    totals.ground_balls > 0 ? ['Ground Balls',      String(totals.ground_balls)] : null,
    totals.saves        > 0 ? ['Saves',             String(totals.saves)]        : null,
    totals.turnovers    > 0 ? ['Turnovers',         String(totals.turnovers)]    : null,
    fo                  > 0 ? ['Faceoffs',          `${totals.faceoff_wins}–${totals.faceoff_losses}`] : null,
  ].filter(Boolean);
}

function buildPlayerRows(player) {
  const goals         = Number(player.goals)         || 0;
  const assists       = Number(player.assists)       || 0;
  const shots         = Number(player.shots)         || 0;
  const groundBalls   = Number(player.ground_balls)  || 0;
  const minutesPlayed = Number(player.minutes_played)|| 0;
  const faceoffWins   = Number(player.faceoff_wins)  || 0;
  const faceoffLosses = Number(player.faceoff_losses)|| 0;
  const saves         = Number(player.saves)         || 0;
  const turnovers     = Number(player.turnovers)     || 0;
  const shotPct = shots > 0 ? Math.round((goals / shots) * 100) : 0;

  const rows = [
    (goals > 0 || assists > 0)      ? ['Goals',          String(goals)] : null,
    assists       > 0               ? ['Assists',        String(assists)] : null,
    shots         > 0               ? ['Shots',          `${shots} (${shotPct}% shooting)`] : null,
    groundBalls   > 0               ? ['Ground Balls',   String(groundBalls)] : null,
    minutesPlayed > 0               ? ['Minutes Played', String(minutesPlayed)] : null,
    (faceoffWins + faceoffLosses) > 0 ? ['Faceoffs',     `${faceoffWins}–${faceoffLosses}`] : null,
    saves         > 0               ? ['Saves',          String(saves)] : null,
    turnovers     > 0               ? ['Turnovers',      String(turnovers)] : null,
  ].filter(Boolean);

  if (rows.length === 0) rows.push(['No stats recorded for this game.', '']);
  return rows;
}

function rowsToHtml(rows) {
  return rows.map(([label, val]) =>
    `<tr><td style="padding:6px 0;color:#94a3b8;font-size:13px;">${label}</td>` +
    `<td style="padding:6px 12px;color:#f1f5f9;font-size:15px;font-weight:600;">${val}</td></tr>`
  ).join('');
}

function rowsToText(rows) {
  return rows.map(([label, val]) => (val ? `${label}: ${val}` : label)).join('\n');
}

/**
 * Build subject + text + html for one athlete. teamTotals and narrative are
 * precomputed once per game by the caller so we don't pay for them per-athlete.
 */
export function buildEmail(game, player, teamName, teamTotals, narrative) {
  const dateStr = game.game_date
    ? new Date(game.game_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Recent game';
  const score = formatScore(game);

  const teamRows   = buildTeamRows(teamTotals);
  const playerRows = buildPlayerRows(player);

  const subject = `Your stats — ${teamName} vs ${game.opponent} (${score})`;

  const text = [
    `Hi ${player.first_name},`,
    '',
    `Here's the recap from ${dateStr} vs ${game.opponent} (${score}).`,
    '',
    'GAME RECAP',
    narrative,
    '',
    'TEAM TOTALS',
    rowsToText(teamRows.length ? teamRows : [['No team stats recorded.', '']]),
    '',
    'YOUR STATS',
    rowsToText(playerRows),
    '',
    `— ${teamName} Coaching Staff`,
  ].join('\n');

  const teamTable   = teamRows.length
    ? `<table style="width:100%;border-collapse:collapse;">${rowsToHtml(teamRows)}</table>`
    : `<p style="margin:0;color:#64748b;font-size:13px;">No team stats recorded.</p>`;
  const playerTable = `<table style="width:100%;border-collapse:collapse;">${rowsToHtml(playerRows)}</table>`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0f172a;margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:520px;margin:0 auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
    <div style="background:#b8860b;padding:20px 24px;">
      <p style="margin:0;color:#fff;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">${teamName}</p>
      <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700;">Game Summary</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">vs ${game.opponent} &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; ${score}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#94a3b8;font-size:14px;">Hi ${player.first_name},</p>

      <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:14px;text-transform:uppercase;letter-spacing:1.5px;">Game Recap</h2>
      <p style="margin:0 0 24px;color:#cbd5e1;font-size:14px;line-height:1.5;">${narrative}</p>

      <h2 style="margin:0 0 8px;color:#f1f5f9;font-size:14px;text-transform:uppercase;letter-spacing:1.5px;">Team Totals</h2>
      ${teamTable}

      <h2 style="margin:24px 0 8px;color:#f1f5f9;font-size:14px;text-transform:uppercase;letter-spacing:1.5px;">Your Stats</h2>
      ${playerTable}

      <p style="margin:24px 0 0;color:#475569;font-size:12px;">— ${teamName} Coaching Staff</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

// ─── Entry point ────────────────────────────────────────────────────────────

/**
 * Send post-game summary emails to opted-in athletes and their parent contacts.
 *
 * `athletes` rows must be pre-filtered by send_game_summary=true at the query
 * layer (matches current games.js / game-live.js behavior). Each row may carry
 * a parent_contacts array (LEFT JOIN'd in the query) — if present, parent
 * emails are added to the recipient list for that athlete.
 *
 * @param {object} game     - full game row from DB
 * @param {Array}  athletes - array of per-athlete stat rows (opted-in only)
 * @param {string} teamName
 */
export async function sendPostGameSummaries(game, athletes, teamName) {
  if (!isConfigured()) {
    logger.warn('emailService: SMTP not configured — skipping post-game summaries');
    return;
  }

  const nm = await getMailer();
  if (!nm) {
    logger.warn('emailService: nodemailer not available — skipping post-game summaries');
    return;
  }

  const transporter = createTransport(nm);
  const from = process.env.EMAIL_FROM || process.env.EMAIL_USER;

  // Compute these once per game, not per recipient.
  const teamTotals = computeTeamTotals(athletes);
  const narrative =
    (await generateNarrative(game, teamName, teamTotals)) ||
    fallbackNarrative(game, teamName, teamTotals);

  let sent = 0;
  for (const player of athletes) {
    const recipients = buildRecipients(player);
    if (!recipients) continue;   // athlete + parents all lack usable emails

    const { subject, text, html } = buildEmail(game, player, teamName, teamTotals, narrative);
    const [primary, ...rest] = recipients;
    try {
      await transporter.sendMail({
        from,
        to:  primary,
        bcc: rest.length ? rest : undefined,   // parents (or additional addresses) get a blind copy
        subject,
        text,
        html,
      });
      sent++;
      logger.info(
        `emailService: sent game summary for athlete ${player.athlete_id} ` +
        `to ${recipients.length} recipient(s)`
      );
    } catch (err) {
      logger.error(`emailService: failed to send for athlete ${player.athlete_id}: ${err.message}`);
    }
  }

  logger.info(`emailService: ${sent} post-game summary email(s) sent for game ${game.id}`);
}
