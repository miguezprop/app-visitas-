// Función de diagnóstico: NO se ejecuta sola, se llama a mano abriendo la URL.
//
// Ver los dispositivos registrados de una persona:
// https://profound-tanuki-709d8a.netlify.app/.netlify/functions/diagnostico?nombre=Alejo
//
// Además, mandarle un push de PRUEBA real a esos dispositivos y ver si Firebase
// lo acepta o lo rechaza (y por qué) — agregando &probar=true:
// https://profound-tanuki-709d8a.netlify.app/.netlify/functions/diagnostico?nombre=Alejo&probar=true
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

exports.handler = async (event) => {
  const params = event.queryStringParameters || {};
  const nombre = params.nombre || '';
  const probar = params.probar === 'true';

  if (!nombre) {
    return {
      statusCode: 400,
      body: 'Agregá ?nombre=Alejo (o el nombre que quieras revisar) al final de la URL.'
    };
  }

  const db = admin.firestore();
  const snap = await db.collection('dispositivos').where('nombre', '==', nombre).get();

  const dispositivos = [];
  for (const doc of snap.docs) {
    const d = doc.data();
    const info = {
      idDispositivo: doc.id,
      tieneToken: !!d.token,
      ultimaActualizacion: d.actualizado ? d.actualizado.toDate().toISOString() : null
    };

    if (probar && d.token) {
      try {
        await admin.messaging().send({
          token: d.token,
          notification: {
            title: 'Prueba de diagnóstico 🔧',
            body: 'Si te llegó esto, tu celular está recibiendo notificaciones bien.'
          },
          webpush: { notification: { icon: '/icono.png' }, fcmOptions: { link: '/' } }
        });
        info.resultadoPrueba = 'OK — Firebase aceptó el envío';
      } catch (err) {
        info.resultadoPrueba = 'ERROR: ' + err.message;
        info.codigoError = err.code || null;
      }
    }

    dispositivos.push(info);
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, cantidadDispositivosRegistrados: dispositivos.length, dispositivos }, null, 2)
  };
};
