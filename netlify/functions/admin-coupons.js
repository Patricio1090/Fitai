// netlify/functions/admin-coupons.js
// Gestión de cupones para el admin — usa SUPABASE_SERVICE_KEY
// Agregar en Netlify > Environment Variables: SUPABASE_SERVICE_KEY

const SUPABASE_URL = "https://wnuehkewxbpahfbemliz.supabase.co";

// Llave de servicio (bypassa RLS) — debe estar en env vars de Netlify
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const headers = {
  "Content-Type": "application/json",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
};

async function supabaseRequest(path, method = "GET", body = null) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      "apikey": SERVICE_KEY,
      "Authorization": `Bearer ${SERVICE_KEY}`,
      "Prefer": method === "POST" ? "return=representation" : "",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(`${res.status}: ${JSON.stringify(data)}`);
  }
  return data;
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  // Verificar que solo el admin pueda llamar esta función
  const authHeader = event.headers["x-admin-key"] || "";
  if (authHeader !== process.env.ADMIN_SECRET_KEY) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ error: "No autorizado" }),
    };
  }

  try {
    // ── GET: listar todos los cupones con estadísticas ────────────────
    if (event.httpMethod === "GET") {
      const coupons = await supabaseRequest(
        "/coupons?select=*&order=created_at.desc"
      );

      // Para cada cupón, obtener usos desde coupon_uses
      const codesParam = coupons.map((c) => `"${c.code}"`).join(",");
      let uses = [];
      if (coupons.length > 0) {
        uses = await supabaseRequest(
          `/coupon_uses?select=coupon_code,user_id,created_at`
        );
      }

      // Obtener pagos para cruzar con usos
      const payments = await supabaseRequest(
        `/payments?select=user_id,status,transaction_amount,created_at`
      );

      const paidUserIds = new Set(
        payments
          .filter((p) => p.status === "approved")
          .map((p) => p.user_id)
      );

      // Calcular mes actual
      const now = new Date();
      const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;

      const result = coupons.map((coupon) => {
        const couponUses = uses.filter((u) => u.coupon_code === coupon.code);
        const thisMonthUses = couponUses.filter((u) =>
          u.created_at.startsWith(thisMonth)
        );
        const paidUses = couponUses.filter((u) => paidUserIds.has(u.user_id));

        // Calcular ingresos: precio base $9990 menos descuento
        const basePrice = 9990;
        let ingresos = 0;
        paidUses.forEach(() => {
          if (coupon.discount_type === "percent") {
            ingresos += basePrice * (1 - coupon.discount_pct / 100);
          } else {
            ingresos += Math.max(0, basePrice - coupon.discount_pct);
          }
        });

        return {
          ...coupon,
          usos_totales: couponUses.length,
          usos_mes: thisMonthUses.length,
          pagaron: paidUses.length,
          ingresos: Math.round(ingresos),
        };
      });

      return { statusCode: 200, headers, body: JSON.stringify(result) };
    }

    // ── POST: crear cupón ────────────────────────────────────────────
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body);
      const { code, influencer_name, discount_pct, discount_type } = body;

      if (!code || !influencer_name || discount_pct === undefined) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Faltan campos requeridos" }),
        };
      }

      if (discount_pct <= 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "El descuento debe ser mayor a 0" }),
        };
      }

      if (discount_type === "percent" && discount_pct > 100) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "El descuento % no puede superar 100" }),
        };
      }

      const newCoupon = await supabaseRequest("/coupons", "POST", {
        code: code.toUpperCase().trim(),
        influencer_name: influencer_name.trim(),
        discount_pct: Number(discount_pct),
        discount_type: discount_type || "percent",
        active: true,
      });

      return {
        statusCode: 201,
        headers,
        body: JSON.stringify(newCoupon),
      };
    }

    // ── DELETE: desactivar cupón ─────────────────────────────────────
    if (event.httpMethod === "DELETE") {
      const { code } = JSON.parse(event.body);
      if (!code) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: "Falta el código del cupón" }),
        };
      }

      await supabaseRequest(
        `/coupons?code=eq.${encodeURIComponent(code)}`,
        "DELETE"
      );

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ success: true }),
      };
    }

    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Método no permitido" }),
    };
  } catch (err) {
    console.error("admin-coupons error:", err.message);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
