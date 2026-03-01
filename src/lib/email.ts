import nodemailer from "nodemailer";
import dotenv from "dotenv";

dotenv.config();

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendNewExamNotification = async (
  emails: string[] // array of student emails
) => {
  if (!emails || emails.length === 0) {
    console.log("⚠️ No student emails provided");
    return false;
  }

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: emails, // nodemailer supports string[]
    subject: "📢 New Exam Started",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333; text-align: center;">
          🚀 A New Exam Has Started
        </h2>
        
        <p>Dear Student,</p>

        <p>
          We would like to inform you that a new exam has just started.
          Please visit the site to participate.
        </p>

        <div style="text-align: center; margin: 30px 0;">
          <a 
            href="http://localhost:5174/" 
            style="
              background-color: #28a745;
              color: white;
              padding: 12px 20px;
              text-decoration: none;
              border-radius: 5px;
              font-weight: bold;
              display: inline-block;
            "
          >
            Visit Exam Hub
          </a>
        </div>

        <p>Best regards,<br/>Exam Team</p>
      </div>
    `,
  };

  try {
    console.log(`📤 Sending exam notification to ${emails.length} students`);
    const info = await transporter.sendMail(mailOptions);
    console.log("✅ Exam notification email sent:", info.response);
    return true;
  } catch (error) {
    console.error("❌ Exam notification email sending error:", error);
    return false;
  }
};

export default transporter;