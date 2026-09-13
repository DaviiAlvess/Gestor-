# Desenvolvimento

Node.js 18 ou superior. Não é necessário `npm install`.

## Comandos

```sh
npm start
npm test
npm run build
npm run android:sync
```

`npm start` serve `http://127.0.0.1:8080`. Mantenha o mesmo endereço e porta para ver os mesmos dados locais.

## Pastas

| Pasta | Função |
| --- | --- |
| `app/` | Interface, SQLite local, PWA e testes |
| `android/` | Projeto do aplicativo Android |
| `docs/` | Produto, arquitetura e guias |
| `scripts/` | Publicação web e cópia para o APK |
| `dist/` | Pacote gerado pelo build, não versionado |

## Testes

`npm test` cobre divisão em centavos, datas, persistência, cache offline e a estrutura do pacote Android.

## Publicação

`npm run build` gera `dist` com a versão do cache offline. Publique essa pasta em HTTPS. A hospedagem Vercel usa `vercel.json` com esse diretório.
