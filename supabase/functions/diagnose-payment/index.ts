// Supabase Edge Function: diagnose-payment
// Secure Server-Side Groq API Integration for PayRescue AI Diagnosis Layer

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SYSTEM_PROMPT = `You are the PayRescue AI Payment Failure Diagnosis Assistant.
Your sole job is to analyze checkout payment failure technical metadata and produce a structured root-cause diagnosis, failure classification, confidence score, reasoning, and customer recovery draft message.

RULES:
1. You MUST respond with strictly valid JSON only. Do not include markdown code block syntax (no \`\`\`json), commentary, or extra text.
2. The JSON schema MUST match:
{
  "root_cause": "brief_technical_root_cause_identifier",
  "category": "retryable | insufficient_funds | invalid_payment_method | authentication_failure | risk_failure | unknown",
  "confidence": 0.95,
  "reasoning": "Detailed, professional technical analysis of the failure.",
  "message": "Empathetic, clear, non-technical customer recovery message draft."
}
3. The category MUST be exactly one of:
   - retryable: bank timeouts, gateway errors, network glitches
   - insufficient_funds: customer balance issues
   - invalid_payment_method: card expired, instrument blocked
   - authentication_failure: 3DS/OTP auth failed, incorrect CVV
   - risk_failure: payment risk check / fraud triggers
   - unknown: insufficient or ambiguous information
4. Confidence MUST be a decimal float between 0.00 and 1.00.
5. You MUST NEVER instruct or decide payment execution, status changes, or retry counts. Only classify and diagnose.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GROQ_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "GROQ_API_KEY secret not configured in Supabase Edge Function environment." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload = await req.json();

    const userPrompt = `Analyze the following failed transaction:
- Payment Method: ${payload.method}
- Amount: ₹${(payload.amount_paise / 100).toFixed(2)} (${payload.amount_paise} paise)
- Error Code: ${payload.error_code}
- Error Reason: ${payload.error_reason}
- Error Source: ${payload.error_source}
- Current Attempt: ${payload.attempts} of ${payload.max_attempts}
${payload.customer_name ? `- Customer: ${payload.customer_name}` : ""}

Provide the structured JSON diagnosis payload.`;

    const groqResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b", // Groq GPT-OSS 120B model
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error("Groq API Error Response:", errText);
      return new Response(
        JSON.stringify({ error: `Groq API responded with status ${groqResponse.status}: ${errText}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const groqData = await groqResponse.json();
    const contentText = groqData.choices?.[0]?.message?.content;

    if (!contentText) {
      return new Response(
        JSON.stringify({ error: "Empty response content from Groq model." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON
    const parsedData = JSON.parse(contentText);

    return new Response(
      JSON.stringify(parsedData),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Edge Function Exception:", err.message);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error in Edge Function." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
