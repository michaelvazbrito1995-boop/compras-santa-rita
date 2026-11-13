
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

let produtosCarregados = [];
let produtoEditandoId = null;

function escaparHTML(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[caractere]);
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
    await signOut(auth);
  });
}

async function abrirModulo(tela) {
  const conteudo = document.getElementById("conteudo-modulo");

  if (tela === "produtos") {
    produtoEditandoId = null;

    conteudo.innerHTML = `
      <div class="modulo-aberto">
        <h2>📦 Cadastro de produtos</h2>
        <p>Cadastre e gerencie as mercadorias do supermercado.</p>

        <div id="mensagem-produto"></div>

        <form id="form-produto">

          <label for="produto-nome">Nome do produto</label>
          <input id="produto-nome" type="text"
            placeholder="Ex.: Arroz 5kg" required>

          <label for="produto-codigo">Código de barras</label>
          <input id="produto-codigo" type="text"
            placeholder="Digite o código de barras">

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
            CADASTRAR PRODUTO
          </button>

          <button type="button" id="cancelar-edicao"
            style="display:none">
            CANCELAR EDIÇÃO
          </button>
        </form>

        <hr style="margin:25px 0;">

        <h2>Produtos cadastrados</h2>

        <input id="pesquisa-produto" type="search"
          placeholder="Pesquisar por nome ou código de barras">

        <p id="total-produtos"></p>
        <div id="lista-produtos">Carregando produtos...</div>

        <button type="button" id="voltar-painel">
          VOLTAR AO PAINEL
        </button>
      </div>
    `;

    document.getElementById("form-produto")
      .addEventListener("submit", salvarProduto);

    document.getElementById("cancelar-edicao")
      .addEventListener("click", limparFormularioProduto);

    document.getElementById("pesquisa-produto")
      .addEventListener("input", renderizarProdutos);

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

async function carregarProdutos() {
  const lista = document.getElementById("lista-produtos");

  if (!lista) return;

  lista.textContent = "Carregando produtos...";

  try {
    const consulta = await getDocs(collection(db, "produtos"));

    produtosCarregados = consulta.docs.map(documento => ({
      id: documento.id,
      ...documento.data()
    }));

    renderizarProdutos();

  } catch (erro) {
    console.error("Erro ao carregar produtos:", erro);
    lista.textContent = "Não foi possível carregar os produtos.";
  }
}

function renderizarProdutos() {
  const lista = document.getElementById("lista-produtos");
  const total = document.getElementById("total-produtos");
  const pesquisa = document.getElementById("pesquisa-produto");

  if (!lista || !total || !pesquisa) return;

  const termo = pesquisa.value.trim().toLowerCase();

  const filtrados = produtosCarregados.filter(produto => {
    const nome = String(produto.nome || "").toLowerCase();
    const codigo = String(produto.codigoBarras || "").toLowerCase();

    return nome.includes(termo) || codigo.includes(termo);
  });

  total.textContent =
    `${filtrados.length} produto(s) encontrado(s).`;

  if (filtrados.length === 0) {
    lista.innerHTML = "<p>Nenhum produto encontrado.</p>";
    return;
  }

  lista.innerHTML = filtrados.map(produto => {
    const ativo = produto.ativo === true;

    return `
      <div class="aviso-modulo" style="margin-bottom:12px">

        <strong>${escaparHTML(produto.nome)}</strong>

        <p>Código: ${escaparHTML(produto.codigoBarras || "Não informado")}</p>
        <p>Departamento: ${escaparHTML(produto.departamento)}</p>
        <p>Categoria: ${escaparHTML(produto.categoria)}</p>
        <p>Unidade: ${escaparHTML(produto.unidade)}</p>

        <p>
          Status:
          <strong>${ativo ? "ATIVO" : "INATIVO"}</strong>
        </p>

        <button type="button" data-editar="${escaparHTML(produto.id)}">
          EDITAR
        </button>

        <button type="button"
          data-alterar-status="${escaparHTML(produto.id)}">
          ${ativo ? "DESATIVAR" : "ATIVAR"}
        </button>

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

function editarProduto(id) {
  const produto = produtosCarregados.find(item => item.id === id);

  if (!produto) return;

  produtoEditandoId = id;

  document.getElementById("produto-nome").value = produto.nome || "";
  document.getElementById("produto-codigo").value = produto.codigoBarras || "";
  document.getElementById("produto-departamento").value = produto.departamento || "";
  document.getElementById("produto-categoria").value = produto.categoria || "";
  document.getElementById("produto-unidade").value = produto.unidade || "";
  document.getElementById("produto-ativo").checked = produto.ativo === true;

  document.getElementById("botao-salvar-produto").textContent =
    "ATUALIZAR PRODUTO";

  document.getElementById("cancelar-edicao").style.display = "block";

  document.getElementById("produto-nome").scrollIntoView({
    behavior: "smooth",
    block: "center"
  });
}

function limparFormularioProduto() {
  produtoEditandoId = null;

  document.getElementById("form-produto").reset();
  document.getElementById("produto-ativo").checked = true;

  document.getElementById("botao-salvar-produto").textContent =
    "CADASTRAR PRODUTO";

  document.getElementById("cancelar-edicao").style.display = "none";

  mostrarMensagemProduto("");
}

function mostrarMensagemProduto(texto, erro = false) {
  const elemento = document.getElementById("mensagem-produto");

  if (!elemento) return;

  elemento.textContent = texto;
  elemento.style.color = erro ? "#c62828" : "#267326";
  elemento.style.margin = "12px 0";
}

async function salvarProduto(evento) {
  evento.preventDefault();

  const botao = document.getElementById("botao-salvar-produto");

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
    if (produtoEditandoId) {
      await updateDoc(
        doc(db, "produtos", produtoEditandoId),
        dados
      );

      mostrarMensagemProduto("Produto atualizado com sucesso!");

    } else {
      await addDoc(collection(db, "produtos"), {
        ...dados,
        criadoEm: serverTimestamp()
      });

      mostrarMensagemProduto("Produto cadastrado com sucesso!");
    }

    limparFormularioProduto();
    mostrarMensagemProduto(
      produtoEditandoId
        ? "Produto atualizado com sucesso!"
        : "Produto cadastrado com sucesso!"
    );

    await carregarProdutos();

  } catch (erro) {
    console.error("Erro ao salvar produto:", erro);
    mostrarMensagemProduto(
      "Erro ao salvar. Verifique sua conexão e tente novamente.",
      true
    );

  } finally {
    botao.disabled = false;

    if (!produtoEditandoId) {
      botao.textContent = "CADASTRAR PRODUTO";
    }
  }
}

async function alterarStatusProduto(id) {
  const produto = produtosCarregados.find(item => item.id === id);

  if (!produto) return;

  const novoStatus = produto.ativo !== true;

  const confirmacao = confirm(
    novoStatus
      ? `Deseja ativar o produto "${produto.nome}"?`
      : `Deseja desativar o produto "${produto.nome}"?`
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

// LOGIN
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
  if (!usuario) return;

  try {
    const dados = await verificarAdministrador(usuario);
    mostrarPainel(dados);

  } catch (erro) {
    console.error("Erro ao verificar acesso:", erro);
    alert(erro.message);
    await signOut(auth);
  }
});
