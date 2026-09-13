# Gestor

Gestor de finanças pessoais em português. Os dados ficam no seu dispositivo, em SQLite, sem conta na nuvem. Dá para usar no navegador, instalar como aplicativo (PWA) no celular ou abrir o APK Android.

Versão publicada: [gestor-opal.vercel.app](https://gestor-opal.vercel.app)

## Abrir no computador

Com Node.js 18 ou superior, na pasta do projeto:

```sh
npm start
```

Abra `http://127.0.0.1:8080`. Não é necessário `npm install`. Mantenha o mesmo endereço e porta para continuar vendo os mesmos dados.

Como alternativa:

```sh
python -m http.server 8080 --directory app
```

Depois do primeiro acesso completo, o aplicativo web consegue abrir sem internet. Use **Conhecer com dados de exemplo** para uma demonstração descartável.

## Celular

- **Android:** baixe o APK em [Actions → Android APK](https://github.com/DaviiAlvess/Gestor-/actions/workflows/android.yml) (artefato `gestor-android`) ou instale pelo Chrome a partir do endereço HTTPS. Instruções em [Instalar no celular](INSTALAR-NO-CELULAR.md).
- **iPhone:** no Safari, **Compartilhar → Adicionar à Tela de Início**. Detalhes no mesmo guia.

O servidor `127.0.0.1` não instala no celular. Use o endereço HTTPS publicado ou o APK.

## Dados

- O SQLite fica na chave `db` do armazenamento local. Mudar de origem (protocolo, endereço ou porta) não leva os dados junto.
- O perfil é local. Não há sincronização, autenticação remota nem criptografia do banco. Quem usa o aparelho pode ver os registros.
- Novas senhas usam PBKDF2/SHA-256. Senhas antigas em texto simples são migradas no próximo login.
- **Baixar backup** exporta todos os perfis em `.sqlite`. **Restaurar arquivo** substitui os dados atuais após confirmação.
- Limpar dados do navegador ou desinstalar o aplicativo remove os registros. Use uma aba de cada vez.

## Regras

O valor parcelado é o **total**, dividido em centavos. Datas no fim do mês vão para o último dia válido. Contas previstas e parcelas do simulador só entram no histórico depois da baixa. Limite de despesas e meta de receitas valem para todos os meses.

## Organização

| Pasta | Função |
| --- | --- |
| `app/` | Interface, SQLite local, PWA e testes |
| `android/` | Projeto do aplicativo Android |
| `scripts/` | Publicação web e cópia dos arquivos para o APK |
| `dist/` | Pacote gerado por `npm run build` (não versionado) |

```sh
npm test
npm run build
npm run android:sync
```

`npm test` cobre cálculos, persistência, cache offline e a estrutura do pacote Android.

## Autoria

Projeto de [DaviiAlvess](https://github.com/DaviiAlvess) — DAVI ALMEIDA DOS SANTOS ALVES.

## Licença

MIT. Veja [LICENSE](LICENSE).
