exports.handler = async function(event, context) {
    const { playerId, playerName, slug, isGoalkeeper, teamId, teamName, leagueId, jornada } = event.queryStringParameters;

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

    function getMatchRound(match) {
        const value = match?.round ?? match?.roundName ?? match?.matchweek ?? match?.roundNumber;
        return Number.parseInt(String(value || '').match(/\d+/)?.[0], 10);
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

    function normalizePlayerName(name) {
        return String(name || '').toLowerCase().normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ')
            .split(/\s+/).filter(token => token.length > 2).sort().join(' ');
    }

    try {
        if (leagueId === 'calcio') {
            const selectedRound = Number.parseInt(jornada, 10);
            const votesUrl = Number.isInteger(selectedRound) && selectedRound > 0
                ? `https://www.fantacalcio.it/voti-fantacalcio-serie-a/2026-27/${selectedRound}`
                : 'https://www.fantacalcio.it/voti-fantacalcio-serie-a';
            const votesResponse = await fetch(votesUrl, { headers });
            if (!votesResponse.ok) throw new Error('Error al contactar a Fantacalcio');
            const votesHtml = await votesResponse.text();
            const teamSlug = createTeamSlug(teamName);
            const playerSlug = createTeamSlug(slug);
            const tables = [...votesHtml.matchAll(/<table class="grades-table">([\s\S]*?)<\/table>/g)];
            const teamBlock = [...votesHtml.matchAll(/<li id="match-\d+"[\s\S]*?(?=<li id="match-\d+"|<\/ul>)/g)]
                .map(match => match[0])
                .find(block => [...block.matchAll(/href="[^\"]+\/squadre\/([^\"]+)"/g)].slice(0, 2).some(match => match[1] === teamSlug));
            const teamMatch = teamBlock ? {
                teams: [...teamBlock.matchAll(/href="[^\"]+\/squadre\/([^\"]+)"/g)].slice(0, 2).map(match => match[1]),
                homeScore: teamBlock.match(/class="score-home">([^<]*)/)?.[1],
                awayScore: teamBlock.match(/class="score-away">([^<]*)/)?.[1]
            } : null;
            if (teamBlock && (teamBlock.includes('disabled') || teamBlock.includes('match-status-0') || ['vs', ''].includes(String(teamMatch.homeScore).trim().toLowerCase()))) {
                return { statusCode: 200, body: JSON.stringify({ error: 'Aún no ha jugado', totalFantasys: 0 }) };
            }
            let playerRow = null;
            let teamMatchIndex = -1;
            for (const table of tables) {
                if (!new RegExp(`/squadre/${teamSlug}(["/])`).test(table[1])) continue;
                for (const rowMatch of table[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
                    const row = rowMatch[1];
                    const link = row.match(/class="player-name player-link"[\s\S]*?href="[^\"]+\/([^\/\"]+)\/(\d+)"[\s\S]*?<span>([^<]+)<\/span>/);
                    const requestedName = normalizePlayerName(playerName);
                    const candidateName = normalizePlayerName(link?.[3]);
                    const sharesNameToken = requestedName && candidateName && requestedName.split(' ').some(token => candidateName.split(' ').includes(token));
                    if (link && (link[2] === String(playerId) || link[1] === playerSlug || createTeamSlug(link[3]) === createTeamSlug(playerName) || sharesNameToken)) {
                        playerRow = row;
                        break;
                    }
                }
                if (playerRow) break;
            }
            if (!playerRow) return { statusCode: 200, body: JSON.stringify({ error: 'No convocado', totalFantasys: 0 }) };
            const grade = playerRow.match(/class="player-grade[^"]*" data-value="([^"]+)"/);
            if (!grade) return { statusCode: 200, body: JSON.stringify({ error: 'No ingresó', totalFantasys: 0 }) };
            const bonus = title => Number(playerRow.match(new RegExp(`data-value="([^\"]+)"[^>]*title="${title}"`))?.[1] || 0);
            const parsedGrade = Number.parseFloat(grade[1].replace(',', '.')) || 0;
            const notaFantacalcio = parsedGrade === 55 ? 3 : parsedGrade;
            const bonoGoles = bonus('Gol segnati') * 3;
            const homeScore = Number(teamMatch?.homeScore);
            const awayScore = Number(teamMatch?.awayScore);
            const teamIsHome = teamMatch?.teams[0] === teamSlug;
            const opponentScore = teamIsHome ? awayScore : homeScore;
            const rowIsGoalkeeper = /class="role" data-value="p"/.test(playerRow);
            const bonoValla = rowIsGoalkeeper && Number.isFinite(opponentScore) && opponentScore === 0 ? 2 : 0;
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify({ nombre: playerName || teamName, notaFantacalcio, notaFotmob: notaFantacalcio, bonoGoles, bonoValla, competicion: 'Serie A', totalFantasys: Number((notaFantacalcio + bonoGoles + bonoValla).toFixed(2)) })
            };
        }
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

        if ((!playerData || !playerData.recentMatches || playerData.recentMatches.length === 0) && !teamId) {
            return { statusCode: 200, body: JSON.stringify({ error: "Sin historial", totalFantasys: 0 }) };
        }

        // Primero identificamos el último partido del equipo; el jugador puede
        // tener un partido más reciente con otra selección o competición.
        let lastMatch = null;
        // --- FIRMA DEL ÚLTIMO PARTIDO DEL EQUIPO ---
        let currentTeamId = (teamId && teamId !== '0' && teamId !== 'undefined') ? teamId : (playerData?.primaryTeam?.teamId);
        let validTeamMatchFound = false;
        let latestTeamFixture = null;

        if (currentTeamId && currentTeamId !== '0') {
            try {
                const currentTeamName = teamName || playerData?.primaryTeam?.teamName;
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
                        const competitionFixtures = fixtures.filter(isAllowedCompetition);
                        const requestedRound = Number.parseInt(jornada, 10);
                        competitionFixtures.sort((a, b) => getMatchDate(a) - getMatchDate(b));
                        const roundFixture = Number.isInteger(requestedRound)
                            ? competitionFixtures.find(m => getMatchRound(m) === requestedRound) || competitionFixtures[requestedRound - 1]
                            : null;
                        if (roundFixture && !(roundFixture.status?.finished === true || roundFixture.status?.reason?.short === 'FT')) {
                            return { statusCode: 200, body: JSON.stringify({ error: 'Aún no ha jugado', totalFantasys: 0 }) };
                        }
                        const finished = competitionFixtures.filter(m =>
                            (m.status?.finished === true || m.status?.reason?.short === 'FT') &&
                            (!roundFixture || m === roundFixture)
                        );
                        if (Number.isInteger(requestedRound) && !roundFixture) {
                            return { statusCode: 200, body: JSON.stringify({ error: 'Aún no ha jugado', totalFantasys: 0 }) };
                        }
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

                        lastMatch = (playerData?.recentMatches || [])
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