/* ==========================================================================
   MÓDULO DE ROTEIRIZAÇÃO, GEOLOCALIZAÇÃO & MAPAS LEAFLET
   CARGOSOFT | VOCTT DATA ANALYTICS DIESEL
   ========================================================================== */

let leafletMapInstancia = null;
let leafletRoutingControl = null;
let miniMapaBrasilInstancia = null;
let geojsonBrasilCamada = null;
let marcadoresPostosGrupo = null;
let rotaGeometriaCache = [];
let campoFocoAtivo = null;

/**
 * Valida e garante que Latitude e Longitude estejam na ordem correta para o Brasil
 */
function corrigirCoordenadasBrasil(valor1, valor2) {
  let v1 = parseFloat(valor1);
  let v2 = parseFloat(valor2);

  if (isNaN(v1) || isNaN(v2)) return null;

  // No Brasil: Latitude fica entre +5.5 e -34.0; Longitude fica entre -34.0 e -74.0
  // Se o valor 1 estiver na faixa de longitude e o valor 2 na de latitude, inverte
  if (v1 < -34 && v2 > -35 && v2 < 6) {
    return { lat: v2, lng: v1 };
  }
  return { lat: v1, lng: v2 };
}

/**
 * Normaliza e carrega a base de cidades
 */
function obterBaseCidadesNormalizada() {
  const base = (typeof baseCidadesBrasil !== 'undefined' && Array.isArray(baseCidadesBrasil)) ? baseCidadesBrasil : [];
  const lista = [];

  base.forEach(item => {
    const nome = item.nome || item.cidade || item.municipio || '';
    const uf = item.uf || item.estado || '';
    
    let rawLat = item.lat !== undefined ? item.lat : (item.latitude !== undefined ? item.latitude : (item.coordenadas ? item.coordenadas[0] : null));
    let rawLng = item.lng !== undefined ? item.lng : (item.longitude !== undefined ? item.longitude : (item.coordenadas ? item.coordenadas[1] : null));

    const coords = corrigirCoordenadasBrasil(rawLat, rawLng);
    if (nome && coords) {
      lista.push({
        nome: nome.trim(),
        uf: uf.trim().toUpperCase(),
        lat: coords.lat,
        lng: coords.lng
      });
    }
  });

  return lista;
}

/**
 * Inicializa o mapa principal do Roteirizador Leaflet
 */
function inicializarMapaLeaflet() {
  const container = document.getElementById('mapLeaflet');
  if (!container) return;

  if (leafletMapInstancia) {
    setTimeout(() => {
      leafletMapInstancia.invalidateSize();
    }, 200);
    return;
  }

  leafletMapInstancia = L.map('mapLeaflet', {
    center: [-15.7801, -47.9292],
    zoom: 4,
    zoomControl: true
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
  }).addTo(leafletMapInstancia);

  marcadoresPostosGrupo = L.layerGroup().addTo(leafletMapInstancia);

  leafletMapInstancia.on('click', function(e) {
    if (campoFocoAtivo) {
      preencherPontoPorCoordenada(e.latlng.lat, e.latlng.lng, campoFocoAtivo);
    }
  });

  configurarInputsAutocomplete();

  setTimeout(() => {
    leafletMapInstancia.invalidateSize();
  }, 250);
}

/**
 * Configuração dos campos de busca de cidade
 */
function configurarInputsAutocomplete() {
  const container = document.getElementById('containerPontosRota');
  if (!container) return;

  container.querySelectorAll('.input-cidade-rota').forEach(input => {
    input.removeEventListener('focus', tratarFocoInput);
    input.addEventListener('focus', tratarFocoInput);

    input.removeEventListener('input', tratarDigitacaoCidade);
    input.addEventListener('input', tratarDigitacaoCidade);
  });
}

function tratarFocoInput(e) {
  document.querySelectorAll('.input-cidade-rota').forEach(i => i.classList.remove('foco-ativo'));
  e.target.classList.add('foco-ativo');
  campoFocoAtivo = e.target.closest('.ponto-rota-item');
}

