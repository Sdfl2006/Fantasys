const leagueId = localStorage.getItem('selectedLeague') || 'premier';
let matches = [];

const $ = selector => document.querySelector(selector);

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>'"]/g, character => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[character]));
}

function formatDate(utcTime) {
    if (!utcTime) return 'Fecha pendiente';
    return new Date(utcTime).toLocaleDateString('es-ES', {
        weekday: 'short', day: 'numeric', month: 'short'
    });
}

function renderRoundOptions() {
    const select = $('#round-select');
    const rounds = [...new Map(matches.map(match => [match.round, match])).values()];
    select.innerHTML = rounds.map(match =>
        `<option value="${escapeHtml(match.round)}">Jornada ${escapeHtml(match.roundName)}</option>`
    ).join('');
    select.onchange = () => renderMatches(select.value);
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
                <span><img src="https://images.fotmob.com/image_resources/logo/teamlogo/${escapeHtml(match.home.id)}.png" alt="">${escapeHtml(match.home.name)}</span>
                <strong>${escapeHtml(status.scoreStr || (isFinished ? 'Finalizado' : 'Por jugar'))}</strong>
                <span><img src="https://images.fotmob.com/image_resources/logo/teamlogo/${escapeHtml(match.away.id)}.png" alt="">${escapeHtml(match.away.name)}</span>
            </span>
            <span class="match-card-action">Ver puntajes →</span>
        </button>`;
    }).join('');
    list.querySelectorAll('.match-card').forEach(card => {
        card.addEventListener('click', () => loadMatchDetail(card.dataset.matchId));
    });
}

function playerRows(players) {
    if (!players.length) return '<p class="empty-detail">FotMob no devolvió puntajes para este partido.</p>';
    const statusOrder = {
        'Titular': 0,
        'Suplente ingresó': 1,
        'Suplente no ingresó': 2,
        'No convocado': 3
    };
    const orderedPlayers = [...players].sort((a, b) => {
        const orderDifference = (statusOrder[a.status] ?? 4) - (statusOrder[b.status] ?? 4);
        return orderDifference || b.totalFantasys - a.totalFantasys;
    });
    return `<div class="players-score-table">
        <div class="score-row score-header"><span>Jugador</span><span>Nota</span><span>Bonos</span><span>Total</span></div>
        ${orderedPlayers.map(player => {
            const bonuses = (player.bonoGoles || 0) + (player.bonoValla || 0);
            return `<div class="score-row">
            <span class="player-score-name"><img src="${escapeHtml(player.image)}" alt="" onerror="this.style.display='none'"><span><strong>${escapeHtml(player.name)}</strong><small>${escapeHtml(player.status)}${player.shirtNumber ? ` · #${escapeHtml(player.shirtNumber)}` : ''}</small></span></span>
                <span>${player.notaFotmob.toFixed(1)}</span>
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
        const response = await fetch(`/.netlify/functions/getmatches?leagueId=${encodeURIComponent(leagueId)}&matchId=${encodeURIComponent(matchId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el detalle');
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
                return `<section class="team-scores"><h2><img src="https://images.fotmob.com/image_resources/logo/teamlogo/${escapeHtml(teamId)}.png" alt="">${escapeHtml(team)}</h2>${playerRows(players)}</section>`;
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
        const response = await fetch(`/.netlify/functions/getmatches?leagueId=${encodeURIComponent(leagueId)}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'No se pudo cargar el calendario');
        matches = data.matches || [];
        if (!matches.length) throw new Error('No hay partidos disponibles');
        renderRoundOptions();
        renderMatches($('#round-select').value);
        $('#matches-status').textContent = `${matches.length} partidos disponibles`;
    } catch (error) {
        $('#matches-status').textContent = error.message;
    }
}

document.addEventListener('DOMContentLoaded', initMatches);