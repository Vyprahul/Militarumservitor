// index.js

import { Client, GatewayIntentBits, Partials, EmbedBuilder, GuildMember, ActionRowBuilder, ButtonBuilder, StringSelectMenuBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } from 'discord.js';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import { SlashCommandBuilder } from '@discordjs/builders';
import mongoose from 'mongoose';
import noblox from 'noblox.js';
import fetch from 'node-fetch';
import dotenv from 'dotenv';
dotenv.config();

// Initialize Discord Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  partials: [Partials.GuildMember],
});

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ MongoDB Connected'))
  .catch(err => {
    console.error('❌ MongoDB Connection Failed:', err);
    process.exit(1); // Exit process if DB connection fails
  });

// Define Verification Schema
const verificationSchema = new mongoose.Schema({
  discordId: { type: String, required: true, unique: true },
  robloxUsername: { type: String, required: true },
  robloxUserId: { type: String, required: true },
  verificationCode: { type: String, required: true },
  activeVerification: { type: Boolean, default: true },
  progress: {
    defenseTrainings: { type: Number, default: 0 },
    raidTrainings: { type: Number, default: 0 },
    warfareEvents: { type: Number, default: 0 },
    trooperTrainingsGroupProtocol: { type: Number, default: 0 },
    trooperTrainingsGameSense: { type: Number, default: 0 },
    trooperTrainingsTerrain: { type: Number, default: 0 },
    zombieAimChallenge: { type: Boolean, default: false },
    groupPrimaried: { type: Boolean, default: false },
    conscriptAssessmentPassed: { type: Boolean, default: false },
    warnings: { type: Number, default: 0 },
    seniorTrooperCommissariatPathway: {
      defenseTrainings: { type: Number, default: 0 },
      raidTrainings: { type: Number, default: 0 },
      warfareEvents: { type: Number, default: 0 },
      trooperTrainingsGameSense: { type: Number, default: 0 },
      trooperTrainingsGroupProtocol: { type: Number, default: 0 },
      trooperTrainingsTerrain: { type: Number, default: 0 },
      zombieAimChallenge: { type: Boolean, default: false },
      completeAssignments: { type: Boolean, default: false },
    },
  },
  rank: { type: Number, default: 2 },
  previousVerifications: [{
    discordId: String,
    robloxUsername: String,
    robloxUserId: String,
    verificationCode: String,
    verifiedAt: { type: Date, default: Date.now },
  }],
  notificationsSent: {
    conscriptRequirementsMet: { type: Boolean, default: false },
    trooperRequirementsMet: { type: Boolean, default: false },
    seniorTrooperRequirementsMet: { type: Boolean, default: false },
    heliosPathwayRequirementsMet: { type: Boolean, default: false },
    seniorTrooperCommissariatPathwayRequirementsMet: { type: Boolean, default: false },
    commissariatPathwayRequirementsMet: { type: Boolean, default: false },
  },
});

// Create Verification Model
const Verification = mongoose.model('Verification', verificationSchema, 'verifications');

// Constants and Mappings
const GROUP_ID = Number(process.env.ROBLOX_GROUP_ID); // Ensure ROBLOX_GROUP_ID is set in .env

const rankToRole = {
  2: '1290522120698335274', // Conscript
  3: '1290522157230718996', // Trooper
  4: '1290522199282946171', // Senior Trooper
  5: null, // Senior Trooper Helios Pathway (No Discord Roles)
  6: '1290522501461315625', // Senior Trooper Commissariat Pathway
};

const rankToNickname = {
  2: '[C]',
  3: '[T]',
  4: '[ST]',
  5: '[ST-H]', // Senior Trooper Helios Pathway
  6: '[ST-C]', // Senior Trooper Commissariat Pathway
};

const rankToFullName = {
  2: 'Conscript',
  3: 'Trooper',
  4: 'Senior Trooper',
  5: 'Senior Trooper Helios Pathway',
  6: 'Senior Trooper Commissariat Pathway',
};

// Role and Channel IDs
const VERIFIED_ROLE_ID = '1290519890964381719';
const HIGH_RANK_ROLE_ID = '1282049997386547262';
const CONSCRIPT_COMMISSAR_ROLE_ID = '1061865123758743584';
const COMPLETION_CHANNEL_ID = '1284204638580641812';
const LOG_CHANNEL_ID = 'YourLogChannelID'; // Replace with actual ID
const PROGRESS_LOG_CHANNEL_ID = '1290520438849540138';
const TROOPER_COMPLETION_ROLE_ID = '1061865160672813126';
const TROOPER_COMPLETION_CHANNEL_ID = '1284204395218731120';
const SENIOR_TROOPER_COMPLETION_ROLE_ID = '1061865192998305802';
const SENIOR_TROOPER_COMPLETION_CHANNEL_ID = '1290520984528355390';

import { PermissionFlagsBits } from 'discord.js'

// Define Slash Commands
const commands = [
  new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Starts the verification process for your Roblox account.')
    .addStringOption(option =>
      option.setName('username')
        .setDescription('Your Roblox username')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('check-verification')
    .setDescription('Checks if the verification code is present in your Roblox profile.'),
  new SlashCommandBuilder()
    .setName('progress')
    .setDescription('Displays your current progress in the group.'),
  new SlashCommandBuilder()
    .setName('update')
    .setDescription('Updates your Discord roles based on your current Roblox rank.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // Restricted to HIGH_RANK_ROLE_ID
  new SlashCommandBuilder()
    .setName('edit-progress')
    .setDescription('Modify user progress.')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // Restricted to HIGH_RANK_ROLE_ID
    .addSubcommand(subcommand =>
      subcommand.setName('defense-trainings')
        .setDescription('Add or remove defense trainings.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('raid-trainings')
        .setDescription('Add or remove raid trainings.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('warfare-events')
        .setDescription('Add or remove warfare events.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('trooper-trainings-group-protocol')
        .setDescription('Add or remove Group Protocol Trooper Training.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('trooper-trainings-game-sense')
        .setDescription('Add or remove Game Sense Trooper Training.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('trooper-trainings-terrain')
        .setDescription('Add or remove Terrain Trooper Training.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('conscript-assessment')
        .setDescription('Mark Conscript Assessment as passed or failed.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Pass or Fail').setRequired(true).addChoices(
          { name: 'Pass', value: 'pass' },
          { name: 'Fail', value: 'fail' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('zombie-aim-challenge')
        .setDescription('Mark Zombie Aim Challenge as completed or not.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or Remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    ),
  new SlashCommandBuilder()
    .setName('check-progress')
    .setDescription('Check the progress of a user in the group.')
    .addStringOption(option =>
      option.setName('name')
        .setDescription('The Roblox username to check progress for.')
        .setRequired(true)),
  new SlashCommandBuilder()
    .setName('promote')
    .setDescription('Promote a user to a selected rank in the Roblox group.')
    .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
    .addStringOption(option =>
      option.setName('rank')
        .setDescription('Select the rank to promote the user to')
        .setRequired(true)
        .addChoices(
          { name: 'Conscript', value: 'Conscript' },
          { name: 'Trooper', value: 'Trooper' },
          { name: 'Senior Trooper', value: 'Senior Trooper' }
        )),
  new SlashCommandBuilder()
    .setName('assign-helios-pathway')
    .setDescription('Assigns the Senior Trooper Helios Pathway to a user.')
    .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true)),
  new SlashCommandBuilder()
    .setName('assign-commissariat-pathway')
    .setDescription('Assigns the Senior Trooper Commissariat Pathway to a user.')
    .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true)),
  new SlashCommandBuilder()
    .setName('edit-helios-progress')
    .setDescription('Modify Senior Trooper Helios Pathway progress')
    .addSubcommand(subcommand =>
      subcommand.setName('lead-defensive-training')
        .setDescription('Add or remove lead defensive training.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('lead-raid-training')
        .setDescription('Add or remove lead raid training.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    )
    .addSubcommand(subcommand =>
      subcommand.setName('co-lead-warfare-event')
        .setDescription('Add or remove co-lead warfare event.')
        .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
        .addStringOption(option => option.setName('action').setDescription('Add or remove').setRequired(true).addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        ))
    ),
  new SlashCommandBuilder()
    .setName('edit-commissariat-assignments')
    .setDescription('Add or remove completed assignments for a user')
    .addStringOption(option => option.setName('username').setDescription('Roblox username').setRequired(true))
    .addStringOption(option => 
      option.setName('action')
        .setDescription('Add or remove')
        .setRequired(true)
        .addChoices(
          { name: 'Add', value: 'add' },
          { name: 'Remove', value: 'remove' }
        )
    ),
  new SlashCommandBuilder()
    .setName('log-event')
    .setDescription('Log an event for the group')
    .addStringOption(option => 
      option.setName('host-name')
        .setDescription('The name of the event host')
        .setRequired(true))
    .addStringOption(option => 
      option.setName('event-type')
        .setDescription('The type of event')
        .setRequired(true)
        .addChoices(
          { name: 'Defense Training', value: 'Defense Training' },
          { name: 'Raid Training', value: 'Raid Training' },
          { name: 'Warfare Event', value: 'Warfare Event' },
          { name: 'Trooper Training Game Sense', value: 'Trooper Training Game Sense' },
          { name: 'Trooper Training Group Protocol', value: 'Trooper Training Group Protocol' },
          { name: 'Trooper Training Terrain', value: 'Trooper Training Terrain' }
        ))
    .addStringOption(option => 
      option.setName('map-name')
        .setDescription('The name of the map')
        .setRequired(true)),
];

// Set permissions for commands
commands.forEach(command => {
  if (command.name === 'verify' || command.name === 'check-verification' || command.name === 'progress') {
    command.setDefaultMemberPermissions(null); // Allow all users
  } else {
    command.setDefaultMemberPermissions(PermissionFlagsBits.Administrator); // Restricted commands
  }
});

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('Started refreshing application (/) commands.');

    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.SERVER_ID),
      { body: commands },
    );

    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error('Error loading commands:', error);
  }
})();

async function handleEditCommissariatAssignments(interaction) {
  await interaction.deferReply({ ephemeral: false });
  
  const member = interaction.member;
  if (!member.roles.cache.has(HIGH_RANK_ROLE_ID)) {
    return interaction.editReply('You do not have permission to use this command.');
  }

  const robloxUsername = interaction.options.getString('username');
  const action = interaction.options.getString('action');
  
  try {
    const userData = await Verification.findOne({ robloxUsername: { $regex: new RegExp(`^${robloxUsername}$`, 'i') } });
    if (!userData) {
      return interaction.editReply('User not found.');
    }
    
    const oldValue = userData.progress.completeAssignments;
    if (action === 'add') {
      userData.progress.completeAssignments = true;
    } else if (action === 'remove') {
      userData.progress.completeAssignments = false;
    }
    const newValue = userData.progress.completeAssignments;
    
    await userData.save();

    console.log(`[DEBUG] Updated ${robloxUsername}'s progress. Complete Assignments: ${oldValue} --> ${newValue}`);

    // Respond to the interaction
    await interaction.editReply(`Successfully updated ${robloxUsername}'s progress. Complete Assignments (${oldValue} --> ${newValue})`);

    // Send log to progress log channel
    const logChannel = interaction.guild.channels.cache.get(PROGRESS_LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setTitle('Progress Report Edited')
        .addFields(
          { name: 'Discord User', value: `<@${userData.discordId}> (${userData.discordId})`, inline: true },
          { name: 'Roblox User', value: `${userData.robloxUsername} (${userData.robloxUserId})`, inline: true },
          { name: 'Rank', value: rankToFullName[userData.rank], inline: true },
          { name: 'Property Edited', value: `Complete Assignments (${oldValue} --> ${newValue})`, inline: false },
          { name: 'Edited By', value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: false },
        )
        .setFooter({ text: `${new Date().toLocaleString()}` })
        .setColor('#FFA500');

      await logChannel.send({ embeds: [logEmbed] });
    }

    // Update and send the progress embed
    const avatarUrl = await getRobloxHeadshotUrl(userData.robloxUserId);
    const progressEmbed = await createProgressEmbed(userData, interaction.member, avatarUrl, userData.rank);
    await interaction.followUp({ embeds: [progressEmbed] });

    // Check for completion and notify asynchronously
    checkCompletionAndNotify(userData, interaction.guild, avatarUrl).catch(error => {
      console.error('[ERROR] Error in checkCompletionAndNotify:', error);
    });

  } catch (error) {
    console.error(`[ERROR] Failed to edit Complete Assignments progress: ${error.message}`);
    return interaction.editReply('There was an error processing your request. Please try again later.');
  }
}

async function handleLogEventCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const member = interaction.member;
    if (!member.roles.cache.has(HIGH_RANK_ROLE_ID)) {
      return interaction.editReply('You do not have permission to use this command.');
    }

    const hostName = interaction.options.getString('host-name');
    const eventType = interaction.options.getString('event-type');
    const mapName = interaction.options.getString('map-name');

    const loggingChannel = interaction.guild.channels.cache.get('1290524682772283422');
    if (!loggingChannel) {
      return interaction.editReply('Logging channel not found.');
    }

    const eventMessage = await loggingChannel.send({
      content: `A new event is being logged:\nHost: ${hostName}\nEvent Type: ${eventType}\nMap: ${mapName}\n\nClick the button below to log your attendance!`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('log_attendance')
            .setLabel('Log Attendance')
            .setStyle(ButtonStyle.Primary)
        )
      ]
    });

    const attendees = new Set();

    // Create a promise that resolves after 20 seconds
    const timeoutPromise = new Promise(resolve => setTimeout(resolve, 20000));

    // Create a promise for the collector
    const collectorPromise = new Promise(resolve => {
      const collector = eventMessage.createMessageComponentCollector({ time: 20000 });

      collector.on('collect', async i => {
        if (i.customId === 'log_attendance') {
          attendees.add(i.user.id);
          await i.reply({ content: 'Your attendance has been logged!', ephemeral: true });
        }
      });

      collector.on('end', resolve);
    });

    // Wait for either the collector to finish or the timeout to occur
    await Promise.race([collectorPromise, timeoutPromise]);

    // Update the message after collection period
    const attendeeList = Array.from(attendees).map(id => `<@${id}>`).join('\n');
    await eventMessage.edit({
      content: `Event logging completed:\nHost: ${hostName}\nEvent Type: ${eventType}\nMap: ${mapName}\n\nAttendees:\n${attendeeList}`,
      components: [
        new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('submit')
            .setLabel('Submit')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('add_member')
            .setLabel('Add Member')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('remove_member')
            .setLabel('Remove Member')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId('change_event_type')
            .setLabel('Change Event Type')
            .setStyle(ButtonStyle.Secondary)
        )
      ]
    });

    const hostCollector = eventMessage.createMessageComponentCollector();

    hostCollector.on('collect', async i => {
      if (i.user.id !== interaction.user.id) {
        return i.reply({ content: 'Only the event host can use these buttons.', ephemeral: true });
      }

      try {
        switch (i.customId) {
          case 'submit':
            await handleSubmitEvent(i, hostName, eventType, mapName, attendees);
            hostCollector.stop();
            break;
          case 'add_member':
            await handleAddMember(i, attendees, interaction.guild);
            break;
          case 'remove_member':
            await handleRemoveMember(i, attendees);
            break;
          case 'change_event_type':
            await handleChangeEventType(i);
            break;
        }
      } catch (error) {
        console.error('Error handling button interaction:', error);
        try {
          await i.reply({ content: 'An error occurred while processing your request. Please try again.', ephemeral: true });
        } catch (replyError) {
          console.error('Error sending error message:', replyError);
        }
      }
    });

    await interaction.editReply('Event logging started. Check the logging channel.');

  } catch (error) {
    console.error('Error in handleLogEventCommand:', error);
    try {
      if (interaction.deferred) {
        await interaction.editReply('An error occurred while processing the command. Please try again.');
      } else {
        await interaction.reply('An error occurred while processing the command. Please try again.');
      }
    } catch (replyError) {
      console.error('Error sending error message:', replyError);
    }
  }
}

