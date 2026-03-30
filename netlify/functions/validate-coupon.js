// netlify/functions/validate-coupon.js
// Validar un cupón desde el app (usa clave anon — solo lectura de cupones activos)
const SUPABASE_URL = "https://wnuehkewxbpahfbemliz.supabase.co";
const SUPABASE_KEY = "sb_publishable_rfsNbbcySsAlxgH657MSKQ_niGvstWy";
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
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  }
  try {
    const { code } = JSON.parse(event.body || "{}");
    if (!code || code.trim() === "") {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ valid: false, error: "Código vacío" }),
      };
    }
    const upperCode = code.trim().toUpperCase();
    // Buscar cupón activo en Supabase (RLS permite lectura pública de activos)
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/coupons?code=eq.${encodeURIComponent(upperCode)}&active=eq.true&select=code,influencer_name,discount_pct,discount_type`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    const data = await res.json();
    if (!res.ok || !data || data.length === 0) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ valid: false, error: "Cupón no válido o expirado" }),
      };
    }
    const coupon = data[0];

    // ── Precio base configurable desde variable de entorno ──────────────────
    const basePrice = parseInt(process.env.PRICE_CLP || "9990", 10);
    // ────────────────────────────────────────────────────────────────────────

    let discountAmount = 0;
    let finalPrice = basePrice;
    if (coupon.discount_type === "percent") {
      discountAmount = Math.round(basePrice * (coupon.discount_pct / 100));
      finalPrice = basePrice - discountAmount;
    } else {
      // discount_type === 'amount' (en CLP)
      discountAmount = Math.min(coupon.discount_pct, basePrice);
      finalPrice = basePrice - discountAmount;
    }
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        valid: true,
        code: coupon.code,
        influencer_name: coupon.influencer_name,
        discount_type: coupon.discount_type,
        discount_value: coupon.discount_pct,
        discount_amount: discountAmount,  // cuánto se ahorra en CLP
        final_price: Math.max(0, finalPrice), // precio final en CLP
        message:
          coupon.discount_type === "percent"
            ? `¡Cupón válido! ${coupon.discount_pct}% de descuento`
            : `¡Cupón válido! $${coupon.discount_pct.toLocaleString("es-CL")} de descuento`,
      }),
    };
  } catch (err) {
    console.error("validate-coupon error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ valid: false, error: "Error interno del servidor" }),
    };
  }
};
