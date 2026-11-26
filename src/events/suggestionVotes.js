import fs from 'node:fs';
import path from 'node:path';
import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

// ايدي الإيموجيات (الرقم الأخير)
export const UP_EMOJI = '1573676877745225859';    // صح
export const DOWN_EMOJI = '1573676851396612106';  // غلط

const FILE = path.join(process.cwd(), 'data', 'suggestionVotes.json');

function load() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    return {};
  }
}

function save(data) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data));
}

export function buildVoteRow(up = 0, down = 0) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('sug_up')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: UP_EMOJI })
      .setLabel(String(up)),
    new ButtonBuilder()
      .setCustomId('sug_down')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji({ id: DOWN_EMOJI })
      .setLabel(String(down)),
  );
}

// يسجل أو يلغي تصويت الشخص
export function toggleVote(messageId, userId, type) {
  const data = load();
  const entry = (data[messageId] ??= { up: [], down: [] });
  const other = type === 'up' ? 'down' : 'up';

  entry[other] = entry[other].filter(id => id !== userId);

  let action;
  if (entry[type].includes(userId)) {
    entry[type] = entry[type].filter(id => id !== userId);
    action = 'removed';
  } else {
    entry[type].push(userId);
    action = 'added';
  }

  save(data);
  return { action, up: entry.up.length, down: entry.down.length };
}