async function handleSubmitEvent(interaction, hostName, eventType, mapName, attendees) {
  try {
    const attendeeList = Array.from(attendees);
    
    console.log(`Event submitted: Host: ${hostName}, Type: ${eventType}, Map: ${mapName}, Attendees: ${attendeeList.join(', ')}`);

    // Update attendee progress
    for (const attendeeId of attendeeList) {
      const userData = await Verification.findOne({ discordId: attendeeId });
      if (userData) {
        // Skip progress update for Helios Pathway members except for Trooper Trainings
        if (userData.rank === 5) {
          if (eventType.startsWith('Trooper Training')) {
            switch (eventType) {
              case 'Trooper Training Game Sense':
                userData.progress.trooperTrainingsGameSense = Math.min(userData.progress.trooperTrainingsGameSense + 1, 1);
                break;
              case 'Trooper Training Group Protocol':
                userData.progress.trooperTrainingsGroupProtocol = Math.min(userData.progress.trooperTrainingsGroupProtocol + 1, 1);
                break;
              case 'Trooper Training Terrain':
                userData.progress.trooperTrainingsTerrain = Math.min(userData.progress.trooperTrainingsTerrain + 1, 1);
                break;
            }
            await userData.save();
          }
        } else {
          switch (eventType) {
            case 'Defense Training':
              userData.progress.defenseTrainings++;
              break;
            case 'Raid Training':
              userData.progress.raidTrainings++;
              break;
            case 'Warfare Event':
              userData.progress.warfareEvents++;
              break;
            case 'Trooper Training Game Sense':
              userData.progress.trooperTrainingsGameSense = Math.min(userData.progress.trooperTrainingsGameSense + 1, 2);
              break;
            case 'Trooper Training Group Protocol':
              userData.progress.trooperTrainingsGroupProtocol = Math.min(userData.progress.trooperTrainingsGroupProtocol + 1, 2);
              break;
            case 'Trooper Training Terrain':
              userData.progress.trooperTrainingsTerrain = Math.min(userData.progress.trooperTrainingsTerrain + 1, 2);
              break;
          }
          await userData.save();
        }

        // Perform completion check after saving
        const avatarUrl = await getRobloxHeadshotUrl(userData.robloxUserId);
        await checkCompletionAndNotify(userData, interaction.guild, avatarUrl);
      }
    }

    await interaction.update({ content: 'Event submitted and progress updated for all attendees.', components: [] });

    // Send confirmation messages
    const loggingChannel = interaction.guild.channels.cache.get('1290524682772283422');
    const progressLogChannel = interaction.guild.channels.cache.get('1290524215174496338');

    if (loggingChannel) {
      await loggingChannel.send(`Event submitted:\nHost: ${hostName}\nEvent Type: ${eventType}\nMap: ${mapName}\nAttendees: ${attendeeList.map(id => `<@${id}>`).join(', ')}`);
    }

    if (progressLogChannel) {
      await progressLogChannel.send(`Event Logged:\nHost: ${hostName}\nEvent Type: ${eventType}\nMap: ${mapName}\n\nAttendees:\n${attendeeList.map(id => `<@${id}>`).join('\n')}`);
    } else {
      console.error('Progress log channel not found');
    }

  } catch (error) {
    console.error('Error in handleSubmitEvent:', error);
    await interaction.update({ content: 'An error occurred while submitting the event. Please try again.', components: [] });
  }
}

async function handleAddMember(interaction, attendees, guild) {
  const modal = new ModalBuilder()
    .setCustomId('add_member_modal')
    .setTitle('Add Member');

  const usernameInput = new TextInputBuilder()
    .setCustomId('username')
    .setLabel('Enter username to search')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(usernameInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);

  try {
    const filter = (interaction) => interaction.customId === 'add_member_modal';
    const modalSubmission = await interaction.awaitModalSubmit({ filter, time: 60000 });

    const searchTerm = modalSubmission.fields.getTextInputValue('username').toLowerCase();
    const members = await guild.members.fetch();
    const filteredMembers = members.filter(member => 
      (member.user.username.toLowerCase().includes(searchTerm) || 
      (member.nickname && member.nickname.toLowerCase().includes(searchTerm))) &&
      !attendees.has(member.id)
    );

    if (filteredMembers.size === 0) {
      await modalSubmission.reply({ content: 'No matching members found.', ephemeral: true });
      return;
    }

    const options = filteredMembers.map(member => ({
      label: member.nickname || member.user.username,
      value: member.id
    })).slice(0, 25);

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('add_member_select')
          .setPlaceholder('Select a member to add')
          .addOptions(options)
      );

    await modalSubmission.reply({
      content: 'Please select the member you want to add:',
      components: [row],
      ephemeral: true
    });

    const selectFilter = i => i.customId === 'add_member_select' && i.user.id === interaction.user.id;
    const collector = modalSubmission.channel.createMessageComponentCollector({ filter: selectFilter, time: 30000, max: 1 });

    collector.on('collect', async i => {
      const selectedMemberId = i.values[0];
      attendees.add(selectedMemberId);
      const addedMember = await guild.members.fetch(selectedMemberId);
      await i.update({ content: `${addedMember.nickname || addedMember.user.username} has been added to the attendees list.`, components: [] });
      await updateEventMessage(interaction.message, attendees);
    });
  } catch (error) {
    console.error('Error in handleAddMember:', error);
    await interaction.followUp({ content: 'An error occurred while adding a member. Please try again.', ephemeral: true });
  }
}

async function handleRemoveMember(interaction, attendees) {
  const modal = new ModalBuilder()
    .setCustomId('remove_member_modal')
    .setTitle('Remove Member');

  const usernameInput = new TextInputBuilder()
    .setCustomId('username')
    .setLabel('Enter username to search')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const actionRow = new ActionRowBuilder().addComponents(usernameInput);
  modal.addComponents(actionRow);

  await interaction.showModal(modal);

  try {
    const filter = (interaction) => interaction.customId === 'remove_member_modal';
    const modalSubmission = await interaction.awaitModalSubmit({ filter, time: 60000 });

    const searchTerm = modalSubmission.fields.getTextInputValue('username').toLowerCase();
    const guild = interaction.guild;
    const filteredMembers = await Promise.all(Array.from(attendees).map(async (id) => {
      const member = await guild.members.fetch(id).catch(() => null);
      if (member && (member.user.username.toLowerCase().includes(searchTerm) || 
                     (member.nickname && member.nickname.toLowerCase().includes(searchTerm)))) {
        return {
          label: member.nickname || member.user.username,
          value: id
        };
      }
      return null;
    }));

    const validOptions = filteredMembers.filter(option => option !== null);

    if (validOptions.length === 0) {
      await modalSubmission.reply({
        content: 'No matching attendees found.',
        ephemeral: true
      });
      return;
    }

    const row = new ActionRowBuilder()
      .addComponents(
        new StringSelectMenuBuilder()
          .setCustomId('remove_member_select')
          .setPlaceholder('Select a member to remove')
          .addOptions(validOptions)
      );

    await modalSubmission.reply({
      content: 'Please select the member you want to remove:',
      components: [row],
      ephemeral: true
    });

    const selectFilter = i => i.customId === 'remove_member_select' && i.user.id === interaction.user.id;
    const collector = modalSubmission.channel.createMessageComponentCollector({ filter: selectFilter, time: 30000, max: 1 });

    collector.on('collect', async i => {
      const selectedMemberId = i.values[0];
      attendees.delete(selectedMemberId);
      const removedMember = await guild.members.fetch(selectedMemberId).catch(() => null);
      const removedMemberName = removedMember ? (removedMember.nickname || removedMember.user.username) : 'Unknown Member';
      await i.update({ content: `${removedMemberName} has been removed from the attendees list.`, components: [] });
      await updateEventMessage(interaction.message, attendees);
    });
  } catch (error) {
    console.error('Error in handleRemoveMember:', error);
    await interaction.followUp({ content: 'An error occurred while removing a member. Please try again.', ephemeral: true });
  }
}

