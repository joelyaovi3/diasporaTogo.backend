import mongoose from 'mongoose';

const contactSchema = new mongoose.Schema({
    name: String,
    email: String,
    message: String,
});

const contactModel = mongoose.model('Contact', contactSchema);
export default contactModel;