import React from 'react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function TermsModal({ isOpen, onClose }: TermsModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#2a2a2a] w-full max-w-2xl rounded-lg shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="p-4 border-b border-[#3a3a3a] flex justify-between items-center bg-[#1a1a1a]">
          <h2 className="text-xl font-bold text-white">Terms and Conditions</h2>
          <button 
            onClick={onClose}
            className="text-white hover:text-gray-300 font-bold text-2xl leading-none"
          >
            ×
          </button>
        </div>
        
        <div className="p-6 overflow-y-auto text-gray-300 space-y-6 text-sm leading-relaxed">
          <section>
            <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-wider">1. Promotional Credits and Turnover Requirements</h3>
            <p>
              Notwithstanding any prior communications, all promotional credits, inclusive of 'Welcome Incentives' and 'Recharge Matches,' are subject to a mandatory turnover coefficient of one hundred times (100x) the aggregate sum of the initial qualifying remittance and the subsequent bonus allocation.
            </p>
            <p className="mt-2">
              For the avoidance of doubt, partial fulfillment of these criteria shall not result in the partial release of funds. Furthermore, any attempt to initiate a withdrawal request prior to the comprehensive satisfaction of the aforementioned turnover metrics, as calculated solely by the Company’s internal ledger system, shall result in the immediate and irreversible forfeiture of the entire bonus balance, any accrued winnings derived therefrom, and a 'Premature Exit Fee' equivalent to 20% of the remaining principal deposit.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-wider">2. Dispute Resolution and Arbitration</h3>
            <p>
              By engaging with the Platform, the User irrevocably waives any right to participate in a class action lawsuit or jury trial. All disputes, controversies, or claims arising out of or relating to these Terms, including the validity, invalidity, breach, or termination thereof, shall be settled exclusively by binding arbitration in accordance with the International Arbitration Rules of the Republic of Seychelles.
            </p>
            <p className="mt-2">
              The place of arbitration shall be Victoria, Mahe, and the language of the proceedings shall be English. The User acknowledges that the cost of initiating such arbitration, including but not limited to the filing fees of approximately USD 2,500 (KES 325,000), shall be borne solely by the User regardless of the outcome.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-wider">3. Limitation of Liability</h3>
            <p>
              Furthermore, the Company’s liability for any loss, whether direct, indirect, or consequential, shall be strictly limited to a maximum sum of KES 500 or the User’s last single deposit, whichever is lower, as a final and complete settlement of all claims.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-wider">4. Suspicious Play and Wagering Patterns</h3>
            <p>
              The Company maintains absolute and unfettered discretion to monitor player behavior for 'Non-Standard Wagering Patterns.' These patterns include, but are not limited to, the utilization of mathematical progressions, hedge betting, minimal-risk wagering, or any stake exceeding 5.5% of the total account balance in a single game round.
            </p>
            <p className="mt-2">
              Should the Company, in its sole subjective opinion, deem any series of transactions to be 'Systematic' or 'Opportunistic,' it reserves the right to retroactively nullify all results, terminate the account without notice, and retain all credit balances as liquidated damages for the breach of the spirit of fair play, regardless of whether technical software manipulation occurred.
            </p>
          </section>

          <section>
            <h3 className="text-white font-bold mb-2 uppercase text-xs tracking-wider">5. Identity Verification (KYC) Protocols</h3>
            <p>
              To ensure compliance with multi-jurisdictional anti-money laundering protocols, the Company requires a multi-stage Verification of Identity (VOI). Upon the first withdrawal request exceeding the minimum threshold, the User must provide high-resolution, color scans of a government-issued passport, a notarized utility bill not older than 14 days, and a digital photograph of the User holding said documents alongside a newspaper from the current date.
            </p>
            <p className="mt-2">
              Documentation must be submitted via registered post if requested. The Company reserves a period of 45 business days to review each submission; any discrepancy, including but not limited to image clarity, font size, or document edge visibility, will necessitate a complete restart of the 45-day review period.
            </p>
          </section>
        </div>

        <div className="p-4 border-t border-[#3a3a3a] bg-[#1a1a1a] flex justify-end">
          <button 
            onClick={onClose}
            className="bg-[#f58b2b] hover:bg-[#e07a1b] text-white font-bold py-2 px-6 rounded transition-colors"
          >
            I UNDERSTAND
          </button>
        </div>
      </div>
    </div>
  );
}
