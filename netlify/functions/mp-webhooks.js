// netlify/functions/mp-webhooks.js
// Webhook de MercadoPago — registra pago, uso de cupón y notifica al influencer

const SUPABASE_URL  = "https://wnuehkewxbpahfbemliz.supabase.co";
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_KEY;
const SUPABASE_ANON = "sb_publishable_rfsNbbcySsAlxgH657MSKQ_niGvstWy";
const RESEND_KEY    = process.env.RESEND_API_KEY;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
};

function supaKey() {
  return SERVICE_KEY || SUPABASE_ANON;
}

async function supaGet(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    headers: { apikey: supaKey(), Authorization: `Bearer ${supaKey()}` },
  });
  return res.json();
}

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

// ── Enviar email al influencer via Resend ─────────────────
async function sendInfluencerEmail({ influencer_email, influencer_name, coupon_code, client_email, discount_amount, final_price }) {
  if (!RESEND_KEY || !influencer_email) return;

  const discount_fmt = `$${Number(discount_amount).toLocaleString("es-CL")} CLP`;
  const final_fmt    = `$${Number(final_price).toLocaleString("es-CL")} CLP`;

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: "FitAI Pro <notificaciones@mysuperfitness.cl>",
        to:   [influencer_email],
        subject: `🎉 ¡Alguien usó tu cupón ${coupon_code}!`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0b0b1a;color:#e8e8f0;padding:32px;border-radius:16px">
            <h1 style="font-size:24px;color:#a78bfa;margin-bottom:8px">⚡ FitAI Pro</h1>
            <h2 style="font-size:18px;font-weight:700;margin-bottom:24px">¡Nuevo cliente con tu cupón!</h2>

            <div style="background:#12122a;border-radius:12px;padding:20px;margin-bottom:20px">
              <p style="font-size:14px;color:#8b8fa8;margin-bottom:4px">Hola <strong style="color:#fff">${influencer_name}</strong>,</p>
              <p style="font-size:14px;margin-top:12px">
                El cliente <strong style="color:#a78bfa">${client_email}</strong> acaba de completar su pago usando tu código de descuento:
              </p>
              <div style="text-align:center;margin:20px 0">
                <span style="background:#a78bfa20;color:#a78bfa;padding:8px 20px;border-radius:20px;font-size:18px;font-weight:800;letter-spacing:2px">${coupon_code}</span>
              </div>
            </div>

            <div style="background:#12122a;border-radius:12px;padding:20px;margin-bottom:20px">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="color:#8b8fa8;font-size:13px">Descuento aplicado</span>
                <span style="color:#f43f5e;font-weight:700">- ${discount_fmt}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="color:#8b8fa8;font-size:13px">Precio final pagado</span>
                <span style="color:#00e676;font-weight:700">${final_fmt}</span>
              </div>
            </div>

            <p style="font-size:12px;color:#555;text-align:center;margin-top:24px">
              Puedes ver todas las estadísticas de tu cupón en el panel de FitAI Pro.
            </p>
          </div>
        `,
      }),
    });
    console.log(`Email enviado a influencer: ${influencer_email}`);
  } catch (err) {
    console.error("Error enviando email al influencer:", err.message);
  }
}

// ── Handler principal ─────────────────────────────────────
exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const { type, data } = body;

    // MP envía type="payment" con data.id
    if (type !== "payment" || !data?.id) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    // Obtener detalles del pago desde MP
    const accessToken = process.env.MP_ACCESS_TOKEN;
    if (!accessToken) throw new Error("MP_ACCESS_TOKEN no configurado");

    const mpRes  = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const payment = await mpRes.json();

    if (!mpRes.ok || !payment.id) {
      return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
    }

    const status   = (payment.status || "").toLowerCase();
    const meta     = payment.metadata || {};
    const userId   = meta.user_id   || payment.external_reference || null;
    const userEmail= meta.user_email || payment.payer?.email || null;

    // Guardar el pago en Supabase
    await supaPost("payments", {
      user_id:          userId,
      user_email:       userEmail,
      mp_payment_id:    String(payment.id),
      status:           status,
      amount:           payment.transaction_amount,
      transaction_amount: payment.transaction_amount,
      currency_id:      payment.currency_id || "CLP",
      created_at:       new Date().toISOString(),
    });

    // Si el pago fue aprobado
    if (status === "approved") {

      // Marcar usuario como pagado
      if (userId) {
        await supaPatch("users", `id=eq.${userId}`, { paid: true, paid_at: new Date().toISOString() });
      }
      if (userEmail) {
        await supaPatch("users", `email=eq.${encodeURIComponent(userEmail)}`, { paid: true, paid_at: new Date().toISOString() });
      }

      // ── Registrar uso del cupón SOLO si el pago fue aprobado ──
      const couponCode      = meta.coupon_code       || null;
      const influencerName  = meta.influencer_name   || null;
      const influencerEmail = meta.influencer_email  || null;
      const discountAmount  = meta.discount_amount   || 0;
      const finalPrice      = meta.final_price       || payment.transaction_amount;

      if (couponCode) {
        // Insertar uso del cupón
        await supaPost("coupon_uses", {
          coupon_code:      couponCode,
          influencer_name:  influencerName,
          user_id:          userId,
          user_email:       userEmail,
          discount_amount:  discountAmount,
          final_price:      finalPrice,
          mp_payment_id:    String(payment.id),
          created_at:       new Date().toISOString(),
        });

        // Enviar email al influencer
        await sendInfluencerEmail({
          influencer_email: influencerEmail,
          influencer_name:  influencerName,
          coupon_code:      couponCode,
          client_email:     userEmail,
          discount_amount:  discountAmount,
          final_price:      finalPrice,
        });

        console.log(`Cupón ${couponCode} registrado para usuario ${userEmail}`);
      }
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };

  } catch (err) {
    console.error("mp-webhooks error:", err.message);
    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, error: err.message }) };
  }
};
