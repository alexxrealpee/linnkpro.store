/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from 'express';

const OPENAI_API_URL = 'https://api.openai.com/v1/realtime/sessions';

export async function createRealtimeSessionHandler(req: express.Request, res: express.Response, apiKey: string) {
  try {
    if (!apiKey) {
      res.status(500).json({ error: "OpenAI API Key no está configurada en el backend." });
      return;
    }

    const instructions = `Eres "IAMesero", la mesera y asistente virtual inteligente de LinnkPro.Store.
Hablas con la voz femenina "marin" en español colombiano natural, cálido, amable, respetuoso y cercano.

REGLAS DE CONVERSACIÓN Y VOZ:
1. Habla como una persona real atendiendo una mesa en Colombia: amable, clara, espontánea y con calidez natural ("¡Hola! Qué gusto saludarte", "¡Con mucho gusto!", "¡Claro que sí!").
2. Respuestas breves y conversacionales: entre 1 y 3 frases fluidas. No digas párrafos largos ni recites listas interminables; ofrece 2 o 3 opciones apetitosas a la vez.
3. Pronuncia siempre los precios en pesos colombianos de forma natural (ejemplo: "veinticinco mil pesos", "doce mil quinientos pesos", nunca digas signos ni números fríos).
4. No leas emojis, símbolos de Markdown, JSON, asteriscos ni etiquetas técnicas.
5. Permite pausas e interrupciones naturales cuando el cliente hable.
6. Realiza acciones en tiempo real con tus herramientas:
   - Consultar menú y opciones disponibles con 'buscarProductos', 'obtenerMenu', 'buscarRestaurantes'.
   - Consultar disponibilidad de platos con 'buscarProducto'.
   - Agregar platos al pedido con 'agregarAlCarrito'.
   - Modificar cantidades o ingredientes con 'actualizarCantidadCarrito'.
   - Eliminar productos con 'eliminarDelCarrito'.
   - Consultar cantidades y totales con 'obtenerCarrito'.
   - Confirmar y formalizar pedidos con 'crearPedido'.`;

    // Tool declarations for OpenAI Realtime session
    const tools = [
      {
        type: "function",
        name: "buscarRestaurantes",
        description: "Busca y lista los restaurantes o tiendas gastronómicas disponibles en LinnkPro.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "Nombre del restaurante o tipo de comida (ej: hamburguesas, sushi, pizza)." }
          }
        }
      },
      {
        type: "function",
        name: "buscarProductos",
        description: "Busca platos, bebidas o postres en los menús disponibles.",
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
        description: "Obtiene información detallada y disponibilidad de un plato específico (precio exacto, ingredientes, restaurante).",
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
        description: "Agrega uno o varios productos al carrito de compras del cliente.",
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
        description: "Modifica la cantidad de un producto que ya está en el carrito (0 para eliminarlo).",
        parameters: {
          type: "object",
          properties: {
            nombreProducto: { type: "string", description: "Nombre del producto a modificar." },
            nuevaCantidad: { type: "number", description: "Nueva cantidad deseada." }
          },
          required: ["nombreProducto", "nuevaCantidad"]
        }
      },
      {
        type: "function",
        name: "eliminarDelCarrito",
        description: "Elimina un producto del carrito de compras del cliente.",
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
        description: "Consulta los productos actuales en el carrito, cantidades, subtotal, domicilio y total a pagar.",
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

    const candidateRealtimeModels = [
      "gpt-realtime-2.1",
      "gpt-4o-realtime-preview-2024-12-17",
      "gpt-4o-realtime-preview",
      "gpt-4o-mini-realtime-preview"
    ];

    let sessionData: any = null;
    let lastError: any = null;

    for (const modelName of candidateRealtimeModels) {
      try {
        const response = await fetch(OPENAI_API_URL, {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: modelName,
            voice: "marin",
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

        if (response.ok) {
          sessionData = await response.json();
          break;
        } else {
          const errText = await response.text();
          try {
            lastError = JSON.parse(errText);
          } catch {
            lastError = { message: errText };
          }
          console.warn(`Model ${modelName} returned status ${response.status}:`, lastError?.error?.message || lastError);
        }
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!sessionData) {
      res.status(400).json({
        error: lastError?.error?.message || "Error al generar sesión efímera con gpt-realtime-2.1 en OpenAI Realtime API",
        details: lastError
      });
      return;
    }

    res.json(sessionData);
  } catch (error: any) {
    console.error("Error creating OpenAI Realtime Session:", error);
    res.status(500).json({
      error: error.message || "Error interno del servidor al crear sesión de voz Realtime."
    });
  }
}
