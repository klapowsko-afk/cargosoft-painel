def extrair_distribuicao():
    print("[1/3] Baixando base de DISTRIBUIÇÃO oficial da ANP...")
    resp = requests.get(URL_DISTRIBUICAO, headers=HEADERS, timeout=180)
    resp.raise_for_status()

    # Cabeçalho real na linha 9 (skiprows=8)
    df = pd.read_excel(io.BytesIO(resp.content), skiprows=8)
    df.columns = [normalizar_texto(str(c)) for c in df.columns]

    col_data_final = next(c for c in df.columns if "DATA FINAL" in c)
    col_estado = next(c for c in df.columns if "ESTADO" in c)
    col_produto = next(c for c in df.columns if "PRODUTO" in c)
    col_preco = next(c for c in df.columns if "PRECO MEDIO" in c and "DISTRIBUICAO" in c)

    # 1. Busca ampla: tudo que tem DIESEL e S10
    prod_upper = df[col_produto].astype(str).apply(normalizar_texto)
    eh_diesel_s10 = prod_upper.str.contains("DIESEL") & (prod_upper.str.contains("S10") | prod_upper.str.contains("S-10"))
    df = df[eh_diesel_s10].copy()

    # 2. Conversão de data respeitando o padrão brasileiro DD/MM/AAAA (dayfirst=True)
    df["DATA_FINAL_DT"] = pd.to_datetime(df[col_data_final], dayfirst=True, errors="coerce")
    
    # Filtro de 2026
    df = df[df["DATA_FINAL_DT"] >= DATA_CORTE].copy()

    if df.empty:
        raise ValueError("Nenhum registro de DISTRIBUIÇÃO de Diesel S10 encontrado para 2026.")

    # 3. Conversão de Estado para UF
    df["UF"] = df[col_estado].apply(converter_para_uf)
    df = df.dropna(subset=["UF"]).copy()
    df[col_preco] = pd.to_numeric(df[col_preco], errors="coerce")
    df = df.dropna(subset=[col_preco]).copy()

    # 4. Seleciona a data mais recente por UF
    df = df.sort_values(by="DATA_FINAL_DT", ascending=False)
    df_recente = df.drop_duplicates(subset=["UF"]).copy()

    resultados = []
    for _, row in df_recente.iterrows():
        resultados.append({
            "uf": row["UF"],
            "preco_medio_dist": round(float(row[col_preco]), 3),
            "data_referencia": row["DATA_FINAL_DT"].strftime("%Y-%m-%d")
        })

    print(f"-> Distribuição carregada: {len(resultados)} UFs encontradas em 2026.")
    return resultados
