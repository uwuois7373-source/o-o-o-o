import {
  Events,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} from 'discord.js';
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
import { buildVoteRow } from '../utils/suggestionVotes.js';

// ==========================================
// إعدادات نظام الاقتراحات
// ==========================================
const SUGGESTION_CHANNEL_ID = '1437792846907183165';
const START_EMOJI_FULL = '<:moderator:1519524179396005908>';
const SUGGESTION_TIMEZONE = 'Asia/Riyadh';

// ==========================================
// إعدادات نظام العروض (Offers System)
// ==========================================
const OFFERS_CHANNEL_ID = '1435618260581355603';
const OFFERS_ROLE_ID = '1526407997763354686';
const ORDER_CHANNEL_URL = 'https://discord.com/channels/1343103634761715755/1398080880236302407';

const OFFER_COLOR = 0xff0000; // أحمر
const TICKET_BUTTON_EMOJI = '<:Gemini_Generated_Image_csza3lcsz:1495076546539684121>';
const OFFER_INFO_EMOJI = '<:Gemini_Generated_Image_vzqcwfvzq:1495078839322280137>';
const OFFER_DELETE_EMOJI = '<:Gemini_Generated_Image_csza3lcsz:1495076791302357123>';

const DIVIDER_LINE_GIF =
  'https://cdn.discordapp.com/attachments/1391737614926614588/1555914383253708850/standard-1.gif?backend=b2&ex=6b0972b0&is=6b082130&hm=ae902d4ad6dc2d371f1028efb789e64efff59565abf7d5bdd66e6af45fda9d9e&';

export default {
  name: Events.MessageCreate,
  async execute(message, client) {
    try {
      if (message.author.bot || !message.guild) return;

      // 0. نظام الاقتراحات
      if (message.channel.id === SUGGESTION_CHANNEL_ID) {
        await handleSuggestion(message);
        return;
      }

      // 0.5 نظام العروض
      if (message.channel.id === OFFERS_CHANNEL_ID) {
        await handleOffer(message);
        return;
      }

      // 1. معالج الردود التلقائية
      handleAutoResponse(message);

      // 2. معالج الأوامر العادية
      await handlePrefixCommand(message, client);
    } catch (error) {
      logger.error('Error in messageCreate event:', error);
    }
  },
};

// ==========================================
// دالة الاقتراحات
// ==========================================
async function handleSuggestion(message) {
  try {
    const rawText = message.content.trim();
    if (!rawText && message.attachments.size === 0) return;

    const displayName = message.member?.displayName || message.author.username;
    const avatar = message.author.displayAvatarURL({ extension: 'png', size: 256 });
    const unix = Math.floor(Date.now() / 1000);

    const footerDate = new Date().toLocaleString('en-GB', {
      timeZone: SUGGESTION_TIMEZONE,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).replace(',', '');

    const safeText = (rawText || '—').replace(/`/g, 'ˋ').slice(0, 1000);

    const embed = new EmbedBuilder()
      .setColor(0x2b2d31)
      .setTitle(`${START_EMOJI_FULL} **New Suggestion!**`)
      .addFields(
        { name: '**Status**', value: '**Under Review**', inline: true },
        { name: '**User**', value: `**<@${message.author.id}>**`, inline: true },
        { name: '**Time**', value: `**<t:${unix}:f>**`, inline: true },
        { name: '**Suggestion**', value: `\`\`\`\n${safeText}\n\`\`\`` },
      )
      .setFooter({
        text: `Suggestion sent by : ${displayName} • ${footerDate}`,
        iconURL: avatar,
      });

    const files = [];
    const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
    if (image) {
      const ext = (image.name?.split('.').pop() || 'png').toLowerCase();
      const fileName = `suggestion.${ext}`;
      files.push(new AttachmentBuilder(image.url, { name: fileName }));
      embed.setThumbnail(`attachment://${fileName}`);
    } else {
      embed.setThumbnail(avatar);
    }

    await message.channel.send({
      embeds: [embed],
      components: [buildVoteRow(0, 0)],
      files,
    });
    await message.delete().catch(() => {});
  } catch (error) {
    logger.error('Error handling suggestion:', error);
  }
}

// ==========================================
// دالة العروض (Offers)
// ==========================================
async function handleOffer(message) {
  try {
    const rawText = message.content.trim();
    if (!rawText && message.attachments.size === 0) return;

    const safeText = rawText ? rawText.slice(0, 3500) : '—';
    const files = [];

    const embed = new EmbedBuilder()
      .setColor(OFFER_COLOR)
      .setDescription(`<@&${OFFERS_ROLE_ID}>\n\n${safeText}\n\n<@&${OFFERS_ROLE_ID}>`)
      .setTimestamp();

    const image = message.attachments.find(a => a.contentType?.startsWith('image/'));
    if (image) {
      const ext = (image.name?.split('.').pop() || 'png').toLowerCase();
      const fileName = `offer.${ext}`;
      files.push(new AttachmentBuilder(image.url, { name: fileName }));
      embed.setImage(`attachment://${fileName}`);
    }

    const linkRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Order Now')
        .setEmoji(TICKET_BUTTON_EMOJI)
        .setStyle(ButtonStyle.Link)
        .setURL(ORDER_CHANNEL_URL),
    );

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`offer_info:${message.author.id}:${message.createdTimestamp}`)
        .setLabel('Offer Information')
        .setEmoji(OFFER_INFO_EMOJI)
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`offer_delete:${message.author.id}`)
        .setLabel('Delete Offer')
        .setEmoji(OFFER_DELETE_EMOJI)
        .setStyle(ButtonStyle.Danger),
    );

    // إرسال العرض مع منشن رول العروض و @everyone (بدون خط داخل الإيمبد)
    await message.channel.send({
      content: `@everyone <@&${OFFERS_ROLE_ID}>`,
      embeds: [embed],
      components: [linkRow, actionRow],
      files,
      allowedMentions: {
        parse: ['everyone'],
        roles: [OFFERS_ROLE_ID],
      },
    });

    // إرسال الخط بعد الإيمبد كرسالة مستقلة
    await message.channel.send({
      content: DIVIDER_LINE_GIF,
    });

    await message.delete().catch(() => {});
  } catch (error) {
    logger.error('Error handling offer:', error);
  }
}

// ==========================================
// دالة الرد التلقائي
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
