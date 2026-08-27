// Se ejecuta cada 15 minutos (ver netlify.toml) y avisa a los responsables de las
// visitas de HOY que están por empezar en aproximadamente 1 hora. Marca cada visita
// avisada con recordatorioEnviado:true para no repetir el aviso en la próxima corrida.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

function ahoraArgentina() {
  // Argentina es UTC-3 todo el año (sin horario de verano).
  return new Date(Date.now() - 3 * 60 * 60 * 1000);
}

function fechaStr(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${dd}`;
}

exports.handler = async () => {
  const db = admin.firestore();
  const ahora = ahoraArgentina();
  const hoy = fechaStr(ahora);
  const minutosAhora = ahora.getUTCHours() * 60 + ahora.getUTCMinutes();

  const snap = await db.collection('visitas').where('fecha', '==', hoy).get();
  if (snap.empty) {
    return { statusCode: 200, body: 'Sin visitas hoy.' };
  }

  const avisos = [];

  snap.forEach(doc => {
    const v = doc.data();
    if (v.recordatorioEnviado || !v.hora || !v.responsable) return;

    const [hh, mm] = v.hora.split(':').map(Number);
    const minutosVisita = hh * 60 + mm;
    const faltan = minutosVisita - minutosAhora;

    // Ventana de 45 a 75 minutos antes, para cubrir bien la corrida de cada 15 min.
    if (faltan < 45 || faltan > 75) return;

    avisos.push((async () => {
      const dispDoc = await db.collection('dispositivos').doc(v.responsable).get();
      if (dispDoc.exists && dispDoc.data().token) {
        try {
          await admin.messaging().send({
            token: dispDoc.data().token,
            notification: {
              title: 'En 1 hora tenés visita ⏰',
              body: `${v.direccion} — ${v.hora}hs (${v.nombreInteresado || 'interesado'})`
            },
            webpush: { notification: { icon: '/icono.png' }, fcmOptions: { link: '/' } }
          });
        } catch (err) {
          console.warn(`No se pudo avisar a ${v.responsable}:`, err.message);
        }
      }
      await doc.ref.update({ recordatorioEnviado: true });
    })());
  });

  await Promise.all(avisos);
  return { statusCode: 200, body: JSON.stringify({ ok: true, avisosEnviados: avisos.length }) };
};
