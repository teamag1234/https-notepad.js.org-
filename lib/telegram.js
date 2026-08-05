import axios from 'axios';

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME;

const telegramAPI = axios.create({
  baseURL: `https://api.telegram.org/bot${BOT_TOKEN}`,
  headers: {
    'Content-Type': 'application/json',
  },
});

export function getDeepLink(token) {
  return `https://t.me/${BOT_USERNAME}?start=${token}`;
}

export async function sendMessage(chatId, text, extra = {}) {
  try {
    const response = await telegramAPI.post('/sendMessage', {
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...extra,
    });
    return response.data?.result || null;
  } catch (error) {
    console.error(`Error sending Telegram message to ${chatId}:`, error.response?.data?.description || error.message);
    return null;
  }
}

export async function answerCallbackQuery(callbackQueryId, text = '') {
  try {
    const response = await telegramAPI.post('/answerCallbackQuery', {
      callback_query_id: callbackQueryId,
      text: text,
    });
    return response.data?.result || null;
  } catch (error) {
    console.error('Error answering callback query:', error.response?.data?.description || error.message);
    return null;
  }
}

export async function editMessageReplyMarkup(chatId, messageId) {
  try {
    const response = await telegramAPI.post('/editMessageReplyMarkup', {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: [] },
    });
    return response.data?.result || null;
  } catch (error) {
    console.error('Error editing message reply markup:', error.response?.data?.description || error.message);
    return null;
  }
}

// Enlace de invitación de un solo uso: solo puede entrar 1 persona con él,
// así el acceso al grupo no se puede reenviar a terceros.
export async function createOneTimeInviteLink(groupChatId, name) {
  try {
    const response = await telegramAPI.post('/createChatInviteLink', {
      chat_id: groupChatId,
      name: (name || 'Alumno').substring(0, 32),
      member_limit: 1,
    });
    return response.data?.result?.invite_link || null;
  } catch (error) {
    console.error(`Error creating invite link for ${groupChatId}:`, error.response?.data?.description || error.message);
    return null;
  }
}
