# Registro de Pontos

Sistema web simples para registrar entradas, saídas e pausas, além de manter um histórico e um resumo diário.

## Funcionalidades

- Registrar ponto com data, hora e observação
- Listar histórico por período
- Visualizar resumo diário de horas trabalhadas
- Excluir registros individuais
- Persistência em arquivo JSON local

## Execução

```bash
npm install
npm start
```

Acesse http://localhost:3000

## Publicação na Vercel

O servidor usa `data/records.json` localmente. Em produção, os dados precisam de armazenamento persistente:

1. Importe este repositório na Vercel.
2. No projeto Vercel, crie/conecte um **Blob Store**. A integração configura `BLOB_READ_WRITE_TOKEN`.
3. Faça um novo deploy depois de conectar o armazenamento.

Sem essa variável, a API retorna HTTP 503 com uma mensagem explicando como configurar o armazenamento. A Vercel não mantém arquivos gravados localmente entre chamadas.

## Estrutura

- `server.js`: API e servidor Express
- `data/records.json`: armazenamento local dos registros
- `public/`: frontend em HTML/CSS/JS
