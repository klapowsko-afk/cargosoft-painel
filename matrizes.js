// Módulo de Matrizes Gerenciais e Auditoria Estratégica (Power BI Engine Alinhado)
// Utiliza QTD_ABASTECIMENTOS para reproduzir o AVERAGE(VALOR_UNITARIO) de cada abastecimento

let cacheAnpBase = null;

async function obterBaseAnpOficial() {
  if (cacheAnpBase) return cacheAnpBase;
  try {
    const resp = await fetch('anp_base.json');
    if (!resp.ok) throw new Error("Ficheiro anp_base.json não encontrado");
    cacheAnpBase = await resp.json();
    return cacheAnpBase;
  } catch (err) {
    console.error("Falha ao carregar anp_base.json:", err);
    return { revenda: {}, distribuicao: {} };
  }
}

async function calcularMatrizesGerenciais(registros) {
  const dadosAnp = await obterBaseAnpOficial();
  const mapaRevenda = dadosAnp.revenda || {};
  const mapaDistribuicao = dadosAnp.distribuicao || {};

  // Extrai dinamicamente a lista ordenada de competências presentes na base
  const mesesDisponiveis = [...new Set(registros.map(r => r.MES_ANO).filter(Boolean))].sort();

  const nomesAbrev = {
    '01': 'JAN', '02': 'FEV', '03': 'MAR', '04': 'ABR',
    '05': 'MAI', '06': 'JUN', '07': 'JUL', '08': 'AGO',
    '09': 'SET', '10': 'OUT', '11': 'NOV', '12': 'DEZ'
  };

  const mesesColunas = mesesDisponiveis.map(m => {
    const [ano, mes] = m.split('-');
    return {
      id: m,
      rotulo: `${nomesAbrev[mes] || mes} - ${ano.slice(2)}`
    };
  });

  // UFs com movimentação
  const ufsExterno = [...new Set(registros.filter(r => r.TIPO_OPERACAO === 'EXTERNO').map(r => r.UF_POSTO).filter(Boolean))].sort();
  const ufsInterno = [...new Set(registros.filter(r => r.TIPO_OPERACAO === 'INTERNO').map(r => r.UF_POSTO).filter(Boolean))].sort();

  // Agrupador por UF, Mês e Tipo de Operação considerando o peso das transações individuais
  const dadosAgrupados = {};

  registros.forEach(r => {
    const chave = `${r.UF_POSTO}_${r.MES_ANO}_${r.TIPO_OPERACAO}`;
    if (!dadosAgrupados[chave]) {
      dadosAgrupados[chave] = { somaPonderadaTransacoes: 0, totalAbastecimentos: 0 };
    }

    const preco = parseFloat(r.PRECO_MEDIO_MES || 0);
    const qtd = parseInt(r.QTD_ABASTECIMENTOS || 0, 10);

    if (preco > 0 && qtd > 0) {
      dadosAgrupados[chave].somaPonderadaTransacoes += (preco * qtd);
      dadosAgrupados[chave].totalAbastecimentos += qtd;
    }
  });

  // Média exata de abastecimentos do mês para a UF (Réplica do AVERAGE do Power BI)
  function getPrecoMedioSimples(uf, mes, tipo) {
    const d = dadosAgrupados[`${uf}_${mes}_${tipo}`];
    if (!d || d.totalAbastecimentos === 0) return null;
    return d.somaPonderadaTransacoes / d.totalAbastecimentos;
  }

  // Média acumulada da UF considerando todas as transações do ano
  function getTotalUfSimples(uf, tipo) {
    let somaTotal = 0;
    let qtdTotal = 0;

    mesesColunas.forEach(m => {
      const d = dadosAgrupados[`${uf}_${m.id}_${tipo}`];
      if (d && d.totalAbastecimentos > 0) {
        somaTotal += d.somaPonderadaTransacoes;
        qtdTotal += d.totalAbastecimentos;
      }
    });

    return qtdTotal > 0 ? (somaTotal / qtdTotal) : null;
  }

  // 1. MATRIZ EXECUTIVA EXTERNA (Var % vs ANP Revenda)
  let htmlExterna = `
    <table class="table table-sm table-bordered text-center align-middle" style="font-size: 0.72rem;">
      <thead class="table-light">
        <tr>
          <th style="width: 45px;">UF</th>
          ${mesesColunas.map(m => `<th>${m.rotulo}</th>`).join('')}
          <th class="fw-bold bg-secondary text-white">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  ufsExterno.forEach(uf => {
    let tds = `<td><b>${uf}</b></td>`;
    const precosAnpAno = [];

    mesesColunas.forEach(m => {
      const precoPago = getPrecoMedioSimples(uf, m.id, 'EXTERNO');
      const refAnp = (mapaRevenda[uf] && mapaRevenda[uf][m.id]) ? mapaRevenda[uf][m.id] : null;

      if (precoPago && refAnp) {
        precosAnpAno.push(refAnp);
        const varPerc = ((precoPago - refAnp) / refAnp) * 100;
        const bgCor = varPerc <= 0 ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.32)';
        const textoSinal = (varPerc > 0 ? '+' : '') + varPerc.toFixed(2).replace('.', ',') + '%';
        tds += `<td style="background-color: ${bgCor}; font-weight: 500;">${textoSinal}</td>`;
      } else {
        tds += `<td class="text-muted" style="background:#fafafa;">-</td>`;
      }
    });

    const totalPago = getTotalUfSimples(uf, 'EXTERNO');
    if (totalPago && precosAnpAno.length > 0) {
      const mediaAnpAno = precosAnpAno.reduce((a, b) => a + b, 0) / precosAnpAno.length;
      const varTotal = ((totalPago - mediaAnpAno) / mediaAnpAno) * 100;
      const bgTotal = varTotal <= 0 ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.38)';
      const textTotal = (varTotal > 0 ? '+' : '') + varTotal.toFixed(2).replace('.', ',') + '%';
      tds += `<td style="background-color: ${bgTotal}; font-weight: 800;">${textTotal}</td>`;
    } else {
      tds += `<td class="text-muted">-</td>`;
    }

    htmlExterna += `<tr>${tds}</tr>`;
  });
  htmlExterna += `</tbody></table>`;

  // 2. MATRIZ EXECUTIVA INTERNA (Var % vs ANP Distribuição)
  let htmlInterna = `
    <table class="table table-sm table-bordered text-center align-middle" style="font-size: 0.72rem;">
      <thead class="table-light">
        <tr>
          <th style="width: 45px;">UF</th>
          ${mesesColunas.map(m => `<th>${m.rotulo}</th>`).join('')}
          <th class="fw-bold bg-secondary text-white">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  ufsInterno.forEach(uf => {
    let tds = `<td><b>${uf}</b></td>`;
    const precosAnpAno = [];

    mesesColunas.forEach(m => {
      const precoPago = getPrecoMedioSimples(uf, m.id, 'INTERNO');
      const refAnp = (mapaDistribuicao[uf] && mapaDistribuicao[uf][m.id]) ? mapaDistribuicao[uf][m.id] : null;

      if (precoPago && refAnp) {
        precosAnpAno.push(refAnp);
        const varPerc = ((precoPago - refAnp) / refAnp) * 100;
        const bgCor = varPerc <= 0 ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.32)';
        const textoSinal = (varPerc > 0 ? '+' : '') + varPerc.toFixed(2).replace('.', ',') + '%';
        tds += `<td style="background-color: ${bgCor}; font-weight: 500;">${textoSinal}</td>`;
      } else {
        tds += `<td class="text-muted" style="background:#fafafa;">-</td>`;
      }
    });

    const totalPago = getTotalUfSimples(uf, 'INTERNO');
    if (totalPago && precosAnpAno.length > 0) {
      const mediaAnpAno = precosAnpAno.reduce((a, b) => a + b, 0) / precosAnpAno.length;
      const varTotal = ((totalPago - mediaAnpAno) / mediaAnpAno) * 100;
      const bgTotal = varTotal <= 0 ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.38)';
      const textTotal = (varTotal > 0 ? '+' : '') + varTotal.toFixed(2).replace('.', ',') + '%';
      tds += `<td style="background-color: ${bgTotal}; font-weight: 800;">${textTotal}</td>`;
    } else {
      tds += `<td class="text-muted">-</td>`;
    }

    htmlInterna += `<tr>${tds}</tr>`;
  });
  htmlInterna += `</tbody></table>`;

  // 3. MATRIZ EXECUTIVA DE SPREAD (Interno vs Externo R$/L)
  let htmlSpread = `
    <table class="table table-sm table-bordered text-center align-middle" style="font-size: 0.72rem;">
      <thead class="table-light">
        <tr>
          <th style="width: 45px;">UF</th>
          ${mesesColunas.map(m => `<th>${m.rotulo}</th>`).join('')}
          <th class="fw-bold bg-secondary text-white">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  ufsInterno.forEach(uf => {
    let tds = `<td><b>${uf}</b></td>`;
    const totInt = getTotalUfSimples(uf, 'INTERNO');
    const totExt = getTotalUfSimples(uf, 'EXTERNO');

    mesesColunas.forEach(m => {
      const pInt = getPrecoMedioSimples(uf, m.id, 'INTERNO');
      const pExt = getPrecoMedioSimples(uf, m.id, 'EXTERNO');

      if (pInt && pExt) {
        const spread = pExt - pInt;
        let bgCor = 'rgba(245, 158, 11, 0.28)';
        if (spread >= 0.50) bgCor = 'rgba(34, 197, 94, 0.32)';
        if (spread < 0.15) bgCor = 'rgba(239, 68, 68, 0.32)';

        tds += `<td style="background-color: ${bgCor}; font-weight: 600;">R$ ${spread.toFixed(2).replace('.', ',')}</td>`;
      } else {
        tds += `<td class="text-muted" style="background:#fafafa;">-</td>`;
      }
    });

    if (totInt && totExt) {
      const spreadTot = totExt - totInt;
      let bgTotal = 'rgba(245, 158, 11, 0.35)';
      if (spreadTot >= 0.50) bgTotal = 'rgba(34, 197, 94, 0.38)';
      if (spreadTot < 0.15) bgTotal = 'rgba(239, 68, 68, 0.38)';

      tds += `<td style="background-color: ${bgTotal}; font-weight: 800;">R$ ${spreadTot.toFixed(2).replace('.', ',')}</td>`;
    } else {
      tds += `<td class="text-muted">-</td>`;
    }

    htmlSpread += `<tr>${tds}</tr>`;
  });
  htmlSpread += `</tbody></table>`;

  // ==========================================
  // TABELAS DE CHECAGEM BRUTAS (ESPELHO POWER BI)
  // ==========================================

  // CHECAGEM 1: Custo Médio Externo Pago (R$/L)
  let htmlCheckPago = `
    <table class="table table-sm table-bordered text-center align-middle" style="font-size: 0.70rem;">
      <thead class="table-dark">
        <tr>
          <th style="width: 45px;">UF</th>
          ${mesesColunas.map(m => `<th>${m.rotulo}</th>`).join('')}
          <th class="fw-bold bg-primary text-white">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  ufsExterno.forEach(uf => {
    let tds = `<td><b>${uf}</b></td>`;
    mesesColunas.forEach(m => {
      const p = getPrecoMedioSimples(uf, m.id, 'EXTERNO');
      tds += `<td>${p ? p.toFixed(2).replace('.', ',') : '-'}</td>`;
    });
    const tot = getTotalUfSimples(uf, 'EXTERNO');
    tds += `<td class="fw-bold bg-light">${tot ? tot.toFixed(2).replace('.', ',') : '-'}</td>`;
    htmlCheckPago += `<tr>${tds}</tr>`;
  });
  htmlCheckPago += `</tbody></table>`;

  // CHECAGEM 2: Custo Médio ANP Revenda (R$/L)
  const ufsAnpRevenda = Object.keys(mapaRevenda).sort();
  let htmlCheckAnp = `
    <table class="table table-sm table-bordered text-center align-middle" style="font-size: 0.70rem;">
      <thead class="table-dark">
        <tr>
          <th style="width: 45px;">UF</th>
          ${mesesColunas.map(m => `<th>${m.rotulo}</th>`).join('')}
          <th class="fw-bold bg-success text-white">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  ufsAnpRevenda.forEach(uf => {
    let tds = `<td><b>${uf}</b></td>`;
    const valoresUf = [];
    mesesColunas.forEach(m => {
      const v = (mapaRevenda[uf] && mapaRevenda[uf][m.id]) ? mapaRevenda[uf][m.id] : null;
      if (v) valoresUf.push(v);
      tds += `<td>${v ? v.toFixed(2).replace('.', ',') : '-'}</td>`;
    });
    const mediaUf = valoresUf.length > 0 ? (valoresUf.reduce((a, b) => a + b, 0) / valoresUf.length) : null;
    tds += `<td class="fw-bold bg-light">${mediaUf ? mediaUf.toFixed(2).replace('.', ',') : '-'}</td>`;
    htmlCheckAnp += `<tr>${tds}</tr>`;
  });
  htmlCheckAnp += `</tbody></table>`;

  // CHECAGEM 3: Custo Médio Interno Pago (R$/L)
  let htmlCheckInternoPago = `
    <table class="table table-sm table-bordered text-center align-middle" style="font-size: 0.70rem;">
      <thead class="table-dark">
        <tr>
          <th style="width: 45px;">UF</th>
          ${mesesColunas.map(m => `<th>${m.rotulo}</th>`).join('')}
          <th class="fw-bold bg-primary text-white">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  ufsInterno.forEach(uf => {
    let tds = `<td><b>${uf}</b></td>`;
    mesesColunas.forEach(m => {
      const p = getPrecoMedioSimples(uf, m.id, 'INTERNO');
      tds += `<td>${p ? p.toFixed(2).replace('.', ',') : '-'}</td>`;
    });
    const tot = getTotalUfSimples(uf, 'INTERNO');
    tds += `<td class="fw-bold bg-light">${tot ? tot.toFixed(2).replace('.', ',') : '-'}</td>`;
    htmlCheckInternoPago += `<tr>${tds}</tr>`;
  });
  htmlCheckInternoPago += `</tbody></table>`;

  // CHECAGEM 4: Custo Médio ANP Distribuição (R$/L)
  const ufsAnpDist = Object.keys(mapaDistribuicao).sort();
  let htmlCheckAnpDist = `
    <table class="table table-sm table-bordered text-center align-middle" style="font-size: 0.70rem;">
      <thead class="table-dark">
        <tr>
          <th style="width: 45px;">UF</th>
          ${mesesColunas.map(m => `<th>${m.rotulo}</th>`).join('')}
          <th class="fw-bold bg-success text-white">Total</th>
        </tr>
      </thead>
      <tbody>
  `;

  ufsAnpDist.forEach(uf => {
    let tds = `<td><b>${uf}</b></td>`;
    const valoresUf = [];
    mesesColunas.forEach(m => {
      const v = (mapaDistribuicao[uf] && mapaDistribuicao[uf][m.id]) ? mapaDistribuicao[uf][m.id] : null;
      if (v) valoresUf.push(v);
      tds += `<td>${v ? v.toFixed(2).replace('.', ',') : '-'}</td>`;
    });
    const mediaUf = valoresUf.length > 0 ? (valoresUf.reduce((a, b) => a + b, 0) / valoresUf.length) : null;
    tds += `<td class="fw-bold bg-light">${mediaUf ? mediaUf.toFixed(2).replace('.', ',') : '-'}</td>`;
    htmlCheckAnpDist += `<tr>${tds}</tr>`;
  });
  htmlCheckAnpDist += `</tbody></table>`;

  return {
    htmlExterna,
    htmlInterna,
    htmlSpread,
    htmlCheckPago,
    htmlCheckAnp,
    htmlCheckInternoPago,
    htmlCheckAnpDist
  };
}