async function handleChangeEventType(interaction) {
  const options = [
    { label: 'Defense Training', value: 'Defense Training' },
    { label: 'Raid Training', value: 'Raid Training' },
    { label: 'Warfare Event', value: 'Warfare Event' },
    { label: 'Trooper Training Game Sense', value: 'Trooper Training Game Sense' },
    { label: 'Trooper Training Group Protocol', value: 'Trooper Training Group Protocol' },
    { label: 'Trooper Training Terrain', value: 'Trooper Training Terrain' }
  ];

  const row = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('change_event_type_select')
        .setPlaceholder('Select new event type')
        .addOptions(options)
    );

  await interaction.reply({
    content: 'Please select the new event type:',
    components: [row],
    ephemeral: true
  });

  const filter = i => i.customId === 'change_event_type_select' && i.user.id === interaction.user.id;
  const collector = interaction.channel.createMessageComponentCollector({ filter, time: 30000, max: 1 });

  collector.on('collect', async i => {
    const newEventType = i.values[0];
    await i.update({ content: `Event type changed to: ${newEventType}`, components: [] });
    await updateEventMessage(interaction.message, null, newEventType);
  });
}

async function updateEventMessage(message, attendees = null, newEventType = null) {
  const content = message.content;
  let updatedContent = content;

  if (attendees) {
    const attendeeList = Array.from(attendees).map(id => `<@${id}>`).join('\n');
    updatedContent = updatedContent.replace(/Attendees:[\s\S]*$/, `Attendees:\n${attendeeList}`);
  }

  if (newEventType) {
    updatedContent = updatedContent.replace(/Event Type: .*/, `Event Type: ${newEventType}`);
  }

  await message.edit({ content: updatedContent });
}

async function handleCheckProgressCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const member = interaction.member;
  if (!member.roles.cache.has(HIGH_RANK_ROLE_ID)) {
    return interaction.editReply('You do not have permission to use this command.');
  }

  const name = interaction.options.getString('name');
  
  try {
    const userData = await Verification.findOne({ robloxUsername: { $regex: new RegExp(`^${name}$`, 'i') } });
    if (!userData) {
      return interaction.editReply('User not found in the verification database.');
    }

    // Update groupPrimaried status
    const isGroupPrimaried = await checkIfGroupIsPrimaried(userData.robloxUserId);
    userData.progress.groupPrimaried = isGroupPrimaried;
    await userData.save();

    const avatarUrl = await getRobloxHeadshotUrl(userData.robloxUserId);
    const embed = await createProgressEmbed(userData, interaction.member, avatarUrl, userData.rank);

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error(`[ERROR] Error checking progress for ${name}:`, error);
    return interaction.editReply('There was an error checking the user\'s progress. Please try again later.');
  }
}

// Initialize noblox.js
async function initializeNoblox() {
  try {
    if (!process.env.ROBLOX_COOKIE) {
      throw new Error('ROBLOX_COOKIE is not set in the environment variables.');
    }

    console.log('🔐 Logging into Roblox...');
    console.log('Cookie length:', process.env.ROBLOX_COOKIE.length);
    console.log('Cookie prefix:', process.env.ROBLOX_COOKIE.substring(0, 20) + '...');

    // Try to set the cookie
    await noblox.setCookie(process.env.ROBLOX_COOKIE, { rememberMe: true });

    // Verify if we're actually logged in
    const currentUser = await noblox.getCurrentUser();
    if (!currentUser) {
      throw new Error('Failed to get current user after setting cookie');
    }

    console.log(`✅ Logged into Roblox as ${currentUser.UserName} (ID: ${currentUser.UserID})`);
  } catch (error) {
    console.error('❌ Failed to authenticate with Roblox:', error.message);
    if (error.message.includes('Token Validation Failed')) {
      console.error('This usually means the cookie is invalid or expired.');
    }
    console.error('Full error:', error);
    process.exit(1); // Exit if authentication fails
  }
}

// Call the initialization function before logging into Discord
initializeNoblox().then(() => {
  // Login to Discord
  client.login(process.env.DISCORD_TOKEN);
}).catch(err => {
  console.error('❌ Initialization failed:', err);
  process.exit(1);
});

// Helper Functions

/**
 * Removes old rank roles from a member.
 * @param {GuildMember} member - The Discord guild member.
 */
async function removeOldRoles(member) {
  try {
    const rolesToRemove = Object.values(rankToRole).filter(roleId => roleId !== null);
    if (rolesToRemove.length > 0) {
      await member.roles.remove(rolesToRemove);
      console.log(`[DEBUG] Removed old rank roles from ${member.user.tag}.`);
    }
  } catch (error) {
    console.error(`[ERROR] Failed to remove old roles from ${member.user.tag}: ${error.message}`);
  }
}

/**
 * Updates a member's nickname with the rank prefix.
 * @param {GuildMember} member - The Discord guild member.
 * @param {string} robloxUsername - The user's Roblox username.
 * @param {number} rankId - The Roblox rank ID.
 */
async function updateNickname(member, robloxUsername, rankId) {
  try {
    const prefix = rankToNickname[rankId] || '';
    let newNickname = robloxUsername;

    // Check if the username already starts with any rank prefix
    const allPrefixes = Object.values(rankToNickname);
    const hasPrefix = allPrefixes.some(p => robloxUsername.startsWith(p));

    if (!hasPrefix && prefix) {
      newNickname = `${prefix} ${robloxUsername}`;
    }

    await member.setNickname(newNickname);
    console.log(`[DEBUG] Updated nickname for ${member.user.tag} to "${newNickname}".`);
  } catch (error) {
    console.error(`[ERROR] Failed to update nickname for ${member.user.tag}: ${error.message}`);
  }
}

/**
 * Fetches the Roblox user's headshot URL.
 * @param {string} userId - The Roblox user ID.
 * @returns {string} - The URL of the user's headshot.
 */
async function getRobloxHeadshotUrl(userId) {
  try {
    const response = await fetch(`https://thumbnails.roblox.com/v1/users/avatar-headshot?userIds=${userId}&size=720x720&format=Png&isCircular=false`);
    if (!response.ok) {
      throw new Error(`Failed to fetch headshot: ${response.statusText}`);
    }

    const data = await response.json();
    return data.data[0].imageUrl || 'https://www.roblox.com/asset/?id=0'; // Default image if not found
  } catch (error) {
    console.error(`[ERROR] Error fetching avatar for user ID ${userId}: ${error.message}`);
    return 'https://www.roblox.com/asset/?id=0'; // Default image if an error occurs
  }
}

/**
 * Checks if the user has set the group as primary on Roblox.
 * @param {string} userId - The Roblox user ID.
 * @returns {boolean} - True if the user has the group primaried, false otherwise.
 */
async function checkIfGroupIsPrimaried(userId) {
  try {
    // Fetch the user's primary group
    const response = await fetch(`https://groups.roblox.com/v1/users/${userId}/groups/primary/role`);
    if (!response.ok) {
      if (response.status === 404) {
        console.log(`[DEBUG] User ${userId} does not have a primary group.`);
        return false;
      }
      throw new Error('Failed to fetch primary group.');
    }

    const data = await response.json();

    console.log(`[DEBUG] Fetched primary group for user ${userId}:`, JSON.stringify(data, null, 2));

    if (data.group && data.group.id === GROUP_ID) {
      console.log(`[DEBUG] User ${userId} has the group ${GROUP_ID} set as primary.`);
      return true;
    } else {
      console.log(`[DEBUG] User ${userId} does not have the group ${GROUP_ID} set as primary.`);
      return false;
    }
  } catch (error) {
    console.error(`[ERROR] Failed to check if group is primaried for user ${userId}: ${error.message}`);
    return false;
  }
}

/**
 * Fetches Roblox user details by username.
 * @param {string} username - The Roblox username.
 * @returns {object} - An object containing user details or an error message.
 */
async function fetchRobloxUserDetailsByUsername(username) {
  try {
    const userId = await noblox.getIdFromUsername(username);
    return { id: userId, name: username };
  } catch (error) {
    console.error(`[ERROR] Failed to fetch Roblox user details for ${username}: ${error.message}`);
    return { error: `User ${username} not found.` };
  }
}

/**
 * Creates a progress embed based on the user's rank.
 * @param {object} userData - The user's data from the database.
 * @param {GuildMember} discordMember - The Discord guild member.
 * @param {string} avatarUrl - The URL of the user's Roblox avatar.
 * @param {number} rank - The user's current rank.
 * @returns {EmbedBuilder} - The constructed embed.
 */
