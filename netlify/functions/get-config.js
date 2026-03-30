exports.handler = async () => {
  const priceCLP = parseInt(process.env.PRICE_CLP || "9990", 10);

  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
    },
    body: JSON.stringify({
      price_clp: priceCLP,
      price_display: `$${priceCLP.toLocaleString("es-CL")}`,   // "$9.990"
      currency: "CLP",
    }),
  };
};
