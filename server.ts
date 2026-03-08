import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'better-sqlite3';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';
import { WebSocketServer, WebSocket } from 'ws';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const app = express();
const PORT = 3000;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Supabase Setup
let supabaseClient: any = null;

function getSupabase() {
  if (!supabaseClient) {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    
    if (!supabaseUrl || !supabaseKey) {
      console.warn('Supabase credentials missing. Supabase features will be disabled.');
      return null;
    }
    
    supabaseClient = createClient(supabaseUrl, supabaseKey);
  }
  return supabaseClient;
}

// Middleware
app.use(express.json());
app.use(cors());

// Database Setup
const db = new Database('database.sqlite');
db.exec(`
  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    amount REAL,
    multiplier REAL,
    crash_point REAL,
    profit REAL,
    status TEXT, -- 'PLAYING', 'CASHED_OUT', 'LOST'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS withdrawals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    amount REAL,
    phone_number TEXT,
    status TEXT DEFAULT 'Pending',
    reference TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT,
    amount REAL,
    phone_number TEXT,
    status TEXT,
    reference TEXT UNIQUE,
    mpesa_receipt TEXT,
    result_code TEXT,
    result_desc TEXT,
    checkout_request_id TEXT UNIQUE,
    raw_response TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS affiliate_earnings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    referrer_id TEXT,
    referred_id TEXT,
    amount REAL,
    bet_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// API Routes

// 1. User History
app.get('/api/history/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    
    // Fetch withdrawals
    const withdrawalStmt = db.prepare('SELECT id, amount, status, created_at, "WITHDRAWAL" as type FROM withdrawals WHERE user_id = ?');
    const withdrawals = withdrawalStmt.all(userId);
    
    // Sort
    const history = [...withdrawals].sort((a: any, b: any) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
    
    res.json(history);
  } catch (error) {
    console.error('Fetch History Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/withdraw', async (req, res) => {
  try {
    const { user_id, amount, phone_number } = req.body;
    
    if (!user_id || !amount) {
      return res.status(400).json({ success: false, message: 'Missing required fields' });
    }

    const reference = `WITH-${Date.now()}-${Math.random().toString(36).substring(2, 7).toUpperCase()}`;
    
    const stmt = db.prepare('INSERT INTO withdrawals (user_id, amount, phone_number, reference, status) VALUES (?, ?, ?, ?, ?)');
    const result = stmt.run(user_id, amount, phone_number || '', reference, 'Pending');
    
    res.json({ 
      success: true, 
      message: 'Withdrawal request received', 
      withdrawal_id: result.lastInsertRowid,
      reference 
    });
  } catch (error) {
    console.error('Withdrawal Error:', error);
    res.status(500).json({ success: false, message: 'Internal Server Error' });
  }
});

// --- PayHero Integration ---

app.post('/api/pay', async (req, res) => {
  try {
    const { phone_number, amount, user_id } = req.body; // Expect user_id

    if (!phone_number || !amount) {
      return res.status(400).json({ success: false, message: 'Phone number and amount are required' });
    }

    const apiUsername = process.env.PAYHERO_API_USERNAME;
    const apiPassword = process.env.PAYHERO_API_PASSWORD;
    const channelId = process.env.PAYHERO_CHANNEL_ID;
    
    // Use the Supabase Edge Function URL for webhooks if available, otherwise fallback to Express server
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    const callbackUrl = supabaseUrl 
      ? `${supabaseUrl}/functions/v1/payhero-callback`
      : 'https://ais-pre-4nu7rrse7ksxi3k3w5djjp-110450317530.europe-west1.run.app/api/callback';

    if (!apiUsername || !apiPassword || !channelId) {
      console.error('Missing PayHero credentials');
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    const basicAuth = Buffer.from(`${apiUsername}:${apiPassword}`).toString('base64');
    
    // Encode userId in external_reference: "INV-{userId}-{timestamp}"
    // Use a separator that won't break URL params if needed, but PayHero allows strings.
    // If userId is UUID, it might be long. Let's assume it fits.
    const reference = `INV-${user_id || 'GUEST'}-${Date.now()}`;

    const payload = {
      amount: parseFloat(amount),
      phone_number: phone_number,
      channel_id: parseInt(channelId),
      provider: "m-pesa",
      external_reference: reference,
      callback_url: callbackUrl,
      network_code: "63902" // As requested
    };

    console.log('Initiating PayHero STK Push:', payload);

    const response = await axios.post('https://backend.payhero.co.ke/api/v2/payments', payload, {
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Content-Type': 'application/json'
      }
    });

    console.log('PayHero Response:', response.data);

    // 1. Save initial payment record to local SQLite
    try {
        const stmt = db.prepare(`
            INSERT INTO payments (user_id, amount, phone_number, status, reference, checkout_request_id)
            VALUES (?, ?, ?, ?, ?, ?)
        `);
        stmt.run(user_id, amount, phone_number, 'Initiated', reference, response.data.CheckoutRequestID);
        console.log(`Saved initial payment record to local SQLite for ref: ${reference}`);
    } catch (sqliteError) {
        console.error('Error saving initial payment to local SQLite:', sqliteError);
    }

    // 2. Save initial payment record to Supabase
    try {
        const supabase = getSupabase();
        if (supabase) {
            const { error: supabasePayError } = await supabase
                .from('payments')
                .insert({
                    user_id: user_id,
                    amount: amount,
                    status: 'Initiated',
                    external_reference: reference,
                    checkout_request_id: response.data.CheckoutRequestID,
                    updated_at: new Date().toISOString()
                });
            
            if (supabasePayError) {
                console.error('Error saving initial payment to Supabase:', supabasePayError);
                if (supabasePayError.code === 'PGRST205') {
                    console.warn('CRITICAL: Table "payments" is missing in Supabase. Please run the SQL migration.');
                }
            } else {
                console.log(`Saved initial payment record to Supabase for ref: ${reference}`);
            }
        }
    } catch (supabaseErr) {
        console.error('Supabase initial payment save failed:', supabaseErr);
    }

    res.json({
      success: true,
      message: 'STK Push initiated successfully',
      data: response.data,
      reference: reference
    });

  } catch (error: any) {
    console.error('PayHero Error:', error.response?.data || error.message);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to initiate payment',
      error: error.response?.data || error.message 
    });
  }
});

app.post('/api/callback', async (req, res) => {
  console.log('--- PayHero Callback Received ---');
  const callbackData = req.body;
  console.log(JSON.stringify(callbackData, null, 2));
  
  // PayHero can send data flat, nested in 'response', or nested in 'data'
  const data = callbackData?.response || callbackData?.data || callbackData;
  
  // Safaricom raw format fallback (just in case)
  const stkCallback = data?.Body?.stkCallback || callbackData?.Body?.stkCallback;

  let externalRef = data?.ExternalReference || data?.external_reference;
  
  // FIX: Use nullish coalescing (??) because ResultCode can be 0 (falsy)
  let resultCode = data?.ResultCode ?? data?.result_code ?? stkCallback?.ResultCode;
  let resultDesc = data?.ResultDesc || data?.result_desc || stkCallback?.ResultDesc || 'No description provided';
  let amount = data?.Amount ?? data?.amount;
  let mpesaReceipt = data?.MpesaReceiptNumber || data?.mpesa_receipt;
  let checkoutRequestId = data?.CheckoutRequestID || data?.checkout_request_id || stkCallback?.CheckoutRequestID;
  let phone = data?.Phone || data?.PhoneNumber || data?.phone_number;
  let status = data?.Status || data?.status;

  // Extract from Safaricom metadata if present
  if (stkCallback?.CallbackMetadata?.Item) {
      stkCallback.CallbackMetadata.Item.forEach((item: any) => {
          if (item.Name === 'Amount') amount = amount ?? item.Value;
          if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = mpesaReceipt || item.Value;
          if (item.Name === 'PhoneNumber') phone = phone || item.Value;
      });
  }

  // Determine success
  const statusStr = String(status || '').toUpperCase();
  const isSuccess = statusStr === 'SUCCESS' || resultCode === 0 || resultCode === '0';
  const finalStatus = isSuccess ? 'Success' : 'Failed';

  let userId = null;

  // Always try to find the record using CheckoutRequestID first
  if (checkoutRequestId) {
      console.log(`Looking up payment by CheckoutRequestID: ${checkoutRequestId}`);
      try {
          const stmt = db.prepare('SELECT user_id, reference, status, amount FROM payments WHERE checkout_request_id = ?');
          const record = stmt.get(checkoutRequestId) as any;
          if (record) {
              userId = record.user_id;
              externalRef = record.reference; // Use our original reference!
              const currentStatus = record.status;
              console.log(`Found record in SQLite: userId=${userId}, ref=${externalRef}, currentStatus=${currentStatus}`);
              
              // If already successful, don't update balance again
              if (currentStatus === 'Success') {
                  console.log(`Payment ${externalRef} already marked as Success. Skipping balance update.`);
                  return res.status(200).json({ success: true, message: 'Already processed' });
              }
          } else {
              console.log(`No record found in SQLite for CheckoutRequestID: ${checkoutRequestId}`);
          }
      } catch (err) {
          console.error('Error looking up payment record in SQLite:', err);
      }

      // Try Supabase if not found in SQLite
      if (!userId) {
          try {
              const supabase = getSupabase();
              if (supabase) {
                  const { data: sbRecord, error: sbError } = await supabase
                      .from('payments')
                      .select('user_id, external_reference, status')
                      .eq('checkout_request_id', checkoutRequestId)
                      .single();
                  
                  if (sbRecord && !sbError) {
                      userId = sbRecord.user_id;
                      externalRef = sbRecord.external_reference;
                      console.log(`Found record in Supabase: userId=${userId}, ref=${externalRef}, status=${sbRecord.status}`);
                      
                      if (sbRecord.status === 'Success') {
                          console.log(`Payment ${externalRef} already marked as Success in Supabase. Skipping.`);
                          return res.status(200).json({ success: true, message: 'Already processed' });
                      }
                  } else {
                      console.log(`No record found in Supabase for CheckoutRequestID: ${checkoutRequestId}`);
                  }
              }
          } catch (err) {
              console.error('Error looking up payment record in Supabase:', err);
          }
      }
  }

  // Fallback: extract userId from externalRef if not found
  if (!userId && externalRef && externalRef.startsWith('INV-')) {
    const rest = externalRef.substring(4);
    const lastDashIndex = rest.lastIndexOf('-');
    if (lastDashIndex !== -1) {
        userId = rest.substring(0, lastDashIndex);
    }
  }

  if (externalRef) {
      // 1. Update Local SQLite Database (Audit Log)
      try {
          const stmt = db.prepare(`
              UPDATE payments 
              SET amount = COALESCE(?, amount), 
                  phone_number = COALESCE(?, phone_number), 
                  status = ?, 
                  mpesa_receipt = ?, 
                  result_code = ?, 
                  result_desc = ?, 
                  raw_response = ?
              WHERE reference = ?
          `);
          stmt.run(
              amount || null, 
              phone || null, 
              finalStatus, 
              mpesaReceipt || '', 
              resultCode || null,
              resultDesc, 
              JSON.stringify(callbackData),
              externalRef
          );
          console.log(`Updated payment record in local SQLite for ref: ${externalRef}`);
      } catch (sqliteError) {
          console.error('Error updating local SQLite:', sqliteError);
      }

      // 2. Update Supabase Payments Table
      try {
          const supabase = getSupabase();
          if (supabase) {
              const { error: supabasePayError } = await supabase
                  .from('payments')
                  .update({
                      amount: amount,
                      status: finalStatus,
                      mpesa_receipt: mpesaReceipt,
                      result_code: resultCode,
                      result_desc: resultDesc,
                      raw_callback: callbackData,
                      updated_at: new Date().toISOString()
                  })
                  .eq('external_reference', externalRef);
              
              if (supabasePayError) {
                  console.error('Error updating Supabase payments table:', supabasePayError);
                  if (supabasePayError.code === 'PGRST205') {
                      console.warn('CRITICAL: Table "payments" is missing in Supabase. Please run the SQL migration.');
                  }
              } else {
                  console.log(`Updated payment record in Supabase for ref: ${externalRef}`);
              }
          }
      } catch (supabaseErr) {
          console.error('Supabase payment update failed:', supabaseErr);
      }
      
      if (isSuccess && userId) {
          try {
              // 3. Update User Balance
              const supabase = getSupabase();
              if (supabase) {
                  const { data: profile, error: fetchError } = await supabase
                      .from('profiles')
                      .select('balance')
                      .eq('id', userId)
                      .single();

                  if (!fetchError && profile) {
                      const currentBalance = parseFloat(profile.balance || 0);
                      const depositAmount = parseFloat(amount || 0);
                      const newBalance = currentBalance + depositAmount;

                      const { error: updateError } = await supabase
                          .from('profiles')
                          .update({ balance: newBalance })
                          .eq('id', userId);

                      if (!updateError) {
                          console.log(`Successfully updated balance for user ${userId}. New balance: ${newBalance}`);
                      } else {
                          console.error('Error updating balance in Supabase:', updateError);
                      }
                  }
              }
          } catch (dbError) {
              console.error('Database operation failed during balance update:', dbError);
          }
      }

      // 4. Notify User via WebSocket
      const ws = userSockets.get(userId);
      if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
              type: 'PAYMENT_UPDATE',
              payload: {
                  status: isSuccess ? 'SUCCESS' : 'FAILED',
                  amount: amount,
                  reference: externalRef,
                  mpesa_receipt: mpesaReceipt,
                  message: isSuccess ? 'Payment received successfully!' : resultDesc,
                  raw_callback: callbackData
              }
          }));
          console.log(`Notified user ${userId} via WebSocket.`);
      }
  }
  
  res.status(200).json({ success: true, echo: callbackData });
});

app.get('/api/payment/check/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    console.log(`Checking payment for reference: ${reference}`);
    const supabase = getSupabase();
    
    if (supabase) {
      const { data, error } = await supabase
        .from('payments')
        .select('status, amount, raw_callback, result_desc, mpesa_receipt')
        .eq('external_reference', reference)
        .maybeSingle();
        
      if (!error && data) {
        return res.json({ success: true, payment: data });
      }
    }
    
    res.json({ success: false, message: 'Payment not found' });
  } catch (error: any) {
    console.error('Check Payment Error:', error.message);
    res.status(500).json({ success: false, message: 'Failed to check payment' });
  }
});

app.get('/api/payment/status/:reference', async (req, res) => {
  try {
    const { reference } = req.params;
    const apiUsername = process.env.PAYHERO_API_USERNAME;
    const apiPassword = process.env.PAYHERO_API_PASSWORD;

    if (!apiUsername || !apiPassword) {
      return res.status(500).json({ success: false, message: 'Server configuration error' });
    }

    const basicAuth = Buffer.from(`${apiUsername}:${apiPassword}`).toString('base64');

    const response = await axios.get(`https://backend.payhero.co.ke/api/v2/payments/status/?reference=${reference}`, {
      headers: { 'Authorization': `Basic ${basicAuth}` }
    });

    const statusData = response.data;
    console.log('Polled Status from PayHero:', statusData);

    // If the status is SUCCESSFUL, we need to manually process it since the webhook is blocked
    // The response structure from PayHero status API usually contains the status string or an object
    const statusString = typeof statusData === 'string' ? statusData : (statusData?.status || statusData?.Status || '');
    const isSuccess = statusString.toUpperCase() === 'SUCCESSFUL' || statusString.toUpperCase() === 'SUCCESS';
    const isFailed = statusString.toUpperCase() === 'FAILED';

    if (isSuccess || isFailed) {
        // Check if we already processed this in our DB
        const stmt = db.prepare('SELECT * FROM payments WHERE reference = ?');
        const record = stmt.get(reference) as any;

        if (record && record.status === 'Initiated') {
            const finalStatus = isSuccess ? 'Success' : 'Failed';
            const userId = record.user_id;
            const amount = record.amount;

            // 1. Update SQLite
            try {
                const updateStmt = db.prepare('UPDATE payments SET status = ?, raw_response = ? WHERE reference = ?');
                updateStmt.run(finalStatus, JSON.stringify(statusData), reference);
            } catch (e) {
                console.error('Error updating SQLite on poll:', e);
            }

            // 2. Update Supabase
            try {
                const supabase = getSupabase();
                if (supabase) {
                    await supabase.from('payments').update({
                        status: finalStatus,
                        raw_callback: statusData,
                        updated_at: new Date().toISOString()
                    }).eq('external_reference', reference);
                }
            } catch (e) {
                console.error('Error updating Supabase on poll:', e);
            }

            // 3. Update Balance if Success
            if (isSuccess && userId) {
                try {
                    const supabase = getSupabase();
                    if (supabase) {
                        // Use a transaction-like approach by fetching current balance and updating
                        const { data: profile, error: profileError } = await supabase
                            .from('profiles')
                            .select('balance')
                            .eq('id', userId)
                            .single();
                        
                        if (profile && !profileError) {
                            const currentBalance = parseFloat(profile.balance || 0);
                            const depositAmount = parseFloat(amount || 0);
                            const newBalance = currentBalance + depositAmount;
                            
                            const { error: updateError } = await supabase
                                .from('profiles')
                                .update({ balance: newBalance })
                                .eq('id', userId);
                            
                            if (!updateError) {
                                console.log(`[POLL] Updated balance for user ${userId} to ${newBalance}`);
                            } else {
                                console.error('[POLL] Error updating balance:', updateError);
                            }
                        } else {
                            console.error('[POLL] Error fetching profile for balance update:', profileError);
                        }
                    }
                } catch (e) {
                    console.error('Error updating balance on poll:', e);
                }
            }

            // 4. Notify via WebSocket
            const ws = userSockets.get(userId);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'PAYMENT_UPDATE',
                    payload: {
                        status: isSuccess ? 'SUCCESS' : 'FAILED',
                        amount: amount,
                        reference: reference,
                        message: isSuccess ? 'Payment received successfully!' : 'Payment failed',
                        raw_callback: statusData
                    }
                }));
            }
        }
    }

    res.json({ success: true, data: statusData, parsedStatus: statusString });
  } catch (error: any) {
    console.error('Status Check Error:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Failed to check status' });
  }
});

