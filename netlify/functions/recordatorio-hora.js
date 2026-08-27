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

  console.log(`[recordatorio-hora] hoy=${hoy} horaArgentinaAhora=${ahora.getUTCHours()}:${String(ahora.getUTCMinutes()).padStart(2,'0')}`);

  const snap = await db.collection('visitas').where('fecha', '==', hoy).get();
  console.log(`[recordatorio-hora] visitas encontradas para hoy: ${snap.size}`);
  if (snap.empty) {
    return { statusCode: 200, body: 'Sin visitas hoy.' };
  }

  const avisos = [];

  snap.forEach(doc => {
    const v = doc.data();

    if (v.recordatorioEnviado || !v.hora || !v.responsable) {
      console.log(`[recordatorio-hora] SALTEADA doc=${doc.id} responsable=${v.responsable} hora=${v.hora} recordatorioEnviado=${v.recordatorioEnviado}`);
      return;
    }

    const [hh, mm] = v.hora.split(':').map(Number);
    const minutosVisita = hh * 60 + mm;
    const faltan = minutosVisita - minutosAhora;

    console.log(`[recordatorio-hora] doc=${doc.id} responsable=${v.responsable} hora=${v.hora} faltan=${faltan}min`);

    // Ventana de 45 a 75 minutos antes, para cubrir bien la corrida de cada 15 min.
    if (faltan < 45 || faltan > 75) {
      console.log(`[recordatorio-hora] fuera de ventana (necesita estar entre 45 y 75) -> no se avisa todavía`);
      return;
    }

    avisos.push((async () => {
      const dispDoc = await db.collection('dispositivos').doc(v.responsable).get();
      console.log(`[recordatorio-hora] dispositivo de "${v.responsable}" existe=${dispDoc.exists} tieneToken=${!!(dispDoc.exists && dispDoc.data().token)}`);
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
          console.log(`[recordatorio-hora] push enviado OK a ${v.responsable}`);
        } catch (err) {
          console.warn(`[recordatorio-hora] No se pudo avisar a ${v.responsable}:`, err.message);
        }
      }
      await doc.ref.update({ recordatorioEnviado: true });
    })());
  });

  await Promise.all(avisos);
  console.log(`[recordatorio-hora] avisosEnviados=${avisos.length}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, avisosEnviados: avisos.length }) };
};
