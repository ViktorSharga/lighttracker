const TelegramBot = require('node-telegram-bot-api');
const path = require('path');
const fs = require('fs');

const SUBSCRIBERS_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, '..', 'data'), 'subscribers.json');

// Available groups
const GROUPS = ['1.1', '1.2', '2.1', '2.2', '3.1', '3.2', '4.1', '4.2', '5.1', '5.2', '6.1', '6.2'];

/**
 * Format timestamp to Ukrainian style (HH:MM DD.MM.YYYY)
 * Handles both ISO format and already-formatted strings
 */
function formatTimestamp(timestamp) {
  if (!timestamp) return '';

  // If already in Ukrainian format (contains space but no T), return as-is
  if (timestamp.includes(' ') && !timestamp.includes('T')) {
    return timestamp;
  }

  // Parse ISO format
  const date = new Date(timestamp);
  if (isNaN(date.getTime())) {
    return timestamp; // Return original if parsing fails
  }

  // Server runs UTC; subscribers read Kyiv time
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Kyiv',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(date).map(part => [part.type, part.value])
  );

  return `${p.hour}:${p.minute} ${p.day}.${p.month}.${p.year}`;
}

let bot = null;
let getLatestSchedulesFn = null;

/**
 * Load subscribers from file
 */
function loadSubscribers() {
  try {
    if (fs.existsSync(SUBSCRIBERS_FILE)) {
      return JSON.parse(fs.readFileSync(SUBSCRIBERS_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error loading subscribers:', err);
  }
  return {};
}

/**
 * Save subscribers to file
 */
function saveSubscribers(subscribers) {
  try {
    fs.writeFileSync(SUBSCRIBERS_FILE, JSON.stringify(subscribers, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving subscribers:', err);
  }
}

/**
 * Format schedule for a group
 */
function formatGroupSchedule(group, groupData) {
  if (!groupData) {
    return `Група ${group}: немає даних`;
  }

  const intervals = groupData.intervals.map(i => `${i.start} - ${i.end}`).join(', ');
  const hours = Math.floor(groupData.totalMinutesOff / 60);
  const mins = groupData.totalMinutesOff % 60;
  const totalTime = hours > 0 ? `${hours} год ${mins} хв` : `${mins} хв`;

  return `⚡ *Група ${group}*\n` +
    `Відключення: ${intervals}\n` +
    `Всього без світла: ${totalTime}`;
}

/**
 * Format change notification for a group
 */
function formatChangeNotification(group, prevData, currData, infoTimestamp, isNewDay, scheduleDate) {
  const hasOutages = currData.intervals && currData.intervals.length > 0;
  const intervals = hasOutages ? currData.intervals.map(i => `${i.start} - ${i.end}`).join(', ') : 'немає';
  const hours = Math.floor(currData.totalMinutesOff / 60);
  const mins = currData.totalMinutesOff % 60;
  const totalTime = currData.totalMinutesOff > 0
    ? (hours > 0 ? `${hours} год ${mins} хв` : `${mins} хв`)
    : '0';

  let message = '';

  if (isNewDay) {
    // New day's schedule - different message format
    message = `📅 *Графік на ${scheduleDate}*\n`;
    message += `Станом на: ${formatTimestamp(infoTimestamp)}\n\n`;
    message += `⚡ *Група ${group}*\n`;
    if (hasOutages) {
      message += `Відключення: ${intervals}\n`;
      message += `Всього без світла: ${totalTime}`;
    } else {
      message += `✅ Відключень не заплановано!`;
    }
  } else {
    // Update for existing day
    const prevMinutes = prevData?.totalMinutesOff || 0;
    const currMinutes = currData?.totalMinutesOff || 0;
    const diff = currMinutes - prevMinutes;

    let changeText = '';
    if (diff > 0) {
      const h = Math.floor(diff / 60);
      const m = diff % 60;
      changeText = h > 0 ? `+${h} год ${m} хв` : `+${m} хв`;
      changeText = `🔴 ${changeText} більше без світла`;
    } else if (diff < 0) {
      const h = Math.floor(Math.abs(diff) / 60);
      const m = Math.abs(diff) % 60;
      changeText = h > 0 ? `-${h} год ${m} хв` : `-${m} хв`;
      changeText = `🟢 ${changeText} менше без світла`;
    }

    message = `📢 *Оновлення графіка*\n`;
    message += `Станом на: ${formatTimestamp(infoTimestamp)}\n\n`;
    message += `⚡ *Група ${group}*\n`;

    if (hasOutages) {
      message += `Відключення: ${intervals}\n`;
      message += `Всього: ${totalTime}`;
    } else {
      message += `✅ Відключень не заплановано!`;
    }

    if (changeText) {
      message += `\n\n${changeText}`;
    }

    if (prevData && prevData.intervalsText !== currData.intervalsText) {
      const prevText = prevData.intervalsText || 'немає';
      message += `\n\n_Було: ${prevText}_`;
    }
  }

  return message;
}

/**
 * Create inline keyboard with group buttons (for group selection only)
 */
function getGroupKeyboard() {
  const keyboard = [];
  for (let i = 0; i < GROUPS.length; i += 3) {
    keyboard.push(GROUPS.slice(i, i + 3).map(g => ({ text: `Група ${g}`, callback_data: `select_${g}` })));
  }
  return {
    inline_keyboard: keyboard
  };
}

/**
 * Create persistent reply keyboard (stays at bottom of chat)
 */
function getReplyKeyboard() {
  return {
    keyboard: [
      [{ text: '📋 Поточний графік' }, { text: '🔄 Змінити групу' }],
      [{ text: '🔕 Відписатися' }]
    ],
    resize_keyboard: true,
    is_persistent: true
  };
}

/**
 * Remove reply keyboard
 */
function getRemoveKeyboard() {
  return {
    remove_keyboard: true
  };
}

/**
 * Initialize Telegram bot
 */
function initTelegramBot(token, getLatestSchedules) {
  if (!token) {
    console.log('Telegram bot token not provided, skipping bot initialization');
    return null;
  }

  getLatestSchedulesFn = getLatestSchedules;

  bot = new TelegramBot(token, { polling: true });

  // Set bot commands for menu
  bot.setMyCommands([
    { command: 'start', description: 'Почати роботу' },
    { command: 'schedule', description: 'Поточний графік' },
    { command: 'group', description: 'Змінити групу' },
    { command: 'stop', description: 'Відписатися' }
  ]);

  console.log('Telegram bot initialized');

  // Handle /start command
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const subscribers = loadSubscribers();
    const userSub = subscribers[chatId];

    if (userSub) {
      await bot.sendMessage(
        chatId,
        `Вітаю! Ви підписані на сповіщення для *Групи ${userSub.group}*.`,
        {
          parse_mode: 'Markdown',
          reply_markup: getReplyKeyboard()
        }
      );
      await sendCurrentSchedule(chatId, userSub.group);
    } else {
      await bot.sendMessage(
        chatId,
        '👋 Вітаю! Я бот для відстеження графіків відключень електроенергії у Львові.\n\n' +
        'Оберіть вашу групу, щоб отримувати сповіщення про зміни:',
        { reply_markup: getGroupKeyboard() }
      );
    }
  });

  // Handle /schedule command
  bot.onText(/\/schedule/, async (msg) => {
    const chatId = msg.chat.id;
    const subscribers = loadSubscribers();
    const userSub = subscribers[chatId];

    if (!userSub) {
      await bot.sendMessage(
        chatId,
        'Ви ще не обрали групу. Використайте /start для вибору групи.'
      );
      return;
    }

    await sendCurrentSchedule(chatId, userSub.group);
  });

  // Handle /group command
  bot.onText(/\/group/, async (msg) => {
    const chatId = msg.chat.id;

    await bot.sendMessage(
      chatId,
      'Оберіть вашу групу:',
      { reply_markup: getGroupKeyboard() }
    );
  });

  // Handle /stop command
  bot.onText(/\/stop/, async (msg) => {
    const chatId = msg.chat.id;
    const subscribers = loadSubscribers();

    if (subscribers[chatId]) {
      delete subscribers[chatId];
      saveSubscribers(subscribers);

      await bot.sendMessage(
        chatId,
        '🔕 Ви відписалися від сповіщень.\n\nВикористайте /start щоб підписатися знову.',
        { reply_markup: getRemoveKeyboard() }
      );
    } else {
      await bot.sendMessage(
        chatId,
        'Ви не підписані на сповіщення. Використайте /start для підписки.'
      );
    }
  });

  // Handle text messages (reply keyboard buttons)
  bot.on('message', async (msg) => {
    if (!msg.text || msg.text.startsWith('/')) return;

    const chatId = msg.chat.id;
    const text = msg.text;
    const subscribers = loadSubscribers();
    const userSub = subscribers[chatId];

    if (text === '📋 Поточний графік') {
      if (userSub) {
        await sendCurrentSchedule(chatId, userSub.group);
      } else {
        await bot.sendMessage(chatId, 'Ви ще не обрали групу. Використайте /start для вибору групи.');
      }
    } else if (text === '🔄 Змінити групу') {
      await bot.sendMessage(
        chatId,
        'Оберіть нову групу:',
        { reply_markup: getGroupKeyboard() }
      );
    } else if (text === '🔕 Відписатися') {
      if (userSub) {
        delete subscribers[chatId];
        saveSubscribers(subscribers);

        await bot.sendMessage(
          chatId,
          '🔕 Ви відписалися від сповіщень.\n\nВикористайте /start щоб підписатися знову.',
          { reply_markup: getRemoveKeyboard() }
        );
      } else {
        await bot.sendMessage(chatId, 'Ви не підписані на сповіщення.');
      }
    }
  });

  // Handle callback queries (inline button clicks for group selection)
  bot.on('callback_query', async (query) => {
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;
    const data = query.data;

    const subscribers = loadSubscribers();

    if (data.startsWith('select_')) {
      const group = data.replace('select_', '');

      // Save subscription
      subscribers[chatId] = {
        group,
        subscribedAt: new Date().toISOString(),
        chatId
      };
      saveSubscribers(subscribers);

      // Send confirmation
      await bot.answerCallbackQuery(query.id, { text: `Групу ${group} обрано!` });

      await bot.editMessageText(
        `✅ Ви обрали *Групу ${group}*\n\nТепер ви отримуватимете сповіщення про зміни графіка.`,
        {
          chat_id: chatId,
          message_id: messageId,
          parse_mode: 'Markdown'
        }
      );

      // Send current schedule with reply keyboard
      await sendCurrentSchedule(chatId, group, true);
    }
  });

  // Handle errors
  bot.on('polling_error', (error) => {
    console.error('Telegram polling error:', error.code, error.message);
  });

  return bot;
}

/**
 * Send current schedule to a chat
 */
async function sendCurrentSchedule(chatId, group, showKeyboard = false) {
  if (!getLatestSchedulesFn) {
    await bot.sendMessage(chatId, 'Помилка: дані недоступні');
    return;
  }

  const { current } = getLatestSchedulesFn();

  if (!current) {
    await bot.sendMessage(chatId, 'Графік ще не завантажено. Спробуйте пізніше.');
    return;
  }

  const groupData = current.groups[group];
  let message = `📅 *Графік на ${current.scheduleDate}*\n`;
  message += `Станом на: ${formatTimestamp(current.infoTimestamp)}\n\n`;
  message += formatGroupSchedule(group, groupData);

  const options = { parse_mode: 'Markdown' };
  if (showKeyboard) {
    options.reply_markup = getReplyKeyboard();
  }

  await bot.sendMessage(chatId, message, options);
}

/**
 * Notify all subscribers about schedule changes
 */
async function notifySubscribers(prevSchedule, currSchedule, isNewDay = false) {
  if (!bot || !currSchedule) return;

  const subscribers = loadSubscribers();
  const chatIds = Object.keys(subscribers);

  if (chatIds.length === 0) return;

  const notificationType = isNewDay ? 'new day schedule' : 'schedule update';
  console.log(`Notifying ${chatIds.length} subscribers about ${notificationType}`);

  for (const chatId of chatIds) {
    const sub = subscribers[chatId];
    const group = sub.group;

    const prevGroupData = prevSchedule?.groups[group];
    const currGroupData = currSchedule.groups[group];

    // For new day, always notify (no previous data for this day to compare)
    // For updates, only notify if there's a change for this group
    if (!isNewDay && prevGroupData && currGroupData) {
      if (prevGroupData.intervalsText === currGroupData.intervalsText) {
        continue; // No change for this group
      }
    }

    // Skip if no current data for this group
    if (!currGroupData) {
      continue;
    }

    const message = formatChangeNotification(
      group,
      prevGroupData,
      currGroupData,
      currSchedule.infoTimestamp,
      isNewDay,
      currSchedule.scheduleDate
    );

    try {
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`Failed to notify chat ${chatId}:`, err.message);

      // Remove subscriber if chat is not found
      if (err.response?.statusCode === 403 || err.response?.statusCode === 400) {
        delete subscribers[chatId];
        saveSubscribers(subscribers);
        console.log(`Removed inactive subscriber: ${chatId}`);
      }
    }
  }
}

/**
 * Get subscriber count
 */
function getSubscriberCount() {
  const subscribers = loadSubscribers();
  return Object.keys(subscribers).length;
}

/**
 * Get subscribers by group
 */
function getSubscribersByGroup() {
  const subscribers = loadSubscribers();
  const byGroup = {};

  for (const sub of Object.values(subscribers)) {
    if (!byGroup[sub.group]) {
      byGroup[sub.group] = 0;
    }
    byGroup[sub.group]++;
  }

  return byGroup;
}

/**
 * Notify subscribers when power returns earlier than scheduled
 * @param {string} group - The group that got power back early
 * @param {string} scheduledEnd - When outage was supposed to end (HH:MM)
 * @param {string} actualTime - When power actually returned (HH:MM)
 */
async function notifyEarlyPowerReturn(group, scheduledEnd, actualTime) {
  if (!bot) return;

  const subscribers = loadSubscribers();
  const chatIds = Object.keys(subscribers);

  // Only notify subscribers of this specific group
  const targetChats = chatIds.filter(id => subscribers[id].group === group);
  if (targetChats.length === 0) return;

  // Calculate minutes early
  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const minutesEarly = toMinutes(scheduledEnd) - toMinutes(actualTime);
  const hoursEarly = Math.floor(minutesEarly / 60);
  const minsEarly = minutesEarly % 60;
  const earlyText = hoursEarly > 0
    ? `${hoursEarly} год ${minsEarly} хв`
    : `${minsEarly} хв`;

  console.log(`[Telegram] Notifying ${targetChats.length} subscribers about early power return for group ${group}`);

  const message =
    `🎉 *Світло повернулося раніше!*\n\n` +
    `⚡ *Група ${group}*\n` +
    `Заплановано до: ${scheduledEnd}\n` +
    `Повернулось: ${actualTime}\n` +
    `⏱ На ${earlyText} раніше`;

  for (const chatId of targetChats) {
    try {
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`Failed to notify chat ${chatId}:`, err.message);
      if (err.response?.statusCode === 403 || err.response?.statusCode === 400) {
        delete subscribers[chatId];
        saveSubscribers(subscribers);
        console.log(`Removed inactive subscriber: ${chatId}`);
      }
    }
  }
}

/**
 * Notify subscribers when grid goes offline ahead of schedule (within 30 min window)
 * @param {string} group - Group ID (e.g., "4.1")
 * @param {string} scheduledStart - Scheduled outage start time (HH:MM)
 * @param {string} actualTime - Actual offline time (HH:MM)
 */
async function notifyGridOfflineEarly(group, scheduledStart, actualTime) {
  if (!bot) return;

  const subscribers = loadSubscribers();
  const chatIds = Object.keys(subscribers);

  const targetChats = chatIds.filter(id => subscribers[id].group === group);
  if (targetChats.length === 0) return;

  // Calculate minutes early
  const toMinutes = (t) => {
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };
  const minutesEarly = toMinutes(scheduledStart) - toMinutes(actualTime);
  const earlyText = minutesEarly >= 60
    ? `${Math.floor(minutesEarly / 60)} год ${minutesEarly % 60} хв`
    : `${minutesEarly} хв`;

  console.log(`[Telegram] Notifying ${targetChats.length} subscribers about early grid offline for group ${group}`);

  const message =
    `⚠️ *Світло вимкнули раніше*\n\n` +
    `⚡ *Група ${group}*\n` +
    `За графіком: ${scheduledStart}\n` +
    `Вимкнули: ${actualTime}\n` +
    `⏱ На ${earlyText} раніше`;

  for (const chatId of targetChats) {
    try {
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`Failed to notify chat ${chatId}:`, err.message);
      if (err.response?.statusCode === 403 || err.response?.statusCode === 400) {
        delete subscribers[chatId];
        saveSubscribers(subscribers);
        console.log(`Removed inactive subscriber: ${chatId}`);
      }
    }
  }
}

