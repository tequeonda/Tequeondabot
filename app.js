const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// Estado simple en memoria
let userState = {};

// =====================
// BARRIOS CON COBERTURA
// =====================
const BARRIOS_CON_COBERTURA = [
  "palermo", "villa crespo", "chacarita", "colegiales", "villa del parque"
];

function tieneCobertura(barrio) {
  const b = barrio.toLowerCase().trim();
  return BARRIOS_CON_COBERTURA.some(zona => b.includes(zona));
}

// =====================
// FORMATEO DE NÚMEROS
// =====================
function formatearNumero(numero) {
  numero = numero.replace(/\D/g, "");
  if (numero.startsWith("549")) {
    numero = "54" + numero.slice(3);
  }
  return numero;
}

function formatearNumeroLocal(numero) {
  return numero.replace(/\D/g, "");
}

// Verificación webhook
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
});

// Recibir mensajes
app.post("/webhook", async (req, res) => {
  try {
    const msg = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
    if (!msg) return res.sendStatus(200);

    const fromRaw = msg.from;
    const from = formatearNumero(msg.from);
    const text = msg.text?.body?.toLowerCase() || "";

    console.log(`RAW: ${fromRaw} | FORMATEADO: ${from} → "${text}"`);

    if (!userState[from]) {
      userState[from] = { step: "inicio" };
    }

    const state = userState[from];

    switch (state.step) {

      case "inicio":
        await sendMessage(from,
`👋 ¡Bienvenido a Teque Onda! 🇻🇪🧀

¿Cómo querés recibir tu pedido?

1️⃣ Mercado Pago Delivery 🟡
2️⃣ Rappi 🟠
3️⃣ Nuestra web Fu.do 🌐 (⭐Favorito Ahorro 💰✨)
4️⃣ Que el bot me ayude 🤖`);
        state.step = "menu_inicial";
        break;

      case "menu_inicial":
        if (text.includes("1")) {
          state.canal = "mercadopago";
          await sendMessage(from,
            "¿En qué barrio estás? 📍\n\nEscribilo así: *Ej: Palermo, Villa Crespo, Chacarita...*");
          state.step = "cobertura";
        } else if (text.includes("2")) {
          state.canal = "rappi";
          await sendMessage(from,
            "¿En qué barrio estás? 📍\n\nEscribilo así: *Ej: Palermo, Villa Crespo, Chacarita...*");
          state.step = "cobertura";
        } else if (text.includes("3")) {
          await sendMessage(from,
`¡Genial! 🎁 En nuestra web encontrás descuentos exclusivos para clientes cercanos.

Hacé tu pedido aquí 👉 https://menu.fu.do/tequeonda 🌐

¡Gracias por elegirnos! 🇻🇪🧀`);
          state.step = "fin";
        } else if (text.includes("4")) {
          await sendMessage(from,
`¡Genial! 🤖 Voy a ayudarte a armar tu pedido paso a paso.

Para poder crearlo por vos, voy a necesitarte algunos datos:
📝 Nombre
📧 Correo electrónico
📱 Teléfono de contacto
💳 Forma de pago
🛒 Lo que querés pedir

¡Empecemos! ¿Cuál es tu nombre? 👤`);
          state.step = "nombre";
        } else {
          await sendMessage(from,
            "Por favor respondé con *1*, *2*, *3* o *4* 😊");
        }
        break;

      case "cobertura":
        const barrio = msg.text?.body || text;
        if (tieneCobertura(barrio)) {
          if (state.canal === "mercadopago") {
            await sendMessage(from,
`✅ ¡Genial, llegamos a tu barrio!

Hacé tu pedido por Mercado Pago Delivery aquí 👉 https://mpago.li/2Vcwjkc 🟡

¡Gracias por elegirnos! 🇻🇪🧀`);
          } else {
            await sendMessage(from,
`✅ ¡Genial, llegamos a tu barrio!

Hacé tu pedido por Rappi aquí 👉 https://rappi.onelink.me/y6GB/30kk2ddt 🟠

¡Gracias por elegirnos! 🇻🇪🧀`);
          }
          state.step = "fin";
        } else {
          await sendMessage(from,
`😕 Lo sentimos, por el momento no llegamos a *${msg.text?.body || barrio}*.

Pero no te quedés sin tus tequeños 🧀 Podés:

3️⃣ Pedir por nuestra web Fu.do 🌐 (con descuentos💰✨)
👉 https://menu.fu.do/tequeonda

4️⃣ Que el Bot te ayude con el Pedido 🤖

Respondé *3* o *4* para continuar.`);
          state.step = "menu_sin_cobertura";
        }
        break;

      case "menu_sin_cobertura":
        if (text.includes("3")) {
          await sendMessage(from,
`¡Genial! 🎁 Hacé tu pedido aquí 👉 https://menu.fu.do/tequeonda 🌐

¡Gracias por elegirnos! 🇻🇪🧀`);
          state.step = "fin";
        } else if (text.includes("4")) {
          await sendMessage(from,
`¡Genial! 🤖 Voy a ayudarte a armar tu pedido paso a paso.

Para poder crearlo por vos, voy a necesitarte algunos datos:
📝 Nombre
📧 Correo electrónico
📱 Teléfono de contacto
💳 Forma de pago
🛒 Lo que querés pedir

¡Empecemos! ¿Cuál es tu nombre? 👤`);
          state.step = "nombre";
        } else {
          await sendMessage(from,
            "Por favor respondé con *3* o *4* 😊");
        }
        break;

      case "nombre":
        state.nombre = msg.text?.body || text;
        await sendMessage(from,
          `Gracias ${state.nombre} 😊\n\nIngresá tu correo electrónico 📧`);
        state.step = "email";
        break;

      case "email":
        state.email = text;
        await sendMessage(from, "Gracias ✅ Ahora ingresá tu número de teléfono 📱");
        state.step = "telefono";
        break;

      case "telefono":
        state.telefono = text;
        await sendMessage(from,
          "¿Cómo vas a pagar?\n\n1️⃣ Efectivo\n2️⃣ Transferencia / Mercado Pago");
        state.step = "pago";
        break;

      case "pago":
        state.pago = text.includes("1") ? "Efectivo" : "Transferencia / Mercado Pago";
        await sendMessage(from,
`Nuestros productos 🔥

*— INDIVIDUALES —*
🥟 Empanada Grande de Pabellón (250g)
🧀 Tequeyoyo x unidad

*— PROMOS CHICAS —*
🎉 Mix 5 (3 empanadas + 2 pastelitos + gaseosa)
🥟 Promo 4 Pastelitos + 1 Bebida
   ↳ Elegís 2 salados: carne mechada, carne molida o pollo
   ↳ Elegís 2 con queso: queso, papa y queso, jamón y queso o pizza
🥟 Promo 6 Pastelitos + 2 Bebidas
   ↳ Elegís 4 salados: carne mechada, carne molida o pollo
   ↳ Elegís 2 con queso: queso, papa y queso, jamón y queso o pizza

*— PROMOS CLÁSICAS —*
🧀 6 Tequeños de Queso
🧀 12 Tequeños de Queso
🧀 24 Tequeños de Queso
🎉 25 Tequeños Fiesteros
🎉 50 Tequeños Fiesteros

*— MIX —*
🎊 Mix 12 (6 tequeños + 6 empanadas surtidas) — ideal 2 a 3 personas
🎊 Mix 24 (12 tequeños + 12 empanadas surtidas) — ideal 4 a 5 personas

*— EMPANADAS —*
🥟 6 Mini Empanadas Surtidas
🥟 12 Mini Empanadas Surtidas

¿Qué querés pedir? Escribilo así:
*Ej: 1 Mix 12 + 1 Promo 4 Pastelitos (2 carne mechada, 2 de queso)*`);
        state.step = "pedido";
        break;

      case "pedido":
        state.pedido = msg.text?.body || text;
        await sendMessage(from,
          "¿Querés agregar algo más? Tenemos Maltas, Cocas, RekoBebibas, Nestea y Tortas 3 Leches 🥤🍰\n\nEscribí *no* si no querés nada más.");
        state.step = "extras";
        break;

      case "extras":
        state.extras = text.includes("no") ? "Sin extras" : (msg.text?.body || text);
        await sendMessage(from,
          "¿Querés envío a domicilio o retirás en el local?\n\n1️⃣ Envío a domicilio\n2️⃣ Retiro en el local (Bonpland 1708, Palermo)");
        state.step = "envio";
        break;

      case "envio":
        state.envio = text.includes("1") ? "Delivery a domicilio" : "Retiro en local";
        if (text.includes("1")) {
          await sendMessage(from,
            "📍 Ingresá tu dirección exacta y número de departamento:\n*Ej: Av. Corrientes 1234, Piso 3, Depto B, CABA*\n\nCon eso te cotizamos el envío 🛵");
          state.step = "direccion";
        } else {
          await confirmarYEnviarPedido(from, state);
        }
        break;

      case "direccion":
        state.direccion = msg.text?.body || text;
        await confirmarYEnviarPedido(from, state);
        break;

      default:
        await sendMessage(from,
          "Si querés hacer otro pedido escribí *hola* 🙌");
        userState[from] = { step: "inicio" };
    }

    res.sendStatus(200);

  } catch (error) {
    console.error("❌ Error:", error.response?.data || error.message);
    res.sendStatus(500);
  }
});

