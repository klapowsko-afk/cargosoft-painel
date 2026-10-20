import io
import json
import os
import unicodedata
from datetime import datetime
import pandas as pd
import requests

URL_DISTRIBUICAO = "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/pdc/semanal/combustiveis-liquidos-estados.xlsx"
URL_REVENDA = "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/semanal/semanal-estados-desde-2013.xlsx"

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
DATA_CORTE = pd.to_datetime("2026-01-01")

MAPA_ESTADOS_UF = {
    "ACRE": "AC", "ALAGOAS": "AL", "AMAPA": "AP", "AMAZONAS": "AM",
    "BAHIA": "BA", "CEARA": "CE", "DISTRITO FEDERAL": "DF", "ESPIRITO SANTO": "ES",
    "GOIAS": "GO", "MARANHAO": "MA", "MATO GROSSO": "MT", "MATO GROSSO DO SUL": "MS",
    "MINAS GERAIS": "MG", "PARA": "PA", "PARAIBA": "PB", "PARANA": "PR",
    "PERNAMBUCO": "PE", "PIAUI": "PI", "RIO DE JANEIRO": "RJ", "RIO GRANDE DO NORTE": "RN",
    "RIO GRANDE DO SUL": "RS", "RONDONIA": "RO", "RORAIMA": "RR", "SANTA CATARINA": "SC",
    "SAO PAULO": "SP", "SERGIPE": "SE", "TOCANTINS": "TO"
}

def normalizar_texto(texto):
    if not isinstance(texto, str):
        return ""
    texto = unicodedata.normalize('NFKD', texto).encode('ASCII', 'ignore').decode('ASCII')
    return texto.strip().upper()

def converter_para_uf(nome_estado):
    normalizado = normalizar_texto(nome_estado)
    return MAPA_ESTADOS_UF.get(normalizado, None)

def processar_distribuicao():
    print("[1/3] A descarregar e consolidar base de DISTRIBUIÇÃO oficial da ANP...")
    resp = requests.get(URL_DISTRIBUICAO, headers=HEADERS, timeout=180)
    resp.raise_for_status()

    df = pd.read_excel(io.BytesIO(resp.content), skiprows=8)
    df.columns = [normalizar_texto(str(c)) for c in df.columns]

    col_data_final = next(c for c in df.columns if "DATA FINAL" in c)
    col_estado = next(c for c in df.columns if "ESTADO" in c)
    col_produto = next(c for c in df.columns if "PRODUTO" in c)
    col_preco = next(c for c in df.columns if "PRECO MEDIO" in c and "DISTRIBUICAO" in c)

    prod_upper = df[col_produto].astype(str).apply(normalizar_texto)
    eh_diesel_s10 = prod_upper.str.contains("DIESEL") & (prod_upper.str.contains("S10") | prod_upper.str.contains("S-10"))
    df = df[eh_diesel_s10].copy()

    df["DATA_FINAL_DT"] = pd.to_datetime(df[col_data_final], dayfirst=True, errors="coerce")
    df = df[df["DATA_FINAL_DT"] >= DATA_CORTE].copy()

    df["UF"] = df[col_estado].apply(converter_para_uf)
    df = df.dropna(subset=["UF"]).copy()
    df[col_preco] = pd.to_numeric(df[col_preco], errors="coerce")
    df = df.dropna(subset=[col_preco]).copy()

    # Cria competência YYYY-MM
    df["MES_ANO"] = df["DATA_FINAL_DT"].dt.strftime("%Y-%m")

    # Média mensal exata por UF (equivalente ao AVERAGE do Power BI)
    df_mensal = df.groupby(["UF", "MES_ANO"])[col_preco].mean().reset_index()

    mapa_dist = {}
    for _, row in df_mensal.iterrows():
        uf = row["UF"]
        mes = row["MES_ANO"]
        preco = round(float(row[col_preco]), 3)
        if uf not in mapa_dist:
            mapa_dist[uf] = {}
        mapa_dist[uf][mes] = preco

    print(f"-> Distribuição concluída: {len(mapa_dist)} UFs processadas com médias mensais.")
    return mapa_dist

