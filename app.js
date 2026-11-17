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
  query,
  where,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

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

const LIMITE_PRODUTOS = 5;

let produtosCarregados = [];
let produtosEncontrados = [];
let todosProdutos = [];

let produtoEditandoId = null;
let paginaAtual = 0;
let temProximaPagina = false;

let controleSessao = 0;
let cadastroEmAndamento = false;

// Foto opcional do produto (armazenada comprimida no próprio documento).
let fotoProdutoAtual = "";

// Estado da seleção de produtos na criação de cotações.
let produtosDisponiveisCotacao = [];
let produtosSelecionadosCotacao = new Map();

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
    // Buscar primeiro todas as cotações que ainda estão abertas.
    const consultaCotacoes = query(
      collection(db, "cotacoes"),
      where("status", "==", "aberta")
    );

    const resultadoCotacoes = await getDocs(consultaCotacoes);
    const cotacoesAbertas = resultadoCotacoes.docs;
      // Uma gravação da empresa + uma para cada vínculo. Limite do lote: 500.
    if (cotacoesAbertas.length > 499) {
      throw new Error("LIMITE_COTACOES");
    }

    // Criar ID da empresa e preparar todas as gravações em um único lote.
    const empresaRef = doc(collection(db, "fornecedores"));
    const lote = writeBatch(db);

    lote.set(empresaRef, {
      empresa: nome,
      responsavelUid: uid,
      ativo: true,
      criadoEm: serverTimestamp()
    });

    cotacoesAbertas.forEach(cotacao => {
      const vinculoId = cotacao.id + "__" + empresaRef.id;
      const vinculoRef = doc(db, "cotacao_fornecedores", vinculoId);

      lote.set(vinculoRef, {
        cotacaoId: cotacao.id,
        fornecedorId: empresaRef.id,
        responsavelUid: uid,
        status: "convidado",
        criadoEm: serverTimestamp()
      });
    });

    // Empresa e vínculos são confirmados juntos ou não são gravados.
    await lote.commit();

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
      mensagem = "O Firebase não autorizou a operação. As regras precisam permitir o cadastro em lote.";
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
          <label for="cotacao-descricao">Observações</label>
          <textarea id="cotacao-descricao" rows="3" placeholder="Informações para os fornecedores"></textarea>
          <label for="cotacao-prazo">Prazo para resposta</label>
          <input id="cotacao-prazo" type="datetime-local" required>
          <h3 style="margin-top:18px">Produtos da cotação</h3>
          <p class="ajuda-cotacao">Pesquise pelo nome ou código de barras e adicione somente o que precisa.</p>
          <label for="buscar-produto-cotacao">Buscar produto</label>
          <input id="buscar-produto-cotacao" type="search" autocomplete="off" placeholder="Digite o nome ou código de barras...">
          <div id="resultados-produtos-cotacao" class="resultados-cotacao">Carregando produtos...</div>
          <div class="selecionados-cotacao-wrap">
            <div class="selecionados-cotacao-titulo"><strong>Produtos selecionados</strong><span id="contador-produtos-cotacao">0 itens</span></div>
            <div id="cotacao-produtos">Nenhum produto selecionado.</div>
          </div>
          <h3 style="margin-top:22px">Fornecedores convidados</h3>
          <p class="ajuda-cotacao">O nome do titular aparece junto da empresa que ele representa.</p>
          <div id="cotacao-fornecedores">Carregando fornecedores...</div>
          <button type="submit" id="salvar-cotacao">CRIAR COTAÇÃO</button>
          <button type="button" id="cancelar-cotacao">CANCELAR</button>
          <p id="mensagem-cotacao"></p>
        </form>
      </div>
      <hr style="margin:24px 0">
      <h3>Cotações cadastradas</h3>
      <div id="lista-cotacoes-admin">Carregando...</div>
      <button type="button" id="voltar-painel">VOLTAR AO PAINEL</button>
    </div>`;

  document.getElementById("voltar-painel").addEventListener("click", () => conteudo.innerHTML = "");
  document.getElementById("nova-cotacao-presencial").addEventListener("click", abrirFormularioPresencial);
  document.getElementById("nova-cotacao").addEventListener("click", async () => {
    document.getElementById("form-cotacao-area").style.display = "block";
    await carregarOpcoesCotacao();
  });
  document.getElementById("cancelar-cotacao").addEventListener("click", () => {
    document.getElementById("form-cotacao").reset();
    produtosSelecionadosCotacao = new Map();
    document.getElementById("form-cotacao-area").style.display = "none";
  });
  document.getElementById("form-cotacao").addEventListener("submit", salvarCotacao);
  await carregarListaCotacoesAdmin();
}

async function abrirFormularioPresencial() {
  const area = document.getElementById("form-presencial-area");
  area.style.display = "block";
  area.innerHTML = '<p>Carregando produtos e fornecedores...</p>';
  try {
    const [ps, fs] = await Promise.all([getDocs(collection(db,"produtos")), getDocs(collection(db,"fornecedores"))]);
    const produtos = ps.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.ativo===true).sort((a,b)=>String(a.nome).localeCompare(String(b.nome),"pt-BR"));
    const fornecedoresBase = fs.docs.map(d=>({id:d.id,...d.data()})).filter(f=>f.ativo===true);
    const uids=[...new Set(fornecedoresBase.map(f=>f.responsavelUid).filter(Boolean))];
    const titulares=new Map();
    await Promise.all(uids.map(async uid=>{try{const u=await getDoc(doc(db,"usuarios",uid));if(u.exists())titulares.set(uid,u.data().nome||"Titular não identificado");}catch(e){console.warn(e);}}));
    const fornecedores=fornecedoresBase.map(f=>({...f,titular:titulares.get(f.responsavelUid)||"Titular não identificado"})).sort((a,b)=>a.titular.localeCompare(b.titular,"pt-BR"));
    area.innerHTML=`<form id="form-presencial"><h3>Nova cotação presencial</h3>
      <label>Título da reunião</label><input id="pres-titulo" required placeholder="Ex.: Cotação semanal - bebidas">
      <label>Data da reunião</label><input id="pres-data" type="date" required value="${new Date().toLocaleDateString('en-CA')}">
      <label>Adicionar produto</label><input id="pres-busca" type="search" placeholder="Digite nome ou código de barras" autocomplete="off">
      <div id="pres-resultados" class="resultados-cotacao"></div>
      <div id="pres-selecionados"></div>
      <div id="pres-mensagem" role="status"></div>
      <button type="submit" id="pres-salvar">FINALIZAR E SALVAR NO HISTÓRICO</button>
      <button type="button" id="pres-cancelar">CANCELAR</button></form>`;
    const selecionados=new Map();
    const renderBusca=()=>{const q=normalizarTexto(document.getElementById("pres-busca").value);const achados=produtos.filter(p=>!q||normalizarTexto(p.nome+" "+(p.codigoBarras||"")).includes(q)).slice(0,25);document.getElementById("pres-resultados").innerHTML=achados.map(p=>`<div class="resultado-produto-cotacao"><span><b>${escaparHTML(p.nome)}</b> <small>${escaparHTML(p.codigoBarras||"")}</small></span><button type="button" data-pres-add="${escaparHTML(p.id)}" ${selecionados.has(p.id)?"disabled":""}>${selecionados.has(p.id)?"ADICIONADO":"+ ADICIONAR"}</button></div>`).join("")||"Nenhum produto encontrado.";document.querySelectorAll("[data-pres-add]").forEach(b=>b.onclick=()=>{const pr=produtos.find(x=>x.id===b.dataset.presAdd);if(pr)selecionados.set(pr.id,pr);renderTabela();renderBusca();});};
    const renderTabela=()=>{const box=document.getElementById("pres-selecionados");if(!selecionados.size){box.innerHTML="<p>Nenhum produto adicionado.</p>";return;}box.innerHTML=`<div style="overflow-x:auto"><table class="pres-matriz" style="min-width:${Math.max(650,360+fornecedores.length*155)}px;width:100%;border-collapse:collapse"><thead><tr><th>Produto</th><th>Qtd.</th>${fornecedores.map(f=>`<th>${escaparHTML(f.titular)}<br><small>(${escaparHTML(f.empresa||"Empresa")})</small><br>Preço (R$)</th>`).join("")}<th>Vencedor</th><th></th></tr></thead><tbody>${[...selecionados.values()].map(p=>`<tr data-pres-row="${escaparHTML(p.id)}"><td>${escaparHTML(p.nome)}<br><small>${escaparHTML(p.unidade||"UN")}</small></td><td><input type="number" min="0.001" step="0.001" class="pres-qtd" value="1" style="min-width:75px"></td>${fornecedores.map(f=>`<td><input type="number" min="0.01" step="0.01" class="pres-preco" data-forn="${escaparHTML(f.id)}" placeholder="—" style="min-width:100px"></td>`).join("")}<td><select class="pres-vencedor"><option value="">Selecione</option>${fornecedores.map(f=>`<option value="${escaparHTML(f.id)}">${escaparHTML(f.titular)}</option>`).join("")}</select></td><td><button type="button" data-pres-remove="${escaparHTML(p.id)}">Remover</button></td></tr>`).join("")}</tbody></table></div><p>Preencha os preços oferecidos e escolha o vencedor de cada produto. O preço vencedor será usado no total.</p>`;box.querySelectorAll("[data-pres-remove]").forEach(b=>b.onclick=()=>{selecionados.delete(b.dataset.presRemove);renderTabela();renderBusca();});};
    document.getElementById("pres-busca").addEventListener("input",renderBusca);
    document.getElementById("pres-cancelar").onclick=()=>{area.style.display="none";area.innerHTML="";};
    renderBusca();renderTabela();
    document.getElementById("form-presencial").addEventListener("submit",async ev=>{ev.preventDefault();const btn=document.getElementById("pres-salvar");const msg=document.getElementById("pres-mensagem");const titulo=document.getElementById("pres-titulo").value.trim(),data=document.getElementById("pres-data").value;
      if(!titulo||!data||!selecionados.size){msg.textContent="Informe título, data e pelo menos um produto.";return;}
      const itens=[];let erro="";
      for(const p of selecionados.values()){const row=document.querySelector(`[data-pres-row="${CSS.escape(p.id)}"]`);const quantidade=Number(row.querySelector(".pres-qtd").value);const vencedorId=row.querySelector(".pres-vencedor").value;const precos=fornecedores.map(f=>{const campo=row.querySelector(`[data-forn="${CSS.escape(f.id)}"]`);return {fornecedorId:f.id,preco:campo.value===""?null:Number(campo.value)};});const vencedor=precos.find(x=>x.fornecedorId===vencedorId);if(!(quantidade>0)||!vencedorId||!vencedor||!(vencedor.preco>0)){erro=`Confira quantidade, vencedor e preço vencedor do produto ${p.nome}.`;break;}if(precos.some(x=>x.preco!==null&&(!(x.preco>0)||!Number.isFinite(x.preco)))){erro=`Há preço inválido no produto ${p.nome}.`;break;}itens.push({produtoId:p.id,nome:p.nome,unidade:p.unidade||"UN",quantidade,precos,vencedorId,precoVencedor:vencedor.preco,total:quantidade*vencedor.preco});}
      if(erro){msg.textContent=erro;return;}const totais={};for(const f of fornecedores)totais[f.id]=itens.reduce((s,i)=>s+(i.vencedorId===f.id?i.total:0),0);const valorTotal=itens.reduce((s,i)=>s+i.total,0);
      btn.disabled=true;btn.textContent="SALVANDO...";try{await addDoc(collection(db,"cotacoes_presenciais"),{titulo,data,reuniaoTipo:"presencial",status:"finalizada",fornecedores:fornecedores.map(f=>({fornecedorId:f.id,empresa:f.empresa||"",titular:f.titular,responsavelUid:f.responsavelUid||""})),itens,totais,valorTotal,criadoPor:auth.currentUser?.uid||"",criadoEm:serverTimestamp()});msg.textContent="Cotação presencial salva no histórico!";await carregarListaCotacoesAdmin();area.style.display="none";area.innerHTML="";}catch(e){console.error(e);msg.textContent="Não foi possível salvar. Verifique as regras do Firebase.";btn.disabled=false;btn.textContent="FINALIZAR E SALVAR NO HISTÓRICO";}
    });
  }catch(e){console.error(e);area.innerHTML='<p>Não foi possível carregar os dados. Verifique o Firebase.</p><button type="button" id="pres-fechar">Fechar</button>';document.getElementById("pres-fechar").onclick=()=>area.style.display="none";}
}

async function abrirDetalhesPresencial(id) {
  try { const snap=await getDoc(doc(db,"cotacoes_presenciais",id));if(!snap.exists())return;const c=snap.data();const linhas=(c.itens||[]).map(i=>`<tr><td>${escaparHTML(i.nome)}</td><td>${i.quantidade}</td>${(c.fornecedores||[]).map(f=>{const p=(i.precos||[]).find(x=>x.fornecedorId===f.fornecedorId);return `<td>${p?.preco==null?"—":Number(p.preco).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</td>`;}).join("")}<td>${escaparHTML((c.fornecedores||[]).find(f=>f.fornecedorId===i.vencedorId)?.titular||"—")}</td></tr>`).join("");const resumo=(c.fornecedores||[]).map(f=>`<p><b>${escaparHTML(f.titular)} (${escaparHTML(f.empresa)})</b>: ${Number(c.totais?.[f.fornecedorId]||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</p>`).join("");alert(`${c.titulo}\nData: ${c.data}\n\n${(c.itens||[]).map(i=>`${i.nome} — ${i.quantidade} x R$ ${Number(i.precoVencedor).toFixed(2)} = R$ ${Number(i.total).toFixed(2)}`).join("\n")}\n\nTotais por vencedor:\n${(c.fornecedores||[]).map(f=>`${f.titular}: R$ ${Number(c.totais?.[f.fornecedorId]||0).toFixed(2)}`).join("\n")}\n\nTOTAL GERAL: R$ ${Number(c.valorTotal||0).toFixed(2)}`);
  } catch(e){console.error(e);alert("Não foi possível abrir os detalhes.");}
}

async function carregarOpcoesCotacao() {
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

    renderizarResultadosProdutosCotacao("");
    renderizarProdutosSelecionadosCotacao();

    campoBusca.addEventListener("input", () => {
      renderizarResultadosProdutosCotacao(campoBusca.value);
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

  area.innerHTML = selecionados.map(p => `
    <div class="produto-selecionado-cotacao">
      <input type="checkbox" name="cotacao-produto" value="${escaparHTML(p.id)}" checked hidden>
      <span><strong>${escaparHTML(p.nome)}</strong><small>${escaparHTML(p.unidade || "UN")}</small></span>
      <button type="button" data-remover-produto-cotacao="${escaparHTML(p.id)}" aria-label="Remover ${escaparHTML(p.nome)}">REMOVER</button>
    </div>`).join("");

  area.querySelectorAll("[data-remover-produto-cotacao]").forEach(botao => {
    botao.addEventListener("click", () => {
      produtosSelecionadosCotacao.delete(botao.dataset.removerProdutoCotacao);
      renderizarProdutosSelecionadosCotacao();
      renderizarResultadosProdutosCotacao(document.getElementById("buscar-produto-cotacao")?.value || "");
    });
  });
}

async function salvarCotacao(evento) {
  evento.preventDefault();
  const botao = document.getElementById("salvar-cotacao");
  const titulo = document.getElementById("cotacao-titulo").value.trim();
  const descricao = document.getElementById("cotacao-descricao").value.trim();
  const prazoTexto = document.getElementById("cotacao-prazo").value;
  const produtoIds = [...document.querySelectorAll('input[name="cotacao-produto"]:checked')].map(x => x.value);
  const fornecedorIds = [...document.querySelectorAll('input[name="cotacao-fornecedor"]:checked')].map(x => x.value);

  if (!titulo || !prazoTexto || produtoIds.length === 0 || fornecedorIds.length === 0) {
    mensagemNaTela("mensagem-cotacao", "Informe título, prazo, pelo menos um produto e um fornecedor.", true);
    return;
  }
  const prazo = new Date(prazoTexto);
  if (Number.isNaN(prazo.getTime()) || prazo <= new Date()) {
    mensagemNaTela("mensagem-cotacao", "O prazo precisa ser uma data futura.", true);
    return;
  }

  botao.disabled = true;
  botao.textContent = "CRIANDO...";
  try {
    const [prodSnap, fornSnap] = await Promise.all([
      getDocs(collection(db, "produtos")),
      getDocs(collection(db, "fornecedores"))
    ]);
    const produtos = prodSnap.docs.filter(d => produtoIds.includes(d.id)).map(d => ({
      produtoId: d.id, nome: d.data().nome || "", unidade: d.data().unidade || "UN"
    }));
    const fornecedores = fornSnap.docs.filter(d => fornecedorIds.includes(d.id) && d.data().ativo === true);
    if (fornecedores.length !== fornecedorIds.length) throw new Error("FORNECEDOR_INATIVO");

    const cotacaoRef = doc(collection(db, "cotacoes"));
    const lote = writeBatch(db);
    lote.set(cotacaoRef, {
      titulo, descricao, prazo: prazo.toISOString(), produtos,
      status: "aberta", criadoEm: serverTimestamp(),
      criadoPor: auth.currentUser?.uid || ""
    });
    fornecedores.forEach(f => {
      const dados = f.data();
      const vinculoRef = doc(db, "cotacao_fornecedores", cotacaoRef.id + "__" + f.id);
      lote.set(vinculoRef, {
        cotacaoId: cotacaoRef.id, fornecedorId: f.id,
        responsavelUid: dados.responsavelUid || "",
        status: "convidado", criadoEm: serverTimestamp()
      });
    });
    await lote.commit();
    document.getElementById("form-cotacao").reset();
    produtosSelecionadosCotacao = new Map();
    document.getElementById("form-cotacao-area").style.display = "none";
    mensagemNaTela("mensagem-cotacao", "Cotação criada e enviada aos fornecedores!");
    await carregarListaCotacoesAdmin();
  } catch (erro) {
    console.error("Erro ao criar cotação:", erro);
    mensagemNaTela("mensagem-cotacao",
      erro.message === "FORNECEDOR_INATIVO" ? "Um dos fornecedores selecionados está bloqueado." : "Não foi possível criar a cotação. Verifique as regras do Firebase.", true);
  } finally {
    botao.disabled = false;
    botao.textContent = "CRIAR COTAÇÃO";
  }
}

async function carregarListaCotacoesAdmin() {
  const area = document.getElementById("lista-cotacoes-admin");
  if (!area) return;
  try {
    const [snap, presencialSnap] = await Promise.all([getDocs(collection(db, "cotacoes")), getDocs(collection(db, "cotacoes_presenciais"))]);
    const cotacoes = snap.docs.map(d => ({ id: d.id, ...d.data(), tipoLista: "online" }));
    const presenciais = presencialSnap.docs.map(d => ({ id: d.id, ...d.data(), tipoLista: "presencial" }));
    const todas = [...cotacoes, ...presenciais].sort((a,b) => (b.criadoEm?.seconds || 0) - (a.criadoEm?.seconds || 0));
    area.innerHTML = todas.length ? todas.map(c => c.tipoLista === "presencial" ? `
      <div class="aviso-modulo" style="margin:12px 0"><strong>${escaparHTML(c.titulo || "Cotação presencial")}</strong><p>Tipo: <b>Presencial</b> · Data: ${escaparHTML(c.data || "—")}</p><p>Status: Finalizada · Produtos: ${(c.itens||[]).length}</p><p>Total geral: <b>${Number(c.valorTotal||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"})}</b></p><button type="button" data-detalhes-presencial="${escaparHTML(c.id)}">VER DETALHES</button></div>` : `
      <div class="aviso-modulo" style="margin:12px 0">
        <strong>${escaparHTML(c.titulo || "Cotação")}</strong>
        <p>Status: <strong>${c.status === "aberta" ? "Aberta" : "Encerrada"}</strong></p>
        <p>Produtos: ${(c.produtos || []).length}</p>
        <p>Prazo: ${c.prazo ? new Date(c.prazo).toLocaleString("pt-BR") : "Não informado"}</p>
        ${c.descricao ? `<p>${escaparHTML(c.descricao)}</p>` : ""}
        ${c.status === "aberta" ? `<button type="button" data-encerrar-cotacao="${escaparHTML(c.id)}">ENCERRAR COTAÇÃO</button>` : ""}
      </div>`).join("") : '<div class="aviso-modulo">Nenhuma cotação cadastrada.</div>';
    area.querySelectorAll("[data-detalhes-presencial]").forEach(b => b.addEventListener("click", () => abrirDetalhesPresencial(b.dataset.detalhesPresencial)));
    area.querySelectorAll("[data-encerrar-cotacao]").forEach(b => b.addEventListener("click", async () => {
      if (!confirm("Deseja encerrar esta cotação?")) return;
      try {
        await updateDoc(doc(db, "cotacoes", b.dataset.encerrarCotacao), { status: "encerrada" });
        await carregarListaCotacoesAdmin();
      } catch (e) { console.error(e); alert("Não foi possível encerrar a cotação."); }
    }));
  } catch (erro) {
    console.error(erro);
    area.textContent = "Não foi possível carregar as cotações.";
  }
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

async function carregarRespostasAdmin() {
  const area = document.getElementById("lista-respostas-admin");
  if (!area) return;
  area.textContent = "Carregando respostas...";
  try {
    const filtro = document.getElementById("filtro-cotacao-respostas")?.value || "";
    const snap = await getDocs(collection(db, "respostas"));
    const respostas = snap.docs.map(d => ({ id: d.id, ...d.data() }))
      .filter(r => !filtro || r.cotacaoId === filtro);
    if (!respostas.length) {
      area.innerHTML = '<div class="aviso-modulo">Ainda não há respostas para esta seleção.</div>';
      return;
    }
    const enriquecidas = await Promise.all(respostas.map(async r => {
      const [cot, forn] = await Promise.all([
        getDoc(doc(db, "cotacoes", r.cotacaoId)),
        getDoc(doc(db, "fornecedores", r.fornecedorId))
      ]);
      return { ...r, titulo: cot.exists() ? cot.data().titulo : "Cotação", empresa: forn.exists() ? forn.data().empresa : "Fornecedor" };
    }));
    area.innerHTML = enriquecidas.map(r => `
      <div class="aviso-modulo" style="margin:12px 0">
        <strong>${escaparHTML(r.titulo)} — ${escaparHTML(r.empresa)}</strong>
        ${(r.itens || []).map(item => `
          <div style="border-top:1px solid #e5e5e5;padding:9px 0">
            <strong>${escaparHTML(item.nome)}</strong>
            <p>Marca: ${escaparHTML(item.marca || "Não informada")}</p>
            <p>Preço: ${Number(item.preco || 0).toLocaleString("pt-BR", {style:"currency",currency:"BRL"})}</p>
            ${item.observacao ? `<p>${escaparHTML(item.observacao)}</p>` : ""}
          </div>`).join("")}
        ${r.observacaoGeral ? `<p>Observações: ${escaparHTML(r.observacaoGeral)}</p>` : ""}
        <p>Enviada: ${r.enviadoEm?.toDate ? r.enviadoEm.toDate().toLocaleString("pt-BR") : "—"}</p>
      </div>`).join("");
  } catch (erro) {
    console.error(erro);
    area.textContent = "Não foi possível carregar as respostas.";
  }
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
        ${u.perfil !== "admin" && u.id !== auth.currentUser?.uid ? `<button type="button" data-status-usuario="${escaparHTML(u.id)}">${u.ativo === true ? "BLOQUEAR USUÁRIO" : "ATIVAR USUÁRIO"}</button>` : ""}
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
  } catch (erro) {
    console.error(erro);
    area.textContent = "Não foi possível carregar os usuários.";
  }
}

// COTAÇÕES RECEBIDAS — ÁREA DO VENDEDOR

async function carregarCotacoesFornecedor(uid) {
  const area = document.getElementById("lista-cotacoes-fornecedor");
  if (!area) return;
  try {
    const vinculosSnap = await getDocs(query(
      collection(db, "cotacao_fornecedores"),
      where("responsavelUid", "==", uid)
    ));
    const vinculos = vinculosSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    if (!vinculos.length) {
      area.innerHTML = '<div class="aviso-modulo">Você ainda não recebeu cotações.</div>';
      return;
    }
    const registros = await Promise.all(vinculos.map(async v => {
      const [cotSnap, fornSnap] = await Promise.all([
        getDoc(doc(db, "cotacoes", v.cotacaoId)),
        getDoc(doc(db, "fornecedores", v.fornecedorId))
      ]);
      return { ...v, cotacao: cotSnap.exists() ? { id: cotSnap.id, ...cotSnap.data() } : null,
        fornecedor: fornSnap.exists() ? fornSnap.data() : null };
    }));
    const validos = registros.filter(r => r.cotacao && r.fornecedor?.ativo === true);
    area.innerHTML = validos.length ? validos.map(r => `
      <div class="aviso-modulo" style="margin:12px 0">
        <strong>${escaparHTML(r.cotacao.titulo)}</strong>
        <p>Empresa: ${escaparHTML(r.fornecedor.empresa || "Empresa")}</p>
        <p>Status: ${r.cotacao.status === "aberta" ? "Aberta" : "Encerrada"}</p>
        <p>Prazo: ${r.cotacao.prazo ? new Date(r.cotacao.prazo).toLocaleString("pt-BR") : "—"}</p>
        ${r.cotacao.status === "aberta" && (!r.cotacao.prazo || new Date(r.cotacao.prazo) > new Date()) ?
          `<button type="button" data-responder-cotacao="${escaparHTML(r.cotacao.id)}" data-fornecedor-id="${escaparHTML(r.fornecedorId)}">RESPONDER COTAÇÃO</button>` :
          "<p>Esta cotação não está mais recebendo respostas.</p>"}
      </div>`).join("") : '<div class="aviso-modulo">Não há cotações abertas para suas empresas.</div>';
    area.querySelectorAll("[data-responder-cotacao]").forEach(b => b.addEventListener("click", () =>
      abrirFormularioResposta(b.dataset.responderCotacao, b.dataset.fornecedorId)));
  } catch (erro) {
    console.error("Erro ao carregar cotações do fornecedor:", erro);
    area.textContent = "Não foi possível carregar as cotações.";
  }
}

async function abrirFormularioResposta(cotacaoId, fornecedorId) {
  const area = document.getElementById("form-resposta-fornecedor");
  if (!area) return;
  try {
    const snap = await getDoc(doc(db, "cotacoes", cotacaoId));
    if (!snap.exists()) throw new Error("Cotação não encontrada.");
    const cot = snap.data();
    if (cot.status !== "aberta" || (cot.prazo && new Date(cot.prazo) <= new Date())) {
      alert("O prazo desta cotação terminou.");
      return;
    }
    area.style.display = "block";
    area.dataset.cotacaoId = cotacaoId;
    area.dataset.fornecedorId = fornecedorId;
    area.innerHTML = `
      <h3>Responder: ${escaparHTML(cot.titulo)}</h3>
      <form id="form-resposta">
        ${(cot.produtos || []).map((p,i) => `
          <div class="aviso-modulo" style="margin:10px 0">
            <strong>${escaparHTML(p.nome)}</strong>
            <p>Unidade: ${escaparHTML(p.unidade || "UN")}</p>
            <label>Marca</label><input name="marca-${i}" placeholder="Marca oferecida">
            <label>Preço unitário (R$)</label><input name="preco-${i}" type="number" min="0.01" step="0.01" required>
            <label>Observação</label><input name="obs-${i}" placeholder="Opcional">
          </div>`).join("")}
        <label>Observação geral</label>
        <textarea id="resposta-observacao-geral" rows="3"></textarea>
        <button type="submit" id="enviar-resposta">ENVIAR RESPOSTA</button>
        <button type="button" id="cancelar-resposta">CANCELAR</button>
        <p id="mensagem-resposta"></p>
      </form>`;
    document.getElementById("cancelar-resposta").addEventListener("click", () => {
      area.style.display = "none"; area.innerHTML = "";
    });
    document.getElementById("form-resposta").addEventListener("submit", enviarRespostaFornecedor);
  } catch (erro) {
    console.error(erro);
    alert("Não foi possível abrir esta cotação.");
  }
}

async function enviarRespostaFornecedor(evento) {
  evento.preventDefault();
  const area = document.getElementById("form-resposta-fornecedor");
  const cotacaoId = area.dataset.cotacaoId;
  const fornecedorId = area.dataset.fornecedorId;
  const cotSnap = await getDoc(doc(db, "cotacoes", cotacaoId));
  if (!cotSnap.exists() || cotSnap.data().status !== "aberta") {
    mensagemNaTela("mensagem-resposta", "Esta cotação foi encerrada.", true);
    return;
  }
  const cot = cotSnap.data();
  const itens = (cot.produtos || []).map((p,i) => ({
    produtoId: p.produtoId, nome: p.nome, unidade: p.unidade || "UN",
    marca: document.querySelector(`[name="marca-${i}"]`)?.value.trim() || "",
    preco: Number(document.querySelector(`[name="preco-${i}"]`)?.value),
    observacao: document.querySelector(`[name="obs-${i}"]`)?.value.trim() || ""
  }));
  if (itens.some(i => !Number.isFinite(i.preco) || i.preco <= 0)) {
    mensagemNaTela("mensagem-resposta", "Informe um preço válido para todos os produtos.", true);
    return;
  }
  const botao = document.getElementById("enviar-resposta");
  botao.disabled = true; botao.textContent = "ENVIANDO...";
  try {
    const respostaId = cotacaoId + "__" + fornecedorId;
    await setDoc(doc(db, "respostas", respostaId), {
      cotacaoId, fornecedorId, responsavelUid: auth.currentUser?.uid || "",
      itens, observacaoGeral: document.getElementById("resposta-observacao-geral").value.trim(),
      enviadoEm: serverTimestamp()
    });
    await updateDoc(doc(db, "cotacao_fornecedores", respostaId), { status: "respondido" });
    mensagemNaTela("mensagem-resposta", "Resposta enviada com sucesso!");
    area.style.display = "none";
    area.innerHTML = "";
    await carregarCotacoesFornecedor(auth.currentUser.uid);
  } catch (erro) {
    console.error(erro);
    mensagemNaTela("mensagem-resposta", "Não foi possível enviar a resposta.", true);
    botao.disabled = false; botao.textContent = "ENVIAR RESPOSTA";
  }
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

          <button
            type="button"
            data-alterar-status="${escaparHTML(produto.id)}"
          >
            ${ativo ? "DESATIVAR" : "ATIVAR"}
          </button>

        </details>

      </div>
    `;
  }).join("");

  lista.querySelectorAll("[data-editar]").forEach(botao => {
    botao.addEventListener("click", () => {
      editarProduto(botao.dataset.editar);
    });
  });

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