function removerFocoInputs() {
  document.querySelectorAll('.input-cidade-rota').forEach(i => {
    i.classList.remove('foco-ativo');
    i.blur();
  });
  document.querySelectorAll('.autocomplete-list').forEach(l => {
    l.style.display = 'none';
  });
  campoFocoAtivo = null;
}

function tratarDigitacaoCidade(e) {
  const val = normalizarTexto(e.target.value);
  const itemPai = e.target.closest('.ponto-rota-item');
  if (!itemPai) return;

  const listaSugestoes = itemPai.querySelector('.autocomplete-list');
  if (!listaSugestoes) return;

  if (val.length < 2) {
    listaSugestoes.style.display = 'none';
    return;
  }

  const baseCidades = obterBaseCidadesNormalizada();
  const cidadesEncontradas = baseCidades.filter(c => 
    normalizarTexto(c.nome).includes(val) || normalizarTexto(c.uf).includes(val)
  ).slice(0, 8);

  if (cidadesEncontradas.length === 0) {
    listaSugestoes.innerHTML = `<div class="p-2 small text-muted">Nenhuma cidade localizada</div>`;
    listaSugestoes.style.display = 'block';
    return;
  }

  listaSugestoes.innerHTML = cidadesEncontradas.map(c => `
    <div class="p-2 border-bottom small cursor-pointer hover-bg-light" 
         onclick="selecionarCidadeAutoComplete('${c.nome.replace(/'/g, "\\'")}', '${c.uf}', ${c.lat}, ${c.lng}, this)">
      <i class="bi bi-geo-alt me-1 text-success"></i><strong>${c.nome}</strong>${c.uf ? ' - ' + c.uf : ''}
    </div>
  `).join('');

  listaSugestoes.style.display = 'block';
}

function selecionarCidadeAutoComplete(nome, uf, lat, lng, elem) {
  const itemPai = elem.closest('.ponto-rota-item');
  if (!itemPai) return;

  const inputTexto = itemPai.querySelector('.input-cidade-rota');
  const inputCoord = itemPai.querySelector('.hidden-coord-rota');
  const listaSugestoes = itemPai.querySelector('.autocomplete-list');

  const textoFinal = uf ? `${nome}, ${uf}` : nome;
  inputTexto.value = textoFinal;
  inputCoord.value = JSON.stringify({ nome, uf, lat: Number(lat), lng: Number(lng) });

  if (listaSugestoes) listaSugestoes.style.display = 'none';
  inputTexto.classList.remove('foco-ativo');
}

function adicionarCampoParada() {
  const container = document.getElementById('containerPontosRota');
  if (!container) return;

  const totalPontos = container.querySelectorAll('.ponto-rota-item').length;
  const div = document.createElement('div');
  div.className = "mb-2 position-relative ponto-rota-item";
  div.dataset.index = totalPontos;
  div.innerHTML = `
    <label class="small fw-bold text-dark mb-1 d-flex justify-content-between">
      <span>Parada Intermediária:</span>
      <span class="text-danger cursor-pointer" onclick="removerCampoParada(this)" style="font-size: 0.65rem;">
        <i class="bi bi-trash"></i> Remover
      </span>
    </label>
    <input type="text" class="form-control form-control-sm input-cidade-rota" placeholder="Digite ou clique no mapa..." autocomplete="off">
    <input type="hidden" class="hidden-coord-rota">
    <div class="autocomplete-list shadow-sm" style="display: none;"></div>
  `;

  const destino = container.children[container.children.length - 1];
  container.insertBefore(div, destino);
  configurarInputsAutocomplete();
}

function removerCampoParada(elem) {
  const item = elem.closest('.ponto-rota-item');
  if (item) item.remove();
}

