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

    const from = msg.from;
    const text = msg.text?.body?.toLowerCase() || "";

    console.log("Mensaje de:", from, text);

    // Estado inicial
    if (!userState[from]) {
      userState[from] = { step: "inicio" };
    }

    const state = userState[from];

    switch (state.step) {

      case "inicio":
        await sendMessage(from,
`Hola 👋 Bienvenido a TequeOnda

¿Cómo quieres hacer tu pedido?

1️⃣ Hacerlo yo mismo (web)
2️⃣ Que me ayudemos 🤖`);
        state.step = "menu";
        break;

      case "menu":
        if (text.includes("1")) {
          await sendMessage(from,
"Haz tu pedido aquí 👉 https://menu.fu.do/tequeonda");
          state.step = "fin";
        } else {
          await sendMessage(from, "Perfecto 🙌 dime tu correo 📧");
          state.step = "email";
        }
        break;

      case "email":
        state.email = text;
        await sendMessage(from, "Ahora tu teléfono 📱");
        state.step = "telefono";
        break;

      case "telefono":
        state.telefono = text;
        await sendMessage(from,
"Forma de pago?\n\n1️⃣ Efectivo\n2️⃣ Transferencia");
        state.step = "pago";
        break;

      case "pago":
        state.pago = text;

        await sendMessage(from,
"Perfecto 🔥 ¿Qué deseas pedir?\n(Ej: 2 cajas de tequeños + 1 bebida)");

        state.step = "pedido";
        break;

      case "pedido":
        state.pedido = text;

        await sendMessage(from,
"¿Deseas envío a domicilio? (si/no)");
        state.step = "envio";
        break;

      case "envio":
        state.envio = text;

        // Enviar pedido al local
        await sendMessage(process.env.LOCAL_NUMBER,
`🔥 NUEVO PEDIDO 🔥

Cliente: ${from}
Email: ${state.email}
Teléfono: ${state.telefono}
Pago: ${state.pago}

Pedido:
${state.pedido}

Envío: ${state.envio}`);

        await sendMessage(from,
"✅ Pedido recibido!\nEn breve lo confirmamos 🙌");

        state.step = "fin";
        break;

      default:
        await sendMessage(from,
"Si quieres hacer otro pedido escribe *hola* 🙌");
        userState[from] = { step: "inicio" };
    }

    res.sendStatus(200);

  } catch (error) {
    console.error(error.response?.data || error.message);
    res.sendStatus(500);
  }
});

// Enviar mensaje
async function sendMessage(to, text) {
  await axios.post(
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
}

app.listen(3000, () => console.log("🚀 Bot corriendo en puerto 3000"));