async function createProgressEmbed(userData, discordMember, avatarUrl, rank) {
  const generatedOn = `Generated on ${new Date().toLocaleString()}`;
  const embed = new EmbedBuilder()
    .setThumbnail(avatarUrl)
    .setFooter({ text: generatedOn })
    .setColor('#00FF00');

  if (rank === 2) { // Conscript
    const overallCompleted = userData.progress.groupPrimaried &&
      userData.progress.defenseTrainings >= 6 &&
      userData.progress.raidTrainings >= 6 &&
      userData.progress.conscriptAssessmentPassed;

    embed.setTitle(`**Conscript ${userData.robloxUsername}**`)
      .setDescription(
        `\`\`\`
${userData.progress.groupPrimaried ? '[✓]' : '[X]'} Group Primaried
${userData.progress.defenseTrainings >= 6 ? '[✓]' : '[X]'} Defense Trainings ${userData.progress.defenseTrainings}/6
${userData.progress.raidTrainings >= 6 ? '[✓]' : '[X]'} Raid Trainings ${userData.progress.raidTrainings}/6

${userData.progress.conscriptAssessmentPassed ? '[✓]' : '[X]'} Conscript Assessment Passed

${overallCompleted ? '[✓]' : '[X]'} Overall
[${userData.progress.warnings}] Warnings
\`\`\``
      );
  } else if (rank === 3) { // Trooper
    const overallCompleted = userData.progress.groupPrimaried &&
      userData.progress.defenseTrainings >= 8 &&
      userData.progress.raidTrainings >= 8 &&
      userData.progress.warfareEvents >= 12 &&
      userData.progress.trooperTrainingsGameSense >= 2 &&
      userData.progress.trooperTrainingsGroupProtocol >= 1 &&
      userData.progress.trooperTrainingsTerrain >= 2 &&
      userData.progress.zombieAimChallenge;

    embed.setTitle(`**Trooper ${userData.robloxUsername}**`)
      .setDescription(
        `\`\`\`
${userData.progress.groupPrimaried ? '[✓]' : '[X]'} Group Primaried
${userData.progress.defenseTrainings >= 8 ? '[✓]' : '[X]'} Defense Trainings ${userData.progress.defenseTrainings}/8
${userData.progress.raidTrainings >= 8 ? '[✓]' : '[X]'} Raid Trainings ${userData.progress.raidTrainings}/8
${userData.progress.warfareEvents >= 12 ? '[✓]' : '[X]'} Warfare Events ${userData.progress.warfareEvents}/12

${userData.progress.trooperTrainingsGameSense >= 2 ? '[✓]' : '[X]'} Trooper Training Game Sense ${userData.progress.trooperTrainingsGameSense}/2
${userData.progress.trooperTrainingsGroupProtocol >= 1 ? '[✓]' : '[X]'} Trooper Training Group Protocol ${userData.progress.trooperTrainingsGroupProtocol}/1
${userData.progress.trooperTrainingsTerrain >= 2 ? '[✓]' : '[X]'} Trooper Training Terrain ${userData.progress.trooperTrainingsTerrain}/2
${userData.progress.zombieAimChallenge ? '[✓]' : '[X]'} Zombie Aim Challenge (7 minutes)

${overallCompleted ? '[✓]' : '[X]'} Overall
[${userData.progress.warnings}] Warnings
\`\`\``
      );
  } else if (rank === 4) { // Senior Trooper
    const overallCompleted = userData.progress.groupPrimaried &&
      userData.progress.defenseTrainings >= 10 &&
      userData.progress.raidTrainings >= 10 &&
      userData.progress.warfareEvents >= 15 &&
      userData.progress.trooperTrainingsGameSense >= 2 &&
      userData.progress.trooperTrainingsGroupProtocol >= 1 &&
      userData.progress.trooperTrainingsTerrain >= 2 &&
      userData.progress.zombieAimChallenge &&
      userData.progress.completeAssignments;

    embed.setTitle(`**Senior Trooper ${userData.robloxUsername}**`)
      .setDescription(
        `\`\`\`
${userData.progress.groupPrimaried ? '[✓]' : '[X]'} Group Primaried
${userData.progress.defenseTrainings >= 10 ? '[✓]' : '[X]'} Defense Trainings ${userData.progress.defenseTrainings}/10
${userData.progress.raidTrainings >= 10 ? '[✓]' : '[X]'} Raid Trainings ${userData.progress.raidTrainings}/10
${userData.progress.warfareEvents >= 15 ? '[✓]' : '[X]'} Warfare Events ${userData.progress.warfareEvents}/15

${userData.progress.trooperTrainingsGameSense >= 2 ? '[✓]' : '[X]'} Trooper Training Game Sense ${userData.progress.trooperTrainingsGameSense}/2
${userData.progress.trooperTrainingsGroupProtocol >= 1 ? '[✓]' : '[X]'} Trooper Training Group Protocol ${userData.progress.trooperTrainingsGroupProtocol}/1
${userData.progress.trooperTrainingsTerrain >= 2 ? '[✓]' : '[X]'} Trooper Training Terrain ${userData.progress.trooperTrainingsTerrain}/2
${userData.progress.zombieAimChallenge ? '[✓]' : '[X]'} Zombie Aim Challenge (10 minutes)

${overallCompleted ? '[✓]' : '[X]'} Overall
[${userData.progress.warnings}] Warnings
\`\`\``
      );
  } else if (rank === 5) { // Senior Trooper Helios Pathway
    const overallCompleted = userData.progress.groupPrimaried &&
      userData.progress.defenseTrainings >= 4 &&
      userData.progress.raidTrainings >= 4 &&
      userData.progress.warfareEvents >= 6 &&
      userData.progress.trooperTrainingsGameSense >= 1 &&
      userData.progress.trooperTrainingsGroupProtocol >= 1 &&
      userData.progress.trooperTrainingsTerrain >= 1 &&
      userData.progress.zombieAimChallenge;

    embed.setTitle(`**Senior Trooper Helios Pathway ${userData.robloxUsername}**`)
      .setDescription(
        `\`\`\`
${userData.progress.groupPrimaried ? '[✓]' : '[X]'} Group Primaried
${userData.progress.defenseTrainings >= 4 ? '[✓]' : '[X]'} Lead at 4 Defense Trainings ${userData.progress.defenseTrainings}/4
${userData.progress.raidTrainings >= 4 ? '[✓]' : '[X]'} Lead at 4 Raid Trainings ${userData.progress.raidTrainings}/4
${userData.progress.warfareEvents >= 6 ? '[✓]' : '[X]'} Attend & Co-Lead 6 Warfare Events ${userData.progress.warfareEvents}/6

${userData.progress.trooperTrainingsGameSense >= 1 ? '[✓]' : '[X]'} Trooper Training Game Sense ${userData.progress.trooperTrainingsGameSense}/1
${userData.progress.trooperTrainingsGroupProtocol >= 1 ? '[✓]' : '[X]'} Trooper Training Group Protocol ${userData.progress.trooperTrainingsGroupProtocol}/1
${userData.progress.trooperTrainingsTerrain >= 1 ? '[✓]' : '[X]'} Trooper Training Terrain ${userData.progress.trooperTrainingsTerrain}/1
${userData.progress.zombieAimChallenge ? '[✓]' : '[X]'} Zombie Aim Challenge (8 minutes)

${overallCompleted ? '[✓]' : '[X]'} Overall
[${userData.progress.warnings}] Warnings
\`\`\``
      );
  } else if (rank === 6) { // Senior Trooper Commissariat Pathway
    const overallCompleted = userData.progress.groupPrimaried &&
      userData.progress.defenseTrainings >= 4 &&
      userData.progress.raidTrainings >= 4 &&
      userData.progress.warfareEvents >= 10 &&
      userData.progress.trooperTrainingsGameSense >= 1 &&
      userData.progress.trooperTrainingsGroupProtocol >= 1 &&
      userData.progress.trooperTrainingsTerrain >= 1 &&
      userData.progress.zombieAimChallenge &&
      userData.progress.completeAssignments;

    embed.setTitle(`**Senior Trooper Commissariat Pathway ${userData.robloxUsername}**`)
      .setDescription(
        `\`\`\`
${userData.progress.groupPrimaried ? '[✓]' : '[X]'} Group Primaried
${userData.progress.defenseTrainings >= 4 ? '[✓]' : '[X]'} Attend 4 Defensive Trainings ${userData.progress.defenseTrainings}/4
${userData.progress.raidTrainings >= 4 ? '[✓]' : '[X]'} Attend 4 Raid Trainings ${userData.progress.raidTrainings}/4
${userData.progress.warfareEvents >= 10 ? '[✓]' : '[X]'} Attend 10 Warfare Events ${userData.progress.warfareEvents}/10

${userData.progress.trooperTrainingsGameSense >= 1 ? '[✓]' : '[X]'} Trooper Training Game Sense ${userData.progress.trooperTrainingsGameSense}/1
${userData.progress.trooperTrainingsGroupProtocol >= 1 ? '[✓]' : '[X]'} Trooper Training Group Protocol ${userData.progress.trooperTrainingsGroupProtocol}/1
${userData.progress.trooperTrainingsTerrain >= 1 ? '[✓]' : '[X]'} Trooper Training Terrain ${userData.progress.trooperTrainingsTerrain}/1
${userData.progress.zombieAimChallenge ? '[✓]' : '[X]'} Zombie Aim Challenge (8 minutes)
${userData.progress.completeAssignments ? '[✓]' : '[X]'} Complete Assignments

${overallCompleted ? '[✓]' : '[X]'} Overall
[${userData.progress.warnings}] Warnings
\`\`\``
      );
  } else {
    // Default embed if rank is unrecognized
    embed.setTitle(`**${userData.robloxUsername}'s Progress**`)
      .setDescription('Progress details are not available for your current rank.')
      .setColor('#FF0000');
  }

  return embed;
}

/**
 * Checks if the user has completed all requirements and notifies accordingly.
 * @param {object} userData - The user's data from the database.
 * @param {Guild} guild - The Discord guild.
 * @param {string} avatarUrl - The URL of the user's Roblox avatar.
 */
