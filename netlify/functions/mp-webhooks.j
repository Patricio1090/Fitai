// netlify/functions/mp-webhook.js
// Recibe notificaciones de MercadoPago y actualiza Supabase

const { createClient } = require('@supabase/supabase-js');

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const body = JSON.parse(event.body || '{}');
    console.log('MP Webhook received:', JSON.stringify(body));

    if (body.type !== 'payment') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const supa = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_KEY
    );

    const paymentId = body.data?.id;
    if (!paymentId) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const mpResponse = await fetch(
      `https://api.mercadopago.com/v1/payments/${paymentId}`,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );
    const payment = await mpResponse.json();

    if (payment.status !== 'approved') {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const email = payment.payer?.email;
    const amount = payment.transaction_amount;

    if (!email) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    await supa.from('users').update({
      paid: true,
      paid_at: new Date().toISOString(),
    }).eq('email', email);

    await supa.from('payments').insert({
      user_email: email,
      amount: amount,
      currency: payment.currency_id || 'CLP',
      mp_payment_id: String(paymentId),
      status: 'approved',
      created_at: new Date().toISOString(),
    });

    console.log(`✅ Pago registrado para ${email} - $${amount}`);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch (error) {
    console.error('Webhook error:', error);
    return { statusCode: 500, headers, body: JSON.stringify({ error: error.message }) };
  }
};
