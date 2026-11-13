
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";

import {
  getAuth,
  signInWithEmailAndPassword,
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
  updateDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-firestore.js";

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

const formulario = document.getElementById("login-form");
const container = document.querySelector(".container");

const LIMITE_PRODUTOS = 5;

let produtosCarregados = [];
let produtosEncontrados = [];
let produtoEditandoId = null;
let paginaAtual = 0;
let temProximaPagina = false;

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
    .replace(/[\u0300-\u036f]/g, "");
}

function mostrarMensagem(texto, erro = false) {
  const mensagem = document.getElementById("mensagem");
  if (!mensagem) return;

  mensagem.textContent = texto;
  mensagem.style.color = erro ? "#c62828" : "#267326";
}

async function verificarAdministrador(usuario) {
  const referencia = doc(db, "usuarios", usuario.uid);
  const resultado = await getDoc(referencia);

  if (!resultado.exists()) {
    throw new Error("Cadastro de usuário não encontrado.");
  }

  const dados = resultado.data();

  if (dados.perfil !== "admin" || dados.ativo !== true) {
    throw new Error("Este usuário não tem acesso de administrador.");
  }

  return dados;
}

function mostrarPainel(dados) {
  container.innerHTML = `
    <section class="painel">

      <div class="painel-topo">
        <div>
          <h2>Olá, ${escaparHTML(dados.nome || "Administrador")}!</h2>
          <p>Bem-vindo ao sistema de compras.</p>
        </div>
        <button id="sair" class="botao-sair">SAIR</button>
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

  document.querySelectorAll(".menu-card").forEach(botao => {
    botao.addEventListener("click", () => {
      abrirModulo(botao.dataset.tela);
    });
  });

  document.getElementById("sair").addEventListener("click", async () => {
    const botao = document.getElementById("sair");

    botao.disabled = true;
    botao.textContent = "SAINDO...";

    try {
      await signOut(auth);
      mostrarTelaLogin();

    } catch (erro) {
      console.error("Erro ao sair:", erro);
      alert("Não foi possível sair. Tente novamente.");

      botao.disabled = false;
      botao.textContent = "SAIR";
    }
  });
}

function mostrarTelaLogin() {
  container.innerHTML = `
    <section class="login-card">
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

        <button type="submit">ENTRAR</button>
        <p id="mensagem"></p>
      </form>
    </section>
  `;

  const novoFormulario = document.getElementById("login-form");

  novoFormulario.addEventListener("submit", async evento => {
    evento.preventDefault();

    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value;
    const botao = novoFormulario.querySelector("button");

    mostrarMensagem("Verificando acesso...");

    botao.disabled = true;
    botao.textContent = "AGUARDE...";

    try {
      await signInWithEmailAndPassword(auth, email, senha);

    } catch (erro) {
      console.error("Erro no login:", erro);

      let texto = "Não foi possível entrar no sistema.";

      if (erro.code === "auth/invalid-credential") {
        texto = "E-mail ou senha incorretos.";
      } else if (erro.code === "auth/network-request-failed") {
        texto = "Erro de conexão. Verifique sua internet.";
      }

      mostrarMensagem(texto, true);
      botao.disabled = false;
      botao.textContent = "ENTRAR";
    }
  });
}

async function abrirModulo(tela) {
  const conteudo = document.getElementById("conteudo-modulo");

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
            <input id="produto-nome" type="text"
              placeholder="Ex.: Arroz 5kg" required>

            <label for="produto-codigo">Código de barras</label>
            <input id="produto-codigo" type="text"
              placeholder="Código de barras">

            <label for="produto-departamento">Departamento</label>
            <input id="produto-departamento" type="text"
              placeholder="Ex.: Mercearia" required>

            <label for="produto-categoria">Categoria</label>
            <input id="produto-categoria" type="text"
              placeholder="Ex.: Arroz e grãos" required>

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

        <label for="pesquisa-produto">Nome ou código de barras</label>
        <input id="pesquisa-produto" type="search"
          placeholder="Digite o nome ou código...">

        <button type="button" id="buscar-produtos">
          PESQUISAR
        </button>

        <div id="mensagem-lista"></div>

        <div id="lista-produtos"></div>

        <div id="paginacao-produtos"
          style="display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:15px">

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
        document.getElementById("area-formulario-produto").style.display = "block";
      });

    document.getElementById("form-produto")
      .addEventListener("submit", salvarProduto);

    document.getElementById("cancelar-edicao")
      .addEventListener("click", limparFormularioProduto);

    document.getElementById("buscar-produtos")
      .addEventListener("click", pesquisarProdutos);

    document.getElementById("pesquisa-produto")
      .addEventListener("keydown", evento => {
        if (evento.key === "Enter") pesquisarProdutos();
      });

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
      descricao: "Aprovação e gerenciamento dos acessos."
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
      <button id="voltar-painel">VOLTAR AO PAINEL</button>
    </div>
  `;

  document.getElementById("voltar-painel").addEventListener("click", () => {
    conteudo.innerHTML = "";
  });
}

function mostrarMensagemProduto(texto, erro = false) {
  const elemento = document.getElementById("mensagem-produto");

  if (!elemento) return;

  elemento.textContent = texto;
  elemento.style.color = erro ? "#c62828" : "#267326";
  elemento.style.margin = "12px 0";
}

