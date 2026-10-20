// Módulo de Matrizes Gerenciais e Auditoria Estratégica (Power BI Engine Alinhado)
// Utiliza AVERAGE (Média Simples dos Postos) para bater exatamente com o DAX do Power BI

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

  // Gera dinamicamente os meses disponíveis a partir dos registros KMM
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

  // UFs com operação
  const ufsExterno = [...new Set(registros.filter(r => r.TIPO_OPERACAO === 'EXTERNO').map(r => r.UF_POSTO).filter(Boolean))].sort();
  const ufsInterno = [...new Set(registros.filter(r => r.TIPO_OPERACAO === 'INTERNO').map(r => r.UF_POSTO).filter(Boolean))].sort();

  // 1. Agrupamento para Média Simples (AVERAGE) idêntica ao DAX:
  // Armazena a lista de preços médios de cada lançamento/posto por UF + Mês + Tipo
  const precosAgrupados = {};

  registros.forEach(r => {
    const chave = `${r.UF_POSTO}_${r.MES_ANO}_${r.TIPO_OPERACAO}`;
    if (!precosAgrupados[chave]) {
      precosAgrupados[chave] = [];
    }
    const preco = parseFloat(r.PRECO_MEDIO_MES || 0);
    if (preco > 0) {
      precosAgrupados[chave].push(preco);
    }
  });

  // Média Simples (AVERAGE) da célula UF x MÊS
  function getPrecoMedioSimples(uf, mes, tipo) {
    const lista = precosAgrupados[`${uf}_${mes}_${tipo}`];
    if (!lista || lista.length === 0) return null;
    const soma = lista.reduce((a, b) => a + b, 0);
    return soma / lista.length;
  }

  // Média Simples (AVERAGE) para a coluna TOTAL da UF
  function getTotalUfSimples(uf, tipo) {
    const todosPrecos = [];
    mesesColunas.forEach(m => {
      const lista = precosAgrupados[`${uf}_${m.id}_${tipo}`];
      if (lista && lista.length > 0) {
        todosPrecos.push(...lista);
      }
    });
    if (todosPrecos.length === 0) return null;
    return todosPrecos.reduce((a, b) => a + b, 0) / todosPrecos.length;
  }

  // 1. MATRIZ EXTERNA (Var % vs ANP Revenda)
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

    // Total Consolidado (AVERAGE da UF vs AVERAGE da ANP)
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

  // 2. MATRIZ INTERNA (Var % vs ANP Distribuição - encerra em AGO/26)
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

  // 3. MATRIZ DE SPREAD (Interno vs Externo R$/L) COM RÉGUA RIGOROSA
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

        // Régua: < R$ 0.15 = Vermelho Crítico | R$ 0.15 a R$ 0.50 = Amarelo | >= R$ 0.50 = Verde
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

  return { htmlExterna, htmlInterna, htmlSpread };
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
    <div class="row g-3">
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
            <em>💡 <strong>Como interpretar:</strong> Mede o poder de compra da frota na estrada contra a bomba oficial da ANP. Células em <strong>verde (valores negativos)</strong> indicam compra abaixo da média estadual (economia real). Células em <strong>vermelho (valores positivos)</strong> alertam para ágio ou postos caros onde a frota pagou acima do mercado regional.</em>
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
            <em>💡 <strong>Como interpretar:</strong> Avalia a eficiência na compra de atacado para as garagens. <strong>Verde</strong> confirma compra abaixo das distribuidoras. <strong>Vermelho</strong> indica lotes onde o custo da garagem perdeu tração contra o mercado atacadista. A série oficial da ANP encerrou em agosto/2026.</em>
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
            <em>💡 <strong>Como interpretar:</strong> Representa o ganho unitário líquido por abastecer na garagem em vez da rua (Preço Rota menos Custo Garagem). <strong>Valores altos em verde (acima de R$ 0,50/L)</strong> comprovam a economia da infraestrutura própria. <strong>Valores em vermelho (abaixo de R$ 0,15/L)</strong> alertam para margem insuficiente frente ao custo operacional interno.</em>
          </div>
        </div>
      </div>
    </div>
  `;
}
