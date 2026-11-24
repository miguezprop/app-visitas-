// Link de WhatsApp con seguimiento (informes a propietarios).
// Uso: /wa?p=CODIGO_TOKKO&o=ig|pauta|web|catalogo|otro&d=Dirección
// Registra la consulta en Firestore (colección "clicsWhatsapp") y abre el
// WhatsApp de la inmobiliaria con el mensaje ya escrito.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const TEL = '5492213142651';

function mesArgentina(fecha) {
  const f = new Date(fecha.getTime() - 3 * 60 * 60 * 1000); // UTC-3
  return f.getUTCFullYear() + '-' + String(f.getUTCMonth() + 1).padStart(2, '0');
}

exports.handler = async (event) => {
  const q = event.queryStringParameters || {};
  const codigo = String(q.p || '').trim().toUpperCase().slice(0, 40);
  const origen = String(q.o || 'directo').trim().toLowerCase().replace(/[^a-z]/g, '').slice(0, 20) || 'directo';
  const dir = String(q.d || '').trim().slice(0, 80);

  const texto = codigo
    ? 'Hola! Quiero consultar por la propiedad ' + (dir ? dir + ' (cód. ' + codigo + ')' : 'código ' + codigo)
    : 'Hola! Quiero hacer una consulta';
  const destino = 'https://wa.me/' + TEL + '?text=' + encodeURIComponent(texto);

  // No contar bots que previsualizan links (WhatsApp, Facebook, etc.)
  const ua = String((event.headers || {})['user-agent'] || '').toLowerCase();
  const esBot = /bot|crawler|spider|facebookexternalhit|whatsapp|preview|slack|telegram/.test(ua);

  if (codigo && !esBot) {
    try {
      const ahora = new Date();
      await admin.firestore().collection('clicsWhatsapp').add({
        codigo, origen, mes: mesArgentina(ahora),
        fecha: admin.firestore.FieldValue.serverTimestamp()
      });
    } catch (e) { /* si falla el registro, igual abrimos WhatsApp */ }
  }

  return { statusCode: 302, headers: { Location: destino, 'Cache-Control': 'no-store' }, body: '' };
};
