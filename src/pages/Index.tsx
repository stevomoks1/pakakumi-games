import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Phone, Settings, Wallet, Users, MessageSquare, Power, Send, X, Menu } from 'lucide-react';
import AuthModal from '@/components/AuthModal';
import WalletModal from '@/components/WalletModal';
import FAQModal from '@/components/FAQModal';
import axios from 'axios';
import { supabase } from '@/lib/supabase';

export default function Index() {
  const navigate = useNavigate();
  const [gameState, setGameState] = useState('WAITING'); // WAITING, PLAYING, CRASHED
  const [multiplier, setMultiplier] = useState(1.00);
  const [crashPoint, setCrashPoint] = useState<number>(0);
  const [countdown, setCountdown] = useState(30.0);
  const [liveBets, setLiveBets] = useState<{user: string, amount: number, target?: number, isStevo?: boolean, isCrashPoint?: boolean, isInsider?: boolean}[]>([]);
  
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isFAQModalOpen, setIsFAQModalOpen] = useState(false);
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false);

  // Betting State (Restored)
  const [currentBet, setCurrentBet] = useState<{ id?: number, amount: number, target: number, cashedOut: boolean, profit?: number, cashOutAt?: number, isAuto?: boolean } | null>(null);
  const [autoCashout, setAutoCashout] = useState('2');
  const [autoCashoutEnabled, setAutoCashoutEnabled] = useState(false);
  const [autoBetEnabled, setAutoBetEnabled] = useState(false);
  const isCashingOut = useRef(false);
  const isPlacingBet = useRef(false);
  const isCancellingBet = useRef(false);
  
  // Refs for accessing state inside WebSocket callback without dependencies
  const currentBetRef = useRef(currentBet);
  const autoCashoutEnabledRef = useRef(autoCashoutEnabled);
  const handleCashOutRef = useRef<((atMultiplier?: number) => Promise<void>) | null>(null);
  const userIdentifierRef = useRef<string>('');
  const userIdRef = useRef<string | null>(null);
  const serverStartTimeRef = useRef<number | null>(null);
  const gameStateRef = useRef(gameState);

  useEffect(() => {
    gameStateRef.current = gameState;
  }, [gameState]);

  useEffect(() => {
    let animationFrameId: number;
    
    const updateLocalMultiplier = () => {
      if (gameStateRef.current === 'PLAYING' && serverStartTimeRef.current !== null) {
        const elapsed = Date.now() - serverStartTimeRef.current;
        const localMultiplier = Math.pow(Math.E, 0.06 * (elapsed / 1000));
        const rounded = Number(localMultiplier.toFixed(2));
        
        setMultiplier(prev => {
            // Only update if it's actually different to avoid unnecessary renders
            return rounded !== prev ? rounded : prev;
        });

        // Local Auto Cashout Check
        const bet = currentBetRef.current;
        const autoEnabled = autoCashoutEnabledRef.current;
        if (bet && !bet.cashedOut && autoEnabled && bet.target > 0 && rounded >= bet.target) {
           if (handleCashOutRef.current) {
             handleCashOutRef.current(bet.target);
           }
        }
      }
      animationFrameId = requestAnimationFrame(updateLocalMultiplier);
    };
    
    animationFrameId = requestAnimationFrame(updateLocalMultiplier);
    return () => cancelAnimationFrame(animationFrameId);
  }, []);
  
  // WebSocket Connection
  const ws = useRef<WebSocket | null>(null);
  const [paymentNotification, setPaymentNotification] = useState<{status: 'SUCCESS' | 'FAILED', message: string, amount?: number} | null>(null);

  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [betError, setBetError] = useState<string | null>(null);

  useEffect(() => {
      currentBetRef.current = currentBet;
      autoCashoutEnabledRef.current = autoCashoutEnabled;
      handleCashOutRef.current = handleCashOut;
      userIdentifierRef.current = profile?.phone_number || user?.email?.split('@')[0] || '';
      userIdRef.current = user?.id || null;
  }); // Update on every render

  // Dedicated effect for WebSocket registration to prevent spamming
  useEffect(() => {
    if (ws.current?.readyState === WebSocket.OPEN && user?.id) {
        ws.current.send(JSON.stringify({ type: 'REGISTER', userId: user.id }));
    }
  }, [user?.id]);

  useEffect(() => {
    // Connect to WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}`;
    
    ws.current = new WebSocket(wsUrl);

    ws.current.onopen = () => {
      console.log('Connected to Game Server');
      // Register immediately if user is already known
      if (user?.id) {
          ws.current?.send(JSON.stringify({ type: 'REGISTER', userId: user.id }));
      }
    };

    ws.current.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        if (data.type === 'PAYMENT_UPDATE') {
            setPaymentNotification(data.payload);
            // Refresh balance if success
            if (data.payload.status === 'SUCCESS' && userIdRef.current) {
                fetchProfile(userIdRef.current);
            }
        } else if (data.type === 'STATE_UPDATE') {
          const { gameState: newGameState, multiplier: newMultiplier, countdown: newCountdown, history: newHistory, crashPoint: serverCrashPoint, bots } = data.payload;
          
          setGameState(newGameState);
          setCountdown(newCountdown);
          if (Array.isArray(newHistory)) setHistory(newHistory);
          
          if (newGameState === 'PLAYING') {
            // Sync server start time
            // ln(multiplier) / 0.06 = elapsed_seconds
            const elapsedSeconds = Math.log(newMultiplier) / 0.06;
            serverStartTimeRef.current = Date.now() - (elapsedSeconds * 1000);
          } else {
            serverStartTimeRef.current = null;
            setMultiplier(newMultiplier);
          }
          
          // Construct the new Live Bets list
          setLiveBets(prev => {
              const newBets: any[] = [];
              
              // 1. Add User's Bet (preserve from previous state)
              const myBet = prev.find(b => b.isStevo);
              if (myBet) {
                  newBets.push(myBet);
              }
              
              // 2. Add Bots (from server)
              if (Array.isArray(bots)) {
                  newBets.push(...bots);
              }
              
              // 3. Add Hidden User (Crash Point)
              if (serverCrashPoint) {
                  setCrashPoint(serverCrashPoint);
                  newBets.push({
                    user: 'Hidden', 
                    amount: 0, 
                    target: serverCrashPoint,
                    isCrashPoint: true
                  });
              }
              
              return newBets;
          });
          
          // Handle CRASHED state logic locally for user's bet
          if (newGameState === 'CRASHED') {
             // Use ref to get latest currentBet
             const bet = currentBetRef.current;
             if (bet && !bet.cashedOut) {
                 // It's a loss - mark it with profit property (negative)
                 setCurrentBet(prev => prev ? { ...prev, cashedOut: false, profit: -prev.amount } : null);
                 
                 // Update bet in DB as LOST
                 if (bet.id) {
                     axios.patch(`/api/bets/${bet.id}`, {
                         status: 'LOST',
                         multiplier: newMultiplier,
                         profit: -bet.amount,
                         crash_point: serverCrashPoint
                     }).then(() => {
                       if (userIdRef.current) fetchBetHistory(userIdRef.current);
                     }).catch(err => console.error('Error updating lost bet:', err));
                 }
             }
             
             // Reset current bet after a delay (handled by server state change to WAITING)
          } else if (newGameState === 'WAITING') {
             // Reset for new round
             const currentBet = currentBetRef.current;
             
             if (!currentBet || typeof currentBet.profit !== 'undefined') {
                 setCurrentBet(null);
             }
             
             isCashingOut.current = false;
             isPlacingBet.current = false;
          }
        } else if (data.type === 'CHAT_MESSAGE') {
          setChatMessages(prev => [...prev, data.payload]);
        }
      } catch (e) {
        console.error('Error parsing WS message', e);
      }
    };

    ws.current.onclose = () => {
      console.log('Disconnected from Game Server');
    };

    return () => {
      ws.current?.close();
    };
  }, []); // Empty dependency array = stable connection

  const [history, setHistory] = useState<any[]>([]);
  const [betHistory, setBetHistory] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState('CHAT');
  const [affiliateStats, setAffiliateStats] = useState<{
    referral_code: string;
    affiliate_balance: number;
    total_referrals: number;
    total_earnings: number;
  } | null>(null);
  const [isClaiming, setIsClaiming] = useState(false);
  
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isWalletModalOpen, setIsWalletModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

  // Clear bet error after 3 seconds
  useEffect(() => {
    if (betError) {
      const timer = setTimeout(() => setBetError(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [betError]);

  // Betting Panel State
  const [betAmount, setBetAmount] = useState('10');

  const fetchAffiliateStats = async (uid: string) => {
    try {
      const res = await axios.get(`/api/affiliate/stats/${uid}`);
      setAffiliateStats(res.data);
    } catch (err) {
      console.error('Error fetching affiliate stats:', err);
    }
  };

  const handleClaimAffiliate = async () => {
    if (!user?.id || isClaiming) return;
    setIsClaiming(true);
    try {
      const res = await axios.post('/api/affiliate/claim', { userId: user.id });
      if (res.data.success) {
        setProfile((prev: any) => prev ? { ...prev, balance: res.data.new_balance } : null);
        fetchAffiliateStats(user.id);
        alert(`Successfully claimed KES ${res.data.amount}!`);
      }
    } catch (err: any) {
      alert(err.response?.data?.error || 'Failed to claim balance');
    } finally {
      setIsClaiming(false);
    }
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (!error) {
        setProfile(data);
        fetchBetHistory(userId);
        fetchAffiliateStats(userId);
      }
    } catch (err) {
      console.error('Error fetching profile:', err);
    }
  };

  const fetchBetHistory = async (userId: string) => {
    try {
      const res = await axios.get(`/api/bets/history/${userId}`);
      setBetHistory(res.data);
    } catch (err) {
      console.error('Error fetching bet history:', err);
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }
    });

    // Capture referral code from URL
    const urlParams = new URLSearchParams(window.location.search);
    const ref = urlParams.get('ref');
    if (ref) {
      localStorage.setItem('referral_code', ref);
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      if (currentUser) {
        fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const updateBalance = async (newBalance: number) => {
    if (!user || isNaN(newBalance)) return;
    const { error } = await supabase
      .from('profiles')
      .update({ balance: newBalance })
      .eq('id', user.id);
    
    if (error) {
      console.error('Error updating balance:', error);
      return;
    }
    
    setProfile(prev => ({ ...prev, balance: newBalance }));
  };

  const handlePlaceBet = async (isAuto = false) => {
    if (!user) {
      if (!isAuto) navigate('/login');
      return;
    }
    if (!profile || (gameState !== 'WAITING' && gameState !== 'CRASHED') || currentBet || isPlacingBet.current) return;
    
    isPlacingBet.current = true;
    
    const amount = parseFloat(betAmount);
    const target = autoCashoutEnabled ? parseFloat(autoCashout) : 0;
    
    if (isNaN(amount) || amount <= 0) {
      if (!isAuto) setBetError('Invalid bet amount');
      isPlacingBet.current = false;
      return;
    }

    if (amount > 3000) {
      if (!isAuto) setBetError('Max bet is KES 3,000');
      isPlacingBet.current = false;
      return;
    }

    if (amount > profile.balance) {
      if (!isAuto) setBetError('Insufficient balance');
      isPlacingBet.current = false;
      return;
    }

    const previousBalance = profile.balance;
    const newBalance = previousBalance - amount;
    const userIdentifier = profile.phone_number || user.email?.split('@')[0];

    // Optimistic Updates
    setProfile(prev => ({ ...prev, balance: newBalance }));
    const bet = { amount, target, cashedOut: false, isAuto };
    setCurrentBet(bet);
    currentBetRef.current = bet;
    
    setLiveBets(prev => [{ 
      user: userIdentifier, 
      amount, 
      target: isNaN(target) || target === 0 ? undefined : target,
      isStevo: true
    }, ...prev]);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ balance: newBalance })
        .eq('id', user.id);
      
      if (error) throw error;

      const betRes = await axios.post('/api/bets', {
        user_id: user.id,
        amount: amount
      });

      if (betRes.data.success) {
        setCurrentBet(prev => prev ? { ...prev, id: betRes.data.bet_id } : null);
        fetchBetHistory(user.id);
      }
    } catch (error) {
      console.error('Bet placement error:', error);
      setProfile(prev => ({ ...prev, balance: previousBalance }));
      setCurrentBet(null);
      currentBetRef.current = null;
      setLiveBets(prev => prev.filter(b => !(b.isStevo && b.amount === amount)));
      if (!isAuto) alert('Failed to place bet. Please try again.');
    } finally {
      isPlacingBet.current = false;
    }
  };

  const handleCancelBet = async () => {
    if (!user || !profile || gameState !== 'WAITING' || !currentBet || isCancellingBet.current) return;
    
    isCancellingBet.current = true;
    try {
      const refundAmount = currentBet.amount;
      const newBalance = profile.balance + refundAmount;
      await updateBalance(newBalance);
      
      const userIdentifier = profile.phone_number || user.email?.split('@')[0];
      
      setLiveBets(prev => {
        const index = prev.findIndex(bet => bet.user === userIdentifier && bet.amount === currentBet.amount);
        if (index !== -1) {
          const newList = [...prev];
          newList.splice(index, 1);
          return newList;
        }
        return prev;
      });

      setCurrentBet(null);
    } catch (error) {
      console.error('Cancel bet error:', error);
    } finally {
      isCancellingBet.current = false;
    }
  };

  const handleCashOut = async (atMultiplier?: number) => {
    if (!user || !profile || gameState !== 'PLAYING' || !currentBet || currentBet.cashedOut || isCashingOut.current) return;
    
    isCashingOut.current = true;
    try {
      const cashOutMult = typeof atMultiplier === 'number' ? atMultiplier : multiplier;
      const profit = currentBet.amount * cashOutMult;
      const newBalance = profile.balance + profit;
      
      await updateBalance(newBalance);
      
      setCurrentBet(prev => prev ? { ...prev, cashedOut: true, profit, cashOutAt: cashOutMult } : null);

      if (currentBet.id) {
        await axios.patch(`/api/bets/${currentBet.id}`, {
            status: 'CASHED_OUT',
            multiplier: cashOutMult,
            profit: profit
        });
        fetchBetHistory(user.id);
      }

      setLiveBets(prev => prev.map(bet => {
        const userIdentifier = profile.phone_number || user.email?.split('@')[0];
        if (bet.user === userIdentifier && (!bet.target || bet.target !== cashOutMult)) {
          return { ...bet, target: cashOutMult };
        }
        return bet;
      }));
    } catch (error) {
      console.error('Cashout error:', error);
    } finally {
      isCashingOut.current = false;
    }
  };

  const handleLogout = () => {
    setIsLogoutConfirmOpen(true);
  };

  const confirmLogout = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setIsLogoutConfirmOpen(false);
  };

  useEffect(() => {
    let timeoutId: NodeJS.Timeout;
    if (autoBetEnabled && gameState === 'WAITING' && !currentBet && !isPlacingBet.current) {
      timeoutId = setTimeout(() => {
        handlePlaceBet(true);
      }, 500);
    }
    return () => clearTimeout(timeoutId);
  }, [gameState, autoBetEnabled, currentBet]);

  const getGraphPath = () => {
    if (gameState === 'WAITING') return "M 0 100 L 100 100";
    const safeMultiplier = Math.max(1, multiplier || 1);
    const x = Math.min(100, Math.log(safeMultiplier) * 40);
    const y = Math.max(20, 100 - Math.log(safeMultiplier) * 30);
    return `M 0 100 Q ${x * 0.5} 100 ${x} ${y}`;
  };

  const handleSendMessage = () => {
    if (!user || !chatInput.trim()) return;
    
    const now = new Date();
    const time = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
    
    let identifier = 'User';
    const phoneNumber = profile?.phone_number || user.user_metadata?.phone_number || user.phone;
    
    if (phoneNumber) {
      identifier = maskIdentifier(phoneNumber);
    } else {
      identifier = maskIdentifier(user.email?.split('@')[0] || 'User');
    }
    
    const newMessage = {
      time,
      user: identifier,
      message: chatInput.trim()
    };
    
    // Send to server via WebSocket
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify({
        type: 'CHAT_MESSAGE',
        payload: newMessage
      }));
    }
    
    setChatInput('');
  };

  const [chatMessages, setChatMessages] = useState([
    { time: '22:12', user: 'Candy09', message: '15/18---+70+' },
    { time: '22:13', user: 'Candy09', message: 'Moman nani alikula 490k' },
    { time: '22:14', user: 'Moraa321', message: 'Natafuta ya kuenda maternity 😭 aki mmenimalo' },
    { time: '22:14', user: 'Moraa321', message: 'Ata mtu anaeza enda labor 😂' },
    { time: '22:14', user: 'Moraa321', message: 'Support peeni mamaaa free bets' },
    { time: '22:15', user: 'Moraa321', message: '3000x itakuja 😭 😭 😭 hii hour' },
    { time: '22:17', user: 'Jep2026', message: 'Time? We still have 43 minutes' },
    { time: '22:21', user: 'Candy09', message: 'Moraa yaani bado uko na saa ya tamu 🤣 🤣 🤣 🤣' },
    { time: '22:22', user: 'Samcho80', message: 'Admin haga wewe' },
    { time: '22:22', user: 'Candy09', message: '24/26' },
    { time: '22:23', user: 'Zwer', message: 'Akuna 3000x' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  const maskIdentifier = (val: string) => {
    if (!val) return '';
    if (val.startsWith('+') || /^\d+$/.test(val)) {
      if (val.length >= 12) {
        return val.slice(0, 8) + '***' + val.slice(-2);
      }
      if (val.length >= 10) {
        return val.slice(0, 5) + '***' + val.slice(-2);
      }
    }
    if (val.length > 6) {
      return val.slice(0, 3) + '***' + val.slice(-2);
    }
    return val;
  };

  useEffect(() => {
    if (activeTab === 'CHAT' && chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatMessages, activeTab]);

  const renderLiveBetsTable = () => {
    const otherBets = liveBets.filter(b => !b.isCrashPoint);
    
    const maskUser = (username: string) => {
        if (!username) return 'Guest';
        if (username === 'You' || username === 'Hidden') return username;
        return maskIdentifier(username);
    };

    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#3b3b3b] rounded">
        <div className="grid grid-cols-[3fr_1fr_2fr_2fr] gap-2 px-3 py-2 text-[10px] font-bold text-gray-400 border-b border-[#4a4a4a] bg-[#333333]">
          <div className="text-left">USER</div>
          <div className="text-center">@</div>
          <div className="text-right">AMOUNT</div>
          <div className="text-right">PROFIT</div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-[#4a4a4a] scrollbar-track-transparent">
          {[...otherBets].sort((a, b) => {
            if (a.isStevo) return -1;
            if (b.isStevo) return 1;
            
            const getStatus = (bet: any) => {
                if (gameState === 'WAITING') return 1;
                let isCashedOut = false;
                if (bet.isStevo) {
                    isCashedOut = !!currentBet?.cashedOut;
                } else {
                    isCashedOut = bet.target && bet.target <= multiplier;
                }
                if (gameState === 'PLAYING') return isCashedOut ? 2 : 1;
                if (gameState === 'CRASHED') {
                    if (bet.isStevo) return currentBet?.cashedOut ? 2 : 0;
                    return (bet.target && bet.target < crashPoint) ? 2 : 0;
                }
                return 0;
            };

            const statusA = getStatus(a);
            const statusB = getStatus(b);
            if (statusA !== statusB) return statusB - statusA;
            if (statusA === 2) {
                const multA = (a.isStevo && currentBet?.cashOutAt) ? currentBet.cashOutAt : (a.target || 0);
                const multB = (b.isStevo && currentBet?.cashOutAt) ? currentBet.cashOutAt : (b.target || 0);
                return multB - multA;
            }
            return b.amount - a.amount;
          }).map((row, i) => {
            let displayAt = '-';
            let displayProfit = '-';
            let rowClass = "hover:bg-[#4a4a4a] bg-transparent";
            let multiplierClass = "text-white";
            let profitClass = "text-white";
            
            if (row.isStevo) rowClass = "bg-[#4a4a4a]/50 border border-[#f58b2b]/30";

            if (gameState === 'PLAYING') {
              if (row.target && row.target <= multiplier && !row.isStevo) {
                displayAt = row.target.toFixed(2);
                displayProfit = (row.amount * row.target).toFixed(2);
                multiplierClass = "text-green-500";
                profitClass = "text-green-500";
              } else if (row.isStevo && currentBet?.cashedOut && currentBet.cashOutAt) {
                 displayAt = currentBet.cashOutAt.toFixed(2);
                 displayProfit = (currentBet.amount * currentBet.cashOutAt).toFixed(2);
                 multiplierClass = "text-green-500";
                 profitClass = "text-green-500";
              }
            } else if (gameState === 'CRASHED') {
              if (row.target && row.target < crashPoint && !row.isStevo) {
                displayAt = row.target.toFixed(2);
                displayProfit = (row.amount * row.target).toFixed(2);
                multiplierClass = "text-green-500";
                profitClass = "text-green-500";
              } else if (row.isStevo && currentBet?.cashedOut && currentBet.cashOutAt) {
                 displayAt = currentBet.cashOutAt.toFixed(2);
                 displayProfit = (currentBet.amount * currentBet.cashOutAt).toFixed(2);
                 multiplierClass = "text-green-500";
                 profitClass = "text-green-500";
              } else {
                multiplierClass = "text-red-500";
                if (row.isStevo && !currentBet?.cashedOut) {
                    displayProfit = `-${row.amount}`;
                    profitClass = "text-red-500";
                }
              }
            }

            return (
              <div key={i} className={`grid grid-cols-[3fr_1fr_2fr_2fr] gap-2 px-2 py-1.5 rounded text-xs transition-colors ${rowClass}`}>
                <div className={`truncate text-left font-medium flex items-center gap-1 ${row.isStevo ? 'text-[#f58b2b]' : 'text-gray-300'}`}>
                    {row.isStevo && <div className="w-1.5 h-1.5 rounded-full bg-[#f58b2b]"></div>}
                    {row.isInsider ? row.user : maskUser(row.user)}
                </div>
                <div className={`truncate text-center ${multiplierClass}`}>{displayAt !== '-' && !displayAt.endsWith('x') ? displayAt + 'x' : displayAt}</div>
                <div className="truncate text-right text-white">{row.amount}</div>
                <div className={`truncate text-right ${profitClass}`}>{displayProfit}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderBetHistory = () => {
    if (!user) return <div className="flex-1 flex items-center justify-center text-gray-500 italic text-xs">Login to view your history</div>;
    return (
      <div className="flex-1 flex flex-col overflow-hidden bg-[#3b3b3b] rounded">
        <div className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr] gap-2 px-3 py-2 text-[10px] font-bold text-gray-400 border-b border-[#4a4a4a] bg-[#333333]">
          <div className="text-left">TIME</div>
          <div className="text-center">@</div>
          <div className="text-right">BET</div>
          <div className="text-right">PROFIT</div>
        </div>
        <div className="flex-1 overflow-y-auto p-2 space-y-1 scrollbar-thin scrollbar-thumb-[#4a4a4a] scrollbar-track-transparent">
          {betHistory.map((bet, i) => {
            const time = new Date(bet.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
            const isWon = bet.status === 'CASHED_OUT';
            const isLost = bet.status === 'LOST';
            return (
              <div key={i} className="grid grid-cols-[2fr_1fr_1.5fr_1.5fr] gap-2 px-2 py-1.5 rounded text-[11px] hover:bg-[#4a4a4a] transition-colors">
                <div className="text-gray-400 text-left">{time}</div>
                <div className={`text-center font-bold ${isWon ? 'text-green-500' : isLost ? 'text-red-500' : 'text-white'}`}>
                  {bet.multiplier ? bet.multiplier.toFixed(2) + 'x' : '-'}
                </div>
                <div className="text-right text-white">{bet.amount}</div>
                <div className={`text-right font-bold ${isWon ? 'text-green-500' : isLost ? 'text-red-500' : 'text-white'}`}>
                  {bet.profit ? (bet.profit > 0 ? '+' : '') + bet.profit.toFixed(2) : '-'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#111111] text-gray-300 font-sans flex justify-center py-4 md:py-8">
      <div className="w-full max-w-[1600px] bg-[#2b2b2b] rounded-md shadow-2xl overflow-hidden flex flex-col border border-[#3a3a3a] mx-2 md:mx-4">
        <header className="flex justify-between items-center px-4 py-3 border-b border-[#3a3a3a] relative">
          <div className="flex items-center gap-2 md:gap-4">
            <button className="md:hidden text-gray-400 hover:text-white" onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}><Menu size={24} /></button>
            <h1 className="text-base md:text-3xl font-black text-[#f58b2b] tracking-wider" style={{ fontFamily: 'Impact, sans-serif' }}>JETPESA</h1>
            <button 
              onClick={() => {
                if (!user) {
                  navigate('/login');
                } else {
                  setIsWalletModalOpen(true);
                }
              }} 
              className="bg-[#f58b2b] hover:bg-[#e07a20] text-white font-bold py-1 px-3 md:px-4 rounded text-xs md:text-sm transition-colors"
            >
              DEPOSIT
            </button>
            <Phone className="text-green-500 w-5 h-5 cursor-pointer hidden md:block" />
          </div>
          <div className="hidden md:flex items-center gap-4 text-[10px] font-bold">
            {user ? (
              <div className="flex items-center gap-4">
                <button onClick={() => setIsWalletModalOpen(true)} className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors uppercase"><Wallet size={14} className="text-[#f58b2b]" />CASHIER</button>
                <button className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors uppercase"><Users size={14} className="text-[#f58b2b]" />AFFILIATE</button>
                <button onClick={() => setIsFAQModalOpen(true)} className="flex items-center gap-1 text-gray-400 hover:text-white transition-colors uppercase"><MessageSquare size={14} className="text-[#f58b2b]" />FAQ</button>
                <div className="flex items-center gap-1 text-white"><Users size={14} className="text-[#f58b2b]" />{maskIdentifier(profile?.phone_number || user.user_metadata?.phone_number || user.email?.split('@')[0] || '')}</div>
                <div className="text-white">KES {profile?.balance?.toLocaleString() || '0'}</div>
                <button onClick={() => setIsLogoutConfirmOpen(true)} className="text-gray-400 hover:text-[#f58b2b] transition-colors"><Power size={16} /></button>
              </div>
            ) : (
              <div className="flex items-center gap-4">
                <button onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }} className="hover:text-white transition-colors">LOGIN</button>
                <button onClick={() => { setAuthMode('register'); setIsAuthModalOpen(true); }} className="hover:text-white transition-colors">REGISTER</button>
              </div>
            )}
          </div>
          {user && <div className="md:hidden flex items-center gap-2 text-xs font-bold text-white"><span>KES {profile?.balance?.toLocaleString() || '0'}</span></div>}
        </header>

        {isMobileMenuOpen && (
          <>
            <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setIsMobileMenuOpen(false)}></div>
            <div className="absolute top-[60px] left-0 w-full z-50 md:hidden bg-[#2b2b2b] border-b border-[#3a3a3a] p-4 flex flex-col gap-4 animate-slide-down shadow-xl">
              {user ? (
                <>
                  <div className="flex items-center gap-2 text-white font-bold pb-2 border-b border-[#3a3a3a]"><Users size={16} className="text-[#f58b2b]" />{maskIdentifier(profile?.phone_number || user.user_metadata?.phone_number || user.email?.split('@')[0] || '')}</div>
                  <button onClick={() => { setIsWalletModalOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-2 text-gray-300 hover:text-white py-2"><Wallet size={16} className="text-[#f58b2b]" />Cashier</button>
                  <button onClick={() => { setIsFAQModalOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-2 text-gray-300 hover:text-white py-2"><MessageSquare size={16} className="text-[#f58b2b]" />FAQ</button>
                  <button onClick={() => { setIsLogoutConfirmOpen(true); setIsMobileMenuOpen(false); }} className="flex items-center gap-2 text-red-400 hover:text-red-300 py-2"><Power size={16} />Logout</button>
                </>
              ) : (
                <div className="flex flex-col gap-2">
                  <button onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); setIsMobileMenuOpen(false); }} className="bg-[#444444] text-white py-3 rounded font-bold">LOGIN</button>
                  <button onClick={() => { setAuthMode('register'); setIsAuthModalOpen(true); setIsMobileMenuOpen(false); }} className="bg-[#f58b2b] text-white py-3 rounded font-bold">REGISTER</button>
                </div>
              )}
            </div>
          </>
        )}

        <div className="flex flex-col lg:flex-row p-2 md:p-4 gap-4">
          <div className="flex-1 flex flex-col gap-4">
            <div className="flex flex-col md:flex-row gap-4 min-h-[500px] md:min-h-[400px]">
              <div className="flex-1 bg-[#3b3b3b] rounded p-2 md:p-4 relative flex flex-col border border-[#4a4a4a] min-h-[300px]">
                <div className="absolute top-2 right-3 text-xs text-gray-400 italic">Max Bet: 3,000</div>
                <div className="flex-1 relative mt-4 border-l border-b border-gray-500 overflow-hidden">
                  <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                    <path d={getGraphPath()} fill="none" stroke={gameState === 'CRASHED' ? "#ef4444" : "#f58b2b"} strokeWidth="2" />
                    {gameState === 'PLAYING' && <path d={`${getGraphPath()} L ${Math.min(100, Math.log(multiplier) * 40)} 100 Z`} fill="rgba(245, 139, 43, 0.1)" />}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {gameState === 'WAITING' ? (
                      <>
                        <div className="text-4xl font-black text-white mb-2">NEXT ROUND IN</div>
                        <div className="text-6xl font-black text-[#f58b2b]">{countdown.toFixed(1)}s</div>
                      </>
                    ) : (
                      <div className={`text-7xl font-black ${gameState === 'CRASHED' ? 'text-red-500' : 'text-white'}`}>{multiplier.toFixed(2)}x</div>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-3 text-sm font-bold">
                  {history.map((h, i) => <span key={i} className={h.color}>{h.value.toFixed(2)}x</span>)}
                </div>
              </div>

              <div className="w-full md:w-64 bg-[#3b3b3b] rounded p-4 border border-[#4a4a4a] flex flex-col">
                {user ? (
                  <div className="flex-1 flex flex-col gap-4">
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <label className="block text-gray-400 text-[10px] font-bold mb-1 uppercase">Amount</label>
                        <input type="text" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} className="w-full bg-[#2b2b2b] border border-[#4a4a4a] text-white px-3 py-2 rounded text-lg focus:outline-none focus:border-[#4ea1f3]" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-center mb-1">
                          <label className="block text-gray-400 text-[10px] font-bold uppercase">Auto Cashout (X)</label>
                          <button onClick={() => setAutoCashoutEnabled(!autoCashoutEnabled)} className={`w-6 h-3 rounded-full relative transition-colors ${autoCashoutEnabled ? 'bg-[#4ea1f3]' : 'bg-gray-600'}`}><div className={`absolute top-0.5 w-2 h-2 bg-white rounded-full transition-all ${autoCashoutEnabled ? 'left-3.5' : 'left-0.5'}`}></div></button>
                        </div>
                        <input type="text" value={autoCashout} onChange={(e) => setAutoCashout(e.target.value)} disabled={!autoCashoutEnabled} className={`w-full bg-[#2b2b2b] border border-[#4a4a4a] text-white px-3 py-2 rounded text-lg focus:outline-none focus:border-[#4ea1f3] ${!autoCashoutEnabled ? 'opacity-50' : ''}`} />
                      </div>
                    </div>
                    <button onClick={() => { if (gameState === 'PLAYING') handleCashOut(); else if (gameState === 'WAITING' && currentBet) handleCancelBet(); else handlePlaceBet(); }} disabled={(gameState === 'PLAYING' && (!currentBet || currentBet.cashedOut)) || isPlacingBet.current || isCancellingBet.current || isCashingOut.current} className={`w-full h-24 rounded-xl shadow-xl transform transition-all duration-100 flex flex-col items-center justify-center gap-1 font-black text-2xl tracking-wider uppercase active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 border-b-4 relative overflow-hidden group ${gameState === 'PLAYING' && currentBet && !currentBet.cashedOut ? 'bg-gradient-to-b from-yellow-400 to-yellow-600 shadow-yellow-500/20 text-black border-yellow-700 hover:brightness-110' : (gameState === 'WAITING' || gameState === 'CRASHED') && currentBet ? 'bg-gradient-to-b from-red-500 to-red-700 shadow-red-500/20 text-white border-red-900 hover:brightness-110' : 'bg-gradient-to-b from-[#f58b2b] to-[#e07a20] shadow-orange-500/20 text-white border-[#c25e00] hover:brightness-110'}`}><div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]" />{gameState === 'PLAYING' && currentBet && !currentBet.cashedOut ? (<div className="flex flex-col items-center z-10"><span className="text-xs font-bold opacity-70 tracking-widest">CASH OUT</span><span className="text-3xl font-black">{(currentBet.amount * multiplier).toFixed(2)}</span><span className="text-[10px] font-bold opacity-70">KES</span></div>) : (<span className={`z-10 drop-shadow-sm ${gameState === 'PLAYING' && !currentBet ? 'text-xl' : 'text-3xl'}`}>{(gameState === 'WAITING' || gameState === 'CRASHED') && currentBet ? 'CANCEL' : (gameState === 'PLAYING' ? 'WAIT FOR NEXT ROUND' : 'BET')}</span>)}</button>
                    {betError && <div className="text-red-500 text-xs font-bold text-center animate-pulse">{betError}</div>}
                    <div className="mt-3 flex items-center justify-between bg-[#2b2b2b] px-3 py-2 rounded border border-[#4a4a4a]"><span className="text-[10px] font-bold text-gray-400 uppercase">Auto Bet</span><button onClick={() => setAutoBetEnabled(!autoBetEnabled)} className={`w-8 h-4 rounded-full relative transition-colors ${autoBetEnabled ? 'bg-green-500' : 'bg-gray-600'}`}><div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all shadow-sm ${autoBetEnabled ? 'left-[18px]' : 'left-0.5'}`}></div></button></div>
                    <div className="flex justify-between items-center mt-2"><div className="flex items-center gap-2"><div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]"></div><span className="text-gray-400 text-[10px] font-bold uppercase">Live</span></div><div className="flex items-center gap-2"><button className="text-gray-500 hover:text-white"><X size={16} /></button></div></div>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center"><p className="text-gray-400 text-sm mb-4">Login or Register to start playing</p><div className="flex gap-2 w-full"><button onClick={() => { setAuthMode('login'); setIsAuthModalOpen(true); }} className="flex-1 bg-[#444444] hover:bg-[#555555] text-white font-bold py-2 rounded text-sm transition-colors">LOGIN</button><button onClick={() => { setAuthMode('register'); setIsAuthModalOpen(true); }} className="flex-1 bg-[#f58b2b] hover:bg-[#e07a20] text-white font-bold py-2 rounded text-sm transition-colors">REGISTER</button></div></div>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-4">
              <div className="text-center text-sm font-bold text-white">For assistance, contact us on <span className="text-[#f58b2b]">0743999333</span></div>
              <div className="bg-[#f58b2b] rounded-lg p-4 flex items-center justify-between relative overflow-hidden h-32"><div className="z-10 w-1/2"><h3 className="text-2xl font-black text-white italic leading-tight">Chanua Mbogi Tukujenge 30% Per Referral!</h3></div><div className="z-10 text-right"><p className="text-xl font-black text-white italic">Omoka Na Jetpesa Affiliate Program</p></div><div className="absolute top-2 right-2 bg-white/20 rounded-full w-6 h-6 flex items-center justify-center text-[10px] font-bold text-white border border-white/40">18+</div><div className="absolute inset-0 bg-gradient-to-r from-transparent to-black/20"></div><img src="https://picsum.photos/seed/jetpesa/800/200" className="absolute inset-0 w-full h-full object-cover opacity-30 mix-blend-overlay" alt="Banner" referrerPolicy="no-referrer" /></div>
              <div className="flex bg-[#3b3b3b] rounded border border-[#4a4a4a] h-80">
                <div className="w-12 border-r border-[#4a4a4a] flex flex-col">
                  <button onClick={() => setActiveTab('CHAT')} className={`flex-1 flex items-center justify-center border-b border-[#4a4a4a] transition-colors ${activeTab === 'CHAT' ? 'bg-[#f58b2b] text-white' : 'text-gray-500 hover:text-gray-300'}`}><span className="rotate-[-90deg] font-bold text-[10px] tracking-widest">CHAT</span></button>
                  <button onClick={() => setActiveTab('HISTORY')} className={`flex-1 flex items-center justify-center border-b border-[#4a4a4a] transition-colors ${activeTab === 'HISTORY' ? 'bg-[#f58b2b] text-white' : 'text-gray-500 hover:text-gray-300'}`}><span className="rotate-[-90deg] font-bold text-[10px] tracking-widest">HISTORY</span></button>
                  <button onClick={() => setActiveTab('PLAYERS')} className={`flex-1 flex items-center justify-center border-b border-[#4a4a4a] transition-colors ${activeTab === 'PLAYERS' ? 'bg-[#f58b2b] text-white' : 'text-gray-500 hover:text-gray-300'}`}><span className="rotate-[-90deg] font-bold text-[10px] tracking-widest">PLAYERS</span></button>
                  <button onClick={() => setActiveTab('AFFILIATE')} className={`flex-1 flex items-center justify-center border-b border-[#4a4a4a] transition-colors ${activeTab === 'AFFILIATE' ? 'bg-[#f58b2b] text-white' : 'text-gray-500 hover:text-gray-300'}`}><span className="rotate-[-90deg] font-bold text-[10px] tracking-widest uppercase">Affiliate</span></button>
                  <button className="h-12 flex items-center justify-center text-gray-500 hover:text-gray-300"><Settings size={18} /></button>
                </div>
                <div className="flex-1 flex flex-col overflow-hidden">
                  {activeTab === 'CHAT' && (<div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">{chatMessages.map((msg, i) => (<div key={i} className="text-xs"><span className="text-gray-500 mr-2">{msg.time}</span><span className="text-[#f58b2b] font-bold mr-2">{msg.user}:</span><span className="text-gray-300">{msg.message}</span></div>))}<div ref={chatEndRef} /></div>)}
                  {activeTab === 'HISTORY' && renderBetHistory()}
                  {activeTab === 'PLAYERS' && renderLiveBetsTable()}
                  {activeTab === 'AFFILIATE' && (
                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#3b3b3b]">
                      {!user ? (
                        <div className="h-full flex flex-col items-center justify-center text-center space-y-4">
                          <Users className="w-12 h-12 text-gray-600" />
                          <p className="text-gray-400 text-[10px] uppercase font-bold">Login to see stats</p>
                        </div>
                      ) : (
                        <>
                          <div className="bg-[#2b2b2b] p-3 rounded border border-[#f58b2b]/20">
                            <h3 className="text-[#f58b2b] font-bold text-[10px] uppercase mb-2">Referral Link</h3>
                            <div className="flex gap-1">
                              <input 
                                readOnly 
                                value={`${window.location.origin}/register?ref=${affiliateStats?.referral_code || ''}`}
                                className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1.5 text-[10px] text-gray-300 outline-none"
                              />
                              <button 
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}/register?ref=${affiliateStats?.referral_code || ''}`);
                                  alert('Link copied!');
                                }}
                                className="bg-[#f58b2b] text-white px-2 py-1.5 rounded text-[10px] font-bold"
                              >
                                COPY
                              </button>
                            </div>
                            <p className="text-[9px] text-gray-500 mt-2 italic">Earn 30% from every bet lost by your referrals!</p>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            <div className="bg-[#2b2b2b] p-2 rounded border border-white/5">
                              <div className="text-[9px] text-gray-500 uppercase font-bold">Referrals</div>
                              <div className="text-sm font-bold text-white">{affiliateStats?.total_referrals || 0}</div>
                            </div>
                            <div className="bg-[#2b2b2b] p-2 rounded border border-white/5">
                              <div className="text-[9px] text-gray-500 uppercase font-bold">Earnings</div>
                              <div className="text-sm font-bold text-white">KES {affiliateStats?.total_earnings?.toFixed(2) || '0.00'}</div>
                            </div>
                          </div>

                          <div className="bg-[#f58b2b]/5 p-3 rounded border border-[#f58b2b]/20 flex flex-col gap-2">
                            <div className="flex justify-between items-center">
                              <div className="text-[9px] text-[#f58b2b] uppercase font-bold">Claimable</div>
                              <div className="text-sm font-bold text-white">KES {affiliateStats?.affiliate_balance?.toFixed(2) || '0.00'}</div>
                            </div>
                            <button 
                              disabled={!affiliateStats || affiliateStats.affiliate_balance <= 0 || isClaiming}
                              onClick={handleClaimAffiliate}
                              className="w-full bg-[#f58b2b] disabled:opacity-50 disabled:cursor-not-allowed text-white py-1.5 rounded font-bold text-[10px] uppercase shadow-lg shadow-[#f58b2b]/10"
                            >
                              {isClaiming ? 'CLAIMING...' : 'CLAIM EARNINGS'}
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {activeTab === 'CHAT' && (<div className="p-3 bg-[#333333] border-t border-[#4a4a4a] rounded-br">{user ? (<div className="flex gap-2 bg-[#222222] rounded-lg px-3 py-2 border border-[#4a4a4a] focus-within:border-[#f58b2b]/50 transition-colors"><input type="text" placeholder="Type a message..." className="flex-1 bg-transparent outline-none text-white text-base md:text-sm" value={chatInput} onChange={(e) => setChatInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') handleSendMessage(); }} /><button onClick={handleSendMessage} disabled={!chatInput.trim()} className="text-[#f58b2b] hover:text-[#ff9b3b] transition-colors disabled:opacity-30 disabled:cursor-not-allowed"><Send size={18} /></button></div>) : (<div className="text-center py-1 text-xs text-gray-500 italic">You must be logged in to chat</div>)}</div>)}
                </div>
              </div>
            </div>
          </div>
          <div className="hidden xl:flex w-96 bg-[#3b3b3b] rounded flex-col border border-[#4a4a4a] h-[calc(100vh-8rem)] sticky top-4 overflow-hidden">{renderLiveBetsTable()}</div>
        </div>

        <footer className="bg-[#1a1a1a] py-2 px-4 text-center text-[10px] text-gray-500 border-t border-[#3a3a3a]">Must be 18+ to register or play. Please gamble responsibly. Licensed and authorised by BCLB under licence No. 58076465.</footer>
        <AuthModal isOpen={isAuthModalOpen} onClose={() => setIsAuthModalOpen(false)} initialMode={authMode} />
        <WalletModal isOpen={isWalletModalOpen} onClose={() => { setIsWalletModalOpen(false); setPaymentNotification(null); }} balance={profile?.balance} onUpdateBalance={updateBalance} userId={user?.id} paymentNotification={paymentNotification} />
        <FAQModal isOpen={isFAQModalOpen} onClose={() => setIsFAQModalOpen(false)} />
        {isLogoutConfirmOpen && (<div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-4"><div className="bg-[#3b3b3b] w-full max-w-sm rounded-xl shadow-2xl p-6 border border-[#4a4a4a] text-center space-y-6 animate-slide-down"><div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto border border-red-500/50"><Power size={32} className="text-red-500" /></div><div className="space-y-2"><h3 className="text-xl font-black text-white uppercase tracking-tight">Logout?</h3><p className="text-gray-400 text-sm">Are you sure you want to log out and stay?</p></div><div className="flex gap-3"><button onClick={() => setIsLogoutConfirmOpen(false)} className="flex-1 bg-[#444444] hover:bg-[#555555] text-white font-black py-3 rounded-lg transition-all uppercase tracking-widest text-sm">STAY</button><button onClick={confirmLogout} className="flex-1 bg-red-600 hover:bg-red-700 text-white font-black py-3 rounded-lg transition-all uppercase tracking-widest text-sm shadow-lg shadow-red-900/20">LOGOUT</button></div></div></div>)}
      </div>
    </div>
  );
}
