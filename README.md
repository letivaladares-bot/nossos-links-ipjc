# IPJC Links

Página de links da Igreja Presbiteriana em Jardim Camburi — a "árvore de links" dos QR Codes e da bio do Instagram, com a identidade visual do site v3 (`ipjc-site`): mesmas cores, fontes (Poppins, Source Serif 4, Caveat), logo e as ondas do calçadão.

Site estático (HTML/CSS/JS puro), sem build.

## Estrutura

```
linktree-ipjc/
├── index.html            Página pública de links
├── admin.html            Painel de administração (noindex)
├── data/links.json       CONTEÚDO publicado (perfil, redes, "ao vivo", seções e links)
├── css/base.css          Tokens da marca (iguais ao css/style.css do site), botões
├── css/links.css         Página pública
├── css/admin.css         Painel
├── js/icones.js          Ícones (mesmo conjunto do site + extras)
├── js/links.js           Monta a página a partir de data/links.json
├── js/admin.js           Painel: edição, prévia ao vivo, publicação, QR Code
├── js/admin-config.js    Usuário, resumo da senha, repositório e endereço público
├── js/vendor/qrcode.js   Gerador de QR Code (qrcode-generator, MIT)
└── assets/img/           Logo, símbolo e imagem de compartilhamento
```

## O que a página faz

- **Seções** com título (ou sem título, no topo) e cor dos ícones (automática ou Azul Petróleo, Verde Litúrgico, Mostarda, Borgonha).
- Seções podem **começar fechadas** (sanfona) — bom para conteúdo secundário.
- **Links** com título, descrição, ícone, destaque (cartão grande azul-noite) e **período**: "mostrar a partir de" / "mostrar até" — o link aparece e some sozinho (ótimo para inscrições de eventos).
- **"Ao vivo agora"**: nos horários de culto configurados, aparece um botão pulsando que leva à transmissão.
- Botão **Compartilhar** (menu do celular ou copia o link).

## Painel (`admin.html`)

- **Acesso:** usuário `admin`, mesma senha inicial do painel do site — **troque**: Publicação → Trocar senha → cole o resumo em `js/admin-config.js`.
  (O repositório é público: nunca escreva a senha em texto em nenhum arquivo.)
- **Links:** clique num link para editar; arraste pela alça ⋮⋮ (ou use as setas) para reordenar, inclusive entre seções; o olho mostra/oculta sem excluir.
- **Prévia ao vivo** ao lado (no celular, botão "Prévia").
- Tudo fica salvo como **rascunho neste navegador** até você clicar em **Publicar**.

### Publicar

O botão **Publicar** grava `data/links.json` direto no GitHub (repositório e branch em `js/admin-config.js`).
Configuração única por aparelho (aba **Publicação**):

1. GitHub → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token.
2. Repository access: **Only select repositories** → `letivaladares-bot/linktree-ipjc`.
3. Permissions → Repository permissions → **Contents: Read and write**.
4. Cole o token no painel. Ele fica guardado só naquele navegador.

Sem token: **Baixar links.json** e envie o arquivo para a pasta `data/` do repositório pelo próprio GitHub.

## Hospedagem (GitHub Pages)

1. No repositório: Settings → Pages → Source: **Deploy from a branch** → `main` / `(root)`.
2. A página fica em `https://letivaladares-bot.github.io/linktree-ipjc/`.
3. **Domínio próprio (recomendado para QR Codes):** ex. `links.ipjc.org.br` — crie um registro CNAME apontando para `letivaladares-bot.github.io` e informe o domínio em Settings → Pages. Depois atualize `urlPublica` em `js/admin-config.js` e gere o QR Code de novo.

> Dica: imprima QR Codes com o domínio próprio. Assim, se um dia a hospedagem mudar, os impressos continuam funcionando.

## QR Code

Aba **Publicação** → QR Code em azul-noite com o símbolo da IPJC no centro (correção de erro alta). "Baixar PNG" gera 1200×1200 px para impressão.
