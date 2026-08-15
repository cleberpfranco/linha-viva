# Linha Viva

Jogo multiplayer de linha do tempo para 2 a 5 pessoas. Cada pessoa entra pelo próprio celular usando o mesmo código de sala. A partida tem quatro turnos por pessoa; acertar a posição de um evento vale dois pontos.

## Rodar no computador

Requer Node.js 20 ou superior.

```bash
npm install
npm start
```

Abra `http://localhost:3000`. Para celulares na mesma rede Wi-Fi, abra no navegador deles o endereço IP local do computador, por exemplo `http://192.168.1.25:3000`.

## Colocar no ar (Render)

1. Envie estes arquivos para um repositório no GitHub.
2. Em [Render](https://render.com), clique em **New +** → **Blueprint** e escolha o repositório.
3. Confirme o serviço sugerido no arquivo `render.yaml` e clique em **Apply**.
4. Quando a publicação terminar, abra a URL `https://linha-viva.onrender.com` (ou a URL fornecida) e compartilhe-a.

O plano gratuito do Render pode pausar quando não há uso; a primeira abertura depois disso pode levar alguns segundos. O jogo não precisa de banco de dados: as salas existem enquanto o servidor está ligado. Reiniciar ou republicar o serviço encerra as partidas abertas.

## Hospedagem por Docker

```bash
docker build -t linha-viva .
docker run -p 3000:3000 linha-viva
```

O serviço atende a rota `/health`, útil para plataformas como Railway, Fly.io ou Render.
