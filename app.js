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
// FORMATEO DE NÚMEROS
// =====================
function formatearNumero(numero) {
  numero = numero.replace(/\D/g, "");
  if (numero.startsWith("54") && !numero.startsWith("549")) {
    numero = "549" + numero.slice(2);
  }
  if (numero.length === 10 && !numero.startsWith("54")) {
    numero = "549" + numero;
  }
  return numero;
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

    const from = formatearNumero(msg.from);
    const text = msg.text?.body?.toLowerCase() || "";

    console.log(`Mensaje de: ${from} → "${text}"`);

    if (!userState[from]) {
      userState[from] = { step: "inicio" };
    }

    const state = userState[from];

    switch (state.step) {

      case "inicio":
        // Primer mensaje: plantilla hello_world (funciona sin verificación)
        await sendTemplate(from);
        state.step = "menu";
        break;

      case "menu":
        if (text.includes("1")) {
          await sendMessage(from,
            "Hacé tu pedido aquí 👉 https://menu.fu.do/tequeonda 🛒");
          state.step = "fin";
        } else if (text.includes("2")) {
          await sendMessage(from,
            "Perfecto 🙌 Te ayudo con el pedido.\n\nPrimero ingresá tu correo electrónico 📧");
          state.step = "email";
        } else {
          await sendMessage(from,
            "Por favor respondé con *1* o *2* 😊");
        }
        break;

      case "email":
        state.email = text;
        await sendMessage(from, "Gracias ✅ Ahora tu número de teléfono 📱");
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
`Nuestros más pedidos 🔥

🧀 12 Tequeños de Queso
🎉 25 Tequeños Fiesteros
👨‍👩‍👧 Promo Familiar (20 piezas)
🥟 Mini Empanadas x6
🍰 Torta Tres Leches

¿Qué querés pedir? Escribilo así:
*Ej: 2 packs de 12 tequeños + 1 torta tres leches*`);
        state.step = "pedido";
        break;

      case "pedido":
        state.pedido = text;
        await sendMessage(from,
          "¿Querés agregar bebidas o postres? 🥤🍰\n\nEscribí *no* si no querés nada más.");
        state.step = "extras";
        break;

      case "extras":
        state.extras = text.includes("no") ? "Sin extras" : text;
        await sendMessage(from,
          "¿El pedido es para cuántas personas? 👥\n\nEscribí un número. Ej: *4*");
        state.step = "personas";
        break;

      case "personas":
        state.personas = text;
        await sendMessage(from,
          "¿Querés envío a domicilio o retirás en el local?\n\n1️⃣ Envío a domicilio\n2️⃣ Retiro en el local (Bonpland 1708, Palermo)");
        state.step = "envio";
        break;

      case "envio":
        state.envio = text.includes("1") ? "Delivery a domicilio" : "Retiro en local";
        if (text.includes("1")) {
          await sendMessage(from,
            "📍 Ingresá tu dirección completa:\n*Ej: Av. Corrientes 1234, Piso 3, CABA*");
          state.step = "direccion";
        } else {
          await confirmarYEnviarPedido(from, state);
        }
        break;

      case "direccion":
        state.direccion = text;
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

🛒 Pedido: ${state.pedido}
➕ Extras: ${state.extras}
👥 Personas: ${state.personas}
💳 Pago: ${state.pago}
🚚 Entrega: ${state.envio}
${state.direccion ? `📍 Dirección: ${state.direccion}` : ""}

¡En breve te confirmamos! Gracias por elegirnos 🇻🇪🧀`);

  // Notificar al local (no crítico — si falla no interrumpe al cliente)
  try {
    const localNum = formatearNumero(process.env.LOCAL_NUMBER);
    await sendMessage(localNum,
`🔥 *NUEVO PEDIDO BOT* 🔥

📱 Cliente: ${from}
📧 Email: ${state.email}
📞 Teléfono: ${state.telefono}
💳 Pago: ${state.pago}

🛒 Pedido: ${state.pedido}
➕ Extras: ${state.extras}
👥 Personas: ${state.personas}
🚚 Entrega: ${state.envio}
${state.direccion ? `📍 Dirección: ${state.direccion}` : ""}

⏰ ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`);
  } catch (e) {
    console.log("⚠️ No se pudo notificar al local:", e.message);
  }

  state.step = "fin";
}

// =====================
// ENVIAR PLANTILLA hello_world
// Funciona SIN verificación de empresa en Meta
// Usada para el primer mensaje al cliente
// =====================
async function sendTemplate(to) {
  try {
    const response = await axios.post(
      `https://graph.facebook.com/v18.0/${PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: "whatsapp",
        to,
        type: "template",
        template: {
          name: "hello_world",
          language: { code: "en_US" }
        }
      },
      {
        headers: {
          Authorization: `Bearer ${TOKEN}`,
          "Content-Type": "application/json"
        }
      }
    );
    console.log(`✅ Plantilla enviada a ${to}`);

    // Después de la plantilla mandamos el menú real
    await sendMessage(to,
`Hola 👋 Bienvenido a Teque Onda 🇻🇪

¿Cómo querés hacer tu pedido?

1️⃣ Hacerlo yo mismo (web)
2️⃣ Que el bot me ayude 🤖`);

    return response.data;
  } catch (error) {
    console.error(`❌ Error enviando plantilla a ${to}:`, error.response?.data || error.message);
    throw error;
  }
}

// =====================
// ENVIAR MENSAJE DE TEXTO LIBRE
// Requiere verificación de empresa O conversación activa iniciada por el cliente
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
