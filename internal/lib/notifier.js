'use strict';

const { v4: uuidv4 } = require('uuid');
const logger = require('../logger');

/**
 * Stands in for a real SMS/email provider. There is no hospital paging
 * system or Twilio account behind this project, so "sending" a
 * notification means logging it at info level with a generated message id
 * — enough to prove the notification path fires and to assert on in tests,
 * without pretending to be a real integration.
 */
async function sendSms(to, message) {
  const messageId = uuidv4();
  logger.info({ channel: 'sms', to, message, messageId }, 'notification sent (simulated)');
  return { channel: 'sms', messageId, sentAt: new Date().toISOString() };
}

async function sendEmail(to, subject, body) {
  const messageId = uuidv4();
  logger.info({ channel: 'email', to, subject, body, messageId }, 'notification sent (simulated)');
  return { channel: 'email', messageId, sentAt: new Date().toISOString() };
}

module.exports = { sendSms, sendEmail };
