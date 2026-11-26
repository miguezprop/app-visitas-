// Sincroniza las propiedades de Tokko con la página de Informes (informes.html).
// - Suma las propiedades nuevas que estén publicadas en Tokko.
// - Actualiza el precio de las que ya estaban.
// - Marca con "bajaTokko" las que ya no están publicadas (no las borra: su historial queda).
// Solo funciona para alguien que inició sesión en la app (se verifica su sesión de Firebase).
// Necesita la variable de entorno TOKKO_API_KEY en Netlify.
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const COL = 'informes_propiedades';
const CFG = 'informes_config';

function hoyAR() {
  return new Date(Date.now() - 3 * 3600 * 1000).toISOString().slice(0, 10);
}

async function traerDeTokko(key) {
  const todas = [];
  let offset = 0;
  for (let pagina = 0; pagina < 40; pagina++) {
    const url = `https://www.tokkobroker.com/api/v1/property/?key=${encodeURIComponent(key)}&format=json&lang=es_ar&limit=50&offset=${offset}`;
    const r = await fetch(url);
    if (!r.ok) throw new Error(`Tokko respondió ${r.status}`);
    const d = await r.json();
    const objs = Array.isArray(d.objects) ? d.objects : [];
    todas.push(...objs);
    if (!objs.length || !(d.meta && d.meta.next)) break;
    offset += objs.length;
  }
  return todas;
}

function datosDe(p) {
  const ops = Array.isArray(p.operations) ? p.operations : [];
  const op = ops.find(o => /venta/i.test(o.operation_type || '')) || ops[0] || {};
  const precioObj = (Array.isArray(op.prices) ? op.prices : [])[0] || {};
  const m2 = parseFloat(p.roofed_surface);
  return {
    codigo: String(p.id),
    direccion: p.address || p.fake_address || p.publication_title || ('Propiedad ' + p.id),
    barrio: (p.location && p.location.name) || '',
    tipo: (p.type && p.type.name) || 'Otro',
    operacion: /alquiler/i.test(op.operation_type || '') ? 'Alquiler' : 'Venta',
    moneda: precioObj.currency === 'ARS' ? 'ARS' : 'USD',
    precio: precioObj.price != null && !isNaN(+precioObj.price) ? +precioObj.price : null,
    m2: m2 > 0 ? m2 : null,
    fechaPublicacion: (p.created_at || '').slice(0, 10) || null,
    link: `https://www.miguezpropiedades.com.ar/p/${p.id}`
  };
}

async function sincronizar(db, tokko) {
  const ahora = new Date().toISOString();
  const hoy = hoyAR();
  const snap = await db.collection(COL).get();
  const existentes = {};
  snap.docs.forEach(d => { existentes[d.id] = d.data(); });

  const enTokko = new Set();
  const res = { total: tokko.length, nuevas: [], precios: [], bajas: [], vuelven: [] };
  const escrituras = [];

  for (const p of tokko) {
    if (p == null || p.id == null) continue;
    const id = 'tk' + p.id;
    enTokko.add(id);
    const t = datosDe(p);
    const ex = existentes[id];
    if (!ex) {
      escrituras.push([id, { ...t, fechaDeTokko: !!t.fechaPublicacion, origenTokko: true, propietario: '', telPropietario: '', actualizado: ahora, vistoTokko: ahora }, false]);
      res.nuevas.push(t.direccion);
      continue;
    }
    const cambios = { vistoTokko: ahora };
    // La fecha de publicación siempre sale de Tokko (pisa lo que hubiera cargado a mano).
    if (t.fechaPublicacion && t.fechaPublicacion !== ex.fechaPublicacion) {
      cambios.fechaPublicacion = t.fechaPublicacion;
      res.fechas = (res.fechas || 0) + 1;
    }
    if (t.fechaPublicacion) cambios.fechaDeTokko = true;
    if (t.precio != null && t.precio !== ex.precio) {
      cambios.precio = t.precio; cambios.moneda = t.moneda; cambios.actualizado = ahora;
      res.precios.push(`${ex.direccion || t.direccion}: ${ex.precio ?? '–'} → ${t.precio}`);
    }
    if (ex.bajaTokko) {
      cambios.bajaTokko = admin.firestore.FieldValue.delete();
      res.vuelven.push(ex.direccion || t.direccion);
    }
    escrituras.push([id, cambios, true]);
  }

  const posiblesBajas = [];
  for (const [id, ex] of Object.entries(existentes)) {
    // Solo se marcan las que vienen de Tokko (tienen código) y no están en la lista actual.
    if (enTokko.has(id) || !ex.codigo || ex.bajaTokko) continue;
    posiblesBajas.push([id, ex]);
  }
  const activas = Object.values(existentes).filter(ex => ex.codigo && !ex.bajaTokko).length;
  if (posiblesBajas.length && posiblesBajas.length > activas / 2) {
    // Algo raro (Tokko devolvió una lista incompleta): no se marca ninguna baja.
    res.bajasSuspendidas = posiblesBajas.length;
  } else {
    posiblesBajas.forEach(([id, ex]) => {
      escrituras.push([id, { bajaTokko: hoy }, true]);
      res.bajas.push(ex.direccion || id);
    });
  }

  for (let i = 0; i < escrituras.length; i += 400) {
    const batch = db.batch();
    escrituras.slice(i, i + 400).forEach(([id, obj, merge]) => {
      batch.set(db.collection(COL).doc(id), obj, merge ? { merge: true } : {});
    });
    await batch.commit();
  }

  await db.collection(CFG).doc('tokko').set({
    ultimaSync: ahora, dia: hoy, total: res.total,
    nuevas: res.nuevas.length, bajas: res.bajas.length, precios: res.precios.length
  });
  return res;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' };

  const auth = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  const idToken = auth.replace(/^Bearer\s+/i, '');
  try {
    if (!idToken) throw new Error('sin sesión');
    await admin.auth().verifyIdToken(idToken);
  } catch (e) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Hay que iniciar sesión.' }) };
  }

  const key = process.env.TOKKO_API_KEY;
  if (!key) return { statusCode: 500, body: JSON.stringify({ error: 'Falta cargar TOKKO_API_KEY en Netlify.' }) };

  try {
    const tokko = await traerDeTokko(key);
    // Si Tokko no devuelve nada (caída, clave mal), no se toca nada para no marcar todo como baja.
    if (!tokko.length) return { statusCode: 502, body: JSON.stringify({ error: 'Tokko no devolvió propiedades. No se cambió nada.' }) };
    const res = await sincronizar(admin.firestore(), tokko);
    return { statusCode: 200, body: JSON.stringify({ ok: true, ...res }) };
  } catch (err) {
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};

exports._interno = { sincronizar, datosDe };
