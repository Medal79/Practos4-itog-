const nodemailer = require('nodemailer');

let transporter = null;

// Создаёт (один раз) SMTP-транспорт из переменных .env; возвращает null, если почта не настроена
function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  const port = Number(process.env.SMTP_PORT) || 465;
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return transporter;
}

// Отправляет письмо с кодом сброса пароля; без настроенного SMTP печатает код в консоль сервера
async function sendResetCode(email, code, minutes) {
  const t = getTransporter();
  if (!t) {
    console.warn(`SMTP не настроен. Код сброса пароля для ${email}: ${code}`);
    return false;
  }
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Код для сброса пароля',
    text: `Ваш код для сброса пароля: ${code}\n\nКод действует ${minutes} минут и подходит только для одного использования. Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.`,
    html: `<p>Ваш код для сброса пароля:</p><p style="font-size:28px;font-weight:bold;letter-spacing:6px">${code}</p><p>Код действует ${minutes} минут и подходит только для одного использования.</p><p>Если вы не запрашивали сброс пароля, просто проигнорируйте это письмо.</p>`,
  });
  return true;
}

module.exports = { sendResetCode };