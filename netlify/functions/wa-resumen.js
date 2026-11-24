// Resumen de consultas por WhatsApp de un mes, por código de propiedad.
// Uso: /wa-resumen?mes=2026-11   (mes calendario)
//      /wa-resumen?dias=30        (últimos N días, hasta ahora)  →  {"mes":"2026-11","consultas":{"MAP123":{"total":3,"ig":2,"pauta":1}}}
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
  const dias = parseInt(q.dias, 10);
  const porDias = dias > 0 && dias <= 366;
  if (!porDias && !/^\d{4}-\d{2}$/.test(mes)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta mes=YYYY-MM o dias=N' }) };
  }
  try {
    const col = admin.firestore().collection('clicsWhatsapp');
    const desde = new Date(Date.now() - (porDias ? dias : 0) * 86400000);
    const snap = porDias
      ? await col.where('fecha', '>=', admin.firestore.Timestamp.fromDate(desde)).get()
      : await col.where('mes', '==', mes).get();
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
      body: JSON.stringify(porDias ? { dias, desde: desde.toISOString(), hasta: new Date().toISOString(), consultas } : { mes, consultas })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
