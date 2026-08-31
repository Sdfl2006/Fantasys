// ==========================================
// 🧠 CEREBRO DEL MATCHUP (SIMULADOR DE CANCHA)
// ==========================================

const currentLeagueId = localStorage.getItem('selectedLeague') || 'premier';
const storedRoundValue = localStorage.getItem(`selectedRound_${currentLeagueId}`);
const storedRound = storedRoundValue ? Number(storedRoundValue) : null;
let selectedRound = Number.isInteger(storedRound) && storedRound > 0 ? storedRound : 1;
let dbJugadores = [];

// Estado de alineaciones (11 posiciones por equipo)
let localLineup = Array(11).fill(null);
let awayLineup = Array(11).fill(null);
let localBench = [];
let awayBench = [];

let activeSlotIndex = null;
let activeTeam = null;
let activeArea = 'lineup';
let selectedBenchIndex = null;
let selectedBenchTeam = null;
const matchupStorageKey = `matchup_${currentLeagueId}`;

function saveMatchupState() {
    localStorage.setItem(matchupStorageKey, JSON.stringify({
        localLineup,
        awayLineup,
        localBench,
        awayBench,
        formationLocal: document.getElementById('formation-local')?.value || '442',
        formationAway: document.getElementById('formation-away')?.value || '442',
        localPoints: document.getElementById('local-points')?.textContent || '0.0 pts',
        awayPoints: document.getElementById('away-points')?.textContent || '0.0 pts',
        localGoals: document.getElementById('local-goals')?.textContent || '0',
        awayGoals: document.getElementById('away-goals')?.textContent || '0'
    }));
}

function loadMatchupState() {
    try {
        const saved = JSON.parse(localStorage.getItem(matchupStorageKey) || 'null');
        if (!saved) return;
        if (Array.isArray(saved.localLineup) && saved.localLineup.length === 11) localLineup = saved.localLineup;
        if (Array.isArray(saved.awayLineup) && saved.awayLineup.length === 11) awayLineup = saved.awayLineup;
        if (Array.isArray(saved.localBench)) localBench = saved.localBench.slice(0, 7);
        if (Array.isArray(saved.awayBench)) awayBench = saved.awayBench.slice(0, 7);
        if (saved.formationLocal) document.getElementById('formation-local').value = saved.formationLocal;
        if (saved.formationAway) document.getElementById('formation-away').value = saved.formationAway;
        if (saved.localPoints) document.getElementById('local-points').textContent = saved.localPoints;
        if (saved.awayPoints) document.getElementById('away-points').textContent = saved.awayPoints;
        if (saved.localGoals) document.getElementById('local-goals').textContent = saved.localGoals;
        if (saved.awayGoals) document.getElementById('away-goals').textContent = saved.awayGoals;
    } catch (error) {
        localStorage.removeItem(matchupStorageKey);
    }
}

// 1. Inicialización
async function initMatchup() {
    loadMatchupState();
    if (!Number.isInteger(storedRound)) {
        try {
            const roundResponse = await fetch(`./.netlify/functions/getmatches?leagueId=${encodeURIComponent(currentLeagueId)}`);
            const roundData = await roundResponse.json();
            if (roundData.currentRound) selectedRound = roundData.currentRound;
        } catch (error) {
            console.warn('No se pudo detectar la jornada actual de Calcio.');
        }
    }
    try {
        const res = await fetch(`./data/jugadores_${currentLeagueId}.json`);
        if (res.ok) {
            dbJugadores = await res.json();
            console.log(`✅ Base de datos cargada: ${dbJugadores.length} jugadores`);
        }
    } catch (error) {
        console.error("Error cargando DB de jugadores:", error);
    }
    
    renderLineups();
    setupSearchEvents();
    const roundSelect = document.getElementById('matchup-round-select');
    if (roundSelect) {
        roundSelect.innerHTML = Array.from({ length: 38 }, (_, index) => `<option value="${index + 1}">Jornada ${index + 1}</option>`).join('');
        roundSelect.value = String(selectedRound);
        roundSelect.addEventListener('change', () => {
            selectedRound = Number(roundSelect.value);
            localStorage.setItem(`selectedRound_${currentLeagueId}`, selectedRound);
        });
    }
    
    const simBtn = document.getElementById('btn-simulate');
    if (simBtn) {
        simBtn.addEventListener('click', simulateMatchup);
    }
}

