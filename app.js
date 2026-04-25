const express = require("express");
const axios = require("axios");
require("dotenv").config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// =====================
// HORARIOS DE ATENCIÓN
// Lun a Mié: 11:00 a 23:00
// Jue a Sáb: 11:00 a 24:00
// Dom: 15:00 a 23:00
// =====================
function estaAbierto() {
  const ahora = new Date().toLocaleString("en-US", { timeZone: "America/Argentina/Buenos_Aires" });
  const fecha = new Date(ahora);
  const dia = fecha.getDay();
  const hora = fecha.getHours();
  const minutos = fecha.getMinutes();
  const horaDecimal = hora + minutos / 60;

  if (dia >= 1 && dia <= 3) return horaDecimal >= 11 && horaDecimal < 23;
  else if (dia >= 4 && dia <= 6) return horaDecimal >= 11 && horaDecimal < 24;
  else if (dia === 0) return horaDecimal >= 15 && horaDecimal < 23;
  return false;
}

function horarioTexto() {
  return `⏰ *Nuestros horarios:*
• Lunes a Miércoles: 11:00 a 23:00 hs
• Jueves a Sábado: 11:00 a 24:00 hs
• Domingo: 15:00 a 23:00 hs`;
}

// =====================
// PRECIOS PRODUCTOS
// =====================
const PRECIOS = [
  { keywords: ["50 tequeños", "50 fiesteros", "promo 50"], precio: 28500 },
  { keywords: ["25 tequeños", "25 fiesteros", "promo 25"], precio: 16500 },
  { keywords: ["24 tequeños", "promo 24 teque"], precio: 27500 },
  { keywords: ["12 tequeños", "promo 12 teque"], precio: 15000 },
  { keywords: ["6 tequeños", "promo 6 teque"], precio: 7500 },
  { keywords: ["mix 24"], precio: 34900 },
  { keywords: ["mix 12"], precio: 19500 },
  { keywords: ["mix 5"], precio: 12800 },
  { keywords: ["12 mini empanadas", "promo 12 mini"], precio: 26500 },
  { keywords: ["6 mini empanadas", "promo 6 mini"], precio: 14500 },
  { keywords: ["promo 6 pastelitos", "6 pastelitos"], precio: 14500 },
  { keywords: ["promo 4 pastelitos", "4 pastelitos"], precio: 8500 },
  { keywords: ["empanada pabellon", "empanada de pabellon", "empanada pabellón"], precio: 5500 },
  { keywords: ["torta tres leches", "torta 3 leches"], precio: 5000 },
  { keywords: ["tequeyoyo", "teque yoyo"], precio: 3000 },
];

// =====================
// PRECIOS EXTRAS / BEBIDAS
// =====================
const PRECIOS_EXTRAS = [
  { keywords: ["malta"], precio: 3500 },
  { keywords: ["coca", "coca-cola", "cocacola"], precio: 2500 },
  { keywords: ["reko", "rekobebida", "rekopiña", "rekolita", "reko uva", "reko manzana", "reko tea"], precio: 2500 },
  { keywords: ["nestea", "te vnesti", "vnesti"], precio: 2500 },
  { keywords: ["sprite", "fanta", "pepsi", "seven up", "7up"], precio: 2500 },
  { keywords: ["agua"], precio: 1500 },
  { keywords: ["gatorade"], precio: 2000 },
  { keywords: ["monster"], precio: 4000 },
  { keywords: ["torta tres leches", "torta 3 leches"], precio: 5000 },
];

