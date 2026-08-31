const leagueId = localStorage.getItem('selectedLeague') || 'premier';
let matches = [];
let selectedRound = Number(localStorage.getItem(`selectedRound_${leagueId}`)) || 0;

const $ = selector => document.querySelector(selector);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
}

function formatDate(utcTime) {
    if (!utcTime) return 'Fecha pendiente';
    const dateValue = /^\d{4}-\d{2}-\d{2}$/.test(String(utcTime)) ? `${utcTime}T12:00:00` : utcTime;
    return new Date(dateValue).toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short'
    });
}

function renderRoundOptions() {
    const select = $('#round-select');
    const rounds = Array.from({ length: 38 }, (_, index) => String(index + 1));
    if (!rounds.length) return;
    const round = selectedRound && rounds.includes(String(selectedRound)) ? String(selectedRound) : rounds[rounds.length - 1];
    selectedRound = Number(round);
    select.innerHTML = rounds.map(value => `<option value="${escapeHtml(value)}">Jornada ${escapeHtml(value)}</option>`).join('');
    select.value = round;
    select.onchange = () => {
        selectedRound = Number(select.value);
        localStorage.setItem(`selectedRound_${leagueId}`, String(selectedRound));
        showMatchesList();
        loadMatches(selectedRound);
    };
}

