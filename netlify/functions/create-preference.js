// netlify/functions/create-preference.js
// Actualizado con sistema de cupones

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = process.env.SUPABASE_URL || 'https://wnuehkewxbpahfbemliz.supabase.co';
const SUPA_KEY = process.env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndudWVoa2V3eGJwYWhmYmVtbGl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM5Mjc1NDcsImV4cCI6MjA4OTUwMzU0N30.CQ_pICuiWPwUhMrsCl7csOzMZR3cYZuaLcMelJnnyRI';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { email, amount, currency, coupon_code, user_name } = JSON.parse(event.body);
    
    const supa = createClient(SUPA_URL, SUPA_KEY);
    let finalAmount = amount || 9990;
    let couponData = null;

    // Validar cupón si se proporcionó
    if (coupon_code && coupon_code.trim()) {
      const { data: coupon, error } = await supa
        .from('coupons')
        .select('*')
        .eq('code', coupon_code.trim().toUpperCase())
        .eq('active', true)
        .single();

      if (error || !coupon) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Cupón inválido o expirado.' })
        };
      }

      couponData = coupon;
      finalAmount = Math.max(100, amount - coupon.discount_amount); // Mínimo $100 CLP

      // Registrar uso del cupón (payment_confirmed = false hasta que pague)
      await supa.from('coupon_uses').insert({
        coupon_id: coupon.id,
        coupon_code: coupon.code,
        user_email: email,
        user_name: user_name || '',
        payment_confirmed: false,
        month_key: new Date().toISOString().slice(0, 7),
      });
    }

    // Crear preferencia en MercadoPago
    const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN;
    const BASE_URL = process.env.BASE_URL || 'https://mysuperfitness.netlify.app';

    const preference = {
      items: [{
        title: 'FitAI Pro - Acceso de por vida',
        quantity: 1,
        unit_price: finalAmount,
        currency_id: currency || 'CLP',
      }],
      payer: { email },
      back_urls: {
        success: `${BASE_URL}/app.html?payment=success&coupon=${coupon_code || ''}`,
        failure: `${BASE_URL}/app.html?payment=failure`,
        pending: `${BASE_URL}/app.html?payment=pending`,
      },
      auto_return: 'approved',
      external_reference: email,
      metadata: {
        user_email: email,
        coupon_code: coupon_code || null,
        original_amount: amount,
        final_amount: finalAmount,
      },
    };

    const mpRes = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      },
      body: JSON.stringify(preference),
    });

    const mpData = await mpRes.json();

    if (!mpData.init_point) {
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'Error al crear preferencia de pago.' })
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        initPoint: mpData.init_point,
        sandboxInitPoint: mpData.sandbox_init_point,
        finalAmount,
        discount: couponData ? couponData.discount_amount : 0,
      })
    };

  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: e.message })
    };
  }
};
