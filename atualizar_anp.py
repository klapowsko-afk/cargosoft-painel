import os
import re
import json
import urllib.request
import pandas as pd

URL_SEMANAL_ESTADOS = "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/semanal/semanal-estados-desde-2013.xlsx"
URL_ANTT_NOTICIAS = "https://www.gov.br/antt/pt-br/assuntos/ultimas-noticias"

MAPA_ESTADOS = {
    "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM", "BAHIA": "BA",
    "CEARA": "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", "GOIAS": "GO",
    "MARANHAO": "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG",
    "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR", "PERNAMBUCO": "PE", "PIAUI": "PI",
    "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS",
    "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP",
    "SERGIPE": "SE", "TOCANTINS": "TO"
}

def obter_referencia_antt():
    """
    Captura na fonte oficial da ANTT/gov.br a referência do piso mínimo de frete (Portaria SUROC).
    Caso a conexão externa falhe ou haja bloqueio temporário, utiliza a portaria vigente homologada.
    """
    dados_padrao = {
        "valor": 7.33,
        "ato_oficial": "Portaria SUROC nº 22",
        "vigencia": "30/09/2026",
        "base_calculo_anp": "20 a 26 de setembro de 2026"
    }
    
    try:
        req = urllib.request.Request(
            URL_ANTT_NOTICIAS, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            html = resp.read().decode('utf-8', errors='ignore')
            
            # Busca padrões de menção a portaria da SUROC e valores de diesel
            padrao_portaria = re.search(r'Portaria\s+SUROC\s+n[ºo°]?\s*(\d+)', html, re.IGNORECASE)
            padrao_preco = re.search(r'R\$\s*(\d+[\.,]\d{2})\s*(?:por\s+litro|/l)?', html, re.IGNORECASE)
            padrao_vigencia = re.search(r'vig[êe]ncia\s+a\s+partir\s+de\s+(\d{2}/\d{2}/\d{4})', html, re.IGNORECASE)
            
            if padrao_preco and padrao_portaria:
                preco_val = float(padrao_preco.group(1).replace(',', '.'))
                num_portaria = padrao_portaria.group(1)
                vig = padrao_vigencia.group(1) if padrao_vigencia else dados_padrao["vigencia"]
                
                return {
                    "valor": preco_val,
                    "ato_oficial": f"Portaria SUROC nº {num_portaria}",
                    "vigencia": vig,
                    "base_calculo_anp": "Pesquisa Oficial ANP"
                }
    except Exception as e:
        print(f"Aviso ao consultar portal ANTT via web: {e}. Mantendo base homologada.")
        
    return dados_padrao

def atualizar_base_anp():
    print("Baixando base semanal da ANP...")
    arquivo_temp = "anp_semanal_temp.xlsx"
    urllib.request.urlretrieve(URL_SEMANAL_ESTADOS, arquivo_temp)

    print("Lendo e tratando dados de Óleo Diesel S10...")
    # Lê a planilha pulando o cabeçalho descritivo oficial da ANP
    df = pd.read_excel(arquivo_temp, skiprows=16)

    # Padroniza nomes de colunas
    df.columns = [str(c).strip().upper() for c in df.columns]

    # Filtra apenas DIESEL S10 a partir de 2026
    col_prod = [c for c in df.columns if "PRODUTO" in c][0]
    col_data_ini = [c for c in df.columns if "DATA INICIAL" in c][0]
    col_data_fim = [c for c in df.columns if "DATA FINAL" in c][0]
    col_estado = [c for c in df.columns if "ESTADO" in c][0]
    col_revenda = [c for c in df.columns if "REVENDA" in c and "PREÇO MÉDIO" in c][0]
    
    col_distribuicao = None
    for c in df.columns:
        if "DISTRIBUIÇÃO" in c and "PREÇO MÉDIO" in c:
            col_distribuicao = c
            break

    df = df[df[col_prod].astype(str).str.contains("DIESEL S10|OLEO DIESEL S10", case=False, na=False)].copy()

    # Conversão de datas
    df["DATA_INI_DT"] = pd.to_datetime(df[col_data_ini], errors='coerce')
    df["DATA_FIM_DT"] = pd.to_datetime(df[col_data_fim], errors='coerce')
    df = df[df["DATA_INI_DT"] >= "2026-01-01"].copy()

    # Competência mensal definida pela Data Inicial da coleta semanal
    df["MES_ANO"] = df["DATA_INI_DT"].dt.strftime("%Y-%m")

    # Mapeia UF
    df["UF"] = df[col_estado].astype(str).str.strip().str.upper().map(MAPA_ESTADOS)
    df = df.dropna(subset=["UF"]).copy()

    # Converte colunas numéricas
    df[col_revenda] = pd.to_numeric(df[col_revenda], errors='coerce')
    if col_distribuicao:
        df[col_distribuicao] = pd.to_numeric(df[col_distribuicao], errors='coerce')

    print("Agrupando médias mensais por UF...")
    # Agrupamento de Revenda (bomba de rua)
    grp_revenda = df.groupby(["UF", "MES_ANO"])[col_revenda].mean().reset_index()
    dict_revenda = {}
    for _, row in grp_revenda.iterrows():
        uf = row["UF"]
        mes = row["MES_ANO"]
        val = row[col_revenda]
        if pd.notnull(val):
            if uf not in dict_revenda:
                dict_revenda[uf] = {}
            dict_revenda[uf][mes] = round(float(val), 3)

    # Agrupamento de Distribuição (atacado / garagem)
    dict_distribuicao = {}
    if col_distribuicao:
        grp_dist = df.groupby(["UF", "MES_ANO"])[col_distribuicao].mean().reset_index()
        for _, row in grp_dist.iterrows():
            uf = row["UF"]
            mes = row["MES_ANO"]
            val = row[col_distribuicao]
            if pd.notnull(val):
                if uf not in dict_distribuicao:
                    dict_distribuicao[uf] = {}
                dict_distribuicao[uf][mes] = round(float(val), 3)

    # Captura a referência oficial da ANTT/Portaria SUROC
    print("Capturando valor de referência do Piso Mínimo ANTT...")
    referencia_antt = obter_referencia_antt()

    base_final = {
        "atualizacao": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
        "referencia_antt": referencia_antt,
        "revenda": dict_revenda,
        "distribuicao": dict_distribuicao
    }

    with open("anp_base.json", "w", encoding="utf-8") as f:
        json.dump(base_final, f, indent=2, ensure_ascii=False)

    print("Arquivo anp_base.json gerado com sucesso!")

    # Limpeza de arquivo temporário
    if os.path.exists(arquivo_temp):
        os.remove(arquivo_temp)

if __name__ == "__main__":
    atualizar_base_anp()
