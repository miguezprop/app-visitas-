importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.13.0/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "AIzaSyDgLZgZIerwIgaY90v_Yz8HShJX5oSqT_o",
  authDomain: "app-visitas-e4545.firebaseapp.com",
  projectId: "app-visitas-e4545",
  storageBucket: "app-visitas-e4545.firebasestorage.app",
  messagingSenderId: "552690822086",
  appId: "1:552690822086:web:fb2f5867f08b548dbba0c7"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
  const title = (payload.notification && payload.notification.title) || "Visitas";
  const body = (payload.notification && payload.notification.body) || "";
  self.registration.showNotification(title, {
    body: body,
    icon: "/icono.png"
  });

  // Confirmamos solos (sin que la persona tenga que hacer nada) que este aviso
  // llegó de verdad hasta el celular. Así, si alguien deja de recibir avisos,
  // se nota en la app en vez de descubrirse cuando ya se perdió una visita.
  const idDispositivo = payload.data && payload.data.idDispositivo;
  if (idDispositivo) {
    fetch("/.netlify/functions/confirmar-recibido", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idDispositivo: idDispositivo })
    }).catch(function () {});
  }
});
