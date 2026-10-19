import os
import io
import json
import unicodedata
import requests
import pandas as pd
from datetime import datetime

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

def extrair_distribuicao():
    print("[1/3] A descarregar base de DISTRIBUIÇÃO oficial da ANP...")
    resp = requests.get(URL_DISTRIBUICAO, headers=HEADERS, timeout=180)
    resp.raise_for_status()

    df = pd.read_excel(io.BytesIO(resp.content), skiprows=8)
    df.columns = [normalizar_texto(str(c)) for c in df.columns]

    col_data_final = next(c for c in df.columns if "DATA FINAL" in c)
    col_estado = next(c for c in df.columns if "ESTADO" in c)
    col_produto = next(c for c in df.columns if "PRODUTO" in c)
    col_preco = next(c for c in df.columns if "PRECO MEDIO" in c and "DISTRIBUICAO" in c)

    # Filtro abrangente: DIESEL + S10 (contempla ÓLEO DIESEL B S10)
    prod_upper = df[col_produto].astype(str).apply(normalizar_texto)
    eh_diesel_s10 = prod_upper.str.contains("DIESEL") & (prod_upper.str.contains("S10") | prod_upper.str.contains("S-10"))
    df = df[eh_diesel_s10].copy()

    # Padrão de data PT-BR (dayfirst=True)
    df["DATA_FINAL_DT"] = pd.to_datetime(df[col_data_final], dayfirst=True, errors="coerce")
    df = df[df["DATA_FINAL_DT"] >= DATA_CORTE].copy()

    if df.empty:
        raise ValueError("Nenhum registo de DISTRIBUIÇÃO de Diesel S10 encontrado para 2026.")

    df["UF"] = df[col_estado].apply(converter_para_uf)
    df = df.dropna(subset=["UF"]).copy()
    df[col_preco] = pd.to_numeric(df[col_preco], errors="coerce")
    df = df.dropna(subset=[col_preco]).copy()

    # Ordena rigorosamente pela data mais recente e extrai a última linha de cada UF
    df = df.sort_values(by="DATA_FINAL_DT", ascending=False)
    df_recente = df.drop_duplicates(subset=["UF"]).copy()

    resultados = []
    for _, row in df_recente.iterrows():
        resultados.append({
            "uf": row["UF"],
            "preco_medio_dist": round(float(row[col_preco]), 3),
            "data_referencia": row["DATA_FINAL_DT"].strftime("%d/%m/%Y")
        })

    print(f"-> Distribuição concluída: {len(resultados)} UFs processadas para 2026.")
    return resultados

def extrair_revenda():
    print("[2/3] A descarregar base de REVENDA oficial da ANP...")
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

    if df.empty:
        raise ValueError("Nenhum registo de REVENDA de Diesel S10 encontrado para 2026.")

    df["UF"] = df[col_estado].apply(converter_para_uf)
    df = df.dropna(subset=["UF"]).copy()
    df[col_preco] = pd.to_numeric(df[col_preco], errors="coerce")
    df = df.dropna(subset=[col_preco]).copy()

    df = df.sort_values(by="DATA_FINAL_DT", ascending=False)
    df_recente = df.drop_duplicates(subset=["UF"]).copy()

    resultados = []
    for _, row in df_recente.iterrows():
        resultados.append({
            "uf": row["UF"],
            "preco_medio": round(float(row[col_preco]), 3),
            "data_referencia": row["DATA_FINAL_DT"].strftime("%d/%m/%Y")
        })

    print(f"-> Revenda concluída: {len(resultados)} UFs processadas para 2026.")
    return resultados

def salvar_firestore(distribuicao, revenda):
    print("[3/3] A gravar bases no Firestore...")
    import firebase_admin
    from firebase_admin import credentials, firestore

    cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not cred_json:
        raise ValueError("Chave FIREBASE_SERVICE_ACCOUNT em falta.")

    cred_dict = json.loads(cred_json)
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)

    db = firestore.client()
    agora = datetime.utcnow().isoformat()

    for d in distribuicao:
        doc_data = {
            "uf": d["uf"],
            "preco_medio_dist": d["preco_medio_dist"],
            "data_referencia": d["data_referencia"],
            "atualizado_em": agora
        }
        db.collection("anp_distribuicao_uf").document(d["uf"]).set(doc_data)

    for r in revenda:
        doc_data = {
            "uf": r["uf"],
            "preco_medio": r["preco_medio"],
            "data_referencia": r["data_referencia"],
            "atualizado_em": agora
        }
        db.collection("anp_revenda_uf").document(r["uf"]).set(doc_data)

    print("Carga da ANP concluída com sucesso no Firestore.")

if __name__ == "__main__":
    dist = extrair_distribuicao()
    rev = extrair_revenda()
    salvar_firestore(dist, rev)
