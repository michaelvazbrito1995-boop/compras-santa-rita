import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  writeBatch,
  runTransaction
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";


// LEITOR DE CÓDIGO DE BARRAS PELA CÂMERA (compatível com navegadores que oferecem BarcodeDetector)
async function abrirLeitorCodigoBarras(inputId) {
  const campo=document.getElementById(inputId);
  if(!campo)return;
  if(!navigator.mediaDevices?.getUserMedia){alert("Seu navegador não permite acessar a câmera. Digite o código manualmente.");return;}
  if(!("BarcodeDetector" in window)){alert("A leitura pela câmera não é compatível com este navegador. Tente abrir o aplicativo no Chrome atualizado ou digite o código manualmente.");return;}
  let stream=null, ativo=true, raf=0;
  const modal=document.createElement("div");
  modal.style.cssText="position:fixed;inset:0;z-index:99999;background:#000e;display:flex;align-items:center;justify-content:center;padding:18px";
  modal.innerHTML='<div style="background:white;border-radius:14px;padding:16px;width:min(100%,480px);text-align:center"><h3 style="margin:0 0 10px">Ler código de barras</h3><video autoplay playsinline muted style="width:100%;max-height:60vh;object-fit:cover;background:#111;border-radius:10px"></video><p style="font-size:13px">Aponte a câmera para o código de barras.</p><button type="button" data-fechar-leitor>FECHAR</button></div>';
  document.body.appendChild(modal);
  const video=modal.querySelector("video");
  const fechar=()=>{ativo=false;cancelAnimationFrame(raf);if(stream)stream.getTracks().forEach(t=>t.stop());modal.remove();};
  modal.querySelector("[data-fechar-leitor]").onclick=fechar;
  try{
    stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:"environment"}},audio:false});
    if(!ativo){stream.getTracks().forEach(t=>t.stop());return;}
    video.srcObject=stream;await video.play();
    const formatos=["ean_13","ean_8","upc_a","upc_e","code_128","code_39","itf","codabar","qr_code"];
    let detector;
    try{detector=new window.BarcodeDetector({formats:await window.BarcodeDetector.getSupportedFormats().then(fs=>fs.filter(f=>formatos.includes(f)))});}catch{detector=new window.BarcodeDetector();}
    const ler=async()=>{if(!ativo)return;try{if(video.readyState>=2){const codigos=await detector.detect(video);if(codigos.length&&codigos[0].rawValue){campo.value=codigos[0].rawValue;campo.dispatchEvent(new Event("input",{bubbles:true}));campo.dispatchEvent(new Event("change",{bubbles:true}));fechar();return;}}}catch(e){console.warn("Falha ao ler código:",e);}if(ativo)raf=requestAnimationFrame(ler);};
    ler();
  }catch(e){fechar();console.error(e);alert("Não foi possível abrir a câmera. Verifique a permissão de câmera e se o site está em HTTPS.");}
}
function botaoLeitor(id){return `<button type="button" class="botao-leitor-codigo" data-leitor-codigo="${id}" aria-label="Ler código de barras com a câmera">📷 Ler código</button>`;}
function ativarLeitoresCodigo(raiz=document){raiz.querySelectorAll("[data-leitor-codigo]").forEach(b=>{if(b.dataset.leitorAtivo)return;b.dataset.leitorAtivo="1";b.addEventListener("click",()=>abrirLeitorCodigoBarras(b.dataset.leitorCodigo));});}

// FIREBASE

const firebaseConfig = {
  apiKey: "AIzaSyBX9Yj8qGBvT_5N4dIcmyxNbeonuEcPzDw",
  authDomain: "compras-santa-rita.firebaseapp.com",
  projectId: "compras-santa-rita",
  storageBucket: "compras-santa-rita.firebasestorage.app",
  messagingSenderId: "340040395262",
  appId: "1:340040395262:web:ba467489d4176efdf5f8af"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// VARIÁVEIS

const container = document.querySelector(".container");

const LIMITE_PRODUTOS = 10;

let produtosCarregados = [];
let produtosEncontrados = [];
let todosProdutos = [];

let produtoEditandoId = null;
let paginaAtual = 0;
let paginaCotacoesAtual = 1;
let cotacoesAdminCache = [];
let temProximaPagina = false;

let controleSessao = 0;
let cadastroEmAndamento = false;

// Foto opcional do produto (armazenada comprimida no próprio documento).
let fotoProdutoAtual = "";

// Estado da seleção de produtos na criação de cotações.
let produtosDisponiveisCotacao = [];
let produtosSelecionadosCotacao = new Map();
let cotacaoRascunhoEditandoId = null;
let cotacaoPresencialEditandoId = null;

// FUNÇÕES GERAIS

function escaparHTML(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[caractere]);
}

