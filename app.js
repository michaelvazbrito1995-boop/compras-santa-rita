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

  const modulos = {
    fornecedores: {
      titulo: "Fornecedores",
      descricao: "Cadastro e gerenciamento dos fornecedores."
    },

    cotacoes: {
      titulo: "Cotações",
      descricao: "Criação e acompanhamento das cotações."
    },

    respostas: {
      titulo: "Respostas dos fornecedores",
      descricao: "Comparação dos preços enviados pelos fornecedores."
    },

    usuarios: {
      titulo: "Usuários",
      descricao: "Gerenciamento dos acessos."
    }
  };

  const modulo = modulos[tela];

  if (!modulo) return;

  conteudo.innerHTML = `
    <div class="modulo-aberto">

      <h2>${modulo.titulo}</h2>

      <p>${modulo.descricao}</p>

      <p class="aviso-modulo">
        Este módulo será desenvolvido na próxima etapa.
      </p>

      <button id="voltar-painel">
        VOLTAR AO PAINEL
      </button>

    </div>
  `;

  document.getElementById("voltar-painel")
    .addEventListener("click", () => {
      conteudo.innerHTML = "";
    });
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

    codigoBarras: document.getElementById("produto-codigo").value.trim(),

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