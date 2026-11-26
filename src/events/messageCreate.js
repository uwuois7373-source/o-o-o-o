import { Events, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import { parsePrefixCommand } from '../utils/prefixParser.js';
import { supportsPrefixExecution, executePrefixCommand, resolvePrefixAccessKey } from '../utils/messageAdapter.js';
import { resolveCommandAlias, resolveSubcommandAlias } from '../config/commands/commandAliases.js';
import { getPrefixRestriction } from '../config/commands/prefixRestrictions.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import { getCommandPrefix, getBotMessage, isBotOwner, isCommandCategoryEnabled, isMaintenanceMode } from '../config/bot.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { createEmbed } from '../utils/embeds.js';
import { isCommandEnabled } from '../services/commandAccessService.js';

// ==========================================
// إعدادات نظام الاقتراحات
// ==========================================
const SUGGESTION_CHANNEL_ID = '1437792846907183165';

// إيموجي التصويت (نستخدم الـ ID الأخير فقط)
const UP_EMOJI = '1573676877745225859';    // صح
const DOWN_EMOJI = '1573676851396612106';  // غلط

// إيموجي يظهر في بداية نص الاقتراح (الصيغة الكاملة)
const START_EMOJI_FULL = '<:1158060888041979934:1538952241652699136>';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      // تجاهل البوتات والرسائل الخاصة
      if (message.author.bot || !message.guild) return;

      // 0. نظام الاقتراحات
      if (message.channel.id === SUGGESTION_CHANNEL_ID) {
        await handleSuggestion(message);
        return; // ما نكمل للردود التلقائية أو الأوامر داخل روم الاقتراحات
      }

      // 1. معالج الردود التلقائية (يعمل فوراً)
      handleAutoResponse(message);

      // 2. معالج الأوامر العادية
      await handlePrefixCommand(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  }
};

// ==========================================
// دالة الاقتراحات
// ==========================================
async function handleSuggestion(message) {
  try {
    const text = message.content.trim();

    // لو الرسالة فاضية تماماً (بدون نص ولا مرفقات) نتجاهلها
    if (!text && message.attachments.size === 0) return;

    const embed = new EmbedBuilder()
      .setColor(0x5865f2)
      .setAuthor({
        name: message.member?.displayName || message.author.username,
        iconURL: message.author.displayAvatarURL({ dynamic: true }),
      })
      .setDescription(`${START_EMOJI_FULL} ${text || '\u200b'}`)
      .setFooter({ text: `ID: ${message.author.id}` })
      .setTimestamp();

    // لو فيه صورة مرفقة نحطها داخل الـ embed
    const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
    if (image) embed.setImage(image.url);

    // نرسل الاقتراح أول، وبعدها نحذف رسالة الشخص (عشان ما يضيع الاقتراح لو فشل الإرسال)
    const sent = await message.channel.send({ embeds: [embed] });
    await message.delete().catch(() => {});

    // نضيف إيموجي التصويت
    await sent.react(UP_EMOJI);
    await sent.react(DOWN_EMOJI);
  } catch (error) {
    logger.error('Error handling suggestion:', error);
  }
}

// ==========================================
// دالة الرد التلقائي (نظيفة وتعمل بدون توقف)
// ==========================================
function handleAutoResponse(message) {
  try {
    const content = message.content.trim().toLowerCase();

    if (content === 'ip') {
      message.reply('144.217.62.159:7777').catch(() => {});
    } else if (content === 'fayt') {
      message.reply('pr.sampdroid.app:7777').catch(() => {});
    } else if (content === 'خط') {
      message.reply('https://cdn.discordapp.com/attachments/1391737614926614588/1555914383253708850/standard-1.gif?backend=b2&ex=6ac2ea70&is=6ac198f0&hm=15533f388cc6ffddc683615e6f416376bd0bd16b83a7ec36e905c0037bc320d7&').catch(() => {});
    } else if (content === 'رابط') {
      message.reply('𝐃𝐙  𝐓𝐎𝐏  | 𝐌𝐎𝐃𝐒  2𝐊\nhttps://discord.gg/CdGddfWQZq').catch(() => {});
    }
  } catch (error) {
    logger.error('Error handling auto response:', error);
  }
}

// ==========================================
// معالج أوامر البريفكس
// ==========================================
async function handlePrefixCommand(message, client) {
  try {
    const guildConfig = await getGuildConfig(client, message.guild.id);
    const prefix = guildConfig?.prefix || getCommandPrefix();
    const parsed = parsePrefixCommand(message.content, prefix);

    if (!parsed) return;

    let { commandName, args } = parsed;
    const musicPrefixShortcut = commandName.toLowerCase();
    const MUSIC_PREFIX_SHORTCUTS = new Set(['leave', 'pause', 'resume', 'skip', 'stop', 'volume']);
    if (MUSIC_PREFIX_SHORTCUTS.has(musicPrefixShortcut)) {
      commandName = 'music';
      args = [musicPrefixShortcut, ...args];
    }

    const resolvedCommandName = resolveCommandAlias(commandName);
    const command = client.commands.get(resolvedCommandName);

    if (!command) return;

    if (isMaintenanceMode() && !isBotOwner(message.author.id)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Maintenance Mode',
          description: getBotMessage('maintenanceMode'),
          color: 'warning',
        })],
      }).catch(() => {});
      return;
    }

    if (!isCommandCategoryEnabled(command.category)) {
      await message.channel.send({
        embeds: [createEmbed({
          title: 'Feature Disabled',
          description: getBotMessage('commandDisabled'),
          color: 'error',
        })],
      }).catch(() => {});
      return;
    }

    const restriction = getPrefixRestriction(command, args, resolveSubcommandAlias);
    if (!supportsPrefixExecution(command) || restriction.blocked) {
      if (restriction.blocked && restriction.reason) {
        const embed = createEmbed({
          title: 'Slash Command Only',
          description: `${restriction.reason}\nUse \`/${resolvedCommandName}\` instead.`,
          color: 'info',
        });
        await message.channel.send({ embeds: [embed] }).catch(() => {});
      }
      return;
    }

    if (!(await isCommandEnabled(client, message.guild.id, resolvePrefixAccessKey(command.data, args), command.category))) {
      const embed = createEmbed({
        title: 'Command Disabled',
        description: 'This command has been disabled for this server.',
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    const mockInteractionForProtection = {
      guildId: message.guild.id,
      user: message.author,
    };
    const abuseProtection = await enforceAbuseProtection(
      mockInteractionForProtection,
      command,
      resolvedCommandName,
    );
    if (!abuseProtection.allowed) {
      const formattedCooldown = formatCooldownDuration(abuseProtection.remainingMs);
      const embed = createEmbed({
        title: 'Command Cooldown',
        description: `This command is on cooldown. Please wait ${formattedCooldown} before trying again.`,
        color: 'error',
      });
      await message.channel.send({ embeds: [embed] }).catch(() => {});
      return;
    }

    await executePrefixCommand(command, message, args, client, prefix, guildConfig);
  } catch (error) {
    logger.error('Error handling prefix command:', error);
  }
}