function normalizarTexto(texto) {
  return String(texto ?? "")
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

function mostrarMensagem(texto, erro = false) {
  const mensagem = document.getElementById("mensagem");

  if (!mensagem) return;

  mensagem.textContent = texto;
  mensagem.style.color = erro ? "#c62828" : "#267326";
}

function mensagemNaTela(id, texto, erro = false) {
  const elemento = document.getElementById(id);

  if (!elemento) return;

  elemento.textContent = texto;
  elemento.style.color = erro ? "#c62828" : "#267326";
}

// VERIFICAR USUÁRIO

async function buscarUsuario(usuario) {
  const referencia = doc(db, "usuarios", usuario.uid);
  const resultado = await getDoc(referencia);

  if (!resultado.exists()) {
    throw new Error("Cadastro de usuário não encontrado.");
  }

  const dados = resultado.data();

  if (dados.ativo !== true) {
    throw new Error("Este usuário está bloqueado.");
  }

  if (dados.perfil !== "admin" && dados.perfil !== "fornecedor") {
    throw new Error("Perfil de usuário inválido.");
  }

  return dados;
}

// SAIR

async function sairDoSistema() {
  try {
    await signOut(auth);
  } catch (erro) {
    console.error("Erro ao sair:", erro);
    alert("Não foi possível sair. Tente novamente.");
  }
}

// TELA DE LOGIN E CADASTRO

function mostrarTelaLogin() {
  container.innerHTML = `
    <section class="login-card">

      <div id="area-login">

        <h2>Bem-vindo!</h2>

        <p>Entre com seu e-mail e senha para acessar o sistema.</p>

        <form id="login-form">

          <label for="email">E-mail</label>

          <input
            type="email"
            id="email"
            placeholder="Digite seu e-mail"
            required
          >

          <label for="senha">Senha</label>

          <input
            type="password"
            id="senha"
            placeholder="Digite sua senha"
            required
          >

          <button type="submit" id="botao-login">
            ENTRAR
          </button>

          <p id="mensagem"></p>

        </form>

        <hr style="margin:25px 0">

        <p>Ainda não tem cadastro?</p>

        <button type="button" id="mostrar-cadastro">
          CADASTRAR COMO VENDEDOR
        </button>

      </div>

      <div id="area-cadastro" style="display:none">

        <h2>Cadastro de vendedor</h2>

        <p>Crie sua conta para participar das cotações.</p>

        <form id="cadastro-form">

          <label for="cadastro-nome">Nome completo</label>

          <input
            id="cadastro-nome"
            type="text"
            placeholder="Seu nome"
            required
          >

          <label for="cadastro-telefone">Telefone / WhatsApp</label>

          <input
            id="cadastro-telefone"
            type="tel"
            placeholder="Seu telefone"
            required
          >

          <label for="cadastro-email">E-mail</label>

          <input
            id="cadastro-email"
            type="email"
            placeholder="Seu e-mail"
            required
          >

          <label for="cadastro-senha">Senha</label>

          <input
            id="cadastro-senha"
            type="password"
            placeholder="Crie uma senha"
            minlength="6"
            required
          >

          <button type="submit" id="botao-cadastro">
            CRIAR CONTA
          </button>

          <p id="mensagem-cadastro"></p>

        </form>

        <button type="button" id="voltar-login">
          VOLTAR AO LOGIN
        </button>

      </div>

    </section>
  `;

  document.getElementById("mostrar-cadastro")
    .addEventListener("click", () => {
      document.getElementById("area-login").style.display = "none";
      document.getElementById("area-cadastro").style.display = "block";
    });

  document.getElementById("voltar-login")
    .addEventListener("click", () => {
      document.getElementById("area-cadastro").style.display = "none";
      document.getElementById("area-login").style.display = "block";
    });

  // LOGIN

  document.getElementById("login-form")
    .addEventListener("submit", async evento => {
      evento.preventDefault();

      const email = document.getElementById("email").value.trim();
      const senha = document.getElementById("senha").value;
      const botao = document.getElementById("botao-login");

      mostrarMensagem("Verificando acesso...");

      botao.disabled = true;
      botao.textContent = "AGUARDE...";

      try {
        await signInWithEmailAndPassword(auth, email, senha);

      } catch (erro) {
        console.error("Erro no login:", erro);

        let texto = "Não foi possível entrar no sistema.";

        if (
          erro.code === "auth/invalid-credential" ||
          erro.code === "auth/user-not-found" ||
          erro.code === "auth/wrong-password"
        ) {
          texto = "E-mail ou senha incorretos.";

        } else if (erro.code === "auth/network-request-failed") {
          texto = "Erro de conexão. Verifique sua internet.";
        }

        mostrarMensagem(texto, true);

        botao.disabled = false;
        botao.textContent = "ENTRAR";
      }
    });

  // CADASTRO DO VENDEDOR
    document.getElementById("cadastro-form")
    .addEventListener("submit", async evento => {
      evento.preventDefault();

      const nome = document.getElementById("cadastro-nome").value.trim();
      const telefone = document.getElementById("cadastro-telefone").value.trim();
      const email = document.getElementById("cadastro-email").value.trim();
      const senha = document.getElementById("cadastro-senha").value;

      const botao = document.getElementById("botao-cadastro");

      if (!nome || !telefone || !email || !senha) {
        mensagemNaTela(
          "mensagem-cadastro",
          "Preencha todos os campos.",
          true
        );
        return;
      }

      botao.disabled = true;
      botao.textContent = "CRIANDO CONTA...";

      mensagemNaTela(
        "mensagem-cadastro",
        "Criando seu cadastro..."
      );

      cadastroEmAndamento = true;

      let contaCriada = false;

      try {
        const resultado = await createUserWithEmailAndPassword(
          auth,
          email,
          senha
        );

        contaCriada = true;

        const usuario = resultado.user;

        await setDoc(doc(db, "usuarios", usuario.uid), {
          nome,
          telefone,
          email,
          perfil: "fornecedor",
          ativo: true,
          criadoEm: serverTimestamp()
        });

        cadastroEmAndamento = false;

        const dados = {
          nome,
          telefone,
          email,
          perfil: "fornecedor",
          ativo: true
        };

        mostrarPainelFornecedor(dados, usuario.uid);

      } catch (erro) {
        console.error("Erro no cadastro:", erro);

        cadastroEmAndamento = false;

        if (contaCriada) {
          await signOut(auth);
        }

        let texto = "Não foi possível criar sua conta.";

        if (erro.code === "auth/email-already-in-use") {
          texto = "Este e-mail já está cadastrado.";

        } else if (erro.code === "auth/invalid-email") {
          texto = "Digite um e-mail válido.";

        } else if (erro.code === "auth/weak-password") {
          texto = "A senha precisa ter pelo menos 6 caracteres.";

        } else if (erro.code === "permission-denied") {
          texto = "O Firebase ainda não autorizou o cadastro. As regras precisam ser configuradas.";

        } else if (contaCriada) {
          texto = "A conta foi criada, mas não foi possível salvar o cadastro. Entre em contato com o administrador.";
        }

        mensagemNaTela("mensagem-cadastro", texto, true);

        botao.disabled = false;
        botao.textContent = "CRIAR CONTA";
      }
    });
}

// PAINEL ADMINISTRATIVO

function mostrarPainel(dados) {
  container.innerHTML = `
    <section class="painel">

      <div class="painel-topo">

        <div>
          <h2>Olá, ${escaparHTML(dados.nome || "Administrador")}!</h2>
          <p>Bem-vindo ao sistema de compras.</p>
        </div>

        <button id="sair" class="botao-sair">
          SAIR
        </button>

      </div>

      <div class="painel-titulo">
        <h2>Painel administrativo</h2>
        <p>Controle de compras do Supermercado Santa Rita.</p>
      </div>
            <div class="menu-painel">

        <button class="menu-card" data-tela="produtos">
          <span class="menu-icone">📦</span>
          <strong>Produtos</strong>
          <small>Cadastro de mercadorias</small>
        </button>

        <button class="menu-card" data-tela="fornecedores">
          <span class="menu-icone">🏢</span>
          <strong>Fornecedores</strong>
          <small>Cadastro de fornecedores</small>
        </button>

        <button class="menu-card" data-tela="cotacoes">
          <span class="menu-icone">📝</span>
          <strong>Cotações</strong>
          <small>Criar e acompanhar cotações</small>
        </button>

        <button class="menu-card" data-tela="respostas">
          <span class="menu-icone">💰</span>
          <strong>Respostas</strong>
          <small>Comparar preços recebidos</small>
        </button>

        <button class="menu-card" data-tela="usuarios">
          <span class="menu-icone">👥</span>
          <strong>Usuários</strong>
          <small>Gerenciar acessos</small>
        </button>

      </div>

      <div id="conteudo-modulo"></div>

    </section>
  `;

  document.getElementById("sair")
    .addEventListener("click", sairDoSistema);

  document.querySelectorAll(".menu-card")
    .forEach(botao => {
      botao.addEventListener("click", () => {
        abrirModulo(botao.dataset.tela);
      });
    });
}

// PAINEL DO VENDEDOR

function mostrarPainelFornecedor(dados, uid) {
  container.innerHTML = `
    <section class="painel">

      <div class="painel-topo">

        <div>
          <h2>Olá, ${escaparHTML(dados.nome || "Vendedor")}!</h2>
          <p>Área do fornecedor.</p>
        </div>

        <button id="sair" class="botao-sair">
          SAIR
        </button>

      </div>

      <div class="painel-titulo">
        <h2>Área do vendedor</h2>
        <p>Gerencie suas empresas e participe das cotações.</p>
      </div>

      <div class="modulo-aberto">

        <h3>🏢 Minhas empresas</h3>

        <p>Cadastre as empresas que você representa.</p>

        <button id="abrir-cadastro-empresa">
          + CADASTRAR EMPRESA
        </button>

        <div id="area-cadastro-empresa" style="display:none">

          <form id="form-empresa">

            <label for="nome-empresa">Nome da empresa</label>

            <input
              id="nome-empresa"
              type="text"
              placeholder="Digite o nome da empresa"
              required
            >

            <button type="submit" id="botao-salvar-empresa">
              SALVAR EMPRESA
            </button>

            <button type="button" id="cancelar-empresa">
              CANCELAR
            </button>

          </form>

          <p id="mensagem-empresa"></p>

        </div>

        <hr style="margin:25px 0">

        <h3>Empresas cadastradas</h3>

        <div id="lista-empresas">
          Carregando empresas...
        </div>

        <hr style="margin:25px 0">
        <h3>📝 Cotações recebidas</h3>
        <p>Consulte as solicitações e envie seus preços.</p>
        <div id="lista-cotacoes-fornecedor">Carregando cotações...</div>
        <div id="form-resposta-fornecedor" style="display:none;margin-top:18px"></div>

      </div>

    </section>
  `;

  document.getElementById("sair")
    .addEventListener("click", sairDoSistema);

  document.getElementById("abrir-cadastro-empresa")
    .addEventListener("click", () => {
      document.getElementById("area-cadastro-empresa")
        .style.display = "block";
    });

  document.getElementById("cancelar-empresa")
    .addEventListener("click", () => {
      document.getElementById("form-empresa").reset();

      document.getElementById("area-cadastro-empresa")
        .style.display = "none";

      mensagemNaTela("mensagem-empresa", "");
    });

  document.getElementById("form-empresa")
    .addEventListener("submit", evento => {
      cadastrarEmpresa(evento, uid);
    });

  carregarEmpresas(uid);
  carregarCotacoesFornecedor(uid);
}

// CADASTRAR EMPRESA

async function cadastrarEmpresa(evento, uid) {
  evento.preventDefault();

  const nome = document.getElementById("nome-empresa").value.trim();
  const botao = document.getElementById("botao-salvar-empresa");

  if (!nome) {
    mensagemNaTela("mensagem-empresa", "Digite o nome da empresa.", true);
    return;
  }

  botao.disabled = true;
  botao.textContent = "SALVANDO...";

  try {
    // O vendedor cadastra somente a empresa. Convites e alterações em
    // cotações são responsabilidade do administrador.
    const empresaRef = doc(collection(db, "fornecedores"));
    await setDoc(empresaRef, {
      empresa: nome,
      responsavelUid: uid,
      ativo: true,
      criadoEm: serverTimestamp()
    });

    document.getElementById("form-empresa").reset();
    document.getElementById("area-cadastro-empresa").style.display = "none";

    mensagemNaTela(
      "mensagem-empresa",
      "Empresa cadastrada com sucesso!"
    );

    await carregarEmpresas(uid);

  } catch (erro) {
    console.error("Erro ao cadastrar empresa:", erro);

    let mensagem = "Não foi possível cadastrar a empresa. Verifique as regras do Firebase.";

    if (erro.message === "LIMITE_COTACOES") {
      mensagem = "Há muitas cotações abertas para cadastrar a empresa de uma só vez.";
    } else if (erro.code === "permission-denied") {
      mensagem = "O Firebase não autorizou o cadastro. Confira se sua conta de vendedor está ativa e se as regras permitem cadastrar empresas.";
    }

    mensagemNaTela("mensagem-empresa", mensagem, true);

  } finally {
    if (botao) {
      botao.disabled = false;
      botao.textContent = "SALVAR EMPRESA";
    }
  }
}

// CARREGAR EMPRESAS DO VENDEDOR

async function carregarEmpresas(uid) {
  const lista = document.getElementById("lista-empresas");

  if (!lista) return;

  lista.textContent = "Carregando empresas...";

  try {
    const consulta = query(
      collection(db, "fornecedores"),
      where("responsavelUid", "==", uid)
    );

    const resultado = await getDocs(consulta);

    if (resultado.empty) {
      lista.innerHTML = `
        <div class="aviso-modulo">
          Você ainda não cadastrou nenhuma empresa.
        </div>
      `;
      return;
    }

    lista.innerHTML = resultado.docs.map(documento => {
      const empresa = documento.data();

      return `
        <div class="aviso-modulo">

          <strong>${escaparHTML(empresa.empresa)}</strong>

          <p>
            Situação:
            <span style="color:${empresa.ativo ? "#267326" : "#c62828"}">
              ${empresa.ativo ? "Ativa" : "Bloqueada"}
            </span>
          </p>

        </div>
      `;
    }).join("");

  } catch (erro) {
    console.error("Erro ao carregar empresas:", erro);

    lista.textContent =
      "Não foi possível carregar suas empresas.";
  }
}

// ABRIR MÓDULOS ADMINISTRATIVOS

async function abrirModulo(tela) {
  const conteudo = document.getElementById("conteudo-modulo");

  if (!conteudo) return;

  if (tela === "produtos") {
    produtoEditandoId = null;
    paginaAtual = 0;

    conteudo.innerHTML = `

      <div class="modulo-aberto">

        <h2>📦 Produtos</h2>

        <p>Gerenciamento de mercadorias do supermercado.</p>

        <button type="button" id="abrir-formulario-produto">
          + CADASTRAR PRODUTO
        </button>

        <div id="area-formulario-produto" style="display:none">

          <form id="form-produto">

            <h3 id="titulo-form-produto">Novo produto</h3>

            <label for="produto-nome">Nome do produto</label>

            <input
              id="produto-nome"
              type="text"
              placeholder="Ex.: Arroz 5kg"
              required
            >

            <label for="produto-codigo">Código de barras</label>

            <input
              id="produto-codigo"
              type="text"
              placeholder="Código de barras"
            >
            ${botaoLeitor("produto-codigo")}

            <label for="produto-departamento">Departamento</label>

            <input
              id="produto-departamento"
              type="text"
              placeholder="Ex.: Mercearia"
              required
            >

            <label for="produto-categoria">Categoria</label>

            <input
              id="produto-categoria"
              type="text"
              placeholder="Ex.: Arroz e grãos"
              required
            >

            <label for="produto-unidade">Unidade</label>

            <select id="produto-unidade" required>
              <option value="">Selecione</option>
              <option value="UN">Unidade (UN)</option>
              <option value="KG">Quilo (KG)</option>
              <option value="CX">Caixa (CX)</option>
              <option value="FD">Fardo (FD)</option>
              <option value="PCT">Pacote (PCT)</option>
              <option value="LT">Litro (LT)</option>
              <option value="ML">Mililitro (ML)</option>
              <option value="GR">Grama (GR)</option>
              <option value="SC">Saco (SC)</option>
              <option value="DZ">Dúzia (DZ)</option>
            </select>

            <label for="produto-foto">Foto de identificação (opcional)</label>

            <input
              id="produto-foto"
              type="file"
              accept="image/*"
              capture="environment"
            >

            <small style="display:block;margin:6px 0 10px;color:#666">
              Você pode tirar uma foto ou escolher uma imagem da galeria.
              A imagem será reduzida automaticamente.
            </small>

            <div id="produto-foto-preview-area" style="margin:10px 0">
              <img
                id="produto-foto-preview"
                alt="Prévia da foto do produto"
                style="display:none;width:110px;height:110px;object-fit:contain;border:1px solid #ddd;border-radius:8px;background:#fff"
                              >
              <p id="produto-foto-sem-imagem" style="color:#777;margin:5px 0">
                Nenhuma foto selecionada.
              </p>
              <button type="button" id="remover-foto-produto" style="display:none">
                REMOVER FOTO
              </button>
            </div>

            <label class="produto-status">
              <input id="produto-ativo" type="checkbox" checked>
              Produto ativo
            </label>

            <button type="submit" id="botao-salvar-produto">
              SALVAR PRODUTO
            </button>

            <button type="button" id="cancelar-edicao">
              CANCELAR
            </button>

          </form>

          <div id="mensagem-produto"></div>

        </div>

        <hr style="margin:25px 0;">

        <h3>Consultar produtos</h3>

        <label for="pesquisa-produto">
          Nome ou código de barras
        </label>

        <input
          id="pesquisa-produto"
          type="search"
          placeholder="Digite o nome ou código..."
        >

        <button type="button" id="buscar-produtos">
          PESQUISAR
        </button>

        <div id="mensagem-lista"></div>

        <div id="lista-produtos"></div>

        <div
          id="paginacao-produtos"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:15px"
        >

          <button type="button" id="pagina-anterior">
            ANTERIOR
          </button>

          <strong id="numero-pagina">Página 1</strong>

          <button type="button" id="pagina-proxima">
            PRÓXIMA
          </button>

        </div>

        <button type="button" id="voltar-painel">
          VOLTAR AO PAINEL
        </button>

      </div>
    `;

    ativarLeitoresCodigo(conteudo);

    document.getElementById("abrir-formulario-produto")
      .addEventListener("click", () => {
        limparFormularioProduto();

        document.getElementById("area-formulario-produto")
          .style.display = "block";
      });

    document.getElementById("form-produto")
      .addEventListener("submit", salvarProduto);
        document.getElementById("produto-foto")
      .addEventListener("change", selecionarFotoProduto);

    document.getElementById("remover-foto-produto")
      .addEventListener("click", removerFotoProduto);

    document.getElementById("cancelar-edicao")
      .addEventListener("click", limparFormularioProduto);

    document.getElementById("buscar-produtos")
      .addEventListener("click", pesquisarProdutos);

    document.getElementById("pesquisa-produto")
      .addEventListener("keydown", evento => {
        if (evento.key === "Enter") {
          evento.preventDefault();
          pesquisarProdutos();
        }
      });

    document.getElementById("pesquisa-produto")
      .addEventListener("input", pesquisarProdutos);

    document.getElementById("pagina-anterior")
      .addEventListener("click", paginaAnterior);

    document.getElementById("pagina-proxima")
      .addEventListener("click", proximaPagina);

    document.getElementById("voltar-painel")
      .addEventListener("click", () => {
        conteudo.innerHTML = "";
      });

    await carregarProdutos();

    return;
  }

  // MÓDULO DE FORNECEDORES: LISTAR E ALTERAR STATUS DAS EMPRESAS

  if (tela === "fornecedores") {
    conteudo.innerHTML = `
      <div class="modulo-aberto">

        <h2>🏢 Fornecedores</h2>

        <p>Consulte as empresas cadastradas pelos vendedores e controle o acesso de cada uma.</p>

        <div id="lista-fornecedores-admin">
          Carregando empresas...
        </div>

        <button type="button" id="voltar-painel">
          VOLTAR AO PAINEL
        </button>

      </div>
    `;

    document.getElementById("voltar-painel")
      .addEventListener("click", () => {
        conteudo.innerHTML = "";
      });

    await carregarFornecedoresAdmin();
    return;
  }

  if (tela === "cotacoes") {
    await abrirModuloCotacoes(conteudo);
    return;
  }

  if (tela === "respostas") {
    await abrirModuloRespostas(conteudo);
    return;
  }

  if (tela === "usuarios") {
    await abrirModuloUsuarios(conteudo);
    return;
  }

}

// CARREGAR EMPRESAS NO PAINEL DO ADMINISTRADOR

async function carregarFornecedoresAdmin() {
  const lista = document.getElementById("lista-fornecedores-admin");

  if (!lista) return;

  lista.textContent = "Carregando empresas...";

  try {
    const resultado = await getDocs(collection(db, "fornecedores"));

    if (resultado.empty) {
      lista.innerHTML = `
        <div class="aviso-modulo">
          Nenhuma empresa cadastrada até o momento.
        </div>
      `;
      return;
    }

    const empresas = resultado.docs.map(documento => ({
      id: documento.id,
      ...documento.data()
    }));

    empresas.sort((a, b) =>
      String(a.empresa || a.nome || "").localeCompare(
        String(b.empresa || b.nome || ""),
        "pt-BR"
      )
    );

    lista.innerHTML = empresas.map(empresa => {
      const ativa = empresa.ativo === true;
      const nome = empresa.empresa || empresa.nome || "Empresa sem nome";

      let dataCadastro = "";

      if (empresa.criadoEm && typeof empresa.criadoEm.toDate === "function") {
        dataCadastro = empresa.criadoEm.toDate().toLocaleDateString("pt-BR");
      }

      return `
        <div class="aviso-modulo" style="margin:12px 0">
          <button type="button" class="nome-fornecedor" data-detalhes-fornecedor="${escaparHTML(empresa.id)}"
            style="padding:0;border:0;background:transparent;color:#292929;text-align:left;font-size:17px;font-weight:bold">
            ${escaparHTML(nome)}
          </button>

          <p>
            Situação:
            <span style="color:${ativa ? "#267326" : "#c62828"};font-weight:bold">
              ${ativa ? "Ativa" : "Bloqueada"}
            </span>
          </p>

          ${dataCadastro ? `<p>Cadastro: ${dataCadastro}</p>` : ""}

          <button
            type="button"
            data-status-fornecedor="${escaparHTML(empresa.id)}"
          >
            ${ativa ? "BLOQUEAR EMPRESA" : "ATIVAR EMPRESA"}
          </button>
        </div>
      `;
    }).join("");

    lista.querySelectorAll("[data-status-fornecedor]").forEach(botao => {
      botao.addEventListener("click", () => {
        alterarStatusFornecedorAdmin(botao.dataset.statusFornecedor);
      });
    });

    lista.querySelectorAll("[data-detalhes-fornecedor]").forEach(botao => {
      botao.addEventListener("click", () => {
        mostrarDetalhesFornecedor(botao.dataset.detalhesFornecedor);
      });
    });

  } catch (erro) {
    console.error("Erro ao carregar empresas no administrador:", erro);

    lista.innerHTML = `
      <div class="aviso-modulo" style="color:#c62828">
        Não foi possível carregar as empresas. Verifique sua conexão e as regras do Firebase.
      </div>
    `;
  }
}

// ATIVAR OU BLOQUEAR UMA EMPRESA (SOMENTE ADMINISTRADOR)

async function alterarStatusFornecedorAdmin(id) {
  try {
    const referencia = doc(db, "fornecedores", id);
    const resultado = await getDoc(referencia);

    if (!resultado.exists()) {
      alert("Esta empresa não foi encontrada.");
      return;
    }

    const empresa = resultado.data();
    const novoStatus = empresa.ativo !== true;
    const nome = empresa.empresa || empresa.nome || "esta empresa";

    const confirmacao = confirm(
      novoStatus
        ? `Deseja ativar "${nome}"?`
        : `Deseja bloquear "${nome}"?`
    );

    if (!confirmacao) return;

    await updateDoc(referencia, {
      ativo: novoStatus
    });

    await carregarFornecedoresAdmin();

  } catch (erro) {
    console.error("Erro ao alterar situação da empresa:", erro);
    alert("Não foi possível alterar a situação da empresa. Tente novamente.");
  }
}


// DETALHES DO VENDEDOR RESPONSÁVEL PELA EMPRESA

async function mostrarDetalhesFornecedor(empresaId) {
  try {
    const empresaSnap = await getDoc(doc(db, "fornecedores", empresaId));
    if (!empresaSnap.exists()) {
      alert("Empresa não encontrada.");
      return;
    }

    const empresa = empresaSnap.data();
    const uid = empresa.responsavelUid;
    let vendedor = {};

    if (uid) {
      const usuarioSnap = await getDoc(doc(db, "usuarios", uid));
      if (usuarioSnap.exists()) vendedor = usuarioSnap.data();
    }

    const nomeEmpresa = empresa.empresa || empresa.nome || "Empresa";
    const conteudo = document.getElementById("lista-fornecedores-admin");
    if (!conteudo) return;

    let painel = document.getElementById("detalhes-vendedor-fornecedor");
    if (!painel) {
      painel = document.createElement("div");
      painel.id = "detalhes-vendedor-fornecedor";
      painel.className = "aviso-modulo";
      painel.style.margin = "16px 0";
      conteudo.prepend(painel);
    }

    painel.innerHTML = `
      <h3>Contato do fornecedor</h3>
      <p><strong>Empresa:</strong> ${escaparHTML(nomeEmpresa)}</p>
      <p><strong>Vendedor responsável:</strong> ${escaparHTML(vendedor.nome || "Não informado")}</p>
      <p><strong>Telefone / WhatsApp:</strong> ${escaparHTML(vendedor.telefone || "Não informado")}</p>
      <p><strong>E-mail:</strong> ${escaparHTML(vendedor.email || "Não informado")}</p>
      <button type="button" id="fechar-detalhes-fornecedor">FECHAR</button>
    `;
    document.getElementById("fechar-detalhes-fornecedor")
      .addEventListener("click", () => painel.remove());
    painel.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (erro) {
    console.error("Erro ao consultar vendedor:", erro);
    alert("Não foi possível consultar os dados do vendedor.");
  }
}

// MÓDULO DE COTAÇÕES — ADMINISTRADOR

async function abrirModuloCotacoes(conteudo) {
  conteudo.innerHTML = `
    <div class="modulo-aberto">
      <h2>📝 Cotações</h2>
      <p>Crie cotações, selecione os produtos e convide os fornecedores ativos.</p>
      <button type="button" id="nova-cotacao">+ COTAÇÃO ONLINE</button>
      <button type="button" id="nova-cotacao-presencial">+ COTAÇÃO PRESENCIAL</button>
      <div id="form-presencial-area" style="display:none"></div>
      <div id="form-cotacao-area" style="display:none">
        <form id="form-cotacao">
          <label for="cotacao-titulo">Título da cotação</label>
          <input id="cotacao-titulo" required placeholder="Ex.: Cotação semanal de mercearia">
          <div class="cotacao-alerta-fixo" role="note" aria-label="Atenção aos fornecedores">
            <strong>ATENÇÃO!</strong>
            <p>A quantidade e os valores dos produtos devem estar de acordo com a cotação. Caso haja divergências, a mercadoria será devolvida.</p>
          </div>
          <label for="cotacao-descricao">Informações adicionais (opcional)</label>
          <textarea id="cotacao-descricao" rows="3" placeholder="Outras informações para os fornecedores"></textarea>
          <label for="cotacao-prazo">Prazo para resposta</label>
          <input id="cotacao-prazo" type="datetime-local" required>
          <h3 style="margin-top:18px">Produtos da cotação</h3>
          <p class="ajuda-cotacao">Pesquise pelo nome ou código de barras e adicione somente o que precisa.</p>
          <label for="buscar-produto-cotacao">Buscar produto</label>
          <input id="buscar-produto-cotacao" type="search" autocomplete="off" placeholder="Digite o nome ou código de barras...">${botaoLeitor("buscar-produto-cotacao")}
          <div class="cadastro-rapido-cotacao">
            <button type="button" class="botao-secundario-cotacao" id="abrir-produto-rapido-online">+ CADASTRO RÁPIDO DE PRODUTO</button>
            <div id="produto-rapido-online" class="produto-rapido-form" hidden>
              <label for="produto-rapido-nome-online">Nome do produto</label>
              <input id="produto-rapido-nome-online" maxlength="100" placeholder="Ex.: Açúcar cristal 5kg">
              <label for="produto-rapido-unidade-online">Unidade</label>
              <select id="produto-rapido-unidade-online"><option value="UN">UN</option><option value="KG">KG</option><option value="CX">CX</option><option value="FD">FD</option><option value="PCT">PCT</option><option value="LT">LT</option><option value="ML">ML</option><option value="GR">GR</option><option value="SC">SC</option><option value="DZ">DZ</option></select>
              <label for="produto-rapido-codigo-online">Código de barras (opcional)</label>
              <input id="produto-rapido-codigo-online" inputmode="numeric" placeholder="Código de barras">${botaoLeitor("produto-rapido-codigo-online")}
              <button type="button" id="salvar-produto-rapido-online">SALVAR E ADICIONAR</button>
              <p id="mensagem-produto-rapido-online" role="status"></p>
            </div>
          </div>
          <div id="resultados-produtos-cotacao" class="resultados-cotacao">Carregando produtos...</div>
          <div class="selecionados-cotacao-wrap">
            <div class="selecionados-cotacao-titulo"><strong>Produtos selecionados</strong><span id="contador-produtos-cotacao">0 itens</span></div>
            <div id="cotacao-produtos">Nenhum produto selecionado.</div>
          </div>
          <h3 style="margin-top:22px">Fornecedores convidados</h3>
          <p class="ajuda-cotacao">Selecione uma empresa do vendedor. Todas as empresas ativas cadastradas por esse mesmo vendedor serão convidadas, permitindo escolher uma empresa diferente em cada produto.</p>
          <div id="cotacao-fornecedores">Carregando fornecedores...</div>
          <div class="cotacao-acoes-editor"><button type="button" id="salvar-rascunho">SALVAR RASCUNHO</button><button type="button" id="previsualizar-cotacao">VISUALIZAR ORÇAMENTO</button><button type="submit" id="salvar-cotacao">ENVIAR AOS VENDEDORES</button></div>
          <button type="button" id="cancelar-cotacao">FECHAR</button>
          <p id="mensagem-cotacao"></p>
        </form>
      </div>
      <hr style="margin:24px 0">
      <h3>Cotações cadastradas</h3>
      <div id="lista-cotacoes-admin">Carregando...</div>
      <button type="button" id="voltar-painel">VOLTAR AO PAINEL</button>
    </div>`;

  document.getElementById("voltar-painel").addEventListener("click", () => conteudo.innerHTML = "");
  document.getElementById("nova-cotacao-presencial").addEventListener("click", () => abrirFormularioPresencial());
  document.getElementById("nova-cotacao").addEventListener("click", async () => {
    cotacaoRascunhoEditandoId = null;
    document.getElementById("salvar-cotacao").textContent = "ENVIAR AOS VENDEDORES";
    document.getElementById("form-cotacao-area").style.display = "block";
    await carregarOpcoesCotacao();
  });
  document.getElementById("cancelar-cotacao").addEventListener("click", () => {
    document.getElementById("form-cotacao").reset();
    produtosSelecionadosCotacao = new Map();
    cotacaoRascunhoEditandoId = null;
    document.getElementById("form-cotacao-area").style.display = "none";
  });
  document.getElementById("form-cotacao").addEventListener("submit", evento => salvarCotacao(evento, false));
  document.getElementById("salvar-rascunho").addEventListener("click", () => salvarCotacao(null, true));
  document.getElementById("previsualizar-cotacao").addEventListener("click", visualizarOrcamentoOnline);
  await carregarListaCotacoesAdmin();
}

async function criarProdutoRapido(nome, unidade, codigoBarras = "") {
  const nomeLimpo = String(nome || "").trim();
  const codigo = String(codigoBarras || "").replace(/\s+/g, "").trim();
  if (!nomeLimpo) throw new Error("Informe o nome do produto.");
  if (codigo) {
    const existente = await getDocs(query(collection(db, "produtos"), where("codigoBarras", "==", codigo)));
    if (!existente.empty) throw new Error(`Este código já está cadastrado em ${existente.docs[0].data().nome || "outro produto"}.`);
  }
  const dados = { nome: nomeLimpo, unidade: unidade || "UN", codigoBarras: codigo, departamento: "Não informado", categoria: "Geral", ativo: true, foto: "", criadoEm: serverTimestamp() };
  const ref = await addDoc(collection(db, "produtos"), dados);
  return { id: ref.id, ...dados };
}

async function abrirFormularioPresencial(idEdicao = null) {
  const area = document.getElementById("form-presencial-area");
  area.style.display = "block";
  area.innerHTML = '<p>Carregando produtos e fornecedores...</p>';
  cotacaoPresencialEditandoId = idEdicao;
  try {
    const [ps, fs, cotSnap] = await Promise.all([
      getDocs(collection(db,"produtos")),
      getDocs(collection(db,"fornecedores")),
      idEdicao ? getDoc(doc(db,"cotacoes_presenciais",idEdicao)) : Promise.resolve(null)
    ]);
    const dadosEdicao = cotSnap?.exists() ? cotSnap.data() : null;
    if (idEdicao && (!dadosEdicao || dadosEdicao.status === "finalizada")) throw new Error("Este rascunho não está disponível para edição.");
    const produtos = ps.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.ativo===true).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
    const fornecedoresBase = fs.docs.map(d=>({id:d.id,...d.data()})).filter(f=>f.ativo===true);
    const uids=[...new Set(fornecedoresBase.map(f=>f.responsavelUid).filter(Boolean))];
    const titulares=new Map();
    await Promise.all(uids.map(async uid=>{try{const u=await getDoc(doc(db,"usuarios",uid));if(u.exists())titulares.set(uid,u.data().nome||"Titular não identificado");}catch(e){console.warn(e);}}));
    const fornecedores=fornecedoresBase.map(f=>({...f,titular:titulares.get(f.responsavelUid)||"Titular não identificado"})).sort((a,b)=>a.titular.localeCompare(b.titular,"pt-BR"));
    area.innerHTML=`<form id="form-presencial"><h3>${idEdicao?"Editar rascunho presencial":"Nova cotação presencial"}</h3>
      <label>Título da reunião</label><input id="pres-titulo" required placeholder="Ex.: Cotação semanal - bebidas">
      <label>Data da reunião</label><input id="pres-data" type="date" required>
      <label>Adicionar produto</label><input id="pres-busca" type="search" placeholder="Digite nome ou código de barras" autocomplete="off">${botaoLeitor("pres-busca")}
      <div class="cadastro-rapido-cotacao">
        <button type="button" class="botao-secundario-cotacao" id="abrir-produto-rapido-pres">+ CADASTRO RÁPIDO DE PRODUTO</button>
        <div id="produto-rapido-pres" class="produto-rapido-form" hidden>
          <label for="produto-rapido-nome-pres">Nome do produto</label><input id="produto-rapido-nome-pres" maxlength="100" placeholder="Ex.: Açúcar cristal 5kg">
          <label for="produto-rapido-unidade-pres">Unidade</label><select id="produto-rapido-unidade-pres"><option value="UN">UN</option><option value="KG">KG</option><option value="CX">CX</option><option value="FD">FD</option><option value="PCT">PCT</option><option value="LT">LT</option><option value="ML">ML</option><option value="GR">GR</option><option value="SC">SC</option><option value="DZ">DZ</option></select>
          <label for="produto-rapido-codigo-pres">Código de barras (opcional)</label><input id="produto-rapido-codigo-pres" inputmode="numeric" placeholder="Código de barras">${botaoLeitor("produto-rapido-codigo-pres")}
          <button type="button" id="salvar-produto-rapido-pres">SALVAR E ADICIONAR</button><p id="mensagem-produto-rapido-pres" role="status"></p>
        </div>
      </div>
      <div id="pres-resultados" class="resultados-cotacao"></div>
      <div id="pres-selecionados"></div><div id="pres-paginacao" class="paginacao-cotacoes" style="display:none"><button type="button" id="pres-anterior">ANTERIOR</button><span id="pres-pagina-info"></span><button type="button" id="pres-proxima">PRÓXIMA</button></div>
      <div id="pres-mensagem" role="status"></div>
      <button type="button" id="pres-rascunho">SALVAR RASCUNHO</button>
      <button type="submit" id="pres-salvar">FINALIZAR E SALVAR NO HISTÓRICO</button>
      <button type="button" id="pres-cancelar">CANCELAR</button></form>`;
    ativarLeitoresCodigo(area);
    const selecionados=new Map();
    document.getElementById("pres-titulo").value=dadosEdicao?.titulo||"";
    document.getElementById("pres-data").value=dadosEdicao?.data||new Date().toLocaleDateString('en-CA');
    document.getElementById("abrir-produto-rapido-pres").onclick=()=>{const f=document.getElementById("produto-rapido-pres");f.hidden=!f.hidden;};
    document.getElementById("salvar-produto-rapido-pres").onclick=async()=>{
      const b=document.getElementById("salvar-produto-rapido-pres"), msg=document.getElementById("mensagem-produto-rapido-pres");
      b.disabled=true; b.textContent="SALVANDO...";
      try { const pr=await criarProdutoRapido(document.getElementById("produto-rapido-nome-pres").value,document.getElementById("produto-rapido-unidade-pres").value,document.getElementById("produto-rapido-codigo-pres").value); produtos.push(pr); selecionados.set(pr.id,pr); document.getElementById("pres-busca").value=""; document.getElementById("produto-rapido-nome-pres").value=""; document.getElementById("produto-rapido-codigo-pres").value=""; msg.textContent="Produto cadastrado e adicionado à cotação!"; renderTabela(); renderBusca(); }
      catch(e){msg.textContent=e.message||"Não foi possível cadastrar o produto.";msg.style.color="#c62828";}
      finally{b.disabled=false;b.textContent="SALVAR E ADICIONAR";}
    };
    const renderBusca=()=>{const campo=document.getElementById("pres-busca"), codigo=String(campo.value||"").trim();const exato=produtos.find(p=>String(p.codigoBarras||"").trim()===codigo&&codigo.length>=6);if(exato&&!selecionados.has(exato.id)){selecionados.set(exato.id,exato);campo.value="";renderTabela();}else if(/^\d{6,}$/.test(codigo)&&!exato){const painel=document.getElementById("produto-rapido-pres"),codigoRapido=document.getElementById("produto-rapido-codigo-pres");if(painel&&codigoRapido){painel.hidden=false;codigoRapido.value=codigo;}}const q=normalizarTexto(campo.value);const achados=produtos.filter(p=>!q||normalizarTexto(p.nome+" "+(p.codigoBarras||"")).includes(q)).slice(0,25);document.getElementById("pres-resultados").innerHTML=achados.map(p=>`<div class="resultado-produto-cotacao"><span><b>${escaparHTML(p.nome)}</b> <small>${escaparHTML(p.codigoBarras||"")}</small></span><button type="button" data-pres-add="${escaparHTML(p.id)}" ${selecionados.has(p.id)?"disabled":""}>${selecionados.has(p.id)?"ADICIONADO":"+ ADICIONAR"}</button></div>`).join("")||"Nenhum produto encontrado.";area.querySelectorAll("[data-pres-add]").forEach(b=>b.onclick=()=>{const pr=produtos.find(x=>x.id===b.dataset.presAdd);if(pr)selecionados.set(pr.id,pr);renderTabela();renderBusca();});};
    const dadosLinhas=new Map(); let paginaPresencial=0; const itensPorPaginaPresencial=5;
    const capturarLinhas=()=>{area.querySelectorAll("[data-pres-row]").forEach(row=>{const id=row.dataset.presRow;dadosLinhas.set(id,{quantidade:row.querySelector(".pres-qtd")?.value||"1",observacao:row.querySelector(".pres-observacao")?.value||"",vencedorId:row.querySelector(".pres-vencedor")?.value||"",precos:Object.fromEntries([...row.querySelectorAll(".pres-preco")].map(x=>[x.dataset.forn,x.value]))});});};
    const renderTabela=()=>{capturarLinhas();const box=document.getElementById("pres-selecionados"),todos=[...selecionados.values()];if(!todos.length){box.innerHTML="<p>Nenhum produto adicionado.</p>";document.getElementById("pres-paginacao").style.display="none";return;}const totalPaginas=Math.max(1,Math.ceil(todos.length/itensPorPaginaPresencial));paginaPresencial=Math.min(paginaPresencial,totalPaginas-1);const inicio=paginaPresencial*itensPorPaginaPresencial,visiveis=todos.slice(inicio,inicio+itensPorPaginaPresencial);box.innerHTML=`<div style="overflow-x:auto"><table class="pres-matriz" style="min-width:${Math.max(650,360+fornecedores.length*155)}px;width:100%;border-collapse:collapse"><thead><tr><th>Nº</th><th>Produto / código de barras</th><th>Qtd.</th>${fornecedores.map(f=>`<th>${escaparHTML(f.titular)}<br><small>(${escaparHTML(f.empresa||"Empresa")})</small><br>Preço (R$)</th>`).join("")}<th>Vencedor</th><th></th></tr></thead><tbody>${visiveis.map((p,indice)=>{const d=dadosLinhas.get(p.id)||{};return `<tr data-pres-row="${escaparHTML(p.id)}"><td data-label="Nº"><strong>${inicio+indice+1}</strong></td><td data-label="Produto / código">${escaparHTML(p.nome)}<br><small>Cód.: ${escaparHTML(p.codigoBarras||"Não informado")} · ${escaparHTML(p.unidade||"UN")}</small><br><textarea class="pres-observacao" rows="2" maxlength="500" placeholder="Observação: bonificação, prazo, condição...">${escaparHTML(d.observacao||"")}</textarea></td><td data-label="Quantidade"><input type="number" min="0.001" step="0.001" class="pres-qtd" value="${escaparHTML(d.quantidade||"1")}" style="min-width:75px"></td>${fornecedores.map(f=>`<td data-label="${escaparHTML(f.titular)} (${escaparHTML(f.empresa||"Empresa")}) · Preço (R$)"><input type="number" min="0.01" step="0.01" class="pres-preco" data-forn="${escaparHTML(f.id)}" value="${escaparHTML(d.precos?.[f.id]||"")}" placeholder="—" style="min-width:100px"></td>`).join("")}<td data-label="Vencedor"><select class="pres-vencedor"><option value="">Selecione</option>${fornecedores.map(f=>`<option value="${escaparHTML(f.id)}" ${d.vencedorId===f.id?"selected":""}>${escaparHTML(f.empresa||f.nome||f.titular||"Empresa")}</option>`).join("")}</select></td><td data-label="Ação"><button type="button" data-pres-remove="${escaparHTML(p.id)}">Remover</button></td></tr>`;}).join("")}</tbody></table></div><p>Preencha os preços oferecidos e escolha o vencedor de cada produto. O preço vencedor será usado no total.</p>`;const pag=document.getElementById("pres-paginacao");pag.style.display=todos.length>itensPorPaginaPresencial?"flex":"none";document.getElementById("pres-pagina-info").textContent=`Página ${paginaPresencial+1} de ${totalPaginas} · ${todos.length} produtos`;document.getElementById("pres-anterior").disabled=paginaPresencial===0;document.getElementById("pres-proxima").disabled=paginaPresencial>=totalPaginas-1;box.querySelectorAll("[data-pres-remove]").forEach(b=>b.onclick=()=>{capturarLinhas();selecionados.delete(b.dataset.presRemove);dadosLinhas.delete(b.dataset.presRemove);paginaPresencial=Math.min(paginaPresencial,Math.max(0,Math.ceil(selecionados.size/itensPorPaginaPresencial)-1));renderTabela();renderBusca();});};
    document.getElementById("pres-anterior").onclick=()=>{capturarLinhas();paginaPresencial--;renderTabela();};document.getElementById("pres-proxima").onclick=()=>{capturarLinhas();paginaPresencial++;renderTabela();};
    const restaurarLinhas=()=>{for(const item of (dadosEdicao?.itens||[])){const pr=produtos.find(p=>p.id===item.produtoId)||{id:item.produtoId,nome:item.nome,unidade:item.unidade||"UN"};selecionados.set(pr.id,pr);dadosLinhas.set(pr.id,{quantidade:item.quantidade??1,observacao:item.observacao||"",vencedorId:item.vencedorId||"",precos:Object.fromEntries((item.precos||[]).map(x=>[x.fornecedorId,x.preco==null?"":String(x.preco)]))});}renderTabela();};
    const montarDocumento=(finalizar)=>{capturarLinhas();const titulo=document.getElementById("pres-titulo").value.trim(),data=document.getElementById("pres-data").value;if(!titulo||!data)throw new Error("Informe o título e a data da reunião.");const itens=[];let erro="";for(const p of selecionados.values()){const d=dadosLinhas.get(p.id)||{};const quantidade=Number(d.quantidade??1);const vencedorId=d.vencedorId||"";const precos=fornecedores.map(f=>{const valor=d.precos?.[f.id]??"";return{fornecedorId:f.id,preco:valor===""?null:Number(valor)};});const vencedor=precos.find(x=>x.fornecedorId===vencedorId);if(finalizar&&(!(quantidade>0)||!vencedorId||!vencedor||!(vencedor.preco>0))){erro=`Confira quantidade, vencedor e preço vencedor do produto ${p.nome}.`;break;}if(precos.some(x=>x.preco!==null&&(!(x.preco>0)||!Number.isFinite(x.preco)))){erro=`Há preço inválido no produto ${p.nome}.`;break;}const item={produtoId:p.id,nome:p.nome,codigoBarras:p.codigoBarras||"",numero:itens.length+1,unidade:p.unidade||"UN",quantidade:quantidade>0?quantidade:null,observacao:String(d.observacao||"").trim(),precos,vencedorId:vencedorId||"",precoVencedor:vencedor?.preco??null,total:vencedor?.preco>0?quantidade*vencedor.preco:null};itens.push(item);}if(erro)throw new Error(erro);if(finalizar&&!itens.length)throw new Error("Adicione pelo menos um produto para finalizar.");const totais={};for(const f of fornecedores)totais[f.id]=itens.reduce((s,i)=>s+(i.vencedorId===f.id?Number(i.total||0):0),0);const valorTotal=itens.reduce((s,i)=>s+Number(i.total||0),0);return{titulo,data,reuniaoTipo:"presencial",status:finalizar?"finalizada":"rascunho",fornecedores:fornecedores.map(f=>({fornecedorId:f.id,empresa:f.empresa||"",titular:f.titular,responsavelUid:f.responsavelUid||""})),responsaveisUids:[...new Set(fornecedores.map(f=>f.responsavelUid).filter(Boolean))],itens,totais,valorTotal,criadoPor:auth.currentUser?.uid||"",atualizadoEm:serverTimestamp(),...(finalizar?{finalizadoEm:serverTimestamp()}:{})};};
    const salvar=async(finalizar)=>{const btn=document.getElementById(finalizar?"pres-salvar":"pres-rascunho"),msg=document.getElementById("pres-mensagem");try{const dados=montarDocumento(finalizar);btn.disabled=true;btn.textContent="SALVANDO...";if(cotacaoPresencialEditandoId){await updateDoc(doc(db,"cotacoes_presenciais",cotacaoPresencialEditandoId),dados);}else{const ref=await addDoc(collection(db,"cotacoes_presenciais"),{...dados,criadoEm:serverTimestamp()});cotacaoPresencialEditandoId=ref.id;}msg.textContent=finalizar?"Cotação presencial finalizada e salva no histórico!":"Rascunho salvo! Você poderá continuar editando depois.";await carregarListaCotacoesAdmin();if(finalizar){area.style.display="none";area.innerHTML="";cotacaoPresencialEditandoId=null;}else{btn.textContent="SALVAR RASCUNHO";btn.disabled=false;}}catch(e){console.error(e);msg.textContent=e.message||"Não foi possível salvar. Verifique as regras do Firebase.";btn.disabled=false;btn.textContent=finalizar?"FINALIZAR E SALVAR NO HISTÓRICO":"SALVAR RASCUNHO";}};
    document.getElementById("pres-busca").addEventListener("input",renderBusca);
    document.getElementById("pres-rascunho").onclick=()=>salvar(false);
    document.getElementById("pres-cancelar").onclick=()=>{area.style.display="none";area.innerHTML="";cotacaoPresencialEditandoId=null;};
    renderBusca();restaurarLinhas();
    document.getElementById("form-presencial").addEventListener("submit",ev=>{ev.preventDefault();salvar(true);});
  }catch(e){console.error(e);area.innerHTML=`<p>${escaparHTML(e.message||"Não foi possível carregar os dados. Verifique o Firebase.")}</p><button type="button" id="pres-fechar">Fechar</button>`;document.getElementById("pres-fechar").onclick=()=>area.style.display="none";}
}

async function abrirDetalhesPresencial(id) {
  try { const snap=await getDoc(doc(db,"cotacoes_presenciais",id));if(!snap.exists())return;const c=snap.data();const linhas=(c.itens||[]).map(i=>`<tr><td>${escaparHTML(i.nome)}</td><td>${i.quantidade}</td>${(c.fornecedores||[]).map(f=>{const p=(i.precos||[]).find(x=>x.fornecedorId===f.fornecedorId);return `<td>${p?.preco==null?"—":Number(p.preco).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>`;}).join("")}<td>${escaparHTML((c.fornecedores||[]).find(f=>f.fornecedorId===i.vencedorId)?.empresa || (c.fornecedores||[]).find(f=>f.fornecedorId===i.vencedorId)?.nome || "—")}</td></tr>`).join("");const resumo=(c.fornecedores||[]).map(f=>`<p><b>${escaparHTML(f.titular)} (${escaparHTML(f.empresa)})</b>: ${Number(c.totais?.[f.fornecedorId]||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p>`).join("");alert(`${c.titulo}\nData: ${c.data}\n\n${(c.itens||[]).map((i,indice)=>`${indice+1}. ${i.nome} — ${i.quantidade} x R$ ${Number(i.precoVencedor).toFixed(2)} = R$ ${Number(i.total).toFixed(2)}`).join("\n")}\n\nTotais por vencedor:\n${(c.fornecedores||[]).map(f=>`${f.titular}: R$ ${Number(c.totais?.[f.fornecedorId]||0).toFixed(2)}`).join("\n")}\n\nTOTAL GERAL: R$ ${Number(c.valorTotal||0).toFixed(2)}`);
  } catch(e){console.error(e);alert("Não foi possível abrir os detalhes.");}
}

async function carregarOpcoesCotacao() {
  const area = document.getElementById("form-cotacao-area");
  const areaProdutos = document.getElementById("cotacao-produtos");
  const areaResultados = document.getElementById("resultados-produtos-cotacao");
  const areaFornecedores = document.getElementById("cotacao-fornecedores");
  const campoBusca = document.getElementById("buscar-produto-cotacao");
  produtosSelecionadosCotacao = new Map();

  try {
    const [prodSnap, fornSnap] = await Promise.all([
      getDocs(collection(db, "produtos")),
      getDocs(collection(db, "fornecedores"))
    ]);

    produtosDisponiveisCotacao = prodSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(p => p.ativo === true)
      .sort((a, b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));

    const fornecedoresBase = fornSnap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .filter(f => f.ativo === true);

    // Busca os titulares das contas para exibir Nome (Empresa).
    const uids = [...new Set(fornecedoresBase.map(f => f.responsavelUid).filter(Boolean))];
    const usuariosPorUid = new Map();
    await Promise.all(uids.map(async uid => {
      try {
        const usuarioSnap = await getDoc(doc(db, "usuarios", uid));
        if (usuarioSnap.exists()) usuariosPorUid.set(uid, usuarioSnap.data());
      } catch (erro) {
        console.warn("Não foi possível consultar o titular", uid, erro);
      }
    }));

    const fornecedores = fornecedoresBase.map(f => ({
      ...f,
      titular: usuariosPorUid.get(f.responsavelUid)?.nome || "Titular não identificado"
    })).sort((a, b) => String(a.titular).localeCompare(String(b.titular), "pt-BR"));

    ativarLeitoresCodigo(area);
    renderizarResultadosProdutosCotacao("");
    renderizarProdutosSelecionadosCotacao();

    campoBusca.addEventListener("input", () => {
      const codigo = String(campoBusca.value || "").trim();
      const produtoExato = produtosDisponiveisCotacao.find(p => String(p.codigoBarras || "").trim() === codigo && codigo.length >= 6);
      if (produtoExato && !produtosSelecionadosCotacao.has(produtoExato.id)) {
        produtosSelecionadosCotacao.set(produtoExato.id, produtoExato);
        renderizarProdutosSelecionadosCotacao();
        campoBusca.value = "";
        renderizarResultadosProdutosCotacao("");
        return;
      }
      if (/^\d{6,}$/.test(codigo) && !produtoExato) {
        const painel = document.getElementById("produto-rapido-online");
        const codigoRapido = document.getElementById("produto-rapido-codigo-online");
        if (painel && codigoRapido) { painel.hidden = false; codigoRapido.value = codigo; }
      }
      renderizarResultadosProdutosCotacao(campoBusca.value);
    });
    document.getElementById("abrir-produto-rapido-online").addEventListener("click",()=>{const f=document.getElementById("produto-rapido-online");f.hidden=!f.hidden;});
    document.getElementById("salvar-produto-rapido-online").addEventListener("click",async()=>{
      const b=document.getElementById("salvar-produto-rapido-online"),msg=document.getElementById("mensagem-produto-rapido-online");b.disabled=true;b.textContent="SALVANDO...";
      try{const pr=await criarProdutoRapido(document.getElementById("produto-rapido-nome-online").value,document.getElementById("produto-rapido-unidade-online").value,document.getElementById("produto-rapido-codigo-online").value);produtosDisponiveisCotacao.push(pr);produtosDisponiveisCotacao.sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));produtosSelecionadosCotacao.set(pr.id,pr);document.getElementById("produto-rapido-nome-online").value="";document.getElementById("produto-rapido-codigo-online").value="";document.getElementById("buscar-produto-cotacao").value="";renderizarProdutosSelecionadosCotacao();renderizarResultadosProdutosCotacao("");msg.textContent="Produto cadastrado e adicionado à cotação!";msg.style.color="#267326";}
      catch(e){msg.textContent=e.message||"Não foi possível cadastrar o produto.";msg.style.color="#c62828";}
      finally{b.disabled=false;b.textContent="SALVAR E ADICIONAR";}
    });

    areaFornecedores.innerHTML = fornecedores.length ? fornecedores.map(f => `
      <label class="fornecedor-convite-item">
        <input type="checkbox" name="cotacao-fornecedor" value="${escaparHTML(f.id)}">
        <span class="fornecedor-convite-texto">
          <strong>${escaparHTML(f.titular)}</strong>
          <small>(${escaparHTML(f.empresa || f.nome || "Empresa não informada")})</small>
        </span>
      </label>`).join("") : "<p>Nenhum fornecedor ativo cadastrado.</p>";
  } catch (erro) {
    console.error(erro);
    areaProdutos.textContent = "Não foi possível carregar os produtos.";
    areaResultados.textContent = "Erro ao carregar produtos.";
    areaFornecedores.textContent = "Erro ao carregar fornecedores.";
  }
}

