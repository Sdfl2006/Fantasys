const axios = require('axios');
const fs = require('fs');

// 1. Configuración de cabeceras
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'es-ES,es;q=0.9',
    }
});

// 2. Función de búsqueda recursiva
function buscarNodoJugador(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (!Array.isArray(obj) && obj.name && obj.id && obj.mainLeague) return obj;
    for (let key in obj) {
        const res = buscarNodoJugador(obj[key]);
        if (res) return res;
    }
    return null;
}

async function inyectarJugador() {
    // 3. Capturar argumentos de la terminal
    const args = process.argv.slice(2);
    if (args.length < 2) {
        console.log('❌ Uso incorrecto.');
        console.log('👉 Ejecuta: node agregar_fichaje.js <ID_FOTMOB> "<NUEVO_EQUIPO>"');
        console.log('💡 Ejemplo: node agregar_fichaje.js 675088 "Real Madrid"');
        process.exit(1);
    }

    const targetId = args[0];
    const nuevoEquipo = args[1];

    console.log(`🔍 Buscando jugador con ID: ${targetId}...`);

    try {
        // Al colocar un guion al final, FotMob redirecciona automáticamente al slug correcto del jugador
        const url = `https://www.fotmob.com/es/players/${targetId}/-`;
        const response = await axiosInstance.get(url);
        
        const match = response.data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) throw new Error('No se pudo extraer la información del perfil.');

        const nextData = JSON.parse(match[1]);
        const playerData = buscarNodoJugador(nextData);

        if (!playerData) throw new Error('Estructura de jugador no encontrada.');

        // Extraer y mapear estadísticas de liga
        const mainLeagueStats = playerData.mainLeague?.stats || [];
        const goles = mainLeagueStats.find(s => s.title === "Goals")?.value || 0;
        const asistencias = mainLeagueStats.find(s => s.title === "Assists")?.value || 0;
        const fotmob = mainLeagueStats.find(s => s.title === "Rating")?.value || 0.00;
        const vallas = mainLeagueStats.find(s => s.title === "Clean sheets")?.value || 0;

        // Extraer posición primaria y homologarla
        const posRaw = playerData.positionDescription?.primaryPosition?.key || 'midfielder';
        let posInterna = 'mediocampistas'; // Default
        if (posRaw.includes('keeper')) posInterna = 'porterias';
        else if (posRaw.includes('defender') || posRaw.includes('back')) posInterna = 'defensas';
        else if (posRaw.includes('striker') || posRaw.includes('winger') || posRaw.includes('forward')) posInterna = 'delanteros';

        const nuevoJugadorObj = {
            id: `fotmob_${playerData.id}`,
            name: playerData.name,
            position: posInterna,
            team: nuevoEquipo,
            teamId: playerData.primaryTeam?.teamId || 0,
            fotmob: parseFloat(fotmob) || 0,
            vallas: parseInt(vallas) || 0,
            goles: parseInt(goles) || 0,
            asistencias: parseInt(asistencias) || 0,
            imagen: `https://images.fotmob.com/image_resources/playerimages/${playerData.id}.png`
        };

        // 4. Leer la base de datos local actual
        const rutaDB = 'jugadores_actualizados.json';
        let dbActual = [];
        if (fs.existsSync(rutaDB)) {
            dbActual = JSON.parse(fs.readFileSync(rutaDB, 'utf-8'));
        } else {
            console.log('⚠️ No se encontró la BD principal, se creará un archivo nuevo.');
        }

        // 5. Verificar si el jugador ya existe para actualizarlo o insertarlo
        const indexExistente = dbActual.findIndex(j => j.id === nuevoJugadorObj.id);
        if (indexExistente >= 0) {
            dbActual[indexExistente] = nuevoJugadorObj;
            console.log(`🔄 El jugador ${nuevoJugadorObj.name} ya existía. Sus datos y equipo han sido actualizados.`);
        } else {
            dbActual.push(nuevoJugadorObj);
            console.log(`✅ Jugador ${nuevoJugadorObj.name} agregado exitosamente a la BD.`);
        }

        // 6. Guardar cambios
        fs.writeFileSync(rutaDB, JSON.stringify(dbActual, null, 2));
        console.log(`💾 Base de datos guardada. Total de jugadores: ${dbActual.length}.`);

    } catch (error) {
        console.error('❌ Error crítico:', error.message);
    }
}

inyectarJugador();