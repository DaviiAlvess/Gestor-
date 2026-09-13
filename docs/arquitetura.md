# Arquitetura

O Gestor é um aplicativo web estático com persistência local. Não há API remota de finanças.

## Visão do sistema

```mermaid
flowchart LR
  pessoa[Pessoa] --> web[Navegador ou PWA]
  pessoa --> apk[Aplicativo Android]
  web --> sqlite[SQLite no dispositivo]
  apk --> sqlite
  web --> sw[Cache offline]
  build[npm run build] --> dist[Pasta dist em HTTPS]
  dist --> web
  sync[npm run android:sync] --> apk
```

## Camadas

```mermaid
flowchart TB
  ui[index.html e styles.css]
  app[app.js — navegação e operações]
  data[data.js — persistência e regras de gravação]
  core[core.js — dinheiro, datas e simuladores]
  sql[sql.js + WASM]
  ui --> app --> data --> sql
  app --> core
  data --> core
```

| Arquivo | Responsabilidade |
| --- | --- |
| `app/index.html` | Estrutura das telas e formulários |
| `app/styles.css` | Identidade visual e adaptação a celular |
| `app/app.js` | Sessão, views, backup, CSV e diálogos |
| `app/data.js` | SQLite, perfis, parcelas e contas previstas |
| `app/core.js` | Cálculos sem dependências de interface |
| `app/pwa.js` e `app/sw.js` | Instalação e uso offline |
| `android/` | WebView que empacota o mesmo aplicativo |
| `server.cjs` | Servidor local de desenvolvimento |

## Dados

O banco fica na chave `db` do armazenamento local, na origem atual (protocolo, endereço e porta). Senhas novas usam PBKDF2/SHA-256. O backup exporta o SQLite completo; restaurar substitui o que está no dispositivo.

```mermaid
flowchart LR
  perfil[Perfil local] --> mov[Movimentações]
  perfil --> contas[Contas previstas]
  perfil --> cat[Categorias]
  perfil --> orc[Limite e meta]
  contas -->|baixa| mov
```

## Publicação

`npm run build` copia `app/` para `dist/` e versiona o cache offline. A hospedagem deve servir `dist` em HTTPS. O endereço `127.0.0.1` não instala no celular.
