const { MercadoPagoConfig, Preference } = require("mercadopago");

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
      body: "",
    };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const userEmail   = body.user_email || body.email || "";
    const userId      = body.user_id    || body.userId || "";
    const couponCode  = body.coupon_code || "";

    // ── Precio configurable desde env var ───────────────────────────────────
    const basePrice = parseInt(process.env.PRICE_CLP || "9990", 10);
    // ────────────────────────────────────────────────────────────────────────

    // Si viene cupón, calcular precio final leyendo Supabase directamente
    let finalPrice = basePrice;
    if (couponCode) {
      try {
        const supa_url = "https://wnuehkewxbpahfbemliz.supabase.co";
        const supa_key = process.env.SUPABASE_SERVICE_KEY || "sb_publishable_rfsNbbcySsAlxgH657MSKQ_niGvstWy";
        const res = await fetch(
          `${supa_url}/rest/v1/coupons?code=eq.${encodeURIComponent(couponCode.toUpperCase())}&active=eq.true&select=discount_pct,discount_type`,
          { headers: { apikey: supa_key, Authorization: `Bearer ${supa_key}` } }
        );
        const data = await res.json();
        if (data && data.length > 0) {
          const c = data[0];
          if (c.discount_type === "percent") {
            finalPrice = basePrice - Math.round(basePrice * (c.discount_pct / 100));
          } else {
            finalPrice = basePrice - Math.min(c.discount_pct, basePrice);
          }
          finalPrice = Math.max(0, finalPrice);
        }
      } catch (e) {
        console.warn("Error validando cupón en create-preference:", e.message);
      }
    }

    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const response = await preference.create({
      body: {
        items: [
          {
            title: "FitAI Pro – Acceso de por vida",
            quantity: 1,
            currency_id: "CLP",
            unit_price: finalPrice,
          },
        ],
        payer: { email: userEmail },
        metadata: { user_id: userId },
        back_urls: {
          success: `${process.env.URL}/app.html?payment=success`,
          failure: `${process.env.URL}/app.html?payment=failure`,
          pending: `${process.env.URL}/app.html?payment=pending`,
        },
        auto_return: "approved",
        notification_url: `${process.env.URL}/.netlify/functions/payment-webhook`,
      },
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      // La app busca init_point para redirigir al checkout de MercadoPago
      body: JSON.stringify({
        id:                 response.id,
        init_point:         response.init_point,
        sandbox_init_point: response.sandbox_init_point,
      }),
    };
  } catch (err) {
    console.error("Error creando preferencia:", err);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