function renderizarResultadosProdutosCotacao(termo = "") {
  const area = document.getElementById("resultados-produtos-cotacao");
  if (!area) return;

  const busca = normalizarTexto(termo);
  const encontrados = produtosDisponiveisCotacao.filter(p => {
    const nome = normalizarTexto(p.nome);
    const codigo = normalizarTexto(p.codigoBarras);
    return !busca || nome.includes(busca) || codigo.includes(busca);
  }).slice(0, 30);

  if (!encontrados.length) {
    area.innerHTML = '<p class="cotacao-sem-resultado">Nenhum produto encontrado. Confira o nome ou código digitado.</p>';
    return;
  }

  area.innerHTML = encontrados.map(p => {
    const jaAdicionado = produtosSelecionadosCotacao.has(p.id);
    return `
      <div class="resultado-produto-cotacao">
        <div class="resultado-produto-info">
          <strong>${escaparHTML(p.nome || "Produto sem nome")}</strong>
          <small>${escaparHTML(p.codigoBarras || "Sem código")} · ${escaparHTML(p.unidade || "UN")}</small>
        </div>
        <button type="button" data-adicionar-produto-cotacao="${escaparHTML(p.id)}" ${jaAdicionado ? "disabled" : ""}>
          ${jaAdicionado ? "ADICIONADO" : "+ ADICIONAR"}
        </button>
      </div>`;
  }).join("");

  area.querySelectorAll("[data-adicionar-produto-cotacao]").forEach(botao => {
    botao.addEventListener("click", () => {
      const id = botao.dataset.adicionarProdutoCotacao;
      const produto = produtosDisponiveisCotacao.find(p => p.id === id);
      if (!produto || produtosSelecionadosCotacao.has(id)) return;
      produtosSelecionadosCotacao.set(id, produto);
      renderizarProdutosSelecionadosCotacao();
      renderizarResultadosProdutosCotacao(document.getElementById("buscar-produto-cotacao")?.value || "");
    });
  });
}

