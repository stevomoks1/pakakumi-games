import React from 'react';
import { X } from 'lucide-react';

interface FAQModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function FAQModal({ isOpen, onClose }: FAQModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-[#2b2b2b] w-full max-w-3xl rounded-lg shadow-2xl overflow-hidden relative border border-[#4a4a4a] my-auto max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-[#4a4a4a] bg-[#333333]">
          <h2 className="text-2xl font-bold text-white uppercase tracking-wider">Basics</h2>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <X size={24} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto custom-scrollbar space-y-8 text-gray-300 text-sm leading-relaxed">
          
          {/* Section 1: Basics */}
          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">What is PakaKumi?</h3>
            <ul className="list-disc pl-5 space-y-2 marker:text-gray-500">
              <li>PakaKumi is a thrilling social online game. It's a real time, simple, and exciting game where you can securely play for fun or to win a fortune.</li>
              <li>Each round of the game, you have the opportunity to place a bet before the round starts. Once the round begins, a lucky multiplier starts at 1x and begins climbing higher and higher.</li>
              <li>At any moment, you can click <strong>Cashout</strong> to lock in the current multiplier which awards you with your multiplied bet.</li>
              <li>The longer you stay in the game before cashing out, the higher the multiplier gets. But beware! Every tick of the game has a chance of busting. If you do not cash out before the bust, you lose your bet.</li>
              <li>Every round is a fight between risk and reward. Do you cash out at 1.1x for a conservative win? Or do you stay in the game to hunt the high 1000x multipliers?</li>
              <li>PakaKumi is <span className="text-[#f58b2b] underline cursor-pointer">provably fair</span> and has one of the lowest house edges in the market, of only 1%.</li>
            </ul>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How do I play PakaKumi?</h3>
            <ol className="list-decimal pl-5 space-y-2 marker:text-gray-500">
              <li>First you need to have a positive balance, by depositing money through MPESA to your account or receiving a tip from someone in the community.</li>
              <li>Next, select the amount to bet and a cash out multiplier. Place your bet. Watch the multiplier increase from 1x upwards! You can cash out before your set up cash out limit, pressing the <strong>Cash Out</strong> button. Get your bet multiplied by that multiplier. But be careful because the game can bust at any time, and you'll get nothing!</li>
            </ol>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">Is PakaKumi a fair game?</h3>
            <ul className="list-disc pl-5 space-y-2 marker:text-gray-500">
              <li>Absolutely! And we can prove it.</li>
              <li>There are already 3rd party open source scripts to verify and calculate the game results. Check out this handy tool that one of our players generously made.</li>
              <li><span className="text-[#f58b2b] underline cursor-pointer">Learn more about our provably fair system</span></li>
            </ul>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How high can the game go?</h3>
            <p>We currently a limit of upto 3000X</p>
          </section>

          {/* Section 2: Registration & Deposit */}
          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How to Register on Pakakumi?</h3>
            <ul className="list-disc pl-5 space-y-2 marker:text-gray-500">
              <li>Open your your web browser and type in pakakumi.com</li>
              <li>On the Pakakumi page click on Register</li>
              <li>Enter your number and chosen password of six or more characters then select Join Pakakumi</li>
            </ul>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How to Deposit on Pakakumi?</h3>
            <ul className="list-disc pl-5 space-y-2 marker:text-gray-500">
              <li>Go to M-PESA on your phone</li>
              <li>Select Pay Bill option</li>
              <li>Enter Business no. <strong>547717</strong> (PAKAKUMI)</li>
              <li>Enter Account no. Your account number is unique and can be found on the deposit page</li>
              <li>Enter the Amount</li>
              <li>Enter your M-PESA PIN and Send</li>
            </ul>
            <div className="mt-4 p-3 bg-[#3b3b3b] border-l-4 border-[#f58b2b] text-xs">
              <strong>NOTE:</strong> Minimum deposit amount is KES 50. You can ONLY deposit using the same phone number you use to login. You cannot deposit while you have an active bonus.
            </div>
          </section>

          {/* Section 3: Affiliate */}
          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How to Play Pakakumi Affiliate program?</h3>
            <ul className="list-disc pl-5 space-y-2 marker:text-gray-500">
              <li>Register/log in on pakakumi.com</li>
              <li>When the Pakakumi page appears click on affiliate program</li>
              <li>Copy your link and share to earn 30 % commission on revenues made!</li>
            </ul>
          </section>

          {/* Section 4: Support & Withdrawal */}
          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How do I contact pakakumi customer care?</h3>
            <p>You can contact Pakakumi customer care through the customer care number <span className="text-[#f58b2b] font-bold">0711223344</span>. The customer care line is active 24/7</p>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How do I withdraw from pakakumi?</h3>
            <ul className="list-disc pl-5 space-y-2 marker:text-gray-500">
              <li>Login to your account on pakakumi.com</li>
              <li>Select Cashier top left</li>
              <li>Select Withdrawal</li>
              <li>Enter the amount you wish to withdraw (minimum 100/=)</li>
              <li>Click Request Withdrawal</li>
            </ul>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How do I reset my password</h3>
            <ul className="list-disc pl-5 space-y-2 marker:text-gray-500">
              <li>Visit pakakumi.com and click on log in</li>
              <li>Click on forgot password to reset your password</li>
            </ul>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">Can I be refunded ?</h3>
            <p>Once you play and loose you cannot be refunded. Please refer to the terms and conditions</p>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How does Pakakumi cashout work?</h3>
            <p>The Cash Out feature allows you to take an early payout on your bets before they are settled, meaning one is able to get money back before the event is over and your bet is ultimately resulted.</p>
            <div className="mt-2 text-xs italic text-gray-400">Note: Any stake amount can qualify for a cash out.</div>
          </section>

          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">How do I verify my pending deposit?</h3>
            <p>Click on deposit and scroll down to verify your deposit</p>
            <div className="mt-2 p-3 bg-[#3b3b3b] border-l-4 border-[#f58b2b] text-xs">
              <strong>Note:</strong> We automatically verify all Mpesa transactions and you may never have to use this step. ONLY use this if your deposit is delayed for more than a minute.
            </div>
          </section>

          {/* Section 5: Affiliate Details */}
          <section>
            <h3 className="text-[#f58b2b] font-bold text-lg mb-3 uppercase">Affiliate Program</h3>
            <h4 className="font-bold text-white mt-2 mb-1">What is Pakakumi Affiliate Program</h4>
            <p>PakaKumi Affiliates is a program where we give you the opportunity to earn money every month simply by giving us the chance to welcome more players through our virtual doors.</p>

            <h4 className="font-bold text-white mt-4 mb-1">HOW MUCH DOES IT COST TO JOIN?</h4>
            <p>Absolutely nothing. It's 100% free.</p>

            <h4 className="font-bold text-white mt-4 mb-1">CAN I STILL BENEFIT IF I DON'T HAVE A WEBSITE?</h4>
            <p>Of course you can. We can give you all the marketing tools you will need to promote PakaKumi offline, on social media or by email.</p>

            <h4 className="font-bold text-white mt-4 mb-1">How much do I earn?</h4>
            <p>As part of our affiliate network, you will be paid in a revenue share based model. You earn a 30% commission on revenues made.</p>

            <h4 className="font-bold text-white mt-4 mb-1">What is negative revenue?</h4>
            <p>Negative commission happens when an affiliate’s players generate negative revenue for PakaKumi. The house periodically absorbs all negative commissions and allows an affiliate to earn positive commissions on earnings from the subsequent games without having to “pay back” the sportsbook’s loss.</p>
            <div className="mt-2 text-xs italic text-gray-400">Note: Negative commissions will NEVER impact your balance.</div>
          </section>

        </div>
      </div>
    </div>
  );
}