// 2. Renderizado de Canchas
window.changeFormation = function(teamType) {
    renderLineups();
    saveMatchupState();
};

function renderLineups() {
    renderTeam('local', localLineup, 'local-lineup');
    renderTeam('away', awayLineup, 'away-lineup');
    renderBench('local', localBench, 'local-bench');
    renderBench('away', awayBench, 'away-bench');

    // Inicializamos Drag & Drop inmediatamente después de dibujar la cancha
    initSortables('local');
    initSortables('away');
}

function renderTeam(teamType, lineupArray, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    
    container.innerHTML = ''; 

    const selectEl = document.getElementById(`formation-${teamType}`);
    const formString = selectEl ? selectEl.value : '442';
    const defs = parseInt(formString[0]) || 4;
    const meds = parseInt(formString[1]) || 4;
    const dels = parseInt(formString[2]) || 2;
    
    const layout = [1, defs, meds, dels]; 
    let globalSlotIndex = 0;

    layout.forEach(count => {
        const lineDiv = document.createElement('div');
        lineDiv.className = 'pitch-line';
        
        for (let i = 0; i < count; i++) {
            const currentIndex = globalSlotIndex;
            const player = lineupArray[currentIndex];
            const slot = document.createElement('div');
            
            slot.className = `matchup-slot ${player ? 'filled' : ''}`;
            
            // DATA-ATTRIBUTES CRUCIALES PARA EL DRAG & DROP
            slot.dataset.index = currentIndex;
            slot.dataset.playerId = player ? player.id : ''; 
            slot.style.cursor = 'grab'; // Cambia el cursor para indicar que es arrastrable
            
            slot.onclick = () => {
                if (selectedBenchTeam === teamType && selectedBenchIndex !== null) {
                    replaceWithBench(teamType, currentIndex);
                } else {
                    openSearchModal(teamType, currentIndex);
                }
            };

            if (player) {
                const iniciales = player.name ? player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'JG';
                const fallbackUrl = `https://ui-avatars.com/api/?name=${iniciales}&background=eaeaea&color=333`;
                
                slot.innerHTML = `
                    <div class="player-visual">
                        <img src="${player.imagen || fallbackUrl}" onerror="this.src='${fallbackUrl}'" alt="Foto" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
                        <img src="https://images.fotmob.com/image_resources/logo/teamlogo/${player.teamId}.png" onerror="this.style.display='none'" style="width: 14px; height: 14px; position: absolute; bottom: -2px; right: -5px; background: white; border-radius: 50%;">
                    </div>
                    <div class="slot-details">
                        <span class="slot-name">${formatName(player.name)}</span>
                        <span class="slot-points" id="points-${teamType}-${currentIndex}">- pts</span>
                    </div>
                        <button class="lineup-remove-btn" title="Quitar titular" onclick="event.stopPropagation(); removeLineupPlayer('${teamType}', ${currentIndex})">×</button>
                `;
            } else {
                slot.innerHTML = `
                    <div class="slot-icon">+</div>
                    <div class="slot-details">
                        <span class="slot-name">Agregar</span>
                    </div>
                `;
            }
            globalSlotIndex++;
            lineDiv.appendChild(slot);
        }
        container.appendChild(lineDiv);
    });
}

