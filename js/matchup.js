// ==========================================
// 🧠 CEREBRO DEL MATCHUP (SIMULADOR DE CANCHA)
// ==========================================

const currentLeagueId = localStorage.getItem('selectedLeague') || 'premier';
let dbJugadores = [];

// Estado de alineaciones (11 posiciones por equipo)
let localLineup = Array(11).fill(null);
let awayLineup = Array(11).fill(null);

let activeSlotIndex = null;
let activeTeam = null;

// 1. Inicialización
async function initMatchup() {
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
    
    const simBtn = document.getElementById('btn-simulate');
    if (simBtn) {
        simBtn.addEventListener('click', simulateMatchup);
    }
}

// 2. Renderizado de Canchas
window.changeFormation = function(teamType) {
    renderLineups();
};

function renderLineups() {
    renderTeam('local', localLineup, 'local-lineup');
    renderTeam('away', awayLineup, 'away-lineup');
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
    
    // [Portero, Defensas, Mediocampistas, Delanteros]
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
            slot.onclick = () => openSearchModal(teamType, currentIndex);

            if (player) {
                const iniciales = player.name ? player.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'JG';
                const fallbackUrl = `https://ui-avatars.com/api/?name=${iniciales}&background=eaeaea&color=333`;
                
                slot.innerHTML = `
                    <div style="position: relative; width: 32px; height: 32px;">
                        <img src="${player.imagen || fallbackUrl}" onerror="this.src='${fallbackUrl}'" alt="Foto" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover; border: 2px solid #e2e8f0;">
                        <img src="https://images.fotmob.com/image_resources/logo/teamlogo/${player.teamId}.png" onerror="this.style.display='none'" style="width: 14px; height: 14px; position: absolute; bottom: -2px; right: -5px; background: white; border-radius: 50%;">
                    </div>
                    <div class="slot-details">
                        <span class="slot-name">${player.name}</span>
                        <span class="slot-points" id="points-${teamType}-${currentIndex}">- pts</span>
                    </div>
                `;
            } else {
                slot.innerHTML = `
                    <div class="slot-icon">+</div>
                    <div class="slot-details">
                        <span class="slot-name">Fichar</span>
                    </div>
                `;
            }
            globalSlotIndex++;
            lineDiv.appendChild(slot);
        }
        container.appendChild(lineDiv);
    });
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
    
    const input = document.getElementById('matchup-search-input');
    const results = document.getElementById('matchup-search-results');
    if (input) input.value = '';
    if (results) results.innerHTML = '';
    
    window.openMatchupSearch();
    if (input) setTimeout(() => input.focus(), 100);
}

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
            <div class="api-result-item" onclick="selectPlayerForMatchup('${p.id}')" style="cursor: pointer;">
                <div class="api-result-info">
                    <img src="${p.imagen}" onerror="this.style.display='none'">
                    <div>
                        <strong>${p.name}</strong>
                        <small>${p.team} - ${p.position.toUpperCase()}</small>
                    </div>
                </div>
            </div>
        `).join('');
    });
}

window.selectPlayerForMatchup = function(playerId) {
    const player = dbJugadores.find(p => String(p.id) === String(playerId));
    if (!player) return;

    if (activeTeam === 'local') {
        localLineup[activeSlotIndex] = player;
    } else {
        awayLineup[activeSlotIndex] = player;
    }

    renderLineups();
    window.closeMatchupSearch();
};

// 4. Reglas de Puntuación
function calcularGoles(puntos) {
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
    btn.innerHTML = '⏳ CALCULANDO...';
    btn.disabled = true;
    btn.style.opacity = '0.7';

    const localTotal = await procesarEquipo('local', localLineup);
    const localGoles = calcularGoles(localTotal);
    
    const awayTotal = await procesarEquipo('away', awayLineup);
    const awayGoles = calcularGoles(awayTotal);

    // Ajustado a 1 decimal
    document.getElementById('local-points').innerText = `${localTotal.toFixed(1)} pts`;
    document.getElementById('local-goals').innerText = localGoles;

    // Ajustado a 1 decimal
    document.getElementById('away-points').innerText = `${awayTotal.toFixed(1)} pts`;
    document.getElementById('away-goals').innerText = awayGoles;

    btn.innerHTML = 'SIMULAR ENFRENTAMIENTO';
    btn.disabled = false;
    btn.style.opacity = '1';
}

async function procesarEquipo(teamType, lineup) {
    let totalPuntos = 0;

    for (let i = 0; i < 11; i++) {
        const player = lineup[i];
        const pointUI = document.getElementById(`points-${teamType}-${i}`);
        
        if (!player) continue;
        if (pointUI) pointUI.innerText = 'Buscando...';
        
        try {
            const isGk = player.position === 'porterias';
            const response = await fetch(`/.netlify/functions/getPoints?playerId=${player.fotmobId}&slug=${player.slug}&isGoalkeeper=${isGk}`);
            
            if (response.ok) {
                const data = await response.json();
                const pts = data.totalFantasys || 0;
                totalPuntos += pts;
                // Ajustado a 1 decimal
                if (pointUI) pointUI.innerText = `${pts.toFixed(1)} pts`;
            } else {
                const fallbackPts = player.fotmob || 0;
                totalPuntos += fallbackPts;
                // Ajustado a 1 decimal
                if (pointUI) pointUI.innerText = `${fallbackPts.toFixed(1)} pts`;
            }
        } catch (error) {
            const fallbackPts = player.fotmob || 0;
            totalPuntos += fallbackPts;
            // Ajustado a 1 decimal
            if (pointUI) pointUI.innerText = `${fallbackPts.toFixed(1)} pts`;
        }
    }

    return totalPuntos;
}

document.addEventListener('DOMContentLoaded', initMatchup);