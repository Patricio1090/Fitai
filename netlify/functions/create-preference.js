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
    const body        = JSON.parse(event.body || "{}");
    const userEmail   = body.user_email  || body.email  || "";
    const userId      = body.user_id     || body.userId || "";
    const couponCode  = (body.coupon_code || "").trim().toUpperCase();

    // ── Precio base configurable ─────────────────────────────────────
    const basePrice = parseInt(process.env.PRICE_CLP || "9990", 10);

    // ── Si hay cupón: buscar datos en Supabase ───────────────────────
    let finalPrice      = basePrice;
    let discountAmount  = 0;
    let influencerName  = null;
    let influencerEmail = null;

    if (couponCode) {
      try {
        const supaUrl = "https://wnuehkewxbpahfbemliz.supabase.co";
        const supaKey = process.env.SUPABASE_SERVICE_KEY || "sb_publishable_rfsNbbcySsAlxgH657MSKQ_niGvstWy";

        const res  = await fetch(
          `${supaUrl}/rest/v1/coupons?code=eq.${encodeURIComponent(couponCode)}&active=eq.true&select=discount_pct,discount_type,influencer_name,influencer_email`,
          { headers: { apikey: supaKey, Authorization: `Bearer ${supaKey}` } }
        );
        const data = await res.json();

        if (data && data.length > 0) {
          const c = data[0];
          influencerName  = c.influencer_name  || null;
          influencerEmail = c.influencer_email || null;

          if (c.discount_type === "percent") {
            discountAmount = Math.round(basePrice * (c.discount_pct / 100));
          } else {
            discountAmount = Math.min(c.discount_pct, basePrice);
          }
          finalPrice = Math.max(0, basePrice - discountAmount);
        }
      } catch (e) {
        console.warn("Error buscando cupón:", e.message);
      }
    }

    // ── URL base del sitio ───────────────────────────────────────────
    const siteUrl = "https://fitaipro.cl";

    // ── Crear preferencia en MercadoPago ────────────────────────────
    const client = new MercadoPagoConfig({
      accessToken: process.env.MP_ACCESS_TOKEN,
    });

    const preference = new Preference(client);

    const response = await preference.create({
      body: {
        items: [
          {
            title:       "FitAI Pro – Acceso de por vida",
            quantity:    1,
            currency_id: "CLP",
            unit_price:  finalPrice,
          },
        ],
        payer: { email: userEmail },

        // ── Metadata completo para el webhook ───────────────────────
        metadata: {
          user_id:          userId,
          user_email:       userEmail,
          coupon_code:      couponCode  || null,
          influencer_name:  influencerName,
          influencer_email: influencerEmail,
          discount_amount:  discountAmount,
          base_price:       basePrice,
          final_price:      finalPrice,
        },

        back_urls: {
          success: `${siteUrl}/app.html?payment=success`,
          failure: `${siteUrl}/app.html?payment=failure`,
          pending: `${siteUrl}/app.html?payment=pending`,
        },
        auto_return:      "approved",
        notification_url: `${siteUrl}/.netlify/functions/payment-webhook`,
      },
    });

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
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
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: err.message }),
    };
  }
};
