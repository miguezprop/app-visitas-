// Resumen mensual de visitas por dirección (para los informes a propietarios).
// Uso: /visitas-resumen?mes=2026-11
// Devuelve solo direcciones y cantidades (sin nombres ni teléfonos).
// Cuenta las visitas agendadas en ese mes hasta hoy; las visitas borradas no cuentan (se toman como canceladas).
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

function hoyArgentina() {
  const f = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return f.toISOString().slice(0, 10);
}

exports.handler = async (event) => {
  const mes = String((event.queryStringParameters || {}).mes || '');
  if (!/^\d{4}-\d{2}$/.test(mes)) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta mes=YYYY-MM' }) };
  }
  try {
    const hoy = hoyArgentina();
    const snap = await admin.firestore().collection('visitas')
      .where('fecha', '>=', mes + '-01').where('fecha', '<=', mes + '-31').get();
    const porDir = {};
    snap.forEach(d => {
      const v = d.data();
      if (!v.fecha || v.fecha > hoy) return; // solo las que ya pasaron
      const dir = String(v.direccion || '').trim();
      if (!dir) return;
      const clave = dir.toLowerCase().replace(/\s+/g, ' ');
      const numeros = (dir.match(/\d+/g) || []).slice(0, 3);
      porDir[clave] = porDir[clave] || { direccion: dir, numeros, cantidad: 0 };
      porDir[clave].cantidad++;
    });
    const visitas = Object.values(porDir).sort((a, b) => b.cantidad - a.cantidad);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
      body: JSON.stringify({ mes, total: visitas.reduce((s, v) => s + v.cantidad, 0), visitas })
    };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
