const mongoose = require('mongoose');
// Connection to the database
const connectDb = async () => {
    try {
        const conn = await mongoose.connect(process.env.DATABASE);
        console.log('Database connection successful');
    } catch (error) {
        console.error(`Connection error: ${error.message}`);
        process.exit(1);
    }
};
module.exports = connectDb;