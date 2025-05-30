const fs = require('fs');
const puppeteer = require('puppeteer');
const mongoose = require('mongoose');
const ora = require('ora');
const nodemailer = require('nodemailer');

require('dotenv').config();


const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
});

const sendMail = async (subject, text) => {
    try {
        await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: process.env.EMAIL_TO,
            subject,
            text,
        });
    } catch (err) {
        console.error('❌ Failed to send email:', err.message);
    }
};

mongoose.connect(process.env.MONGO_URI, {

}).then(() => console.log('✅ MongoDB connected'))
    .catch(err => {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    });

const deviceSchema = new mongoose.Schema({
    brand: String,
    model: String,
    category: String,
    price: String,
    specifications: Object,
    imageUrl: String,
    productUrl: String,
    sfc: String,
    scrapedAt: { type: Date, default: Date.now }, // <-- Add this line
});

const Device = mongoose.model('Device', deviceSchema);

const brands = [
    'samsung', 'xiaomi', 'oneplus', 'oppo', 'vivo', 'iqoo', 'poco', 'motorola', 'nokia', 'sony', 'huawei', 'honor', 'google',
    'infinix', 'apple', 'realme', 'tecno', 'lenovo', 'asus',
];



const categories = {
    phone: 'https://www.smartprix.com/',
    tablet: 'https://www.smartprix.com/tablets/',
};

const allDevices = [];
const allTablets = [];


async function scrapeDevices(brand, category) {
    const baseUrl = categories[category];
    const url = `${baseUrl}mobiles/${brand}-brand`;

    const browser = await puppeteer.launch({ headless: 'new' });
    const page = await browser.newPage();

    await page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
    );
    const spinner = ora(`Scraping ${brand} (${category})...`).start();


    try {
        console.log(`→ Scraping ${brand} (${category})...`);
        spinner.text = `Loading all products for ${brand} (${category})...`;
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        // Click "Load More" until all products are loaded
        let loadMoreVisible = true;
        while (loadMoreVisible) {
            loadMoreVisible = await page.evaluate(() => {
                const btn = document.querySelector('.sm-load-more');
                if (btn && btn.offsetParent !== null) {
                    btn.click();
                    return true;
                }
                return false;
            });
            if (loadMoreVisible) {
                await new Promise(res => setTimeout(res, 2000));
            }
        }



        const devices = await page.evaluate(() => {
            const results = [];
            const items = document.querySelectorAll('.sm-product.has-tag.has-features.has-actions');
            items.forEach(el => {
                const model = el.querySelector('.name h2')?.innerText.trim();
                const price = el.querySelector('.price')?.innerText.trim();
                const imageUrl = el.querySelector('.sm-img-wrap img')?.src;
                const link = el.querySelector('.name')?.href;
                const specs = Array.from(el.querySelectorAll('.sm-feat.specs li')).map(li => li.innerText.trim());
                let smartprixModelCode = null;
                if (link) {
                    const match = link.match(/\/mobiles\/([^\/?#]+)/);
                    if (match && match[1]) {
                        smartprixModelCode = match[1];
                    }
                }

                if (model && link) {
                    results.push({
                        model,
                        price,
                        imageUrl,
                        productUrl: link,
                        specifications: specs,
                        sfc: smartprixModelCode,
                    });
                }
            });
            return results;
        });

        if (!devices.length) {
            console.log(`⚠ No devices found for ${brand} (${category})`);
            return;
        }

        let count = 0;
        for (const device of devices) {
            const newDevice = {
                brand,
                model: device.model,
                category,
                price: device.price,
                specifications: device.specifications,
                imageUrl: device.imageUrl,
                productUrl: device.productUrl,
                sfc: device.sfc,
            };
            allDevices.push(newDevice);
            count++;
            console.log(`  ✔ ${brand} - ${device.model} (${category}) [${count}/${devices.length}]`);
        }

        spinner.succeed(`Scraped ${devices.length} devices for ${brand} (${category})`);


    } catch (err) {
        spinner.fail(`Error scraping ${brand} ${category}: ${err.message}`);

        console.error(`✖ Error scraping ${brand} ${category}:`, err.message);
    } finally {
        await browser.close();
    }
}




async function main() {
    const startTime = new Date();
    const startMsg = `🕒 Cron Job started at ${startTime.toISOString()}`;
    console.log(startMsg);
    await sendMail('DeviceDB Scraper: Cron Started', startMsg);
    console.log('🕒 Cron Job started');
    for (const brand of brands) {
        // Check last scraped time for this brand
        try {
            const lastDevice = await Device.findOne({ brand }).sort({ scrapedAt: -1 });
            if (lastDevice && lastDevice.scrapedAt) {
                const now = new Date();
                const diffMs = now - lastDevice.scrapedAt;
                const diffHrs = diffMs / (1000 * 60 * 60);
                if (diffHrs < 24) {
                    console.log(`⏳ Please wait for 24 hrs to finish before scraping ${brand} again.`);
                    continue;
                }
            }

            allDevices.length = 0;
            await scrapeDevices(brand, 'phone');
            await scrapeDevices(brand, 'tablet');
            // await Device.deleteMany({ brand });
            if (allDevices.length > 0) {
                if (mongoose.connection.readyState === 1) {
                    // Add scrapedAt to each device
                    for (const d of allDevices) {
                        d.scrapedAt = new Date();
                        await Device.updateOne(
                            { brand: d.brand, model: d.model }, // Match by brand & model
                            { $set: d },
                            { upsert: true }
                        );
                    }
                    console.log(`✅ All data for ${brand} saved to MongoDB`);
                } else {
                    console.log(`⚠ MongoDB not connected. Skipping DB save for ${brand}.`);
                }
            } else {
                console.log(`⚠ No data to save for ${brand}`);
            }
        } catch (error) {
            const errorMsg = `❌ Error for brand ${brand} at ${new Date().toISOString()}:\n${err.stack || err.message}`;
            console.error(errorMsg);
            await sendMail('DeviceDB Scraper: Error', errorMsg);
        }
        // fs.writeFileSync(`${brand}-list.json`, JSON.stringify(allDevices, null, 2));
        // console.log(`✅ All data saved to ${brand}-list.json`);
    }

    const endMsg = `🚀 Scraping complete at ${new Date().toISOString()}`;
    console.log(endMsg);
    await sendMail('DeviceDB Scraper: Success', endMsg);
    mongoose.connection.close();
}

main();