function renderBench(teamType, bench, containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = Array.from({ length: 7 }, (_, index) => {
        const player = bench[index];
        if (!player) {
            // Etiquetado con data-player-id vacío para permitir soltar jugadores aquí
            return `<button class="matchup-slot bench-slot" data-index="bench-${index}" data-player-id="" onclick="openBenchSearch('${teamType}')" style="cursor: grab;">
                <span class="slot-icon">+</span>
                <span class="slot-name">Agregar</span>
            </button>`;
        }

        const iniciales = player.name ? player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'JG';
        const fallbackUrl = `https://ui-avatars.com/api/?name=${iniciales}&background=eaeaea&color=333`;
        return `<div class="matchup-slot filled bench-slot ${selectedBenchTeam === teamType && selectedBenchIndex === index ? 'selected' : ''}" data-index="bench-${index}" data-player-id="${player.id}" style="cursor: grab;" onclick="selectBenchPlayer('${teamType}', ${index})">
            <div class="player-visual">
                <img src="${player.imagen || fallbackUrl}" onerror="this.src='${fallbackUrl}'" alt="Foto" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
                <img src="https://images.fotmob.com/image_resources/logo/teamlogo/${player.teamId}.png" onerror="this.style.display='none'" style="width: 14px; height: 14px; position: absolute; bottom: -2px; right: -5px; background: white; border-radius: 50%;">
            </div>
            <div class="slot-details">
                <span class="slot-name">${formatName(player.name)}</span>
                <span class="slot-points" id="bench-points-${teamType}-${index}">- pts</span>
            </div>
            <button class="bench-remove-btn" title="Quitar suplente" onclick="event.stopPropagation(); removeBenchPlayer('${teamType}', ${index})">×</button>
        </div>`;
    }).join('');
}

// ----------------------------------------------------
// NUEVAS FUNCIONES: MAGIA DEL DRAG & DROP (SWAP)
// ----------------------------------------------------
function initSortables(teamType) {
    const options = {
        group: `team-${teamType}`, // Conecta la cancha y la banca del mismo equipo
        swap: true,                // CRUCIAL: Intercambia los elementos 1 a 1 en lugar de empujarlos (Mantiene la formación)
        swapClass: "highlight",
        animation: 150,
        delay: 150,                // Retraso de milisegundos. Permite hacer scroll en móvil sin arrastrar sin querer
        delayOnTouchOnly: true,
        onEnd: function () {
            // Al soltar el jugador, el navegador lee el nuevo orden de las cartas y reconstruye el equipo en milisegundos
            rebuildTeamArrays(teamType);
            renderLineups();
            saveMatchupState();
        }
    };

    // Activamos arrastre en las líneas titulares
    document.querySelectorAll(`#${teamType}-lineup .pitch-line`).forEach(line => {
        new Sortable(line, options);
    });

    // Activamos arrastre en la banca
    const benchList = document.getElementById(`${teamType}-bench`);
    if (benchList) new Sortable(benchList, options);
}

function rebuildTeamArrays(teamType) {
    const pitchSlots = document.querySelectorAll(`#${teamType}-lineup .matchup-slot`);
    const benchSlots = document.querySelectorAll(`#${teamType}-bench .matchup-slot`);

    // Reconstruye el once titular basado en el nuevo orden visual
    const newLineup = Array.from(pitchSlots).map(slot => {
        const pid = slot.dataset.playerId;
        return pid ? dbJugadores.find(p => String(p.id) === pid) || null : null;
    });

    // Reconstruye la banca basándose en el nuevo orden visual
    const newBenchRaw = Array.from(benchSlots).map(slot => {
        const pid = slot.dataset.playerId;
        return pid ? dbJugadores.find(p => String(p.id) === pid) || null : null;
    });
    
    // Eliminamos los slots vacíos de la banca para mantener los jugadores alineados a la izquierda
    const newBench = newBenchRaw.filter(p => p !== null);

    if (teamType === 'local') {
        localLineup = newLineup;
        localBench = newBench;
    } else {
        awayLineup = newLineup;
        awayBench = newBench;
    }
}

