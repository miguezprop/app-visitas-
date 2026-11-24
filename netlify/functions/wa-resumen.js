// Resumen de consultas por WhatsApp de un mes, por código de propiedad.
// Uso: /wa-resumen?mes=2026-11  →  {"mes":"2026-11","consultas":{"MAP123":{"total":3,"ig":2,"pauta":1}}}
// Solo devuelve cantidades por código (sin datos de personas).
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const mes = String(q.mes || '');
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta mes=YYYY-MM' }) };
  }
  try {
    const snap = await admin.firestore().collection('clicsWhatsapp').where('mes', '==', mes).get();
    const consultas = {};
    snap.forEach(d => {
      const { codigo, origen } = d.data();
      if (!codigo) return;
      consultas[codigo] = consultas[codigo] || { total: 0 };
      consultas[codigo].total++;
      consultas[codigo][origen || 'directo'] = (consultas[codigo][origen || 'directo'] || 0) + 1;
    });
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ mes, consultas })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
