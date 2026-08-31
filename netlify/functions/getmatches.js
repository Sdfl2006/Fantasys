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

function getCurrentRound(matches) {
    const rounds = matches.filter(match => match.status?.finished === true)
        .map(match => Number.parseInt(match.round ?? match.roundName, 10)).filter(Number.isFinite);
    return rounds.length ? Math.max(...rounds) : 1;
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

function decodeHtml(value) {
    return String(value || '')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
        .replace(/&#x27;|&#39;|&#039;/gi, "'")
        .replace(/&quot;/gi, '"')
        .replace(/&amp;/gi, '&')
        .replace(/&#xB0;/gi, '°')
        .replace(/<[^>]+>/g, '')
        .trim();
}

function displayTeamName(slug) {
    return String(slug || '').split('-').map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
}

function calcioTeamLogo(slug) {
    const filename = slug === 'juventus' ? 'juventus_2024.png' : `${slug}_d.png`;
    return `https://content.fantacalcio.it/web/img/team/ico/${filename}`;
}

function normalizePlayerName(value) {
    return decodeHtml(value).toLowerCase().normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ')
        .split(/\s+/).filter(token => token.length > 2).sort().join(' ');
}

function parseCalcioMatches(html) {
    const matches = [];
    const matchPattern = /<li id="match-(\d+)" data-teams-id="([^\"]+)"[\s\S]*?<div class="matchweek">\s*(\d+)[\s\S]*?<label[\s\S]*?href="[^\"]+\/squadre\/([^\"]+)"[\s\S]*?<label[\s\S]*?href="[^\"]+\/squadre\/([^\"]+)"[\s\S]*?<span class="score-home">([^<]*)[\s\S]*?<span class="score-away">([^<]*)[\s\S]*?<div class="match-date">([\s\S]*?)<\/div>[\s\S]*?<\/li>/g;
    let match;
    while ((match = matchPattern.exec(html))) {
        const teamIds = match[2].split('|');
        const date = match[8].match(/content="([^\"]+)"/);
        const scoreHome = decodeHtml(match[6]);
        const scoreAway = decodeHtml(match[7]);
        matches.push({
            id: match[1], round: match[3], roundName: match[3],
            pageUrl: `/serie-a/calendario/${match[3]}/2026-27/${match[4]}-${match[5]}/${match[1]}`,
            home: { id: teamIds[0], name: displayTeamName(match[4]), slug: match[4], logo: calcioTeamLogo(match[4]) },
            away: { id: teamIds[1], name: displayTeamName(match[5]), slug: match[5], logo: calcioTeamLogo(match[5]) },
            status: { finished: scoreHome !== 'vs' && scoreHome !== '', scoreStr: scoreHome && scoreAway ? `${scoreHome}-${scoreAway}` : 'vs', utcTime: date ? date[1] : '' }
        });
    }
    return matches;
}

function parseCalcioTables(html, matches) {
    const playersByTeam = new Map();
    for (const table of html.matchAll(/<table class="grades-table">([\s\S]*?)<\/table>/g)) {
        const body = table[1];
        const team = body.match(/href="[^\"]+\/squadre\/([^\"]+)"/);
        if (!team) continue;
        const players = [];
        for (const rowMatch of body.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
            const row = rowMatch[1];
            const link = row.match(/class="player-name player-link"[\s\S]*?href="[^\"]+\/([^\/\"]+)\/(\d+)"[\s\S]*?<span>([^<]+)<\/span>/);
            const grade = row.match(/class="player-grade[^"]*" data-value="([^"]+)"/);
            if (!link || !grade) continue;
            const role = row.match(/class="role" data-value="([^"]+)"/);
            const bonus = title => Number(row.match(new RegExp(`data-value="([^\"]+)"[^>]*title="${title}"`))?.[1] || 0);
            const goals = bonus('Gol segnati');
            const substitutedIn = /alt="Icona subentrato"/.test(row);
            const substitutedOut = /alt="Icona sostituito"/.test(row);
            const parsedGrade = Number.parseFloat(grade[1].replace(',', '.')) || 0;
            const notaFantacalcio = parsedGrade === 55 ? 3 : parsedGrade;
            players.push({ id: link[2], name: decodeHtml(link[3]), image: '', teamId: team[1], teamName: displayTeamName(team[1]), position: role?.[1] === 'p' ? 'gk' : role?.[1] === 'd' ? 'defender' : role?.[1] === 'c' ? 'midfielder' : 'attacker', isGoalkeeper: role?.[1] === 'p', status: substitutedIn ? 'Suplente ingresó' : substitutedOut ? 'Sustituido' : 'Titular', minutesPlayed: substitutedIn || substitutedOut ? 1 : 90, goals, bonoGoles: goals * 3, notaFantacalcio });
        }
        playersByTeam.set(team[1], players);
    }
    return matches.map(match => ({ ...match, home: { ...match.home, players: playersByTeam.get(match.home.slug) || [] }, away: { ...match.away, players: playersByTeam.get(match.away.slug) || [] } }));
}

async function fetchCalcioData(round) {
    const url = round ? `https://www.fantacalcio.it/voti-fantacalcio-serie-a/2026-27/${round}` : 'https://www.fantacalcio.it/voti-fantacalcio-serie-a';
    const response = await fetch(url, { headers });
    if (!response.ok) throw new Error(`Fantacalcio respondió ${response.status}`);
    const html = await response.text();
    const currentRound = Number(html.match(/<title>Voti Fantacalcio Serie A (\d+) giornata/i)?.[1]) || round || 1;
    let matches = parseCalcioMatches(html);
    if (round && (!matches.length || matches.some(match => String(match.round) !== String(round)))) {
        const fotmobData = await fetchPage(`https://www.fotmob.com/es/leagues/${COMPETITIONS.calcio.id}/fixtures/${COMPETITIONS.calcio.slug}?group=by-date`);
        matches = extractAllMatches(fotmobData).map(normalizeMatch)
            .filter(match => String(match.round) === String(round));
    }
    return { html, matches, currentRound };
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
    const { leagueId, matchId, jornada } = event.queryStringParameters || {};
    const competition = COMPETITIONS[leagueId];
    if (!competition) return json(400, { error: 'Liga no soportada' });

    try {
        if (leagueId === 'calcio') {
            const parsedRound = Number.parseInt(jornada, 10);
            const calcioData = await fetchCalcioData(Number.isInteger(parsedRound) && parsedRound > 0 ? parsedRound : undefined);
            const matches = parseCalcioTables(calcioData.html, calcioData.matches);
            if (!matchId) return json(200, { competition: 'Serie A', currentRound: calcioData.currentRound, matches });
            const match = matches.find(item => item.id === String(matchId));
            if (!match) return json(404, { error: 'Partido no encontrado' });
            const scoreParts = String(match.status?.scoreStr || '').split('-');
            const homeScore = Number(scoreParts[0]);
            const awayScore = Number(scoreParts[1]);
            if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore)) {
                return json(200, { competition: 'Serie A', currentRound: calcioData.currentRound, match, players: [], error: 'Los puntajes aún no están disponibles para esta jornada.' });
            }
            const players = [...(match.home.players || []), ...(match.away.players || [])].map(player => {
                const opponentScore = player.teamId === match.home.slug ? awayScore : homeScore;
                const bonoValla = player.isGoalkeeper && opponentScore === 0 ? 2 : 0;
                return { ...player, bonoValla, totalFantasys: Number((player.notaFantacalcio + player.bonoGoles + bonoValla).toFixed(2)) };
            });
            return json(200, { competition: 'Serie A', currentRound: calcioData.currentRound, match, players });
        }
        if (!matchId) {
            const data = await fetchPage(`https://www.fotmob.com/es/leagues/${competition.id}/fixtures/${competition.slug}?group=by-date`);
            const matches = extractAllMatches(data).map(normalizeMatch);
            return json(200, { competition: competition.name, currentRound: getCurrentRound(matches), matches });
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