function formatName(fullName) {
    if (!fullName) return 'Fichaje';
    return fullName.trim();
}

// 3. Modal de Búsqueda
window.openMatchupSearch = function() {
    const modal = document.getElementById('matchup-search-modal');
    if (modal) modal.style.display = 'block';
};

window.closeMatchupSearch = function() {
    const modal = document.getElementById('matchup-search-modal');
    if (modal) modal.style.display = 'none';
};

function openSearchModal(teamType, slotIndex) {
    activeTeam = teamType;
    activeSlotIndex = slotIndex;
    activeArea = 'lineup';
    
    const input = document.getElementById('matchup-search-input');
    const results = document.getElementById('matchup-search-results');
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    
    window.openMatchupSearch();
    if (input) setTimeout(() => input.focus(), 100);
}

window.openBenchSearch = function(teamType) {
    activeTeam = teamType;
    activeArea = 'bench';
    activeSlotIndex = null;
    const input = document.getElementById('matchup-search-input');
    const results = document.getElementById('matchup-search-results');
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    window.openMatchupSearch();
    if (input) setTimeout(() => input.focus(), 100);
};

function setupSearchEvents() {
    const input = document.getElementById('matchup-search-input');
    if (!input) return;

    input.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        const resultsContainer = document.getElementById('matchup-search-results');
        if (!resultsContainer) return;
        
        if (query.length < 2) {
            resultsContainer.innerHTML = '';
            return;
        }

        const matches = dbJugadores.filter(p => 
            p.name.toLowerCase().includes(query) || 
            (p.team && p.team.toLowerCase().includes(query))
        ).slice(0, 15);

        resultsContainer.innerHTML = matches.map(p => `
            <div class="api-result-item">
                <div class="api-result-info">
                    <img src="${p.imagen}" onerror="this.style.display='none'">
                    <div>
                        <strong>${p.name}</strong>
                        <small>${p.team} - ${p.position.charAt(0).toUpperCase()+ p.position.slice(1)}</small>
                    </div>
                </div>
                <button class="add-player-btn matchup-add-btn" onclick="selectPlayerForMatchup('${p.id}')">Agregar</button>
            </div>
        `).join('');
    });
}

window.selectPlayerForMatchup = function(playerId) {
    const player = dbJugadores.find(p => String(p.id) === String(playerId));
    if (!player) return;

    const lineup = activeTeam === 'local' ? localLineup : awayLineup;
    const bench = activeTeam === 'local' ? localBench : awayBench;

    if (activeArea === 'bench') {
        if (!bench.some(existing => String(existing.id) === String(player.id)) && bench.length < 7) {
            bench.push(player);
        }
    } else {
        const nextIndex = activeSlotIndex ?? lineup.findIndex(slot => !slot);
        if (nextIndex >= 0) lineup[nextIndex] = player;
    }

    renderLineups();
    saveMatchupState();
    if (activeArea === 'lineup') {
        activeSlotIndex = lineup.findIndex(slot => !slot);
    }
    const input = document.getElementById('matchup-search-input');
    const results = document.getElementById('matchup-search-results');
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    if (input) input.focus();
};

window.removeBenchPlayer = function(teamType, index) {
    const bench = teamType === 'local' ? localBench : awayBench;
    bench.splice(index, 1);
    selectedBenchIndex = null;
    selectedBenchTeam = null;
    renderLineups();
    saveMatchupState();
};

window.selectBenchPlayer = function(teamType, index) {
    selectedBenchTeam = teamType;
    selectedBenchIndex = index;
    renderLineups();
};

function replaceWithBench(teamType, lineupIndex) {
    const lineup = teamType === 'local' ? localLineup : awayLineup;
    const bench = teamType === 'local' ? localBench : awayBench;
    const substitute = bench[selectedBenchIndex];
    if (!substitute) return;

    const replacedPlayer = lineup[lineupIndex];
    lineup[lineupIndex] = substitute;
    if (replacedPlayer) bench[selectedBenchIndex] = replacedPlayer;
    else bench.splice(selectedBenchIndex, 1);
    selectedBenchIndex = null;
    selectedBenchTeam = null;
    renderLineups();
    saveMatchupState();
}

