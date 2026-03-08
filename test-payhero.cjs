const axios = require('axios');
require('dotenv').config();

async function test() {
    const apiUsername = process.env.PAYHERO_API_USERNAME;
    const apiPassword = process.env.PAYHERO_API_PASSWORD;
    const channelId = process.env.PAYHERO_CHANNEL_ID;
    const auth = Buffer.from(`${apiUsername}:${apiPassword}`).toString('base64');
    const urls = [
        { method: 'GET', url: `https://backend.payhero.co.ke/api/v2/transaction-status?reference=fc36-4d57-897a-a7c7a70d540940295&channel_id=${channelId}` }
    ];

    for (const req of urls) {
        try {
            console.log(`Testing ${req.method}:`, req.url);
            const res = await axios({
                method: req.method,
                url: req.url,
                headers: { 
                    'Authorization': `Basic ${auth}`
                }
            });
            console.log('Success:', req.url, res.status, res.data);
        } catch (e) {
            console.log('Error:', req.url, e.response?.status, e.response?.data);
        }
    }
}

test();