async function checkCompletionAndNotify(userData, guild, avatarUrl) {
  console.log(`[DEBUG] Checking completion for user: ${userData.robloxUsername}, Rank: ${userData.rank}`);
  console.log(`[DEBUG] Progress: ${JSON.stringify(userData.progress, null, 2)}`);
  console.log(`[DEBUG] Notification flags: ${JSON.stringify(userData.notificationsSent, null, 2)}`);

  if (!userData.progress.groupPrimaried) {
    console.log(`[DEBUG] ${userData.robloxUsername} does not have the group set as primary.`);
    return;
  }

  function checkRequirements(requirements) {
    const unmetRequirements = requirements.filter(req => {
      if (typeof req.met === 'boolean') {
        return req.met !== req.required;
      } else {
        return req.met < req.required;
      }
    });

    if (unmetRequirements.length > 0) {
      console.log('[DEBUG] Not all requirements are met. Missing requirements:');
      unmetRequirements.forEach(req => {
        console.log(`[DEBUG] - ${req.name}: Required (${req.required}), Current (${req.met})`);
      });
      return false;
    }
    return true;
  }

  // Rank-specific requirements checks
  if (userData.rank === 2) { // Conscript
    console.log('[DEBUG] Checking Conscript requirements');
    const requirements = [
      { name: 'Group Primaried', met: userData.progress.groupPrimaried, required: true },
      { name: 'Defense Trainings', met: userData.progress.defenseTrainings, required: 6 },
      { name: 'Raid Trainings', met: userData.progress.raidTrainings, required: 6 },
      { name: 'Conscript Assessment Passed', met: userData.progress.conscriptAssessmentPassed, required: true }
    ];

    if (checkRequirements(requirements)) {
      console.log('[DEBUG] All Conscript requirements met');
      if (!userData.notificationsSent.conscriptRequirementsMet) {
        console.log('[DEBUG] Sending Conscript completion notification...');
        const updateResult = await Verification.findOneAndUpdate(
          { _id: userData._id },
          { $set: { 'notificationsSent.conscriptRequirementsMet': true } },
          { new: true }
        );
        if (updateResult) {
          await sendCompletionNotification(guild, userData, avatarUrl, 'Conscript', COMPLETION_CHANNEL_ID, CONSCRIPT_COMMISSAR_ROLE_ID);
        }
      } else {
        console.log('[DEBUG] Conscript completion notification already sent.');
      }
    } else {
      console.log('[DEBUG] Not all Conscript requirements are met');
      await resetNotificationFlag(userData, 'conscriptRequirementsMet');
    }
  } else if (userData.rank === 3) { // Trooper
    console.log('[DEBUG] Checking Trooper requirements');
    const requirements = [
      { name: 'Group Primaried', met: userData.progress.groupPrimaried, required: true },
      { name: 'Defense Trainings', met: userData.progress.defenseTrainings, required: 8 },
      { name: 'Raid Trainings', met: userData.progress.raidTrainings, required: 8 },
      { name: 'Warfare Events', met: userData.progress.warfareEvents, required: 12 },
      { name: 'Trooper Training Game Sense', met: userData.progress.trooperTrainingsGameSense, required: 2 },
      { name: 'Trooper Training Group Protocol', met: userData.progress.trooperTrainingsGroupProtocol, required: 1 },
      { name: 'Trooper Training Terrain', met: userData.progress.trooperTrainingsTerrain, required: 2 },
      { name: 'Zombie Aim Challenge', met: userData.progress.zombieAimChallenge, required: true }
    ];

    if (checkRequirements(requirements)) {
      console.log('[DEBUG] All Trooper requirements met');
      if (!userData.notificationsSent.trooperRequirementsMet) {
        console.log('[DEBUG] Sending Trooper completion notification...');
        const updateResult = await Verification.findOneAndUpdate(
          { _id: userData._id },
          { $set: { 'notificationsSent.trooperRequirementsMet': true } },
          { new: true }
        );
        if (updateResult) {
          await sendCompletionNotification(guild, userData, avatarUrl, 'Trooper', TROOPER_COMPLETION_CHANNEL_ID, TROOPER_COMPLETION_ROLE_ID);
        }
      } else {
        console.log('[DEBUG] Trooper completion notification already sent.');
      }
    } else {
      console.log('[DEBUG] Not all Trooper requirements are met');
      await resetNotificationFlag(userData, 'trooperRequirementsMet');
    }
  } else if (userData.rank === 4) { // Senior Trooper
    console.log('[DEBUG] Checking Senior Trooper requirements');
    const requirements = [
      { name: 'Group Primaried', met: userData.progress.groupPrimaried, required: true },
      { name: 'Defense Trainings', met: userData.progress.defenseTrainings, required: 10 },
      { name: 'Raid Trainings', met: userData.progress.raidTrainings, required: 10 },
      { name: 'Warfare Events', met: userData.progress.warfareEvents, required: 15 },
      { name: 'Trooper Training Game Sense', met: userData.progress.trooperTrainingsGameSense, required: 2 },
      { name: 'Trooper Training Group Protocol', met: userData.progress.trooperTrainingsGroupProtocol, required: 1 },
      { name: 'Trooper Training Terrain', met: userData.progress.trooperTrainingsTerrain, required: 2 },
      { name: 'Zombie Aim Challenge', met: userData.progress.zombieAimChallenge, required: true }
    ];

    if (checkRequirements(requirements)) {
      console.log('[DEBUG] All Senior Trooper requirements met');
      if (!userData.notificationsSent.seniorTrooperRequirementsMet) {
        console.log('[DEBUG] Sending Senior Trooper completion notification...');
        const updateResult = await Verification.findOneAndUpdate(
          { _id: userData._id },
          { $set: { 'notificationsSent.seniorTrooperRequirementsMet': true } },
          { new: true }
        );
        if (updateResult) {
          await sendCompletionNotification(guild, userData, avatarUrl, 'Senior Trooper', SENIOR_TROOPER_COMPLETION_CHANNEL_ID, SENIOR_TROOPER_COMPLETION_ROLE_ID);
        }
      } else {
        console.log('[DEBUG] Senior Trooper completion notification already sent.');
      }
    } else {
      console.log('[DEBUG] Not all Senior Trooper requirements are met');
      await resetNotificationFlag(userData, 'seniorTrooperRequirementsMet');
    }
  } else if (userData.rank === 5) { // Senior Trooper Helios Pathway
    console.log('[DEBUG] Checking Senior Trooper Helios Pathway requirements');
    const requirements = [
      { name: 'Group Primaried', met: userData.progress.groupPrimaried, required: true },
      { name: 'Lead Defense Trainings', met: userData.progress.defenseTrainings, required: 4 },
      { name: 'Lead Raid Trainings', met: userData.progress.raidTrainings, required: 4 },
      { name: 'Co-Lead Warfare Events', met: userData.progress.warfareEvents, required: 6 },
      { name: 'Trooper Training Game Sense', met: userData.progress.trooperTrainingsGameSense, required: 1 },
      { name: 'Trooper Training Group Protocol', met: userData.progress.trooperTrainingsGroupProtocol, required: 1 },
      { name: 'Trooper Training Terrain', met: userData.progress.trooperTrainingsTerrain, required: 1 },
      { name: 'Zombie Aim Challenge', met: userData.progress.zombieAimChallenge, required: true }
    ];

    if (checkRequirements(requirements)) {
      console.log('[DEBUG] All Senior Trooper Helios Pathway requirements met');
      if (!userData.notificationsSent.heliosPathwayRequirementsMet) {
        console.log('[DEBUG] Sending Senior Trooper Helios Pathway completion notification...');
        const updateResult = await Verification.findOneAndUpdate(
          { _id: userData._id },
          { $set: { 'notificationsSent.heliosPathwayRequirementsMet': true } },
          { new: true }
        );
        if (updateResult) {
          await sendCompletionNotification(guild, userData, avatarUrl, 'Senior Trooper Helios Pathway', SENIOR_TROOPER_COMPLETION_CHANNEL_ID, SENIOR_TROOPER_COMPLETION_ROLE_ID);
        }
      } else {
        console.log('[DEBUG] Senior Trooper Helios Pathway completion notification already sent.');
      }
    } else {
      console.log('[DEBUG] Not all Senior Trooper Helios Pathway requirements are met');
      await resetNotificationFlag(userData, 'heliosPathwayRequirementsMet');
    }
  } else if (userData.rank === 6) { // Senior Trooper Commissariat Pathway
    console.log('[DEBUG] Checking Senior Trooper Commissariat Pathway requirements');
    const requirements = [
      { name: 'Group Primaried', met: userData.progress.groupPrimaried, required: true },
      { name: 'Defense Trainings', met: userData.progress.defenseTrainings, required: 4 },
      { name: 'Raid Trainings', met: userData.progress.raidTrainings, required: 4 },
      { name: 'Warfare Events', met: userData.progress.warfareEvents, required: 10 },
      { name: 'Trooper Training Game Sense', met: userData.progress.trooperTrainingsGameSense, required: 1 },
      { name: 'Trooper Training Group Protocol', met: userData.progress.trooperTrainingsGroupProtocol, required: 1 },
      { name: 'Trooper Training Terrain', met: userData.progress.trooperTrainingsTerrain, required: 1 },
      { name: 'Zombie Aim Challenge', met: userData.progress.zombieAimChallenge, required: true },
      { name: 'Complete Assignments', met: userData.progress.completeAssignments, required: true }
    ];

    if (checkRequirements(requirements)) {
      console.log('[DEBUG] All Senior Trooper Commissariat Pathway requirements met');
      if (!userData.notificationsSent.commissariatPathwayRequirementsMet) {
        console.log('[DEBUG] Sending Senior Trooper Commissariat Pathway completion notification...');
        const updateResult = await Verification.findOneAndUpdate(
          { _id: userData._id },
          { $set: { 'notificationsSent.commissariatPathwayRequirementsMet': true } },
          { new: true }
        );
        if (updateResult) {
          await sendCompletionNotification(guild, userData, avatarUrl, 'Senior Trooper Commissariat Pathway', SENIOR_TROOPER_COMPLETION_CHANNEL_ID, SENIOR_TROOPER_COMPLETION_ROLE_ID);
        }
      } else {
        console.log('[DEBUG] Senior Trooper Commissariat Pathway completion notification already sent.');
      }
    } else {
      console.log('[DEBUG] Not all Senior Trooper Commissariat Pathway requirements are met');
      await resetNotificationFlag(userData, 'commissariatPathwayRequirementsMet');
    }
  }
}

async function sendCompletionNotification(guild, userData, avatarUrl, rankName, channelId, roleId) {
  const completionChannel = guild.channels.cache.get(channelId);
  if (!completionChannel || !completionChannel.isTextBased()) {
    console.error(`[ERROR] Could not find the ${rankName} completion channel or it is not a text channel.`);
    return;
  }
  const completionEmbed = new EmbedBuilder()
    .setTitle(`${userData.robloxUsername} has completed their ${rankName} requirements.`)
    .addFields(
      { name: 'Roblox User:', value: `[${userData.robloxUsername}](https://www.roblox.com/users/${userData.robloxUserId}/profile) (${userData.robloxUserId})`, inline: true },
      { name: 'Rank:', value: rankName, inline: true },
      { name: 'Discord User:', value: `<@${userData.discordId}> - ${userData.discordId}`, inline: false }
    )
    .setThumbnail(avatarUrl)
    .setFooter({ text: `${new Date().toLocaleString()}` })
    .setColor('#00FF00');
  try {
    await completionChannel.send(`<@&${roleId}>`);
    await completionChannel.send({ embeds: [completionEmbed] });
    console.log(`[DEBUG] Notification sent: ${userData.robloxUsername} completed all ${rankName} requirements.`);
  } catch (error) {
    console.error(`[ERROR] Failed to send notification to ${rankName} completion channel: ${error.message}`);
  }
}

async function resetNotificationFlag(userData, flagName) {
  if (userData.notificationsSent[flagName]) {
    userData.notificationsSent[flagName] = false;
    await userData.save();
    console.log(`[DEBUG] Reset ${flagName} flag`);
  }
}


/**
 * Resets the user's progress and notifies them about the rank change.
 * @param {string} robloxUserId - The Roblox user ID.
 */
async function resetUserProgress(robloxUserId) {
  try {
    const userData = await Verification.findOne({ robloxUserId });
    if (!userData) {
      console.error(`[ERROR] User with Roblox ID ${robloxUserId} not found.`);
      return;
    }

    userData.progress = {
      defenseTrainings: 0,
      raidTrainings: 0,
      warfareEvents: 0,
      trooperTrainingsGroupProtocol: 0,
      trooperTrainingsGameSense: 0,
      trooperTrainingsTerrain: 0,
      zombieAimChallenge: false,
      groupPrimaried: false,
      conscriptAssessmentPassed: false,
      warnings: 0,
    };
    // Reset notification flags
    userData.notificationsSent.conscriptRequirementsMet = false;
    userData.notificationsSent.trooperRequirementsMet = false;
    userData.notificationsSent.seniorTrooperRequirementsMet = false;

    await userData.save();
    console.log(`[DEBUG] Progress for user ${robloxUserId} has been reset.`);

    const guild = client.guilds.cache.get(process.env.SERVER_ID);
    if (!guild) {
      console.error(`[ERROR] Guild with ID ${process.env.SERVER_ID} not found.`);
      return;
    }

    const member = await guild.members.fetch(userData.discordId).catch(() => null);
    if (!member) {
      console.error(`[ERROR] Discord member with ID ${userData.discordId} not found.`);
      return;
    }

    // Removed notifyNewRankProgress to prevent sending the unwanted message
    // await notifyNewRankProgress(guild, member, userData.robloxUsername, userData.rank);
  } catch (error) {
    console.error(`[ERROR] Failed to reset progress for user ${robloxUserId}: ${error.message}`);
  }
}

// Command Handler Functions

/**
 * Handles the /verify command.
 * @param {CommandInteraction} interaction 
 */
async function handleVerifyCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const username = interaction.options.getString('username');

    const robloxUser = await fetchRobloxUserDetailsByUsername(username);
    if (robloxUser.error) {
      return await interaction.editReply({ content: robloxUser.error });
    }

    const verificationCode = Math.random().toString(36).substring(2, 10).toUpperCase();
    await Verification.findOneAndUpdate(
      { discordId: interaction.user.id },
      {
        robloxUsername: robloxUser.name,
        robloxUserId: robloxUser.id,
        verificationCode: verificationCode,
        activeVerification: true,
      },
      { upsert: true, new: true },
    );

    console.log(`[DEBUG] Linked Roblox account ${robloxUser.name} to Discord account ${interaction.user.id}`);
    await interaction.editReply({ content: `Please add the following code to your Roblox profile blurb: **${verificationCode}**.` });
  } catch (err) {
    console.error(`[ERROR] Failed to save verification data for ${interaction.user.tag}:`, err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'There was an error saving your verification data. Please try again.', ephemeral: true });
    } else {
      await interaction.editReply({ content: 'There was an error saving your verification data. Please try again.' });
    }
  }
}

/**
 * Handles the /check-verification command.
 * @param {CommandInteraction} interaction 
 */
/**
 * Handles the /check-verification command.
 * @param {CommandInteraction} interaction 
 */
