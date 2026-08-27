// Se ejecuta cada 15 minutos (ver netlify.toml) y avisa a los responsables de las
// visitas de HOY que están por empezar en aproximadamente 2 horas. Usa su propio
// campo (recordatorio2hEnviado) para no interferir con el aviso de 1 hora antes.
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

  console.log(`[recordatorio-2horas] hoy=${hoy} horaArgentinaAhora=${ahora.getUTCHours()}:${String(ahora.getUTCMinutes()).padStart(2,'0')}`);

  const snap = await db.collection('visitas').where('fecha', '==', hoy).get();
  console.log(`[recordatorio-2horas] visitas encontradas para hoy: ${snap.size}`);
  if (snap.empty) {
    return { statusCode: 200, body: 'Sin visitas hoy.' };
  }

  const avisos = [];

  snap.forEach(doc => {
    const v = doc.data();

    if (v.recordatorio2hEnviado || !v.hora || !v.responsable) {
      console.log(`[recordatorio-2horas] SALTEADA doc=${doc.id} responsable=${v.responsable} hora=${v.hora} recordatorio2hEnviado=${v.recordatorio2hEnviado}`);
      return;
    }

    const [hh, mm] = v.hora.split(':').map(Number);
    const minutosVisita = hh * 60 + mm;
    const faltan = minutosVisita - minutosAhora;

    console.log(`[recordatorio-2horas] doc=${doc.id} responsable=${v.responsable} hora=${v.hora} faltan=${faltan}min`);

    // Ventana de 105 a 135 minutos antes (2 horas ± 15), para cubrir bien la corrida de cada 15 min.
    if (faltan < 105 || faltan > 135) {
      console.log(`[recordatorio-2horas] fuera de ventana (necesita estar entre 105 y 135) -> no se avisa todavía`);
      return;
    }

    avisos.push((async () => {
      const dispSnap = await db.collection('dispositivos').where('nombre', '==', v.responsable).get();
      console.log(`[recordatorio-2horas] dispositivos de "${v.responsable}": ${dispSnap.size}`);
      await Promise.all(dispSnap.docs.map(async dispDoc => {
        const token = dispDoc.data().token;
        if (!token) return;
        try {
          await admin.messaging().send({
            token,
            notification: {
              title: 'En 2 horas tenés visita 📅',
              body: `${v.direccion} — ${v.hora}hs (${v.nombreInteresado || 'interesado'})`
            },
            webpush: { notification: { icon: '/icono.png' }, fcmOptions: { link: '/' } }
          });
          console.log(`[recordatorio-2horas] push enviado OK a ${v.responsable} (dispositivo ${dispDoc.id})`);
        } catch (err) {
          console.warn(`[recordatorio-2horas] No se pudo avisar a ${v.responsable} (dispositivo ${dispDoc.id}):`, err.message);
        }
      }));
      await doc.ref.update({ recordatorio2hEnviado: true });
    })());
  });

  await Promise.all(avisos);
  console.log(`[recordatorio-2horas] avisosEnviados=${avisos.length}`);
  return { statusCode: 200, body: JSON.stringify({ ok: true, avisosEnviados: avisos.length }) };
};
