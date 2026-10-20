import os
import re
import json
import urllib.request
from bs4 import BeautifulSoup
import pandas as pd

# 1. Base Oficial de Preços de Revenda (Bomba de Rua)
URL_REVENDA_ESTADOS = "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/semanal/semanal-estados-desde-2013.xlsx"

# 2. Base Oficial de Preços de Distribuição (Atacado - PDC / i-SIMP)
URL_DISTRIBUICAO_ESTADOS = "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/pdc/semanal/combustiveis-liquidos-estados.xlsx"

# Páginas oficiais de notícias da ANTT para varredura dinâmica (mais recente sempre no topo)
PAGINAS_ANTT_BUSCA = [
    "https://www.gov.br/antt/pt-br/assuntos/ultimas-noticias",
    "https://www.gov.br/antt/pt-br/assuntos/ultimas-noticias?b_start:int=30",
    "https://www.gov.br/antt/pt-br/assuntos/noticias-defeso-eleitoral",
    "https://www.gov.br/antt/pt-br/assuntos/noticias-defeso-eleitoral?b_start:int=30",
]

MAPA_ESTADOS = {
    "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM", "BAHIA": "BA",
    "CEARA": "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES", "GOIAS": "GO",
    "MARANHAO": "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS", "MINAS GERAIS": "MG",
    "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR", "PERNAMBUCO": "PE", "PIAUI": "PI",
    "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN", "RIO GRANDE DO SUL": "RS",
    "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC", "SAO PAULO": "SP",
    "SERGIPE": "SE", "TOCANTINS": "TO"
}

def obter_html(url):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
    }
    req = urllib.request.Request(url, headers=headers)
    with urllib.request.urlopen(req, timeout=15) as resp:
        return resp.read().decode('utf-8', errors='ignore')

def obter_referencia_antt():
    """
    Varre dinamicamente o portal de notícias da ANTT, encontra a matéria mais recente
    sobre piso mínimo e diesel, abre a notícia e extrai Portaria, valor e vigência.
    """
    print("\n--- Varrendo Portal da ANTT por Publicação Recente ---")
    link_materia_encontrada = None

    for url_listagem in PAGINAS_ANTT_BUSCA:
        try:
            print(f"Buscando em: {url_listagem}")
            html_listagem = obter_html(url_listagem)
            soup = BeautifulSoup(html_listagem, 'html.parser')

            # Varre todos os links procurando termos de frete/piso mínimo e diesel no texto ou título
            for a in soup.find_all('a', href=True):
                texto = a.get_text().strip().lower()
                href = a['href']

                # Verifica se o link é uma matéria relevante
                if ("piso" in texto or "frete" in texto) and "diesel" in texto:
                    if href.startswith('http'):
                        link_materia_encontrada = href
                    else:
                        link_materia_encontrada = "https://www.gov.br" + (href if href.startswith('/') else '/' + href)
                    print(f"Matéria mais recente detectada: {link_materia_encontrada}")
                    break

            if link_materia_encontrada:
                break
        except Exception as e:
            print(f"Falha ao consultar listagem {url_listagem}: {e}")
            continue

    if not link_materia_encontrada:
        print("ERRO: Nenhuma matéria de piso mínimo/diesel encontrada nas páginas da ANTT.")
        return {
            "status": "erro",
            "valor": None,
            "ato_oficial": "Não localizado",
            "vigencia": None,
            "base_calculo_anp": None
        }

    # Acessa a notícia detectada dinamicamente
    try:
        html_noticia = obter_html(link_materia_encontrada)
        texto_limpo = re.sub(r'&nbsp;|\s+', ' ', html_noticia)

        # Extrai o valor do Diesel (ex: R$ 7,33 por litro ou R$ 7,33)
        preco_match = re.search(r'R\$\s*([\d,]+)\s*por\s*litro', texto_limpo, re.IGNORECASE)
        if not preco_match:
            preco_match = re.search(r'R\$\s*(\d+[\.,]\d{2})', texto_limpo)

        # Extrai o ato oficial (ex: Portaria SUROC nº 22)
        portaria_match = re.search(r'Portaria\s+SUROC\s+n[ºo°]?\s*(\d+)', texto_limpo, re.IGNORECASE)

        # Extrai vigência
        vigencia_match = re.search(r'(?:vigor\s+em|vig[êe]ncia\s+a\s+partir\s+de)\s+(\d{1,2}\s+de\s+[a-zA-Zç]+\s+de\s+\d{4}|\d{1,2}\s+de\s+[a-zA-Zç]+|\d{2}/\d{2}/\d{4})', texto_limpo, re.IGNORECASE)

        if preco_match:
            valor_num = float(preco_match.group(1).replace(',', '.'))
            num_portaria = f"Portaria SUROC nº {portaria_match.group(1)}" if portaria_match else "Revisão Piso Mínimo ANTT"
            vig_texto = vigencia_match.group(1) if vigencia_match else "Publicada no DOU"

            dados = {
                "status": "sucesso",
                "valor": valor_num,
                "ato_oficial": num_portaria,
                "vigencia": vig_texto,
                "base_calculo_anp": "Pesquisa Oficial ANP Semanal",
                "fonte_noticia": link_materia_encontrada
            }
            print(f"Sucesso na ANTT: {dados['ato_oficial']} - R$ {dados['valor']} (Vigência: {dados['vigencia']})")
            return dados
        else:
            print(f"ERRO: A notícia foi aberta ({link_materia_encontrada}), mas o valor em R$ não foi reconhecido.")
            return {
                "status": "erro",
                "valor": None,
                "ato_oficial": "Padrão de valor não localizado",
                "vigencia": None,
                "base_calculo_anp": None
            }
    except Exception as e:
        print(f"ERRO ao extrair texto da notícia {link_materia_encontrada}: {e}")
        return {
            "status": "erro",
            "valor": None,
            "ato_oficial": "Erro de conexão",
            "vigencia": None,
            "base_calculo_anp": None
        }

