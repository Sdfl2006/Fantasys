const axios = require('axios');
const fs = require('fs');
const path = require('path');

// 1. Configuración de cabeceras para emular tráfico humano de macOS
const axiosInstance = axios.create({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
        'Accept-Language': 'es-ES,es;q=0.9',
    }
});

const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Funciones recursivas para navegación en el JSON
function buscarNodoPlantilla(obj) {
    if (!obj || typeof obj !== 'object') return null;
    if (Array.isArray(obj)) {
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

function crearSlug(texto) {
    return texto.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-');
}

const CONFIG_LIGAS = {
    premier: [
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
    ],
    calcio: [
        { id: 8524, slug: 'atalanta' }, { id: 9857, slug: 'bologna' },
        { id: 8529, slug: 'cagliari' }, { id: 10171, slug: 'como' },
        { id: 8535, slug: 'fiorentina' }, { id: 9891, slug: 'frosinone' },
        { id: 10233, slug: 'genoa' }, { id: 8636, slug: 'inter' },
        { id: 9885, slug: 'juventus' }, { id: 8543, slug: 'lazio' },
        { id: 9888, slug: 'lecce' }, { id: 8564, slug: 'milan' },
        { id: 6504, slug: 'monza' }, { id: 9875, slug: 'napoli' },
        { id: 10167, slug: 'parma' }, { id: 8686, slug: 'roma' },
        { id: 7943, slug: 'sassuolo' }, { id: 9804, slug: 'torino' },
        { id: 8600, slug: 'udinese' }, { id: 7881, slug: 'venezia' }
    ],
    liga: [
        { id: 8315, slug: 'athletic-club' }, { id: 9906, slug: 'atletico-madrid' },
        { id: 8634, slug: 'barcelona' }, { id: 9910, slug: 'celta-vigo' },
        { id: 9783, slug: 'deportivo-a-coruna' }, { id: 9866, slug: 'deportivo-alaves' },
        { id: 10268, slug: 'elche' }, { id: 8558, slug: 'espanyol' },
        { id: 8305, slug: 'getafe' }, { id: 8581, slug: 'levante' },
        { id: 9864, slug: 'malaga' }, { id: 8371, slug: 'osasuna' },
        { id: 8696, slug: 'racing-santander' }, { id: 8370, slug: 'rayo-vallecano' },
        { id: 8603, slug: 'real-betis' }, { id: 8633, slug: 'real-madrid' },
        { id: 8560, slug: 'real-sociedad' }, { id: 8302, slug: 'sevilla' },
        { id: 10267, slug: 'valencia' }, { id: 10205, slug: 'villarreal' }
    ]
};

const diccionarioPosiciones = {
    "keepers": "porterias", "defenders": "defensas",
    "midfielders": "mediocampistas", "attackers": "delanteros"
};

async function ejecutarScraperMaestro() {
    // Capturar argumento de la terminal
    const ligaTarget = process.argv[2] ? process.argv[2].toLowerCase() : 'premier';

    if (!CONFIG_LIGAS[ligaTarget]) {
        console.error(`❌ Liga no válida: "${ligaTarget}". Usa: premier, calcio o liga.`);
        process.exit(1);
    }

    const equipos = CONFIG_LIGAS[ligaTarget];

    if (equipos.length === 0) {
        console.error(`⚠️ La configuración para "${ligaTarget}" está vacía aún. Agrega los IDs de los equipos.`);
        process.exit(1);
    }

    console.log(`🚀 Iniciando Scraper Maestro de FotMob para: [${ligaTarget.toUpperCase()}]...\n`);
    
    let jugadoresRecopilados = [];
    let listaJugadoresAProcesar = [];

    // FASE 1: Recopilar plantillas
    console.log(`--- FASE 1: Recopilando plantillas de los ${equipos.length} equipos ---`);
    for (const equipo of equipos) {
        console.log(`Descargando plantilla: ${equipo.slug.toUpperCase()}...`);
        try {
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
                }
            }
        } catch (error) {
            console.error(`❌ Error en ${equipo.slug}: ${error.message}`);
        }
        await delay(3000);
    }

    console.log(`\n✅ Fase 1 completada. Se encontraron ${listaJugadoresAProcesar.length} jugadores.`);

    // FASE 2: Extracción individual
    console.log('\n--- FASE 2: Extrayendo historial individual de cada jugador ---');
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
                let idEquipoFotmob = 0;

                if (playerData) {
                    nombreEquipo = playerData.primaryTeam?.teamName || 'Desconocido';
                    idEquipoFotmob = playerData.primaryTeam?.teamId || 0;
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
                    team: nombreEquipo,
                    teamId: idEquipoFotmob,
                    fotmob: parseFloat(fotmob) || 0,
                    vallas: parseInt(vallas) || 0,
                    goles: parseInt(goles) || 0,
                    asistencias: parseInt(asistencias) || 0,
                    imagen: `https://images.fotmob.com/image_resources/playerimages/${jInfo.id}.png`
                });
            }
        } catch (error) {
            console.error(`❌ Error en ${jInfo.name}`);
        }
        contador++;
        await delay(3000); 
    }

    // FASE 3: Guardar directo en la carpeta ../data/ del Frontend
    console.log('\n--- FASE 3: Guardando en la carpeta /data/ del frontend ---');
    const rutaDataFolder = path.join(__dirname, '../data');
    
    if (!fs.existsSync(rutaDataFolder)) {
        fs.mkdirSync(rutaDataFolder, { recursive: true });
    }

    const rutaArchivo = path.join(rutaDataFolder, `jugadores_${ligaTarget}.json`);
    fs.writeFileSync(rutaArchivo, JSON.stringify(jugadoresRecopilados, null, 2));
    
    console.log(`✅ ¡Éxito total! Archivo generado en: ${rutaArchivo}`);
}

ejecutarScraperMaestro();