// email.js — placeholder until SendGrid is configured
async function sendMagicLink(email, token, name) {
  const link = `${process.env.APP_URL || 'https://cda-certificate-generator.onrender.com'}/portal?token=${token}`;
  console.log(`[MAGIC LINK] To: ${email} | Link: ${link}`);
}
module.exports = { sendMagicLink };
