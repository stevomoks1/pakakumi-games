// Follow this setup guide to integrate the Deno language server with your editor:
// https://deno.land/manual/getting_started/setup_your_environment
// This enables autocomplete, go to definition, etc.

// Setup type definitions for built-in Supabase Runtime APIs
import "@supabase/functions-js/edge-runtime.d.ts"
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    console.log("PayHero Callback Received:", JSON.stringify(body, null, 2));

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // PayHero can send data flat, nested in 'response', or nested in 'data'
    const data = body?.response || body?.data || body;
    
    // Safaricom raw format fallback (just in case)
    const stkCallback = data?.Body?.stkCallback || body?.Body?.stkCallback;

    let externalRef = data?.ExternalReference || data?.external_reference;
    
    // Use nullish coalescing (??) because ResultCode can be 0 (falsy)
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
    const isSuccess = status === 'Success' || status === 'SUCCESS' || resultCode === 0 || resultCode === '0';
    const finalStatus = isSuccess ? 'Success' : 'Failed';

    let userId = null;

    // Try to update existing record, otherwise insert new one
    // We look up by CheckoutRequestID first, then fallback to ExternalReference
    let existingQuery = supabase.from("payments").select("id, user_id, status");
    
    if (checkoutRequestId) {
        existingQuery = existingQuery.eq("checkout_request_id", checkoutRequestId);
    } else {
        existingQuery = existingQuery.eq("external_reference", externalRef);
    }

    const { data: existing } = await existingQuery.maybeSingle();

    if (existing) {
      userId = existing.user_id;
      // Only process if it wasn't already marked as Success
      if (existing.status !== 'Success') {
          const { error: updateError } = await supabase
            .from("payments")
            .update({
              status: finalStatus,
              mpesa_receipt: mpesaReceipt || null,
              result_code: resultCode ?? null,
              result_desc: resultDesc || null,
              raw_callback: body,
              updated_at: new Date().toISOString(),
            })
            .eq("id", existing.id);
          if (updateError) console.error("DB update error:", updateError);
      } else {
          console.log("Payment already marked as Success, skipping update.");
      }
    } else {
      // Try to extract user_id from external_reference (format: INV-{userId}-{timestamp})
      if (externalRef && externalRef.startsWith('INV-')) {
          const parts = externalRef.split('-');
          if (parts.length >= 3) {
              // Reconstruct UUID if it was split
              const possibleUuid = parts.slice(1, -1).join('-');
              if (possibleUuid.length > 10) { // basic check
                  userId = possibleUuid;
              }
          }
      }

      const { error: insertError } = await supabase.from("payments").insert({
        external_reference: externalRef,
        user_id: userId,
        phone: phone || null,
        amount: amount || null,
        status: finalStatus,
        mpesa_receipt: mpesaReceipt || null,
        result_code: resultCode ?? null,
        result_desc: resultDesc || null,
        checkout_request_id: checkoutRequestId || null,
        raw_callback: body,
      });
      if (insertError) console.error("DB insert error:", insertError);
    }

    // If successful, update user balance
    if (isSuccess && userId) {
        try {
            const { data: profile, error: fetchError } = await supabase
                .from('profiles')
                .select('balance')
                .eq('id', userId)
                .single();

            if (!fetchError && profile) {
                const currentBalance = parseFloat(profile.balance || 0);
                const depositAmount = parseFloat(amount || 0);
                const newBalance = currentBalance + depositAmount;

                const { error: balanceError } = await supabase
                    .from('profiles')
                    .update({ balance: newBalance })
                    .eq('id', userId);
                
                if (balanceError) {
                    console.error("Failed to update balance:", balanceError);
                } else {
                    console.log(`Successfully updated balance for user ${userId} to ${newBalance}`);
                }
            }
        } catch (e) {
            console.error("Error in balance update flow:", e);
        }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Callback error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
