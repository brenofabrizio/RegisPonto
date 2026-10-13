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

## Estrutura

- `server.js`: API e servidor Express
- `data/records.json`: armazenamento local dos registros
- `public/`: frontend em HTML/CSS/JS