function preencherPontoPorCoordenada(lat, lng, itemPai) {
  if (!itemPai) return;

  const baseCidades = obterBaseCidadesNormalizada();
  let cidadeMaisProxima = null;
  let menorDist = Infinity;

  baseCidades.forEach(c => {
    const d = calcularDistanciaHaversine(lat, lng, c.lat, c.lng);
    if (d < menorDist) {
      menorDist = d;
      cidadeMaisProxima = c;
    }
  });

  if (cidadeMaisProxima && menorDist < 80) {
    const inputTexto = itemPai.querySelector('.input-cidade-rota');
    const inputCoord = itemPai.querySelector('.hidden-coord-rota');

    const textoFinal = cidadeMaisProxima.uf ? `${cidadeMaisProxima.nome}, ${cidadeMaisProxima.uf}` : cidadeMaisProxima.nome;
    inputTexto.value = textoFinal;
    inputCoord.value = JSON.stringify({
      nome: cidadeMaisProxima.nome,
      uf: cidadeMaisProxima.uf,
      lat: Number(cidadeMaisProxima.lat),
      lng: Number(cidadeMaisProxima.lng)
    });
    removerFocoInputs();
  }
}

function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * Traça a rota pelo OSRM Leaflet Routing Machine
 */
function calcularRotaLeaflet() {
  removerFocoInputs();

  const container = document.getElementById('containerPontosRota');
  if (!container) return;

  const itens = container.querySelectorAll('.ponto-rota-item');
  const waypoints = [];
  const baseCidades = obterBaseCidadesNormalizada();

  itens.forEach(item => {
    const valCoord = item.querySelector('.hidden-coord-rota').value;
    let txt = item.querySelector('.input-cidade-rota').value.trim();
    txt = txt.replace(/,\s*undefined/gi, '').trim();
    item.querySelector('.input-cidade-rota').value = txt;

    let pontoLat = null;
    let pontoLng = null;

    if (valCoord) {
      try {
        const parsed = JSON.parse(valCoord);
        const coords = corrigirCoordenadasBrasil(parsed.lat, parsed.lng);
        if (coords) {
          pontoLat = coords.lat;
          pontoLng = coords.lng;
        }
      } catch(e) {}
    }

    if (pontoLat === null && txt) {
      const partes = txt.split(',').map(s => normalizarTexto(s.trim()));
      const nomeBusca = partes[0] || '';
      const ufBusca = partes[1] || '';

      const encontrada = baseCidades.find(c => {
        const nomeIgual = normalizarTexto(c.nome) === nomeBusca;
        const ufIgual = !ufBusca || normalizarTexto(c.uf) === ufBusca;
        return nomeIgual && ufIgual;
      }) || baseCidades.find(c => normalizarTexto(c.nome).includes(nomeBusca));

      if (encontrada) {
        pontoLat = encontrada.lat;
        pontoLng = encontrada.lng;
        item.querySelector('.hidden-coord-rota').value = JSON.stringify(encontrada);
      }
    }

    if (pontoLat !== null && pontoLng !== null) {
      waypoints.push(L.latLng(pontoLat, pontoLng));
    }
  });

  if (waypoints.length < 2) {
    alert("Por favor, selecione ao menos a Cidade de Origem e a Cidade de Destino.");
    return;
  }

  if (leafletRoutingControl && leafletMapInstancia) {
    try {
      leafletMapInstancia.removeControl(leafletRoutingControl);
    } catch(e){}
  }
  if (marcadoresPostosGrupo) {
    marcadoresPostosGrupo.clearLayers();
  }

  leafletRoutingControl = L.Routing.control({
    waypoints: waypoints,
    routeWhileDragging: false,
    addWaypoints: false,
    draggableWaypoints: false,
    fitSelectedRoutes: true,
    show: false,
    lineOptions: {
      styles: [{ color: '#1c483a', opacity: 0.85, weight: 6 }]
    },
    createMarker: function(i, wp) {
      return L.marker(wp.latLng, {
        icon: L.icon({
          iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
          shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
          iconSize: [25, 41],
          iconAnchor: [12, 41]
        })
      });
    }
  }).addTo(leafletMapInstancia);

  leafletRoutingControl.on('routesfound', function(e) {
    const rotas = e.routes;
    if (rotas && rotas.length > 0) {
      rotaGeometriaCache = rotas[0].coordinates;
      mapearPostosNoCorredor(rotaGeometriaCache);
    }
  });
}