async function carregarProdutos() {
  const lista = document.getElementById("lista-produtos");
  const mensagem = document.getElementById("mensagem-lista");

  if (!lista) return;

  lista.textContent = "Carregando produtos...";
  if (mensagem) mensagem.textContent = "";

  try {
    const pesquisa = normalizarTexto(
      document.getElementById("pesquisa-produto").value.trim()
    );

    const referencia = collection(db, "produtos");
    const resultado = await getDocs(referencia);

    const todosProdutos = resultado.docs.map(documento => ({
      id: documento.id,
      ...documento.data()
    }));

    produtosEncontrados = todosProdutos
      .filter(produto => {
        const nome = normalizarTexto(produto.nome);
        const codigo = String(produto.codigoBarras || "");

        return (
          nome.includes(pesquisa) ||
          codigo.includes(pesquisa)
        );
      })
      .sort((a, b) =>
        String(a.nome || "").localeCompare(
          String(b.nome || ""),
          "pt-BR"
        )
      );

    paginaAtual = 0;
    renderizarProdutos();

  } catch (erro) {
    console.error("Erro ao consultar produtos:", erro);

    lista.textContent = "Não foi possível carregar os produtos.";

    if (mensagem) {
      mensagem.textContent = "Verifique sua conexão e tente novamente.";
      mensagem.style.color = "#c62828";
    }
  }
}

function renderizarProdutos() {
  const lista = document.getElementById("lista-produtos");
  const numeroPagina = document.getElementById("numero-pagina");
  const anterior = document.getElementById("pagina-anterior");
  const proxima = document.getElementById("pagina-proxima");

  if (!lista) return;

  const inicio = paginaAtual * LIMITE_PRODUTOS;
  const fim = inicio + LIMITE_PRODUTOS;

  produtosCarregados = produtosEncontrados.slice(inicio, fim);

  temProximaPagina = produtosEncontrados.length > fim;

  numeroPagina.textContent = `Página ${paginaAtual + 1}`;

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

        <div class="produto-cabecalho">
          <strong>${escaparHTML(produto.nome)}</strong>

          <span class="produto-situacao"
            style="color:${ativo ? "#267326" : "#c62828"}">
            ${ativo ? "Ativo" : "Inativo"}
          </span>
        </div>

        <p class="produto-codigo">
          Código de barras: ${escaparHTML(produto.codigoBarras || "Não informado")}
        </p>

        <details>
          <summary>Opções</summary>

          <button type="button" data-editar="${escaparHTML(produto.id)}">
            EDITAR
          </button>

          <button type="button"
            data-alterar-status="${escaparHTML(produto.id)}">
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

async function pesquisarProdutos() {
  paginaAtual = 0;
  await carregarProdutos();
}

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

function editarProduto(id) {
  const produto = produtosCarregados.find(item => item.id === id);

  if (!produto) return;

  produtoEditandoId = id;

  document.getElementById("area-formulario-produto").style.display = "block";
  document.getElementById("titulo-form-produto").textContent = "Editar produto";

  document.getElementById("produto-nome").value = produto.nome || "";
  document.getElementById("produto-codigo").value = produto.codigoBarras || "";
  document.getElementById("produto-departamento").value = produto.departamento || "";
  document.getElementById("produto-categoria").value = produto.categoria || "";
  document.getElementById("produto-unidade").value = produto.unidade || "";
  document.getElementById("produto-ativo").checked = produto.ativo === true;

  document.getElementById("botao-salvar-produto").textContent =
    "ATUALIZAR PRODUTO";

  document.getElementById("produto-nome").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function limparFormularioProduto() {
  produtoEditandoId = null;

  document.getElementById("form-produto").reset();
  document.getElementById("produto-ativo").checked = true;

  document.getElementById("titulo-form-produto").textContent = "Novo produto";

  document.getElementById("botao-salvar-produto").textContent =
    "SALVAR PRODUTO";

  document.getElementById("area-formulario-produto").style.display = "none";

  mostrarMensagemProduto("");
}

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
    ativo: document.getElementById("produto-ativo").checked
  };

  if (!dados.nome || !dados.departamento || !dados.categoria || !dados.unidade) {
    mostrarMensagemProduto("Preencha todos os campos obrigatórios.", true);
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

    mostrarMensagemProduto(
      idEmEdicao
        ? "Produto atualizado com sucesso!"
        : "Produto cadastrado com sucesso!"
    );

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

// LOGIN INICIAL
if (formulario) {
  formulario.addEventListener("submit", async evento => {
    evento.preventDefault();

    const email = document.getElementById("email").value.trim();
    const senha = document.getElementById("senha").value;
    const botao = formulario.querySelector("button");

    mostrarMensagem("Verificando acesso...");

    botao.disabled = true;
    botao.textContent = "AGUARDE...";

    try {
      await signInWithEmailAndPassword(auth, email, senha);

    } catch (erro) {
      console.error("Erro no login:", erro);

      let texto = "Não foi possível entrar no sistema.";

      if (erro.code === "auth/invalid-credential") {
        texto = "E-mail ou senha incorretos.";
      } else if (erro.code === "auth/network-request-failed") {
        texto = "Erro de conexão. Verifique sua internet.";
      }

      mostrarMensagem(texto, true);
      botao.disabled = false;
      botao.textContent = "ENTRAR";
    }
  });
}

// ACOMPANHAR SESSÃO
onAuthStateChanged(auth, async usuario => {
  if (!usuario) {
    mostrarTelaLogin();
    return;
  }

  try {
    const dados = await verificarAdministrador(usuario);
    mostrarPainel(dados);

  } catch (erro) {
    console.error("Erro ao verificar acesso:", erro);
    alert(erro.message);
    await signOut(auth);
    mostrarTelaLogin();
  }
});

