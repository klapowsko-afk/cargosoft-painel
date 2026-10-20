// Módulo de Matrizes Gerenciais e Auditoria Estratégica (Engine Dinâmica)
// Gera colunas de meses e anos automaticamente a partir da base KMM

function calcularMatrizesGerenciais(registros) {
  // Gera a lista dinâmica de meses/anos existentes na base (dCalendário em memória)
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

  // UFs operadas
  const ufsExterno = [...new Set(registros.filter(r => r.TIPO_OPERACAO === 'EXTERNO').map(r => r.UF_POSTO).filter(Boolean))].sort();
  const ufsInterno = [...new Set(registros.filter(r => r.TIPO_OPERACAO === 'INTERNO').map(r => r.UF_POSTO).filter(Boolean))].sort();

  // Agrupador volumétrico e financeiro por UF, Mês e Tipo
  const dadosAgrupados = {};

  registros.forEach(r => {
    const chave = `${r.UF_POSTO}_${r.MES_ANO}_${r.TIPO_OPERACAO}`;
    if (!dadosAgrupados[chave]) {
      dadosAgrupados[chave] = { litros: 0, valor: 0 };
    }
    dadosAgrupados[chave].litros += parseFloat(r.LITROS_MES || 0);
    dadosAgrupados[chave].valor += parseFloat(r.VALOR_TOTAL_MES || 0);
  });

  function getPrecoMedio(uf, mes, tipo) {
    const d = dadosAgrupados[`${uf}_${mes}_${tipo}`];
    return (d && d.litros > 0) ? (d.valor / d.litros) : null;
  }

  function getTotaisUf(uf, tipo) {
    let lit = 0, val = 0;
    mesesColunas.forEach(m => {
      const d = dadosAgrupados[`${uf}_${m.id}_${tipo}`];
      if (d) {
        lit += d.litros;
        val += d.valor;
      }
    });
    return { litros: lit, valor: val, precoMedio: lit > 0 ? (val / lit) : null };
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
    let somaRefPond = 0;
    const totUf = getTotaisUf(uf, 'EXTERNO');

    mesesColunas.forEach(m => {
      const precoPago = getPrecoMedio(uf, m.id, 'EXTERNO');
      const tabelaAnp = (typeof anpRevenda !== 'undefined' && anpRevenda[uf]) ? anpRevenda[uf] : null;
      const refAnp = tabelaAnp ? tabelaAnp[m.id] : null;

      if (precoPago && refAnp) {
        const d = dadosAgrupados[`${uf}_${m.id}_EXTERNO`];
        somaRefPond += (refAnp * d.litros);
        const varPerc = ((precoPago - refAnp) / refAnp) * 100;
        const bgCor = varPerc <= 0 ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.32)';
        const textoSinal = (varPerc > 0 ? '+' : '') + varPerc.toFixed(2).replace('.', ',') + '%';
        tds += `<td style="background-color: ${bgCor}; font-weight: 500;">${textoSinal}</td>`;
      } else {
        tds += `<td class="text-muted" style="background:#fafafa;">-</td>`;
      }
    });

    if (totUf.litros > 0 && somaRefPond > 0) {
      const anpMediaPond = somaRefPond / totUf.litros;
      const varTotal = ((totUf.precoMedio - anpMediaPond) / anpMediaPond) * 100;
      const bgTotal = varTotal <= 0 ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.38)';
      const textTotal = (varTotal > 0 ? '+' : '') + varTotal.toFixed(2).replace('.', ',') + '%';
      tds += `<td style="background-color: ${bgTotal}; font-weight: 800;">${textTotal}</td>`;
    } else {
      tds += `<td class="text-muted">-</td>`;
    }

    htmlExterna += `<tr>${tds}</tr>`;
  });
  htmlExterna += `</tbody></table>`;

  // 2. MATRIZ INTERNA (Var % vs ANP Distribuição)
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
    let somaRefPond = 0;
    const totUf = getTotaisUf(uf, 'INTERNO');

    mesesColunas.forEach(m => {
      const precoPago = getPrecoMedio(uf, m.id, 'INTERNO');
      const tabelaAnp = (typeof anpDistribuicao !== 'undefined' && anpDistribuicao[uf]) ? anpDistribuicao[uf] : null;
      const refAnp = tabelaAnp ? tabelaAnp[m.id] : null;

      if (precoPago && refAnp) {
        const d = dadosAgrupados[`${uf}_${m.id}_INTERNO`];
        somaRefPond += (refAnp * d.litros);
        const varPerc = ((precoPago - refAnp) / refAnp) * 100;
        const bgCor = varPerc <= 0 ? 'rgba(34, 197, 94, 0.28)' : 'rgba(239, 68, 68, 0.32)';
        const textoSinal = (varPerc > 0 ? '+' : '') + varPerc.toFixed(2).replace('.', ',') + '%';
        tds += `<td style="background-color: ${bgCor}; font-weight: 500;">${textoSinal}</td>`;
      } else {
        tds += `<td class="text-muted" style="background:#fafafa;">-</td>`;
      }
    });

    if (totUf.litros > 0 && somaRefPond > 0) {
      const anpMediaPond = somaRefPond / totUf.litros;
      const varTotal = ((totUf.precoMedio - anpMediaPond) / anpMediaPond) * 100;
      const bgTotal = varTotal <= 0 ? 'rgba(34, 197, 94, 0.35)' : 'rgba(239, 68, 68, 0.38)';
      const textTotal = (varTotal > 0 ? '+' : '') + varTotal.toFixed(2).replace('.', ',') + '%';
      tds += `<td style="background-color: ${bgTotal}; font-weight: 800;">${textTotal}</td>`;
    } else {
      tds += `<td class="text-muted">-</td>`;
    }

    htmlInterna += `<tr>${tds}</tr>`;
  });
  htmlInterna += `</tbody></table>`;

  // 3. MATRIZ DE SPREAD (Interno vs Externo R$/L)
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
    const totInt = getTotaisUf(uf, 'INTERNO');
    const totExt = getTotaisUf(uf, 'EXTERNO');

    mesesColunas.forEach(m => {
      const pInt = getPrecoMedio(uf, m.id, 'INTERNO');
      const pExt = getPrecoMedio(uf, m.id, 'EXTERNO');

      if (pInt && pExt) {
        const spread = pExt - pInt;
        let bgCor = 'rgba(245, 158, 11, 0.28)';
        if (spread >= 0.50) bgCor = 'rgba(34, 197, 94, 0.32)';
        if (spread < 0) bgCor = 'rgba(239, 68, 68, 0.32)';

        tds += `<td style="background-color: ${bgCor}; font-weight: 600;">R$ ${spread.toFixed(2).replace('.', ',')}</td>`;
      } else {
        tds += `<td class="text-muted" style="background:#fafafa;">-</td>`;
      }
    });

    if (totInt.precoMedio && totExt.precoMedio) {
      const spreadTot = totExt.precoMedio - totInt.precoMedio;
      let bgTotal = 'rgba(245, 158, 11, 0.35)';
      if (spreadTot >= 0.50) bgTotal = 'rgba(34, 197, 94, 0.38)';
      if (spreadTot < 0) bgTotal = 'rgba(239, 68, 68, 0.38)';

      tds += `<td style="background-color: ${bgTotal}; font-weight: 800;">R$ ${spreadTot.toFixed(2).replace('.', ',')}</td>`;
    } else {
      tds += `<td class="text-muted">-</td>`;
    }

    htmlSpread += `<tr>${tds}</tr>`;
  });
  htmlSpread += `</tbody></table>`;

  return { htmlExterna, htmlInterna, htmlSpread };
}

function renderizarAbaMatrizes() {
  const container = document.getElementById('secaoMatrizesGerenciais');
  if (!container || !baseRegistrosMensais || baseRegistrosMensais.length === 0) return;

  const matrizes = calcularMatrizesGerenciais(baseRegistrosMensais);

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
            <em>💡 <strong>Como interpretar:</strong> Avalia a eficiência na compra de atacado para as garagens. <strong>Verde</strong> confirma compra abaixo das distribuidoras. <strong>Vermelho</strong> indica lotes onde o custo da garagem perdeu tração contra o mercado atacadista.</em>
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
            <em>💡 <strong>Como interpretar:</strong> Representa o ganho unitário líquido por abastecer na garagem em vez da rua (Preço Rota menos Custo Garagem). <strong>Valores altos em verde (acima de R$ 0,50/L)</strong> comprovam a economia da infraestrutura própria. <strong>Valores baixos/vermelhos</strong> alertam que o tanque próprio empatou com a rua.</em>
          </div>
        </div>
      </div>
    </div>
  `;
}
