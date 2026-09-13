# Gestor

**Seu dinheiro, com clareza.** Um aplicativo de finanças pessoais em português para quem quer organizar o mês sem entregar os dados a um banco ou a uma planilha na nuvem.

[Abrir o produto](https://gestor-opal.vercel.app) · [O que é](docs/produto.md) · [Como usar](docs/uso.md) · [Celular](docs/celular.md)

![Capa do Gestor com resultado do mês, receitas, despesas e gráfico de movimento](docs/assets/capa.svg)

<p align="center">
  <img alt="Licença MIT" src="https://img.shields.io/badge/licença-MIT-193d32">
  <img alt="Armazenamento local" src="https://img.shields.io/badge/dados-no%20seu%20dispositivo-244d3e">
  <img alt="PWA" src="https://img.shields.io/badge/celular-PWA%20%2B%20Android-b77752">
  <img alt="Idioma" src="https://img.shields.io/badge/idioma-português-7c847e">
</p>

## Por que existe

A maior parte das pessoas acompanha o dinheiro em extrato, WhatsApp e caderno. O Gestor junta isso num só lugar: o que já entrou, o que já saiu, o que ainda vai vencer e o que você quer conquistar.

Os registros ficam **neste aparelho**, em SQLite. Sem mensalidade, sem anúncio e sem conta na nuvem.

## O que você resolve

| No dia a dia | No planejamento |
| --- | --- |
| Ver o resultado do mês | Limite de despesas e meta de receitas |
| Lançar receitas e despesas | Objetivos de reserva |
| Dar baixa em contas previstas | Destino do dinheiro por categoria |
| Exportar CSV do período | Simular dívida e projetar receitas |

![Exemplo ilustrativo de despesas por categoria](docs/assets/destino-do-dinheiro.svg)

## Como o produto se encaixa

```mermaid
flowchart LR
  A[Entradas e saídas] --> B[Visão do mês]
  C[Contas a pagar e receber] --> B
  B --> D[Relatórios]
  B --> E[Planejamento]
  E --> F[Simulador]
  B --> G[Backup no seu arquivo]
```

```mermaid
flowchart TB
  usuario[Você] --> aparelho[Celular ou computador]
  aparelho --> app[Gestor]
  app --> local[SQLite local]
  app --> offline[Uso sem internet]
```

## Começar em 2 minutos

```sh
npm start
```

Abra `http://127.0.0.1:8080`. Node.js 18 ou superior. Não é necessário `npm install`.

Na [versão publicada](https://gestor-opal.vercel.app), use **Conhecer com dados de exemplo** para uma demonstração descartável.

No celular: Chrome (Android) ou Safari (iPhone) → instalar na tela inicial. Guia: [docs/celular.md](docs/celular.md).

## Documentação

| Documento | Conteúdo |
| --- | --- |
| [Produto](docs/produto.md) | Promessa, público e diferenciais |
| [Como usar](docs/uso.md) | Rotina do mês, parcelas e backup |
| [Celular](docs/celular.md) | Android, iPhone e APK |
| [Arquitetura](docs/arquitetura.md) | Camadas, dados e publicação |
| [Desenvolvimento](docs/desenvolvimento.md) | Comandos, pastas e testes |

## Autoria

[DaviiAlvess](https://github.com/DaviiAlvess) — DAVI ALMEIDA DOS SANTOS ALVES. Licença [MIT](LICENSE).