/**
 * Mapeia postos respeitando o raio direto (200 km) e o expandido (até 400 km)
 */
function mapearPostosNoCorredor(coordenadasRota) {
  if (!marcadoresPostosGrupo || !coordenadasRota || coordenadasRota.length === 0) return;
  marcadoresPostosGrupo.clearLayers();

  const postosAvaliados = consolidarPostosMaisRecentes();
  const postosNoCorredor = [];

  postosAvaliados.forEach(p => {
    const coordPosto = obterCoordenadaPosto(p);
    if (!coordPosto) return;

    let menorDistanciaRota = Infinity;
    for (let i = 0; i < coordenadasRota.length; i += 8) {
      const d = calcularDistanciaHaversine(coordPosto.lat, coordPosto.lng, coordenadasRota[i].lat, coordenadasRota[i].lng);
      if (d < menorDistanciaRota) {
        menorDistanciaRota = d;
      }
    }

    if (menorDistanciaRota <= 400) {
      postosNoCorredor.push({
        ...p,
        lat: coordPosto.lat,
        lng: coordPosto.lng,
        distanciaKm: Math.round(menorDistanciaRota)
      });
    }
  });

  postosNoCorredor.forEach(p => {
    let corPin = "#94a3b8"; // 201 a 400 km
    if (p.distanciaKm <= 200) {
      if (p.PRECO_BASE <= 6.60) corPin = "#16a34a";
      else if (p.PRECO_BASE <= 6.90) corPin = "#eab308";
      else corPin = "#dc2626";
    }

    const marker = L.circleMarker([p.lat, p.lng], {
      radius: p.distanciaKm <= 200 ? 7 : 5,
      fillColor: corPin,
      color: "#ffffff",
      weight: 1.5,
      opacity: 1,
      fillOpacity: 0.95
    });

    const precoFmt = p.PRECO_BASE > 0 ? `R$ ${p.PRECO_BASE.toFixed(3)}` : 'Sem reg.';
    const dataFmt = formatarDataDiaMes(p.DATA_RECENTE);

    marker.bindPopup(`
      <div style="font-size: 0.75rem; min-width: 190px;">
        <strong style="color: #0f172a; display: block; margin-bottom: 2px;">${p.POSTO}</strong>
        <span class="badge bg-dark text-white" style="font-size: 0.60rem;">${p.UF_POSTO}</span>
        <span class="text-muted" style="font-size: 0.65rem;">${p.MUNICIPIO_POSTO || ''}</span>
        <hr style="margin: 4px 0;">
        <div><strong>Último Pago:</strong> <span style="color:#16a34a; font-weight:800;">${precoFmt}</span></div>
        <div><strong>Data:</strong> ${dataFmt}</div>
        <div><strong>Desvio da Rota:</strong> ~${p.distanciaKm} km</div>
      </div>
    `);

    marcadoresPostosGrupo.addLayer(marker);
  });

  gerarTabelaRoteiroImpressao(postosNoCorredor);
}

/**
 * Agrupa os postos por nome e praça única, pegando apenas o valor do último mês ativo
 */
function consolidarPostosMaisRecentes() {
  const mapaUnicos = {};
  const base = (typeof baseRegistrosMensais !== 'undefined' && Array.isArray(baseRegistrosMensais)) ? baseRegistrosMensais : [];

  base.forEach(d => {
    const nome = normalizarTexto(d.POSTO);
    const mun = normalizarTexto(d.MUNICIPIO_POSTO || '');
    const uf = d.UF_POSTO || '';
    const chave = `${nome}_${mun}_${uf}_${d.TIPO_OPERACAO}`;

    const preco = parseFloat(d.ULTIMO_PRECO_MES || d.PRECO_MEDIO_MES || 0);
    const data = d.ULTIMA_DATA_MES || "";

    if (!mapaUnicos[chave]) {
      mapaUnicos[chave] = {
        POSTO: d.POSTO,
        UF_POSTO: d.UF_POSTO,
        MUNICIPIO_POSTO: d.MUNICIPIO_POSTO,
        TIPO_OPERACAO: d.TIPO_OPERACAO,
        PRECO_BASE: preco,
        DATA_RECENTE: data
      };
    } else {
      if (data && data > mapaUnicos[chave].DATA_RECENTE) {
        mapaUnicos[chave].DATA_RECENTE = data;
        mapaUnicos[chave].PRECO_BASE = preco;
      }
    }
  });

  return Object.values(mapaUnicos);
}