function renderizarProdutosSelecionadosCotacao() {
  const area = document.getElementById("cotacao-produtos");
  const contador = document.getElementById("contador-produtos-cotacao");
  if (!area) return;

  const selecionados = [...produtosSelecionadosCotacao.values()];
  if (contador) contador.textContent = `${selecionados.length} ${selecionados.length === 1 ? "item" : "itens"}`;

  if (!selecionados.length) {
    area.innerHTML = '<p class="cotacao-sem-selecao">Nenhum produto adicionado ainda.</p>';
    return;
  }

  area.innerHTML = selecionados.map((p, indice) => `
    <div class="produto-selecionado-cotacao">
      <span class="produto-cotacao-numero" aria-label="Item ${indice + 1}">${indice + 1}</span>
      <input type="checkbox" name="cotacao-produto" value="${escaparHTML(p.id)}" checked hidden>
      <span><strong>${escaparHTML(p.nome)}</strong><small>${escaparHTML(p.codigoBarras || "Sem código")} · ${escaparHTML(p.unidade || "UN")}</small></span>
      <label class="qtd-cotacao-label">Quantidade
        <input type="number" min="0.001" step="0.001" value="${Number(p.quantidade||1)}" data-qtd-cotacao="${escaparHTML(p.id)}" required style="width:95px">
      </label>
      <button type="button" data-remover-produto-cotacao="${escaparHTML(p.id)}" aria-label="Remover ${escaparHTML(p.nome)}">REMOVER</button>
    </div>`).join("");

  area.querySelectorAll("[data-qtd-cotacao]").forEach(input => input.addEventListener("input", () => {
    const produto = produtosSelecionadosCotacao.get(input.dataset.qtdCotacao);
    if (produto) produto.quantidade = Number(input.value || 0);
  }));

  area.querySelectorAll("[data-remover-produto-cotacao]").forEach(botao => {
    botao.addEventListener("click", () => {
      produtosSelecionadosCotacao.delete(botao.dataset.removerProdutoCotacao);
      renderizarProdutosSelecionadosCotacao();
      renderizarResultadosProdutosCotacao(document.getElementById("buscar-produto-cotacao")?.value || "");
    });
  });
}

async function salvarCotacao(evento, comoRascunho = false) {
  if (evento) evento.preventDefault();
  const botao = document.getElementById(comoRascunho ? "salvar-rascunho" : "salvar-cotacao");
  const titulo = document.getElementById("cotacao-titulo").value.trim();
  const descricao = document.getElementById("cotacao-descricao").value.trim();
  const prazoTexto = document.getElementById("cotacao-prazo").value;
  const produtoIds = [...document.querySelectorAll('input[name="cotacao-produto"]:checked')].map(x => x.value);
  const fornecedorIds = [...document.querySelectorAll('input[name="cotacao-fornecedor"]:checked')].map(x => x.value);
  if (!titulo) { mensagemNaTela("mensagem-cotacao", "Informe o título do orçamento.", true); return; }
  if (!comoRascunho && (!prazoTexto || produtoIds.length === 0 || fornecedorIds.length === 0)) {
    mensagemNaTela("mensagem-cotacao", "Para enviar, informe prazo, produtos e pelo menos um vendedor.", true); return;
  }
  const prazo = prazoTexto ? new Date(prazoTexto) : null;
  if (prazoTexto && (Number.isNaN(prazo.getTime()) || (!comoRascunho && prazo <= new Date()))) {
    mensagemNaTela("mensagem-cotacao", comoRascunho ? "Confira a data informada." : "O prazo precisa ser uma data futura.", true); return;
  }
  botao.disabled = true; const textoOriginal=botao.textContent; botao.textContent=comoRascunho?"SALVANDO...":"ENVIANDO...";
  try {
    const [prodSnap, fornSnap] = await Promise.all([getDocs(collection(db,"produtos")),getDocs(collection(db,"fornecedores"))]);
    const produtos = produtoIds.map(id=>{const d=prodSnap.docs.find(x=>x.id===id);if(!d)return null;const data=d.data();return {produtoId:id,nome:data.nome||"",descricao:data.descricao||"",codigoBarras:data.codigoBarras||"",unidade:data.unidade||"UN",quantidade:Number(document.querySelector(`[data-qtd-cotacao="${CSS.escape(id)}"]`)?.value||produtosSelecionadosCotacao.get(id)?.quantidade||1)};}).filter(Boolean);
    if (produtos.some(p=>!(p.quantidade>0))) throw new Error("QUANTIDADE_INVALIDA");
    const selecionados = fornSnap.docs.filter(d=>fornecedorIds.includes(d.id)&&d.data().ativo===true);
    if (!comoRascunho && selecionados.length!==fornecedorIds.length) throw new Error("FORNECEDOR_INATIVO");
    const titulares = new Set(selecionados.map(d=>d.data().responsavelUid).filter(Boolean));
    const fornecedores = fornSnap.docs.filter(d=>d.data().ativo===true&&titulares.has(d.data().responsavelUid));
    const payload={titulo,descricao,prazo:prazo?prazo.toISOString():"",produtos,fornecedoresSelecionadosIds:fornecedorIds,status:comoRascunho?"rascunho":"aberta",criadoPor:auth.currentUser?.uid||"",atualizadoEm:serverTimestamp()};
    if (comoRascunho) {
      if (cotacaoRascunhoEditandoId) await updateDoc(doc(db,"cotacoes",cotacaoRascunhoEditandoId),payload);
      else { const ref=doc(collection(db,"cotacoes")); await setDoc(ref,{...payload,criadoEm:serverTimestamp(),responsaveisUids:[]}); cotacaoRascunhoEditandoId=ref.id; }
      mensagemNaTela("mensagem-cotacao","Rascunho salvo. Você pode fechar e continuar editando depois.");
    } else {
      const cotacaoRef=cotacaoRascunhoEditandoId?doc(db,"cotacoes",cotacaoRascunhoEditandoId):doc(collection(db,"cotacoes"));
      const responsaveisUids=[...new Set(fornecedores.map(f=>f.data().responsavelUid).filter(Boolean))];
      const lote=writeBatch(db);
      lote.set(cotacaoRef,{...payload,responsaveisUids,enviadoEm:serverTimestamp(),...(cotacaoRascunhoEditandoId?{}:{criadoEm:serverTimestamp()})},{merge:true});
      fornecedores.forEach(f=>{const dados=f.data();const vinculoRef=doc(db,"cotacao_fornecedores",cotacaoRef.id+"__"+f.id);lote.set(vinculoRef,{cotacaoId:cotacaoRef.id,fornecedorId:f.id,responsavelUid:dados.responsavelUid||"",status:"convidado",criadoEm:serverTimestamp()});});
      await lote.commit();
      mensagemNaTela("mensagem-cotacao","Orçamento enviado aos vendedores com sucesso!");
      cotacaoRascunhoEditandoId=null;
    }
    if(!comoRascunho){document.getElementById("form-cotacao").reset();produtosSelecionadosCotacao=new Map();document.getElementById("form-cotacao-area").style.display="none";}
    await carregarListaCotacoesAdmin();
  } catch(e) { console.error(e); const msg={FORNECEDOR_INATIVO:"Um dos vendedores selecionados está bloqueado.",QUANTIDADE_INVALIDA:"Confira a quantidade dos produtos."}[e.message]||"Não foi possível salvar o orçamento. Verifique as regras atuais do Firebase.";mensagemNaTela("mensagem-cotacao",msg,true); }
  finally {botao.disabled=false;botao.textContent=textoOriginal;}
}

async function editarRascunhoCotacao(id) {
  try {
    const snap=await getDoc(doc(db,"cotacoes",id)); if(!snap.exists()||snap.data().status!=="rascunho")throw new Error("Este rascunho não está mais disponível.");
    const c=snap.data(); cotacaoRascunhoEditandoId=id;
    document.getElementById("form-cotacao-area").style.display="block";
    await carregarOpcoesCotacao();
    document.getElementById("cotacao-titulo").value=c.titulo||"";
    document.getElementById("cotacao-descricao").value=c.descricao||"";
    document.getElementById("cotacao-prazo").value=c.prazo?new Date(c.prazo).toISOString().slice(0,16):"";
    produtosSelecionadosCotacao=new Map();
    (c.produtos||[]).forEach(p=>{const original=produtosDisponiveisCotacao.find(x=>x.id===p.produtoId);if(original)produtosSelecionadosCotacao.set(p.produtoId,original);});
    renderizarProdutosSelecionadosCotacao();
    (c.produtos||[]).forEach(p=>{const input=document.querySelector(`[data-qtd-cotacao="${CSS.escape(p.produtoId)}"]`);if(input)input.value=p.quantidade||1;});
    const selecionados=new Set(c.fornecedoresSelecionadosIds||[]);
    document.querySelectorAll('input[name="cotacao-fornecedor"]').forEach(x=>x.checked=selecionados.has(x.value));
    document.getElementById("salvar-cotacao").textContent="ENVIAR AOS VENDEDORES";
    document.getElementById("form-cotacao-area").scrollIntoView({behavior:"smooth",block:"start"});
  } catch(e){console.error(e);alert(e.message||"Não foi possível abrir o rascunho.");}
}

