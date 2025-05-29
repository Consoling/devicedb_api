const express = require('express');
const rateLimit = require('express-rate-limit');
const serverless = require('serverless-http');

const connectDB = require('./utils/db');
const Device = require('./models/Device');

const app = express();
app.use(express.json());

process.env.NODE_ENV = process.env.NODE_ENV || 'development';

if (process.env.NODE_ENV === 'development') {
    const morgan = require('morgan');
    app.use(morgan('dev'));

}


app.listen(3000, () => {
    console.log('Server is running on http://localhost:3000');
});
app.get('/api/v1/health', (req, res) => {
    res.status(200).json({ status: 'ok', message: 'Server is healthy' });
});

const limiter = rateLimit({
    windowMs: 24 * 60 * 60 * 1000,
    max: 10,
    message: {
        status: 'error',
        message: 'Free plan limit reached. Please upgrade.',
    },
});
app.use(limiter);

app.post('/api/v1/mobiles', async (req, res) => {
    await connectDB();

    const { brand } = req.body;
    if (!brand) {
        return res.status(400).json({ status: 'error', message: 'Brand is required.' });
    }
    try {
        const mobiles = await Device.find({ brand: new RegExp(`^${brand}$`, 'i') });
        const data = mobiles.map(device => ({
            model: device.model,
            category: device.category,
            price: device.price,
            imageUrl: device.imageUrl,
            productUrl: device.productUrl,
            smc: device.smc,
        }));
        res.json({ status: 'success', count: data.length, data });
    } catch (err) {
        res.status(500).json({ status: 'error', message: 'Server error', error: err.message });
    }
});

module.exports = serverless(app);