function obterCoordenadaPosto(posto) {
  if (!posto.MUNICIPIO_POSTO) return null;
  const munNorm = normalizarTexto(posto.MUNICIPIO_POSTO);
  const ufNorm = (posto.UF_POSTO || '').toUpperCase().trim();

  const baseCidades = obterBaseCidadesNormalizada();
  const cidade = baseCidades.find(c => 
    normalizarTexto(c.nome) === munNorm && c.uf === ufNorm
  ) || baseCidades.find(c => normalizarTexto(c.nome) === munNorm);

  if (cidade) {
    return { lat: cidade.lat, lng: cidade.lng };
  }
  return null;
}

/**
 * Tabela compacta e deduplicada para não ultrapassar 2 páginas de impressão
 */
function gerarTabelaRoteiroImpressao(postos) {
  const container = document.getElementById('areaImpressaoRoteiro');
  const conteudo = document.getElementById('conteudoRoteiroImpresso');
  if (!container || !conteudo) return;

  if (postos.length === 0) {
    conteudo.innerHTML = `<div class="p-3 text-muted small">Nenhum posto localizado no corredor logístico.</div>`;
    container.style.display = 'block';
    return;
  }

  const postosOrdenados = [...postos].sort((a, b) => {
    if (a.TIPO_OPERACAO === 'INTERNO' && b.TIPO_OPERACAO !== 'INTERNO') return -1;
    if (a.TIPO_OPERACAO !== 'INTERNO' && b.TIPO_OPERACAO === 'INTERNO') return 1;
    if (a.distanciaKm !== b.distanciaKm) return a.distanciaKm - b.distanciaKm;
    return a.PRECO_BASE - b.PRECO_BASE;
  });

  const postosPrioritarios = postosOrdenados.filter(p => p.distanciaKm <= 200).slice(0, 30);

  conteudo.innerHTML = `
    <table class="table table-sm table-bordered tabela-sintetica mt-2" style="font-size: 0.65rem;">
      <thead class="table-light">
        <tr>
          <th>Posto / Bandeira</th>
          <th>Cidade / UF</th>
          <th class="text-end">Último Pago</th>
          <th class="text-end">Desvio da Rota</th>
          <th class="text-center">Operação</th>
        </tr>
      </thead>
      <tbody>
        ${postosPrioritarios.map(p => `
          <tr>
            <td class="fw-bold text-dark text-truncate" style="max-width: 260px;">${p.POSTO}</td>
            <td>${p.MUNICIPIO_POSTO || 'ND'} / ${p.UF_POSTO}</td>
            <td class="text-end font-monospace fw-bold text-success">
              ${p.PRECO_BASE > 0 ? `R$ ${p.PRECO_BASE.toFixed(3)}` : '--'}
            </td>
            <td class="text-end font-monospace">${p.distanciaKm} km</td>
            <td class="text-center">
              <span class="badge ${p.TIPO_OPERACAO === 'INTERNO' ? 'bg-success' : 'bg-secondary'}" style="font-size: 0.55rem;">
                ${p.TIPO_OPERACAO}
              </span>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;

  container.style.display = 'block';
}

function imprimirRoteiroViagem() {
  window.print();
}

/**
 * Inicializa o Mini Mapa com GeoJSON servido por CDN estável (jsDelivr)
 */
