import { Events, MessageFlags } from 'discord.js';
import { logger } from '../utils/logger.js';
import { buildVoteRow, toggleVote } from '../utils/suggestionVotes.js';

const MESSAGES = {
  up: {
    added: '** <:emoji_12:1519524315194982585> تم تسجيل تصويتك بالموافقة على الاقتراح.**',
    removed: '<:emoji_13:1519524319556796436> لقد أزلت تصويتك بالموافقة.',
  },
  down: {
    added: '<:emoji_13:1519524319556796436> تم تسجيل تصويتك برفض الاقتراح.',
    removed: '⚠️ لقد أزلت تصويتك بالرفض.',
  },
};

export default {
  name: Events.InteractionCreate,
  async execute(interaction) {
    try {
      if (!interaction.isButton()) return;
      if (interaction.customId !== 'sug_up' && interaction.customId !== 'sug_down') return;

      const type = interaction.customId === 'sug_up' ? 'up' : 'down';
      const result = toggleVote(interaction.message.id, interaction.user.id, type);

      // تحديث العدادات على الأزرار
      await interaction.update({ components: [buildVoteRow(result.up, result.down)] });

      // رسالة لا يراها إلا الشخص الذي صوّت
      await interaction.followUp({
        content: MESSAGES[type][result.action],
        flags: MessageFlags.Ephemeral,
      });
    } catch (error) {
      logger.error('Error handling suggestion vote:', error);
    }
  },
};
