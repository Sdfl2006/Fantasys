// netlify/functions/getPoints.js

exports.handler = async function(event, context) {
    // 1. Extraemos las variables que el Frontend nos enviará en la URL
    const { playerId, slug, isGoalkeeper } = event.queryStringParameters;

    if (!playerId || !slug) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: "Faltan parámetros: playerId o slug" })
        };
    }

    const isGk = isGoalkeeper === 'true';

    try {
        const url = `https://www.fotmob.com/es/players/${playerId}/${slug}`;
        
        // Usamos fetch nativo (disponible en Netlify) con nuestras cabeceras blindadas
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                'Accept-Language': 'es-ES,es;q=0.9',
            }
        });

        if (!response.ok) throw new Error("Error al contactar a FotMob");
        const html = await response.text();

        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) throw new Error("No se encontró la data interna de FotMob");

        const nextData = JSON.parse(match[1]);

        // Función recursiva interna
        function buscarNodoJugador(obj, targetId) {
            if (!obj || typeof obj !== 'object') return null;
            if (!Array.isArray(obj) && String(obj.id) === String(targetId) && obj.recentMatches) return obj;
            for (let key in obj) {
                const res = buscarNodoJugador(obj[key], targetId);
                if (res) return res;
            }
            return null;
        }

        const playerData = buscarNodoJugador(nextData, playerId);

        if (!playerData || !playerData.recentMatches || playerData.recentMatches.length === 0) {
            return { statusCode: 200, body: JSON.stringify({ error: "No jugó", totalFantasys: 0 }) };
        }

        const lastMatch = playerData.recentMatches.find(m => {
            const minutos = m.minutesPlayed || 0;
            const tieneNota = m.ratingProps && m.ratingProps.rating && m.ratingProps.rating !== "-";
            return minutos > 0 || tieneNota;
        });

        if (!lastMatch) {
            return { statusCode: 200, body: JSON.stringify({ error: "No jugó", totalFantasys: 0 }) };
        }

        // Extracción de datos
        let fotmobRating = 0;
        if (lastMatch.ratingProps && lastMatch.ratingProps.rating) {
            fotmobRating = parseFloat(lastMatch.ratingProps.rating);
        }

        const goles = parseInt(lastMatch.goals) || 0;
        const bonoGoles = goles * 2;

        let bonoValla = 0;
        if (isGk) {
            const golesRecibidos = lastMatch.isHomeTeam ? lastMatch.awayScore : lastMatch.homeScore;
            if (golesRecibidos === 0) bonoValla = 1.5;
        }

        const totalFantasys = fotmobRating + bonoGoles + bonoValla;

        // 3. Devolvemos el JSON limpio al Frontend
        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" // Previene bloqueos CORS
            },
            body: JSON.stringify({
                nombre: playerData.name,
                notaFotmob: fotmobRating,
                golesMarcados: goles,
                bonoGoles: bonoGoles,
                vallaInvicta: bonoValla > 0,
                bonoValla: bonoValla,
                totalFantasys: parseFloat(totalFantasys.toFixed(2))
            })
        };

    } catch (error) {
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: error.message, totalFantasys: 0 }) 
        };
    }
};