// =====================
// CONFIRMAR Y ENVIAR PEDIDO AL LOCAL
// =====================
async function confirmarYEnviarPedido(from, state) {
  await sendMessage(from,
`✅ *Resumen de tu pedido:*

👤 Nombre: ${state.nombre}
🛒 Pedido: ${state.pedido}
➕ Extras: ${state.extras}
💳 Pago: ${state.pago}
🚚 Entrega: ${state.envio}
${state.direccion ? `📍 Dirección: ${state.direccion}` : ""}

¡En breve te confirmamos y cotizamos el envío si corresponde! Gracias por elegirnos 🇻🇪🧀`);

  try {
    const localNum = formatearNumeroLocal(process.env.LOCAL_NUMBER);
    console.log(`📲 Enviando pedido al local: ${localNum}`);
    await sendMessage(localNum,
`🔥 *NUEVO PEDIDO BOT* 🔥

👤 Cliente: ${state.nombre}
📱 WhatsApp: ${from}
📧 Email: ${state.email}
📞 Teléfono: ${state.telefono}
💳 Pago: ${state.pago}

🛒 Pedido: ${state.pedido}
➕ Extras: ${state.extras}
🚚 Entrega: ${state.envio}
${state.direccion ? `📍 Dirección: ${state.direccion}` : ""}

⏰ ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`);
  } catch (e) {
    console.log("⚠️ No se pudo notificar al local:", e.message);
  }

  state.step = "fin";
}

// =====================
// ENVIAR MENSAJE DE TEXTO LIBRE
// =====================
async function sendMessage(to, text) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        text: { body: text }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`✅ Mensaje enviado a ${to}`);
    return response.data;
  } catch (error) {
    console.error(`❌ Error enviando a ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

app.listen(3000, () => console.log("🚀 Bot Teque Onda corriendo en puerto 3000"));
