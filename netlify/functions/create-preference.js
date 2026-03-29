// netlify/functions/create-preference.js
const { MercadoPagoConfig, Preference } = require("mercadopago");

const SUPABASE_URL  = "https://wnuehkewxbpahfbemliz.supabase.co";
const SUPABASE_ANON = "sb_publishable_rfsNbbcySsAlxgH657MSKQ_niGvstWy";

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) throw new Error("MP_ACCESS_TOKEN no configurado");

    // Nueva API de MercadoPago SDK v2+
    const client = new MercadoPagoConfig({ accessToken });
    const preferenceClient = new Preference(client);

    const body = JSON.parse(event.body || "{}");
    const { user_id, user_email, coupon_code } = body;

    if (!user_id || !user_email) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Faltan user_id o user_email" }) };
    }

    let finalPrice = 9990, discountAmount = 0, couponData = null;

    // Validar cupón
    if (coupon_code && coupon_code.trim() !== "") {
      const upperCode = coupon_code.trim().toUpperCase();
      const couponRes = await fetch(
        `${SUPABASE_URL}/rest/v1/coupons?code=eq.${encodeURIComponent(upperCode)}&active=eq.true&select=*`,
        { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }
      );
      const coupons = await couponRes.json();
      if (coupons && coupons.length > 0) {
        couponData = coupons[0];
        if (couponData.discount_type === "percent") {
          discountAmount = Math.round(finalPrice * (couponData.discount_pct / 100));
        } else {
          discountAmount = Math.min(couponData.discount_pct, finalPrice);
        }
        finalPrice = Math.max(1, finalPrice - discountAmount);
      }
    }

    const appUrl    = process.env.APP_URL || "https://mysuperfitness.netlify.app";
    const itemTitle = discountAmount > 0
      ? `FitAI Pro – Acceso de por vida (cupón ${coupon_code.toUpperCase()})`
      : "FitAI Pro – Acceso de por vida";

    const response = await preferenceClient.create({
      body: {
        items: [{ title: itemTitle, unit_price: finalPrice, quantity: 1, currency_id: "CLP" }],
        payer: { email: user_email },
        metadata: {
          user_id,
          user_email,
          coupon_code:      couponData ? couponData.code             : null,
          influencer_name:  couponData ? couponData.influencer_name  : null,
          influencer_email: couponData ? couponData.influencer_email : null,
          discount_amount:  discountAmount,
          final_price:      finalPrice,
        },
        back_urls: {
          success: `${appUrl}/app.html?payment=success`,
          failure: `${appUrl}/app.html?payment=failure`,
          pending: `${appUrl}/app.html?payment=pending`,
        },
        auto_return: "approved",
        notification_url: `${appUrl}/.netlify/functions/mp-webhooks`,
      }
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        init_point:      response.init_point,
        preference_id:   response.id,
        final_price:     finalPrice,
        discount_amount: discountAmount,
        coupon_applied:  !!couponData,
      }),
    };
  } catch (err) {
    console.error("create-preference error:", err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
