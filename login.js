/* ==========================================================================
   LÓGICA E INJEÇÃO VISUAL DO LOGIN - VOCTT
   ========================================================================== */

(function () {
  // 1. Injeta o HTML da tela de bloqueio e do card VOCTT no corpo da página
  const telaLoginHtml = `
    <div id="telaBloqueioLogin">
      <div class="card-login-voctt text-center">
        <img src="logo_voctt.png" alt="VOCTT" class="brand-logo-central">
        
        <div class="login-titulo-marca">VOCTT</div>
        <div class="login-subtitulo-marca">Fuel Intelligence Suite</div>

        <div id="msgErroLogin"></div>

        <form id="formAcessoVoctt" onsubmit="executarLoginVoctt(event)">
          <div class="form-floating-custom">
            <label for="campoEmailVoctt">E-mail Corporativo</label>
            <input type="email" id="campoEmailVoctt" class="input-login-voctt" placeholder="seu.email@empresa.com.br" required autocomplete="username">
          </div>

          <div class="form-floating-custom">
            <label for="campoSenhaVoctt">Chave de Acesso / Senha</label>
            <input type="password" id="campoSenhaVoctt" class="input-login-voctt" placeholder="••••••••••••" required autocomplete="current-password">
          </div>

          <button type="submit" id="btnSubmeterLogin" class="btn-login-entrar">
            <span id="txtBtnLogin"><i class="bi bi-shield-lock me-1"></i> Acessar Ambiente</span>
            <span id="spinnerBtnLogin" class="spinner-border spinner-border-sm ms-1" style="display: none;" role="status"></span>
          </button>
        </form>

        <div class="login-rodape-privacidade">
          <i class="bi bi-lock-fill me-1"></i> Plataforma Exclusiva &bull; Ambiente Seguro Auditado<br>
          VOCTT Inteligência & Consultoria de Frotas &copy; 2026
        </div>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('afterbegin', telaLoginHtml);

  // Oculta a área de conteúdo do dashboard enquanto não autenticado
  const containerDashboard = document.querySelector('.container-fluid');
  if (containerDashboard) {
    containerDashboard.style.display = 'none';
  }
})();

// 2. Manipulação de submissão do formulário
function executarLoginVoctt(event) {
  event.preventDefault();

  const email = document.getElementById('campoEmailVoctt').value.trim();
  const senha = document.getElementById('campoSenhaVoctt').value.trim();
  const boxErro = document.getElementById('msgErroLogin');
  const btn = document.getElementById('btnSubmeterLogin');
  const txtBtn = document.getElementById('txtBtnLogin');
  const spinnerBtn = document.getElementById('spinnerBtnLogin');

  boxErro.style.display = 'none';
  btn.disabled = true;
  txtBtn.innerText = "Autenticando...";
  spinnerBtn.style.display = 'inline-block';

  // Chamada de autenticação (Próxima etapa: conectar com auth do Firebase)
  // Estrutura pronta de validação
  setTimeout(() => {
    if (email && senha) {
      liberarAcessoDashboard(email);
    } else {
      exibirErroLogin("Por favor, preencha todos os campos.");
      btn.disabled = false;
      txtBtn.innerHTML = `<i class="bi bi-shield-lock me-1"></i> Acessar Ambiente`;
      spinnerBtn.style.display = 'none';
    }
  }, 600);
}

function exibirErroLogin(texto) {
  const boxErro = document.getElementById('msgErroLogin');
  boxErro.innerText = texto;
  boxErro.style.display = 'block';
}

function liberarAcessoDashboard(emailUsuario) {
  const tela = document.getElementById('telaBloqueioLogin');
  const containerDashboard = document.querySelector('.container-fluid');

  if (tela) {
    tela.style.opacity = '0';
    setTimeout(() => {
      tela.remove();
      if (containerDashboard) {
        containerDashboard.style.display = 'block';
      }
      // Se a função carregarDados existir, dispara o carregamento
      if (typeof carregarDados === 'function') {
        carregarDados();
      }
    }, 400);
  }
}