async function handleCheckVerificationCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: true });

    const userData = await Verification.findOne({ discordId: interaction.user.id });
    if (!userData || !userData.activeVerification) {
      return await interaction.editReply({ content: 'You haven\'t started the verification process. Please use /verify first.' });
    }

    const { robloxUserId: userId, verificationCode: code } = userData;

    const [rankResponse, profileResponse] = await Promise.all([
      fetch(`https://groups.roblox.com/v1/users/${userId}/groups/roles`),
      fetch(`https://users.roblox.com/v1/users/${userId}`)
    ]);

    if (!rankResponse.ok || !profileResponse.ok) {
      throw new Error('Failed to fetch Roblox data.');
    }

    const [rankData, profileData] = await Promise.all([
      rankResponse.json(),
      profileResponse.json()
    ]);

    const userGroup = rankData.data.find(group => group.group.id === GROUP_ID);
    
    if (!userGroup) {
      return await interaction.editReply({ content: 'You are not a member of the required Roblox group.' });
    }

    const robloxRankId = userGroup.role.rank;
    console.log(`[DEBUG] User Roblox rank ID: ${robloxRankId}`);

    if (!rankToRole.hasOwnProperty(robloxRankId)) {
      console.log(`[DEBUG] Rank ID ${robloxRankId} is not recognized.`);
      return await interaction.editReply({ content: 'Your rank does not match any recognized ranks.' });
    }

    console.log(`[DEBUG] Profile description: ${profileData.description}`);

    if (profileData.description.includes(code)) {
      console.log(`[DEBUG] Verification successful for ${interaction.user.tag}.`);
      userData.activeVerification = false;
      userData.rank = robloxRankId;
      await userData.save();

      const guild = interaction.guild;
      if (!guild) {
        console.error(`[ERROR] Guild not found.`);
        return await interaction.editReply({ content: 'Guild not found. Please contact an administrator.' });
      }

      const member = await guild.members.fetch(userData.discordId).catch(() => null);
      if (!member) {
        console.error(`[ERROR] Discord member with ID ${userData.discordId} not found.`);
        return await interaction.editReply({ content: 'Discord member not found. Please contact an administrator.' });
      }

      await removeOldRoles(member);
      await member.roles.add(VERIFIED_ROLE_ID).catch((err) => console.error(`[ERROR] Failed to assign Verified role: ${err.message}`));

      const rankRoleId = rankToRole[robloxRankId];
      if (rankRoleId) {
        await member.roles.add(rankRoleId).catch((err) => console.error(`[ERROR] Failed to assign rank role: ${err.message}`));
      }

      await updateNickname(member, userData.robloxUsername, robloxRankId);

      // Update groupPrimaried status
      const isGroupPrimaried = await checkIfGroupIsPrimaried(userData.robloxUserId);
      userData.progress.groupPrimaried = isGroupPrimaried;
      await userData.save();

      await interaction.editReply({ content: 'You have been verified successfully!' });

      // Send progress embed to log channel
      try {
        const avatarUrl = await getRobloxHeadshotUrl(userData.robloxUserId);
        const progressEmbed = await createProgressEmbed(userData, member, avatarUrl, robloxRankId);
        const logChannel = guild.channels.cache.get(PROGRESS_LOG_CHANNEL_ID);
        if (logChannel && logChannel.isTextBased()) {
          await logChannel.send({ embeds: [progressEmbed] });
          console.log(`[DEBUG] Progress embed sent for ${userData.robloxUsername}.`);
        } else {
          console.error('[ERROR] Could not find the progress log channel or it is not a text channel.');
        }
      } catch (error) {
        console.error(`[ERROR] Failed to send progress embed: ${error.message}`);
      }
    } else {
      return await interaction.editReply({ content: 'Verification failed. Please ensure the code is in your profile blurb.' });
    }
  } catch (error) {
    console.error(`[ERROR] Error checking verification: ${error.message}`);
    if (!interaction.replied) {
      await interaction.editReply('There was an error checking your verification status. Please try again later.');
    }
  }
}

/**
 * Handles the /update command.
 * @param {CommandInteraction} interaction 
 */
async function handleUpdateCommand(interaction) {
  const discordId = interaction.user.id;

  const userData = await Verification.findOne({ discordId });
  if (!userData) {
    return interaction.reply({ content: 'You are not verified. Please use the /verify command first.', ephemeral: true });
  }

  try {
    const robloxUserId = userData.robloxUserId;

    const rankResponse = await fetch(`https://groups.roblox.com/v1/users/${robloxUserId}/groups/roles`);
    if (!rankResponse.ok) throw new Error('Failed to fetch group roles.');

    const rankData = await rankResponse.json();

    const userGroup = rankData.data.find(group => group.group.id === GROUP_ID);
    if (!userGroup) {
      return interaction.reply({ content: 'You are not a member of the required Roblox group.', ephemeral: true });
    }

    const robloxRankId = userGroup.role.rank;
    if (!rankToRole.hasOwnProperty(robloxRankId)) {
      return interaction.reply({ content: 'Your rank does not match any recognized ranks.', ephemeral: true });
    }

    if (userData.rank !== robloxRankId) {
      userData.rank = robloxRankId;
      await userData.save();

      const guild = client.guilds.cache.get(process.env.SERVER_ID);
      if (!guild) {
        console.error(`[ERROR] Guild with ID ${process.env.SERVER_ID} not found.`);
        return interaction.reply({ content: 'Guild not found. Please contact an administrator.', ephemeral: true });
      }

      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) {
        console.error(`[ERROR] Discord member with ID ${discordId} not found.`);
        return interaction.reply({ content: 'Discord member not found. Please contact an administrator.', ephemeral: true });
      }

      await removeOldRoles(member);

      await member.roles.add(VERIFIED_ROLE_ID).catch((err) => console.error(`[ERROR] Failed to assign Verified role: ${err.message}`));

      const rankRoleId = rankToRole[robloxRankId];
      if (rankRoleId) {
        await member.roles.add(rankRoleId).catch((err) => console.error(`[ERROR] Failed to assign rank role: ${err.message}`));
      }

      await updateNickname(member, userData.robloxUsername, robloxRankId);

      await resetUserProgress(robloxUserId);

      await interaction.reply({ content: 'Your roles and progress have been updated based on your current Roblox rank.', ephemeral: true });
    } else {
      await interaction.reply({ content: 'Your roles are already up to date.', ephemeral: true });
    }
  } catch (error) {
    console.error(`[ERROR] Error updating roles: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'There was an error updating your roles. Please try again later.', ephemeral: true });
    }
  }
}

/**
 * Handles the /progress command.
 * @param {CommandInteraction} interaction 
 */
async function handleProgressCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const discordId = interaction.user.id;
    console.log(`[DEBUG] Fetching verification data for Discord ID: ${discordId}`);

    const userData = await Verification.findOne({ discordId });

    if (!userData) {
      console.log('[DEBUG] User not found in the verification database.');
      return interaction.editReply('User not found in the verification database. Please ensure you are verified by using the /verify command.');
    }

    const username = userData.robloxUsername;
    if (!username) {
      console.log('[DEBUG] Roblox username not found for this Discord ID.');
      return interaction.editReply('No associated Roblox username found for your account. Please complete verification.');
    }

    console.log(`[DEBUG] Roblox username found: ${username}`);

    const robloxUserId = userData.robloxUserId;

    // Update groupPrimaried status
    const isGroupPrimaried = await checkIfGroupIsPrimaried(robloxUserId);
    userData.progress.groupPrimaried = isGroupPrimaried;
    await userData.save();

    const avatarUrl = await getRobloxHeadshotUrl(userData.robloxUserId);
    const embed = await createProgressEmbed(userData, interaction.member, avatarUrl, userData.rank);

    return interaction.editReply({ embeds: [embed] });

  } catch (error) {
    console.error(`[ERROR] Error checking progress for ${interaction.user.username}:`, error);
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply({ content: 'There was an error checking your progress. Please try again later.', ephemeral: true });
    } else if (interaction.deferred) {
      return interaction.editReply('There was an error checking your progress. Please try again later.');
    }
  }
}

/**
 * Handles the /edit-progress command.
 * @param {CommandInteraction} interaction 
 */
/**
 * Handles the /edit-progress command.
 * @param {CommandInteraction} interaction 
 */
/**
 * Handles the /edit-progress command.
 * @param {CommandInteraction} interaction 
 */
/**
 * Handles the /edit-progress command.
 * @param {CommandInteraction} interaction 
 */
async function handleEditProgressCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });
  
  const member = interaction.member;
  const hasHighRankRole = member.roles.cache.has(HIGH_RANK_ROLE_ID);

  if (!hasHighRankRole) {
    return interaction.editReply({ content: 'You do not have permission to use this command.', ephemeral: true });
  }

  const robloxUsername = interaction.options.getString('username');
  const subcommand = interaction.options.getSubcommand();
  const action = interaction.options.getString('action'); // Expected to be 'add' or 'remove'

  try {
    // Fetch the user data from the database using Roblox username (case-insensitive)
    const userData = await Verification.findOne({ robloxUsername: { $regex: new RegExp(`^${robloxUsername}$`, 'i') } });
    if (!userData) {
      console.error(`[ERROR] User not found: ${robloxUsername}`);
      return interaction.editReply({ content: 'User not found in the verification database.', ephemeral: true });
    }

    // Define subcommands that are restricted for rank 5 users
    const restrictedSubcommandsForRank5 = ['defense-trainings', 'raid-trainings', 'warfare-events'];

    // Check if the target user is in rank 5 and is attempting to use a restricted subcommand
    if (userData.rank === 5 && restrictedSubcommandsForRank5.includes(subcommand)) {
      return interaction.editReply({ 
        content: `You cannot modify **${subcommand.replace('-', ' ')}** for users in the **Senior Trooper Helios Pathway**.`, 
        ephemeral: true 
      });
    }

    let propertyEdited = '';
    let previousValue = null;
    let newValue = null;

    switch (subcommand) {
      case 'defense-trainings':
        previousValue = userData.progress.defenseTrainings;
        if (action === 'add') {
          userData.progress.defenseTrainings = Math.min(userData.progress.defenseTrainings + 1, 10);
        } else if (action === 'remove') {
          userData.progress.defenseTrainings = Math.max(userData.progress.defenseTrainings - 1, 0);
        } else {
          return interaction.editReply({ content: 'Invalid action. Use "add" or "remove".', ephemeral: true });
        }
        newValue = userData.progress.defenseTrainings;
        propertyEdited = `Defense Trainings (${previousValue} --> ${newValue})`;
        break;

      case 'raid-trainings':
        previousValue = userData.progress.raidTrainings;
        if (action === 'add') {
          userData.progress.raidTrainings = Math.min(userData.progress.raidTrainings + 1, 10);
        } else if (action === 'remove') {
          userData.progress.raidTrainings = Math.max(userData.progress.raidTrainings - 1, 0);
        } else {
          return interaction.editReply({ content: 'Invalid action. Use "add" or "remove".', ephemeral: true });
        }
        newValue = userData.progress.raidTrainings;
        propertyEdited = `Raid Trainings (${previousValue} --> ${newValue})`;
        break;

      case 'warfare-events':
        previousValue = userData.progress.warfareEvents;
        if (action === 'add') {
          userData.progress.warfareEvents = Math.min(userData.progress.warfareEvents + 1, 20);
        } else if (action === 'remove') {
          userData.progress.warfareEvents = Math.max(userData.progress.warfareEvents - 1, 0);
        } else {
          return interaction.editReply({ content: 'Invalid action. Use "add" or "remove".', ephemeral: true });
        }
        newValue = userData.progress.warfareEvents;
        propertyEdited = `Warfare Events (${previousValue} --> ${newValue})`;
        break;

      case 'trooper-trainings-group-protocol':
        previousValue = userData.progress.trooperTrainingsGroupProtocol;
        if (action === 'add') {
          userData.progress.trooperTrainingsGroupProtocol = Math.min(userData.progress.trooperTrainingsGroupProtocol + 1, 2);
        } else if (action === 'remove') {
          userData.progress.trooperTrainingsGroupProtocol = Math.max(userData.progress.trooperTrainingsGroupProtocol - 1, 0);
        } else {
          return interaction.editReply({ content: 'Invalid action. Use "add" or "remove".', ephemeral: true });
        }
        newValue = userData.progress.trooperTrainingsGroupProtocol;
        propertyEdited = `Trooper Trainings Group Protocol (${previousValue} --> ${newValue})`;
        break;

      case 'trooper-trainings-game-sense':
        previousValue = userData.progress.trooperTrainingsGameSense;
        if (action === 'add') {
          userData.progress.trooperTrainingsGameSense = Math.min(userData.progress.trooperTrainingsGameSense + 1, 2);
        } else if (action === 'remove') {
          userData.progress.trooperTrainingsGameSense = Math.max(userData.progress.trooperTrainingsGameSense - 1, 0);
        } else {
          return interaction.editReply({ content: 'Invalid action. Use "add" or "remove".', ephemeral: true });
        }
        newValue = userData.progress.trooperTrainingsGameSense;
        propertyEdited = `Trooper Trainings Game Sense (${previousValue} --> ${newValue})`;
        break;

      case 'trooper-trainings-terrain':
        previousValue = userData.progress.trooperTrainingsTerrain;
        if (action === 'add') {
          userData.progress.trooperTrainingsTerrain = Math.min(userData.progress.trooperTrainingsTerrain + 1, 2);
        } else if (action === 'remove') {
          userData.progress.trooperTrainingsTerrain = Math.max(userData.progress.trooperTrainingsTerrain - 1, 0);
        } else {
          return interaction.editReply({ content: 'Invalid action. Use "add" or "remove".', ephemeral: true });
        }
        newValue = userData.progress.trooperTrainingsTerrain;
        propertyEdited = `Trooper Trainings Terrain (${previousValue} --> ${newValue})`;
        break;

      case 'zombie-aim-challenge':
        previousValue = userData.progress.zombieAimChallenge;
        if (action === 'add') {
          userData.progress.zombieAimChallenge = true; // Set to true if adding
        } else if (action === 'remove') {
          userData.progress.zombieAimChallenge = false; // Set to false if removing
        } else {
          return interaction.editReply({ content: 'Invalid action. Use "add" or "remove".', ephemeral: true });
        }
        newValue = userData.progress.zombieAimChallenge;
        propertyEdited = `Zombie Aim Challenge (${previousValue ? 'Completed' : 'Not Completed'} --> ${newValue ? 'Completed' : 'Not Completed'})`;
        break;

      case 'conscript-assessment':
        previousValue = userData.progress.conscriptAssessmentPassed;
        if (action === 'pass') {
          userData.progress.conscriptAssessmentPassed = true;
        } else if (action === 'fail') {
          userData.progress.conscriptAssessmentPassed = false;
        } else {
          return interaction.editReply({ content: 'Invalid action. Use "pass" or "fail".', ephemeral: true });
        }
        newValue = userData.progress.conscriptAssessmentPassed;
        propertyEdited = `Conscript Assessment Passed (${previousValue ? 'Yes' : 'No'} --> ${newValue ? 'Yes' : 'No'})`;
        break;

      default:
        return interaction.editReply({ content: 'Invalid subcommand.', ephemeral: true });
    }

    // Save the updated user data to the database
    await userData.save();
    
    // Fetch the Roblox user's avatar URL for the embed
    const avatarUrl = await getRobloxHeadshotUrl(userData.robloxUserId);
    
    // Check for completion of requirements and send notifications if necessary
    await checkCompletionAndNotify(userData, interaction.guild, avatarUrl);

    // Log the progress edit in the designated log channel
    const logChannel = interaction.guild.channels.cache.get(PROGRESS_LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setTitle('Progress Report Edited')
        .addFields(
          { name: 'Discord User', value: `<@${userData.discordId}> (${userData.discordId})`, inline: true },
          { name: 'Roblox User', value: `${userData.robloxUsername} (${userData.robloxUserId})`, inline: true },
          { name: 'Rank', value: `${rankToFullName[userData.rank]}`, inline: true },
          { name: 'Property Edited', value: `${propertyEdited}`, inline: false },
          { name: 'Edited By', value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: false },
        )
        .setFooter({ text: `${new Date().toLocaleString()}` })
        .setColor('#FFA500'); // Orange color for edits

      try {
        await logChannel.send({ embeds: [logEmbed] });
      } catch (error) {
        console.error(`[ERROR] Failed to send log embed: ${error.message}`);
      }
    } else {
      console.error('[ERROR] Could not find the progress log channel or it is not a text channel.');
    }

    // Respond to the command issuer with the result
    return interaction.editReply(`Successfully updated ${robloxUsername}'s progress.\n${propertyEdited}`);
  } catch (error) {
    console.error(`[ERROR] Error updating progress for ${robloxUsername}: ${error.message}`);
    return interaction.editReply('There was an error updating the user\'s progress. Please try again later.');
  }
}

