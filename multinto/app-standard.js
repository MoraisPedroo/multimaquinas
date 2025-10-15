document.addEventListener('DOMContentLoaded', () => {
  // -------------------- CONFIG --------------------
  // Se true: sempre carrega o array hardcoded do código (ignora localStorage).
  // Troque para false se quiser permitir persistência entre reloads.
  const FORCE_HARDCODED = true;
  const LOCALSTORAGE_KEY = 'interactiveMapPrinters';
  // -------------------------------------------------

  const mapContainer = document.getElementById('map-container');
  const mapInner = document.getElementById('map-inner');
  const tooltip = document.getElementById('map-tooltip');
  const mapImage = document.getElementById('map-image');
  const searchContainer = document.getElementById('search-container');
  const searchHitbox = document.getElementById('search-hitbox');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const searchResultsPanel = document.getElementById('search-results');
  const detailsModal = document.getElementById('details-modal');
  const floorSelect = document.getElementById('floor-select');
  const toastEl = document.getElementById('toast-notification');
  const checkStatusBtn = document.getElementById('check-status-btn');
  const calibrateBtn = document.getElementById('calibrate-btn');
  const headTestBtn = document.getElementById('head-test-btn');
  const statusAllBtn = document.getElementById('status-all-btn');
  const allStatusModal = document.getElementById('all-status-modal');
  const allStatusList = document.getElementById('all-status-list');

  let printerData = [];
  let transientLabel = null;
  let focusResetTimer = null;
  let currentFloor = 1;
  let currentPrinterIp = '';

  
  // Comandos EPL
  const TESTE_CABECA = `I8,A,001

Q240,024
q831
rN
S4
D9
ZB
JF
OD
R215,0
f100
N

A300,220,2,4,1,1,R,"TESTE SELBETTI"

B375,139,2,1,4,12,93,B,"1234567890"
LO1,146,398,46
P5

`;

  const CALIBRAGEM = `~jc^xa^jus^xz`;

  function showToast(msg){ toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),3000); }

  // savePrinters respeita a flag
  function savePrinters(){
    if (FORCE_HARDCODED) {
      try { localStorage.removeItem(LOCALSTORAGE_KEY); } catch(e){ /* ignore */ }
      return;
    }
    try { localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(printerData)); } catch(e){ console.warn('Erro ao gravar localStorage', e); }
  }

  function loadPrinters(){
    if (FORCE_HARDCODED) {
      printerData = (Array.isArray(initialPrinters) ? initialPrinters.slice() : []).concat(Array.isArray(initialPrinters2floor) ? initialPrinters2floor.slice() : []);
      try { localStorage.removeItem(LOCALSTORAGE_KEY); } catch(e){ /* ignore */ }
      renderAllPrinters();
      return;
    }

    try {
      const s = localStorage.getItem(LOCALSTORAGE_KEY);
      if (s) {
        printerData = JSON.parse(s);
      } else {
        printerData = (Array.isArray(initialPrinters) ? initialPrinters.slice() : []).concat(Array.isArray(initialPrinters2floor) ? initialPrinters2floor.slice() : []);
      }
    } catch(e) {
      console.warn('Erro ao ler localStorage, usando hardcoded', e);
      printerData = (Array.isArray(initialPrinters) ? initialPrinters.slice() : []).concat(Array.isArray(initialPrinters2floor) ? initialPrinters2floor.slice() : []);
    }
    renderAllPrinters();
  }

  function debounce(fn, delay) {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(()=> fn(...args), delay); };
  }

  function createPrinterPointElement(printer){
    const point = document.createElement('button');
    point.className = `printer-point bg-blue-500`;
    point.style.top = printer.pos.top;
    point.style.left = printer.pos.left;
    point.style.setProperty('--point-color', '#3b82f6');
    point.dataset.printerSelb = printer.selb;
    point.setAttribute('aria-label', `Impressora ${printer.name}, SELB ${printer.selb}, Andar ${printer.floor}`);
    point.innerHTML = `<svg class="printer-point-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>`;

    point.addEventListener('click', (e) => {
      e.stopPropagation();
      const selb = e.currentTarget.dataset.printerSelb;
      const current = printerData.find(p => p.selb === selb);
      if (!current) return;
      if (current.floor !== currentFloor) {
        currentFloor = current.floor;
        floorSelect.value = currentFloor;
        updateMapImage();
        renderAllPrinters();
      }
      focusPrinter(current);
      showDetailsModal(current);
    });

    point.addEventListener('mouseenter', (e) => {
      const selb = e.currentTarget.dataset.printerSelb;
      const current = printerData.find(p => p.selb === selb) || printer;
      tooltip.innerHTML = `<strong>${current.name}</strong><br>SELB: ${current.selb} (Andar ${current.floor})`;
      const pointRect = e.currentTarget.getBoundingClientRect();
      const containerRect = mapContainer.getBoundingClientRect();
      tooltip.style.top = `${pointRect.top - containerRect.top}px`;
      tooltip.style.left = `${pointRect.left - containerRect.left}px`;
      tooltip.classList.add('show');
    });
    point.addEventListener('mouseleave', () => tooltip.classList.remove('show'));

    return point;
  }

  function renderAllPrinters(){ mapInner.querySelectorAll('.printer-point').forEach(n=>n.remove()); const fragment = document.createDocumentFragment(); printerData.filter(p => p.floor === currentFloor).forEach(p => { const node = createPrinterPointElement(p); fragment.appendChild(node); }); mapInner.appendChild(fragment); }

  function updateMapImage() {
    if (currentFloor === 1) { mapImage.src = 'plantanto.jpg'; } else if (currentFloor === 2) { mapImage.src = 'plantanto2.jpg'; }
    mapImage.onerror = function() { this.onerror = null; this.src = 'https://placehold.co/3840x2715/ffffff/cccccc?text=Planta+Indispon%C3%ADvel'; };
  }

  function showDetailsModal(printer){
    if (transientLabel) { transientLabel.remove(); transientLabel = null; }

    document.getElementById('modal-title').textContent = printer.name;
    document.getElementById('modal-department').textContent = printer.department;
    document.getElementById('modal-selb').textContent = printer.selb;
    document.getElementById('modal-ip').textContent = printer.ip;
    document.getElementById('modal-observations').textContent = printer.observations || 'Nenhuma observação.';
    currentPrinterIp = printer.ip;

    document.getElementById('modal-link').href = `http://${printer.ip}`;
    document.getElementById('modal-link').setAttribute('rel','noopener noreferrer');
    // Reset status display
    document.getElementById('status-display').classList.add('hidden');
    document.getElementById('status-sq').style.background = '#ccc';
    document.getElementById('status-text').innerText = '--';
    document.getElementById('status-message').innerText = '';
    detailsModal.classList.remove('hidden');
    detailsModal.setAttribute('aria-hidden','false');
  }

  async function getPrinterStatus(ip) {
    if (!ip) return { status: 'Erro', message: 'IP inválido', color: 'red' };

    const TOTAL_TIMEOUT = 2000; // ms
    const controller = new AbortController();
    const signal = controller.signal;
    const timeoutId = setTimeout(() => controller.abort(), TOTAL_TIMEOUT);

    try {
      let res = await fetch(`proxy.php?ip=${encodeURIComponent(ip)}&as_json=1`, { cache: 'no-store', signal });

      if (!res.ok) {
        res = await fetch(`proxy.php?ip=${encodeURIComponent(ip)}`, { cache: 'no-store', signal });
        if (!res.ok) throw new Error('Erro HTTP ' + res.status);
      }

      clearTimeout(timeoutId);

      const ct = (res.headers.get('content-type') || '').toLowerCase();

      let raw;
      if (ct.includes('application/json')) {
        const payload = await res.json();
        raw = payload.body_base64 ? base64ToUtf8(payload.body_base64) : (payload.raw_html || payload.raw_response || JSON.stringify(payload));
      } else {
        raw = await res.text();
      }

      return applyZebraHeuristics(raw);

    } catch (err) {
      clearTimeout(timeoutId);

      const isAbort = err && (err.name === 'AbortError' || /aborted/i.test(err.message) || /The user aborted a request/i.test(err.message));
      const errMsg = (err && err.message) ? err.message : String(err);

      if (isAbort || errMsg.includes('Erro HTTP 502') || errMsg.includes('502')) {
        return { status: 'Erro de conexão', message: 'Verifique se o cabo de rede(internet) está bem conectado', color: 'red' };
      } else {
        return { status: 'Erro', message: `Falta de rede-Verifique se o cabo de rede(internet) está bem conectado`, color: 'red' };
      }
    }
  }

  // Heurística especializada 
  function applyZebraHeuristics(raw) {
    const lower = (raw || '').toLowerCase();

    // extrai H3s (mantendo posições — alguns H3 podem ser vazios)
    const h3s = [];
    raw.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, (m, g1) => {
      const cleaned = g1.replace(/<[^>]+>/g, '').trim();
      h3s.push(cleaned); // pode ser ''
      return m;
    });

    // procura índice do H3 de status
    let statusH3Index = h3s.findIndex(h => /status[:\s]/i.test(h) || /em pausa|em aguard|aguardo|status/i.test(h));
    if (statusH3Index === -1) {
      statusH3Index = h3s.findIndex(h => /em pausa|pausa|aguardo|em aguard/i.test(h));
    }

    const statusH3 = statusH3Index >= 0 ? h3s[statusH3Index] : '';
    let condH3 = (statusH3Index >= 0 && (statusH3Index + 1) < h3s.length) ? h3s[statusH3Index + 1] : '';
    if (!condH3) {
      const found = h3s.find(h => /condi|erro|falta|cab|papel|paper/i.test(h));
      condH3 = found || '';
    }

    const s = (statusH3 || '').toLowerCase();
    const e = (condH3 || '').toLowerCase();

    // 1) EM AGUARDO / READY (pronto)
    if (s.includes('aguardo') || s.includes('em aguardo') || s.includes('ready') || s.includes('waiting') || (lower.includes('status:') && /aguardo|ready|waiting/.test(lower))) {
      return { status: 'Pronto para impressão', message: 'Tudo ok para imprimir', color: 'green' };
    }

    // 2) EM PAUSA / PAUSE com H3 seguinte vazio -> instrução feed
    if ((s.includes('em pausa') || s.includes('pausa') || s.includes('pause') || s.includes('paused') || lower.includes('em pausa') || lower.includes('pause')) && (!condH3 || condH3.trim() === '')) {
      return { status: 'Em Pausa', message: 'Para despausar pressione o botão feed', color: 'red' };
    }

    // 3) EM PAUSA / PAUSE com CAB. ABERTO / HEAD OPEN
    const cabAbertoDetected = ((/cab|cab\./i.test(e) && /abert/i.test(e)) || (/cabec/i.test(e) && /abert/i.test(e)) || (/cab/i.test(e) && /abert/i.test(e)) || /head open/i.test(e) || /open head/i.test(e));
    if ((s.includes('em pausa') || s.includes('pausa') || s.includes('pause') || s.includes('paused') || lower.includes('em pausa') || lower.includes('pause')) && cabAbertoDetected) {
      return { status: 'Em Erro', message: 'Impressora aberta — feche a impressora', color: 'red' };
    }

    // 4) EM PAUSA / PAUSE com FALTA PAPEL / PAPER OUT
    const faltaPapelDetected = /falta\s*papel|falta de papel|papel/i.test(e) || /falta.*papel/i.test(lower) || /paper/i.test(e) || /paper out/i.test(lower) || /out of paper/i.test(lower);
    if ((s.includes('em pausa') || s.includes('pausa') || s.includes('pause') || s.includes('paused') || lower.includes('em pausa') || lower.includes('pause')) && faltaPapelDetected) {
      return { status: 'Em Erro', message: 'Impressora com erro de etiqueta/ribon — verifique os insumos', color: 'red' };
    }

    // fallback genérico
    const okKeywords = ['aguardo','pronto','ready','ok','waiting'];
    const pauseKeywords = ['pausa','pause','paused','error','erro','aberto','open','falta papel','paper'];

    const anyOk = okKeywords.some(k => lower.includes(k));
    const anyPause = pauseKeywords.some(k => lower.includes(k));

    if (anyOk && !anyPause) {
      return { status: 'Pronto para impressão', message: 'Tudo ok para imprimir', color: 'green' };
    } else if (anyPause) {
      return { status: 'Em Erro', message: (condH3 ? condH3 : 'Condição de erro detectada-Verifique se o cabo de rede(internet) está bem conectado.'), color: 'red' };
    } else {
      return { status: 'Desconhecido', message: (condH3 ? condH3 : 'Status não identificado'), color: 'red' };
    }
  }

  // Decodifica base64 -> texto UTF-8 de forma segura.
  // Usa atob + TextDecoder quando disponível; fallback para string raw.
  function base64ToUtf8(b64) {
    if (!b64) return '';
    try {
      // atob lança se não for base64 válido
      const binary = atob(b64);
      // converte para Uint8Array (cada char -> byte)
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);

      // se TextDecoder disponível, usa para obter UTF-8 corretamente
      if (typeof TextDecoder !== 'undefined') {
        try {
          return new TextDecoder('utf-8').decode(bytes);
        } catch (e) {
          // cai para fallback abaixo
        }
      }

      // fallback simples: interpreta como Latin1 -> retorna string
      let out = '';
      for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
      return out;
    } catch (e) {
      // se qualquer coisa falhar, devolve o input original (ou string vazia)
      return b64;
    }
  }



  async function sendCommand(cmd, actionName) {
    if (!currentPrinterIp) { showToast('IP inválido!'); return; }
    if (!cmd || cmd.trim() === '') { showToast('Comando vazio!'); return; }

    try {
      const payload = { ip: currentPrinterIp, cmd: cmd };
      const res = await fetch('proxy.php', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const json = await res.json();
      if (res.ok && json.success) {
        showToast(`${actionName} enviado com sucesso!`);
      } else {
        showToast(`Erro: ${json.error || 'Falha no envio'}`);
      }
    } catch (err) {
      showToast(`Erro de conexão: ${err.message}`);
    }
  }

  async function checkStatus() {
    const { status, message, color } = await getPrinterStatus(currentPrinterIp);
    const display = document.getElementById('status-display');
    const sq = document.getElementById('status-sq');
    const statusText = document.getElementById('status-text');
    const statusMessage = document.getElementById('status-message');

    display.classList.remove('hidden');
    sq.style.background = color;
    statusText.style.color = color;
    statusText.innerText = status;
    statusMessage.innerText = message;
  }

  checkStatusBtn.addEventListener('click', checkStatus);
  calibrateBtn.addEventListener('click', () => sendCommand(CALIBRAGEM, 'Calibragem'));
  headTestBtn.addEventListener('click', () => sendCommand(TESTE_CABECA, 'Teste de cabeça'));
  
  searchHitbox.addEventListener('click', (e) => {
    e.stopPropagation();
    if (searchInput.value.trim()) { searchInput.value = ''; handleSearch(); }
    searchContainer.classList.toggle('expanded');
    searchContainer.setAttribute('aria-expanded', String(searchContainer.classList.contains('expanded')));
    if (searchContainer.classList.contains('expanded')) { searchInput.focus(); } else { searchResultsPanel.style.display = 'none'; }
  });

  document.addEventListener('click', (e)=>{ 
      if (!searchContainer.contains(e.target)) { 
          searchContainer.classList.remove('expanded'); 
          searchResultsPanel.style.display='none';
          searchContainer.setAttribute('aria-expanded','false');
      } 
  });

  searchForm.addEventListener('submit', (e) => { e.preventDefault(); handleSearch(); });
  const debouncedHandleSearch = debounce(handleSearch, 160);
  searchInput.addEventListener('input', debouncedHandleSearch);

  function focusResultByIndex(index) {
    const items = Array.from(searchResultsPanel.querySelectorAll('.result-item'));
    if (!items.length) return;
    index = Math.max(0, Math.min(items.length - 1, index));
    items[index].focus();
  }

  function handleSearch() {
    const term = searchInput.value.toLowerCase().trim();
    document.querySelectorAll('.printer-point').forEach(p=>p.classList.remove('highlighted'));
    if (!term) { searchResultsPanel.style.display = 'none'; searchResultsPanel.setAttribute('aria-hidden','true'); return; }
    const results = printerData.filter(p => (p.name.toLowerCase().includes(term) || (p.selb || '').toLowerCase().includes(term)));
    searchResultsPanel.innerHTML = '';
    searchResultsPanel.setAttribute('aria-hidden','false');
    if (!results.length) {
        searchResultsPanel.innerHTML = '<div class="p-3 text-center text-gray-500">Nenhum resultado.</div>';
    } else {
        results.forEach((r, idx) => {
            const d = document.createElement('div');
            d.className = 'result-item p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50';
            d.innerHTML = `<div class="font-semibold">${r.name}</div><div class="text-sm text-gray-500">SELB: ${r.selb} (Andar ${r.floor})</div>`;
            d.tabIndex = 0;
            d.setAttribute('role','option');
            d.addEventListener('click', (ev) => {
                ev.stopPropagation();
                searchResultsPanel.style.display = 'none';
                searchContainer.classList.remove('expanded');
                searchInput.value = r.name;
                if (r.floor !== currentFloor) {
                  currentFloor = r.floor; floorSelect.value = currentFloor; updateMapImage(); renderAllPrinters();
                }
                focusPrinter(r, true);
            });
            d.addEventListener('keydown', (ev) => {
              if (ev.key === 'Enter') d.click();
              if (ev.key === 'ArrowDown') { ev.preventDefault(); focusResultByIndex(idx+1); }
              if (ev.key === 'ArrowUp') { ev.preventDefault(); focusResultByIndex(idx-1); }
            });
            searchResultsPanel.appendChild(d);
        });
    }
    searchResultsPanel.style.display = 'block';
  }

  function focusPrinter(printer, openModal = false) {
    if (focusResetTimer) clearTimeout(focusResetTimer);
    if (transientLabel) transientLabel.remove();
    document.querySelectorAll('.printer-point').forEach(p => p.classList.remove('highlighted'));
    const point = document.querySelector(`.printer-point[data-printer-selb="${printer.selb}"]`);
    if (!point) return;

    point.classList.add('highlighted');

    const pRect = point.getBoundingClientRect();
    const mapRect = mapContainer.getBoundingClientRect();

    const pCenterX = (pRect.left - mapRect.left) + pRect.width / 2;
    const pCenterY = (pRect.top - mapRect.top) + pRect.height / 2;

    const scale = 1.4;
    let dx = mapRect.width / 2 - pCenterX * scale;
    let dy = mapRect.height / 2 - pCenterY * scale;

    const scaledWidth = mapRect.width * scale;
    const scaledHeight = mapRect.height * scale;
    const maxDx = 0; const minDx = mapRect.width - scaledWidth;
    const maxDy = 0; const minDy = mapRect.height - scaledHeight;
    dx = Math.min(maxDx, Math.max(minDx, dx));
    dy = Math.min(maxDy, Math.max(minDy, dy));

    mapInner.style.transform = `scale(${scale}) translate(${dx}px, ${dy}px)`;

    const containerRectAfter = mapContainer.getBoundingClientRect();
    const scrollLeft = window.scrollX + containerRectAfter.left - (window.innerWidth - containerRectAfter.width) / 2;
    const scrollTop = window.scrollY + containerRectAfter.top - (window.innerHeight - containerRectAfter.height) / 2;
    window.scrollTo({ left: scrollLeft, top: scrollTop, behavior: 'smooth' });

    transientLabel = document.createElement('div');
    transientLabel.className = 'focus-label';
    transientLabel.innerHTML = `${printer.name} <span class="font-normal text-xs text-gray-500 ml-2">(${printer.selb})</span>`;
    transientLabel.style.left = `50%`;
    transientLabel.style.top = `50%`;
    transientLabel.style.transform = `translate(-50%, calc(-100% - 20px))`;
    mapContainer.appendChild(transientLabel);

    focusResetTimer = setTimeout(() => {
        mapInner.style.transform = '';
        point.classList.remove('highlighted');
        if (transientLabel) { transientLabel.remove(); transientLabel = null; }
    }, 3500);

    if (openModal) {
      setTimeout(() => {
          const current = printerData.find(p => p.selb === printer.selb);
          if (current) { showDetailsModal(current); }
      }, 500);
    }
  }

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
        allStatusModal.classList.add('hidden'); allStatusModal.setAttribute('aria-hidden','true');
      }
    });
  });

  document.querySelectorAll('.close-modal-btn').forEach(b => b.addEventListener('click', () => {
    detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
    allStatusModal.classList.add('hidden'); allStatusModal.setAttribute('aria-hidden','true');
  }));

  floorSelect.addEventListener('change', (e) => {
    currentFloor = parseInt(e.target.value, 10);
    updateMapImage(); renderAllPrinters();
  });
    
  document.addEventListener('keydown', (e) => {
      if (e.key === "Escape") {
          detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
          allStatusModal.classList.add('hidden'); allStatusModal.setAttribute('aria-hidden','true');
          searchResultsPanel.style.display = 'none';
          if (searchContainer.classList.contains('expanded')) {
              searchContainer.classList.remove('expanded'); searchInput.value = '';
          }
      }
  });

  async function checkAllStatuses() {
    showToast('Verificando status de todas as impressoras...');
    allStatusList.innerHTML = '<div class="text-center text-gray-500">Carregando...</div>';
    allStatusModal.classList.remove('hidden');
    allStatusModal.setAttribute('aria-hidden', 'false');

    const promises = printerData.map(async (p) => {
      const res = await getPrinterStatus(p.ip);
      return { ...p, statusRes: res };
    });

    const results = await Promise.all(promises);

    allStatusList.innerHTML = '';
    results.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'p-2 border-b border-gray-200';
      div.innerHTML = `
        <div><strong>Nome:</strong> ${r.name}</div>
        <div><strong>IP:</strong> ${r.ip}</div>
        <div><strong>Local:</strong> ${r.department}</div>
        <div><strong>Status:</strong> <span style="color: ${r.statusRes.color}">${r.statusRes.status}</span></div>
      `;
      allStatusList.appendChild(div);
    });
  }

  statusAllBtn.addEventListener('click', checkAllStatuses);

  // load & render
  loadPrinters();
  updateMapImage();
});