/**
 * emailService.js
 * Sends post-game stat summary emails to athletes who have opted in.
 * Requires SMTP env vars: EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
 * Falls back gracefully (logs a warning) if nodemailer is unavailable or SMTP is unconfigured.
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

/**
 * Build a plain-text + HTML email body for a single athlete.
 * @param {object} game   - { opponent, game_date, score_home, score_away }
 * @param {object} player - { first_name, last_name, jersey_number, ...stats }
 * @param {string} teamName
 */
function buildEmail(game, player, teamName) {
  const dateStr = game.game_date
    ? new Date(game.game_date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : 'Recent game';

  const score = (game.score_home != null && game.score_away != null)
    ? `${game.score_home}–${game.score_away}`
    : 'Final';

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

  const subject = `Your stats — ${teamName} vs ${game.opponent} (${score})`;

  const rows = [
    goals         > 0 || assists > 0 ? `Goals: ${goals}` : null,
    assists       > 0 ? `Assists: ${assists}` : null,
    shots         > 0 ? `Shots: ${shots} (${shotPct}% shooting)` : null,
    groundBalls   > 0 ? `Ground Balls: ${groundBalls}` : null,
    minutesPlayed > 0 ? `Minutes Played: ${minutesPlayed}` : null,
    faceoffWins + faceoffLosses > 0
      ? `Faceoffs: ${faceoffWins}–${faceoffLosses}` : null,
    saves         > 0 ? `Saves: ${saves}` : null,
    turnovers     > 0 ? `Turnovers: ${turnovers}` : null,
  ].filter(Boolean);

  if (rows.length === 0) rows.push('No stats recorded for this game.');

  const text = [
    `Hi ${player.first_name},`,
    '',
    `Here are your stats from ${dateStr} vs ${game.opponent} (${score}):`,
    '',
    ...rows,
    '',
    `— ${teamName} Coaching Staff`,
  ].join('\n');

  const statRows = rows.map(r => `<tr><td style="padding:6px 0;color:#94a3b8;font-size:13px;">${r.split(':')[0]}</td><td style="padding:6px 12px;color:#f1f5f9;font-size:15px;font-weight:600;">${r.split(':').slice(1).join(':').trim()}</td></tr>`).join('');

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="background:#0f172a;margin:0;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:480px;margin:0 auto;background:#1e293b;border-radius:12px;overflow:hidden;border:1px solid #334155;">
    <div style="background:#b8860b;padding:20px 24px;">
      <p style="margin:0;color:#fff;font-size:11px;letter-spacing:2px;text-transform:uppercase;font-weight:700;">${teamName}</p>
      <h1 style="margin:4px 0 0;color:#fff;font-size:22px;font-weight:700;">Game Summary</h1>
      <p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">vs ${game.opponent} &nbsp;·&nbsp; ${dateStr} &nbsp;·&nbsp; ${score}</p>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;color:#94a3b8;font-size:14px;">Hi ${player.first_name},</p>
      <table style="width:100%;border-collapse:collapse;">
        ${statRows}
      </table>
      <p style="margin:24px 0 0;color:#475569;font-size:12px;">— ${teamName} Coaching Staff</p>
    </div>
  </div>
</body>
</html>`;

  return { subject, text, html };
}

/**
 * Send post-game summary emails to all athletes on the roster who have
 * send_game_summary = true and a non-null email address.
 *
 * @param {object} game     - full game row from DB
 * @param {Array}  athletes - array of per-athlete stat rows from stats.js /game/:id query
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

  let sent = 0;
  for (const player of athletes) {
    if (!player.email || !player.send_game_summary) continue;
    const { subject, text, html } = buildEmail(game, player, teamName);
    try {
      await transporter.sendMail({ from, to: player.email, subject, text, html });
      sent++;
      logger.info(`emailService: sent game summary to ${player.email} (athlete ${player.athlete_id})`);
    } catch (err) {
      logger.error(`emailService: failed to send to ${player.email}: ${err.message}`);
    }
  }

  logger.info(`emailService: ${sent} post-game summary email(s) sent for game ${game.id}`);
}
