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
    const { token, title, body, idDispositivo } = JSON.parse(event.body || '{}');
    if (!token || !title || !body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos (token, title o body)' }) };
    }

    const db = admin.firestore();

    try {
      await admin.messaging().send({
        token,
        notification: { title, body },
        data: idDispositivo ? { idDispositivo } : {},
        webpush: {
          notification: { icon: '/icono.png' },
          fcmOptions: { link: '/' }
        }
      });
      if (idDispositivo) {
        await db.collection('dispositivos').doc(idDispositivo)
          .update({ ultimoIntentoEnvio: admin.firestore.FieldValue.serverTimestamp() }).catch(() => {});
      }
    } catch (errEnvio) {
      if (idDispositivo) {
        const actualizacion = { ultimoIntentoEnvio: admin.firestore.FieldValue.serverTimestamp() };
        if (errEnvio.code === 'messaging/registration-token-not-registered' || errEnvio.code === 'messaging/invalid-argument') {
          // El token ya no sirve del lado de Firebase: lo borramos para que se renueve
          // solo la próxima vez que esa persona abra la app en ese celular.
          actualizacion.token = admin.firestore.FieldValue.delete();
          actualizacion.tokenInvalido = true;
          actualizacion.tokenInvalidoEn = admin.firestore.FieldValue.serverTimestamp()
