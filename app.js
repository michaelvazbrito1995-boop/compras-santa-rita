
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
  getDoc
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

function mostrarMensagem(texto, erro = false) {
  const mensagem = document.getElementById("mensagem");
  if (!mensagem) return;

  mensagem.textContent = texto;
  mensagem.style.color = erro ? "#c62828" : "#267326";
}

function escaparHTML(texto) {
  return String(texto).replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[caractere]);
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

function abrirModulo(tela) {
  const modulos = {
    produtos: {
      titulo: "Produtos",
      descricao: "Cadastro e consulta de mercadorias."
    },
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

  document.getElementById("conteudo-modulo").innerHTML = `
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
    document.getElementById("conteudo-modulo").innerHTML = "";
  });
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

  // Sem usuário conectado: mantém a tela de login.
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
