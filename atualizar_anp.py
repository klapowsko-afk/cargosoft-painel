import re
import urllib3
import requests
from bs4 import BeautifulSoup

# Desativa avisos de SSL se o certificado da ANTT estiver instável no ambiente
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Inicializa a sessão para manter e persistir os cookies gerados pelo servidor
session = requests.Session()
session.headers.update({
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
})

# Base URL oficial do ANTTlegis
BASE_URL = "https://anttlegis.antt.gov.br/action/"

# 1. ETAPA DE BUSCA: Acessa o portal de atos para herdar a sessão e cookies vigentes
url_busca = (
    "https://anttlegis.antt.gov.br/action/ActionDatalegis.php"
    "?acao=pesquisarAto&cod_modulo=623&cod_menu=9230"
)

print("Acessando portal de busca para estabelecer sessão...")
response_busca = session.get(url_busca, verify=False, timeout=20)
response_busca.raise_for_status()

# 2. CAPTURA DINÂMICA DA PORTARIA MAIS RECENTE
soup_busca = BeautifulSoup(response_busca.content, "html.parser")
links_atos = soup_busca.find_all("a", href=re.compile(r"acao=abrirTextoAto.*tipo=POR.*valorAno=2026"))

url_ato_vigente = None
if links_atos:
    href = links_atos[0]['href']
    url_ato_vigente = href if href.startswith("http") else BASE_URL + href
    print(f"Portaria mais recente detectada dinamicamente: {url_ato_vigente}")
else:
    print("Não foi possível localizar portarias recentes na página de busca.")
    url_ato_vigente = (
        "https://anttlegis.antt.gov.br/action/ActionDatalegis.php"
        "?acao=abrirTextoAto&tipo=POR&numeroAto=00000022&seqAto=ATT&valorAno=2026&orgao=SUROC/ANTT/MT&cod_modulo=623&cod_menu=9230"
    )

# 3. EXTRAÇÃO DOS DADOS USANDO A SESSÃO ATIVA
print("Buscando o texto integral da portaria ativa...")
response_ato = session.get(url_ato_vigente, verify=False, timeout=20)
response_ato.raise_for_status()

soup_ato = BeautifulSoup(response_ato.content, "html.parser")
texto_completo = soup_ato.get_text()

# Localiza o bloco de parâmetros de combustível (Pcomb)
padrao_bloco = r"Pcomb.*?(?=(?:XIX|\n\n|$))"
match_bloco = re.search(padrao_bloco, texto_completo, re.DOTALL | re.IGNORECASE)

if match_bloco:
    bloco_pcomb = match_bloco.group(0)

    # Extrai o Preço do Diesel (ex: 7,33)
    preco_match = re.search(r"R\$\s*([\d,]+)", bloco_pcomb)
    preco_diesel = float(preco_match.group(1).replace(',', '.')) if preco_match else None

    # Extrai o Ato que deu a última redação
    portaria_match = re.search(r"(PORTARIA\s+SUROC\s+N[º°\s]*\d+)", bloco_pcomb, re.IGNORECASE)
    portaria = portaria_match.group(1).strip() if portaria_match else None

    # Extrai a Data da publicação ou atualização citada no trecho
    data_match = re.search(r"DE\s+(\d{1,2}\s+DE\s+[A-ZÇ]+\s+DE\s+\d{4})", bloco_pcomb, re.IGNORECASE)
    data_atualizacao = data_match.group(1).strip() if data_match else None

    resultado = {
        "preco_diesel": preco_diesel,
        "portaria": portaria,
        "data_atualizacao": data_atualizacao
    }

    print("\n[SUCESSO] Dados capturados:")
    print(resultado)
else:
    print("\n[ERRO] Item XVIII (Pcomb) não foi encontrado no texto desta portaria.")