async function inicializarMiniMapaBrasil() {
  const container = document.getElementById('miniMapaBrasil');
  if (!container) return;

  if (miniMapaBrasilInstancia) {
    miniMapaBrasilInstancia.invalidateSize();
    return;
  }

  miniMapaBrasilInstancia = L.map('miniMapaBrasil', {
    center: [-14.235, -51.925],
    zoom: 3.2,
    zoomControl: false,
    attributionControl: false,
    dragging: false,
    scrollWheelZoom: false,
    doubleClickZoom: false,
    boxZoom: false
  });

  try {
    // CDN rápida e com cabeçalhos de CORS 100% liberados
    const resp = await fetch('https://cdn.jsdelivr.net/gh/codeforamerica/click_testing@master/geo/brazil-states.geojson');
    const geojsonData = await resp.json();

    geojsonBrasilCamada = L.geoJson(geojsonData, {
      style: estiloPadraoEstado,
      onEachFeature: function(feature, layer) {
        layer.on({
          mouseover: destacarEstadoHover,
          mouseout: resetarEstadoHover,
          click: selecionarEstadoMapaClique
        });
      }
    }).addTo(miniMapaBrasilInstancia);

    atualizarCoresMiniMapa();
    setTimeout(() => {
      miniMapaBrasilInstancia.invalidateSize();
    }, 200);
  } catch(e) {
    console.warn("Falha ao carregar malha GeoJSON do Brasil:", e);
  }
}

function estiloPadraoEstado(feature) {
  return {
    fillColor: '#e2e8f0',
    weight: 1,
    opacity: 1,
    color: '#ffffff',
    fillOpacity: 0.85
  };
}

function destacarEstadoHover(e) {
  const layer = e.target;
  const uf = layer.feature.id || (layer.feature.properties ? layer.feature.properties.sigla : '');
  const lbl = document.getElementById('lblHoverEstado');
  if (lbl) lbl.innerText = `Estado: ${uf}`;

  layer.setStyle({
    weight: 2,
    color: '#0f172a',
    fillOpacity: 1
  });
}

function resetarEstadoHover(e) {
  if (geojsonBrasilCamada) {
    geojsonBrasilCamada.resetStyle(e.target);
  }
  atualizarCoresMiniMapa();
  const lbl = document.getElementById('lblHoverEstado');
  if (lbl) lbl.innerText = "Passe o mouse ou clique";
}

function selecionarEstadoMapaClique(e) {
  const uf = e.target.feature.id || (e.target.feature.properties ? e.target.feature.properties.sigla : '');
  const selectUf = document.getElementById('filtroUfSelect');
  if (selectUf) {
    selectUf.value = (selectUf.value === uf) ? "" : uf;
    aplicarFiltroUfSelect();
  }
}

function atualizarCoresMiniMapa() {
  if (!geojsonBrasilCamada) return;

  const volumesPorUf = {};
  const base = (typeof baseRegistrosMensais !== 'undefined' && Array.isArray(baseRegistrosMensais)) ? baseRegistrosMensais : [];

  base.forEach(d => {
    if (d.UF_POSTO) {
      volumesPorUf[d.UF_POSTO] = (volumesPorUf[d.UF_POSTO] || 0) + parseFloat(d.LITROS_MES || 0);
    }
  });

  const maxVol = Math.max(...Object.values(volumesPorUf), 1);

  geojsonBrasilCamada.eachLayer(layer => {
    const uf = layer.feature.id || (layer.feature.properties ? layer.feature.properties.sigla : '');
    const vol = volumesPorUf[uf] || 0;

    let cor = '#e2e8f0';
    if (vol > 0) {
      const perc = vol / maxVol;
      if (perc > 0.6) cor = '#062316';
      else if (perc > 0.3) cor = '#1c483a';
      else if (perc > 0.1) cor = '#22c55e';
      else cor = '#4ade80';
    }

    if (ufFiltrada && ufFiltrada === uf) {
      layer.setStyle({
        fillColor: '#2563eb',
        color: '#0f172a',
        weight: 2,
        fillOpacity: 1
      });
    } else {
      layer.setStyle({
        fillColor: cor,
        color: '#ffffff',
        weight: 1,
        fillOpacity: 0.85
      });
    }
  });
}
