/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';

const OPENAI_API_URL = 'https://api.openai.com/v1/realtime/sessions';

export async function createRealtimeSessionHandler(req: express.Request, res: express.Response, apiKey: string) {
  try {
    if (!apiKey) {
      res.status(500).json({ error: "OpenAI API Key no está configurada en el servidor." });
      return;
    }

    const { catalogSummary } = req.body || {};

    const instructions = `Eres "Mesero IA", el mesero virtual inteligente de LinnkPro.Store.
Tu personalidad es cálida, amable, atenta, rápida y natural, con un trato cordial, respetuoso y amigable colombiano ("¡Con mucho gusto!", "¡Claro que sí!").

OBJETIVOS Y ESTILO DE VOZ NATURAL:
- Atender a los clientes de forma natural como un mesero de restaurante real.
- Respuestas concisas, conversacionales y directas. No des respuestas largas ni leas listas eternas; sugiere 2 o 3 opciones apetitosas a la vez.
- Pronuncia los precios en pesos de manera natural (por ejemplo: "veinticinco mil pesos" en lugar de signos de pesos o números aislados).
- Consultar restaurantes abiertos, platos, precios e ingredientes en tiempo real con tus herramientas.
- Gestionar el carrito de compras mediante tus herramientas (agregar, modificar cantidad, eliminar, vaciar, ver carrito).
- Tomar y confirmar pedidos con información clara y amable.

REGLAS FUNDAMENTALES:
1. NUNCA inventes platos, precios ni restaurantes. Siempre consulta la información con las herramientas (buscarRestaurantes, buscarProductos, obtenerMenu, etc.).
2. Cuando el cliente pida agregar un plato, agrégalo inmediatamente con 'agregarAlCarrito' y confírmalo con calidez ("¡Listo! Agregué una Hamburguesa Especial a tu carrito. ¿Te gustaría algo de tomar?").
3. Permite interrupciones y pausas naturales.`;

    // Tool declarations for OpenAI Realtime session
    const tools = [
      {
        type: "function",
        name: "buscarRestaurantes",
        description: "Busca los restaurantes o tiendas disponibles en la plataforma LinnkPro.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre o tipo de comida del restaurante (ej: hamburguesas, sushi, pizza)." }
          }
        }
      },
      {
        type: "function",
        name: "buscarProductos",
        description: "Busca platos o productos en los menús de los restaurantes.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre del plato o ingrediente a buscar." },
            categoria: { type: "string", description: "Categoría opcional (ej: Comida Rápida, Bebidas, Postres)." }
          },
          required: ["query"]
        }
      },
      {
        type: "function",
        name: "buscarProducto",
        description: "Obtiene información detallada de un plato específico (precio exacto, ingredientes, restaurante).",
        parameters: {
          type: "object",
          properties: {
            nombreOId: { type: "string", description: "Nombre o ID del producto." }
          },
          required: ["nombreOId"]
        }
      },
      {
        type: "function",
        name: "obtenerMenu",
        description: "Obtiene el menú completo de platos disponibles de un restaurante específico.",
        parameters: {
          type: "object",
          properties: {
            restaurante: { type: "string", description: "Nombre o ID del restaurante." }
          },
          required: ["restaurante"]
        }
      },
      {
        type: "function",
        name: "obtenerCategorias",
        description: "Obtiene la lista de categorías gastronómicas disponibles en la plataforma.",
        parameters: {
          type: "object",
          properties: {}
        }
      },
      {
        type: "function",
        name: "agregarAlCarrito",
        description: "Agrega uno o varios productos al carrito del cliente.",
        parameters: {
          type: "object",
          properties: {
            nombreProducto: { type: "string", description: "Nombre del producto a agregar." },
            cantidad: { type: "number", description: "Cantidad a agregar (por defecto 1)." },
            variante: { type: "string", description: "Variante opcional si el plato lo requiere." }
          },
          required: ["nombreProducto"]
        }
      },
      {
        type: "function",
        name: "actualizarCantidadCarrito",
        description: "Modifica la cantidad de un producto que ya está en el carrito.",
        parameters: {
          type: "object",
          properties: {
            nombreProducto: { type: "string", description: "Nombre del producto a modificar." },
            nuevaCantidad: { type: "number", description: "Nueva cantidad deseada (0 para eliminar)." }
          },
          required: ["nombreProducto", "nuevaCantidad"]
        }
      },
      {
        type: "function",
        name: "eliminarDelCarrito",
        description: "Elimina un producto del carrito del cliente.",
        parameters: {
          type: "object",
          properties: {
            nombreProducto: { type: "string", description: "Nombre del producto a eliminar." }
          },
          required: ["nombreProducto"]
        }
      },
      {
        type: "function",
        name: "obtenerCarrito",
        description: "Consulta los productos actuales en el carrito, subtotal, domicilio y total general.",
        parameters: {
          type: "object",
          properties: {}
        }
      },
      {
        type: "function",
        name: "vaciarCarrito",
        description: "Vacía completamente el carrito de compras del cliente.",
        parameters: {
          type: "object",
          properties: {}
        }
      },
      {
        type: "function",
        name: "crearPedido",
        description: "Crea y confirma el pedido formalmente con los datos del cliente.",
        parameters: {
          type: "object",
          properties: {
            nombreCliente: { type: "string", description: "Nombre del cliente." },
            telefono: { type: "string", description: "Teléfono o celular de contacto." },
            direccion: { type: "string", description: "Dirección de entrega o número de mesa." },
            metodoPago: { type: "string", enum: ["efectivo", "transferencia", "tarjeta", "contraentrega"], description: "Método de pago." },
            notas: { type: "string", description: "Instrucciones especiales para la cocina o entrega." }
          },
          required: ["nombreCliente", "telefono", "direccion"]
        }
      },
      {
        type: "function",
        name: "consultarPedido",
        description: "Consulta el estado actual de un pedido reciente.",
        parameters: {
          type: "object",
          properties: {
            pedidoId: { type: "string", description: "ID o número de pedido opcional." }
          }
        }
      }
    ];

    const response = await fetch(OPENAI_API_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4o-realtime-preview-2024-12-17",
        voice: "coral",
        modalities: ["audio", "text"],
        instructions,
        tools,
        input_audio_transcription: {
          model: "whisper-1"
        },
        turn_detection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 600,
          create_response: true
        }
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      let parsedErr: any = null;
      try {
        parsedErr = JSON.parse(errText);
      } catch (e) {
        parsedErr = { message: errText };
      }
      res.status(response.status).json({
        error: parsedErr?.error?.message || "Error al generar sesión efímera en OpenAI Realtime API",
        status: response.status,
        details: parsedErr
      });
      return;
    }

    const sessionData = await response.json();
    res.json(sessionData);
  } catch (error: any) {
    console.error("Error creating OpenAI Realtime Session:", error);
    res.status(500).json({
      error: error.message || "Error interno del servidor al crear sesión de voz Realtime."
    });
  }
}