// 4. Reglas de Puntuación
function calcularGoles(puntos) {
    if (currentLeagueId === 'calcio') {
        if (puntos < 63.6) return 0;
        return Math.min(14, Math.floor((puntos - 63.6) / 3) + 1);
    }
    if (puntos < 75.9) return 0;
    if (puntos <= 79.0) return 1;
    if (puntos <= 82.2) return 2;
    if (puntos <= 85.4) return 3;
    if (puntos <= 88.7) return 4;
    if (puntos <= 92.0) return 5;
    if (puntos <= 95.4) return 6;
    if (puntos <= 98.9) return 7;
    if (puntos <= 102.5) return 8;
    if (puntos <= 106.2) return 9;
    if (puntos <= 110.0) return 10;
    if (puntos <= 113.9) return 11;
    if (puntos <= 117.9) return 12;
    if (puntos <= 122.0) return 13;
    return 14;
}

async function simulateMatchup() {
    const btn = document.getElementById('btn-simulate');
    btn.innerHTML = 'CALCULANDO...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    const localTotal = await procesarEquipo('local', localLineup, localBench);
    const localGoles = calcularGoles(localTotal);
    
    const awayTotal = await procesarEquipo('away', awayLineup, awayBench);
    const awayGoles = calcularGoles(awayTotal);

    // Ajustado a 1 decimal
    document.getElementById('local-points').innerText = `${localTotal.toFixed(1)} pts`;
    document.getElementById('local-goals').innerText = localGoles;

    // Ajustado a 1 decimal
    document.getElementById('away-points').innerText = `${awayTotal.toFixed(1)} pts`;
    document.getElementById('away-goals').innerText = awayGoles;
    saveMatchupState();

    btn.innerHTML = 'SIMULAR ENFRENTAMIENTO';
    btn.disabled = false;
    btn.style.opacity = '1';
}

async function obtenerPuntosJugador(player, isGk) {
    let extractedId = player.fotmobId;
    if (!extractedId) extractedId = String(player.id).replace('fotmob_', '').replace('manual_', '');

    const params = new URLSearchParams({
        playerId: extractedId,
        playerName: player.name || '',
        slug: player.slug || '-',
        isGoalkeeper: String(isGk),
        teamId: String(player.teamId || ''),
        teamName: player.team || '',
        jornada: String(selectedRound),
        leagueId: currentLeagueId
    });

    const response = await fetch(`/.netlify/functions/getpoints?${params}`);
    if (!response.ok) return { error: 'API caída', totalFantasys: 0 };
    return response.json();
}

function mostrarPuntos(pointUI, data) {
    const pts = data.totalFantasys || 0;
    if (!pointUI) return;
    if (pts === 0) {
        const status = getStatusLabel(data.error);
            pointUI.innerHTML = data.error === 'Aún no ha jugado'
                ? `<span class="points-status">${status}</span>`
                : `<span class="points-zero">0.0 pts</span><span class="points-status">${status}</span>${renderMatchDetails(data)}`;
            const card = pointUI.closest('.matchup-slot');
            if (card) {
                card.classList.add('has-status');
                card.dataset.tooltip = data.error || 'Sin datos';
            }
        pointUI.style.color = '#e74c3c';
        return;
    }

    const totalBonos = (data.bonoGoles || 0) + (data.bonoValla || 0);
    const card = pointUI.closest('.matchup-slot');
    if (card) {
        card.classList.remove('has-status');
        delete card.dataset.tooltip;
    }
    pointUI.innerHTML = totalBonos > 0
        ? `<span style="color: #059669;">${data.notaFotmob.toFixed(1)}</span> <span class="points-bonus">+${totalBonos}</span>${renderMatchDetails(data)}`
        : `<span>${pts.toFixed(1)} pts</span>${renderMatchDetails(data)}`;
    pointUI.style.color = '#059669';
}