def processar_base_revenda():
    """
    Descarrega e processa a planilha de Revenda da ANP.
    """
    print("\n--- Processando Preços de Revenda (Bomba de Rua) ---")
    arquivo_revenda = "anp_revenda_temp.xlsx"
    urllib.request.urlretrieve(URL_REVENDA_ESTADOS, arquivo_revenda)

    df = pd.read_excel(arquivo_revenda, skiprows=16)
    df.columns = [str(c).strip().upper() for c in df.columns]

    col_prod = [c for c in df.columns if "PRODUTO" in c][0]
    col_data_ini = [c for c in df.columns if "DATA INICIAL" in c][0]
    col_data_fim = [c for c in df.columns if "DATA FINAL" in c][0]
    col_estado = [c for c in df.columns if "ESTADO" in c][0]
    col_preco_revenda = [c for c in df.columns if "PREÇO MÉDIO REVENDA" in c or ("REVENDA" in c and "PREÇO MÉDIO" in c)][0]

    # Filtra estritamente Óleo Diesel S10
    df = df[df[col_prod].astype(str).str.strip().str.upper().isin(["OLEO DIESEL S10", "ÓLEO DIESEL S10"])].copy()

    df["DATA_INI_DT"] = pd.to_datetime(df[col_data_ini], errors='coerce')
    df["DATA_FIM_DT"] = pd.to_datetime(df[col_data_fim], errors='coerce')
    df = df[df["DATA_INI_DT"] >= "2026-01-01"].copy()

    # Competência atribuída pela Data Inicial da semana
    df["MES_ANO"] = df["DATA_INI_DT"].dt.strftime("%Y-%m")
    df["UF"] = df[col_estado].astype(str).str.strip().str.upper().map(MAPA_ESTADOS)
    df = df.dropna(subset=["UF"]).copy()

    df[col_preco_revenda] = pd.to_numeric(df[col_preco_revenda], errors='coerce')

    grp = df.groupby(["UF", "MES_ANO"])[col_preco_revenda].mean().reset_index()
    dict_revenda = {}
    for _, row in grp.iterrows():
        uf = row["UF"]
        mes = row["MES_ANO"]
        val = row[col_preco_revenda]
        if pd.notnull(val):
            if uf not in dict_revenda:
                dict_revenda[uf] = {}
            dict_revenda[uf][mes] = round(float(val), 3)

    if os.path.exists(arquivo_revenda):
        os.remove(arquivo_revenda)

    print(f"Médias de revenda processadas para {len(dict_revenda)} estados.")
    return dict_revenda

