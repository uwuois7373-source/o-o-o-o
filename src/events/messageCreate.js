async function handleOffer(message) {
  try {
    const rawText = message.content.trim();
    if (!rawText && message.attachments.size === 0) return;

    const safeText = rawText ? rawText.slice(0, 3400) : '—';
    const files = [];

    const embed = new EmbedBuilder()
      .setColor(OFFER_COLOR)
      .setDescription(
        `<@&${OFFERS_ROLE_ID}>\n\n` +
        `────────────────────────\n` +
        `<@&${OFFERS_ROLE_ID}>\n` +
        `${safeText}`
      )
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

    await message.channel.send({
      content: DIVIDER_LINE_GIF,
    });

    await message.delete().catch(() => {});
  } catch (error) {
    logger.error('Error handling offer:', error);
  }
}
