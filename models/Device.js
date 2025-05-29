const mongoose = require('mongoose');

const deviceSchema = new mongoose.Schema({
    brand: String,
    model: String,
    category: String,
    price: String,
    specifications: Object,
    imageUrl: String,
    productUrl: String,
    scrapedAt: Date,
    smc: String,
});

module.exports = mongoose.models.Device || mongoose.model('Device', deviceSchema);