/**
 * Handles the /promote command.
 * @param {CommandInteraction} interaction 
 */
async function handlePromoteCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });

  try {
    const member = interaction.member;

    if (!member.roles.cache.has(HIGH_RANK_ROLE_ID)) {
      console.log('[DEBUG] User lacks required role.');
      return interaction.editReply('You do not have permission to use this command.');
    }

    const robloxUsername = interaction.options.getString('username');
    const rank = interaction.options.getString('rank');

    console.log(`[DEBUG] Changing rank for user: ${robloxUsername} to rank: ${rank}`);

    const robloxUserId = await noblox.getIdFromUsername(robloxUsername);
    if (!robloxUserId) {
      return interaction.editReply(`User ${robloxUsername} not found on Roblox.`);
    }

    const currentRank = await noblox.getRankInGroup(GROUP_ID, robloxUserId);
    console.log(`[DEBUG] Current Roblox Rank: ${currentRank}`);

    if (currentRank === 0) {
      return interaction.editReply(`${robloxUsername} is not a member of the group.`);
    }

    let newRankId;
    switch (rank) {
      case 'Conscript':
        newRankId = 2;
        break;
      case 'Trooper':
        newRankId = 3;
        break;
      case 'Senior Trooper':
        newRankId = 4;
        break;
      case 'Senior Trooper Helios Pathway':
        newRankId = 5;
        break;
      case 'Senior Trooper Commissariat Pathway':
        newRankId = 6;
        break;
      default:
        return interaction.editReply('Invalid rank selected.');
    }

    const userData = await Verification.findOne({ robloxUsername });
    if (!userData) {
      return interaction.editReply(`User data not found for ${robloxUsername}. Please ensure the user is verified.`);
    }

    // Allow promotion from Helios Pathway (rank 5) to Senior Trooper (rank 4)
    if (userData.rank === 5 && newRankId === 4) {
      console.log(`[DEBUG] Changing rank from Helios Pathway to Senior Trooper`);
    } else if (userData.rank === 6 && newRankId === 4) {
      console.log(`[DEBUG] Changing rank from Commissariat Pathway to Senior Trooper`);
    } else if (newRankId === userData.rank) {
      return interaction.editReply(`${robloxUsername} is already at the rank ${rank}.`);
    }

    await noblox.setRank(GROUP_ID, robloxUserId, newRankId);
    console.log(`[DEBUG] Changed ${robloxUsername}'s rank to ${newRankId}`);

    const guild = interaction.guild;
    const targetMember = await guild.members.fetch(userData.discordId).catch(() => null);
    if (!targetMember) {
      console.log(`[DEBUG] The corresponding Discord user for ${robloxUsername} could not be found.`);
      return interaction.editReply('The corresponding Discord user could not be found.');
    }

    console.log(`[DEBUG] Found Discord user: ${targetMember.user.tag}`);

    await removeOldRoles(targetMember);

    const roleId = rankToRole[newRankId];
    if (roleId) {
      await targetMember.roles.add(roleId).catch((err) => console.error(`[ERROR] Failed to assign role: ${err.message}`));
    }

    await targetMember.roles.add(VERIFIED_ROLE_ID).catch((err) => console.error(`[ERROR] Failed to assign Verified role: ${err.message}`));

    await updateNickname(targetMember, robloxUsername, newRankId);
    await resetUserProgress(robloxUserId);
    userData.rank = newRankId;
    await userData.save();

    await interaction.editReply(`Successfully ranked ${robloxUsername} to ${rank}.`);

  } catch (error) {
    console.error(`[ERROR] Failed to change rank for user ${robloxUsername}: ${error.message}`);
    await interaction.editReply({ content: 'There was an error changing the user\'s rank. Please try again later.', ephemeral: true });
  }
}

/**
 * Handles the /assign-commissariat-pathway command.
 * @param {CommandInteraction} interaction 
 */
async function handleAssignCommissariatPathwayCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const member = interaction.member;

    if (!member.roles.cache.has(HIGH_RANK_ROLE_ID)) {
      return interaction.editReply('You do not have permission to use this command.');
    }

    const robloxUsername = interaction.options.getString('username');

    console.log(`[DEBUG] Searching for user: ${robloxUsername}`);

    let userData = await Verification.findOne({ 
      robloxUsername: { $regex: new RegExp(`^${robloxUsername}$`, 'i') } 
    });

    if (!userData) {
      console.log(`[DEBUG] User data not found for ${robloxUsername}`);
      return interaction.editReply(`User data not found for ${robloxUsername}. Please ensure the user is verified and the username is correct.`);
    }

    console.log(`[DEBUG] User data found: ${JSON.stringify(userData)}`);

    // Verify Roblox user exists and set rank
    let robloxUserId;
    try {
      robloxUserId = await noblox.getIdFromUsername(robloxUsername);
      if (!robloxUserId) {
        return interaction.editReply(`User ${robloxUsername} not found on Roblox.`);
      }
      
      // Set the user's rank to Senior Trooper (rank 4) in the Roblox group
      await noblox.setRank(GROUP_ID, robloxUserId, 4);
      console.log(`[DEBUG] Set ${robloxUsername}'s rank to Senior Trooper (4) in Roblox group`);
    } catch (error) {
      console.error(`[ERROR] Failed to set Roblox rank: ${error.message}`);
      return interaction.editReply(`Failed to set Roblox rank. Error: ${error.message}`);
    }

    // Reset progress and update rank
    userData.progress = {
      defenseTrainings: 0,
      raidTrainings: 0,
      warfareEvents: 0,
      trooperTrainingsGroupProtocol: 0,
      trooperTrainingsGameSense: 0,
      trooperTrainingsTerrain: 0,
      zombieAimChallenge: false,
      groupPrimaried: false,
      conscriptAssessmentPassed: false,
      warnings: 0,
      completeAssignments: false,
    };
    // Reset notification flags
    userData.notificationsSent.conscriptRequirementsMet = false;
    userData.notificationsSent.trooperRequirementsMet = false;
    userData.notificationsSent.seniorTrooperRequirementsMet = false;
    userData.notificationsSent.commissariatPathwayRequirementsMet = false;
    userData.rank = 6; // Set rank to Senior Trooper Commissariat Pathway

    await userData.save();

    const guild = interaction.guild;
    const memberToUpdate = await guild.members.fetch(userData.discordId).catch(() => null);
    if (!memberToUpdate) {
      console.error(`[ERROR] Discord member with ID ${userData.discordId} not found.`);
      return interaction.editReply('Discord member not found. Please contact an administrator.');
    }

    await removeOldRoles(memberToUpdate);

    // Assign roles
    const rolesToAdd = [VERIFIED_ROLE_ID, '1290522501461315625', '1290522199282946171']; // Assign Verified, Senior Trooper Commissariat, and Senior Trooper roles
    await memberToUpdate.roles.add(rolesToAdd).catch((err) => console.error(`[ERROR] Failed to assign roles: ${err.message}`));

    // Update nickname
    await updateNickname(memberToUpdate, userData.robloxUsername, userData.rank);

    return interaction.editReply(`${userData.robloxUsername} has been assigned to the Senior Trooper Commissariat Pathway, ranked to Senior Trooper in the Roblox group, and given the Senior Trooper role in Discord.`);
  } catch (error) {
    console.error(`[ERROR] Failed to assign Commissariat Pathway to user ${robloxUsername}: ${error.message}`);
    if (!interaction.replied && !interaction.deferred) {
      return interaction.reply(`There was an error assigning the Commissariat Pathway: ${error.message}. Please try again later or contact an administrator.`);
    } else if (interaction.deferred) {
      return interaction.editReply(`There was an error assigning the Commissariat Pathway: ${error.message}. Please try again later or contact an administrator.`);
    }
  }
}

