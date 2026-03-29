// netlify/functions/mp-webhooks.js
const SUPABASE_URL  = "https://wnuehkewxbpahfbemliz.supabase.co";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON = "sb_publishable_rfsNbbcySsAlxgH657MSKQ_niGvstWy";
const RESEND_KEY    = process.env.RESEND_API_KEY;

const headers = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

function supaKey() { return SERVICE_KEY || SUPABASE_ANON; }

async function supaPost(table, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supaKey(),
      Authorization: `Bearer ${supaKey()}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error(`supaPost ${table} error:`, txt);
  }
  return res.ok;
}

async function supaPatch(table, filter, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      apikey: supaKey(),
      Authorization: `Bearer ${supaKey()}`,
      Prefer: "return=minimal",
    },
    body: JSON.stringify(body),
  });
  return res.ok;
}

async function sendInfluencerEmail({ influencer_email, influencer_name, coupon_code, client_email, discount_amount, final_price }) {
  if (!RESEND_KEY || !influencer_email) {
    console.log("Email omitido — sin RESEND_KEY o sin influencer_email");
    return;
  }
  try {
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${RESEND_KEY}` },
      body: JSON.stringify({
        from: "FitAI Pro <notificaciones@mysuperfitness.cl>",
        to: [influencer_email],
        subject: `🎉 ¡Alguien usó tu cupón ${coupon_code}!`,
        html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0b0b1a;color:#e8e8f0;padding:32px;border-radius:16px">
          <h1 style="color:#a78bfa">⚡ FitAI Pro</h1>
          <h2>¡Nuevo cliente con tu cupón!</h2>
          <p>Hola <strong>${influencer_name}</strong>,</p>
          <p>El cliente <strong style="color:#a78bfa">${client_email}</strong> pagó usando tu código:</p>
          <div style="text-align:center;margin:20px 0">
            <span style="background:#a78bfa20;color:#a78bfa;padding:8px 20px;border-radius:20px;font-size:18px;font-weight:800">${coupon_code}</span>
          </div>
          <p>💸 Descuento aplicado: <strong>$${Number(discount_amount).toLocaleString("es-CL")} CLP</strong></p>
          <p>✅ Precio final pagado: <strong style="color:#00e676">$${Number(final_price).toLocaleString("es-CL")} CLP</strong></p>
        </div>`,
      }),
    });
    console.log("Email influencer status:", r.status);
  } catch (err) {
    console.error("Error email influencer:", err.message);
  }
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };

  try {
    // Log del body completo para debug
    console.log("Webhook body:", event.body);

    const body = JSON.parse(event.body || "{}");
    const { type, data } = body;

    console.log("Webhook type:", type, "data:", JSON.stringify(data));

    // MP puede enviar type="payment" o action="payment.updated"
    const paymentId = data?.id;
    if (!paymentId) {
      console.log("Sin payment id, ignorando");
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) throw new Error("MP_ACCESS_TOKEN no configurado");

    // Obtener pago desde MP
    const mpRes  = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payment = await mpRes.json();

    console.log("MP payment status:", payment.status);
    console.log("MP transaction_amount:", payment.transaction_amount);
    console.log("MP metadata raw:", JSON.stringify(payment.metadata));

    if (!mpRes.ok || !payment.id) {
      console.error("Error obteniendo pago de MP:", payment);
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const status = (payment.status || "").toLowerCase();

    // MP convierte metadata keys a snake_case pero a veces los normaliza
    // Intentar todas las variantes posibles
    const meta = payment.metadata || {};
    const userId        = meta.user_id        || meta.userId        || payment.external_reference || null;
    const userEmail     = meta.user_email     || meta.userEmail     || payment.payer?.email       || null;
    const couponCode    = meta.coupon_code    || meta.couponCode    || null;
    const influencerName  = meta.influencer_name  || meta.influencerName  || null;
    const influencerEmail = meta.influencer_email || meta.influencerEmail || null;
    const discountAmount  = meta.discount_amount  || meta.discountAmount  || 0;

    // Usar SIEMPRE el monto real de MercadoPago
    const realAmount = payment.transaction_amount || 0;

    console.log(`userId:${userId} userEmail:${userEmail} coupon:${couponCode} amount:${realAmount}`);

    // Guardar pago con monto REAL
    await supaPost("payments", {
      user_id:            userId,
      user_email:         userEmail,
      mp_payment_id:      String(payment.id),
      status:             status,
      amount:             realAmount,
      transaction_amount: realAmount,
      currency_id:        payment.currency_id || "CLP",
      created_at:         new Date().toISOString(),
    });

    if (status === "approved") {
      // Marcar usuario como pagado
      if (userId) await supaPatch("users", `id=eq.${userId}`, { paid: true, paid_at: new Date().toISOString() });
      if (userEmail) await supaPatch("users", `email=eq.${encodeURIComponent(userEmail)}`, { paid: true, paid_at: new Date().toISOString() });

      // Registrar uso del cupón
      if (couponCode) {
        const finalPrice = realAmount; // monto real pagado
        
        await supaPost("coupon_uses", {
          coupon_code:      couponCode,
          influencer_name:  influencerName,
          user_id:          userId,
          user_email:       userEmail,
          discount_amount:  Number(discountAmount),
          final_price:      finalPrice,
          mp_payment_id:    String(payment.id),
          created_at:       new Date().toISOString(),
        });

        await sendInfluencerEmail({
          influencer_email: influencerEmail,
          influencer_name:  influencerName,
          coupon_code:      couponCode,
          client_email:     userEmail,
          discount_amount:  Number(discountAmount),
          final_price:      finalPrice,
        });

        console.log(`✅ Cupón ${couponCode} registrado — pago $${finalPrice}`);
      } else {
        console.log("Sin cupón en este pago");
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error("mp-webhooks error:", err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, error: err.message }) };
  }
};