/**
 * Notify subscribers about emergency/unplanned grid offline (outside schedule)
 * @param {string} group - Group ID (e.g., "4.1")
 * @param {string} actualTime - Actual offline time (HH:MM)
 */
async function notifyEmergencyOffline(group, actualTime) {
  if (!bot) return;

  const subscribers = loadSubscribers();
  const chatIds = Object.keys(subscribers);

  const targetChats = chatIds.filter(id => subscribers[id].group === group);
  if (targetChats.length === 0) return;

  console.log(`[Telegram] Notifying ${targetChats.length} subscribers about emergency offline for group ${group}`);

  const message =
    `🚨 *Позапланове відключення!*\n\n` +
    `⚡ *Група ${group}*\n` +
    `Час: ${actualTime}\n` +
    `⚠️ Відключення поза графіком`;

  for (const chatId of targetChats) {
    try {
      await bot.sendMessage(chatId, message, { parse_mode: 'Markdown' });
    } catch (err) {
      console.error(`Failed to notify chat ${chatId}:`, err.message);
      if (err.response?.statusCode === 403 || err.response?.statusCode === 400) {
        delete subscribers[chatId];
        saveSubscribers(subscribers);
        console.log(`Removed inactive subscriber: ${chatId}`);
      }
    }
  }
}

module.exports = {
  initTelegramBot,
  notifySubscribers,
  notifyEarlyPowerReturn,
  notifyGridOfflineEarly,
  notifyEmergencyOffline,
  getSubscriberCount,
  getSubscribersByGroup
};
