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
    const { token, title, body } = JSON.parse(event.body || '{}');
    if (!token || !title || !body) {
      return { statusCode: 400, body: JSON.stringify({ error: 'Faltan datos (token, title o body)' }) };
    }

    await admin.messaging().send({
      token,
      notification: { title, body },
      webpush: {
        notification: { icon: '/icono.png' },
        fcmOptions: { link: '/' }
      }
    });

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