function visualizarOrcamentoOnline(){
  const titulo=document.getElementById("cotacao-titulo").value.trim()||"Orçamento de compras";
  const descricao=document.getElementById("cotacao-descricao").value.trim();
  const prazo=document.getElementById("cotacao-prazo").value;
  const produtos=[...document.querySelectorAll('input[name="cotacao-produto"]:checked')].map(x=>{const p=produtosDisponiveisCotacao.find(y=>y.id===x.value);return p?{...p,quantidade:Number(document.querySelector(`[data-qtd-cotacao="${CSS.escape(x.value)}"]`)?.value||1)}:null;}).filter(Boolean);
  const w=window.open("","_blank");if(!w){alert("Permita pop-ups para visualizar o orçamento.");return;}
  w.document.write(`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${escaparHTML(titulo)}</title><style>body{font:14px Arial;color:#252a31;margin:35px}header{border-bottom:5px solid #f2c928;padding-bottom:16px}h1{margin:0 0 5px}table{width:100%;border-collapse:collapse;margin-top:24px}th,td{padding:11px;border:1px solid #ddd;text-align:left}th{background:#fff5cc}.meta{margin-top:18px;color:#555}.acoes{margin-top:24px}@media print{.acoes{display:none}}</style><header><h1>COMPRAS SANTA RITA</h1><h2>${escaparHTML(titulo)}</h2></header><div class="meta">Prazo para resposta: ${prazo?new Date(prazo).toLocaleString("pt-BR"):"A definir"}</div>${descricao?`<p><b>Orientações:</b> ${escaparHTML(descricao)}</p>`:""}<table><thead><tr><th>Item</th><th>Produto</th><th>Código de barras</th><th>Unidade</th><th>Quantidade</th></tr></thead><tbody>${produtos.map((p,i)=>`<tr><td>${i+1}</td><td>${escaparHTML(p.nome)}</td><td>${escaparHTML(p.codigoBarras||"—")}</td><td>${escaparHTML(p.unidade||"UN")}</td><td>${p.quantidade}</td></tr>`).join("")}</tbody></table><div class="acoes"><button onclick="print()">Imprimir / Salvar PDF</button></div></html>`);w.document.close();
}


