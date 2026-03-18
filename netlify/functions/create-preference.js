
const { MercadoPagoConfig, Preference } = require('mercadopago');

exports.handler = async (event) => {

  // Maneja CORS (necesario para que la app pueda llamar al backend)
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: '',
    };
  }

  const client = new MercadoPagoConfig({
    accessToken: process.env.MP_ACCESS_TOKEN,  // Tu Access Token (lo pones en Netlify)
  });

  const preference = new Preference(client);

  try {
    const { email, amount } = JSON.parse(event.body);

    const result = await preference.create({
      body: {
        items: [{
          id: 'fitai_pro_lifetime',
          title: 'FitAI Pro — Acceso de por vida',
          description: 'Entrenador personal con IA basado en ciencia de Harvard',
          quantity: 1,
          unit_price: amount || 4990,
          currency_id: 'CLP',
        }],
        payer: { email },
        back_urls: {
          success: process.env.APP_URL + '/app.html?payment=success',
          failure: process.env.APP_URL + '/app.html?payment=failure',
          pending: process.env.APP_URL + '/app.html?payment=pending',
        },
        auto_return: 'approved',
        metadata: { product: 'fitai_pro', email },
      }
    });

    return {
      statusCode: 200,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({
        preferenceId: result.id,
        initPoint: result.init_point,
        sandboxInitPoint: result.sandbox_init_point,
      }),
    };

  } catch (error) {
    console.error('MP Error:', error);
    return {
      statusCode: 500,
      headers: { 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
