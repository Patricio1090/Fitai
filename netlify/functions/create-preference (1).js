// netlify/functions/create-preference.js
// Crea preferencia de pago en MercadoPago con soporte de cupones

const mercadopago = require("mercadopago");

const SUPABASE_URL  = "https://wnuehkewxbpahfbemliz.supabase.co";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
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
    // ── MercadoPago: usar MP_ACCESS_TOKEN directo ─────────────────
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) throw new Error("MP_ACCESS_TOKEN no configurado");
    mercadopago.configure({ access_token: accessToken });

    const body = JSON.parse(event.body || "{}");
    const { user_id, user_email, coupon_code } = body;

    if (!user_id || !user_email) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Faltan user_id o user_email" }),
      };
    }

    let finalPrice     = 9990;
    let discountAmount = 0;
    let couponData     = null;

    // ── Validar cupón si fue ingresado ─────────────────────────────
    if (coupon_code && coupon_code.trim() !== "") {
      const upperCode = coupon_code.trim().toUpperCase();

      const couponRes = await fetch(
        `${SUPABASE_URL}/rest/v1/coupons?code=eq.${encodeURIComponent(upperCode)}&active=eq.true&select=*`,
        {
          headers: {
            apikey: SUPABASE_ANON,
            Authorization: `Bearer ${SUPABASE_ANON}`,
          },
        }
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

    // ── Construir preferencia ──────────────────────────────────────
    const appUrl    = process.env.APP_URL || "https://mysuperfitness.netlify.app";
    const itemTitle = discountAmount > 0
      ? `FitAI Pro – Acceso de por vida (cupón ${coupon_code.toUpperCase()})`
      : "FitAI Pro – Acceso de por vida";

    const preference = {
      items: [{ title: itemTitle, unit_price: finalPrice, quantity: 1, currency_id: "CLP" }],
      payer: { email: user_email },
      metadata: {
        user_id,
        coupon_code: coupon_code ? coupon_code.toUpperCase() : null,
        original_price: 9990,
        discount_amount: discountAmount,
        final_price: finalPrice,
      },
      back_urls: {
        success: `${appUrl}/app.html?payment=success`,
        failure: `${appUrl}/app.html?payment=failure`,
        pending: `${appUrl}/app.html?payment=pending`,
      },
      auto_return: "approved",
      notification_url: `${appUrl}/.netlify/functions/payment-webhook`,
    };

    const response = await mercadopago.preferences.create(preference);

    // ── Registrar uso del cupón ────────────────────────────────────
    if (couponData) {
      const key = SERVICE_KEY || SUPABASE_ANON;
      await fetch(`${SUPABASE_URL}/rest/v1/coupon_uses`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: key,
          Authorization: `Bearer ${key}`,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          coupon_code: couponData.code,
          influencer_name: couponData.influencer_name,
          user_id,
        }),
      });
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        init_point: response.body.init_point,
        preference_id: response.body.id,
        final_price: finalPrice,
        discount_amount: discountAmount,
        coupon_applied: !!couponData,
      }),
    };

  } catch (err) {
    console.error("create-preference error:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
