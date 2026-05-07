const mongoose = require('mongoose');
const passportLocalMongoose = require('passport-local-mongoose').default || require('passport-local-mongoose');

const registrationSchema = new mongoose.Schema({
    username: {
        type: String,
        required: true
    },
    email: {
        type: String,
        trim: true,
        required: true
    },
    phonenumber: {
        type: Number,
        required: true,
        trim: true
    },
    nin: {
        type: String,
        required: true,
        trim: true
    },
    role: {
        type: String,
        required: true,
        enum: ['sales_attendant', 'store_manager', 'admin'],
        default: 'sales_attendant'
    }
});

registrationSchema.plugin(passportLocalMongoose, {
    usernameField: 'email'
});

module.exports = mongoose.model('Registration', registrationSchema);