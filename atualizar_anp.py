import os
import io
import json
import requests
import pandas as pd
from datetime import datetime

URL_DISTRIBUICAO = "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/pdc/semanal/combustiveis-liquidos-estados.xlsx"
URL_REVENDA = "https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/precos-revenda-e-de-distribuicao-combustiveis/shlp/semanal/semanal-estados-desde-2013.xlsx"

HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}

def extrair_revenda_oficial():
    print("[1/3] Baixando planilha oficial de REVENDA (.xlsx)...")
    resp = requests.get(URL_REVENDA, headers=HEADERS, timeout=180)
    resp.raise_for_status()

    # Leitura do Excel da ANP
    excel_bytes = io.BytesIO(resp.content)
    df = pd.read_excel(excel_bytes, skiprows=14)
    df.columns = [str(c).strip().upper() for c in df.columns]

    col_prod = next(c for c in df.columns if 'PRODUTO' in c)
    col_uf = next(c for c in df.columns if 'ESTADO' in c or 'UF' in c)
    col_valor = next(c for c in df.columns if 'MÉDIO' in c or 'MEDIO' in c or 'VALOR' in c)
    col_data_final = next((c for c in df.columns if 'FINAL' in c or 'DATA' in c), None)

    # Filtra estritamente DIESEL S10
    df_s10 = df[df[col_prod].astype(str).str.contains('DIESEL S10', case=False, na=False)].copy()
    
    # Converte coluna de data se presente
    if col_data_final:
        df_s10['DATA_F'] = pd.to_datetime(df_s10[col_data_final], errors='coerce')
        # Pega a semana mais recente disponível para cada UF
        df_s10 = df_s10.sort_values(by='DATA_F', ascending=False)
        df_s10 = df_s10.drop_duplicates(subset=[col_uf])

    df_s10[col_valor] = pd.to_numeric(df_s10[col_valor], errors='coerce')
    df_s10 = df_s10.dropna(subset=[col_valor])

    resultado = []
    for _, row in df_s10.iterrows():
        uf = str(row[col_uf]).strip().upper()
        if len(uf) == 2:
            resultado.append({
                "uf": uf,
                "preco_medio": round(float(row[col_valor]), 3),
                "data_referencia": str(row.get('DATA_F', ''))[:10]
            })

    print(f"-> Revenda lida: {len(resultado)} UFs obtidas da planilha oficial.")
    return resultado

def extrair_distribuicao_oficial():
    print("[2/3] Baixando planilha oficial de DISTRIBUIÇÃO (.xlsx)...")
    resp = requests.get(URL_DISTRIBUICAO, headers=HEADERS, timeout=180)
    resp.raise_for_status()

    excel_bytes = io.BytesIO(resp.content)
    # Planilha de distribuição costuma ter cabeçalho nas primeiras linhas
    df = pd.read_excel(excel_bytes)
    
    # Encontra a linha de cabeçalho real
    for idx, row in df.iloc[:20].iterrows():
        linha_txt = " ".join([str(v).upper() for v in row.values])
        if "PRODUTO" in linha_txt and ("ESTADO" in linha_txt or "UF" in linha_txt):
            df = pd.read_excel(excel_bytes, skiprows=idx + 1)
            break

    df.columns = [str(c).strip().upper() for c in df.columns]

    col_prod = next((c for c in df.columns if 'PRODUTO' in c), None)
    col_uf = next((c for c in df.columns if 'ESTADO' in c or 'UF' in c), None)
    col_valor = next((c for c in df.columns if 'PREÇO' in c or 'PRECO' in c or 'MÉDIO' in c or 'MEDIO' in c), None)
    col_data = next((c for c in df.columns if 'DATA' in c or 'SEMANA' in c), None)

    if not col_prod or not col_uf or not col_valor:
        raise ValueError(f"Estrutura inesperada na planilha de Distribuição: {df.columns.tolist()}")

    df_s10 = df[df[col_prod].astype(str).str.contains('DIESEL S10', case=False, na=False)].copy()
    df_s10[col_valor] = pd.to_numeric(df_s10[col_valor], errors='coerce')
    df_s10 = df_s10.dropna(subset=[col_valor])

    resultado = []
    for _, row in df_s10.iterrows():
        uf = str(row[col_uf]).strip().upper()
        if len(uf) == 2:
            resultado.append({
                "uf": uf,
                "preco_medio_dist": round(float(row[col_valor]), 3),
                "data_referencia": str(row.get(col_data, ''))[:10]
            })

    print(f"-> Distribuição lida: {len(resultado)} UFs obtidas da planilha oficial.")
    return resultado

def salvar_firestore(revenda, distribuicao):
    print("[3/3] Gravando no Firebase Firestore...")
    import firebase_admin
    from firebase_admin import credentials, firestore

    cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not cred_json:
        raise ValueError("Chave FIREBASE_SERVICE_ACCOUNT não encontrada.")

    cred_dict = json.loads(cred_json)
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)

    db = firestore.client()
    agora = datetime.utcnow().isoformat()

    for r in revenda:
        r['atualizado_em'] = agora
        db.collection("anp_revenda_uf").document(r['uf']).set(r)

    for d in distribuicao:
        d['atualizado_em'] = agora
        db.collection("anp_distribuicao_uf").document(d['uf']).set(d)

    print("Carga oficial da ANP concluída com sucesso absoluto!")

if __name__ == "__main__":
    rev = extrair_revenda_oficial()
    dist = extrair_distribuicao_oficial()
    salvar_firestore(rev, dist)
