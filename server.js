const WebSocket = require('ws');

// 1. Usar el puerto del HOSTING (process.env.PORT) o usar 8080 si es local.
const PORT = process.env.PORT || 8080;
// 2. Creamos el servidor usando la constante PORT
const wss = new WebSocket.Server({ port: PORT });
console.log("🟢 Servidor Maestro listo. Escuchando en el puerto: " + PORT);

// 🧠 MEMORIA DEL JUEGO: Aquí guardaremos a todos los jugadores
// Formato: { "id_jugador_1": {x: 100, y: 200}, "id_jugador_2": ... }
let jugadores = {};


console.log("🟢 Servidor Maestro listo. Esperando conexiones...");

wss.on('connection', function connection(ws) {

    // 1. GENERAR ID ÚNICO
  // Creamos un ID aleatorio para este nuevo jugador que acaba de llegar
  const id = Math.random().toString(36).substring(7);
  ws.id = id; // Guardamos el ID en la propia conexión

  console.log(`⚡ Jugador conectado. ID asignado: ${id}`);

  // --- NUEVO: AVISAR AL JUGADOR SU PROPIO ID ---
  ws.send(JSON.stringify({ tipo: "hola", id: id }));
  // ---------------------------------------------

  // Al conectarse, ahora tiene vida
  jugadores[id] = { x: 0, y: 0, hp: 100 };
  
  ws.on('message', function incoming(message) {
    // 1. Convertimos el mensaje crudo a texto
    const mensajeTexto = message.toString();
    
    try {
        // 2. Intentamos leerlo como JSON (el idioma de los datos)
        const datos = JSON.parse(mensajeTexto);

        // 3. Si es un mensaje de movimiento, mostramos las coordenadas
        if (datos.tipo === "movimiento") {
            // ACTUALIZAR MEMORIA
            // Actualizamos la posición de ESTE jugador en la lista global
            if (jugadores[id]) {
                jugadores[id].x = datos.x;
                jugadores[id].y = datos.y;
            }

            // 3. BROADCAST (EL ECO) 📢
            // Enviar la lista COMPLETA de jugadores a TODOS los conectados
            broadcast();

        }
        // --- NUEVO: CHAT ---
        else if (datos.tipo === "chat") {
            console.log(`💬 ${id} dice: ${datos.texto}`);
            
            // Reenviar a TODOS (Broadcast)
            const paquete = JSON.stringify({
                tipo: "mensaje_chat",
                id: id,
                texto: datos.texto
            });
            
            wss.clients.forEach(function each(client) {
                if (client.readyState === WebSocket.OPEN) {
                    client.send(paquete);
                }
            });
        }

        // --- NUEVO: COMBATE ---
        else if (datos.tipo === "atacar") {
            console.log(`⚔️ ${id} lanzó un ataque.`);
            
            // EL JUEZ: Revisar si alguien estaba cerca del atacante
            const atacante = jugadores[id];
            
            // Recorremos a todos los jugadores para ver si alguien recibe el golpe
            Object.keys(jugadores).forEach(otro_id => {
                if (otro_id !== id) { // No pegarse a sí mismo
                    const victima = jugadores[otro_id];
                    
                    // Fórmula de distancia simple (Pitagoras)
                    const dx = atacante.x - victima.x;
                    const dy = atacante.y - victima.y;
                    const distancia = Math.sqrt(dx*dx + dy*dy);
                    
                    // Si está a menos de 60 pixeles (cerca), le pegamos
                    if (distancia < 60) {
                        victima.hp -= 10; // Quitamos 10 de vida
                        
                        // 1. DETECTAR MUERTE
                        if (victima.hp <= 0) {
                            victima.hp = 0;
                            console.log(`💀 El jugador ${otro_id} ha muerto.`);

                            
                        
                        // Avisar a todos que murió
                            broadcast_muerte(otro_id);

                            // 2. PROGRAMAR RESPAWN (REVIVIR)
                            // Esperamos 3 segundos (3000 ms) y lo revivimos
                            setTimeout(() => {
                                revivir_jugador(otro_id);
                            }, 3000);
                        } else {
                             // Si sigue vivo, solo avisamos del daño
                             broadcast_dano(otro_id, victima.hp);


                        }
                    }
                }
            });
        }
    } catch (e) {
        // Ignorar errores de JSON basura
    }
  });

  ws.on('close', () => {
    console.log(`❌ Jugador ${id} desconectado.`);
      // Borrar al jugador de la memoria para que desaparezca de las pantallas
      delete jugadores[id];
      broadcast(); // Avisar a los demás que se fue

  });
});

// 1. Función principal de actualización (MODIFICADA)
function broadcast() {
    const paquete = JSON.stringify({
        tipo: "actualizacion_mundo",
        jugadores: jugadores
    });
    enviar_a_todos(paquete); // <--- ¡Mira qué corto queda!
}


// 2. Función de daño (MODIFICADA)
function broadcast_dano(id_herido, nueva_vida) {
    const paquete = JSON.stringify({
        tipo: "dano",
        id: id_herido,
        vida: nueva_vida
    });
    enviar_a_todos(paquete); // <--- Usamos el auxiliar
}


// 3. Avisar muerte (YA ESTABA BIEN)
function broadcast_muerte(id_muerto) {
    const paquete = JSON.stringify({
        tipo: "muerte",
        id: id_muerto
    });
    enviar_a_todos(paquete);
}


// LISTA DE PUNTOS DE RESPAWN (Configura tus coordenadas aquí)
const PUNTOS_RESPAWN = [
    { x: -165, y: 172 }, // Punto 0
    { x: 164, y: 166 }, // Punto 1
    { x: 165, y: -169 }, // Punto 2
    { x: -173, y: -164 }  // Punto 3
];

function revivir_jugador(id_revivir) {
    if (jugadores[id_revivir]) {
        jugadores[id_revivir].hp = 100;
        
        // --- NUEVA LÓGICA: ELEGIR UN PUNTO DE LA LISTA ---
        // Elegimos un índice al azar (del 0 al 3)
        const indice = Math.floor(Math.random() * PUNTOS_RESPAWN.length);
        const punto_elegido = PUNTOS_RESPAWN[indice];
        
        // Asignamos esas coordenadas exactas
        jugadores[id_revivir].x = punto_elegido.x;
        jugadores[id_revivir].y = punto_elegido.y;
        
        console.log(`✨ Jugador ${id_revivir} revivió en el punto #${indice}`);
        
        const paquete = JSON.stringify({
            tipo: "respawn",
            id: id_revivir,
            x: jugadores[id_revivir].x,
            y: jugadores[id_revivir].y,
            hp: 100
        });
        enviar_a_todos(paquete);
    }
}

// 5. LA HERRAMIENTA MAESTRA (MANTENER)
function enviar_a_todos(paquete) {
    wss.clients.forEach(function each(client) {
        if (client.readyState === WebSocket.OPEN) {
            client.send(paquete);
        }
    });
}