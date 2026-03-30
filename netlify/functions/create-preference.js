const { MercadoPagoConfig, Preference } = require("mercadopago");

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const userEmail = body.email || "";
    const userId   = body.userId || "";

    // ── Precio configurable ──────────────────────────────────────────────────
    const priceCLP = parseInt(process.env.PRICE_CLP || "9990", 10);
    // ────────────────────────────────────────────────────────────────────────

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
            unit_price: priceCLP,
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
      body: JSON.stringify({ id: response.id }),
    };
  } catch (err) {
    console.error("Error creando preferencia:", err);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
