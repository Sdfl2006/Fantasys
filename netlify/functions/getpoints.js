exports.handler = async function(event, context) {
    const { playerId, slug, isGoalkeeper, teamId, teamName, leagueId } = event.queryStringParameters;

    if (!playerId || !slug) {
        return { statusCode: 400, body: JSON.stringify({ error: "Faltan parámetros" }) };
    }

    const isGk = isGoalkeeper === 'true';
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'es-ES,es;q=0.9',
    };

    const COMPETITIONS = {
        premier: { ids: ['47'], names: ['premier league'] },
        liga: { ids: ['87'], names: ['la liga', 'laliga'] },
        calcio: { ids: ['55'], names: ['serie a'] }
    };

    const competition = COMPETITIONS[leagueId];
    if (!competition) {
        return { statusCode: 400, body: JSON.stringify({ error: "Liga no soportada", totalFantasys: 0 }) };
    }

    function getCompetitionValues(match) {
        const tournament = match?.tournament || {};
        const uniqueTournament = tournament.uniqueTournament || {};
        return [
            match?.leagueId, match?.competitionId, match?.parentLeagueId,
            tournament.id, uniqueTournament.id,
            match?.leagueName, match?.competitionName, match?.tournamentName,
            tournament.name, uniqueTournament.name
        ].filter(value => value !== undefined && value !== null).map(String);
    }

    function isAllowedCompetition(match) {
        const values = getCompetitionValues(match);
        const ids = values.filter(value => /^\d+$/.test(value));
        const names = values.map(value => value.toLowerCase().trim());
        return ids.some(id => competition.ids.includes(id)) ||
            names.some(name => competition.names.some(allowed => name === allowed || name.includes(allowed)));
    }

    function getMatchDate(match) {
        return new Date(
            match?.matchDate?.utcTime || match?.matchDate ||
            match?.status?.utcTime || match?.utcTime || 0
        ).getTime();
    }

    function getMatchSignature(match) {
        const homeId = match?.homeTeamId || match?.home?.id || (match?.isHomeTeam ? match?.teamId : match?.opponentTeamId);
        const awayId = match?.awayTeamId || match?.away?.id || (match?.isHomeTeam ? match?.opponentTeamId : match?.teamId);
        if (!homeId || !awayId) return null;
        return [String(homeId), String(awayId)].sort().join('_');
    }

    function getMatchDetails(match, currentTeamId) {
        const isHome = String(match?.home?.id || match?.homeTeamId || match?.teamId) === String(currentTeamId);
        const opponent = match?.opponentTeamName || (isHome ? match?.away?.name : match?.home?.name) || '';
        const competitionName = match?.leagueName || match?.tournament?.name || match?.competitionName || '';
        const date = match?.matchDate?.utcTime || match?.status?.utcTime || match?.utcTime || '';
        return {
            rival: opponent,
            competicion: competitionName,
            fecha: date,
            partido: isHome
                ? `${match?.teamName || match?.home?.name || ''} vs ${opponent}`
                : `${opponent} vs ${match?.teamName || match?.away?.name || ''}`
        };
    }

    function createTeamSlug(name) {
        return String(name || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, '-')
            .replace(/^-|-$/g, '');
    }

    try {
        const url = `https://www.fotmob.com/es/players/${playerId}/${slug}`;
        const response = await fetch(url, { headers });

        if (!response.ok) throw new Error("Error al contactar a FotMob");
        const html = await response.text();
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
        if (!match) throw new Error("No se encontró la data interna");

        const nextData = JSON.parse(match[1]);

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
            return { statusCode: 200, body: JSON.stringify({ error: "Sin historial", totalFantasys: 0 }) };
        }

        // Primero identificamos el último partido del equipo; el jugador puede
        // tener un partido más reciente con otra selección o competición.
        let lastMatch = null;
        // --- FIRMA DEL ÚLTIMO PARTIDO DEL EQUIPO ---
        let currentTeamId = (teamId && teamId !== '0' && teamId !== 'undefined') ? teamId : (playerData.primaryTeam?.teamId);
        let validTeamMatchFound = false;
        let latestTeamFixture = null;

        if (currentTeamId && currentTeamId !== '0') {
            try {
                const currentTeamName = teamName || playerData.primaryTeam?.teamName;
                const teamSlug = createTeamSlug(currentTeamName);
                const teamRes = await fetch(`https://www.fotmob.com/es/teams/${currentTeamId}/fixtures/${teamSlug}`, { headers });
                if (teamRes.ok) {
                    const teamHtml = await teamRes.text();
                    const teamPageMatch = teamHtml.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
                    if (!teamPageMatch) throw new Error("No se encontró la data de fixtures del equipo");
                    const teamPageData = JSON.parse(teamPageMatch[1]);
                    const teamData = teamPageData.props?.pageProps?.fallback?.[`team-${currentTeamId}`];
                    let tTeam1 = null;
                    let tTeam2 = null;

                    const fixtures = teamData?.fixtures?.allFixtures?.fixtures || [];
                    if (fixtures.length > 0) {
                        const finished = fixtures.filter(m =>
                            (m.status?.finished === true || m.status?.reason?.short === 'FT') &&
                            isAllowedCompetition(m)
                        );
                        if (finished.length > 0) {
                            finished.sort((a, b) => getMatchDate(a) - getMatchDate(b));
                            const lastFixture = finished[finished.length - 1];
                            latestTeamFixture = lastFixture;
                            tTeam1 = String(lastFixture.home?.id || lastFixture.homeTeamId || 0);
                            tTeam2 = String(lastFixture.away?.id || lastFixture.awayTeamId || 0);
                        }
                    }

                    // --- COMPARACIÓN CON EL HISTORIAL DEL JUGADOR ---
                    if (tTeam1 && tTeam2) {
                        validTeamMatchFound = true;
                        const teamMatchSignature = [tTeam1, tTeam2].sort().join('_');

                        lastMatch = playerData.recentMatches
                            .filter(match => isAllowedCompetition(match) && getMatchSignature(match) === teamMatchSignature)
                            .sort((a, b) => getMatchDate(b) - getMatchDate(a))[0];

                        if (!lastMatch) {
                            return { statusCode: 200, body: JSON.stringify({
                                error: "No convocado",
                                totalFantasys: 0,
                                ...getMatchDetails(latestTeamFixture, currentTeamId)
                            }) };
                        }

                        if ((lastMatch.minutesPlayed || 0) === 0) {
                            return { statusCode: 200, body: JSON.stringify({
                                error: "No ingresó",
                                totalFantasys: 0,
                                ...getMatchDetails(lastMatch, currentTeamId)
                            }) };
                        }
                    }
                }
            } catch(e) {
                console.log("Error al consultar el equipo:", e);
            }
        }

        // Sin una firma del último partido del equipo no se puede certificar la jornada.
        if (!validTeamMatchFound) {
            return { statusCode: 200, body: JSON.stringify({ error: "No se pudo validar el último partido del equipo", totalFantasys: 0 }) };
        }

        // --- 5. EXTRACCIÓN DE NOTAS Y BONOS ---
        let fotmobRating = 0;
        if (lastMatch.ratingProps && lastMatch.ratingProps.rating && lastMatch.ratingProps.rating !== "-") {
            fotmobRating = parseFloat(lastMatch.ratingProps.rating);
        }

        const goles = parseInt(lastMatch.goals || lastMatch.goalsScored) || 0;
        const bonoGoles = goles * 2;

        let bonoValla = 0;
        if (isGk) {
            const golesRecibidos = lastMatch.isHomeTeam ? (lastMatch.awayScore || 0) : (lastMatch.homeScore || 0);
            if (golesRecibidos === 0) bonoValla = 1.5;
        }

        const totalFantasys = fotmobRating + bonoGoles + bonoValla;
        const matchDetails = getMatchDetails(lastMatch, currentTeamId);

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                nombre: playerData.name,
                notaFotmob: fotmobRating,
                bonoGoles: bonoGoles,
                bonoValla: bonoValla,
                ...matchDetails,
                totalFantasys: parseFloat(totalFantasys.toFixed(2))
            })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message, totalFantasys: 0 }) };
    }
};