function calcularTotal(pedido, extras) {
  let total = 0;

  const textoPedido = pedido.toLowerCase();
  for (const item of PRECIOS) {
    for (const kw of item.keywords) {
      if (textoPedido.includes(kw)) {
        const regex = new RegExp(`(\\d+)\\s*${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
        const match = textoPedido.match(regex);
        const cantidad = match ? parseInt(match[1]) : 1;
        total += item.precio * cantidad;
        break;
      }
    }
  }

  if (extras && extras !== "Sin extras") {
    const textoExtras = extras.toLowerCase();
    for (const item of PRECIOS_EXTRAS) {
      for (const kw of item.keywords) {
        if (textoExtras.includes(kw)) {
          const regex = new RegExp(`(\\d+)\\s*${kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
          const match = textoExtras.match(regex);
          const cantidad = match ? parseInt(match[1]) : 1;
          total += item.precio * cantidad;
          break;
        }
      }
    }
  }

  return total;
}

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

    const fromRaw = msg.from;
    const from = formatearNumero(msg.from);
    const text = msg.text?.body?.toLowerCase() || "";

    console.log(`RAW: ${fromRaw} | FORMATEADO: ${from} → "${text}"`);

    // Comando cancelar en cualquier momento
    if (text === "cancelar" || text === "cancel") {
      userState[from] = { step: "inicio" };
      await sendMessage(from,
        "✅ Pedido cancelado. Escribí *hola* cuando quieras empezar de nuevo 😊");
      return res.sendStatus(200);
    }

    if (!userState[from]) {
      userState[from] = { step: "inicio" };
    }

    const state = userState[from];

    switch (state.step) {

      case "inicio":
        if (!estaAbierto()) {
          await sendMessage(from,
`😔 En este momento estamos cerrados.

${horarioTexto()}

¿Querés dejarnos tu pedido programado para cuando abramos? 🕐

1️⃣ Sí, quiero programar mi pedido
2️⃣ No, gracias`);
          state.step = "cerrado_opcion";
          return res.sendStatus(200);
        }
        await sendMessage(from,
`👋 ¡Bienvenido a Teque Onda! 🇻🇪🧀

¿Cómo querés recibir tu pedido?

1️⃣ Mercado Pago Delivery 🟡
2️⃣ Rappi 🟠
3️⃣ Nuestra web Fu.do 🌐 (⭐Favorito Ahorro 💰✨)
4️⃣ Armar mi pedido paso a paso con el bot 🤖
5️⃣ Hablar con una persona 👤

_En cualquier momento escribí *cancelar* para empezar de nuevo._`);
        state.step = "menu_inicial";
        break;

      case "cerrado_opcion":
        if (text.includes("1")) {
          state.pedidoProgramado = true;
          await sendMessage(from,
`¡Genial! 🕐 Tomamos tu pedido ahora y lo procesamos cuando abramos.

Te voy a ir pidiendo los datos de a uno por vez, así es más fácil 😊

¡Empecemos! ¿Cuál es tu *nombre*? 👤`);
          state.step = "nombre";
        } else if (text.includes("2")) {
          await sendMessage(from,
`¡Está bien! 😊 Cuando abramos podés escribirnos nuevamente.

${horarioTexto()}

¡Hasta pronto! 🇻🇪🧀`);
          state.step = "fin";
        } else {
          await sendMessage(from, "Por favor respondé con *1* o *2* 😊");
        }
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

Te voy a ir pidiendo los datos de a uno por vez, así es más fácil 😊

Respondé cada pregunta con un solo dato a la vez.

¡Empecemos! ¿Cuál es tu *nombre*? 👤`);
          state.step = "nombre";
        } else if (text.includes("5")) {
          await sendMessage(from,
`¡Por supuesto! 😊 Podés contactarnos directamente:

💬 WhatsApp: https://wa.me/5491157048535
📞 Teléfono: +54 11 5704-8535

¡Un miembro de nuestro equipo te va a atender! 🇻🇪🧀`);
          state.step = "fin";
        } else {
          await sendMessage(from,
            "Por favor respondé con *1*, *2*, *3*, *4* o *5* 😊");
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

3️⃣ Pedir por nuestra web Fu.do 🌐 (con descuentos 💰✨)
👉 https://menu.fu.do/tequeonda

4️⃣ Armar tu pedido paso a paso con el bot 🤖

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

Te voy a ir pidiendo los datos de a uno por vez, así es más fácil 😊

Respondé cada pregunta con un solo dato a la vez.

¡Empecemos! ¿Cuál es tu *nombre*? 👤`);
          state.step = "nombre";
        } else {
          await sendMessage(from, "Por favor respondé con *3* o *4* 😊");
        }
        break;

      case "nombre":
        state.nombre = msg.text?.body || text;
        await sendMessage(from,
          `Gracias ${state.nombre} 😊\n\n¿Cuál es tu *correo electrónico*? 📧`);
        state.step = "email";
        break;

      case "email":
        state.email = text;
        await sendMessage(from, "Perfecto ✅\n\n¿Cuál es tu *número de teléfono*? 📱");
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
🥟 Empanada Grande de Pabellón (250g) — $5.500
🧀 Tequeyoyo x unidad — $3.000