async function carregarListaCotacoesAdmin() {
 const area=document.getElementById("lista-cotacoes-admin");if(!area)return;
 try{
  const [snap,ps]=await Promise.all([getDocs(collection(db,"cotacoes")),getDocs(collection(db,"cotacoes_presenciais"))]);
  cotacoesAdminCache=[...snap.docs.map(d=>({id:d.id,...d.data(),tipoLista:"online"})),...ps.docs.map(d=>({id:d.id,...d.data(),tipoLista:"presencial"}))].sort((a,b)=>(b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0));
  paginaCotacoesAtual=1;
  area.innerHTML=`<div class="filtro-cotacoes"><button type="button" id="migrar-acessos-cotacoes">ATUALIZAR ACESSO DOS FORNECEDORES</button><label>Filtrar por data <input type="date" id="filtro-data-cotacoes"></label><button type="button" id="limpar-filtro-cotacoes">LIMPAR</button></div><div class="abas-cotacoes" role="tablist"><button type="button" class="aba-cotacoes ativa" data-aba-admin="abertas">EM ABERTO</button><button type="button" class="aba-cotacoes" data-aba-admin="finalizadas">FINALIZADAS</button></div><div id="cotacoes-pagina"></div><div class="paginacao-cotacoes"><button type="button" id="cotacoes-anterior">ANTERIOR</button><span id="cotacoes-pagina-info"></span><button type="button" id="cotacoes-proxima">PRÓXIMA</button></div>`;
  let aba="abertas";
  const render=()=>{
   const data=document.getElementById("filtro-data-cotacoes")?.value||"";
   let lista=cotacoesAdminCache.filter(c=>!data||String(c.data||c.criadoEm?.toDate?.().toLocaleDateString("en-CA")||"").slice(0,10)===data);
   lista=lista.filter(c=>{if(c.tipoLista==="presencial")return c.status==="rascunho"?aba==="abertas":aba==="finalizadas";const dentroPrazo=!c.prazo||new Date(c.prazo)>new Date();const emAberto=c.status==="rascunho"||(c.status==="aberta"&&dentroPrazo);return aba==="abertas"?emAberto:!emAberto;});
   const paginas=Math.max(1,Math.ceil(lista.length/3));paginaCotacoesAtual=Math.min(paginaCotacoesAtual,paginas);const vis=lista.slice((paginaCotacoesAtual-1)*3,paginaCotacoesAtual*3);
   document.getElementById("cotacoes-pagina").innerHTML=vis.length?vis.map(c=>c.tipoLista==="presencial"?`<div class="aviso-modulo" style="margin:12px 0"><strong>${escaparHTML(c.titulo||"Cotação presencial")}</strong><p>Tipo: <b>Presencial</b> · Data: ${escaparHTML(c.data||"—")}</p><p>Status: ${c.status==="rascunho"?"Rascunho em edição":"Finalizada"} · Produtos: ${(c.itens||[]).length}</p>${c.status==="rascunho"?`<button type="button" data-editar-presencial="${escaparHTML(c.id)}">CONTINUAR RASCUNHO</button>`:`<p>Total geral: <b>${Number(c.valorTotal||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b></p>`}${c.status==="rascunho"?"":`<button type="button" data-detalhes-presencial="${escaparHTML(c.id)}">VER DETALHES</button><button type="button" data-exportar-presencial="${escaparHTML(c.id)}">PDF / IMPRIMIR</button>`}<button type="button" data-excluir-presencial="${escaparHTML(c.id)}">EXCLUIR</button></div>`:`<div class="aviso-modulo" style="margin:12px 0"><strong>${escaparHTML(c.titulo||"Cotação")}</strong><p>Status: <b>${c.status==="rascunho"?"Rascunho":c.status==="aberta"?"Aberta":"Finalizada"}</b> · Produtos: ${(c.produtos||[]).length}</p><p>Prazo: ${c.prazo?new Date(c.prazo).toLocaleString("pt-BR"):"Não informado"}</p>${c.descricao?`<p>Observações: ${escaparHTML(c.descricao)}</p>`:""}${c.status==="rascunho"?`<button type="button" data-editar-rascunho="${escaparHTML(c.id)}">EDITAR RASCUNHO</button><button type="button" data-excluir-online="${escaparHTML(c.id)}">EXCLUIR</button>`:`<button type="button" data-exportar-online="${escaparHTML(c.id)}">PDF / IMPRIMIR</button>${c.status==="aberta"?`<button type="button" data-encerrar-cotacao="${escaparHTML(c.id)}">ENCERRAR</button>`:""}<button type="button" data-excluir-online="${escaparHTML(c.id)}">EXCLUIR</button>`}</div>`).join(""):'<div class="aviso-modulo">Nenhuma cotação nesta aba.</div>';
   document.getElementById("cotacoes-pagina-info").textContent=`Página ${paginaCotacoesAtual} de ${paginas} · ${lista.length} cotações`;
   document.getElementById("cotacoes-anterior").disabled=paginaCotacoesAtual===1;document.getElementById("cotacoes-proxima").disabled=paginaCotacoesAtual>=paginas;
   area.querySelectorAll("[data-editar-presencial]").forEach(b=>b.onclick=()=>abrirFormularioPresencial(b.dataset.editarPresencial));
   area.querySelectorAll("[data-detalhes-presencial]").forEach(b=>b.onclick=()=>abrirDetalhesPresencial(b.dataset.detalhesPresencial));
   area.querySelectorAll("[data-editar-rascunho]").forEach(b=>b.onclick=()=>editarRascunhoCotacao(b.dataset.editarRascunho));
   area.querySelectorAll("[data-encerrar-cotacao]").forEach(b=>b.onclick=async()=>{if(confirm("Deseja encerrar esta cotação?")){await updateDoc(doc(db,"cotacoes",b.dataset.encerrarCotacao),{status:"encerrada"});await carregarListaCotacoesAdmin();}});
   area.querySelectorAll("[data-excluir-online]").forEach(b=>b.onclick=()=>excluirCotacaoOnline(b.dataset.excluirOnline));
   area.querySelectorAll("[data-excluir-presencial]").forEach(b=>b.onclick=async()=>{if(!confirm("Excluir permanentemente esta cotação presencial?"))return;try{await deleteDoc(doc(db,"cotacoes_presenciais",b.dataset.excluirPresencial));await carregarListaCotacoesAdmin();}catch(e){console.error(e);alert("Não foi possível excluir. Confira as regras do Firestore.");}});
   area.querySelectorAll("[data-exportar-online]").forEach(b=>b.onclick=()=>exportarCotacao("online",b.dataset.exportarOnline));area.querySelectorAll("[data-exportar-presencial]").forEach(b=>b.onclick=()=>exportarCotacao("presencial",b.dataset.exportarPresencial));
  };
  area.querySelectorAll("[data-aba-admin]").forEach(b=>b.onclick=()=>{aba=b.dataset.abaAdmin;paginaCotacoesAtual=1;area.querySelectorAll("[data-aba-admin]").forEach(x=>x.classList.toggle("ativa",x===b));render();});
  document.getElementById("migrar-acessos-cotacoes").onclick=migrarAcessosCotacoes;document.getElementById("filtro-data-cotacoes").onchange=()=>{paginaCotacoesAtual=1;render();};document.getElementById("limpar-filtro-cotacoes").onclick=()=>{document.getElementById("filtro-data-cotacoes").value="";paginaCotacoesAtual=1;render();};document.getElementById("cotacoes-anterior").onclick=()=>{paginaCotacoesAtual--;render();};document.getElementById("cotacoes-proxima").onclick=()=>{paginaCotacoesAtual++;render();};render();
 }catch(e){console.error(e);area.textContent="Não foi possível carregar as cotações.";}
}

async function migrarAcessosCotacoes(){
 if(!confirm("Atualizar o acesso de fornecedores em todas as cotações antigas? Isso apenas adiciona a lista de responsáveis com base nos vínculos já existentes."))return;
 try{const [cotSnap,vincSnap]=await Promise.all([getDocs(collection(db,"cotacoes")),getDocs(collection(db,"cotacao_fornecedores"))]);const porCotacao=new Map();vincSnap.docs.forEach(d=>{const v=d.data();if(!v.cotacaoId||!v.responsavelUid)return;if(!porCotacao.has(v.cotacaoId))porCotacao.set(v.cotacaoId,new Set());porCotacao.get(v.cotacaoId).add(v.responsavelUid);});let atualizadas=0;for(const c of cotSnap.docs){const uids=[...(porCotacao.get(c.id)||[])];if(uids.length){const atuais=c.data().responsaveisUids||[];const unidos=[...new Set([...atuais,...uids])];if(JSON.stringify([...atuais].sort())!==JSON.stringify([...unidos].sort())){await updateDoc(c.ref,{responsaveisUids:unidos});atualizadas++;}}}alert(`Migração concluída. ${atualizadas} cotação(ões) atualizada(s).`);await carregarListaCotacoesAdmin();}catch(e){console.error(e);alert("Não foi possível migrar. Confira se as regras atuais permitem ao administrador atualizar as cotações.");}}

async function excluirCotacaoOnline(id){if(!confirm("Excluir esta cotação e todas as respostas/vínculos relacionados? Esta ação não pode ser desfeita."))return;try{const [vs,rs]=await Promise.all([getDocs(query(collection(db,"cotacao_fornecedores"),where("cotacaoId","==",id))),getDocs(query(collection(db,"respostas"),where("cotacaoId","==",id)))]);const docs=[...vs.docs,...rs.docs];for(let i=0;i<docs.length;i+=450){const batch=writeBatch(db);docs.slice(i,i+450).forEach(d=>batch.delete(d.ref));await batch.commit();}await deleteDoc(doc(db,"cotacoes",id));await carregarListaCotacoesAdmin();}catch(e){console.error(e);alert("Não foi possível excluir a cotação. Confira as regras do Firestore.");}}


async function exportarCotacao(tipo,id){
  try {
    const snap=await getDoc(doc(db,tipo==="online"?"cotacoes":"cotacoes_presenciais",id));
    if(!snap.exists()) throw new Error("Cotação não encontrada");
    const c=snap.data();
    const dataHora=c.criadoEm?.toDate?c.criadoEm.toDate().toLocaleString("pt-BR"):new Date().toLocaleString("pt-BR");
    const presencial=tipo==="presencial";
    let linhas="";
    if(!presencial){
      linhas=(c.produtos||[]).map((p,i)=>`<tr><td>${i+1}</td><td>${escaparHTML(p.nome)}</td><td>${escaparHTML(p.codigoBarras||"—")}</td><td>${escaparHTML(p.unidade||"UN")}</td><td>${Number(p.quantidade||1).toLocaleString("pt-BR")}</td></tr>`).join("");
    } else {
      linhas=(c.itens||[]).map((p,i)=>{
        const vencedora=(c.fornecedores||[]).find(f=>f.fornecedorId===p.vencedorId);
        return `<tr><td>${i+1}</td><td>${escaparHTML(p.nome)}</td><td>${escaparHTML(p.codigoBarras||"—")}</td><td><strong>${escaparHTML(vencedora?.empresa||vencedora?.nome||"—")}</strong></td><td>${escaparHTML(p.unidade||"UN")}</td><td>${p.quantidade}</td><td>${Number(p.precoVencedor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td>${Number(p.total||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td>${escaparHTML(p.observacao||"—")}</td></tr>`;
      }).join("");
    }
    const headers=presencial
      ?"<th>Nº</th><th>Produto</th><th>Código de barras</th><th>Empresa vencedora</th><th>Un.</th><th>Qtd.</th><th>Preço vencedor</th><th>Total</th><th>Observações</th>"
      :"<th>Nº</th><th>Produto</th><th>Código de barras</th><th>Un.</th><th>Quantidade</th>";
    const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>${escaparHTML(c.titulo||"Cotação")}</title><style>
      body{font:14px Arial;padding:28px;color:#222}h1{color:#333}small{color:#555}
      .meta{margin:16px 0;line-height:1.7}table{width:100%;border-collapse:collapse;margin-top:20px}
      th,td{border:1px solid #bbb;padding:9px;text-align:left;vertical-align:top}
      th{background:#f2c928}tbody tr:nth-child(even){background:#fafafa}
      .total{margin-top:20px;font-size:18px;font-weight:bold}
      @media print{button{display:none}body{padding:0}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}}
    </style><h1>Compras Santa Rita</h1><h2>${escaparHTML(c.titulo||"Cotação")}</h2>
      <div class="meta">Tipo: ${presencial?"Presencial":"Online"}<br>Data: ${escaparHTML(c.data||dataHora)}<br>Gerado em: ${dataHora}<br>Status: ${escaparHTML(c.status||"Finalizada")}</div>
      ${c.descricao?`<p><b>Observações:</b> ${escaparHTML(c.descricao)}</p>`:""}
      <table><thead><tr>${headers}</tr></thead><tbody>${linhas}</tbody></table>
      ${presencial?`<h3>Resumo por empresa</h3><table><thead><tr><th>Empresa</th><th>Produtos vendidos</th><th>Total vendido</th></tr></thead><tbody>${(c.fornecedores||[]).map(f=>{const vencidos=(c.itens||[]).filter(i=>i.vencedorId===f.fornecedorId);const total=Number(c.totais?.[f.fornecedorId]??vencidos.reduce((s,i)=>s+Number(i.total||0),0));return `<tr><td>${escaparHTML(f.empresa||f.titular||"Empresa")}</td><td>${vencidos.length}</td><td>${total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td></tr>`;}).join("")}</tbody></table><div class="total">Total geral: ${Number(c.valorTotal||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</div>`:""}
      <p style="margin-top:30px;font-size:11px">Documento gerado pelo sistema Compras Santa Rita.</p>
      <button onclick="window.print()">Salvar como PDF / Imprimir</button></html>`;
    const w=window.open("","_blank");
    if(!w) throw new Error("Permita pop-ups para exportar a cotação.");
    w.document.write(html);w.document.close();
  } catch(e){console.error(e);alert(e.message||"Não foi possível exportar.");}
}

// MÓDULO DE RESPOSTAS — COMPARAÇÃO DE PREÇOS

async function abrirModuloRespostas(conteudo) {
  conteudo.innerHTML = `
    <div class="modulo-aberto">
      <h2>💰 Respostas dos fornecedores</h2>
      <p>Compare os preços recebidos em cada cotação.</p>
      <label for="filtro-cotacao-respostas">Selecione a cotação</label>
      <select id="filtro-cotacao-respostas"><option value="">Todas as cotações</option></select>
      <div id="lista-respostas-admin">Carregando respostas...</div>
      <button type="button" id="voltar-painel">VOLTAR AO PAINEL</button>
    </div>`;
  document.getElementById("voltar-painel").addEventListener("click", () => conteudo.innerHTML = "");
  const select = document.getElementById("filtro-cotacao-respostas");
  try {
    const snap = await getDocs(collection(db, "cotacoes"));
    snap.docs.forEach(d => {
      const o = document.createElement("option");
      o.value = d.id; o.textContent = d.data().titulo || "Cotação";
      select.appendChild(o);
    });
    select.addEventListener("change", carregarRespostasAdmin);
    await carregarRespostasAdmin();
  } catch (e) {
    console.error(e);
    document.getElementById("lista-respostas-admin").textContent = "Não foi possível carregar as cotações.";
  }
}

async function carregarRespostasAdmin(){
 const area=document.getElementById("lista-respostas-admin");if(!area)return;area.textContent="Carregando comparação de ofertas...";
 try{
  const filtro=document.getElementById("filtro-cotacao-respostas")?.value||"";
  const [cotSnap,resSnap,fornSnap]=await Promise.all([getDocs(collection(db,"cotacoes")),getDocs(collection(db,"respostas")),getDocs(collection(db,"fornecedores"))]);
  const cotacoes=new Map(cotSnap.docs.map(d=>[d.id,{id:d.id,...d.data()}]));
  const fornecedores=new Map(fornSnap.docs.map(d=>[d.id,d.data()]));
  const respostas=resSnap.docs.map(d=>d.data()).filter(r=>(!filtro||r.cotacaoId===filtro)&&Array.isArray(r.itens)&&r.itens.length>0);
  const grupos=new Map();respostas.forEach(r=>{if(!grupos.has(r.cotacaoId))grupos.set(r.cotacaoId,[]);grupos.get(r.cotacaoId).push(r);});
  const ids=filtro?[filtro]:[...grupos.keys()];const blocos=[];
  for(const id of ids){const c=cotacoes.get(id);if(!c)continue;const rs=grupos.get(id)||[];if(!rs.length)continue;
   const empresas=rs.map(r=>({id:r.fornecedorId,nome:fornecedores.get(r.fornecedorId)?.empresa||"Empresa removida",itens:r.itens||[],geral:r.observacaoGeral||""}));
   const produtos=c.produtos||[];
   const linhas=produtos.map((p,i)=>{const celulas=empresas.map(e=>{const it=e.itens.find(x=>Number(x.indiceProduto)===i);if(!it)return `<td class="comparacao-vazia">—</td>`;return `<td><strong>${it.indisponivel?"Não fornece":Number(it.preco||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</strong>${it.observacao?`<small>${escaparHTML(it.observacao)}</small>`:""}</td>`;}).join("");return `<tr><th scope="row"><strong>${escaparHTML(p.nome)}</strong><small>Código: ${escaparHTML(p.codigoBarras||"—")} · ${Number(p.quantidade||1)} ${escaparHTML(p.unidade||"UN")}</small></th>${celulas}</tr>`;}).join("");
   const exportId=`cotacao-export-${blocos.length}`;
   blocos.push(`<section class="comparacao-cotacao" id="${exportId}"><div class="comparacao-export-cabecalho"><div><span class="comparacao-export-kicker">COMPRAS SANTA RITA · MAPA DE PREÇOS</span><h3>${escaparHTML(c.titulo||"Cotação")}</h3><p class="comparacao-meta">${produtos.length} produtos · Prazo: ${c.prazo?new Date(c.prazo).toLocaleString("pt-BR"):"Não informado"}</p></div><div class="comparacao-export-acoes"><button type="button" data-exportar-pdf="${exportId}">↧ PDF</button></div></div><div class="comparacao-tabela-wrap"><table class="comparacao-tabela"><thead><tr><th>Produto</th>${empresas.map(e=>`<th>${escaparHTML(e.nome)}</th>`).join("")}</tr></thead><tbody>${linhas}</tbody></table></div>${empresas.filter(e=>e.geral).map(e=>`<p class="comparacao-observacao"><b>${escaparHTML(e.nome)}:</b> ${escaparHTML(e.geral)}</p>`).join("")}<p class="comparacao-export-rodape">Documento gerado pelo sistema Compras Santa Rita.</p></section>`);
  }
  area.innerHTML=blocos.join("")||'<div class="aviso-modulo">Ainda não há propostas para comparar nesta seleção.</div>';
  area.querySelectorAll("[data-exportar-pdf]").forEach(btn=>btn.addEventListener("click",()=>exportarComparacaoPDF(btn.dataset.exportarPdf)));
  
 }catch(e){console.error(e);area.textContent="Não foi possível carregar a comparação de ofertas.";}
}


// Exportação exclusiva do relatório de respostas da cotação online.
function exportarComparacaoPDF(id){
  const origem=document.getElementById(id);if(!origem)return;
  const janela=window.open("","_blank");
  if(!janela){alert("Permita pop-ups para gerar o PDF.");return;}
  const clone=origem.cloneNode(true);clone.querySelectorAll(".comparacao-export-acoes").forEach(x=>x.remove());
  janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mapa de preços</title><style>
    *{box-sizing:border-box}html{print-color-adjust:exact;-webkit-print-color-adjust:exact}body{font-family:Arial,Helvetica,sans-serif;color:#243244;margin:0;padding:24px;font-size:12px;line-height:1.45}.comparacao-cotacao{width:100%;border:0;border-radius:0;box-shadow:none;padding:0;margin:0}.comparacao-export-kicker{font-size:10px;letter-spacing:1.4px;color:#9a7610;font-weight:800}.comparacao-export-cabecalho{display:block;border-bottom:4px solid #174f83;padding:0 0 15px;margin-bottom:18px}.comparacao-export-cabecalho h3{font-size:23px;line-height:1.2;margin:7px 0;color:#173d5d}.comparacao-meta{font-size:11px;color:#5e6b78;margin:0}.comparacao-tabela-wrap{overflow:visible;border:0;border-radius:0}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10px}th,td{border:1px solid #cbd5df;padding:8px 7px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:normal}thead{display:table-header-group}thead th{background:#174f83!important;color:#fff!important;font-size:10px}tbody th{background:#edf2f7!important;color:#243244;min-width:0}tbody tr:nth-child(even) td{background:#f7f9fb}td small,th small{display:block;color:#64748b;font-size:9px;margin-top:4px}.comparacao-observacao{padding:9px 12px;background:#f5f7fa;border-left:3px solid #d6b43c;margin:10px 0;break-inside:avoid}.comparacao-export-rodape{margin-top:20px;padding-top:9px;border-top:1px solid #cbd5df;color:#687789;font-size:9px;text-align:right}@page{size:A4 landscape;margin:10mm}@media print{body{padding:0}tr{break-inside:avoid;page-break-inside:avoid}.comparacao-observacao{break-inside:avoid}}@media screen{body{max-width:1200px;margin:24px auto;background:#fff}}
  </style></head><body>${clone.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),350)<\/script></body></html>`);
  janela.document.close();
}


// MÓDULO DE USUÁRIOS

async function abrirModuloUsuarios(conteudo) {
  conteudo.innerHTML = `
    <div class="modulo-aberto">
      <h2>👥 Usuários</h2>
      <p>Consulte vendedores cadastrados e controle o acesso ao sistema.</p>
      <div id="lista-usuarios-admin">Carregando usuários...</div>
      <button type="button" id="voltar-painel">VOLTAR AO PAINEL</button>
    </div>`;
  document.getElementById("voltar-painel").addEventListener("click", () => conteudo.innerHTML = "");
  await carregarUsuariosAdmin();
}

async function carregarUsuariosAdmin() {
  const area = document.getElementById("lista-usuarios-admin");
  if (!area) return;
  try {
    const snap = await getDocs(collection(db, "usuarios"));
    const usuarios = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .sort((a,b) => String(a.nome || "").localeCompare(String(b.nome || ""), "pt-BR"));
    area.innerHTML = usuarios.length ? usuarios.map(u => `
      <div class="aviso-modulo" style="margin:12px 0">
        <strong>${escaparHTML(u.nome || "Sem nome")}</strong>
        <p>Perfil: ${escaparHTML(u.perfil || "Não informado")}</p>
        <p>Telefone: ${escaparHTML(u.telefone || "Não informado")}</p>
        <p>E-mail: ${escaparHTML(u.email || "Não informado")}</p>
        <p>Status: <strong style="color:${u.ativo === true ? "#267326" : "#c62828"}">${u.ativo === true ? "Ativo" : "Bloqueado"}</strong></p>
        ${u.perfil !== "admin" && u.id !== auth.currentUser?.uid ? `<button type="button" data-status-usuario="${escaparHTML(u.id)}">${u.ativo === true ? "BLOQUEAR USUÁRIO" : "ATIVAR USUÁRIO"}</button><button type="button" data-excluir-usuario="${escaparHTML(u.id)}">EXCLUIR CADASTRO</button>` : ""}
      </div>`).join("") : '<div class="aviso-modulo">Nenhum usuário cadastrado.</div>';
    area.querySelectorAll("[data-status-usuario]").forEach(b => b.addEventListener("click", async () => {
      const id = b.dataset.statusUsuario;
      const usuario = usuarios.find(u => u.id === id);
      const novoAtivo = usuario?.ativo !== true;
      if (!confirm(`Deseja ${novoAtivo ? "ativar" : "bloquear"} este usuário?`)) return;
      try {
        await updateDoc(doc(db, "usuarios", id), { ativo: novoAtivo });
        await carregarUsuariosAdmin();
      } catch (e) { console.error(e); alert("Não foi possível alterar o usuário."); }
    }));
    area.querySelectorAll("[data-excluir-usuario]").forEach(b=>b.addEventListener("click",async()=>{const id=b.dataset.excluirUsuario;if(!confirm("Excluir o cadastro deste vendedor e as empresas vinculadas? A conta de login do Firebase Authentication não será apagada por esta ação."))return;try{const fs=await getDocs(query(collection(db,"fornecedores"),where("responsavelUid","==",id)));for(const f of fs.docs)await deleteDoc(f.ref);await deleteDoc(doc(db,"usuarios",id));await carregarUsuariosAdmin();}catch(e){console.error(e);alert("Não foi possível excluir. Confira as regras do Firestore.");}}));
  } catch (erro) {
    console.error(erro);
    area.textContent = "Não foi possível carregar os usuários.";
  }
}

// COTAÇÕES RECEBIDAS — ÁREA DO VENDEDOR

async function carregarCotacoesFornecedor(uid) {
  const area=document.getElementById("lista-cotacoes-fornecedor");if(!area)return;
  try{
    const vinculosSnap=await getDocs(query(collection(db,"cotacao_fornecedores"),where("responsavelUid","==",uid)));
    const vinculos=vinculosSnap.docs.map(d=>({id:d.id,...d.data()}));
    const registros=await Promise.all(vinculos.map(async v=>{
      const [cotSnap,fornSnap,resSnap]=await Promise.all([getDoc(doc(db,"cotacoes",v.cotacaoId)),getDoc(doc(db,"fornecedores",v.fornecedorId)),getDoc(doc(db,"respostas",v.cotacaoId+"__"+v.fornecedorId))]);
      return {...v,cotacao:cotSnap.exists()?{id:cotSnap.id,...cotSnap.data()}:null,fornecedor:fornSnap.exists()?fornSnap.data():null,resposta:resSnap.exists()?resSnap.data():null};
    }));
    const agrupados=new Map();registros.filter(r=>r.cotacao&&r.fornecedor?.ativo===true).forEach(r=>{if(!agrupados.has(r.cotacaoId))agrupados.set(r.cotacaoId,{cotacao:r.cotacao,empresas:[]});agrupados.get(r.cotacaoId).empresas.push(r);});
    const lista=[...agrupados.values()].sort((a,b)=>new Date(a.cotacao.prazo||0)-new Date(b.cotacao.prazo||0));
    const cards=lista.map(g=>{const c=g.cotacao;const enviada=g.empresas.some(r=>r.resposta||r.status==="respondido");const aberta=!enviada&&c.status==="aberta"&&(!c.prazo||new Date(c.prazo)>new Date());const finalizada=enviada||!aberta;const prazo=c.prazo?new Date(c.prazo).toLocaleString("pt-BR"):"Sem prazo definido";return `<article class="cotacao-vendedor-card" data-status-vendedor="${finalizada?"finalizada":"aberta"}"><div class="cotacao-vendedor-topo"><span class="cotacao-vendedor-kicker">SOLICITAÇÃO DE PREÇOS</span><span class="cotacao-status ${aberta?"aberta":"encerrada"}">${enviada?"Resposta enviada":aberta?"Recebendo propostas":"Encerrada"}</span></div><h3>${escaparHTML(c.titulo||"Cotação sem título")}</h3><div class="cotacao-resumo-vendedor"><span><b>${(c.produtos||[]).length}</b> produtos</span><span>Prazo: ${escaparHTML(prazo)}</span></div><div class="cotacao-alerta-fixo cotacao-alerta-vendedor" role="note"><strong>ATENÇÃO!</strong><p>A quantidade e os valores dos produtos devem estar de acordo com a cotação. Caso haja divergências, a mercadoria será devolvida.</p></div>${c.descricao?`<div class="cotacao-descricao-vendedor"><b>Orientações do comprador</b><p>${escaparHTML(c.descricao)}</p></div>`:""}<div class="cotacao-empresas-titulo">Suas empresas disponíveis</div><div class="cotacao-empresas-vendedor">${g.empresas.map(r=>`<div class="cotacao-empresa-vendedor"><div class="cotacao-empresa-identidade"><span class="cotacao-empresa-icone">▦</span><div><strong>${escaparHTML(r.fornecedor.empresa||"Empresa sem nome")}</strong><small>${r.resposta?"Participou desta proposta":"Vinculada à cotação"}</small></div></div><span class="cotacao-empresa-status ${r.resposta?"respondida":"pendente"}">${r.resposta?"Respondida":"Disponível"}</span></div>`).join("")}</div>${aberta?`<button type="button" class="botao-cotacao-empresa cotacao-proposta-mista-btn" data-responder-cotacao="${escaparHTML(c.id)}">RESPONDER COTAÇÃO <span>›</span></button>`:enviada?`<button type="button" class="botao-cotacao-empresa cotacao-proposta-mista-btn" data-ver-resposta="${escaparHTML(c.id)}">VER MINHA RESPOSTA <span>›</span></button>`:`<p class="cotacao-aviso-encerrada">Esta cotação foi encerrada sem resposta.</p>`}${finalizada?`<div class="cotacao-acoes-download-vendedor"><button type="button" class="botao-cotacao-empresa" data-exportar-online="${escaparHTML(c.id)}">BAIXAR PDF</button></div>`:""}</article>`;}).join("");
    let cardsPresenciais="";
    try {
      const presenciaisSnap=await getDocs(query(collection(db,"cotacoes_presenciais"),where("responsaveisUids","array-contains",uid),where("status","==","finalizada")));
      cardsPresenciais=presenciaisSnap.docs.map(d=>{const c=d.data();return `<article class="cotacao-vendedor-card" data-status-vendedor="finalizada"><div class="cotacao-vendedor-topo"><span class="cotacao-vendedor-kicker">RESULTADO DE COTAÇÃO PRESENCIAL</span><span class="cotacao-status encerrada">Finalizada</span></div><h3>${escaparHTML(c.titulo||"Cotação presencial")}</h3><div class="cotacao-resumo-vendedor"><span><b>${(c.itens||[]).length}</b> produtos</span><span>Data: ${escaparHTML(c.data||"—")}</span></div><p>Resultado da compra e vendas por empresa.</p><div class="cotacao-acoes-download-vendedor"><button type="button" class="botao-cotacao-empresa" data-ver-presencial-fornecedor="${escaparHTML(d.id)}">CONSULTAR RESULTADO</button><button type="button" class="botao-cotacao-empresa" data-exportar-presencial="${escaparHTML(d.id)}">BAIXAR PDF</button></div></article>`;}).join("");
    } catch(e) { console.error("Não foi possível carregar cotações presenciais para o vendedor:",e); }
    area.innerHTML=`<div class="abas-cotacoes abas-cotacoes-vendedor" role="tablist"><button type="button" class="aba-cotacoes ativa" data-aba-vendedor="aberta">EM ABERTO</button><button type="button" class="aba-cotacoes" data-aba-vendedor="finalizada">FINALIZADAS</button></div><div id="cotacoes-vendedor-abertas">${cards}</div><div class="paginacao-cotacoes" id="paginacao-vendedor-abertas"><button type="button" id="vendedor-abertas-anterior">ANTERIOR</button><span id="vendedor-abertas-info"></span><button type="button" id="vendedor-abertas-proxima">PRÓXIMA</button></div><div id="cotacoes-vendedor-finalizadas" hidden>${cardsPresenciais}</div><div class="paginacao-cotacoes" id="paginacao-vendedor-finalizadas" hidden><button type="button" id="vendedor-finalizadas-anterior">ANTERIOR</button><span id="vendedor-finalizadas-info"></span><button type="button" id="vendedor-finalizadas-proxima">PRÓXIMA</button></div>`;
    const listaVendedorAbertas=[...area.querySelectorAll('#cotacoes-vendedor-abertas article[data-status-vendedor="aberta"]')];const listaVendedorFinalizadas=[...area.querySelectorAll('#cotacoes-vendedor-finalizadas article[data-status-vendedor="finalizada"]')];
    let paginaVendedorAbertas=1,paginaVendedorFinalizadas=1;
    const renderAbas=()=>{const abertas=listaVendedorAbertas;const finalizadas=listaVendedorFinalizadas;const desenhar=(lista,id,paginaId,anteriorId,proximaId,pagina)=>{const destino=area.querySelector(id),total=Math.max(1,Math.ceil(lista.length/3));pagina=Math.min(pagina,total);const vis=lista.slice((pagina-1)*3,pagina*3);destino.innerHTML=vis.map(x=>x.outerHTML).join("")||'<div class="cotacao-vazia-fornecedor"><strong>Nenhuma cotação nesta lista</strong><span>As cotações aparecerão aqui quando disponíveis.</span></div>';area.querySelector(paginaId).textContent=`Página ${pagina} de ${total} · ${lista.length} cotações`;area.querySelector(anteriorId).disabled=pagina===1;area.querySelector(proximaId).disabled=pagina>=total;return pagina;};paginaVendedorAbertas=desenhar(abertas,"#cotacoes-vendedor-abertas","#vendedor-abertas-info","#vendedor-abertas-anterior","#vendedor-abertas-proxima",paginaVendedorAbertas);paginaVendedorFinalizadas=desenhar(finalizadas,"#cotacoes-vendedor-finalizadas","#vendedor-finalizadas-info","#vendedor-finalizadas-anterior","#vendedor-finalizadas-proxima",paginaVendedorFinalizadas);};
    renderAbas();area.querySelectorAll("[data-aba-vendedor]").forEach(b=>b.onclick=()=>{area.querySelectorAll("[data-aba-vendedor]").forEach(x=>x.classList.toggle("ativa",x===b));area.querySelector("#cotacoes-vendedor-abertas").hidden=b.dataset.abaVendedor!=="aberta";area.querySelector("#paginacao-vendedor-abertas").hidden=b.dataset.abaVendedor!=="aberta";area.querySelector("#cotacoes-vendedor-finalizadas").hidden=b.dataset.abaVendedor!=="finalizada";area.querySelector("#paginacao-vendedor-finalizadas").hidden=b.dataset.abaVendedor!=="finalizada";});
    area.querySelector("#vendedor-abertas-anterior").onclick=()=>{paginaVendedorAbertas--;renderAbas();};area.querySelector("#vendedor-abertas-proxima").onclick=()=>{paginaVendedorAbertas++;renderAbas();};area.querySelector("#vendedor-finalizadas-anterior").onclick=()=>{paginaVendedorFinalizadas--;renderAbas();};area.querySelector("#vendedor-finalizadas-proxima").onclick=()=>{paginaVendedorFinalizadas++;renderAbas();};
    area.addEventListener("click",e=>{const b=e.target.closest("button");if(!b)return;if(b.dataset.responderCotacao)abrirFormularioResposta(b.dataset.responderCotacao);else if(b.dataset.verResposta)abrirFormularioResposta(b.dataset.verResposta);else if(b.dataset.verPresencialFornecedor)abrirDetalhesPresencialFornecedor(b.dataset.verPresencialFornecedor,uid);else if(b.dataset.exportarOnline)exportarCotacao("online",b.dataset.exportarOnline);else if(b.dataset.exportarPresencial)exportarCotacao("presencial",b.dataset.exportarPresencial);});
  }catch(erro){console.error("Erro ao carregar cotações do fornecedor:",erro);area.textContent="Não foi possível carregar as cotações.";}
}

async function abrirDetalhesPresencialFornecedor(id, uid) {
  try {
    const snap=await getDoc(doc(db,"cotacoes_presenciais",id));
    if(!snap.exists())throw new Error("Cotação não encontrada.");
    const c=snap.data();
    const permitido=(c.responsaveisUids||[]).includes(uid)||(c.fornecedores||[]).some(f=>f.responsavelUid===uid);
    if(!permitido)throw new Error("Você não tem autorização para visualizar esta cotação.");
    const fornecedores=c.fornecedores||[],itens=c.itens||[];
    const resumo=fornecedores.map(f=>{const vendidos=itens.filter(i=>i.vencedorId===f.fornecedorId);const total=Number(c.totais?.[f.fornecedorId]??vendidos.reduce((s,i)=>s+Number(i.total||0),0));return `<tr><td>${escaparHTML(f.empresa||f.titular||"Empresa")}</td><td>${vendidos.length}</td><td>${total.toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td></tr>`;}).join("");
    const linhas=itens.map((i,indice)=>{const vencedor=fornecedores.find(f=>f.fornecedorId===i.vencedorId);return `<tr><td>${indice+1}</td><td>${escaparHTML(i.nome||"Produto")}<br><small>Código: ${escaparHTML(i.codigoBarras||"Não informado")}</small></td><td>${Number(i.quantidade||0).toLocaleString("pt-BR")} ${escaparHTML(i.unidade||"UN")}</td><td>${escaparHTML(vencedor?.empresa||vencedor?.titular||"—")}</td><td>${Number(i.precoVencedor||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td>${Number(i.total||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td><td>${escaparHTML(i.observacao||"—")}</td></tr>`;}).join("");
    const modal=document.createElement("div");
    modal.style.cssText="position:fixed;inset:0;z-index:99998;background:#0009;display:flex;align-items:center;justify-content:center;padding:14px";
    modal.innerHTML=`<section role="dialog" aria-modal="true" aria-label="Resultado da cotação presencial" style="background:var(--card,#fff);color:var(--text,#222);width:min(100%,1000px);max-height:92vh;overflow:auto;border-radius:14px;padding:18px"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px"><div><h2 style="margin:0">${escaparHTML(c.titulo||"Cotação presencial")}</h2><p style="margin:5px 0 12px">Data: ${escaparHTML(c.data||"—")} · Somente visualização</p></div><button type="button" data-fechar-resultado aria-label="Fechar">FECHAR</button></div><h3>Produtos comprados</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:720px"><thead><tr><th>Nº</th><th>Produto / código de barras</th><th>Quantidade</th><th>Empresa vencedora</th><th>Preço unitário</th><th>Total</th><th>Observações</th></tr></thead><tbody>${linhas||'<tr><td colspan="7">Nenhum produto registrado.</td></tr>'}</tbody></table></div><h3>Resumo por empresa</h3><div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:420px"><thead><tr><th>Empresa</th><th>Produtos vendidos</th><th>Total vendido</th></tr></thead><tbody>${resumo}</tbody></table></div><h3>Total geral: ${Number(c.valorTotal||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</h3></section>`;
    document.body.appendChild(modal);
    const fechar=()=>modal.remove();modal.querySelector("[data-fechar-resultado]").onclick=fechar;modal.addEventListener("click",e=>{if(e.target===modal)fechar();});
  } catch(e) { console.error(e); alert(e.message||"Não foi possível abrir o resultado da cotação."); }
}

async function abrirFormularioResposta(cotacaoId) {
 const area=document.getElementById("form-resposta-fornecedor");if(!area)return;
 try{
  const uid=auth.currentUser?.uid;if(!uid)throw new Error("Faça login novamente para responder.");
  const snap=await getDoc(doc(db,"cotacoes",cotacaoId));if(!snap.exists())throw new Error("Cotação não encontrada.");
  const cot=snap.data();
  const vinculosSnap=await getDocs(query(collection(db,"cotacao_fornecedores"),where("responsavelUid","==",uid)));
  const vinculos=vinculosSnap.docs.map(d=>({id:d.id,...d.data()})).filter(v=>v.cotacaoId===cotacaoId);
  if(!vinculos.length)throw new Error("Nenhuma empresa sua está vinculada a esta cotação.");
  const empresas=(await Promise.all(vinculos.map(async v=>{const [fs,rs]=await Promise.all([getDoc(doc(db,"fornecedores",v.fornecedorId)),getDoc(doc(db,"respostas",cotacaoId+"__"+v.fornecedorId))]);if(!fs.exists()||fs.data().ativo!==true)return null;return{fornecedorId:v.fornecedorId,vinculoId:v.id,empresa:fs.data().empresa||"Empresa sem nome",resposta:rs.exists()?rs.data():null,status:v.status};}))).filter(Boolean);
  const enviada=empresas.some(e=>e.resposta||e.status==="respondido");
  const produtos=cot.produtos||[];
  const ofertas=new Map();empresas.forEach(e=>(e.resposta?.itens||[]).forEach(it=>{const i=Number(it.indiceProduto);if(!ofertas.has(i))ofertas.set(i,[]);ofertas.get(i).push({...it,empresa:e.empresa});}));
  area.style.display="block";area.dataset.cotacaoId=cotacaoId;
  const aviso=`<div class="cotacao-alerta-fixo cotacao-alerta-vendedor" role="note"><strong>ATENÇÃO!</strong><p>A quantidade e os valores dos produtos devem estar de acordo com a cotação. Caso haja divergências, a mercadoria será devolvida.</p></div>`;
  if(enviada){
   const linhas=produtos.map((p,i)=>{const lista=ofertas.get(i)||[];const valor=lista.length?lista.map(it=>`<div class="resposta-oferta-consulta"><b>${escaparHTML(it.empresa)}</b><span>${it.indisponivel?"Não fornece":Number(it.preco||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</span>${it.observacao?`<small>${escaparHTML(it.observacao)}</small>`:""}</div>`).join(""):'<span class="comparacao-vazia">Não cotado</span>';return `<tr><td><b>${escaparHTML(p.nome||"Produto")}</b><small>Código: ${escaparHTML(p.codigoBarras||"—")}</small></td><td>${Number(p.quantidade||1).toLocaleString("pt-BR")} ${escaparHTML(p.unidade||"UN")}</td><td>${valor}</td></tr>`;}).join("");
   const gerais=empresas.filter(e=>e.resposta?.observacaoGeral).map(e=>`<p><b>${escaparHTML(e.empresa)}:</b> ${escaparHTML(e.resposta.observacaoGeral)}</p>`).join("");
   area.innerHTML=`<section class="resposta-online-shell resposta-planilha"><header class="resposta-online-header"><button type="button" class="resposta-fechar" id="cancelar-resposta" aria-label="Fechar">×</button><div class="resposta-cabecalho-identidade"><span class="resposta-online-eyebrow">COMPRAS SANTA RITA · COTAÇÃO ONLINE</span><h3>${escaparHTML(cot.titulo||"Cotação")}</h3><div class="resposta-online-metricas"><span><b>${produtos.length}</b> produtos</span><span>Resposta enviada</span></div></div><span class="resposta-status-enviada">ENVIADA · SOMENTE LEITURA</span></header>${aviso}<div class="resposta-consulta-conteudo"><h4>Sua proposta enviada</h4><div class="resposta-tabela-scroll"><table class="resposta-tabela"><thead><tr><th>Produto / código</th><th>Quantidade</th><th>Empresa e preço informado</th></tr></thead><tbody>${linhas}</tbody></table></div>${gerais?`<div class="resposta-consulta-gerais"><b>Condições comerciais</b>${gerais}</div>`:""}<p class="resposta-consulta-bloqueio">Esta proposta já foi enviada e está bloqueada para novas alterações ou reenvios.</p></div></section>`;
   document.getElementById("cancelar-resposta").onclick=()=>{area.style.display="none";area.innerHTML="";};area.scrollIntoView({behavior:"smooth",block:"start"});return;
  }
  if(cot.status!=="aberta"||(cot.prazo&&new Date(cot.prazo)<=new Date())){alert("O prazo desta cotação terminou.");return;}
  const dados=new Map();const geral="";
  area._empresas=empresas;area._rascunho=dados;
  area.innerHTML=`<section class="resposta-online-shell resposta-planilha"><header class="resposta-online-header"><button type="button" class="resposta-fechar" id="cancelar-resposta" aria-label="Fechar">×</button><div class="resposta-cabecalho-identidade"><span class="resposta-online-eyebrow">COMPRAS SANTA RITA · COTAÇÃO ONLINE</span><h3>${escaparHTML(cot.titulo||"Cotação")}</h3><div class="resposta-online-metricas"><span><b>${produtos.length}</b> produtos</span><span>Prazo: <b>${cot.prazo?new Date(cot.prazo).toLocaleDateString("pt-BR"):"—"}</b></span></div></div><button type="submit" form="form-resposta" id="enviar-resposta-topo" class="resposta-salvar-topo">ENVIAR RESPOSTA</button></header>${aviso}${cot.descricao?`<div class="resposta-orientacoes"><strong>Orientações do comprador</strong><p>${escaparHTML(cot.descricao)}</p></div>`:""}<form id="form-resposta" class="resposta-online-form"><div class="resposta-lista-cabecalho"><div><span class="resposta-online-eyebrow">PREENCHIMENTO DA PROPOSTA</span><h4>Informe seus preços por produto</h4></div><span id="resposta-progresso-texto"></span></div><div class="resposta-progresso-trilho"><span id="resposta-progresso-barra"></span></div><div class="resposta-tabela-legenda"><span>Preencha o preço e escolha a empresa responsável por cada oferta.</span></div><div id="resposta-itens-pagina"></div><div class="paginacao-resposta"><button type="button" id="resposta-anterior">← Anterior</button><span id="resposta-pagina-info"></span><button type="button" id="resposta-proxima">Próxima →</button></div><label class="resposta-condicoes-gerais">Condições comerciais gerais (opcional)<textarea id="resposta-observacao-geral" rows="3" placeholder="Prazo de entrega, pagamento, validade..."></textarea></label><button type="submit" id="enviar-resposta" class="resposta-enviar-btn">ENVIAR ORÇAMENTO</button><p id="mensagem-resposta" role="status"></p></form></section>`;
  document.getElementById("resposta-observacao-geral").value=geral;
  const porPagina=10;let pagina=0;const total=produtos.length;
  const guardar=()=>area.querySelectorAll("[data-resposta-item]").forEach(bloco=>{const n=Number(bloco.dataset.respostaItem);dados.set(n,{fornecedorId:bloco.querySelector(`[name="empresa-${n}"]`)?.value||"",indisponivel:!!bloco.querySelector(`[name="indisponivel-${n}"]`)?.checked,preco:bloco.querySelector(`[name="preco-${n}"]`)?.value||"",observacao:bloco.querySelector(`[name="obs-${n}"]`)?.value||""});});
  const progresso=()=>{const preenchidos=produtos.reduce((acc,_,i)=>{const d=dados.get(i)||{};return acc+(d.fornecedorId&&(d.indisponivel||Number(d.preco)>0)?1:0);},0);document.getElementById("resposta-progresso-texto").textContent=`${preenchidos} de ${total} produtos`;document.getElementById("resposta-progresso-barra").style.width=`${total?preenchidos/total*100:0}%`;};
  const render=()=>{const inicio=pagina*porPagina;const linhas=produtos.slice(inicio,inicio+porPagina).map((p,i)=>{const n=inicio+i,d=dados.get(n)||{};return `<tr class="resposta-linha-produto" data-resposta-item="${n}"><td class="resposta-col-item"><span class="resposta-produto-numero">${String(n+1).padStart(2,"0")}</span></td><td class="resposta-col-produto"><strong>${escaparHTML(p.nome||"Produto")}</strong><small>Código de barras: ${escaparHTML(p.codigoBarras||"Não informado")}</small></td><td class="resposta-col-qtd"><strong>${Number(p.quantidade||1).toLocaleString("pt-BR")}</strong><small>${escaparHTML(p.unidade||"UN")}</small></td><td class="resposta-col-empresa"><select aria-label="Empresa para ${escaparHTML(p.nome||"produto")}" name="empresa-${n}"><option value="">Selecione</option>${empresas.map(e=>`<option value="${escaparHTML(e.fornecedorId)}">${escaparHTML(e.empresa)}</option>`).join("")}</select></td><td class="resposta-col-preco"><div class="resposta-preco-campo"><span>R$</span><input aria-label="Preço unitário de ${escaparHTML(p.nome||"produto")}" name="preco-${n}" type="number" min="0.01" step="0.01" inputmode="decimal" placeholder="0,00"></div></td><td class="resposta-col-indisponivel"><label class="resposta-indisponivel"><input type="checkbox" name="indisponivel-${n}"><span>Indisponível</span></label></td><td class="resposta-col-obs"><input aria-label="Observação para ${escaparHTML(p.nome||"produto")}" name="obs-${n}" placeholder="Marca, entrega, bonificação..."></td></tr>`;}).join("");document.getElementById("resposta-itens-pagina").innerHTML=`<div class="resposta-tabela-scroll"><table class="resposta-tabela"><thead><tr><th class="resposta-th-item">Nº</th><th>Produto / código de barras</th><th>Quantidade</th><th>Empresa</th><th>Seu preço</th><th>Disponibilidade</th><th>Observações</th></tr></thead><tbody>${linhas||'<tr><td colspan="7">Nenhum produto nesta cotação.</td></tr>'}</tbody></table></div>`;document.getElementById("resposta-pagina-info").textContent=`${inicio+1}–${Math.min(inicio+porPagina,total)} de ${total}`;document.getElementById("resposta-anterior").disabled=pagina===0;document.getElementById("resposta-proxima").disabled=(pagina+1)*porPagina>=total;area.querySelectorAll("[data-resposta-item] input, [data-resposta-item] select").forEach(el=>{el.addEventListener("input",()=>{guardar();progresso();});el.addEventListener("change",()=>{guardar();progresso();});});area.querySelectorAll('[name^="indisponivel-"]').forEach(chk=>chk.addEventListener("change",()=>{const bloco=chk.closest("[data-resposta-item]"),n=Number(bloco.dataset.respostaItem),preco=bloco.querySelector(`[name="preco-${n}"]`);preco.disabled=chk.checked;if(chk.checked)preco.value="";guardar();progresso();}));progresso();};
  document.getElementById("resposta-anterior").onclick=()=>{guardar();pagina--;render();};document.getElementById("resposta-proxima").onclick=()=>{guardar();pagina++;render();};document.getElementById("cancelar-resposta").onclick=()=>{area.style.display="none";area.innerHTML="";};render();document.getElementById("form-resposta").addEventListener("submit",enviarRespostaFornecedor);area.scrollIntoView({behavior:"smooth",block:"start"});
 }catch(e){console.error(e);alert(`Não foi possível abrir esta cotação. ${e.message||"Verifique o acesso."}`);}
}


async function enviarRespostaFornecedor(evento){
 evento.preventDefault();const area=document.getElementById("form-resposta-fornecedor"),cotacaoId=area.dataset.cotacaoId,uid=auth.currentUser?.uid;if(!uid)return;
 const botao=document.getElementById("enviar-resposta"),botaoTopo=document.getElementById("enviar-resposta-topo");if(botao?.disabled)return;
 const cotSnap=await getDoc(doc(db,"cotacoes",cotacaoId));if(!cotSnap.exists()||cotSnap.data().status!=="aberta"){mensagemNaTela("mensagem-resposta","Esta cotação foi encerrada.",true);return;}
 area.querySelectorAll("[data-resposta-item]").forEach(bloco=>{const n=Number(bloco.dataset.respostaItem);area._rascunho.set(n,{fornecedorId:bloco.querySelector(`[name="empresa-${n}"]`)?.value||"",indisponivel:!!bloco.querySelector(`[name="indisponivel-${n}"]`)?.checked,preco:bloco.querySelector(`[name="preco-${n}"]`)?.value||"",observacao:bloco.querySelector(`[name="obs-${n}"]`)?.value||""});});
 const cot=cotSnap.data(),empresas=area._empresas||[],ids=new Set(empresas.map(e=>e.fornecedorId)),porEmpresa=new Map(empresas.map(e=>[e.fornecedorId,[]]));
 for(let i=0;i<(cot.produtos||[]).length;i++){const p=cot.produtos[i],o=area._rascunho.get(i)||{};if(!o.fornecedorId){if(o.preco||o.indisponivel||String(o.observacao||"").trim()){mensagemNaTela("mensagem-resposta","Selecione a empresa para o produto preenchido.",true);return;}continue;}if(!ids.has(o.fornecedorId)){mensagemNaTela("mensagem-resposta","Selecione uma das suas empresas cadastradas.",true);return;}const preco=o.preco===""?null:Number(o.preco);if(!o.indisponivel&&(!Number.isFinite(preco)||preco<=0)){mensagemNaTela("mensagem-resposta","Informe o preço ou marque que a empresa não tem o produto.",true);return;}porEmpresa.get(o.fornecedorId).push({indiceProduto:i,produtoId:p.produtoId,nome:p.nome,descricao:p.descricao||"",codigoBarras:p.codigoBarras||"",unidade:p.unidade||"UN",quantidade:Number(p.quantidade||1),indisponivel:!!o.indisponivel,preco:o.indisponivel?null:preco,observacao:String(o.observacao||"").trim()});}
 const total=Array.from(porEmpresa.values()).reduce((a,b)=>a+b.length,0);if(!total){mensagemNaTela("mensagem-resposta","Preencha pelo menos uma oferta antes de enviar.",true);return;}
 const geral=document.getElementById("resposta-observacao-geral").value.trim();if(botao)botao.disabled=true;if(botaoTopo)botaoTopo.disabled=true;if(botao)botao.textContent="ENVIANDO ORÇAMENTO...";if(botaoTopo)botaoTopo.textContent="ENVIANDO...";
 try{
  await runTransaction(db,async tx=>{
   const vinculos=await Promise.all(empresas.map(e=>tx.get(doc(db,"cotacao_fornecedores",e.vinculoId))));
   if(vinculos.some(v=>!v.exists()||v.data().status==="respondido"))throw new Error("RESPOSTA_JA_ENVIADA");
   for(let i=0;i<empresas.length;i++){
    const e=empresas[i],itens=porEmpresa.get(e.fornecedorId)||[];
    if(itens.length)tx.set(doc(db,"respostas",cotacaoId+"__"+e.fornecedorId),{cotacaoId,fornecedorId:e.fornecedorId,responsavelUid:uid,itens,observacaoGeral:geral,enviadoEm:serverTimestamp()});
    tx.update(doc(db,"cotacao_fornecedores",e.vinculoId),{status:"respondido",respondidoEm:serverTimestamp()});
   }
  });
  mensagemNaTela("mensagem-resposta","Orçamento enviado! Sua proposta foi bloqueada para edição e reenvio.");area.style.display="none";area.innerHTML="";await carregarCotacoesFornecedor(uid);
 }catch(e){console.error(e);const msg=e.message==="RESPOSTA_JA_ENVIADA"?"Esta cotação já foi enviada. Não é possível enviar novamente ou alterar os preços.":`Não foi possível enviar. ${e.code||e.message||"Verifique as regras do Firebase."}`;mensagemNaTela("mensagem-resposta",msg,true);if(botao){botao.disabled=false;botao.textContent="ENVIAR ORÇAMENTO";}if(botaoTopo){botaoTopo.disabled=false;botaoTopo.textContent="ENVIAR RESPOSTA";}}
}

// MENSAGEM DOS PRODUTOS

function mostrarMensagemProduto(texto, erro = false) {
  const elemento = document.getElementById("mensagem-produto");

  if (!elemento) return;

  elemento.textContent = texto;
  elemento.style.color = erro ? "#c62828" : "#267326";
  elemento.style.margin = "12px 0";
}

// CARREGAR PRODUTOS

async function carregarProdutos() {
  const lista = document.getElementById("lista-produtos");
  const mensagem = document.getElementById("mensagem-lista");

  if (!lista) return;

  lista.textContent = "Carregando produtos...";

  if (mensagem) mensagem.textContent = "";

  try {
    const resultado = await getDocs(collection(db, "produtos"));

    todosProdutos = resultado.docs.map(documento => ({
      id: documento.id,
      ...documento.data()
    }));

    todosProdutos.sort((a, b) =>
      String(a.nome || "").localeCompare(
        String(b.nome || ""),
        "pt-BR"
      )
    );

    filtrarProdutos();

  } catch (erro) {
    console.error("Erro ao consultar produtos:", erro);

    lista.textContent = "Não foi possível carregar os produtos.";

    if (mensagem) {
      mensagem.textContent =
        "Verifique sua conexão e tente novamente.";

      mensagem.style.color = "#c62828";
    }
  }
}

// FILTRAR PRODUTOS

function filtrarProdutos() {
  const campoPesquisa = document.getElementById("pesquisa-produto");

  if (!campoPesquisa) return;

  const pesquisa = normalizarTexto(campoPesquisa.value);

  produtosEncontrados = todosProdutos.filter(produto => {
    const nome = normalizarTexto(produto.nome);
    const codigo = normalizarTexto(produto.codigoBarras);

    return nome.includes(pesquisa) || codigo.includes(pesquisa);
  });

  paginaAtual = 0;

  renderizarProdutos();
}

function pesquisarProdutos() {
  filtrarProdutos();
}

// RENDERIZAR PRODUTOS

function renderizarProdutos() {
  const lista = document.getElementById("lista-produtos");
  const numeroPagina = document.getElementById("numero-pagina");
  const anterior = document.getElementById("pagina-anterior");
  const proxima = document.getElementById("pagina-proxima");

  if (!lista || !numeroPagina || !anterior || !proxima) return;

  const inicio = paginaAtual * LIMITE_PRODUTOS;
  const fim = inicio + LIMITE_PRODUTOS;

  produtosCarregados = produtosEncontrados.slice(inicio, fim);

  temProximaPagina = produtosEncontrados.length > fim;

  const totalPaginas = Math.max(
    1,
    Math.ceil(produtosEncontrados.length / LIMITE_PRODUTOS)
  );

  numeroPagina.textContent =
    `Página ${paginaAtual + 1} de ${totalPaginas}`;

  anterior.disabled = paginaAtual === 0;
  proxima.disabled = !temProximaPagina;

  if (produtosCarregados.length === 0) {
    lista.innerHTML = `
      <div class="aviso-modulo">
        Nenhum produto encontrado.
      </div>
    `;
    return;
  }

  lista.innerHTML = produtosCarregados.map(produto => {
    const ativo = produto.ativo === true;

    return `
      <div class="aviso-modulo produto-linha">

        <div class="produto-cabecalho" style="display:flex;align-items:center;gap:10px">

          ${produto.foto ? `
            <img
              src="${produto.foto}"
              alt=""
              loading="lazy"
              style="width:48px;height:48px;object-fit:contain;border:1px solid #ddd;border-radius:6px;background:#fff;flex-shrink:0"
                          >
          ` : `
            <div style="width:48px;height:48px;display:flex;align-items:center;justify-content:center;border:1px dashed #ccc;border-radius:6px;color:#999;flex-shrink:0">
              📦
            </div>
          `}

          <strong style="flex:1">${escaparHTML(produto.nome)}</strong>

          <span
            class="produto-situacao"
            style="color:${ativo ? "#267326" : "#c62828"}"
          >
            ${ativo ? "Ativo" : "Inativo"}
          </span>

        </div>

        <p class="produto-codigo">
          Código de barras:
          ${escaparHTML(produto.codigoBarras || "Não informado")}
        </p>

        <details>

          <summary>Opções</summary>

          <button
            type="button"
            data-editar="${escaparHTML(produto.id)}"
          >
            EDITAR
          </button>

          <button type="button" data-alterar-status="${escaparHTML(produto.id)}">${ativo ? "DESATIVAR" : "ATIVAR"}</button>
          <button type="button" data-excluir-produto="${escaparHTML(produto.id)}">EXCLUIR</button>

        </details>

      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-editar]").forEach(botao => {
    botao.addEventListener("click", () => {
      editarProduto(botao.dataset.editar);
    });
  });

  lista.querySelectorAll("[data-excluir-produto]").forEach(botao=>botao.addEventListener("click",async()=>{const id=botao.dataset.excluirProduto;const pr=produtosCarregados.find(x=>x.id===id);if(!confirm(`Excluir permanentemente o produto "${pr?.nome||""}"?`))return;try{const ps=await getDoc(doc(db,"produtos",id));const codigo=String(ps.data()?.codigoBarras||"").replace(/\D/g,"");if(codigo){const ix=await getDoc(doc(db,"codigos_barras",codigo));if(ix.exists()&&ix.data().produtoId===id)await deleteDoc(doc(db,"codigos_barras",codigo));}await deleteDoc(doc(db,"produtos",id));await carregarProdutos();}catch(e){console.error(e);alert("Não foi possível excluir o produto. Confira as regras do Firestore.");}}));

  lista.querySelectorAll("[data-alterar-status]").forEach(botao => {
    botao.addEventListener("click", () => {
      alterarStatusProduto(botao.dataset.alterarStatus);
    });
  });
}

// PAGINAÇÃO

function proximaPagina() {
  if (!temProximaPagina) return;

  paginaAtual++;

  renderizarProdutos();
}

function paginaAnterior() {
  if (paginaAtual === 0) return;

  paginaAtual--;

  renderizarProdutos();
}

// FOTO DO PRODUTO: COMPRESSÃO E PRÉ-VISUALIZAÇÃO
function atualizarPreviaFotoProduto() {
  const imagem = document.getElementById("produto-foto-preview");
  const semImagem = document.getElementById("produto-foto-sem-imagem");
  const botaoRemover = document.getElementById("remover-foto-produto");

  if (!imagem || !semImagem || !botaoRemover) return;

  if (fotoProdutoAtual) {
    imagem.src = fotoProdutoAtual;
    imagem.style.display = "block";
    semImagem.style.display = "none";
    botaoRemover.style.display = "inline-block";
  } else {
    imagem.removeAttribute("src");
    imagem.style.display = "none";
    semImagem.style.display = "block";
    botaoRemover.style.display = "none";
  }
}

function comprimirImagemProduto(arquivo) {
  return new Promise((resolve, reject) => {
    if (!arquivo || !arquivo.type.startsWith("image/")) {
      reject(new Error("Selecione um arquivo de imagem válido."));
      return;
    }

    if (arquivo.size > 12 * 1024 * 1024) {
      reject(new Error("A foto original deve ter no máximo 12 MB."));
      return;
    }

    const leitor = new FileReader();

    leitor.onerror = () => reject(new Error("Não foi possível ler a imagem."));

    leitor.onload = () => {
      const imagem = new Image();

      imagem.onerror = () => reject(new Error("A imagem selecionada não pôde ser aberta."));

      imagem.onload = () => {
        const limiteLado = 320;
        const proporcao = Math.min(
          1,
          limiteLado / Math.max(imagem.width, imagem.height)
        );

        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, Math.round(imagem.width * proporcao));
        canvas.height = Math.max(1, Math.round(imagem.height * proporcao));

        const contexto = canvas.getContext("2d");

        if (!contexto) {
          reject(new Error("Não foi possível preparar a imagem."));
          return;
        }

        contexto.fillStyle = "#ffffff";
        contexto.fillRect(0, 0, canvas.width, canvas.height);
        contexto.drawImage(imagem, 0, 0, canvas.width, canvas.height);

        // Mantém a imagem em torno de 100 KB para não sobrecarregar o documento.
        let qualidade = 0.78;
        let resultado = canvas.toDataURL("image/jpeg", qualidade);

        while (resultado.length > 140000 && qualidade > 0.35) {
          qualidade -= 0.08;
          resultado = canvas.toDataURL("image/jpeg", qualidade);
        }

        if (resultado.length > 180000) {
          reject(new Error("Não foi possível reduzir a foto o suficiente. Escolha outra imagem."));
          return;
        }

        resolve(resultado);
      };

      imagem.src = leitor.result;
    };

    leitor.readAsDataURL(arquivo);
  });
}

async function selecionarFotoProduto(evento) {
  const arquivo = evento.target.files?.[0];

  if (!arquivo) return;

  mostrarMensagemProduto("Preparando foto...");

  try {
    fotoProdutoAtual = await comprimirImagemProduto(arquivo);
    atualizarPreviaFotoProduto();
    mostrarMensagemProduto("Foto pronta! Ela será salva junto com o produto.");
  } catch (erro) {
    console.error("Erro ao preparar foto:", erro);
    evento.target.value = "";
    mostrarMensagemProduto(erro.message || "Não foi possível preparar a foto.", true);
  }
}

function removerFotoProduto() {
  fotoProdutoAtual = "";

  const campo = document.getElementById("produto-foto");
  if (campo) campo.value = "";

  atualizarPreviaFotoProduto();
  mostrarMensagemProduto("A foto será removida quando você salvar o produto.");
}

// EDITAR PRODUTO

function editarProduto(id) {
  const produto = produtosCarregados.find(item => item.id === id);

  if (!produto) return;

  produtoEditandoId = id;

  document.getElementById("area-formulario-produto")
    .style.display = "block";

  document.getElementById("titulo-form-produto")
    .textContent = "Editar produto";

  document.getElementById("produto-nome").value =
    produto.nome || "";

  document.getElementById("produto-codigo").value =
    produto.codigoBarras || "";

  document.getElementById("produto-departamento").value =
    produto.departamento || "";

  document.getElementById("produto-categoria").value =
    produto.categoria || "";

  document.getElementById("produto-unidade").value =
    produto.unidade || "";

  document.getElementById("produto-ativo").checked =
    produto.ativo === true;

  fotoProdutoAtual = produto.foto || "";
  atualizarPreviaFotoProduto();

  document.getElementById("produto-foto").value = "";

  document.getElementById("botao-salvar-produto")
    .textContent = "ATUALIZAR PRODUTO";

  document.getElementById("produto-nome").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

// LIMPAR FORMULÁRIO DE PRODUTO

function limparFormularioProduto() {
  produtoEditandoId = null;

  document.getElementById("form-produto").reset();

  fotoProdutoAtual = "";
  atualizarPreviaFotoProduto();

  document.getElementById("produto-ativo").checked = true;

  document.getElementById("titulo-form-produto")
    .textContent = "Novo produto";

  document.getElementById("botao-salvar-produto")
    .textContent = "SALVAR PRODUTO";

  document.getElementById("area-formulario-produto")
    .style.display = "none";

  mostrarMensagemProduto("");
}

// SALVAR PRODUTO

async function salvarProduto(evento) {
  evento.preventDefault();

  const botao = document.getElementById("botao-salvar-produto");

  const idEmEdicao = produtoEditandoId;

  const dados = {
    nome: document.getElementById("produto-nome").value.trim(),

    codigoBarras: document.getElementById("produto-codigo").value.replace(/\s+/g, "").trim(),

    departamento: document.getElementById("produto-departamento").value.trim(),

    categoria: document.getElementById("produto-categoria").value.trim(),

    unidade: document.getElementById("produto-unidade").value,

    ativo: document.getElementById("produto-ativo").checked,

    foto: fotoProdutoAtual || ""
  };

  if (
    !dados.nome ||
    !dados.departamento ||
    !dados.categoria ||
    !dados.unidade
  ) {
    mostrarMensagemProduto(
      "Preencha todos os campos obrigatórios.",
      true
    );
    return;
  }

  botao.disabled = true;
  botao.textContent = "SALVANDO...";

  try {
    // Impede cadastrar o mesmo código de barras em produtos diferentes.
    // Na edição, permite manter o código do próprio produto.
    if (dados.codigoBarras) {
      const consultaCodigo = query(
        collection(db, "produtos"),
        where("codigoBarras", "==", dados.codigoBarras)
      );

      const resultadoCodigo = await getDocs(consultaCodigo);
      const duplicado = resultadoCodigo.docs.find(
        documento => documento.id !== idEmEdicao
      );

      if (duplicado) {
        mostrarMensagemProduto(
          `Este código de barras já está cadastrado no produto "${duplicado.data().nome || "Produto sem nome"}". Confira o código antes de continuar.`,
          true
        );
        document.getElementById("produto-codigo").focus();
        return;
      }
    }

    if (idEmEdicao) {
      await updateDoc(doc(db, "produtos", idEmEdicao), dados);

    } else {
      await addDoc(collection(db, "produtos"), {
        ...dados,
        criadoEm: serverTimestamp()
      });
    }

    limparFormularioProduto();

    paginaAtual = 0;

    await carregarProdutos();

    const mensagemLista = document.getElementById("mensagem-lista");

    if (mensagemLista) {
      mensagemLista.textContent = idEmEdicao
        ? "Produto atualizado com sucesso!"
        : "Produto cadastrado com sucesso!";

      mensagemLista.style.color = "#267326";
    }

  } catch (erro) {
    console.error("Erro ao salvar produto:", erro);

    mostrarMensagemProduto(
      "Não foi possível salvar o produto. Tente novamente.",
      true
    );

  } finally {
    botao.disabled = false;

    botao.textContent = produtoEditandoId
      ? "ATUALIZAR PRODUTO"
      : "SALVAR PRODUTO";
  }
}
// ATIVAR OU DESATIVAR PRODUTO

async function alterarStatusProduto(id) {
  const produto = produtosCarregados.find(item => item.id === id);

  if (!produto) return;

  const novoStatus = produto.ativo !== true;

  const confirmacao = confirm(
    novoStatus
      ? `Deseja ativar "${produto.nome}"?`
      : `Deseja desativar "${produto.nome}"?`
  );

  if (!confirmacao) return;

  try {
    await updateDoc(doc(db, "produtos", id), {
      ativo: novoStatus
    });

    await carregarProdutos();

  } catch (erro) {
    console.error("Erro ao alterar status:", erro);

    alert("Não foi possível alterar o status do produto.");
  }
}

// ACOMPANHAR SESSÃO

onAuthStateChanged(auth, async usuario => {
  const tentativa = ++controleSessao;

  if (!usuario) {
    if (cadastroEmAndamento) return;

    mostrarTelaLogin();
    return;
  }

  if (cadastroEmAndamento) return;

  try {
    const dados = await buscarUsuario(usuario);

    if (tentativa !== controleSessao) return;

    if (auth.currentUser?.uid !== usuario.uid) return;

    if (dados.perfil === "admin") {
      mostrarPainel(dados);

    } else if (dados.perfil === "fornecedor") {
      mostrarPainelFornecedor(dados, usuario.uid);
    }

  } catch (erro) {
    if (tentativa !== controleSessao) return;

    console.error("Erro ao verificar acesso:", erro);

    alert(erro.message);

    await signOut(auth);
  }
});