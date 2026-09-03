// Se ejecuta todos los días a las 8:00 (hora Argentina) — ver horario en netlify.toml.
// Junta las visitas de HOY por responsable y le manda a cada uno un resumen.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

function fechaHoyArgentina() {
  // Argentina es UTC-3 todo el año (sin horario de verano).
  const ahoraArt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  const y = ahoraArt.getUTCFullYear();
  const m = String(ahoraArt.getUTCMonth() + 1).padStart(2, '0');
  const d = String(ahoraArt.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

exports.handler = async () => {
  const db = admin.firestore();
  const hoy = fechaHoyArgentina();

  const snap = await db.collection('visitas').where('fecha', '==', hoy).get();
  if (snap.empty) {
    return { statusCode: 200, body: 'Sin visitas hoy, no se manda nada.' };
  }

  const porResponsable = {};
  snap.forEach(doc => {
    const v = doc.data();
    if (!v.responsable) return;
    porResponsable[v.responsable] = (porResponsable[v.responsable] || 0) + 1;
  });

  const envios = Object.entries(porResponsable).map(async ([nombre, cantidad]) => {
    const dispSnap = await db.collection('dispositivos').where('nombre', '==', nombre).get();
    await Promise.all(dispSnap.docs.map(async dispDoc => {
      const token = dispDoc.data().token;
      if (!token) return;
      try {
        await admin.messaging().send({
          token,
          notification: {
            title: 'Buen día ☀️',
            body: `Hoy tenés ${cantidad} visita${cantidad === 1 ? '' : 's'} agendada${cantidad === 1 ? '' : 's'}.`
          },
          data: { idDispositivo: dispDoc.id },
          webpush: { notification: { icon: '/icono.png' }, fcmOptions: { link: '/' } }
        });
      } catch (err) {
        console.warn(`No se pudo avisar a ${nombre} (dispositivo ${dispDoc.id}):`, err.message);
      }
    }));
  });

  await Promise.all(envios);
  return { statusCode: 200, body: JSON.stringify({ ok: true, resumen: porResponsable }) };
};
