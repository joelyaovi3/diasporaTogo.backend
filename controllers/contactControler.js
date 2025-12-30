import Contact from "../models/contact.js";
import nodemailer from "nodemailer";
import POP3 from "node-pop3";

// Nodemailer configuration for sending emails
const transporter = nodemailer.createTransport({
    host: 'mail.diasporatogo.com',
    port: 587, // Port SMTP
    secure: false, // true pour SSL, false pour TLS
    auth: {
        user: "contact@diasporatogo.com",
        pass: "LCCm@2A-ks-X",
    },
});

// POP3 configuration for retrieving emails
const pop3 = new POP3({
    user: "contact@diasporatogo.com",
    password: "LCCm@2A-ks-X",
    host: "mail.diasporatogo.com",
    port: 995,
    tls: true, // Use TLS for secure connection
});

export const createContact = async (req, res) => {
    const { name, email, message } = req.body;

    // Save to MongoDB
    const newContact = new Contact({ name, email, message });
    await newContact.save();

    // Send email
    const mailOptions = {
        from: newContact.email,
        to: "contact@diasporatogo.com",
        subject: 'New Contact Mail',
        text: `Name: ${name}\nEmail: ${email}\nMessage: ${message}`,
    };

    transporter.sendMail(mailOptions, (error, info) => {
        if (error) {
            console.log(error);
            res.status(500).send('Error sending email');
        } else {
            console.log('Email sent: ' + info.response);
            res.status(200).send('Message sent successfully');
        }
    });
};

export const getContact = async (req, res) => {
    try {
        const data = await Contact.find();
        res.json(data);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
};

// New function to retrieve emails using POP3
export const retrieveEmails = async (req, res) => {
    try {
        // Connect to the POP3 server
        await pop3.connect();

        // Get the number of emails in the inbox
        const count = await pop3.STAT();
        console.log(`Total emails: ${count}`);

        // Retrieve the latest email
        const latestEmail = await pop3.RETR(count);
        console.log("Latest email:", latestEmail);

        // Close the connection
        await pop3.QUIT();

        res.status(200).json({ message: "Emails retrieved successfully", latestEmail });
    } catch (error) {
        console.error("Error retrieving emails:", error);
        res.status(500).json({ message: "Error retrieving emails" });
    }
};