*— PROMOS CHICAS —*
🎉 Mix 5 (3 empanadas + 2 pastelitos + gaseosa) — $12.800
🥟 Promo 4 Pastelitos + 1 Bebida — $8.500
   ↳ Elegís 2 salados: carne mechada, carne molida o pollo
   ↳ Elegís 2 con queso: queso, papa y queso, jamón y queso o pizza
🥟 Promo 6 Pastelitos + 2 Bebidas — $14.500
   ↳ Elegís 4 salados: carne mechada, carne molida o pollo
   ↳ Elegís 2 con queso: queso, papa y queso, jamón y queso o pizza

*— PROMOS CLÁSICAS —*
🧀 6 Tequeños de Queso — $7.500
🧀 12 Tequeños de Queso — $15.000
🧀 24 Tequeños de Queso — $27.500
🎉 25 Tequeños Fiesteros — $16.500
🎉 50 Tequeños Fiesteros — $28.500

*— MIX —*
🎊 Mix 12 (6 tequeños + 6 empanadas) — $19.500 — ideal 2 a 3 personas
🎊 Mix 24 (12 tequeños + 12 empanadas) — $34.900 — ideal 4 a 5 personas

*— EMPANADAS —*
🥟 6 Mini Empanadas Surtidas — $14.500
🥟 12 Mini Empanadas Surtidas — $26.500

*— POSTRES —*
🍰 Torta Tres Leches — $5.000

¿Qué querés pedir? Escribilo así:
*Ej: 1 Mix 12 + 1 Promo 4 Pastelitos (2 carne mechada, 2 de queso)*`);
        state.step = "pedido";
        break;

      case "pedido":
        state.pedido = msg.text?.body || text;
        await sendMessage(from,
          "¿Querés agregar algo más? Tenemos Maltas ($3.500), Cocas y RekoBebidas ($2.500), Nestea ($2.500) y Torta Tres Leches ($5.000) 🥤🍰\n\nEscribí *no* si no querés nada más.");
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
  const total = calcularTotal(state.pedido, state.extras);

  const totalTexto = total > 0
    ? `\n💰 *Total aprox:* $${total.toLocaleString("es-AR")}\n_(Incluye productos y bebidas seleccionadas. No incluye costo de envío. El total final se confirma con tu pedido)_`
    : "";

  const programadoTexto = state.pedidoProgramado
    ? "\n🕐 *Pedido programado — se procesa cuando abramos*\n"
    : "";

  await sendMessage(from,
`✅ *Resumen de tu pedido:*
${programadoTexto}
👤 Nombre: ${state.nombre}
🛒 Pedido: ${state.pedido}
➕ Extras: ${state.extras}
💳 Pago: ${state.pago}
🚚 Entrega: ${state.envio}
${state.direccion ? `📍 Dirección: ${state.direccion}` : ""}
${totalTexto}

${state.pedidoProgramado
    ? "¡Tu pedido quedó registrado! Te confirmamos cuando abramos 🕐🇻🇪🧀"
    : "¡En breve te confirmamos y cotizamos el envío si corresponde! Gracias por elegirnos 🇻🇪🧀"}`);

  try {
    const localNum = formatearNumeroLocal(process.env.LOCAL_NUMBER);
    console.log(`📲 Enviando pedido al local: ${localNum}`);
    await sendMessage(localNum,
`${state.pedidoProgramado ? "🕐 *PEDIDO PROGRAMADO — FUERA DE HORARIO*" : "🔥 *NUEVO PEDIDO BOT* 🔥"}

👤 Cliente: ${state.nombre}
📱 WhatsApp: ${from}
📧 Email: ${state.email}
📞 Teléfono: ${state.telefono}
💳 Pago: ${state.pago}

🛒 Pedido: ${state.pedido}
➕ Extras: ${state.extras}
🚚 Entrega: ${state.envio}
${state.direccion ? `📍 Dirección: ${state.direccion}` : ""}
💰 Total aprox: $${total.toLocaleString("es-AR")}

⏰ Recibido: ${new Date().toLocaleString("es-AR", { timeZone: "America/Argentina/Buenos_Aires" })}`);
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
