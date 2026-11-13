
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

// CONFIGURAÇÃO DO FIREBASE
const firebaseConfig = {
  apiKey: "AIzaSyBX9Yj8qGBvT_5N4dIcmyxNbeonuEcPzDw",
  authDomain: "compras-santa-rita.firebaseapp.com",
  projectId: "compras-santa-rita",
  storageBucket: "compras-santa-rita.firebasestorage.app",
  messagingSenderId: "340040395262",
  appId: "1:340040395262:web:ba467489d4176efdf5f8af"
};

// INICIALIZAÇÃO
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ELEMENTOS DA TELA
const formulario = document.getElementById("login-form");
const campoEmail = document.getElementById("email");
const campoSenha = document.getElementById("senha");
const mensagem = document.getElementById("mensagem");

// MENSAGENS
function mostrarMensagem(texto, erro = false) {
  mensagem.textContent = texto;
  mensagem.style.color = erro ? "#c62828" : "#267326";
}

// VERIFICAR PERFIL DO USUÁRIO
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

// LOGIN
formulario.addEventListener("submit", async (evento) => {
  evento.preventDefault();

  const email = campoEmail.value.trim();
  const senha = campoSenha.value;

  mostrarMensagem("Verificando acesso...");

  const botao = formulario.querySelector("button");
  botao.disabled = true;
  botao.textContent = "AGUARDE...";

  try {
    const credencial = await signInWithEmailAndPassword(
      auth,
      email,
      senha
    );

    const dados = await verificarAdministrador(credencial.user);

    mostrarMensagem("Acesso autorizado! Bem-vindo, " + (dados.nome || "Administrador") + ".");

    setTimeout(() => {
      mostrarPainel(dados);
    }, 700);

  } catch (erro) {
    console.error(erro);

    let texto = "Não foi possível entrar. Confira seu e-mail e senha.";

    if (erro.code === "auth/invalid-credential") {
      texto = "E-mail ou senha incorretos.";
    } else if (erro.message.includes("administrador") ||
               erro.message.includes("Cadastro de usuário")) {
      texto = erro.message;
    } else if (erro.code === "auth/network-request-failed") {
      texto = "Erro de conexão. Verifique sua internet.";
    }

    mostrarMensagem(texto, true);
  } finally {
    botao.disabled = false;
    botao.textContent = "ENTRAR";
  }
});

// PAINEL INICIAL
function mostrarPainel(dados) {
  document.querySelector(".container").innerHTML = `
    <section class="login-card">
      <h2>Bem-vindo, ${escaparHTML(dados.nome || "Administrador")}!</h2>
      <p>Você entrou no sistema Compras Santa Rita.</p>
      <p><strong>Perfil:</strong> Administrador</p>
      <button id="sair">SAIR DO SISTEMA</button>
    </section>
  `;

  document.getElementById("sair").addEventListener("click", async () => {
    await signOut(auth);
    location.reload();
  });
}

// PROTEÇÃO CONTRA TEXTO HTML INDESEJADO
function escaparHTML(texto) {
  return String(texto).replace(/[&<>"']/g, caractere => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  })[caractere]);
}

// VERIFICAR SE JÁ EXISTE UMA SESSÃO
onAuthStateChanged(auth, async (usuario) => {
  if (!usuario) return;

  try {
    const dados = await verificarAdministrador(usuario);
    mostrarPainel(dados);
  } catch (erro) {
    console.error(erro);
    mostrarMensagem("Acesso não autorizado. Faça login novamente.", true);
    await signOut(auth);
  }
});
