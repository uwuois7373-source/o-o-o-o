import {
  Events,
  EmbedBuilder,
  AttachmentBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MessageFlags,
  PermissionFlagsBits,
} from 'discord.js';
import { logger } from '../utils/logger.js';
import { getGuildConfig } from '../services/config/guildConfig.js';
import {
  getBotMessage,
  isBotOwner,
  isCommandCategoryEnabled,
  isMaintenanceMode,
} from '../config/bot.js';
import botConfig from '../config/bot.js';
import { handleApplicationModal } from '../commands/Community/apply.js';
import { handleInteractionError, createError, ErrorTypes, ErrorCodes } from '../utils/errorHandler.js';
import { InteractionHelper } from '../utils/interactionHelper.js';
import { createInteractionTraceContext, runWithTraceContext } from '../utils/logger.js';
import { validateChatInputPayloadOrThrow } from '../utils/commandInputValidation.js';
import { enforceAbuseProtection, formatCooldownDuration } from '../utils/abuseProtection.js';
import { isCommandEnabled } from '../services/commandAccessService.js';
import { resolveSlashAccessKey } from '../utils/messageAdapter.js';
import { isCollectorManagedComponent } from '../utils/collectorComponents.js';
import { ResponseCoordinator } from '../utils/responseCoordinator.js';
import { enforceDefaultCommandPermissions } from '../utils/permissionGuard.js';

// ==========================================
// إعدادات نظام العروض (Offers System)
// ==========================================
const OFFERS_ROLE_ID = '1526407997763354686';
const ORDER_CHANNEL_URL = 'https://discord.com/channels/1343103634761715755/1398080880236302407';

const OFFER_COLOR = 0xff0000;
const TICKET_BUTTON_EMOJI = '<:Gemini_Generated_Image_csza3lcsz:1495076546539684121>';
const OFFER_INFO_EMOJI = '<:Gemini_Generated_Image_vzqcwfvzq:1495078839322280137>';
const OFFER_DELETE_EMOJI = '<:Gemini_Generated_Image_csza3lcsz:1495076791302357123>';

const DIVIDER_LINE_GIF =
  'https://cdn.discordapp.com/attachments/1391737614926614588/1555914383253708850/standard-1.gif?backend=b2&ex=6b0972b0&is=6b082130&hm=ae902d4ad6dc2d371f1028efb789e64efff59565abf7d5bdd66e6af45fda9d9e&';

const COMMAND_ERROR_SUBTYPES = {
  warn: 'warn_failed',
  kick: 'kick_failed',
  ban: 'ban_failed',
  unban: 'unban_failed',
  timeout: 'timeout_failed',
  untimeout: 'untimeout_failed',
  warnings: 'warnings_view_failed',
  ticket: 'ticket_failed',
  serverstats: 'serverstats_failed',
  gcreate: 'giveaway_failed',
  gend: 'giveaway_failed',
  gdelete: 'giveaway_failed',
  greroll: 'giveaway_failed',
};

function withTraceContext(context = {}, traceContext = {}) {
  return {
    traceId: traceContext.traceId,
    guildId: context.guildId || traceContext.guildId,
    userId: context.userId || traceContext.userId,
    command: context.commandName || traceContext.command,
    ...context
  };
}

export async function handleOffer(message) {
  try {
    const rawText = message.content.trim();
    if (!rawText && message.attachments.size === 0) return;

    const safeText = rawText ? rawText.slice(0, 3400) : '—';
    const files = [];

    const embed = new EmbedBuilder()
      .setColor(OFFER_COLOR)
      .setDescription(
        `<@&${OFFERS_ROLE_ID}>\n\n` + `────────────────────────\n` + `<@&${OFFERS_ROLE_ID}>\n` +
        `${safeText}` ) .setTimestamp();  const image = message.attachments.find(a => a.contentType?.startsWith('image/')); if (image) { const ext = (image.name?.split('.').pop() \vert{}\vert{} 'png').toLowerCase(); const fileName = `offer.${ext}`;
      files.push(new AttachmentBuilder(image.url, { name: fileName }));
      embed.setImage(`attachment://${fileName}`); }  const linkRow = new ActionRowBuilder().addComponents( new ButtonBuilder() .setLabel('Order Now') .setEmoji(TICKET_BUTTON_EMOJI) .setStyle(ButtonStyle.Link) .setURL(ORDER_CHANNEL_URL), );  const actionRow = new ActionRowBuilder().addComponents( new ButtonBuilder() .setCustomId(`offer_info:${message.author.id}:${message.createdTimestamp}`) .setLabel('Offer Information') .setEmoji(OFFER_INFO_EMOJI) .setStyle(ButtonStyle.Primary), new ButtonBuilder() .setCustomId(`offer_delete:${message.author.id}`)
        .setLabel('Delete Offer')
        .setEmoji(OFFER_DELETE_EMOJI)
        .setStyle(ButtonStyle.Danger),
    );

    const offerMsg = await message.channel.send({
      content: `@everyone <@&${OFFERS_ROLE_ID}>`, embeds: [embed], components: [linkRow, actionRow], files, allowedMentions: { parse: ['everyone'], roles: [OFFERS_ROLE_ID], }, });  const dividerMsg = await message.channel.send({ content: DIVIDER_LINE_GIF, });  const updatedActionRow = new ActionRowBuilder().addComponents( new ButtonBuilder() .setCustomId(`offer_info:${message.author.id}:${message.createdTimestamp}`) .setLabel('Offer Information') .setEmoji(OFFER_INFO_EMOJI) .setStyle(ButtonStyle.Primary), new ButtonBuilder() .setCustomId(`offer_delete:${message.author.id}:${dividerMsg.id}`) .setLabel('Delete Offer') .setEmoji(OFFER_DELETE_EMOJI) .setStyle(ButtonStyle.Danger), );  await offerMsg.edit({ components: [linkRow, updatedActionRow] }).catch(() => {}); await message.delete().catch(() => {}); } catch (error) { logger.error('Error handling offer:', error); } }  async function handleOfferButtons(interaction) { const [action, ownerId, dividerId] = interaction.customId.split(':');  if (action === 'offer_info') { const member = await interaction.guild?.members.fetch(ownerId).catch(() => null); const user = member?.user \vert{}\vert{} await interaction.client.users.fetch(ownerId).catch(() => null);  const createdAt = user?.createdAt \vert{}\vert{} new Date(); const ageDays = Math.max(0, Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24))); const ageMonths = Math.floor(ageDays / 30);  const rolesList = member ? member.roles.cache .filter(r => r.id !== interaction.guild.id) .sort((a, b) => b.position - a.position) .map(r => r.name) .join(' . ') \vert{}\vert{} 'None' : 'None';  const infoEmbed = new EmbedBuilder() .setColor(OFFER_COLOR) .setTitle(`${OFFER_INFO_EMOJI} **Offer Information**`)
      .addFields(
        { name: 'User', value: `<@${ownerId}>` },
        { name: 'Tag', value: `\`${user?.username || ownerId}\`` },
        { name: 'Account Age', value: `${ageDays} days (${ageMonths} months)` },
        { name: 'Roles', value: rolesList.slice(0, 1024) },
      )
      .setTimestamp();

    const profileRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('Owner Profile')
        .setEmoji(OFFER_INFO_EMOJI)
        .setStyle(ButtonStyle.Link)
        .setURL(`