def processar_revenda():
    print("[2/3] A descarregar e consolidar base de REVENDA oficial da ANP...")
    resp = requests.get(URL_REVENDA, headers=HEADERS, timeout=180)
    resp.raise_for_status()

    df = pd.read_excel(
        io.BytesIO(resp.content),
        sheet_name="ESTADOS - DESDE 30.12.2012",
        skiprows=17
    )
    df.columns = [normalizar_texto(str(c)) for c in df.columns]

    col_data_final = next(c for c in df.columns if "DATA FINAL" in c)
    col_estado = next(c for c in df.columns if "ESTADO" in c)
    col_produto = next(c for c in df.columns if "PRODUTO" in c)
    col_preco = next(c for c in df.columns if "PRECO MEDIO" in c and "REVENDA" in c)

    prod_upper = df[col_produto].astype(str).apply(normalizar_texto)
    eh_diesel_s10 = prod_upper.str.contains("DIESEL") & (prod_upper.str.contains("S10") | prod_upper.str.contains("S-10"))
    df = df[eh_diesel_s10].copy()

    df["DATA_FINAL_DT"] = pd.to_datetime(df[col_data_final], dayfirst=True, errors="coerce")
    df = df[df["DATA_FINAL_DT"] >= DATA_CORTE].copy()

    df["UF"] = df[col_estado].apply(converter_para_uf)
    df = df.dropna(subset=["UF"]).copy()
    df[col_preco] = pd.to_numeric(df[col_preco], errors="coerce")
    df = df.dropna(subset=[col_preco]).copy()

    df["MES_ANO"] = df["DATA_FINAL_DT"].dt.strftime("%Y-%m")

    # Média mensal por UF
    df_mensal = df.groupby(["UF", "MES_ANO"])[col_preco].mean().reset_index()

    mapa_rev = {}
    for _, row in df_mensal.iterrows():
        uf = row["UF"]
        mes = row["MES_ANO"]
        preco = round(float(row[col_preco]), 3)
        if uf not in mapa_rev:
            mapa_rev[uf] = {}
        mapa_rev[uf][mes] = preco

    print(f"-> Revenda concluída: {len(mapa_rev)} UFs processadas com médias mensais.")
    return mapa_rev

def salvar_base_local_e_firestore(distribuicao, revenda):
    print("[3/3] A gerar anp_base.json e atualizar Firestore...")
    
    dados_completos = {
        "atualizado_em": datetime.utcnow().isoformat(),
        "distribuicao": distribuicao,
        "revenda": revenda
    }

    # 1. Salva o arquivo anp_base.json localmente para consumo direto do front-end
    with open("anp_base.json", "w", encoding="utf-8") as f:
        json.dump(dados_completos, f, indent=2, ensure_ascii=False)
    print("-> Arquivo 'anp_base.json' gerado com sucesso!")

    # 2. Se houver credenciais do Firestore, sincroniza também no banco em nuvem
    cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if cred_json:
        try:
            import firebase_admin
            from firebase_admin import credentials, firestore

            cred_dict = json.loads(cred_json)
            if not firebase_admin._apps:
                cred = credentials.Certificate(cred_dict)
                firebase_admin.initialize_app(cred)

            db = firestore.client()
            db.collection("anp_consolidada").document("mensal_2026").set(dados_completos)
            print("-> Dados sincronizados no Firestore com sucesso!")
        except Exception as e:
            print(f"Aviso Firestore: {e}")

if __name__ == "__main__":
    mapa_dist = processar_distribuicao()
    mapa_rev = processar_revenda()
    salvar_base_local_e_firestore(mapa_dist, mapa_rev)
