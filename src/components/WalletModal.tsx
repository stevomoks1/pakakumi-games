import React, { useState } from 'react';
import { X, Send, Clock, Loader2 } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { supabase } from '../lib/supabase';



interface WalletModalProps {
  isOpen: boolean;
  onClose: () => void;
  balance?: number;
  onUpdateBalance?: (newBalance: number) => Promise<void>;
  userId?: string;
  paymentNotification?: { status: 'SUCCESS' | 'FAILED', message: string, amount?: number } | null;
}

export default function WalletModal({ isOpen, onClose, balance = 0, onUpdateBalance, userId, paymentNotification }: WalletModalProps) {
  const [activeTab, setActiveTab] = useState('DEPOSIT');
  const [amount, setAmount] = useState('100');
  const [isWithdrawing, setIsWithdrawing] = useState(false);
  const [isDepositing, setIsDepositing] = useState(false);
  const [withdrawalStatus, setWithdrawalStatus] = useState<'IDLE' | 'PROCESSING' | 'SUCCESS'>('IDLE');
  const [referenceId, setReferenceId] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [depositInitiated, setDepositInitiated] = useState(false);
  const [rawResponse, setRawResponse] = useState<any>(null);
  const [showDebug, setShowDebug] = useState(false);
  const [currentReference, setCurrentReference] = useState<string | null>(null);

  // Effect to handle external payment notifications via WebSocket
  React.useEffect(() => {
    if (paymentNotification) {
        if ((paymentNotification as any).raw_callback) {
            setRawResponse((paymentNotification as any).raw_callback);
        }
        
        const notifStatus = paymentNotification.status?.toUpperCase();
        
        if (notifStatus === 'SUCCESS') {
            setSuccessMessage(`Payment Received! 💰\n\nKES ${paymentNotification.amount?.toLocaleString()} has been added to your wallet.\n\nGood luck!`);
            setDepositInitiated(false);
            setIsDepositing(false);
            setCurrentReference(null);
        } else if (notifStatus === 'FAILED') {
            setError(paymentNotification.message || 'Payment failed.');
            setDepositInitiated(false);
            setIsDepositing(false);
            setCurrentReference(null);
        }
    }
  }, [paymentNotification]);

  // Effect to poll backend for payment status
  React.useEffect(() => {
    let pollInterval: NodeJS.Timeout;
    let attempts = 0;
    const MAX_ATTEMPTS = 60; // 2 minutes at 2s intervals

    if (depositInitiated && currentReference) {
      pollInterval = setInterval(async () => {
        attempts++;
        console.log(`Polling for reference: ${currentReference} (Attempt ${attempts}/${MAX_ATTEMPTS})`);
        
        if (attempts >= MAX_ATTEMPTS) {
          setError('Payment confirmation timed out. Please check your balance.');
          setDepositInitiated(false);
          setIsDepositing(false);
          setCurrentReference(null);
          clearInterval(pollInterval);
          return;
        }

        try {
          const res = await axios.get(`/api/payment/check/${currentReference}`);
          
          if (res.data.success && res.data.payment) {
            const data = res.data.payment;
            const status = data.status?.toUpperCase();
            
            if (data.raw_callback) {
              setRawResponse(data.raw_callback);
            }

            if (status === 'SUCCESS') {
              setSuccessMessage(`Payment Successful! 🎉\n\nPayment completed successfully!\n\nM-Pesa Receipt\n\n${data.mpesa_receipt || 'N/A'}\n\nReference\n\n${currentReference}`);
              setDepositInitiated(false);
              setIsDepositing(false);
              setCurrentReference(null);
              
              // Trigger balance update in parent
              if (userId) {
                const { data: profile } = await supabase
                  .from('profiles')
                  .select('balance')
                  .eq('id', userId)
                  .single();
                  
                if (profile && onUpdateBalance) {
                  onUpdateBalance(profile.balance);
                }
              }
              
              clearInterval(pollInterval);
            } else if (status === 'FAILED' || status === 'CANCELLED') {
              setError(data.result_desc || 'Payment failed or was cancelled.');
              setDepositInitiated(false);
              setIsDepositing(false);
              setCurrentReference(null);
              clearInterval(pollInterval);
            }
            // If status is 'pending' or 'initiated', continue polling
          }
        } catch (err) {
          console.error("Polling exception:", err);
        }
      }, 2000); // Poll every 2 seconds
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [depositInitiated, currentReference, userId, onUpdateBalance]);

  if (!isOpen) return null;

  const validatePhoneNumber = (phone: string) => {
    // Kenyan phone number validation: 07..., 01..., 2547..., 2541...
    const regex = /^(?:254|\+254|0)?([17](?:(?:[0-9][0-9])|(?:0[0-8])|(4[0-1]))[0-9]{6})$/;
    return regex.test(phone);
  };

  const fetchPaymentRecord = (reference: string) => {
    let elapsed = 0;
    const interval = setInterval(async () => {
      elapsed += 2000;
      try {
        console.log(`Polling payment record for reference: ${reference} (${elapsed / 1000}s)`);
        const { data, error } = await supabase
          .from('payments')
          .select('*')
          .eq('external_reference', reference)
          .maybeSingle();

        if (error) {
          console.error('Error fetching payment record:', error);
        } else if (data) {
          console.log('Payment record fetched:', data);
          
          const status = data.status?.toUpperCase();
          if (status === 'SUCCESS') {
            const phone = data.phone_number || data.raw_callback?.response?.Phone || 'N/A';
            const formattedDate = new Date(data.updated_at).toLocaleString();
            setSuccessMessage(`${reference}\n${data.status}\n${phone}\nKES ${data.amount}\nReceipt: ${data.mpesa_receipt || 'N/A'}\n\n${data.result_desc || 'The service request is processed successfully.'}\n\n${formattedDate}`);
            setDepositInitiated(false);
            setIsDepositing(false);
            setCurrentReference(null);
            clearInterval(interval);
          } else if (status === 'FAILED' || status === 'CANCELLED') {
            setError(`Payment Failed! ❌\n\nPayment was not completed.\n\nReason: ${data.result_desc || 'Unknown error'}\n\nReference: ${reference}`);
            setDepositInitiated(false);
            setIsDepositing(false);
            setCurrentReference(null);
            clearInterval(interval);
          }
        }
      } catch (err) {
        console.error('Exception fetching payment record:', err);
      }

      if (elapsed >= 60000) {
        clearInterval(interval);
        console.log('Polling stopped after 60 seconds.');
      }
    }, 2000);
  };

  const handleDeposit = async () => {
    const depositAmount = parseFloat(amount);

    if (isNaN(depositAmount) || depositAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    if (!validatePhoneNumber(phoneNumber)) {
      setError('Please enter a valid Kenyan phone number (e.g., 0712345678).');
      return;
    }

    setIsDepositing(true);
    setError(null);
    setRawResponse(null);

    try {
      const res = await axios.post('/api/pay', {
        phone_number: phoneNumber,
        amount: depositAmount,
        user_id: userId
      });

      setRawResponse(res.data);
      console.log('API Response:', res.data);

      if (res.data.success) {
        toast.success('STK Push sent! Check your phone.');
        setDepositInitiated(true);
        if (res.data.reference) {
            setCurrentReference(res.data.reference);
            fetchPaymentRecord(res.data.reference);
        }
        // We don't clear successMessage here, we use the UI state
      } else {
        throw new Error(res.data.message || 'Deposit initiation failed');
      }
    } catch (err: any) {
      console.error(err);
      const responseData = err.response?.data;
      if (responseData) {
        setRawResponse(responseData);
      }
      const errorMessage = responseData?.message || err.message || 'Failed to initiate deposit.';
      setError(errorMessage);
      toast.error(errorMessage);
      setIsDepositing(false); // Only stop loading on error, otherwise wait for callback
    }
  };

  const handleWithdraw = async () => {
    const withdrawAmount = parseFloat(amount);
    
    if (isNaN(withdrawAmount) || withdrawAmount <= 0) {
      setError('Please enter a valid amount.');
      return;
    }

    if (withdrawAmount < 100) {
        setError('Minimum withdrawal amount is KES 100');
        return;
    }

    if (withdrawAmount > balance) {
      setError('Insufficient balance.');
      return;
    }

    setIsWithdrawing(true);
    setWithdrawalStatus('PROCESSING');
    setError(null);
    
    try {
        // Call backend to record withdrawal
        const res = await axios.post('/api/withdraw', {
            user_id: userId,
            amount: withdrawAmount,
            phone_number: phoneNumber || '' // Use phone number if available
        });

        if (res.data.success) {
            setReferenceId(res.data.reference);
            
            // Update local balance
            const newBalance = balance - withdrawAmount;
            if (onUpdateBalance) {
                await onUpdateBalance(newBalance);
            }

            setSuccessMessage(`Success!\nWithdrawal Request Received! 💸\n\nYou've played like a pro! Your KES ${withdrawAmount.toLocaleString()} is being processed and will hit your M-Pesa within 24 hours.\n\nThe next big win is just a bet away—keep the momentum going!`);
            setAmount('100');
            setWithdrawalStatus('SUCCESS');
        } else {
            throw new Error(res.data.message || 'Withdrawal failed');
        }
    } catch (err: any) {
        setError(err.message || 'Withdrawal failed. Please try again.');
        setWithdrawalStatus('IDLE');
        console.error(err);
    } finally {
        setIsWithdrawing(false);
    }
  };

  const tabs = ['DEPOSIT', 'WITHDRAW'];

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#3b3b3b] w-full max-w-xl rounded-xl shadow-2xl overflow-hidden relative border border-[#4a4a4a] my-auto">
        {/* Close Button */}
        <button 
          onClick={() => {
              onClose();
              setWithdrawalStatus('IDLE');
              setSuccessMessage(null);
              setRawResponse(null);
          }}
          className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors z-10 p-2"
        >
          <X size={24} />
        </button>

        {/* Header */}
        <div className="pt-6 pb-2">
          <h2 className="text-2xl font-black text-white w-full text-center tracking-tight">Wallet</h2>
        </div>

        {/* Tabs */}
        <div className="flex justify-center border-b border-[#4a4a4a] px-4 md:px-8 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => {
                setActiveTab(tab);
                setWithdrawalStatus('IDLE');
                setSuccessMessage(null);
              }}
              className={`px-3 md:px-4 py-3 text-[10px] md:text-[11px] font-black tracking-widest transition-all relative whitespace-nowrap ${
                activeTab === tab 
                  ? 'text-white' 
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {tab}
              {activeTab === tab && (
                <div className="absolute bottom-0 left-0 right-0 h-[3px] bg-white rounded-t-full"></div>
              )}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="p-6 md:p-10">
          {successMessage ? (
            <div className="text-center space-y-6 py-4">
              <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto border-2 border-green-500/50">
                <Send size={32} className="text-green-500 rotate-[-45deg]" />
              </div>
              <div className="space-y-2">
                <h3 className="text-2xl font-black text-white uppercase tracking-tight">Success!</h3>
                <p className="text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                  {successMessage}
                </p>
              </div>
              <button 
                onClick={() => {
                  setSuccessMessage(null);
                  setWithdrawalStatus('IDLE');
                  setDepositInitiated(false);
                  onClose();
                }}
                className="w-full bg-[#444444] hover:bg-[#555555] text-white font-black py-4 rounded-xl transition-all text-lg uppercase tracking-widest border-b-4 border-[#222222]"
              >
                CLOSE
              </button>
            </div>
          ) : depositInitiated ? (
            <div className="text-center space-y-6 py-4">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 border-4 border-yellow-500/20 rounded-full"></div>
                <div className="absolute inset-0 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl">📱</span>
                </div>
              </div>
              <div className="space-y-2">
                <h3 className="text-xl font-black text-white uppercase tracking-tight">Check Your Phone</h3>
                <p className="text-gray-300 text-sm leading-relaxed">
                  We've sent an M-Pesa prompt to <b>{phoneNumber}</b>.
                  <br/>
                  Please enter your PIN to complete the deposit.
                </p>
              </div>
              <div className="bg-[#2b2b2b] p-4 rounded-lg border border-[#4a4a4a]">
                 <p className="text-xs text-gray-400 animate-pulse">Waiting for confirmation...</p>
              </div>

              {rawResponse && (
                <div className="mt-4">
                  <button 
                    onClick={() => setShowDebug(!showDebug)}
                    className="text-[10px] text-gray-500 hover:text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1 mx-auto"
                  >
                    {showDebug ? 'Hide' : 'Show'} PayHero Response
                  </button>
                  
                  {showDebug && (
                    <div className="mt-2 p-3 bg-black/40 rounded-lg border border-white/10 overflow-x-auto text-left">
                      <pre className="text-[10px] text-green-400 font-mono">
                        {JSON.stringify(rawResponse, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}

              <button 
                onClick={() => {
                    setDepositInitiated(false);
                    setIsDepositing(false);
                    setCurrentReference(null);
                }}
                className="text-sm text-red-400 hover:text-red-300 underline"
              >
                Cancel / Try Again
              </button>
            </div>
          ) : activeTab === 'DEPOSIT' ? (
            <div className="space-y-6">
              <div>
                <label className="block text-white text-sm font-bold mb-3">Deposit Amount (KES)</label>
                <input
                  type="text"
                  value={amount}
                  onChange={(e) => {
                    setAmount(e.target.value);
                    setError(null);
                  }}
                  className={`w-full bg-[#2b2b2b] border-2 ${error && !amount ? 'border-red-500' : 'border-[#555555]'} text-white px-5 py-4 rounded-xl text-xl font-bold focus:outline-none focus:border-white/40 transition-colors`}
                  placeholder="Enter amount"
                />
              </div>
              
              <div>
                <label className="block text-white text-sm font-bold mb-3">Phone Number</label>
                <input
                  type="text"
                  value={phoneNumber}
                  onChange={(e) => {
                    setPhoneNumber(e.target.value);
                    setError(null);
                  }}
                  placeholder="07..."
                  className={`w-full bg-[#2b2b2b] border-2 ${error && !phoneNumber ? 'border-red-500' : 'border-[#555555]'} text-white px-5 py-4 rounded-xl text-xl font-bold focus:outline-none focus:border-white/40 transition-colors`}
                />
              </div>

              {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}

              <button 
                onClick={handleDeposit}
                disabled={isDepositing}
                className="w-full bg-gradient-to-b from-green-500 to-green-600 hover:from-green-400 hover:to-green-500 text-white font-black py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all text-xl uppercase tracking-widest border-b-4 border-green-800 active:border-b-0 active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isDepositing ? (
                  <>
                    <Loader2 size={22} className="animate-spin" />
                    PROCESSING...
                  </>
                ) : (
                  <>
                    <Send size={22} className="rotate-[-45deg] translate-y-[-2px]" />
                    PAY NOW
                  </>
                )}
              </button>
              
              <p className="text-center text-xs text-gray-400 italic">
                Secure payment via PayHero M-Pesa STK Push.
              </p>

              {rawResponse && (
                <div className="mt-4">
                  <button 
                    onClick={() => setShowDebug(!showDebug)}
                    className="text-[10px] text-gray-500 hover:text-gray-400 font-bold uppercase tracking-widest flex items-center gap-1"
                  >
                    {showDebug ? 'Hide' : 'Show'} PayHero Response
                  </button>
                  
                  {showDebug && (
                    <div className="mt-2 p-3 bg-black/40 rounded-lg border border-white/10 overflow-x-auto">
                      <pre className="text-[10px] text-green-400 font-mono">
                        {JSON.stringify(rawResponse, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : activeTab === 'WITHDRAW' ? (
            withdrawalStatus === 'PROCESSING' ? (
                <div className="text-center py-8 space-y-6">
                    <h3 className="text-xl font-bold text-white">Processing Withdrawal</h3>
                    <p className="text-gray-400 text-sm">Please wait while we process your request</p>
                    
                    <div className="relative w-20 h-20 mx-auto">
                        {/* Spinner */}
                        <div className="absolute inset-0 border-4 border-[#4ea1f3]/20 rounded-full"></div>
                        <div className="absolute inset-0 border-4 border-[#4ea1f3] border-t-transparent rounded-full animate-spin"></div>
                        <div className="absolute inset-0 flex items-center justify-center">
                        <Clock size={24} className="text-[#4ea1f3]" />
                        </div>
                    </div>
                    
                    <div className="space-y-2">
                        <h4 className="text-lg font-bold text-white">Processing Payment...</h4>
                        <p className="text-gray-400 text-xs max-w-xs mx-auto">
                        Your funds are being transferred to your M-Pesa account.
                        </p>
                    </div>
                    
                    <div className="bg-[#2b2b2b] rounded-lg p-3 flex justify-between items-center text-xs mt-8">
                        <span className="text-gray-500 font-bold uppercase tracking-widest">REFERENCE</span>
                        <span className="text-[#4ea1f3] font-bold uppercase tracking-widest">{referenceId}</span>
                    </div>
                </div>
            ) : (
                <div className="space-y-6">
                <div>
                    <label className="block text-white text-sm font-bold mb-3">Amount (KES)</label>
                    <div className="relative">
                    <input
                        type="text"
                        value={amount}
                        onChange={(e) => {
                        setAmount(e.target.value);
                        setError(null);
                        }}
                        className={`w-full bg-[#2b2b2b] border-2 ${error ? 'border-red-500' : 'border-[#555555]'} text-white px-5 py-4 rounded-xl text-xl font-bold focus:outline-none focus:border-white/40 transition-colors`}
                    />
                    </div>
                    {error && <p className="mt-2 text-red-500 text-xs font-bold">{error}</p>}
                    <p className="mt-3 text-gray-400 text-xs font-medium">
                    Available Balance KES {Number(balance).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}. All transactions are subject to 5% tax.
                    </p>
                </div>

                <button 
                    onClick={handleWithdraw}
                    disabled={isWithdrawing}
                    className="w-full bg-gradient-to-b from-[#4ea1f3] to-[#2575fc] hover:from-[#5eb1ff] hover:to-[#3585ff] text-white font-black py-4 rounded-xl flex items-center justify-center gap-3 shadow-lg transition-all text-xl uppercase tracking-widest border-b-4 border-[#1a56b8] active:border-b-0 active:translate-y-[2px] disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    <Send size={22} className="rotate-[-45deg] translate-y-[-2px]" />
                    WITHDRAW
                </button>
                </div>
            )
          ) : null}
        </div>
      </div>
    </div>
  );
}