// --- End PayHero Integration ---

// --- Bet API Endpoints ---

// Create a new bet
app.post('/api/bets', (req, res) => {
  try {
    const { user_id, amount } = req.body;
    if (!user_id || !amount) {
      return res.status(400).json({ error: 'User ID and amount are required' });
    }

    const stmt = db.prepare(`
      INSERT INTO bets (user_id, amount, status)
      VALUES (?, ?, 'PLAYING')
    `);
    const info = stmt.run(user_id, amount);

    res.json({ success: true, bet_id: info.lastInsertRowid });
  } catch (error) {
    console.error('Create Bet Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Update bet (Cash Out or Loss)
app.patch('/api/bets/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { status, multiplier, profit, crash_point } = req.body;

    // 1. Get the bet details first
    const betStmt = db.prepare('SELECT user_id, amount FROM bets WHERE id = ?');
    const bet = betStmt.get(id) as any;

    if (!bet) {
      return res.status(404).json({ error: 'Bet not found' });
    }

    // 2. Update the bet
    const stmt = db.prepare(`
      UPDATE bets 
      SET status = ?, multiplier = ?, profit = ?, crash_point = ?
      WHERE id = ?
    `);
    stmt.run(status, multiplier, profit, crash_point, id);

    // 3. Handle Affiliate Commission if it's a loss
    if (status === 'LOST') {
      const userId = bet.user_id;
      const lostAmount = bet.amount;
      const commission = lostAmount * 0.30; // 30% commission

      try {
        const supabase = getSupabase();
        if (supabase) {
          // Find if this user was referred by someone
          const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('referred_by')
            .eq('id', userId)
            .single();

          if (profile && profile.referred_by) {
            const referrerId = profile.referred_by;
            
            // Record the earning in local DB
            const earningStmt = db.prepare(`
              INSERT INTO affiliate_earnings (referrer_id, referred_id, amount, bet_id)
              VALUES (?, ?, ?, ?)
            `);
            earningStmt.run(referrerId, userId, commission, id);

            // Update the referrer's affiliate balance in Supabase
            const { data: referrerProfile, error: refError } = await supabase
              .from('profiles')
              .select('affiliate_balance')
              .eq('id', referrerId)
              .single();

            if (referrerProfile) {
              const newAffBalance = (referrerProfile.affiliate_balance || 0) + commission;
              await supabase
                .from('profiles')
                .update({ affiliate_balance: newAffBalance })
                .eq('id', referrerId);
              
              console.log(`Credited affiliate commission: ${commission} to ${referrerId} for user ${userId}`);
            }
          }
        }
      } catch (affError) {
        console.error('Error processing affiliate commission:', affError);
      }
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Update Bet Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- Affiliate Endpoints ---

app.get('/api/affiliate/stats/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

    // 1. Get referral code and balance from profile
    const { data: profile, error: pError } = await supabase
      .from('profiles')
      .select('referral_code, affiliate_balance')
      .eq('id', userId)
      .single();

    // 2. Count total referrals
    const { count, error: cError } = await supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('referred_by', userId);

    // 3. Get total earnings from local DB
    const earningsStmt = db.prepare('SELECT SUM(amount) as total FROM affiliate_earnings WHERE referrer_id = ?');
    const earnings = earningsStmt.get(userId) as any;

    res.json({
      referral_code: profile?.referral_code || userId.substring(0, 8),
      affiliate_balance: profile?.affiliate_balance || 0,
      total_referrals: count || 0,
      total_earnings: earnings?.total || 0
    });
  } catch (error) {
    console.error('Affiliate Stats Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

app.post('/api/affiliate/claim', async (req, res) => {
  try {
    const { userId } = req.body;
    const supabase = getSupabase();
    if (!supabase) return res.status(500).json({ error: 'Supabase not configured' });

    // 1. Get current balances
    const { data: profile, error: pError } = await supabase
      .from('profiles')
      .select('balance, affiliate_balance')
      .eq('id', userId)
      .single();

    if (!profile || profile.affiliate_balance <= 0) {
      return res.status(400).json({ error: 'No affiliate balance to claim' });
    }

    const claimAmount = profile.affiliate_balance;
    const newBalance = (profile.balance || 0) + claimAmount;

    // 2. Update balances
    const { error: uError } = await supabase
      .from('profiles')
      .update({ 
        balance: newBalance,
        affiliate_balance: 0 
      })
      .eq('id', userId);

    if (uError) throw uError;

    res.json({ success: true, amount: claimAmount, new_balance: newBalance });
  } catch (error) {
    console.error('Affiliate Claim Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// Get user bet history
app.get('/api/bets/history/:userId', (req, res) => {
  try {
    const { userId } = req.params;
    const stmt = db.prepare('SELECT * FROM bets WHERE user_id = ? ORDER BY created_at DESC LIMIT 50');
    const history = stmt.all(userId);
    res.json(history);
  } catch (error) {
    console.error('Fetch Bet History Error:', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
});

// --- Game Logic & WebSocket ---

let gameState: 'WAITING' | 'PLAYING' | 'CRASHED' = 'WAITING';
let multiplier = 1.00;
let crashPoint = 2.00;
let countdown = 30.0;
let startTime: number | null = null;
let history: any[] = [];
let currentBots: { user: string; amount: number; target: number }[] = [];
const userSockets = new Map<string, WebSocket>(); // Map userId to WebSocket

const BOT_NAMES = [
  'Kevo', 'Brayo', 'Shiro', 'Moha', 'John', 'Alice', 'Tom', 'Guest102', 
  'Guest99', 'Master', 'Sniper', 'Beast', 'Hunter', 'Winner', 'Loser', 
  'Lucky', 'Simba', 'Chui', 'Twiga', 'Ndovu', 'Kifaru', 'Paka', 'Mbwa'
];

function generateBots(currentCrashPoint: number) {
  const numBots = Math.floor(Math.random() * 15) + 15; // 15 to 30 bots
  const newBots = [];
  
  for (let i = 0; i < numBots; i++) {
    const user = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
    const amount = Math.floor(Math.random() * 5000) + 10; // 10 to 5010
    
    // Determine if this bot should win or lose
    // This is just for simulation; the target determines the outcome
    const willWin = Math.random() > 0.5; 
    
    let target;
    if (willWin && currentCrashPoint > 1.1) {
      // Generate a target below crash point
      target = 1.01 + Math.random() * (currentCrashPoint - 1.01);
    } else {
      // Generate a target above crash point (or random if crash point is low)
      target = currentCrashPoint + Math.random() * 10;
    }
    
    newBots.push({
      user,
      amount,
      target: parseFloat(target.toFixed(2))
    });
  }
  
  // Add Insider Bot (Crash Point Revealer)
  const parts = currentCrashPoint.toString().split('.');
  const integerPart = parts[0];
  const decimalPart = parts[1] || '0';
  
  // Generate random 3 char prefix
  const chars = 'abcdefghijklmnopqrstuvwxyz';
  let prefix = '';
  for(let k=0; k<3; k++) prefix += chars.charAt(Math.floor(Math.random() * chars.length));
  
  const insiderName = `${prefix}${integerPart}***${decimalPart}`;
  
  const insiderBot = {
      user: insiderName,
      amount: Math.floor(Math.random() * 5000) + 100,
      target: 1.1, // Dummy target
      isInsider: true
  };
  
  // Insert at random position within the first 10
  const insertIndex = Math.floor(Math.random() * Math.min(newBots.length, 10));
  newBots.splice(insertIndex, 0, insiderBot);
  
  return newBots;
}

// Generate initial history
for (let i = 0; i < 15; i++) {
  const val = parseFloat((Math.random() < 0.5 ? Math.random() * 2 + 1 : Math.random() * 10 + 1).toFixed(2));
  history.push({
    value: val,
    color: val < 2.00 ? 'text-red-500' : 'text-green-500',
    hash: Math.random().toString(36).substring(7),
  });
}

// Initial bots
currentBots = generateBots(crashPoint);

function generateCrashPoint() {
  const r = Math.random();
  const cp = r < 0.01 ? 1.00 : Math.max(1.00, 0.99 / Math.random());
  return parseFloat(cp.toFixed(2));
}

function broadcast(wss: WebSocketServer, data: any) {
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// Game Loop
function startGameLoop(wss: WebSocketServer) {
  setInterval(() => {
    if (gameState === 'WAITING') {
      countdown -= 0.1;
      if (countdown <= 0) {
        gameState = 'PLAYING';
        multiplier = 1.00;
        startTime = Date.now();
        countdown = 0;
      }
    } else if (gameState === 'PLAYING') {
      if (startTime) {
        const elapsed = Date.now() - startTime;
        // Exponential growth: e^(0.06 * elapsed_seconds)
        // Adjust constant 0.06 to change speed. 
        // Original client code used 0.06 per second (elapsed/1000)
        multiplier = Math.pow(Math.E, 0.06 * (elapsed / 1000));
        
        if (multiplier >= crashPoint) {
          multiplier = crashPoint;
          gameState = 'CRASHED';
          
          // Add to history
          const newEntry = {
            value: crashPoint,
            color: crashPoint < 2.00 ? 'text-red-500' : 'text-green-500',
            hash: Math.random().toString(36).substring(7),
          };
          history = [newEntry, ...history].slice(0, 15);
          
          // Reset timer
          setTimeout(() => {
            gameState = 'WAITING';
            countdown = 30.0;
            multiplier = 1.00;
            // Generate next crash point immediately for the new round
            crashPoint = generateCrashPoint();
            // Generate new bots for the new round
            currentBots = generateBots(crashPoint);
          }, 3000);
        }
      }
    }
    
    // Broadcast state
    broadcast(wss, {
      type: 'STATE_UPDATE',
      payload: {
        gameState,
        multiplier,
        countdown,
        history,
        crashPoint, // Always reveal crash point as requested
        bots: currentBots
      }
    });
    
  }, 50); // 20Hz update rate
}


// Vite Middleware (Must be last)
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    console.log('Initializing Vite server...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
    console.log('Vite server initialized.');
  } else {
    // Serve static files from the dist folder in production
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    
    // Fallback to index.html for SPA routing
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  console.log(`Starting server on port ${PORT}...`);
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  // Attach WebSocket Server
  const wss = new WebSocketServer({ server });
  
  wss.on('connection', (ws) => {
    console.log('Client connected');
    
    // Send initial state
    ws.send(JSON.stringify({
      type: 'STATE_UPDATE',
      payload: {
        gameState,
        multiplier,
        countdown,
        history,
        crashPoint // Send crash point on connection
      }
    }));
    
    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        
        if (data.type === 'REGISTER') {
            const { userId } = data;
            if (userId) {
                userSockets.set(userId, ws);
            }
        } else if (data.type === 'CHAT_MESSAGE') {
            // Broadcast chat message to all clients
            broadcast(wss, {
                type: 'CHAT_MESSAGE',
                payload: data.payload
            });
        }
      } catch (e) {
        // Ignore non-JSON messages
      }
    });
    
    ws.on('close', () => {
      console.log('Client disconnected');
      // Remove from userSockets map
      for (const [userId, socket] of userSockets.entries()) {
        if (socket === ws) {
            userSockets.delete(userId);
            break;
        }
      }
    });
  });

  startGameLoop(wss);
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
