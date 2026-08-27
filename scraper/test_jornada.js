const axios = require('axios');

const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'es-ES,es;q=0.9',
    }
});

// Función estricta para ubicar el nodo del jugador correcto
function buscarNodoJugador(obj, targetId) {
    if (!obj || typeof obj !== 'object') return null;
    
    if (!Array.isArray(obj) && String(obj.id) === String(targetId) && obj.recentMatches) {
        return obj;
    }
    
    for (let key in obj) {
        const res = buscarNodoJugador(obj[key], targetId);
        if (res) return res;
    }
    return null;
}

async function calcularPuntosJornada(playerId, slug, isGoalkeeper = false) {
    try {
        console.log(`\n⏳ Buscando datos de última jornada para: ${slug}...`);
        
        const url = `https://www.fotmob.com/es/players/${playerId}/${slug}`;
        const response = await axiosInstance.get(url);

        const match = response.data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) return console.log(`❌ No se encontró __NEXT_DATA__ para ${slug}.`);

        const nextData = JSON.parse(match[1]);
        const playerData = buscarNodoJugador(nextData, playerId);

        if (!playerData) {
            return console.log(`❌ No se encontró el nodo exacto del jugador (ID: ${playerId}). Revisa que el ID sea correcto.`);
        }

        const recentMatches = playerData.recentMatches;
        if (!recentMatches || recentMatches.length === 0) {
            return console.log(`❌ ${playerData.name} no tiene historial de partidos registrados.`);
        }

        // 1. Filtrar usando la estructura EXACTA de tu captura
        const lastMatch = recentMatches.find(m => {
            const minutos = m.minutesPlayed || 0; // CORREGIDO
            const tieneNota = m.ratingProps && m.ratingProps.rating && m.ratingProps.rating !== "-"; // CORREGIDO
            return minutos > 0 || tieneNota;
        });

        if (!lastMatch) {
            return console.log(`❌ ${playerData.name} no ha tenido minutos registrados en sus últimos partidos.`);
        }

        // 2. Extracción de Nota FotMob (dentro de ratingProps)
        let fotmobRating = 0;
        if (lastMatch.ratingProps && lastMatch.ratingProps.rating) {
            fotmobRating = parseFloat(lastMatch.ratingProps.rating);
        }

        // 3. Extracción de Goles (Bono +2)
        const goles = parseInt(lastMatch.goals) || 0;
        const bonoGoles = goles * 2;

        // 4. Extracción de Valla Invicta
        let bonoValla = 0;
        let golesRecibidos = 0;
        
        if (isGoalkeeper) {
            // Evaluamos isHomeTeam (booleano) para saber qué score revisar
            if (lastMatch.isHomeTeam) {
                golesRecibidos = lastMatch.awayScore;
            } else {
                golesRecibidos = lastMatch.homeScore;
            }
            
            if (golesRecibidos === 0) {
                bonoValla = 1.5;
            }
        }

        const totalFantasys = fotmobRating + bonoGoles + bonoValla;

        // 5. Formatear el enfrentamiento correctamente
        const local = lastMatch.isHomeTeam ? lastMatch.teamName : lastMatch.opponentTeamName;
        const visitante = lastMatch.isHomeTeam ? lastMatch.opponentTeamName : lastMatch.teamName;

        // REPORTE
        console.log(`=========================================`);
        console.log(`⚽ JUGADOR: ${playerData.name} (${lastMatch.teamName})`);
        console.log(`📅 PARTIDO: ${local} ${lastMatch.homeScore} - ${lastMatch.awayScore} ${visitante}`);
        console.log(`⏱️  MINUTOS: ${lastMatch.minutesPlayed}`);
        console.log(`-----------------------------------------`);
        console.log(`⭐ Nota FotMob:      ${fotmobRating.toFixed(2)}`);
        console.log(`🥅 Goles Marcados:   ${goles}  (Bono: +${bonoGoles} pts)`);
        
        if (isGoalkeeper) {
            console.log(`🧤 Valla Invicta:    ${golesRecibidos === 0 ? 'SÍ' : 'NO'} (Bono: +${bonoValla} pts)`);
        }
        
        console.log(`-----------------------------------------`);
        console.log(`🔥 TOTAL FANTASYS:   ${totalFantasys.toFixed(2)} pts`);
        console.log(`=========================================\n`);

    } catch (error) {
        console.error(`❌ Error obteniendo la data de ${slug}:`, error.message);
    }
}

// ==========================================
// EJECUCIÓN DE PRUEBAS
// ==========================================
async function correrPruebas() {
    console.log("Iniciando motor de pruebas de jornada (Estructura JSON Corregida)...");
    
    // El ID real de Vinicius sacado de tu captura: 846033
    await calcularPuntosJornada(737066, 'erling-haaland', false);
    await calcularPuntosJornada(846033, 'vinicius-junior', false); 
}

correrPruebas();