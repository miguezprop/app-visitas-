// Función de diagnóstico: NO se ejecuta sola, se llama a mano abriendo la URL
// con un nombre, por ejemplo:
// https://profound-tanuki-709d8a.netlify.app/.netlify/functions/diagnostico?nombre=Alejo
// Sirve para ver, sin entrar a Firebase, si esa persona tiene "dispositivos"
// (celulares) registrados para recibir notificaciones, y hace cuánto se actualizaron.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

exports.handler = async (event) => {
  const nombre = (event.queryStringParameters && event.queryStringParameters.nombre) || '';
  if (!nombre) {
    return {
      statusCode: 400,
      body: 'Agregá ?nombre=Alejo (o el nombre que quieras revisar) al final de la URL.'
    };
  }

  const db = admin.firestore();
  const snap = await db.collection('dispositivos').where('nombre', '==', nombre).get();

  const dispositivos = snap.docs.map(doc => {
    const d = doc.data();
    return {
      idDispositivo: doc.id,
      tieneToken: !!d.token,
      ultimaActualizacion: d.actualizado ? d.actualizado.toDate().toISOString() : null
    };
  });

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nombre, cantidadDispositivosRegistrados: dispositivos.length, dispositivos }, null, 2)
  };
};
