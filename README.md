# Gestor

Um gestor de finanças pessoais em português, com armazenamento local em SQLite. Interface responsiva, visão mensal, busca, edição de movimentações, contas previstas, relatórios por categoria e simuladores de dívidas e receitas.

## Abrir o projeto

Com Node.js 18 ou superior instalado, execute na pasta do projeto:

```sh
npm start
```

Abra `http://127.0.0.1:8080`. O servidor é local, sem dependências adicionais. Não é necessário executar `npm install`.

Como alternativa, com Python instalado, sirva a pasta `financeiro_lo-`:

```sh
python -m http.server 8080 --directory financeiro_lo-
```

Mantenha sempre o mesmo endereço e porta ao usar seus dados. O SQL.js é carregado pelo CDN e precisa de conexão na inicialização. As fontes também usam um serviço externo, com alternativas locais se não carregarem. Não é necessário configurar um servidor de banco de dados.

Use **Conhecer com dados de exemplo** para explorar uma demonstração descartável. Ela não grava nem substitui os dados reais.

## Dados e compatibilidade

- O SQLite permanece na chave `db` do armazenamento local, com as mesmas tabelas da versão anterior. Para acessar os dados existentes, use o mesmo navegador e a mesma origem (protocolo, endereço e porta). Uma mudança de origem não transporta os dados automaticamente.
- O perfil é local. Não há serviço remoto de autenticação, sincronização ou criptografia do banco. Pessoas com acesso ao navegador podem acessar os dados armazenados.
- Novas senhas usam PBKDF2/SHA-256 com salt aleatório. Senhas antigas em texto simples são migradas quando o usuário entra com a senha. A sessão salva contém somente ID e e-mail.
- **Baixar backup** exporta o banco completo em `.sqlite`, incluindo todos os perfis locais. Guarde-o em local privado. A interface ainda não importa backups.
- **Exportar CSV** exporta as movimentações do mês com os filtros atuais, no formato UTF-8 com separador `;`.
- Limpar os dados do navegador remove os registros. Não há recuperação remota. Múltiplas abas escrevendo simultaneamente não são suportadas; use uma aba por vez.

## Regras de registro

O valor de uma movimentação parcelada é o **total**, dividido em centavos entre os meses. Datas no fim do mês são ajustadas para o último dia válido. As parcelas aparecem nos respectivos meses do histórico.

Contas previstas e parcelas criadas pelo simulador são pendências: só entram nas movimentações após a baixa. O pagamento da última parcela de uma dívida considera apenas o saldo restante e os juros do mês. As simulações não incluem tarifas adicionais.

Limite de despesas e meta de receitas são referências globais do perfil, usadas em todos os meses. Não são versões históricas do orçamento.

## Organização e validação

- `financeiro_lo-/index.html`: estrutura e formulários.
- `financeiro_lo-/styles.css`: identidade visual e adaptação a telas menores.
- `financeiro_lo-/app.js`: persistência, navegação e operações.
- `financeiro_lo-/core.js`: cálculos e tratamento de datas sem dependências.

Execute os testes de regras de negócio com Node.js:

```sh
node --test financeiro_lo-/tests/core.test.cjs
```

Os testes cobrem divisão exata em centavos, fim de mês e ano, datas inválidas, amortização, juros, última parcela e projeção mensal.
