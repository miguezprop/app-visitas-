// El service worker de cada celular llama a esta función solo, en segundo plano,
// cada vez que le llega un aviso de verdad — no hace falta que la persona toque nada.
// Así queda registrado en "dispositivos" cuándo fue la última vez que ese aparato
// confirmó estar recibiendo notificaciones.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }

  try {
    const { idDispositivo } = JSON.parse(event.body || '{}');
    if (!idDispositivo) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Falta idDispositivo' }) };
    }

    const db = admin.firestore();
    await db.collection('dispositivos').doc(idDispositivo).set({
      ultimaConfirmacionRecibida: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
