const COMPETITIONS = {
    premier: { id: '47', slug: 'premier-league', name: 'Premier League' },
    liga: { id: '87', slug: 'laliga', name: 'LaLiga' },
    calcio: { id: '55', slug: 'serie-a', name: 'Serie A' }
};

const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/json'
};

const responseHeaders = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
};

function json(statusCode, payload) {
    return { statusCode, headers: responseHeaders, body: JSON.stringify(payload) };
}

function walk(value, visitor, seen = new Set()) {
    if (!value || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    visitor(value);
    Object.values(value).forEach(child => walk(child, visitor, seen));
}

function extractNextData(html) {
    const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
    if (!match) throw new Error('No se encontró la data interna de FotMob');
    return JSON.parse(match[1]);
}

function extractAllMatches(data) {
    let matches = [];
    walk(data, value => {
        if (Array.isArray(value.allMatches) && value.allMatches.length > matches.length) {
            matches = value.allMatches;
        }
    });
    return matches;
}

function normalizeMatch(match) {
    return {
        id: String(match.id),
        round: String(match.round ?? match.roundName ?? 'Sin jornada'),
        roundName: match.roundName ?? match.round ?? 'Sin jornada',
        pageUrl: match.pageUrl || '',
        home: match.home || {},
        away: match.away || {},
        status: match.status || {}
    };
}

function playerFrom(value) {
    if (Array.isArray(value.starters) || Array.isArray(value.substitutes)) return null;
    const player = value.player && typeof value.player === 'object' ? value.player : value;
    const id = player.id ?? value.playerId;
    const name = player.name || value.playerName;
    const ratingValue = value.rating ?? value.ratingProps?.rating ?? player.rating;
    const rating = ratingValue && typeof ratingValue === 'object'
        ? ratingValue.num ?? ratingValue.value
        : ratingValue;
    if (!id || !name) return null;

    const position = String(value.position?.name || value.position || player.position || '').toLowerCase();
    const goals = Number(value.goals ?? value.goalsScored ?? 0) || 0;
    const isGoalkeeper = position.includes('keeper') || position.includes('portero') || position === 'gk';
    const cleanSheet = value.cleanSheet === true || value.hasCleanSheet === true;
    const notaFotmob = Number.parseFloat(rating) || 0;
    const bonoGoles = goals * 2;
    const bonoValla = isGoalkeeper && cleanSheet ? 1.5 : 0;

    return {
        id: String(id),
        name,
        image: `https://images.fotmob.com/image_resources/playerimages/${id}.png`,
        shirtNumber: value.shirtNumber || player.shirtNumber || '',
        teamId: String(value.teamId ?? player.teamId ?? ''),
        teamName: value.teamName || player.teamName || '',
        position,
        isGoalkeeper,
        cleanSheet,
        started: value.isSubstitute !== true && value.substitute !== true,
        status: value.status || (value.isSubstitute ? 'Suplente' : 'Titular'),
        minutesPlayed: Number(value.minutesPlayed ?? value.minutes ?? 0) || 0,
        goals,
        notaFotmob,
        bonoGoles,
        bonoValla,
        totalFantasys: Number((notaFotmob + bonoGoles + bonoValla).toFixed(2))
    };
}

function extractPlayers(data) {
    const players = new Map();
    walk(data, value => {
        if (Array.isArray(value.starters) || Array.isArray(value.substitutes)) {
            const substitutes = value.subs || value.substitutes || [];
            [...(value.starters || []), ...substitutes, ...(value.unavailable || [])].forEach(item => {
                const performance = item.performance || {};
                const events = performance.events || [];
                const isUnavailable = (value.unavailable || []).includes(item);
                const isSubstitute = substitutes.includes(item);
                const entered = performance.substitutionEvents?.some(event => event.type === 'subIn');
                const player = playerFrom({
                    ...item,
                    rating: performance.rating,
                    goals: events.filter(event => event.type === 'goal').length,
                    teamId: value.id,
                    teamName: value.name,
                    position: item.positionId === 11 ? 'gk' : item.position,
                    isSubstitute,
                    minutesPlayed: item.minutesPlayed || (performance.rating ? 1 : 0),
                    status: isUnavailable ? 'No convocado' : isSubstitute
                        ? (entered ? 'Suplente ingresó' : 'Suplente no ingresó')
                        : 'Titular'
                });
                if (player) players.set(`${player.id}-${player.teamId}`, player);
            });
            return;
        }
    });
    return [...players.values()];
}

async function fetchPage(url) {
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`FotMob respondió ${response.status}`);
    return extractNextData(await response.text());
}

exports.handler = async event => {
    const { leagueId, matchId } = event.queryStringParameters || {};
    const competition = COMPETITIONS[leagueId];
    if (!competition) return json(400, { error: 'Liga no soportada' });

    try {
        if (!matchId) {
            const data = await fetchPage(`https://www.fotmob.com/es/leagues/${competition.id}/fixtures/${competition.slug}?group=by-date`);
            const matches = extractAllMatches(data).map(normalizeMatch);
            return json(200, { competition: competition.name, matches });
        }

        const listData = await fetchPage(`https://www.fotmob.com/es/leagues/${competition.id}/fixtures/${competition.slug}?group=by-date`);
        const match = extractAllMatches(listData).map(normalizeMatch).find(item => item.id === String(matchId));
        if (!match || !match.pageUrl) return json(404, { error: 'Partido no encontrado' });

        const detailData = await fetchPage(`https://www.fotmob.com/es${match.pageUrl.split('#')[0]}`);
        const players = extractPlayers(detailData);
        players.forEach(player => {
            const team = String(player.teamId) === String(match.home.id) ? match.home : match.away;
            const opponentScore = team === match.home
                ? Number((match.status.scoreStr || '').split('-')[1])
                : Number((match.status.scoreStr || '').split('-')[0]);
            if (player.isGoalkeeper && Number.isFinite(opponentScore) && opponentScore === 0) {
                player.bonoValla = 1.5;
                player.totalFantasys = Number((player.notaFotmob + player.bonoGoles + player.bonoValla).toFixed(2));
            }
        });
        return json(200, { competition: competition.name, match, players });
    } catch (error) {
        console.error('Error obteniendo partidos:', error);
        return json(500, { error: error.message, matches: [], players: [] });
    }
};