function renderMatches(round) {
    const list = $('#matches-list');
    const selected = matches.filter(match => match.round === round);
    list.innerHTML = selected.map(match => {
        const status = match.status || {};
        const isFinished = status.finished === true;
        return `<button class="match-card" type="button" data-match-id="${escapeHtml(match.id)}">
            <span class="match-date">${escapeHtml(formatDate(status.utcTime))}</span>
            <span class="match-teams">
                <span><img src="${escapeHtml(match.home.logo || `https://images.fotmob.com/image_resources/logo/teamlogo/${match.home.id}.png`)}" alt="">${escapeHtml(match.home.name)}</span>
                <strong>${escapeHtml(status.scoreStr || (isFinished ? 'Finalizado' : 'Por jugar'))}</strong>
                <span><img src="${escapeHtml(match.away.logo || `https://images.fotmob.com/image_resources/logo/teamlogo/${match.away.id}.png`)}" alt="">${escapeHtml(match.away.name)}</span>
            </span>
            <span class="match-card-action">Ver puntajes →</span>
        </button>`;
    }).join('');
    list.querySelectorAll('.match-card').forEach(card => {
        card.addEventListener('click', () => loadMatchDetail(card.dataset.matchId));
    });
}

function playerRows(players) {
    if (!players.length) return '<p class="empty-detail">Fantacalcio no devolvió puntajes para este partido.</p>';
    const statusOrder = {
        'Titular': 1,
        'Sustituido': 2,
        'Suplente ingresó': 3,
        'Suplente no ingresó': 4,
        'No convocado': 5
    };
    const orderedPlayers = [...players].sort((a, b) => {
        const aHasBonus = (a.bonoGoles || 0) + (a.bonoAsistencia || 0) + (a.bonoValla || 0) !== 0;
        const bHasBonus = (b.bonoGoles || 0) + (b.bonoAsistencia || 0) + (b.bonoValla || 0) !== 0;
        const bonusDifference = Number(bHasBonus) - Number(aHasBonus);
        const orderDifference = (statusOrder[a.status] ?? 6) - (statusOrder[b.status] ?? 6);
        return bonusDifference || orderDifference || b.totalFantasys - a.totalFantasys;
    });
    return `<div class="players-score-table">
        <div class="score-row score-header"><span>Jugador</span><span>Nota</span><span>Bonos</span><span>Total</span></div>
        ${orderedPlayers.map(player => {
            const bonuses = (player.bonoGoles || 0) + (player.bonoAsistencia || 0) + (player.bonoValla || 0);
            return `<div class="score-row">
            <span class="player-score-name"><img src="${escapeHtml(player.image)}" alt="" onerror="this.style.display='none'"><span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.status)}${player.shirtNumber ? ` · #${escapeHtml(player.shirtNumber)}` : ''}</small></span></span>
                <span>${(player.notaFantacalcio ?? player.notaFotmob).toFixed(1)}</span>
                <span>${bonuses ? `+${bonuses}` : '-'}</span>
                <strong>${player.totalFantasys.toFixed(1)}</strong>
            </div>`;
        }).join('')}
    </div>`;
}

async function loadMatchDetail(matchId) {
    const match = matches.find(item => item.id === String(matchId));
    if (!match) return;
    $('#matches-list').hidden = true;
    $('#round-select').closest('.round-filter').hidden = true;
    $('#matches-status').textContent = 'Cargando actuaciones...';
    $('#match-detail').hidden = false;
    $('#match-detail-content').innerHTML = '';

    try {
        const response = await fetch(`/.netlify/functions/getmatches?leagueId=${encodeURIComponent(leagueId)}&matchId=${encodeURIComponent(matchId)}&jornada=${encodeURIComponent(selectedRound)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el detalle');
        if (data.error && !(data.players || []).length) {
            $('#matches-status').textContent = '';
            $('#match-detail-content').innerHTML = `<p class="empty-detail">${escapeHtml(data.error)}</p>`;
            return;
        }
        const grouped = data.players.reduce((result, player) => {
            const team = player.teamName || (String(player.teamId) === String(match.home.id) ? match.home.name : match.away.name);
            (result[team] ||= []).push(player);
            return result;
        }, {});
        $('#matches-status').textContent = '';
        $('#match-detail-content').innerHTML = `
            <div class="detail-score">
                <span>${escapeHtml(match.home.name)}</span><strong>${escapeHtml(match.status.scoreStr || '-')}</strong><span>${escapeHtml(match.away.name)}</span>
            </div>
            <p class="detail-date">${escapeHtml(formatDate(match.status.utcTime))}</p>
            ${Object.entries(grouped).map(([team, players]) => {
                const teamId = players[0]?.teamId || (team === match.home.name ? match.home.id : match.away.id);
                const teamData = team === match.home.name ? match.home : match.away;
                const teamLogo = leagueId === 'calcio'
                    ? escapeHtml(teamData.logo || '')
                    : `https://images.fotmob.com/image_resources/logo/teamlogo/${escapeHtml(teamId)}.png`;
                return `<section class="team-scores"><h2><img src="${teamLogo}" alt="">${escapeHtml(team)}</h2>${playerRows(players)}</section>`;
            }).join('')}`;
    } catch (error) {
        $('#matches-status').textContent = error.message;
    }
}

function showMatchesList() {
    $('#match-detail').hidden = true;
    $('#matches-list').hidden = false;
    $('#round-select').closest('.round-filter').hidden = false;
    $('#matches-status').textContent = `${matches.length} partidos disponibles`;
}

async function initMatches() {
    $('#back-to-matches').addEventListener('click', showMatchesList);
    try {
        await loadMatches(selectedRound);
    } catch (error) {
        $('#matches-status').textContent = error.message;
    }
}

async function loadMatches(round) {
    try {
        const roundQuery = round ? `&jornada=${encodeURIComponent(round)}` : '';
        const response = await fetch(`/.netlify/functions/getmatches?leagueId=${encodeURIComponent(leagueId)}${roundQuery}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el calendario');
        matches = data.matches || [];
        if (!matches.length) throw new Error('No hay partidos disponibles');
        if (!selectedRound && data.currentRound) {
            selectedRound = Number(data.currentRound);
            localStorage.setItem(`selectedRound_${leagueId}`, String(selectedRound));
        }
        renderRoundOptions();
        renderMatches(String(selectedRound));
        $('#matches-status').textContent = `${matches.length} partidos disponibles`;
    } catch (error) {
        $('#matches-status').textContent = error.message;
    }
}

document.addEventListener('DOMContentLoaded', initMatches);