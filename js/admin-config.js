/* ==========================================================================
   IPJC Links — Configuração do painel (admin.html)

   - Login: usuário e resumo SHA-256 da senha (a senha não fica escrita aqui).
     Para trocar: no painel, "Publicação e QR Code" → "Trocar senha", copie o
     novo resumo e cole em senhaSha256.
   - github: para onde o botão "Publicar" grava o data/links.json.
   - urlPublica: endereço da página de links (usado no QR Code).
   ========================================================================== */
window.IPJC_LINKS_ADMIN = {
  usuario: 'admin',
  senhaSha256: 'b531533253a83507873679ce91f565770f419f6e06a5f1f3102a305ea25b8bb5',

  github: {
    repo: 'letivaladares-bot/linktree-ipjc',
    branch: 'main',
    arquivo: 'data/links.json'
  },

  urlPublica: 'https://letivaladares-bot.github.io/linktree-ipjc/'
};