async function handleAssignHeliosPathwayCommand(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const member = interaction.member;
    if (!member.roles.cache.has(HIGH_RANK_ROLE_ID)) {
      return interaction.editReply('You do not have permission to use this command.');
    }

    const robloxUsername = interaction.options.getString('username');

    console.log(`[DEBUG] Searching for user: ${robloxUsername}`);

    let userData = await Verification.findOne({ 
      robloxUsername: { $regex: new RegExp(`^${robloxUsername}$`, 'i') } 
    });

    if (!userData) {
      console.log(`[DEBUG] User data not found for ${robloxUsername}`);
      return interaction.editReply(`User data not found for ${robloxUsername}. Please ensure the user is verified and the username is correct.`);
    }

    console.log(`[DEBUG] User data found: ${JSON.stringify(userData)}`);

    // Verify Roblox user exists and set rank
    let robloxUserId;
    try {
      robloxUserId = await noblox.getIdFromUsername(robloxUsername);
      if (!robloxUserId) {
        return interaction.editReply(`User ${robloxUsername} not found on Roblox.`);
      }
      
      // Set the user's rank to Senior Trooper (rank 4) in the Roblox group
      await noblox.setRank(GROUP_ID, robloxUserId, 4);
      console.log(`[DEBUG] Set ${robloxUsername}'s rank to Senior Trooper (4) in Roblox group`);
    } catch (error) {
      console.error(`[ERROR] Failed to set Roblox rank: ${error.message}`);
      return interaction.editReply(`Failed to set Roblox rank. Error: ${error.message}`);
    }

    // Reset progress and update rank
    userData.progress = {
      defenseTrainings: 0,
      raidTrainings: 0,
      warfareEvents: 0,
      trooperTrainingsGroupProtocol: 0,
      trooperTrainingsGameSense: 0,
      trooperTrainingsTerrain: 0,
      zombieAimChallenge: false,
      groupPrimaried: false,
      conscriptAssessmentPassed: false,
      warnings: 0,
    };
    // Reset notification flags
    userData.notificationsSent = {
      conscriptRequirementsMet: false,
      trooperRequirementsMet: false,
      seniorTrooperRequirementsMet: false,
      heliosPathwayRequirementsMet: false,
    };
    userData.rank = 5; // Set internal rank to Senior Trooper Helios Pathway

    await userData.save();

    const guild = interaction.guild;
    const memberToUpdate = await guild.members.fetch(userData.discordId).catch(() => null);
    if (!memberToUpdate) {
      console.error(`[ERROR] Discord member with ID ${userData.discordId} not found.`);
      return interaction.editReply('Discord member not found. Please contact an administrator.');
    }

    await removeOldRoles(memberToUpdate);

    // Assign roles
    const rolesToAdd = [VERIFIED_ROLE_ID, '1290522199282946171']; // Assign Verified and Senior Trooper roles
    await memberToUpdate.roles.add(rolesToAdd).catch((err) => console.error(`[ERROR] Failed to assign roles: ${err.message}`));

    // Update nickname
    await updateNickname(memberToUpdate, userData.robloxUsername, userData.rank);

    return interaction.editReply(`${userData.robloxUsername} has been assigned to the Senior Trooper Helios Pathway, ranked to Senior Trooper in the Roblox group, and given the Senior Trooper role in Discord.`);
  } catch (error) {
    console.error(`[ERROR] Failed to assign Helios Pathway to user ${robloxUsername}: ${error.message}`);
    return interaction.editReply(`There was an error assigning the Helios Pathway: ${error.message}. Please try again later or contact an administrator.`);
  }
}

async function handleEditHeliosProgress(interaction) {
  try {
    await interaction.deferReply({ ephemeral: false });

    const member = interaction.member;
    if (!member.roles.cache.has(HIGH_RANK_ROLE_ID)) {
      return interaction.editReply('You do not have permission to use this command.');
    }

    const username = interaction.options.getString('username');
    const subcommand = interaction.options.getSubcommand();
    const action = interaction.options.getString('action');

    const userData = await Verification.findOne({ robloxUsername: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (!userData) {
      return interaction.editReply('User not found in the verification database.');
    }

    if (userData.rank !== 5) {
      return interaction.editReply('This command can only be used for Senior Trooper Helios Pathway members.');
    }

    let propertyEdited = '';
    let previousValue = null;
    let newValue = null;

    switch (subcommand) {
      case 'lead-defensive-training':
        previousValue = userData.progress.defenseTrainings;
        if (action === 'add') {
          userData.progress.defenseTrainings = Math.min(userData.progress.defenseTrainings + 1, 4);
        } else if (action === 'remove') {
          userData.progress.defenseTrainings = Math.max(0, userData.progress.defenseTrainings - 1);
        }
        newValue = userData.progress.defenseTrainings;
        propertyEdited = `Lead Defensive Trainings (${previousValue} --> ${newValue})`;
        break;

      case 'lead-raid-training':
        previousValue = userData.progress.raidTrainings;
        if (action === 'add') {
          userData.progress.raidTrainings = Math.min(userData.progress.raidTrainings + 1, 4);
        } else if (action === 'remove') {
          userData.progress.raidTrainings = Math.max(0, userData.progress.raidTrainings - 1);
        }
        newValue = userData.progress.raidTrainings;
        propertyEdited = `Lead Raid Trainings (${previousValue} --> ${newValue})`;
        break;

      case 'co-lead-warfare-event':
        previousValue = userData.progress.warfareEvents;
        if (action === 'add') {
          userData.progress.warfareEvents = Math.min(userData.progress.warfareEvents + 1, 6);
        } else if (action === 'remove') {
          userData.progress.warfareEvents = Math.max(0, userData.progress.warfareEvents - 1);
        }
        newValue = userData.progress.warfareEvents;
        propertyEdited = `Co-Lead Warfare Events (${previousValue} --> ${newValue})`;
        break;

      default:
        return interaction.editReply('Invalid subcommand.');
    }

    await userData.save();

    const logChannel = interaction.guild.channels.cache.get(PROGRESS_LOG_CHANNEL_ID);
    if (logChannel && logChannel.isTextBased()) {
      const logEmbed = new EmbedBuilder()
        .setTitle('Helios Pathway Progress Report Edited')
        .addFields(
          { name: 'Discord User', value: `<@${userData.discordId}> (${userData.discordId})`, inline: true },
          { name: 'Roblox User', value: `${userData.robloxUsername} (${userData.robloxUserId})`, inline: true },
          { name: 'Rank', value: 'Senior Trooper Helios Pathway', inline: true },
          { name: 'Property Edited', value: propertyEdited, inline: false },
          { name: 'Edited By', value: `<@${interaction.user.id}> (${interaction.user.id})`, inline: false },
        )
        .setFooter({ text: `${new Date().toLocaleString()}` })
        .setColor('#FFA500');

      await logChannel.send({ embeds: [logEmbed] });
    }

    return interaction.editReply(`Successfully updated ${username}'s Helios Pathway progress.\n${propertyEdited}`);
  } catch (error) {
    console.error(`[ERROR] Error updating Helios Pathway progress: ${error.message}`);
    return interaction.editReply('There was an error updating the user\'s progress. Please try again later.');
  }
}



let deletionReports = [];

// Function to handle member leave
async function handleMemberLeave(member) {
  console.log(`Member leave event triggered for ${member.user.tag} (${member.id})`);
  try {
    // Find the user in the database
    const userData = await Verification.findOne({ discordId: member.id });
    
    if (!userData) {
      console.log(`No data found for leaving member: ${member.user.tag}`);
      return;
    }

    console.log(`Found data for leaving member: ${member.user.tag}`);

    // Store user data before deletion
    const discordUser = `${member.user.tag} (${member.id})`;
    const robloxUser = `${userData.robloxUsername} (${userData.robloxUserId})`;
    
    // Delete user data from the database
    await Verification.findOneAndDelete({ discordId: member.id });
    console.log(`User data deleted for: ${member.user.tag}`);

    // Push the report to the deletionReports array
    deletionReports.push({
      discordUser,
      robloxUser,
      reason: 'User exited the server.',
    });

    // If this is the first report, send the deletion report message
    if (deletionReports.length === 1) {
      const channel = member.guild.channels.cache.get('1290521398606954538'); // Specify your channel ID here
      if (channel) {
        const embed = new EmbedBuilder()
          .setTitle('Statistics Deleted')
          .setColor('#FF0000')
          .setTimestamp();

        // Add fields for each report in the deletionReports array
        deletionReports.forEach(report => {
          embed.addFields(
            { name: 'Discord User:', value: report.discordUser },
            { name: 'Roblox User:', value: report.robloxUser },
            { name: 'Deletion Reason:', value: report.reason },
          );
        });

        await channel.send({ embeds: [embed] });
        console.log(`Deletion report sent to channel ${channel.name}`);

        // Clear the deletionReports array after sending
        deletionReports = [];
      } else {
        console.error('Report channel not found');
      }
    }
  } catch (error) {
    console.error('Error handling member leave:', error);
  }
}

// Event Listeners

client.on('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}!`);
});

// Handle member leave event
client.on('guildMemberRemove', async (member) => {
  console.log(`Member left: ${member.user.tag} (${member.id})`);
  await handleMemberLeave(member);
});

// Handle Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isCommand()) return;

  console.log(`[DEBUG] Interaction received: ${interaction.id} - Command: ${interaction.commandName} from ${interaction.user.tag}`);

  try {
    switch (interaction.commandName) {
      case 'verify':
        await handleVerifyCommand(interaction);
        break;
      case 'check-verification':
        await handleCheckVerificationCommand(interaction);
        break;
      case 'update':
        await handleUpdateCommand(interaction);
        break;
      case 'progress':
        await handleProgressCommand(interaction);
        break;
      case 'edit-progress':
        await handleEditProgressCommand(interaction);
        break;
      case 'check-progress':
        await handleCheckProgressCommand(interaction);
        break;
      case 'promote':
        await handlePromoteCommand(interaction);
        break;
      case 'assign-helios-pathway':
        await handleAssignHeliosPathwayCommand(interaction);
        break;
      case 'edit-helios-progress':
        await handleEditHeliosProgress(interaction);
        break;
      case 'assign-commissariat-pathway':
        await handleAssignCommissariatPathwayCommand(interaction);
        break;
      case 'edit-commissariat-assignments':
        await handleEditCommissariatAssignments(interaction);
        break;
      case 'log-event':
        await handleLogEventCommand(interaction);
        break;
      default:
        console.log(`[WARNING] Unknown command: ${interaction.commandName}`);
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: 'Unknown command.', ephemeral: true });
        }
        break;
    }
  } catch (error) {
    console.error(`[ERROR] An error occurred while processing the interaction: ${error.message}`);
    console.error(error.stack);
    
    if (!interaction.replied && !interaction.deferred) {
      try {
        await interaction.reply({ content: 'There was an error processing your request. Please try again later.', ephemeral: true });
      } catch (replyError) {
        console.error('[ERROR] Failed to send error message:', replyError);
      }
    } else if (interaction.deferred && !interaction.replied) {
      try {
        await interaction.editReply({ content: 'There was an error processing your request. Please try again later.' });
      } catch (editReplyError) {
        console.error('[ERROR] Failed to edit reply with error message:', editReplyError);
      }
    }
  }
});
