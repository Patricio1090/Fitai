// netlify/functions/payment-webhook.js
// Webhook de MercadoPago - Confirma pago y notifica al influencer

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = process.env.SUPABASE_URL || 'https://wnuehkewxbpahfbemliz.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudWVoa2V3eGJwYWhmYmVtbGl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjc1NDcsImV4cCI6MjA4OTUwMzU0N30.CQ_pICuiWPwUhMrsCl7csOzMZR3cYZuaLcMelJnnyRI';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  try {
    const body = JSON.parse(event.body || '{}');
    
    // MercadoPago envía notificaciones con type = "payment"
    if (body.type !== 'payment' && body.action !== 'payment.created') {
      return { statusCode: 200, headers, body: 'OK' };
    }

    const paymentId = body.data?.id;
    if (!paymentId) return { statusCode: 200, headers, body: 'No payment ID' };

    // Consultar detalles del pago en MercadoPago
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const mpRes = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { 'Authorization': `Bearer ${MP_ACCESS_TOKEN}` }
    });
    const payment = await mpRes.json();

    if (payment.status !== 'approved') {
      return { statusCode: 200, headers, body: 'Payment not approved' };
    }

    const userEmail = payment.external_reference || payment.metadata?.user_email;
    const couponCode = payment.metadata?.coupon_code;

    if (!userEmail) return { statusCode: 200, headers, body: 'No user email' };

    const supa = createClient(SUPA_URL, SUPA_KEY);

    // Marcar usuario como pagado
    await supa.from('users').update({
      paid: true,
      paid_at: new Date().toISOString(),
    }).eq('email', userEmail);

    // Registrar pago
    await supa.from('payments').insert({
      user_email: userEmail,
      amount: payment.transaction_amount,
      currency: payment.currency_id || 'CLP',
      status: 'approved',
      mp_payment_id: paymentId.toString(),
      created_at: new Date().toISOString(),
    });

    // Si hay cupón, confirmar el uso y notificar al influencer
    if (couponCode) {
      // Marcar como pago confirmado
      await supa.from('coupon_uses').update({
        payment_confirmed: true,
        payment_confirmed_at: new Date().toISOString(),
      })
      .eq('user_email', userEmail)
      .eq('coupon_code', couponCode)
      .eq('payment_confirmed', false);

      // Obtener datos del cupón para enviar email
      const { data: coupon } = await supa
        .from('coupons')
        .select('*')
        .eq('code', couponCode)
        .single();

      if (coupon && coupon.influencer_email) {
        // Obtener nombre del usuario
        const { data: user } = await supa
          .from('users')
          .select('name')
          .eq('email', userEmail)
          .single();

        const userName = user?.name || userEmail;

        // Enviar email al influencer via Supabase Edge Function o servicio de email
        // Opción 1: Usar un servicio como Resend, SendGrid, etc.
        const RESEND_API_KEY = process.env.RESEND_API_KEY;
        
        if (RESEND_API_KEY) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${RESEND_API_KEY}`,
            },
            body: JSON.stringify({
              from: 'FitAI Pro <contacto@fitai.cl>',
              to: coupon.influencer_email,
              subject: `🎉 Tu cupón ${couponCode} fue utilizado - FitAI Pro`,
              html: `
                <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:20px">
                  <h2 style="color:#7c4dff">⚡ FitAI Pro - Notificación de Cupón</h2>
                  <p>Hola <strong>${coupon.influencer_name || 'Partner'}</strong>,</p>
                  <p>Te informamos que tu cupón <strong style="color:#c1ff4e;background:#1a1a2e;padding:4px 12px;border-radius:8px">${couponCode}</strong> fue utilizado y el pago fue confirmado.</p>
                  <div style="background:#f5f5f5;border-radius:12px;padding:16px;margin:16px 0">
                    <p><strong>Cliente:</strong> ${userName}</p>
                    <p><strong>Email:</strong> ${userEmail}</p>
                    <p><strong>Descuento aplicado:</strong> $${coupon.discount_amount.toLocaleString('es-CL')} CLP</p>
                    <p><strong>Monto pagado:</strong> $${payment.transaction_amount.toLocaleString('es-CL')} CLP</p>
                    <p><strong>Fecha:</strong> ${new Date().toLocaleDateString('es-CL', {dateStyle:'long'})}</p>
                  </div>
                  <p style="color:#666;font-size:13px">Este es un email automático de FitAI Pro.</p>
                </div>
              `
            })
          });
        }
      }
    }

    return { statusCode: 200, headers, body: 'OK - Payment processed' };

  } catch (e) {
    console.log('Webhook error:', e);
    return { statusCode: 200, headers, body: 'Error: ' + e.message };
  }
};