def processar_base_distribuicao():
    """
    Descarrega e processa a planilha do PDC de Distribuição da ANP.
    """
    print("\n--- Processando Preços de Distribuição (Atacado / Tanques Próprios) ---")
    arquivo_distribuicao = "anp_distribuicao_temp.xlsx"
    urllib.request.urlretrieve(URL_DISTRIBUICAO_ESTADOS, arquivo_distribuicao)

    # Dados começam na linha 9 (skiprows=8)
    df = pd.read_excel(arquivo_distribuicao, skiprows=8)
    df.columns = [str(c).strip().upper() for c in df.columns]

    col_prod = [c for c in df.columns if "PRODUTO" in c][0]
    col_data_ini = [c for c in df.columns if "DATA INICIAL" in c][0]
    col_data_fim = [c for c in df.columns if "DATA FINAL" in c][0]
    col_estado = [c for c in df.columns if "ESTADO" in c][0]
    col_preco_dist = [c for c in df.columns if "PREÇO MÉDIO DISTRIBUIÇÃO" in c or ("DISTRIBUIÇÃO" in c and "PREÇO MÉDIO" in c)][0]

    # Filtra estritamente Óleo Diesel B S10 - Comum
    df = df[df[col_prod].astype(str).str.strip().str.upper().str.contains("DIESEL B S10", na=False)].copy()

    df["DATA_INI_DT"] = pd.to_datetime(df[col_data_ini], errors='coerce')
    df["DATA_FIM_DT"] = pd.to_datetime(df[col_data_fim], errors='coerce')
    df = df[df["DATA_INI_DT"] >= "2026-01-01"].copy()

    # Competência atribuída pela Data Inicial da semana
    df["MES_ANO"] = df["DATA_INI_DT"].dt.strftime("%Y-%m")
    df["UF"] = df[col_estado].astype(str).str.strip().str.upper().map(MAPA_ESTADOS)
    df = df.dropna(subset=["UF"]).copy()

    df[col_preco_dist] = pd.to_numeric(df[col_preco_dist], errors='coerce')

    grp = df.groupby(["UF", "MES_ANO"])[col_preco_dist].mean().reset_index()
    dict_distribuicao = {}
    for _, row in grp.iterrows():
        uf = row["UF"]
        mes = row["MES_ANO"]
        val = row[col_preco_dist]
        if pd.notnull(val):
            if uf not in dict_distribuicao:
                dict_distribuicao[uf] = {}
            dict_distribuicao[uf][mes] = round(float(val), 3)

    if os.path.exists(arquivo_distribuicao):
        os.remove(arquivo_distribuicao)

    print(f"Médias de distribuição processadas para {len(dict_distribuicao)} estados.")
    return dict_distribuicao

def atualizar_base_anp():
    dict_revenda = processar_base_revenda()
    dict_distribuicao = processar_base_distribuicao()
    referencia_antt = obter_referencia_antt()

    base_final = {
        "atualizacao": pd.Timestamp.now().strftime("%Y-%m-%d %H:%M:%S"),
        "referencia_antt": referencia_antt,
        "revenda": dict_revenda,
        "distribuicao": dict_distribuicao
    }

    with open("anp_base.json", "w", encoding="utf-8") as f:
        json.dump(base_final, f, indent=2, ensure_ascii=False)

    print("\nArquivo anp_base.json gerado com sucesso!")

if __name__ == "__main__":
    atualizar_base_anp()
