// ════════════════════════════════════════════════════════════
// FITAI PRO — ARCHIVO DE CONFIGURACIÓN
// ════════════════════════════════════════════════════════════
// Edita SOLO este archivo para cambiar precio, textos, etc.
// Los cambios se aplican automáticamente a la app.
// ════════════════════════════════════════════════════════════

const FITAI_CONFIG = {

  // ── PAGOS ─────────────────────────────────────────────────
  // Tu Public Key de MercadoPago (producción empieza con APP_USR-)
  MP_PUBLIC_KEY: 'APP_USR-ade94a33-3e1d-416d-9241-689ff63cba23',

  // URL de tu backend Netlify
  PAYMENT_ENDPOINT: 'https://mysuperfitness.netlify.app/.netlify/functions/create-preference',

  // Precio que ve el usuario (solo para mostrar)
  PRICE_DISPLAY: '$4.990',

  // Precio real en pesos (número sin puntos)
  PRICE_AMOUNT: 4990,

  // Moneda (CLP, USD, ARS, MXN, COP, BRL)
  CURRENCY: 'CLP',

  // Nombre de la moneda para mostrar
  CURRENCY_NAME: 'pesos chilenos',

  // ── IDIOMA ────────────────────────────────────────────────
  // Idioma por defecto al abrir la app (es, en, fr, pt)
  DEFAULT_LANG: 'es',

  // ── APP ───────────────────────────────────────────────────
  // Nombre de la app
  APP_NAME: 'FitAI Pro',

  // Garantía en días
  GUARANTEE_DAYS: 7,

  // ── TEXTOS DEL PAYWALL ────────────────────────────────────
  // Estos textos aparecen en la pantalla de pago (en español)
  // Los otros idiomas se traducen automáticamente
  PAYWALL_BADGE: 'ACCESO DE POR VIDA',
  PAYWALL_FEATURES: [
    'Plan de entrenamiento semanal con IA',
    'Plan de alimentación diario personalizado',
    'Seguimiento de progreso diario',
    'Análisis de IA y feedback científico',
    'Coach IA disponible 24/7',
    'App instalable en tu teléfono',
  ],

};
