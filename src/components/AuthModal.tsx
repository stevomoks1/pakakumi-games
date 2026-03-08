import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import TermsModal from './TermsModal';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode: 'login' | 'register';
}

export default function AuthModal({ isOpen, onClose, initialMode }: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [isTermsOpen, setIsTermsOpen] = useState(false);

  useEffect(() => {
    const savedRef = localStorage.getItem('referral_code');
    if (savedRef) {
      setReferralCode(savedRef);
    }
  }, [isOpen]);

  useEffect(() => {
    setMode(initialMode);
    setError(null);
  }, [initialMode]);

  const toggleMode = (newMode: 'login' | 'register') => {
    setMode(newMode);
    setError(null);
  };

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (mode === 'register') {
        if (!termsAccepted) {
          throw new Error('You must accept the Terms and Conditions to register.');
        }
        if (phone.length !== 9) {
          throw new Error('Please enter a valid 9-digit phone number.');
        }

        // Check if phone number already exists in profiles table
        // Note: This requires a 'profiles' table with a 'phone_number' column
        const { data: existingPhone, error: phoneError } = await supabase
          .from('profiles')
          .select('phone_number')
          .eq('phone_number', `+254${phone}`)
          .maybeSingle();

        if (phoneError && phoneError.code !== 'PGRST116') { // PGRST116 is "no rows found" for single()
          console.error('Error checking phone number:', phoneError);
        }

        if (existingPhone) {
          throw new Error('This phone number is already registered with another account.');
        }

        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              phone_number: `+254${phone}`,
              referral_code: referralCode
            }
          }
        });
        
        if (error) throw error;

        // Check if user already exists (Supabase returns success but empty identities if enumeration protection is on)
        if (data.user && data.user.identities && data.user.identities.length === 0) {
          throw new Error('User already exists with this email address.');
        }

        // Optional: Create profile entry if it doesn't exist
        // This helps with the phone number uniqueness check above
        if (data.user) {
          // Find the referrer if code is provided
          let referredById = null;
          if (referralCode) {
            const { data: referrer } = await supabase
              .from('profiles')
              .select('id')
              .eq('referral_code', referralCode)
              .maybeSingle();
            if (referrer) {
              referredById = referrer.id;
            }
          }

          const myReferralCode = Math.random().toString(36).substring(2, 8).toUpperCase();

          // Note: We store email in auth.users, but if the profiles table has an email column, we store it there too.
          // Based on our check, the profiles table only has: id, phone_number, balance, created_at
          // We will try to upsert what we can.
          const profileData: any = {
            id: data.user.id,
            phone_number: `+254${phone}`,
            balance: 0.00,
          };

          // If the user has added these columns, they will be saved. 
          // If not, Supabase will ignore them if we use a flexible approach or fail if strict.
          // To be safe and follow the user's request to "make sure each field is stored in the correct column",
          // we include them here. If they are missing from the DB, the user needs to add them.
          profileData.referral_code = myReferralCode;
          profileData.referred_by = referredById;
          profileData.affiliate_balance = 0.00;
          // Note: 'email' column is also often desired in profiles for easier querying
          profileData.email = email;

          const { error: upsertError } = await supabase.from('profiles').upsert(profileData);
          
          if (upsertError) {
            console.error('Profile upsert error:', upsertError);
            // If it fails because of missing columns, try a fallback with only known columns
            if (upsertError.message.includes('column') && upsertError.message.includes('does not exist')) {
              await supabase.from('profiles').upsert({
                id: data.user.id,
                phone_number: `+254${phone}`,
                balance: 0.00
              });
            }
          }
          
          // Clear saved referral code after use
          localStorage.removeItem('referral_code');
        }

        alert('Registration successful! Please login.');
        toggleMode('login');
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#4a4a4a] w-full max-w-md rounded-lg shadow-2xl overflow-hidden relative">
        {/* Close Button */}
        <button 
          onClick={onClose}
          className="absolute top-4 right-4 text-white hover:text-gray-300 font-bold text-xl leading-none"
        >
          ×
        </button>

        <div className="p-8">
          <h2 className="text-2xl font-bold text-white text-center mb-6">
            {mode === 'login' ? 'Log Into Pakakumi' : 'Sign Up Instantly'}
          </h2>

          {error && (
            <div className="bg-red-500/20 border border-red-500 text-red-100 p-3 rounded mb-4 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'register' && (
              <div>
                <label className="block text-white text-sm mb-1">Phone number</label>
                <div className="flex">
                  <div className="bg-[#555555] border border-gray-400 border-r-0 rounded-l px-4 py-2 text-white flex items-center justify-center font-bold">
                    +254
                  </div>
                  <input
                    type="text"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="flex-1 bg-[#f0f4f8] text-black px-3 py-2 rounded-r focus:outline-none"
                    required={mode === 'register'}
                  />
                </div>
                <p className="text-xs text-white mt-1 leading-tight">
                  Please enter a valid Safaricom MPESA number. All deposits & withdrawals will be made through this number
                </p>
              </div>
            )}

            <div>
              <label className="block text-white text-sm mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-[#555555] border border-gray-400 text-white px-3 py-2 rounded focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
                placeholder="email@example.com"
                required
              />
            </div>

            <div>
              <label className="block text-white text-sm mb-1">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-[#555555] border border-gray-400 text-white px-3 py-2 rounded focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
                required
              />
            </div>

            {mode === 'register' && (
              <div>
                <label className="block text-white text-sm mb-1">Referral Code (optional)</label>
                <input
                  type="text"
                  value={referralCode}
                  onChange={(e) => setReferralCode(e.target.value)}
                  className="w-full bg-[#555555] border border-gray-400 text-white px-3 py-2 rounded focus:outline-none focus:border-[#3b82f6] focus:ring-1 focus:ring-[#3b82f6]"
                />
              </div>
            )}

            {mode === 'register' && (
              <div className="flex items-start gap-2 py-2">
                <input
                  id="terms"
                  type="checkbox"
                  checked={termsAccepted}
                  onChange={(e) => setTermsAccepted(e.target.checked)}
                  className="mt-1 w-4 h-4 rounded border-gray-400 bg-[#555555] text-[#f58b2b] focus:ring-[#f58b2b]"
                />
                <label htmlFor="terms" className="text-xs text-white leading-tight cursor-pointer">
                  I agree to the <button type="button" onClick={() => setIsTermsOpen(true)} className="text-[#f58b2b] hover:underline">Terms and Conditions</button> and I am at least 18 years old.
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className={`w-full bg-gradient-to-b from-[#4ea1f3] to-[#2575fc] hover:from-[#5eb1ff] hover:to-[#3585ff] text-white font-bold py-3 rounded mt-2 shadow-lg transition-all ${
                loading ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Processing...' : (mode === 'login' ? 'LOGIN' : 'JOIN PAKAKUMI')}
            </button>

            {mode === 'login' && (
              <div className="text-right mt-2">
                <a href="#" className="text-[#f58b2b] text-sm hover:underline">Forgot Password?</a>
              </div>
            )}
          </form>

          <div className="mt-6 text-center text-sm text-white">
            {mode === 'login' ? (
              <p>
                You don't have an account? <button onClick={() => toggleMode('register')} className="text-[#f58b2b] hover:underline">Sign Up now</button>
              </p>
            ) : (
              <p>
                Already have an account? <button onClick={() => toggleMode('login')} className="text-[#f58b2b] hover:underline">Login</button>
              </p>
            )}
          </div>
        </div>
      </div>
      
      <TermsModal isOpen={isTermsOpen} onClose={() => setIsTermsOpen(false)} />
    </div>
  );
}
