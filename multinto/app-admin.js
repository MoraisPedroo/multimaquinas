
document.addEventListener('DOMContentLoaded', () => {
  // -------------------- CONFIG --------------------
  // Se true: sempre carrega o array hardcoded do código (ignora localStorage).
  // Troque para false se quiser permitir persistência entre reloads.
  const FORCE_HARDCODED = false;
  const LOCALSTORAGE_KEY = 'interactiveMapPrinters';
  // -------------------------------------------------

const API_BASE = 'http://localhost:3001/api'; // ajuste host/porta se necessário
const DEFAULT_UNIT = 'Hemes Pardini-NTO';

async function apiFetchPrinters(unit = DEFAULT_UNIT, floor = null) {
  const qs = new URLSearchParams();
  if (unit) qs.set('unit', unit);
  if (floor !== null && floor !== undefined) qs.set('floor', floor);
  const res = await fetch(`${API_BASE}/printers?${qs.toString()}`);
  if (!res.ok) throw new Error('Erro ao buscar impressoras');
  return res.json();
}
async function apiCreateOrUpsertPrinter(printer, unit = DEFAULT_UNIT) {
  const res = await fetch(`${API_BASE}/printers`, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ unit, printer })
  });
  if (!res.ok) throw new Error('Erro ao salvar impressora');
  return res.json();
}
async function apiUpdatePrinterBySelb(selb, printer) {
  const res = await fetch(`${API_BASE}/printers/${encodeURIComponent(selb)}`, {
    method: 'PUT',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ printer })
  });
  if (!res.ok) throw new Error('Erro ao atualizar');
  return res.json();
}
async function apiPatchPrinterPos(selb, pos) {
  const res = await fetch(`${API_BASE}/printers/${encodeURIComponent(selb)}/pos`, {
    method: 'PATCH',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ pos })
  });
  if (!res.ok) throw new Error('Erro ao atualizar posição');
  return res.json();
}
async function apiDeletePrinter(selb) {
  const res = await fetch(`${API_BASE}/printers/${encodeURIComponent(selb)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Erro ao deletar impressora');
  return res.json();
}


  const mapContainer = document.getElementById('map-container');
  const mapInner = document.getElementById('map-inner');
  const tooltip = document.getElementById('map-tooltip');
  const mapImage = document.getElementById('map-image');
  const addPrinterBtn = document.getElementById('add-printer-btn');
  const addHitbox = document.getElementById('add-hitbox');
  const searchContainer = document.getElementById('search-container');
  const searchHitbox = document.getElementById('search-hitbox');
  const searchForm = document.getElementById('search-form');
  const searchInput = document.getElementById('search-input');
  const searchResultsPanel = document.getElementById('search-results');
  const detailsModal = document.getElementById('details-modal');
  const addModal = document.getElementById('add-modal');
  const addPrinterForm = document.getElementById('add-printer-form');
  const deletePrinterBtn = document.getElementById('delete-printer-btn');
  const editPrinterBtn = document.getElementById('edit-printer-btn');
  const repositionPrinterBtn = document.getElementById('reposition-printer-btn');
  const addModalTitle = document.getElementById('add-modal-title');
  const addSubmitBtn = document.getElementById('add-submit-btn');
  const floorSelect = document.getElementById('floor-select');
  const toastEl = document.getElementById('toast-notification');

  let printerData = [];
  let isAddMode = false;
  let newPrinterCoords = { top: '50%', left: '50%' };
  let printerToDeleteSelb = null;
  let transientLabel = null;
  let focusResetTimer = null;
  let repositionTargetSelb = null; // quando setado, clique no mapa reposiciona essa impressora
  let currentFloor = 1;

  function showToast(msg){ toastEl.textContent = msg; toastEl.classList.add('show'); setTimeout(()=>toastEl.classList.remove('show'),3000); }



 async function loadPrinters() {
  try {
    // já que você quer apenas Neon, não usamos dados locais aqui
    // (FORCE_HARDCODED deve estar false)
    const data = await apiFetchPrinters(DEFAULT_UNIT, null);

    // se veio algo vazio, mostramos mensagem e continuamos com lista vazia
    if (!Array.isArray(data) || data.length === 0) {
      console.warn('API retornou lista vazia.');
      showToast('Nenhuma impressora encontrada no servidor.');
      printerData = [];
      renderAllPrinters();
      return;
    }

    // Normaliza registros vindos do servidor
    printerData = data.map(r => {
      // pos pode chegar como objeto ou string JSON; trata os dois casos
      let pos = { top: '50%', left: '50%' };
      try {
        if (r.pos) {
          if (typeof r.pos === 'string') pos = JSON.parse(r.pos);
          else if (typeof r.pos === 'object') pos = r.pos;
        }
      } catch (e) {
        console.warn('Erro ao parsear pos para', r, e);
      }

      return {
        name: r.name,
        department: r.department,
        selb: r.selb,
        ip: r.ip,
        observations: r.observations,
        floor: Number.isFinite(Number(r.floor)) ? Number(r.floor) : (r.floor ? Number(r.floor) : 1),
        pos,
        model: r.model || 'Zebra'
      };
    });

    // sincroniza select do andar
    const selectedFloor = parseInt(floorSelect.value, 10) || currentFloor || 1;
    currentFloor = selectedFloor;
    floorSelect.value = String(currentFloor);

    renderAllPrinters();
    showToast('Impressoras carregadas do servidor.');
  } catch (err) {
    console.error('loadPrinters error:', err);
    // Não tentamos usar as variáveis locais (já removidas) — apenas informamos e limpamos a lista
    showToast('Erro ao conectar com o servidor. Verifique se a API está rodando.');
    printerData = [];
    renderAllPrinters();
  }
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
    point.setAttribute('aria-label', `Impressora ${printer.name}, SELB ${printer.selb}, Andar ${printer.floor}, Modelo ${printer.model}`);
    
    // Selecionar ícone com base no modelo
    const isZebra = printer.model === 'Zebra';
    const isEpson = printer.model === 'Epson';
    let iconSvg;

    if (isZebra) {
      iconSvg = `<img src="zebraicone.png" alt="Zebra" class="printer-point-icon" style="width:14px; height:14px; filter: brightness(0) invert(1);" onerror="this.onerror=null; this.src='data:image/svg+xml;base64,PHN2ZyBjbGFzcz0icHJpbnRlci1wb2ludC1pY29uIiBmaWxsPSJub25lIiBzdHJva2U9ImN1cnJlbnRDb2xvciIgdmlld0JveD0iMCAwIDI0IDI0IiBhcmlhLWhpZGRlbj0idHJ1ZSI+PHBhdGggc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBzdHJva2UtbGluZWpvaW49InJvdW5kIiBzdHJva2Utd2lkdGg9IjIiIGQ9Ik0xNyAxN2gyYTIgMiAwIDAwMi0ydi00YTIgMiAwIDAwLTItMkg1YTIgMiAwIDAwLTIgMnY0YTIgMiAwIDAwMiAyaDJtMiA0aDZhMiAyIDAgMDAyLTJ2LTRhMiAyIDAgMDAtMi0ySDlhMiAyIDAgMDAtMiAydjRhMiAyIDAgMDAyIDJ6bTgtMTJWNWEyIDIgMCAwMC0yLTJIOWEyIDIgMCAwMC0yIDJ2NGgxMHoiLz48L3N2Zz4=';"/>`;
    } else if (isEpson) {
      iconSvg = `<svg class="printer-point-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/></svg>`;
    } else {
      iconSvg = `<svg class="printer-point-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"/></svg>`;
    }

    point.innerHTML = iconSvg;

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
      tooltip.innerHTML = `<strong>${current.name}</strong><br>SELB: ${current.selb} (Andar ${current.floor})<br>Modelo: ${current.model}`;
      const pointRect = e.currentTarget.getBoundingClientRect();
      const containerRect = mapContainer.getBoundingClientRect();
      tooltip.style.top = `${pointRect.top - containerRect.top}px`;
      tooltip.style.left = `${pointRect.left - containerRect.left}px`;
      tooltip.classList.add('show');
    });
    point.addEventListener('mouseleave', () => tooltip.classList.remove('show'));

    return point;
  }

  function renderAllPrinters(){
    mapInner.querySelectorAll('.printer-point').forEach(n=>n.remove());
    const fragment = document.createDocumentFragment();
    printerData.filter(p => p.floor === currentFloor).forEach(p => {
      const node = createPrinterPointElement(p);
      fragment.appendChild(node);
    });
    mapInner.appendChild(fragment);
  }

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
    document.getElementById('modal-model').textContent = printer.model;
    document.getElementById('modal-observations').textContent = printer.observations || 'Nenhuma observação.';
    printerToDeleteSelb = printer.selb;

    document.getElementById('modal-link').href = `http://${printer.ip}`;
    document.getElementById('modal-link').setAttribute('rel','noopener noreferrer');
    detailsModal.classList.remove('hidden');
    detailsModal.setAttribute('aria-hidden','false');
  }
  
  function toggleAddMode(){ 
    isAddMode = !isAddMode;
    addPrinterBtn.classList.toggle('bg-[#81B29A]', !isAddMode);
    addPrinterBtn.classList.toggle('bg-yellow-500', isAddMode);
    addPrinterBtn.setAttribute('aria-pressed', String(isAddMode));
    mapContainer.classList.toggle('add-mode', isAddMode);
    mapContainer.classList.toggle('border-yellow-500', isAddMode);
    mapContainer.classList.toggle('border-transparent', !isAddMode);
    if (isAddMode) { showToast('Clique no mapa para posicionar a nova impressora.'); }
  }

  mapContainer.addEventListener('click', async(event) => {
    if (event.target.closest('.printer-point')) return;
    const rect = mapContainer.getBoundingClientRect();
    const coords = { 
        top: `${((event.clientY - rect.top) / rect.height) * 100}%`, 
        left: `${((event.clientX - rect.left) / rect.width) * 100}%` 
    };

    if (isAddMode && repositionTargetSelb) {
  const p = printerData.find(p => p.selb === repositionTargetSelb);
  if (p) {
    try {
      await apiPatchPrinterPos(repositionTargetSelb, coords);
      p.pos = coords;
      renderAllPrinters();
      showToast('Posição da impressora atualizada.');
    } catch (err) {
      console.error('Erro ao atualizar pos', err);
      showToast('Erro ao atualizar posição no servidor.');
    }
  }
  repositionTargetSelb = null;
  toggleAddMode();
  return;
}


    if (!isAddMode) return;
    newPrinterCoords = coords;
    addPrinterForm.reset();
    delete addModal.dataset.editingSelb;
    addModalTitle.textContent = 'Adicionar Nova Impressora';
    addSubmitBtn.textContent = 'Salvar Impressora';
    addModal.classList.remove('hidden');
    addModal.setAttribute('aria-hidden','false');
    toggleAddMode();
  });

addPrinterForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const formData = new FormData(addPrinterForm);
  const name = (formData.get('name') || '').trim();
  const department = (formData.get('department') || '').trim();
  const selb = (formData.get('selb') || '').trim();
  const ip = (formData.get('ip') || '').trim();
  const model = (formData.get('model') || '').trim();
  const observations = (formData.get('observations') || '').trim();

  if (!name || !department || !selb || !ip || !model) {
    showToast('Preencha todos os campos obrigatórios.');
    return;
  }

  const editingSelb = addModal.dataset.editingSelb;
  const floor = editingSelb ? (printerData.find(p => p.selb === editingSelb)?.floor ?? currentFloor) : currentFloor;

  const newPrinter = { name, department, selb, ip, observations, floor, pos: newPrinterCoords || { top:'50%', left:'50%' }, model };

  try {
    if (editingSelb) {
      // atualizar no Neon
      await apiUpdatePrinterBySelb(editingSelb, newPrinter);
      // atualizar local state
      const idx = printerData.findIndex(p => p.selb === editingSelb);
      if (idx !== -1) printerData[idx] = newPrinter;
      showToast('Impressora atualizada com sucesso.');
    } else {
      // criar/upsert no Neon
      await apiCreateOrUpsertPrinter(newPrinter);
      printerData.push(newPrinter);
      showToast('Impressora adicionada com sucesso.');
    }
    renderAllPrinters();
    addModal.classList.add('hidden');
    detailsModal.classList.add('hidden');
    delete addModal.dataset.editingSelb;
  } catch (err) {
    console.error('Erro salvar impressora', err);
    showToast('Erro ao salvar impressora no servidor.');
  }
});

  addHitbox.addEventListener('click', (e)=>{ e.stopPropagation(); toggleAddMode(); });
  
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
    const results = printerData.filter(p => (p.name.toLowerCase().includes(term) || (p.selb || '').toLowerCase().includes(term) || (p.model || '').toLowerCase().includes(term)));
    searchResultsPanel.innerHTML = '';
    searchResultsPanel.setAttribute('aria-hidden','false');
    if (!results.length) {
        searchResultsPanel.innerHTML = '<div class="p-3 text-center text-gray-500">Nenhum resultado.</div>';
    } else {
        results.forEach((r, idx) => {
            const d = document.createElement('div');
            d.className = 'result-item p-3 border-b border-gray-100 cursor-pointer hover:bg-gray-50';
            d.innerHTML = `<div class="font-semibold">${r.name}</div><div class="text-sm text-gray-500">SELB: ${r.selb} (Andar ${r.floor}) - Modelo: ${r.model}</div>`;
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

 deletePrinterBtn.addEventListener('click', async () => {
  const selb = printerToDeleteSelb;
  try {
    await apiDeletePrinter(selb);
    printerData = printerData.filter(p => p.selb !== selb);
    renderAllPrinters();
    detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
    showToast('Impressora removida com sucesso!');
  } catch (err) {
    console.error('Erro deletar', err);
    showToast('Erro ao remover impressora no servidor.');
  }
});


  editPrinterBtn.addEventListener('click', () => {
    const selb = printerToDeleteSelb;
    const p = printerData.find(x => x.selb === selb);
    if (!p) return showToast('Impressora não encontrada.');

    addPrinterForm.reset();
    addPrinterForm.querySelector('[name="name"]').value = p.name;
    addPrinterForm.querySelector('[name="department"]').value = p.department;
    addPrinterForm.querySelector('[name="selb"]').value = p.selb;
    addPrinterForm.querySelector('[name="ip"]').value = p.ip;
    addPrinterForm.querySelector('[name="model"]').value = p.model || 'Zebra';
    addPrinterForm.querySelector('[name="observations"]').value = p.observations || '';
    newPrinterCoords = p.pos || newPrinterCoords;

    addModal.dataset.editingSelb = p.selb;
    addModalTitle.textContent = 'Editar Impressora';
    addSubmitBtn.textContent = 'Salvar Alterações';
    detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
    addModal.classList.remove('hidden'); addModal.setAttribute('aria-hidden','false');
  });

  repositionPrinterBtn.addEventListener('click', () => {
    const selb = printerToDeleteSelb;
    const p = printerData.find(x => x.selb === selb);
    if (!p) return showToast('Impressora não encontrada.');
    repositionTargetSelb = selb;
    if (!isAddMode) toggleAddMode();
    detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
    showToast('Clique no mapa para reposicionar a impressora selecionada.');
  });

  document.querySelectorAll('.modal-backdrop').forEach(backdrop => {
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) {
        detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
        addModal.classList.add('hidden'); addModal.setAttribute('aria-hidden','true');
        delete addModal.dataset.editingSelb;
      }
    });
  });

  document.querySelectorAll('.close-modal-btn').forEach(b => b.addEventListener('click', () => {
    detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
    addModal.classList.add('hidden'); addModal.setAttribute('aria-hidden','true');
    delete addModal.dataset.editingSelb;
  }));

  floorSelect.addEventListener('change', (e) => {
    currentFloor = parseInt(e.target.value, 10);
    updateMapImage(); renderAllPrinters();
  });
    
  document.addEventListener('keydown', (e) => {
      if (e.key === "Escape") {
          detailsModal.classList.add('hidden'); detailsModal.setAttribute('aria-hidden','true');
          addModal.classList.add('hidden'); addModal.setAttribute('aria-hidden','true');
          searchResultsPanel.style.display = 'none';
          if (searchContainer.classList.contains('expanded')) {
              searchContainer.classList.remove('expanded'); searchInput.value = '';
          }
          delete addModal.dataset.editingSelb;
      }
  });

  // load & render
  loadPrinters();
  updateMapImage();
});