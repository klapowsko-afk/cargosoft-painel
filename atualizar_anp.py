import os
import io
import json
import requests
import pandas as pd
from datetime import datetime

# URLs Oficiais dos Dados Abertos da ANP (Série Histórica e Semanal)
URL_REVENDA = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsas/ca/ca-ultimas-4-semanas.csv"
URL_DISTRIBUICAO = "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/shpc/dsat/ca/ca-distribuicao-ultimas-4-semanas.csv"

def sanitizar_decimal(val):
    if pd.isna(val):
        return None
    val_str = str(val).strip().replace('.', '').replace(',', '.')
    try:
        return float(val_str)
    except ValueError:
        return None

def baixar_e_filtrar_revenda():
    print("[1/4] Baixando base de REVENDA da ANP...")
    headers = {"User-Agent": "Mozilla/5.0"}
    resp = requests.get(URL_REVENDA, headers=headers, timeout=120)
    resp.raise_for_status()

    # Leitura com detecção de separador (ANP alterna entre ';' e ',')
    df = pd.read_csv(io.StringIO(resp.text), sep=None, engine='python', encoding='utf-8-sig')

    # Normalizar nomes de colunas
    df.columns = [c.strip().upper() for c in df.columns]

    # Identificar colunas essenciais
    col_prod = next(c for c in df.columns if 'PRODUTO' in c)
    col_uf = next(c for c in df.columns if 'ESTADO' in c or 'UF' in c)
    col_mun = next(c for c in df.columns if 'MUNICIPIO' in c)
    col_valor = next(c for c in df.columns if 'VENDA' in c and 'VALOR' in c)

    # Filtrar exclusivamente DIESEL S10
    df_s10 = df[df[col_prod].astype(str).str.contains('DIESEL S10', case=False, na=False)].copy()
    df_s10['VALOR_NUM'] = df_s10[col_valor].apply(sanitizar_decimal)
    df_s10 = df_s10.dropna(subset=['VALOR_NUM'])

    # 1. Agregação por UF
    revenda_uf = df_s10.groupby(col_uf)['VALOR_NUM'].agg(
        preco_medio='mean',
        preco_min='min',
        preco_max='max',
        amostras='count'
    ).round(3).reset_index()
    revenda_uf.rename(columns={col_uf: 'uf'}, inplace=True)

    # 2. Agregação por Município
    revenda_mun = df_s10.groupby([col_uf, col_mun])['VALOR_NUM'].agg(
        preco_medio='mean',
        preco_min='min',
        preco_max='max',
        amostras='count'
    ).round(3).reset_index()
    revenda_mun.rename(columns={col_uf: 'uf', col_mun: 'municipio'}, inplace=True)

    print(f"-> Revenda processada: {len(revenda_uf)} UFs e {len(revenda_mun)} Municípios.")
    return revenda_uf.to_dict(orient='records'), revenda_mun.to_dict(orient='records')

def baixar_e_filtrar_distribuicao():
    print("[2/4] Baixando base de DISTRIBUIÇÃO da ANP...")
    headers = {"User-Agent": "Mozilla/5.0"}
    try:
        resp = requests.get(URL_DISTRIBUICAO, headers=headers, timeout=120)
        resp.raise_for_status()
        df = pd.read_csv(io.StringIO(resp.text), sep=None, engine='python', encoding='utf-8-sig')
        df.columns = [c.strip().upper() for c in df.columns]

        col_prod = next(c for c in df.columns if 'PRODUTO' in c)
        col_uf = next(c for c in df.columns if 'ESTADO' in c or 'UF' in c)
        col_valor = next(c for c in df.columns if 'VALOR' in c or 'PRECO' in c)

        df_s10 = df[df[col_prod].astype(str).str.contains('DIESEL S10', case=False, na=False)].copy()
        df_s10['VALOR_NUM'] = df_s10[col_valor].apply(sanitizar_decimal)
        df_s10 = df_s10.dropna(subset=['VALOR_NUM'])

        dist_uf = df_s10.groupby(col_uf)['VALOR_NUM'].agg(
            preco_medio_dist='mean',
            preco_min_dist='min',
            preco_max_dist='max',
            amostras='count'
        ).round(3).reset_index()
        dist_uf.rename(columns={col_uf: 'uf'}, inplace=True)
        print(f"-> Distribuição processada: {len(dist_uf)} UFs.")
        return dist_uf.to_dict(orient='records')
    except Exception as e:
        print(f"Aviso Distribuição (usando fallback se necessário): {e}")
        return []

def salvar_no_firestore(dados_rev_uf, dados_rev_mun, dados_dist_uf):
    print("[3/4] Gravando dados tratados no Firebase Firestore...")
    import firebase_admin
    from firebase_admin import credentials, firestore

    # Credenciais do Firebase lidas da variável de ambiente no GitHub Secrets
    cred_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not cred_json:
        raise ValueError("Chave FIREBASE_SERVICE_ACCOUNT não encontrada no ambiente.")

    cred_dict = json.loads(cred_json)
    if not firebase_admin._apps:
        cred = credentials.Certificate(cred_dict)
        firebase_admin.initialize_app(cred)

    db = firestore.client()

    agora = datetime.utcnow().isoformat()

    # Salva Revenda por UF
    for r in dados_rev_uf:
        doc_ref = db.collection("anp_revenda_uf").document(r['uf'])
        r['atualizado_em'] = agora
        doc_ref.set(r)

    # Salva Revenda por Município
    for m in dados_rev_mun:
        doc_id = f"{m['uf']}_{m['municipio'].replace(' ', '_').upper()}"
        doc_ref = db.collection("anp_revenda_municipio").document(doc_id)
        m['atualizado_em'] = agora
        doc_ref.set(m)

    # Salva Distribuição por UF
    for d in dados_dist_uf:
        doc_ref = db.collection("anp_distribuicao_uf").document(d['uf'])
        d['atualizado_em'] = agora
        doc_ref.set(d)

    print("[4/4] Carga das bases da ANP concluída com sucesso no Firestore!")

if __name__ == "__main__":
    rev_uf, rev_mun = baixar_e_filtrar_revenda()
    dist_uf = baixar_e_filtrar_distribuicao()
    salvar_no_firestore(rev_uf, rev_mun, dist_uf)
