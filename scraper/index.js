const axios = require('axios');
const fs = require('fs');

// 1. Configuración de cabeceras para emular tráfico humano de macOS
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'es-ES,es;q=0.9',
    }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Funciones recursivas con BLINDAJE contra valores 'null'
function buscarNodoPlantilla(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    if (Array.isArray(obj)) {
        // Verificamos que obj[0] no sea null antes de pedir su .title
        if (obj.length > 0 && obj[0] && (obj[0].title === 'coach' || obj[0].title === 'keepers' || obj[0].title === 'defenders')) {
            return obj;
        }
    }
    
    for (let key in obj) {
        const res = buscarNodoPlantilla(obj[key]);
        if (res) return res;
    }
    return null;
}

function buscarNodoJugador(obj) {
    if (!obj || typeof obj !== 'object') return null;
    
    if (!Array.isArray(obj) && obj.primaryTeam && obj.name && obj.id) return obj;
    
    for (let key in obj) {
        const res = buscarNodoJugador(obj[key]);
        if (res) return res;
    }
    return null;
}

// Transformar nombres a URLs limpias (ej: Rúben Dias -> ruben-dias)
function crearSlug(texto) {
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-');
}

// 2. Diccionarios exactos y blindados
const equipos = [
    { id: 8678, slug: 'afc-bournemouth' }, { id: 9825, slug: 'arsenal' },
    { id: 10252, slug: 'aston-villa' }, { id: 9937, slug: 'brentford' },
    { id: 10204, slug: 'brighton-hove-albion' }, { id: 8455, slug: 'chelsea' },
    { id: 8669, slug: 'coventry-city' }, { id: 9826, slug: 'crystal-palace' },
    { id: 8668, slug: 'everton' }, { id: 9879, slug: 'fulham' },
    { id: 8667, slug: 'hull-city' }, { id: 9902, slug: 'ipswich-town' },
    { id: 8463, slug: 'leeds-united' }, { id: 8650, slug: 'liverpool' },
    { id: 8456, slug: 'manchester-city' }, { id: 10260, slug: 'manchester-united' },
    { id: 10261, slug: 'newcastle-united' }, { id: 10203, slug: 'nottingham-forest' },
    { id: 8472, slug: 'sunderland' }, { id: 8586, slug: 'tottenham-hotspur' }
];

const diccionarioPosiciones = {
    "keepers": "porterias", "defenders": "defensas",
    "midfielders": "mediocampistas", "attackers": "delanteros"
};

async function ejecutarScraperMaestro() {
    console.log('🚀 Iniciando Scraper Maestro de FotMob (Versión Blindada)...\n');
    
    let jugadoresRecopilados = [];
    let listaJugadoresAProcesar = [];

    // =========================================================
    // FASE 1: Obtener la lista de jugadores por cada equipo
    // =========================================================
    console.log('--- FASE 1: Recopilando plantillas de los 20 equipos ---');
    for (const equipo of equipos) {
        console.log(`Descargando plantilla: ${equipo.slug.toUpperCase()}...`);
        try {
            // Usando tu URL correcta: /overview/
            const url = `https://www.fotmob.com/es/teams/${equipo.id}/overview/${equipo.slug}`;
            const response = await axiosInstance.get(url);
            
            const match = response.data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            
            if (match) {
                const nextData = JSON.parse(match[1]);
                const squadNodes = buscarNodoPlantilla(nextData);
                
                if (squadNodes) {
                    squadNodes.forEach(grupo => {
                        if (grupo.title === "coach") return;
                        const posInterna = diccionarioPosiciones[grupo.title];
                        
                        // Validar que posInterna exista para evitar errores con títulos raros
                        if (!posInterna) return; 

                        grupo.members.forEach(jugador => {
                            if (jugador && jugador.id && jugador.name) {
                                listaJugadoresAProcesar.push({
                                    id: jugador.id,
                                    name: jugador.name,
                                    slug: crearSlug(jugador.name),
                                    position: posInterna
                                });
                            }
                        });
                    });
                } else {
                    console.log(`⚠️ No se encontró la tabla de jugadores para ${equipo.slug}`);
                }
            }
        } catch (error) {
            console.error(`❌ Error en ${equipo.slug}: ${error.message}`);
        }
        await delay(3000); // Pausa de cortesía
    }

    console.log(`\n✅ Fase 1 completada. Se encontraron ${listaJugadoresAProcesar.length} jugadores.`);
    
    if (listaJugadoresAProcesar.length === 0) {
        console.log('⚠️ No hay jugadores para procesar. Abortando Fase 2.');
        return;
    }

    console.log('\n--- FASE 2: Extrayendo historial individual de cada jugador ---');
    console.log(`⚠️ Este proceso tomará aprox. ${(listaJugadoresAProcesar.length * 3 / 60).toFixed(1)} minutos. Déjalo correr.\n`);

    // =========================================================
    // FASE 2: Iterar sobre cada jugador para extraer stats
    // =========================================================
    let contador = 1;
    for (const jInfo of listaJugadoresAProcesar) {
        console.log(`[${contador}/${listaJugadoresAProcesar.length}] Analizando a: ${jInfo.name} ...`);
        try {
            const url = `https://www.fotmob.com/es/players/${jInfo.id}/${jInfo.slug}`;
            const response = await axiosInstance.get(url);
            const match = response.data.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);

            if (match) {
                const nextData = JSON.parse(match[1]);
                const playerData = buscarNodoJugador(nextData);
                
                let fotmob = 0, goles = 0, asistencias = 0, vallas = 0;
                let nombreEquipo = 'Desconocido';

                if (playerData) {
                    nombreEquipo = playerData.primaryTeam?.teamName || 'Desconocido';
                    const mainLeagueStats = playerData.mainLeague?.stats || [];

                    goles = mainLeagueStats.find(s => s.title === "Goals")?.value || 0;
                    asistencias = mainLeagueStats.find(s => s.title === "Assists")?.value || 0;
                    fotmob = mainLeagueStats.find(s => s.title === "Rating")?.value || 0.00;
                    vallas = mainLeagueStats.find(s => s.title === "Clean sheets")?.value || 0;
                }

                jugadoresRecopilados.push({
                    id: `fotmob_${jInfo.id}`,
                    name: jInfo.name,
                    position: jInfo.position,
                    team: nombreEquipo !== 'Desconocido' ? nombreEquipo : 'Premier League',
                    fotmob: parseFloat(fotmob) || 0,
                    vallas: parseInt(vallas) || 0,
                    goles: parseInt(goles) || 0,
                    asistencias: parseInt(asistencias) || 0,
                    imagen: `https://images.fotmob.com/image_resources/playerimages/${jInfo.id}.png`
                });
            }
        } catch (error) {
            console.error(`❌ Error al extraer datos de ${jInfo.name}`);
        }
        
        contador++;
        await delay(3000); 
    }

    // =========================================================
    // FASE 3: Guardado en disco
    // =========================================================
    console.log('\n--- FASE 3: Guardando base de datos consolidada ---');
    fs.writeFileSync('jugadores_actualizados.json', JSON.stringify(jugadoresRecopilados, null, 2));
    console.log(`✅ ¡Éxito total! Archivo generado con ${jugadoresRecopilados.length} jugadores.`);
}

ejecutarScraperMaestro();