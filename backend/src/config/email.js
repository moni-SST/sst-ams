const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const sendDocumentUploadEmail = async ({ to, projectName, stageNumber, files, uploadedBy }) => {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) return;

  const fileList = files.map(f => `• ${f}`).join('\n');

  await transporter.sendMail({
    from: `"SST AMS" <${process.env.SMTP_USER}>`,
    to,
    subject: `Documents Uploaded – ${projectName} (Stage ${stageNumber})`,
    text: `Hello,\n\n${uploadedBy} has uploaded ${files.length} file(s) to Stage ${stageNumber} of project "${projectName}".\n\nFiles:\n${fileList}\n\nLogin to view: ${process.env.CLIENT_URL}\n\nRegards,\nSST AMS`,
    html: `
      <p>Hello,</p>
      <p><strong>${uploadedBy}</strong> has uploaded <strong>${files.length} file(s)</strong> to <strong>Stage ${stageNumber}</strong> of project <strong>"${projectName}"</strong>.</p>
      <ul>${files.map(f => `<li>${f}</li>`).join('')}</ul>
      <p><a href="${process.env.CLIENT_URL}">Login to view</a></p>
      <p>Regards,<br/>SST AMS</p>
    `,
  });
};

module.exports = { sendDocumentUploadEmail };