async function renderizarAbaMatrizes() {
  const container = document.getElementById('secaoMatrizesGerenciais');
  if (!container) return;

  container.innerHTML = `
    <div class="text-center py-5 text-muted">
      <div class="spinner-border spinner-border-sm text-success me-2" role="status"></div>
      A consolidar matrizes gerenciais com a base anp_base.json...
    </div>
  `;

  if (!baseRegistrosMensais || baseRegistrosMensais.length === 0) {
    container.innerHTML = `<div class="alert alert-warning">Aguardando carregamento da base KMM...</div>`;
    return;
  }

  const matrizes = await calcularMatrizesGerenciais(baseRegistrosMensais);

  container.innerHTML = `
    <!-- BLOCO 1: MATRIZES EXECUTIVAS -->
    <div class="row g-3 mb-4">
      <!-- AUDITORIA EXTERNA -->
      <div class="col-12 col-xl-7">
        <div class="card p-3 shadow-sm border-0 h-100">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-graph-down-arrow me-1 text-primary"></i> Auditoria Externa: Variação do Custo Pago vs. ANP Revenda (%)</h6>
            <span class="badge bg-light text-dark border">Rota Rodoviária</span>
          </div>
          <div class="table-responsive">
            ${matrizes.htmlExterna}
          </div>
          <div class="alert alert-light border mt-auto py-2 px-3 small text-muted" style="font-size: 0.72rem;">
            <em>💡 <strong>Como interpretar:</strong> Mede o poder de compra da frota na estrada contra a bomba oficial da ANP. Células em <strong>verde (valores negativos)</strong> indicam compra abaixo da média estadual. Células em <strong>vermelho (valores positivos)</strong> alertam para ágio ou postos caros.</em>
          </div>
        </div>
      </div>

      <!-- AUDITORIA INTERNA E SPREAD -->
      <div class="col-12 col-xl-5 d-flex flex-column gap-3">
        <div class="card p-3 shadow-sm border-0 flex-grow-1">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-fuel-pump-fill me-1 text-success"></i> Auditoria Interna: Variação do Custo Pago vs. ANP Distribuição (%)</h6>
            <span class="badge bg-light text-dark border">Tanques Próprios</span>
          </div>
          <div class="table-responsive">
            ${matrizes.htmlInterna}
          </div>
          <div class="alert alert-light border mt-1 py-1 px-2 text-muted" style="font-size: 0.69rem;">
            <em>💡 <strong>Como interpretar:</strong> Avalia a eficiência na compra de atacado para as garagens em relação ao Levantamento Oficial de Preços de Distribuição de Combustíveis (PDC/ANP).</em>
          </div>
        </div>

        <div class="card p-3 shadow-sm border-0 flex-grow-1">
          <div class="d-flex justify-content-between align-items-center mb-2">
            <h6 class="fw-bold mb-0 text-dark"><i class="bi bi-cash-stack me-1 text-warning"></i> Spread Interno X Externo (R$/L)</h6>
            <span class="badge bg-light text-dark border">Margem Garagem vs Bomba</span>
          </div>
          <div class="table-responsive">
            ${matrizes.htmlSpread}
          </div>
          <div class="alert alert-light border mt-1 py-1 px-2 text-muted" style="font-size: 0.69rem;">
            <em>💡 <strong>Como interpretar:</strong> Ganho unitário líquido por abastecer na garagem em vez da rua. <strong>Vermelho (abaixo de R$ 0,15/L)</strong> alerta para margem insuficiente.</em>
          </div>
        </div>
      </div>
    </div>

    <!-- BLOCO 2: MODO DE CHECAGEM BRUTO (ESPELHO POWER BI) -->
    <div class="card p-3 shadow-sm border-0 bg-light">
      <div class="d-flex justify-content-between align-items-center mb-3 border-bottom pb-2">
        <div>
          <h6 class="fw-bold text-dark mb-0"><i class="bi bi-ui-checks-grid me-1 text-secondary"></i> Painel de Checagem: Confronto de Preços Brutos em Reais (R$/L)</h6>
          <span class="small text-muted">Valores médios ponderados por transação e preços oficiais da ANP (Revenda e Distribuição)</span>
        </div>
        <span class="badge bg-secondary text-white font-monospace">Auditoria Interna de Dados</span>
      </div>

      <!-- CHECAGEM DE REVENDA -->
      <div class="row g-3 mb-3">
        <!-- TABELA CHECAGEM 1: CUSTO MEDIO EXTERNO PAGO -->
        <div class="col-12 col-xl-6">
          <div class="card p-2 bg-white border h-100">
            <span class="fw-bold small text-dark mb-2 d-block">1. Custo Médio Externo Pago (R$/L) - Bomba de Rua</span>
            <div class="table-responsive">
              ${matrizes.htmlCheckPago}
            </div>
          </div>
        </div>

        <!-- TABELA CHECAGEM 2: CUSTO MEDIO ANP REVENDA -->
        <div class="col-12 col-xl-6">
          <div class="card p-2 bg-white border h-100">
            <span class="fw-bold small text-dark mb-2 d-block">2. Custo Médio ANP Revenda (R$/L) - Base Oficial</span>
            <div class="table-responsive">
              ${matrizes.htmlCheckAnp}
            </div>
          </div>
        </div>
      </div>

      <!-- CHECAGEM DE DISTRIBUIÇÃO -->
      <div class="row g-3">
        <!-- TABELA CHECAGEM 3: CUSTO MEDIO INTERNO PAGO -->
        <div class="col-12 col-xl-6">
          <div class="card p-2 bg-white border h-100">
            <span class="fw-bold small text-dark mb-2 d-block">3. Custo Médio Interno Pago (R$/L) - Garagens / Tanques</span>
            <div class="table-responsive">
              ${matrizes.htmlCheckInternoPago}
            </div>
          </div>
        </div>

        <!-- TABELA CHECAGEM 4: CUSTO MEDIO ANP DISTRIBUIÇÃO -->
        <div class="col-12 col-xl-6">
          <div class="card p-2 bg-white border h-100">
            <span class="fw-bold small text-dark mb-2 d-block">4. Custo Médio ANP Distribuição (R$/L) - Base Oficial PDC</span>
            <div class="table-responsive">
              ${matrizes.htmlCheckAnpDist}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
