/* ==========================================================================
   MÓDULO DE TRATATIVAS COMERCIAIS & PERSISTÊNCIA FIRESTORE - VOCTT
   ========================================================================== */

const FIRESTORE_BASE_TRATATIVAS = "https://firestore.googleapis.com/v1/projects/cargosoft-diesel/databases/(default)/documents/tratativas_diesel";

// Cache em memória das tratativas registadas
let cacheTratativas = {};
let postoAtivoTratativa = null;

// 1. Injeta o HTML estrutural do Modal de Tratativas no final do body
(function inicializarModalTratativasDOM() {
  const modalHtml = `
    <div class="modal fade" id="modalTratativaComercial" tabindex="-1" aria-labelledby="lblModalTratativa" aria-hidden="true" style="z-index: 100050;">
      <div class="modal-dialog modal-dialog-centered modal-lg">
        <div class="modal-content border-0 shadow-lg" style="border-radius: 12px; overflow: hidden;">
          
          <!-- TOPO EXECUTIVO -->
          <div class="modal-header text-white" style="background: linear-gradient(135deg, #062316 0%, #144e31 100%); padding: 14px 20px;">
            <div>
              <div class="d-flex align-items-center gap-2">
                <span class="badge bg-success text-white font-monospace" id="modalTratativaUf">--</span>
                <h6 class="modal-title fw-bold mb-0 text-white" id="modalTratativaPostoNome">Nome do Posto</h6>
              </div>
              <div class="small text-white-50 mt-1" style="font-size: 0.72rem;" id="modalTratativaSub">
                Município: -- | Operação: ROTA
              </div>
            </div>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Fechar"></button>
          </div>

          <!-- CORPO COM DADOS REAIS E FORMULÁRIO -->
          <div class="modal-body p-4 bg-light">
            
            <!-- CARDS DE CONTEXTO REAL DA BASE -->
            <div class="row g-2 mb-3">
              <div class="col-4">
                <div class="bg-white p-2 rounded border text-center">
                  <div class="text-muted text-uppercase fw-bold" style="font-size: 0.60rem;">Preço Médio Pago</div>
                  <div class="fw-bold font-monospace text-dark" style="font-size: 0.90rem;" id="modalCtxPrecoMedio">R$ --</div>
                </div>
              </div>
              <div class="col-4">
                <div class="bg-white p-2 rounded border text-center">
                  <div class="text-muted text-uppercase fw-bold" style="font-size: 0.60rem;">Ref. ANP (Oficial)</div>
                  <div class="fw-bold font-monospace text-primary" style="font-size: 0.90rem;" id="modalCtxRefAnp">R$ --</div>
                </div>
              </div>
              <div class="col-4">
                <div class="bg-white p-2 rounded border text-center">
                  <div class="text-muted text-uppercase fw-bold" style="font-size: 0.60rem;">Último Abastecimento</div>
                  <div class="fw-bold font-monospace text-danger" style="font-size: 0.90rem;" id="modalCtxUltimoPago">R$ --</div>
                </div>
              </div>
            </div>

            <div id="alertaPermissaoTratativa" class="alert alert-warning py-2 px-3 small mb-3" style="display: none; font-size: 0.74rem;">
              <i class="bi bi-shield-lock me-1"></i> Modo apenas de consulta. Apenas o gestor administrador tem permissão para alterar tratativas comerciais.
            </div>

            <!-- FORMULÁRIO OPERACIONAL -->
            <form id="formTratativaDiesel" onsubmit="salvarTratativaFirestore(event)">
              <div class="row g-3">
                <div class="col-md-6">
                  <label class="form-label fw-bold text-dark small mb-1">Status da Negociação:</label>
                  <select id="campoTratativaStatus" class="form-select form-select-sm" required>
                    <option value="EM_ABERTO">🟡 Em Aberto (Em Cotação)</option>
                    <option value="ACORDO_FECHADO">🟢 Acordo Fechado / Preço Reduzido</option>
                    <option value="POSTO_BLOQUEADO">🔴 Posto Descredenciado / Bloqueado</option>
                    <option value="SEM_RETORNO">⚪ Sem Retorno Comercial</option>
                  </select>
                </div>

                <div class="col-md-6">
                  <label class="form-label fw-bold text-dark small mb-1">Preço Acordado na Mesa (R$/L):</label>
                  <input type="number" step="0.001" id="campoTratativaPrecoAcordado" class="form-control form-control-sm font-monospace" placeholder="Ex: 6.450">
                </div>

                <div class="col-md-6">
                  <label class="form-label fw-bold text-dark small mb-1">Responsável / Contacto no Posto:</label>
                  <input type="text" id="campoTratativaContato" class="form-control form-control-sm" placeholder="Nome do gerente ou faturista">
                </div>

                <div class="col-md-6">
                  <label class="form-label fw-bold text-dark small mb-1">Telefone / E-mail de Contacto:</label>
                  <input type="text" id="campoTratativaTelefone" class="form-control form-control-sm" placeholder="(00) 00000-0000">
                </div>

                <div class="col-12">
                  <label class="form-label fw-bold text-dark small mb-1">Histórico das Negociações e Prazos:</label>
                  <textarea id="campoTratativaNotas" class="form-control form-control-sm" rows="3" placeholder="Registo de condições: prazo de pagamento, carência, desvio justificado, etc..."></textarea>
                </div>
              </div>

              <div class="d-flex justify-content-between align-items-center mt-3 pt-2 border-top">
                <span class="text-muted font-monospace" style="font-size: 0.65rem;" id="modalTratativaInfoData">Nenhum registo prévio</span>
                <div class="d-flex gap-2">
                  <button type="button" class="btn btn-sm btn-outline-secondary" data-bs-dismiss="modal">Fechar</button>
                  <button type="submit" id="btnSalvarTratativa" class="btn btn-sm btn-success fw-bold px-3">
                    <span id="txtBtnSalvarTratativa"><i class="bi bi-check-circle me-1"></i> Guardar Tratativa</span>
                    <span id="spinnerBtnSalvarTratativa" class="spinner-border spinner-border-sm ms-1" style="display: none;" role="status"></span>
                  </button>
                </div>
              </div>
            </form>

          </div>
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHtml);
})();

// 2. Converte nome do posto para ID limpo no Firestore
function gerarDocumentIdPosto(posto, uf) {
  const chave = `${posto}_${uf}`;
  return chave.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-zA-Z0-9_-]/g, "_").toUpperCase();
}

// 3. Abre o modal com os dados reais do posto selecionado
async function abrirModalTratativa(nomePosto, uf, municipio, precoMedio, refAnp, ultimoPago) {
  postoAtivoTratativa = { nomePosto, uf, municipio, precoMedio, refAnp, ultimoPago };

  document.getElementById('modalTratativaPostoNome').innerText = nomePosto;
  document.getElementById('modalTratativaUf').innerText = uf || '--';
  document.getElementById('modalTratativaSub').innerText = `Município: ${municipio || 'Não Identificado'} | Operação: ROTA`;

  document.getElementById('modalCtxPrecoMedio').innerText = precoMedio > 0 ? `R$ ${precoMedio.toFixed(3)}` : '--';
  document.getElementById('modalCtxRefAnp').innerText = refAnp > 0 ? `R$ ${refAnp.toFixed(3)}` : '--';
  document.getElementById('modalCtxUltimoPago').innerText = ultimoPago > 0 ? `R$ ${ultimoPago.toFixed(3)}` : '--';

  // Limpa campos
  document.getElementById('campoTratativaStatus').value = "EM_ABERTO";
  document.getElementById('campoTratativaPrecoAcordado').value = "";
  document.getElementById('campoTratativaContato').value = "";
  document.getElementById('campoTratativaTelefone').value = "";
  document.getElementById('campoTratativaNotas').value = "";
  document.getElementById('modalTratativaInfoData').innerText = "A carregar histórico...";

  // Validação de perfil (apenas o seu e-mail tem escrita)
  const emailLogado = (typeof utilizadorAutenticado !== 'undefined' && utilizadorAutenticado) ? utilizadorAutenticado.email : "";
  const ehAdmin = emailLogado.toLowerCase().includes("willian");

  const btnSalvar = document.getElementById('btnSalvarTratativa');
  const alertaPermissao = document.getElementById('alertaPermissaoTratativa');
  const formCampos = document.querySelectorAll('#formTratativaDiesel input, #formTratativaDiesel select, #formTratativaDiesel textarea');

  if (ehAdmin) {
    alertaPermissao.style.display = 'none';
    btnSalvar.style.display = 'inline-block';
    formCampos.forEach(c => c.removeAttribute('disabled'));
  } else {
    alertaPermissao.style.display = 'block';
    btnSalvar.style.display = 'none';
    formCampos.forEach(c => c.setAttribute('disabled', 'disabled'));
  }

  // Abre a janela Bootstrap
  const modalEl = document.getElementById('modalTratativaComercial');
  const bsModal = new bootstrap.Modal(modalEl);
  bsModal.show();

  // Consulta registo existente no Firestore REST
  await carregarDadosTratativaFirestore(nomePosto, uf);
}

// 4. Carrega o registo guardado no Firestore
async function carregarDadosTratativaFirestore(posto, uf) {
  const docId = gerarDocumentIdPosto(posto, uf);

  try {
    const url = `${FIRESTORE_BASE_TRATATIVAS}/${docId}`;
    const token = (typeof utilizadorAutenticado !== 'undefined' && utilizadorAutenticado) ? utilizadorAutenticado.idToken : "";
    
    const headers = token ? { "Authorization": `Bearer ${token}` } : {};
    const resp = await fetch(url, { headers });

    if (resp.status === 404) {
      document.getElementById('modalTratativaInfoData').innerText = "Nenhuma tratativa anterior registada.";
      return;
    }

    if (!resp.ok) throw new Error(`Status ${resp.status}`);

    const data = await resp.json();
    if (data && data.fields) {
      const status = data.fields.status?.stringValue || "EM_ABERTO";
      const preco = data.fields.preco_acordado?.doubleValue || data.fields.preco_acordado?.integerValue || "";
      const contato = data.fields.contato?.stringValue || "";
      const telefone = data.fields.telefone?.stringValue || "";
      const notas = data.fields.notas?.stringValue || "";
      const atualizadoEm = data.fields.atualizado_em?.timestampValue || "";

      document.getElementById('campoTratativaStatus').value = status;
      document.getElementById('campoTratativaPrecoAcordado').value = preco;
      document.getElementById('campoTratativaContato').value = contato;
      document.getElementById('campoTratativaTelefone').value = telefone;
      document.getElementById('campoTratativaNotas').value = notas;

      const dataLegivel = atualizadoEm ? new Date(atualizadoEm).toLocaleDateString('pt-BR') : "--";
      document.getElementById('modalTratativaInfoData').innerText = `Última atualização: ${dataLegivel}`;
    }
  } catch (err) {
    console.warn("Sem histórico ou falha na leitura da tratativa:", err);
    document.getElementById('modalTratativaInfoData').innerText = "Registo novo ou sem histórico.";
  }
}

// 5. Grava as alterações no Cloud Firestore via REST
async function salvarTratativaFirestore(event) {
  event.preventDefault();
  if (!postoAtivoTratativa) return;

  const btn = document.getElementById('btnSalvarTratativa');
  const txtBtn = document.getElementById('txtBtnSalvarTratativa');
  const spinner = document.getElementById('spinnerBtnSalvarTratativa');

  btn.disabled = true;
  txtBtn.innerText = "A guardar...";
  spinner.style.display = 'inline-block';

  const docId = gerarDocumentIdPosto(postoAtivoTratativa.nomePosto, postoAtivoTratativa.uf);
  const status = document.getElementById('campoTratativaStatus').value;
  const precoAcordado = parseFloat(document.getElementById('campoTratativaPrecoAcordado').value) || 0;
  const contato = document.getElementById('campoTratativaContato').value.trim();
  const telefone = document.getElementById('campoTratativaTelefone').value.trim();
  const notas = document.getElementById('campoTratativaNotas').value.trim();
  const token = (typeof utilizadorAutenticado !== 'undefined' && utilizadorAutenticado) ? utilizadorAutenticado.idToken : "";

  const payload = {
    fields: {
      posto: { stringValue: postoAtivoTratativa.nomePosto },
      uf: { stringValue: postoAtivoTratativa.uf },
      municipio: { stringValue: postoAtivoTratativa.municipio || "" },
      status: { stringValue: status },
      preco_acordado: { doubleValue: precoAcordado },
      contato: { stringValue: contato },
      telefone: { stringValue: telefone },
      notas: { stringValue: notas },
      atualizado_em: { timestampValue: new Date().toISOString() },
      autor: { stringValue: (typeof utilizadorAutenticado !== 'undefined' && utilizadorAutenticado) ? utilizadorAutenticado.email : "ADMIN" }
    }
  };

  try {
    const url = `${FIRESTORE_BASE_TRATATIVAS}/${docId}`;
    const headers = { "Content-Type": "application/json" };
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const resp = await fetch(url, {
      method: "PATCH",
      headers: headers,
      body: JSON.stringify(payload)
    });

    if (!resp.ok) throw new Error(`Falha ao gravar no Firestore: HTTP ${resp.status}`);

    document.getElementById('modalTratativaInfoData').innerText = `Atualizado agora mesmo (${new Date().toLocaleDateString('pt-BR')})`;
    
    // Feedback e fecho
    txtBtn.innerHTML = `<i class="bi bi-check-all me-1"></i> Guardado!`;
    setTimeout(() => {
      const modalEl = document.getElementById('modalTratativaComercial');
      const inst = bootstrap.Modal.getInstance(modalEl);
      if (inst) inst.hide();
    }, 700);

  } catch (err) {
    alert("Erro ao gravar tratativa: " + err.message);
  } finally {
    setTimeout(() => {
      btn.disabled = false;
      txtBtn.innerHTML = `<i class="bi bi-check-circle me-1"></i> Guardar Tratativa`;
      spinner.style.display = 'none';
    }, 800);
  }
}