function renderMatchDetails(data) {
    if (currentLeagueId === 'calcio') return '';
    if (!data.rival && !data.competicion) return '';
    const rival = data.rival || 'Rival ND';
    const competition = data.competicion || 'Comp. ND';
    const date = data.fecha ? new Date(data.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' }) : '';
    
    return `<span class="match-context">${competition} • vs ${rival} • ${date}</span>`;
}

function getStatusLabel(error) {
    if (error === 'Aún no ha jugado') return 'AÚN NO HA JUGADO';
    if (error === 'No convocado') return 'NO CONVOCADO';
    if (error === 'No ingresó') return 'NO INGRESÓ';
    if (error === 'API caída') return 'API';
    return 'SIN DATOS';
}

async function procesarEquipo(teamType, lineup, bench) {
    let totalPuntos = 0;
    
    for (let i = 0; i < 11; i++) {
        const player = lineup[i];
        const pointUI = document.getElementById(`points-${teamType}-${i}`);
        
        if (!player) continue;
        
        // Reiniciamos la UI antes de consultar
        if (pointUI) {
            pointUI.innerText = 'Buscando...';
            pointUI.style.color = '#059669'; // Verde por defecto
        }
        
        try {
            const isGk = player.position === 'porterias';
            const data = await obtenerPuntosJugador(player, isGk);
                totalPuntos += data.totalFantasys || 0;
                mostrarPuntos(pointUI, data);
        } catch (error) {
            if (pointUI) {
                pointUI.innerText = 'Error de red';
                pointUI.style.color = '#e74c3c';
            }
        }
    }

    for (let index = 0; index < bench.length; index++) {
        const substitute = bench[index];
        const benchUI = document.getElementById(`bench-points-${teamType}-${index}`);
        try {
            const data = await obtenerPuntosJugador(substitute, substitute.position === 'porterias');
            if (benchUI) {
                const hasPoints = data.totalFantasys > 0;
                benchUI.innerHTML = data.error === 'Aún no ha jugado'
                    ? `<span class="points-status">${getStatusLabel(data.error)}</span>`
                    : hasPoints
                    ? `<span>${data.totalFantasys.toFixed(1)} pts</span>${renderMatchDetails(data)}`
                    : `<span class="points-status">${getStatusLabel(data.error)}</span>${renderMatchDetails(data)}`;
                const benchCard = benchUI.closest('.matchup-slot');
                if (benchCard && !hasPoints) {
                    benchCard.classList.add('has-status');
                    benchCard.dataset.tooltip = data.error || 'Sin datos';
                } else if (benchCard) {
                    benchCard.classList.remove('has-status');
                    delete benchCard.dataset.tooltip;
                }
                benchUI.className = `slot-points ${data.totalFantasys > 0 ? 'bench-points-valid' : 'bench-points-error'}`;
            }
        } catch (error) {
            if (benchUI) {
                benchUI.innerHTML = '<span class="points-status">API</span>';
                const benchCard = benchUI.closest('.matchup-slot');
                if (benchCard) {
                    benchCard.classList.add('has-status');
                    benchCard.dataset.tooltip = 'No se pudo consultar la API';
                }
                benchUI.className = 'slot-points bench-points-error';
            }
        }
    }
    
    return totalPuntos;
}

window.removeLineupPlayer = function(teamType, index) {
    const lineup = teamType === 'local' ? localLineup : awayLineup;
    lineup[index] = null;
    if (selectedBenchTeam === teamType) {
        selectedBenchIndex = null;
        selectedBenchTeam = null;
    }
    renderLineups();
    saveMatchupState();
};
document.addEventListener('DOMContentLoaded', initMatchup);